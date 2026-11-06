import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { StudyContext } from './context';
import { itemsForLanguage, pages, readStudy, writeStudy } from './domain/model';
import type { Page, Study } from './domain/model';
import { stopVoice } from './domain/voice.js';
import './styles.css';

const Practice = lazy(() => import('./components/Practice').then(module => ({ default: module.Practice })));
const Progress = lazy(() => import('./components/Practice').then(module => ({ default: module.Progress })));
const MapPage = lazy(() => import('./components/Map').then(module => ({ default: module.MapPage })));
const Materials = lazy(() => import('./components/Materials').then(module => ({ default: module.Materials })));
const Account = lazy(() => import('./components/Account').then(module => ({ default: module.Account })));

const screens = { practice: Practice, map: MapPage, materials: Materials, progress: Progress, account: Account };
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
function route(): Page {
  const value = location.hash.slice(1);
  return Object.hasOwn(pages, value) ? value as Page : 'practice';
}
function go(page: Page) {
  if (location.hash !== '#' + page) location.hash = page;
}

function App({ initial }: { initial: Study }) {
  const [study, setStudy] = useState(initial);
  const latest = useRef(study);
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
    window.addEventListener('pagehide', stopVoice);
    return () => window.removeEventListener('pagehide', stopVoice);
  }, []);

  const update = useCallback((change: (current: Study) => Study) => {
    const next = change(latest.current);
    try {
      writeStudy(next);
      latest.current = next;
      setStudy(next);
      return true;
    } catch {
      notify('Не удалось сохранить изменения. Проверь доступное место в браузере.');
      return false;
    }
  }, []);
  const practice = (id: string) => { setPractice(id); go('practice'); };
  const openTopic = (id: string) => { setTopic(id); go('map'); };
  const openResource = (id: string) => { setResource(id); go('materials'); };

  return <StudyContext.Provider value={{ study, active, notify, update, go, practice, openTopic, openResource, practiceId, topicId, resourceId }}>
    <header className="appbar">
      <a className="brand" href="#practice" aria-label="Нить речи — к практике"><span aria-hidden="true">✳</span> Нить речи</a>
      <nav aria-label="Основные разделы">
        {(Object.keys(pages) as Page[]).filter(entry => entry !== 'account').map(entry =>
          <a key={entry} href={'#' + entry} aria-current={entry === page ? 'page' : undefined}>{pages[entry]}</a>)}
      </nav>
      <a className="account" href="#account" aria-current={page === 'account' ? 'page' : undefined}>Кабинет</a>
    </header>
    <main id="screen"><Suspense fallback={<p className="sub" role="status">Загружаем…</p>}><Screen /></Suspense></main>
    <p className="notice" id="notice" role="status" hidden={!notice}>{notice}</p>
  </StudyContext.Provider>;
}

const root = createRoot(document.querySelector('#root')!);
try { root.render(<App initial={readStudy()} />); }
catch { root.render(<main role="alert">Не удалось прочитать локальное хранилище. Открой приложение в обычном окне браузера.</main>); }
