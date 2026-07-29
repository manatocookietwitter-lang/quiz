import type { AppData } from './types';

export const APP_DATA_STORAGE_KEY = 'quiz-make-app-data-v1';
export const APP_DATA_FALLBACK_META_KEY = 'quiz-make-app-data-v1:fallback-saved-at';
const APP_DATA_FALLBACK_RECORD_KEY = 'quiz-make-app-data-v1:fallback-record';

const APP_DB_NAME = 'quiz-make-app-data-v1';
const APP_STORE_NAME = 'appData';
const APP_BACKUP_STORE_NAME = 'appDataBackups';
const APP_DATA_IDB_SAVED_AT_KEY = `${APP_DATA_STORAGE_KEY}:saved-at`;
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
    return parseAppDataRaw(getLocalFallbackRecord().raw);
  } catch (error) {
    console.error('Failed to load Quiz make data.', error);
    return createEmptyAppData();
  }
}

export async function loadAppDataAsync(): Promise<AppData> {
  await waitForPendingAppDataSaves();
  const indexedRecord = await getAppDataRecordFromIndexedDb().catch((error) => {
    console.warn('Failed to load Quiz make data from IndexedDB.', error);
    return { raw: null, savedAt: null };
  });
  const fallbackRecord = getLocalFallbackRecord();
  const fallbackRaw = fallbackRecord.raw;
  const preferredRaw = pickPreferredAppDataRaw(
    indexedRecord.raw,
    indexedRecord.savedAt,
    fallbackRaw,
    fallbackRecord.savedAt,
  );
  const preferredData = tryParseAppDataRaw(preferredRaw);
  if (!preferredData) return createEmptyAppData();

  if (preferredRaw === fallbackRaw) {
    // Reconcile a newer localStorage fallback back into IndexedDB when it becomes
    // available again. saveAppDataAsync only removes the fallback after the IDB
    // transaction has completed successfully.
    await saveAppDataAsync(preferredData);
  } else {
    safeLocalStorageRemove(APP_DATA_STORAGE_KEY);
    safeLocalStorageRemove(APP_DATA_FALLBACK_META_KEY);
    safeLocalStorageRemove(APP_DATA_FALLBACK_RECORD_KEY);
  }
  return preferredData;
}

export function saveAppData(data: AppData): Promise<boolean> {
  return saveAppDataAsync(data);
}

export async function saveAppDataAsync(data: AppData): Promise<boolean> {
  const queuedSave = appSaveQueue
    .catch(() => true)
    .then(() => saveAppDataNow(data));
  appSaveQueue = queuedSave;
  return queuedSave;
}

export async function waitForPendingAppDataSaves(): Promise<boolean> {
  try {
    return await appSaveQueue;
  } catch {
    return false;
  }
}

async function saveAppDataNow(data: AppData): Promise<boolean> {
  if (!isAppData(data)) {
    console.error('Refused to save invalid Quiz make data.');
    return false;
  }
  let raw: string;
  try {
    raw = JSON.stringify(data);
  } catch (error) {
    console.error('Failed to serialize Quiz make data.', error);
    return false;
  }
  const savedAt = new Date().toISOString();

  if (isIndexedDbAvailable()) {
    try {
      await setAppDataRawToIndexedDb(raw, savedAt);
      safeLocalStorageRemove(APP_DATA_STORAGE_KEY);
      safeLocalStorageRemove(APP_DATA_FALLBACK_META_KEY);
      safeLocalStorageRemove(APP_DATA_FALLBACK_RECORD_KEY);
      return true;
    } catch (error) {
      console.error('Failed to save Quiz make data to IndexedDB.', error);
    }
  }

  try {
    // Keep payload and timestamp in one localStorage value so a quota failure
    // cannot leave a new payload paired with a missing or stale timestamp.
    localStorage.setItem(APP_DATA_FALLBACK_RECORD_KEY, JSON.stringify({ raw, savedAt }));
    safeLocalStorageRemove(APP_DATA_STORAGE_KEY);
    safeLocalStorageRemove(APP_DATA_FALLBACK_META_KEY);
    return true;
  } catch (error) {
    console.error('Failed to save Quiz make data.', error);
    return false;
  }
}

