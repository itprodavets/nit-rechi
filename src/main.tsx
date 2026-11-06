import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './components/AppShell';
import { StudyContext } from './context';
import { itemsForLanguage, pages } from './domain/model';
import { readStudy, writeStudy } from './domain/study-storage';
import type { Page, Study } from './domain/model';
import { stopVoice } from './domain/voice.js';
import './styles.css';
import './shell.css';
import './learning.css';
import './dialogue.css';

const Today = lazy(() => import('./components/Today').then(module => ({ default: module.Today })));
const Practice = lazy(() => import('./components/Practice').then(module => ({ default: module.Practice })));
const Progress = lazy(() => import('./components/Progress').then(module => ({ default: module.Progress })));
const MapPage = lazy(() => import('./components/Map').then(module => ({ default: module.MapPage })));
const Materials = lazy(() => import('./components/Materials').then(module => ({ default: module.Materials })));
const Account = lazy(() => import('./components/Account').then(module => ({ default: module.Account })));

const screens = { today: Today, practice: Practice, map: MapPage, materials: Materials, progress: Progress, account: Account };
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
function route(): Page {
  const value = location.hash.slice(1);
  return Object.hasOwn(pages, value) ? value as Page : 'today';
}
function go(page: Page) {
  if (location.hash !== '#' + page) location.hash = page;
}

function App({ initial }: { initial: Study }) {
  const [study, setStudy] = useState(initial);
  const latest = useRef(study);
  const writes = useRef(Promise.resolve());
  const [notice, notify] = useState('');
  const [practiceId, setPractice] = useState<string>();
  const [topicId, setTopic] = useState<string>();
  const [resourceId, setResource] = useState<string>();
  const page = useSyncExternalStore(subscribe, route);
  const active = useMemo(() => itemsForLanguage(study), [study]);
  const Screen = screens[page];
  useEffect(() => {
    stopVoice();
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => notify(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    window.addEventListener('pagehide', stopVoice);
    return () => window.removeEventListener('pagehide', stopVoice);
  }, []);

  const update = useCallback((change: (current: Study) => Study) => {
    const pending = writes.current.then(async () => {
      const next = change(latest.current);
      if (next === latest.current) return true;
      try {
        await writeStudy(next);
        latest.current = next;
        setStudy(next);
        return true;
      } catch {
        notify('Не удалось сохранить изменения. Проверь доступное место в браузере.');
        return false;
      }
    });
    writes.current = pending.then(() => {}, () => {});
    return pending;
  }, []);
  const practice = (id: string) => { setPractice(id); go('practice'); };
  const openTopic = (id: string) => { setTopic(id); go('map'); };
  const openResource = (id: string) => { setResource(id); go('materials'); };

  return <StudyContext.Provider value={{ study, active, notify, update, go, practice, openTopic, openResource, practiceId, topicId, resourceId }}>
    <AppShell page={page}><Suspense fallback={<p className="sub" role="status">Загружаем…</p>}><Screen key={study.language} /></Suspense></AppShell>
    <p className="notice" id="notice" role="status" hidden={!notice}>{notice}</p>
  </StudyContext.Provider>;
}

const root = createRoot(document.querySelector('#root')!);
root.render(<main role="status">Открываем локальный словарь…</main>);
void readStudy().then(initial => root.render(<App initial={initial} />), () => {
  root.render(<main role="alert">Не удалось прочитать локальное хранилище. Открой приложение в обычном окне браузера.</main>);
});
