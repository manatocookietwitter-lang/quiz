import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const appSource = readSource('../src/App.tsx');
const autoSyncSource = readSource('../src/components/AutoSyncController.tsx');
const serviceWorkerRegistrationSource = readSource('../src/registerServiceWorker.ts');
const syncServiceSource = readSource('../src/utils/syncService.ts');

test('automatic cloud imports wait until local work is no longer protected', () => {
  assert.match(appSource, /<AutoSyncController protectedWorkReason=\{protectedWorkReason\}/);
  assert.match(autoSyncSource, /open=\{pendingRemoteImport !== null && protectedWorkReason === null\}/);
  assert.match(autoSyncSource, /if \(protectedWorkReasonRef\.current\)/);
  assert.match(autoSyncSource, /latestSettings\.syncId !== target\.syncId/);
  assert.match(autoSyncSource, /if \(protectedWorkReasonRef\.current\)[\s\S]*?自動同期: 作業終了後に保存します/);
  assert.match(autoSyncSource, /uploadRunningRef\.current \|\| remoteCheckRunningRef\.current/);
  assert.match(autoSyncSource, /remoteCheckRunningRef\.current \|\| uploadRunningRef\.current/);
  assert.match(autoSyncSource, /shouldCheckRemoteAfterUpload[\s\S]*?uploadRunningRef\.current = false;[\s\S]*?checkRemote\(true\)/);
  assert.match(appSource, /screen\.name === 'noteList'\) return 'notes'/);
  assert.match(appSource, /screen\.name === 'import'\) return 'import'/);
  assert.match(appSource, /screen\.name === 'sync'\) return 'sync'/);
  assert.match(appSource, /backupImportActive\) return 'backup'/);
  assert.match(autoSyncSource, /previousReason && !protectedWorkReason/);
  assert.match(syncServiceSource, /waitForPendingCategoryNoteSaves\(\)[\s\S]*?importQuizMakeDataUnlocked\(payload\)/);
});

test('service worker activation never reloads over protected or failed local saves', () => {
  assert.match(serviceWorkerRegistrationSource, /if \(getActiveProtectedWorkReason\(\)\)/);
  assert.match(serviceWorkerRegistrationSource, /if \(!appDataSaved \|\| getActiveProtectedWorkReason\(\)\)/);
  assert.match(serviceWorkerRegistrationSource, /notifyReloadReady\(controller\)/);
  assert.match(appSource, /waitingWorker\?\.state === 'activated'/);
  assert.match(appSource, /disabled=\{protectedWorkReason !== null\}/);
});
