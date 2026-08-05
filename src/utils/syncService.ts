import {
  APP_DATA_FALLBACK_META_KEY,
  APP_DATA_STORAGE_KEY,
  exportAppDataRaw,
  importAppDataRaw,
  isAppData,
  waitForPendingAppDataSaves,
} from '../storage';
import {
  exportCategoryNotesRaw,
  isCategoryNoteKey,
  isValidCategoryNoteRaw,
  replaceCategoryNotesRaw,
  waitForPendingCategoryNoteSaves,
} from './noteStorage';
import {
  clearSyncStateForChangedId,
  isStrongSyncId,
  LAST_REMOTE_UPDATED_AT_KEY,
  LAST_SYNC_AT_KEY,
  LAST_SYNC_ERROR_KEY,
  LAST_SYNC_STATUS_KEY,
  LAST_UPLOAD_HASH_KEY,
} from './syncState';
export type SyncPayload = {
  version: 1;
  updatedAt: string;
  localStorage: Record<string, string>;
  indexedDbNotes?: Record<string, string>;
};

export type SyncResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: 'conflict' };

export type RemoteSyncRecord = {
  syncId: string;
  payload: SyncPayload;
  updatedAt: string;
};

export type RemoteSyncMeta = {
  syncId: string;
  updatedAt: string;
};

export type UploadSyncOptions = {
  expectedRemoteUpdatedAt?: string | null;
  force?: boolean;
};

export type SyncPayloadSummary = {
  keyCount: number;
  byteSize: number;
  folderCount: number;
  problemSetCount: number;
  questionCount: number;
  progressCount: number;
  noteCount: number;
};

export type AutoSyncSettings = {
  enabled: boolean;
  syncId: string;
  configured: boolean;
};

export type LastSyncState = {
  lastSyncAt: string;
  lastUploadHash: string;
  lastRemoteUpdatedAt: string;
  status: string;
  error: string;
};

export type SyncDiagnosticStep = {
  name: string;
  ok: boolean;
  message?: string;
  errorCode?: string;
  errorDetails?: string;
  errorHint?: string;
  suggestion?: string;
};

export type SyncDiagnosticResult = {
  ok: boolean;
  steps: SyncDiagnosticStep[];
};

export type SyncEnvironmentStatus = {
  hasUrl: boolean;
  hasAnonKey: boolean;
  configured: boolean;
  urlHost: string;
};

const SYNC_ID_STORAGE_KEY = 'quizMake:sync:id';
const AUTO_SYNC_ENABLED_KEY = 'quizMake:sync:autoEnabled';
export const SYNC_BACKUP_PREFIX = 'quizMake:sync:backup:';
const SUPABASE_READ_RPC = 'quiz_sync_read';
const SUPABASE_UPSERT_RPC = 'quiz_sync_upsert';
const SUPABASE_PROBE_RPC = 'quiz_sync_probe';
const SUPABASE_DELETE_RPC = 'quiz_sync_delete';
const SUPABASE_TABLE = 'quiz_sync_data';
let syncDataOperationQueue: Promise<void> = Promise.resolve();
let localDataRevision = 0;
const exportedPayloadRevisions = new WeakMap<SyncPayload, number>();

export function isSyncConfigured(): boolean {
  return Boolean(getRemoteSyncConfig());
}

export function getSyncEnvironmentStatus(): SyncEnvironmentStatus {
  const env = import.meta.env as Record<string, string | undefined>;
  const rawUrl = env.VITE_SUPABASE_URL ?? env.VITE_QUIZ_SYNC_SUPABASE_URL ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_QUIZ_SYNC_SUPABASE_ANON_KEY ?? '';
  let urlHost = '';

  try {
    urlHost = rawUrl ? new URL(rawUrl).host : '';
  } catch {
    urlHost = 'URL形式が不正です';
  }

  return {
    hasUrl: Boolean(rawUrl),
    hasAnonKey: Boolean(anonKey),
    configured: Boolean(rawUrl && anonKey),
    urlHost,
  };
}

export function getRemoteSyncConfig(): { url: string; anonKey: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL ?? env.VITE_QUIZ_SYNC_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_QUIZ_SYNC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}


export function clearSyncLocalBackups(): number {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(SYNC_BACKUP_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    return keys.length;
  } catch {
    return 0;
  }
}

export function cleanupLegacySyncBackups(): void {
  clearSyncLocalBackups();
}

