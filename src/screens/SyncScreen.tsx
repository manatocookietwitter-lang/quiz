import { useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import {
  downloadSyncData,
  exportQuizMakeData,
  generateSyncId,
  getStoredSyncId,
  importQuizMakeData,
  isSyncConfigured,
  setStoredSyncId,
  uploadSyncData,
} from '../utils/syncService';
import './SyncScreen.css';

interface SyncScreenProps {
  onBack: () => void;
}

export function SyncScreen({ onBack }: SyncScreenProps) {
  const configured = useMemo(() => isSyncConfigured(), []);
  const [syncId, setSyncId] = useState(() => getStoredSyncId());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const normalizedSyncId = syncId.trim();
  const canRun = Boolean(normalizedSyncId) && !busy;

  const updateSyncId = (value: string) => {
    setSyncId(value);
    setStoredSyncId(value);
  };

  const handleGenerate = () => {
    const nextId = generateSyncId();
    updateSyncId(nextId);
    setError('');
    setMessage('同期IDを生成しました。別端末にも同じIDを入力してください。');
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
    const result = await uploadSyncData(normalizedSyncId, payload);
    setBusy(false);

    if (!result.ok) {
      setMessage('');
      setError(result.error);
      return;
    }

    setMessage(`クラウドへ保存しました。更新: ${formatDateTime(result.value.updatedAt)}`);
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

    const ok = window.confirm('クラウドのデータでこの端末のデータを上書きします。現在の端末データは置き換わります。実行しますか？');
    if (!ok) {
      setMessage('読み込みをキャンセルしました。');
      return;
    }

    const importResult = importQuizMakeData(result.value.payload);
    if (!importResult.ok) {
      setMessage('');
      setError(importResult.error);
      return;
    }

    setMessage('クラウドから読み込みました。アプリを再読み込みします...');
    window.setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="sync-screen">
      <header className="sync-screen__header">
        <BackButton onClick={onBack} label="戻る" className="sync-screen__back" />
        <div className="sync-screen__header-text">
          <h1>同期設定</h1>
          <p>手動でクラウド保存・読み込み</p>
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
          <p className="sync-card__description">
            同じ同期IDを使う端末同士で、Quiz makeのlocalStorageデータを手動で共有します。
          </p>
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
          <h2>手動同期</h2>
          <div className="sync-actions">
            <button type="button" className="sync-button sync-button--primary" onClick={handleUpload} disabled={!canRun}>
              {busy ? '処理中...' : 'クラウドへ保存'}
            </button>
            <button type="button" className="sync-button sync-button--secondary" onClick={handleDownload} disabled={!canRun}>
              クラウドから読み込み
            </button>
          </div>
          <p className="sync-card__note">
            自動同期はまだ行いません。保存はクラウドを上書き、読み込みはこの端末を上書きします。
          </p>
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
}
