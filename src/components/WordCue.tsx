import { normalize } from '../domain/model';
import type { Word } from '../domain/model';

function cueText(word: Word) {
  const meaning = word.meaning.trim();
  if (!meaning || new Intl.Locale(word.language).language !== 'en') return meaning;
  const definition = meaning.match(/^(.+?)\s+(is\s+to|means)\s+(.+)$/isu);
  if (!definition) return meaning;

  const headword = (value: string) => normalize(value, 'en').replace(/^to\s+/u, '');
  if (headword(definition[1]) !== headword(word.title)) return meaning;
  const clue = /^is\s+to$/iu.test(definition[2]) ? 'to ' + definition[3] : definition[3];
  return clue.charAt(0).toUpperCase() + clue.slice(1);
}

export function WordCue({ word }: { word: Word }) {
  const clue = cueText(word);
  const language = !clue || clue !== word.meaning.trim() ? word.language : undefined;
  return <div className="word-cue">
    <p className="kicker">{clue ? 'Подсказка' : 'Слово для ответа'}</p>
    <p className="source-text" lang={language}>{clue || word.title}</p>
  </div>;
}
