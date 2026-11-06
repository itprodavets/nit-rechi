import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginDialogue, finishDialogue, saveDialogueDraft, dialogueWords, reviewPeriodRange, toggleDialogueWord } from '../src/domain/dialogue-session.ts';
import type { Study, Topic } from '../src/domain/model.ts';

const now = new Date(2026, 10, 7, 12).getTime();
const topic: Topic = { id: 'office', title: 'Я в офисе', prompt: 'Обсудите встречу', language: 'en', links: ['other'] };
const data = (): Study => ({ language: 'en', languages: { en: {}, zh: {} }, topics: [topic], resources: [], results: {},
  words: ['agree', 'reschedule', 'other'].map(id => ({ id, language: 'en', title: id, meaning: id, example: '' })) });

test('review periods use local calendar boundaries and exclusive next midnight', () => {
  const today = reviewPeriodRange('today', now);
  assert.equal(today.start, new Date(2026, 10, 7).getTime());
  assert.equal(today.end, new Date(2026, 10, 8).getTime());
  assert.deepEqual(reviewPeriodRange('yesterday', now), { start: new Date(2026, 10, 6).getTime(), end: today.start });
  assert.equal(reviewPeriodRange('week', now).start, new Date(2026, 10, 1).getTime());
});

test('dialogue freezes only selected existing words of this language and unions topic links', () => {
  const initial = data();
  initial.words.push({ ...initial.words[0], id: 'foreign', language: 'zh' });
  const next = beginDialogue(initial, topic, ['reschedule', 'agree', 'reschedule', 'deleted', 'foreign'], now);
  assert.deepEqual(next.dialogueSessions?.en.wordIds, ['reschedule', 'agree']);
  assert.deepEqual(dialogueWords(next, next.dialogueSessions!.en).map(w => w.id), ['reschedule', 'agree']);
  assert.deepEqual(next.topics[0].links, ['other', 'reschedule', 'agree']);
  assert.deepEqual(initial.topics[0].links, ['other']);
  assert.equal(next.learningSessions, initial.learningSessions);
});

test('empty selections and foreign topics cannot start; unfinished draft cannot be silently replaced', () => {
  const initial = data();
  assert.equal(beginDialogue(initial, topic, [], now), initial);
  assert.equal(beginDialogue(initial, { ...topic, language: 'zh' }, ['agree'], now), initial);
  const started = beginDialogue(initial, topic, ['agree'], now);
  assert.equal(beginDialogue(started, topic, ['reschedule'], now), started);
});

test('draft survives serialization, rejects stale/language-mismatched writes, and preserves used hints', () => {
  const started = beginDialogue(data(), topic, ['agree'], now);
  const session = started.dialogueSessions!.en;
  const edited = saveDialogueDraft(started, session.id, { ...session.draft, lines: ['Hello', 'I agree.'], mode: 'written', hint: true });
  const loaded: Study = JSON.parse(JSON.stringify(edited));
  assert.equal(loaded.dialogueSessions?.en.draft.lines[1], 'I agree.');
  assert.equal(saveDialogueDraft(loaded, 'stale', session.draft), loaded);
  assert.equal(saveDialogueDraft({ ...loaded, language: 'zh' }, session.id, session.draft).dialogueSessions, loaded.dialogueSessions);
  assert.equal(saveDialogueDraft(loaded, session.id, session.draft).dialogueSessions?.en.draft.hint, true);
});

test('completion scores only explicit selected words once, preserving other results', () => {
  const started = beginDialogue(data(), topic, ['agree', 'reschedule'], now);
  const session = started.dialogueSessions!.en;
  const edited = saveDialogueDraft(started, session.id, { ...session.draft, mode: 'written', lines: ['Hello', 'I agree.'] });
  const next = finishDialogue(edited, session.id, { agree: 'independent', other: 'independent' }, now);
  assert.deepEqual(Object.keys(next.results), ['agree']);
  assert.equal(next.results.agree.mode, 'written');
  assert.equal(next.dialogueSessions?.en.completedAt, now);
  assert.equal(finishDialogue(next, session.id, { agree: 'independent' }, now), next);
});