export function getStoredSyncId(): string {
  return safeGetItem(SYNC_ID_STORAGE_KEY);
}

export function setStoredSyncId(syncId: string): void {
  try {
    const value = syncId.trim();
    const previousValue = safeGetItem(SYNC_ID_STORAGE_KEY).trim();
    if (value) localStorage.setItem(SYNC_ID_STORAGE_KEY, value);
    else localStorage.removeItem(SYNC_ID_STORAGE_KEY);
    if (clearSyncStateForChangedId(localStorage, previousValue, value)) {
      window.dispatchEvent(new CustomEvent('quiz-make-sync-state-change'));
    }
    dispatchSyncSettingsChanged();
  } catch {
    // Sync ID persistence is convenient, not required for the app to work.
  }
}

export function getAutoSyncSettings(): AutoSyncSettings {
  return {
    enabled: safeGetItem(AUTO_SYNC_ENABLED_KEY) === 'true',
    syncId: getStoredSyncId(),
    configured: isSyncConfigured(),
  };
}

export function setAutoSyncEnabled(enabled: boolean): SyncResult<boolean> {
  const syncId = getStoredSyncId().trim();
  if (enabled && !syncId) return { ok: false, error: '同期IDを入力してください。' };
  if (enabled && !isStrongSyncId(syncId)) return { ok: false, error: '同期IDは「同期IDを生成」で作成した36文字のIDを使用してください。' };
  if (enabled && !isSyncConfigured()) return { ok: false, error: 'Supabaseの環境変数が未設定です。' };

  try {
    localStorage.setItem(AUTO_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
    setLastSyncState({ status: enabled ? '自動同期ON' : '自動同期OFF', error: '' });
    dispatchSyncSettingsChanged();
    return { ok: true, value: enabled };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '自動同期設定の保存に失敗しました。' };
  }
}

export function getLastSyncState(): LastSyncState {
  return {
    lastSyncAt: safeGetItem(LAST_SYNC_AT_KEY),
    lastUploadHash: safeGetItem(LAST_UPLOAD_HASH_KEY),
    lastRemoteUpdatedAt: safeGetItem(LAST_REMOTE_UPDATED_AT_KEY),
    status: safeGetItem(LAST_SYNC_STATUS_KEY),
    error: safeGetItem(LAST_SYNC_ERROR_KEY),
  };
}

export function setLastSyncState(state: Partial<LastSyncState>): void {
  try {
    if (state.lastSyncAt !== undefined) localStorage.setItem(LAST_SYNC_AT_KEY, state.lastSyncAt);
    if (state.lastUploadHash !== undefined) localStorage.setItem(LAST_UPLOAD_HASH_KEY, state.lastUploadHash);
    if (state.lastRemoteUpdatedAt !== undefined) localStorage.setItem(LAST_REMOTE_UPDATED_AT_KEY, state.lastRemoteUpdatedAt);
    if (state.status !== undefined) localStorage.setItem(LAST_SYNC_STATUS_KEY, state.status);
    if (state.error !== undefined) {
      if (state.error) localStorage.setItem(LAST_SYNC_ERROR_KEY, state.error);
      else localStorage.removeItem(LAST_SYNC_ERROR_KEY);
    }
    window.dispatchEvent(new CustomEvent('quiz-make-sync-state-change'));
  } catch {
    // Status is informational only.
  }
}

export function generateSyncId(): string {
  const cryptoApi = globalThis.crypto;
  const bytes = new Uint8Array(18);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function exportQuizMakeData(updatedAt = new Date().toISOString()): Promise<SyncPayload> {
  return runSyncDataOperation(async () => {
    await Promise.all([
      waitForPendingAppDataSaves(),
      waitForPendingCategoryNoteSaves(),
    ]);
    const localStorageData: Record<string, string> = {};
    const keys: string[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isQuizMakeStorageKey(key) && key !== APP_DATA_STORAGE_KEY && !isCategoryNoteKey(key)) keys.push(key);
    }

    keys.sort().forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) localStorageData[key] = value;
    });

    localStorageData[APP_DATA_STORAGE_KEY] = await exportAppDataRaw();

    const payload: SyncPayload = {
      version: 1,
      updatedAt,
      localStorage: localStorageData,
      indexedDbNotes: await exportCategoryNotesRaw(),
    };
    exportedPayloadRevisions.set(payload, localDataRevision);
    return payload;
  });
}

