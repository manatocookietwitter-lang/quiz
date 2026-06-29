import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppData, Question, QuizResult } from '../types';
import { BackButton } from '../components/BackButton';
import { CategoryNoteDrawer } from '../components/CategoryNoteDrawer';
import { Layout } from '../components/Layout';
import { getAnswerIndexes, getAnswerText, getChoiceLabel, getChoiceText, getProgress, getVirtualLevel, makeResult } from '../utils/quiz';

type AnswerSheetState = 'expanded' | 'default' | 'hidden';

const ENABLE_TABLET_NOTES = true;

interface QuizRunnerProps {
  data: AppData;
  title: string;
  subtitle?: string;
  questions: Question[];
  mode: 'quiz' | 'review';
  setId?: string;
  initialIndex?: number;
  onBack: () => void;
  onAnswer: (question: Question, selectedIndexes: number[], isReviewMode: boolean) => { isCorrect: boolean; addedToReview: boolean; levelLabel?: string };
  onToggleAmbiguous: (questionId: string) => void;
  onFinish: (result: QuizResult) => void;
}

export function QuizRunner({ data, title, subtitle, questions, mode, setId, initialIndex = 0, onBack, onAnswer, onToggleAmbiguous, onFinish }: QuizRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(questions.length - 1, 0)));
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [addedReviewCount, setAddedReviewCount] = useState(0);
  const [answerSheetState, setAnswerSheetState] = useState<AnswerSheetState>('default');
  const [savedLevelLabel, setSavedLevelLabel] = useState('');
  const [answerMessage, setAnswerMessage] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [isTabletLandscape, setIsTabletLandscape] = useState(false);
  const noteFeatureEnabled = ENABLE_TABLET_NOTES && isTabletLandscape && Boolean(setId);
  const noteAreaOpen = noteFeatureEnabled && noteOpen;

  useEffect(() => {
    if (!ENABLE_TABLET_NOTES) return;

    const query = window.matchMedia('(min-width: 900px) and (orientation: landscape)');
    const update = () => setIsTabletLandscape(query.matches);
    update();

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }

    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  useEffect(() => {
    if (!noteFeatureEnabled && noteOpen) {
      setNoteOpen(false);
    }
  }, [noteFeatureEnabled, noteOpen]);

  useEffect(() => {
    document.body.classList.toggle('quiz-note-open', noteAreaOpen);
    return () => document.body.classList.remove('quiz-note-open');
  }, [noteAreaOpen]);

  const currentQuestion = questions[currentIndex];
  const progress = currentQuestion ? getProgress(data, currentQuestion.id) : null;
  const answered = hasAnswered;
  const answerIndexes = useMemo(() => (currentQuestion ? getAnswerIndexes(currentQuestion) : []), [currentQuestion]);
  const answerText = useMemo(() => (currentQuestion ? getAnswerText(currentQuestion) : ''), [currentQuestion]);
  const isMultipleAnswer = answerIndexes.length > 1;
  const instructionInfo = useMemo(() => getQuestionInstructionInfo(currentQuestion), [currentQuestion]);
  const progressPercent = questions.length === 0 ? 0 : ((currentIndex + 1) / questions.length) * 100;
  const registeredQuestionNumber = useMemo(() => {
    if (!currentQuestion) return currentIndex + 1;
    const sameSetQuestions = data.questions.filter((question) => question.setId === currentQuestion.setId);
    const registeredIndex = sameSetQuestions.findIndex((question) => question.id === currentQuestion.id);
    return registeredIndex >= 0 ? registeredIndex + 1 : currentIndex + 1;
  }, [currentIndex, currentQuestion, data.questions]);
  const choiceLengthInfo = useMemo(() => {
    const maxLength = Math.max(0, ...(currentQuestion?.choices.map((choice) => choice.length) ?? []));
    return {
      longChoice: maxLength > 42,
      veryLongChoice: maxLength > 72,
    };
  }, [currentQuestion?.choices]);

  const questionTextClass = useMemo(() => {
    const length = currentQuestion?.question.length ?? 0;
    if (length >= 180) return 'text-[16px]';
    if (length >= 100) return 'text-[17px]';
    return 'text-[18px]';
  }, [currentQuestion?.question]);

  if (questions.length === 0 || !currentQuestion) {
    return (
      <Layout>
        <div className="flex h-full flex-col bg-[#E9E5D8] text-[#111111]">
          <QuizHeader title={title} onBack={onBack} />
          <div className="flex min-h-0 flex-1 items-center justify-center px-5">
            <div className="w-full rounded-[20px] bg-[#F7F7F5] p-6 text-center">
              <p className="text-base font-bold text-[#6D5A45]">{'\u3053\u306e\u30e2\u30fc\u30c9\u3067\u51fa\u984c\u3067\u304d\u308b\u554f\u984c\u304c\u3042\u308a\u307e\u305b\u3093\u3002'}</p>
              <button
                type="button"
                onClick={onBack}
                className="mt-5 h-14 w-full rounded-[14px] bg-[#5FA9DD] text-base font-bold text-white active:scale-[0.98]"
              >
                {'\u623b\u308b'}
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const handleChoice = (index: number) => {
    if (answered) return;
    setAnswerMessage('');
    if (isMultipleAnswer) {
      setSelectedIndexes((current) => (
        current.includes(index)
          ? current.filter((item) => item !== index)
          : [...current, index].sort((a, b) => a - b)
      ));
      return;
    }
    setSelectedIndexes([index]);
  };

  const submitAnswer = (indexes: number[]) => {
    if (answered) return;
    const normalizedIndexes = Array.from(new Set(indexes)).sort((a, b) => a - b);
    const result = onAnswer(currentQuestion, normalizedIndexes, mode === 'review');
    setSelectedIndexes(normalizedIndexes);
    setLastCorrect(result.isCorrect);
    setHasAnswered(true);
    setAnswerSheetState('default');
    setSavedLevelLabel(result.levelLabel ? `\u4fdd\u5b58\u6e08\u307f\u30fb${result.levelLabel}` : '\u4fdd\u5b58\u6e08\u307f');
    setCorrectCount((value) => value + (result.isCorrect ? 1 : 0));
    setWrongCount((value) => value + (result.isCorrect ? 0 : 1));
    setAddedReviewCount((value) => value + (result.addedToReview ? 1 : 0));
  };

  const handleSubmitAnswer = () => {
    if (selectedIndexes.length === 0) {
      setAnswerMessage('\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044');
      return;
    }
    submitAnswer(selectedIndexes);
  };

  const handleUnknown = () => {
    setAnswerMessage('');
    submitAnswer([]);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      onFinish(makeResult(mode, title, setId, correctCount, wrongCount, addedReviewCount));
      return;
    }
    setCurrentIndex((value) => value + 1);
    setSelectedIndexes([]);
    setLastCorrect(null);
    setHasAnswered(false);
    setAnswerSheetState('default');
    setSavedLevelLabel('');
    setAnswerMessage('');
  };

  const handleAmbiguous = () => {
    onToggleAmbiguous(currentQuestion.id);
  };

  return (
    <Layout>
      <div className={`quiz-runner relative flex h-full flex-col overflow-hidden bg-[#E9E5D8] text-[#111111]${noteAreaOpen ? ' quiz-runner--note-open' : ''}`}>
        <QuizHeader title={title} current={currentIndex + 1} total={questions.length} onBack={onBack} />

        <ProgressBand
          label={mode === 'review' ? `\u5fa9\u7fd2 Level ${getVirtualLevel(progress ?? undefined)}` : subtitle ?? '\u767b\u9332\u9806'}
          percent={progressPercent}
        />

        <main className="quiz-runner__main flex min-h-0 flex-1 flex-col">
          <section className="quiz-runner__question-panel flex h-[clamp(104px,17dvh,132px)] shrink-0 items-center justify-center overflow-hidden bg-[#B89C79] px-5 py-3 text-center text-[#111111]">
            <div className="min-h-0 w-full">
              {currentQuestion.category ? (
                <div className="mb-1 truncate text-xs font-semibold text-[#4F3F2F]/75">{currentQuestion.category}</div>
              ) : null}
              {(instructionInfo.hasMultiple || instructionInfo.hasNegative) ? (
                <div className="mb-2 flex flex-wrap justify-center gap-1.5">
                  {instructionInfo.hasMultiple ? <span className="question-instruction-badge">{'\u8907\u6570\u9078\u629e'}</span> : null}
                  {instructionInfo.hasNegative ? <span className="question-instruction-badge question-instruction-badge--negative">{'\u5426\u5b9a\u554f\u984c\uff1a\u8aa4\u308a\u3092\u9078\u3076'}</span> : null}
                </div>
              ) : null}
              <div className={['quiz-runner__question-text mx-auto max-h-[96px] overflow-y-auto whitespace-pre-wrap break-words font-semibold leading-[1.45] no-scrollbar', questionTextClass].join(' ')}>
                <span className="font-black">{registeredQuestionNumber}. </span><HighlightedQuestionText text={currentQuestion.question} phrases={instructionInfo.highlightPhrases} />
              </div>
            </div>
          </section>

          <section className={`quiz-runner__choices flex min-h-0 flex-1 flex-col justify-center gap-2.5 px-6 py-3 transition-opacity ${answered ? 'opacity-75' : ''}`}>
            {currentQuestion.choices.map((choice, index) => (
              <QuizChoiceButton
                key={`${currentQuestion.id}_${index}`}
                text={getChoiceText(currentQuestion, index)}
                label={getChoiceLabel(index)}
                choiceCount={currentQuestion.choices.length}
                longChoice={choiceLengthInfo.longChoice}
                veryLongChoice={choiceLengthInfo.veryLongChoice}
                disabled={answered}
                isSelected={selectedIndexes.includes(index)}
                isCorrectChoice={answerIndexes.includes(index)}
                answered={answered}
                onClick={() => handleChoice(index)}
              />
            ))}
          </section>

          <section
            className={`quiz-runner__answer-actions shrink-0 px-5 pb-[max(14px,env(safe-area-inset-bottom))] ${answered ? 'quiz-runner__answer-actions--spacer' : ''}`}
            aria-hidden={answered}
          >
            {!answered && answerMessage ? (
              <p className="mb-2 text-center text-sm font-bold text-[#C94F4F]">{answerMessage}</p>
            ) : null}
            <div className="quiz-runner__answer-action-grid grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleUnknown}
                disabled={answered}
                className="flex h-[52px] items-center justify-center rounded-full border border-[#D0D0D0] bg-[#F4F4F4] text-base font-bold text-[#8A8A8A] active:scale-[0.98]"
              >
                {'\u308f\u304b\u3089\u306a\u3044'}
              </button>
              <button
                type="button"
                onClick={handleSubmitAnswer}
                disabled={answered}
                aria-disabled={selectedIndexes.length === 0}
                className={`flex h-[52px] items-center justify-center rounded-full text-base font-bold active:scale-[0.98] ${
                  selectedIndexes.length > 0
                    ? 'bg-[#5FA9DD] text-white'
                    : 'bg-[#CFCFCF] text-[#777777]'
                }`}
              >
                {'\u89e3\u7b54'}
              </button>
            </div>
          </section>
        </main>

        {noteFeatureEnabled && setId ? (
          <CategoryNoteDrawer
            problemSetId={setId}
            category={currentQuestion.category}
            open={noteOpen}
            onOpenChange={setNoteOpen}
          />
        ) : null}

        {answered ? createPortal(
          <AnswerPanel
            isCorrect={lastCorrect === true}
            answer={answerText}
            explanation={currentQuestion.explanation}
            sourcePage={currentQuestion.sourcePage}
            savedLevelLabel={savedLevelLabel}
            isAmbiguous={progress?.isAmbiguous ?? false}
            isLast={currentIndex + 1 >= questions.length}
            state={answerSheetState}
            onExpand={() => setAnswerSheetState('expanded')}
            onDefault={() => setAnswerSheetState('default')}
            onHide={() => setAnswerSheetState('hidden')}
            onToggleAmbiguous={handleAmbiguous}
            onNext={handleNext}
          />,
          document.body,
        ) : null}
      </div>
    </Layout>
  );
}

function QuizHeader({ title, current, total, onBack }: { title: string; current?: number; total?: number; onBack: () => void }) {
  return (
    <header className="quiz-runner__header flex shrink-0 items-center bg-[#F7F7F5] px-4">
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
  label,
  choiceCount,
  longChoice,
  veryLongChoice,
  disabled,
  isSelected,
  isCorrectChoice,
  answered,
  onClick,
}: {
  text: string;
  label: string;
  choiceCount: number;
  longChoice: boolean;
  veryLongChoice: boolean;
  disabled: boolean;
  isSelected: boolean;
  isCorrectChoice: boolean;
  answered: boolean;
  onClick: () => void;
}) {
  let stateClass = 'border-[#D0D0D0] bg-[#F8F8F8] text-[#111111]';
  const sizeClass = choiceCount >= 5 ? 'min-h-[52px] max-h-[78px]' : 'min-h-[64px] max-h-[92px]';
  const textMaxClass = choiceCount >= 5 ? 'max-h-[58px]' : 'max-h-[72px]';
  const textSizeClass = veryLongChoice
    ? 'text-[clamp(15px,3.7vw,18px)]'
    : longChoice
      ? 'text-[clamp(16px,4vw,20px)]'
      : 'text-[clamp(18px,4.6vw,22px)]';

  if (!answered && isSelected) {
    stateClass = 'border-[#5FA9DD] bg-[#E8F4FB] text-[#111111]';
  } else if (answered && isCorrectChoice) {
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
      className={`mx-auto flex w-full flex-1 items-center justify-start gap-3 rounded-2xl border px-[14px] py-2.5 text-left font-semibold leading-snug shadow-sm transition active:scale-[0.99] ${sizeClass} ${textSizeClass} ${stateClass}`}
    >
      <span className="shrink-0 self-start pt-[2px] text-[0.9em] font-black leading-snug text-[#333333]">
        ({label})
      </span>
      <span className={`${textMaxClass} min-w-0 flex-1 overflow-y-auto break-words leading-[1.38] no-scrollbar`}>{text}</span>
    </button>
  );
}

const MULTIPLE_INSTRUCTION_PHRASES = [
  '\u6b63\u3057\u3044\u3082\u306e\u3092\u3059\u3079\u3066\u9078\u3079',
  '\u6b63\u3057\u3044\u3082\u306e\u3092\u5168\u3066\u9078\u3079',
  '\u3059\u3079\u3066\u9078\u3079',
  '\u5168\u3066\u9078\u3079',
  '\u3059\u3079\u3066\u9078\u3073\u306a\u3055\u3044',
  '\u5168\u3066\u9078\u3073\u306a\u3055\u3044',
  '\u8a72\u5f53\u3059\u308b\u3082\u306e\u3092\u3059\u3079\u3066\u9078\u3079',
  '\u3042\u3066\u306f\u307e\u308b\u3082\u306e\u3092\u3059\u3079\u3066\u9078\u3079',
];

const NEGATIVE_INSTRUCTION_PHRASES = [
  '\u8aa4\u3063\u305f\u3082\u306e\u3092\u9078\u3079',
  '\u8aa4\u3063\u3066\u3044\u308b\u3082\u306e\u3092\u9078\u3079',
  '\u6b63\u3057\u304f\u306a\u3044\u3082\u306e\u3092\u9078\u3079',
  '\u9069\u5207\u3067\u306a\u3044\u3082\u306e\u3092\u9078\u3079',
  '\u4e0d\u9069\u5207\u306a\u3082\u306e\u3092\u9078\u3079',
  '\u3042\u3066\u306f\u307e\u3089\u306a\u3044\u3082\u306e\u3092\u9078\u3079',
  '\u8a72\u5f53\u3057\u306a\u3044\u3082\u306e\u3092\u9078\u3079',
  '\u8aa4\u308a\u306f\u3069\u308c\u304b',
  '\u6b63\u3057\u304f\u306a\u3044\u306e\u306f\u3069\u308c\u304b',
  '\u9069\u5207\u3067\u306a\u3044\u306e\u306f\u3069\u308c\u304b',
];

function getQuestionInstructionInfo(question: Question | undefined) {
  const text = question?.question ?? '';
  const multiplePhrases = MULTIPLE_INSTRUCTION_PHRASES.filter((phrase) => text.includes(phrase));
  const negativePhrases = NEGATIVE_INSTRUCTION_PHRASES.filter((phrase) => text.includes(phrase));
  const hasMultipleAnswers = Array.isArray(question?.answerIndexes) && question.answerIndexes.length > 1;

  return {
    hasMultiple: hasMultipleAnswers || multiplePhrases.length > 0,
    hasNegative: negativePhrases.length > 0,
    highlightPhrases: Array.from(new Set([...multiplePhrases, ...negativePhrases])),
  };
}

function HighlightedQuestionText({ text, phrases }: { text: string; phrases: string[] }) {
  if (phrases.length === 0) return <>{text}</>;
  return (
    <>
      {splitTextByPhrases(text, phrases).map((part, index) => (
        part.highlight ? <span key={`${part.text}_${index}`} className="question-instruction-highlight">{part.text}</span> : part.text
      ))}
    </>
  );
}

function splitTextByPhrases(text: string, phrases: string[]) {
  const sortedPhrases = [...phrases].sort((a, b) => b.length - a.length);
  const parts: { text: string; highlight: boolean }[] = [];
  let buffer = '';
  let index = 0;

  while (index < text.length) {
    const phrase = sortedPhrases.find((item) => text.startsWith(item, index));
    if (phrase) {
      if (buffer) {
        parts.push({ text: buffer, highlight: false });
        buffer = '';
      }
      parts.push({ text: phrase, highlight: true });
      index += phrase.length;
      continue;
    }
    buffer += text[index];
    index += 1;
  }

  if (buffer) parts.push({ text: buffer, highlight: false });
  return parts;
}

function AnswerPanel({
  isCorrect,
  answer,
  explanation,
  sourcePage,
  savedLevelLabel,
  isAmbiguous,
  isLast,
  state,
  onExpand,
  onDefault,
  onHide,
  onToggleAmbiguous,
  onNext,
}: {
  isCorrect: boolean;
  answer: string;
  explanation: string;
  sourcePage: string;
  savedLevelLabel: string;
  isAmbiguous: boolean;
  isLast: boolean;
  state: AnswerSheetState;
  onExpand: () => void;
  onDefault: () => void;
  onHide: () => void;
  onToggleAmbiguous: () => void;
  onNext: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragStartYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const startStateRef = useRef<AnswerSheetState>('default');

  const SNAP_THRESHOLD = 80;
  const VELOCITY_THRESHOLD = 0.5;

  const clampDragOffset = (deltaY: number) => {
    if (startStateRef.current === 'expanded') return Math.max(0, Math.min(220, deltaY));
    if (startStateRef.current === 'hidden') return Math.min(0, Math.max(-140, deltaY));
    return Math.max(-180, Math.min(160, deltaY));
  };

  const snapByDrag = (deltaY: number, velocityY: number) => {
    const fastUp = velocityY < -VELOCITY_THRESHOLD;
    const fastDown = velocityY > VELOCITY_THRESHOLD;

    if (startStateRef.current === 'default') {
      if (deltaY < -SNAP_THRESHOLD || fastUp) onExpand();
      else if (deltaY > SNAP_THRESHOLD || fastDown) onHide();
      else onDefault();
      return;
    }

    if (startStateRef.current === 'expanded') {
      if (deltaY > SNAP_THRESHOLD || fastDown) onDefault();
      else onExpand();
      return;
    }

    if (deltaY < -SNAP_THRESHOLD || fastUp) onDefault();
    else onHide();
  };

  const resetDrag = () => {
    setIsDragging(false);
    setDragOffsetY(0);
  };

  const cancelDrag = (event: PointerEvent<HTMLElement>) => {
    resetDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    dragStartYRef.current = event.clientY;
    dragStartTimeRef.current = performance.now();
    startStateRef.current = state;
    setIsDragging(true);
    setDragOffsetY(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    event.preventDefault();
    const deltaY = event.clientY - dragStartYRef.current;
    setDragOffsetY(clampDragOffset(deltaY));
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    const deltaY = event.clientY - dragStartYRef.current;
    const elapsed = Math.max(1, performance.now() - dragStartTimeRef.current);
    snapByDrag(deltaY, deltaY / elapsed);
    resetDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const getBaseSheetHeight = (targetState: AnswerSheetState) => {
    if (targetState === 'hidden') return 64;
    if (targetState === 'default') return 280;
    const rootStyle = getComputedStyle(document.documentElement);
    const safeTop = Number.parseFloat(rootStyle.getPropertyValue('--safe-top')) || 0;
    const safeBottom = Number.parseFloat(rootStyle.getPropertyValue('--safe-bottom')) || 0;
    return Math.max(320, Math.min(620, window.innerHeight - safeTop - safeBottom - 88));
  };

  const getDraggedSheetHeight = () => {
    const baseHeight = getBaseSheetHeight(startStateRef.current);
    const maxHeight = Math.max(320, window.innerHeight - 40);
    return Math.max(64, Math.min(maxHeight, baseHeight - dragOffsetY));
  };
  const dragProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: cancelDrag,
    onPointerLeave: cancelDrag,
  };

  const sheetStyle = isDragging
    ? ({ height: `${getDraggedSheetHeight()}px` } as CSSProperties)
    : undefined;
  if (state === 'hidden') {
    return (
      <section className={`answer-sheet answer-sheet--hidden ${isDragging ? 'answer-sheet--dragging' : ''}`} style={sheetStyle} {...dragProps}>
        <div className="answer-sheet__hidden-handle" />
        <div className="answer-sheet__hidden-bar">
          <span className={`answer-sheet__hidden-result ${isCorrect ? 'answer-sheet__hidden-result--correct' : 'answer-sheet__hidden-result--wrong'}`}>{isCorrect ? '\u6b63\u89e3' : '\u4e0d\u6b63\u89e3'}</span>
          <button type="button" className="answer-sheet__hidden-open" onClick={onDefault}>{'\u89e3\u7b54\u3092\u898b\u308b'}</button>
          <button type="button" className="answer-sheet__hidden-next" onClick={onNext}>
            {isLast ? '\u7d50\u679c\u3078' : '\u6b21\u3078'}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className={`answer-sheet answer-sheet--${state} ${isDragging ? 'answer-sheet--dragging' : ''}`} style={sheetStyle}>
      <div className="answer-sheet__drag-area" {...dragProps}>
        <div className="answer-sheet__drag-handle" />
      </div>

      <div className="answer-sheet__fixed">
        <div>
          <div className={`answer-sheet__result ${isCorrect ? 'answer-sheet__result--correct' : 'answer-sheet__result--wrong'}`}>{isCorrect ? '\u6b63\u89e3' : '\u4e0d\u6b63\u89e3'}</div>
          {savedLevelLabel ? <p className="answer-sheet__saved">{savedLevelLabel}</p> : null}
        </div>
        <button type="button" onClick={onHide} className="answer-sheet__hide-button">{'\u3057\u307e\u3046'}</button>
      </div>

      <div className="answer-sheet__scroll no-scrollbar">
        <div className="answer-sheet__answer-box">
          <p className="answer-sheet__label">{'\u6b63\u89e3'}</p>
          <p className="answer-sheet__answer-text">{answer}</p>
        </div>
        <div className="answer-sheet__explanation-block">
          <p className="answer-sheet__label">{'\u89e3\u8aac'}</p>
          <div className="answer-sheet__explanation-text">{explanation}</div>
          {sourcePage ? <p className="answer-sheet__source">{'\u53c2\u7167\uff1a'}{sourcePage}</p> : null}
        </div>
      </div>

      <div className="answer-sheet__actions">
        <button type="button" onClick={onToggleAmbiguous} className="answer-sheet__action answer-sheet__action--secondary">
          {isAmbiguous ? '\u66d6\u6627\u3092\u89e3\u9664' : '\u66d6\u6627\u3068\u3057\u3066\u767b\u9332'}
        </button>
        <button type="button" onClick={onNext} className="answer-sheet__action answer-sheet__action--primary">
          {isLast ? '\u7d50\u679c\u3078' : '\u6b21\u3078'}
        </button>
      </div>
    </section>
  );
}
