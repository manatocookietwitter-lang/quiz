import { advanceLocalDataRevision } from './localDataRevision';

const NOTE_DB_NAME = 'quiz-make-notes-v1';
const NOTE_STORE_NAME = 'categoryNotes';
const NOTE_BACKUP_STORE_NAME = 'categoryNoteBackups';
export const CATEGORY_NOTE_KEY_PREFIX = 'quizMake:notes:';

let dbPromise: Promise<IDBDatabase> | null = null;
let persistenceRequested = false;
let noteSaveQueue: Promise<unknown> = Promise.resolve();

export function isCategoryNoteKey(key: string): boolean {
  return key.startsWith(CATEGORY_NOTE_KEY_PREFIX);
}

export function isCategoryNoteKeyForProblemSetIds(key: string, problemSetIds: Iterable<string>): boolean {
  if (!isCategoryNoteKey(key)) return false;
  for (const problemSetId of problemSetIds) {
    if (typeof problemSetId !== 'string' || problemSetId.length === 0) continue;
    if (key.startsWith(`${CATEGORY_NOTE_KEY_PREFIX}${problemSetId}:`)) return true;
  }
  return false;
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
  return enqueueCategoryNoteOperation(() => saveCategoryNoteRawNow(key, raw));
}

export async function waitForPendingCategoryNoteSaves(): Promise<void> {
  await noteSaveQueue;
}

export async function deleteCategoryNotesForProblemSetIds(problemSetIds: Iterable<string>): Promise<number> {
  const ids = new Set(Array.from(problemSetIds).filter((id) => typeof id === 'string' && id.length > 0));
  if (ids.size === 0) return 0;
  return enqueueCategoryNoteOperation(() => deleteCategoryNotesWhere((key) => (
    isCategoryNoteKeyForProblemSetIds(key, ids)
  )));
}

export async function deleteAllCategoryNotes(): Promise<number> {
  return enqueueCategoryNoteOperation(() => deleteCategoryNotesWhere(isCategoryNoteKey));
}

function enqueueCategoryNoteOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queuedOperation = noteSaveQueue
    .catch(() => undefined)
    .then(async () => {
      const result = await operation();
      advanceLocalDataRevision();
      return result;
    });
  noteSaveQueue = queuedOperation;
  return queuedOperation;
}

async function deleteCategoryNotesWhere(predicate: (key: string) => boolean): Promise<number> {
  const localNotes = collectLegacyLocalStorageNotesOrThrow(predicate);
  removeLegacyLocalStorageNotesOrThrow(localNotes);

  try {
    const indexedDbKeys = isIndexedDbAvailable()
      ? await deleteIndexedDbNotesWhere(predicate)
      : new Set<string>();
    return new Set([...localNotes.map(([key]) => key), ...indexedDbKeys]).size;
  } catch (error) {
    try {
      restoreLegacyLocalStorageNotes(localNotes);
    } catch (rollbackError) {
      throw new Error(
        `Failed to delete category notes and restore their local fallback copies. `
        + `Delete error: ${getErrorMessage(error)} Restore error: ${getErrorMessage(rollbackError)}`,
      );
    }
    throw error;
  }
}

