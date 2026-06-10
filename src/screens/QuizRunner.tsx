import { useMemo, useState } from 'react';
import type { AppData, Question, QuizResult } from '../types';
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
  const answered = selectedIndex !== null;
  const progressPercent = questions.length === 0 ? 0 : ((currentIndex + 1) / questions.length) * 100;

  const questionTextClass = useMemo(() => {
    const length = currentQuestion?.question.length ?? 0;
    if (length > 110) return 'text-[clamp(19px,4.7vw,25px)]';
    if (length > 65) return 'text-[clamp(22px,5.6vw,30px)]';
    return 'text-[clamp(28px,7.4vw,36px)]';
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
        <QuizHeader title={title} onBack={onBack} />

        <ProgressBand
          label={mode === 'review' ? `復習 Level ${progress?.reviewLevel ?? 1}` : subtitle ?? '登録順'}
          current={currentIndex + 1}
          total={questions.length}
          percent={progressPercent}
        />

        <main className={`flex min-h-0 flex-1 flex-col ${answered ? 'pb-[42dvh]' : ''}`}>
          <section className="flex h-[clamp(122px,21dvh,166px)] shrink-0 items-center justify-center bg-[#B89C79] px-5 py-4 text-center text-white">
            <div className="min-h-0 w-full">
              {currentQuestion.category ? (
                <div className="mb-2 truncate text-xs font-semibold text-white/75">{currentQuestion.category}</div>
              ) : null}
              <div className={`mx-auto max-h-[118px] overflow-y-auto whitespace-pre-wrap break-words font-semibold leading-tight no-scrollbar ${questionTextClass}`}>
                {currentQuestion.question}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-5 py-4">
            {currentQuestion.choices.map((choice, index) => (
              <QuizChoiceButton
                key={`${currentQuestion.id}_${index}`}
                text={choice}
                disabled={answered}
                isSelected={selectedIndex === index}
                isCorrectChoice={currentQuestion.answerIndex === index}
                answered={answered}
                onClick={() => handleChoice(index)}
              />
            ))}
          </section>

          {!answered ? (
            <section className="shrink-0 px-5 pb-5">
              <button
                type="button"
                onClick={handleAmbiguous}
                className="mx-auto flex h-[54px] w-[200px] items-center justify-center rounded-full border border-[#D0D0D0] bg-[#F4F4F4] text-base font-bold text-[#9A9A9A] active:scale-[0.98]"
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

function QuizHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center bg-[#F7F7F5] px-4">
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#7EC3E6] bg-white text-2xl font-bold leading-none text-[#5FA9DD] active:scale-95"
        aria-label="戻る"
      >
        ‹
      </button>
      <h1 className="min-w-0 flex-1 truncate px-3 text-center text-2xl font-bold text-[#5FA9DD]">{title}</h1>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-[#5FA9DD]">Q</div>
    </header>
  );
}

function ProgressBand({ label, current, total, percent }: { label: string; current: number; total: number; percent: number }) {
  return (
    <section className="flex h-9 shrink-0 items-center gap-3 bg-[#B89C79] px-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-bold text-white/85">{label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      </div>
      <div className="shrink-0 rounded-full bg-[#F7F7F5] px-3 py-1 text-xs font-bold text-[#6D5A45]">
        {current} / {total}
      </div>
    </section>
  );
}

function QuizChoiceButton({
  text,
  disabled,
  isSelected,
  isCorrectChoice,
  answered,
  onClick,
}: {
  text: string;
  disabled: boolean;
  isSelected: boolean;
  isCorrectChoice: boolean;
  answered: boolean;
  onClick: () => void;
}) {
  let stateClass = 'border-[#D0D0D0] bg-[#F8F8F8] text-[#111111]';

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
      className={`flex h-[clamp(64px,10.5dvh,96px)] w-full items-center justify-center rounded-2xl border px-4 text-center text-[clamp(20px,5.7vw,29px)] font-bold leading-tight shadow-sm transition active:scale-[0.99] ${stateClass}`}
    >
      <span className="max-h-[72px] overflow-y-auto break-words no-scrollbar">{text}</span>
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
    <section className="absolute inset-x-0 bottom-0 z-20 mx-auto flex h-[42dvh] max-w-md flex-col rounded-t-[20px] bg-[#F7F7F7] px-5 pb-5 pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
      <div className="shrink-0">
        <div className={`text-xl font-bold ${isCorrect ? 'text-[#2F8F46]' : 'text-[#C94F4F]'}`}>{isCorrect ? '正解' : '不正解'}</div>
        <p className="mt-2 text-base font-bold leading-snug text-[#111111]">正解：{answer}</p>
        {sourcePage ? <p className="mt-1 text-xs font-semibold text-[#8A8A8A]">参照ページ：{sourcePage}</p> : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 text-base font-medium leading-7 text-[#333333] no-scrollbar">
        {explanation}
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onToggleAmbiguous}
          className="h-14 rounded-[14px] border border-[#D0D0D0] bg-white px-3 text-sm font-bold text-[#6D5A45] active:scale-[0.98]"
        >
          {isAmbiguous ? '曖昧を解除' : '曖昧として登録'}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="h-14 rounded-[14px] bg-[#5FA9DD] px-3 text-base font-bold text-white active:scale-[0.98]"
        >
          {isLast ? '結果へ' : '次へ'}
        </button>
      </div>
    </section>
  );
}
