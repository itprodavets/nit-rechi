const STORAGE_KEY = 'nit-rechi-v1';
const DAY = 86_400_000;

export function readStudy() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? { resources: [], ...JSON.parse(saved) } : {
    language: 'en', languages: { en: {} }, words: [], topics: [], resources: [], results: {}
  };
}

export function writeStudy(study) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
}

function separatedRows(text, separator) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const addField = () => { row.push(field); field = ''; };
  const addRow = () => { addField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (quoted || !field) quoted = !quoted;
      else field += char;
    } else if (!quoted && char === separator) addField();
    else if (!quoted && (char === '\n' || char === '\r')) {
      addRow();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else field += char;
  }
  if (quoted) throw new Error('В файле есть незакрытые кавычки. Проверь экспорт.');
  addRow();
  return rows;
}

function cleanField(value, hasHtml) {
  const text = (value ?? '').replace(/\[sound:[^\]]+\]/gi, '');
  if (!hasHtml) return text.trim();
  const template = document.createElement('template');
  template.innerHTML = text.replace(/<br\s*\/?\s*>/gi, '\n');
  template.content.querySelectorAll('script, style').forEach(node => node.remove());
  return template.content.textContent.trim();
}

export function parseAnki(text, language, columns = [1, 2, 3]) {
  const lines = text.replace(/^\uFEFF/, '').split('\n');
  const headers = {};
  while (/^\s*#[a-z][\w -]*:/.test(lines[0] ?? '')) {
    const line = lines.shift().trim();
    const colon = line.indexOf(':');
    headers[line.slice(1, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  const content = lines.join('\n');
  const separators = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', colon: ':', space: ' ' };
  const separator = separators[headers.separator?.toLowerCase()] || (content.split('\n')[0].includes('\t') ? '\t' : ',');
  const guidColumn = Number(headers['guid column'] || headers['guid-column']) - 1;
  const rows = separatedRows(content, separator);
  const selected = columns.map(number => number - 1);
  if (!rows.some(row => selected[0] < row.length)) throw new Error('В файле не найдена колонка со словами.');
  return rows.flatMap(row => {
    const [title, meaning, example] = selected.map(index => cleanField(row[index], headers.html === 'true'));
    if (!title) return [];
    const guid = row[guidColumn]?.trim();
    const normalized = [title, meaning].map(value => value.normalize('NFC').toLocaleLowerCase(language));
    const key = guid ? ['guid', guid] : ['word', ...normalized];
    return [{ id: JSON.stringify([language, ...key]), language, title, meaning, example }];
  });
}

export function mergeWords(study, incoming) {
  const words = new Map(study.words.map(word => [word.id, word]));
  for (const word of incoming) words.set(word.id, { ...words.get(word.id), ...word });
  const added = words.size - study.words.length;
  study.words = [...words.values()];
  return added;
}

export function assess(study, id, result, now = Date.now()) {
  const previous = study.results[id];
  const level = result === 'independent' ? (previous?.level ?? 0) + 1 : 0;
  const days = [1, 3, 7, 14, 30][Math.min(Math.max(level - 1, 0), 4)];
  const due = now + (result === 'retry' ? 0 : days * DAY);
  study.results[id] = { level, result, due, attempts: (previous?.attempts ?? 0) + 1, updated: now };
}

export function sortForPractice(items, results) {
  return [...items].sort((a, b) => (results[a.id]?.due ?? 0) - (results[b.id]?.due ?? 0));
}
