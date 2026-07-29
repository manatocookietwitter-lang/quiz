import type { QuestionProgress } from '../types';

export function isReviewTarget(progress: QuestionProgress | undefined): boolean {
  return Boolean(
    progress
    && (progress.isReview || progress.isAmbiguous)
    && !progress.isGraduated,
  );
}
