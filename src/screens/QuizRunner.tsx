import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  onSaveDetailedExplanation: (questionId: string, detailedExplanation: string) => void;
  onFinish: (result: QuizResult) => void;
}

export function QuizRunner({ data, title, subtitle, questions, mode, setId, initialIndex = 0, onBack, onAnswer, onToggleAmbiguous, onSaveDetailedExplanation, onFinish }: QuizRunnerProps) {
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
            detailedExplanation={currentQuestion.detailedExplanation ?? ''}
            questionId={currentQuestion.id}
            sourcePage={currentQuestion.sourcePage}
            savedLevelLabel={savedLevelLabel}
            isAmbiguous={progress?.isAmbiguous ?? false}
            isLast={currentIndex + 1 >= questions.length}
            state={answerSheetState}
            onExpand={() => setAnswerSheetState('expanded')}
            onDefault={() => setAnswerSheetState('default')}
            onHide={() => setAnswerSheetState('hidden')}
            onToggleAmbiguous={handleAmbiguous}
            onSaveDetailedExplanation={(value) => onSaveDetailedExplanation(currentQuestion.id, value)}
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
  questionId,
  isCorrect,
  answer,
  explanation,
  detailedExplanation,
  sourcePage,
  savedLevelLabel,
  isAmbiguous,
  isLast,
  state,
  onExpand,
  onDefault,
  onHide,
  onToggleAmbiguous,
  onSaveDetailedExplanation,
  onNext,
}: {
  questionId: string;
  isCorrect: boolean;
  answer: string;
  explanation: string;
  detailedExplanation: string;
  sourcePage: string;
  savedLevelLabel: string;
  isAmbiguous: boolean;
  isLast: boolean;
  state: AnswerSheetState;
  onExpand: () => void;
  onDefault: () => void;
  onHide: () => void;
  onToggleAmbiguous: () => void;
  onSaveDetailedExplanation: (value: string) => void;
  onNext: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [panelPage, setPanelPage] = useState<'answer' | 'detail'>('answer');
  const [detailText, setDetailText] = useState(detailedExplanation);
  const [savedDetailText, setSavedDetailText] = useState(detailedExplanation);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [detailMessage, setDetailMessage] = useState('');
  const sheetRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const dragFrameRef = useRef<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const lastPointerYRef = useRef(0);
  const lastPointerTimeRef = useRef(0);
  const velocityYRef = useRef(0);
  const startHeightRef = useRef(320);
  const detailSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setDetailText(detailedExplanation);
    setSavedDetailText(detailedExplanation);
    setIsEditingDetail(false);
    setDetailMessage('');
  }, [questionId, detailedExplanation]);

  useEffect(() => {
    setPanelPage('answer');
  }, [questionId, state]);

  const getBaseSheetHeight = (targetState: AnswerSheetState) => {
    if (targetState === 'hidden') return 64;

    const rootStyle = getComputedStyle(document.documentElement);
    const safeTop = Number.parseFloat(rootStyle.getPropertyValue('--safe-top')) || 0;
    const safeBottom = Number.parseFloat(rootStyle.getPropertyValue('--safe-bottom')) || 0;
    const viewportHeight = Math.max(0, window.innerHeight - safeTop - safeBottom);
    const isMobile = window.matchMedia('(max-width: 899px)').matches;

    if (targetState === 'default') {
      if (!isMobile) return 320;
      if (window.matchMedia('(max-width: 380px) and (max-height: 720px)').matches) return 272;
      return Math.max(240, Math.min(320, viewportHeight - 128));
    }

    const availableHeight = isMobile ? viewportHeight - 104 : viewportHeight - 88;
    return Math.max(320, Math.min(620, availableHeight));
  };

  const clampDragOffset = (deltaY: number) => {
    const startHeight = startHeightRef.current;
    const hiddenHeight = getBaseSheetHeight('hidden');
    const expandedHeight = getBaseSheetHeight('expanded');
    const minDelta = startHeight - expandedHeight;
    const maxDelta = startHeight - hiddenHeight;
    const resistance = 0.22;

    if (deltaY < minDelta) return minDelta + (deltaY - minDelta) * resistance;
    if (deltaY > maxDelta) return maxDelta + (deltaY - maxDelta) * resistance;
    return deltaY;
  };

  const snapByDrag = (dragOffset: number, velocityY: number) => {
    const FAST_SWIPE_VELOCITY = 0.45;
    const MIN_SWIPE_DISTANCE = 18;
    if (dragOffset <= -MIN_SWIPE_DISTANCE && velocityY <= -FAST_SWIPE_VELOCITY) {
      onExpand();
      return;
    }
    if (dragOffset >= MIN_SWIPE_DISTANCE && velocityY >= FAST_SWIPE_VELOCITY) {
      onHide();
      return;
    }

    const draggedHeight = startHeightRef.current - dragOffset;
    const states: AnswerSheetState[] = ['expanded', 'default', 'hidden'];
    let nearestState = states[0];
    let nearestDistance = Math.abs(getBaseSheetHeight(nearestState) - draggedHeight);

    for (const candidate of states.slice(1)) {
      const distance = Math.abs(getBaseSheetHeight(candidate) - draggedHeight);
      if (distance < nearestDistance) {
        nearestState = candidate;
        nearestDistance = distance;
      }
    }

    if (nearestState === 'expanded') onExpand();
    else if (nearestState === 'hidden') onHide();
    else onDefault();
  };

  const resetDrag = (deferHeightReset = false) => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    draggingRef.current = false;
    setIsDragging(false);
    dragOffsetRef.current = 0;

    const clearInlineHeight = () => {
      sheetRef.current?.style.removeProperty('height');
    };

    if (deferHeightReset) requestAnimationFrame(clearInlineHeight);
    else clearInlineHeight();
  };

  const cancelDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.type === 'pointerleave' && event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    if (!draggingRef.current) return;
    resetDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const now = performance.now();
    dragStartYRef.current = event.clientY;
    dragStartTimeRef.current = now;
    lastPointerYRef.current = event.clientY;
    lastPointerTimeRef.current = now;
    velocityYRef.current = 0;
    startHeightRef.current = sheetRef.current?.getBoundingClientRect().height ?? getBaseSheetHeight(state);
    draggingRef.current = true;
    setIsDragging(true);
    dragOffsetRef.current = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();

    const now = performance.now();
    const elapsed = now - lastPointerTimeRef.current;
    if (elapsed > 0) velocityYRef.current = (event.clientY - lastPointerYRef.current) / elapsed;
    lastPointerYRef.current = event.clientY;
    lastPointerTimeRef.current = now;
    dragOffsetRef.current = clampDragOffset(event.clientY - dragStartYRef.current);

    if (dragFrameRef.current === null) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        if (!sheetRef.current || !draggingRef.current) return;
        sheetRef.current.style.height = String(getDraggedSheetHeight()) + 'px';
      });
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;

    const elapsed = performance.now() - dragStartTimeRef.current;
    const totalVelocityY = elapsed > 0 ? (event.clientY - dragStartYRef.current) / elapsed : velocityYRef.current;
    const velocityY = Math.abs(velocityYRef.current) >= 0.45 ? velocityYRef.current : totalVelocityY;
    snapByDrag(dragOffsetRef.current, velocityY);
    resetDrag(true);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const getDraggedSheetHeight = () => {
    const expandedHeight = getBaseSheetHeight('expanded');
    const maxHeight = Math.max(expandedHeight, window.innerHeight - 40);
    return Math.max(48, Math.min(maxHeight, startHeightRef.current - dragOffsetRef.current));
  };

  const dragProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: cancelDrag,
    onPointerLeave: cancelDrag,
  };

  const handleDetailPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (panelPage !== 'answer' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    detailSwipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleDetailPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = detailSwipeStartRef.current;
    detailSwipeStartRef.current = null;
    if (!start || state !== 'expanded' || panelPage !== 'answer') return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
    setPanelPage(deltaX > 0 ? 'detail' : 'answer');
  };

  const handleClipboardRead = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard unavailable');
      const value = await navigator.clipboard.readText();
      setDetailText(value);
      setDetailMessage(value ? '\u30af\u30ea\u30c3\u30d7\u30dc\u30fc\u30c9\u304b\u3089\u8aad\u307f\u8fbc\u307f\u307e\u3057\u305f' : '\u30af\u30ea\u30c3\u30d7\u30dc\u30fc\u30c9\u304c\u7a7a\u3067\u3059');
    } catch {
      setDetailMessage('\u30af\u30ea\u30c3\u30d7\u30dc\u30fc\u30c9\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f');
    }
  };

  const handleSaveDetail = () => {
    onSaveDetailedExplanation(detailText);
    setSavedDetailText(detailText);
    setIsEditingDetail(false);
    setDetailMessage('\u8a73\u7d30\u89e3\u8aac\u3092\u767b\u9332\u3057\u307e\u3057\u305f');
  };

  const handleCancelDetailEdit = () => {
    setDetailText(savedDetailText);
    setIsEditingDetail(false);
    setDetailMessage('');
  };

  const detailSwipeProps = {
    onPointerDown: handleDetailPointerDown,
    onPointerUp: handleDetailPointerUp,
    onPointerCancel: () => { detailSwipeStartRef.current = null; },
  };

  const hasSavedDetail = savedDetailText.trim().length > 0;

  const answerPage = (
    <div className="answer-sheet__content-page">
      <div className="answer-sheet__answer-box">
        <p className="answer-sheet__label">{'\u6b63\u89e3'}</p>
        <p className="answer-sheet__answer-text">{answer}</p>
      </div>
      <div className="answer-sheet__explanation-block">
        <p className="answer-sheet__label">{'\u89e3\u8aac'}</p>
        <ExplanationContent text={explanation} className="answer-sheet__explanation-text" />
        {sourcePage ? <p className="answer-sheet__source">{'\u53c2\u7167\uff1a'}{sourcePage}</p> : null}
        {state === 'expanded' ? (
          <button type="button" className="answer-sheet__detail-open" onClick={() => setPanelPage('detail')}>
            {'\u8a73\u7d30\u89e3\u8aac'} {'\u203a'}
          </button>
        ) : null}
      </div>
    </div>
  );

  const detailPage = (
    <div className="answer-sheet__content-page answer-sheet__detail-page">
      <div className="answer-sheet__detail-heading">
        <button type="button" className="answer-sheet__detail-back" onClick={() => setPanelPage('answer')}>
          {'\u2039'} {'\u89e3\u7b54\u306b\u623b\u308b'}
        </button>
        <strong>{'\u8a73\u7d30\u89e3\u8aac'}</strong>
      </div>
      {hasSavedDetail && !isEditingDetail ? (
        <div className="answer-sheet__detail-reading">
          <ExplanationContent text={detailText} className="answer-sheet__explanation-text" />
          <button type="button" className="answer-sheet__detail-edit" onClick={() => setIsEditingDetail(true)}>
            {'\u8a73\u7d30\u89e3\u8aac\u3092\u7de8\u96c6'}
          </button>
        </div>
      ) : (
        <div className="answer-sheet__detail-editor">
          {!hasSavedDetail ? <p className="answer-sheet__detail-helper">{'\u30af\u30ea\u30c3\u30d7\u30dc\u30fc\u30c9\u306e\u8a73\u7d30\u89e3\u8aac\u3092\u8aad\u307f\u8fbc\u3093\u3067\u767b\u9332\u3067\u304d\u307e\u3059'}</p> : null}
          {!hasSavedDetail ? (
            <button type="button" className="answer-sheet__clipboard-button" onClick={() => void handleClipboardRead()}>
              {'\u30af\u30ea\u30c3\u30d7\u30dc\u30fc\u30c9\u304b\u3089\u30b3\u30d4\u30fc'}
            </button>
          ) : null}
          <textarea
            className="answer-sheet__detail-input"
            value={detailText}
            onChange={(event) => setDetailText(event.target.value)}
            placeholder={'\u8a73\u7d30\u89e3\u8aac\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044'}
            aria-label={'\u8a73\u7d30\u89e3\u8aac'}
          />
          <div className="answer-sheet__detail-preview">
            <p className="answer-sheet__label">{'\u8868\u793a\u30d7\u30ec\u30d3\u30e5\u30fc'}</p>
            {detailText.trim() ? (
              <ExplanationContent text={detailText} className="answer-sheet__explanation-text" />
            ) : (
              <p className="answer-sheet__detail-empty">{'\u8a73\u7d30\u89e3\u8aac\u306f\u307e\u3060\u5165\u529b\u3055\u308c\u3066\u3044\u307e\u305b\u3093'}</p>
            )}
          </div>
          <button type="button" className="answer-sheet__detail-save" onClick={handleSaveDetail} disabled={!detailText.trim()}>
            {'\u8a73\u7d30\u89e3\u8aac\u3092\u767b\u9332'}
          </button>
          {hasSavedDetail ? <button type="button" className="answer-sheet__detail-cancel" onClick={handleCancelDetailEdit}>{'\u30ad\u30e3\u30f3\u30bb\u30eb'}</button> : null}
          {detailMessage ? <p className="answer-sheet__detail-message">{detailMessage}</p> : null}
        </div>
      )}
    </div>
  );

  if (state === 'hidden') {
    return (
      <section ref={sheetRef} className={'answer-sheet answer-sheet--hidden ' + (isDragging ? 'answer-sheet--dragging' : '')} {...dragProps}>
        <div className="answer-sheet__hidden-handle" />
        <div className="answer-sheet__hidden-bar">
          <span className={'answer-sheet__hidden-result ' + (isCorrect ? 'answer-sheet__hidden-result--correct' : 'answer-sheet__hidden-result--wrong')}>{isCorrect ? '\u6b63\u89e3' : '\u4e0d\u6b63\u89e3'}</span>
          <button type="button" className="answer-sheet__hidden-open" onClick={onDefault}>{'\u89e3\u7b54\u3092\u898b\u308b'}</button>
          <button type="button" className="answer-sheet__hidden-next" onClick={onNext}>{isLast ? '\u7d50\u679c\u3078' : '\u6b21\u3078'}</button>
        </div>
      </section>
    );
  }

  return (
    <section ref={sheetRef} className={'answer-sheet answer-sheet--' + state + ' ' + (isDragging ? 'answer-sheet--dragging' : '')}>
      <div className="answer-sheet__drag-area" {...dragProps}>
        <div className="answer-sheet__drag-handle" />
      </div>
      <div className="answer-sheet__fixed">
        <div>
          <div className={'answer-sheet__result ' + (isCorrect ? 'answer-sheet__result--correct' : 'answer-sheet__result--wrong')}>{isCorrect ? '\u6b63\u89e3' : '\u4e0d\u6b63\u89e3'}</div>
          {savedLevelLabel ? <p className="answer-sheet__saved">{savedLevelLabel}</p> : null}
        </div>
        <button type="button" onClick={onHide} className="answer-sheet__hide-button">{'\u3057\u307e\u3046'}</button>
      </div>
      <div className={'answer-sheet__scroll ' + (state === 'expanded' ? 'answer-sheet__scroll--pages' : '')} {...(state === 'expanded' ? detailSwipeProps : {})}>
        {state === 'expanded' ? (
          <div className={'answer-sheet__content-rail ' + (panelPage === 'detail' ? 'answer-sheet__content-rail--detail' : '')}>
            {answerPage}
            {detailPage}
          </div>
        ) : answerPage}
      </div>
      <div className="answer-sheet__actions">
        <button type="button" onClick={onToggleAmbiguous} className={'answer-sheet__action answer-sheet__action--secondary' + (isAmbiguous ? ' answer-sheet__action--ambiguous' : '')}>
          {isAmbiguous ? '\u66d6\u6627\u3092\u89e3\u9664' : '\u66d6\u6627\u3068\u3057\u3066\u767b\u9332'}
        </button>
        <button type="button" onClick={onNext} className="answer-sheet__action answer-sheet__action--primary">{isLast ? '\u7d50\u679c\u3078' : '\u6b21\u3078'}</button>
      </div>
    </section>
  );
}

