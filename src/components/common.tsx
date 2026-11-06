import type { ReactNode } from 'react';
import { GlossaryText } from './Glossary';
import type { Glossary } from './Glossary';
import { useWorkspace } from '../context';
import { safeSourceUrl } from '../domain/chat-package.js';
import { speak, stopSpeaking } from '../domain/voice.js';
import { LanguageLabel } from './Language';

export function Heading({ title, detail, label }: { title: string; detail?: string; label?: string }) {
  const { study } = useWorkspace();
  return <header className="heading">
    <p className="kicker">{label ?? <LanguageLabel code={study.language} />}</p>
    <h1>{title}</h1>
    {detail && <p className="sub">{detail}</p>}
  </header>;
}

export function Fold({ title, children, open, className = '' }: { title: string; children: ReactNode; open?: boolean; className?: string }) {
  return <details className={`fold ${className}`} open={open}><summary>{title}</summary>{children}</details>;
}

export function VoiceButtons({ text, language }: { text: string; language: string }) {
  const { notify } = useWorkspace();
  return <div className="actions">
    <button type="button" onClick={() => speak(text, language, false, notify)}>▶ Слушать</button>
    <button type="button" onClick={() => speak(text, language, true, notify)}>Медленнее</button>
    {text.length > 190 && <button type="button" onClick={stopSpeaking}>Остановить</button>}
  </div>;
}

export function SourceText({ text, language, glossary }: { text: string; language: string; glossary?: Glossary }) {
  return <><GlossaryText text={text} language={language} glossary={glossary} /><VoiceButtons text={text} language={language} /></>;
}

export function SourceLink({ url }: { url: string }) {
  const safe = safeSourceUrl(url);
  return safe ? <a className="resource-link" href={safe} target="_blank" rel="noopener noreferrer">Открыть источник ↗</a> : null;
}

export function Empty({ children, sample }: { children: ReactNode; sample?: () => void }) {
  return <div className="empty">
    <p>{children}</p>
    <a className="button primary" href="#materials">Добавить материал</a>
    <a className="button" href="#account">Импортировать Anki</a>
    {sample && <button type="button" onClick={sample}>Попробовать на примере</button>}
  </div>;
}

export async function copyText(text: string, notify: (message: string) => void) {
  try { await navigator.clipboard.writeText(text); notify('Команда скопирована. Вставь её в свой чат.'); }
  catch { notify('Команда готова. Скопируй её из поля.'); }
}
