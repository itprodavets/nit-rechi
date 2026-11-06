import { createContext, useContext } from 'react';
import type { itemsForLanguage, Page, Study } from './domain/model';

export interface Workspace {
  study: Study;
  active: ReturnType<typeof itemsForLanguage>;
  notify: (text: string) => void;
  update: (change: (study: Study) => Study) => Promise<boolean>;
  go: (page: Page) => void;
  practice: (id: string) => void;
  openTopic: (id: string) => void;
  openResource: (id: string) => void;
  practiceId?: string;
  topicId?: string;
  resourceId?: string;
}

export const StudyContext = createContext<Workspace | undefined>(undefined);
export function useWorkspace() {
  const context = useContext(StudyContext);
  if (!context) throw new Error('Workspace context unavailable');
  return context;
}
