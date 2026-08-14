import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const homeSource = readSource('../src/screens/HomeScreen.tsx');
const settingsSource = readSource('../src/screens/SettingsScreen.tsx');
const createSource = readSource('../src/screens/CreateProblemSetScreen.tsx');
const detailSource = readSource('../src/screens/ProblemSetDetailScreen.tsx');
const appSource = readSource('../src/App.tsx');
const typesSource = readSource('../src/types.ts');
const syncSource = readSource('../src/screens/SyncScreen.tsx');
const globalCss = readSource('../src/index.css');
const layoutSource = readSource('../src/components/Layout.tsx');
const createCss = readSource('../src/screens/CreateProblemSetScreen.css');

test('template actions explain what is copied and what to do next', () => {
  assert.doesNotMatch(settingsSource, /ChatGPTで問題を作る|資料から問題を作る|過去問をまとめる/);
  assert.match(createSource, /指示文をコピー/);
  assert.match(createSource, /資料から問題を作る/);
  assert.match(createSource, /過去問をまとめる/);
  assert.match(createSource, /ChatGPTで作成したら、下の入力欄へ結果を貼り付け/);
  assert.doesNotMatch(homeSource, /ChatGPTで問題を作る|quiz-home__menu-button/);
});

test('shared layout scrolls long screens and create actions stay above the primary navigation', () => {
  assert.match(layoutSource, /overflow-y-auto/);
  assert.doesNotMatch(layoutSource, /flex-col overflow-hidden/);
  assert.match(createCss, /bottom:\s*calc\(var\(--primary-nav-height\)/);
});

test('primary headers share one height and create returns to its launch context', () => {
  assert.match(globalCss, /\.quiz-home__header \{[\s\S]*?height:\s*calc\(72px \+ var\(--safe-top\)\)/);
  assert.match(createCss, /min-height:\s*calc\(72px \+ var\(--safe-top\)\)/);
  assert.match(globalCss, /--app-header-height:\s*72px/);
  assert.match(globalCss, /\.quiz-runner \.quiz-runner__header/);
  assert.match(createSource, /onBack \? <BackButton onClick=\{onBack\} label="前の画面へ戻る" \/> : null/);
  assert.match(appSource, /backScreen:\s*\{ name: 'folder', folderId \}/);
  assert.match(appSource, /backScreen:\s*\{ name: 'problemSetDetail', setId: screen\.setId \}/);
  assert.match(appSource, /onBack=\{createBackScreen \? \(\) => goBackTo\(createBackScreen\) : undefined\}/);
  assert.match(typesSource, /name: 'createProblemSet';[^{\n]*backScreen\?: AppScreen/);
});

test('review starts only from its problem set and the global review route is gone', () => {
  assert.doesNotMatch(homeSource, /onOpenReview|quiz-home__review-card/);
  assert.doesNotMatch(appSource, /name: 'review'/);
  assert.doesNotMatch(typesSource, /name: 'review'/);
  assert.match(detailSource, /この問題セットを復習/);
  assert.match(detailSource, /questions: allReviewQuestions/);
  assert.match(detailSource, /mode: 'review'/);
});

test('sync screen shows two primary steps and keeps maintenance options collapsed', () => {
  assert.match(syncSource, /同期IDを準備/);
  assert.match(syncSource, /データを同期/);
  assert.match(syncSource, /この端末をクラウドへ保存/);
  assert.match(syncSource, /クラウドからこの端末へ読込/);
  assert.match(syncSource, /<details className="sync-advanced">/);
  assert.doesNotMatch(syncSource, /Supabase設定済み|VITE_SUPABASE_URL/);
});

test('folder and problem-set rows are visually separated into individual cards', () => {
  const individualCardCss = globalCss.slice(globalCss.lastIndexOf('.quiz-home__folder-card,'));
  assert.match(globalCss, /\.quiz-home__folder-card,[\s\S]{0,260}border:\s*1px solid var\(--ui-border\)/);
  assert.match(individualCardCss, /border-radius:\s*12px/);
  assert.match(individualCardCss, /box-shadow:\s*none/);
});
