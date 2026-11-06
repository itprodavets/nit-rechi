import type { Review } from './anki-model';

let database: Promise<IDBDatabase> | undefined;

function openHistory() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('nit-rechi-anki', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('notes');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  return database;
}

export async function saveReviews(batches: [string, Review[]][]) {
  const counts = new Map<string, number>();
  if (!batches.length) return counts;
  const db = await openHistory();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('notes', 'readwrite');
    const store = transaction.objectStore('notes');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    const eventKey = (event: Review) => event[0] + ':' + event[1];
    for (const [key, entries] of batches) {
      const request = store.get(key);
      request.onsuccess = () => {
        const merged = new Map<string, Review>((request.result ?? []).map((event: Review) => [eventKey(event), event]));
        for (const event of entries) merged.set(eventKey(event), event);
        counts.set(key, merged.size);
        store.put([...merged.values()], key);
      };
    }
  });
  return counts;
}

export async function readReviews(key: string): Promise<Review[]> {
  const db = await openHistory();
  return new Promise((resolve, reject) => {
    const request = db.transaction('notes').objectStore('notes').get(key);
    request.onsuccess = () => resolve((request.result ?? []).sort((a: Review, b: Review) => b[0] - a[0]));
    request.onerror = () => reject(request.error);
  });
}
