import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context';
import { dialogueWords, finishDialogue, saveDialogueDraft } from '../domain/dialogue-session';
import type { DialogueDraft, DialogueSession } from '../domain/dialogue-session';
import type { Outcome } from '../domain/model';
import { topicMaterials } from '../domain/model';
import { inspectSpeech } from '../domain/speech-feedback';
import { buildChatPrompt } from '../domain/chat-package.js';
import { wordExamples } from '../domain/vocabulary';
import { DialogueSetup } from './DialogueSetup';
import { copyText, Fold, SourceText } from './common';
import { WordExamplesList } from './WordExamples';
import { Recording } from './Recording';
import { Icon } from './Icon';

function DialogueWorkspace({ session, edit }: { session: DialogueSession; edit: () => void }) {
  const { study, active, update, notify } = useWorkspace();
  const [draft, setDraft] = useState(session.draft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Outcome>>({});
  const [reviewing, setReviewing] = useState(false);
  const [command, setCommand] = useState('');
  const lock = useRef(false);
  const words = dialogueWords(study, session);
  const topic = active.topics.find(topic => topic.id === session.topicId);
  const materials = [...(topic ? topicMaterials(topic) : []), ...active.resources.filter(resource => resource.topicId === session.topicId && resource.kind === 'dialogue').map(resource => ({ format: resource.title, text: resource.text }))];
  const hasExamples = materials.length > 0 || words.some(word => wordExamples(word).length > 0);
  const ownText = draft.lines.filter((_, index) => index % 2 === 1).join('\n');
  const inspection = inspectSpeech(ownText, words.map(word => word.title), session.language);
  const answered = draft.mode === 'spoken' ? draft.performed : Boolean(ownText.trim());
  const signature = JSON.stringify(draft);
  const persisted = useRef(JSON.stringify(session.draft));
  async function persist(value: DialogueDraft) {
    const signature = JSON.stringify(value);
    const ok = await update(current => saveDialogueDraft(current, session.id, value, session.language));
    if (ok) { persisted.current = signature; if (JSON.stringify(draftRef.current) === signature) setSaved(true); }
    return ok;
  }
  useEffect(() => {
    if (signature === persisted.current) return;
    setSaved(false);
    const timer = window.setTimeout(() => { void persist(draftRef.current); }, 700);
    return () => clearTimeout(timer);
  }, [signature]);
  useEffect(() => () => {
    if (JSON.stringify(draftRef.current) !== persisted.current) void update(current => saveDialogueDraft(current, session.id, draftRef.current, session.language));
  }, [session.id, session.language, update]);
  function change(next: DialogueDraft) { setDraft(next); setReviewing(false); setRatings({}); }
  async function showHints() {
    const next = { ...draft, hint: true };
    setBusy(true);
    try { if (await persist(next)) setDraft(next); } finally { setBusy(false); }
  }
  async function review() {
    setBusy(true);
    try { if (await persist(draft)) setReviewing(true); } finally { setBusy(false); }
  }
  async function complete() {
    if (lock.current || !answered) return;
    lock.current = true; setBusy(true);
    try {
      if (await update(current => finishDialogue(saveDialogueDraft(current, session.id, draft, session.language), session.id, ratings, Date.now()))) notify('Диалог завершён. Оценки слов сохранены.');
    } finally { lock.current = false; setBusy(false); }
  }
  function chat() {
    const prompt = 'Потренируй со мной диалог на языке ' + session.language + ' по теме «' + session.title + '». Ситуация: ' + session.prompt +
      '\nНачни с короткой реплики собеседника, жди моего ответа и продолжай по одной реплике. Помоги мне употребить каждое из выбранных ниже слов, не показывай заранее мой ответ. Исправляй ошибки с кратким объяснением по-русски.\n' +
      JSON.stringify(words.map(word => ({ title: word.title, meaning: word.meaning, example: word.example })), null, 2) +
      '\nТолько когда я попрошу выгрузить результат, выполни следующую инструкцию. Сохрани точные title и meaning выбранных слов, чтобы не создавать дубликаты при импорте.\n' +
      buildChatPrompt(session.language, session.title);
    setCommand(prompt); void copyText(prompt, notify);
  }
  return <div className="dialogue-workspace">
    <header className="dialogue-heading"><p className="kicker">ДИАЛОГ ПО ТЕМЕ · СЛОВ: {words.length}</p><h2>{session.title}</h2><p className="sub">{session.prompt || 'Разыграйте разговор и договоритесь о следующем шаге.'}</p><span className="draft-status" role="status">{saved ? 'Черновик сохранён' : 'Сохраняем реплики…'}</span><button className="subtle dialogue-edit" type="button" disabled={busy} onClick={async () => { if (await persist(draft)) edit(); }}>Изменить тему и слова</button></header>
    <div className="dialogue-work-grid"><section className="dialogue-conversation">
      <details className="mobile-dialogue-words"><summary>Слова для разговора · {words.length}</summary><ul>{words.map(word => <li key={word.id}><strong>{word.title}</strong> · {word.meaning}</li>)}</ul></details>
      <div className="practice-modes" role="group" aria-label="Как вести диалог"><button type="button" aria-pressed={draft.mode === 'spoken'} onClick={() => change({ ...draft, mode: 'spoken' })}><Icon name="mic" />Сказать вслух</button><button type="button" aria-pressed={draft.mode === 'written'} onClick={() => change({ ...draft, mode: 'written' })}>Написать реплики</button></div>
      {draft.mode === 'spoken' ? <div className="dialogue-speaking"><h3>Разыграй разговор за двоих</h3><ol className="dialogue-beats"><li><strong>Начните разговор</strong><span>Обозначь ситуацию и задай вопрос.</span></li><li><strong>Обсудите варианты</strong><span>Ответь, уточни детали, используй выбранные слова.</span></li><li><strong>Договоритесь</strong><span>Предложи решение и закончи разговор.</span></li></ol>
        <Recording itemId={'dialogue:' + session.id} language={session.language} targets={words.map(word => word.title)} />
        <label className="manual-confirm"><input type="checkbox" checked={draft.performed} onChange={event => change({ ...draft, performed: event.target.checked })} />Я разыграл разговор вслух</label></div>
        : <><p className="sub conversation-help">Напиши обе роли сам или вставь реплики из своего ИИ-чата. Проверка ищет слова только в твоих ответах.</p>
          <div className="dialogue-turns">{draft.lines.map((line, index) => <label key={index} className={index % 2 ? 'dialogue-turn own-turn' : 'dialogue-turn'}><span>{index % 2 ? 'Ты' : 'Собеседник'} <small>· {Math.floor(index / 2) + 1}</small></span>
            <textarea rows={2} value={line} lang={session.language} maxLength={2000} disabled={busy} placeholder={index === 0 ? 'Начните разговор…' : index % 2 ? 'Твой ответ с выбранными словами…' : 'Вопрос или ответ собеседника…'} onChange={event => change({ ...draft, lines: draft.lines.map((value, at) => at === index ? event.target.value : value) })} onBlur={() => { if (JSON.stringify(draft) !== persisted.current) void persist(draft); }} /></label>)}</div>
          {draft.lines.length < 12 && <button type="button" className="subtle" onClick={() => change({ ...draft, lines: [...draft.lines, '', ''] })}>+ Ещё две реплики</button>}
        </>}
      {!reviewing && <button type="button" className="primary dialogue-review" disabled={!answered || busy} onClick={() => void review()}>Подвести итог <Icon name="arrow" /></button>}
      {reviewing && <section className="dialogue-assessment"><h3>Какие слова удалось применить?</h3><p className="sub">Оцени каждое слово. Неотмеченные не изменят прогресс. Поиск слов не проверяет смысл, грамматику и произношение.</p>
        {draft.hint && <p className="sub">Примеры были открыты: успешное применение сохранится как «С помощью».</p>}
        {words.map((word, index) => <div className="dialogue-rating" key={word.id}><div><strong lang={word.language}>{word.title}</strong>{draft.mode === 'written' && <small>{inspection.words[index]?.span ? 'Найдено в твоих репликах' : 'Не найдено — проверь другую форму слова'}</small>}</div>
          <label><span className="sr-only">Результат · {word.title}</span><select value={ratings[word.id] ?? ''} onChange={event => setRatings(previous => ({ ...previous, [word.id]: event.target.value as Outcome }))}><option value="">Не оценивать</option><option value="retry">Пока трудно</option><option value="assisted">С помощью</option>{!draft.hint && <option value="independent">Самостоятельно</option>}</select></label></div>)}
        <button type="button" className="primary" disabled={busy} onClick={() => void complete()}>Завершить диалог <Icon name="check" /></button>
      </section>}
    </section><aside className="dialogue-support"><section><p className="kicker">ТВОИ СЛОВА</p><h3>Используй в разговоре</h3><ul className="dialogue-targets">{words.map((word, index) => <li key={word.id}><div><strong lang={word.language}>{word.title}</strong><span>{word.meaning}</span></div>{draft.mode === 'written' && inspection.words[index]?.span && <span className="word-found" aria-label="Найдено в твоих репликах"><Icon name="check" /></span>}</li>)}</ul>
      {words.length < session.wordIds.length && <p className="sub">Некоторые выбранные слова удалены из словаря.</p>}
      {hasExamples && (!draft.hint ? <button type="button" className="subtle" disabled={busy} onClick={() => void showHints()}>Открыть контекст и примеры</button> : <div className="dialogue-hints">{words.filter(word => wordExamples(word).length).map(word => <Fold key={word.id} title={word.title}><WordExamplesList word={word} /></Fold>)}{materials.map((material, index) => <Fold key={index} title={material.format}><SourceText text={material.text} language={session.language} /></Fold>)}</div>)}
      {!materials.length && <p className="sub">В этой теме пока нет готового диалога. Его можно добавить из чата через «Материалы».</p>}
    </section><section className="dialogue-chat"><p className="kicker">С СОБЕСЕДНИКОМ В ИИ-ЧАТЕ</p><h3>Продолжить в своём чате</h3><p className="sub">Команда передаст тему и выбранные слова. Вставь её в приложение ИИ, а результат верни файлом nit-rechi.json через «Материалы».</p><button type="button" onClick={chat}>Скопировать задание ↗</button>{command && <Fold title="Текст задания"><textarea readOnly rows={6} value={command} aria-label="Задание для ИИ-чата" /></Fold>}<a className="quiet-link" href="#materials">Импорт результата <Icon name="arrow" /></a></section></aside></div>
  </div>;
}

export function DialogueStudio() {
  const { study } = useWorkspace();
  const [preparing, setPreparing] = useState(false);
  const session = study.dialogueSessions?.[study.language];
  if (!session || preparing) return <DialogueSetup editing={session && !session.completedAt ? session : undefined} started={() => setPreparing(false)} />;
  if (!session.completedAt) return <DialogueWorkspace key={session.id} session={session} edit={() => setPreparing(true)} />;
  const outcomes = Object.values(session.outcomes ?? {});
  return <section className="dialogue-finished"><span className="card-icon"><Icon name="check" /></span><p className="kicker">ДИАЛОГ ЗАВЕРШЁН</p><h2>{session.title}</h2><p className="sub">Оценено слов: {outcomes.length} · Самостоятельно: {outcomes.filter(value => value === 'independent').length}. Результат учтён в прогрессе {session.draft.mode === 'spoken' ? 'устной' : 'письменной'} практики.</p>
    <button type="button" className="primary" onClick={() => setPreparing(true)}>Выбрать тему и слова <Icon name="arrow" /></button>
    {session.draft.mode === 'written' && <p className="sub">Реплики сохранены в «Материалах» и в теме. Они останутся после начала нового занятия.</p>}
    {!!session.draft.lines.some(Boolean) && <Fold title="Мой диалог"><SourceText text={session.draft.lines.flatMap((line, i) => line.trim() ? [(i % 2 ? 'B: ' : 'A: ') + line] : []).join('\n')} language={session.language} /></Fold>}
  </section>;
}
