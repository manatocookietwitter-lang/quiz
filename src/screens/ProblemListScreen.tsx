import { useMemo } from 'react';
import type { AppData, ProblemSortMode, Question } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { formatDisplayDate } from '../utils/date';
import { getProgress, getQuestionsBySet } from '../utils/quiz';
import {
  buildProblemCategories,
  filterQuestionsByCategory,
  normalizeProblemCategory,
  sortQuestionsForProblemList,
} from './ProblemSetDetailScreen';
import './ProblemListScreen.css';

interface ProblemListScreenProps {
  data: AppData;
  setId: string;
  category: string;
  sortMode: ProblemSortMode;
  onBack: () => void;
  onChangeCategory: (category: string) => void;
  onStartFromQuestion: (params: {
    questions: Question[];
    initialIndex: number;
    title: string;
    subtitle: string;
    setId: string;
  }) => void;
}

export function ProblemListScreen({ data, setId, category, sortMode, onBack, onChangeCategory, onStartFromQuestion }: ProblemListScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const allQuestions = useMemo(() => getQuestionsBySet(data, setId), [data, setId]);
  const categories = useMemo(() => buildProblemCategories(allQuestions), [allQuestions]);
  const filteredQuestions = useMemo(() => filterQuestionsByCategory(allQuestions, category), [allQuestions, category]);
  const orderedQuestions = useMemo(() => sortQuestionsForProblemList(data, filteredQuestions, sortMode), [data, filteredQuestions, sortMode]);
  const categoryLabel = category === 'all' || category === 'すべて' ? 'すべて' : category;
  const sortLabel = sortMode === 'level' ? 'level順' : '登録順';
  const title = problemSet?.title ?? '問題セット';

  const startFrom = (questionId: string) => {
    const initialIndex = orderedQuestions.findIndex((question) => question.id === questionId);
    if (initialIndex < 0) return;
    onStartFromQuestion({
      questions: orderedQuestions,
      initialIndex,
      title,
      subtitle: `${categoryLabel} / ${sortLabel}`,
      setId,
    });
  };

  return (
    <Layout>
      <div className="quiz-list">
        <header className="quiz-list__header">
          <div className="quiz-list__header-slope" />
          <BackButton onClick={onBack} className="quiz-list__back-button" />
          <div className="quiz-list__title-wrap">
            <h1>問題一覧</h1>
            <p>{title}</p>
          </div>
        </header>

        <section className="quiz-list__meta">
          <span>{sortLabel}</span>
          <span>{orderedQuestions.length}問</span>
        </section>

        <section className="quiz-list__chips" aria-label="分野">
          {categories.map((item) => {
            const value = item === 'すべて' ? 'all' : item;
            const active = category === value || (category === 'all' && item === 'すべて');
            return (
              <button
                key={item}
                type="button"
                className={`quiz-list__chip${active ? ' quiz-list__chip--active' : ''}`}
                onClick={() => onChangeCategory(value)}
              >
                {item}
              </button>
            );
          })}
        </section>

        <section className="quiz-list__items">
          {orderedQuestions.map((question, index) => (
            <QuestionListCard
              key={question.id}
              index={allQuestions.findIndex((item) => item.id === question.id) + 1 || index + 1}
              question={question}
              progress={getProgress(data, question.id)}
              onClick={() => startFrom(question.id)}
            />
          ))}
        </section>
      </div>
    </Layout>
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
  const status = progress.answeredCount === 0 ? '未解答' : `${progress.correctCount}/${progress.answeredCount}`;

  return (
    <button type="button" className="quiz-list__card" onClick={onClick}>
      <div className="quiz-list__card-top">
        <span className="quiz-list__number">Q{index}</span>
        <span className="quiz-list__category">{normalizeProblemCategory(question.category)}</span>
        <span className="quiz-list__status">{status}</span>
      </div>
      <p className="quiz-list__text">{question.question}</p>
      <div className="quiz-list__badges">
        <span className="quiz-list__badge">level {progress.reviewLevel ?? '-'}</span>
        {progress.isAmbiguous ? <span className="quiz-list__badge quiz-list__badge--ambiguous">曖昧</span> : null}
        {progress.isReview && !progress.isGraduated ? <span className="quiz-list__badge quiz-list__badge--review">復習</span> : null}
        {progress.lastAnsweredAt ? <span className="quiz-list__last">最終 {formatDisplayDate(progress.lastAnsweredAt)}</span> : null}
      </div>
    </button>
  );
}
