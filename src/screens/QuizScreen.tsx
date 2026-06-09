import { useState } from 'react';
import type { AppData, Question, QuizMode, QuizResult } from '../types';
import { getQuestionsBySet, shuffleArray } from '../utils/quiz';
import { QuizRunner } from './QuizRunner';

interface QuizScreenProps {
  data: AppData;
  setId: string;
  mode: QuizMode;
  onBack: () => void;
  onAnswer: (question: Question, selectedIndex: number, isReviewMode: boolean) => { isCorrect: boolean; addedToReview: boolean };
  onToggleAmbiguous: (questionId: string) => void;
  onFinish: (result: QuizResult) => void;
}

export function QuizScreen({ data, setId, mode, onBack, onAnswer, onToggleAmbiguous, onFinish }: QuizScreenProps) {
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
      onFinish={onFinish}
    />
  );
}