export function importQuizMakeData(payload: SyncPayload): Promise<SyncResult<number>> {
  return runSyncDataOperation(() => importQuizMakeDataUnlocked(payload));
}

async function importQuizMakeDataUnlocked(payload: SyncPayload): Promise<SyncResult<number>> {
  const validation = validateSyncPayload(payload);
  if (!validation.ok) return validation;
  localDataRevision += 1;

  let previousAppDataRaw: string;
  let previousNotes: Record<string, string>;
  let previousLocalStorage: Record<string, string>;
  try {
    previousAppDataRaw = await exportAppDataRaw();
    previousNotes = await exportCategoryNotesRaw();
    previousLocalStorage = collectCurrentQuizMakeLocalStorage();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? `現在のデータを退避できないため、読み込みを中止しました: ${error.message}`
        : '現在のデータを退避できないため、読み込みを中止しました。',
    };
  }

  try {
    const noteEntries: Record<string, string> = { ...(validation.value.indexedDbNotes ?? {}) };
    const nextLocalStorage: Record<string, string> = {};
    Object.entries(validation.value.localStorage).forEach(([key, value]) => {
      if (key === APP_DATA_STORAGE_KEY) return;
      if (isCategoryNoteKey(key)) {
        noteEntries[key] = value;
        return;
      }
      if (isQuizMakeStorageKey(key)) nextLocalStorage[key] = value;
    });

    const appDataRaw = validation.value.localStorage[APP_DATA_STORAGE_KEY] as string;
    const importedAppData = await importAppDataRaw(appDataRaw);
    if (!importedAppData) {
      throw new Error('同期データの問題データを保存できませんでした。');
    }

    const noteCount = await replaceCategoryNotesRaw(noteEntries);
    replaceQuizMakeLocalStorage(nextLocalStorage);

    setLastSyncState({
      lastSyncAt: validation.value.updatedAt,
      lastRemoteUpdatedAt: validation.value.updatedAt,
      lastUploadHash: computePayloadHash(validation.value),
      status: 'クラウドから読み込みました',
      error: '',
    });

    const localStorageCount = Object.keys(validation.value.localStorage).filter((key) => !isCategoryNoteKey(key)).length;
    return { ok: true, value: localStorageCount + noteCount };
  } catch (error) {
    const rollback = await restoreImportedData(previousAppDataRaw, previousNotes, previousLocalStorage);
    const rollbackSuffix = rollback.ok
      ? '既存データへ戻しました。'
      : `既存データの復元にも失敗しました: ${rollback.error}`;
    return {
      ok: false,
      error: isQuotaExceededError(error)
        ? `端末内の保存容量がいっぱいです。同期バックアップを整理するか、不要なノートデータを減らしてください。${rollbackSuffix}`
        : error instanceof Error
          ? `同期データの読み込みに失敗しました: ${error.message} ${rollbackSuffix}`
          : `同期データの読み込みに失敗しました。${rollbackSuffix}`,
    };
  }
}
export async function uploadSyncData(
  syncId: string,
  payload: SyncPayload,
  options: UploadSyncOptions = {},
): Promise<SyncResult<RemoteSyncRecord>> {
  return runSyncDataOperation(() => uploadSyncDataUnlocked(syncId, payload, options));
}

