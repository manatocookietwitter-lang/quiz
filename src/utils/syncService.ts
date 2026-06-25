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

const SYNC_ID_STORAGE_KEY = 'quizMake:sync:id';
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
  try {
    return localStorage.getItem(SYNC_ID_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredSyncId(syncId: string): void {
  try {
    const value = syncId.trim();
    if (value) localStorage.setItem(SYNC_ID_STORAGE_KEY, value);
    else localStorage.removeItem(SYNC_ID_STORAGE_KEY);
  } catch {
    // Sync ID persistence is convenient, not required for the app to work.
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

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isQuizMakeStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) localStorageData[key] = value;
  }

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
    Object.entries(payload.localStorage).forEach(([key, value]) => {
      if (isQuizMakeStorageKey(key)) localStorage.setItem(key, value);
    });

    return { ok: true, value: Object.keys(payload.localStorage).length };
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
    const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?on_conflict=sync_id`, {
      method: 'POST',
      headers: createSupabaseHeaders(config.anonKey, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify([{ sync_id: normalizedSyncId, data: payload, updated_at: updatedAt }]),
    });

    if (!response.ok) return { ok: false, error: await responseError(response, 'クラウドへの保存に失敗しました。') };

    const rows = (await response.json()) as unknown;
    const first = Array.isArray(rows) ? rows[0] : null;
    const record = parseRemoteRecord(first, normalizedSyncId, payload, updatedAt);
    if (!record.ok) return record;
    setStoredSyncId(normalizedSyncId);
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
    return record;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `クラウドからの読み込みに失敗しました: ${error.message}` : 'クラウドからの読み込みに失敗しました。',
    };
  }
}

export function validateSyncPayload(value: unknown): SyncResult<SyncPayload> {
  if (!isRecord(value)) return { ok: false, error: '同期データの形式が正しくありません。' };
  if (value.version !== 1) return { ok: false, error: '同期データのversionが対応していません。' };
  if (typeof value.updatedAt !== 'string') return { ok: false, error: '同期データのupdatedAtがありません。' };
  if (!isStringRecord(value.localStorage)) return { ok: false, error: '同期データ内のlocalStorage形式が正しくありません。' };

  const invalidKey = Object.keys(value.localStorage).find((key) => !isQuizMakeStorageKey(key));
  if (invalidKey) return { ok: false, error: `Quiz make以外のキーが含まれています: ${invalidKey}` };

  return { ok: true, value: value as SyncPayload };
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
  if (key === SYNC_ID_STORAGE_KEY) return false;
  if (key.startsWith(SYNC_BACKUP_PREFIX)) return false;
  return key === 'quiz-make-app-data-v1' || key.startsWith('quizMake:') || key.startsWith('quiz-make:');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