test('deleted words are not scored; hints cap independent outcomes; spoken and written remain separate', () => {
  const started = beginDialogue(data(), topic, ['agree', 'reschedule'], now);
  const session = started.dialogueSessions!.en;
  const edited = saveDialogueDraft(started, session.id, { ...session.draft, hint: true, performed: true });
  edited.words = edited.words.filter(word => word.id !== 'reschedule');
  const next = finishDialogue(edited, session.id, { agree: 'independent', reschedule: 'independent' }, now);
  assert.equal(next.results.agree.result, 'assisted');
  assert.equal(next.results.agree.mode, 'spoken');
  assert.equal(next.results.reschedule, undefined);
});

test('a blank dialogue cannot create a result', () => {
  const started = beginDialogue(data(), topic, ['agree'], now);
  assert.equal(finishDialogue(started, started.dialogueSessions!.en.id, { agree: 'independent' }, now), started);
});

test('editing an owned unfinished selection preserves its dialogue draft without widening to all topic words', () => {
  const started = beginDialogue(data(), topic, ['agree'], now);
  const session = started.dialogueSessions!.en;
  const edited = saveDialogueDraft(started, session.id, { ...session.draft, lines: ['', 'I agree.'] });
  const next = beginDialogue(edited, topic, ['reschedule'], now + 1, session.id);
  assert.deepEqual(next.dialogueSessions?.en.wordIds, ['reschedule']);
  assert.equal(next.dialogueSessions?.en.draft.lines[1], 'I agree.');
  assert.equal(next.dialogueSessions?.en.id, session.id);
  assert.equal(beginDialogue(edited, topic, ['reschedule'], now + 1, 'stale'), edited);
});

test('a pending autosave can target its original language without changing the active language', () => {
  const started = beginDialogue(data(), topic, ['agree'], now);
  const session = started.dialogueSessions!.en;
  const switched = { ...started, language: 'zh' };
  const saved = saveDialogueDraft(switched, session.id, { ...session.draft, mode: 'written' }, 'en');
  assert.equal(saved.language, 'zh');
  assert.equal(saved.dialogueSessions?.en.draft.mode, 'written');
  assert.equal(saved.dialogueSessions?.zh, undefined);
  assert.equal(saveDialogueDraft(switched, 'stale', session.draft, 'en'), switched);
});

test('finished written dialogues remain in topic materials when a new session starts', () => {
  const started = beginDialogue(data(), topic, ['agree'], now);
  const session = started.dialogueSessions!.en;
  const edited = saveDialogueDraft(started, session.id, { ...session.draft, mode: 'written', lines: ['Do you agree?', 'I agree.', '', ''] });
  const finished = finishDialogue(edited, session.id, {}, now);
  assert.equal(finished.resources[0].text, 'A: Do you agree?\nB: I agree.');
  assert.equal(finished.resources[0].topicId, topic.id);
  assert.deepEqual(finished.results, {});
  const next = beginDialogue(finished, topic, ['reschedule'], now + 1);
  assert.deepEqual(next.resources, finished.resources);
});

test('deleted selections cannot consume the twelve-word limit', () => {
  const deleted = Array.from({ length: 12 }, (_, i) => 'deleted:' + i);
  assert.deepEqual(toggleDialogueWord(deleted, 'agree', new Set(['agree'])), ['agree']);
  assert.deepEqual(toggleDialogueWord(['agree'], 'agree', new Set(['agree'])), []);
  const ids = Array.from({ length: 12 }, (_, i) => String(i));
  assert.deepEqual(toggleDialogueWord(ids, 'extra', new Set([...ids, 'extra'])), ids);
});
