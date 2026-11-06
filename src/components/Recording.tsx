import { useEffect, useState } from 'react';
import { useWorkspace } from '../context';
import { deleteTake, getTake, isRecording, stopVoice, toggleRecording } from '../domain/voice.js';

export function Recording({ itemId }: { itemId: string }) {
  const { notify } = useWorkspace();
  const [revision, refresh] = useState(0);
  const [url, setUrl] = useState<string>();
  const [recording, setRecording] = useState(false);
  useEffect(() => () => stopVoice(), []);
  useEffect(() => {
    let active = true;
    let source: string | undefined;
    getTake(itemId).then(blob => {
      if (!active) return;
      source = blob ? URL.createObjectURL(blob) : undefined;
      setUrl(source);
    }, () => { if (active) setUrl(undefined); });
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
    <button type="button" id="record" aria-pressed={recording} onClick={record}>{recording ? 'Остановить запись' : 'Записать ответ'}</button>
    {url && <div className="take"><audio controls preload="metadata" aria-label="Твоя запись" src={url} /><button type="button" className="subtle" onClick={clear}>Удалить запись</button></div>}
  </div>;
}
