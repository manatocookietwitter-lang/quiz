import type { QuizResult } from '../types';
import { Layout } from '../components/Layout';
import './ResultScreen.css';

interface ResultScreenProps {
  result: QuizResult;
  returnLabel: string;
  onReturn: () => void;
  onRetry: () => void;
}

export function ResultScreen({ result, returnLabel, onReturn, onRetry }: ResultScreenProps) {
  const correctRate = result.answered === 0 ? 0 : Math.round((result.correct / result.answered) * 100);
  const completionMessage = result.mode === 'review'
    ? '復習が完了しました。'
    : '通常学習が完了しました。';

  return (
    <Layout>
      <main className="result-screen">
        <div className="result-screen__inner">
          <header className="result-header">
            <h1>結果</h1>
            <p>{result.title}</p>
          </header>

          <section className="result-summary-card" aria-label="今回の正答率">
            <div className="result-rate-label">今回の正答率</div>
            <div className="result-rate-value">{correctRate}%</div>
          </section>

          <p className="result-message">{completionMessage}</p>

          <section className="result-stats-grid" aria-label="結果詳細">
            <ResultStat label="解いた問題数" value={result.answered} />
            <ResultStat label="正解数" value={result.correct} />
            <ResultStat label="不正解数" value={result.wrong} />
            <ResultStat label="復習に追加" value={result.addedReviewCount} />
          </section>
        </div>

        <section className="result-actions" aria-label="結果操作">
          <button type="button" onClick={onReturn} className="result-button result-button--secondary">
            {returnLabel}
          </button>
          <button type="button" onClick={onRetry} className="result-button result-button--primary">
            もう一度解く
          </button>
        </section>
      </main>
    </Layout>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="result-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
