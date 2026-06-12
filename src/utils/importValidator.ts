import type { ImportedProblemSet, ImportedQuestion } from '../types';

type ValidationResult = { ok: true; value: ImportedProblemSet } | { ok: false; errors: string[] };

export const CHATGPT_TEMPLATE_PROMPT = `以下の資料内容をもとに、Quiz make に取り込むための選択式問題を作成してください。

条件：
1. 問題は4択または5択にする。
2. choices は4個または5個にする。
3. 正解が1つだけの場合は answerIndex を使用する。
4. 正解が複数ある場合は answerIndexes を使用する。
5. answerIndex / answerIndexes は0始まりで記載する。4択では0〜3、5択では0〜4を使用する。
6. 複数正解問題では、問題文に「正しいものをすべて選べ」と明記し、answerIndexes に正解の選択肢番号をすべて入れる。
7. answerIndexes に重複番号を入れない。
8. 正解は必ず1つ以上にする。
9. 正解番号が偏らないようにする。
10. 問題は重要事項を漏らさないように作成する。
11. 定義、違い、分類、検査、治療、禁忌、アルゴリズム、症例判断をバランスよく出題する。
12. 解説は詳しく書く。
13. 参照ページは reference に記載する。
14. 各問題には必ず category を付ける。
15. category は問題の分野分類であり、アプリ内で分野別演習・分野別復習・問題一覧の見出しに使用する。
16. category は資料内容を読み取り、章・講義名・疾患群・検査・治療・症例判断などのまとまりごとに分類する。
17. 同じ分野は必ず同じ category 名に統一し、表記ゆれを避ける。例：「貧血」と「貧血総論」を混在させない。
18. category名は短く、一覧で見やすい名前にする。
19. category は空欄にしない。分類不能な場合のみ「未分類」とする。
20. アプリ上では選択肢は 1 / 2 / 3 / 4 / 5 として表示する。
21. JSON の answerIndex / answerIndexes は0始まりで記載する。画面上の1番目は answerIndex: 0、2番目は answerIndex: 1。
22. choices の本文には A. / B. / 1. などのラベルを付けない。選択肢本文だけを書く。
23. JSON以外の文章は出力しない。
24. 次の形式に厳密に従う。

問題は4択または5択で作成してください。choices は4個または5個にしてください。正解が1つだけの場合は answerIndex を使用し、複数正解の場合は answerIndexes を使用してください。answerIndex / answerIndexes は0始まりで、4択では0〜3、5択では0〜4を使用します。アプリ上では選択肢は 1 / 2 / 3 / 4 / 5 として表示します。ただし JSON の answerIndex / answerIndexes は0始まりで記載してください。つまり、画面上の1番目は answerIndex: 0、画面上の2番目は answerIndex: 1 です。複数正解問題では、問題文に「正しいものをすべて選べ」と明記し、answerIndexes に正解の選択肢番号をすべて入れてください。choices には A. B. などのラベルを付けず、選択肢本文だけを書いてください。

各問題には必ず category を付けてください。category は問題の分野分類であり、アプリ内で分野別演習・分野別復習・問題一覧の見出しに使用します。資料内容を読み取り、章・疾患群・検査・治療・症例判断などのまとまりごとに分類してください。同じ分野は必ず同じ category 名に統一してください。分類不能な場合のみ「未分類」としてください。

{
  "setTitle": "問題セット名",
  "source": "資料名",
  "questions": [
    {
      "id": "q001",
      "category": "分野名",
      "question": "単一正解の問題文",
      "choices": [
        "選択肢1",
        "選択肢2",
        "選択肢3",
        "選択肢4"
      ],
      "answerIndex": 0,
      "explanation": "解説",
      "reference": "p.12"
    },
    {
      "id": "q002",
      "category": "分野名",
      "question": "正しいものをすべて選べ。",
      "choices": [
        "選択肢1",
        "選択肢2",
        "選択肢3",
        "選択肢4",
        "選択肢5"
      ],
      "answerIndexes": [0, 3],
      "explanation": "解説",
      "reference": "p.18"
    }
  ]
}`;

