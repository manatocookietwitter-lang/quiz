import { useEffect, useRef, useState } from 'react';
import type { AppData, AppScreen, ProblemSet, Question, QuizMode, QuizResult, QuizSession } from './types';
import { createEmptyAppData, loadAppData, parseBackupJson, saveAppData } from './storage';
import { HomeScreen } from './screens/HomeScreen';
import { FolderScreen } from './screens/FolderScreen';
import { ProblemSetDetailScreen } from './screens/ProblemSetDetailScreen';
import { ProblemListScreen } from './screens/ProblemListScreen';
import { ImportScreen } from './screens/ImportScreen';
import { QuizScreen } from './screens/QuizScreen';
import { QuizRunner } from './screens/QuizRunner';
import { ReviewScreen } from './screens/ReviewScreen';
import { ResultScreen } from './screens/ResultScreen';
import { createId } from './utils/id';
import { formatBackupDate, nowIso } from './utils/date';
import {
  addFolder,
  deleteFolder,
  deleteProblemSet,
  recordAnswer,
  toggleAmbiguous,
} from './utils/quiz';
import { validateImportJson } from './utils/importValidator';

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData());
  const dataRef = useRef(data);
  const [screen, setScreen] = useState<AppScreen>({ name: 'home' });
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back'>('forward');
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    dataRef.current = data;
    saveAppData(data);
  }, [data]);

  useEffect(() => {
    const handleUpdate = (event: WindowEventMap['quiz-make-sw-update']) => {
      setWaitingWorker(event.detail.worker);
    };
    window.addEventListener('quiz-make-sw-update', handleUpdate);
    return () => window.removeEventListener('quiz-make-sw-update', handleUpdate);
  }, []);

  const commitData = (nextData: AppData) => {
    dataRef.current = nextData;
    setData(nextData);
    saveAppData(nextData);
  };

  const navigate = (next: AppScreen) => {
    setTransitionDirection('forward');
    setScreen(next);
  };

  const goBackTo = (next: AppScreen) => {
    setTransitionDirection('back');
    setScreen(next);
  };

  const replaceScreen = (next: AppScreen) => {
    setTransitionDirection('forward');
    setScreen(next);
  };

  const goHome = () => goBackTo({ name: 'home' });

  const handleCreateFolder = (name: string) => {
    setData((current) => addFolder(current, name));
  };

  const handleDeleteFolder = (folderId: string) => {
    setData((current) => deleteFolder(current, folderId));
    goBackTo({ name: 'home' });
  };

  const handleDeleteProblemSet = (setId: string) => {
    setData((current) => deleteProblemSet(current, setId));
  };

  const handleImportProblemSet = (folderId: string, titleOverride: string, jsonText: string, stayOnScreen = false): string | null => {
    const validation = validateImportJson(jsonText);
    if (!validation.ok) {
      return validation.errors.join('\n');
    }

    const timestamp = nowIso();
    const setId = createId('set');
    const problemSet: ProblemSet = {
      id: setId,
      folderId,
      title: titleOverride.trim() || validation.value.setTitle.trim(),
      source: validation.value.source ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const questions: Question[] = validation.value.questions.map((question) => ({
      id: createId('q'),
      setId,
      question: question.question,
      choices: question.choices,
      answerIndex: question.answerIndex ?? question.answerIndexes?.[0] ?? 0,
      answerIndexes: question.answerIndexes,
      answerText: question.answerText ?? (question.answerIndexes ?? [question.answerIndex ?? 0])
        .map((index) => question.choices[index])
        .filter(Boolean)
        .join(' / '),
      explanation: question.explanation,
      sourcePage: question.sourcePage ?? '',
      category: question.category ?? '',
      difficulty: question.difficulty ?? 'basic',
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    setData((current) => ({
      ...current,
      problemSets: [problemSet, ...current.problemSets],
      questions: [...questions, ...current.questions],
      progress: [...current.progress, ...questions.map((question) => ({
        questionId: question.id,
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        lastSelectedIndex: null,
        lastAnswerCorrect: null,
        lastAnsweredAt: null,
        isReview: false,
        isAmbiguous: false,
        reviewLevel: null,
        isGraduated: false,
      }))],
    }));
    if (!stayOnScreen) {
      replaceScreen({ name: 'folder', folderId });
    }
    return null;
  };

  const handleAnswer = (question: Question, selectedIndexes: number[], isReviewMode: boolean) => {
    const answerResult = recordAnswer(dataRef.current, question, selectedIndexes, isReviewMode);
    commitData(answerResult.data);
    const levelLabel = answerResult.progress.isGraduated ? '卒業' : `Level ${answerResult.progress.reviewLevel ?? 1}`;
    return { isCorrect: answerResult.isCorrect, addedToReview: answerResult.addedToReview, levelLabel };
  };

  const handleToggleAmbiguous = (questionId: string) => {
    commitData(toggleAmbiguous(dataRef.current, questionId));
  };

  const handleClearAll = () => {
    setData(createEmptyAppData());
    replaceScreen({ name: 'home' });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `quiz-make-backup-${formatBackupDate()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleApplyUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  };

  const handleImportBackup = async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
      const result = parseBackupJson(text);
      if (!result.ok) return result.error;
      const ok = window.confirm('現在のデータをすべて上書きします。バックアップJSONをインポートしますか？');
      if (!ok) return null;
      setData(result.data);
      replaceScreen({ name: 'home' });
      return null;
    } catch (error) {
      return error instanceof Error ? `読み込みに失敗しました: ${error.message}` : '読み込みに失敗しました。';
    }
  };

  const handleStartQuiz = (setId: string, mode: QuizMode) => {
    navigate({ name: 'quiz', setId, mode });
  };

  const handleStartQuizSession = (session: QuizSession) => {
    navigate({ name: 'quizSession', session });
  };

  const handleFinish = (result: QuizResult) => {
    navigate({ name: 'result', result });
  };

  const handleRetry = (result: QuizResult) => {
    if (result.mode === 'review') {
      navigate({ name: 'review' });
      return;
    }
    if (result.setId) {
      navigate({ name: 'quiz', setId: result.setId, mode: 'ordered' });
      return;
    }
    goBackTo({ name: 'home' });
  };

  let content;

  if (screen.name === 'folder') {
    content = (
      <FolderScreen
        data={data}
        folderId={screen.folderId}
        onBack={goHome}
        onOpenImport={(folderId) => navigate({ name: 'import', folderId })}
        onOpenProblemSet={(setId) => navigate({ name: 'problemSetDetail', setId })}
        onDeleteProblemSet={handleDeleteProblemSet}
      />
    );
  } else if (screen.name === 'problemSetDetail') {
    const problemSet = data.problemSets.find((set) => set.id === screen.setId);
    content = (
      <ProblemSetDetailScreen
        data={data}
        setId={screen.setId}
        onBack={() => goBackTo({ name: 'folder', folderId: problemSet?.folderId ?? '' })}
        onOpenImport={(folderId) => navigate({ name: 'import', folderId, backScreen: { name: 'problemSetDetail', setId: screen.setId } })}
        onOpenProblemList={() => navigate({ name: 'problemList', setId: screen.setId })}
        onStartSession={({ questions, mode, initialIndex, title, subtitle, setId }) => handleStartQuizSession({
          title,
          subtitle,
          questions,
          mode,
          setId,
          initialIndex,
          backScreen: { name: 'problemSetDetail', setId },
        })}
      />
    );
  } else if (screen.name === 'problemList') {
    content = (
      <ProblemListScreen
        data={data}
        setId={screen.setId}
        initialSortMode={screen.sortMode}
        onBack={() => goBackTo({ name: 'problemSetDetail', setId: screen.setId })}
        onStartFromQuestion={({ questions, initialIndex, title, subtitle, setId, sortMode }) => handleStartQuizSession({
          title,
          subtitle,
          questions,
          mode: 'quiz',
          setId,
          initialIndex,
          backScreen: { name: 'problemList', setId: screen.setId, sortMode },
        })}
      />
    );
  } else if (screen.name === 'import') {
    const folder = data.folders.find((item) => item.id === screen.folderId);
    content = (
      <ImportScreen
        folderName={folder?.name ?? 'フォルダ'}
        onBack={() => goBackTo(screen.backScreen ?? { name: 'folder', folderId: screen.folderId })}
        onImport={(titleOverride, jsonText, stayOnScreen) => handleImportProblemSet(screen.folderId, titleOverride, jsonText, stayOnScreen)}
      />
    );
  } else if (screen.name === 'quiz') {
    const problemSet = data.problemSets.find((set) => set.id === screen.setId);
    content = (
      <QuizScreen
        key={`${screen.setId}_${screen.mode}`}
        data={data}
        setId={screen.setId}
        mode={screen.mode}
        onBack={() => goBackTo({ name: 'folder', folderId: problemSet?.folderId ?? '' })}
        onAnswer={handleAnswer}
        onToggleAmbiguous={handleToggleAmbiguous}
        onFinish={handleFinish}
      />
    );
  } else if (screen.name === 'quizSession') {
    content = (
      <QuizRunner
        key={`${screen.session.setId ?? 'session'}_${screen.session.mode}_${screen.session.initialIndex ?? 0}_${screen.session.questions.map((question) => question.id).join('_')}`}
        data={data}
        title={screen.session.title}
        subtitle={screen.session.subtitle}
        questions={screen.session.questions}
        mode={screen.session.mode}
        setId={screen.session.setId}
        initialIndex={screen.session.initialIndex}
        onBack={() => goBackTo(screen.session.backScreen)}
        onAnswer={handleAnswer}
        onToggleAmbiguous={handleToggleAmbiguous}
        onFinish={handleFinish}
      />
    );
  } else if (screen.name === 'review') {
    content = (
      <ReviewScreen
        key="review"
        data={data}
        onBack={goHome}
        onAnswer={handleAnswer}
        onToggleAmbiguous={handleToggleAmbiguous}
        onFinish={handleFinish}
      />
    );
  } else if (screen.name === 'result') {
    content = (
      <ResultScreen
        result={screen.result}
        onHome={goHome}
        onRetry={() => handleRetry(screen.result)}
      />
    );
  } else {
    content = (
    <HomeScreen
      data={data}
      onCreateFolder={handleCreateFolder}
      onDeleteFolder={handleDeleteFolder}
      onOpenFolder={(folderId) => navigate({ name: 'folder', folderId })}
      onExport={handleExport}
      onImportBackup={handleImportBackup}
      onClearAll={handleClearAll}
    />
  );
  }

  return (
    <>
      <div key={getScreenKey(screen)} className={`quiz-screen-transition quiz-screen-transition--${transitionDirection}`}>
        {content}
      </div>
      {waitingWorker ? (
        <div className="quiz-update-toast">
          <span>新しいバージョンがあります</span>
          <button type="button" onClick={handleApplyUpdate}>更新する</button>
        </div>
      ) : null}
    </>
  );
}

function getScreenKey(screen: AppScreen) {
  if (screen.name === 'folder') return `folder-${screen.folderId}`;
  if (screen.name === 'problemSetDetail') return `detail-${screen.setId}`;
  if (screen.name === 'problemList') return `problem-list-${screen.setId}-${screen.sortMode ?? 'ordered'}`;
  if (screen.name === 'import') return `import-${screen.folderId}`;
  if (screen.name === 'quiz') return `quiz-${screen.setId}-${screen.mode}`;
  if (screen.name === 'quizSession') return `quiz-session-${screen.session.setId ?? 'custom'}-${screen.session.initialIndex ?? 0}-${screen.session.questions.length}`;
  if (screen.name === 'result') return `result-${screen.result.title}-${screen.result.answered}`;
  return screen.name;
}
