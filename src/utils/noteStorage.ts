const NOTE_DB_NAME = 'quiz-make-notes-v1';
const NOTE_STORE_NAME = 'categoryNotes';
const NOTE_BACKUP_STORE_NAME = 'categoryNoteBackups';
export const CATEGORY_NOTE_KEY_PREFIX = 'quizMake:notes:';

let dbPromise: Promise<IDBDatabase> | null = null;
let persistenceRequested = false;

export function isCategoryNoteKey(key: string): boolean {
  return key.startsWith(CATEGORY_NOTE_KEY_PREFIX);
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function loadCategoryNoteRaw(key: string): Promise<string | null> {
  if (!isCategoryNoteKey(key)) return null;

  let indexedCurrent: string | null = null;
  let indexedBackup: string | null = null;
  if (isIndexedDbAvailable()) {
    try {
      indexedCurrent = await getRawFromIndexedDb(key);
      indexedBackup = await getBackupRawFromIndexedDb(key);
    } catch (error) {
      console.warn('Failed to read category note from IndexedDB.', error);
    }
  }

  const legacy = safeLocalStorageGet(key);
  const preferred = pickNewestNoteRaw([indexedCurrent, indexedBackup, legacy]);
  if (preferred === null) return indexedCurrent ?? indexedBackup ?? legacy;

  if (isIndexedDbAvailable()) {
    try {
      if (preferred !== indexedCurrent) await setRawToIndexedDb(key, preferred);
      safeLocalStorageRemove(key);
    } catch (error) {
      console.warn('Failed to reconcile category note storage.', error);
    }
  }

  return preferred;
}
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistenceRequested || typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  persistenceRequested = true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function saveCategoryNoteRaw(key: string, raw: string): Promise<void> {
  if (!isCategoryNoteKey(key)) throw new Error('Invalid category note key.');

  void requestPersistentStorage();
  if (isIndexedDbAvailable()) {
    try {
      await setRawToIndexedDb(key, raw);
      safeLocalStorageRemove(key);
      return;
    } catch (indexedDbError) {
      try {
        localStorage.setItem(key, raw);
        return;
      } catch (fallbackError) {
        throw isQuotaExceededError(fallbackError)
          ? new Error('ノート保存容量が足りません。端末の空き容量を増やすか、不要なノートを減らしてください。')
          : indexedDbError;
      }
    }
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

  if (isIndexedDbAvailable()) {
    try {
      const backups = await exportIndexedDbNoteBackups();
      Object.entries(backups).forEach(([key, value]) => {
        if (notes[key] === undefined) notes[key] = value;
      });
    } catch (error) {
      console.warn('Failed to export category note backups from IndexedDB.', error);
    }
  }
  collectLegacyLocalStorageNotes().forEach(([key, value]) => {
    if (notes[key] === undefined) notes[key] = value;
  });

  return sortRecord(notes);
}

export async function mergeCategoryNotesRaw(notes: Record<string, string>): Promise<number> {
  const validNotes = sortRecord(Object.keys(notes).reduce<Record<string, string>>((result, key) => {
    if (isCategoryNoteKey(key) && typeof notes[key] === 'string') result[key] = notes[key];
    return result;
  }, {}));
  if (Object.keys(validNotes).length === 0) return Object.keys(await exportCategoryNotesRaw()).length;

  const existing = await exportCategoryNotesRaw();
  for (const [key, value] of Object.entries(validNotes)) {
    if (!shouldUseIncomingNote(existing[key], value)) continue;
    await saveCategoryNoteRaw(key, value);
    existing[key] = value;
  }
  return Object.keys(existing).length;
}

function shouldUseIncomingNote(currentRaw: string | undefined, incomingRaw: string): boolean {
  if (!currentRaw) return true;
  const currentUpdatedAt = getNoteUpdatedAt(currentRaw);
  const incomingUpdatedAt = getNoteUpdatedAt(incomingRaw);
  if (!currentUpdatedAt || !incomingUpdatedAt) return currentRaw !== incomingRaw;
  return incomingUpdatedAt >= currentUpdatedAt;
}

function getNoteUpdatedAt(raw: string): string | null {
  try {
    const value = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof value.updatedAt === 'string' ? value.updatedAt : null;
  } catch {
    return null;
  }
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
    const request = indexedDB.open(NOTE_DB_NAME, 2);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTE_STORE_NAME)) db.createObjectStore(NOTE_STORE_NAME);
      if (!db.objectStoreNames.contains(NOTE_BACKUP_STORE_NAME)) db.createObjectStore(NOTE_BACKUP_STORE_NAME);
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

async function getBackupRawFromIndexedDb(key: string): Promise<string | null> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTE_BACKUP_STORE_NAME, 'readonly');
    const request = transaction.objectStore(NOTE_BACKUP_STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error('Failed to read note backup.'));
  });
}
async function setRawToIndexedDb(key: string, raw: string): Promise<void> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([NOTE_STORE_NAME, NOTE_BACKUP_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(NOTE_STORE_NAME);
    const backupStore = transaction.objectStore(NOTE_BACKUP_STORE_NAME);
    const currentRequest = store.get(key);
    currentRequest.onsuccess = () => {
      if (typeof currentRequest.result === 'string' && currentRequest.result !== raw) {
        backupStore.put(currentRequest.result, key);
      }
      store.put(raw, key);
    };
    currentRequest.onerror = () => reject(currentRequest.error ?? new Error('Failed to read note before saving.'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save note.'));
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
      if (isCategoryNoteKey(key) && typeof cursor.value === 'string' && isUsableNoteRaw(cursor.value)) result[key] = cursor.value;
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to export notes.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to export notes.'));
  });
}

async function exportIndexedDbNoteBackups(): Promise<Record<string, string>> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const result: Record<string, string> = {};
    const transaction = db.transaction(NOTE_BACKUP_STORE_NAME, 'readonly');
    const request = transaction.objectStore(NOTE_BACKUP_STORE_NAME).openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(sortRecord(result));
        return;
      }
      const key = String(cursor.key);
      if (isCategoryNoteKey(key) && typeof cursor.value === 'string' && isUsableNoteRaw(cursor.value)) result[key] = cursor.value;
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to export note backups.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to export note backups.'));
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

function pickNewestNoteRaw(candidates: Array<string | null>): string | null {
  const validCandidates = candidates.filter((candidate): candidate is string => candidate !== null && isUsableNoteRaw(candidate));
  if (validCandidates.length === 0) return null;
  return validCandidates.reduce((newest, candidate) => {
    const newestUpdatedAt = getNoteUpdatedAt(newest);
    const candidateUpdatedAt = getNoteUpdatedAt(candidate);
    if (!newestUpdatedAt || !candidateUpdatedAt) return candidate;
    return candidateUpdatedAt >= newestUpdatedAt ? candidate : newest;
  });
}
function isUsableNoteRaw(raw: string): boolean {
  try {
    const value = JSON.parse(raw) as { pages?: unknown; dataUrl?: unknown };
    return (Array.isArray(value.pages) && value.pages.length > 0) || typeof value.dataUrl === 'string';
  } catch {
    return false;
  }
}
function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.keys(record).sort().reduce<Record<string, string>>((result, key) => {
    result[key] = record[key];
    return result;
  }, {});
}
