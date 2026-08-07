import { useMemo, useRef, useState } from 'react';
import type { AppData, Difficulty, ProblemSetCreationMethod } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { ChevronRightIcon, CopyIcon, DocumentOutlineIcon, PlusIcon, UploadIcon } from '../components/UiIcons';
import { parseBulkQuestionText, parseQuestionCsv, getDraftIssues, type BulkQuestionDraft } from '../utils/bulkQuestionParser';
import {
  CHATGPT_MATERIAL_TEMPLATE_PROMPT,
  CHATGPT_PAST_EXAM_TEMPLATE_PROMPT,
  validateImportJson,
} from '../utils/importValidator';
import { writeClipboardText } from '../utils/nativePlatform';
import './CreateProblemSetScreen.css';

export interface CreateProblemSetSubmission {
  folderId: string;
  newFolderName: string;
  title: string;
  description: string;
  subject: string;
  audience: string;
  difficulty: Difficulty;
  source: string;
  creationMethod: ProblemSetCreationMethod;
  sourceSetId?: string;
  questions: BulkQuestionDraft[];
}

interface CreateProblemSetScreenProps {
  data: AppData;
  onBack: () => void;
  onSave: (submission: CreateProblemSetSubmission) => Promise<string | null>;
  onOpenLegacyImport: (folderId: string) => void;
  onImportBackup: (file: File) => Promise<string | null>;
}

type CreationView = 'methods' | 'manual' | 'bulk' | 'chatgpt' | 'copy' | 'other';

interface SetMeta {
  folderId: string;
  newFolderName: string;
  title: string;
  description: string;
  subject: string;
  audience: string;
  difficulty: Difficulty;
  source: string;
}

