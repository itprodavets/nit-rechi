import type { Study } from './model';

const key = 'nit-rechi-v1';
const marker = 'indexeddb';
let database: Promise<IDBDatabase> | undefined;
let migrated = false;

function openStudy() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('nit-rechi-study', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function loadStored() {
  const db = await openStudy();
  return new Promise<Study | undefined>((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readStudy(): Promise<Study> {
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); } catch { /* IndexedDB may still be available. */ }
  const fromDatabase = await loadStored().catch(error => {
    if (saved === marker) throw error;
    return undefined;
  });
  if (fromDatabase) {
    migrated = true;
    return { ...fromDatabase, resources: fromDatabase.resources ?? [] };
  }
  if (saved === marker) throw new Error('Missing vocabulary in IndexedDB');
  if (saved) return { resources: [], ...JSON.parse(saved) };
  return { language: 'en', languages: { en: {} }, words: [], topics: [], resources: [], results: {} };
}

export async function writeStudy(study: Study) {
  if (!migrated) {
    try { localStorage.setItem(key, JSON.stringify(study)); return; }
    catch { /* Store the full snapshot in IndexedDB when localStorage has insufficient space. */ }
  }
  const db = await openStudy();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.objectStore('state').put(study, key);
  });
  if (!migrated) {
    migrated = true;
    try { localStorage.setItem(key, marker); } catch { /* Startup checks IndexedDB even without the marker. */ }
  }
}
