import { useState } from 'react';
import type { AppData, Question, QuizResult } from '../types';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { getReviewQuestions } from '../utils/quiz';
import { QuizRunner, type AnswerHandlerResult } from './QuizRunner';

interface ReviewScreenProps {
  data: AppData;
  onBack: () => void;
  onAnswer: (question: Question, selectedIndexes: number[], isReviewMode: boolean) => AnswerHandlerResult;
  onToggleAmbiguous: (questionId: string) => Promise<boolean>;
  onSaveDetailedExplanation: (questionId: string, detailedExplanation: string) => Promise<void>;
  onFinish: (result: QuizResult) => void;
}

export function ReviewScreen({ data, onBack, onAnswer, onToggleAmbiguous, onSaveDetailedExplanation, onFinish }: ReviewScreenProps) {
  const [sessionQuestions] = useState<Question[]>(() => getReviewQuestions(data));

  if (sessionQuestions.length === 0) {
    return (
      <Layout>
        <Header title="復習" subtitle="復習対象はありません" leftLabel="戻る" onLeft={onBack} />
        <div className="mx-4 mt-4 flex min-h-0 flex-1 items-center justify-center">
          <div className="w-full rounded-[28px] bg-white p-6 text-center shadow-[0_10px_28px_rgba(42,77,96,0.10)] ring-1 ring-[#D6E4EA]">
            <div className="text-6xl">🎉</div>
            <h2 className="mt-4 text-lg font-black text-[#173042]">復習対象は0件です</h2>
            <p className="mt-2 text-sm font-bold leading-relaxed text-[#607586]">
              間違えた問題、または曖昧登録した問題がここに表示されます。
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-5 min-h-[52px] w-full rounded-2xl bg-[#10AEB2] text-sm font-black text-white shadow-[0_7px_18px_rgba(16,174,178,0.22)] active:scale-[0.98]"
            >
              ホームへ戻る
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <QuizRunner
      data={data}
      title="復習"
      subtitle="Level 1 → 2 → 3 の順に出題"
      questions={sessionQuestions}
      mode="review"
      onBack={onBack}
      onAnswer={onAnswer}
      onToggleAmbiguous={onToggleAmbiguous}
      onSaveDetailedExplanation={onSaveDetailedExplanation}
      onFinish={onFinish}
    />
  );
}
