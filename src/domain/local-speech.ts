type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
type RecognitionOptions = { langs: string[]; processLocally: true };
type RecognitionResult = { 0: { transcript: string } };
type Recognition = {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(track: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
};
type RecognitionClass = {
  new (): Recognition;
  available(options: RecognitionOptions): Promise<Availability>;
  install(options: RecognitionOptions): Promise<boolean>;
};

const locales: Record<string, string> = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR',
  ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', 'zh-Hant': 'zh-TW', ru: 'ru-RU', uk: 'uk-UA'
};
const locale = (language: string) => locales[language] ?? language;
const options = (language: string): RecognitionOptions => ({ langs: [locale(language)], processLocally: true });
function recognizer() {
  const scope = window as Window & { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  const engine = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return engine && 'processLocally' in engine.prototype && typeof engine.available === 'function' ? engine : undefined;
}

export async function localSpeechAvailability(language: string): Promise<Availability> {
  try { return await recognizer()?.available(options(language)) ?? 'unavailable'; }
  catch { return 'unavailable'; }
}

export async function installSpeechPack(language: string) {
  return await recognizer()?.install(options(language)) ?? false;
}

export async function transcribeLocally(blob: Blob, language: string, signal: AbortSignal): Promise<string> {
  const engine = recognizer();
  if (!engine) throw new Error('Local speech recognition unavailable');
  signal.throwIfAborted();
  const context = new AudioContext();
  const recognition = new engine();
  const source = context.createBufferSource();
  // The destination is a private audio track. It is never connected to the speakers.
  const sink = context.createMediaStreamDestination();
  source.connect(sink);
  const [input] = sink.stream.getAudioTracks();
  recognition.lang = locale(language);
  recognition.processLocally = true;
  recognition.continuous = true;
  recognition.interimResults = true;

  let timeout: number | undefined;
  let cancel: (() => void) | undefined;
  let stopTimer: number | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      let transcript = '';
      const fail = () => reject(new Error('Could not transcribe the recording locally'));
      cancel = fail;
      timeout = window.setTimeout(fail, 8_000);
      signal.addEventListener('abort', fail, { once: true });
      recognition.onstart = () => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(fail, (source.buffer!.duration + 8) * 1000);
        try { source.start(); } catch { fail(); }
      };
      recognition.onresult = event => {
        const text = Array.from(event.results).map(result => result[0]?.transcript.trim()).filter(Boolean).join(' ');
        if (text) transcript = text;
      };
      recognition.onerror = fail;
      recognition.onend = () => transcript ? resolve(transcript) : fail();
      // Give the recognizer time to finalize the last words while the track delivers silence.
      source.onended = () => { stopTimer = window.setTimeout(() => recognition.stop(), 1500); };

      void (async () => {
        try {
          await context.resume();
          source.buffer = await context.decodeAudioData(await blob.arrayBuffer());
          signal.throwIfAborted();
          if (context.state === 'running') recognition.start(input);
        } catch { fail(); }
      })();
    });
  } finally {
    window.clearTimeout(timeout);
    window.clearTimeout(stopTimer);
    if (cancel) signal.removeEventListener('abort', cancel);
    recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = source.onended = null;
    recognition.abort();
    input.stop();
    void context.close().catch(() => {});
  }
}
