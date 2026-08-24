import type { CloudProblemSet } from './cloudService';

export interface GroupProblemSetFolder {
  id: string;
  name: string;
  problemSets: CloudProblemSet[];
}

export function buildGroupProblemSetFolders(problemSets: CloudProblemSet[]): GroupProblemSetFolder[] {
  const folders = new Map<string, GroupProblemSetFolder>();

  for (const problemSet of problemSets) {
    const name = problemSet.subject.trim() || '未分類';
    const id = name.toLocaleLowerCase('ja-JP');
    const existing = folders.get(id);
    if (existing) {
      existing.problemSets.push(problemSet);
      continue;
    }
    folders.set(id, { id, name, problemSets: [problemSet] });
  }

  return [...folders.values()];
}
