import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, localDay } from '../src/domain/model.ts';
import type { Study, Word } from '../src/domain/model.ts';
import { selectLearningTargets, createLearningSession, recordRecall, completeLearningStep, matchesRecall, practiceWeek, currentLearningSession, checkLearningRecall, saveApplicationDraft } from '../src/domain/learning-session.ts';

const now = new Date(2026, 10, 7, 12).getTime();
const day = 86_400_000;
const word = (id: string, extra = {}): Word => ({ id, title: id, meaning: 'подсказка', example: '', language: 'en', ...extra });
const study = (words: Word[]): Study => ({ language: 'en', languages: { en: {}, zh: {} }, words, topics: [], resources: [], results: {} });

test('a 40k-word import yields a bounded session without requiring Anki history', () => {
  const data = study(Array.from({ length: 40_000 }, (_, i) => word(String(i))));
  for (const [minutes, count] of [[5, 3], [10, 5], [15, 8]] as const) {
    const selected = selectLearningTargets(data, new Map(), now, minutes);
    assert.equal(selected.length, count);
    assert.equal(new Set(selected.map(entry => entry.wordId)).size, count);
  }
  assert.equal(data.words.length, 40_000);
});

test('prioritizes recent lapses then due difficulties then imported reviews, excludes other languages and future due', () => {
  let data = study([word('new'), word('future'), word('review', { ankiReviews: 2 }), word('difficult'), word('lapse'), word('foreign', { language: 'zh' })]);
  data = assess(data, 'future', 'independent', now - 1000, 'spoken');
  data = assess(data, 'difficult', 'retry', now - day, 'spoken');
  const selected = selectLearningTargets(data, new Map([['lapse', { count: 3, last: now - 500 }]]), now, 10);
  assert.deepEqual(selected.map(entry => entry.wordId), ['lapse', 'difficult', 'review', 'new']);
});

test('adds no more than two new words when review words are available', () => {
  const data = study([word('review', { ankiReviews: 1 }), ...Array.from({ length: 10 }, (_, i) => word(String(i)))]);
  assert.equal(selectLearningTargets(data, new Map(), now, 15).length, 3);
});

test('stale Anki lapses do not override successful local practice; later lapses do', () => {
  const data = assess(study([word('agree')]), 'agree', 'independent', now - 1000, 'spoken');
  assert.equal(selectLearningTargets(data, new Map([['agree', { count: 4, last: now - 2000 }]]), now, 5).length, 0);
  assert.equal(selectLearningTargets(data, new Map([['agree', { count: 1, last: now - 500 }]]), now, 5).length, 1);
});

test('recognition does not postpone an overdue spoken task and same-day success does not inflate intervals', () => {
  let data = assess(study([word('agree')]), 'agree', 'retry', now - day, 'spoken');
  data = assess(data, 'agree', 'independent', now, 'written');
  data = assess(data, 'agree', 'independent', now + 1000, 'written');
  assert.equal(data.results.agree.schedules?.written?.level, 1);
  assert.ok(data.results.agree.due <= now);
  assert.equal(data.results.agree.spokenResult, 'retry');
  assert.equal(selectLearningTargets(data, new Map(), now + 2000, 5).length, 1);
});

test('persists recall/use transition and revisits a difficult word once after the initial set', () => {
  let data = study([word('agree'), word('reschedule')]);
  const session = createLearningSession('en', selectLearningTargets(data, new Map(), now, 5), 5, now);
  data.learningSessions = { en: recordRecall(session, 'assisted') };
  data = JSON.parse(JSON.stringify(data));
  data = completeLearningStep(data, session.id, 0, 'independent', 'spoken', now);
  assert.equal(data.learningSessions?.en.cursor, 1);
  assert.deepEqual(data.learningSessions?.en.queue, [{ wordId: 'agree' }, { wordId: 'reschedule' }, { wordId: 'agree', revisit: true }]);
  assert.equal(completeLearningStep(data, session.id, 0, 'independent', 'spoken', now), data);
  data.learningSessions!.en = recordRecall(data.learningSessions!.en, 'independent');
  data = completeLearningStep(data, session.id, 1, 'independent', 'written', now);
  data.learningSessions!.en = recordRecall(data.learningSessions!.en, 'independent');
  data = completeLearningStep(data, session.id, 2, 'independent', 'spoken', now + 2000);
  assert.equal(data.learningSessions?.en.cursor, 3);
  assert.equal(data.learningSessions?.en.queue.length, 3);
  assert.equal(data.learningSessions?.en.answers.agree.recall, 'assisted');
  assert.equal(data.learningSessions?.en.revisits.agree.recall, 'independent');
  assert.ok(data.results.agree.due <= now + day + 2000);
});

