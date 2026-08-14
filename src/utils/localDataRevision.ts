export type LocalDataRevision = number;

let currentRevision: LocalDataRevision = 0;
const associatedRevisions = new WeakMap<object, LocalDataRevision>();

/**
 * Returns the revision of the latest successfully persisted app data or note
 * mutation in this JavaScript context.
 */
export function getLocalDataRevision(): LocalDataRevision {
  return currentRevision;
}

/**
 * Advances the revision only after a persistence operation has completed.
 */
export function advanceLocalDataRevision(): LocalDataRevision {
  currentRevision += 1;
  return currentRevision;
}

/**
 * Associates an in-memory snapshot with an exported object without changing
 * its public JSON shape.
 */
export function associateLocalDataRevision<T extends object>(
  value: T,
  revision: LocalDataRevision = getLocalDataRevision(),
): T {
  associatedRevisions.set(value, revision);
  return value;
}

export function getAssociatedLocalDataRevision(value: object): LocalDataRevision | undefined {
  return associatedRevisions.get(value);
}

export function isLocalDataRevisionCurrent(revision: LocalDataRevision): boolean {
  return revision === currentRevision;
}
