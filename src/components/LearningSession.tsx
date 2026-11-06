import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context';
import { checkLearningRecall, completeLearningStep, recordRecall, saveApplicationDraft, skipMissingStep } from '../domain/learning-session';
import type { ApplicationDraft, ApplicationMode, LearningSession as Session } from '../domain/learning-session';
import type { Outcome, Topic, Word } from '../domain/model';
import { inspectSpeech } from '../domain/speech-feedback';
import { wordExamples } from '../domain/vocabulary';
import { WordCue } from './WordCue';
import { WordExamplesList } from './WordExamples';
import { Recording } from './Recording';
import { Icon } from './Icon';
import { VoiceButtons } from './common';

function Recall({ word, session, revisit, busy, next, check }: { word: Word; session: Session; revisit: boolean; busy: boolean; next: (outcome: Outcome) => void; check: (answer: string, reveal: boolean) => void }) {
  const [answer, setAnswer] = useState(session.recallAttempt?.answer ?? '');
  const result = session.recallAttempt?.result;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <>
    <p className="kicker">01 / Вспомнить</p>
    <h1 ref={heading} tabIndex={-1}>{!word.meaning ? 'Познакомься со словом' : revisit ? 'Попробуй вспомнить ещё раз' : 'Какое слово подходит?'}</h1>
    <p className="lesson-instruction">{word.meaning ? 'Введи слово или выражение по подсказке.' : 'Прослушай его. На следующем шаге попробуем использовать.'}</p>
    <WordCue word={word} />
    {word.meaning ? <form className="recall-form" onSubmit={event => { event.preventDefault(); if (answer.trim()) check(answer, false); }}>
      <label htmlFor="recall-answer">Твой ответ</label>
      <input id="recall-answer" lang={word.language} value={answer} onChange={event => setAnswer(event.target.value)} disabled={!!result || busy} spellCheck={false} autoComplete="off" autoCapitalize="none" placeholder="Вспомни и напиши…" />
      {!result && <div className="lesson-actions"><button className="primary" type="submit" disabled={!answer.trim() || busy}>Проверить <Icon name="arrow" /></button>
        <button className="subtle" type="button" disabled={busy} onClick={() => check(answer, true)}>Пока не помню</button></div>}
    </form> : <VoiceButtons text={word.title} language={word.language} />}
    {(result || !word.meaning) && <div className="lesson-feedback" role="status">
      <p className="feedback-label">{result === 'independent' ? 'Верно, вспомнил без подсказки' : 'Слово для этой подсказки'}</p>
      <strong className="recall-word" lang={word.language}>{word.title}</strong>
      {result !== 'independent' && <p className="sub">Вернёмся к нему в конце занятия.</p>}
      <button type="button" className="primary" disabled={busy} onClick={() => next(result ?? 'assisted')}>Теперь в своей фразе <Icon name="arrow" /></button>
    </div>}
  </>;
}

