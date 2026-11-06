import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspace } from '../context';
import { archiveWords, mergeImportedWords, notesInDeck, reviewKey, suggestColumns } from '../domain/anki-model';
import type { Archive, ArchiveNote, Columns, Review } from '../domain/anki-model';
import { languageCodes, LanguageLabel } from './Language';
import { suggestLanguage } from '../domain/language-detection';
import { saveReviews } from '../domain/anki-history';
import type { AnkiImportReport } from '../domain/model';
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

function AnkiImport({ done }: { done: () => void }) {
  const { study, update, notify } = useWorkspace();
  const [archive, setArchive] = useState<Archive>();
  const [filename, setFilename] = useState('');
  const [deck, setDeck] = useState('all');
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
  const deckNotes = useMemo(() => archive ? notesInDeck(archive, deck === 'all' ? '' : deck) : [], [archive, deck]);
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
    const available = notes.filter(note => cleanField(note.fields[columns[0] - 1], note.html ?? true));
    const samples = available.slice(0, 3).map(note => columns.map(column =>
      column ? cleanField(note.fields[column - 1], note.html ?? true) : ''));
    return { id, notes, available, names, count, columns, samples };
  }), [archive, noteGroups, overrides, type]);
  const noteCount = groups.reduce((total, group) => total + group.notes.length, 0);
  const readyCount = groups.reduce((total, group) => total + group.available.length, 0);
  const withReviews = groups.reduce((total, group) => total + group.available.filter(note => note.reviews.length).length, 0);
  const suggest = useMemo(() => suggestLanguage(
    groups.flatMap(group => group.notes.slice(0, 30).map(note =>
      [group.columns[0], group.columns[2]].filter(Boolean).map(column =>
        cleanField(note.fields[column - 1], note.html ?? true)).join(' '))).slice(0, 80),
    [archive?.decks[deck], ...groups.map(group => group.names[group.columns[0] - 1])].filter(Boolean).join(' ')
  ), [archive, deck, groups]);
  const selectedLanguage = language ?? suggest ?? study.language;
  let displayedLanguage = selectedLanguage === 'custom' ? undefined : selectedLanguage;
  if (selectedLanguage === 'custom' && customLanguage.trim()) {
    try { displayedLanguage = canonicalLanguage(customLanguage); } catch { /* The form keeps the raw code available for correction. */ }
  }
  const languageChoices = [...new Set([study.language, ...(suggest ? [suggest] : []), ...languageCodes])];
  const byDeck = useMemo(() => {
    const hints = new Map<string, { samples: string[]; field: string }>();
    if (!archive || deck !== 'all' || deckChoices.length < 2) return new Map<string, string>();
    for (const group of groups) for (const note of group.available) {
      const id = note.deckIds[0] ?? '';
      const hint = hints.get(id) ?? { samples: [], field: group.names[group.columns[0] - 1] ?? '' };
      if (hint.samples.length < 30) hint.samples.push([group.columns[0], group.columns[2]].filter(Boolean)
        .map(column => cleanField(note.fields[column - 1], note.html ?? true)).join(' '));
      hints.set(id, hint);
    }
    return new Map([...hints].flatMap(([id, hint]) => {
      const title = (archive.decks[id] ?? '').replace(/\s+to\s+russian\b/gi, '');
      const deckLanguage = suggestLanguage(hint.samples, title + ' ' + hint.field);
      return deckLanguage ? [[id, deckLanguage] as const] : [];
    }));
  }, [archive, deck, deckChoices.length, groups]);
  const autoByDeck = language === undefined && byDeck.size > 0;
  function languageFor(note: ArchiveNote) {
    return (autoByDeck ? byDeck.get(note.deckIds[0] ?? '') : undefined) ?? displayedLanguage ?? study.language;
  }
  const plannedLanguages = new Map<string, number>();
  for (const group of groups) for (const note of group.available) {
    const code = languageFor(note);
    plannedLanguages.set(code, (plannedLanguages.get(code) ?? 0) + 1);
  }


  async function choose(file?: File) {
    worker.current?.terminate();
    worker.current = null;
    const version = ++loadVersion.current;
    setArchive(undefined); setDeck('all'); setType('all'); setOverrides({}); setLanguage(undefined);
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
      if (!displayedLanguage) throw new Error('Укажи корректный код языка.');
      if (groups.some(({ columns }) => columns.filter(Boolean).length !== new Set(columns.filter(Boolean)).size)) {
        throw new Error('Для каждого типа укажи разные поля слова, значения и примера.');
      }
      const entries = groups.flatMap(group => archiveWords(group.available, languageFor, group.columns));
      if (!entries.length) throw new Error('В выбранной колонке нет слов.');
      const batches = new Map<string, Review[]>();
      for (const { word, reviews } of entries) {
        if (!word.ankiGuid || !reviews.length) continue;
        const key = reviewKey(word.language, word.ankiGuid);
        batches.set(key, [...(batches.get(key) ?? []), ...reviews]);
      }
      const counts = await saveReviews([...batches]);
      const importedAt = Date.now();
      const newReviews = [...counts.values()].reduce((total, count) => total + count.added, 0);
      const id = crypto.randomUUID();
      const saved = await update(current => {
        const merged = mergeImportedWords(current, entries.map(({ word }) => {
          const count = word.ankiGuid ? counts.get(reviewKey(word.language, word.ankiGuid)) : undefined;
          const imported = { ...word, ankiImportId: id };
          return count ? { ...imported, ankiReviews: count.total, ankiUpdatedAt: importedAt } : imported;
        }));
        const report: AnkiImportReport = { id, file: filename, fileNotes: archive.notes.length, selected: noteCount,
          imported: entries.length, added: merged.added, withReviews, newReviews, languages: Object.fromEntries(plannedLanguages) };
        const languages = Object.keys(report.languages ?? {});
        const selected = languages.includes(current.language) ? current.language : languages[0];
        const ankiImports = { ...current.ankiImports };
        for (const code of languages) ankiImports[code] = report;
        return { ...selectLanguage(current, selected), words: merged.words, languages: {
          ...current.languages, ...Object.fromEntries(languages.map(code => [code, current.languages[code] ?? {}]))
        }, ankiImports };
      });
      if (!saved) return;
      notify(`Импорт завершён. Новых ответов · ${newReviews}.`);
      setArchive(undefined);
      setFilename('');
      form.reset();
      done();
    } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось сохранить импорт.'); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="anki-import">
    <section className="import-step">
      <p className="kicker">Шаг 1</p><h3>Выбери файл Anki</h3>
      <label className="file-field">Файл Anki <input type="file" accept=".apkg,.colpkg,.anki2,.anki21,.sqlite,.sqlite3,.txt,.tsv,.csv,application/octet-stream,application/zip,text/plain,text/csv" disabled={busy}
        onChange={event => void choose(event.target.files?.[0])} /></label>
      <p className="sub">Для слов подойдёт колода .apkg или .colpkg. Чтобы перенести ответы, включи расписание при экспорте из Anki.</p>
      <Fold title="Все поддерживаемые форматы"><p className="sub">.apkg, .colpkg, .anki2, .anki21, .sqlite, .sqlite3, .txt, .tsv, .csv</p></Fold>
    </section>
    {busy && <p className="sub" role="status">Обрабатываем {filename}…</p>}
    {archive && !busy && <section className="import-step">
      <p className="kicker">Шаг 2</p><h3>Проверь, что будет импортировано</h3>
      <p className="file-name">{filename}</p>
      <div className="import-metrics">
        <div><strong>{archive.notes.length}</strong><span>В файле</span></div>
        <div><strong>{readyCount}</strong><span>Готово к импорту</span></div>
        <div><strong>{withReviews}</strong><span>С историей Anki</span></div>
      </div>
      {noteCount !== readyCount && <p className="sub">У {noteCount - readyCount} заметок пустое поле слова. Проверь поля ниже.</p>}
      {noteCount !== archive.notes.length && <p className="sub">Выбрано {noteCount} из {archive.notes.length} заметок.</p>}
      <p className="sub">Заметки без истории тоже попадут в словарь.</p>
      {autoByDeck && <p className="sub">Языки определяются для каждой колоды. Если колода не распознана, используется язык, указанный ниже.</p>}
      <details className="fold import-options"><summary>Выбор колод и полей</summary>
      {deckChoices.length > 0 && <label>Колода <select value={deck} onChange={event => { setDeck(event.target.value); setType('all'); setOverrides({}); setLanguage(undefined); }}>
        <option value="all">Все колоды в файле</option>
        {deckChoices.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
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
      </>}
      </details>
      {groups[0]?.samples.length > 0 && <div className="import-sample"><p className="kicker">Примеры из файла</p>
        <ul>{groups[0].samples.map(([word, meaning], index) => <li key={index}><strong>{word}</strong>{meaning && ' · ' + meaning}</li>)}</ul>
      </div>}
      <div className="import-language">
        {autoByDeck ? [...plannedLanguages].map(([code, count]) => <span className="import-language-count" key={code}>
          <LanguageLabel code={code} /><strong>{count}</strong>
        </span>) : displayedLanguage ? <LanguageLabel code={displayedLanguage} /> : <span>Укажи код языка</span>}
        <small>{autoByDeck ? 'По колодам' : language ? 'Указан вручную' : suggest ? 'Определён по колоде' : 'Язык не определён, используется текущий'}</small>
      </div>
      <details className="fold language-override"><summary>Уточнить язык импорта</summary>
      <label>Язык импорта <select value={language ?? ''} onChange={event => setLanguage(event.target.value || undefined)}>
        <option value="">Автоматически{displayedLanguage && !language && ` · запасной язык ${languageName(displayedLanguage)}`}</option>
        {languageChoices.map(code => <option key={code} value={code}>{languageName(code)}</option>)}
        <option value="custom">Другой язык</option>
      </select></label>
      {selectedLanguage === 'custom' && <label>Код языка <input list="language-options" value={customLanguage} maxLength={35} required
        placeholder="Например, nl или en-GB" onChange={event => setCustomLanguage(event.target.value)} /></label>}
      </details>
      <button type="submit" className="primary" disabled={!readyCount || !displayedLanguage}>Импортировать {readyCount} заметок</button>
    </section>}
  </form>;
}

