import { useState } from 'react';
import type { AppData, Question, QuizMode, QuizResult } from '../types';
import { getQuestionsBySet, shuffleArray } from '../utils/quiz';
import { QuizRunner } from './QuizRunner';

interface QuizScreenProps {
  data: AppData;
  setId: string;
  mode: QuizMode;
  onBack: () => void;
  onAnswer: (question: Question, selectedIndexes: number[], isReviewMode: boolean) => { isCorrect: boolean; addedToReview: boolean; levelLabel?: string };
  onToggleAmbiguous: (questionId: string) => void;
  onSaveDetailedExplanation: (questionId: string, detailedExplanation: string) => void;
  onFinish: (result: QuizResult) => void;
}

export function QuizScreen({ data, setId, mode, onBack, onAnswer, onToggleAmbiguous, onSaveDetailedExplanation, onFinish }: QuizScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const allQuestions = getQuestionsBySet(data, setId);
  const [sessionQuestions] = useState<Question[]>(() => (mode === 'random' ? shuffleArray(allQuestions) : allQuestions));

  return (
    <QuizRunner
      data={data}
      title={problemSet?.title ?? 'クイズ'}
      subtitle={mode === 'random' ? 'ランダム出題' : '登録順出題'}
      questions={sessionQuestions}
      mode="quiz"
      setId={setId}
      onBack={onBack}
      onAnswer={onAnswer}
      onToggleAmbiguous={onToggleAmbiguous}
      onSaveDetailedExplanation={onSaveDetailedExplanation}
      onFinish={onFinish}
    />
  );
}
