import { cleanField } from './text-import.js';
import { normalize, wordId } from './model';
import type { Study, Word } from './model';

export type Review = [at: number, card: number, rating: number, interval: number, duration: number];
export type Columns = [word: number, meaning: number, example: number];
export interface ArchiveNote { guid: string; typeId: string; deckIds: string[]; fields: string[]; html?: boolean; reviews: Review[] }
export interface Archive { notes: ArchiveNote[]; decks: Record<string, string>; types: Record<string, string[]> }

export const reviewKey = (language: string, guid: string) => JSON.stringify([language, guid]);

export function notesInDeck(archive: Archive, deck: string): ArchiveNote[] {
  if (!deck) return archive.notes;
  const prefix = archive.decks[deck] + '::';
  const ids = new Set(Object.entries(archive.decks).filter(([id, name]) => id === deck || name.startsWith(prefix)).map(([id]) => id));
  return archive.notes.filter(note => note.deckIds.some(id => ids.has(id)));
}

export function suggestColumns(names: string[], count: number): Columns {
  const eligible = Array.from({ length: count }, (_, index) => index).filter(index => {
    const name = (names[index] ?? '').toLowerCase().replaceAll('_', ' ').trim();
    return !/(?:^|\s)(?:audio|sound|image|img|picture|id|key|pinyin|transcription|ipa|ordinal)(?:\s|$|\d)/.test(name);
  });
  const lookup = (pattern: RegExp, excluded: number[]) =>
    eligible.find(index => !excluded.includes(index) && pattern.test(names[index]?.trim() ?? ''));
  const word = lookup(/^(word|expression|term|front|hanzi|simplified|traditional|汉字|單字|单词|lemma|vocab|text|english|слово|вопрос)$/i, [])
    ?? eligible[0] ?? 0;
  const example = lookup(/example|sentence|context|пример|例句/i, [word]) ?? (!names.length && count === 3 ? 2 : -1);
  const meaning = lookup(/back|meaning|translation|definition|^russian$|^answer$|перевод|значение|^ответ$|释义/i, [word, example])
    ?? (!names.length ? eligible.find(index => index !== word && index !== example) : undefined) ?? -1;
  return [word + 1, meaning + 1, example + 1];
}

export function archiveWords(notes: ArchiveNote[], language: string, columns: Columns) {
  return notes.flatMap(note => {
    const [title, meaning, example] = columns.map(column => column > 0 ? cleanField(note.fields[column - 1], note.html ?? true) : '');
    if (!title) return [];
    const id = note.guid ? JSON.stringify([language, 'guid', note.guid]) : wordId(language, title, meaning);
    const word: Word = { id, language, title, meaning, example, ankiGuid: note.guid || undefined, ankiReviews: note.reviews.length };
    return [{ word, reviews: note.reviews }];
  });
}

export function mergeImportedWords(study: Study, incoming: Word[]) {
  const byId = new Map(study.words.map(word => [word.id, word]));
  const ordinary = new Map<string, Word>();
  const byGuid = new Map<string, Word>();
  for (const word of study.words) {
    if (word.ankiGuid) byGuid.set(reviewKey(word.language, word.ankiGuid), word);
    else ordinary.set(wordId(word.language, word.title, word.meaning), word);
  }
  for (const word of incoming) {
    const match = word.ankiGuid ? byGuid.get(reviewKey(word.language, word.ankiGuid))
      ?? ordinary.get(wordId(word.language, word.title, word.meaning)) : undefined;
    const previous = match ?? byId.get(word.id);
    const merged = {
      ...previous, ...word, id: previous?.id ?? word.id,
      meaning: word.meaning || previous?.meaning || '',
      example: word.example || previous?.example || '',
      ankiGuid: word.ankiGuid ?? previous?.ankiGuid,
      ankiReviews: Math.max(previous?.ankiReviews ?? 0, word.ankiReviews ?? 0) || undefined
    };
    byId.set(merged.id, merged);
    if (word.ankiGuid) {
      byGuid.set(reviewKey(word.language, word.ankiGuid), merged);
      ordinary.delete(wordId(word.language, word.title, word.meaning));
    }
  }
  return { words: [...byId.values()], added: byId.size - study.words.length };
}
