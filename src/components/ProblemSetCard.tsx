import type { ProblemSet } from '../types';
import { formatDisplayDate } from '../utils/date';

interface ProblemSetCardProps {
  problemSet: ProblemSet;
  questionCount: number;
  answeredCount: number;
  reviewCount: number;
  correctRate: number;
  editMode: boolean;
  onStartOrdered: () => void;
  onStartRandom: () => void;
  onDelete: () => void;
}

export function ProblemSetCard({
  problemSet,
  questionCount,
  answeredCount,
  reviewCount,
  correctRate,
  editMode,
  onStartOrdered,
  onStartRandom,
  onDelete,
}: ProblemSetCardProps) {
  return (
    <div className="rounded-[22px] bg-neutral-800 p-4 ring-1 ring-white/10">
      <button type="button" onClick={onStartOrdered} disabled={editMode} className="block w-full text-left active:scale-[0.99]">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-neutral-900 text-2xl ring-1 ring-white/10">
            📝
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate text-base font-black text-white">{problemSet.title}</h2>
              {!editMode ? <span className="text-2xl font-light leading-none text-neutral-500">›</span> : null}
            </div>
            <p className="mt-1 truncate text-[11px] font-bold text-neutral-500">
              {problemSet.source || 'sourceなし'} ・ 更新 {formatDisplayDate(problemSet.updatedAt)}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] font-black text-neutral-300">
              <span>🏷 {questionCount}</span>
              <span>✍️ {answeredCount}</span>
              <span>🔖 {reviewCount}</span>
              <span>✅ {correctRate}%</span>
            </div>
          </div>
        </div>
      </button>

      {editMode ? (
        <button
          type="button"
          onClick={onDelete}
          className="mt-3 min-h-[44px] w-full rounded-2xl bg-rose-500/15 text-sm font-black text-rose-300 ring-1 ring-rose-400/20 active:scale-[0.98]"
        >
          問題セット削除
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onStartOrdered}
            className="min-h-[44px] rounded-2xl bg-cyan-500 text-sm font-black text-neutral-950 active:scale-[0.98]"
          >
            登録順
          </button>
          <button
            type="button"
            onClick={onStartRandom}
            className="min-h-[44px] rounded-2xl bg-neutral-900 text-sm font-black text-cyan-300 ring-1 ring-cyan-400/20 active:scale-[0.98]"
          >
            ランダム
          </button>
        </div>
      )}
    </div>
  );
}
