import { assess, upsert } from './model.ts';
import type { Outcome, PracticeItem, Study, Topic, Word } from './model.ts';

export const storyTextLimit = 40_000;
export type StoryDraft = {
  situation: string; text: string; original?: string; corrected: string; notes: string;
  mode: 'written' | 'spoken'; performed: boolean; hint: boolean;
};
export type StorySession = {
  id: string; topicId: string; language: string; title: string; wordIds: string[];
  startedAt: number; completedAt?: number; draft: StoryDraft; outcome?: Outcome;
};

export function storyWords(study: Study, session: StorySession): Word[] {
  const ids = new Set(session.wordIds);
  return study.words.filter(word => word.language === session.language && ids.has(word.id));
}

export function beginStory(study: Study, topic: Topic, ids: string[], situation: string, now: number): Study {
  if (study.language !== topic.language) return study;
  const available = new Set(study.words.filter(word => word.language === study.language).map(word => word.id));
  const wordIds = [...new Set(ids)].filter(id => available.has(id)).slice(0, 12);
  const previous = study.storySessions?.[topic.id];
  const existing = study.topics.find(entry => entry.id === topic.id && entry.language === topic.language) ?? topic;
  const session: StorySession = previous && !previous.completedAt ? { ...previous, wordIds,
    draft: { ...previous.draft, situation: situation.trim().slice(0, 4000) } } : {
    id: crypto.randomUUID(), topicId: topic.id, title: existing.title, language: topic.language, wordIds, startedAt: now,
    draft: { situation: situation.trim().slice(0, 4000), text: '', corrected: '', notes: '', mode: 'written', performed: false, hint: false }
  };
  return { ...study, topics: upsert(study.topics, { ...existing, links: [...new Set([...existing.links, ...wordIds])] }),
    storySessions: { ...study.storySessions, [topic.id]: session } };
}

export function saveStoryDraft(study: Study, topicId: string, sessionId: string, draft: StoryDraft): Study {
  const session = study.storySessions?.[topicId];
  if (!session || session.id !== sessionId || session.completedAt) return study;
  // The first attempt becomes immutable when the learner opens the correction stage.
  const original = session.draft.original ?? draft.original?.slice(0, storyTextLimit);
  const next = { ...draft, situation: draft.situation.slice(0, 4000), text: original ?? draft.text.slice(0, storyTextLimit), original,
    corrected: draft.corrected.slice(0, storyTextLimit), notes: draft.notes.slice(0, 12000), hint: session.draft.hint || draft.hint };
  return { ...study, storySessions: { ...study.storySessions, [topicId]: { ...session, draft: next } } };
}

export function finishStory(study: Study, topicId: string, sessionId: string, outcome: Outcome, ratings: Record<string, Outcome>, now: number): Study {
  const session = study.storySessions?.[topicId];
  if (!session || session.id !== sessionId || session.language !== study.language || session.completedAt) return study;
  const original = session.draft.original ?? session.draft.text;
  if (session.draft.mode === 'spoken' ? !session.draft.performed : !original.trim()) return study;
  const helped = session.draft.hint || !!session.draft.corrected.trim();
  const cap = (value: Outcome) => helped && value === 'independent' ? 'assisted' : value;
  let next = assess(study, topicId, cap(outcome), now, session.draft.mode);
  for (const word of storyWords(study, session)) {
    const value = ratings[word.id];
    if (['retry', 'assisted', 'independent'].includes(value)) next = assess(next, word.id, cap(value), now, session.draft.mode);
  }
  return { ...next, resources: upsert(next.resources, {
    id: 'story:' + session.id, language: session.language, topicId, kind: 'reading', title: session.title + ' · моя история',
    text: session.draft.corrected.trim() || original.trim() || 'Устный рассказ: ' + (session.draft.situation || session.title),
    prompt: 'Расскажи эту историю ещё раз своими словами. Вспомни детали, свои действия и чем всё закончилось.', answer: '', url: '',
    story: { original, corrected: session.draft.corrected, notes: session.draft.notes, situation: session.draft.situation }
  }), storySessions: { ...next.storySessions, [topicId]: { ...session, draft: { ...session.draft, original }, outcome: cap(outcome), completedAt: now } } };
}

export function storyCorrectionPrompt(session: StorySession, words: Word[]) {
  return `Помоги мне улучшить МОЙ рассказ на языке ${session.language} по теме «${session.title}».\n` +
    'Я рассказываю о конкретной ситуации, а не заказываю готовую историю. Сохрани мои события, намерения и голос. Не придумывай факты и не сокращай рассказ до пары предложений. Если смысл непонятен, сначала задай уточняющий вопрос.\n' +
    'Дай: 1) исправленную версию близко к моему тексту; 2) объяснения важных исправлений по-русски в формате «было → стало → почему»; 3) вопросы, которые помогут мне вспомнить и добавить реальные детали; 4) полезные связки для пересказа. Не оценивай произношение по тексту.\n' +
    'Не вставляй все учебные слова насильно. Предложи, где они естественно подходят. Верни исправленный рассказ и объяснения отдельными блоками: я вставлю их в приложение.\n\n' +
    JSON.stringify({ situation: session.draft.situation, firstAttempt: session.draft.original ?? session.draft.text,
      usefulWords: words.map(word => ({ title: word.title, meaning: word.meaning })) }, null, 2);
}

export const practiceRecordingId = (item: PracticeItem) => 'story' in item && item.story ? 'retelling:' + item.id : item.id;
export const revealStoryHint = (draft: StoryDraft): StoryDraft => ({ ...draft, hint: true });
