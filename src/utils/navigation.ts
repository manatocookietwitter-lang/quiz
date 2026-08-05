import type { AppScreen } from '../types';

export function getScreenKey(screen: AppScreen): string {
  if (screen.name === 'folder') return `folder-${screen.folderId}`;
  if (screen.name === 'community') return `community-${screen.tab ?? 'mine'}-${screen.shareSetId ?? ''}`;
  if (screen.name === 'problemSetDetail') return `detail-${screen.setId}`;
  if (screen.name === 'problemList') return `problem-list-${screen.setId}-${screen.sortMode ?? 'ordered'}`;
  if (screen.name === 'noteList') return `note-list-${screen.setId}`;
  if (screen.name === 'import') return `import-${screen.folderId}`;
  if (screen.name === 'quiz') return `quiz-${screen.setId}-${screen.mode}`;
  if (screen.name === 'quizSession') return `quiz-session-${screen.session.setId ?? 'custom'}-${screen.session.initialIndex ?? 0}-${screen.session.questions.length}`;
  if (screen.name === 'result') return `result-${screen.result.title}-${screen.result.answered}`;
  return screen.name;
}

export function getBackNavigationSteps(stack: AppScreen[], target: AppScreen): number {
  const targetKey = getScreenKey(target);
  for (let index = stack.length - 2; index >= 0; index -= 1) {
    if (getScreenKey(stack[index]) === targetKey) {
      return Math.max(1, stack.length - 1 - index);
    }
  }
  return 1;
}
