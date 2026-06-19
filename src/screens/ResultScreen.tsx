import type { QuizResult } from '../types';
import { Layout } from '../components/Layout';
import './ResultScreen.css';

interface ResultScreenProps {
  result: QuizResult;
  onHome: () => void;
  onRetry: () => void;
}

export function ResultScreen({ result, onHome, onRetry }: ResultScreenProps) {
  const correctRate = result.answered === 0 ? 0 : Math.round((result.correct / result.answered) * 100);
  const completionMessage = result.mode === 'review'
    ? '\u5fa9\u7fd2\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002'
    : '\u901a\u5e38\u5b66\u7fd2\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002';

  return (
    <Layout>
      <main className="result-screen">
        <div className="result-screen__inner">
          <header className="result-header">
            <h1>{'\u7d50\u679c'}</h1>
            <p>{result.title}</p>
          </header>

          <section className="result-summary-card" aria-label="\u4eca\u56de\u306e\u6b63\u7b54\u7387">
            <div className="result-rate-label">{'\u4eca\u56de\u306e\u6b63\u7b54\u7387'}</div>
            <div className="result-rate-value">{correctRate}%</div>
          </section>

          <p className="result-message">{completionMessage}</p>

          <section className="result-stats-grid" aria-label="\u7d50\u679c\u8a73\u7d30">
            <ResultStat label="\u89e3\u3044\u305f\u554f\u984c\u6570" value={result.answered} />
            <ResultStat label="\u6b63\u89e3\u6570" value={result.correct} />
            <ResultStat label="\u4e0d\u6b63\u89e3\u6570" value={result.wrong} />
            <ResultStat label="\u5fa9\u7fd2\u306b\u8ffd\u52a0" value={result.addedReviewCount} />
          </section>
        </div>

        <section className="result-actions" aria-label="\u7d50\u679c\u64cd\u4f5c">
          <button type="button" onClick={onHome} className="result-button result-button--secondary">
            {'\u30db\u30fc\u30e0\u306b\u623b\u308b'}
          </button>
          <button type="button" onClick={onRetry} className="result-button result-button--primary">
            {'\u3082\u3046\u4e00\u5ea6\u89e3\u304f'}
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