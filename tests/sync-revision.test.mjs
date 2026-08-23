import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

class MemoryStorage {
  #values = new Map();
  failWrites = false;
  failReadsFor = new Set();
  ignoreWritesFor = new Set();
  onSetItem = null;

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
    this.failReadsFor.clear();
    this.ignoreWritesFor.clear();
    this.failWrites = false;
    this.onSetItem = null;
  }

  getItem(key) {
    const normalizedKey = String(key);
    if (this.failReadsFor.has(normalizedKey)) throw new Error('storage read failed');
    return this.#values.get(normalizedKey) ?? null;
  }

  key(index) {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error('storage write failed');
    const normalizedKey = String(key);
    if (this.ignoreWritesFor.has(normalizedKey)) return;
    this.#values.set(normalizedKey, String(value));
    this.onSetItem?.(normalizedKey, String(value));
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
const coordination = await vite.ssrLoadModule('/src/utils/dataCoordination.ts');
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
const replacementSyncId = '222222222222222222222222222222222222';
const timestamp = '2026-08-15T00:00:00.000Z';

function resetStorage() {
  localStorage.clear();
  coordination.resetDataCoordinationForTests();
}

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

test('sync connection changes report set/get failures and silent read-back mismatches', () => {
  resetStorage();
  const initial = sync.setStoredSyncId(syncId);
  assert.equal(initial.ok, true);
  assert.equal(sync.getStoredSyncId(), syncId);
  const previousState = {
    lastSyncAt: timestamp,
    lastUploadHash: 'existing-upload-hash',
    lastRemoteUpdatedAt: timestamp,
    status: '同期済み',
    error: '',
  };
  sync.setLastSyncState(previousState);

  localStorage.failWrites = true;
  const setFailure = sync.setStoredSyncId(replacementSyncId);
  localStorage.failWrites = false;
  assert.equal(setFailure.ok, false);
  assert.equal(sync.getStoredSyncId(), syncId, 'a throwing write must keep the previous connection');
  assert.deepEqual(sync.getLastSyncState(), previousState, 'a throwing ID write must preserve the previous CAS/hash state');

  localStorage.failReadsFor.add(sync.SYNC_ID_STORAGE_KEY);
  const getFailure = sync.setStoredSyncId(replacementSyncId);
  localStorage.failReadsFor.delete(sync.SYNC_ID_STORAGE_KEY);
  assert.equal(getFailure.ok, false);
  assert.equal(sync.getStoredSyncId(), syncId, 'an unreadable current connection must not be replaced');
  assert.deepEqual(sync.getLastSyncState(), previousState);

  localStorage.ignoreWritesFor.add(sync.SYNC_ID_STORAGE_KEY);
  const mismatch = sync.setStoredSyncId(replacementSyncId);
  localStorage.ignoreWritesFor.delete(sync.SYNC_ID_STORAGE_KEY);
  assert.equal(mismatch.ok, false);
  assert.equal(sync.getStoredSyncId(), syncId, 'a silently ignored write must fail read-back verification');
  assert.deepEqual(sync.getLastSyncState(), previousState, 'a silently ignored ID write must not clear sync history');
});

test('successful app and note persistence advances one shared monotonic revision', async () => {
  delete globalThis.indexedDB;
  resetStorage();
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
      /(storage write failed|保存状態)/,
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
  resetStorage();
  assert.equal(await storage.saveAppData(appDataWithFolder('snapshot')), true);

  const payload = await sync.exportQuizMakeData(timestamp);

  assert.equal(revision.getAssociatedLocalDataRevision(payload), revision.getLocalDataRevision());
  assert.equal(Object.hasOwn(payload, 'revision'), false);
  assert.deepEqual(Object.keys(payload).sort(), ['indexedDbNotes', 'localStorage', 'updatedAt', 'version']);
});

test('upload waits for the save queue and refuses an exported payload made stale before network I/O', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
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

test('upload rejects a snapshot changed by another tab before network I/O', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
  assert.equal(await storage.saveAppData(appDataWithFolder('before-other-tab-change')), true);
  const payload = await sync.exportQuizMakeData(timestamp);
  localStorage.setItem('quizMake:coord:appEpoch', 'changed-by-another-tab');
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('a cross-tab stale snapshot must not reach the network');
  };

  const result = await sync.uploadSyncData(syncId, payload);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'local_changed');
  assert.equal(fetchCalls, 0);
});

test('stale callers cannot use an old ID or roll the stored connection back before network I/O', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(replacementSyncId);
  assert.equal(await storage.saveAppData(appDataWithFolder('stale-connection')), true);
  const payload = await sync.exportQuizMakeData(timestamp);
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('a stale connection must not reach the network');
  };

  const upload = await sync.uploadSyncData(syncId, payload);
  const download = await sync.downloadSyncData(syncId);

  assert.equal(upload.ok, false);
  if (!upload.ok) assert.equal(upload.code, 'connection_changed');
  assert.equal(download.ok, false);
  if (!download.ok) assert.equal(download.code, 'connection_changed');
  assert.equal(fetchCalls, 0);
  assert.equal(sync.getStoredSyncId(), replacementSyncId);
});

