import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { deleteReviewKeys, readReviewSummaries } from '../domain/anki-history';
import type { ReviewSummary } from '../domain/anki-history';
import { reviewKey } from '../domain/anki-model';
import { languageName, normalize } from '../domain/model';
import type { VocabularyLevel } from '../domain/model';
import { removeWords, vocabularyLabels, vocabularyStatus } from '../domain/vocabulary';
import { deleteTakes } from '../domain/voice.js';
import { AnkiHistory } from './AnkiHistory';

type Filter = 'all' | VocabularyLevel;

export function WordLibrary() {
  const { active, study, practice, update, notify } = useWorkspace();
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(true);
  const [limit, setLimit] = useState(30);
  const [filter, setFilter] = useState<Filter>('all');
  const [summaries, setSummaries] = useState(new Map<string, ReviewSummary>());
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<'selected' | 'all'>();
  const [deleting, setDeleting] = useState(false);
  const { language } = study;
  useEffect(() => {
    if (!opened || !active.words.some(word => word.ankiReviews)) return;
    let current = true;
    readReviewSummaries(language).then(value => { if (current) setSummaries(value); },
      () => { if (current) setSummaries(new Map()); });
    return () => { current = false; };
  }, [active.words, language, opened]);

  const entries = useMemo(() => active.words.map(word => {
    const summary = word.ankiGuid ? summaries.get(reviewKey(language, word.ankiGuid)) : undefined;
    return { word, summary, status: vocabularyStatus(word, study.results[word.id], summary) };
  }), [active.words, language, study.results, summaries]);
  const counts = useMemo(() => {
    const result = { all: entries.length, learning: 0, passive: 0, active: 0 };
    for (const entry of entries) result[entry.status.level]++;
    return result;
  }, [entries]);
  const found = useMemo(() => {
    const search = normalize(query, language);
    return entries.filter(({ word, status }) => (filter === 'all' || status.level === filter) &&
      (!search || normalize(word.title + ' ' + word.meaning, language).includes(search)));
  }, [entries, filter, language, query]);
  const toDelete = confirm === 'all' ? active.words : active.words.filter(word => selected.has(word.id));

  async function clear() {
    if (!confirm || deleting || !toDelete.length) return;
    const ids = new Set(toDelete.map(word => word.id));
    const remainingKeys = new Set(study.words.flatMap(word => !ids.has(word.id) && word.ankiGuid ? [reviewKey(word.language, word.ankiGuid)] : []));
    const reviews = [...new Set(toDelete.flatMap(word => word.ankiGuid ? [reviewKey(word.language, word.ankiGuid)] : []))]
      .filter(key => !remainingKeys.has(key));
    if (!update(current => removeWords(current, ids))) return;
    setDeleting(true);
    setSelected(new Set());
    setConfirm(undefined);
    const cleanup = await Promise.allSettled([deleteReviewKeys(reviews), deleteTakes([...ids])]);
    notify(cleanup.every(item => item.status === 'fulfilled')
      ? 'Удалено слов · ' + ids.size
      : 'Слова удалены. Часть истории или записей не удалось очистить.');
    setDeleting(false);
  }

  return <details className="fold word-library" open onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>Мои слова · {active.words.length}</summary>
    {opened && <>
      <div className="actions" aria-label="Словари">
        {(['all', 'learning', 'passive', 'active'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => { setFilter(value); setLimit(30); }}>{value === 'all' ? 'Все' : vocabularyLabels[value]} · {counts[value]}</button>)}
      </div>
      <label>Найти слово <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(30); }} /></label>
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
      <div className="history">{found.slice(0, limit).map(({ word, status, summary }) => <div key={word.id}>
        {managing ? <label className="choice"><input type="checkbox" checked={selected.has(word.id)} onChange={event => {
          const checked = event.target.checked;
          setSelected(previous => {
            const next = new Set(previous);
            if (checked) next.add(word.id); else next.delete(word.id);
            return next;
          });
        }} /><span lang={word.language}>{word.title}</span></label>
        : <button type="button" onClick={() => practice(word.id)} lang={word.language}>{word.title}</button>}
        <div><span>{word.meaning}</span><p className="sub">{status.source}</p>
          {summary && <p className="sub">Anki · «Хорошо» или «Легко» {summary.recalled} из {summary.total}</p>}
          <AnkiHistory word={word} /></div>
        <label>Статус · {vocabularyLabels[status.level]} <select aria-label={'Статус · ' + word.title} value={word.vocabularyLevel ?? ''}
          onChange={event => {
            const value = event.target.value as VocabularyLevel | '';
            update(current => ({ ...current, words: current.words.map(entry => entry.id === word.id
              ? { ...entry, vocabularyLevel: value || undefined } : entry) }));
          }}>
          <option value="">Автоматически</option>
          {Object.entries(vocabularyLabels).map(([level, title]) => <option key={level} value={level}>{title}</option>)}
        </select></label>
      </div>)}</div>
      {!found.length && <p className="sub">Нет слов по этому фильтру.</p>}
      {found.length > limit && <button type="button" onClick={() => setLimit(value => value + 30)}>Показать ещё · {limit} из {found.length}</button>}
    </>}
  </details>;
}
