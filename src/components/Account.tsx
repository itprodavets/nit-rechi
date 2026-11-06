import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspace } from '../context';
import { archiveWords, mergeImportedWords, notesInDeck, reviewKey, suggestColumns } from '../domain/anki-model';
import type { Archive, ArchiveNote, Columns, Review } from '../domain/anki-model';
import { languageCodes, LanguageLabel } from './Language';
import { suggestLanguage } from '../domain/language-detection';
import { saveReviews } from '../domain/anki-history';
import { languageName, selectLanguage } from '../domain/model';
import { cleanField, readAnkiText } from '../domain/text-import.js';
import { WordLibrary } from './WordLibrary';
import { TodayAnki } from './TodayAnki';
import { Fold, Heading } from './common';

const textFile = /\.(txt|tsv|csv)$/i;
const supportedFile = /\.(apkg|colpkg|anki2|anki21|sqlite|sqlite3|txt|tsv|csv)$/i;
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
  const [type, setType] = useState('all');
  const [overrides, setOverrides] = useState<Record<string, Columns>>({});
  const [language, setLanguage] = useState<string>();
  const [customLanguage, setCustomLanguage] = useState('');
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const loadVersion = useRef(0);
  useEffect(() => () => { loadVersion.current += 1; worker.current?.terminate(); }, []);
  const deckChoices = useMemo(() => {
    if (!archive) return [];
    const present = new Set(archive.notes.flatMap(note => note.deckIds));
    const paths = new Set<string>();
    for (const id of present) {
      const parts = archive.decks[id]?.split('::') ?? [];
      for (let length = 1; length <= parts.length; length++) paths.add(parts.slice(0, length).join('::'));
    }
    return Object.entries(archive.decks).filter(([, name]) => paths.has(name))
      .sort(([, first], [, second]) => first.localeCompare(second));
  }, [archive]);
  const chosenDeck = deckChoices.length > 1 ? deck : deckChoices[0]?.[0] ?? '';
  const deckNotes = useMemo(() => archive && (deckChoices.length <= 1 || chosenDeck)
    ? notesInDeck(archive, chosenDeck === 'all' ? '' : chosenDeck) : [], [archive, chosenDeck, deckChoices.length]);
  const noteGroups = useMemo(() => {
    const groups = new Map<string, ArchiveNote[]>();
    for (const note of deckNotes) {
      const entries = groups.get(note.typeId);
      if (entries) entries.push(note);
      else groups.set(note.typeId, [note]);
    }
    return [...groups];
  }, [deckNotes]);
  const groups = useMemo(() => noteGroups.filter(([id]) => type === 'all' || id === type).map(([id, notes]) => {
    const names = archive?.types[id] ?? [];
    const count = notes.reduce((maximum, note) => Math.max(maximum, note.fields.length), 0);
    const columns = overrides[id] ?? suggestColumns(names, count);
    const samples = notes.slice(0, 30).map(note => columns.map(column =>
      column ? cleanField(note.fields[column - 1], note.html ?? true) : '')
    ).filter(row => row[0]).slice(0, 5);
    return { id, notes, names, count, columns, samples };
  }), [archive, noteGroups, overrides, type]);
  const noteCount = groups.reduce((total, group) => total + group.notes.length, 0);
  const suggest = useMemo(() => suggestLanguage(
    groups.flatMap(group => group.notes.slice(0, 30).map(note =>
      [group.columns[0], group.columns[2]].filter(Boolean).map(column =>
        cleanField(note.fields[column - 1], note.html ?? true)).join(' '))).slice(0, 80),
    [archive?.decks[chosenDeck], ...groups.map(group => group.names[group.columns[0] - 1])].filter(Boolean).join(' ')
  ), [archive, chosenDeck, groups]);
  const selectedLanguage = language ?? suggest ?? study.language;
  let displayedLanguage = selectedLanguage === 'custom' ? undefined : selectedLanguage;
  if (selectedLanguage === 'custom' && customLanguage.trim()) {
    try { displayedLanguage = canonicalLanguage(customLanguage); } catch { /* The form keeps the raw code available for correction. */ }
  }
  const languageChoices = [...new Set([study.language, ...(suggest ? [suggest] : []), ...languageCodes])];

  async function choose(file?: File) {
    worker.current?.terminate();
    worker.current = null;
    const version = ++loadVersion.current;
    setArchive(undefined); setDeck(''); setType('all'); setOverrides({}); setLanguage(undefined);
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
      if (groups.some(({ columns }) => columns.filter(Boolean).length !== new Set(columns.filter(Boolean)).size)) {
        throw new Error('Для каждого типа укажи разные поля слова, значения и примера.');
      }
      const entries = groups.flatMap(group => archiveWords(group.notes, language, group.columns));
      if (!entries.length) throw new Error('В выбранной колонке нет слов.');
      const batches = new Map<string, Review[]>();
      for (const { word, reviews } of entries) {
        if (!word.ankiGuid || !reviews.length) continue;
        const key = reviewKey(language, word.ankiGuid);
        batches.set(key, [...(batches.get(key) ?? []), ...reviews]);
      }
      const counts = await saveReviews([...batches]);
      const importedAt = Date.now();
      const newReviews = [...counts.values()].reduce((total, count) => total + count.added, 0);
      let added = 0;
      const saved = update(current => {
        const merged = mergeImportedWords(current, entries.map(({ word }) => {
          const count = word.ankiGuid ? counts.get(reviewKey(language, word.ankiGuid)) : undefined;
          return count ? { ...word, ankiReviews: count.total, ankiUpdatedAt: importedAt } : word;
        }));
        added = merged.added;
        return { ...selectLanguage(current, language), words: merged.words };
      });
      if (!saved) return;
      notify(`Импортировано заметок · ${entries.length}. Новых слов · ${added}. Ответов в файле · ${entries.reduce((count, entry) => count + entry.reviews.length, 0)}. Новых ответов · ${newReviews}.`);
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
      <p className="kicker">{filename}{noteCount > 0 && ` · заметок для импорта ${noteCount}`}</p>
      {deckChoices.length > 1 && <label>Колода <select value={deck} onChange={event => { setDeck(event.target.value); setType('all'); setOverrides({}); setLanguage(undefined); }}>
        <option value="" disabled>Выбери колоду</option>
        {deckChoices.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        <option value="all">Все колоды</option>
      </select></label>}
      {noteGroups.length > 1 && <label>Тип заметки <select value={type} onChange={event => {
        setType(event.target.value);
        setLanguage(undefined);
      }}>
        <option value="all">Все типы заметок</option>
        {noteGroups.map(([id, notes], index) => <option key={id} value={id}>
          Тип {index + 1} · {notes.length} · {archive.types[id]?.join(', ') || 'поля без названий'}
        </option>)}
      </select></label>}
      {noteCount > 0 && <>
      {groups.map((group, groupIndex) => {
        const fields = <>
          <div className="columns">{columnLabels.map((label, index) => <label key={label}>{label}
            <select value={group.columns[index]} onChange={event => {
              const columns: Columns = [...group.columns];
              columns[index] = Number(event.target.value);
              setOverrides(previous => ({ ...previous, [group.id]: columns }));
            }}>
              {index > 0 && <option value={0}>Нет поля</option>}
              {Array.from({ length: group.count }, (_, column) => <option key={column} value={column + 1}>{column + 1} · {group.names[column] || 'Поле ' + (column + 1)}</option>)}
            </select>
          </label>)}</div>
          {group.samples.length > 0 && <div className="import-sample"><p className="kicker">Проверь слова и значения</p>
            <ol>{group.samples.map(([word, meaning, example], index) => <li key={index}>
              <strong>{word}</strong>{meaning && ' · ' + meaning}{example && <p className="sub">{example}</p>}
            </li>)}</ol>
          </div>}
        </>;
        return groups.length === 1 ? <div key={group.id}>{fields}</div> : <details key={group.id} open={groupIndex === 0}>
          <summary>{`Поля типа ${groupIndex + 1} · ${group.notes.length} заметок`}</summary>{fields}
        </details>;
      })}
      <div className="import-language">
        {displayedLanguage ? <LanguageLabel code={displayedLanguage} /> : <span>Укажи код языка</span>}
        <small>{language ? 'Указан вручную' : suggest ? 'Определён по колоде' : 'Язык не определён, используется текущий'}</small>
      </div>
      <details className="fold language-override"><summary>Уточнить язык импорта</summary>
      <label>Язык импорта <select value={selectedLanguage} onChange={event => setLanguage(event.target.value)}>
        {languageChoices.map(code => <option key={code} value={code}>{languageName(code)}</option>)}
        <option value="custom">Другой язык</option>
      </select></label>
      {selectedLanguage === 'custom' && <label>Код языка <input list="language-options" value={customLanguage} maxLength={35} required
        placeholder="Например, nl или en-GB" onChange={event => setCustomLanguage(event.target.value)} /></label>}
      </details>
      <button type="submit" className="primary">Импортировать</button>
      </>}
    </>}
  </form>;
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
    <Fold title="Настройки языка">
      <div className="settings">
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
