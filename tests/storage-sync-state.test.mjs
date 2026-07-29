import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.get(String(key)) ?? null;
  }

  key(index) {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const storage = await import('../src/storage.ts');
const notes = await import('../src/utils/noteStorage.ts');
const syncState = await import('../src/utils/syncState.ts');

test('localStorage fallback saves payload and timestamp atomically', async () => {
  delete globalThis.indexedDB;
  localStorage.clear();
  const timestamp = '2026-07-29T00:00:00.000Z';
  const data = {
    ...storage.createEmptyAppData(),
    folders: [{
      id: 'folder-1',
      name: 'Saved folder',
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  };

  assert.equal(await storage.saveAppData(data), true);
  assert.equal(localStorage.getItem(storage.APP_DATA_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(storage.APP_DATA_FALLBACK_META_KEY), null);
  assert.ok(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .some((key) => key?.endsWith(':fallback-record')));
  assert.deepEqual(await storage.loadAppDataAsync(), data);
});

test('changing sync id clears timestamps and hashes from the previous id', () => {
  localStorage.clear();
  const firstId = '111111111111111111111111111111111111';
  const secondId = '222222222222222222222222222222222222';
  localStorage.setItem(syncState.LAST_SYNC_AT_KEY, '2026-07-29T00:00:00.000Z');
  localStorage.setItem(syncState.LAST_UPLOAD_HASH_KEY, 'old-hash');
  localStorage.setItem(syncState.LAST_REMOTE_UPDATED_AT_KEY, '2026-07-29T00:00:01.000Z');
  localStorage.setItem(syncState.LAST_SYNC_STATUS_KEY, 'saved');
  localStorage.setItem(syncState.LAST_SYNC_ERROR_KEY, 'old-error');

  assert.equal(syncState.clearSyncStateForChangedId(localStorage, firstId, firstId), false);
  assert.equal(localStorage.getItem(syncState.LAST_UPLOAD_HASH_KEY), 'old-hash');
  assert.equal(syncState.clearSyncStateForChangedId(localStorage, firstId, secondId), true);
  assert.equal(localStorage.getItem(syncState.LAST_SYNC_AT_KEY), null);
  assert.equal(localStorage.getItem(syncState.LAST_UPLOAD_HASH_KEY), null);
  assert.equal(localStorage.getItem(syncState.LAST_REMOTE_UPDATED_AT_KEY), null);
  assert.equal(localStorage.getItem(syncState.LAST_SYNC_STATUS_KEY), null);
  assert.equal(localStorage.getItem(syncState.LAST_SYNC_ERROR_KEY), null);
});

test('sync ids must use the generated 144-bit hexadecimal format', () => {
  assert.equal(syncState.isStrongSyncId('1234'), false);
  assert.equal(syncState.isStrongSyncId('111111111111111111111111111111111111'), true);
  assert.equal(syncState.isStrongSyncId('11111111-1111-1111-1111-111111111111'), false);
});

test('note reconciliation keeps the newest valid fallback value', () => {
  const older = JSON.stringify({ dataUrl: 'old', updatedAt: '2026-07-29T00:00:00.000Z' });
  const newer = JSON.stringify({ dataUrl: 'new', updatedAt: '2026-07-29T00:00:02.000Z' });

  assert.equal(notes.pickNewestNoteRaw([older, null, newer]), newer);
});
