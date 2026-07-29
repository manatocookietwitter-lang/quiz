export const LAST_SYNC_AT_KEY = 'quizMake:sync:lastSyncAt';
export const LAST_UPLOAD_HASH_KEY = 'quizMake:sync:lastUploadHash';
export const LAST_REMOTE_UPDATED_AT_KEY = 'quizMake:sync:lastRemoteUpdatedAt';
export const LAST_SYNC_STATUS_KEY = 'quizMake:sync:lastStatus';
export const LAST_SYNC_ERROR_KEY = 'quizMake:sync:lastError';

const SYNC_STATE_KEYS = [
  LAST_SYNC_AT_KEY,
  LAST_UPLOAD_HASH_KEY,
  LAST_REMOTE_UPDATED_AT_KEY,
  LAST_SYNC_STATUS_KEY,
  LAST_SYNC_ERROR_KEY,
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