export function CreateProblemSetScreen({ data, onBack, onSave, onOpenLegacyImport, onImportBackup }: CreateProblemSetScreenProps) {
  const [view, setView] = useState<CreationView>('methods');
  const [meta, setMeta] = useState<SetMeta>(() => createInitialMeta(data));
  const [drafts, setDrafts] = useState<BulkQuestionDraft[]>([]);
  const [questionEditor, setQuestionEditor] = useState<BulkQuestionDraft>(() => createBlankDraft('manual-editor'));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [sourceSetId, setSourceSetId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState<'material' | 'past-exam' | ''>('');
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const reviewedDrafts = useMemo(() => drafts.map(refreshIssues), [drafts]);
  const needsReviewCount = reviewedDrafts.filter((draft) => draft.issues.length > 0).length;
  const creationMethod: ProblemSetCreationMethod = sourceSetId
    ? 'copy'
    : view === 'chatgpt'
      ? 'chatgpt'
      : view === 'bulk'
        ? 'bulk'
        : 'manual';

  const goTo = (next: CreationView) => {
    setError('');
    setView(next);
  };

  const addOrUpdateQuestion = () => {
    const nextQuestion = refreshIssues(questionEditor);
    if (nextQuestion.issues.length > 0) {
      setQuestionEditor(nextQuestion);
      setError(nextQuestion.issues.join('。'));
      return;
    }
    if (editingIndex === null) setDrafts((items) => [...items, { ...nextQuestion, id: `manual-${items.length + 1}` }]);
    else setDrafts((items) => items.map((item, index) => index === editingIndex ? { ...nextQuestion, id: item.id } : item));
    setQuestionEditor(createBlankDraft(`manual-${drafts.length + 2}`));
    setEditingIndex(null);
    setError('');
  };

  const editQuestion = (index: number) => {
    const target = reviewedDrafts[index];
    if (!target) return;
    setQuestionEditor({ ...target, choices: [...target.choices] });
    setEditingIndex(index);
    document.querySelector<HTMLElement>('.app-layout__scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const parsePastedContent = () => {
    if (!pasteText.trim()) {
      setError('貼り付ける内容を入力してください。');
      return;
    }
    const generated = parseGeneratedContent(pasteText);
    if (generated.questions.length === 0) {
      setError('問題を読み取れませんでした。問題文、選択肢、正解を分けて入力してください。');
      return;
    }
    setDrafts(generated.questions.map(normalizeEditableChoices));
    setError('');
  };

  const submit = async () => {
    const metaError = getMetaError(meta);
    if (metaError) {
      setError(metaError);
      return;
    }
    const finalDrafts = reviewedDrafts.map(normalizeEditableChoices).map(refreshIssues);
    if (finalDrafts.length === 0) {
      setError('1問以上追加してください。');
      return;
    }
    if (finalDrafts.some((draft) => draft.issues.length > 0)) {
      setDrafts(finalDrafts);
      setError('確認が必要な問題を修正してください。正解は自動では決めません。');
      return;
    }
    setBusy(true);
    setError('');
    const saveError = await onSave({ ...meta, creationMethod, sourceSetId, questions: finalDrafts });
    if (saveError) setError(saveError);
    setBusy(false);
  };

  const chooseCopySource = (setId: string) => {
    const problemSet = data.problemSets.find((set) => set.id === setId);
    if (!problemSet) return;
    const copiedQuestions = data.questions
      .filter((question) => question.setId === setId)
      .map((question, index) => refreshIssues({
        id: `copy-${index + 1}`,
        question: question.question,
        choices: [...question.choices],
        answerIndex: question.answerIndex,
        explanation: question.explanation,
        category: question.category,
        sourcePage: question.sourcePage,
        issues: [],
      }));
    setMeta({
      folderId: problemSet.folderId,
      newFolderName: '',
      title: `${problemSet.title}のコピー`,
      description: problemSet.description ?? '',
      subject: problemSet.subject ?? '',
      audience: problemSet.audience ?? '',
      difficulty: problemSet.difficulty ?? 'basic',
      source: problemSet.source,
    });
    setDrafts(copiedQuestions);
    setSourceSetId(problemSet.id);
    setView('manual');
    setError('');
  };

  const handleCsvFile = async (file: File) => {
    const result = parseQuestionCsv(await file.text());
    if (result.questions.length === 0) {
      setError('CSVから問題を読み取れませんでした。見出しに「問題文、選択肢1〜4、正解」を含めてください。');
      return;
    }
    setDrafts(result.questions.map(normalizeEditableChoices));
    setPasteText('');
    setView('bulk');
    setError('');
  };

  const copyChatGptTemplate = async (template: string, kind: 'material' | 'past-exam') => {
    try {
      await writeClipboardText(template);
      setCopiedTemplate(kind);
      window.setTimeout(() => setCopiedTemplate(''), 2200);
    } catch {
      setError('指示文をコピーできませんでした。');
    }
  };

  return (
    <Layout>
      <main className="create-set">
        <header className="create-set__header">
          <BackButton onClick={view === 'methods' ? onBack : () => goTo('methods')} label={view === 'methods' ? 'ホームへ戻る' : '作成方法へ戻る'} />
          <div>
            <h1>{getViewTitle(view, sourceSetId)}</h1>
          </div>
        </header>

        {view === 'methods' ? <MethodChooser onSelect={goTo} /> : null}

        {view === 'manual' ? (
          <div className="create-set__flow">
            {sourceSetId ? <p className="create-set__notice">コピーした内容を編集してから、新しい問題セットとして保存します。</p> : null}
            <SetMetaFields data={data} value={meta} onChange={setMeta} />
            <section className="create-set__panel">
              <div className="create-set__section-heading">
                <div><span>問題 {drafts.length + 1}</span><h2>{editingIndex === null ? '問題を追加' : `${editingIndex + 1}問目を編集中`}</h2></div>
                {editingIndex !== null ? <button type="button" className="create-set__text-button" onClick={() => { setEditingIndex(null); setQuestionEditor(createBlankDraft('manual-editor')); }}>編集をやめる</button> : null}
              </div>
              <QuestionFields value={questionEditor} onChange={setQuestionEditor} />
              <button type="button" className="create-set__primary" onClick={addOrUpdateQuestion}>
                {editingIndex === null ? '追加して次の問題へ' : '変更を反映'}
              </button>
            </section>
            <DraftList drafts={reviewedDrafts} onEdit={editQuestion} onDelete={(index) => setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))} />
            <SaveBar count={reviewedDrafts.length} busy={busy} disabled={reviewedDrafts.length === 0} onSave={() => void submit()} />
          </div>
        ) : null}

        {(view === 'bulk' || view === 'chatgpt') ? (
          <div className="create-set__flow">
            {view === 'chatgpt' ? (
              <section className="create-set__panel create-set__template-panel" aria-labelledby="create-template-title">
                <div className="create-set__template-heading">
                  <span>1</span>
                  <div>
                    <h2 id="create-template-title">指示文をコピー</h2>
                    <p>用途を選び、コピーした指示文と資料をChatGPTへ貼り付けます。</p>
                  </div>
                </div>
                <div className="create-set__template-actions">
                  <button type="button" onClick={() => void copyChatGptTemplate(CHATGPT_MATERIAL_TEMPLATE_PROMPT, 'material')}>
                    <CopyIcon /><span><strong>資料から問題を作る</strong><small>{copiedTemplate === 'material' ? 'コピーしました' : '教科書・講義資料・文章向け'}</small></span>
                  </button>
                  <button type="button" onClick={() => void copyChatGptTemplate(CHATGPT_PAST_EXAM_TEMPLATE_PROMPT, 'past-exam')}>
                    <CopyIcon /><span><strong>過去問をまとめる</strong><small>{copiedTemplate === 'past-exam' ? 'コピーしました' : '複数年度の過去問向け'}</small></span>
                  </button>
                </div>
                <p className="create-set__template-next"><b>2</b> ChatGPTで作成したら、下の入力欄へ結果を貼り付けてください。</p>
              </section>
            ) : null}
            <SetMetaFields data={data} value={meta} onChange={setMeta} />
            <section className="create-set__panel">
              <h2>{view === 'chatgpt' ? '作成された内容を貼り付ける' : '複数の問題を貼り付ける'}</h2>
              <p className="create-set__hint">問題文、選択肢、正解、解説をまとめて貼り付けます。正解が読み取れない場合は未確定のまま表示します。</p>
              <textarea className="create-set__paste" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={'1. 問題文\nA. 選択肢\nB. 選択肢\nC. 選択肢\nD. 選択肢\n正解: B\n解説: ...'} />
              <button type="button" className="create-set__primary" onClick={parsePastedContent}>読み取って確認</button>
            </section>
            {reviewedDrafts.length > 0 ? (
              <section className="create-set__review" aria-label="読み取り結果">
                <div className="create-set__review-summary">
                  <div><strong>{reviewedDrafts.length - needsReviewCount}</strong><span>保存できる問題</span></div>
                  <div className={needsReviewCount ? 'create-set__summary-warning' : ''}><strong>{needsReviewCount}</strong><span>確認が必要</span></div>
                </div>
                <p>問題のあるカードだけ開いて修正できます。</p>
                {reviewedDrafts.map((draft, index) => (
                  <InlineDraftCard
                    key={draft.id}
                    index={index}
                    value={draft}
                    onChange={(next) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? next : item))}
                    onDelete={() => setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  />
                ))}
              </section>
            ) : null}
            {reviewedDrafts.length > 0 ? <SaveBar count={reviewedDrafts.length} busy={busy} disabled={needsReviewCount > 0} onSave={() => void submit()} /> : null}
          </div>
        ) : null}

        {view === 'copy' ? (
          <section className="create-set__panel create-set__copy-list">
            {data.problemSets.length === 0 ? <p>コピーできる問題セットがまだありません。</p> : data.problemSets.map((problemSet) => {
              const questionCount = data.questions.filter((question) => question.setId === problemSet.id).length;
              return (
                <button key={problemSet.id} type="button" className="create-set__method" onClick={() => chooseCopySource(problemSet.id)}>
                  <span><strong>{problemSet.title}</strong><small>{questionCount}問・コピー後に編集できます</small></span><ChevronRightIcon />
                </button>
              );
            })}
          </section>
        ) : null}

        {view === 'other' ? (
          <section className="create-set__panel create-set__other">
            <SetMetaFields data={data} value={meta} onChange={setMeta} compact />
            <button type="button" className="create-set__method" onClick={() => onOpenLegacyImport(meta.folderId)}>
              <span className="create-set__method-icon"><DocumentOutlineIcon /></span><span><strong>問題セットファイルを読み込む</strong><small>従来形式の問題データを追加</small></span><ChevronRightIcon />
            </button>
            <button type="button" className="create-set__method" onClick={() => csvInputRef.current?.click()}>
              <span className="create-set__method-icon"><UploadIcon /></span><span><strong>CSVを読み込む</strong><small>読み取った後に問題ごとに確認</small></span><ChevronRightIcon />
            </button>
            <button type="button" className="create-set__method" onClick={() => backupInputRef.current?.click()}>
              <span className="create-set__method-icon"><UploadIcon /></span><span><strong>バックアップから復元</strong><small>フォルダや学習履歴を含む全データ</small></span><ChevronRightIcon />
            </button>
            <input ref={csvInputRef} className="create-set__hidden-input" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleCsvFile(file); }} />
            <input ref={backupInputRef} className="create-set__hidden-input" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onImportBackup(file).then((message) => setError(message ?? '')); }} />
          </section>
        ) : null}

        {error ? <div className="create-set__error" role="alert">{error}</div> : null}
      </main>
    </Layout>
  );
}

