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

const SYNC_ID_STORAGE_KEY = 'quizMake:sync:id';
const AUTO_SYNC_ENABLED_KEY = 'quizMake:sync:autoEnabled';
const LAST_SYNC_AT_KEY = 'quizMake:sync:lastSyncAt';
const LAST_UPLOAD_HASH_KEY = 'quizMake:sync:lastUploadHash';
const LAST_REMOTE_UPDATED_AT_KEY = 'quizMake:sync:lastRemoteUpdatedAt';
const LAST_SYNC_STATUS_KEY = 'quizMake:sync:lastStatus';
const LAST_SYNC_ERROR_KEY = 'quizMake:sync:lastError';
const SYNC_BACKUP_PREFIX = 'quizMake:sync:backup:';
const SUPABASE_TABLE = 'quiz_sync_data';

export function isSyncConfigured(): boolean {
  return Boolean(getRemoteSyncConfig());
}

export function getRemoteSyncConfig(): { url: string; anonKey: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL ?? env.VITE_QUIZ_SYNC_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_QUIZ_SYNC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
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
    const backup = exportQuizMakeData();
    localStorage.setItem(`${SYNC_BACKUP_PREFIX}${new Date().toISOString()}`, JSON.stringify(backup));

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
      error: error instanceof Error ? `同期データの読み込みに失敗しました: ${error.message}` : '同期データの読み込みに失敗しました。',
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

export function computePayloadHash(payload: SyncPayload): string {
  const text = JSON.stringify({ version: payload.version, localStorage: sortRecord(payload.localStorage) });
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return String(hash);
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
