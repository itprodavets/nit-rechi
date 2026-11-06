import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starterTopics, upgradeStarterTopics } from '../src/domain/starter-topics.ts';
import type { Study } from '../src/domain/model.ts';
const base: Study = {language:'en', languages:{en:{}}, words:[], resources:[], results:{}, topics:[]};
test('starter café has a multi-paragraph fictional narrative in all starter languages',()=>{
 for(const language of ['en','zh','es']) {
  const topic = starterTopics(language)[1];
  assert.ok(topic.materials![0].text.length > 200);
  assert.ok(topic.materials![0].format.includes('вымышленная'));
  assert.ok(topic.prompt.includes('случай') || topic.prompt.includes('кафе'));
 }
});
test('upgrades only exact legacy fields without disturbing topic edits or graph',()=>{
 const topic={...starterTopics('en')[1],prompt:'Закажи напиток и спроси, можно ли взять его с собой.',links:['myword'],position:{x:12,y:40},materials:[{format:'Пример ответа',text:'Could I have a coffee, please? Can I get it to go?'},{format:'My own',text:'My personal experience'}]};
 const custom={...topic,id:'custom'};
 const upgraded=upgradeStarterTopics({...base,topics:[topic,custom]});
 assert.notEqual(upgraded.topics[0].prompt,topic.prompt);
 assert.equal(upgraded.topics[0].materials![1],topic.materials[1]);
 assert.deepEqual(upgraded.topics[0].links,['myword']);assert.deepEqual(upgraded.topics[0].position,topic.position);
 assert.equal(upgraded.topics[1],custom);assert.equal(upgradeStarterTopics(upgraded),upgraded);
 const edited={...topic,prompt:'My prompt',materials:[{format:'Пример ответа',text:'Edited by me'}]};
 assert.equal(upgradeStarterTopics({...base,topics:[edited]}).topics[0],edited);
});
