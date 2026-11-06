import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveWords, mergeImportedWords } from '../src/domain/anki-model.ts';
import { deckOptions, matchesDeck } from '../src/domain/anki-decks.ts';
import { readAnkiText } from '../src/domain/text-import.js';
import type { Study } from '../src/domain/model.ts';
const empty: Study = { language:'en', languages:{en:{}}, words:[], topics:[], resources:[], results:{} };
const notes = ['a','b'].map((guid,i)=>({guid,typeId:'1',deckIds:[String(i+1)],fields:['bank',i?'river bank':'financial institution','example'],html:false,reviews:[]}));
const decks = {'1':'4000 words::Book 1','2':'4000 words second edition::Book 1'};
test('keeps distinct notes, definitions, decks and progress on reimport',()=>{
 const incoming=archiveWords(notes,()=> 'en',[1,2,3],decks).map(x=>x.word);
 const first=mergeImportedWords(empty,incoming);
 assert.equal(first.words.length,2);
 assert.deepEqual(first.words[0].ankiDecks,[{id:'1',name:decks['1']}]);
 const previous={...empty,words:first.words.map(w=>({...w,ownExamples:['Mine'],vocabularyLevel:'passive' as const})),results:{}};
 const updated=mergeImportedWords(previous,archiveWords(notes,()=> 'en',[1,2,3],{'1':'4000 renamed','2':decks['2']}).map(x=>x.word));
 assert.equal(updated.added,0); assert.equal(updated.words[0].id,first.words[0].id);
 assert.equal(updated.words[0].ankiDecks?.[0].name,'4000 renamed');
 assert.deepEqual(updated.words[0].ownExamples,['Mine']); assert.equal(updated.words[0].vocabularyLevel,'passive');
 assert.ok(matchesDeck(updated.words[0],'4000 renamed')); assert.ok(!matchesDeck(updated.words[1],'4000 renamed'));
});
test('deck hierarchy counts notes once and separates two editions',()=>{
 const words=archiveWords(notes,()=> 'en',[1,2,3],decks).map(x=>x.word);
 words[0].ankiDecks!.push({id:'3',name:'4000 words::Book 2'});
 assert.equal(deckOptions(words).find(x=>x.value==='4000 words')?.count,1);
 assert.equal(words.filter(w=>matchesDeck(w,'4000 words')).length,1);
 assert.equal(words.filter(w=>matchesDeck(w,'4000 words second edition')).length,1);
});
test('reimport enriches legacy GUID word without resetting personal data',()=>{
 const old={id:'old',language:'en',title:'bank',meaning:'financial institution',example:'',ankiGuid:'a',ownExamples:['My bank']};
 const result=mergeImportedWords({...empty,words:[old]},archiveWords([notes[0]],()=> 'en',[1,2,3],decks).map(x=>x.word));
 assert.equal(result.added,0); assert.equal(result.words[0].id,'old'); assert.equal(result.words[0].ankiDecks?.[0].id,'1');
 assert.deepEqual(result.words[0].ownExamples,['My bank']);
});
test('text export preserves deck column without mistaking it for vocabulary',()=>{
 const archive=readAnkiText('#separator:tab\n#deck column:2\n#guid column:1\n#columns:GUID\tDeck\tWord\tMeaning\na\t4000 words\tbank\tfinance\nb\t4000 v2\tbank\triver');
 const words=archiveWords(archive.notes,()=> 'en',[1,2,0],archive.decks).map(x=>x.word);
 assert.equal(words[0].title,'bank'); assert.equal(words[0].ankiDecks?.[0].name,'4000 words'); assert.notDeepEqual(words[0].ankiDecks,words[1].ankiDecks);
});
test('text notes without GUID remain distinct across decks even with identical spelling and meaning',()=>{
 const archive=readAnkiText('#separator:tab\n#deck column:1\n4000 words\tbank\tбанк\tI went to the bank.\n4000 v2\tbank\tбанк\tThe bank was closed.');
 const incoming=archiveWords(archive.notes,()=> 'en',[1,2,3],archive.decks).map(x=>x.word);
 const first=mergeImportedWords(empty,incoming);
 assert.equal(first.words.length,2);
 assert.equal(mergeImportedWords({...empty,words:first.words},incoming).added,0);
 assert.notEqual(first.words[0].example,first.words[1].example);
});
