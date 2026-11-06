import { assess, itemsForLanguage, lastSpoken, localDay, normalize } from './model.ts';
import type { Outcome, Study } from './model.ts';

export type Budget = 5 | 10 | 15;
export type SelectionReason = 'lapse' | 'practice' | 'review' | 'new';
export type LearningTarget = { wordId: string; reason: SelectionReason };
export type ApplicationMode = 'spoken' | 'written';
export type LearningAnswer = { recall: Outcome; application: Outcome; mode: ApplicationMode };
export type ApplicationDraft = { text: string; mode: ApplicationMode; compared: boolean; hint: boolean };
export interface LearningSession {
  id: string;
  date: string;
  language: string;
  minutes: Budget;
  targets: LearningTarget[];
  queue: { wordId: string; revisit?: boolean }[];
  cursor: number;
  phase: 'recall' | 'use';
  recall?: Outcome;
  mode?: ApplicationMode;
  completedAt?: number;
  recallAttempt?: { answer: string; result: Outcome };
  applicationDraft?: ApplicationDraft;
  answers: Record<string, LearningAnswer>;
  revisits: Record<string, LearningAnswer>;
}
export const budgets: Record<Budget, number> = { 5: 3, 10: 5, 15: 8 };
export const reasonLabels: Record<SelectionReason, string> = {
  lapse: 'Забывал в Anki', practice: 'Нужно закрепить', review: 'Пора применить', new: 'Новое в практике'
};
export const lapseWindow = 30 * 86_400_000;
const wordPlural = new Intl.PluralRules('ru');
export const wordCount = (count: number) => count + ' ' + ({ zero: 'слов', one: 'слово', two: 'слова', few: 'слова', many: 'слов', other: 'слова' }[wordPlural.select(count)]);

/** Lapses are keyed by local word id; archive identity stays at the import boundary. */
export function selectLearningTargets(study: Study, lapses: ReadonlyMap<string, { count: number; last: number }>, now: number, minutes: Budget): LearningTarget[] {
  const review: { target: LearningTarget; priority: number; due: number }[] = [];
  const fresh: LearningTarget[] = [];
  for (const word of itemsForLanguage(study).words) {
    const result = study.results[word.id];
    const lapse = lapses.get(word.id);
    const recentLapse = lapse && lapse.last <= now && lapse.last >= now - lapseWindow && lapse.last > (result?.updated ?? 0);
    const spoken = lastSpoken(result);
    const relevantSchedules = [result?.schedules?.written, result?.schedules?.spoken].filter(value => value !== undefined);
    const due = relevantSchedules.length ? Math.min(...relevantSchedules.map(value => value.due)) : result?.due ?? 0;
    if (result && !recentLapse && (due > now || (spoken.outcome === 'independent' && spoken.updated && localDay(spoken.updated) === localDay(now)))) continue;
    if (recentLapse) review.push({ target: { wordId: word.id, reason: 'lapse' }, priority: 300 + Math.min(lapse.count, 50), due: result?.due ?? 0 });
    else if (result) review.push({ target: { wordId: word.id, reason: 'practice' }, priority: result.result === 'independent' ? 100 : 200, due });
    else if (word.ankiReviews) review.push({ target: { wordId: word.id, reason: 'review' }, priority: 50, due: 0 });
    else fresh.push({ wordId: word.id, reason: 'new' });
  }
  const limit = budgets[minutes];
  const ranked = review.sort((a, b) => b.priority - a.priority || a.due - b.due).slice(0, limit).map(entry => entry.target);
  return [...ranked, ...fresh.slice(0, ranked.length ? Math.min(2, limit - ranked.length) : limit)];
}

export function createLearningSession(language: string, targets: LearningTarget[], minutes: Budget, now: number): LearningSession {
  return { id: `${language}:${now}`, language, date: localDay(now), minutes, targets, queue: targets.map(({ wordId }) => ({ wordId })), cursor: 0, phase: 'recall', answers: {}, revisits: {} };
}

export function matchesRecall(answer: string, expected: string, language: string) {
  const clean = (text: string) => normalize(text, language).replace(/[’‘]/gu, "'").replace(/[.!?。！？]+$/gu, '').replace(/\s+/gu, ' ');
  return clean(answer) === clean(expected);
}

export function recordRecall(session: LearningSession, outcome: Outcome): LearningSession {
  return session.phase !== 'recall' || !session.queue[session.cursor] ? session : { ...session, phase: 'use', recall: session.recallAttempt?.result ?? outcome };
}

