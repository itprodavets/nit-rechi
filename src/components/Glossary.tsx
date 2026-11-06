import { useId, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import { normalize } from '../domain/model';

export type Glossary = ReadonlyMap<string, string>;

export function GlossaryText({ text, language, glossary, className = 'source-text' }: {
  text: string; language: string; glossary?: Glossary; className?: string;
}) {
  const id = useId();
  const [hint, setHint] = useState<{ index: number; meaning: string; x: number; y: number; above: boolean; pinned: boolean }>();
  function show(event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>, index: number, meaning: string, pinned = false) {
    const rect = event.currentTarget.getBoundingClientRect();
    const margin = Math.min(150, window.innerWidth / 2);
    const x = Math.max(margin, Math.min(window.innerWidth - margin, (rect.left + rect.right) / 2));
    const above = rect.bottom > window.innerHeight / 2;
    setHint(current => pinned && current?.index === index && current.pinned ? undefined
      : { index, meaning, x, y: above ? window.innerHeight - rect.top + 8 : rect.bottom + 8, above, pinned });
  }

  if (!glossary?.size) return <p className={className} lang={language}>{text}</p>;
  const parts = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(language, { granularity: 'word' }).segment(text), part => part.segment)
    : text.split(/([\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*)/u);
  const tokens: { value: string; meaning?: string }[] = [];
  for (let index = 0; index < parts.length;) {
    let value = parts[index];
    let meaning: string | undefined;
    let length = 1;
    if (/\p{L}/u.test(value)) {
      for (let count = 1; count <= 7 && index + count <= parts.length; count++) {
        const phrase = parts.slice(index, index + count).join('');
        if (!/\p{L}$/u.test(phrase)) continue;
        const match = glossary.get(normalize(phrase, language));
        if (match) { value = phrase; meaning = match; length = count; }
      }
    }
    tokens.push({ value, meaning });
    index += length;
  }
  return <p className={className} lang={language}>
    {tokens.map(({ value, meaning }, index) => meaning ? <button type="button" key={index} className="glossary-word"
      aria-describedby={hint?.index === index ? id : undefined}
      onMouseEnter={event => show(event, index, meaning)}
      onMouseLeave={() => setHint(current => current?.pinned ? current : undefined)}
      onFocus={event => show(event, index, meaning)} onBlur={() => setHint(undefined)}
      onClick={event => show(event, index, meaning, true)}
      onKeyDown={event => { if (event.key === 'Escape') setHint(undefined); }}>{value}</button> : value)}
    {hint && <span id={id} role="tooltip" className="glossary-hint" lang="ru"
      style={{ left: hint.x, [hint.above ? 'bottom' : 'top']: hint.y }}>{hint.meaning}</span>}
  </p>;
}
