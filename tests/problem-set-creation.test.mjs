import assert from 'node:assert/strict';
import test from 'node:test';
import { getDraftIssues, parseBulkQuestionText, parseQuestionCsv } from '../src/utils/bulkQuestionParser.ts';

test('plain text parser reads multiple questions without guessing missing answers', () => {
  const result = parseBulkQuestionText(`
1. 日本の首都はどこですか。
A. 大阪
B. 東京
C. 京都
D. 名古屋
正解: B
解説: 日本の首都は東京です。
分類: 地理

2. 2 + 2 はいくつですか。
A. 2
B. 3
C. 4
D. 5
解説: 足し算の問題です。
`);

  assert.equal(result.questions.length, 2);
  assert.equal(result.validCount, 1);
  assert.equal(result.needsReviewCount, 1);
  assert.equal(result.questions[0].answerIndex, 1);
  assert.equal(result.questions[0].category, '地理');
  assert.equal(result.questions[1].answerIndex, null);
  assert.match(result.questions[1].issues.join(' '), /正解/);
});

test('answer text must exactly identify a choice', () => {
  const result = parseBulkQuestionText(`
Q1 次から正しいものを選んでください
1) 赤
2) 青
3) 緑
4) 白
答え: 緑
`);
  assert.equal(result.questions[0].answerIndex, 2);

  const unresolved = parseBulkQuestionText(`
Q1 次から正しいものを選んでください
1) 赤
2) 青
3) 緑
4) 白
答え: たぶん青
`);
  assert.equal(unresolved.questions[0].answerIndex, null);
});

test('draft validation accepts only four or five non-empty choices and an explicit answer', () => {
  assert.deepEqual(getDraftIssues({ question: '問題', choices: ['1', '2', '3', '4'], answerIndex: 0 }), []);
  assert.ok(getDraftIssues({ question: '問題', choices: ['1', '2', ''], answerIndex: null }).length >= 2);
});

test('CSV import stays in the reviewed creation path', () => {
  const result = parseQuestionCsv('問題文,選択肢1,選択肢2,選択肢3,選択肢4,正解,解説,分類\n"2, 3, 5の次は?",7,8,9,10,7,素数の並び,数学');
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].question, '2, 3, 5の次は?');
  assert.equal(result.questions[0].answerIndex, 0);
  assert.equal(result.validCount, 1);
});
