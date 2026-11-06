import { useEffect, useState } from 'react';
import { SpeechFeedback } from './SpeechFeedback';
import { useWorkspace } from '../context';
import { deleteTake, getTake, isRecording, stopVoice, toggleRecording } from '../domain/voice.js';

export function Recording({ itemId, language, targets = [], onTranscript, readOnly = false }: { itemId: string; language: string; targets?: string[]; onTranscript?: (text: string) => void; readOnly?: boolean }) {
  const { notify } = useWorkspace();
  const [revision, refresh] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string }>();
  const [recording, setRecording] = useState(false);
  useEffect(() => () => stopVoice(), []);
  useEffect(() => {
    let active = true;
    let source: string | undefined;
    getTake(itemId).then(blob => {
      if (!active) return;
      source = blob ? URL.createObjectURL(blob) : undefined;
      setTake(blob && source ? { blob, url: source } : undefined);
    }, () => { if (active) setTake(undefined); });
    return () => { active = false; if (source) URL.revokeObjectURL(source); };
  }, [itemId, revision]);
  const record = () => toggleRecording(itemId, (message: string) => {
    notify(message);
    setRecording(isRecording());
    refresh(value => value + 1);
  });
  async function clear() {
    try { await deleteTake(itemId); refresh(value => value + 1); notify('Запись удалена.'); }
    catch { notify('Не удалось удалить запись.'); }
  }
  return <div className="recording">
    {!readOnly && <button type="button" aria-pressed={recording} onClick={record}>{recording ? 'Остановить запись' : 'Записать ответ'}</button>}
    {take && !recording && <><div className="take"><audio controls preload="metadata" aria-label="Твоя запись" src={take.url} />{!readOnly && <button type="button" className="subtle" onClick={clear}>Удалить запись</button>}</div>
      {!readOnly && <SpeechFeedback key={take.url} recording={take.blob} language={language} targets={targets} onTranscript={onTranscript} />}</>}
  </div>;
}
