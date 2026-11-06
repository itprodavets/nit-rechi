import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { readRecentLapses } from '../domain/anki-history';
import type { RecentLapse } from '../domain/anki-history';
import { reviewKey } from '../domain/anki-model';
import { localDay } from '../domain/model';
import { addExample } from '../domain/sample-study';
import { createLearningSession, currentLearningSession, lapseWindow, practiceWeek, selectLearningTargets, wordCount } from '../domain/learning-session';
import type { Budget } from '../domain/learning-session';
import { DialogueStudio } from './DialogueStudio';
import { LearningSession } from './LearningSession';
import { Icon } from './Icon';
import { LanguageLabel } from './Language';

function LearningPath() {
  return <div className="learning-path" aria-label="Порядок занятия"><span className="path-eyebrow">КАК ПОСТРОЕНО ЗАНЯТИЕ</span>
    <div><span>01</span><p><strong>Вспомнить</strong><small>Слово без готового ответа</small></p></div>
    <div><span>02</span><p><strong>Употребить</strong><small>Своя фраза или ситуация</small></p></div>
    <div><span>03</span><p><strong>Закрепить</strong><small>Ещё раз о том, что трудно</small></p></div>
  </div>;
}

export function Today() {
  const { study, active, update, practice } = useWorkspace();
  const [dialogue, setDialogue] = useState(false);
  const [minutes, setMinutes] = useState<Budget>(10);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [lapses, setLapses] = useState<Map<string, RecentLapse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const today = localDay(now);
  const session = currentLearningSession(study, now);
  const completed = !!session && session.cursor >= session.queue.length;
  const lastImport = active.words.reduce((last, word) => Math.max(last, word.ankiUpdatedAt ?? 0), 0);
  const hasHistory = active.words.some(word => word.ankiReviews);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    let live = true;
    if (!hasHistory) { setLapses(new Map()); setLoading(false); return; }
    setLoading(true); setHistoryError(false);
    const timestamp = Date.now();
    readRecentLapses(study.language, timestamp - lapseWindow, timestamp).then(value => { if (live) setLapses(value); }, () => { if (live) { setHistoryError(true); setLapses(new Map()); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [study.language, lastImport, hasHistory, today]);
  const targets = useMemo(() => {
    const byId = new Map<string, RecentLapse>();
    for (const word of active.words) {
      const value = word.ankiGuid && lapses.get(reviewKey(word.language, word.ankiGuid));
      if (value) byId.set(word.id, value);
    }
    return selectLearningTargets(study, byId, now, minutes);
  }, [study, active.words, lapses, now, minutes]);
  const week = practiceWeek(study, now);
  const activeDays = week.filter(day => day.total).length;
  const spoken = week.reduce((sum, day) => sum + day.spoken, 0);
  const independent = week.reduce((sum, day) => sum + day.independent, 0);
  const maxActivity = Math.max(1, ...week.map(day => day.total));
  const difficult = targets.filter(target => target.reason === 'lapse' || target.reason === 'practice').length;

  async function start() {
    if (starting || (!session && (!targets.length || loading))) return;
    setStarting(true);
    try {
      if (session) { setOpen(true); return; }
      const language = study.language;
      if (await update(current => current.language !== language ? current : { ...current, learningSessions: {
        ...current.learningSessions, [language]: createLearningSession(language, targets, minutes, Date.now())
      } })) setOpen(true);
    } finally { setStarting(false); }
  }
  if (dialogue) return <><button type="button" className="back-to-today subtle" onClick={() => setDialogue(false)}>← К ежедневной практике</button><DialogueStudio /></>;
  if (open && session && !completed) return <LearningSession session={session} close={() => setOpen(false)} />;
  const answers = Object.values(session?.answers ?? {});

  return <div className="today-page">
    <header className="today-heading"><div><p className="kicker">{new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p>
      <h1>Каждый день — чуть свободнее.</h1><p className="sub">Небольшое занятие. Слова, которые пригодятся тебе.</p></div><span className="language-pill"><LanguageLabel code={study.language} /></span></header>
    <div className="today-mode-picker"><div><p className="kicker">ПРАКТИКА ПОД ТВОЮ ЗАДАЧУ</p><p>Повторить слова или поговорить на нужную тему</p></div><button type="button" className="dialogue-entry" onClick={() => setDialogue(true)}><Icon name="map" /><span>{study.dialogueSessions?.[study.language] && !study.dialogueSessions[study.language].completedAt ? 'Продолжить диалог' : 'Диалог по теме'}<small>Тема + слова из Anki</small></span><Icon name="arrow" /></button></div>
    <div className="today-grid">
      <section className={'daily-hero ' + (completed ? 'daily-complete' : '')} aria-labelledby="today-lesson-title">
        <div className="hero-content"><p className="eyebrow"><span className="status-dot" />{completed ? 'СЕГОДНЯ УЖЕ ПОЛУЧИЛОСЬ' : session ? 'ТВОЁ ЗАНЯТИЕ СОХРАНЕНО' : 'ТВОЯ ЕЖЕДНЕВНАЯ ПРАКТИКА'}</p>
          <h2 id="today-lesson-title">{completed ? <>Хорошая работа.<br />Можно выдохнуть.</> : session ? <>Продолжим с того,<br />где остановились.</> : active.words.length ? <>Дай своим словам<br />зазвучать.</> : <>Начни с короткого<br />разговора.</>}</h2>
          <p className="hero-description">{completed ? 'Ты проработал ' + wordCount(answers.length) + '. Трудные вернутся в следующих занятиях.'
            : session ? 'Пройдено шагов: ' + session.cursor + ' из ' + session.queue.length + '. Ответы сохранены.'
              : active.words.length ? 'Вспомни слово, используй его в своей фразе и закрепи то, что пока трудно.' : 'Попробуй готовый пример «Я в офисе» или добавь свои слова из Anki.'}</p>
          {!session && !!active.words.length && <div className="budget-picker" role="group" aria-label="Время на занятие">{([5, 10, 15] as const).map(value => <button type="button" key={value} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} мин</button>)}</div>}
          {completed ? <div className="completion-facts"><span><strong>{answers.filter(answer => answer.recall === 'independent').length}/{answers.length}</strong>вспомнил сразу</span>
            <span><strong>{answers.filter(answer => answer.application === 'independent').length}/{answers.length}</strong>применил сам</span></div>
            : active.words.length ? <><button type="button" className="primary start-lesson" disabled={starting || (!session && (loading || !targets.length))} onClick={() => void start()}>
              {starting ? 'Открываем…' : loading && !session ? 'Подбираем слова…' : session ? 'Продолжить занятие' : targets.length ? 'Начать занятие' : 'На сегодня всё повторено'}<Icon name="arrow" /></button>
              <p className="hero-meta"><Icon name="clock" />{session ? wordCount(session.targets.length) + ' · можно сделать паузу' : targets.length ? wordCount(targets.length) + ' · примерно ' + minutes + ' минут' : 'Можно почитать или выбрать тему ниже'}</p></>
              : <><button type="button" className="primary start-lesson" disabled={starting} onClick={async () => { setStarting(true); try { await update(addExample); } finally { setStarting(false); } }}>Попробовать пример <Icon name="arrow" /></button>
                <a className="hero-import" href="#account">Добавить свои слова из Anki ↗</a></>}
        </div><LearningPath />
        {!session && !!targets.length && <div className="selection-note"><Icon name="check" /><span>{difficult ? 'В приоритете трудные слова: ' + difficult + '.' : 'Небольшая подборка из твоего словаря.'} Вся коллекция остаётся в «Моих словах».</span></div>}
        {historyError && <p className="history-warning" role="status">История Anki сейчас недоступна. Подборка учитывает сохранённые результаты и слова.</p>}
      </section>
      <aside className="week-card"><div className="section-title"><h2>Твой ритм</h2><a href="#progress" aria-label="Открыть подробный прогресс"><Icon name="arrow" /></a></div>
        <p className="week-number">{activeDays}<span> / 7 дней</span></p><p className="sub">с практикой за неделю</p>
        <div className="week-chart" aria-label="Активность за последние семь дней">{week.map((day, index) => <div key={day.date} title={day.date + ': ' + day.total + ' ответов'}>
          <div className="week-bar"><span className={index === 6 ? 'current' : ''} style={{ height: (day.total ? 16 + day.total / maxActivity * 84 : 5) + '%' }} /></div><span>{day.label}</span></div>)}</div>
        <div className="week-insight"><Icon name="mic" /><p>{spoken ? <><strong>{independent} из {spoken}</strong> устных ответов без подсказки</> : <>Скажи первую фразу.<br />Здесь появится твой результат.</>}</p></div>
        <p className="week-note">По ответам в приложении. Устные результаты — твоя самооценка.</p>
      </aside>
    </div>
    {completed && <details className="completion-details fold"><summary>Что получилось в занятии</summary><ul>{session!.targets.map(target => {
      const word = active.words.find(word => word.id === target.wordId);
      const answer = session!.answers[target.wordId];
      return <li key={target.wordId}><strong lang={study.language}>{word?.title ?? 'Удалённое слово'}</strong><span>{!answer ? 'Пропущено' : answer.recall === 'independent' && answer.application === 'independent' ? 'Вспомнил и применил' : session!.revisits[target.wordId]?.application === 'independent' ? 'Получилось при закреплении' : 'Ещё потренируем'}</span></li>;
    })}</ul></details>}
    <div className="section-title explore-title"><div><p className="kicker">В ТВОЁМ ТЕМПЕ</p><h2>Продолжить по интересу</h2></div><a className="quiet-link" href="#practice">Свободная практика <Icon name="arrow" /></a></div>
    <div className="explore-grid"><section className="explore-card"><span className="card-icon"><Icon name="map" /></span><div><h3>Твои разговорные темы</h3><p className="sub">Связывай слова с ситуациями из жизни.</p>
      {active.topics.length > 0 && <div className="topic-shortcuts">{active.topics.slice(0, 3).map(topic => <button type="button" key={topic.id} onClick={() => practice(topic.id)}>{topic.title}<Icon name="arrow" /></button>)}</div>}
      <a className="quiet-link" href="#map">Открыть карту тем <Icon name="arrow" /></a></div></section>
      <section className="explore-card"><span className="card-icon lavender"><Icon name="materials" /></span><div><h3>Читать, слушать, обсуждать</h3><p className="sub">Тексты и диалоги дают словам контекст.</p>
        <p className="material-preview">{active.resources[0]?.title ?? (study.language === 'en' ? 'Готовые материалы от A1 до C2' : 'Добавь свой текст или материал из чата')}</p>
        <a className="quiet-link" href="#materials">Выбрать материал <Icon name="arrow" /></a></div></section></div>
  </div>;
}
