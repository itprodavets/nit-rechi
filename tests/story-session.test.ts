import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Study, Topic } from '../src/domain/model.ts';
import { beginStory, saveStoryDraft, finishStory, storyCorrectionPrompt } from '../src/domain/story-session.ts';

const topic: Topic = { id: 'cafe', language: 'en', title: 'At a café', prompt: '', links: [] };
const study = (): Study => ({ language: 'en', languages: { en: {}, es: {} }, words: [], topics: [], resources: [], results: {} });
const now = new Date(2026, 10, 7, 12).getTime();

test('stories can start without vocabulary and keep separate drafts for different topics', () => {
  const first = beginStory(study(), topic, [], 'I got the wrong order', now);
  const second = beginStory(first, { ...topic, id: 'home', title: 'At home' }, [], '', now);
  assert.equal(Object.keys(second.storySessions!).length, 2);
  assert.equal(second.storySessions!.cafe.draft.situation, 'I got the wrong order');
  assert.equal(second.dialogueSessions, first.dialogueSessions);
});

test('first attempt is preserved through corrections, reload and stale/language-switched saves', () => {
  const first = beginStory(study(), topic, [], '', now);
  const session = first.storySessions!.cafe;
  const frozen = saveStoryDraft(first, topic.id, session.id, { ...session.draft, text: 'Yesterday I go cafe.', original: 'Yesterday I go cafe.' });
  const corrected = saveStoryDraft({ ...frozen, language: 'es' }, topic.id, session.id, { ...frozen.storySessions!.cafe.draft, text: 'replaced', original: 'replaced', corrected: 'Yesterday I went to a café.', notes: 'go → went: past event' });
  const loaded: Study = JSON.parse(JSON.stringify(corrected));
  assert.equal(loaded.language, 'es');
  assert.equal(loaded.storySessions!.cafe.draft.original, 'Yesterday I go cafe.');
  assert.equal(loaded.storySessions!.cafe.draft.text, 'Yesterday I go cafe.');
  assert.equal(saveStoryDraft(loaded, topic.id, 'stale', session.draft), loaded);
  assert.equal(finishStory(loaded, topic.id, session.id, 'independent', {}, now), loaded);
});

test('completion preserves both versions in a material and does not claim independent work after correction', () => {
  const first = beginStory(study(), topic, [], '', now);
  const session = first.storySessions!.cafe;
  const revised = saveStoryDraft(first, topic.id, session.id, { ...session.draft, text: 'I go cafe.', original: 'I go cafe.', corrected: 'I went to a café.', notes: 'past tense' });
  const done = finishStory(revised, topic.id, session.id, 'independent', {}, now);
  assert.equal(done.results.cafe.result, 'assisted');
  assert.equal(done.resources[0].story!.original, 'I go cafe.');
  assert.equal(done.resources[0].text, 'I went to a café.');
  assert.equal(finishStory(done, topic.id, session.id, 'independent', {}, now), done);
  const next = beginStory(done, topic, [], 'Another visit', now + 1);
  assert.equal(next.resources.length, 1);
  assert.notEqual(next.storySessions!.cafe.id, session.id);
});

test('empty written attempts cannot score; spoken completion requires explicit performance', () => {
  const first = beginStory(study(), topic, [], '', now);
  const session = first.storySessions!.cafe;
  assert.equal(finishStory(first, topic.id, session.id, 'retry', {}, now), first);
  const spoken = saveStoryDraft(first, topic.id, session.id, { ...session.draft, mode: 'spoken', performed: true });
  assert.equal(finishStory(spoken, topic.id, session.id, 'retry', {}, now).results.cafe.mode, 'spoken');
});

test('the correction task includes the actual imperfect attempt and selected vocabulary', () => {
  const first = beginStory(study(), topic, [], 'wrong order', now);
  const session = first.storySessions!.cafe;
  const prompt = storyCorrectionPrompt({ ...session, draft: { ...session.draft, text: 'I buy coffee yesterday.' } }, []);
  assert.ok(prompt.includes('I buy coffee yesterday.'));
  assert.ok(prompt.includes('wrong order'));
  assert.ok(prompt.includes('Не придумывай факты'));
});

test('rates only selected, explicitly assessed words and never foreign-language words', () => {
  const words = ['one','two','three'].map(id => ({id,language:'en',title:id,meaning:'',example:''}));
  words.push({id:'foreign',language:'es',title:'uno',meaning:'',example:''});
  const start = beginStory({...study(),words},topic,['one','two','foreign'],'',now);
  const session = start.storySessions!.cafe;
  const written = saveStoryDraft(start,topic.id,session.id,{...session.draft,text:'My whole story',hint:true});
  const done = finishStory(written,topic.id,session.id,'independent',{one:'independent',three:'independent',foreign:'independent'},now);
  assert.equal(done.results.one.result,'assisted'); assert.equal(done.results.two,undefined);
  assert.equal(done.results.three,undefined); assert.equal(done.results.foreign,undefined);
});

test('retelling a saved story cannot overwrite its original recording', async () => {
  const { practiceRecordingId } = await import('../src/domain/story-session.ts');
  const first=beginStory(study(),topic,[],'',now); const s=first.storySessions!.cafe;
  const done=finishStory(saveStoryDraft(first,topic.id,s.id,{...s.draft,mode:'spoken',performed:true}),topic.id,s.id,'retry',{},now);
  const resource=done.resources[0];
  const recordings = new Map([[resource.id,'original voice']]);
  recordings.set(practiceRecordingId(resource),'new retelling');
  recordings.delete(practiceRecordingId(resource));
  assert.equal(recordings.get(resource.id),'original voice');
  assert.equal(practiceRecordingId({id:'word',language:'en',title:'word',meaning:'',example:''}),'word');
});

test('revealing a hint transforms the latest draft without rolling back writing', async () => {
  const { revealStoryHint } = await import('../src/domain/story-session.ts');
  const first=beginStory(study(),topic,[],'',now).storySessions!.cafe.draft;
  // React queues this updater; it must use the state at application time, not a captured snapshot.
  const pendingHint = revealStoryHint;
  const newer={...first,text:'I continued my story.',corrected:'More details',notes:'My latest note'};
  const next=pendingHint(newer);
  assert.equal(next.text,newer.text);assert.equal(next.corrected,newer.corrected);assert.equal(next.notes,newer.notes);assert.equal(next.hint,true);
});