export function validateImportJson(text: string): ValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? `JSONの解析に失敗しました: ${error.message}` : 'JSONの解析に失敗しました。'],
    };
  }

  const errors: string[] = [];
  if (!isRecord(parsed)) {
    return { ok: false, errors: ['最上位はオブジェクトにしてください。'] };
  }

  if (parsed.setTitle !== undefined && typeof parsed.setTitle !== 'string') {
    errors.push('setTitle は文字列にしてください。');
  }

  if (parsed.source !== undefined && typeof parsed.source !== 'string') {
    errors.push('source は文字列にしてください。');
  }

  if (!Array.isArray(parsed.questions)) {
    errors.push('questions は配列にしてください。');
  }

  if (errors.length > 0) return { ok: false, errors };

  const rawQuestions = parsed.questions as unknown[];
  if (rawQuestions.length === 0) {
    errors.push('questions が空です。1問以上入れてください。');
  }

  const questions: ImportedQuestion[] = [];
  rawQuestions.forEach((rawQuestion, index) => {
    const path = `questions[${index}]`;
    if (!isRecord(rawQuestion)) {
      errors.push(`${path} はオブジェクトにしてください。`);
      return;
    }

    if (!isNonEmptyString(rawQuestion.question)) {
      errors.push(`${path}.question は空でない文字列にしてください。`);
    }

    if (!Array.isArray(rawQuestion.choices)) {
      errors.push(`${path}.choices は配列にしてください。`);
    } else if (rawQuestion.choices.length !== 4 && rawQuestion.choices.length !== 5) {
      errors.push(`${path}.choices は4個または5個にしてください。現在 ${rawQuestion.choices.length} 個です。`);
    } else {
      rawQuestion.choices.forEach((choice, choiceIndex) => {
        if (!isNonEmptyString(choice)) {
          errors.push(`${path}.choices[${choiceIndex}] は空でない文字列にしてください。`);
        }
      });
    }

    if (!isNonEmptyString(rawQuestion.explanation)) {
      errors.push(`${path}.explanation は空でない文字列にしてください。`);
    }

    if (rawQuestion.answerText !== undefined && typeof rawQuestion.answerText !== 'string') {
      errors.push(`${path}.answerText は文字列にしてください。`);
    }

    if (rawQuestion.sourcePage !== undefined && typeof rawQuestion.sourcePage !== 'string') {
      errors.push(`${path}.sourcePage は文字列にしてください。`);
    }

    if (rawQuestion.reference !== undefined && typeof rawQuestion.reference !== 'string') {
      errors.push(`${path}.reference は文字列にしてください。`);
    }

    if (rawQuestion.category !== undefined && typeof rawQuestion.category !== 'string') {
      errors.push(`${path}.category は文字列にしてください。`);
    }

    if (rawQuestion.difficulty !== undefined && typeof rawQuestion.difficulty !== 'string') {
      errors.push(`${path}.difficulty は文字列にしてください。`);
    }

    const choices = Array.isArray(rawQuestion.choices) && (rawQuestion.choices.length === 4 || rawQuestion.choices.length === 5)
      ? rawQuestion.choices.map((choice) => (typeof choice === 'string' ? stripChoicePrefix(choice) : choice))
      : ['', '', '', ''];
    const answerIndexesResult = getAnswerIndexes(rawQuestion, choices.length, path);
    errors.push(...answerIndexesResult.errors);

    if (
      isNonEmptyString(rawQuestion.question) &&
      (choices.length === 4 || choices.length === 5) &&
      choices.every(isNonEmptyString) &&
      answerIndexesResult.value.length > 0 &&
      isNonEmptyString(rawQuestion.explanation)
    ) {
      const answerIndexes = answerIndexesResult.value;
      questions.push({
        id: typeof rawQuestion.id === 'string' ? rawQuestion.id : undefined,
        question: rawQuestion.question,
        choices: choices as ImportedQuestion['choices'],
        answerIndex: answerIndexes[0],
        answerIndexes,
        answerText: typeof rawQuestion.answerText === 'string' && rawQuestion.answerText.trim() !== ''
          ? rawQuestion.answerText
          : answerIndexes.map((index) => choices[index]).join(' / '),
        explanation: rawQuestion.explanation,
        sourcePage: getSourcePage(rawQuestion),
        category: typeof rawQuestion.category === 'string' && rawQuestion.category.trim() !== '' ? rawQuestion.category : '未分類',
        difficulty: typeof rawQuestion.difficulty === 'string' ? rawQuestion.difficulty : 'basic',
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      setTitle: typeof parsed.setTitle === 'string' && parsed.setTitle.trim() !== '' ? parsed.setTitle : '無題の問題セット',
      source: typeof parsed.source === 'string' ? parsed.source : '',
      questions,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getSourcePage(rawQuestion: Record<string, unknown>) {
  if (typeof rawQuestion.sourcePage === 'string') return rawQuestion.sourcePage;
  if (typeof rawQuestion.reference === 'string') return rawQuestion.reference;
  return '';
}

function stripChoicePrefix(text: string) {
  return text.replace(/^\s*(?:[A-EＡ-Ｅａ-ｅa-e]|[1-5１-５])\s*[\.\)\]:：．）]\s*/u, '').trim();
}

function getAnswerIndexes(rawQuestion: Record<string, unknown>, choiceCount: number, path: string): { value: number[]; errors: string[] } {
  const errors: string[] = [];

  if (Array.isArray(rawQuestion.answerIndexes)) {
    if (rawQuestion.answerIndexes.length === 0) {
      errors.push(`${path}.answerIndexes は1つ以上指定してください。`);
      return { value: [], errors };
    }

    const indexes: number[] = [];
    rawQuestion.answerIndexes.forEach((item, index) => {
      if (!Number.isInteger(item)) {
        errors.push(`${path}.answerIndexes[${index}] は整数にしてください。`);
      } else if (Number(item) < 0 || Number(item) >= choiceCount) {
        errors.push(`${path}.answerIndexes[${index}] は0〜${choiceCount - 1}の整数にしてください。`);
      } else {
        indexes.push(Number(item));
      }
    });

    if (new Set(indexes).size !== indexes.length) {
      errors.push(`${path}.answerIndexes に重複があります。`);
    }

    return { value: Array.from(new Set(indexes)).sort((a, b) => a - b), errors };
  }

  if (!Number.isInteger(rawQuestion.answerIndex)) {
    errors.push(`${path}.answerIndex または answerIndexes を指定してください。`);
    return { value: [], errors };
  }

  const answerIndex = Number(rawQuestion.answerIndex);
  if (answerIndex < 0 || answerIndex >= choiceCount) {
    errors.push(`${path}.answerIndex は0〜${choiceCount - 1}の整数にしてください。`);
    return { value: [], errors };
  }

  return { value: [answerIndex], errors };
}
