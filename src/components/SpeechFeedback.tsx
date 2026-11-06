import { Fragment, useEffect, useState } from 'react';
import { installSpeechPack, localSpeechAvailability, transcribeLocally } from '../domain/local-speech';
import { inspectSpeech } from '../domain/speech-feedback';

function Highlighted({ text, language, marks }: {
  text: string; language: string; marks: { start: number; end: number; kind: string }[];
}) {
  const cuts = [...new Set([0, text.length, ...marks.flatMap(mark => [mark.start, mark.end])])].sort((a, b) => a - b);
  return <p className="speech-transcript" lang={language}>{cuts.slice(0, -1).map((start, index) => {
    const end = cuts[index + 1];
    const kind = marks.find(mark => mark.start <= start && mark.end >= end)?.kind;
    return <Fragment key={start}>{kind ? <mark className={kind}>{text.slice(start, end)}</mark> : text.slice(start, end)}</Fragment>;
  })}</p>;
}

export function SpeechFeedback({ recording, language, targets, onTranscript }: {
  recording: Blob; language: string; targets: string[]; onTranscript?: (text: string) => void;
}) {
  const [availability, setAvailability] = useState<Awaited<ReturnType<typeof localSpeechAvailability>>>();
  const [message, setMessage] = useState('');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [manual, setManual] = useState(false);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    let live = true;
    localSpeechAvailability(language).then(value => { if (live) setAvailability(value); });
    return () => { live = false; };
  }, [language]);

  useEffect(() => {
    if (availability !== 'available' || manual) return;
    const controller = new AbortController();
    setChecking(true);
    setMessage('');
    transcribeLocally(recording, language, controller.signal).then(text => {
      if (!controller.signal.aborted) { setTranscript(text); setDraft(text); }
    }, () => {
      if (!controller.signal.aborted) setMessage('Браузеру не удалось разобрать запись. Попробуй ещё раз или введи текст вручную.');
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [recording, language, availability, manual, attempt]);

  async function install() {
    setInstalling(true);
    setMessage('');
    try {
      if (await installSpeechPack(language)) setAvailability('available');
      else setMessage('Языковой пакет не удалось установить. Можно проверить текст вручную.');
    } catch { setMessage('Браузер не смог загрузить языковой пакет.'); }
    finally { setInstalling(false); }
  }

  const result = transcript ? inspectSpeech(transcript, targets, language) : undefined;
  const marks = result ? [
    ...result.issues.map(issue => ({ ...issue, kind: 'speech-issue' })),
    ...result.words.flatMap(word => word.span ? [{ ...word.span, kind: 'speech-match' }] : [])
  ] : [];

  return <section className="speech-feedback" aria-label="Проверка записи">
    <div className="speech-heading"><h3>Проверка записи</h3><span className="local-badge">На устройстве</span></div>
    {!manual && checking && <p className="sub" role="status">Распознаём запись на устройстве…</p>}
    {!manual && !checking && availability === 'unavailable' &&
      <p className="sub">Локальное распознавание для этого языка недоступно в браузере. Можно ввести текст вручную.</p>}
    {!manual && !checking && (availability === 'downloadable' || availability === 'downloading') &&
      <p className="sub">Для автоматической расшифровки браузеру нужен языковой пакет. Запись обрабатывается на устройстве.</p>}
    {!manual && !checking && message && <p className="sub" role="status">{message}</p>}
    {result && <>
      <Highlighted text={transcript} language={language} marks={marks} />
      {!!result.words.length && <ul className="speech-targets" aria-label="Нужные слова">
        {result.words.map(({ target, span }) => <li key={target} className={span ? 'speech-found' : 'speech-missing'}>
          <strong lang={language}>{target}</strong><small>{span ? 'Найдено' : 'Нет в тексте'}</small>
        </li>)}
      </ul>}
      {!!result.issues.length && <ul className="speech-corrections">{result.issues.map(issue => <li key={issue.start}>
        Проверь согласование: <span lang={language}>{transcript.slice(issue.start, issue.end)} → <strong>{issue.correction}</strong></span>
      </li>)}</ul>}
      <p className="sub">Проверь точность расшифровки. Подсказки охватывают отдельные правила и не оценивают произношение.</p>
      {onTranscript && <button type="button" onClick={() => onTranscript(transcript)}>Использовать расшифровку в рассказе</button>}
    </>}
    <div className="actions">
      {!manual && (availability === 'downloadable' || availability === 'downloading') &&
        <button type="button" onClick={() => void install()} disabled={installing}>{installing ? 'Загружаем языковой пакет…' : 'Загрузить пакет распознавания'}</button>}
      {!manual && availability === 'available' && message &&
        <button type="button" onClick={() => retry(value => value + 1)}>Повторить распознавание</button>}
      {!manual && <button type="button" className="subtle" onClick={() => { setManual(true); setChecking(false); }}>{transcript ? 'Исправить расшифровку' : 'Ввести расшифровку'}</button>}
    </div>
    {manual && <form onSubmit={event => { event.preventDefault(); setTranscript(draft.trim()); }}>
      <label>Текст ответа <textarea value={draft} maxLength={6000} rows={3} lang={language} onChange={event => setDraft(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={!draft.trim()}>Проверить текст</button>
    </form>}
  </section>;
}