export function checkLearningRecall(study: Study, sessionId: string, cursor: number, answer: string, reveal: boolean): Study {
  const session = study.learningSessions?.[study.language];
  if (!session || session.id !== sessionId || session.cursor !== cursor || session.phase !== 'recall' || session.recallAttempt) return study;
  const word = study.words.find(word => word.id === session.queue[cursor]?.wordId && word.language === study.language);
  if (!word || (!reveal && !answer.trim())) return study;
  const result = reveal ? 'assisted' : matchesRecall(answer, word.title, word.language) ? 'independent' : 'retry';
  return { ...study, learningSessions: { ...study.learningSessions, [study.language]: { ...session, recallAttempt: { answer, result } } } };
}

export function saveApplicationDraft(study: Study, sessionId: string, cursor: number, draft: ApplicationDraft): Study {
  const session = study.learningSessions?.[study.language];
  if (!session || session.id !== sessionId || session.cursor !== cursor || session.phase !== 'use') return study;
  const previous = session.applicationDraft;
  const hint = draft.hint || !!previous?.hint || !!(previous?.compared && (previous.text !== draft.text || previous.mode !== draft.mode));
  return { ...study, learningSessions: { ...study.learningSessions, [study.language]: { ...session, applicationDraft: { ...draft, hint } } } };
}

export function currentLearningSession(study: Study, now: number) {
  const stored = study.learningSessions?.[study.language];
  const today = localDay(now);
  return stored && (stored.date === today || stored.cursor < stored.queue.length || (stored.completedAt && localDay(stored.completedAt) === today)) ? stored : undefined;
}

/** Cursor is an idempotency key so double taps cannot score the next word. */
export function completeLearningStep(study: Study, sessionId: string, cursor: number, application: Outcome, mode: ApplicationMode, now: number): Study {
  const session = study.learningSessions?.[study.language];
  const step = session?.queue[cursor];
  if (!session || session.id !== sessionId || session.cursor !== cursor || session.language !== study.language || session.phase !== 'use' || !session.recall || !step) return study;
  const wordExists = study.words.some(word => word.id === step.wordId && word.language === session.language);
  if (!wordExists) return skipMissingStep(study, sessionId, cursor, now);
  if (application === 'independent' && session.applicationDraft?.hint) application = 'assisted';
  const answer = { recall: session.recall, application, mode };
  const weak = answer.recall !== 'independent' || answer.application !== 'independent';
  const queue = !step.revisit && weak ? [...session.queue, { wordId: step.wordId, revisit: true }] : session.queue;
  let next = assess(assess(study, step.wordId, answer.recall, now, 'written'), step.wordId, application, now, mode);
  // An immediate successful revisit is not evidence of retention on a later day.
  if (weak || step.revisit) {
    const result = next.results[step.wordId];
    const schedules = Object.fromEntries(Object.entries(result.schedules ?? {}).map(([key, value]) =>
      [key, key === 'written' || key === mode ? { ...value, level: 0, due: Math.min(value.due, now + 86_400_000) } : value]));
    next = { ...next, results: { ...next.results, [step.wordId]: { ...result, level: 0, schedules, due: Math.min(...Object.values(schedules).map(value => value.due)) } } };
  }
  const updated: LearningSession = { ...session, queue, cursor: cursor + 1, phase: 'recall', recall: undefined, mode,
    recallAttempt: undefined, applicationDraft: undefined, completedAt: cursor + 1 >= queue.length ? now : undefined,
    answers: step.revisit ? session.answers : { ...session.answers, [step.wordId]: answer },
    revisits: step.revisit ? { ...session.revisits, [step.wordId]: answer } : session.revisits };
  return { ...next, learningSessions: { ...next.learningSessions, [study.language]: updated } };
}

export function skipMissingStep(study: Study, sessionId: string, cursor: number, now = Date.now()): Study {
  const session = study.learningSessions?.[study.language];
  if (!session || session.id !== sessionId || session.cursor !== cursor) return study;
  return { ...study, learningSessions: { ...study.learningSessions, [study.language]: { ...session, cursor: cursor + 1, phase: 'recall', recall: undefined, recallAttempt: undefined, applicationDraft: undefined, completedAt: cursor + 1 >= session.queue.length ? now : undefined } } };
}

export function practiceWeek(study: Study, now: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 6 + index);
    const key = localDay(date.getTime());
    const modes = study.practiceDays?.[study.language]?.[key];
    const count = (value?: { independent: number; assisted: number; retry: number }) => value ? value.independent + value.assisted + value.retry : 0;
    return { date: key, label: new Intl.DateTimeFormat('ru', { weekday: 'short' }).format(date),
      total: Object.values(modes ?? {}).reduce((sum, value) => sum + count(value), 0), spoken: count(modes?.spoken), independent: modes?.spoken?.independent ?? 0 };
  });
}
