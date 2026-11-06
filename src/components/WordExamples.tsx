import { useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspace } from '../context';
import type { Word } from '../domain/model';
import { wordExamples } from '../domain/vocabulary';
import { SourceText, VoiceButtons } from './common';

export function WordExamplesList({ word }: { word: Word }) {
  const examples = wordExamples(word);
  return examples.length ? <div className="word-examples">
    {examples.map(({ text, source }) => <div key={text}>
      <p className="kicker">{source}</p>
      <SourceText text={text} language={word.language} />
    </div>)}
  </div> : <><p className="sub">У этого слова пока нет примеров употребления.</p><VoiceButtons text={word.title} language={word.language} /></>;
}

export function WordExamples({ word }: { word: Word }) {
  const { update, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get('example')).normalize('NFC').trim();
    if (!value) return;
    let duplicate = false;
    const saved = update(current => {
      const entry = current.words.find(candidate => candidate.id === word.id);
      if (!entry) return current;
      if (wordExamples(entry).some(example => example.text.normalize('NFC').trim() === value)) {
        duplicate = true;
        return current;
      }
      return {
        ...current,
        words: current.words.map(candidate => candidate.id === word.id
          ? { ...candidate, ownExamples: [...(candidate.ownExamples ?? []), value] } : candidate)
      };
    });
    if (saved && duplicate) notify('Такой пример уже есть.');
    else if (saved) { form.reset(); notify('Пример сохранён.'); }
  }

  return <details className="fold word-context" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Контекст и примеры · {wordExamples(word).length}</summary>
    {open && <>
      <WordExamplesList word={word} />
      <form onSubmit={add}>
        <label>Добавить свой пример <textarea name="example" rows={2} maxLength={8000} required /></label>
        <button type="submit">Сохранить пример</button>
      </form>
    </>}
  </details>;
}
