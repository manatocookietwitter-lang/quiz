import { useMemo, useRef, useState } from 'react';
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
  initialSortMode?: ProblemSortMode;
  onBack: () => void;
  onStartFromQuestion: (params: {
    questions: Question[];
    initialIndex: number;
    title: string;
    subtitle: string;
    setId: string;
    sortMode: ProblemSortMode;
  }) => void;
}

export function ProblemListScreen({ data, setId, initialSortMode = 'ordered', onBack, onStartFromQuestion }: ProblemListScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const allQuestions = useMemo(() => getQuestionsBySet(data, setId), [data, setId]);
  const categories = useMemo(() => buildProblemCategories(allQuestions), [allQuestions]);
  const [sortMode, setSortMode] = useState<ProblemSortMode>(initialSortMode);
  const [activeCategory, setActiveCategory] = useState('all');
  const listRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const groupedSections = useMemo(() => {
    return categories
      .filter((category) => category !== 'すべて')
      .map((category) => ({
        category,
        questions: sortQuestionsForProblemList(data, filterQuestionsByCategory(allQuestions, category), sortMode),
      }))
      .filter((section) => section.questions.length > 0);
  }, [allQuestions, categories, data, sortMode]);

  const listQuestions = useMemo(() => groupedSections.flatMap((section) => section.questions), [groupedSections]);
  const sortLabel = sortMode === 'level' ? 'level順' : '登録順';
  const title = problemSet?.title ?? '問題セット';

  const scrollToCategory = (category: string) => {
    setActiveCategory(category);
    if (category === 'all' || category === 'すべて') {
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    sectionRefs.current[category]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const startFrom = (questionId: string) => {
    const initialIndex = listQuestions.findIndex((question) => question.id === questionId);
    if (initialIndex < 0) return;
    onStartFromQuestion({
      questions: listQuestions,
      initialIndex,
      title,
      subtitle: `問題一覧 / ${sortLabel}`,
      setId,
      sortMode,
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
          <span>{listQuestions.length}問</span>
          <span>分野別に表示</span>
        </section>

        <section className="quiz-list__sort" aria-label="並び替え">
          <button type="button" className={sortMode === 'ordered' ? 'is-active' : ''} onClick={() => setSortMode('ordered')}>
            登録順
          </button>
          <button type="button" className={sortMode === 'level' ? 'is-active' : ''} onClick={() => setSortMode('level')}>
            level順
          </button>
        </section>

        <section className="quiz-list__chips" aria-label="分野へ移動">
          {categories.map((item) => {
            const value = item === 'すべて' ? 'all' : item;
            const active = activeCategory === value || (activeCategory === 'all' && item === 'すべて');
            return (
              <button
                key={item}
                type="button"
                className={`quiz-list__chip${active ? ' quiz-list__chip--active' : ''}`}
                onClick={() => scrollToCategory(value)}
              >
                {item}
              </button>
            );
          })}
        </section>

        <section className="quiz-list__items" ref={listRef}>
          {groupedSections.map((section) => (
            <div
              key={section.category}
              className="quiz-list__section"
              ref={(node) => {
                sectionRefs.current[section.category] = node;
              }}
            >
              <h2 className="quiz-list__section-title">{section.category}</h2>
              {section.questions.map((question) => (
                <QuestionListCard
                  key={question.id}
                  index={allQuestions.findIndex((item) => item.id === question.id) + 1}
                  question={question}
                  progress={getProgress(data, question.id)}
                  onClick={() => startFrom(question.id)}
                />
              ))}
            </div>
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
