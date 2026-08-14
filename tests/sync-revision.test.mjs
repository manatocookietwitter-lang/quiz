import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

class MemoryStorage {
  #values = new Map();
  failWrites = false;

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
    if (this.failWrites) throw new Error('storage write failed');
    this.#values.set(String(key), String(value));
  }
}

const originalSupabaseUrl = process.env.VITE_SUPABASE_URL;
const originalSupabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  addEventListener() {},
  clearTimeout,
  dispatchEvent() {},
  removeEventListener() {},
  setTimeout,
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
delete globalThis.indexedDB;

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const revision = await vite.ssrLoadModule('/src/utils/localDataRevision.ts');
const storage = await vite.ssrLoadModule('/src/storage.ts');
const notes = await vite.ssrLoadModule('/src/utils/noteStorage.ts');
const sync = await vite.ssrLoadModule('/src/utils/syncService.ts');

after(async () => {
  await vite.close();
  if (originalSupabaseUrl === undefined) delete process.env.VITE_SUPABASE_URL;
  else process.env.VITE_SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
  else process.env.VITE_SUPABASE_ANON_KEY = originalSupabaseKey;
  delete globalThis.fetch;
  delete globalThis.indexedDB;
});

const syncId = '111111111111111111111111111111111111';
const timestamp = '2026-08-15T00:00:00.000Z';

function appDataWithFolder(name) {
  return {
    ...storage.createEmptyAppData(),
    folders: [{
      id: 'folder-1',
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  };
}

test('successful app and note persistence advances one shared monotonic revision', async () => {
  delete globalThis.indexedDB;
  localStorage.clear();
  const initialRevision = revision.getLocalDataRevision();

  assert.equal(await storage.saveAppData(appDataWithFolder('first')), true);
  assert.equal(revision.getLocalDataRevision(), initialRevision + 1);

  const noteRaw = JSON.stringify({ dataUrl: 'data:image/png;base64,first', updatedAt: timestamp });
  await notes.saveCategoryNoteRaw('quizMake:notes:set-1:vocabulary', noteRaw);
  assert.equal(revision.getLocalDataRevision(), initialRevision + 2);

  const revisionBeforeFailures = revision.getLocalDataRevision();
  localStorage.failWrites = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal(await storage.saveAppData(appDataWithFolder('not-saved')), false);
    await assert.rejects(
      notes.saveCategoryNoteRaw('quizMake:notes:set-1:vocabulary', noteRaw),
      /storage write failed/,
    );
  } finally {
    console.error = originalConsoleError;
    localStorage.failWrites = false;
  }
  assert.equal(revision.getLocalDataRevision(), revisionBeforeFailures);
  await notes.saveCategoryNoteRaw('quizMake:notes:set-1:vocabulary', noteRaw);
});

test('an exported payload keeps an internal revision snapshot without changing its JSON format', async () => {
  delete globalThis.indexedDB;
  localStorage.clear();
  assert.equal(await storage.saveAppData(appDataWithFolder('snapshot')), true);

  const payload = await sync.exportQuizMakeData(timestamp);

  assert.equal(revision.getAssociatedLocalDataRevision(payload), revision.getLocalDataRevision());
  assert.equal(Object.hasOwn(payload, 'revision'), false);
  assert.deepEqual(Object.keys(payload).sort(), ['indexedDbNotes', 'localStorage', 'updatedAt', 'version']);
});

test('upload waits for the save queue and refuses an exported payload made stale before network I/O', async () => {
  delete globalThis.indexedDB;
  localStorage.clear();
  assert.equal(await storage.saveAppData(appDataWithFolder('before-export')), true);
  const payload = await sync.exportQuizMakeData(timestamp);

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called for a stale payload');
  };

  const pendingSave = storage.saveAppData(appDataWithFolder('queued-after-export'));
  const result = await sync.uploadSyncData(syncId, payload);

  assert.equal(await pendingSave, true);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'local_changed');
  assert.equal(fetchCalls, 0);
});

test('a save finishing during upload keeps the authoritative remote timestamp but not a synced hash', async () => {
  delete globalThis.indexedDB;
  localStorage.clear();
  sync.setStoredSyncId(syncId);
  sync.setLastSyncState({
    lastSyncAt: '2026-08-14T00:00:00.000Z',
    lastRemoteUpdatedAt: '2026-08-14T00:00:00.000Z',
    lastUploadHash: 'previously-synced-hash',
    status: '',
    error: '',
  });
  assert.equal(await storage.saveAppData(appDataWithFolder('uploaded-snapshot')), true);
  const payload = await sync.exportQuizMakeData(timestamp);

  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const remoteUpdatedAt = '2026-08-15T00:00:05.000Z';
  globalThis.fetch = async () => {
    markFetchStarted();
    await new Promise((resolve) => {
      releaseFetch = resolve;
    });
    return new Response(JSON.stringify([{
      sync_id: syncId,
      updated_at: remoteUpdatedAt,
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const upload = sync.uploadSyncData(syncId, payload, {
    expectedRemoteUpdatedAt: '2026-08-14T00:00:00.000Z',
  });
  await fetchStarted;

  let releaseIndexedDbSave;
  globalThis.indexedDB = createDelayedIndexedDb((release) => {
    releaseIndexedDbSave = release;
  });
  const pendingSave = storage.saveAppData(appDataWithFolder('changed-during-upload'));
  await Promise.resolve();
  releaseFetch();

  let uploadSettled = false;
  void upload.finally(() => {
    uploadSettled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(uploadSettled, false, 'upload must wait for the pending local save after the RPC completes');

  releaseIndexedDbSave();
  assert.equal(await pendingSave, true);
  const result = await upload;

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.updatedAt, remoteUpdatedAt);
    assert.equal(result.value.localChangesPending, true);
  }
  assert.deepEqual(sync.getLastSyncState(), {
    lastSyncAt: remoteUpdatedAt,
    lastUploadHash: '',
    lastRemoteUpdatedAt: remoteUpdatedAt,
    status: 'クラウド保存中に端末データが更新されました。最新の内容を再同期します',
    error: '',
  });
});

function createDelayedIndexedDb(captureRelease) {
  const fakeDb = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const transaction = {
        onabort: null,
        oncomplete: null,
        onerror: null,
        objectStore() {
          return {
            get() {
              const request = { error: null, onsuccess: null, onerror: null, result: undefined };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
            put() {},
          };
        },
      };
      captureRelease(() => {
        queueMicrotask(() => {
          transaction.oncomplete?.();
        });
      });
      return transaction;
    },
  };

  return {
    open() {
      const request = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: fakeDb,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
}