test('sync status records never inherit authoritative state from another connection', () => {
  resetStorage();
  sync.setStoredSyncId(replacementSyncId);
  localStorage.setItem('quizMake:sync:lastStateRecord', JSON.stringify({
    owner: syncId,
    state: {
      lastSyncAt: timestamp,
      lastUploadHash: 'stale-a-hash',
      lastRemoteUpdatedAt: timestamp,
      status: 'A saved',
      error: '',
    },
  }));

  sync.setLastSyncState({ status: 'B waiting', error: '' });

  assert.deepEqual(sync.getLastSyncState(), {
    lastSyncAt: '',
    lastUploadHash: '',
    lastRemoteUpdatedAt: '',
    status: 'B waiting',
    error: '',
  });
  const record = JSON.parse(localStorage.getItem('quizMake:sync:lastStateRecord'));
  assert.equal(record.owner, replacementSyncId);
});

test('cloud import rolls back if another tab changes the connection during local replacement', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
  const originalData = appDataWithFolder('before-import');
  const importedData = appDataWithFolder('from-cloud');
  const noteKey = 'quizMake:notes:set-1:vocabulary';
  const originalNote = JSON.stringify({ dataUrl: 'data:image/png;base64,before', updatedAt: timestamp });
  const importedNote = JSON.stringify({ dataUrl: 'data:image/png;base64,cloud', updatedAt: '2026-08-15T00:00:01.000Z' });
  assert.equal(await storage.saveAppData(originalData), true);
  await notes.saveCategoryNoteRaw(noteKey, originalNote);

  const storageMock = localStorage;
  storageMock.onSetItem = (key, value) => {
    if (!key.endsWith(':fallback-record') || !value.includes('from-cloud')) return;
    storageMock.onSetItem = null;
    sync.setStoredSyncId(replacementSyncId);
  };

  const result = await sync.importQuizMakeData({
    version: 1,
    updatedAt: timestamp,
    localStorage: {
      [storage.APP_DATA_STORAGE_KEY]: JSON.stringify(importedData),
    },
    indexedDbNotes: { [noteKey]: importedNote },
  }, {
    expectedSyncId: syncId,
    authoritativeUpdatedAt: timestamp,
  });

  storageMock.onSetItem = null;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'connection_changed');
  assert.equal(sync.getStoredSyncId(), replacementSyncId);
  assert.deepEqual(await storage.loadAppDataAsync(), originalData);
  assert.equal(await notes.loadCategoryNoteRaw(noteKey), originalNote);
});

test('v2 upload rejects malformed success rows instead of inventing a successful fallback', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
  assert.equal(await storage.saveAppData(appDataWithFolder('strict-v2')), true);
  const payload = await sync.exportQuizMakeData(timestamp);
  const malformedResponses = [
    [{ sync_id: syncId, data: payload, updated_at: timestamp }],
    [{ result_code: 'ok', sync_id: syncId, updated_at: timestamp }],
    [{ result_code: 'ok', sync_id: replacementSyncId, data: payload, updated_at: timestamp }],
    [{ result_code: 'ok', sync_id: syncId, data: payload, updated_at: 'not-a-date' }],
    [{}],
    [],
  ];

  for (const responseBody of malformedResponses) {
    globalThis.fetch = async () => new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await sync.uploadSyncData(syncId, payload);
    assert.equal(result.ok, false);
  }
});

test('upload conflicts retain the exact remote revision required for confirmed CAS overwrite', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
  assert.equal(await storage.saveAppData(appDataWithFolder('conflict-revision')), true);
  const payload = await sync.exportQuizMakeData(timestamp);
  const remoteRevision = '2026-08-15T00:00:09.000Z';
  globalThis.fetch = async () => new Response(JSON.stringify([{
    result_code: 'conflict',
    sync_id: syncId,
    data: null,
    updated_at: remoteRevision,
  }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await sync.uploadSyncData(syncId, payload, {
    expectedRemoteUpdatedAt: '2026-08-14T00:00:00.000Z',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'conflict');
    assert.equal(result.remoteUpdatedAt, remoteRevision);
  }
});

test('a save finishing during upload keeps the authoritative remote timestamp but not a synced hash', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
  sync.setLastSyncState({
    lastSyncAt: '2026-08-14T00:00:00.000Z',
    lastRemoteUpdatedAt: '2026-08-14T00:00:00.000Z',
    lastUploadHash: 'previously-synced-hash',
    status: '',
    error: '',
  });
  localStorage.setItem(notes.CATEGORY_NOTES_MANIFEST_KEY, JSON.stringify({ version: 1, keys: [] }));
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
      result_code: 'ok',
      sync_id: syncId,
      data: payload,
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

test('an in-flight upload cannot restore a sync connection that was changed meanwhile', async () => {
  delete globalThis.indexedDB;
  resetStorage();
  sync.setStoredSyncId(syncId);
  assert.equal(await storage.saveAppData(appDataWithFolder('connection-race')), true);
  const payload = await sync.exportQuizMakeData(timestamp);

  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  globalThis.fetch = async () => {
    markFetchStarted();
    await new Promise((resolve) => {
      releaseFetch = resolve;
    });
    return new Response(JSON.stringify([{
      result_code: 'ok',
      sync_id: syncId,
      data: payload,
      updated_at: timestamp,
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const upload = sync.uploadSyncData(syncId, payload);
  await fetchStarted;
  sync.setStoredSyncId(replacementSyncId);
  releaseFetch();

  const result = await upload;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'connection_changed');
  assert.equal(sync.getStoredSyncId(), replacementSyncId);
  assert.deepEqual(sync.getLastSyncState(), {
    lastSyncAt: '',
    lastUploadHash: '',
    lastRemoteUpdatedAt: '',
    status: '',
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
