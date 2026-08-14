export type ProtectedWorkReason = 'backup' | 'create' | 'import' | 'quiz' | 'notes' | 'sync';

let activeProtectedWorkReason: ProtectedWorkReason | null = null;

export function setActiveProtectedWorkReason(reason: ProtectedWorkReason | null) {
  activeProtectedWorkReason = reason;
}

export function getActiveProtectedWorkReason() {
  return activeProtectedWorkReason;
}
