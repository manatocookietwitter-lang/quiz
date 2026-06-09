import { useState } from 'react';
import type { AppData, ProblemSet, QuizMode } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { ProblemSetCard } from '../components/ProblemSetCard';
import { getProblemSetsByFolder, getQuestionsBySet } from '../utils/quiz';

interface FolderScreenProps {
  data: AppData;
  folderId: string;
  onBack: () => void;
  onOpenImport: (folderId: string) => void;
  onStartQuiz: (setId: string, mode: QuizMode) => void;
  onDeleteProblemSet: (setId: string) => void;
}

export function FolderScreen({ data, folderId, onBack, onOpenImport, onStartQuiz, onDeleteProblemSet }: FolderScreenProps) {
  const folder = data.folders.find((item) => item.id === folderId);
  const problemSets = getProblemSetsByFolder(data, folderId);
  const [deleteTarget, setDeleteTarget] = useState<ProblemSet | null>(null);
  const [editMode, setEditMode] = useState(false);

  if (!folder) {
    return (
      <Layout>
        <Header title="フォルダが見つかりません" leftLabel="戻る" onLeft={onBack} />
        <div className="mx-4 mt-4 rounded-[24px] bg-neutral-900 p-5 text-sm font-bold leading-relaxed text-neutral-400 ring-1 ring-white/10">
          削除済み、またはデータが壊れている可能性があります。
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header
        title={folder.name}
        subtitle="問題セット一覧"
        leftLabel="戻る"
        onLeft={onBack}
        right={
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-800 text-lg font-black text-white ring-1 ring-white/10 active:scale-95"
            aria-label="編集"
          >
            {editMode ? '✓' : '✎'}
          </button>
        }
      />

      <section className="shrink-0 px-4 pt-4">
        <div className="flex justify-end gap-5 pr-2">
          <RoundActionButton
            label={editMode ? '完了' : '編集'}
            icon={editMode ? '✓' : '✎'}
            active={editMode}
            onClick={() => setEditMode((value) => !value)}
          />
          <RoundActionButton label="新規問題" icon="＋" onClick={() => onOpenImport(folder.id)} />
        </div>
      </section>

      <section className="mt-4 flex min-h-0 flex-1 flex-col px-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-black text-white">問題セット</h2>
            <p className="text-[11px] font-bold text-neutral-500">カードをタップすると登録順で開始</p>
          </div>
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-black text-neutral-400 ring-1 ring-white/10">
            {problemSets.length}件
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3 no-scrollbar">
          {problemSets.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full rounded-[28px] bg-neutral-900 p-6 text-center ring-1 ring-white/10">
                <div className="text-6xl">📝</div>
                <h3 className="mt-4 text-lg font-black text-white">問題セットがまだありません</h3>
                <p className="mt-2 text-sm font-bold leading-relaxed text-neutral-400">
                  ChatGPTで作ったJSONを取り込んでください。
                </p>
                <button
                  type="button"
                  onClick={() => onOpenImport(folder.id)}
                  className="mt-5 min-h-[52px] w-full rounded-2xl bg-cyan-500 text-sm font-black text-neutral-950 active:scale-[0.98]"
                >
                  問題セットを追加
                </button>
              </div>
            </div>
          ) : (
            problemSets.map((problemSet) => {
              const summary = getSetSummary(data, problemSet.id);
              return (
                <ProblemSetCard
                  key={problemSet.id}
                  problemSet={problemSet}
                  questionCount={summary.questionCount}
                  answeredCount={summary.answeredCount}
                  reviewCount={summary.reviewCount}
                  correctRate={summary.correctRate}
                  editMode={editMode}
                  onStartOrdered={() => onStartQuiz(problemSet.id, 'ordered')}
                  onStartRandom={() => onStartQuiz(problemSet.id, 'random')}
                  onDelete={() => setDeleteTarget(problemSet)}
                />
              );
            })
          )}
        </div>
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="問題セットを削除しますか？"
        message="この問題セット内の問題、学習記録、復習レベルも削除されます。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteProblemSet(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </Layout>
  );
}

function RoundActionButton({ label, icon, active = false, onClick }: { label: string; icon: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 active:scale-95">
      <span className={`flex h-[68px] w-[68px] items-center justify-center rounded-full text-3xl font-black shadow-lg ${active ? 'bg-white text-neutral-950' : 'bg-cyan-500 text-neutral-950'}`}>
        {icon}
      </span>
      <span className="text-xs font-black text-neutral-200">{label}</span>
    </button>
  );
}

function getSetSummary(data: AppData, setId: string) {
  const questions = getQuestionsBySet(data, setId);
  const questionIds = new Set(questions.map((question) => question.id));
  const progress = data.progress.filter((item) => questionIds.has(item.questionId));
  const logs = data.answerLogs.filter((log) => log.setId === setId);
  const correct = logs.filter((log) => log.isCorrect).length;

  return {
    questionCount: questions.length,
    answeredCount: logs.length,
    reviewCount: progress.filter((item) => item.isReview && !item.isGraduated).length,
    correctRate: logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100),
  };
}
