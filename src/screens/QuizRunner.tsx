import { useMemo, useState } from 'react';
import type { AppData, Question, QuizResult } from '../types';
import { ChoiceButton } from '../components/ChoiceButton';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { getProgress, makeResult } from '../utils/quiz';

interface QuizRunnerProps {
  data: AppData;
  title: string;
  subtitle?: string;
  questions: Question[];
  mode: 'quiz' | 'review';
  setId?: string;
  onBack: () => void;
  onAnswer: (question: Question, selectedIndex: number, isReviewMode: boolean) => { isCorrect: boolean; addedToReview: boolean };
  onToggleAmbiguous: (questionId: string) => void;
  onFinish: (result: QuizResult) => void;
}

export function QuizRunner({ data, title, subtitle, questions, mode, setId, onBack, onAnswer, onToggleAmbiguous, onFinish }: QuizRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [addedReviewCount, setAddedReviewCount] = useState(0);

  const currentQuestion = questions[currentIndex];
  const progress = currentQuestion ? getProgress(data, currentQuestion.id) : null;
  const currentSet = currentQuestion ? data.problemSets.find((item) => item.id === currentQuestion.setId) : undefined;
  const answered = selectedIndex !== null;

  const correctRate = useMemo(() => {
    const answeredCount = correctCount + wrongCount;
    return answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);
  }, [correctCount, wrongCount]);

  if (questions.length === 0 || !currentQuestion) {
    return (
      <Layout>
        <Header title={title} subtitle="問題がありません" leftLabel="戻る" onLeft={onBack} />
        <div className="mx-4 mt-4 rounded-[24px] bg-neutral-900 p-5 text-center text-sm font-bold leading-relaxed text-neutral-400 ring-1 ring-white/10">
          このモードで出題できる問題がありません。
        </div>
      </Layout>
    );
  }

  const handleChoice = (index: number) => {
    if (answered) return;
    const result = onAnswer(currentQuestion, index, mode === 'review');
    setSelectedIndex(index);
    setLastCorrect(result.isCorrect);
    setCorrectCount((value) => value + (result.isCorrect ? 1 : 0));
    setWrongCount((value) => value + (result.isCorrect ? 0 : 1));
    setAddedReviewCount((value) => value + (result.addedToReview ? 1 : 0));
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      onFinish(makeResult(mode, title, setId, correctCount, wrongCount, addedReviewCount));
      return;
    }
    setCurrentIndex((value) => value + 1);
    setSelectedIndex(null);
    setLastCorrect(null);
  };

  return (
    <Layout>
      <Header
        title={title}
        subtitle={subtitle ?? currentSet?.title}
        leftLabel="戻る"
        onLeft={onBack}
        right={
          <div className="rounded-2xl bg-neutral-800 px-3 py-2 text-right ring-1 ring-white/10">
            <div className="text-xs font-black text-cyan-300">{currentIndex + 1} / {questions.length}</div>
            <div className="text-[10px] font-bold text-neutral-500">正答率 {correctRate}%</div>
          </div>
        }
      />

      {mode === 'review' ? (
        <div className="mx-4 mt-3 flex shrink-0 gap-2 text-xs font-black">
          <span className="rounded-full bg-yellow-400 px-3 py-1 text-neutral-950">reviewLevel {progress?.reviewLevel ?? 1}</span>
          <span className={`rounded-full px-3 py-1 ${progress?.isAmbiguous ? 'bg-yellow-400/20 text-yellow-200 ring-1 ring-yellow-300/20' : 'bg-neutral-900 text-neutral-500 ring-1 ring-white/10'}`}>
            {progress?.isAmbiguous ? '曖昧登録あり' : '曖昧なし'}
          </span>
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3">
        <section className="flex min-h-0 basis-[24%] flex-col rounded-[24px] bg-neutral-900 p-4 ring-1 ring-white/10">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-black text-cyan-300 ring-1 ring-cyan-400/20">問題</span>
            {currentQuestion.category ? <span className="truncate text-xs font-bold text-neutral-500">{currentQuestion.category}</span> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-base font-bold leading-relaxed text-white no-scrollbar">
            {currentQuestion.question}
          </div>
        </section>

        <section className="shrink-0 space-y-2">
          {currentQuestion.choices.map((choice, index) => (
            <ChoiceButton
              key={`${currentQuestion.id}_${index}`}
              index={index}
              text={choice}
              disabled={answered}
              isSelected={selectedIndex === index}
              isCorrectChoice={currentQuestion.answerIndex === index}
              answered={answered}
              onClick={() => handleChoice(index)}
            />
          ))}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-[24px] bg-neutral-900 p-4 ring-1 ring-white/10">
          {!answered ? (
            <div className="flex h-full items-center justify-center text-center text-sm font-bold leading-relaxed text-neutral-600">
              選択肢をタップすると<br />すぐに正誤判定します。
            </div>
          ) : (
            <>
              <div className="shrink-0">
                <div className={`inline-flex rounded-full px-3 py-1 text-sm font-black ${lastCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                  {lastCorrect ? '正解' : '不正解'}
                </div>
                <p className="mt-2 text-sm font-black text-white">正解：{currentQuestion.answerText}</p>
                {currentQuestion.sourcePage ? <p className="mt-1 text-xs font-bold text-neutral-500">参照ページ：{currentQuestion.sourcePage}</p> : null}
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl bg-neutral-950 p-3 text-sm font-medium leading-relaxed text-neutral-300 no-scrollbar">
                {currentQuestion.explanation}
              </div>
            </>
          )}
        </section>
      </main>

      <div className="grid shrink-0 grid-cols-2 gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={() => onToggleAmbiguous(currentQuestion.id)}
          className={`min-h-[52px] rounded-2xl px-3 text-sm font-black active:scale-[0.98] ${progress?.isAmbiguous ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-900 text-yellow-300 ring-1 ring-yellow-300/20'}`}
        >
          {progress?.isAmbiguous ? '曖昧解除' : '曖昧として登録'}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!answered}
          className="min-h-[52px] rounded-2xl bg-cyan-500 px-3 text-sm font-black text-neutral-950 active:scale-[0.98] disabled:opacity-40"
        >
          {currentIndex + 1 >= questions.length ? '結果へ' : '次へ'}
        </button>
      </div>
    </Layout>
  );
}
