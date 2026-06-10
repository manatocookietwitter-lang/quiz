import { useMemo, useState } from 'react';
import type { AppData, Question, QuizResult } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { getProgress, makeResult } from '../utils/quiz';

interface QuizRunnerProps {
  data: AppData;
  title: string;
  subtitle?: string;
  questions: Question[];
  mode: 'quiz' | 'review';
  setId?: string;
  initialIndex?: number;
  onBack: () => void;
  onAnswer: (question: Question, selectedIndex: number, isReviewMode: boolean) => { isCorrect: boolean; addedToReview: boolean };
  onToggleAmbiguous: (questionId: string) => void;
  onFinish: (result: QuizResult) => void;
}

export function QuizRunner({ data, title, subtitle, questions, mode, setId, initialIndex = 0, onBack, onAnswer, onToggleAmbiguous, onFinish }: QuizRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(questions.length - 1, 0)));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [addedReviewCount, setAddedReviewCount] = useState(0);

  const currentQuestion = questions[currentIndex];
  const progress = currentQuestion ? getProgress(data, currentQuestion.id) : null;
  const answered = selectedIndex !== null;
  const progressPercent = questions.length === 0 ? 0 : ((currentIndex + 1) / questions.length) * 100;
  const choiceLengthInfo = useMemo(() => {
    const maxLength = Math.max(0, ...(currentQuestion?.choices.map((choice) => choice.length) ?? []));
    return {
      longChoice: maxLength > 42,
      veryLongChoice: maxLength > 72,
    };
  }, [currentQuestion?.choices]);

  const questionTextClass = useMemo(() => {
    const length = currentQuestion?.question.length ?? 0;
    if (length > 120) return 'text-[clamp(18px,4.4vw,23px)]';
    if (length > 70) return 'text-[clamp(20px,4.8vw,26px)]';
    return 'text-[clamp(22px,5vw,30px)]';
  }, [currentQuestion?.question]);

  if (questions.length === 0 || !currentQuestion) {
    return (
      <Layout>
        <div className="flex h-full flex-col bg-[#E9E5D8] text-[#111111]">
          <QuizHeader title={title} onBack={onBack} />
          <div className="flex min-h-0 flex-1 items-center justify-center px-5">
            <div className="w-full rounded-[20px] bg-[#F7F7F5] p-6 text-center">
              <p className="text-base font-bold text-[#6D5A45]">このモードで出題できる問題がありません。</p>
              <button
                type="button"
                onClick={onBack}
                className="mt-5 h-14 w-full rounded-[14px] bg-[#5FA9DD] text-base font-bold text-white active:scale-[0.98]"
              >
                戻る
              </button>
            </div>
          </div>
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

  const handleAmbiguous = () => {
    onToggleAmbiguous(currentQuestion.id);
  };

  return (
    <Layout>
      <div className="relative flex h-full flex-col overflow-hidden bg-[#E9E5D8] text-[#111111]">
        <QuizHeader title={title} current={currentIndex + 1} total={questions.length} onBack={onBack} />

        <ProgressBand
          label={mode === 'review' ? `復習 Level ${progress?.reviewLevel ?? 1}` : subtitle ?? '登録順'}
          percent={progressPercent}
        />

        <main className={`flex min-h-0 flex-1 flex-col ${answered ? 'pb-[45dvh]' : ''}`}>
          <section className="flex h-[clamp(104px,17dvh,132px)] shrink-0 items-center justify-center bg-[#B89C79] px-5 py-3 text-center text-[#111111]">
            <div className="min-h-0 w-full">
              {currentQuestion.category ? (
                <div className="mb-1 truncate text-xs font-semibold text-[#4F3F2F]/75">{currentQuestion.category}</div>
              ) : null}
              <div className={`mx-auto max-h-[108px] overflow-y-auto whitespace-pre-wrap break-words font-semibold leading-snug no-scrollbar ${questionTextClass}`}>
                {currentQuestion.question}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 px-6 py-3">
            {currentQuestion.choices.map((choice, index) => (
              <QuizChoiceButton
                key={`${currentQuestion.id}_${index}`}
                text={choice}
                longChoice={choiceLengthInfo.longChoice}
                veryLongChoice={choiceLengthInfo.veryLongChoice}
                disabled={answered}
                isSelected={selectedIndex === index}
                isCorrectChoice={currentQuestion.answerIndex === index}
                answered={answered}
                onClick={() => handleChoice(index)}
              />
            ))}
          </section>

          {!answered ? (
            <section className="shrink-0 px-5 pb-[max(14px,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={handleAmbiguous}
                className="mx-auto mt-1 flex h-[50px] w-[200px] items-center justify-center rounded-full border border-[#D0D0D0] bg-[#F4F4F4] text-base font-bold text-[#9A9A9A] active:scale-[0.98]"
              >
                わからない
              </button>
            </section>
          ) : null}
        </main>

        {answered ? (
          <AnswerPanel
            isCorrect={lastCorrect === true}
            answer={currentQuestion.answerText}
            explanation={currentQuestion.explanation}
            sourcePage={currentQuestion.sourcePage}
            isAmbiguous={progress?.isAmbiguous ?? false}
            isLast={currentIndex + 1 >= questions.length}
            onToggleAmbiguous={handleAmbiguous}
            onNext={handleNext}
          />
        ) : null}
      </div>
    </Layout>
  );
}

function QuizHeader({ title, current, total, onBack }: { title: string; current?: number; total?: number; onBack: () => void }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center bg-[#F7F7F5] px-4">
      <BackButton onClick={onBack} />
      <h1 className="min-w-0 flex-1 truncate px-3 text-center text-[24px] font-bold leading-none text-[#5FA9DD]">{title}</h1>
      <div className="flex h-9 min-w-[72px] shrink-0 items-center justify-center rounded-full bg-[#F7F7F5] px-2 text-sm font-bold text-[#5FA9DD]">
        {current && total ? `${current}/${total}` : ''}
      </div>
    </header>
  );
}

function ProgressBand({ label, percent }: { label: string; percent: number }) {
  return (
    <section className="flex h-8 shrink-0 items-center gap-3 bg-[#B89C79] py-1 pl-4 pr-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-bold text-white/90">{label}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function QuizChoiceButton({
  text,
  longChoice,
  veryLongChoice,
  disabled,
  isSelected,
  isCorrectChoice,
  answered,
  onClick,
}: {
  text: string;
  longChoice: boolean;
  veryLongChoice: boolean;
  disabled: boolean;
  isSelected: boolean;
  isCorrectChoice: boolean;
  answered: boolean;
  onClick: () => void;
}) {
  let stateClass = 'border-[#D0D0D0] bg-[#F8F8F8] text-[#111111]';
  const textSizeClass = veryLongChoice
    ? 'text-[clamp(15px,3.7vw,18px)]'
    : longChoice
      ? 'text-[clamp(16px,4vw,20px)]'
      : 'text-[clamp(18px,4.6vw,22px)]';

  if (answered && isCorrectChoice) {
    stateClass = 'border-[#72C486] bg-[#DDF5E3] text-[#111111]';
  } else if (answered && isSelected && !isCorrectChoice) {
    stateClass = 'border-[#E08B8B] bg-[#F8DADA] text-[#111111]';
  } else if (answered) {
    stateClass = 'border-[#D8D8D8] bg-[#F8F8F8] text-[#8A8A8A] opacity-70';
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`mx-auto flex min-h-[64px] max-h-[92px] w-full flex-1 items-center justify-center rounded-2xl border px-[14px] py-2.5 text-center font-semibold leading-snug shadow-sm transition active:scale-[0.99] ${textSizeClass} ${stateClass}`}
    >
      <span className="max-h-[72px] overflow-y-auto break-words leading-[1.38] no-scrollbar">{text}</span>
    </button>
  );
}

function AnswerPanel({
  isCorrect,
  answer,
  explanation,
  sourcePage,
  isAmbiguous,
  isLast,
  onToggleAmbiguous,
  onNext,
}: {
  isCorrect: boolean;
  answer: string;
  explanation: string;
  sourcePage: string;
  isAmbiguous: boolean;
  isLast: boolean;
  onToggleAmbiguous: () => void;
  onNext: () => void;
}) {
  return (
    <section className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[45dvh] max-h-[45dvh] max-w-md flex-col overflow-hidden rounded-t-[20px] bg-[#F7F7F7] p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
      <div className="shrink-0">
        <div className={`text-xl font-bold ${isCorrect ? 'text-[#2F8F46]' : 'text-[#C94F4F]'}`}>{isCorrect ? '正解' : '不正解'}</div>
        <p className="mt-2 text-base font-bold leading-snug text-[#111111]">正解：{answer}</p>
        {sourcePage ? <p className="mt-1 text-xs font-semibold text-[#8A8A8A]">参照ページ：{sourcePage}</p> : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 pb-3 text-base font-medium leading-[1.6] text-[#111111] no-scrollbar">
        {explanation}
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onToggleAmbiguous}
          className="h-[52px] rounded-[14px] border border-[#D0D0D0] bg-white px-3 text-sm font-bold text-[#6D5A45] active:scale-[0.98]"
        >
          {isAmbiguous ? '曖昧を解除' : '曖昧として登録'}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="h-[52px] rounded-[14px] bg-[#5FA9DD] px-3 text-base font-bold text-white active:scale-[0.98]"
        >
          {isLast ? '結果へ' : '次へ'}
        </button>
      </div>
    </section>
  );
}
