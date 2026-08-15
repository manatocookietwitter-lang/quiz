export const LAST_SYNC_AT_KEY = 'quizMake:sync:lastSyncAt';
export const LAST_UPLOAD_HASH_KEY = 'quizMake:sync:lastUploadHash';
export const LAST_REMOTE_UPDATED_AT_KEY = 'quizMake:sync:lastRemoteUpdatedAt';
export const LAST_SYNC_STATUS_KEY = 'quizMake:sync:lastStatus';
export const LAST_SYNC_ERROR_KEY = 'quizMake:sync:lastError';
export const LAST_SYNC_OWNER_KEY = 'quizMake:sync:lastStateOwner';
export const LAST_SYNC_RECORD_KEY = 'quizMake:sync:lastStateRecord';

const SYNC_STATE_KEYS = [
  LAST_SYNC_AT_KEY,
  LAST_UPLOAD_HASH_KEY,
  LAST_REMOTE_UPDATED_AT_KEY,
  LAST_SYNC_STATUS_KEY,
  LAST_SYNC_ERROR_KEY,
  LAST_SYNC_OWNER_KEY,
  LAST_SYNC_RECORD_KEY,
];

export function isStrongSyncId(syncId: string): boolean {
  return /^[0-9a-f]{36}$/u.test(syncId.trim());
}

export function clearSyncStateForChangedId(
  storage: Pick<Storage, 'removeItem'>,
  previousSyncId: string,
  nextSyncId: string,
): boolean {
  if (previousSyncId.trim() === nextSyncId.trim()) return false;
  SYNC_STATE_KEYS.forEach((key) => storage.removeItem(key));
  return true;
}

export function hasPersistedSyncHistory(
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  try {
    if (hasMeaningfulSyncValue(storage.getItem(LAST_UPLOAD_HASH_KEY))) return true;
    if (isValidSyncTimestamp(storage.getItem(LAST_SYNC_AT_KEY))) return true;
    if (isValidSyncTimestamp(storage.getItem(LAST_REMOTE_UPDATED_AT_KEY))) return true;

    const rawRecord = storage.getItem(LAST_SYNC_RECORD_KEY);
    if (!rawRecord) return false;
    const parsed = JSON.parse(rawRecord) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return false;
    const state = (parsed as { state?: unknown }).state;
    if (typeof state !== 'object' || state === null) return false;
    const values = state as Record<string, unknown>;
    return hasMeaningfulSyncValue(values.lastUploadHash)
      || isValidSyncTimestamp(values.lastSyncAt)
      || isValidSyncTimestamp(values.lastRemoteUpdatedAt);
  } catch {
    // If the history cannot be inspected, fail closed rather than allowing an
    // unverified empty database to replace an existing cloud copy.
    return true;
  }
}

function hasMeaningfulSyncValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidSyncTimestamp(value: unknown): boolean {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value));
}