async function uploadSyncDataUnlocked(
  syncId: string,
  payload: SyncPayload,
  options: UploadSyncOptions,
): Promise<SyncResult<RemoteSyncRecord>> {
  const exportedRevision = exportedPayloadRevisions.get(payload);
  if (exportedRevision !== undefined && exportedRevision !== localDataRevision) {
    return {
      ok: false,
      error: 'クラウドへの保存準備後に端末データが読み込まれたため、古い内容の送信を中止しました。もう一度保存してください。',
    };
  }
  const normalizedSyncId = syncId.trim();
  if (!normalizedSyncId) return { ok: false, error: '同期IDを入力してください。' };
  if (!isStrongSyncId(normalizedSyncId)) return { ok: false, error: '同期IDは「同期IDを生成」で作成した36文字のIDを使用してください。' };

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'Supabaseの環境変数が未設定です。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。' };

  const validation = validateSyncPayload(payload);
  if (!validation.ok) return validation;

  try {
    const updatedAt = new Date().toISOString();
    const uploadPayload = { ...validation.value, updatedAt };
    let response = await fetch(`${config.url}/rest/v1/rpc/${SUPABASE_UPSERT_RPC}`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey),
      body: JSON.stringify({
        p_sync_id: normalizedSyncId,
        p_data: uploadPayload,
        p_updated_at: updatedAt,
        p_expected_updated_at: options.expectedRemoteUpdatedAt ?? null,
        p_force: options.force ?? false,
      }),
    });

    if (!response.ok && await isMissingSyncRpc(response)) {
      const compatibilityResult = await uploadWithLegacyTable(
        config,
        normalizedSyncId,
        uploadPayload,
        updatedAt,
        options,
      );
      if (!compatibilityResult.ok) return compatibilityResult;
      response = compatibilityResult.value;
    }

    if (!response.ok) {
      const details = await readSupabaseError(response);
      const isConflict = details.code === '40001' || details.message.includes('quiz_sync_conflict');
      return {
        ok: false,
        code: isConflict ? 'conflict' : undefined,
        error: isConflict
          ? 'クラウド側に、この端末が最後に確認したものより新しいデータがあります。先にクラウドから読み込んでください。'
          : `クラウドへの保存に失敗しました。${details.message ? ` ${details.message}` : ''}`,
      };
    }

    const rows = (await response.json()) as unknown;
    const first = Array.isArray(rows) ? rows[0] : null;
    const record = parseRemoteRecord(first, normalizedSyncId, uploadPayload, updatedAt);
    if (!record.ok) return record;

    setStoredSyncId(normalizedSyncId);
    setLastSyncState({
      lastSyncAt: record.value.updatedAt,
      lastUploadHash: computePayloadHash(uploadPayload),
      lastRemoteUpdatedAt: record.value.updatedAt,
      status: 'クラウドへ保存しました',
      error: '',
    });
    return record;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `クラウドへの保存に失敗しました: ${error.message}` : 'クラウドへの保存に失敗しました。',
    };
  }
}

export async function downloadSyncData(syncId: string): Promise<SyncResult<RemoteSyncRecord | null>> {
  const normalizedSyncId = syncId.trim();
  if (!normalizedSyncId) return { ok: false, error: '同期IDを入力してください。' };
  if (!isStrongSyncId(normalizedSyncId)) return { ok: false, error: '同期IDは「同期IDを生成」で作成した36文字のIDを使用してください。' };

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'Supabaseの環境変数が未設定です。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。' };

  try {
    let response = await fetch(`${config.url}/rest/v1/rpc/${SUPABASE_READ_RPC}`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey),
      body: JSON.stringify({ p_sync_id: normalizedSyncId }),
    });

    if (!response.ok && await isMissingSyncRpc(response)) {
      response = await fetchLegacySyncRow(config, normalizedSyncId, 'sync_id,data,updated_at');
    }

    if (!response.ok) return { ok: false, error: await responseError(response, 'クラウドからの読み込みに失敗しました。') };

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, value: null };

    const record = parseRemoteRecord(rows[0], normalizedSyncId);
    if (!record.ok) return record;
    setStoredSyncId(normalizedSyncId);
    setLastSyncState({ lastRemoteUpdatedAt: record.value.updatedAt });
    return record;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `クラウドからの読み込みに失敗しました: ${error.message}` : 'クラウドからの読み込みに失敗しました。',
    };
  }
}

export async function getRemoteSyncMeta(syncId: string): Promise<SyncResult<RemoteSyncMeta | null>> {
  const normalizedSyncId = syncId.trim();
  if (!normalizedSyncId) return { ok: false, error: '同期IDを入力してください。' };
  if (!isStrongSyncId(normalizedSyncId)) return { ok: false, error: '同期IDは「同期IDを生成」で作成した36文字のIDを使用してください。' };

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'Supabaseの環境変数が未設定です。' };

  try {
    let response = await fetch(`${config.url}/rest/v1/rpc/${SUPABASE_READ_RPC}`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey),
      body: JSON.stringify({ p_sync_id: normalizedSyncId }),
    });

    if (!response.ok && await isMissingSyncRpc(response)) {
      response = await fetchLegacySyncRow(config, normalizedSyncId, 'sync_id,updated_at');
    }

    if (!response.ok) return { ok: false, error: await responseError(response, 'クラウドの更新確認に失敗しました。') };
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, value: null };
    const row = rows[0];
    if (!isRecord(row) || typeof row.updated_at !== 'string') return { ok: false, error: 'クラウドの更新情報の形式が正しくありません。' };
    return { ok: true, value: { syncId: typeof row.sync_id === 'string' ? row.sync_id : normalizedSyncId, updatedAt: row.updated_at } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `クラウドの更新確認に失敗しました: ${error.message}` : 'クラウドの更新確認に失敗しました。',
    };
  }
}


