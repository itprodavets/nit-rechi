import { assess, upsert } from './model.ts';
import type { Outcome, Study, Topic } from './model.ts';

export const reviewPeriods = { today: 'Сегодня', yesterday: 'Вчера', week: 'За неделю' } as const;
export type ReviewPeriod = keyof typeof reviewPeriods;
export type DialogueDraft = { lines: string[]; mode: 'spoken' | 'written'; hint: boolean; performed: boolean };
export type DialogueSession = {
  id: string; language: string; topicId: string; title: string; prompt: string; wordIds: string[];
  startedAt: number; completedAt?: number; draft: DialogueDraft; outcomes?: Record<string, Outcome>;
};

export function reviewPeriodRange(period: ReviewPeriod, now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (period === 'yesterday') start.setDate(start.getDate() - 1);
  else { end.setDate(end.getDate() + 1); if (period === 'week') start.setDate(start.getDate() - 6); }
  return { start: start.getTime(), end: end.getTime() };
}

export function dialogueWords(study: Study, session: DialogueSession) {
  const words = new Map(study.words.filter(word => word.language === session.language).map(word => [word.id, word]));
  return session.wordIds.flatMap(id => words.has(id) ? [words.get(id)!] : []);
}

export function beginDialogue(study: Study, topic: Topic, ids: string[], now: number, editingId?: string): Study {
  const previous = study.dialogueSessions?.[study.language];
  if (topic.language !== study.language || (editingId && (previous?.id !== editingId || previous.completedAt)) ||
    (previous && !previous.completedAt && previous.id !== editingId)) return study;
  const available = new Set(study.words.filter(word => word.language === study.language).map(word => word.id));
  const wordIds = [...new Set(ids)].filter(id => available.has(id)).slice(0, 12);
  if (!wordIds.length) return study;
  const existing = study.topics.find(entry => entry.id === topic.id && entry.language === study.language) ?? topic;
  const session: DialogueSession = { id: editingId ?? crypto.randomUUID(), language: study.language, topicId: existing.id,
    title: existing.title, prompt: existing.prompt, wordIds, startedAt: now,
    draft: editingId && previous ? previous.draft : { lines: ['', '', '', '', '', ''], mode: 'spoken', hint: false, performed: false } };
  return { ...study, topics: upsert(study.topics, { ...existing, links: [...new Set([...existing.links, ...wordIds])] }),
    dialogueSessions: { ...study.dialogueSessions, [study.language]: session } };
}

export function saveDialogueDraft(study: Study, id: string, draft: DialogueDraft, language = study.language): Study {
  const session = study.dialogueSessions?.[language];
  if (!session || session.id !== id || session.completedAt) return study;
  return { ...study, dialogueSessions: { ...study.dialogueSessions, [language]: { ...session,
    draft: { ...draft, lines: draft.lines.slice(0, 12).map(line => line.slice(0, 2000)), hint: session.draft.hint || draft.hint } } } };
}

export function finishDialogue(study: Study, id: string, ratings: Record<string, Outcome>, now: number): Study {
  const session = study.dialogueSessions?.[study.language];
  if (!session || session.id !== id || session.completedAt) return study;
  const answered = session.draft.mode === 'spoken' ? session.draft.performed : session.draft.lines.some((line, i) => i % 2 === 1 && line.trim());
  if (!answered) return study;
  let next = study;
  const outcomes: Record<string, Outcome> = {};
  for (const word of dialogueWords(study, session)) {
    const rating = ratings[word.id];
    if (!['retry', 'assisted', 'independent'].includes(rating)) continue;
    const outcome = session.draft.hint && rating === 'independent' ? 'assisted' : rating;
    outcomes[word.id] = outcome;
    next = assess(next, word.id, outcome, now, session.draft.mode);
  }
  const text = session.draft.lines.flatMap((line, i) => line.trim() ? [(i % 2 ? 'B: ' : 'A: ') + line.trim()] : []).join('\n');
  const resources = session.draft.mode === 'written' && text ? upsert(next.resources, {
    id: 'dialogue:' + session.id, language: session.language, title: session.title + ' · мой диалог',
    kind: 'dialogue' as const, text, prompt: session.prompt, answer: '', url: '',
    topicId: next.topics.some(topic => topic.id === session.topicId) ? session.topicId : undefined
  }) : next.resources;
  return { ...next, resources, dialogueSessions: { ...next.dialogueSessions, [study.language]: { ...session, outcomes, completedAt: now } } };
}

export function toggleDialogueWord(selection: string[], id: string, available: ReadonlySet<string>) {
  const valid = selection.filter(value => available.has(value));
  return valid.includes(id) ? valid.filter(value => value !== id) : available.has(id) && valid.length < 12 ? [...valid, id] : valid;
}
