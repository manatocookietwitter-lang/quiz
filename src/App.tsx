import { useEffect, useMemo, useState } from 'react';
import type { AppData, AppScreen, ProblemSet, Question, QuizMode, QuizResult } from './types';
import { createEmptyAppData, loadAppData, parseBackupJson, saveAppData } from './storage';
import { HomeScreen } from './screens/HomeScreen';
import { FolderScreen } from './screens/FolderScreen';
import { ImportScreen } from './screens/ImportScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ResultScreen } from './screens/ResultScreen';
import { createId } from './utils/id';
import { formatBackupDate, nowIso } from './utils/date';
import {
  addFolder,
  calculateStats,
  deleteFolder,
  deleteProblemSet,
  recordAnswer,
  toggleAmbiguous,
} from './utils/quiz';
import { validateImportJson } from './utils/importValidator';

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData());
  const [screen, setScreen] = useState<AppScreen>({ name: 'home' });

  useEffect(() => {
    saveAppData(data);
  }, [data]);

  const stats = useMemo(() => calculateStats(data), [data]);

  const goHome = () => setScreen({ name: 'home' });

  const handleCreateFolder = (name: string) => {
    setData((current) => addFolder(current, name));
  };

  const handleDeleteFolder = (folderId: string) => {
    setData((current) => deleteFolder(current, folderId));
    setScreen({ name: 'home' });
  };

  const handleDeleteProblemSet = (setId: string) => {
    setData((current) => deleteProblemSet(current, setId));
  };

  const handleImportProblemSet = (folderId: string, titleOverride: string, jsonText: string): string | null => {
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
      answerIndex: question.answerIndex,
      answerText: question.answerText ?? question.choices[question.answerIndex],
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
        lastAnsweredAt: null,
        isReview: false,
        isAmbiguous: false,
        reviewLevel: null,
        isGraduated: false,
      }))],
    }));
    setScreen({ name: 'folder', folderId });
    return null;
  };

  const handleAnswer = (question: Question, selectedIndex: number, isReviewMode: boolean) => {
    const answerResult = recordAnswer(data, question, selectedIndex, isReviewMode);
    setData(answerResult.data);
    return { isCorrect: answerResult.isCorrect, addedToReview: answerResult.addedToReview };
  };

  const handleToggleAmbiguous = (questionId: string) => {
    setData((current) => toggleAmbiguous(current, questionId));
  };

  const handleClearAll = () => {
    setData(createEmptyAppData());
    setScreen({ name: 'home' });
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

  const handleImportBackup = async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
      const result = parseBackupJson(text);
      if (!result.ok) return result.error;
      const ok = window.confirm('現在のデータをすべて上書きします。バックアップJSONをインポートしますか？');
      if (!ok) return null;
      setData(result.data);
      setScreen({ name: 'home' });
      return null;
    } catch (error) {
      return error instanceof Error ? `読み込みに失敗しました: ${error.message}` : '読み込みに失敗しました。';
    }
  };

  const handleStartQuiz = (setId: string, mode: QuizMode) => {
    setScreen({ name: 'quiz', setId, mode });
  };

  const handleFinish = (result: QuizResult) => {
    setScreen({ name: 'result', result });
  };

  const handleRetry = (result: QuizResult) => {
    if (result.mode === 'review') {
      setScreen({ name: 'review' });
      return;
    }
    if (result.setId) {
      setScreen({ name: 'quiz', setId: result.setId, mode: 'ordered' });
      return;
    }
    setScreen({ name: 'home' });
  };

  if (screen.name === 'folder') {
    return (
      <FolderScreen
        data={data}
        folderId={screen.folderId}
        onBack={goHome}
        onOpenImport={(folderId) => setScreen({ name: 'import', folderId })}
        onStartQuiz={handleStartQuiz}
        onDeleteProblemSet={handleDeleteProblemSet}
      />
    );
  }

  if (screen.name === 'import') {
    const folder = data.folders.find((item) => item.id === screen.folderId);
    return (
      <ImportScreen
        folderName={folder?.name ?? 'フォルダ'}
        onBack={() => setScreen({ name: 'folder', folderId: screen.folderId })}
        onImport={(titleOverride, jsonText) => handleImportProblemSet(screen.folderId, titleOverride, jsonText)}
      />
    );
  }

  if (screen.name === 'quiz') {
    const problemSet = data.problemSets.find((set) => set.id === screen.setId);
    return (
      <QuizScreen
        key={`${screen.setId}_${screen.mode}`}
        data={data}
        setId={screen.setId}
        mode={screen.mode}
        onBack={() => setScreen({ name: 'folder', folderId: problemSet?.folderId ?? '' })}
        onAnswer={handleAnswer}
        onToggleAmbiguous={handleToggleAmbiguous}
        onFinish={handleFinish}
      />
    );
  }

  if (screen.name === 'review') {
    return (
      <ReviewScreen
        key="review"
        data={data}
        onBack={goHome}
        onAnswer={handleAnswer}
        onToggleAmbiguous={handleToggleAmbiguous}
        onFinish={handleFinish}
      />
    );
  }

  if (screen.name === 'result') {
    return (
      <ResultScreen
        result={screen.result}
        onHome={goHome}
        onRetry={() => handleRetry(screen.result)}
      />
    );
  }

  return (
    <HomeScreen
      data={data}
      stats={stats}
      onCreateFolder={handleCreateFolder}
      onDeleteFolder={handleDeleteFolder}
      onOpenFolder={(folderId) => setScreen({ name: 'folder', folderId })}
      onStartReview={() => setScreen({ name: 'review' })}
      onExport={handleExport}
      onImportBackup={handleImportBackup}
      onClearAll={handleClearAll}
    />
  );
}
