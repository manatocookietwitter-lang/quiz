import { useMemo, useState } from 'react';
import type { AppData, ProblemSortMode, Question } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { getProgress, getQuestionsBySet, getVirtualLevel, groupReviewQuestionsByLevel, shuffleArray } from '../utils/quiz';
import './ProblemSetDetailScreen.css';

type CategoryFilter = 'all' | string;
export type ReviewFilter = 'all' | 'level0' | 'level1' | 'level2' | 'level3' | 'ambiguous';

const REVIEW_FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: 'all', label: '全Level' },
  { value: 'level0', label: 'Level 0' },
  { value: 'level1', label: 'Level 1' },
  { value: 'level2', label: 'Level 2' },
  { value: 'level3', label: 'Level 3' },
  { value: 'ambiguous', label: '曖昧' },
];

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
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');

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

  const reviewQuestions = buildReviewQuestions(data, startQuestions, reviewFilter);
  const allReviewQuestions = buildReviewQuestions(data, questions);
  const logs = data.answerLogs.filter((log) => log.setId === setId);
  const correct = logs.filter((log) => log.isCorrect).length;
  const correctRate = logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100);
  const selectedLabel = getCategoryLabel(startCategory);
  const reviewFilterLabel = getReviewFilterLabel(reviewFilter);

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
      subtitle: `${selectedLabel} / ${reviewFilterLabel}`,
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
          <div className="quiz-detail__segments" aria-label="開始対象">
            {categories.map((item) => {
              const value = item === 'すべて' ? 'all' : item;
              const active = startCategory === value || (startCategory === 'all' && item === 'すべて');
              return (
                <button
                  key={item}
                  type="button"
                  className={`quiz-detail__segment-item${active ? ' quiz-detail__segment-item--active' : ''}`}
                  onClick={() => setStartCategory(value)}
                >
                  {item}
                </button>
              );
            })}
          </div>
          <p className="quiz-detail__selected-target">開始対象：{selectedLabel}</p>
          <div className="quiz-detail__segment-caption">復習Level</div>
          <div className="quiz-detail__segments" aria-label="復習Level">
            {REVIEW_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`quiz-detail__segment-item${reviewFilter === item.value ? ' quiz-detail__segment-item--active' : ''}`}
                onClick={() => setReviewFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="quiz-detail__selected-target">復習条件：{selectedLabel} / {reviewFilterLabel}</p>
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

export function buildReviewQuestions(data: AppData, questions: Question[], filter: ReviewFilter = 'all') {
  if (filter !== 'all') {
    const filtered = questions.filter((question) => matchesReviewFilter(getProgress(data, question.id), filter));
    return shuffleArray(filtered);
  }

  const groups = groupReviewQuestionsByLevel(data, questions);
  return [
    ...shuffleArray(groups.ambiguous),
    ...shuffleArray(groups.level0),
    ...shuffleArray(groups.level1),
    ...shuffleArray(groups.level2),
    ...shuffleArray(groups.level3),
  ];
}

function matchesReviewFilter(progress: ReturnType<typeof getProgress>, filter: ReviewFilter) {
  if (progress.isGraduated) return false;
  if (filter === 'ambiguous') return progress.isAmbiguous === true;
  if (filter === 'level0') return progress.answeredCount === 0;
  if (filter === 'level1') return progress.answeredCount > 0 && progress.reviewLevel === 1;
  if (filter === 'level2') return progress.answeredCount > 0 && progress.reviewLevel === 2;
  if (filter === 'level3') return progress.answeredCount > 0 && progress.reviewLevel === 3;
  return true;
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

function getReviewFilterLabel(filter: ReviewFilter) {
  return REVIEW_FILTERS.find((item) => item.value === filter)?.label ?? '全Level';
}

function getLevelSortScore(data: AppData, questionId: string) {
  const progress = getProgress(data, questionId);
  if (progress.isAmbiguous) return 0;
  if (progress.isGraduated) return 5;
  const level = getVirtualLevel(progress);
  if (level === 0) return 1;
  if (level === 1) return 2;
  if (level === 2) return 3;
  return 4;
}
