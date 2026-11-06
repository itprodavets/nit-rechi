import { useRef, useState } from 'react';
import { useWorkspace } from '../context';
import { useSavedDraft } from '../hooks/useSavedDraft';
import { finishStory, revealStoryHint, saveStoryDraft, storyCorrectionPrompt, storyTextLimit, storyWords } from '../domain/story-session';
import type { StorySession } from '../domain/story-session';
import { topicMaterials } from '../domain/model';
import type { Outcome } from '../domain/model';
import { inspectSpeech } from '../domain/speech-feedback';
import { memoryQuestions } from '../domain/starter-stories';
import { copyText, Fold, SourceText } from './common';
import { Recording } from './Recording';
import { StoryVersions } from './StoryVersions';
import { WordExamplesList } from './WordExamples';
import { Icon } from './Icon';

export function StoryWorkspace({ session, next }: { session: StorySession; next: () => void }) {
  const { study, active, update, notify } = useWorkspace();
  const { draft, setDraft, saved, flush } = useSavedDraft(session.draft, value => update(current => saveStoryDraft(current, session.topicId, session.id, value)));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [ratings, setRatings] = useState<Record<string, Outcome>>({});
  const [command, setCommand] = useState('');
  const lock = useRef(false);
  const words = storyWords(study, session);
  const topic = active.topics.find(topic => topic.id === session.topicId);
  const examples = topic ? topicMaterials(topic) : [];
  const revising = draft.original !== undefined;
  const answered = draft.mode === 'spoken' ? draft.performed : !!draft.text.trim();
  const helped = draft.hint || !!draft.corrected.trim();
  const inspection = revising && draft.original ? inspectSpeech(draft.original, words.map(word => word.title), session.language) : undefined;

  async function revise() {
    setBusy(true);
    const value = { ...draft, original: draft.text };
    try { if (await flush(value)) setDraft(value); } finally { setBusy(false); }
  }
  function showExample() { setDraft(revealStoryHint); }
  async function chat() {
    if (!draft.text.trim()) return;
    if (!revising) { await revise(); }
    const prompt = storyCorrectionPrompt({ ...session, draft }, words);
    setCommand(prompt); await copyText(prompt, notify);
  }
  async function finish() {
    if (lock.current || !answered || !outcome) return;
    lock.current = true; setBusy(true);
    try {
      if (await update(current => finishStory(saveStoryDraft(current, session.topicId, session.id, draft), session.topicId, session.id, outcome, ratings, Date.now()))) notify('История сохранена вместе с первой попыткой и исправлениями.');
    } finally { lock.current = false; setBusy(false); }
  }

  if (session.completedAt) return <section className="dialogue-finished"><p className="kicker">ТВОЯ ИСТОРИЯ СОХРАНЕНА</p><h2>{session.title}</h2><p className="sub">Первая попытка и исправления остались в материалах темы. Можно вернуться к ним или рассказать о другом случае.</p>
    <StoryVersions story={{ original: session.draft.original ?? session.draft.text, corrected: session.draft.corrected, notes: session.draft.notes, situation: session.draft.situation }} language={session.language} />
    {session.draft.mode === 'spoken' && <Recording itemId={'story:' + session.id} language={session.language} readOnly />}
    <button type="button" className="primary" onClick={next}>Рассказать другую историю <Icon name="arrow" /></button></section>;

  return <div className="story-workspace">
    <header className="dialogue-heading"><p className="kicker">МОЯ ИСТОРИЯ · {revising ? 'РАЗБОР И ИСПРАВЛЕНИЯ' : 'ПЕРВАЯ ПОПЫТКА'}</p><h2>{session.title}</h2>
      <p className="sub">{draft.situation || 'Вспомни конкретный случай из своей жизни. Расскажи, что произошло, как ты поступил и чем всё закончилось.'}</p>
      <span className="draft-status" role="status">{saved ? 'Черновик сохранён' : 'Сохраняем…'}</span></header>
    <div className={'story-layout ' + (revising ? 'story-revision-layout' : '')}><section className="story-editor">
      {!revising ? <><div className="practice-modes" role="group" aria-label="Как рассказать историю"><button type="button" aria-pressed={draft.mode === 'written'} disabled={busy} onClick={() => setDraft({ ...draft, mode: 'written' })}>Написать</button><button type="button" aria-pressed={draft.mode === 'spoken'} disabled={busy} onClick={() => setDraft({ ...draft, mode: 'spoken' })}><Icon name="mic" />Рассказать вслух</button></div>
        <h3>Расскажи, как помнишь</h3><p className="story-encouragement">Не останавливайся из-за ошибок. Добавляй детали, мысли и чувства. Не знаешь слово — оставь его по-русски или опиши иначе. Исправления будут следующим шагом.</p>
        {draft.mode === 'spoken' && <><Recording itemId={'story:' + session.id} language={session.language} targets={words.map(word => word.title)} onTranscript={text => setDraft({ ...draft, text, performed: true })} /><label className="manual-confirm"><input type="checkbox" checked={draft.performed} onChange={event => setDraft({ ...draft, performed: event.target.checked })} />Я рассказал историю вслух</label></>}
        <label className="story-text-label">{draft.mode === 'written' ? 'Мой рассказ' : 'Расшифровка или заметки к рассказу — необязательно'}<textarea className="story-text" lang={session.language} rows={13} maxLength={storyTextLimit} value={draft.text} disabled={busy} onChange={event => setDraft({ ...draft, text: event.target.value })} onBlur={() => { void flush(); }} placeholder="Начни с того, где ты был и что случилось. Рассказывай дальше столько, сколько вспомнишь…" /></label>
        <p className="sub story-writing-note">Длина свободная. Можно сделать паузу и вернуться к черновику.</p>
        <button type="button" className="primary" disabled={!answered || busy} onClick={() => void revise()}>Сохранить первую попытку и разобрать <Icon name="arrow" /></button>
      </> : <><h3>Сохраним мысль, улучшим выражение</h3><p className="story-encouragement">Первую попытку оставляем как есть. Исправь рассказ сам или перенеси его в свой ИИ-чат и вставь результат рядом.</p>
        <div className="story-comparison"><label>Моя первая попытка<textarea rows={13} value={draft.original ?? ''} readOnly lang={session.language} placeholder="Рассказ записан голосом" /></label>
          <label>Исправленная версия<textarea rows={13} value={draft.corrected} maxLength={storyTextLimit} lang={session.language} onChange={event => setDraft({ ...draft, corrected: event.target.value })} onBlur={() => { void flush(); }} placeholder="Вставь разбор из своего чата или исправь текст самостоятельно. Не придумывай события — сохрани то, что хотел сказать." /></label></div>
        <div className="story-correction-tools"><button type="button" disabled={busy || !draft.original?.trim()} onClick={() => void chat()}>Подготовить разбор в ИИ-чате ↗</button><p className="sub">Тема, твой рассказ и слова попадут в копируемое задание. Отправки в ИИ с сайта нет.</p></div>
        {command && <Fold title="Задание для чата" open><textarea readOnly rows={6} value={command} aria-label="Задание для исправления рассказа" /></Fold>}
        {!draft.original?.trim() && <p className="sub">Для разбора голоса можно прослушать запись ниже. Текстовая проверка требует расшифровки.</p>}
        {draft.mode === 'spoken' && <Recording itemId={'story:' + session.id} language={session.language} readOnly />}
        {!!inspection?.issues.length && <Fold title="Локальные подсказки к первой попытке"><p className="sub">Проверяются только отдельные правила. Это не полный разбор рассказа.</p>{inspection.issues.map(issue => <p key={issue.start}>{draft.original!.slice(issue.start, issue.end)} → {issue.correction}</p>)}</Fold>}
        <label className="story-notes">Что исправлено и почему<textarea rows={4} value={draft.notes} maxLength={12000} onChange={event => setDraft({ ...draft, notes: event.target.value })} onBlur={() => { void flush(); }} placeholder="Например: go → went — я рассказываю о вчерашнем событии. Какие слова или связки помогли выразить мысль?" /></label>
        <Fold title="Закрепить — рассказать ещё раз без текста"><p className="sub">Вспомни историю целиком: события, свои действия и результат. Попробуй не читать исправленный вариант.</p><p className="sub">Можно проговорить без записи. Для новой сохранённой попытки заверши эту историю и начни следующую.</p></Fold>
        <section className="dialogue-assessment"><h3>Как удалось выразить мысль?</h3><p className="sub">Это твоя оценка. {helped ? 'С исправлениями или примером результат учитывается как работа с помощью.' : 'Оцени, удалось ли рассказать, а не только узнать слова.'}</p>
          <label>Результат рассказа<select value={helped && outcome === 'independent' ? 'assisted' : outcome} onChange={event => setOutcome(event.target.value as Outcome | '')}><option value="">Выбери результат</option><option value="retry">Пока трудно — хочу повторить</option><option value="assisted">С помощью / после исправлений</option>{!helped && <option value="independent">Удалось самостоятельно</option>}</select></label>
          {!!words.length && <Fold title="Как получилось с выбранными словами"><p className="sub">Отметь только слова, которые действительно попробовал использовать.</p>{words.map((word, i) => <label className="story-word-rating" key={word.id}><span>{word.title}<small>{inspection?.words[i]?.span ? 'Найдено в первой попытке' : 'Проверь употребление самостоятельно'}</small></span><select value={helped && ratings[word.id] === 'independent' ? 'assisted' : ratings[word.id] ?? ''} onChange={event => setRatings({ ...ratings, [word.id]: event.target.value as Outcome })}><option value="">Не оценивать</option><option value="retry">Пока трудно</option><option value="assisted">С помощью</option>{!helped && <option value="independent">Самостоятельно</option>}</select></label>)}</Fold>}
          <button type="button" className="primary" disabled={busy || !outcome} onClick={() => void finish()}>Сохранить историю и результат <Icon name="check" /></button>
        </section>
      </>}
    </section><aside className="story-support">
      <details className="story-memory" open={!revising || undefined}><summary>Что ещё вспомнить?</summary><p className="sub">Это опоры. Не нужно отвечать на всё по порядку.</p>{memoryQuestions.map(([title, question]) => <div key={title}><strong>{title}</strong><p>{question}</p></div>)}</details>
      {!!words.length && <Fold title={'Слова-опоры · ' + words.length}><p className="sub">Используй только там, где они подходят твоей истории.</p>{words.map(word => <div className="story-word" key={word.id}><strong>{word.title}</strong><p>{word.meaning}</p><button type="button" className="subtle" onClick={() => void showExample()}>Примеры употребления</button>{draft.hint && <WordExamplesList word={word} />}</div>)}</Fold>}
      {!!examples.length && <section className="story-example"><p className="kicker">КАК МОЖНО РАЗВЕРНУТЬ ИСТОРИЮ</p><h3>Пример целого рассказа</h3><p className="sub">Пример показывает детали и последовательность. Твой случай может быть совсем другим.</p>
        {!draft.hint ? <button type="button" onClick={() => void showExample()}>Открыть пример</button> : examples.map((example, i) => <Fold key={i} title={example.format} open={i === 0}><SourceText text={example.text} language={session.language} /></Fold>)}
      </section>}
    </aside></div>
  </div>;
}
