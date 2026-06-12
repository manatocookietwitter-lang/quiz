import { useState } from 'react';
import type { AppData, ProblemSet } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { formatDisplayDate } from '../utils/date';
import { getProblemSetsByFolder, getQuestionsBySet } from '../utils/quiz';
import './FolderScreen.css';

interface FolderScreenProps {
  data: AppData;
  folderId: string;
  onBack: () => void;
  onOpenImport: (folderId: string) => void;
  onOpenProblemSet: (setId: string) => void;
  onDeleteProblemSet: (setId: string) => void;
}

export function FolderScreen({ data, folderId, onBack, onOpenImport, onOpenProblemSet, onDeleteProblemSet }: FolderScreenProps) {
  const folder = data.folders.find((item) => item.id === folderId);
  const problemSets = getProblemSetsByFolder(data, folderId);
  const [editMode, setEditMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProblemSet | null>(null);

  if (!folder) {
    return (
      <Layout>
        <div className="quiz-folder">
          <FolderHeader title="Quiz make" onBack={onBack} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="quiz-folder">
        <FolderHeader title={folder.name} onBack={onBack} />

        {editMode ? (
          <section className="quiz-folder__delete-mode-bar" aria-label="削除モード">
            <span>削除する問題セットを選択</span>
            <button type="button" onClick={() => setEditMode(false)}>
              完了
            </button>
          </section>
        ) : (
          <section className="quiz-folder__actions" aria-label="操作">
            <FolderCircleButton icon="✎" label="編集" onClick={() => setEditMode(true)} />
            <FolderCircleButton icon="＋" label="新規問題" onClick={() => onOpenImport(folder.id)} />
          </section>
        )}

        <section className="quiz-folder__set-list" aria-label="一覧">
          {problemSets.map((problemSet) => {
            const summary = getSetSummary(data, problemSet.id);
            return (
              <SetCard
                key={problemSet.id}
                problemSet={problemSet}
                questionCount={summary.questionCount}
                reviewCount={summary.reviewCount}
                correctRate={summary.correctRate}
                editMode={editMode}
                onOpen={() => onOpenProblemSet(problemSet.id)}
                onDelete={() => setDeleteTarget(problemSet)}
              />
            );
          })}
        </section>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="この問題セットを削除しますか？"
          message={`問題セット名：\n${deleteTarget?.title ?? ''}\n\nこのデータ内の問題、学習記録、復習レベルも削除されます。`}
          confirmLabel="削除"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) onDeleteProblemSet(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      </div>
    </Layout>
  );
}

function FolderHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="quiz-folder__header">
      <div className="quiz-folder__header-slope" />
      <BackButton onClick={onBack} className="quiz-folder__back-button" />
      <h1 className="quiz-folder__title">{title}</h1>
      <button type="button" className="quiz-folder__header-action" aria-label="メニュー">
        ≡
      </button>
    </header>
  );
}

function FolderCircleButton({ active = false, icon, label, onClick }: { active?: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className="quiz-folder__action" onClick={onClick}>
      <span className={`quiz-folder__circle-button${active ? ' quiz-folder__circle-button--active' : ''}`}>{icon}</span>
      <span className="quiz-folder__action-label">{label}</span>
    </button>
  );
}

function SetCard({
  problemSet,
  questionCount,
  reviewCount,
  correctRate,
  editMode,
  onOpen,
  onDelete,
}: {
  problemSet: ProblemSet;
  questionCount: number;
  reviewCount: number;
  correctRate: number;
  editMode: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="quiz-folder__set-card">
      <button type="button" className="quiz-folder__set-main" disabled={editMode} onClick={onOpen}>
        <span className="quiz-folder__set-icon" aria-hidden="true">
          <span className="quiz-folder__set-icon-line" />
          <span className="quiz-folder__set-icon-line" />
          <span className="quiz-folder__set-icon-line" />
        </span>
        <span className="quiz-folder__set-body">
          <span className="quiz-folder__set-name">{problemSet.title}</span>
          <span className="quiz-folder__set-source">{problemSet.source || `更新 ${formatDisplayDate(problemSet.updatedAt)}`}</span>
          <span className="quiz-folder__set-stats">
            <span>🏷 {questionCount}</span>
            <span>🔖 {reviewCount}</span>
            <span>✅ {correctRate}%</span>
          </span>
        </span>
        {!editMode ? <span className="quiz-folder__set-arrow">›</span> : null}
      </button>

      {editMode ? (
        <button type="button" className="quiz-folder__delete-button" onClick={onDelete}>
          削除
        </button>
      ) : null}
    </article>
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
    reviewCount: progress.filter((item) => item.isReview && !item.isGraduated).length,
    correctRate: logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100),
  };
}
