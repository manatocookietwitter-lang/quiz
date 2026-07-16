import type { ImportedProblemSet, ImportedQuestion } from '../types';

type ValidationResult = { ok: true; value: ImportedProblemSet } | { ok: false; errors: string[] };

export const CHATGPT_MATERIAL_TEMPLATE_PROMPT = `以下の資料内容をもとに、Quiz make に取り込むための選択式問題JSONを作成してください。

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


【出力形式】
1. 出力は Quiz make にそのまま取り込める .json ファイル形式にする。
2. ファイル出力できる環境では、本文だけでなく .json ファイルとして保存できる形で出力する。
3. チャット本文に出す場合も、JSON本体だけを出力し、説明文・補足文・Markdownのコードフェンスは付けない。
4. ファイル名を付ける場合は、setTitle を短く安全な英数字または日本語ファイル名にした .json とする。
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
      "reference": "2025 Q2"
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
  "reference": "2024 Q12"
}

【過去問原文の扱い】
1. 問題文・選択肢は、過去問原文をできるだけ優先する。
2. OCR崩れ、誤字、改行崩れ、選択肢番号の混入は、画像や資料を目視で確認して自然な形に手動補正する。
   - PDFや画像のOCRテキストが読めない、文字化けしている、または崩れている場合は、OCR結果から推測せず、ChatGPTがPDF/画像の該当箇所を直接目視で読み取る。
   - 問題文・選択肢・年度・問題番号・reference は、PDF/画像の原本を見て確認してからJSON化する。
   - 判別不能な部分は創作せず、原本を再確認する。確認できない場合は曖昧なまま作問しない。
3. 年度・問題番号は question には入れず、reference にだけ入れる。
4. reference は "2025 Q2" のように、年度と問題番号が分かる短い形式にする。
5. 重複問題を統合する場合は、reference に "2022 Q4 / 2025 Q2" のように複数年度・問題番号を併記する。
6. explanation は原文を写すのではなく、学習用に分かりやすく整理する。

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
5. answerIndex と answerIndexes を同じ問題で同時に使わない。
6. 正解は必ず1つ以上にする。

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
8. 正解番号が偏りすぎないようにする。

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

【問題の並び順】
questions の順番は学習順として重要です。ランダムな抜粋順や資料の出現順だけにしないでください。
1. まず category ごとにまとめる。
2. 同じ category 内では、近い内容・混同しやすい内容を連続して配置する。
3. 各 category 内で、学んでいくべき順番に並べる。
   - 定義・全体像
   - 分類・違い
   - 病態・機序
   - 検査・診断
   - 治療・適応・禁忌
   - 合併症・鑑別・例外
   - 試験で問われやすい識別問題
4. 基礎から応用、典型から例外へ進む順番にする。
5. id は出力順に q001, q002, q003... と連番にする。

【難易度】
1. 基本問題だけに偏らないようにする。
2. ただし、難問ばかりにしない。
3. 簡単な確認問題、中等度の理解問題、少し難しい識別問題を混ぜる。
4. 重要事項を漏らさないようにする。

【explanation】
explanation は、単に正解を示す欄ではありません。次に似た問題を解けるように、解答に必要な知識を簡潔に整理してください。

品質ルール：
1. 1問あたり120〜240字程度を目安にする。必要な場合（症例問題・複数正解・複数年度の比較など）は、300字程度まで増やしてよい。
2. 症例問題や複数正解問題で必要な場合は、読みやすさを保ったうえで少し長くなってもよい。
3. 正解だけを一言で書かない。
4. 「Aが正しい」「正解はB」だけで終わらない。
5. 全選択肢を毎回機械的に長く解説しない。
6. 教科書的な一般論を長々と広げない。
7. 問題と関係の薄い周辺知識を広げすぎない。
8. 見出しは入れず、自然な文章で書く。
解説は、正解の根拠だけでなく、判断の軸・必要な知識・重要な混同ポイントまで含めて、問題を解くための流れが分かる程度に整理する。
必要な場合は、2〜4文または短い段落に分けて改行する。JSON文字列内の改行は、JSONの仕様に従ってエスケープした形（例: \\n）で表現し、JSONを壊さない。
9. 「選択肢の確認」「覚えるポイント」「正解の根拠」「解説」「まとめ」などの見出しは使わない。

書く内容：
- なぜその選択肢が正解なのか
- どの知識を使えば解けるのか
- 定義、分類、病態・機序、検査・診断、治療・適応、禁忌、合併症、鑑別、例外のうち、その問題に必要な部分
- 似た選択肢や混同しやすい疾患・概念との違い
- 重要な誤答・混同ポイントがある場合だけ、その理由を短く
- 必要がある場合は、今後の学習で間違えやすい語句・概念にも短く触れる

良い解説のイメージ：
この疾患では〇〇が診断の軸となり、△△が特徴的である。治療は□□が基本で、××は適応外または鑑別として重要である。

悪い解説の例：
正解はB。Bが正しい。

悪い解説の例：
Aは〜、Bは〜、Cは〜、Dは〜、Eは〜。

【category】
1. すべての問題に category を必ず入れる。
2. category は分野別演習で使う。
3. category は資料内容に応じた大分類にする。
4. category は細かくしすぎない。
5. 同じ分野名は表記ゆれしないように統一する。
6. 特定分野専用の固定カテゴリにせず、資料内容に応じて汎用的に決める。

【reference】
1. 年度・問題番号・参照ページや資料位置が分かる場合は reference に入れる。
2. 年度・問題番号は "2025 Q2" のように短く統一する。
3. 分からない場合は空文字でもよい。
4. reference はアプリ側で参照ページとして表示される。

【最終確認】
出力前に以下を確認してください。

1. JSONとして正しい形式になっている。
2. JSON以外の文章がない。
3. 出力が .json ファイルとして保存できる形式になっている。
4. JSON本文以外の説明文やMarkdownコードフェンスが混ざっていない。
5. すべての問題に category がある。
6. choices は4個または5個。
7. answerIndex は0始まり。
8. answerIndexes は0始まり。
9. answerIndex と answerIndexes が同時に入っていない。
10. 複数正解問題では問題文に「すべて選べ」と明記されている。
11. 誤答選択問題では問題文に「誤っているもの」「正しくないもの」「適切でないもの」などが明記されている。
12. 誤答選択肢が「だけ」「必ず」「常に」などの雑な極端表現に頼っていない。
13. 正解番号が偏りすぎていない。
14. questions が category ごとにまとまり、category 内も学習順に並んでいる。
15. explanation が短すぎず、正解理由が分かる。
16. explanation が長すぎず、不要な一般論を広げていない。
17. explanation が、その問題を解くために必要な知識を体系的に整理している。
18. explanation が、次に似た問題を解けるような内容になっている。
19. 全選択肢を機械的に長く解説しすぎていない。
20. 重要な誤答・混同ポイントがある場合だけ短く触れている。
21. explanation が120〜240字程度を目安に、正解理由・判断の軸・必要な混同ポイントを含んでいる。
22. explanation は必要な場合に自然な改行で整理され、改行を含む場合もJSONとして正しい形式になっている。
23. OCRで読めないPDF/画像は、OCR結果ではなく原本を直接読んで補正している。
`;
export const CHATGPT_TEMPLATE_PROMPT = CHATGPT_MATERIAL_TEMPLATE_PROMPT;

