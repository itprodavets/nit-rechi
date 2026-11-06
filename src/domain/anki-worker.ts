import { Unzip, UnzipInflate } from 'fflate';
import { Decompress } from 'fzstd';
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import type { Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import type { Archive, ArchiveNote } from './anki-model';

const maxDb = 64 * 1024 * 1024;
const collectionFiles = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];
const engine = initSqlJs({ locateFile: () => wasmUrl });

function combine(chunks: Uint8Array[], length: number) {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function zipDatabase(file: File) {
  const entries = new Map<string, Uint8Array>();
  const stream = new Unzip(entry => {
    if (!collectionFiles.includes(entry.name)) return;
    if (entries.has(entry.name)) throw new Error('Архив содержит несколько файлов с одинаковым именем базы.');
    if (entry.originalSize && entry.originalSize > maxDb) throw new Error('База Anki слишком большая для импорта в браузере.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    entry.ondata = (error, chunk, final) => {
      if (error) throw error;
      size += chunk.length;
      if (size > maxDb) throw new Error('База Anki слишком большая для импорта в браузере.');
      chunks.push(chunk);
      if (final) entries.set(entry.name, combine(chunks, size));
    };
    entry.start();
  });
  stream.register(UnzipInflate);
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      stream.push(value);
      // The actual modern database is authoritative. Skip trailing media.
      if (entries.has(collectionFiles[0])) break;
    }
    if (!entries.has(collectionFiles[0])) stream.push(new Uint8Array(), true);
  } finally {
    await reader.cancel().catch(() => {});
  }
  const name = collectionFiles.find(candidate => entries.has(candidate));
  if (!name) throw new Error('В архиве не найдена база Anki.');
  const bytes = entries.get(name)!;
  if (name !== collectionFiles[0]) return bytes;
  let size = 0;
  const chunks: Uint8Array[] = [];
  const decode = new Decompress(chunk => {
    size += chunk.length;
    if (size > maxDb) throw new Error('Распакованная база Anki больше 64 МБ.');
    chunks.push(chunk);
  });
  decode.push(bytes, true);
  return combine(chunks, size);
}

function eachRow(db: Database, sql: string, use: (row: ReturnType<Database['exec']>[number]['values'][number]) => void) {
  const statement = db.prepare(sql);
  try {
    while (statement.step()) use(statement.get());
  } finally { statement.free(); }
}

function readArchive(db: Database): Archive {
  const decks: Archive['decks'] = {};
  const types: Archive['types'] = {};
  const notes = new Map<number, ArchiveNote>();
  const modern = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fields'").length > 0;
  if (modern) {
    eachRow(db, 'SELECT id, name FROM decks', ([id, name]) => { decks[String(id)] = String(name).replaceAll('\u001f', '::'); });
    // SQLite WASM has no Anki "unicase" collation. Field labels are only read by ordinal.
    // Rewrite the collation on the in-memory copy, then reload its schema.
    db.run(`
      PRAGMA writable_schema=ON;
      UPDATE sqlite_master SET sql=replace(sql,'COLLATE unicase','COLLATE BINARY')
        WHERE type='table' AND name='fields';
      PRAGMA writable_schema=RESET;
    `);
    eachRow(db, 'SELECT ntid, ord, name FROM fields', ([id, ordinal, name]) => {
      (types[String(id)] ??= [])[Number(ordinal)] = String(name);
    });
  } else {
    const [rawDecks, rawTypes] = db.exec('SELECT decks, models FROM col')[0]?.values[0] ?? [];
    const oldDecks = JSON.parse(String(rawDecks || '{}')) as Record<string, { name: string }>;
    const oldTypes = JSON.parse(String(rawTypes || '{}')) as Record<string, { flds: { name: string }[] }>;
    for (const [id, deck] of Object.entries(oldDecks)) decks[id] = deck.name;
    for (const [id, type] of Object.entries(oldTypes)) types[id] = type.flds.map(field => field.name);
  }

  eachRow(db, 'SELECT id, guid, mid, flds FROM notes', ([id, guid, type, fields]) => {
    if (notes.size >= 50000) throw new Error('В файле больше 50 000 заметок. Экспортируй одну колоду отдельно.');
    notes.set(Number(id), { guid: String(guid || ''), typeId: String(type), fields: String(fields || '').split('\u001f'), deckIds: [], reviews: [] });
  });
  const cards = new Map<number, ArchiveNote>();
  eachRow(db, 'SELECT id, nid, CASE WHEN odid != 0 THEN odid ELSE did END FROM cards', ([card, noteId, deckId]) => {
    const note = notes.get(Number(noteId));
    if (!note) return;
    const deck = String(deckId);
    if (!note.deckIds.includes(deck)) note.deckIds.push(deck);
    cards.set(Number(card), note);
    decks[deck] ??= 'Колода ' + deck;
  });
  let events = 0;
  eachRow(db, 'SELECT id, cid, ease, ivl, time FROM revlog WHERE ease BETWEEN 1 AND 4', ([at, card, rating, interval, duration]) => {
    const note = cards.get(Number(card));
    if (!note) return;
    if (++events > 500000) throw new Error('В файле больше 500 000 повторений. Экспортируй одну колоду отдельно.');
    note.reviews.push([Number(at), Number(card), Number(rating), Number(interval), Number(duration)]);
  });
  return { decks, types, notes: [...notes.values()] };
}

self.onmessage = async ({ data: file }: MessageEvent<File>) => {
  try {
    const raw = /\.(anki2|anki21|sqlite|sqlite3)$/i.test(file.name);
    if (raw && file.size > maxDb) throw new Error('База Anki больше 64 МБ.');
    const bytes = raw ? new Uint8Array(await file.arrayBuffer()) : await zipDatabase(file);
    const sql = await engine;
    const db = new sql.Database(bytes);
    try {
      db.run('PRAGMA trusted_schema=OFF');
      self.postMessage({ archive: readArchive(db) });
    }
    finally { db.close(); }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Не удалось прочитать архив.' });
  }
};
