import type { AppData } from './types';

export const APP_DATA_STORAGE_KEY = 'quiz-make-app-data-v1';

const APP_DB_NAME = 'quiz-make-app-data-v1';
const APP_STORE_NAME = 'appData';
const APP_BACKUP_STORE_NAME = 'appDataBackups';
let appDbPromise: Promise<IDBDatabase> | null = null;
let appSaveQueue: Promise<boolean> = Promise.resolve(true);

export function createEmptyAppData(): AppData {
  return {
    version: 1,
    folders: [],
    problemSets: [],
    questions: [],
    progress: [],
    answerLogs: [],
  };
}

export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(APP_DATA_STORAGE_KEY);
    return parseAppDataRaw(raw);
  } catch (error) {
    console.error('Failed to load Quiz make data.', error);
    return createEmptyAppData();
  }
}

export async function loadAppDataAsync(): Promise<AppData> {
  const indexedRaw = await getAppDataRawFromIndexedDb().catch((error) => {
    console.warn('Failed to load Quiz make data from IndexedDB.', error);
    return null;
  });
  const indexedData = tryParseAppDataRaw(indexedRaw);
  if (indexedData) return indexedData;

  const legacyRaw = safeLocalStorageGet(APP_DATA_STORAGE_KEY);
  const legacyData = tryParseAppDataRaw(legacyRaw);
  if (!legacyData) return createEmptyAppData();

  const migrated = await saveAppDataAsync(legacyData);
  if (migrated) safeLocalStorageRemove(APP_DATA_STORAGE_KEY);
  return legacyData;
}

export function saveAppData(data: AppData): boolean {
  void saveAppDataAsync(data);
  return true;
}

export async function saveAppDataAsync(data: AppData): Promise<boolean> {
  const queuedSave = appSaveQueue
    .catch(() => true)
    .then(() => saveAppDataNow(data));
  appSaveQueue = queuedSave;
  return queuedSave;
}

async function saveAppDataNow(data: AppData): Promise<boolean> {
  const raw = JSON.stringify(data);

  if (isIndexedDbAvailable()) {
    try {
      await setAppDataRawToIndexedDb(raw);
      safeLocalStorageRemove(APP_DATA_STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('Failed to save Quiz make data to IndexedDB.', error);
    }
  }

  try {
    localStorage.setItem(APP_DATA_STORAGE_KEY, raw);
    return true;
  } catch (error) {
    console.error('Failed to save Quiz make data.', error);
    return false;
  }
}

export async function exportAppDataRaw(): Promise<string> {
  const indexedRaw = await getAppDataRawFromIndexedDb().catch(() => null);
  if (tryParseAppDataRaw(indexedRaw)) return indexedRaw as string;

  const legacyRaw = safeLocalStorageGet(APP_DATA_STORAGE_KEY);
  if (tryParseAppDataRaw(legacyRaw)) return legacyRaw as string;

  return JSON.stringify(createEmptyAppData());
}

export async function importAppDataRaw(raw: string): Promise<boolean> {
  const data = tryParseAppDataRaw(raw);
  if (!data) return false;
  return saveAppDataAsync(data);
}

export function isAppData(value: unknown): value is AppData {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    Array.isArray(value.folders) &&
    Array.isArray(value.problemSets) &&
    Array.isArray(value.questions) &&
    Array.isArray(value.progress) &&
    Array.isArray(value.answerLogs)
  );
}

export function parseBackupJson(text: string): { ok: true; data: AppData } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isAppData(parsed)) {
      return {
        ok: false,
        error: 'AppData形式ではありません。version, folders, problemSets, questions, progress, answerLogs を確認してください。',
      };
    }
    return { ok: true, data: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `JSONの解析に失敗しました: ${error.message}` : 'JSONの解析に失敗しました。' };
  }
}

function parseAppDataRaw(raw: string | null): AppData {
  return tryParseAppDataRaw(raw) ?? createEmptyAppData();
}

function tryParseAppDataRaw(raw: string | null): AppData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isAppData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openAppDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error('IndexedDB is not available.'));
  if (appDbPromise) return appDbPromise;

  appDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(APP_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APP_STORE_NAME)) db.createObjectStore(APP_STORE_NAME);
      if (!db.objectStoreNames.contains(APP_BACKUP_STORE_NAME)) db.createObjectStore(APP_BACKUP_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open app data database.'));
    request.onblocked = () => reject(new Error('App data database is blocked by another tab.'));
  });

  appDbPromise.catch(() => {
    appDbPromise = null;
  });

  return appDbPromise;
}

async function getAppDataRawFromIndexedDb(): Promise<string | null> {
  if (!isIndexedDbAvailable()) return null;
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([APP_STORE_NAME, APP_BACKUP_STORE_NAME], 'readonly');
    const store = transaction.objectStore(APP_STORE_NAME);
    const backupStore = transaction.objectStore(APP_BACKUP_STORE_NAME);
    const request = store.get(APP_DATA_STORAGE_KEY);
    request.onsuccess = () => {
      if (typeof request.result === 'string' && tryParseAppDataRaw(request.result)) {
        resolve(request.result);
        return;
      }
      const backupRequest = backupStore.get(APP_DATA_STORAGE_KEY);
      backupRequest.onsuccess = () => resolve(typeof backupRequest.result === 'string' ? backupRequest.result : null);
      backupRequest.onerror = () => reject(backupRequest.error ?? new Error('Failed to read app data backup.'));
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read app data.'));
  });
}
async function setAppDataRawToIndexedDb(raw: string): Promise<void> {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([APP_STORE_NAME, APP_BACKUP_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(APP_STORE_NAME);
    const backupStore = transaction.objectStore(APP_BACKUP_STORE_NAME);
    const currentRequest = store.get(APP_DATA_STORAGE_KEY);
    currentRequest.onsuccess = () => {
      if (typeof currentRequest.result === 'string' && currentRequest.result !== raw) {
        backupStore.put(currentRequest.result, APP_DATA_STORAGE_KEY);
      }
      store.put(raw, APP_DATA_STORAGE_KEY);
    };
    currentRequest.onerror = () => reject(currentRequest.error ?? new Error('Failed to read app data before saving.'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save app data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Failed to save app data.'));
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
