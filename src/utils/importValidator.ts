import type { ImportedProblemSet, ImportedQuestion } from '../types';

type ValidationResult = { ok: true; value: ImportedProblemSet } | { ok: false; errors: string[] };

export const CHATGPT_TEMPLATE_PROMPT = `以下の資料内容をもとに、Quiz make に取り込むための4択問題を作成してください。

条件：
1. 4択問題にする。
2. 正解は必ず1つだけにする。
3. answerIndexは0始まりで記載する。
4. 正解番号が偏らないようにする。
5. 問題は重要事項を漏らさないように作成する。
6. 定義、違い、分類、検査、治療、禁忌、アルゴリズム、症例判断をバランスよく出題する。
7. 解説は詳しく書く。
8. 可能な限り参照ページを記載する。
9. 各問題には必ず category を付ける。
10. category は問題の分野分類であり、アプリ内で分野別演習・分野別復習・問題一覧の見出しに使用する。
11. category は資料内容を読み取り、章・講義名・疾患群・検査・治療・症例判断などのまとまりごとに分類する。
12. 同じ分野は必ず同じ category 名に統一し、表記ゆれを避ける。例：「貧血」と「貧血総論」を混在させない。
13. category名は短く、一覧で見やすい名前にする。
14. category は空欄にしない。分類不能な場合のみ「未分類」とする。
15. JSON以外の文章は出力しない。
16. 次の形式に厳密に従う。

各問題には必ず category を付けてください。category は問題の分野分類であり、アプリ内で分野別演習・分野別復習・問題一覧の見出しに使用します。資料内容を読み取り、章・疾患群・検査・治療・症例判断などのまとまりごとに分類してください。同じ分野は必ず同じ category 名に統一してください。分類不能な場合のみ「未分類」としてください。

{
  "setTitle": "問題セット名",
  "source": "資料名",
  "questions": [
    {
      "id": "q001",
      "category": "分野名",
      "question": "問題文",
      "choices": [
        "選択肢1",
        "選択肢2",
        "選択肢3",
        "選択肢4"
      ],
      "answerIndex": 0,
      "answerText": "正解の選択肢",
      "explanation": "解説",
      "reference": "参照ページ",
      "difficulty": "basic"
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

  if (!isNonEmptyString(parsed.setTitle)) {
    errors.push('setTitle が存在しない、または空です。');
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
    } else if (rawQuestion.choices.length !== 4) {
      errors.push(`${path}.choices は必ず4個にしてください。現在 ${rawQuestion.choices.length} 個です。`);
    } else {
      rawQuestion.choices.forEach((choice, choiceIndex) => {
        if (!isNonEmptyString(choice)) {
          errors.push(`${path}.choices[${choiceIndex}] は空でない文字列にしてください。`);
        }
      });
    }

    if (!Number.isInteger(rawQuestion.answerIndex) || Number(rawQuestion.answerIndex) < 0 || Number(rawQuestion.answerIndex) > 3) {
      errors.push(`${path}.answerIndex は0〜3の整数にしてください。`);
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

    const choices = Array.isArray(rawQuestion.choices) && rawQuestion.choices.length === 4
      ? rawQuestion.choices
      : ['', '', '', ''];
    const answerIndex = Number(rawQuestion.answerIndex);

    if (
      isNonEmptyString(rawQuestion.question) &&
      choices.length === 4 &&
      choices.every(isNonEmptyString) &&
      Number.isInteger(answerIndex) &&
      answerIndex >= 0 &&
      answerIndex <= 3 &&
      isNonEmptyString(rawQuestion.explanation)
    ) {
      questions.push({
        id: typeof rawQuestion.id === 'string' ? rawQuestion.id : undefined,
        question: rawQuestion.question,
        choices: choices as [string, string, string, string],
        answerIndex,
        answerText: typeof rawQuestion.answerText === 'string' && rawQuestion.answerText.trim() !== ''
          ? rawQuestion.answerText
          : choices[answerIndex],
        explanation: rawQuestion.explanation,
        sourcePage: getSourcePage(rawQuestion),
        category: typeof rawQuestion.category === 'string' ? rawQuestion.category : '',
        difficulty: typeof rawQuestion.difficulty === 'string' ? rawQuestion.difficulty : 'basic',
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      setTitle: parsed.setTitle as string,
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
