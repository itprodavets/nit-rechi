import { useState } from 'react';
import { useWorkspace } from '../context';
import { upsert } from '../domain/model';
import { englishLessons, englishReadingSource, levels } from '../domain/starter-materials';
import type { Level } from '../domain/starter-materials';
import { Fold, SourceText } from './common';

export function StarterMaterials() {
  const { study, update, practice } = useWorkspace();
  const [level, chooseLevel] = useState<Level>('A1');
  if (study.language !== 'en') return <p className="sub">Готовые тексты с русским переводом доступны в английском разделе. Для этого языка можно добавить свои материалы ниже.</p>;
  const { resource, glossary } = englishLessons[level];
  const source = englishReadingSource(level);
  return <section className="starter-library" aria-labelledby="starter-library-title">
    <h2 id="starter-library-title">Стартовые материалы</h2>
    <p className="sub">Читай, слушай и открывай перевод фраз с пунктирным подчёркиванием.</p>
    <div className="level-tabs" role="group" aria-label="Уровень материала">
      {levels.map(value => <button type="button" key={value} aria-pressed={value === level} onClick={() => chooseLevel(value)}>{value}</button>)}
    </div>
    <article className="resource starter-lesson" key={level}>
      <p className="kicker">{level} · Английский → русский</p>
      <h3 lang={resource.language}>{resource.title}</h3>
      <SourceText text={resource.text} language={resource.language} glossary={glossary} />
      <Fold title="Перевод на русский"><p className="source-text" lang="ru">{resource.translation}</p></Fold>
      <div className="actions">
        <button type="button" className="primary" onClick={() => {
          if (update(current => current.resources.some(entry => entry.id === resource.id)
            ? current : { ...current, resources: upsert(current.resources, resource) })) practice(resource.id);
        }}>В практику</button>
        <a className="resource-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
      </div>
    </article>
  </section>;
}
