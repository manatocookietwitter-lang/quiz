export interface BulkQuestionDraft {
  id: string;
  question: string;
  choices: string[];
  answerIndex: number | null;
  explanation: string;
  category: string;
  sourcePage: string;
  issues: string[];
}

export interface BulkParseResult {
  questions: BulkQuestionDraft[];
  validCount: number;
  needsReviewCount: number;
}

interface MutableBlock {
  questionLines: string[];
  choices: string[];
  answerRaw: string;
  explanationLines: string[];
  category: string;
  sourcePage: string;
  section: 'question' | 'explanation';
}

const QUESTION_HEADER = /^(?:(?:問題|問|Q|Ｑ)\s*\d+|\d+\s*[.)）．:：])\s*(.*)$/iu;
const CHOICE_LINE = /^\s*(?:[（(]?\s*([A-Ea-e1-5Ａ-Ｅａ-ｅ１-５①-⑤])\s*[)）.．:：]|([①-⑤]))\s*(.+)$/u;
const ANSWER_LINE = /^\s*(?:\*{0,2})?(?:正解|答え|解答|answer)(?:\*{0,2})?\s*[:：]\s*(.+)$/iu;
const EXPLANATION_LINE = /^\s*(?:\*{0,2})?(?:解説|説明|explanation)(?:\*{0,2})?\s*[:：]?\s*(.*)$/iu;
const CATEGORY_LINE = /^\s*(?:\*{0,2})?(?:分類|カテゴリ(?:ー)?|category)(?:\*{0,2})?\s*[:：]\s*(.*)$/iu;
const SOURCE_LINE = /^\s*(?:\*{0,2})?(?:参照|出典|reference)(?:\*{0,2})?\s*[:：]\s*(.*)$/iu;

export function parseBulkQuestionText(input: string): BulkParseResult {
  const lines = input.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').split('\n');
  const blocks: MutableBlock[] = [];
  let current = createBlock();

  const flush = () => {
    if (!hasBlockContent(current)) return;
    blocks.push(current);
    current = createBlock();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const answerMatch = line.match(ANSWER_LINE);
    if (answerMatch) {
      current.answerRaw = cleanInline(answerMatch[1]);
      continue;
    }

    const explanationMatch = line.match(EXPLANATION_LINE);
    if (explanationMatch) {
      current.section = 'explanation';
      if (explanationMatch[1]) current.explanationLines.push(cleanInline(explanationMatch[1]));
      continue;
    }

    const categoryMatch = line.match(CATEGORY_LINE);
    if (categoryMatch) {
      current.category = cleanInline(categoryMatch[1]);
      continue;
    }

    const sourceMatch = line.match(SOURCE_LINE);
    if (sourceMatch) {
      current.sourcePage = cleanInline(sourceMatch[1]);
      continue;
    }

    const choiceMatch = line.match(CHOICE_LINE);
    if (choiceMatch && isLikelyChoiceLine(current, choiceMatch)) {
      current.choices.push(cleanInline(choiceMatch[3]));
      continue;
    }

    const questionMatch = line.match(QUESTION_HEADER);
    if (questionMatch && shouldStartNewQuestion(current)) {
      flush();
      current.questionLines.push(cleanInline(questionMatch[1]));
      continue;
    }

    if (questionMatch && current.questionLines.length === 0) {
      current.questionLines.push(cleanInline(questionMatch[1]));
      continue;
    }

    if (current.section === 'explanation') current.explanationLines.push(cleanInline(line));
    else current.questionLines.push(cleanInline(line));
  }
  flush();

  const questions = blocks.map((block, index) => finalizeBlock(block, index));
  return {
    questions,
    validCount: questions.filter((question) => question.issues.length === 0).length,
    needsReviewCount: questions.filter((question) => question.issues.length > 0).length,
  };
}

