import { useMemo, useState } from 'react';
import type { AppData, ProblemSortMode, Question } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import {
  getProgress,
  getQuestionsBySet,
  getVirtualLevel,
  groupReviewQuestionsByLevel,
  matchesReviewLevel,
  shuffleArray,
  type ReviewLevelFilter,
} from '../utils/quiz';
import './ProblemSetDetailScreen.css';

type CategoryFilter = 'all' | string;

const ENABLE_TABLET_NOTES = true;
const UNCATEGORIZED = '\u672a\u5206\u985e';
const ALL_CATEGORIES = '\u3059\u3079\u3066';

const REVIEW_FILTERS: { value: ReviewLevelFilter; label: string }[] = [
  { value: 'all', label: '\u5168Level' },
  { value: 'level0', label: 'Level 0' },
  { value: 'level1', label: 'Level 1' },
  { value: 'level2', label: 'Level 2' },
  { value: 'level3', label: 'Level 3' },
  { value: 'ambiguous', label: '\u66d6\u6627' },
];

interface ProblemSetDetailScreenProps {
  data: AppData;
  setId: string;
  onBack: () => void;
  onOpenImport: (folderId: string) => void;
  onOpenProblemList: () => void;
  onOpenNoteList: () => void;
  onStartSession: (params: {
    questions: Question[];
    mode: 'quiz' | 'review';
    initialIndex?: number;
    title: string;
    subtitle?: string;
    setId: string;
  }) => void;
}

export function ProblemSetDetailScreen({
  data,
  setId,
  onBack,
  onOpenImport,
  onOpenProblemList,
  onOpenNoteList,
  onStartSession,
}: ProblemSetDetailScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const questions = useMemo(() => getQuestionsBySet(data, setId), [data, setId]);
  const [startCategory, setStartCategory] = useState<CategoryFilter>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewLevelFilter>('all');

  const categories = useMemo(() => buildProblemCategories(questions), [questions]);
  const startQuestions = useMemo(() => filterQuestionsByCategory(questions, startCategory), [questions, startCategory]);
  const filteredStartQuestions = useMemo(
    () => filterQuestionsByLevel(data, startQuestions, reviewFilter),
    [data, startQuestions, reviewFilter],
  );

  if (!problemSet) {
    return (
      <Layout>
        <div className="quiz-detail">
          <DetailHeader title="Quiz make" onBack={onBack} />
        </div>
      </Layout>
    );
  }

  const allReviewQuestions = buildReviewQuestions(data, questions);
  const logs = data.answerLogs.filter((log) => log.setId === setId);
  const correct = logs.filter((log) => log.isCorrect).length;
  const correctRate = logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100);
  const selectedLabel = getCategoryLabel(startCategory);
  const reviewFilterLabel = getReviewFilterLabel(reviewFilter);

  const startOrdered = () => {
    const sessionQuestions = getStartQuestions({
      data,
      questions,
      category: startCategory,
      reviewLevel: reviewFilter,
      random: false,
    });
    if (sessionQuestions.length === 0) return;
    onStartSession({
      questions: sessionQuestions,
      mode: 'quiz',
      title: problemSet.title,
      subtitle: [selectedLabel, reviewFilterLabel, '\u767b\u9332\u9806'].join(' / '),
      setId,
    });
  };

  const startRandom = () => {
    const sessionQuestions = getStartQuestions({
      data,
      questions,
      category: startCategory,
      reviewLevel: reviewFilter,
      random: true,
    });
    if (sessionQuestions.length === 0) return;
    onStartSession({
      questions: sessionQuestions,
      mode: 'quiz',
      title: problemSet.title,
      subtitle: [selectedLabel, reviewFilterLabel, '\u30e9\u30f3\u30c0\u30e0'].join(' / '),
      setId,
    });
  };

  return (
    <Layout>
      <div className="quiz-detail">
        <DetailHeader title={problemSet.title} onBack={onBack} onOpenImport={() => onOpenImport(problemSet.folderId)} />

        <div className="quiz-detail__content-grid">
          <div className="quiz-detail__main-column">
        <section className="quiz-detail__summary">
          <div className="quiz-detail__metric">
            <span>{'\u554f\u984c\u6570'}</span>
            <strong>{questions.length}</strong>
          </div>
          <div className="quiz-detail__metric">
            <span>{'\u5fa9\u7fd2'}</span>
            <strong>{allReviewQuestions.length}</strong>
          </div>
          <div className="quiz-detail__metric">
            <span>{'\u6b63\u7b54\u7387'}</span>
            <strong>{correctRate}%</strong>
          </div>
        </section>

        <section className="quiz-detail__start-panel">
          <div className="quiz-detail__section-heading">
            <h2>{'\u958b\u59cb'}</h2>
            <span>{filteredStartQuestions.length}{'\u554f'}</span>
          </div>

          <div className="quiz-detail__segment-caption quiz-detail__segment-caption--top">{'\u5206\u985e\u4e00\u89a7'}</div>
          <div className="quiz-detail__segments" aria-label={'\u5206\u985e\u4e00\u89a7'}>
            {categories.map((item, index) => {
              const value = index === 0 ? 'all' : item;
              const active = startCategory === value || (startCategory === 'all' && index === 0);
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

          <div className="quiz-detail__segment-caption">Level</div>
          <div className="quiz-detail__segments" aria-label={'Level\u6761\u4ef6'}>
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
          <p className="quiz-detail__selected-target">{'\u958b\u59cb\u6761\u4ef6\uff1a'}{selectedLabel} / {reviewFilterLabel}</p>
          {filteredStartQuestions.length === 0 ? (
            <p className="quiz-detail__empty-condition">{'\u3053\u306e\u6761\u4ef6\u306b\u8a72\u5f53\u3059\u308b\u554f\u984c\u304c\u3042\u308a\u307e\u305b\u3093'}</p>
          ) : null}
          <div className="quiz-detail__start-actions">
            <button type="button" disabled={filteredStartQuestions.length === 0} onClick={startOrdered}>
              {'\u767b\u9332\u9806\u3067\u958b\u59cb'}
            </button>
            <button type="button" disabled={filteredStartQuestions.length === 0} onClick={startRandom}>
              {'\u30e9\u30f3\u30c0\u30e0\u3067\u958b\u59cb'}
            </button>
          </div>
        </section>

        <section className="quiz-detail__body">
          <div className="quiz-detail__entry-grid">
            <button type="button" className="quiz-detail__list-entry" onClick={onOpenProblemList}>
              <span>
                <strong>{'\u554f\u984c\u4e00\u89a7'}</strong>
                <small>{questions.length}{'\u554f / \u5206\u91ce\u5225\u306b\u8868\u793a'}</small>
              </span>
              <b aria-hidden="true">{'\u203a'}</b>
            </button>
            {ENABLE_TABLET_NOTES ? (
              <button type="button" className="quiz-detail__list-entry quiz-detail__note-list-entry" onClick={onOpenNoteList}>
                <span>
                  <strong>{'\u30ce\u30fc\u30c8\u4e00\u89a7'}</strong>
                  <small>{selectedLabel}{' / \u5206\u985e\u5225\u30ce\u30fc\u30c8'}</small>
                </span>
                <b aria-hidden="true">{'\u203a'}</b>
              </button>
            ) : null}
          </div>
        </section>

          </div>
        </div>
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
        <button type="button" className="quiz-detail__header-icon" aria-label={'\u65b0\u898f\u554f\u984c'} onClick={onOpenImport}>{'+'}</button>
      ) : (
        <div className="quiz-detail__header-icon">{'\u22ef'}</div>
      )}
    </header>
  );
}

