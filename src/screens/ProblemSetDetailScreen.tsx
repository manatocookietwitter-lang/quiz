import { useMemo, useState } from 'react';
import type { AppData, ProblemSortMode, Question } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { getProgress, getQuestionsBySet, shuffleArray } from '../utils/quiz';
import './ProblemSetDetailScreen.css';

type CategoryFilter = 'all' | string;

interface ProblemSetDetailScreenProps {
  data: AppData;
  setId: string;
  onBack: () => void;
  onOpenImport: (folderId: string) => void;
  onOpenProblemList: () => void;
  onStartSession: (params: {
    questions: Question[];
    mode: 'quiz' | 'review';
    initialIndex?: number;
    title: string;
    subtitle?: string;
    setId: string;
  }) => void;
}

const UNCATEGORIZED = '未分類';

export function ProblemSetDetailScreen({
  data,
  setId,
  onBack,
  onOpenImport,
  onOpenProblemList,
  onStartSession,
}: ProblemSetDetailScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const questions = useMemo(() => getQuestionsBySet(data, setId), [data, setId]);
  const [startCategory, setStartCategory] = useState<CategoryFilter>('all');

  const categories = useMemo(() => buildProblemCategories(questions), [questions]);
  const startQuestions = useMemo(() => filterQuestionsByCategory(questions, startCategory), [questions, startCategory]);

  if (!problemSet) {
    return (
      <Layout>
        <div className="quiz-detail">
          <DetailHeader title="Quiz make" onBack={onBack} />
        </div>
      </Layout>
    );
  }

  const reviewQuestions = buildReviewQuestions(data, startQuestions);
  const allReviewQuestions = buildReviewQuestions(data, questions);
  const logs = data.answerLogs.filter((log) => log.setId === setId);
  const correct = logs.filter((log) => log.isCorrect).length;
  const correctRate = logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100);
  const selectedLabel = getCategoryLabel(startCategory);

  const startOrdered = () => {
    onStartSession({
      questions: startQuestions,
      mode: 'quiz',
      title: problemSet.title,
      subtitle: `${selectedLabel} / 登録順`,
      setId,
    });
  };

  const startRandom = () => {
    onStartSession({
      questions: shuffleArray(startQuestions),
      mode: 'quiz',
      title: problemSet.title,
      subtitle: `${selectedLabel} / ランダム`,
      setId,
    });
  };

  const startReview = () => {
    onStartSession({
      questions: reviewQuestions,
      mode: 'review',
      title: problemSet.title,
      subtitle: `${selectedLabel} / 復習`,
      setId,
    });
  };

  return (
    <Layout>
      <div className="quiz-detail">
        <DetailHeader title={problemSet.title} onBack={onBack} onOpenImport={() => onOpenImport(problemSet.folderId)} />

        <section className="quiz-detail__summary">
          <div className="quiz-detail__metric">
            <span>問題数</span>
            <strong>{questions.length}</strong>
          </div>
          <div className="quiz-detail__metric">
            <span>復習</span>
            <strong>{allReviewQuestions.length}</strong>
          </div>
          <div className="quiz-detail__metric">
            <span>正答率</span>
            <strong>{correctRate}%</strong>
          </div>
        </section>

        <section className="quiz-detail__start-panel">
          <div className="quiz-detail__section-heading">
            <h2>開始</h2>
            <span>{startQuestions.length}問</span>
          </div>
          <div className="quiz-detail__chips" aria-label="開始対象">
            {categories.map((item) => {
              const value = item === 'すべて' ? 'all' : item;
              const active = startCategory === value || (startCategory === 'all' && item === 'すべて');
              return (
                <button
                  key={item}
                  type="button"
                  className={`quiz-detail__chip${active ? ' quiz-detail__chip--active' : ''}`}
                  onClick={() => setStartCategory(value)}
                >
                  {item}
                </button>
              );
            })}
          </div>
          <p className="quiz-detail__selected-target">開始対象：{selectedLabel}</p>
          <div className="quiz-detail__start-actions">
            <button type="button" disabled={startQuestions.length === 0} onClick={startOrdered}>
              登録順で開始
            </button>
            <button type="button" disabled={startQuestions.length === 0} onClick={startRandom}>
              ランダムで開始
            </button>
            <button type="button" disabled={reviewQuestions.length === 0} onClick={startReview} className="quiz-detail__review-start">
              復習する
            </button>
          </div>
        </section>

        <section className="quiz-detail__body">
          <button type="button" className="quiz-detail__list-entry" onClick={onOpenProblemList}>
            <span>
              <strong>問題一覧</strong>
              <small>{questions.length}問 / 分野別に表示</small>
            </span>
            <b aria-hidden="true">›</b>
          </button>
        </section>
      </div>
    </Layout>
  );
}

function DetailHeader({ title, onBack, onOpenImport }: { title: string; onBack: () => void; onOpenImport?: () => void }) {
  return (
    <header className="quiz-detail__header">
      <div className="quiz-detail__header-slope" />
      <BackButton onClick={onBack} className="quiz-detail__back-button" />
      <h1 className="quiz-detail__title">{title}</h1>
      {onOpenImport ? (
        <button type="button" className="quiz-detail__header-icon" aria-label="新規問題" onClick={onOpenImport}>
          ＋
        </button>
      ) : (
        <div className="quiz-detail__header-icon">≡</div>
      )}
    </header>
  );
}

export function normalizeProblemCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}

export function filterQuestionsByCategory(questions: Question[], category: string) {
  if (category === 'all' || category === 'すべて') return questions;
  return questions.filter((question) => normalizeProblemCategory(question.category) === category);
}

export function sortQuestionsForProblemList(data: AppData, questions: Question[], sortMode: ProblemSortMode) {
  if (sortMode === 'ordered') return questions;
  return [...questions].sort((a, b) => getLevelSortScore(data, a.id) - getLevelSortScore(data, b.id));
}

export function buildReviewQuestions(data: AppData, questions: Question[]) {
  const reviewQuestions = questions.filter((question) => {
    const progress = getProgress(data, question.id);
    return progress.isReview && !progress.isGraduated;
  });

  const byLevel: Record<1 | 2 | 3, Question[]> = { 1: [], 2: [], 3: [] };
  reviewQuestions.forEach((question) => {
    const level = getProgress(data, question.id).reviewLevel ?? 1;
    if (level === 1 || level === 2 || level === 3) byLevel[level].push(question);
  });

  return [...shuffleArray(byLevel[1]), ...shuffleArray(byLevel[2]), ...shuffleArray(byLevel[3])];
}

export function buildProblemCategories(questions: Question[]) {
  const names = new Set<string>();
  let hasUncategorized = false;
  questions.forEach((question) => {
    const value = normalizeProblemCategory(question.category);
    if (value === UNCATEGORIZED) {
      hasUncategorized = true;
    } else {
      names.add(value);
    }
  });
  return ['すべて', ...Array.from(names), ...(hasUncategorized ? [UNCATEGORIZED] : [])];
}

function getCategoryLabel(category: string) {
  return category === 'all' || category === 'すべて' ? 'すべて' : category;
}

function getLevelSortScore(data: AppData, questionId: string) {
  const progress = getProgress(data, questionId);
  if (progress.isAmbiguous) return 0;
  if (progress.isReview && !progress.isGraduated) return progress.reviewLevel ?? 1;
  return 4;
}
