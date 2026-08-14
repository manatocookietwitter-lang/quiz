import { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChevronDownIcon, CopyIcon, DownloadIcon, SyncIcon, UploadIcon } from '../components/UiIcons';
import {
  clearSyncLocalBackups,
  computePayloadHash,
  deleteRemoteSyncData,
  downloadSyncData,
  exportQuizMakeData,
  generateSyncId,
  getAutoSyncSettings,
  getLastSyncState,
  getStoredSyncId,
  getSyncEnvironmentStatus,
  importQuizMakeData,
  isSyncConfigured,
  runSyncDiagnostic,
  setAutoSyncEnabled,
  setLastSyncState,
  setStoredSyncId,
  summarizeSyncPayload,
  uploadSyncData,
  type LastSyncState,
  type SyncDiagnosticResult,
  type SyncPayload,
  type SyncPayloadSummary,
} from '../utils/syncService';
import { isStrongSyncId } from '../utils/syncState';
import { saveJsonBackup, writeClipboardText } from '../utils/nativePlatform';
import './SyncScreen.css';

interface SyncScreenProps {
  onBack: () => void;
}

export function SyncScreen({ onBack }: SyncScreenProps) {
  const configured = useMemo(() => isSyncConfigured(), []);
  const environmentStatus = useMemo(() => getSyncEnvironmentStatus(), []);
  const [syncId, setSyncId] = useState(() => getStoredSyncId());
  const [activeSyncId, setActiveSyncId] = useState(() => getStoredSyncId().trim());
  const [autoEnabled, setAutoEnabledState] = useState(() => getAutoSyncSettings().enabled);
  const [lastState, setLastState] = useState<LastSyncState>(() => getLastSyncState());
  const [busy, setBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<SyncDiagnosticResult | null>(null);
  const [storageUsage, setStorageUsage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [clearBackupsConfirmOpen, setClearBackupsConfirmOpen] = useState(false);
  const [deleteCloudConfirmOpen, setDeleteCloudConfirmOpen] = useState(false);
  const [pendingGeneratedSyncId, setPendingGeneratedSyncId] = useState('');
  const [pendingConnectSyncId, setPendingConnectSyncId] = useState('');
  const [pendingCloudImport, setPendingCloudImport] = useState<{
    payload: SyncPayload;
    summary: SyncPayloadSummary;
    remoteUpdatedAt: string;
  } | null>(null);
  const [pendingCloudOverwrite, setPendingCloudOverwrite] = useState<{
    payload: SyncPayload;
    localHash: string;
    summary: SyncPayloadSummary;
  } | null>(null);

  const normalizedSyncId = syncId.trim();
  const syncIdValid = isStrongSyncId(normalizedSyncId);
  const syncIdConnected = syncIdValid && normalizedSyncId === activeSyncId;
  const canRun = configured && syncIdConnected && !busy;
  const autoCanRun = autoEnabled && configured && syncIdConnected;

  useEffect(() => {
    const refreshSyncState = () => {
      setLastState(getLastSyncState());
      setAutoEnabledState(getAutoSyncSettings().enabled);
    };

    window.addEventListener('quiz-make-sync-state-change', refreshSyncState);
    window.addEventListener('quiz-make-sync-settings-change', refreshSyncState);
    return () => {
      window.removeEventListener('quiz-make-sync-state-change', refreshSyncState);
      window.removeEventListener('quiz-make-sync-settings-change', refreshSyncState);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const updateStorageUsage = async () => {
      if (!navigator.storage?.estimate) return;
      try {
        const estimate = await navigator.storage.estimate();
        if (cancelled || !estimate.usage || !estimate.quota) return;
        setStorageUsage(`${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`);
      } catch {
        // Storage estimate is optional.
      }
    };
    void updateStorageUsage();
    return () => {
      cancelled = true;
    };
  }, [message, error]);

  const updateSyncIdDraft = (value: string) => {
    if (autoEnabled && value.trim() !== activeSyncId) {
      const result = setAutoSyncEnabled(false);
      if (!result.ok) {
        setMessage('');
        setError(`同期IDの編集中に自動同期を停止できませんでした: ${result.error}`);
        return;
      }
      setSyncId(value);
      setAutoEnabledState(false);
      setLastState(getLastSyncState());
      setError('');
      setMessage('同期IDの入力内容が変わったため、自動同期をOFFにしました。');
      return;
    }
    setSyncId(value);
    setMessage('');
    setError('');
  };

  const applyConnectedSyncId = (nextId: string) => {
    const normalizedNextId = nextId.trim();
    if (!isStrongSyncId(normalizedNextId)) {
      setError('同期IDは「新しいIDを作る」で作成した36文字のIDを使用してください。');
      return;
    }
    if (autoEnabled && normalizedNextId !== activeSyncId) {
      setAutoSyncEnabled(false);
      setAutoEnabledState(false);
    }
    setStoredSyncId(normalizedNextId);
    setSyncId(normalizedNextId);
    setActiveSyncId(normalizedNextId);
    setPendingConnectSyncId('');
    setLastState(getLastSyncState());
    setError('');
    setMessage(autoEnabled && normalizedNextId !== activeSyncId
      ? '同期IDへ接続しました。誤った自動送信を防ぐため、自動同期はOFFにしました。'
      : '同期IDへ接続しました。');
  };

  const handleConnectSyncId = () => {
    if (!syncIdValid || normalizedSyncId === activeSyncId) return;
    if (activeSyncId) {
      setPendingConnectSyncId(normalizedSyncId);
      return;
    }
    applyConnectedSyncId(normalizedSyncId);
  };

  const handleGenerate = () => {
    try {
      const nextId = generateSyncId();
      if (activeSyncId) {
        setPendingGeneratedSyncId(nextId);
        return;
      }
      applyGeneratedSyncId(nextId);
    } catch {
      setMessage('');
      setError('この端末では安全な同期IDを生成できません。OSまたはブラウザを更新してください。');
    }
  };

  const applyGeneratedSyncId = (nextId: string) => {
    applyConnectedSyncId(nextId);
    setPendingGeneratedSyncId('');
    setMessage('同期IDを生成しました。ほかの端末では、このIDを入力して「このIDに接続」を押してください。');
  };

  const handleCopySyncId = async () => {
    if (!normalizedSyncId) {
      setMessage('');
      setError('先に同期IDを生成または入力してください。');
      return;
    }
    try {
      await writeClipboardText(normalizedSyncId);
      setError('');
      setMessage('同期IDをクリップボードへコピーしました。');
    } catch {
      setMessage('');
      setError('同期IDをコピーできませんでした。入力欄を長押ししてコピーしてください。');
    }
  };

  const handleToggleAutoSync = () => {
    setMessage('');
    setError('');

    if (!autoEnabled && (!configured || !syncIdConnected)) {
      setError('自動同期をONにする前に、同期IDを入力して「このIDに接続」を押してください。');
      return;
    }

    const result = setAutoSyncEnabled(!autoEnabled);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setAutoEnabledState(result.value);
    setLastState(getLastSyncState());
    setMessage(result.value ? '自動同期をONにしました。' : '自動同期をOFFにしました。');
  };

  const handleDownloadBackup = async () => {
    try {
      const payload = await exportQuizMakeData();
      await saveJsonBackup(`quiz-make-backup-${formatBackupFileDate(new Date())}.json`, JSON.stringify(payload, null, 2));
      setError('');
      setMessage('現在データのJSONバックアップを作成しました。');
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setMessage('');
      setError(`JSONバックアップの作成に失敗しました: ${detail}`);
    }
  };

  const confirmDeleteCloudData = async () => {
    if (!syncIdValid || busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await deleteRemoteSyncData(normalizedSyncId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAutoEnabledState(false);
      setLastState(getLastSyncState());
      setMessage(result.value ? 'クラウド上の同期データを削除しました。この端末のデータは残っています。' : '削除対象のクラウドデータはありませんでした。');
      setDeleteCloudConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleClearSyncBackups = () => {
    setClearBackupsConfirmOpen(true);
  };

  const confirmClearSyncBackups = () => {
    setClearBackupsConfirmOpen(false);
    const count = clearSyncLocalBackups();
    setError('');
    setMessage(count > 0 ? `\u540c\u671f\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092${count}\u4ef6\u6574\u7406\u3057\u307e\u3057\u305f\u3002` : '\u6574\u7406\u5bfe\u8c61\u306e\u540c\u671f\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f\u3042\u308a\u307e\u305b\u3093\u3002');
  };

  const uploadAndVerify = async (
    payload: SyncPayload,
    localHash: string,
    localSummary: SyncPayloadSummary,
    force: boolean,
  ) => {
    const syncState = getLastSyncState();
    const result = await uploadSyncData(normalizedSyncId, payload, {
      // Only a completed upload/import is a safe base for overwriting. Merely
      // viewing a newer cloud version must not turn it into an accepted base.
      expectedRemoteUpdatedAt: syncState.lastSyncAt || null,
      force,
    });
    if (!result.ok) {
      setLastState(getLastSyncState());
      setMessage('');
      if (result.code === 'conflict' && !force) {
        setError('');
        setPendingCloudOverwrite({ payload, localHash, summary: localSummary });
        return;
      }
      setError(result.error);
      return;
    }

    const verify = await downloadSyncData(normalizedSyncId);
    setLastState(getLastSyncState());

    if (!verify.ok) {
      setMessage('');
      setError(`保存後の読み戻し確認に失敗しました: ${verify.error}`);
      return;
    }
    if (!verify.value) {
      setMessage('');
      setError('保存後にクラウドデータを読み戻せませんでした。同じ同期IDのデータが見つかりません。');
      return;
    }

    const remoteHash = computePayloadHash(verify.value.payload);
    const remoteSummary = summarizeSyncPayload(verify.value.payload);
    if (remoteHash !== localHash) {
      setMessage('');
      setError(`保存後の読み戻し内容が一致しません。ローカル: ${formatSyncSummary(localSummary)} / クラウド: ${formatSyncSummary(remoteSummary)}`);
      return;
    }

    setMessage(`クラウドへ保存しました。更新: ${formatDateTime(verify.value.updatedAt)} / ${formatSyncSummary(remoteSummary)}`);
  };

  const handleUpload = async () => {
    if (!configured) {
      setError('クラウド同期の接続設定が完了していません。');
      return;
    }
    if (!normalizedSyncId) {
      setError('同期IDを入力してください。');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('クラウドへ保存しています...');

    try {
      const payload = await exportQuizMakeData();
      const localHash = computePayloadHash(payload);
      const localSummary = summarizeSyncPayload(payload);
      await uploadAndVerify(payload, localHash, localSummary, false);
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setMessage('');
      setError(`クラウドへの保存準備に失敗しました: ${detail}`);
    } finally {
      setBusy(false);
      setLastState(getLastSyncState());
    }
  };

  const cancelCloudOverwrite = () => {
    setPendingCloudOverwrite(null);
    setMessage('クラウドへの上書きをキャンセルしました。');
  };

  const confirmCloudOverwrite = async () => {
    const target = pendingCloudOverwrite;
    if (!target) return;
    setPendingCloudOverwrite(null);
    setBusy(true);
    setError('');
    setMessage('確認済みの内容でクラウドを上書きしています...');
    try {
      await uploadAndVerify(target.payload, target.localHash, target.summary, true);
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setMessage('');
      setError(`クラウドへの上書きに失敗しました: ${detail}`);
    } finally {
      setBusy(false);
      setLastState(getLastSyncState());
    }
  };

  const handleDownload = async () => {
    if (!configured) {
      setError('クラウド同期の接続設定が完了していません。');
      return;
    }
    if (!normalizedSyncId) {
      setError('同期IDを入力してください。');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('クラウドから読み込んでいます...');

    const result = await downloadSyncData(normalizedSyncId);
    setBusy(false);
    setLastState(getLastSyncState());

    if (!result.ok) {
      setMessage('');
      setError(result.error);
      return;
    }

    if (!result.value) {
      setMessage('');
      setError('この同期IDのデータが見つかりません。');
      return;
    }

    const remoteSummary = summarizeSyncPayload(result.value.payload);
    setMessage('');
    setPendingCloudImport({
      payload: result.value.payload,
      summary: remoteSummary,
      remoteUpdatedAt: result.value.updatedAt,
    });
  };

  const cancelCloudImport = () => {
    if (busy) return;
    setPendingCloudImport(null);
    setMessage('読み込みをキャンセルしました。');
  };

  const confirmCloudImport = async () => {
    const target = pendingCloudImport;
    if (!target || busy) return;
    setBusy(true);
    setError('');
    setMessage('クラウドデータを反映しています...');

    const importResult = await importQuizMakeData(target.payload);
    setLastState(getLastSyncState());
    if (!importResult.ok) {
      setBusy(false);
      setPendingCloudImport(null);
      setMessage('');
      setError(importResult.error);
      return;
    }

    setLastSyncState({
      lastSyncAt: target.remoteUpdatedAt,
      lastRemoteUpdatedAt: target.remoteUpdatedAt,
      lastUploadHash: computePayloadHash(target.payload),
      status: 'クラウドから読み込みました',
      error: '',
    });
    setLastState(getLastSyncState());

    setMessage(`クラウドから読み込みました。${formatSyncSummary(target.summary)} / アプリを再読み込みします...`);
    window.setTimeout(() => window.location.reload(), 800);
  };
  const handleDiagnostic = async () => {
    setDiagnosticBusy(true);
    setMessage('接続診断を実行しています...');
    setError('');

    try {
      const result = await runSyncDiagnostic(normalizedSyncId);
      setDiagnosticResult(result);
      setMessage(result.ok ? '接続診断が完了しました。すべてOKです。' : '接続診断が完了しました。NG項目を確認してください。');
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setDiagnosticResult({
        ok: false,
        steps: [{ name: '接続診断', ok: false, message: '診断処理中にエラーが発生しました', errorDetails: detail }],
      });
      setMessage('');
      setError(`接続診断に失敗しました: ${detail}`);
    } finally {
      setDiagnosticBusy(false);
    }
  };

  return (
    <div className="sync-screen">
      <header className="sync-screen__header">
        <BackButton onClick={onBack} label="戻る" className="sync-screen__back" disabled={busy || diagnosticBusy} />
        <div className="sync-screen__header-text">
          <h1>同期設定</h1>
          <p>同期IDで端末間共有</p>
        </div>
      </header>

      <main className="sync-screen__body">
        {!configured ? (
          <div className="sync-alert sync-alert--warning">
            クラウド同期の接続設定が完了していません。設定が完了するまで、端末内のJSONバックアップを利用できます。
          </div>
        ) : null}

        {message ? <div className="sync-alert sync-alert--message" role="status" aria-live="polite">{message}</div> : null}
        {error ? <div className="sync-alert sync-alert--error" role="alert">{error}</div> : null}

        <section className="sync-card sync-card--setup">
          <div className="sync-card__title-row sync-card__title-row--top">
            <div className="sync-step-title">
              <span className="sync-step-number" aria-hidden="true">1</span>
              <div>
                <h2>同期IDを準備</h2>
                <p>初めてなら新しいIDを作成。2台目以降は、同じIDを貼り付けます。</p>
              </div>
            </div>
            <span className={`sync-status${configured ? ' sync-status--ok' : ' sync-status--unset'}`}>
              {configured ? 'クラウド利用可' : 'クラウド未接続'}
            </span>
          </div>
          <input
            className="sync-input"
            value={syncId}
            onChange={(event) => updateSyncIdDraft(event.target.value)}
            placeholder="36文字の同期IDを入力"
            aria-label="同期ID"
            autoComplete="off"
            spellCheck={false}
          />
          {normalizedSyncId && !syncIdValid ? (
            <p className="sync-card__error-text" role="alert">
              安全のため、「同期IDを生成」で作成した36文字のIDを使用してください。
            </p>
          ) : null}
          {syncIdValid ? (
            <p className={`sync-card__connection-state${syncIdConnected ? ' sync-card__connection-state--connected' : ''}`} role="status">
              {syncIdConnected ? 'この同期IDに接続済みです' : '入力内容はまだ保存されていません。「このIDに接続」を押してください。'}
            </p>
          ) : null}
          <div className="sync-id-actions">
            <button type="button" className="sync-button sync-button--primary sync-id-connect" onClick={handleConnectSyncId} disabled={busy || !syncIdValid || syncIdConnected}>
              <SyncIcon size={19} />
              <span>{syncIdConnected ? '接続済み' : 'このIDに接続'}</span>
            </button>
            <button type="button" className="sync-button sync-button--secondary" onClick={handleGenerate} disabled={busy}>
              <SyncIcon size={19} />
              <span>新しいIDを作る</span>
            </button>
            <button type="button" className="sync-button sync-button--secondary" onClick={() => void handleCopySyncId()} disabled={busy || !normalizedSyncId}>
              <CopyIcon size={19} />
              <span>IDをコピー</span>
            </button>
          </div>
        </section>

        <section className="sync-card sync-card--transfer">
          <div className="sync-step-title">
            <span className="sync-step-number" aria-hidden="true">2</span>
            <div>
              <h2>データを同期</h2>
              <p>データを送る方向を選びます。読み込み前には確認画面が表示されます。</p>
            </div>
          </div>

          <div className="sync-transfer-actions">
            <button type="button" className="sync-transfer-button sync-transfer-button--primary" onClick={handleUpload} disabled={!canRun}>
              <UploadIcon size={24} />
              <span>
                <strong>{busy ? '処理中...' : 'この端末をクラウドへ保存'}</strong>
                <small>この端末の内容をほかの端末へ渡す</small>
              </span>
            </button>
            <button type="button" className="sync-transfer-button" onClick={handleDownload} disabled={!canRun}>
              <DownloadIcon size={24} />
              <span>
                <strong>{busy ? '処理中...' : 'クラウドからこの端末へ読込'}</strong>
                <small>クラウドの内容をこの端末へ反映する</small>
              </span>
            </button>
          </div>

          <div className="sync-auto-row">
            <div>
              <strong>自動同期</strong>
              <small>{autoCanRun ? '変更を自動でクラウドへ保存します' : autoEnabled ? '同期IDまたは接続設定が必要です' : '必要なときだけ手動で同期します'}</small>
            </div>
            <button
              type="button"
              className={`sync-toggle__button${autoEnabled ? ' sync-toggle__button--active' : ''}`}
              onClick={handleToggleAutoSync}
              aria-pressed={autoEnabled}
              disabled={!autoEnabled && (!configured || !syncIdConnected)}
            >
              {autoEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="sync-last-state" aria-label="現在の同期状態">
            <span>最終同期 {formatDateTime(lastState.lastSyncAt) || '未実行'}</span>
            <strong>{lastState.status || '待機中'}</strong>
          </div>
        </section>

        <details className="sync-advanced">
          <summary>
            <span>
              <strong>バックアップ・診断・詳細</strong>
              <small>困ったときやJSON保存が必要なときに開く</small>
            </span>
            <ChevronDownIcon size={20} />
          </summary>

          <div className="sync-advanced__body">
            <section className="sync-advanced__section">
              <h2>端末内バックアップ</h2>
              <p>同期とは別に、現在のデータをJSONファイルとして保存できます。</p>
              <div className="sync-actions">
                <button type="button" className="sync-button sync-button--secondary" onClick={handleDownloadBackup} disabled={busy}>
                  <DownloadIcon size={18} />
                  <span>JSONバックアップを保存</span>
                </button>
                <button type="button" className="sync-button sync-button--secondary" onClick={handleClearSyncBackups} disabled={busy}>
                  同期前の一時バックアップを整理
                </button>
              </div>
              {storageUsage ? <p className="sync-card__compact-note">端末ストレージ使用量：{storageUsage}</p> : null}
            </section>

            <section className="sync-advanced__section">
              <h2>接続診断</h2>
              <p>同期できない場合に、クラウドとの接続状態を確認します。</p>
              <button type="button" className="sync-button sync-button--secondary" onClick={handleDiagnostic} disabled={diagnosticBusy}>
                {diagnosticBusy ? '診断中...' : '接続を診断する'}
              </button>
              {diagnosticResult ? (
                <div className="sync-diagnostic" aria-live="polite">
                  <div className={`sync-diagnostic__summary${diagnosticResult.ok ? ' sync-diagnostic__summary--ok' : ' sync-diagnostic__summary--ng'}`}>
                    同期診断結果：{diagnosticResult.ok ? 'OK' : 'NG'}
                  </div>
                  <div className="sync-diagnostic__steps">
                    {diagnosticResult.steps.map((step) => (
                      <div key={step.name} className={`sync-diagnostic__step${step.ok ? ' sync-diagnostic__step--ok' : ' sync-diagnostic__step--ng'}`}>
                        <div className="sync-diagnostic__step-head">
                          <span>{step.name}</span>
                          <strong>{step.ok ? 'OK' : 'NG'}</strong>
                        </div>
                        {step.message ? <p>{step.message}</p> : null}
                        {step.errorCode ? <p>code: {step.errorCode}</p> : null}
                        {step.errorDetails ? <p>details: {step.errorDetails}</p> : null}
                        {step.errorHint ? <p>hint: {step.errorHint}</p> : null}
                        {step.suggestion ? <p className="sync-diagnostic__suggestion">{step.suggestion}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="sync-advanced__section">
              <h2>同期の詳細</h2>
              <div className="sync-meta-grid">
                <div className="sync-meta-item">
                  <span>最終同期</span>
                  <strong>{formatDateTime(lastState.lastSyncAt) || '未実行'}</strong>
                </div>
                <div className="sync-meta-item">
                  <span>クラウド更新</span>
                  <strong>{formatDateTime(lastState.lastRemoteUpdatedAt) || '未確認'}</strong>
                </div>
                <div className="sync-meta-item sync-meta-item--wide">
                  <span>状態</span>
                  <strong>{lastState.status || '待機中'}</strong>
                </div>
                <div className="sync-meta-item">
                  <span>クラウドURL</span>
                  <strong>{environmentStatus.hasUrl ? '設定済み' : '未設定'}</strong>
                </div>
                <div className="sync-meta-item">
                  <span>接続キー</span>
                  <strong>{environmentStatus.hasAnonKey ? '設定済み' : '未設定'}</strong>
                </div>
              </div>
              {lastState.error ? <p className="sync-card__error-text">{lastState.error}</p> : null}
            </section>

            <section className="sync-advanced__section sync-advanced__section--danger">
              <h2>クラウドデータの削除</h2>
              <p>現在の同期IDに保存されたクラウド上のデータだけを削除します。この端末の問題や学習履歴は残ります。</p>
              <button
                type="button"
                className="sync-button sync-button--danger"
                onClick={() => setDeleteCloudConfirmOpen(true)}
                disabled={!canRun || !configured}
              >
                クラウドデータを削除
              </button>
            </section>
          </div>
        </details>
      </main>

      <ConfirmDialog
        open={Boolean(pendingConnectSyncId)}
        title="同期先を変更しますか？"
        message={'現在の同期IDとの接続を解除し、入力したIDへ切り替えます。誤った自動送信を防ぐため、自動同期はOFFになります。'}
        confirmLabel="このIDへ変更"
        onCancel={() => setPendingConnectSyncId('')}
        onConfirm={() => applyConnectedSyncId(pendingConnectSyncId)}
      />
      <ConfirmDialog
        open={Boolean(pendingGeneratedSyncId)}
        title="同期IDを作り直しますか？"
        message={'現在の同期IDとの接続は解除されます。ほかの端末と引き続き同期する場合は、現在のIDを先に控えてください。'}
        confirmLabel="新しいIDへ変更"
        onCancel={() => setPendingGeneratedSyncId('')}
        onConfirm={() => applyGeneratedSyncId(pendingGeneratedSyncId)}
      />
      <ConfirmDialog
        open={pendingCloudImport !== null}
        title={'クラウドから読み込みますか？'}
        message={pendingCloudImport ? `クラウドのデータでこの端末のデータを上書きします。\n\nクラウド内容: ${formatSyncSummary(pendingCloudImport.summary)}\n\n必要な場合は、先に詳細メニューの「JSONバックアップを保存」を実行してください。` : ''}
        confirmLabel={busy ? '読み込み中…' : '読み込む'}
        busy={busy}
        onCancel={cancelCloudImport}
        onConfirm={() => void confirmCloudImport()}
      />
      <ConfirmDialog
        open={pendingCloudOverwrite !== null}
        title="クラウドに別のデータがあります"
        message={pendingCloudOverwrite ? `この端末が最後に確認した後で、クラウド側が更新されています。\n\nこの端末の内容で強制的に上書きしますか？\n端末内容: ${formatSyncSummary(pendingCloudOverwrite.summary)}\n\n必要な場合は、先に詳細メニューの「JSONバックアップを保存」を実行してください。` : ''}
        confirmLabel="強制上書き"
        onCancel={cancelCloudOverwrite}
        onConfirm={() => void confirmCloudOverwrite()}
      />
      <ConfirmDialog
        open={clearBackupsConfirmOpen}
        title={'\u540c\u671f\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u6574\u7406\u3057\u307e\u3059\u304b\uff1f'}
        message={'\u540c\u671f\u8aad\u307f\u8fbc\u307f\u524d\u306b\u4f5c\u6210\u3055\u308c\u305f\u4e00\u6642\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3060\u3051\u3092\u524a\u9664\u3057\u307e\u3059\u3002\n\u554f\u984c\u30c7\u30fc\u30bf\u3084\u30ce\u30fc\u30c8\u672c\u4f53\u306f\u524a\u9664\u3055\u308c\u307e\u305b\u3093\u3002'}
        confirmLabel={'\u6574\u7406\u3059\u308b'}
        onCancel={() => setClearBackupsConfirmOpen(false)}
        onConfirm={confirmClearSyncBackups}
      />
      <ConfirmDialog
        open={deleteCloudConfirmOpen}
        title="クラウドデータを削除しますか？"
        message={'この同期IDでクラウドに保存された問題、学習履歴、ノートを削除します。\nこの端末内のデータは削除されません。削除後は元に戻せません。'}
        confirmLabel={busy ? '削除中…' : 'クラウドから削除'}
        busy={busy}
        onCancel={() => setDeleteCloudConfirmOpen(false)}
        onConfirm={() => void confirmDeleteCloudData()}
      />
    </div>
  );
}

function formatDateTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
}

function formatSyncSummary(summary: SyncPayloadSummary) {
  return `フォルダ${summary.folderCount} / セット${summary.problemSetCount} / 問題${summary.questionCount} / 進捗${summary.progressCount} / ノート${summary.noteCount} / ${formatBytes(summary.byteSize)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function formatBackupFileDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
