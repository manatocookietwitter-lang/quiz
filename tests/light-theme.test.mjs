import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const layoutSource = readSource('../src/components/Layout.tsx');
const headerSource = readSource('../src/components/Header.tsx');
const reviewSource = readSource('../src/screens/ReviewScreen.tsx');
const appSource = readSource('../src/App.tsx');
const globalCss = readSource('../src/index.css');

test('shared layout and loading state use the light application palette', () => {
  assert.doesNotMatch(layoutSource, /bg-\[#050505\]|text-white/);
  assert.match(layoutSource, /bg-\[#F1F7FA\]/);
  assert.match(layoutSource, /text-\[#173042\]/);
  assert.doesNotMatch(appSource, /background:\s*'#000'/);
  assert.match(appSource, /background:\s*'#f1f7fa'/);
});

test('empty review UI and its shared header do not fall back to dark cards', () => {
  assert.doesNotMatch(headerSource, /bg-\[#202020\]|bg-\[#2B2B2B\]|text-white/);
  assert.match(headerSource, /from-white/);
  assert.doesNotMatch(reviewSource, /bg-neutral-900|ring-white|text-neutral-400/);
  assert.match(reviewSource, /bg-white/);
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
