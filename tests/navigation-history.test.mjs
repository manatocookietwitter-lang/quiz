import assert from 'node:assert/strict';
import test from 'node:test';
import { getBackNavigationSteps, getCreateProblemSetBackScreen } from '../src/utils/navigation.ts';

test('jumping home unwinds every pushed screen instead of leaving dead history entries', () => {
  const stack = [
    { name: 'home' },
    { name: 'folder', folderId: 'folder-1' },
    { name: 'problemSetDetail', setId: 'set-1' },
    {
      name: 'quizSession',
      session: {
        title: 'Quiz',
        questions: [],
        mode: 'quiz',
        backScreen: { name: 'problemSetDetail', setId: 'set-1' },
      },
    },
    {
      name: 'result',
      result: {
        mode: 'quiz',
        title: 'Quiz',
        answered: 1,
        correct: 1,
        wrong: 0,
        addedReviewCount: 0,
      },
    },
  ];

  assert.equal(getBackNavigationSteps(stack, { name: 'home' }), 4);
  assert.equal(getBackNavigationSteps(stack, { name: 'problemSetDetail', setId: 'set-1' }), 2);
});

test('unknown back targets use a single browser-history step', () => {
  assert.equal(
    getBackNavigationSteps([{ name: 'home' }, { name: 'sync' }], { name: 'folder', folderId: 'missing' }),
    1,
  );
});

test('problem-set creation returns to the screen that opened it', () => {
  assert.deepEqual(
    getCreateProblemSetBackScreen({
      name: 'createProblemSet',
      folderId: 'folder-1',
      backScreen: { name: 'settings' },
    }),
    { name: 'settings' },
  );
  assert.deepEqual(
    getCreateProblemSetBackScreen({ name: 'createProblemSet', folderId: 'folder-1' }),
    { name: 'folder', folderId: 'folder-1' },
  );
  assert.deepEqual(
    getCreateProblemSetBackScreen({ name: 'createProblemSet', editSetId: 'set-1' }),
    { name: 'problemSetDetail', setId: 'set-1' },
  );
  assert.deepEqual(
    getCreateProblemSetBackScreen({ name: 'createProblemSet' }),
    null,
  );
});
