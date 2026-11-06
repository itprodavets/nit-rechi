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

async function visitHistory(language: string, visit: (key: string, reviews: Review[]) => void) {
  const db = await openHistory();
  const prefix = JSON.stringify([language]).slice(0, -1) + ',';
  return new Promise<void>((resolve, reject) => {
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
    const request = db.transaction('notes').objectStore('notes').openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      visit(String(cursor.key), cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function readReviewedKeys(language: string, start: number, end: number): Promise<Set<string>> {
  const keys = new Set<string>();
  await visitHistory(language, (key, reviews) => {
    if (reviews.some(([at]) => at >= start && at < end)) keys.add(key);
  });
  return keys;
}

export interface ReviewSummary {
  total: number;
  recalled: number;
  latestRating: number;
  latestInterval: number;
}

export async function readReviewSummaries(language: string) {
  const summaries = new Map<string, ReviewSummary>();
  await visitHistory(language, (key, reviews) => {
    const latest = reviews.reduce<Review | undefined>((previous, review) =>
      !previous || review[0] > previous[0] ? review : previous, undefined);
    if (latest) summaries.set(key, {
      total: reviews.length, recalled: reviews.filter(review => review[2] >= 3).length,
      latestRating: latest[2], latestInterval: latest[3]
    });
  });
  return summaries;
}

export async function deleteReviewKeys(keys: string[]) {
  if (!keys.length) return;
  const db = await openHistory();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('notes', 'readwrite');
    const store = transaction.objectStore('notes');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    for (const key of keys) store.delete(key);
  });
}
