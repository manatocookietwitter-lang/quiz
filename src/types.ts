export type Difficulty = 'basic' | 'standard' | 'advanced' | string;

export type ChoiceList =
  | [string, string, string, string]
  | [string, string, string, string, string];

export interface AppData {
  version: 1;
  folders: Folder[];
  problemSets: ProblemSet[];
  questions: Question[];
  progress: QuestionProgress[];
  answerLogs: AnswerLog[];
}

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemSet {
  id: string;
  folderId: string;
  title: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  setId: string;
  question: string;
  choices: ChoiceList;
  answerIndex: number;
  answerIndexes?: number[];
  answerText: string;
  explanation: string;
  detailedExplanation?: string;
  sourcePage: string;
  category: string;
  difficulty: Difficulty;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionProgress {
  questionId: string;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  lastSelectedIndex: number | null;
  lastAnswerCorrect?: boolean | null;
  lastAnsweredAt: string | null;
  isReview: boolean;
  isAmbiguous: boolean;
  reviewLevel: 1 | 2 | 3 | null;
  isGraduated: boolean;
}

export interface AnswerLog {
  id: string;
  questionId: string;
  setId: string;
  folderId: string;
  selectedIndex: number;
  selectedIndexes?: number[];
  isCorrect: boolean;
  answeredAt: string;
}

export interface ImportedQuestion {
  id?: string;
  question: string;
  choices: ChoiceList;
  answerIndex?: number;
  answerIndexes?: number[];
  answerText?: string;
  explanation: string;
  detailedExplanation?: string;
  sourcePage?: string;
  reference?: string;
  category?: string;
  difficulty?: Difficulty;
}

export interface ImportedProblemSet {
  setTitle: string;
  source?: string;
  questions: ImportedQuestion[];
}

export interface QuizResult {
  mode: 'quiz' | 'review';
  title: string;
  setId?: string;
  answered: number;
  correct: number;
  wrong: number;
  addedReviewCount: number;
}

export interface StudyStats {
  todayCount: number;
  totalCount: number;
  correctRate: number;
  reviewCount: number;
  ambiguousCount: number;
}

export type QuizMode = 'ordered' | 'random';

export type ProblemSortMode = 'ordered' | 'level';

export interface QuizSession {
  title: string;
  subtitle?: string;
  questions: Question[];
  mode: 'quiz' | 'review';
  setId?: string;
  initialIndex?: number;
  backScreen: AppScreen;
}

export type AppScreen =
  | { name: 'home' }
  | { name: 'sync' }
  | { name: 'folder'; folderId: string }
  | { name: 'problemSetDetail'; setId: string }
  | { name: 'problemList'; setId: string; sortMode?: ProblemSortMode }
  | { name: 'noteList'; setId: string }
  | { name: 'import'; folderId: string; backScreen?: AppScreen }
  | { name: 'quiz'; setId: string; mode: QuizMode }
  | { name: 'quizSession'; session: QuizSession }
  | { name: 'review' }
  | { name: 'result'; result: QuizResult };

