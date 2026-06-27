export type SyncPayload = {
  version: 1;
  updatedAt: string;
  localStorage: Record<string, string>;
};

export type SyncResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type RemoteSyncRecord = {
  syncId: string;
  payload: SyncPayload;
  updatedAt: string;
};

export type RemoteSyncMeta = {
  syncId: string;
  updatedAt: string;
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
const LAST_SYNC_AT_KEY = 'quizMake:sync:lastSyncAt';
const LAST_UPLOAD_HASH_KEY = 'quizMake:sync:lastUploadHash';
const LAST_REMOTE_UPDATED_AT_KEY = 'quizMake:sync:lastRemoteUpdatedAt';
const LAST_SYNC_STATUS_KEY = 'quizMake:sync:lastStatus';
const LAST_SYNC_ERROR_KEY = 'quizMake:sync:lastError';
export const SYNC_BACKUP_PREFIX = 'quizMake:sync:backup:';
const SUPABASE_TABLE = 'quiz_sync_data';

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
    if (value) localStorage.setItem(SYNC_ID_STORAGE_KEY, value);
    else localStorage.removeItem(SYNC_ID_STORAGE_KEY);
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

export function exportQuizMakeData(updatedAt = new Date().toISOString()): SyncPayload {
  const localStorageData: Record<string, string> = {};
  const keys: string[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && isQuizMakeStorageKey(key)) keys.push(key);
  }

  keys.sort().forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) localStorageData[key] = value;
  });

  return {
    version: 1,
    updatedAt,
    localStorage: localStorageData,
  };
}

export function importQuizMakeData(payload: SyncPayload): SyncResult<number> {
  const validation = validateSyncPayload(payload);
  if (!validation.ok) return validation;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isQuizMakeStorageKey(key)) keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    Object.entries(validation.value.localStorage).forEach(([key, value]) => {
      if (isQuizMakeStorageKey(key)) localStorage.setItem(key, value);
    });

    const now = new Date().toISOString();
    setLastSyncState({
      lastSyncAt: now,
      lastUploadHash: computePayloadHash(validation.value),
      status: 'クラウドから読み込みました',
      error: '',
    });

    return { ok: true, value: Object.keys(validation.value.localStorage).length };
  } catch (error) {
    return {
      ok: false,
      error: isQuotaExceededError(error)
        ? '端末内の保存容量がいっぱいです。同期バックアップを整理するか、不要なノートデータを減らしてください。'
        : error instanceof Error
          ? '同期データの読み込みに失敗しました: ' + error.message
          : '同期データの読み込みに失敗しました。',
    };
  }
}

