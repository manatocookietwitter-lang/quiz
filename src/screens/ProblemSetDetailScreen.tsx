import { useMemo, useState } from 'react';
import type { AppData, Question } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { formatDisplayDate } from '../utils/date';
import { getProgress, getQuestionsBySet, shuffleArray } from '../utils/quiz';
import './ProblemSetDetailScreen.css';

type CategoryFilter = 'all' | string;
type SortMode = 'ordered' | 'level';

interface ProblemSetDetailScreenProps {
  data: AppData;
  setId: string;
  onBack: () => void;
  onOpenImport: (folderId: string) => void;
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

export function ProblemSetDetailScreen({ data, setId, onBack, onOpenImport, onStartSession }: ProblemSetDetailScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const questions = useMemo(() => getQuestionsBySet(data, setId), [data, setId]);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('ordered');

  const categories = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    questions.forEach((question) => {
      const value = normalizeCategory(question.category);
      if (value === UNCATEGORIZED) {
        hasUncategorized = true;
      } else {
        names.add(value);
      }
    });
    return ['すべて', ...Array.from(names), ...(hasUncategorized ? [UNCATEGORIZED] : [])];
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    if (category === 'all' || category === 'すべて') return questions;
    return questions.filter((question) => normalizeCategory(question.category) === category);
  }, [category, questions]);

  const orderedQuestions = useMemo(() => {
    if (sortMode === 'ordered') return filteredQuestions;
    return [...filteredQuestions].sort((a, b) => getLevelSortScore(data, a.id) - getLevelSortScore(data, b.id));
  }, [data, filteredQuestions, sortMode]);

  if (!problemSet) {
    return (
      <Layout>
        <div className="quiz-detail">
          <DetailHeader title="Quiz make" onBack={onBack} />
        </div>
      </Layout>
    );
  }

  const reviewQuestions = buildReviewQuestions(data, filteredQuestions);
  const logs = data.answerLogs.filter((log) => log.setId === setId);
  const correct = logs.filter((log) => log.isCorrect).length;
  const correctRate = logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100);
  const selectedLabel = category === 'all' || category === 'すべて' ? 'すべて' : category;

  const startOrdered = () => {
    onStartSession({
      questions: filteredQuestions,
      mode: 'quiz',
      title: problemSet.title,
      subtitle: `${selectedLabel} / 登録順`,
      setId,
    });
  };

  const startRandom = () => {
    onStartSession({
      questions: shuffleArray(filteredQuestions),
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

  const startFromQuestion = (questionId: string) => {
    const index = orderedQuestions.findIndex((question) => question.id === questionId);
    if (index < 0) return;
    onStartSession({
      questions: orderedQuestions,
      mode: 'quiz',
      initialIndex: index,
      title: problemSet.title,
      subtitle: `${selectedLabel} / ${sortMode === 'level' ? 'level順' : '登録順'}`,
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
            <strong>{filteredQuestions.length}</strong>
          </div>
          <div className="quiz-detail__metric">
            <span>復習</span>
            <strong>{reviewQuestions.length}</strong>
          </div>
          <div className="quiz-detail__metric">
            <span>正答率</span>
            <strong>{correctRate}%</strong>
          </div>
        </section>

        <section className="quiz-detail__chips" aria-label="分野">
          {categories.map((item) => {
            const value = item === 'すべて' ? 'all' : item;
            const active = category === value || (category === 'all' && item === 'すべて');
            return (
              <button
                key={item}
                type="button"
                className={`quiz-detail__chip${active ? ' quiz-detail__chip--active' : ''}`}
                onClick={() => setCategory(value)}
              >
                {item}
              </button>
            );
          })}
        </section>

        <section className="quiz-detail__controls">
          <div className="quiz-detail__sort">
            <button type="button" className={sortMode === 'ordered' ? 'is-active' : ''} onClick={() => setSortMode('ordered')}>
              登録順
            </button>
            <button type="button" className={sortMode === 'level' ? 'is-active' : ''} onClick={() => setSortMode('level')}>
              level順
            </button>
          </div>
        </section>

        <section className="quiz-detail__question-list" aria-label="問題一覧">
          {orderedQuestions.map((question, index) => (
            <QuestionListCard
              key={question.id}
              index={questions.findIndex((item) => item.id === question.id) + 1 || index + 1}
              question={question}
              progress={getProgress(data, question.id)}
              onClick={() => startFromQuestion(question.id)}
            />
          ))}
        </section>

        <section className="quiz-detail__start-actions">
          <button type="button" disabled={filteredQuestions.length === 0} onClick={startOrdered}>
            登録順で開始
          </button>
          <button type="button" disabled={filteredQuestions.length === 0} onClick={startRandom}>
            ランダムで開始
          </button>
          <button type="button" disabled={reviewQuestions.length === 0} onClick={startReview}>
            復習する
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

function QuestionListCard({
  index,
  question,
  progress,
  onClick,
}: {
  index: number;
  question: Question;
  progress: ReturnType<typeof getProgress>;
  onClick: () => void;
}) {
  const status = progress.answeredCount === 0
    ? '未解答'
    : `${progress.correctCount}/${progress.answeredCount}`;

  return (
    <button type="button" className="quiz-detail__question-card" onClick={onClick}>
      <div className="quiz-detail__question-top">
        <span className="quiz-detail__question-number">Q{index}</span>
        <span className="quiz-detail__question-category">{normalizeCategory(question.category)}</span>
        <span className="quiz-detail__question-status">{status}</span>
      </div>
      <p className="quiz-detail__question-text">{question.question}</p>
      <div className="quiz-detail__badges">
        <span className="quiz-detail__badge">level {progress.reviewLevel ?? '-'}</span>
        {progress.isAmbiguous ? <span className="quiz-detail__badge quiz-detail__badge--ambiguous">曖昧</span> : null}
        {progress.isReview && !progress.isGraduated ? <span className="quiz-detail__badge quiz-detail__badge--review">復習</span> : null}
        {progress.lastAnsweredAt ? <span className="quiz-detail__last">最終 {formatDisplayDate(progress.lastAnsweredAt)}</span> : null}
      </div>
    </button>
  );
}

function normalizeCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}

function getLevelSortScore(data: AppData, questionId: string) {
  const progress = getProgress(data, questionId);
  if (progress.isAmbiguous) return 0;
  if (progress.isReview && !progress.isGraduated) return progress.reviewLevel ?? 1;
  return 4;
}

function buildReviewQuestions(data: AppData, questions: Question[]) {
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