export function parseQuestionCsv(input: string): BulkParseResult {
  const rows = parseCsvRows(input.replace(/^\uFEFF/u, ''));
  if (rows.length < 2) return { questions: [], validCount: 0, needsReviewCount: 0 };
  const headers = rows[0].map((header) => normalizeHeader(header));
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const questionColumn = column('question', '問題', '問題文');
  const answerColumn = column('answer', '正解', '答え', '解答');
  const explanationColumn = column('explanation', '解説', '説明');
  const categoryColumn = column('category', '分類', 'カテゴリー', 'カテゴリ');
  const sourceColumn = column('reference', 'sourcepage', '参照', '出典');
  const choiceColumns = [1, 2, 3, 4, 5].map((number) => column(`choice${number}`, `選択肢${number}`));

  const questions = rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const choices = choiceColumns
        .map((choiceColumn) => choiceColumn >= 0 ? (row[choiceColumn] ?? '').trim() : '')
        .filter((choice, choiceIndex) => choiceIndex < 4 || Boolean(choice));
      const answerRaw = answerColumn >= 0 ? row[answerColumn] ?? '' : '';
      const draft: BulkQuestionDraft = {
        id: `csv-${index + 1}`,
        question: questionColumn >= 0 ? (row[questionColumn] ?? '').trim() : '',
        choices,
        answerIndex: resolveAnswerIndex(answerRaw, choices),
        explanation: explanationColumn >= 0 ? (row[explanationColumn] ?? '').trim() : '',
        category: categoryColumn >= 0 ? (row[categoryColumn] ?? '').trim() : '',
        sourcePage: sourceColumn >= 0 ? (row[sourceColumn] ?? '').trim() : '',
        issues: [],
      };
      draft.issues = getDraftIssues(draft);
      return draft;
    });
  return {
    questions,
    validCount: questions.filter((question) => question.issues.length === 0).length,
    needsReviewCount: questions.filter((question) => question.issues.length > 0).length,
  };
}

export function getDraftIssues(question: Pick<BulkQuestionDraft, 'question' | 'choices' | 'answerIndex'>): string[] {
  const issues: string[] = [];
  if (!question.question.trim()) issues.push('問題文を入力してください');
  if (question.choices.length !== 4 && question.choices.length !== 5) issues.push('選択肢は4個または5個にしてください');
  if (question.choices.some((choice) => !choice.trim())) issues.push('空の選択肢があります');
  if (question.answerIndex === null) issues.push('正解を確認して選んでください');
  else if (question.answerIndex < 0 || question.answerIndex >= question.choices.length) issues.push('正解が選択肢の範囲外です');
  return issues;
}

function createBlock(): MutableBlock {
  return { questionLines: [], choices: [], answerRaw: '', explanationLines: [], category: '', sourcePage: '', section: 'question' };
}

function hasBlockContent(block: MutableBlock) {
  return block.questionLines.length > 0 || block.choices.length > 0 || Boolean(block.answerRaw || block.explanationLines.length);
}

function shouldStartNewQuestion(block: MutableBlock) {
  return block.questionLines.length > 0 && (block.choices.length > 0 || Boolean(block.answerRaw));
}

function isLikelyChoiceLine(block: MutableBlock, match: RegExpMatchArray) {
  if (block.questionLines.length === 0 || block.section !== 'question' || block.answerRaw || block.choices.length >= 5) return false;
  const label = (match[1] || match[2] || '').normalize('NFKC').toUpperCase();
  const circledIndex = '①②③④⑤'.indexOf(label);
  const labelIndex = circledIndex >= 0
    ? circledIndex
    : /^[A-E]$/u.test(label)
      ? label.charCodeAt(0) - 65
      : /^[1-5]$/u.test(label)
        ? Number(label) - 1
        : -1;
  return labelIndex === block.choices.length;
}

function finalizeBlock(block: MutableBlock, index: number): BulkQuestionDraft {
  const choices = block.choices.filter((choice) => choice.trim()).slice(0, 5);
  const answerIndex = resolveAnswerIndex(block.answerRaw, choices);
  const draft: BulkQuestionDraft = {
    id: `bulk-${index + 1}`,
    question: block.questionLines.join('\n').trim(),
    choices,
    answerIndex,
    explanation: block.explanationLines.join('\n').trim(),
    category: block.category,
    sourcePage: block.sourcePage,
    issues: [],
  };
  draft.issues = getDraftIssues(draft);
  return draft;
}

function resolveAnswerIndex(rawAnswer: string, choices: string[]): number | null {
  const answer = cleanInline(rawAnswer);
  if (!answer) return null;
  const normalized = answer.normalize('NFKC').replace(/^[（(]|[）)]$/gu, '').trim();
  const label = normalized.match(/^([A-Ea-e1-5])(?:\s|$|[.)）．:：])/u)?.[1] ?? (normalized.length === 1 ? normalized : '');
  if (/^[A-Ea-e]$/u.test(label)) {
    const index = label.toUpperCase().charCodeAt(0) - 65;
    return index < choices.length ? index : null;
  }
  if (/^[1-5]$/u.test(label)) {
    const index = Number(label) - 1;
    return index < choices.length ? index : null;
  }
  const exactIndex = choices.findIndex((choice) => choice.trim() === normalized);
  return exactIndex >= 0 ? exactIndex : null;
}

function cleanInline(value: string) {
  return value.replace(/^\*+|\*+$/gu, '').trim();
}

function normalizeHeader(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]/gu, '');
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}
