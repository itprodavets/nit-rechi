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

export function cleanField(value, hasHtml) {
  const text = (value ?? '').replace(/\[sound:[^\]]+\]/gi, '');
  if (!hasHtml) return text.trim();
  const template = document.createElement('template');
  template.innerHTML = text.replace(/<br\s*\/?\s*>/gi, '\n');
  template.content.querySelectorAll('script, style').forEach(node => node.remove());
  return template.content.textContent.trim();
}

export function readAnkiText(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n');
  const headers = {};
  while (/^\s*#[a-z][\w -]*:/i.test(lines[0] ?? '')) {
    const line = lines.shift().trim();
    const colon = line.indexOf(':');
    headers[line.slice(1, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  const content = lines.join('\n');
  const separators = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', colon: ':', space: ' ' };
  const firstLine = content.split('\n')[0];
  const separator = separators[headers.separator?.toLowerCase()] || (firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',');
  const excluded = new Set(['guid', 'tags', 'deck', 'notetype'].map(name => Number(headers[name + ' column'] || headers[name + '-column']) - 1));
  const guid = Number(headers['guid column'] || headers['guid-column']) - 1;
  const rows = separatedRows(content, separator);
  const hasHeader = !headers.columns && /^(word|term|front|слово|выражение)$/i.test(rows[0]?.[0] ?? '') &&
    /^(meaning|translation|back|перевод|значение)$/i.test(rows[0]?.[1] ?? '');
  const names = (headers.columns ? separatedRows(headers.columns, separator)[0] : hasHeader ? rows.shift() : []) ?? [];
  return {
    decks: {},
    types: { text: names.filter((_, index) => !excluded.has(index)) },
    notes: rows.map(row => ({
      guid: row[guid]?.trim() || '', typeId: 'text', deckIds: [], reviews: [],
      fields: row.filter((_, index) => !excluded.has(index)), html: headers.html === 'true'
    }))
  };
}