test('a changed language cannot score the old session', () => {
  const data = study([word('agree')]);
  const session = createLearningSession('en', [{ wordId: 'agree', reason: 'new' }], 5, now);
  data.learningSessions = { en: recordRecall(session, 'independent') };
  data.language = 'zh';
  assert.equal(completeLearningStep(data, session.id, 0, 'independent', 'spoken', now), data);
});

test('handles a removed word without creating an orphan result', () => {
  const data = study([]);
  const session = createLearningSession('en', [{ wordId: 'removed', reason: 'new' }], 5, now);
  data.learningSessions = { en: recordRecall(session, 'independent') };
  const result = completeLearningStep(data, session.id, 0, 'independent', 'spoken', now);
  assert.equal(result.learningSessions?.en.cursor, 1);
  assert.deepEqual(result.results, {});
});

test('matches exact word or phrase with case/punctuation normalization without accepting an unrelated sentence', () => {
  assert.ok(matchesRecall('  Agree! ', 'agree', 'en'));
  assert.ok(matchesRecall('你 好', '你 好', 'zh'));
  assert.ok(!matchesRecall('I agree', 'agree', 'en'));
  assert.ok(!matchesRecall('agreement', 'agree', 'en'));
});

test('weekly facts are scoped to the selected language and keep speaking separate', () => {
  let data = assess(study([word('agree')]), 'agree', 'independent', now, 'written');
  data = assess(data, 'agree', 'assisted', now, 'spoken');
  const week = practiceWeek(data, now);
  assert.equal(week.length, 7);
  assert.equal(week.at(-1)?.date, localDay(now));
  assert.deepEqual([week.at(-1)?.total, week.at(-1)?.spoken, week.at(-1)?.independent], [2, 1, 0]);
  data.language = 'zh';
  assert.equal(practiceWeek(data, now).reduce((sum, item) => sum + item.total, 0), 0);
});

test('an obsolete choice failure does not override future written and spoken schedules in daily selection', () => {
  let data = assess(study([word('agree')]), 'agree', 'retry', now - day, 'choice');
  data = assess(data, 'agree', 'independent', now - day, 'written');
  data = assess(data, 'agree', 'independent', now - day, 'spoken');
  data = assess(data, 'agree', 'independent', now, 'written');
  data = assess(data, 'agree', 'independent', now, 'spoken');
  assert.equal(selectLearningTargets(data, new Map(), now + day, 5).length, 0);
});

test('a weak written-only lesson does not reset the existing spoken interval', () => {
  let data = assess(study([word('agree')]), 'agree', 'independent', now - 2 * day, 'spoken');
  data = assess(data, 'agree', 'independent', now - day, 'spoken');
  const before = data.results.agree.schedules!.spoken;
  const session = createLearningSession('en', [{ wordId: 'agree', reason: 'review' }], 5, now);
  data.learningSessions = { en: recordRecall(session, 'retry') };
  data = completeLearningStep(data, session.id, 0, 'independent', 'written', now);
  assert.deepEqual(data.results.agree.schedules!.spoken, before);
});

test('a resumed lesson records its actual completion day', () => {
  const data = study([word('agree')]);
  const session = createLearningSession('en', [{ wordId: 'agree', reason: 'new' }], 5, now - day);
  data.learningSessions = { en: recordRecall(session, 'independent') };
  const next = completeLearningStep(data, session.id, 0, 'independent', 'spoken', now);
  assert.equal(next.learningSessions!.en.completedAt, now);
  assert.equal(currentLearningSession(next, now)?.id, session.id);
  assert.equal(currentLearningSession(next, now + day), undefined);
});

test('revealed recall survives leaving and serialization and cannot become unassisted', () => {
  let data = study([word('agree')]);
  const session = createLearningSession('en', [{ wordId: 'agree', reason: 'new' }], 5, now);
  data.learningSessions = { en: session };
  data = checkLearningRecall(data, session.id, 0, '', true);
  data = JSON.parse(JSON.stringify(data));
  const attempted = checkLearningRecall(data, session.id, 0, 'agree', false);
  assert.equal(attempted, data);
  assert.equal(recordRecall(data.learningSessions!.en, 'independent').recall, 'assisted');
});

test('a viewed example stays assisted after reload and after a corrected draft', () => {
  let data = study([word('agree')]);
  const session = createLearningSession('en', [{ wordId: 'agree', reason: 'new' }], 5, now);
  data.learningSessions = { en: recordRecall(session, 'independent') };
  data = saveApplicationDraft(data, session.id, 0, { text: '', mode: 'written', compared: false, hint: true });
  data = JSON.parse(JSON.stringify(data));
  data = saveApplicationDraft(data, session.id, 0, { text: 'I agree with you.', mode: 'written', compared: true, hint: false });
  assert.equal(data.learningSessions!.en.applicationDraft?.hint, true);
  data = completeLearningStep(data, session.id, 0, 'independent', 'written', now);
  assert.equal(data.learningSessions!.en.answers.agree.application, 'assisted');
});
