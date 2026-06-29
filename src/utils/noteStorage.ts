const NOTE_DB_NAME = 'quiz-make-notes-v1';
const NOTE_STORE_NAME = 'categoryNotes';
export const CATEGORY_NOTE_KEY_PREFIX = 'quizMake:notes:';

let dbPromise: Promise<IDBDatabase> | null = null;

export function isCategoryNoteKey(key: string): boolean {
  return key.startsWith(CATEGORY_NOTE_KEY_PREFIX);
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function loadCategoryNoteRaw(key: string): Promise<string | null> {
  if (!isCategoryNoteKey(key)) return null;

  if (isIndexedDbAvailable()) {
    try {
      const stored = await getRawFromIndexedDb(key);
      if (stored !== null) return stored;
    } catch (error) {
      console.warn('Failed to read category note from IndexedDB.', error);
    }
  }

  const legacy = safeLocalStorageGet(key);
  if (legacy !== null && isIndexedDbAvailable()) {
    try {
      await setRawToIndexedDb(key, legacy);
      safeLocalStorageRemove(key);
    } catch (error) {
      console.warn('Failed to migrate category note to IndexedDB.', error);
    }
  }

  return legacy;
}

export async function saveCategoryNoteRaw(key: string, raw: string): Promise<void> {
  if (!isCategoryNoteKey(key)) throw new Error('Invalid category note key.');

  if (isIndexedDbAvailable()) {
    await setRawToIndexedDb(key, raw);
    safeLocalStorageRemove(key);
    return;
  }

  try {
    localStorage.setItem(key, raw);
  } catch (error) {
    throw new Error(isQuotaExceededError(error)
      ? 'ノート保存容量が足りません。端末の空き容量を増やすか、不要なノートを減らしてください。'
      : error instanceof Error
        ? error.message
        : 'ノートの保存に失敗しました。');
  }
}

export async function exportCategoryNotesRaw(): Promise<Record<string, string>> {
  const notes: Record<string, string> = {};

  if (isIndexedDbAvailable()) {
    try {
      Object.assign(notes, await exportIndexedDbNotes());
    } catch (error) {
      console.warn('Failed to export category notes from IndexedDB.', error);
    }
  }

  collectLegacyLocalStorageNotes().forEach(([key, value]) => {
    if (notes[key] === undefined) notes[key] = value;
  });

  return sortRecord(notes);
}

export async function replaceCategoryNotesRaw(notes: Record<string, string>): Promise<number> {
  const validNotes = sortRecord(Object.keys(notes).reduce<Record<string, string>>((result, key) => {
    if (isCategoryNoteKey(key) && typeof notes[key] === 'string') result[key] = notes[key];
    return result;
  }, {}));

  if (isIndexedDbAvailable()) {
    await replaceIndexedDbNotes(validNotes);
    removeAllLegacyLocalStorageNotes();
    return Object.keys(validNotes).length;
  }

  removeAllLegacyLocalStorageNotes();
  Object.entries(validNotes).forEach(([key, value]) => localStorage.setItem(key, value));
  return Object.keys(validNotes).length;
}

function openNoteDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error('IndexedDB is not available.'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTE_STORE_NAME)) db.createObjectStore(NOTE_STORE_NAME);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open note database.'));
    request.onblocked = () => reject(new Error('Note database is blocked by another tab.'));
  });

  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

async function getRawFromIndexedDb(key: string): Promise<string | null> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(NOTE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error('Failed to read note.'));
  });
}

async function setRawToIndexedDb(key: string, raw: string): Promise<void> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTE_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(NOTE_STORE_NAME).put(raw, key);
    request.onerror = () => reject(request.error ?? new Error('Failed to save note.'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('Failed to save note.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Failed to save note.'));
  });
}

async function exportIndexedDbNotes(): Promise<Record<string, string>> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const result: Record<string, string> = {};
    const transaction = db.transaction(NOTE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(NOTE_STORE_NAME).openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(sortRecord(result));
        return;
      }
      const key = String(cursor.key);
      if (isCategoryNoteKey(key) && typeof cursor.value === 'string') result[key] = cursor.value;
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to export notes.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to export notes.'));
  });
}

async function replaceIndexedDbNotes(notes: Record<string, string>): Promise<void> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(NOTE_STORE_NAME);
    store.clear();
    Object.entries(notes).forEach(([key, value]) => store.put(value, key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to import notes.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Failed to import notes.'));
  });
}

function collectLegacyLocalStorageNotes(): Array<[string, string]> {
  const notes: Array<[string, string]> = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !isCategoryNoteKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) notes.push([key, value]);
    }
  } catch {
    // localStorage may be unavailable in private/restricted contexts.
  }
  return notes;
}

function removeAllLegacyLocalStorageNotes(): void {
  collectLegacyLocalStorageNotes().forEach(([key]) => safeLocalStorageRemove(key));
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best effort cleanup only.
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.message.toLowerCase().includes('quota')
    || error.message.includes('exceeded the quota');
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.keys(record).sort().reduce<Record<string, string>>((result, key) => {
    result[key] = record[key];
    return result;
  }, {});
}