async function saveCategoryNoteRawNow(key: string, raw: string): Promise<void> {
  if (!isCategoryNoteKey(key)) throw new Error('Invalid category note key.');
  if (!isUsableNoteRaw(raw)) throw new Error('Invalid category note data.');

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
  await waitForPendingCategoryNoteSaves();
  let indexedNotes: Record<string, string> = {};
  let indexedBackups: Record<string, string> = {};

  if (isIndexedDbAvailable()) {
    try {
      indexedNotes = await exportIndexedDbNotes();
    } catch (error) {
      console.warn('Failed to export category notes from IndexedDB.', error);
    }
  }

  if (isIndexedDbAvailable()) {
    try {
      indexedBackups = await exportIndexedDbNoteBackups();
    } catch (error) {
      console.warn('Failed to export category note backups from IndexedDB.', error);
    }
  }

  const localFallbacks = Object.fromEntries(collectLegacyLocalStorageNotes());
  const keys = new Set([
    ...Object.keys(indexedNotes),
    ...Object.keys(indexedBackups),
    ...Object.keys(localFallbacks),
  ]);
  const notes: Record<string, string> = {};
  keys.forEach((key) => {
    const newest = pickNewestNoteRaw([
      indexedNotes[key] ?? null,
      indexedBackups[key] ?? null,
      localFallbacks[key] ?? null,
    ]);
    if (newest !== null) notes[key] = newest;
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
export function replaceCategoryNotesRaw(notes: Record<string, string>): Promise<number> {
  const validNotes = sortRecord(Object.keys(notes).reduce<Record<string, string>>((result, key) => {
    if (isCategoryNoteKey(key) && typeof notes[key] === 'string' && isUsableNoteRaw(notes[key])) result[key] = notes[key];
    return result;
  }, {}));

  return enqueueCategoryNoteOperation(async () => {
    if (isIndexedDbAvailable()) {
      await replaceIndexedDbNotes(validNotes);
      removeAllLegacyLocalStorageNotes();
      return Object.keys(validNotes).length;
    }

    removeAllLegacyLocalStorageNotes();
    Object.entries(validNotes).forEach(([key, value]) => localStorage.setItem(key, value));
    return Object.keys(validNotes).length;
  });
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

async function deleteIndexedDbNotesWhere(predicate: (key: string) => boolean): Promise<Set<string>> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const deletedKeys = new Set<string>();
    const transaction = db.transaction([NOTE_STORE_NAME, NOTE_BACKUP_STORE_NAME], 'readwrite');

    [NOTE_STORE_NAME, NOTE_BACKUP_STORE_NAME].forEach((storeName) => {
      const request = transaction.objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (predicate(key)) {
          cursor.delete();
          deletedKeys.add(key);
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to inspect category notes for deletion.'));
    });

    transaction.oncomplete = () => resolve(deletedKeys);
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to delete category notes.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Failed to delete category notes.'));
  });
}

async function replaceIndexedDbNotes(notes: Record<string, string>): Promise<void> {
  const db = await openNoteDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([NOTE_STORE_NAME, NOTE_BACKUP_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(NOTE_STORE_NAME);
    const backupStore = transaction.objectStore(NOTE_BACKUP_STORE_NAME);
    store.clear();
    backupStore.clear();
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

function collectLegacyLocalStorageNotesOrThrow(predicate: (key: string) => boolean): Array<[string, string]> {
  if (typeof localStorage === 'undefined') return [];
  const notes: Array<[string, string]> = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !predicate(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) notes.push([key, value]);
    }
    return notes;
  } catch (error) {
    throw new Error(`Failed to inspect local category notes. ${getErrorMessage(error)}`);
  }
}

function removeLegacyLocalStorageNotesOrThrow(notes: Array<[string, string]>): void {
  if (notes.length === 0) return;
  const removed: Array<[string, string]> = [];
  try {
    notes.forEach(([key, value]) => {
      localStorage.removeItem(key);
      removed.push([key, value]);
    });
  } catch (error) {
    try {
      restoreLegacyLocalStorageNotes(removed);
    } catch (rollbackError) {
      throw new Error(
        `Failed to delete local category notes and restore the notes already removed. `
        + `Delete error: ${getErrorMessage(error)} Restore error: ${getErrorMessage(rollbackError)}`,
      );
    }
    throw new Error(`Failed to delete local category notes. ${getErrorMessage(error)}`);
  }
}

function restoreLegacyLocalStorageNotes(notes: Array<[string, string]>): void {
  notes.forEach(([key, value]) => localStorage.setItem(key, value));
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function pickNewestNoteRaw(candidates: Array<string | null>): string | null {
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
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return false;
    if (Array.isArray(value.pages)) {
      return value.pages.length > 0
        && value.pages.every((page) => (
          isRecord(page)
          && typeof page.id === 'string'
          && typeof page.dataUrl === 'string'
          && typeof page.updatedAt === 'string'
        ))
        && typeof value.problemSetId === 'string'
        && typeof value.category === 'string'
        && Number.isInteger(value.currentPageIndex)
        && (value.currentPageIndex as number) >= 0
        && (value.currentPageIndex as number) < value.pages.length
        && typeof value.updatedAt === 'string';
    }
    return typeof value.dataUrl === 'string';
  } catch {
    return false;
  }
}

export function isValidCategoryNoteRaw(raw: string): boolean {
  return isUsableNoteRaw(raw);
}
function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.keys(record).sort().reduce<Record<string, string>>((result, key) => {
    result[key] = record[key];
    return result;
  }, {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