export async function uploadSyncData(syncId: string, payload: SyncPayload): Promise<SyncResult<RemoteSyncRecord>> {
  const normalizedSyncId = syncId.trim();
  if (!normalizedSyncId) return { ok: false, error: '同期IDを入力してください。' };

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'Supabaseの環境変数が未設定です。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。' };

  const validation = validateSyncPayload(payload);
  if (!validation.ok) return validation;

  try {
    const updatedAt = new Date().toISOString();
    const uploadPayload = { ...validation.value, updatedAt };
    const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?on_conflict=sync_id`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify([{ sync_id: normalizedSyncId, data: uploadPayload, updated_at: updatedAt }]),
    });

    if (!response.ok) return { ok: false, error: await responseError(response, 'クラウドへの保存に失敗しました。') };

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

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'Supabaseの環境変数が未設定です。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。' };

  try {
    const encodedSyncId = encodeURIComponent(normalizedSyncId);
    const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?sync_id=eq.${encodedSyncId}&select=sync_id,data,updated_at`, {
      method: 'GET',
      headers: createSupabaseHeaders(config.anonKey),
    });

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

  const config = getRemoteSyncConfig();
  if (!config) return { ok: false, error: 'Supabaseの環境変数が未設定です。' };

  try {
    const encodedSyncId = encodeURIComponent(normalizedSyncId);
    const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?sync_id=eq.${encodedSyncId}&select=sync_id,updated_at`, {
      method: 'GET',
      headers: createSupabaseHeaders(config.anonKey),
    });

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
  addStep({ name: '同期ID', ok: Boolean(normalizedSyncId), message: normalizedSyncId ? '入力済み' : '未入力' });

  let exportedPayload: SyncPayload | null = null;
  try {
    exportedPayload = exportQuizMakeData();
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
  if (!config || !normalizedSyncId || !exportedPayload) {
    addStep({
      name: 'テーブル接続',
      ok: false,
      message: 'Supabase設定、同期ID、またはexport結果が不足しているため中止しました',
    });
    return { ok: steps.every((step) => step.ok), steps };
  }

  const diagnosticId = `__diagnostic__${normalizedSyncId}`;
  const diagnosticPayload = {
    version: 1,
    app: 'quiz-make',
    diagnostic: true,
    exportedAt: new Date().toISOString(),
    localStorage: {},
  };

  try {
    const selectResponse = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?select=sync_id,updated_at&limit=1`, {
      method: 'GET',
      headers: createSupabaseHeaders(config.anonKey),
    });
    addStep(await responseToDiagnosticStep(selectResponse, 'テーブル接続', 'quiz_sync_data へselectできます'));
    if (!selectResponse.ok) return { ok: false, steps };
  } catch (error) {
    addStep(exceptionToDiagnosticStep('テーブル接続', error));
    return { ok: false, steps };
  }

  try {
    const updatedAt = new Date().toISOString();
    const upsertResponse = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?on_conflict=sync_id`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify([{ sync_id: diagnosticId, data: diagnosticPayload, updated_at: updatedAt }]),
    });
    addStep(await responseToDiagnosticStep(upsertResponse, '診断用upsert', '診断用データを保存できます'));
    if (!upsertResponse.ok) return { ok: false, steps };
  } catch (error) {
    addStep(exceptionToDiagnosticStep('診断用upsert', error));
    return { ok: false, steps };
  }

  try {
    const encodedId = encodeURIComponent(diagnosticId);
    const readResponse = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?sync_id=eq.${encodedId}&select=sync_id,data,updated_at`, {
      method: 'GET',
      headers: createSupabaseHeaders(config.anonKey),
    });
    const readStep = await responseToDiagnosticStep(readResponse, '診断用select読み戻し', '診断用データを読み戻せます');
    if (readResponse.ok) {
      const rows = await readResponse.json() as unknown;
      const found = Array.isArray(rows) && rows.length > 0;
      addStep(found ? readStep : { name: '診断用select読み戻し', ok: false, message: 'upsertした診断用データが見つかりません' });
    } else {
      addStep(readStep);
    }
  } catch (error) {
    addStep(exceptionToDiagnosticStep('診断用select読み戻し', error));
  }

  return { ok: steps.every((step) => step.ok), steps };
}

export function computePayloadHash(payload: SyncPayload): string {
  const text = JSON.stringify({ version: payload.version, localStorage: sortRecord(payload.localStorage) });
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}


export function summarizeSyncPayload(payload: SyncPayload): SyncPayloadSummary {
  const appDataRaw = payload.localStorage['quiz-make-app-data-v1'];
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

  const noteCount = Object.keys(payload.localStorage).filter((key) => key.startsWith('quizMake:notes:')).length;
  const text = JSON.stringify(payload.localStorage);
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
  if (value.version !== 1) return { ok: false, error: '同期データのversionが対応していません。' };
  if (typeof value.updatedAt !== 'string') return { ok: false, error: '同期データのupdatedAtがありません。' };
  if (!isStringRecord(value.localStorage)) return { ok: false, error: '同期データ内のlocalStorage形式が正しくありません。' };

  const invalidKey = Object.keys(value.localStorage).find((key) => !isQuizMakeStorageKey(key));
  if (invalidKey) return { ok: false, error: `Quiz make以外のキーが含まれています: ${invalidKey}` };

  return { ok: true, value: { version: 1, updatedAt: value.updatedAt, localStorage: sortRecord(value.localStorage) } };
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

function isQuizMakeStorageKey(key: string): boolean {
  if (key.startsWith('quizMake:sync:')) return false;
  if (key.startsWith(SYNC_BACKUP_PREFIX)) return false;
  return key === 'quiz-make-app-data-v1' || key.startsWith('quizMake:') || key.startsWith('quiz-make:');
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
