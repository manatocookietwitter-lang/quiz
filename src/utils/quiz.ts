import type { AppData, Folder, ProblemSet, Question, QuestionProgress, QuizResult, StudyStats } from '../types';
import { createId } from './id';
import { isToday, nowIso } from './date';

export function createInitialProgress(questionId: string): QuestionProgress {
  return {
    questionId,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    lastSelectedIndex: null,
    lastAnsweredAt: null,
    isReview: false,
    isAmbiguous: false,
    reviewLevel: null,
    isGraduated: false,
  };
}

export function findProgress(data: AppData, questionId: string): QuestionProgress | undefined {
  return data.progress.find((progress) => progress.questionId === questionId);
}

export function getProgress(data: AppData, questionId: string): QuestionProgress {
  return findProgress(data, questionId) ?? createInitialProgress(questionId);
}

export function calculateStats(data: AppData): StudyStats {
  const totalCount = data.answerLogs.length;
  const correctCount = data.answerLogs.filter((log) => log.isCorrect).length;
  const todayCount = data.answerLogs.filter((log) => isToday(log.answeredAt)).length;
  const reviewCount = data.progress.filter((progress) => progress.isReview && !progress.isGraduated).length;
  const ambiguousCount = data.progress.filter((progress) => progress.isAmbiguous).length;

  return {
    todayCount,
    totalCount,
    correctRate: totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100),
    reviewCount,
    ambiguousCount,
  };
}

export function getQuestionsBySet(data: AppData, setId: string): Question[] {
  return data.questions.filter((question) => question.setId === setId);
}

export function getProblemSetsByFolder(data: AppData, folderId: string): ProblemSet[] {
  return data.problemSets.filter((set) => set.folderId === folderId);
}

export function getReviewQuestions(data: AppData): Question[] {
  const reviewProgress = data.progress.filter((progress) => progress.isReview && !progress.isGraduated);
  const questionMap = new Map(data.questions.map((question) => [question.id, question]));

  const byLevel: Record<1 | 2 | 3, Question[]> = { 1: [], 2: [], 3: [] };
  reviewProgress.forEach((progress) => {
    const question = questionMap.get(progress.questionId);
    const level = progress.reviewLevel ?? 1;
    if (question && (level === 1 || level === 2 || level === 3)) {
      byLevel[level].push(question);
    }
  });

  return [
    ...shuffleArray(byLevel[1]),
    ...shuffleArray(byLevel[2]),
    ...shuffleArray(byLevel[3]),
  ];
}

export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function addFolder(data: AppData, name: string): AppData {
  const timestamp = nowIso();
  const folder: Folder = {
    id: createId('folder'),
    name: name.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { ...data, folders: [folder, ...data.folders] };
}

export function deleteFolder(data: AppData, folderId: string): AppData {
  const setIds = data.problemSets.filter((set) => set.folderId === folderId).map((set) => set.id);
  const questionIds = data.questions.filter((question) => setIds.includes(question.setId)).map((question) => question.id);

  return {
    ...data,
    folders: data.folders.filter((folder) => folder.id !== folderId),
    problemSets: data.problemSets.filter((set) => set.folderId !== folderId),
    questions: data.questions.filter((question) => !setIds.includes(question.setId)),
    progress: data.progress.filter((progress) => !questionIds.includes(progress.questionId)),
    answerLogs: data.answerLogs.filter((log) => log.folderId !== folderId),
  };
}

export function deleteProblemSet(data: AppData, setId: string): AppData {
  const questionIds = data.questions.filter((question) => question.setId === setId).map((question) => question.id);
  return {
    ...data,
    problemSets: data.problemSets.filter((set) => set.id !== setId),
    questions: data.questions.filter((question) => question.setId !== setId),
    progress: data.progress.filter((progress) => !questionIds.includes(progress.questionId)),
    answerLogs: data.answerLogs.filter((log) => log.setId !== setId),
  };
}

export function recordAnswer(
  data: AppData,
  question: Question,
  selectedIndex: number,
  isReviewMode: boolean,
): { data: AppData; isCorrect: boolean; addedToReview: boolean } {
  const problemSet = data.problemSets.find((set) => set.id === question.setId);
  const folderId = problemSet?.folderId ?? '';
  const timestamp = nowIso();
  const isCorrect = selectedIndex === question.answerIndex;
  const existing = getProgress(data, question.id);
  const addedToReview = !isReviewMode && !isCorrect && !(existing.isReview && !existing.isGraduated);

  const nextProgress: QuestionProgress = {
    ...existing,
    answeredCount: existing.answeredCount + 1,
    correctCount: existing.correctCount + (isCorrect ? 1 : 0),
    wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
    lastSelectedIndex: selectedIndex,
    lastAnsweredAt: timestamp,
  };

  if (isReviewMode) {
    const currentLevel = existing.reviewLevel ?? 1;
    if (isCorrect) {
      if (currentLevel >= 3) {
        nextProgress.isReview = false;
        nextProgress.isGraduated = true;
        nextProgress.reviewLevel = null;
      } else {
        nextProgress.isReview = true;
        nextProgress.isGraduated = false;
        nextProgress.reviewLevel = (currentLevel + 1) as 2 | 3;
      }
    } else {
      nextProgress.isReview = true;
      nextProgress.isGraduated = false;
      nextProgress.reviewLevel = Math.max(1, currentLevel - 1) as 1 | 2;
    }
  } else if (!isCorrect) {
    nextProgress.isReview = true;
    nextProgress.isGraduated = false;
    nextProgress.reviewLevel = 1;
  }

  const nextProgressList = upsertProgress(data.progress, nextProgress);
  const nextLog = {
    id: createId('log'),
    questionId: question.id,
    setId: question.setId,
    folderId,
    selectedIndex,
    isCorrect,
    answeredAt: timestamp,
  };

  return {
    data: {
      ...data,
      progress: nextProgressList,
      answerLogs: [...data.answerLogs, nextLog],
    },
    isCorrect,
    addedToReview,
  };
}

export function toggleAmbiguous(data: AppData, questionId: string): AppData {
  const existing = getProgress(data, questionId);
  const nextIsAmbiguous = !existing.isAmbiguous;
  const nextProgress: QuestionProgress = {
    ...existing,
    isAmbiguous: nextIsAmbiguous,
    isReview: nextIsAmbiguous ? true : existing.isReview,
    isGraduated: nextIsAmbiguous ? false : existing.isGraduated,
    reviewLevel: nextIsAmbiguous ? 1 : existing.reviewLevel,
  };
  return { ...data, progress: upsertProgress(data.progress, nextProgress) };
}

export function makeResult(mode: 'quiz' | 'review', title: string, setId: string | undefined, correct: number, wrong: number, addedReviewCount: number): QuizResult {
  return {
    mode,
    title,
    setId,
    answered: correct + wrong,
    correct,
    wrong,
    addedReviewCount,
  };
}

function upsertProgress(list: QuestionProgress[], item: QuestionProgress): QuestionProgress[] {
  const exists = list.some((progress) => progress.questionId === item.questionId);
  if (!exists) return [...list, item];
  return list.map((progress) => (progress.questionId === item.questionId ? item : progress));
}
