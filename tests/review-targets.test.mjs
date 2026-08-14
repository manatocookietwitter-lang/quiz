import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { isReviewTarget } from '../src/utils/reviewTargets.ts';

const extensionHook = registerHooks({
  resolve(specifier, context, nextResolve) {
    const isExtensionlessRelativeImport = /^\.\.?\//u.test(specifier)
      && !/\.[cm]?[jt]sx?$/u.test(specifier)
      && context.parentURL?.endsWith('.ts');
    return nextResolve(isExtensionlessRelativeImport ? `${specifier}.ts` : specifier, context);
  },
});
const { recordAnswer } = await import('../src/utils/quiz.ts');
extensionHook.deregister();

const initialProgress = {
  questionId: 'question-1',
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
};

test('unanswered questions are not counted as review targets', () => {
  assert.equal(isReviewTarget(initialProgress), false);
});

test('wrong-answer and ambiguous targets remain in review', () => {
  assert.equal(isReviewTarget({
    ...initialProgress,
    answeredCount: 1,
    wrongCount: 1,
    isReview: true,
    reviewLevel: 1,
  }), true);

  assert.equal(isReviewTarget({
    ...initialProgress,
    isReview: true,
    isAmbiguous: true,
  }), true);
});

test('graduated questions are excluded from review', () => {
  assert.equal(isReviewTarget({
    ...initialProgress,
    answeredCount: 4,
    correctCount: 4,
    isReview: false,
    reviewLevel: 3,
    isGraduated: true,
  }), false);
});

const timestamp = '2026-08-15T00:00:00.000Z';
const multipleAnswerQuestion = {
  id: 'question-multiple',
  setId: 'set-1',
  question: 'Select both correct choices.',
  choices: ['first', 'second', 'third', 'fourth'],
  answerIndex: 0,
  answerIndexes: [0, 2],
  answerText: 'first, third',
  explanation: '',
  sourcePage: '',
  category: '',
  difficulty: 'standard',
  createdAt: timestamp,
  updatedAt: timestamp,
};

function createAnswerTestData() {
  return {
    version: 1,
    folders: [{ id: 'folder-1', name: 'Folder', createdAt: timestamp, updatedAt: timestamp }],
    problemSets: [{ id: 'set-1', folderId: 'folder-1', title: 'Set', source: '', createdAt: timestamp, updatedAt: timestamp }],
    questions: [multipleAnswerQuestion],
    progress: [],
    answerLogs: [],
  };
}

test('recordAnswer applies the same mutation id only once', () => {
  const first = recordAnswer(
    createAnswerTestData(),
    multipleAnswerQuestion,
    [2, 0],
    false,
    'answer-mutation-1',
  );
  const replay = recordAnswer(
    first.data,
    multipleAnswerQuestion,
    [1],
    false,
    'answer-mutation-1',
  );

  assert.equal(first.isCorrect, true);
  assert.strictEqual(replay.data, first.data);
  assert.equal(replay.isCorrect, true);
  assert.equal(replay.data.answerLogs.length, 1);
  assert.equal(replay.data.answerLogs[0].id, 'answer-mutation-1');
  assert.deepEqual(replay.progress, first.progress);
  assert.deepEqual(replay.progress, {
    ...initialProgress,
    questionId: multipleAnswerQuestion.id,
    answeredCount: 1,
    correctCount: 1,
    lastSelectedIndex: 2,
    lastAnswerCorrect: true,
    lastAnsweredAt: first.progress.lastAnsweredAt,
    isReview: true,
    reviewLevel: 2,
  });
});

test('recordAnswer applies different mutation ids independently', () => {
  const first = recordAnswer(
    createAnswerTestData(),
    multipleAnswerQuestion,
    [0, 2],
    false,
    'answer-mutation-1',
  );
  const second = recordAnswer(
    first.data,
    multipleAnswerQuestion,
    [0],
    false,
    'answer-mutation-2',
  );

  assert.equal(second.isCorrect, false);
  assert.deepEqual(second.data.answerLogs.map((log) => log.id), ['answer-mutation-1', 'answer-mutation-2']);
  assert.equal(second.progress.answeredCount, 2);
  assert.equal(second.progress.correctCount, 1);
  assert.equal(second.progress.wrongCount, 1);
  assert.equal(second.progress.reviewLevel, 1);
});