export async function runSyncDiagnostic(syncId: string): Promise<SyncDiagnosticResult> {
  const steps: SyncDiagnosticStep[] = [];
  const envStatus = getSyncEnvironmentStatus();
  const normalizedSyncId = syncId.trim();

  const addStep = (step: SyncDiagnosticStep) => steps.push(step);

  addStep({
    name: 'Supabase URL',
    ok: envStatus.hasUrl,
    message: envStatus.hasUrl ? `設定済み${envStatus.urlHost ? ` (${envStatus.urlHost})` : ''}` : '未設定',
  });
  addStep({ name: 'anon key', ok: envStatus.hasAnonKey, message: envStatus.hasAnonKey ? '設定済み' : '未設定' });
  addStep({
    name: '同期ID',
    ok: isStrongSyncId(normalizedSyncId),
    message: !normalizedSyncId
      ? '未入力'
      : isStrongSyncId(normalizedSyncId)
        ? '安全な36文字IDです'
        : '「同期IDを生成」で作成した36文字のIDを使用してください',
  });

  let exportedPayload: SyncPayload | null = null;
  try {
    exportedPayload = await exportQuizMakeData();
    addStep({ name: 'localStorage export', ok: true, message: `${Object.keys(exportedPayload.localStorage).length}件のキーをexportできます` });
  } catch (error) {
    addStep({
      name: 'localStorage export',
      ok: false,
      message: '端末データのexportに失敗しました',
      errorDetails: error instanceof Error ? error.message : String(error),
    });
  }

  const config = getRemoteSyncConfig();
  if (!config || !isStrongSyncId(normalizedSyncId) || !exportedPayload) {
    addStep({
      name: 'テーブル接続',
      ok: false,
      message: 'Supabase設定、同期ID、またはexport結果が不足しているため中止しました',
    });
    return { ok: steps.every((step) => step.ok), steps };
  }

  try {
    const probeResponse = await fetch(`${config.url}/rest/v1/rpc/${SUPABASE_PROBE_RPC}`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey),
      body: JSON.stringify({ p_sync_id: normalizedSyncId }),
    });
    addStep(await responseToDiagnosticStep(probeResponse, '安全な同期RPC', '同期IDを限定したRPCへ接続できます'));
    if (!probeResponse.ok) return { ok: false, steps };
  } catch (error) {
    addStep(exceptionToDiagnosticStep('安全な同期RPC', error));
    return { ok: false, steps };
  }

  try {
    const readResult = await downloadSyncData(normalizedSyncId);
    addStep(readResult.ok
      ? {
          name: '同期ID限定の読み込み',
          ok: true,
          message: readResult.value ? 'この同期IDのデータを読み込めます' : '接続できました（この同期IDのデータはまだありません）',
        }
      : {
          name: '同期ID限定の読み込み',
          ok: false,
          message: readResult.error,
          suggestion: getDiagnosticSuggestion(readResult.error),
        });
  } catch (error) {
    addStep(exceptionToDiagnosticStep('同期ID限定の読み込み', error));
  }

  return { ok: steps.every((step) => step.ok), steps };
}

export function computePayloadHash(payload: SyncPayload): string {
  const text = JSON.stringify({ version: payload.version, localStorage: sortRecord(payload.localStorage), indexedDbNotes: sortRecord(payload.indexedDbNotes ?? {}) });
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}


