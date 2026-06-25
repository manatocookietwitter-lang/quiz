import type { AppData } from '../types';
import { isAppData } from '../storage';

export type SyncPayload = {
  version: 1;
  updatedAt: string;
  data: AppData;
};

export type SyncParseResult = { ok: true; payload: SyncPayload } | { ok: false; error: string };

export function createSyncPayload(data: AppData, updatedAt = new Date().toISOString()): SyncPayload {
  return {
    version: 1,
    updatedAt,
    data,
  };
}

export function serializeSyncPayload(data: AppData): string {
  return JSON.stringify(createSyncPayload(data), null, 2);
}

export function parseSyncPayloadJson(text: string): SyncParseResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return { ok: false, error: '同期データの形式が正しくありません。' };
    if (parsed.version !== 1) return { ok: false, error: '同期データのversionが対応していません。' };
    if (typeof parsed.updatedAt !== 'string') return { ok: false, error: '同期データのupdatedAtがありません。' };
    if (!isAppData(parsed.data)) return { ok: false, error: '同期データ内のAppData形式が正しくありません。' };
    return { ok: true, payload: parsed as SyncPayload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `同期JSONの解析に失敗しました: ${error.message}` : '同期JSONの解析に失敗しました。' };
  }
}

export function isRemoteSyncConfigured(): boolean {
  return Boolean(getRemoteSyncConfig());
}

export function getRemoteSyncConfig(): { url: string; anonKey: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_QUIZ_SYNC_SUPABASE_URL;
  const anonKey = env.VITE_QUIZ_SYNC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

// TODO: When VITE_QUIZ_SYNC_SUPABASE_URL and VITE_QUIZ_SYNC_SUPABASE_ANON_KEY are configured,
// implement manual upload/download against a table such as:
// create table quiz_sync_data (
//   sync_id text primary key,
//   data jsonb not null,
//   updated_at timestamptz not null default now()
// );
// Keep localStorage as the source of truth unless the user explicitly imports/downloads remote data.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}