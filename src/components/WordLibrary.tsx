import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { deleteReviewKeys, readReviewSummaries } from '../domain/anki-history';
import type { ReviewSummary } from '../domain/anki-history';
import { reviewKey } from '../domain/anki-model';
import { languageName, normalize } from '../domain/model';
import type { AnkiImportReport, VocabularyLevel } from '../domain/model';
import { removeWords, vocabularyLabels, vocabularyStatus } from '../domain/vocabulary';
import { deleteTakes } from '../domain/voice.js';
import { matchesDeck, wordDeckLabel } from '../domain/anki-decks';
import { DeckFilter } from './DeckFilter';
import { AnkiHistory } from './AnkiHistory';
import { WordExamples } from './WordExamples';

type Filter = 'all' | VocabularyLevel;

const pageSize = 30;
type ReviewFilter = 'all' | 'reviewed' | 'unreviewed';

export function WordLibrary({ latest, initiallyLatest }: { latest?: AnkiImportReport; initiallyLatest?: boolean }) {
  const { active, study, practice, update, notify } = useWorkspace();
  const [deck, setDeck] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [onlyLatest, setOnlyLatest] = useState(Boolean(latest && initiallyLatest));
  const [filter, setFilter] = useState<Filter>('all');
  const [summaries, setSummaries] = useState(new Map<string, ReviewSummary>());
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'selected' | 'all'>();
  const [deleting, setDeleting] = useState(false);
  const { language } = study;
  useEffect(() => {
    if (!active.words.some(word => word.ankiReviews)) return;
    let current = true;
    readReviewSummaries(language).then(value => { if (current) setSummaries(value); },
      () => { if (current) setSummaries(new Map()); });
    return () => { current = false; };
  }, [active.words, language]);

  const entries = useMemo(() => active.words.map(word => {
    const summary = word.ankiGuid ? summaries.get(reviewKey(language, word.ankiGuid)) : undefined;
    return { word, summary, status: vocabularyStatus(word, study.results[word.id], summary) };
  }), [active.words, language, study.results, summaries]);
  const scoped = useMemo(() => entries.filter(({ word }) =>
    matchesDeck(word, deck) && (!onlyLatest || word.ankiImportId === latest?.id) &&
    (reviewFilter === 'all' || Boolean(word.ankiReviews) === (reviewFilter === 'reviewed'))),
    [entries, latest?.id, onlyLatest, reviewFilter, deck]);
  const counts = useMemo(() => {
    const result = { all: scoped.length, learning: 0, passive: 0, active: 0 };
    for (const entry of scoped) result[entry.status.level]++;
    return result;
  }, [scoped]);
  const found = useMemo(() => {
    const search = normalize(query, language);
    return scoped.filter(({ word, status }) => (filter === 'all' || status.level === filter) &&
      (!search || normalize(word.title + ' ' + word.meaning, language).includes(search)));
  }, [scoped, filter, language, query]);
  const lastPage = Math.max(0, Math.ceil(found.length / pageSize) - 1);
  const currentPage = Math.min(lastPage, page);
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, found.length);
  const navigation = <div className="word-pagination" role="group" aria-label="Страницы словаря">
    <p className="sub">{found.length ? `Показано ${start + 1}–${end} из ${found.length}` : 'Показано 0 слов'}</p>
    {lastPage > 0 && <div className="actions">
      <button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>← Назад</button>
      <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Дальше →</button>
    </div>}
  </div>;
  const toDelete = confirm === 'all' ? active.words : active.words.filter(word => selected.has(word.id));

  async function clear() {
    if (!confirm || deleting || !toDelete.length) return;
    const ids = new Set(toDelete.map(word => word.id));
    const remainingKeys = new Set(study.words.flatMap(word => !ids.has(word.id) && word.ankiGuid ? [reviewKey(word.language, word.ankiGuid)] : []));
    const reviews = [...new Set(toDelete.flatMap(word => word.ankiGuid ? [reviewKey(word.language, word.ankiGuid)] : []))]
      .filter(key => !remainingKeys.has(key));
    if (!await update(current => removeWords(current, ids))) return;
    setDeleting(true);
    setSelected(new Set());
    setConfirm(undefined);
    const cleanup = await Promise.allSettled([deleteReviewKeys(reviews), deleteTakes([...ids])]);
    notify(cleanup.every(item => item.status === 'fulfilled')
      ? 'Удалено слов · ' + ids.size
      : 'Слова удалены. Часть истории или записей не удалось очистить.');
    setDeleting(false);
  }

  return <section className="word-library" aria-label="Словарь"><div className="library-heading"><h2>Словарь <span>{active.words.length.toLocaleString('ru')}</span></h2><p className="sub">От узнавания — к свободному использованию</p></div>
      <div className="word-filters"><DeckFilter words={active.words} value={deck} onChange={value => { setDeck(value); setPage(0); setSelected(new Set()); }} />
        <label>Найти слово <input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <label>История Anki <select value={reviewFilter} onChange={event => { setReviewFilter(event.target.value as ReviewFilter); setPage(0); }}>
          <option value="all">С историей и без неё</option><option value="reviewed">С повторениями</option><option value="unreviewed">Без повторений</option>
        </select></label>
      </div>
      {active.words.some(word => word.ankiGuid && !word.ankiDecks?.length) && <p className="sub">В старом импорте названия колод не сохранялись. Импортируй тот же архив ещё раз, чтобы восстановить разделение. Свои примеры и прогресс сохранятся.</p>}
      {latest && <label className="latest-filter"><input type="checkbox" checked={onlyLatest} onChange={event => {
        setOnlyLatest(event.target.checked); setFilter('all'); setPage(0);
      }} /> Слова из последнего файла</label>}
      <div className="actions" aria-label="Словари">
        {(['all', 'learning', 'passive', 'active'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => { setFilter(value); setPage(0); }}>{value === 'all' ? 'Все' : vocabularyLabels[value]} · {counts[value]}</button>)}
      </div>
      <button type="button" onClick={() => { setManaging(!managing); setConfirm(undefined); setSelected(new Set()); }}>
        {managing ? 'Готово' : 'Управлять словами'}
      </button>
      {managing && <div className="actions">
        <button type="button" disabled={!selected.size || deleting} onClick={() => setConfirm('selected')}>Удалить выбранные · {selected.size}</button>
        <button type="button" disabled={deleting} onClick={() => setConfirm('all')}>Очистить слова языка</button>
      </div>}
      {confirm && <div className="import-sample" role="group" aria-label="Подтверждение удаления">
        <p>Удалить {toDelete.length} слов ({languageName(language)}), их историю, записи и связи с темами?</p>
        <div className="actions"><button type="button" onClick={clear}>Подтвердить удаление</button>
          <button type="button" onClick={() => setConfirm(undefined)}>Отмена</button></div>
      </div>}
      {navigation}
      <div className="vocabulary-columns" aria-hidden="true"><span>Слово / выражение</span><span>Значение и контекст</span><span>Владение словом</span></div>
      <div className="vocabulary-rows">{found.slice(start, end).map(({ word, status, summary }) => <article className="vocabulary-row" key={word.id}><div className="vocabulary-term">
        {managing ? <label className="choice"><input type="checkbox" checked={selected.has(word.id)} onChange={event => {
          const checked = event.target.checked;
          setSelected(previous => {
            const next = new Set(previous);
            if (checked) next.add(word.id); else next.delete(word.id);
            return next;
          });
        }} /><span lang={word.language}>{word.title}</span></label>
        : <button type="button" onClick={() => practice(word.id)} lang={word.language}>{word.title}</button>}
        <small>{wordDeckLabel(word)}</small></div>
        <div className="vocabulary-context"><p>{word.meaning || 'Значение пока не добавлено'}</p>
          <WordExamples word={word} /><AnkiHistory word={word} /></div>
        <div className="vocabulary-progress"><span className={"vocabulary-badge status-" + status.level}>{vocabularyLabels[status.level]}</span><p className="sub">{status.source}</p>{summary && <p className="sub">Anki: {summary.recalled} из {summary.total} «Хорошо» / «Легко»</p>}<label>Уровень владения <select aria-label={'Статус · ' + word.title} value={word.vocabularyLevel ?? ''}
          onChange={event => {
            const value = event.target.value as VocabularyLevel | '';
            update(current => ({ ...current, words: current.words.map(entry => entry.id === word.id
              ? { ...entry, vocabularyLevel: value || undefined } : entry) }));
          }}>
          <option value="">Автоматически</option>
          {Object.entries(vocabularyLabels).map(([level, title]) => <option key={level} value={level}>{title}</option>)}
        </select></label></div>
      </article>)}</div>
      {!found.length && <p className="sub">Нет слов по этому фильтру.</p>}
      {lastPage > 0 && navigation}
  </section>;
}
