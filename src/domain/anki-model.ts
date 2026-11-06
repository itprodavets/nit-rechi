import { cleanField } from './text-import.js';
import { normalize, wordId } from './model';
import type { Study, Word } from './model';

export type Review = [at: number, card: number, rating: number, interval: number, duration: number];
export type Columns = [word: number, meaning: number, example: number];
export interface ArchiveNote { guid: string; typeId: string; deckIds: string[]; fields: string[]; html?: boolean; reviews: Review[] }
export interface Archive { notes: ArchiveNote[]; decks: Record<string, string>; types: Record<string, string[]> }

export const reviewKey = (language: string, guid: string) => JSON.stringify([language, guid]);

export function notesInDeck(archive: Archive, deck: string): ArchiveNote[] {
  return deck ? archive.notes.filter(note => note.deckIds.includes(deck)) : archive.notes;
}

export function suggestColumns(names: string[], count: number): Columns {
  const lookup = (pattern: RegExp, excluded: number[]) =>
    names.findIndex((name, index) => !excluded.includes(index) && pattern.test(name));
  const target = lookup(/word|expression|term|front|汉字|單字|单词|lemma|vocab|^text$|^english$|^слово$/i, []);
  const word = target === -1 ? 0 : target;
  const translation = lookup(/back|meaning|translation|definition|^russian$|перевод|значение|释义/i, [word]);
  const meaning = translation === -1 ? (count > 1 ? [0, 1].find(index => index !== word)! : -1) : translation;
  const example = lookup(/example|sentence|context|пример|例句/i, [word, meaning]);
  return [word + 1, meaning + 1, example === -1 && !names.length && count === 3 ? 3 : example + 1];
}

const languageHints: Record<string, RegExp> = {
  en: /\b(english|английский|the|you|could|will|with|meeting|please)\b|английск/i,
  es: /\b(español|spanish|hola|gracias|usted|pero|quiero|buenos)\b|испанск/i,
  fr: /\b(french|français|bonjour|merci|vous|pour|avec|suis)\b|французск/i,
  de: /\b(german|deutsch|danke|bitte|ich|nicht|mit|guten)\b|немецк/i,
  pt: /\b(portuguese|português|obrigado|você|não|bom dia)\b|португальск/i,
  it: /\b(italian|italiano|grazie|buongiorno|voglio|siamo)\b|итальянск/i,
  zh: /\b(chinese|mandarin|hanzi)\b|中文|普通话|китайск/i,
  ja: /\b(japanese|nihongo|kanji)\b|日本語|японск/i,
  ko: /\b(korean)\b|한국어|корейск/i,
  ru: /\b(russian)\b|русский/i
};

export function suggestLanguage(samples: string[], hint = ''): string | undefined {
  const text = samples.slice(0, 80).join(' ').slice(0, 5000);
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Thai}/u.test(text)) return 'th';
  if (/\p{Script=Greek}/u.test(text)) return 'el';
  const named = Object.entries(languageHints).filter(([, pattern]) => pattern.test(hint)).map(([code]) => code);
  if (/\p{Script=Han}/u.test(text)) return named.includes('ja') ? 'ja' : 'zh';
  if (/\p{Script=Cyrillic}/u.test(text)) return /[іїєґ]/i.test(text) ? 'uk' : 'ru';
  if (named.length === 1) return named[0];
  const scores = Object.entries(languageHints)
    .map(([code, pattern]) => [code, samples.slice(0, 80).filter(sample => pattern.test(sample)).length] as const)
    .sort((a, b) => b[1] - a[1]);
  return scores[0][1] > scores[1][1] && scores[0][1] >= 2 ? scores[0][0] : undefined;
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
