import { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import {
  computePayloadHash,
  downloadSyncData,
  exportQuizMakeData,
  generateSyncId,
  getAutoSyncSettings,
  getLastSyncState,
  getStoredSyncId,
  importQuizMakeData,
  isSyncConfigured,
  runSyncDiagnostic,
  setAutoSyncEnabled,
  setStoredSyncId,
  summarizeSyncPayload,
  uploadSyncData,
  type LastSyncState,
  type SyncDiagnosticResult,
} from '../utils/syncService';
import './SyncScreen.css';

interface SyncScreenProps {
  onBack: () => void;
}

export function SyncScreen({ onBack }: SyncScreenProps) {
  const configured = useMemo(() => isSyncConfigured(), []);
  const [syncId, setSyncId] = useState(() => getStoredSyncId());
  const [autoEnabled, setAutoEnabledState] = useState(() => getAutoSyncSettings().enabled);
  const [lastState, setLastState] = useState<LastSyncState>(() => getLastSyncState());
  const [busy, setBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<SyncDiagnosticResult | null>(null);
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

  const updateSyncId = (value: string) => {
    setSyncId(value);
    setStoredSyncId(value);
    setError('');
  };

  const handleGenerate = () => {
    const nextId = generateSyncId();
    updateSyncId(nextId);
    setError('');
    setMessage('同期IDを生成しました。別端末にも同じIDを入力してください。');
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

  const handleUpload = async () => {
    if (!normalizedSyncId) {
      setError('同期IDを入力してください。');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('クラウドへ保存しています...');

    const payload = exportQuizMakeData();
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
    const ok = window.confirm(`クラウドのデータでこの端末のデータを上書きします。\nクラウド内容: ${formatSyncSummary(remoteSummary)}\n現在の端末データは置き換わります。実行しますか？`);
    if (!ok) {
      setMessage('読み込みをキャンセルしました。');
      return;
    }

    const importResult = importQuizMakeData(result.value.payload);
    setLastState(getLastSyncState());
    if (!importResult.ok) {
      setMessage('');
      setError(importResult.error);
      return;
    }

    setMessage(`クラウドから読み込みました。${formatSyncSummary(remoteSummary)} / アプリを再読み込みします...`);
    window.setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="sync-screen">
      <header className="sync-screen__header">
        <BackButton onClick={onBack} label="戻る" className="sync-screen__back" />
        <div className="sync-screen__header-text">
          <h1>同期設定</h1>
          <p>同期IDでデータ共有</p>
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
            placeholder="推測されにくい同期ID"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="sync-button sync-button--secondary" onClick={handleGenerate} disabled={busy}>
            同期IDを生成
          </button>
        </section>

        <section className="sync-card">
          <div className="sync-card__title-row sync-card__title-row--center">
            <div>
              <h2>自動同期</h2>
            </div>
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
          </div>
        </section>

        <section className="sync-card">
          <div className="sync-card__title-row sync-card__title-row--center">
            <div>
              <h2>接続診断</h2>
            </div>
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

        {!configured ? (
          <div className="sync-alert sync-alert--warning">
            環境変数 VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が未設定です。設定するまでクラウド同期は実行できません。
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

function formatSyncSummary(summary: ReturnType<typeof summarizeSyncPayload>) {
  const size = summary.byteSize >= 1024 * 1024
    ? `${(summary.byteSize / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(summary.byteSize / 1024))}KB`;
  return `フォルダ${summary.folderCount} / セット${summary.problemSetCount} / 問題${summary.questionCount} / 進捗${summary.progressCount} / ノート${summary.noteCount} / ${size}`;
}