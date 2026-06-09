import type { QuizResult } from '../types';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { StatCard } from '../components/StatCard';

interface ResultScreenProps {
  result: QuizResult;
  onHome: () => void;
  onRetry: () => void;
}

export function ResultScreen({ result, onHome, onRetry }: ResultScreenProps) {
  const correctRate = result.answered === 0 ? 0 : Math.round((result.correct / result.answered) * 100);

  return (
    <Layout>
      <Header title="結果" subtitle={result.title} />

      <section className="mx-4 mt-4 rounded-[28px] bg-neutral-900 p-5 text-center ring-1 ring-white/10">
        <div className="text-sm font-black text-cyan-300">今回の正答率</div>
        <div className="mt-2 text-6xl font-black tracking-tight text-white">{correctRate}%</div>
        <p className="mt-3 text-sm font-bold text-neutral-400">
          {result.mode === 'review' ? '復習モードが完了しました。' : '通常学習が完了しました。'}
        </p>
      </section>

      <section className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <StatCard label="解いた問題数" value={result.answered} accent />
        <StatCard label="正解数" value={result.correct} />
        <StatCard label="不正解数" value={result.wrong} />
        <StatCard label="復習に追加" value={result.addedReviewCount} />
      </section>

      <div className="min-h-0 flex-1" />

      <section className="grid shrink-0 grid-cols-2 gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onHome}
          className="min-h-[56px] rounded-2xl bg-neutral-900 px-4 text-sm font-black text-neutral-100 ring-1 ring-white/10 active:scale-[0.98]"
        >
          ホームに戻る
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[56px] rounded-2xl bg-cyan-500 px-4 text-sm font-black text-neutral-950 active:scale-[0.98]"
        >
          もう一度解く
        </button>
      </section>
    </Layout>
  );
}
