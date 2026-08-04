import { useEffect, useRef, useState } from 'react';
import type { AppData, AppScreen, ProblemSet, Question, QuizMode, QuizResult, QuizSession } from './types';
import {
  createEmptyAppData,
  loadAppDataAsync,
  parseBackupJson,
  saveAppData,
  waitForPendingAppDataSaves,
} from './storage';
import { HomeScreen } from './screens/HomeScreen';
import { FolderScreen } from './screens/FolderScreen';
import { ProblemSetDetailScreen } from './screens/ProblemSetDetailScreen';
import { ProblemListScreen } from './screens/ProblemListScreen';
import { NoteListScreen } from './screens/NoteListScreen';
import { ImportScreen } from './screens/ImportScreen';
import { QuizScreen } from './screens/QuizScreen';
import { QuizRunner } from './screens/QuizRunner';
import { ReviewScreen } from './screens/ReviewScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SyncScreen } from './screens/SyncScreen';
import { AutoSyncController } from './components/AutoSyncController';
import { ConfirmDialog } from './components/ConfirmDialog';
import { createId } from './utils/id';
import { formatBackupDate, nowIso } from './utils/date';
import { getBackNavigationSteps, getScreenKey } from './utils/navigation';
import {
  addFolder,
  deleteFolder,
  deleteProblemSet,
  recordAnswer,
  toggleAmbiguous,
  updateQuestionDetailedExplanation,
} from './utils/quiz';
import { validateImportJson } from './utils/importValidator';
import { exportQuizMakeData, importQuizMakeData, summarizeSyncPayload, validateSyncPayload, type SyncPayload, type SyncPayloadSummary } from './utils/syncService';
import { waitForPendingCategoryNoteSaves } from './utils/noteStorage';
type PendingBackupImport =
  | { kind: 'sync'; payload: SyncPayload; summary: SyncPayloadSummary }
  | { kind: 'legacy'; data: AppData };
