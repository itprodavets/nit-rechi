import type { Resource } from '../domain/model';
import { Fold, SourceText } from './common';

export function StoryVersions({ story, language }: { story: NonNullable<Resource['story']>; language: string }) {
  return <div className="story-versions">
    {story.situation && <p className="sub">Ситуация: {story.situation}</p>}
    {story.original && <Fold title="Моя первая попытка — как получилось"><SourceText text={story.original} language={language} /></Fold>}
    {story.corrected && <Fold title="Исправленная версия"><SourceText text={story.corrected} language={language} /></Fold>}
    {story.notes && <Fold title="Что я исправил и почему"><p className="source-text">{story.notes}</p></Fold>}
  </div>;
}