function ExplanationContent({ text, className }: { text: string; className: string }) {
  const blocks = parseExplanationBlocks(text);
  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => block.kind === 'table' ? (
        <div className="answer-sheet__markdown-table-wrap" key={'table-' + blockIndex}>
          <table className="answer-sheet__markdown-table">
            <thead>
              <tr>{block.headers.map((cell, index) => <th key={'head-' + index}>{cell}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={'row-' + rowIndex}>
                  {row.map((cell, cellIndex) => <td key={'cell-' + rowIndex + '-' + cellIndex}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="answer-sheet__markdown-paragraph" key={'paragraph-' + blockIndex}>
          {block.lines.map((line, lineIndex) => <span key={'line-' + lineIndex}>{line}{lineIndex < block.lines.length - 1 ? <br /> : null}</span>)}
        </p>
      ))}
    </div>
  );
}

function parseExplanationBlocks(text: string): Array<
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
> {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Array<
    | { kind: 'paragraph'; lines: string[] }
    | { kind: 'table'; headers: string[]; rows: string[][] }
  > = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.some((line) => line.trim())) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };

  const parseRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const divider = lines[index + 1] ?? '';
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(divider)) {
      flushParagraph();
      const headers = parseRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(parseRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }
    if (line.trim() === '') flushParagraph();
    else paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}
