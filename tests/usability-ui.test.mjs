import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const homeSource = readSource('../src/screens/HomeScreen.tsx');
const syncSource = readSource('../src/screens/SyncScreen.tsx');
const globalCss = readSource('../src/index.css');

test('template actions explain what is copied and what to do next', () => {
  assert.match(homeSource, /ChatGPTで問題を作る/);
  assert.match(homeSource, /指示文をコピーしたあと、ChatGPTの入力欄に貼り付け/);
  assert.match(homeSource, /資料から問題を作る/);
  assert.match(homeSource, /過去問をまとめる/);
  assert.match(homeSource, /コピーしました。次にChatGPTを開き/);
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
