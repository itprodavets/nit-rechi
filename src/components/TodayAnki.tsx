import { useEffect, useState } from 'react';
import { useWorkspace } from '../context';
import { readReviewedKeys } from '../domain/anki-history';
import { reviewKey } from '../domain/anki-model';
import { normalize, upsert } from '../domain/model';
import type { Topic } from '../domain/model';

const office = 'Я в офисе';
const periods = {
  today: { label: 'Сегодня', daysBack: 0, endsToday: false },
  yesterday: { label: 'Вчера', daysBack: 1, endsToday: true },
  week: { label: 'За неделю', daysBack: 6, endsToday: false }
};

export function TodayAnki() {
  const { active, study, update, notify, practice } = useWorkspace();
  const [keys, setKeys] = useState<Set<string>>();
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState(() => new Set<string>());
  const [target, setTarget] = useState<string>();
  const [limit, setLimit] = useState(30);
  const [period, setPeriod] = useState<keyof typeof periods>('today');
  const { language } = study;
  const officeTopic = active.topics.find(topic => normalize(topic.title, language) === normalize(office, language));
  const topicId = target ?? officeTopic?.id ?? '';

  useEffect(() => {
    let activeRequest = true;
    let refresh = 0;
    let midnight: ReturnType<typeof setTimeout>;
    function load() {
      clearTimeout(midnight);
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const start = new Date(day);
      start.setDate(start.getDate() - periods[period].daysBack);
      midnight = setTimeout(load, Math.max(nextDay.getTime() - Date.now(), 0) + 50);
      const current = ++refresh;
      if (!active.words.some(word => word.ankiGuid && word.ankiReviews)) { setKeys(new Set()); return; }
      setFailed(false);
      readReviewedKeys(language, start.getTime(), (periods[period].endsToday ? day : nextDay).getTime()).then(
        value => { if (activeRequest && refresh === current) setKeys(value); },
        () => { if (activeRequest && refresh === current) setFailed(true); }
      );
    }
    load();
    window.addEventListener('focus', load);
    return () => { activeRequest = false; clearTimeout(midnight); window.removeEventListener('focus', load); };
  }, [active.words, language, period]);

  const words = active.words.filter(word => word.ankiGuid && keys?.has(reviewKey(language, word.ankiGuid)));
  const chosen = words.filter(word => selection.has(word.id)).map(word => word.id);

  function train() {
    if (!chosen.length) return;
    const existing = active.topics.find(topic => topic.id === topicId);
    const topic: Topic = existing ?? {
      id: crypto.randomUUID(), title: office, language, links: [],
      prompt: 'Представь, что ты в офисе. Опиши рабочую ситуацию, используя слова из темы.'
    };
    const links = [...new Set([...topic.links, ...chosen])];
    if (update(current => ({ ...current, topics: upsert(current.topics, { ...topic, links }) }))) {
      notify('Слова в теме «' + topic.title + '» · ' + chosen.length);
      practice(topic.id);
    }
  }

  return <section className="today-anki" aria-labelledby="today-anki-title">
    <h2 id="today-anki-title">Повторения Anki</h2>
    <label>Период <select value={period} onChange={event => {
      setPeriod(event.target.value as keyof typeof periods);
      setKeys(undefined);
      setSelection(new Set());
      setLimit(30);
    }}>{Object.entries(periods).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
    {failed ? <p className="sub">Не удалось прочитать историю повторений.</p> : !keys ? <p className="sub" role="status">Читаем историю…</p> :
      words.length === 0 ? <p className="sub">За этот период в импортированной истории нет ответов. Можно загрузить свежий архив Anki с расписанием.</p> : <>
        <p className="sub">Слов с ответами · {words.length}. Даты по времени устройства.</p>
        <fieldset>
          <legend>Слова для темы · выбрано {chosen.length}</legend>
          <div className="choices">{words.slice(0, limit).map(word =>
            <label key={word.id} className="choice">
              <input type="checkbox" checked={selection.has(word.id)} onChange={event => {
                const checked = event.target.checked;
                setSelection(previous => {
                  const next = new Set(previous);
                  if (checked) next.add(word.id); else next.delete(word.id);
                  return next;
                });
              }} />
              <span><strong lang={word.language}>{word.title}</strong>{word.meaning && <small>{word.meaning}</small>}</span>
            </label>)}</div>
          {words.length > limit && <button type="button" onClick={() => setLimit(value => value + 30)}>Показать ещё</button>}
        </fieldset>
        <label>Тема для тренировки <select value={topicId} onChange={event => setTarget(event.target.value)}>
          {!officeTopic && <option value="">Создать «{office}»</option>}
          {active.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </select></label>
        <button className="primary" type="button" disabled={!chosen.length} onClick={train}>Добавить и тренироваться</button>
      </>}
  </section>;
}
