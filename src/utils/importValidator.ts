import type { ImportedProblemSet, ImportedQuestion } from '../types';

type ValidationResult = { ok: true; value: ImportedProblemSet } | { ok: false; errors: string[] };

export const CHATGPT_TEMPLATE_PROMPT = `以下の資料内容をもとに、Quiz make に取り込むための選択式問題を作成してください。

【基本条件】
1. 問題は4択または5択にする。
2. choices は4個または5個にする。
3. 正解が1つだけの場合は answerIndex を使用する。
4. 正解が複数ある場合は answerIndexes を使用する。
5. answerIndex / answerIndexes は0始まりで記載する。
   - 4択では0〜3
   - 5択では0〜4
6. choices の選択肢本文には A. / B. / C. / D. / E. や 1. / 2. などのラベルを付けない。
7. アプリ側で選択肢は 1 / 2 / 3 / 4 / 5 と表示される。
8. JSON形式を厳密に維持する。
9. JSON以外の文章は出力しない。

【JSON形式】
以下の形式で出力してください。

{
  "setTitle": "問題セット名",
  "source": "資料名",
  "questions": [
    {
      "id": "q001",
      "category": "分野名",
      "question": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "answerIndex": 0,
      "explanation": "解説",
      "reference": "参照ページや資料位置"
    }
  ]
}

複数正解の場合は answerIndex ではなく answerIndexes を使ってください。

例：
{
  "id": "q002",
  "category": "分野名",
  "question": "以下のうち、正しいものをすべて選べ。",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4", "選択肢5"],
  "answerIndexes": [0, 2],
  "explanation": "解説",
  "reference": "参照ページや資料位置"
}

【問題形式の方針】
1. 基本は「正しいものを1つ選べ」の単一正答問題を中心にする。
2. ただし、単一正答にすると問題の質が下がる場合は、以下の形式も使ってよい。
   - 誤っているものを1つ選べ
   - 正しくないものを1つ選べ
   - 適切でないものを1つ選べ
   - 正しいものをすべて選べ
   - 誤っているものをすべて選べ
3. 誤答選択問題を使う場合は、問題文に「誤っているものを1つ選べ」「正しくないものを1つ選べ」「適切でないものを1つ選べ」などと明記する。
4. 複数正解問題を使う場合は、問題文に「正しいものをすべて選べ」または「誤っているものをすべて選べ」と明記し、answerIndexes に正解の選択肢番号をすべて入れる。
5. 複数正解問題では、answerIndexes に重複番号を入れない。
6. 正解は必ず1つ以上にする。
7. answerIndex と answerIndexes を同じ問題で同時に使わない。

【誤答選択肢の作り方】
誤答選択肢は、雑に作らないでください。

悪い誤答の例：
- 「〜だけ」
- 「必ず〜」
- 「常に〜」
- 「絶対に〜」
- 「すべて〜」
- 「全く〜」
- 「〜ではない」
- 明らかに極端で、すぐ誤りだと分かる表現
- 資料と無関係な選択肢
- 正解と文体や長さが大きく違う選択肢

ただし、資料内容として本当に必要な場合は「必ず」「だけ」などの表現を使ってもよい。

良い誤答の作り方：
- 似た概念との混同
- 適応と禁忌の取り違え
- 検査目的の取り違え
- 治療法の取り違え
- 病態・機序の一部の取り違え
- 対象疾患の取り違え
- 分類・順序・数値の取り違え
- 正しい内容だが、設問条件には合わないもの
- 臨床的にはありそうだが、資料内容とは違うもの
- 初学者が実際に混同しやすいもの

【選択肢の品質条件】
1. 正答だけが明らかに長い、または短い状態にしない。
2. 正答だけが具体的、誤答だけが抽象的、という偏りを避ける。
3. 文体をそろえる。
4. 選択肢同士の粒度をそろえる。
5. 似た内容の重複選択肢を作らない。
6. 明らかに不自然な選択肢を入れない。
7. 「上記のすべて」「該当なし」は原則使わない。
8. 正解番号が偏らないようにする。

【作問内容】
以下をバランスよく出題してください。

- 定義
- 分類
- 違い
- 病態
- 機序
- 検査
- 診断
- 治療
- 禁忌
- 適応
- 合併症
- 鑑別
- 数値・基準
- 試験で問われやすいポイント
- 混同しやすい内容

【難易度】
1. 基本問題だけに偏らないようにする。
2. ただし、難問ばかりにしない。
3. 簡単な確認問題、中等度の理解問題、少し難しい識別問題を混ぜる。
4. 重要事項を漏らさないようにする。

【解説】
explanation には以下を含めてください。

- 正解の根拠
- 不正解選択肢がなぜ誤りか
- 関連する重要知識
- 混同しやすい内容との違い
- 試験で問われやすいポイント
- 必要に応じた覚え方

【category】
1. すべての問題に category を必ず入れる。
2. category は分野別演習で使う。
3. 同じ分野名は表記ゆれしないように統一する。

【reference】
1. 参照ページや資料位置が分かる場合は reference に入れる。
2. 分からない場合は空文字でもよい。
3. reference はアプリ側で参照ページとして表示される。

【最終確認】
出力前に以下を確認してください。

1. JSONとして正しい形式になっている。
2. JSON以外の文章がない。
3. すべての問題に category がある。
4. choices は4個または5個。
5. answerIndex は0始まり。
6. answerIndexes は0始まり。
7. answerIndex と answerIndexes が同時に入っていない。
8. 複数正解問題では問題文に「すべて選べ」と明記されている。
9. 誤答選択問題では問題文に「誤っているもの」「正しくないもの」「適切でないもの」などが明記されている。
10. 誤答選択肢が「だけ」「必ず」「常に」などの雑な極端表現に頼っていない。
11. 正解番号が偏りすぎていない。
12. 解説が十分に詳しい。`;

export function validateImportJson(text: string): ValidationResult {
  let parsed: unknown;
  const normalizedText = text.replace(/^\uFEFF/u, '').trim();

  try {
    parsed = JSON.parse(normalizedText);
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