type Section = 'words' | 'import' | 'reviews';
const sections: Record<Section, string> = { words: 'Все слова', import: 'Импорт Anki', reviews: 'Повторения' };

export function Account() {
  const { study, active, update, notify } = useWorkspace();
  const [section, open] = useState<Section>(active.words.length ? 'words' : 'import');
  const [showLatest, setShowLatest] = useState(false);
  const report = study.ankiImports?.[study.language];
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const language = canonicalLanguage(String(new FormData(event.currentTarget).get('code')));
      await update(current => selectLanguage(current, language));
    } catch { notify('Введи код языка, например en, zh или es.'); }
  }
  return <><Heading title="Кабинет" detail="Словарь, импорт и история повторений." />
    <LanguageOptions />
    <div className="account-sections" role="group" aria-label="Разделы кабинета">
      {(Object.keys(sections) as Section[]).map(value => <button type="button" key={value} aria-pressed={section === value}
        onClick={() => { setShowLatest(false); open(value); }}>{sections[value]}</button>)}
    </div>
    <section className="account-panel" aria-label={sections[section]}>
      {section === 'import' && <AnkiImport done={() => { setShowLatest(true); open('words'); }} />}
      {section === 'reviews' && <TodayAnki key={study.language} />}
      {section === 'words' && <>
        {report && <div className="import-report">
          <p className="kicker">Последний импорт</p><h2>{report.file}</h2>
          <div className="import-metrics">
            <div><strong>{report.fileNotes}</strong><span>В файле</span></div>
            <div><strong>{report.imported}</strong><span>Обработано</span></div>
            <div><strong>{report.added}</strong><span>Новых слов</span></div>
            <div><strong>{report.withReviews}</strong><span>С историей</span></div>
          </div>
          {report.selected < report.fileNotes && <p className="sub">Импортирована выбранная часть файла.</p>}
          {report.imported < report.selected && <p className="sub">Пропущено пустых заметок · {report.selected - report.imported}.</p>}
          <p className="sub">Новых ответов Anki · {report.newReviews}.</p>
          {report.languages && Object.keys(report.languages).length > 1 && <div className="actions" aria-label="Языки последнего импорта">
            {Object.entries(report.languages).map(([code, count]) => <button key={code} type="button" aria-pressed={code === study.language}
              onClick={async () => { if (await update(current => selectLanguage(current, code))) setShowLatest(true); }}>
              <LanguageLabel code={code} /> · {count}
            </button>)}
          </div>}
        </div>}
        {active.words.length ? <WordLibrary key={`${study.language}:${report?.id ?? ''}:${showLatest}`}
          latest={report} initiallyLatest={showLatest} /> :
          <div className="empty"><p>В словаре пока нет слов.</p><button type="button" className="primary" onClick={() => open('import')}>Импортировать Anki</button></div>}
      </>}
    </section>
    <Fold title="Настройки языка">
      <div className="settings"><form className="inline-form" onSubmit={add}>
        <label>Добавить язык <input name="code" required placeholder="zh, es, ja…" list="language-options" autoComplete="off" maxLength={35} /></label>
        <button type="submit">Добавить</button>
      </form></div>
    </Fold>
  </>;
}
