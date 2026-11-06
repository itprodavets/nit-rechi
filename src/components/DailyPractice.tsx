import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorkspace } from '../context';
import { readRecentLapses } from '../domain/anki-history';
import type { RecentLapse } from '../domain/anki-history';
import { dailyTargets, lapseWindow } from '../domain/daily-speech';
import { assess, localDay, resultLabels } from '../domain/model';
import type { DailyWord, Outcome, Topic, Word } from '../domain/model';
import { WordExamplesList } from './WordExamples';
import { Recording } from './Recording';
import { Fold } from './common';

function SpeechTask({ word, topic, target, count, done, date, close, save }: {
  word: Word; topic?: Topic; target: DailyWord; count: number; done: number; date: string;
  close: () => void; save: (answer: Outcome) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const cue = word.meaning || word.title;
  return <div className="session daily-session">
    <section className="task">
      <div className="task-top">
        <p className="kicker">Устная практика · {done + 1} из {count}</p>
        <button type="button" className="subtle" onClick={close}>К обычной практике</button>
      </div>
      <h2 ref={heading} tabIndex={-1}>{topic?.title ?? 'Ситуация из жизни'}</h2>
      <p className="prompt">{topic?.prompt || 'Вспомни реальную ситуацию. Расскажи, что произошло и что ты сказал бы собеседнику.'}</p>
      <p>Скажи 2–3 фразы и употреби {word.meaning ? 'слово со значением' : 'слово'} <strong lang={word.meaning ? undefined : word.language}>«{cue}»</strong>.</p>
      <p className="sub">{target.lapses ? `Ответов «Снова» в Anki за 30 дней · ${target.lapses}` : 'На прошлом устном ответе понадобилась помощь или повторение.'}</p>
      <Recording itemId={JSON.stringify(['daily-speech', date, word.id])} />
      {revealed ? <div className="reference">
        <h2 lang={word.language}>{word.title}</h2><WordExamplesList word={word} />
      </div> : <button type="button" className="subtle reveal" onClick={() => setRevealed(true)}>Сверить слово и пример</button>}
    </section>
    <section className="assessment" aria-label="Результат устного ответа">
      <p className="kicker">Получилось употребить слово?</p>
      <div className="actions">{(Object.keys(resultLabels) as Outcome[]).map(result =>
        <button type="button" key={result} className={result === 'independent' ? 'primary' : ''} onClick={() => save(result)}>{resultLabels[result]}</button>)}</div>
    </section>
  </div>;
}

export function DailyPractice({ children }: { children: ReactNode }) {
  const { study, active, update, notify } = useWorkspace();
  const [date, setDate] = useState(() => localDay(Date.now()));
  const [open, setOpen] = useState(false);
  const [lapses, setLapses] = useState<Map<string, RecentLapse>>();
  const [error, setError] = useState(false);
  const stored = study.dailySpeech?.[study.language];
  const session = stored?.date === date ? stored : undefined;
  const hasAnki = active.words.some(word => word.ankiGuid && word.ankiReviews);
  const lastImport = active.words.reduce((latest, word) => Math.max(latest, word.ankiUpdatedAt ?? 0), 0);
  useEffect(() => {
    const refresh = () => setDate(localDay(Date.now()));
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (session || !hasAnki) return;
    let live = true;
    setLapses(undefined);
    setError(false);
    const now = Date.now();
    readRecentLapses(study.language, now - lapseWindow, now).then(
      result => { if (live) setLapses(result); },
      () => { if (live) setError(true); }
    );
    return () => { live = false; };
  }, [session, hasAnki, study.language, lastImport, date]);

  if (!active.words.length) return children;
  const words = new Map(active.words.map(word => [word.id, word]));
  const targets = (session?.targets ?? dailyTargets(active.words, study.results, lapses ?? new Map(), Date.now()))
    .filter(target => words.has(target.wordId));
  const pending = targets.filter(target => !session?.answers[target.wordId]);
  const done = targets.length - pending.length;
  const loading = !session && hasAnki && !lapses && !error;
  const target = pending[0];

  function start() {
    if (!target || loading) return;
    if (!session && !update(current => ({
      ...current, dailySpeech: { ...current.dailySpeech, [current.language]: { date, targets, answers: {} } }
    }))) return;
    setOpen(true);
  }

  function save(answer: Outcome) {
    if (!target) return;
    const now = Date.now();
    const today = localDay(now);
    if (today !== date) { setDate(today); setOpen(false); return; }
    if (update(current => {
      const daily = current.dailySpeech?.[current.language];
      if (!daily || daily.date !== date || daily.answers[target.wordId]) return current;
      const next = assess(current, target.wordId, answer, now, 'spoken');
      return { ...next, dailySpeech: { ...current.dailySpeech, [current.language]: {
        ...daily, answers: { ...daily.answers, [target.wordId]: answer }
      } } };
    }) && pending.length === 1) {
      setOpen(false);
      notify('Устная практика на сегодня завершена.');
    }
  }

  if (open && session && target) {
    const linked = active.topics.filter(topic => topic.links.includes(target.wordId));
    const topic = linked.find(topic => topic.prompt.trim()) ?? linked[0];
    return <SpeechTask key={JSON.stringify([date, target.wordId])} date={date} word={words.get(target.wordId)!}
      topic={topic} target={target} count={targets.length} done={done} close={() => setOpen(false)} save={save} />;
  }

  return <>
    <section className="daily-panel" aria-labelledby="daily-practice-title">
      <div>
        <p className="kicker">Устная тренировка</p>
        <h2 id="daily-practice-title">Практика на сегодня</h2>
        <p className="sub">{loading ? 'Подбираем слова по истории Anki…'
          : targets.length ? `Готово ${done} из ${targets.length} · Употреби сложные слова в речи`
            : 'Подборка появится после сложных устных ответов или импорта истории повторений с ответами «Снова».'}</p>
        {hasAnki && error && <p className="sub" role="status">История Anki недоступна. Учтены сохранённые устные ответы.</p>}
      </div>
      {!loading && target && <button type="button" className="primary" onClick={start}>{done ? 'Продолжить' : 'Начать тренировку'}</button>}
      {session && done > 0 && <Fold title="Результаты тренировки">
        <ul className="daily-results">{targets.filter(entry => session.answers[entry.wordId]).map(entry => {
          const word = words.get(entry.wordId)!;
          return <li key={word.id}><strong lang={word.language}>{word.title}</strong><span>{resultLabels[session.answers[word.id]!]}</span></li>;
        })}</ul>
      </Fold>}
    </section>
    {children}
  </>;
}
