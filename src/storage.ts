import type { AppData } from './types';

const STORAGE_KEY = 'quiz-make-app-data-v1';

export function createEmptyAppData(): AppData {
  return {
    version: 1,
    folders: [],
    problemSets: [],
    questions: [],
    progress: [],
    answerLogs: [],
  };
}

export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyAppData();
    const parsed = JSON.parse(raw) as unknown;
    if (!isAppData(parsed)) return createEmptyAppData();
    return parsed;
  } catch (error) {
    console.error('Failed to load Quiz make data.', error);
    return createEmptyAppData();
  }
}

export function saveAppData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to save Quiz make data.', error);
    return false;
  }
}

export function isAppData(value: unknown): value is AppData {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    Array.isArray(value.folders) &&
    Array.isArray(value.problemSets) &&
    Array.isArray(value.questions) &&
    Array.isArray(value.progress) &&
    Array.isArray(value.answerLogs)
  );
}

export function parseBackupJson(text: string): { ok: true; data: AppData } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isAppData(parsed)) {
      return {
        ok: false,
        error: 'AppData形式ではありません。version, folders, problemSets, questions, progress, answerLogs を確認してください。',
      };
    }
    return { ok: true, data: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `JSONの解析に失敗しました: ${error.message}` : 'JSONの解析に失敗しました。' };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
