import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspace } from '../context';
import { archiveWords, mergeImportedWords, notesInDeck, reviewKey, suggestColumns, suggestLanguage } from '../domain/anki-model';
import type { Archive, Columns, Review } from '../domain/anki-model';
import { saveReviews } from '../domain/anki-history';
import { languageName, normalize, selectLanguage } from '../domain/model';
import { cleanField, readAnkiText } from '../domain/text-import.js';
import { AnkiHistory } from './AnkiHistory';
import { TodayAnki } from './TodayAnki';
import { Fold, Heading } from './common';

const textFile = /\.(txt|tsv|csv)$/i;
const supportedFile = /\.(apkg|colpkg|anki2|anki21|sqlite|sqlite3|txt|tsv|csv)$/i;
const languageCodes = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ar', 'ru', 'uk'];
const columnLabels = ['Слово или фраза', 'Значение', 'Пример'];

function LanguageOptions() {
  return <datalist id="language-options">{languageCodes.map(language => <option key={language} value={language}>{languageName(language)}</option>)}</datalist>;
}

function canonicalLanguage(value: string) {
  const [language] = Intl.getCanonicalLocales(value.trim());
  if (!language) throw new Error('Введи код языка, например en, zh или es.');
  return language;
}

function AnkiImport() {
  const { study, update, notify } = useWorkspace();
  const [archive, setArchive] = useState<Archive>();
  const [filename, setFilename] = useState('');
  const [deck, setDeck] = useState('');
  const [type, setType] = useState('');
  const [override, setOverride] = useState<Columns>();
  const [language, setLanguage] = useState<string>();
  const [customLanguage, setCustomLanguage] = useState('');
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const loadVersion = useRef(0);
  useEffect(() => () => { loadVersion.current += 1; worker.current?.terminate(); }, []);
  const deckChoices = useMemo(() => {
    if (!archive) return [];
    const present = new Set(archive.notes.flatMap(note => note.deckIds));
    return Object.entries(archive.decks).filter(([id]) => present.has(id));
  }, [archive]);
  const deckNotes = useMemo(() => archive ? notesInDeck(archive, deck) : [], [archive, deck]);
  const typeChoices = useMemo(() => [...new Set(deckNotes.map(note => note.typeId))], [deckNotes]);
  const chosenType = typeChoices.includes(type) ? type : typeChoices[0];
  const notes = useMemo(() => deckNotes.filter(note => note.typeId === chosenType), [deckNotes, chosenType]);
  const names = archive?.types[chosenType] ?? [];
  const count = useMemo(() => notes.reduce((maximum, note) => Math.max(maximum, note.fields.length), 0), [notes]);
  const columns = override ?? suggestColumns(names, count);
  const suggest = useMemo(() => suggestLanguage(
    notes.slice(0, 80).map(note => [columns[0], columns[2]].filter(Boolean).map(column => cleanField(note.fields[column - 1], note.html ?? true)).join(' ')),
    [deck ? archive?.decks[deck] : deckChoices.length === 1 ? deckChoices[0][1] : '', names[columns[0] - 1]].filter(Boolean).join(' ')
  ), [archive, columns[0], columns[2], deck, deckChoices, names, notes]);
  const selectedLanguage = language ?? suggest ?? study.language;
  const languageChoices = [...new Set([study.language, ...(suggest ? [suggest] : []), ...languageCodes])];
  const sample = notes.find(note => cleanField(note.fields[columns[0] - 1], note.html ?? true));

  async function choose(file?: File) {
    worker.current?.terminate();
    worker.current = null;
    const version = ++loadVersion.current;
    setArchive(undefined); setDeck(''); setType(''); setOverride(undefined); setLanguage(undefined);
    setFilename(file?.name ?? '');
    setBusy(false);
    if (!file) return;
    if (!supportedFile.test(file.name)) { notify('Выбери архив Anki, базу Anki или текстовый файл.'); return; }
    setBusy(true);
    notify('');
    const ready = (value: Archive) => {
      if (version !== loadVersion.current) return;
      if (!value.notes.length) { notify('В файле нет заметок.'); setBusy(false); return; }
      setArchive(value);
      setBusy(false);
    };
    const fail = (message: string) => {
      if (version !== loadVersion.current) return;
      notify(message);
      setBusy(false);
    };
    if (textFile.test(file.name)) {
      try {
        if (file.size > 16_000_000) throw new Error('Текстовый файл больше 16 МБ. Раздели его на части.');
        ready(readAnkiText(await file.text()));
      } catch (error) { fail(error instanceof Error ? error.message : 'Не удалось прочитать файл.'); }
      return;
    }
    const current = new Worker(new URL('../domain/anki-worker.ts', import.meta.url), { type: 'module' });
    worker.current = current;
    current.onmessage = ({ data }: MessageEvent<{ archive?: Archive; error?: string }>) => {
      current.terminate();
      if (data.archive) ready(data.archive);
      else fail(data.error || 'Не удалось прочитать архив.');
    };
    current.onerror = () => { current.terminate(); fail('Не удалось запустить импорт архива.'); };
    current.postMessage(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!archive || busy) return;
    setBusy(true);
    try {
      const language = canonicalLanguage(selectedLanguage === 'custom' ? customLanguage : selectedLanguage);
      if (columns.filter(Boolean).length !== new Set(columns.filter(Boolean)).size) throw new Error('Укажи разные поля для слова, значения и примера.');
      const entries = archiveWords(notes, language, columns);
      if (!entries.length) throw new Error('В выбранной колонке нет слов.');
      const batches = new Map<string, Review[]>();
      for (const { word, reviews } of entries) {
        if (!word.ankiGuid || !reviews.length) continue;
        const key = reviewKey(language, word.ankiGuid);
        batches.set(key, [...(batches.get(key) ?? []), ...reviews]);
      }
      const counts = await saveReviews([...batches]);
      let added = 0;
      const saved = update(current => {
        const merged = mergeImportedWords(current, entries.map(({ word }) =>
          word.ankiGuid ? { ...word, ankiReviews: counts.get(reviewKey(language, word.ankiGuid)) ?? word.ankiReviews } : word));
        added = merged.added;
        return { ...selectLanguage(current, language), words: merged.words };
      });
      if (!saved) return;
      notify(`Импортировано заметок · ${entries.length}. Новых слов · ${added}. Ответов в файле · ${entries.reduce((count, entry) => count + entry.reviews.length, 0)}.`);
      setArchive(undefined);
      setFilename('');
      form.reset();
    } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось сохранить импорт.'); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="anki-import">
    <label>Файл Anki <input type="file" accept=".apkg,.colpkg,.anki2,.anki21,.sqlite,.sqlite3,.txt,.tsv,.csv,application/octet-stream,application/zip,text/plain,text/csv" disabled={busy}
      onChange={event => void choose(event.target.files?.[0])} /></label>
    <p className="sub">Архивы .apkg и .colpkg, базы Anki и текстовые .txt, .tsv, .csv. Для истории экспортируй архив с расписанием.</p>
    {busy && <p className="sub" role="status">Обрабатываем {filename}…</p>}
    {archive && !busy && <>
      <p className="kicker">{filename} · заметок для импорта {notes.length}</p>
      {deckChoices.length > 1 && <label>Колода <select value={deck} onChange={event => { setDeck(event.target.value); setType(''); setOverride(undefined); setLanguage(undefined); }}>
        <option value="">Все колоды</option>{deckChoices.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
      </select></label>}
      {typeChoices.length > 1 && <label>Тип заметки <select value={chosenType} onChange={event => { setType(event.target.value); setOverride(undefined); setLanguage(undefined); }}>
        {typeChoices.map((id, index) => <option key={id} value={id}>Тип {index + 1} · {archive.types[id]?.join(', ') || 'поля без названий'}</option>)}
      </select><small>Если в файле несколько типов, импортируй их по очереди.</small></label>}
      <div className="columns">{columnLabels.map((label, index) => <label key={label}>{label}
        <select value={columns[index]} onChange={event => {
          const next: Columns = [...columns];
          next[index] = Number(event.target.value);
          setOverride(next);
        }}>
          {index > 0 && <option value={0}>Нет поля</option>}
          {Array.from({ length: count }, (_, column) => <option key={column} value={column + 1}>{column + 1} · {names[column] || 'Поле ' + (column + 1)}</option>)}
        </select>
      </label>)}</div>
      {sample && <div className="import-sample"><p className="kicker">Пример из файла</p>
        {columns.map((column, index) => column > 0 && <p key={index}><span className="sub">{columnLabels[index]} · </span>{cleanField(sample.fields[column - 1], sample.html ?? true) || '—'}</p>)}
      </div>}
      <label>Язык импорта <select value={selectedLanguage} onChange={event => setLanguage(event.target.value)}>
        {languageChoices.map(code => <option key={code} value={code}>{languageName(code)}</option>)}
        <option value="custom">Другой язык</option>
      </select></label>
      {selectedLanguage === 'custom' && <label>Код языка <input list="language-options" value={customLanguage} maxLength={35} required
        placeholder="Например, nl или en-GB" onChange={event => setCustomLanguage(event.target.value)} /></label>}
      <p className="sub">{language === undefined
        ? (suggest ? 'Предложение по содержимому · ' + languageName(suggest) : 'Выбран язык из кабинета · ' + languageName(study.language)) + '. Можно изменить.'
        : 'Укажи язык поля «Слово или фраза».'}</p>
      <button type="submit" className="primary">Импортировать</button>
    </>}
  </form>;
}

function WordLibrary() {
  const { active, study, practice } = useWorkspace();
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(false);
  const [limit, setLimit] = useState(30);
  const found = useMemo(() => {
    const search = normalize(query, study.language);
    return search ? active.words.filter(word => normalize(word.title + ' ' + word.meaning, study.language).includes(search)) : active.words;
  }, [active.words, query, study.language]);
  return <details className="fold" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>Мои слова · {active.words.length}</summary>
    {opened && <>
      <label>Найти слово <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(30); }} /></label>
      <div className="history">{found.slice(0, limit).map(word => <div key={word.id}>
        <button type="button" onClick={() => practice(word.id)} lang={word.language}>{word.title}</button><span>{word.meaning}</span><AnkiHistory word={word} />
      </div>)}</div>
      {found.length > limit && <button type="button" onClick={() => setLimit(value => value + 30)}>Показать ещё</button>}
    </>}
  </details>;
}

export function Account() {
  const { study, active, update, notify } = useWorkspace();
  const select = (language: string) => update(current => selectLanguage(current, language));
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { select(canonicalLanguage(String(new FormData(event.currentTarget).get('code')))); }
    catch { notify('Введи код языка, например en, zh или es.'); }
  }
  return <><Heading title="Кабинет" label="Личное пространство" />
    <LanguageOptions />
    <Fold title="Изучаемый язык" open>
      <div className="settings">
        <label>Активный язык <select value={study.language} onChange={event => select(event.target.value)}>
          {Object.keys(study.languages).map(language => <option key={language} value={language}>{languageName(language)}</option>)}
        </select></label>
        <form className="inline-form" onSubmit={add}>
          <label>Добавить язык <input name="code" required placeholder="zh, es, ja…" list="language-options" autoComplete="off" maxLength={35} /></label>
          <button type="submit">Добавить</button>
        </form>
      </div>
    </Fold>
    <Fold title={`Импорт Anki · ${active.words.length}`}><AnkiImport /></Fold>
    {active.words.length > 0 && <TodayAnki key={study.language} />}
    {active.words.length > 0 && <WordLibrary key={study.language} />}
  </>;
}
