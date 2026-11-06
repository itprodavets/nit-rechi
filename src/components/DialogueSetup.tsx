import { useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../context';
import { beginDialogue, reviewPeriods, toggleDialogueWord } from '../domain/dialogue-session';
import type { DialogueSession, ReviewPeriod } from '../domain/dialogue-session';
import { normalize } from '../domain/model';
import { useReviewedWords } from '../hooks/useReviewedWords';
import { beginStory } from '../domain/story-session';
import { starterTopics } from '../domain/starter-topics';
import { matchesDeck, wordDeckLabel } from '../domain/anki-decks';
import { DeckFilter } from './DeckFilter';
import { Icon } from './Icon';

export function DialogueSetup({ started, editing, initialTopicId, onStory }: { started: () => void; editing?: DialogueSession; initialTopicId?: string; onStory?: (topicId: string) => void }) {
  const { active, study, update } = useWorkspace();
  const topics = useMemo(() => [...active.topics, ...starterTopics(study.language).filter(topic => !active.topics.some(existing => existing.id === topic.id || existing.title === topic.title))], [active.topics, study.language]);
  const [format, setFormat] = useState<'story' | 'dialogue'>(onStory ? 'story' : 'dialogue');
  const [situation, setSituation] = useState('');
  const [deck, setDeck] = useState('');
  const office = active.topics.find(topic => /^(я в офисе|at the office|at work)$/i.test(topic.title));
  const [topicId, setTopic] = useState(editing?.topicId ?? initialTopicId ?? office?.id ?? topics[0]?.id ?? '');
  const [title, setTitle] = useState(editing?.title ?? 'Я в офисе');
  const [context, setContext] = useState(editing?.prompt ?? 'Обсудите с коллегой планы на день и договоритесь о следующем шаге.');
  const [period, setPeriod] = useState<ReviewPeriod | 'all'>(editing ? 'all' : 'today');
  const [selection, setSelection] = useState<string[]>(editing?.wordIds ?? []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { words: reviewed, loading, error, hasHistory } = useReviewedWords(period);
  const words = useMemo(() => reviewed.filter(word => matchesDeck(word, deck)), [reviewed, deck]);
  const existingDialogue = study.dialogueSessions?.[study.language];
  const blockedDialogue = format === 'dialogue' && !editing && !!existingDialogue && !existingDialogue.completedAt;
  const selectedTopic = topics.find(topic => topic.id === topicId);
  const savedStory = selectedTopic && format === 'story' ? study.storySessions?.[selectedTopic.id] : undefined;
  const resuming = !!savedStory && !savedStory.completedAt;
  const found = useMemo(() => {
    const query = normalize(search, study.language);
    return query ? words.filter(word => normalize(word.title + ' ' + word.meaning, study.language).includes(query)) : words;
  }, [search, words, study.language]);
  const available = new Set(words.map(word => word.id));
  const chosen = selection.filter(id => available.has(id));
  const byId = new Map(words.map(word => [word.id, word]));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(found.length / 24) - 1));
  const visible = found.slice(currentPage * 24, (currentPage + 1) * 24);
  const toggle = (id: string) => setSelection(previous => toggleDialogueWord(previous, id, available));
  async function start() {
    if (lock.current || blockedDialogue || (format === 'dialogue' && (loading || error || !chosen.length)) || (!selectedTopic && !title.trim())) return;
    lock.current = true; setBusy(true);
    const language = study.language;
    const topic = selectedTopic ?? { id: crypto.randomUUID(), language, title: title.trim(), prompt: context.trim(), links: [] };
    try {
      if (await update(current => current.language !== language ? current : format === 'story'
        ? current.storySessions?.[topic.id] && !current.storySessions[topic.id].completedAt ? current : beginStory(current, topic, chosen, situation, Date.now()) : beginDialogue(current, topic, chosen, Date.now(), editing?.id))) {
        if (format === 'story') onStory?.(topic.id); else started();
      }
    } finally { lock.current = false; setBusy(false); }
  }
  return <div className="dialogue-setup">
    <header className="dialogue-heading"><p className="kicker">СЛОВА В ЖИВОМ КОНТЕКСТЕ</p><h2>Что хочешь рассказать?</h2><p className="sub">Вспомни конкретный случай. Тема задаёт контекст, а содержание — твоя история.</p></header>
    {onStory && <div className="practice-modes" role="group" aria-label="Формат практики"><button type="button" aria-pressed={format === 'story'} onClick={() => setFormat('story')}>Моя история</button><button type="button" aria-pressed={format === 'dialogue'} onClick={() => setFormat('dialogue')}>Диалог</button></div>}
    <div className="dialogue-setup-grid">
      <section className="setup-topic"><span className="setup-number">01</span><h3>Тема разговора</h3>
        <label>Разговорная тема<select value={topicId} onChange={event => setTopic(event.target.value)}><option value="">Новая тема</option>
          {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
        {!selectedTopic ? <><label>Название темы<input value={title} maxLength={90} onChange={event => setTitle(event.target.value)} placeholder="Я в офисе" /></label>
          <label>Ситуация<textarea rows={3} maxLength={4000} value={context} onChange={event => setContext(event.target.value)} /></label></> : <p className="topic-situation">{selectedTopic.prompt || 'Разыграйте разговор по этой теме.'}</p>}
        {format === 'story' && !resuming && <label>Какой случай хочешь рассказать? — необязательно<textarea rows={3} maxLength={4000} value={situation} onChange={event => setSituation(event.target.value)} placeholder="Например: вчера в кафе мне принесли не тот заказ, и я пытался объяснить, что просил…" /></label>}
        <div className="setup-note"><Icon name="map" /><p>Выбранные слова свяжутся с темой на карте. Используй их там, где они подходят по смыслу.</p></div>
      </section>
      {resuming ? <section className="setup-vocabulary"><h3>Твой рассказ уже начат</h3><p className="sub">Сохранились первая попытка, слова и исправления. Продолжи этот рассказ; после завершения можно будет выбрать другой случай в той же теме.</p></section> : <section className="setup-vocabulary"><div className="section-title"><div><span className="setup-number">02</span><h3>{format === 'story' ? 'Слова-опоры — необязательно' : 'Слова для диалога'}</h3></div><span className="selection-count">{chosen.length} / 12</span></div>
        <DeckFilter words={active.words} value={deck} onChange={value => { setDeck(value); setSelection([]); setPage(0); }} />
        <div className="period-picker" role="group" aria-label="Откуда взять слова">{([...Object.entries(reviewPeriods), ['all', 'Весь словарь']] as [ReviewPeriod | 'all', string][]).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setSelection([]); setPage(0); }}>{label}</button>)}</div>
        <p className="sub period-note">{period === 'all' ? 'Все слова текущего языка, включая ещё не повторённые.' : 'По ответам в импортированной истории Anki. Даты — по времени устройства.'}</p>
        {loading ? <p className="setup-empty" role="status">Читаем историю повторений…</p> : error ? <p className="setup-empty" role="alert">Не удалось прочитать историю. Можно выбрать слова из всего словаря.</p> : !words.length ? <div className="setup-empty">
          <Icon name="words" /><h4>{period === 'all' ? 'Словарь пока пуст' : 'За этот период повторений нет'}</h4>
          <p>{hasHistory ? 'Импортируй свежую выгрузку Anki с расписанием или выбери другой период.' : 'Чтобы увидеть повторения, импортируй архив Anki с расписанием. Слова без истории доступны во всём словаре.'}</p>
          <a href="#account" className="quiet-link">Открыть слова и импорт <Icon name="arrow" /></a></div> : <>
          <label className="setup-search">Поиск среди {words.length} слов<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Слово или значение…" /></label>
          <div className="selection-tools"><span className="sub">Найдено: {found.length}</span><button type="button" className="subtle" disabled={!chosen.length} onClick={() => setSelection([])}>Снять выбор</button></div>
          <div className="dialogue-word-options">{visible.map(word => <label className={'dialogue-word-option ' + (chosen.includes(word.id) ? 'selected' : '')} key={word.id}>
            <input type="checkbox" checked={chosen.includes(word.id)} disabled={!chosen.includes(word.id) && chosen.length >= 12} onChange={() => toggle(word.id)} />
            <span><strong lang={word.language}>{word.title}</strong><small>{word.meaning || 'Без значения'}</small><small className="word-deck-label">{wordDeckLabel(word)}</small></span></label>)}</div>
          {!found.length && <p className="sub">По этому запросу слов нет.</p>}
          {found.length > 24 && <div className="word-pagination"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>← Назад</button><span>{currentPage + 1} / {Math.ceil(found.length / 24)}</span><button type="button" disabled={(currentPage + 1) * 24 >= found.length} onClick={() => setPage(currentPage + 1)}>Дальше →</button></div>}
        </>}
      </section>}
    </div>
    {blockedDialogue && <p className="setup-empty">Есть незавершённый диалог. <button type="button" onClick={started}>Продолжить его</button> или выбери формат «Моя история».</p>}
    <footer className="dialogue-start"><div><strong>{selectedTopic?.title ?? (title.trim() || 'Новая тема')}</strong><p className="sub">{resuming ? 'Продолжишь с сохранённого места.' : chosen.length ? `Выбрано слов: ${chosen.length}. Необязательно использовать все.` : format === 'story' ? 'Можно начать без слов. Рассказывай столько, сколько вспомнишь.' : 'Отметь хотя бы одно слово для разговора.'}</p>
      {!resuming && !!chosen.length && <div className="selected-words">{chosen.map(id => <button type="button" key={id} onClick={() => toggle(id)} aria-label={'Убрать ' + byId.get(id)!.title}>{byId.get(id)!.title}<span aria-hidden="true">×</span></button>)}</div>}</div>
      <button type="button" className="primary" disabled={busy || blockedDialogue || (format === 'dialogue' && (loading || !!error || !chosen.length)) || (!selectedTopic && !title.trim())} onClick={() => void start()}>{busy ? 'Сохраняем…' : editing ? 'Сохранить подборку' : format === 'story' ? resuming ? 'Продолжить рассказ' : 'Начать рассказ' : 'Начать диалог'}<Icon name="arrow" /></button>
    </footer>
  </div>;
}