export async function exportAppDataRaw(): Promise<string> {
  if (!await waitForPendingAppDataSaves()) {
    throw new Error('最新の問題データを端末へ保存できていないため、バックアップを作成できません。');
  }
  const indexedRecord = await getAppDataRecordFromIndexedDb().catch(() => ({ raw: null, savedAt: null }));
  const fallbackRecord = getLocalFallbackRecord();
  const fallbackRaw = fallbackRecord.raw;
  const preferredRaw = pickPreferredAppDataRaw(
    indexedRecord.raw,
    indexedRecord.savedAt,
    fallbackRaw,
    fallbackRecord.savedAt,
  );
  if (tryParseAppDataRaw(preferredRaw)) return preferredRaw as string;

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
    isArrayOf(value.folders, isFolder) &&
    isArrayOf(value.problemSets, isProblemSet) &&
    isArrayOf(value.questions, isQuestion) &&
    isArrayOf(value.progress, isQuestionProgress) &&
    isArrayOf(value.answerLogs, isAnswerLog)
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

function pickPreferredAppDataRaw(
  indexedRaw: string | null,
  indexedSavedAtRaw: string | null,
  fallbackRaw: string | null,
  fallbackSavedAtRaw: string | null,
): string | null {
  const indexedData = tryParseAppDataRaw(indexedRaw);
  const fallbackData = tryParseAppDataRaw(fallbackRaw);
  if (!indexedData) return fallbackData ? fallbackRaw : null;
  if (!fallbackData) return indexedRaw;

  const indexedSavedAt = Date.parse(indexedSavedAtRaw ?? '');
  const fallbackSavedAt = Date.parse(fallbackSavedAtRaw ?? '');
  if (Number.isFinite(indexedSavedAt) && Number.isFinite(fallbackSavedAt)) {
    return fallbackSavedAt >= indexedSavedAt ? fallbackRaw : indexedRaw;
  }
  if (Number.isFinite(fallbackSavedAt)) return fallbackRaw;
  // A valid legacy fallback exists specifically because an IndexedDB save did
  // not complete. If its old two-key timestamp is missing, retain the payload
  // instead of silently reverting to IndexedDB.
  if (Number.isFinite(indexedSavedAt)) return fallbackRaw;

  const indexedFreshness = getAppDataFreshness(indexedData);
  const fallbackFreshness = getAppDataFreshness(fallbackData);
  return fallbackFreshness >= indexedFreshness ? fallbackRaw : indexedRaw;
}

function getAppDataFreshness(data: AppData): number {
  const timestamps = [
    ...data.folders.flatMap((item) => [item.createdAt, item.updatedAt]),
    ...data.problemSets.flatMap((item) => [item.createdAt, item.updatedAt]),
    ...data.questions.flatMap((item) => [item.createdAt, item.updatedAt]),
    ...data.progress.flatMap((item) => item.lastAnsweredAt ? [item.lastAnsweredAt] : []),
    ...data.answerLogs.map((item) => item.answeredAt),
  ];
  return timestamps.reduce((latest, value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
}

function isFolder(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && typeof value.name === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isProblemSet(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.folderId)
    && typeof value.title === 'string'
    && typeof value.source === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isQuestion(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const choices = value.choices;
  if (!Array.isArray(choices) || (choices.length !== 4 && choices.length !== 5)) return false;
  if (!choices.every((choice) => typeof choice === 'string')) return false;
  if (!Number.isInteger(value.answerIndex) || (value.answerIndex as number) < 0 || (value.answerIndex as number) >= choices.length) return false;
  if (value.answerIndexes !== undefined) {
    const answerIndexes = value.answerIndexes;
    if (!Array.isArray(answerIndexes) || answerIndexes.length === 0) return false;
    if (!answerIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < choices.length)) return false;
    if (new Set(answerIndexes).size !== answerIndexes.length) return false;
  }
  return (
    isNonEmptyString(value.id)
    && isNonEmptyString(value.setId)
    && typeof value.question === 'string'
    && typeof value.answerText === 'string'
    && typeof value.explanation === 'string'
    && (value.detailedExplanation === undefined || typeof value.detailedExplanation === 'string')
    && typeof value.sourcePage === 'string'
    && typeof value.category === 'string'
    && typeof value.difficulty === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
  );
}

function isQuestionProgress(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.questionId)
    && isNonNegativeInteger(value.answeredCount)
    && isNonNegativeInteger(value.correctCount)
    && isNonNegativeInteger(value.wrongCount)
    && (value.lastSelectedIndex === null || isSelectedIndex(value.lastSelectedIndex))
    && (value.lastAnswerCorrect === undefined || value.lastAnswerCorrect === null || typeof value.lastAnswerCorrect === 'boolean')
    && (value.lastAnsweredAt === null || typeof value.lastAnsweredAt === 'string')
    && typeof value.isReview === 'boolean'
    && typeof value.isAmbiguous === 'boolean'
    && (value.reviewLevel === null || value.reviewLevel === 1 || value.reviewLevel === 2 || value.reviewLevel === 3)
    && typeof value.isGraduated === 'boolean'
  );
}

function isAnswerLog(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.selectedIndexes !== undefined) {
    if (!Array.isArray(value.selectedIndexes) || !value.selectedIndexes.every(isNonNegativeInteger)) return false;
  }
  return (
    isNonEmptyString(value.id)
    && isNonEmptyString(value.questionId)
    && isNonEmptyString(value.setId)
    && isNonEmptyString(value.folderId)
    && isSelectedIndex(value.selectedIndex)
    && typeof value.isCorrect === 'boolean'
    && typeof value.answeredAt === 'string'
  );
}

