import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getNoteSaveErrorMessage,
  NoteLoadError,
  runAfterSuccessfulNoteFlush,
  shouldSnapshotNoteOnExit,
  waitForNoteSave,
} from '../src/components/noteExitGuard.ts';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const noteListSource = readSource('../src/screens/NoteListScreen.tsx');
const notePanelSource = readSource('../src/components/CategoryNoteDrawer.tsx');
const quizRunnerSource = readSource('../src/screens/QuizRunner.tsx');

test('every note list exit waits for the active panel flush', () => {
  assert.match(noteListSource, /const requestNoteTransition = useCallback[\s\S]*?notePanelRef\.current\?\.flush\(\)[\s\S]*?proceed/);
  assert.match(noteListSource, /onClick=\{\(\) => void requestNoteTransition\(onBack\)\}/);
  assert.match(noteListSource, /requestNoteTransition\(\(\) => setSelectedCategory\(category\)\)/);
  assert.match(noteListSource, /requestNoteTransition\(\(\) => setSelectedCategory\(noteCategories\[0\]/);
  assert.match(noteListSource, /onClose=\{\(\) => void requestNoteTransition\(onBack\)\}/);
  assert.match(noteListSource, /if \(nextLandscape\)[\s\S]*?requestNoteTransition\(\(\) => \{[\s\S]*?setIsTabletLandscape\(false\)/);
  assert.match(noteListSource, /noteTransitionQueueRef\.current\.then\(execute, execute\)/);
  assert.match(noteListSource, /quiz-notes__transition-error" role="alert"/);
  assert.doesNotMatch(noteListSource, /onClick=\{\(\) => setSelectedCategory\(category\)\}/);
});

test('drawer close button and swipe share the guarded close request', () => {
  assert.match(notePanelSource, /const enqueuePanelTransition[\s\S]*?panelRef\.current\?\.flush\(\)[\s\S]*?drawerTransitionQueueRef\.current\.then\(execute, execute\)/);
  assert.match(notePanelSource, /const requestClose = \(\): Promise<boolean> => \{[\s\S]*?enqueuePanelTransition\(\(\) => \{[\s\S]*?setOpen\(false\)/);
  assert.match(notePanelSource, /flush: async \(\) => \{\s*await drawerTransitionQueueRef\.current;[\s\S]*?panelRef\.current\?\.flush\(\)/);
  assert.match(notePanelSource, /if \(isOpen && delta > 90\) void requestClose\(\)/);
  assert.match(notePanelSource, /onClose=\{\(\) => void requestClose\(\)\}/);
  assert.match(notePanelSource, /onClick=\{onClose\}/);
  assert.match(notePanelSource, /problemSetId === panelProblemSetId && category === panelCategory[\s\S]*?enqueuePanelTransition[\s\S]*?setPanelCategory\(latestCategoryRef\.current\)/);
  assert.doesNotMatch(notePanelSource, /isOpen && delta > 90\) setOpen\(false\)/);
});

test('flush waits for load and snapshots only a paint-ready dirty canvas', () => {
  const flushStart = notePanelSource.indexOf('const flushPendingNote = (): Promise<void> => {');
  const flushEnd = notePanelSource.indexOf('useImperativeHandle(ref, () => ({ flush: flushPendingNote }))', flushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart, 'flush implementation should exist');
  const flushBody = notePanelSource.slice(flushStart, flushEnd);
  const loadIndex = flushBody.indexOf("noteLoadStateRef.current === 'loading'");
  const clearIndex = flushBody.indexOf('window.clearTimeout(pendingDrawSaveTimerRef.current)');
  const dirtyIndex = flushBody.indexOf('if (canvasDirtyRef.current)');
  const paintIndex = flushBody.indexOf("paintReady: notePaintStateRef.current === 'ready'");
  const snapshotIndex = flushBody.indexOf('updateCurrentPage()');
  const awaitIndex = flushBody.indexOf('await waitForNoteSave(noteSaveQueueRef.current)');
  assert.ok(loadIndex >= 0 && clearIndex > loadIndex && dirtyIndex > clearIndex);
  assert.ok(paintIndex > dirtyIndex && snapshotIndex > paintIndex && awaitIndex > snapshotIndex);
  assert.doesNotMatch(flushBody, /lastPointRef\.current = null;\s*updateCurrentPage\(\)/);
  assert.match(notePanelSource, /pendingDrawSaveTimerRef\.current = window\.setTimeout/);
  assert.match(notePanelSource, /canvasDirtyRef\.current = true/);
  assert.match(notePanelSource, /drawingRef\.current \|\| canvasDirtyRef\.current/);
  assert.match(notePanelSource, /await decodeNoteImage\(image\);[\s\S]*?context\.drawImage/);
  assert.match(notePanelSource, /function drawDataUrlToCanvas[\s\S]*?notePaintStateRef\.current = 'loading'[\s\S]*?drawDataUrlToContext[\s\S]*?renderedPageIdRef\.current = targetPageId[\s\S]*?notePaintStateRef\.current = 'ready'/);
  assert.match(notePanelSource, /const redrawCanvasFromCurrentImage = \(\) => \{\s*drawDataUrlToCanvas\(pageDataUrlRef\.current\)/);
  assert.match(notePanelSource, /const animatePageCommit[\s\S]*?persistNote\(nextNote\);[\s\S]*?rail\.addEventListener\('transitionend'/);
  assert.match(notePanelSource, /noteLoadStateRef\.current !== 'ready'[\s\S]*?notePaintStateRef\.current !== 'ready'/);
  assert.match(flushBody, /failurePhase === 'load'[\s\S]*?noteLoadStateRef\.current = 'error'/);
  assert.match(flushBody, /failurePhase === 'paint'[\s\S]*?notePaintStateRef\.current = 'error'/);
  assert.doesNotMatch(notePanelSource, /const fallback = createEmptyNote[\s\S]*?setNote\(fallback\)/);
  assert.match(notePanelSource, /role="alert"/);
});

test('quiz navigation and rotation preserve the mounted drawer until its flush succeeds', () => {
  assert.match(quizRunnerSource, /const requestNoteTransition = useCallback[\s\S]*?noteDrawerRef\.current\?\.flush\(\)[\s\S]*?proceed/);
  assert.match(quizRunnerSource, /const handleQuizBack = useCallback[\s\S]*?requestNoteTransition\(onBack\)/);
  assert.match(quizRunnerSource, /const handleNext = \(\) => \{[\s\S]*?requestNoteTransition\(\(\) => \{[\s\S]*?setCurrentIndex/);
  assert.match(quizRunnerSource, /if \(!noteFeatureEnabled && noteOpen\)[\s\S]*?drawer\.close\(\)/);
  assert.match(quizRunnerSource, /\{noteFeatureAvailable && noteDrawerMounted && setId \? \([\s\S]*?<CategoryNoteDrawer[\s\S]*?ref=\{noteDrawerRef\}/);
  assert.match(quizRunnerSource, /if \(noteFeatureEnabled\) setNoteDrawerMounted\(true\)/);
  assert.match(quizRunnerSource, /noteTransitionError[\s\S]*?role="alert"/);
  assert.doesNotMatch(quizRunnerSource, /\{noteFeatureEnabled && setId \? \([\s\S]*?<CategoryNoteDrawer/);
});

test('failed persistence blocks the requested transition', async () => {
  let proceeded = false;
  const completed = await runAfterSuccessfulNoteFlush(
    () => Promise.reject(new Error('write failed')),
    () => { proceeded = true; },
  );

  assert.equal(completed, false);
  assert.equal(proceeded, false);
  assert.equal(getNoteSaveErrorMessage(new Error('write failed')), 'ノートを保存できませんでした。もう一度お試しください。');
  assert.equal(getNoteSaveErrorMessage(new NoteLoadError()), 'ノートを読み込めませんでした。もう一度お試しください。');
});

test('an unedited, unloaded, or not-yet-decoded canvas is never snapshotted', () => {
  const ready = { loadReady: true, paintReady: true, renderedNoteMatches: true, renderedPageMatches: true };
  assert.equal(shouldSnapshotNoteOnExit({ ...ready, dirty: false }), false);
  assert.equal(shouldSnapshotNoteOnExit({ ...ready, dirty: true, loadReady: false }), false);
  assert.equal(shouldSnapshotNoteOnExit({ ...ready, dirty: true, paintReady: false }), false);
  assert.equal(shouldSnapshotNoteOnExit({ ...ready, dirty: true, renderedNoteMatches: false }), false);
  assert.equal(shouldSnapshotNoteOnExit({ ...ready, dirty: true, renderedPageMatches: false }), false);
  assert.equal(shouldSnapshotNoteOnExit({ ...ready, dirty: true }), true);
});

test('a timeout keeps the transition blocked and a later retry can succeed', async () => {
  let proceeded = 0;
  const neverSettles = new Promise(() => {});
  const timedOut = await runAfterSuccessfulNoteFlush(
    () => waitForNoteSave(neverSettles, 5),
    () => { proceeded += 1; },
  );

  assert.equal(timedOut, false);
  assert.equal(proceeded, 0);

  let timeoutError;
  try {
    await waitForNoteSave(neverSettles, 5);
  } catch (error) {
    timeoutError = error;
  }
  assert.equal(getNoteSaveErrorMessage(timeoutError), '保存に時間がかかっています。もう一度お試しください。');

  const retried = await runAfterSuccessfulNoteFlush(
    () => waitForNoteSave(Promise.resolve(), 5),
    () => { proceeded += 1; },
  );
  assert.equal(retried, true);
  assert.equal(proceeded, 1);
});
