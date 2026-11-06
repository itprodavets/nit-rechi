import { useMemo } from 'react';
import type { Word } from '../domain/model';
import { deckOptions } from '../domain/anki-decks';

export function DeckFilter({ words, value, onChange }: { words: Word[]; value: string; onChange: (value: string) => void }) {
  const options = useMemo(() => deckOptions(words), [words]);
  return <label>Колода / словарь<select value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Все колоды · {words.length.toLocaleString('ru')}</option>
    {options.map(option => <option key={option.value} value={option.value}>{option.label} · {option.count.toLocaleString('ru')}</option>)}
  </select>{value && <small className="deck-scope">{options.find(option => option.value === value)?.label}</small>}</label>;
}
