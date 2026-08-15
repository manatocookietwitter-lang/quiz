import React, { type ErrorInfo, type ReactNode } from 'react';
import { exportQuizMakeRecoveryData } from '../utils/syncService';
import { formatBackupDate } from '../utils/date';
import { saveJsonBackup } from '../utils/nativePlatform';
import './AppErrorBoundary.css';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type RecoveryState = 'idle' | 'exporting' | 'exported' | 'error';

type AppErrorBoundaryState = {
  hasError: boolean;
  recoveryState: RecoveryState;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    recoveryState: 'idle',
  };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('QuizMake encountered an unrecoverable render error.', error, info);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private exportBackup = async (): Promise<void> => {
    if (this.state.recoveryState === 'exporting') return;
    this.setState({ recoveryState: 'exporting' });
    try {
      const payload = await exportQuizMakeRecoveryData();
      await saveJsonBackup(
        `quiz-make-backup-${formatBackupDate()}.json`,
        JSON.stringify(payload, null, 2),
      );
      this.setState({ recoveryState: 'exported' });
    } catch (error) {
      console.error('Failed to export a recovery backup.', error);
      this.setState({ recoveryState: 'error' });
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const supportUrl = `${import.meta.env.BASE_URL}support.html`;
    const { recoveryState } = this.state;

    return (
      <main className="app-error-boundary" role="alert" aria-labelledby="app-error-title">
        <section className="app-error-boundary__panel">
          <div className="app-error-boundary__mark" aria-hidden="true">!</div>
          <p className="app-error-boundary__eyebrow">QuizMake</p>
          <h1 id="app-error-title">画面を表示できませんでした</h1>
          <p className="app-error-boundary__description">
            一時的な問題が発生しました。端末の学習データは自動では削除されません。
            まず画面を再読み込みしてください。
          </p>

          <div className="app-error-boundary__actions">
            <button className="app-error-boundary__primary" type="button" onClick={this.reload}>
              再読み込み
            </button>
            <button
              className="app-error-boundary__secondary"
              type="button"
              onClick={this.exportBackup}
              disabled={recoveryState === 'exporting'}
            >
              {recoveryState === 'exporting' ? 'バックアップを作成中…' : '端末データを書き出す'}
            </button>
          </div>

          {recoveryState === 'exported' ? (
            <p className="app-error-boundary__status" role="status">バックアップを書き出しました。</p>
          ) : null}
          {recoveryState === 'error' ? (
            <p className="app-error-boundary__status app-error-boundary__status--error">
              バックアップを書き出せませんでした。再読み込み後に設定画面からもう一度お試しください。
            </p>
          ) : null}

          <a className="app-error-boundary__support" href={supportUrl} target="_blank" rel="noreferrer">
            解決しない場合はサポートを見る
          </a>
        </section>
      </main>
    );
  }
}
