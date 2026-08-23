import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasUncommittedManualQuestion,
  inspectPendingManualQuestion,
  resolvePendingQuestionSave,
} from '../src/screens/createProblemSetSave.ts';
import { getDraftIssues } from '../src/utils/bulkQuestionParser.ts';

const screenSource = readFileSync(new URL('../src/screens/CreateProblemSetScreen.tsx', import.meta.url), 'utf8');

function createDraft(overrides = {}) {
  return {
    id: 'manual-1',
    question: '日本の首都はどこですか。',
    choices: ['大阪', '東京', '京都', '名古屋'],
    answerIndex: 1,
    answerIndexes: [1],
    explanation: '東京です。',
    detailedExplanation: '',
    category: '地理',
    sourcePage: '',
    issues: [],
    ...overrides,
  };
}

test('blank and unchanged editors do not interrupt saving', () => {
  const saved = createDraft();
  const blank = createDraft({
    id: 'manual-editor',
    question: '',
    choices: ['', '', '', ''],
    answerIndex: null,
    answerIndexes: [],
    explanation: '',
    category: '',
  });

  assert.equal(inspectPendingManualQuestion([saved], blank, null, getDraftIssues), null);
  assert.equal(hasUncommittedManualQuestion([saved], { ...saved, choices: [...saved.choices] }, 0), false);
});

test('a valid uncommitted question is appended only when include is chosen', () => {
  const saved = createDraft({ id: 'manual-2' });
  const editor = createDraft({
    id: 'manual-editor',
    question: '2 + 2 はいくつですか。',
    choices: ['2', '3', '4', '5'],
    answerIndex: 2,
    answerIndexes: [2],
  });
  const pending = inspectPendingManualQuestion([saved], editor, null, getDraftIssues);
  assert.ok(pending);
  assert.deepEqual(pending.issues, []);

  const included = resolvePendingQuestionSave([saved], pending, 'include');
  assert.equal(included.status, 'save');
  if (included.status === 'save') {
    assert.equal(included.includedPendingQuestion, true);
    assert.equal(included.drafts.length, 2);
    assert.equal(included.drafts[1].question, editor.question);
    assert.equal(included.drafts[1].id, 'manual-3');
  }

  const discarded = resolvePendingQuestionSave([saved], pending, 'discard');
  assert.equal(discarded.status, 'save');
  if (discarded.status === 'save') {
    assert.equal(discarded.includedPendingQuestion, false);
    assert.deepEqual(discarded.drafts, [saved]);
  }

  const cancelled = resolvePendingQuestionSave([saved], pending, 'cancel');
  assert.equal(cancelled.status, 'cancel');
  assert.deepEqual(cancelled.drafts, [saved]);
  assert.equal(saved.question, '日本の首都はどこですか。');
});

test('an incomplete editor reports missing fields and cannot be included', () => {
  const saved = createDraft();
  const editor = createDraft({
    id: 'manual-editor',
    question: '未完成の問題',
    choices: ['選択肢1', '', '', ''],
    answerIndex: null,
    answerIndexes: [],
  });
  const pending = inspectPendingManualQuestion([saved], editor, null, getDraftIssues);
  assert.ok(pending);
  assert.ok(pending.issues.some((issue) => issue.includes('空の選択肢')));
  assert.ok(pending.issues.some((issue) => issue.includes('正解')));

  const resolution = resolvePendingQuestionSave([saved], pending, 'include');
  assert.equal(resolution.status, 'invalid');
  if (resolution.status === 'invalid') assert.deepEqual(resolution.issues, pending.issues);
});

test('including an edited question replaces it without changing its identity or count', () => {
  const first = createDraft({ id: 'question-a' });
  const second = createDraft({ id: 'question-b', question: '変更前の問題' });
  const editor = { ...second, question: '変更後の問題', choices: [...second.choices] };
  const pending = inspectPendingManualQuestion([first, second], editor, 1, getDraftIssues);
  assert.ok(pending);

  const resolution = resolvePendingQuestionSave([first, second], pending, 'include');
  assert.equal(resolution.status, 'save');
  if (resolution.status === 'save') {
    assert.equal(resolution.drafts.length, 2);
    assert.equal(resolution.drafts[1].id, 'question-b');
    assert.equal(resolution.drafts[1].question, '変更後の問題');
  }
});

test('save dialog exposes three explicit choices and safe dismissal behavior', () => {
  assert.match(screenSource, /追加して保存/);
  assert.match(screenSource, /入力を破棄して保存/);
  assert.match(screenSource, />\s*キャンセル\s*</);
  assert.match(screenSource, /不足している項目/);
  assert.match(screenSource, /role="dialog"/);
  assert.match(screenSource, /aria-modal="true"/);
  assert.match(screenSource, /event\.key === 'Escape'/);
  assert.match(screenSource, /onClick=\{\(event\) => \{[\s\S]*?event\.target === event\.currentTarget\) onDecision\('cancel'\)/);
  assert.match(screenSource, /if \(saveInFlightRef\.current\) return/);
  assert.match(screenSource, /saveInFlightRef\.current = true/);
});

test('legacy import receives an existing folder or a trimmed pending folder name', () => {
  assert.match(screenSource, /const newFolderName = meta\.newFolderName\.trim\(\)/);
  assert.match(screenSource, /onOpenLegacyImport\(\{[\s\S]*?folderId: meta\.folderId,[\s\S]*?newFolderName: meta\.folderId \? '' : newFolderName/);
  assert.match(screenSource, /if \(!meta\.folderId && !newFolderName\)/);
});
