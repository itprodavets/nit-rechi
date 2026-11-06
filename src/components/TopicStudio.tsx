import { useState } from 'react';
import { useWorkspace } from '../context';
import { DialogueSetup } from './DialogueSetup';
import { DialogueStudio } from './DialogueStudio';
import { StoryWorkspace } from './StoryWorkspace';

export function TopicStudio({ initialTopicId }: { initialTopicId?: string }) {
  const { study } = useWorkspace();
  const initial = initialTopicId && study.storySessions?.[initialTopicId];
  const [view, setView] = useState<'setup' | 'story' | 'dialogue'>(initial && !initial.completedAt ? 'story' : 'setup');
  const [topicId, setTopicId] = useState(initialTopicId);
  const sessions = Object.values(study.storySessions ?? {}).filter(session => session.language === study.language && !session.completedAt);
  const session = topicId ? study.storySessions?.[topicId] : undefined;
  function openStory(id: string) { setTopicId(id); setView('story'); }
  return <div className="topic-studio">
    {view !== 'setup' && <button type="button" className="back-to-today subtle" onClick={() => setView('setup')}>← Выбрать тему и формат</button>}
    {view === 'story' && session ? <StoryWorkspace key={session.id} session={session} next={() => setView('setup')} /> : view === 'dialogue' ? <DialogueStudio /> : <>
      {(sessions.length > 0 || study.dialogueSessions?.[study.language]) && <details className="saved-topic-sessions"><summary>Мои сохранённые занятия</summary><div className="actions">{sessions.map(session => <button type="button" key={session.id} onClick={() => openStory(session.topicId)}>Продолжить рассказ: {session.title}</button>)}{study.dialogueSessions?.[study.language] && <button type="button" onClick={() => setView('dialogue')}>Открыть сохранённый диалог</button>}</div></details>}
      <DialogueSetup initialTopicId={topicId} onStory={openStory} started={() => setView('dialogue')} />
    </>}
  </div>;
}
