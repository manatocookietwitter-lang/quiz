import { useEffect, useRef, useState } from 'react';
import {
  cleanupLegacySyncBackups,
  computePayloadHash,
  downloadSyncData,
  exportQuizMakeData,
  getAutoSyncSettings,
  getLastSyncState,
  getRemoteSyncMeta,
  importQuizMakeData,
  setLastSyncState,
  uploadSyncData,
} from '../utils/syncService';
import { ConfirmDialog } from './ConfirmDialog';

const AUTO_SYNC_INTERVAL_MS = 60000;
const REMOTE_CHECK_COOLDOWN_MS = 60000;

export function AutoSyncController() {
  const uploadRunningRef = useRef(false);
  const remoteCheckRunningRef = useRef(false);
  const lastRemoteCheckAtRef = useRef(0);
  const promptedRemoteUpdatedAtRef = useRef('');
  const [pendingRemoteImport, setPendingRemoteImport] = useState<{ syncId: string; updatedAt: string } | null>(null);

  const cancelRemoteImport = () => {
    setPendingRemoteImport(null);
    setLastSyncState({ status: 'クラウド読み込みを保留しました', error: '' });
  };

  const confirmRemoteImport = async () => {
    const target = pendingRemoteImport;
    if (!target) return;
    setPendingRemoteImport(null);
    setLastSyncState({ status: 'クラウドから読み込み中...', error: '' });

    const download = await downloadSyncData(target.syncId);
    if (!download.ok) {
      console.warn('Auto sync download failed.', download.error);
      setLastSyncState({ status: 'クラウド読み込み失敗', error: download.error });
      return;
    }
    if (!download.value) return;

    const imported = await importQuizMakeData(download.value.payload);
    if (!imported.ok) {
      setLastSyncState({ status: 'クラウド読み込み失敗', error: imported.error });
      return;
    }

    setLastSyncState({
      lastSyncAt: download.value.updatedAt,
      lastRemoteUpdatedAt: download.value.updatedAt,
      status: 'クラウドから読み込みました',
      error: '',
    });
    window.setTimeout(() => window.location.reload(), 700);
  };

  useEffect(() => {
    cleanupLegacySyncBackups();

    const uploadIfChanged = async () => {
      const settings = getAutoSyncSettings();
      if (!settings.enabled || !settings.syncId || !settings.configured) return;
      if (uploadRunningRef.current) return;

      uploadRunningRef.current = true;
      try {
        const payload = await exportQuizMakeData();
        const hash = computePayloadHash(payload);
        const lastState = getLastSyncState();
        if (!lastState.lastSyncAt && !lastState.lastUploadHash) {
          setLastSyncState({ status: '自動同期: 初回は手動保存または読み込みをしてください', error: '' });
          return;
        }
        if (remoteCheckRunningRef.current) return;
        if (hash === lastState.lastUploadHash) {
          setLastSyncState({ status: '自動同期: 待機中', error: '' });
          return;
        }

        setLastSyncState({ status: '自動保存中...', error: '' });
        const result = await uploadSyncData(settings.syncId, payload);
        if (!result.ok) {
          console.warn('Auto sync upload failed.', result.error);
          setLastSyncState({ status: '自動同期失敗', error: result.error });
          return;
        }
        setLastSyncState({ status: '自動保存しました', error: '' });
      } catch (error) {
        const message = error instanceof Error ? error.message : '自動保存に失敗しました。';
        console.warn('Auto sync upload failed.', error);
        setLastSyncState({ status: '自動同期失敗', error: message });
      } finally {
        uploadRunningRef.current = false;
      }
    };

    const checkRemote = async (force = false) => {
      const settings = getAutoSyncSettings();
      if (!settings.enabled || !settings.syncId || !settings.configured) return;
      if (remoteCheckRunningRef.current) return;

      const now = Date.now();
      if (!force && now - lastRemoteCheckAtRef.current < REMOTE_CHECK_COOLDOWN_MS) return;
      lastRemoteCheckAtRef.current = now;
      remoteCheckRunningRef.current = true;

      try {
        const meta = await getRemoteSyncMeta(settings.syncId);
        if (!meta.ok) {
          console.warn('Auto sync remote check failed.', meta.error);
          setLastSyncState({ status: 'クラウド確認失敗', error: meta.error });
          return;
        }
        if (!meta.value) {
          setLastSyncState({ status: 'クラウドデータなし', error: '' });
          return;
        }

        const lastState = getLastSyncState();
        setLastSyncState({ lastRemoteUpdatedAt: meta.value.updatedAt });
        const remoteTime = Date.parse(meta.value.updatedAt);
        const localTime = Date.parse(lastState.lastSyncAt);
        const remoteIsNewer = Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime > localTime + 1000);
        if (!remoteIsNewer) return;
        if (promptedRemoteUpdatedAtRef.current === meta.value.updatedAt) return;

        promptedRemoteUpdatedAtRef.current = meta.value.updatedAt;
        setLastSyncState({ status: 'クラウドに新しいデータがあります', error: '' });
        setPendingRemoteImport({ syncId: settings.syncId, updatedAt: meta.value.updatedAt });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'クラウド確認に失敗しました。';
        console.warn('Auto sync remote check failed.', error);
        setLastSyncState({ status: 'クラウド確認失敗', error: message });
      } finally {
        remoteCheckRunningRef.current = false;
      }
    };

    const intervalId = window.setInterval(uploadIfChanged, AUTO_SYNC_INTERVAL_MS);
    const handleFocus = () => void checkRemote(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkRemote(false);
    };
    const handleSettingsChange = () => {
      void checkRemote(true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('quiz-make-sync-settings-change', handleSettingsChange);

    window.setTimeout(() => void checkRemote(true), 1200);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('quiz-make-sync-settings-change', handleSettingsChange);
    };
  }, []);

  return (
    <ConfirmDialog
      open={pendingRemoteImport !== null}
      title={'クラウドに新しいデータがあります'}
      message={'この端末のデータをクラウドの内容で上書きします。\n必要な場合は同期設定画面の「現在データをJSONバックアップ」で先に保存してください。'}
      confirmLabel={'読み込む'}
      onCancel={cancelRemoteImport}
      onConfirm={() => void confirmRemoteImport()}
    />
  );
}