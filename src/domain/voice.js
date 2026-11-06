let recorder;
let pending = false;
let cancellation = 0;
let speechVersion = 0;
let database;

function recordings() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('nit-rechi-audio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('takes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return database;
}

async function accessRecording(mode, operation) {
  const db = await recordings();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('takes', mode);
    const request = operation(transaction.objectStore('takes'));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function getTake(id) {
  return accessRecording('readonly', store => store.get(id));
}

export function deleteTake(id) {
  return deleteTakes([id]);
}

export function deleteTakes(ids) {
  return accessRecording('readwrite', store => {
    for (const id of ids) store.delete(id);
  });
}

export function stopVoice() {
  cancellation += 1;
  if (recorder?.state === 'recording') recorder.stop();
  stopSpeaking();
}

export function stopSpeaking() {
  speechVersion += 1;
  window.speechSynthesis?.cancel();
}

export async function toggleRecording(id, notify) {
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  if (recorder || pending) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    notify('Для записи открой приложение на localhost или по HTTPS в браузере с доступом к микрофону.');
    return;
  }
  const request = cancellation;
  let stream;
  pending = true;
  stopSpeaking();
  notify('Браузер запрашивает доступ к микрофону.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (request !== cancellation) { stream.getTracks().forEach(track => track.stop()); return; }
    const current = new MediaRecorder(stream);
    const parts = [];
    let failed = false;
    current.addEventListener('dataavailable', event => { if (event.data.size) parts.push(event.data); });
    current.addEventListener('error', () => { failed = true; stream.getTracks().forEach(track => track.stop()); recorder = undefined; notify('Запись прервалась.'); });
    current.addEventListener('stop', async () => {
      clearTimeout(limit);
      stream.getTracks().forEach(track => track.stop());
      if (recorder === current) recorder = undefined;
      if (failed) return;
      if (!parts.length) { notify('Запись пустая. Попробуй ещё раз.'); return; }
      try {
        await accessRecording('readwrite', store => store.put(new Blob(parts, { type: current.mimeType }), id));
        notify('Запись сохранена в этом браузере.');
      } catch {
        notify('Браузер не смог сохранить запись.');
      }
    });
    current.start();
    recorder = current;
    const limit = setTimeout(() => { if (current.state === 'recording') current.stop(); }, 120_000);
    notify('Идёт запись. Максимум две минуты.');
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    if (request === cancellation) notify(error.name === 'NotAllowedError' ? 'Разреши браузеру использовать микрофон.' : 'Микрофон недоступен.');
  } finally {
    pending = false;
  }
}

export function isRecording() {
  return recorder?.state === 'recording';
}

function speechPieces(text, language) {
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(language, { granularity: 'sentence' }).segment(text)].map(item => item.segment)
    : text.split(/(?<=[.!?。！？])\s*/u);
  return sentences.flatMap(sentence => {
    const pieces = [];
    let rest = sentence.trim();
    while (rest.length > 190) {
      const head = Array.from(rest).slice(0, 170).join('');
      const space = head.lastIndexOf(' ');
      const cut = space > 70 ? space : head.length;
      pieces.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) pieces.push(rest);
    return pieces;
  });
}

export function speak(text, language, slow, notify) {
  const engine = window.speechSynthesis;
  if (!engine) { notify('В этом браузере озвучка недоступна.'); return; }
  if (isRecording()) { notify('Сначала останови запись.'); return; }
  const base = language.toLowerCase().split('-')[0];
  const voices = engine.getVoices();
  const voice = voices.find(item => item.lang.toLowerCase() === language.toLowerCase())
    ?? voices.find(item => item.lang.toLowerCase().split(/[-_]/)[0] === base);
  if (voices.length && !voice) { notify('В устройстве нет голоса для этого языка.'); return; }
  stopSpeaking();
  const version = speechVersion;
  const pieces = speechPieces(text, language);
  function play(index) {
    if (version !== speechVersion || index >= pieces.length) return;
    const utterance = new SpeechSynthesisUtterance(pieces[index]);
    if (voice) utterance.voice = voice;
    utterance.lang = language;
    utterance.rate = slow ? 0.75 : 1;
    utterance.onend = () => play(index + 1);
    utterance.onerror = event => {
      if (version === speechVersion && !['canceled', 'interrupted'].includes(event.error)) {
        notify('Не удалось озвучить текст выбранным голосом.');
      }
    };
    engine.speak(utterance);
  }
  play(0);
}