function isArrayOf(value: unknown, predicate: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(predicate);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isSelectedIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= -1;
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

async function getAppDataRecordFromIndexedDb(): Promise<{ raw: string | null; savedAt: string | null }> {
  if (!isIndexedDbAvailable()) return { raw: null, savedAt: null };
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([APP_STORE_NAME, APP_BACKUP_STORE_NAME], 'readonly');
    const store = transaction.objectStore(APP_STORE_NAME);
    const backupStore = transaction.objectStore(APP_BACKUP_STORE_NAME);
    const request = store.get(APP_DATA_STORAGE_KEY);
    request.onsuccess = () => {
      if (typeof request.result === 'string' && tryParseAppDataRaw(request.result)) {
        const savedAtRequest = store.get(APP_DATA_IDB_SAVED_AT_KEY);
        savedAtRequest.onsuccess = () => resolve({
          raw: request.result,
          savedAt: typeof savedAtRequest.result === 'string' ? savedAtRequest.result : null,
        });
        savedAtRequest.onerror = () => reject(savedAtRequest.error ?? new Error('Failed to read app data timestamp.'));
        return;
      }
      const backupRequest = backupStore.get(APP_DATA_STORAGE_KEY);
      backupRequest.onsuccess = () => resolve({
        raw: typeof backupRequest.result === 'string' ? backupRequest.result : null,
        savedAt: null,
      });
      backupRequest.onerror = () => reject(backupRequest.error ?? new Error('Failed to read app data backup.'));
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read app data.'));
  });
}
async function setAppDataRawToIndexedDb(raw: string, savedAt: string): Promise<void> {
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
      store.put(savedAt, APP_DATA_IDB_SAVED_AT_KEY);
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

function getLocalFallbackRecord(): { raw: string | null; savedAt: string | null } {
  const atomicRecord = parseFallbackRecord(safeLocalStorageGet(APP_DATA_FALLBACK_RECORD_KEY));
  const legacyRaw = safeLocalStorageGet(APP_DATA_STORAGE_KEY);
  const legacySavedAt = safeLocalStorageGet(APP_DATA_FALLBACK_META_KEY);
  if (!atomicRecord) return { raw: legacyRaw, savedAt: legacySavedAt };
  if (!tryParseAppDataRaw(legacyRaw)) return atomicRecord;

  const preferredRaw = pickPreferredAppDataRaw(
    atomicRecord.raw,
    atomicRecord.savedAt,
    legacyRaw,
    legacySavedAt,
  );
  return preferredRaw === legacyRaw
    ? { raw: legacyRaw, savedAt: legacySavedAt }
    : atomicRecord;
}

function parseFallbackRecord(value: string | null): { raw: string; savedAt: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !isRecord(parsed)
      || typeof parsed.raw !== 'string'
      || typeof parsed.savedAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.savedAt))
      || !tryParseAppDataRaw(parsed.raw)
    ) {
      return null;
    }
    return { raw: parsed.raw, savedAt: parsed.savedAt };
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