export function summarizeSyncPayload(payload: SyncPayload): SyncPayloadSummary {
  const appDataRaw = payload.localStorage[APP_DATA_STORAGE_KEY];
  let folderCount = 0;
  let problemSetCount = 0;
  let questionCount = 0;
  let progressCount = 0;

  if (appDataRaw) {
    try {
      const parsed = JSON.parse(appDataRaw) as Record<string, unknown>;
      folderCount = Array.isArray(parsed.folders) ? parsed.folders.length : 0;
      problemSetCount = Array.isArray(parsed.problemSets) ? parsed.problemSets.length : 0;
      questionCount = Array.isArray(parsed.questions) ? parsed.questions.length : 0;
      progressCount = Array.isArray(parsed.progress) ? parsed.progress.length : 0;
    } catch {
      // Summary only. Invalid app data is handled by the normal app loader/import path.
    }
  }

  const noteKeys = new Set([
    ...Object.keys(payload.localStorage).filter(isCategoryNoteKey),
    ...Object.keys(payload.indexedDbNotes ?? {}).filter(isCategoryNoteKey),
  ]);
  const noteCount = noteKeys.size;
  const text = JSON.stringify({ localStorage: payload.localStorage, indexedDbNotes: payload.indexedDbNotes ?? {} });
  const byteSize = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(text).length
    : text.length;

  return {
    keyCount: Object.keys(payload.localStorage).length,
    byteSize,
    folderCount,
    problemSetCount,
    questionCount,
    progressCount,
    noteCount,
  };
}

export function validateSyncPayload(value: unknown): SyncResult<SyncPayload> {
  if (!isRecord(value)) return { ok: false, error: '同期データの形式が正しくありません。' };
  if (value.version !== 1) return { ok: false, error: '同期データのversionに対応していません。' };
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    return { ok: false, error: '同期データのupdatedAtが正しくありません。' };
  }
  if (!isStringRecord(value.localStorage)) return { ok: false, error: '同期データのlocalStorage形式が正しくありません。' };

  const invalidKey = Object.keys(value.localStorage).find((key) => !isQuizMakeStorageKey(key));
  if (invalidKey) return { ok: false, error: 'Quiz make以外のキーが含まれています: ' + invalidKey };

  const indexedDbNotesValue = value.indexedDbNotes;
  if (indexedDbNotesValue !== undefined && !isStringRecord(indexedDbNotesValue)) {
    return { ok: false, error: '同期データのindexedDbNotes形式が正しくありません。' };
  }
  const indexedDbNotes = indexedDbNotesValue ?? {};
  const invalidNoteKey = Object.keys(indexedDbNotes).find((key) => !isCategoryNoteKey(key));
  if (invalidNoteKey) return { ok: false, error: 'ノート以外のキーが含まれています: ' + invalidNoteKey };
  const invalidIndexedNote = Object.entries(indexedDbNotes).find(([, raw]) => !isValidCategoryNoteRaw(raw));
  if (invalidIndexedNote) return { ok: false, error: `ノートデータの形式が正しくありません: ${invalidIndexedNote[0]}` };

  const invalidLegacyNote = Object.entries(value.localStorage)
    .find(([key, raw]) => isCategoryNoteKey(key) && !isValidCategoryNoteRaw(raw));
  if (invalidLegacyNote) return { ok: false, error: `ノートデータの形式が正しくありません: ${invalidLegacyNote[0]}` };

  const appDataRaw = value.localStorage[APP_DATA_STORAGE_KEY];
  if (appDataRaw === undefined) {
    return { ok: false, error: '同期データに問題データがありません。既存データは変更していません。' };
  }
  try {
    const appData = JSON.parse(appDataRaw) as unknown;
    if (!isAppData(appData)) {
      return { ok: false, error: '同期データの問題データ形式が正しくありません。既存データは変更していません。' };
    }
  } catch {
    return { ok: false, error: '同期データの問題データJSONを読み込めません。既存データは変更していません。' };
  }

  return {
    ok: true,
    value: {
      version: 1,
      updatedAt: value.updatedAt,
      localStorage: sortRecord(value.localStorage),
      indexedDbNotes: sortRecord(indexedDbNotes),
    },
  };
}

