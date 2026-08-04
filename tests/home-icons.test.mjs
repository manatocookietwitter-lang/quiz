import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const homeSource = readSource('../src/screens/HomeScreen.tsx');
const folderSource = readSource('../src/screens/FolderScreen.tsx');
const manifestSource = readSource('../public/manifest.webmanifest');
const iconSource = readSource('../public/icons/quiz-make-icon.svg');

test('home and folder navigation use outline icons while retaining learning counts', () => {
  assert.match(homeSource, /FolderOutlineIcon/);
  assert.match(homeSource, /QuizMakeMarkIcon/);
  assert.match(homeSource, /セット \{setCount\}/);
  assert.match(homeSource, /問題 \{questionCount\}/);
  assert.match(homeSource, /復習 \{reviewCount\}/);
  assert.match(homeSource, /正答 \{correctRate\}%/);
  assert.doesNotMatch(homeSource, /quiz-home__folder-tab/);

  assert.match(folderSource, /DocumentOutlineIcon/);
  assert.match(folderSource, /問題 \{questionCount\}/);
  assert.match(folderSource, /復習 \{reviewCount\}/);
  assert.match(folderSource, /正答 \{correctRate\}%/);
  assert.doesNotMatch(folderSource, /🏷|🔖|✅/);
});

test('PWA icon manifest points to the light QuizMake mark', () => {
  assert.match(manifestSource, /"theme_color": "#f1f7fa"/);
  assert.match(manifestSource, /"background_color": "#ffffff"/);
  assert.match(iconSource, /#1769ff/);
  assert.match(iconSource, /<circle/);
  for (const file of ['icon-192.png', 'icon-512.png', 'maskable-512.png']) {
    const path = new URL(`../public/icons/${file}`, import.meta.url);
    assert.ok(existsSync(path), `${file} should exist`);
    assert.ok(statSync(path).size > 1000, `${file} should contain the generated icon`);
  }
});
