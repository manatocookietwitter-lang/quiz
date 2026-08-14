import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const homeSource = readSource('../src/screens/HomeScreen.tsx');
const folderSource = readSource('../src/screens/FolderScreen.tsx');
const primaryNavSource = readSource('../src/components/PrimaryBottomNav.tsx');
const manifestSource = readSource('../public/manifest.webmanifest');
const iconSource = readSource('../public/icons/quiz-make-icon.svg');
const htmlSource = readSource('../index.html');
const workerSource = readSource('../public/sw.js');
const globalCss = readSource('../src/index.css');

test('home and folder navigation use outline icons while retaining learning counts', () => {
  assert.match(homeSource, /FolderOutlineIcon/);
  assert.doesNotMatch(homeSource, /QuizMakeMarkIcon|MenuIcon|quiz-home__menu-button/);
  assert.match(homeSource, /Quiz Make/);
  assert.doesNotMatch(homeSource, /MY LIBRARY/);
  assert.match(homeSource, /📁 \{setCount\}/);
  assert.match(homeSource, /🏷 \{questionCount\}/);
  assert.match(homeSource, /🔖 \{reviewCount\}/);
  assert.match(homeSource, /✅ \{correctRate\}%/);
  assert.match(globalCss, /\.quiz-home \.quiz-home__folder-stats \{[\s\S]*?font-size:\s*clamp\(15px, 2vw, 17px\)/);
  assert.doesNotMatch(homeSource, /quiz-home__folder-tab/);
  for (const icon of ['HomeIcon', 'SearchIcon', 'GroupIcon', 'AddSquareIcon', 'SettingsIcon']) {
    assert.match(primaryNavSource, new RegExp(icon));
  }

  assert.match(folderSource, /DocumentOutlineIcon/);
  assert.match(folderSource, /問題 \{questionCount\}/);
  assert.match(folderSource, /復習 \{reviewCount\}/);
  assert.match(folderSource, /正答 \{correctRate\}%/);
  assert.doesNotMatch(folderSource, /🏷|🔖|✅/);
});

test('PWA icon manifest points to the light QuizMake mark', () => {
  const iconRevision = '20260815-5';
  assert.match(manifestSource, /"theme_color": "#f1f7fa"/);
  assert.match(manifestSource, /"background_color": "#ffffff"/);
  assert.match(manifestSource, new RegExp(`icon-192\\.png\\?v=${iconRevision}`));
  assert.match(manifestSource, new RegExp(`icon-512\\.png\\?v=${iconRevision}`));
  assert.match(manifestSource, new RegExp(`maskable-512\\.png\\?v=${iconRevision}`));
  assert.match(htmlSource, /rel="icon"/);
  assert.match(htmlSource, new RegExp(`apple-touch-icon[^>]+${iconRevision}`));
  assert.match(workerSource, new RegExp(`icon-192\\.png\\?v=${iconRevision}`));
  assert.match(iconSource, /#1769ff/);
  assert.match(iconSource, /<circle/);
  const sourceIconPath = new URL('../public/icons/quiz-make-icon-1024.png', import.meta.url);
  assert.ok(existsSync(sourceIconPath), 'generated QuizMake logo source should exist');
  assert.ok(statSync(sourceIconPath).size > 100_000, 'generated QuizMake logo source should retain high-resolution detail');
  for (const file of ['icon-192.png', 'icon-512.png', 'maskable-512.png']) {
    const path = new URL(`../public/icons/${file}`, import.meta.url);
    assert.ok(existsSync(path), `${file} should exist`);
    assert.ok(statSync(path).size > 1000, `${file} should contain the generated icon`);
  }
});
