import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewTarget } from '../src/utils/reviewTargets.ts';

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
