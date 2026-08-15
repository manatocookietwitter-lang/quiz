export const NOTE_EXIT_TIMEOUT_MS = 6_000;

export class NoteExitTimeoutError extends Error {
  constructor() {
    super('Timed out while saving the note.');
    this.name = 'NoteExitTimeoutError';
  }
}

export class NoteLoadError extends Error {
  constructor() {
    super('Failed to load the note.');
    this.name = 'NoteLoadError';
  }
}

export async function waitForNoteSave(
  pendingSave: Promise<void>,
  timeoutMs = NOTE_EXIT_TIMEOUT_MS,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new NoteExitTimeoutError()), timeoutMs);
  });

  try {
    await Promise.race([pendingSave, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function runAfterSuccessfulNoteFlush(
  flush: () => Promise<void>,
  proceed: () => void,
): Promise<boolean> {
  try {
    await flush();
  } catch {
    return false;
  }
  proceed();
  return true;
}

export function shouldSnapshotNoteOnExit(input: {
  dirty: boolean;
  loadReady: boolean;
  paintReady: boolean;
  renderedNoteMatches: boolean;
  renderedPageMatches: boolean;
}): boolean {
  return input.dirty
    && input.loadReady
    && input.paintReady
    && input.renderedNoteMatches
    && input.renderedPageMatches;
}

export function getNoteSaveErrorMessage(error: unknown): string {
  if (error instanceof NoteLoadError) {
    return 'ノートを読み込めませんでした。もう一度お試しください。';
  }
  if (error instanceof NoteExitTimeoutError) {
    return '保存に時間がかかっています。もう一度お試しください。';
  }
  if (error instanceof Error && error.message.includes('保存容量')) return error.message;
  return 'ノートを保存できませんでした。もう一度お試しください。';
}
