import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const extensionHook = registerHooks({
  resolve(specifier, context, nextResolve) {
    const extensionlessRelativeImport = /^\.\.?\//u.test(specifier)
      && !/\.[cm]?[jt]sx?$/u.test(specifier)
      && context.parentURL?.endsWith('.ts');
    return nextResolve(extensionlessRelativeImport ? `${specifier}.ts` : specifier, context);
  },
});

const { buildGroupProblemSetFolders } = await import('../src/utils/groupDataView.ts');
extensionHook.deregister();

test('group problem sets become stable home-like folders by subject', () => {
  const problemSets = [
    { id: 'english-1', title: '英単語', subject: '英語' },
    { id: 'math-1', title: '微分', subject: ' 数学 ' },
    { id: 'english-2', title: '英文法', subject: '英語' },
    { id: 'other-1', title: '一般常識', subject: '' },
  ];

  const folders = buildGroupProblemSetFolders(problemSets);

  assert.deepEqual(folders.map((folder) => ({
    name: folder.name,
    ids: folder.problemSets.map((problemSet) => problemSet.id),
  })), [
    { name: '英語', ids: ['english-1', 'english-2'] },
    { name: '数学', ids: ['math-1'] },
    { name: '未分類', ids: ['other-1'] },
  ]);
  assert.equal(problemSets[1].subject, ' 数学 ');
});
