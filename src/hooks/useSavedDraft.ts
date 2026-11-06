import { useEffect, useRef, useState } from 'react';

export function useSavedDraft<T>(initial: T, write: (draft: T) => Promise<boolean>) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(true);
  const current = useRef(draft);
  const writer = useRef(write);
  current.current = draft;
  writer.current = write;
  const persisted = useRef(JSON.stringify(initial));
  const signature = JSON.stringify(draft);
  async function flush(value = current.current) {
    const signature = JSON.stringify(value);
    const ok = await writer.current(value);
    if (ok) { persisted.current = signature; if (JSON.stringify(current.current) === signature) setSaved(true); }
    return ok;
  }
  useEffect(() => {
    if (signature === persisted.current) return;
    setSaved(false);
    const timer = window.setTimeout(() => { void flush(); }, 700);
    return () => clearTimeout(timer);
  }, [signature]);
  useEffect(() => () => {
    if (JSON.stringify(current.current) !== persisted.current) void writer.current(current.current);
  }, []);
  return { draft, setDraft, saved, flush };
}
