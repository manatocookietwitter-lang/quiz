import { useMemo, useRef, useState } from 'react';
import type { AppData, ProblemSortMode, Question } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { formatDisplayDate } from '../utils/date';
import { getProgress, getQuestionsBySet, shuffleArray } from '../utils/quiz';
import './ProblemSetDetailScreen.css';

type CategoryFilter = 'all' | string;

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
  const [startCategory, setStartCategory] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<ProblemSortMode>('ordered');
  const listRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const categories = useMemo(() => buildProblemCategories(questions), [questions]);
  const startQuestions = useMemo(() => filterQuestionsByCategory(questions, startCategory), [questions, startCategory]);
  const groupedSections = useMemo(() => buildQuestionSections(data, questions, sortMode), [data, questions, sortMode]);
  const listQuestions = useMemo(() => groupedSections.flatMap((section) => section.questions), [groupedSections]);

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
  const logs = data.answerLogs.filter((log) => log.setId === setId);
  const correct = logs.filter((log) => log.isCorrect).length;
  const correctRate = logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100);
  const selectedLabel = getCategoryLabel(startCategory);
  const sortLabel = sortMode === 'level' ? 'level順' : '登録順';

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

  const scrollToCategory = (category: string) => {
    if (category === 'all' || category === 'すべて') {
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    sectionRefs.current[category]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const startFromQuestion = (questionId: string) => {
    const initialIndex = listQuestions.findIndex((question) => question.id === questionId);
    if (initialIndex < 0) return;
    onStartSession({
      questions: listQuestions,
      mode: 'quiz',
      initialIndex,
      title: problemSet.title,
      subtitle: `問題一覧 / ${sortLabel}`,
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
            <strong>{buildReviewQuestions(data, questions).length}</strong>
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

        <section className="quiz-detail__list-panel">
          <div className="quiz-detail__section-heading">
            <h2>問題一覧</h2>
            <span>{listQuestions.length}問</span>
          </div>
          <div className="quiz-detail__sort">
            <button type="button" className={sortMode === 'ordered' ? 'is-active' : ''} onClick={() => setSortMode('ordered')}>
              登録順
            </button>
            <button type="button" className={sortMode === 'level' ? 'is-active' : ''} onClick={() => setSortMode('level')}>
              level順
            </button>
          </div>
          <div className="quiz-detail__chips quiz-detail__chips--list" aria-label="問題一覧の分野移動">
            {categories.map((item) => (
              <button key={item} type="button" className="quiz-detail__chip" onClick={() => scrollToCategory(item === 'すべて' ? 'all' : item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="quiz-detail__question-list" ref={listRef}>
            {groupedSections.map((section) => (
              <div
                key={section.category}
                className="quiz-detail__category-section"
                ref={(node) => {
                  sectionRefs.current[section.category] = node;
                }}
              >
                <h3>{section.category}</h3>
                {section.questions.map((question) => (
                  <QuestionListCard
                    key={question.id}
                    index={questions.findIndex((item) => item.id === question.id) + 1}
                    question={question}
                    progress={getProgress(data, question.id)}
                    onClick={() => startFromQuestion(question.id)}
                  />
                ))}
              </div>
            ))}
          </div>
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
  const status = progress.answeredCount === 0 ? '未解答' : `${progress.correctCount}/${progress.answeredCount}`;

  return (
    <button type="button" className="quiz-detail__question-card" onClick={onClick}>
      <div className="quiz-detail__question-top">
        <span className="quiz-detail__question-number">Q{index}</span>
        <span className="quiz-detail__question-category">{normalizeProblemCategory(question.category)}</span>
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

function buildQuestionSections(data: AppData, questions: Question[], sortMode: ProblemSortMode) {
  return buildProblemCategories(questions)
    .filter((category) => category !== 'すべて')
    .map((category) => ({
      category,
      questions: sortQuestionsForProblemList(data, filterQuestionsByCategory(questions, category), sortMode),
    }))
    .filter((section) => section.questions.length > 0);
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
