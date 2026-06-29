import { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import {
  clearSyncLocalBackups,
  computePayloadHash,
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
  setStoredSyncId,
  summarizeSyncPayload,
  uploadSyncData,
  type LastSyncState,
  type SyncDiagnosticResult,
  type SyncPayloadSummary,
} from '../utils/syncService';
import './SyncScreen.css';

interface SyncScreenProps {
  onBack: () => void;
}

export function SyncScreen({ onBack }: SyncScreenProps) {
  const configured = useMemo(() => isSyncConfigured(), []);
  const environmentStatus = useMemo(() => getSyncEnvironmentStatus(), []);
  const [syncId, setSyncId] = useState(() => getStoredSyncId());
  const [autoEnabled, setAutoEnabledState] = useState(() => getAutoSyncSettings().enabled);
  const [lastState, setLastState] = useState<LastSyncState>(() => getLastSyncState());
  const [busy, setBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<SyncDiagnosticResult | null>(null);
  const [storageUsage, setStorageUsage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const normalizedSyncId = syncId.trim();
  const canRun = Boolean(normalizedSyncId) && !busy;
  const autoCanRun = autoEnabled && configured && Boolean(normalizedSyncId);

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

  const updateSyncId = (value: string) => {
    setSyncId(value);
    setStoredSyncId(value);
    setError('');
  };

  const handleGenerate = () => {
    const nextId = generateSyncId();
    updateSyncId(nextId);
    setError('');
    setMessage('同期IDを生成しました。ほかの端末にも同じIDを入力してください。');
  };

  const handleToggleAutoSync = () => {
    setMessage('');
    setError('');

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
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `quiz-make-backup-${formatBackupFileDate(new Date())}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
      setMessage('現在データのJSONバックアップを作成しました。');
    } catch (caughtError) {
      const detail = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setMessage('');
      setError(`JSONバックアップの作成に失敗しました: ${detail}`);
    }
  };

  const handleClearSyncBackups = () => {
    const ok = window.confirm('同期読み込み前に作成された一時バックアップだけを削除します。\n問題データやノート本体は削除されません。\n実行しますか？');
    if (!ok) return;
    const count = clearSyncLocalBackups();
    setError('');
    setMessage(count > 0 ? `同期バックアップを${count}件整理しました。` : '整理対象の同期バックアップはありません。');
  };

  const handleUpload = async () => {
    if (!normalizedSyncId) {
      setError('同期IDを入力してください。');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('クラウドへ保存しています...');

    const payload = await exportQuizMakeData();
    const localHash = computePayloadHash(payload);
    const localSummary = summarizeSyncPayload(payload);
    const result = await uploadSyncData(normalizedSyncId, payload);

    if (!result.ok) {
      setBusy(false);
      setLastState(getLastSyncState());
      setMessage('');
      setError(result.error);
      return;
    }

    const verify = await downloadSyncData(normalizedSyncId);
    setBusy(false);
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

  const handleDownload = async () => {
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
    const ok = window.confirm(`クラウドのデータでこの端末のデータを上書きします。\n\nクラウド内容: ${formatSyncSummary(remoteSummary)}\n\n必要な場合は、先に「現在データをJSONバックアップ」で保存してください。\n実行しますか？`);
    if (!ok) {
      setMessage('読み込みをキャンセルしました。');
      return;
    }

    const importResult = await importQuizMakeData(result.value.payload);
    setLastState(getLastSyncState());
    if (!importResult.ok) {
      setMessage('');
      setError(importResult.error);
      return;
    }

    setMessage(`クラウドから読み込みました。${formatSyncSummary(remoteSummary)} / アプリを再読み込みします...`);
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
        <BackButton onClick={onBack} label="戻る" className="sync-screen__back" />
        <div className="sync-screen__header-text">
          <h1>同期設定</h1>
          <p>同期IDで端末間共有</p>
        </div>
      </header>

      <main className="sync-screen__body">
        <section className="sync-card">
          <div className="sync-card__title-row">
            <h2>同期ID</h2>
            <span className={`sync-status${configured ? ' sync-status--ok' : ' sync-status--unset'}`}>
              {configured ? 'Supabase設定済み' : 'Supabase未設定'}
            </span>
          </div>
          <input
            className="sync-input"
            value={syncId}
            onChange={(event) => updateSyncId(event.target.value)}
            placeholder="同期ID"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="sync-button sync-button--secondary" onClick={handleGenerate} disabled={busy}>
            同期IDを生成
          </button>
        </section>

        <section className="sync-card">
          <div className="sync-card__title-row sync-card__title-row--center">
            <h2>自動同期</h2>
            <button
              type="button"
              className={`sync-toggle__button${autoEnabled ? ' sync-toggle__button--active' : ''}`}
              onClick={handleToggleAutoSync}
              aria-pressed={autoEnabled}
            >
              {autoEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className={`sync-auto-state${autoCanRun ? ' sync-auto-state--ready' : ''}`}>
            {autoCanRun ? '自動同期は有効です' : autoEnabled ? '同期IDまたはSupabase設定が不足しています' : '自動同期はOFFです'}
          </div>
        </section>

        <section className="sync-card">
          <h2>手動同期</h2>
          <div className="sync-actions">
            <button type="button" className="sync-button sync-button--primary" onClick={handleUpload} disabled={!canRun}>
              {busy ? '処理中...' : 'クラウドへ保存'}
            </button>
            <button type="button" className="sync-button sync-button--secondary" onClick={handleDownload} disabled={!canRun}>
              クラウドから読み込み
            </button>
            <button type="button" className="sync-button sync-button--secondary" onClick={handleDownloadBackup} disabled={busy}>
              現在データをJSONバックアップ
            </button>
            <button type="button" className="sync-button sync-button--secondary" onClick={handleClearSyncBackups} disabled={busy}>
              同期バックアップを整理
            </button>
          </div>
          <p className="sync-card__compact-note">ノートが多い場合、同期データが大きくなります。読み込み前はJSON保存がおすすめです。</p>
          {storageUsage ? <p className="sync-card__compact-note">端末ストレージ使用量：{storageUsage}</p> : null}
        </section>

        <section className="sync-card">
          <div className="sync-card__title-row sync-card__title-row--center">
            <h2>接続診断</h2>
          </div>
          <button type="button" className="sync-button sync-button--secondary" onClick={handleDiagnostic} disabled={diagnosticBusy}>
            {diagnosticBusy ? '診断中...' : '接続診断'}
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

        <section className="sync-card">
          <h2>同期状態</h2>
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
          </div>
          {lastState.error ? <p className="sync-card__error-text">{lastState.error}</p> : null}
        </section>

        <section className="sync-card sync-card--compact-env">
          <h2>設定</h2>
          <div className="sync-meta-grid">
            <div className="sync-meta-item">
              <span>Supabase URL</span>
              <strong>{environmentStatus.hasUrl ? '設定済み' : '未設定'}</strong>
            </div>
            <div className="sync-meta-item">
              <span>anon key</span>
              <strong>{environmentStatus.hasAnonKey ? '設定済み' : '未設定'}</strong>
            </div>
          </div>
        </section>

        {!configured ? (
          <div className="sync-alert sync-alert--warning">
            VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が未設定です。設定するまでクラウド同期は実行できません。
          </div>
        ) : null}

        {message ? <div className="sync-alert sync-alert--message">{message}</div> : null}
        {error ? <div className="sync-alert sync-alert--error">{error}</div> : null}
      </main>
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