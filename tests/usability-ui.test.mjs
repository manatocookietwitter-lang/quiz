import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const homeSource = readSource('../src/screens/HomeScreen.tsx');
const settingsSource = readSource('../src/screens/SettingsScreen.tsx');
const syncSource = readSource('../src/screens/SyncScreen.tsx');
const globalCss = readSource('../src/index.css');
const layoutSource = readSource('../src/components/Layout.tsx');
const createCss = readSource('../src/screens/CreateProblemSetScreen.css');

test('template actions explain what is copied and what to do next', () => {
  assert.match(settingsSource, /ChatGPTで問題を作る/);
  assert.match(settingsSource, /用途を選んで指示文をコピーし、ChatGPTの入力欄へ貼り付け/);
  assert.match(settingsSource, /資料から問題を作る/);
  assert.match(settingsSource, /過去問をまとめる/);
  assert.match(settingsSource, /コピーしました。次にChatGPTを開き/);
  assert.doesNotMatch(homeSource, /ChatGPTで問題を作る|quiz-home__menu-button/);
});

test('shared layout scrolls long screens and create actions stay above the primary navigation', () => {
  assert.match(layoutSource, /overflow-y-auto/);
  assert.doesNotMatch(layoutSource, /flex-col overflow-hidden/);
  assert.match(createCss, /bottom:\s*calc\(var\(--primary-nav-height\)/);
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
  assert.match(individualCardCss, /border:\s*1px solid var\(--ui-border\)/);
  assert.match(individualCardCss, /border-radius:\s*18px/);
  assert.match(individualCardCss, /margin-bottom:\s*10px/);
});
