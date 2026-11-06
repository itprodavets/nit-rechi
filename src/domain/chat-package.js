const materialKinds = new Set(['reading', 'exercise', 'dialogue', 'media']);

function field(value, label, limit, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw new Error('Проверь поле «' + label + '» в файле.');
  }
  return value.trim();
}

function list(value, label, limit) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('Проверь список «' + label + '» в файле.');
  }
  return value;
}

export function safeSourceUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Invalid URLs are rejected before saving. */ }
  return '';
}

export function buildChatPrompt(language, topic = '', source) {
  const schema = {
    format: 'nit-rechi',
    version: 1,
    language,
    topic: { title: topic || 'Название темы', prompt: 'Что предложить сказать вслух' },
    words: [{ title: 'слово или выражение', meaning: 'значение на русском', example: 'пример на изучаемом языке' }],
    materials: [
      { kind: 'exercise', title: 'Задание', prompt: 'Условие упражнения', answer: 'Пример ответа на изучаемом языке' },
      { kind: 'dialogue', title: 'Диалог', text: 'Реплики на изучаемом языке' }
    ]
  };
  const subject = source
    ? '\nИспользуй следующий материал из моего занятия:\n' + JSON.stringify(source, null, 2)
    : '\nИспользуй материал и полезные выражения из нашего разговора.';
  return 'Выгрузи итоги занятия в файл nit-rechi.json для импорта в приложение «Нить речи».' + subject +
    '\nВыдели до 12 полезных слов или выражений. Дай значения и примеры употребления. ' +
    'Добавь 2–3 упражнения с ответами и короткий диалог с выбранной лексикой. ' +
    'Если источник по ссылке недоступен, попроси текст. Сохрани изучаемый язык и не меняй формат и версию. ' +
    'Верни валидный JSON по этой структуре. Для текста можно использовать kind reading, для ссылки kind media с полем url.\n\n' +
    JSON.stringify(schema, null, 2);
}

export function parseChatPackage(text, activeLanguage) {
  if (text.length > 1_000_000) throw new Error('Файл должен быть меньше 1 МБ.');
  const input = text.replace(/^\uFEFF/, '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let data;
  try { data = JSON.parse(input); }
  catch { throw new Error('Не удалось прочитать JSON. Скопируй пакет целиком.'); }
  if (data?.format !== 'nit-rechi' || data.version !== 1) {
    throw new Error('Нужен пакет «Нить речи» версии 1. Скопируй команду для чата из приложения.');
  }
  let language;
  try { [language] = Intl.getCanonicalLocales(field(data.language, 'language', 35, true)); }
  catch { throw new Error('Укажи корректный код языка в поле language.'); }
  if (language !== activeLanguage) {
    throw new Error('Язык пакета — ' + language + '. Переключи язык в кабинете и повтори импорт.');
  }
  const topic = {
    title: field(data.topic?.title, 'topic.title', 90, true),
    prompt: field(data.topic?.prompt, 'topic.prompt', 4000)
  };
  const words = list(data.words, 'words', 150).map(word => ({
    title: field(word.title, 'word.title', 300, true),
    meaning: field(word.meaning, 'word.meaning', 2000),
    example: field(word.example, 'word.example', 8000)
  }));
  const materials = list(data.materials, 'materials', 60).map(material => {
    if (!materialKinds.has(material.kind)) throw new Error('Неизвестный тип материала.');
    const title = field(material.title, 'material.title', 120, true);
    const text = field(material.text, 'material.text', 250000);
    const prompt = field(material.prompt, 'material.prompt', 4000);
    const answer = field(material.answer, 'material.answer', 12000);
    const originalUrl = field(material.url, 'material.url', 2000);
    const url = safeSourceUrl(originalUrl);
    if (originalUrl && !url) throw new Error('Ссылка на источник должна начинаться с https:// или http://.');
    if (!text && !url && !(material.kind === 'exercise' && prompt)) {
      throw new Error('В материале «' + title + '» нет текста, ссылки или условия.');
    }
    return { kind: material.kind, title, text, prompt, answer: material.kind === 'exercise' ? answer : '', url };
  });
  if (!words.length && !materials.length) throw new Error('В пакете нет слов и материалов.');
  return { language, topic, words, materials };
}

export function applyChatPackage(study, packet, topicId) {
  const { language } = packet;
  const normalize = value => (value ?? '').normalize('NFC').trim().toLocaleLowerCase(language);
  const next = {
    ...study,
    words: [...study.words],
    topics: [...study.topics],
    resources: [...study.resources]
  };
  const available = next.topics.filter(topic => topic.language === language);
  const existing = topicId
    ? available.find(topic => topic.id === topicId)
    : available.find(topic => normalize(topic.title) === normalize(packet.topic.title));
  if (topicId && !existing) throw new Error('Выбранная тема больше недоступна.');
  const topic = existing
    ? { ...existing, links: [...existing.links] }
    : { id: crypto.randomUUID(), language, ...packet.topic, links: [], materials: [] };
  const linked = new Set(topic.links);
  let wordsAdded = 0;
  for (const entry of packet.words) {
    const candidates = next.words.filter(word => word.language === language && normalize(word.title) === normalize(entry.title));
    let word = candidates.find(candidate => normalize(candidate.meaning) === normalize(entry.meaning));
    if (!word && candidates.length === 1 && (!candidates[0].meaning || !entry.meaning)) [word] = candidates;
    if (!word) {
      const id = JSON.stringify([language, 'word', normalize(entry.title), normalize(entry.meaning)]);
      word = { id, language, ...entry };
      next.words.push(word);
      wordsAdded += 1;
    } else if (entry.example && entry.example !== word.example && !word.chatExamples?.includes(entry.example)) {
      const index = next.words.indexOf(word);
      word = { ...word, chatExamples: [...(word.chatExamples ?? []), entry.example] };
      next.words[index] = word;
    }
    linked.add(word.id);
  }
  topic.links = [...linked];
  if (existing) next.topics[next.topics.indexOf(existing)] = topic;
  else next.topics.push(topic);

  const resourceKey = entry => JSON.stringify([entry.kind, normalize(entry.title), entry.text ?? '', entry.prompt ?? '', entry.answer ?? '', entry.url ?? '']);
  const present = new Set(next.resources.filter(entry => entry.topicId === topic.id).map(resourceKey));
  let materialsAdded = 0;
  for (const material of packet.materials) {
    const key = resourceKey(material);
    if (present.has(key)) continue;
    next.resources.push({ id: crypto.randomUUID(), language, topicId: topic.id, ...material });
    present.add(key);
    materialsAdded += 1;
  }
  return { next, topic, wordsAdded, materialsAdded };
}
