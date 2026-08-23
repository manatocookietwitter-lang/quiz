import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import './StorageRecoveryPanel.css';

interface StorageRecoveryPanelProps {
  error: string;
  actionError?: string;
  notice?: string;
  busy?: boolean;
  onRetry: () => void;
  onExport: () => Promise<void>;
  onImportFile: (file: File) => Promise<string | null>;
  onOpenSync: () => void;
}

export function StorageRecoveryPanel({
  error,
  actionError = '',
  notice = '',
  busy = false,
  onRetry,
  onExport,
  onImportFile,
  onOpenSync,
}: StorageRecoveryPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || localBusy || busy) return;
    setLocalBusy(true);
    setLocalError('');
    const result = await onImportFile(file);
    if (result) setLocalError(result);
    setLocalBusy(false);
  };

  const disabled = busy || localBusy;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="quiz-storage-recovery" aria-labelledby="storage-recovery-title">
      <div className="quiz-storage-recovery__panel">
        <p className="quiz-storage-recovery__eyebrow">データを保護するため停止しました</p>
        <h1 id="storage-recovery-title" ref={headingRef} tabIndex={-1}>保存データを読み込めません</h1>
        <p role="alert">{error}</p>
        <p>空の状態では保存していません。まず再試行し、直らない場合は下の復旧方法を選んでください。</p>

        <div className="quiz-storage-recovery__actions">
          <button type="button" onClick={onRetry} disabled={disabled}>読み込みを再試行</button>
          <button type="button" className="quiz-storage-recovery__secondary" onClick={() => void onExport()} disabled={disabled}>
            現在読める内容をバックアップ
          </button>
          <button type="button" className="quiz-storage-recovery__secondary" onClick={() => inputRef.current?.click()} disabled={disabled}>
            JSONバックアップから復元
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="quiz-storage-recovery__file"
            onChange={(event) => void handleFile(event)}
            tabIndex={-1}
            aria-hidden="true"
          />
          <button type="button" className="quiz-storage-recovery__secondary" onClick={onOpenSync} disabled={disabled}>
            クラウド同期から復元
          </button>
        </div>

        {(localError || actionError) ? <p className="quiz-storage-recovery__error" role="alert">{localError || actionError}</p> : null}
        {notice ? <p className="quiz-storage-recovery__notice" role="status">{notice}</p> : null}
        <p className="quiz-storage-recovery__footnote">復旧が完了するまで、空のデータをクラウドへ保存することはありません。</p>
      </div>
    </main>
  );
}