function Application({ word, topic, session, busy, save, saveDraft }: { word: Word; topic?: Topic; session: Session; busy: boolean; save: (result: Outcome, mode: ApplicationMode) => void; saveDraft: (draft: ApplicationDraft) => Promise<boolean> }) {
  const [mode, setMode] = useState<ApplicationMode>(session.applicationDraft?.mode ?? session.mode ?? 'spoken');
  const [text, setText] = useState(session.applicationDraft?.text ?? '');
  const [compared, setCompared] = useState(session.applicationDraft?.compared ?? false);
  const [hint, setHint] = useState(session.applicationDraft?.hint ?? false);
  const [confirmed, setConfirmed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const inspection = compared && mode === 'written' ? inspectSpeech(text, [word.title], word.language) : undefined;
  const missing = inspection && !inspection.words[0]?.span;
  const hasExamples = wordExamples(word).length > 0;
  const flagged = !!missing || !!inspection?.issues.length;
  const independent = !hint && (!flagged || confirmed);
  async function persist(draft: ApplicationDraft) {
    if (await saveDraft(draft)) { setMode(draft.mode); setCompared(draft.compared); setHint(draft.hint); setConfirmed(false); }
  }
  return <>
    <p className="kicker">02 / Употребить {topic && <span>· {topic.title}</span>}</p>
    <h1 ref={heading} tabIndex={-1}>Твоя фраза со словом <span lang={word.language}>{word.title}</span></h1>
    <p className="lesson-instruction">{topic?.prompt || 'Вспомни ситуацию из своей жизни. Составь 2–3 фразы с этим словом.'}</p>
    <div className="practice-modes" role="group" aria-label="Как ответить">{(['spoken', 'written'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => { if (value !== mode) void persist({ mode: value, text, compared: false, hint: hint || compared }); }}>
      {value === 'spoken' ? <><Icon name="mic" />Сказать вслух</> : 'Написать'}</button>)}</div>
    {mode === 'spoken' ? <div className="speaking-space"><Icon name="mic" /><p>Говори так, как сказал бы собеседнику.</p><span className="sub">Можно записать себя и прослушать ответ.</span>
      <Recording itemId={'lesson:' + session.id + ':' + session.cursor} language={word.language} targets={[word.title]} />
      {!compared && <button className="primary" type="button" disabled={busy} onClick={() => void persist({ mode, text, compared: true, hint })}>Я ответил вслух <Icon name="check" /></button>}
    </div> : <form onSubmit={event => { event.preventDefault(); if (text.trim()) void persist({ mode, text, compared: true, hint }); }}>
      <label>Твой вариант<textarea lang={word.language} rows={3} maxLength={2000} disabled={busy} placeholder="Напиши свою фразу…" value={text} onChange={event => { if (compared) setHint(true); setText(event.target.value); setCompared(false); setConfirmed(false); }} /></label>
      {!compared && <button className="primary" type="submit" disabled={!text.trim() || busy}>Сверить ответ <Icon name="arrow" /></button>}
    </form>}
    {!compared && !hint && hasExamples && <button className="hint-button" type="button" disabled={busy} onClick={() => void persist({ mode, text, compared, hint: true })}>Нужна опора? Открыть пример</button>}
    {(compared || hint) && <div className="lesson-reference">
      <p className="kicker">{hasExamples ? 'Пример употребления' : 'Проверка себя'}</p><WordExamplesList word={word} />
      {!hasExamples && <p className="sub">Сверь фразу со своим материалом или уточни её в чате с ИИ. Примеры из чата можно добавить через «Материалы».</p>}
    </div>}
    {compared && <section className="lesson-assessment" aria-label="Оценка своего ответа">
      {inspection && <div className="text-inspection" role="status"><strong>{missing ? 'Нужное слово не найдено в тексте' : 'Нужное слово найдено'}</strong>
        {inspection.issues.map(issue => <p key={issue.start}>Проверь: {text.slice(issue.start, issue.end)} → {issue.correction}</p>)}
        <p className="sub">Поиск может пропустить другую форму или слова внутри выражения. {hasExamples ? 'Смысл и грамматику сравни с примером.' : 'Смысл и грамматику оцени самостоятельно.'}</p>
        {flagged && <label className="manual-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Я проверил: слово или его форма употреблены правильно</label>}</div>}
      <h2>Удалось выразить свою мысль?</h2>
      <p className="sub">{hint ? 'Пример был опорой для ответа — отметь, помог ли он.' : 'Оцени применение слова, а не только его узнавание.'}</p>
      <div className="outcome-options">
        <button type="button" disabled={busy} onClick={() => save('retry', mode)}>Пока трудно<small>Вернёмся к слову</small></button>
        <button type="button" disabled={busy} onClick={() => save('assisted', mode)}>С помощью<small>Нужна опора или правка</small></button>
        <button type="button" className="primary" disabled={busy || !independent} onClick={() => save('independent', mode)}>Самостоятельно<small>Применил без подсказки</small></button>
      </div>
    </section>}
  </>;
}

export function LearningSession({ session, close }: { session: Session; close: () => void }) {
  const { active, update } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const step = session.queue[session.cursor];
  const word = active.words.find(entry => entry.id === step?.wordId);
  const topic = active.topics.find(entry => entry.links.includes(word?.id ?? '') && entry.prompt);
  async function change(action: Parameters<typeof update>[0]) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try { return await update(action); } finally { lock.current = false; setBusy(false); }
  }
  const index = step?.revisit ? session.cursor - session.targets.length + 1 : session.cursor + 1;
  const count = step?.revisit ? session.queue.length - session.targets.length : session.targets.length;
  return <div className="learning-session">
    <div className="lesson-toolbar"><button type="button" className="subtle" onClick={close}><Icon name="close" />На сегодня</button>
      <span>{step?.revisit ? 'Закрепление' : 'Слово'} {index} / {count}</span><span className="lesson-saving">{busy ? 'Сохраняем…' : 'Прогресс сохраняется'}</span></div>
    <progress className="lesson-progress" value={session.cursor} max={session.queue.length} aria-label="Прогресс занятия" />
    <div className="lesson-card">
      {word ? session.phase === 'recall' ? <Recall key={session.cursor + ':recall'} word={word} session={session} revisit={!!step.revisit} busy={busy}
        check={(answer, reveal) => void change(current => checkLearningRecall(current, session.id, session.cursor, answer, reveal))} next={outcome => void change(current => {
        const stored = current.learningSessions?.[session.language];
        if (current.language !== session.language || !stored || stored.id !== session.id || stored.cursor !== session.cursor) return current;
        return { ...current, learningSessions: { ...current.learningSessions, [session.language]: recordRecall(stored, outcome) } };
      })} /> : <Application key={session.cursor + ':use'} word={word} topic={topic} session={session} busy={busy}
        saveDraft={draft => change(current => saveApplicationDraft(current, session.id, session.cursor, draft))}
        save={(result, mode) => void change(current => completeLearningStep(current, session.id, session.cursor, result, mode, Date.now()))} />
        : <><h1>Слово уже удалено из словаря</h1><button type="button" className="primary" disabled={busy} onClick={() => void change(current => skipMissingStep(current, session.id, session.cursor))}>Продолжить занятие</button></>}
    </div>
    <p className="lesson-footnote">{step?.revisit ? 'Повторная попытка помогает закрепить слово. Проверим его снова в другой день.' : 'Сначала вспомни. Затем используй в своей ситуации.'}</p>
  </div>;
}
