import type { Word } from './model.ts';

export const unassignedDeck = '__unassigned__';
export function matchesDeck(word: Word, deck: string) {
  if (!deck) return true;
  if (deck === unassignedDeck) return !word.ankiDecks?.length;
  return word.ankiDecks?.some(entry => entry.name === deck || entry.name.startsWith(deck + '::')) ?? false;
}
export function deckOptions(words: Word[]) {
  const counts = new Map<string, number>();
  for (const word of words) {
    const paths = new Set<string>();
    for (const deck of word.ankiDecks ?? []) {
      const parts = deck.name.split('::');
      for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('::'));
    }
    if (!paths.size) paths.add(unassignedDeck);
    for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({ value, count,
    label: value === unassignedDeck ? 'Без колоды / мои слова' : value.replaceAll('::', ' › ') }));
}
export const wordDeckLabel = (word: Word) => word.ankiDecks?.map(deck => deck.name.replaceAll('::', ' › ')).join(' · ') ?? (word.ankiGuid ? 'Anki · колода не сохранена' : 'Мой словарь');