function MethodChooser({ onSelect }: { onSelect: (view: CreationView) => void }) {
  const methods: Array<{ view: CreationView; title: string; detail: string; icon: React.ReactNode }> = [
    { view: 'manual', title: '1問ずつ作る', detail: '選択肢と正解を確認しながら追加', icon: <PlusIcon /> },
    { view: 'bulk', title: 'まとめて貼り付ける', detail: '文章から複数問題を読み取って確認', icon: <DocumentOutlineIcon /> },
    { view: 'chatgpt', title: 'ChatGPTなどから貼り付ける', detail: '作成された内容を確認して保存', icon: <CopyIcon /> },
    { view: 'copy', title: '既存問題セットをコピー', detail: '独立したコピーを作って編集', icon: <CopyIcon /> },
    { view: 'other', title: 'その他の方法', detail: 'ファイル、CSV、バックアップ', icon: <UploadIcon /> },
  ];
  return <section className="create-set__methods" aria-label="作成方法">{methods.map((method) => <button key={method.view} type="button" className="create-set__method" onClick={() => onSelect(method.view)}><span className="create-set__method-icon">{method.icon}</span><span><strong>{method.title}</strong><small>{method.detail}</small></span><ChevronRightIcon /></button>)}</section>;
}

function SetMetaFields({ data, value, onChange, compact = false }: { data: AppData; value: SetMeta; onChange: (value: SetMeta) => void; compact?: boolean }) {
  const useNewFolder = !value.folderId;
  return (
    <section className={`create-set__panel${compact ? ' create-set__panel--compact' : ''}`}>
      {!compact ? <h2>問題セットの基本情報</h2> : <h2>追加先</h2>}
      <label className="create-set__field"><span>フォルダ</span><select value={value.folderId || '__new__'} onChange={(event) => onChange({ ...value, folderId: event.target.value === '__new__' ? '' : event.target.value })}>{data.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}<option value="__new__">新しいフォルダを作る</option></select></label>
      {useNewFolder ? <label className="create-set__field"><span>新しいフォルダ名</span><input value={value.newFolderName} onChange={(event) => onChange({ ...value, newFolderName: event.target.value })} placeholder="例：英語" /></label> : null}
      {!compact ? <>
        <label className="create-set__field"><span>問題セット名 <b>必須</b></span><input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="例：英単語テスト" /></label>
        <label className="create-set__field"><span>説明</span><textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} placeholder="何を学ぶ問題セットか" /></label>
        <div className="create-set__field-grid">
          <label className="create-set__field"><span>科目・分類</span><input value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} placeholder="英語" /></label>
          <label className="create-set__field"><span>対象</span><input value={value.audience} onChange={(event) => onChange({ ...value, audience: event.target.value })} placeholder="大学受験" /></label>
        </div>
        <label className="create-set__field"><span>難易度</span><select value={value.difficulty} onChange={(event) => onChange({ ...value, difficulty: event.target.value })}><option value="basic">基礎</option><option value="standard">標準</option><option value="advanced">発展</option></select></label>
        <label className="create-set__field"><span>作成元・資料名</span><input value={value.source} onChange={(event) => onChange({ ...value, source: event.target.value })} placeholder="任意" /></label>
      </> : null}
    </section>
  );
}

