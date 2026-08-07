import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const layoutSource = readSource('../src/components/Layout.tsx');
const headerSource = readSource('../src/components/Header.tsx');
const detailSource = readSource('../src/screens/ProblemSetDetailScreen.tsx');
const appSource = readSource('../src/App.tsx');
const globalCss = readSource('../src/index.css');

test('shared layout and loading state use the light application palette', () => {
  assert.doesNotMatch(layoutSource, /bg-\[#050505\]|text-white/);
  assert.match(layoutSource, /bg-\[#F1F7FA\]/);
  assert.match(layoutSource, /text-\[#173042\]/);
  assert.doesNotMatch(appSource, /background:\s*'#000'/);
  assert.match(appSource, /background:\s*'#f1f7fa'/);
});

test('set-scoped review UI and its shared header use restrained light surfaces', () => {
  assert.doesNotMatch(headerSource, /bg-\[#202020\]|bg-\[#2B2B2B\]|text-white/);
  assert.match(headerSource, /bg-white/);
  assert.doesNotMatch(headerSource, /bg-gradient|skew/);
  assert.match(detailSource, /この問題セットを復習/);
  assert.match(detailSource, /mode: 'review'/);
});

test('quiz exit confirmation uses the light surface palette', () => {
  const exitDialogCss = globalCss.slice(
    globalCss.indexOf('.quiz-exit-confirm {'),
    globalCss.indexOf('.quiz-runner__answer-actions--spacer'),
  );

  assert.notEqual(exitDialogCss.length, 0);
  assert.doesNotMatch(exitDialogCss, /background:\s*#202020|background:\s*#2b2b2b/);
  assert.match(exitDialogCss, /background:\s*#ffffff/);
  assert.match(exitDialogCss, /color:\s*#173042/);
});