export async function deleteRemoteSyncData(syncId: string): Promise<SyncResult<boolean>> {
  const normalizedSyncId = syncId.trim();
  if (!normalizedSyncId) return { ok: false, error: '同期IDを入力してください。' };
  if (!isStrongSyncId(normalizedSyncId)) return { ok: false, error: '同期IDは「同期IDを生成」で作成した36文字のIDを使用してください。' };

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'クラウド同期が設定されていません。' };

  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/${SUPABASE_DELETE_RPC}`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey),
      body: JSON.stringify({ p_sync_id: normalizedSyncId }),
    });
    if (!response.ok) return { ok: false, error: await responseError(response, 'クラウドデータの削除に失敗しました。') };
    const deleted = await response.json() as unknown;
    setAutoSyncEnabled(false);
    setLastSyncState({ lastRemoteUpdatedAt: '', lastUploadHash: '', status: 'クラウドデータ削除済み', error: '' });
    return { ok: true, value: deleted === true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `クラウドデータの削除に失敗しました: ${error.message}` : 'クラウドデータの削除に失敗しました。',
    };
  }
}

async function responseToDiagnosticStep(response: Response, name: string, successMessage: string): Promise<SyncDiagnosticStep> {
  if (response.ok) return { name, ok: true, message: successMessage };

  const details = await readSupabaseError(response);
  const combined = [details.message, details.code, details.details, details.hint].filter(Boolean).join(' ');
  return {
    name,
    ok: false,
    message: details.message || `HTTP ${response.status}`,
    errorCode: details.code || String(response.status),
    errorDetails: details.details,
    errorHint: details.hint,
    suggestion: getDiagnosticSuggestion(combined),
  };
}

function exceptionToDiagnosticStep(name: string, error: unknown): SyncDiagnosticStep {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name,
    ok: false,
    message,
    errorDetails: message,
    suggestion: getDiagnosticSuggestion(message),
  };
}

async function isMissingSyncRpc(response: Response): Promise<boolean> {
  const details = await readSupabaseError(response.clone());
  const message = details.message.toLowerCase();
  return details.code?.toLowerCase() === 'pgrst202'
    || message.includes('could not find the function');
}

async function fetchLegacySyncRow(
  config: { url: string; anonKey: string },
  syncId: string,
  select: string,
): Promise<Response> {
  const encodedSyncId = encodeURIComponent(syncId);
  return fetch(
    `${config.url}/rest/v1/${SUPABASE_TABLE}?sync_id=eq.${encodedSyncId}&select=${encodeURIComponent(select)}`,
    {
      method: 'GET',
      headers: createSupabaseHeaders(config.anonKey),
    },
  );
}

async function uploadWithLegacyTable(
  config: { url: string; anonKey: string },
  syncId: string,
  payload: SyncPayload,
  updatedAt: string,
  options: UploadSyncOptions,
): Promise<SyncResult<Response>> {
  if (!(options.force ?? false)) {
    const currentResponse = await fetchLegacySyncRow(config, syncId, 'updated_at');
    if (!currentResponse.ok) {
      return { ok: false, error: await responseError(currentResponse, 'クラウドの競合確認に失敗しました。') };
    }
    const currentRows = await currentResponse.json() as unknown;
    const currentRow = Array.isArray(currentRows) && isRecord(currentRows[0]) ? currentRows[0] : null;
    if (currentRow && typeof currentRow.updated_at === 'string') {
      const expected = options.expectedRemoteUpdatedAt;
      if (!expected || !sameTimestamp(currentRow.updated_at, expected)) {
        return {
          ok: false,
          code: 'conflict',
          error: 'クラウド側に、この端末が最後に確認したものより新しいデータがあります。先にクラウドから読み込んでください。',
        };
      }
    }
  }

  const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?on_conflict=sync_id`, {
    method: 'POST',
    headers: createSupabaseHeaders(config.anonKey, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify([{ sync_id: syncId, data: payload, updated_at: updatedAt }]),
  });
  return { ok: true, value: response };
}

function sameTimestamp(first: string, second: string): boolean {
  const firstTime = Date.parse(first);
  const secondTime = Date.parse(second);
  if (Number.isFinite(firstTime) && Number.isFinite(secondTime)) return firstTime === secondTime;
  return first === second;
}

async function readSupabaseError(response: Response): Promise<{ message: string; code?: string; details?: string; hint?: string }> {
  try {
    const text = await response.text();
    if (!text) return { message: `HTTP ${response.status}` };
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return {
        message: typeof parsed.message === 'string' ? parsed.message : text,
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        details: typeof parsed.details === 'string' ? parsed.details : undefined,
        hint: typeof parsed.hint === 'string' ? parsed.hint : undefined,
      };
    } catch {
      return { message: text };
    }
  } catch {
    return { message: `HTTP ${response.status}` };
  }
}