function QuestionFields({ value, onChange }: { value: BulkQuestionDraft; onChange: (value: BulkQuestionDraft) => void }) {
  const choices = normalizeEditableChoices(value).choices;
  return (
    <div className="create-set__question-fields">
      <label className="create-set__field"><span>問題文 <b>必須</b></span><textarea value={value.question} onChange={(event) => onChange({ ...value, question: event.target.value })} placeholder="問題文を入力" /></label>
      <fieldset className="create-set__choices"><legend>選択肢と正解 <b>必須</b></legend>{choices.map((choice, index) => <div key={index} className="create-set__choice-row"><input type="radio" name={`correct-${value.id}`} checked={value.answerIndex === index} onChange={() => onChange({ ...value, choices, answerIndex: index })} aria-label={`${index + 1}番を正解にする`} /><input value={choice} onChange={(event) => onChange({ ...value, choices: choices.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} placeholder={`選択肢 ${index + 1}`} />{index === 4 ? <button type="button" aria-label="5番目の選択肢を削除" onClick={() => onChange({ ...value, choices: choices.slice(0, 4), answerIndex: value.answerIndex === 4 ? null : value.answerIndex })}>×</button> : null}</div>)}{choices.length === 4 ? <button type="button" className="create-set__text-button" onClick={() => onChange({ ...value, choices: [...choices, ''] })}>＋ 5番目の選択肢</button> : null}</fieldset>
      <label className="create-set__field"><span>解説</span><textarea value={value.explanation} onChange={(event) => onChange({ ...value, explanation: event.target.value })} placeholder="後から追加できます" /></label>
      <div className="create-set__field-grid"><label className="create-set__field"><span>分類</span><input value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} placeholder="任意" /></label><label className="create-set__field"><span>参照</span><input value={value.sourcePage} onChange={(event) => onChange({ ...value, sourcePage: event.target.value })} placeholder="任意" /></label></div>
      {value.issues.length > 0 ? <ul className="create-set__issues">{value.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
    </div>
  );
}

function DraftList({ drafts, onEdit, onDelete }: { drafts: BulkQuestionDraft[]; onEdit: (index: number) => void; onDelete: (index: number) => void }) {
  if (drafts.length === 0) return null;
  return <section className="create-set__panel"><div className="create-set__section-heading"><div><span>追加済み</span><h2>{drafts.length}問</h2></div></div><div className="create-set__draft-list">{drafts.map((draft, index) => <article key={draft.id} className="create-set__draft"><span>{index + 1}</span><div><strong>{draft.question}</strong><small>正解：{draft.answerIndex === null ? '未確認' : draft.choices[draft.answerIndex]}</small></div><button type="button" onClick={() => onEdit(index)}>編集</button><button type="button" className="create-set__delete" onClick={() => onDelete(index)}>削除</button></article>)}</div></section>;
}

function InlineDraftCard({ index, value, onChange, onDelete }: { index: number; value: BulkQuestionDraft; onChange: (value: BulkQuestionDraft) => void; onDelete: () => void }) {
  return <details className={`create-set__review-card${value.issues.length ? ' create-set__review-card--warning' : ''}`} open={value.issues.length > 0}><summary><span>{index + 1}</span><div><strong>{value.question || '問題文が未入力です'}</strong><small>{value.issues.length ? `要確認：${value.issues.join('・')}` : '確認済み'}</small></div></summary><QuestionFields value={value} onChange={(next) => onChange(refreshIssues(next))} /><button type="button" className="create-set__delete-draft" onClick={onDelete}>この問題を削除</button></details>;
}

function SaveBar({ count, busy, disabled, onSave }: { count: number; busy: boolean; disabled: boolean; onSave: () => void }) {
  return <div className="create-set__save-bar"><span>{count}問</span><button type="button" className="create-set__primary" disabled={busy || disabled} onClick={onSave}>{busy ? '保存中…' : '問題セットを保存'}</button></div>;
}

function createInitialMeta(data: AppData): SetMeta {
  return { folderId: data.folders[0]?.id ?? '', newFolderName: data.folders.length ? '' : 'マイ問題セット', title: '', description: '', subject: '', audience: '', difficulty: 'basic', source: '' };
}

function createBlankDraft(id: string): BulkQuestionDraft {
  return { id, question: '', choices: ['', '', '', ''], answerIndex: null, explanation: '', category: '', sourcePage: '', issues: [] };
}

function refreshIssues(draft: BulkQuestionDraft): BulkQuestionDraft {
  return { ...draft, issues: getDraftIssues(draft) };
}

function normalizeEditableChoices(draft: BulkQuestionDraft): BulkQuestionDraft {
  const choices = [...draft.choices];
  while (choices.length < 4) choices.push('');
  return { ...draft, choices: choices.slice(0, 5) };
}

function parseGeneratedContent(text: string) {
  const jsonResult = validateImportJson(text);
  if (jsonResult.ok) {
    const questions = jsonResult.value.questions.map((question, index) => refreshIssues({ id: `generated-${index + 1}`, question: question.question, choices: [...question.choices], answerIndex: question.answerIndex ?? question.answerIndexes?.[0] ?? null, explanation: question.explanation, category: question.category ?? '', sourcePage: question.sourcePage ?? question.reference ?? '', issues: [] }));
    return { questions };
  }
  return parseBulkQuestionText(text);
}

function getMetaError(meta: SetMeta) {
  if (!meta.folderId && !meta.newFolderName.trim()) return '追加先のフォルダ名を入力してください。';
  if (!meta.title.trim()) return '問題セット名を入力してください。';
  return '';
}

function getViewTitle(view: CreationView, sourceSetId?: string) {
  if (view === 'methods') return '問題セットを作る';
  if (view === 'manual') return sourceSetId ? 'コピーを編集' : '1問ずつ作る';
  if (view === 'bulk') return 'まとめて貼り付ける';
  if (view === 'chatgpt') return '作成内容を貼り付ける';
  if (view === 'copy') return 'コピー元を選ぶ';
  return 'その他の方法';
}