export function normalizeProblemCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value || UNCATEGORIZED;
}

export function filterQuestionsByCategory(questions: Question[], category: string) {
  if (category === 'all' || category === ALL_CATEGORIES) return questions;
  return questions.filter((question) => normalizeProblemCategory(question.category) === category);
}

function filterQuestionsByLevel(data: AppData, questions: Question[], reviewLevel: ReviewLevelFilter) {
  return questions.filter((question) => matchesReviewLevel(getProgress(data, question.id), reviewLevel));
}

function getStartQuestions({
  data,
  questions,
  category,
  reviewLevel,
  random,
}: {
  data: AppData;
  questions: Question[];
  category: string;
  reviewLevel: ReviewLevelFilter;
  random: boolean;
}) {
  const categoryFiltered = filterQuestionsByCategory(questions, category);
  const levelFiltered = filterQuestionsByLevel(data, categoryFiltered, reviewLevel);
  return random ? shuffleArray(levelFiltered) : levelFiltered;
}

export function sortQuestionsForProblemList(data: AppData, questions: Question[], sortMode: ProblemSortMode) {
  if (sortMode === 'ordered') return questions;
  return [...questions].sort((a, b) => getLevelSortScore(data, a.id) - getLevelSortScore(data, b.id));
}

export function buildReviewQuestions(data: AppData, questions: Question[], filter: ReviewLevelFilter = 'all') {
  if (filter !== 'all') {
    const filtered = questions.filter((question) => matchesReviewLevel(getProgress(data, question.id), filter));
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
  return [ALL_CATEGORIES, ...Array.from(names), ...(hasUncategorized ? [UNCATEGORIZED] : [])];
}

function getCategoryLabel(category: string) {
  return category === 'all' ? ALL_CATEGORIES : category;
}

function getReviewFilterLabel(filter: ReviewLevelFilter) {
  return REVIEW_FILTERS.find((item) => item.value === filter)?.label ?? '\u5168Level';
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