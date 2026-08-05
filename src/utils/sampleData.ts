import type { AppData, Question } from '../types';
import { createId } from './id';
import { nowIso } from './date';

export function createSampleAppData(): AppData {
  const createdAt = nowIso();
  const folderId = createId('folder');
  const setId = createId('set');
  const questions: Question[] = [
    createQuestion(setId, createdAt, {
      question: 'I ___ to school every day.',
      choices: ['go', 'goes', 'went', 'going'],
      answerIndex: 0,
      answerText: 'go',
      explanation: '主語がIで、every dayは現在の習慣を表すため、動詞の原形goを使います。',
      detailedExplanation: [
        '## なぜ go になる？',
        '',
        '`every day` は繰り返す習慣を表すため、時制は現在形です。主語が `I` なので動詞に **-s** は付けません。',
        '',
        '| 主語 | 現在形 | 例 |',
        '| --- | --- | --- |',
        '| I / You / We / They | go | I go to school. |',
        '| He / She / It | goes | She goes to school. |',
        '',
        '> ポイント：三人称単数の主語だけ `goes` を使います。',
      ].join('\n'),
      category: '現在形',
    }),
    createQuestion(setId, createdAt, {
      question: 'She has lived here ___ 2020.',
      choices: ['since', 'for', 'from', 'at'],
      answerIndex: 0,
      answerText: 'since',
      explanation: '2020は継続の開始時点なので、現在完了とsinceを組み合わせます。',
      category: '現在完了',
    }),
    createQuestion(setId, createdAt, {
      question: '「私は昨日その本を読みました。」に最も近い英文はどれですか。',
      choices: ['I read the book yesterday.', 'I read the book tomorrow.', 'I am reading the book every day.', 'I have never read the book.'],
      answerIndex: 0,
      answerText: 'I read the book yesterday.',
      explanation: 'yesterdayは過去の時点を表すため、過去形readを使います。',
      category: '過去形',
    }),
  ];

  return {
    version: 1,
    folders: [{ id: folderId, name: '英語サンプル', createdAt, updatedAt: createdAt }],
    problemSets: [{ id: setId, folderId, title: '英語の基本問題', source: 'QuizMake サンプル', createdAt, updatedAt: createdAt }],
    questions,
    progress: [],
    answerLogs: [],
  };
}

function createQuestion(
  setId: string,
  createdAt: string,
  input: Pick<Question, 'question' | 'choices' | 'answerIndex' | 'answerText' | 'explanation' | 'detailedExplanation' | 'category'>,
): Question {
  return {
    id: createId('question'),
    setId,
    ...input,
    sourcePage: 'サンプル',
    difficulty: 'basic',
    createdAt,
    updatedAt: createdAt,
  };
}