export default function App() {
  const [data, setData] = useState<AppData>(() => createEmptyAppData());
  const [storageReady, setStorageReady] = useState(false);
  const dataRef = useRef(data);
  const [screen, setScreen] = useState<AppScreen>({ name: 'home' });
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back' | 'replace'>('replace');
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [pendingExitTarget, setPendingExitTarget] = useState<AppScreen | null>(null);
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | null>(null);
  const [backupImportBusy, setBackupImportBusy] = useState(false);
  const [backupImportError, setBackupImportError] = useState('');
  const [storageError, setStorageError] = useState('');
  const navigationStackRef = useRef<AppScreen[]>([{ name: 'home' }]);
  const browserDepthRef = useRef(0);
  const pendingBackTargetRef = useRef<AppScreen | null>(null);
  const pendingBackStepsRef = useRef(1);
  const pendingExitTargetRef = useRef<AppScreen | null>(null);
  const confirmedQuizExitRef = useRef(false);
  const screenRef = useRef<AppScreen>({ name: 'home' });
  const dataRevisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadAppDataAsync().then((loadedData) => {
      if (cancelled) return;
      dataRef.current = loadedData;
      setData(loadedData);
      setStorageReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    window.history.replaceState({ quizMake: true }, '');

    const handlePopState = () => {
      const current = screenRef.current;
      const target = pendingBackTargetRef.current ?? navigationStackRef.current[navigationStackRef.current.length - 2] ?? { name: 'home' };
      const historySteps = pendingBackStepsRef.current;
      pendingBackTargetRef.current = null;
      pendingBackStepsRef.current = 1;

      if (isQuizInProgressScreen(current) && !confirmedQuizExitRef.current) {
        window.history.pushState({ quizMake: true }, '');
        pendingExitTargetRef.current = target;
        setPendingExitTarget(target);
        return;
      }

      if (confirmedQuizExitRef.current) {
        confirmedQuizExitRef.current = false;
      }
      applyBackNavigation(target, historySteps);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    const handleUpdate = (event: WindowEventMap['quiz-make-sw-update']) => {
      setWaitingWorker(event.detail.worker);
    };
    window.addEventListener('quiz-make-sw-update', handleUpdate);
    return () => window.removeEventListener('quiz-make-sw-update', handleUpdate);
  }, []);

  const commitData = async (nextData: AppData): Promise<boolean> => {
    dataRevisionRef.current += 1;
    dataRef.current = nextData;
    setData(nextData);
    const saved = await saveAppData(nextData);
    setStorageError(saved ? '' : '端末への保存に失敗しました。空き容量やブラウザの保存設定を確認して、もう一度お試しください。');
    return saved;
  };

  const persistThenCommitData = async (nextData: AppData): Promise<boolean> => {
    const previousData = dataRef.current;
    const revision = dataRevisionRef.current + 1;
    dataRevisionRef.current = revision;
    // Reserve the next snapshot immediately. Any action taken while this durable
    // save is pending will now build on top of it instead of an older snapshot.
    dataRef.current = nextData;
    const saved = await saveAppData(nextData);
    if (!saved) {
      if (dataRevisionRef.current === revision) {
        dataRef.current = previousData;
      }
      setStorageError('端末への保存に失敗しました。空き容量やブラウザの保存設定を確認して、もう一度お試しください。');
      return false;
    }
    // A newer mutation may already contain this snapshot plus further changes.
    // Do not roll the UI back to this older snapshot when that happens.
    if (dataRevisionRef.current === revision) {
      dataRef.current = nextData;
      setData(nextData);
    }
    setStorageError('');
    return true;
  };

  const navigate = (next: AppScreen) => {
    navigationStackRef.current = [...navigationStackRef.current, next];
    browserDepthRef.current += 1;
    window.history.pushState({ quizMake: true }, '');
    setTransitionDirection('forward');
    setScreen(next);
  };

  const applyBackNavigation = (target: AppScreen, historySteps = 1) => {
    const targetKey = getScreenKey(target);
    const stack = navigationStackRef.current;
    let targetIndex = -1;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (getScreenKey(stack[index]) === targetKey) {
        targetIndex = index;
        break;
      }
    }

    navigationStackRef.current = targetIndex >= 0 ? stack.slice(0, targetIndex + 1) : [target];
    browserDepthRef.current = Math.max(0, browserDepthRef.current - historySteps);
    pendingBackTargetRef.current = null;
    setTransitionDirection('back');
    setScreen(target);
  };

  const performBackNavigation = (target: AppScreen) => {
    pendingBackTargetRef.current = target;
    const desiredSteps = getBackNavigationSteps(navigationStackRef.current, target);
    if (browserDepthRef.current > 0) {
      const historySteps = Math.min(desiredSteps, browserDepthRef.current);
      pendingBackStepsRef.current = historySteps;
      window.history.go(-historySteps);
      return;
    }
    pendingBackTargetRef.current = null;
    pendingBackStepsRef.current = 1;
    applyBackNavigation(target, 0);
  };

  const goBackTo = (next: AppScreen) => {
    if (isQuizInProgressScreen(screenRef.current)) {
      pendingExitTargetRef.current = next;
      setPendingExitTarget(next);
      return;
    }
    performBackNavigation(next);
  };

  const replaceScreen = (next: AppScreen) => {
    const stack = navigationStackRef.current;
    navigationStackRef.current = stack.length > 0 ? [...stack.slice(0, -1), next] : [next];
    window.history.replaceState({ quizMake: true }, '');
    setTransitionDirection('replace');
    setScreen(next);
  };

  const cancelExitSession = () => {
    pendingExitTargetRef.current = null;
    setPendingExitTarget(null);
  };

  const confirmExitSession = () => {
    const target = pendingExitTargetRef.current ?? pendingExitTarget ?? { name: 'home' };
    pendingExitTargetRef.current = null;
    setPendingExitTarget(null);
    confirmedQuizExitRef.current = true;
    pendingBackTargetRef.current = target;
    const desiredSteps = getBackNavigationSteps(navigationStackRef.current, target);
    if (browserDepthRef.current > 0) {
      const historySteps = Math.min(desiredSteps, browserDepthRef.current);
      pendingBackStepsRef.current = historySteps;
      window.history.go(-historySteps);
      return;
    }
    confirmedQuizExitRef.current = false;
    pendingBackTargetRef.current = null;
    pendingBackStepsRef.current = 1;
    applyBackNavigation(target, 0);
  };

  const goHome = () => goBackTo({ name: 'home' });

  const handleCreateFolder = (name: string) => {
    void commitData(addFolder(dataRef.current, name));
  };

  const handleDeleteFolder = (folderId: string) => {
    void commitData(deleteFolder(dataRef.current, folderId));
    goBackTo({ name: 'home' });
  };

  const handleDeleteProblemSet = (setId: string) => {
    void commitData(deleteProblemSet(dataRef.current, setId));
  };

  const handleImportProblemSet = async (folderId: string, titleOverride: string, jsonText: string, stayOnScreen = false): Promise<string | null> => {
    const validation = validateImportJson(jsonText);
    if (!validation.ok) {
      return validation.errors.join('\n');
    }

    const timestamp = nowIso();
    const setId = createId('set');
    const titleCandidate = titleOverride.trim() || validation.value.setTitle.trim() || '無題の問題セット';

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
      detailedExplanation: question.detailedExplanation ?? '',
      sourcePage: question.sourcePage ?? '',
      category: question.category ?? '',
      difficulty: question.difficulty ?? 'basic',
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const current = dataRef.current;
    const problemSet: ProblemSet = {
      id: setId,
      folderId,
      title: makeUniqueProblemSetTitle(current, folderId, titleCandidate),
      source: validation.value.source ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const saved = await persistThenCommitData({
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
    });
    if (!saved) {
      return '問題セットを端末へ保存できませんでした。入力内容を残したまま、空き容量やブラウザの保存設定を確認してください。';
    }
    if (!stayOnScreen) {
      replaceScreen({ name: 'folder', folderId });
    }
    return null;
  };

  const handleAnswer = (question: Question, selectedIndexes: number[], isReviewMode: boolean) => {
    const answerResult = recordAnswer(dataRef.current, question, selectedIndexes, isReviewMode);
    const savePromise = commitData(answerResult.data);
    const levelLabel = answerResult.progress.isGraduated ? '卒業' : `Level ${answerResult.progress.reviewLevel ?? 1}`;
    return {
      isCorrect: answerResult.isCorrect,
      addedToReview: answerResult.addedToReview,
      levelLabel,
      savePromise,
    };
  };

  const handleToggleAmbiguous = async (questionId: string) => {
    return persistThenCommitData(toggleAmbiguous(dataRef.current, questionId));
  };

  const handleSaveDetailedExplanation = async (questionId: string, detailedExplanation: string): Promise<void> => {
    const nextData = updateQuestionDetailedExplanation(dataRef.current, questionId, detailedExplanation);
    const saved = await persistThenCommitData(nextData);
    if (!saved) {
      const message = '詳細解説を端末へ保存できませんでした。入力内容は残っているので、空き容量や保存設定を確認して再試行してください。';
      setStorageError(message);
      throw new Error(message);
    }
  };

  const handleClearAll = () => {
    void commitData(createEmptyAppData());
    replaceScreen({ name: 'home' });
  };

  const handleExport = async () => {
    try {
      const payload = await exportQuizMakeData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `quiz-make-backup-${formatBackupDate()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setBackupImportError(error instanceof Error ? `バックアップの作成に失敗しました: ${error.message}` : 'バックアップの作成に失敗しました。');
    }
  };

  const handleApplyUpdate = async () => {
    try {
      const [appDataSaved] = await Promise.all([
        waitForPendingAppDataSaves(),
        waitForPendingCategoryNoteSaves(),
      ]);
      if (!appDataSaved) {
        setStorageError('未保存の変更があるため更新を中止しました。端末の空き容量や保存設定を確認してから、もう一度お試しください。');
        return;
      }
    } catch {
      setStorageError('未保存のノートがあるため更新を中止しました。端末の空き容量や保存設定を確認してから、もう一度お試しください。');
      return;
    }
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  };

  const handleImportBackup = async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const syncValidation = validateSyncPayload(parsed);
      if (syncValidation.ok) {
        setBackupImportError('');
        setPendingBackupImport({ kind: 'sync', payload: syncValidation.value, summary: summarizeSyncPayload(syncValidation.value) });
        return null;
      }

      const result = parseBackupJson(text);
      if (!result.ok) return result.error;
      setBackupImportError('');
      setPendingBackupImport({ kind: 'legacy', data: result.data });
      return null;
    } catch (error) {
      return error instanceof Error ? `読み込みに失敗しました: ${error.message}` : '読み込みに失敗しました。';
    }
  };

  const cancelImportBackup = () => {
    if (backupImportBusy) return;
    setPendingBackupImport(null);
  };

  const confirmImportBackup = async () => {
    const target = pendingBackupImport;
    if (!target || backupImportBusy) return;
    setBackupImportBusy(true);
    setBackupImportError('');

    if (target.kind === 'legacy') {
      const saved = await persistThenCommitData(target.data);
      if (!saved) {
        setBackupImportError('バックアップを端末へ保存できませんでした。現在の画面を閉じず、空き容量や保存設定を確認してください。');
        setBackupImportBusy(false);
        return;
      }
      setPendingBackupImport(null);
      setBackupImportBusy(false);
      replaceScreen({ name: 'home' });
      return;
    }

    const result = await importQuizMakeData(target.payload);
    if (!result.ok) {
      setBackupImportError(result.error);
      setBackupImportBusy(false);
      return;
    }

    const loaded = await loadAppDataAsync();
    dataRevisionRef.current += 1;
    dataRef.current = loaded;
    setData(loaded);
    setPendingBackupImport(null);
    setBackupImportBusy(false);
    replaceScreen({ name: 'home' });
  };
  const handleStartQuiz = (setId: string, mode: QuizMode) => {
    navigate({ name: 'quiz', setId, mode });
  };

  const handleStartQuizSession = (session: QuizSession) => {
    navigate({ name: 'quizSession', session });
  };

  const handleFinish = (result: QuizResult) => {
    const current = screenRef.current;
    let backScreen: AppScreen | undefined;
    if (current.name === 'quizSession') {
      backScreen = current.session.backScreen;
    } else if (current.name === 'quiz' && result.setId) {
      backScreen = { name: 'problemSetDetail', setId: result.setId };
    } else if (current.name === 'review') {
      backScreen = { name: 'home' };
    }

    navigate({
      name: 'result',
      result: result.retry && backScreen
        ? { ...result, retry: { ...result.retry, backScreen } }
        : result,
    });
  };

  const handleRetry = (result: QuizResult) => {
    if (result.retry) {
      const questionsById = new Map(dataRef.current.questions.map((question) => [question.id, question]));
      const retryQuestions = result.retry.questionIds
        .map((questionId) => questionsById.get(questionId))
        .filter((question): question is Question => Boolean(question));
      if (retryQuestions.length > 0) {
        navigate({
          name: 'quizSession',
          session: {
            title: result.title,
            subtitle: result.retry.subtitle,
            questions: retryQuestions,
            mode: result.mode,
            setId: result.setId,
            initialIndex: 0,
            backScreen: result.retry.backScreen ?? { name: 'home' },
          },
        });
        return;
      }
    }

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

  if (!storageReady) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#f1f7fa', color: '#173042', fontWeight: 800 }}>
        読み込み中...
      </div>
    );
  }

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
        onOpenNoteList={() => navigate({ name: 'noteList', setId: screen.setId })}
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
  } else if (screen.name === 'noteList') {
    content = (
      <NoteListScreen
        data={data}
        setId={screen.setId}
        onBack={() => goBackTo({ name: 'problemSetDetail', setId: screen.setId })}
      />
    );
  } else if (screen.name === 'import') {
    const folder = data.folders.find((item) => item.id === screen.folderId);
    content = (
      <ImportScreen
        folderName={folder?.name ?? 'フォルダ'}
        onBack={() => goBackTo(screen.backScreen ?? { name: 'folder', folderId: screen.folderId })}
        onImport={(titleOverride, jsonText, stayOnScreen) => handleImportProblemSet(screen.folderId, titleOverride, jsonText, stayOnScreen)}
        onImportComplete={() => replaceScreen({ name: 'folder', folderId: screen.folderId })}
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
        onSaveDetailedExplanation={handleSaveDetailedExplanation}
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
        onSaveDetailedExplanation={handleSaveDetailedExplanation}
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
        onSaveDetailedExplanation={handleSaveDetailedExplanation}
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
  } else if (screen.name === 'sync') {
    content = <SyncScreen onBack={goHome} />;
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
      onOpenSync={() => navigate({ name: 'sync' })}
    />
  );
  }

  return (
    <>
      <AutoSyncController />
      <div key={getScreenKey(screen)} className={`quiz-screen-transition quiz-screen-transition--${transitionDirection}`}>
        {content}
      </div>
      <ConfirmDialog
        open={pendingBackupImport !== null}
        title={'バックアップを読み込みますか？'}
        message={pendingBackupImport ? getBackupImportMessage(pendingBackupImport) : ''}
        confirmLabel={backupImportBusy ? '読み込み中…' : '読み込む'}
        busy={backupImportBusy}
        onCancel={cancelImportBackup}
        onConfirm={() => void confirmImportBackup()}
      />
      <ConfirmDialog
        open={pendingExitTarget !== null}
        title="演習を終了しますか？"
        message={'途中の演習を終了して前の画面へ戻ります。\n詳細解説に未保存の入力がある場合、その入力も破棄されます。'}
        confirmLabel="終了する"
        onCancel={cancelExitSession}
        onConfirm={confirmExitSession}
      />
      {(backupImportError || storageError || waitingWorker) ? (
        <div className="quiz-toast-stack">
          {backupImportError ? (
            <div className="quiz-update-toast" role="alert">
              <span>{backupImportError}</span>
              <button type="button" onClick={() => setBackupImportError('')}>閉じる</button>
            </div>
          ) : null}
          {storageError ? (
            <div className="quiz-update-toast" role="alert">
              <span>{storageError}</span>
              <button type="button" onClick={() => setStorageError('')}>閉じる</button>
            </div>
          ) : null}
          {waitingWorker ? (
            <div className="quiz-update-toast" role="status" aria-live="polite">
              <span>新しいバージョンがあります</span>
              <button type="button" onClick={() => void handleApplyUpdate()}>更新する</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function getBackupImportMessage(target: PendingBackupImport) {
  if (target.kind === 'legacy') {
    return '旧形式のバックアップJSONを読み込みます。\n現在の問題データ、進捗、Levelは上書きされます。\nノートはこの旧形式には含まれていません。';
  }

  return `ノート込みのバックアップJSONを読み込みます。\n現在の問題データ、進捗、Level、ノートは上書きされます。\n\n内容: ${formatBackupImportSummary(target.summary)}`;
}

function formatBackupImportSummary(summary: SyncPayloadSummary) {
  return `フォルダ${summary.folderCount} / セット${summary.problemSetCount} / 問題${summary.questionCount} / 進捗${summary.progressCount} / ノート${summary.noteCount}`;
}

function isQuizInProgressScreen(screen: AppScreen) {
  return screen.name === 'quiz' || screen.name === 'quizSession' || screen.name === 'review';
}

function makeUniqueProblemSetTitle(data: AppData, folderId: string, rawTitle: string) {
  const baseTitle = rawTitle.trim() || '無題の問題セット';
  const existingTitles = new Set(
    data.problemSets
      .filter((set) => set.folderId === folderId)
      .map((set) => set.title.trim()),
  );

  if (!existingTitles.has(baseTitle)) return baseTitle;

  let count = 2;
  let nextTitle = `${baseTitle} (${count})`;
  while (existingTitles.has(nextTitle)) {
    count += 1;
    nextTitle = `${baseTitle} (${count})`;
  }
  return nextTitle;
}