function getDiagnosticSuggestion(errorText: string): string | undefined {
  const value = errorText.toLowerCase();
  if (value.includes('invalid api key') || value.includes('jwt')) {
    return 'anon key が間違っている、空、またはURLと別プロジェクトのkeyの可能性があります。GitHub Secrets の VITE_SUPABASE_ANON_KEY を確認してください。';
  }
  if (value.includes('relation') && value.includes('quiz_sync_data') && value.includes('does not exist')) {
    return 'Supabase側に quiz_sync_data テーブルがまだ作成されていません。';
  }
  if (
    value.includes('quiz_sync_read')
    || value.includes('quiz_sync_upsert')
    || value.includes('quiz_sync_probe')
    || value.includes('could not find the function')
    || value.includes('pgrst202')
  ) {
    return 'Supabaseへ最新の安全な同期RPCマイグレーションを適用してください。';
  }
  if (value.includes('permission denied') || value.includes('row-level security') || value.includes('rls')) {
    return 'テーブル権限またはRLS設定でブロックされている可能性があります。';
  }
  if (value.includes('failed to fetch') || value.includes('networkerror') || value.includes('load failed')) {
    return 'Supabase URLが間違っている、ネットワーク接続、CORS、またはプロジェクト停止の可能性があります。';
  }
  return undefined;
}

function createSupabaseHeaders(anonKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function responseError(response: Response, fallback: string) {
  try {
    const text = await response.text();
    return text ? `${fallback} ${text}` : fallback;
  } catch {
    return fallback;
  }
}

function parseRemoteRecord(value: unknown, fallbackSyncId: string, fallbackPayload?: SyncPayload, fallbackUpdatedAt?: string): SyncResult<RemoteSyncRecord> {
  if (!isRecord(value)) {
    if (fallbackPayload && fallbackUpdatedAt) {
      return { ok: true, value: { syncId: fallbackSyncId, payload: fallbackPayload, updatedAt: fallbackUpdatedAt } };
    }
    return { ok: false, error: 'クラウドデータの形式が正しくありません。' };
  }

  const payload = value.data ?? fallbackPayload;
  const validation = validateSyncPayload(payload);
  if (!validation.ok) return validation;

  return {
    ok: true,
    value: {
      syncId: typeof value.sync_id === 'string' ? value.sync_id : fallbackSyncId,
      payload: validation.value,
      updatedAt: typeof value.updated_at === 'string' ? value.updated_at : fallbackUpdatedAt ?? validation.value.updatedAt,
    },
  };
}

function collectCurrentQuizMakeLocalStorage(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !isQuizMakeStorageKey(key) || key === APP_DATA_STORAGE_KEY || isCategoryNoteKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) result[key] = value;
    }
  } catch {
    // Best effort snapshot only.
  }
  return result;
}

async function restoreImportedData(
  appDataRaw: string,
  notes: Record<string, string>,
  localStorageSnapshot: Record<string, string>,
): Promise<SyncResult<true>> {
  const failures: string[] = [];
  try {
    if (!await importAppDataRaw(appDataRaw)) failures.push('問題データ');
  } catch {
    failures.push('問題データ');
  }
  try {
    await replaceCategoryNotesRaw(notes);
  } catch {
    failures.push('ノート');
  }
  try {
    replaceQuizMakeLocalStorage(localStorageSnapshot);
  } catch {
    failures.push('設定');
  }
  return failures.length === 0
    ? { ok: true, value: true }
    : { ok: false, error: `${failures.join('・')}を元に戻せませんでした。` };
}

function replaceQuizMakeLocalStorage(next: Record<string, string>): void {
  const before = collectCurrentQuizMakeLocalStorage();
  try {
    const keysToRemove = Object.keys(before).filter((key) => next[key] === undefined);
    Object.entries(next).forEach(([key, value]) => localStorage.setItem(key, value));
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    try {
      Object.keys(collectCurrentQuizMakeLocalStorage()).forEach((key) => localStorage.removeItem(key));
      Object.entries(before).forEach(([key, value]) => localStorage.setItem(key, value));
    } catch {
      // The outer import transaction reports that rollback was incomplete.
    }
    throw error;
  }
}
function isQuizMakeStorageKey(key: string): boolean {
  if (key === APP_DATA_FALLBACK_META_KEY) return false;
  if (key.startsWith('quizMake:sync:')) return false;
  if (key.startsWith(SYNC_BACKUP_PREFIX)) return false;
  return key === APP_DATA_STORAGE_KEY || key.startsWith('quizMake:') || key.startsWith('quiz-make:');
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

function runSyncDataOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = syncDataOperationQueue.then(operation, operation);
  syncDataOperationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function safeGetItem(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function dispatchSyncSettingsChanged() {
  window.dispatchEvent(new CustomEvent('quiz-make-sync-settings-change'));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