export const CHATGPT_PAST_EXAM_TEMPLATE_PROMPT = `以下の過去問資料をもとに、Quiz make に取り込むための過去問集約JSONを作成してください。

【目的】
複数年度・複数回の過去問を、重複や類似問題を整理しながら、学習しやすい問題セットに統合してください。

【基本条件】
1. 問題は4択または5択にする。
2. choices は4個または5個にする。
3. 正解が1つだけの場合は answerIndex を使用する。
4. 正解が複数ある場合は answerIndexes を使用する。
5. answerIndex / answerIndexes は0始まりで記載する。
6. choices の選択肢本文には A. / B. / C. / D. / E. や 1. / 2. などのラベルを付けない。
7. JSON形式を厳密に維持する。
8. JSON以外の文章は出力しない。


【出力形式】
1. 出力は Quiz make にそのまま取り込める .json ファイル形式にする。
2. ファイル出力できる環境では、本文だけでなく .json ファイルとして保存できる形で出力する。
3. チャット本文に出す場合も、JSON本体だけを出力し、説明文・補足文・Markdownのコードフェンスは付けない。
4. ファイル名を付ける場合は、setTitle を短く安全な英数字または日本語ファイル名にした .json とする。
【JSON形式】
{
  "setTitle": "過去問集約 問題セット名",
  "source": "過去問資料名",
  "questions": [
    {
      "id": "q001",
      "category": "分野名",
      "question": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "answerIndex": 0,
      "explanation": "解説",
      "reference": "2025 Q2"
    }
  ]
}

【過去問原文の扱い】
1. 問題文・選択肢は過去問原文をできるだけ優先する。
2. OCR崩れ、誤字、改行崩れ、選択肢番号の混入は、画像や資料を目視で確認して手動補正する。
   - PDFや画像のOCRテキストが読めない、文字化けしている、または崩れている場合は、OCR結果から推測せず、ChatGPTがPDF/画像の該当箇所を直接目視で読み取る。
   - 問題文・選択肢・年度・問題番号・reference は、PDF/画像の原本を見て確認してからJSON化する。
   - 判別不能な部分は創作せず、原本を再確認する。確認できない場合は曖昧なまま作問しない。
3. 年度・問題番号は question に入れず、reference にだけ入れる。
4. reference は "2025 Q2" のように、年度と問題番号が分かる短い形式にする。
5. 重複・類似問題を統合した場合は、reference に "2022 Q4 / 2025 Q2" のように複数年度・問題番号を併記する。
6. 問題文や選択肢の意味が変わる改変はしない。

【重複・類似問題の集約】
1. 同じ知識を問う問題は、原則として1問に統合する。
2. ただし、問い方・選択肢・ひっかけ方が重要に違う場合は別問として残す。
3. 統合するときは、もっとも自然で代表的な問題文・選択肢を採用する。
4. 統合で失われる重要な年度差・出題意図がある場合は、explanation に短く反映する。
5. 同じテーマが繰り返し出ている場合は、頻出であることが分かるように reference を併記する。

【category】
1. すべての問題に category を必ず入れる。
2. category は資料内容に応じた大分類にする。
3. category は細かくしすぎない。
4. 同じ分野名は表記ゆれしないように統一する。
5. category は分野別演習で使うため、学習上まとまりのある単位にする。


【過去問の重複・漏れ確認】
1. JSON作成前に、資料内の年度・問題番号をすべて洗い出し、内部的に参照リストを作る。
2. 各問題の reference を見れば、どの年度・問題番号を収録したか確認できるようにする。
3. 出力前に questions[].reference を確認し、資料にあるすべての年度・問題番号が含まれているか照合する。
4. reference に存在しない年度・問題番号があれば、JSONを出力する前に必ず該当問題を追加または統合する。
5. 同一またはほぼ同一の問題は重複して別問題にせず、1問に統合して reference に複数年度・問題番号を併記する。
6. ただし、同じテーマでも問う知識・条件・正解根拠が異なる問題は削らず、別問題として残す。
7. 重複回避を優先しすぎて、資料中の問題が漏れないようにする。
8. 最終的に reference を追うことで、資料内の全問題がJSON内のどこに入ったか確認できる状態にする。
【問題の並び順】
questions の順番は学習順として重要です。
1. まず category ごとにまとめる。
2. 同じ category 内では、近い内容・混同しやすい内容を連続して配置する。
3. 各 category 内で、学んでいくべき順番に並べる。
   - 定義・全体像
   - 分類・違い
   - 病態・機序
   - 検査・診断
   - 治療・適応・禁忌
   - 合併症・鑑別・例外
   - 過去問で繰り返し問われる識別問題
4. 基礎から応用、典型から例外へ進む順番にする。
5. id は出力順に q001, q002, q003... と連番にする。

【誤答選択肢の扱い】
1. 原文選択肢を優先する。
2. OCR補正が必要な場合でも、選択肢の意味を変えない。
3. 「だけ」「必ず」「常に」「絶対に」などの極端表現を、誤答作成のためだけに安易に追加しない。
4. 選択肢同士の文体・粒度をそろえる。
5. 正答番号が偏りすぎないようにする。

【explanation】
explanation は、次に似た過去問を解けるように、解答に必要な知識を簡潔に整理してください。
1. 1問あたり120〜240字程度を目安にする。必要な場合（症例問題・複数正解・複数年度の比較など）は、300字程度まで増やしてよい。
2. 症例問題や複数正解問題で必要な場合は、読みやすさを保ったうえで少し長くなってもよい。
3. 正解だけを一言で書かない。
4. 全選択肢を毎回機械的に長く解説しない。
5. 教科書的な一般論を長々と広げない。
6. 見出しは入れず、自然な文章で書く。
解説は、正解の根拠だけでなく、判断の軸・必要な知識・重要な混同ポイントまで含めて、問題を解くための流れが分かる程度に整理する。
必要な場合は、2〜4文または短い段落に分けて改行する。JSON文字列内の改行は、JSONの仕様に従ってエスケープした形（例: \\n）で表現し、JSONを壊さない。
7. 定義、分類、病態・機序、検査・診断、治療・適応、禁忌、合併症、鑑別、例外のうち、その問題に必要な部分だけを整理する。
8. 重要な誤答・混同ポイントがある場合だけ短く触れる。
9. 必要がある場合は、今後の学習で間違えやすい語句・概念にも短く触れる。
10. 重複統合した問題では、複数年度で問われた軸が分かるようにする。

【最終確認】
1. JSONとして正しい形式になっている。
2. JSON以外の文章がない。
3. 出力が .json ファイルとして保存できる形式になっている。
4. JSON本文以外の説明文やMarkdownコードフェンスが混ざっていない。
5. すべての問題に category がある。
6. choices は4個または5個。
7. answerIndex / answerIndexes は0始まり。
8. answerIndex と answerIndexes が同時に入っていない。
9. reference に年度・問題番号が入っている。
10. 重複統合時は reference に複数年度・問題番号が併記されている。
11. 資料内の年度・問題番号が、questions[].reference を見てすべて確認できる。
12. reference に漏れている年度・問題番号がない。
13. 同一またはほぼ同一の過去問が重複して別問題になっていない。
14. 重複統合しすぎて別問を削っていない。
15. questions が category ごとにまとまり、category 内も学習順に並んでいる。
16. explanation が短すぎず、正解理由が分かる。
17. explanation が長すぎず、不要な一般論を広げていない。
18. explanation が、次に似た過去問を解けるような内容になっている。
19. explanation が120〜240字程度を目安に、正解理由・判断の軸・必要な混同ポイントを含んでいる。
20. explanation は必要な場合に自然な改行で整理され、改行を含む場合もJSONとして正しい形式になっている。
21. OCRで読めないPDF/画像は、OCR結果ではなく原本を直接読んで補正している。
`;
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
