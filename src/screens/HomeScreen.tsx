import { useEffect, useId, useRef, useState } from 'react';
import type { AppData, Folder } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Layout } from '../components/Layout';
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  DocumentOutlineIcon,
  DownloadIcon,
  FolderOutlineIcon,
  MenuIcon,
  PlusIcon,
  QuizMakeMarkIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from '../components/UiIcons';
import { formatDisplayDate } from '../utils/date';
import { CHATGPT_MATERIAL_TEMPLATE_PROMPT, CHATGPT_PAST_EXAM_TEMPLATE_PROMPT } from '../utils/importValidator';
import { isReviewTarget } from '../utils/reviewTargets';
import { writeClipboardText } from '../utils/nativePlatform';
import './HomeScreen.css';

interface HomeScreenProps {
  data: AppData;
  onCreateFolder: (name: string) => void;
  onCreateSample: () => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onExport: () => void;
  onImportBackup: (file: File) => Promise<string | null>;
  onClearAll: () => void;
  onOpenSync: () => void;
  onOpenPrivacy: () => void;
  onCreateProblemSet: () => void;
  onOpenCommunity: () => void;
}

export function HomeScreen({
  data,
  onCreateFolder,
  onCreateSample,
  onDeleteFolder,
  onOpenFolder,
  onExport,
  onImportBackup,
  onClearAll,
  onOpenSync,
  onOpenPrivacy,
  onCreateProblemSet,
  onOpenCommunity,
}: HomeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [folderName, setFolderName] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState('');

  const handleCreateFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setFolderName('');
    setCreateOpen(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const error = await onImportBackup(file);
    setImportError(error ?? '');
  };

  const handleCopyTemplate = async (template: string, label: string) => {
    try {
      await writeClipboardText(template);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setImportError('テンプレートのコピーに失敗しました。');
    }
  };

  return (
    <Layout>
      <div className="quiz-home">
        <header className="quiz-home__header">
          <div className="quiz-home__header-slope" />
          <span className="quiz-home__brand-icon" aria-hidden="true"><QuizMakeMarkIcon size={30} /></span>
          <h1 className="quiz-home__title">Quiz make</h1>
          <button type="button" className="quiz-home__menu-button" aria-label="メニュー" onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </button>
        </header>

        <button type="button" className="quiz-home__create-set" onClick={onCreateProblemSet}>
          <span aria-hidden="true"><PlusIcon size={22} /></span>
          <span><strong>問題セットを作る</strong><small>1問ずつ・まとめて貼り付け・コピー</small></span>
          <ChevronRightIcon />
        </button>

        <button type="button" className="quiz-home__community-link" onClick={onOpenCommunity}>
          <span aria-hidden="true">⌕</span>
          <span><strong>問題セットを見つける・共有する</strong><small>公開セット、グループ、復習</small></span>
          <ChevronRightIcon />
        </button>

        <section className="quiz-home__actions" aria-label="ホーム操作">
          <HomeCircleButton active={editMode} icon={editMode ? 'done' : 'delete'} label={editMode ? '完了' : '削除'} onClick={() => setEditMode((value) => !value)} />
          <HomeCircleButton icon="add" label="フォルダ" onClick={() => setCreateOpen(true)} />
        </section>

        <section className="quiz-home__folder-list" aria-label="フォルダ一覧">
          {data.folders.length === 0 ? (
            <div className="quiz-home__empty">
              <div className="quiz-home__empty-icon" aria-hidden="true"><PlusIcon size={24} /></div>
              <h2>学習フォルダを作りましょう</h2>
              <p>科目や試験ごとに整理すると、問題と復習記録を探しやすくなります。</p>
              <div className="quiz-home__empty-actions">
                <button type="button" onClick={onCreateSample}>サンプルで試す</button>
                <button type="button" className="quiz-home__empty-secondary" onClick={() => setCreateOpen(true)}>自分のフォルダを作る</button>
              </div>
            </div>
          ) : data.folders.map((folder) => {
            const summary = getFolderSummary(data, folder.id);
            return (
              <QuizHomeFolderItem
                key={folder.id}
                folder={folder}
                setCount={summary.setCount}
                questionCount={summary.questionCount}
                reviewCount={summary.reviewCount}
                correctRate={summary.correctRate}
                editMode={editMode}
                onOpen={() => onOpenFolder(folder.id)}
                onDelete={() => setDeleteTarget(folder)}
              />
            );
          })}
        </section>

        <input ref={fileInputRef} type="file" accept="application/json,.json" className="quiz-home__file-input" onChange={handleFileChange} />

        {createOpen ? (
          <CreateFolderDialog
            folderName={folderName}
            onChange={setFolderName}
            onCancel={() => {
              setCreateOpen(false);
              setFolderName('');
            }}
            onCreate={handleCreateFolder}
          />
        ) : null}

        {menuOpen ? (
          <HomeMenu
            copied={copied}
            importError={importError}
            onClose={() => setMenuOpen(false)}
            onExport={() => {
              setMenuOpen(false);
              onExport();
            }}
            onImport={() => {
              setMenuOpen(false);
              fileInputRef.current?.click();
            }}
            onCopyMaterialTemplate={() => handleCopyTemplate(CHATGPT_MATERIAL_TEMPLATE_PROMPT, '資料から問題作成')}
            onCopyPastExamTemplate={() => handleCopyTemplate(CHATGPT_PAST_EXAM_TEMPLATE_PROMPT, '過去問を集約')}
            onOpenSync={() => {
              setMenuOpen(false);
              onOpenSync();
            }}
            onOpenPrivacy={() => {
              setMenuOpen(false);
              onOpenPrivacy();
            }}
            onClearAll={() => {
              setMenuOpen(false);
              setClearConfirmOpen(true);
            }}
          />
        ) : null}

        <ConfirmDialog
          open={deleteTarget !== null}
          title="削除しますか？"
          message="このフォルダ内の問題セット、問題、学習記録、復習Levelもすべて削除されます。"
          confirmLabel="削除"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) onDeleteFolder(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />

        <ConfirmDialog
          open={clearConfirmOpen}
          title="削除しますか？"
          message="フォルダ、問題セット、問題、回答記録、復習Level、曖昧登録をすべて削除します。"
          confirmLabel="全データ削除"
          onCancel={() => setClearConfirmOpen(false)}
          onConfirm={() => {
            onClearAll();
            setClearConfirmOpen(false);
          }}
        />
      </div>
    </Layout>
  );
}

function HomeCircleButton({ active = false, icon, label, onClick }: { active?: boolean; icon: 'delete' | 'add' | 'done'; label: string; onClick: () => void }) {
  return (
    <button type="button" className="quiz-home__action" onClick={onClick}>
      <span className={`quiz-home__circle-button${active ? ' quiz-home__circle-button--active' : ''}`}>
        {icon === 'delete' ? <TrashIcon /> : icon === 'done' ? <CheckIcon /> : <PlusIcon />}
      </span>
      <span className="quiz-home__action-label">{label}</span>
    </button>
  );
}

function QuizHomeFolderItem({
  folder,
  setCount,
  questionCount,
  reviewCount,
  correctRate,
  editMode,
  onOpen,
  onDelete,
}: {
  folder: Folder;
  setCount: number;
  questionCount: number;
  reviewCount: number;
  correctRate: number;
  editMode: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="quiz-home__folder-card">
      <button type="button" className="quiz-home__folder-main" onClick={onOpen} disabled={editMode}>
        <span className="quiz-home__folder-icon" aria-hidden="true">
          <FolderOutlineIcon />
        </span>
        <span className="quiz-home__folder-body">
          <span className="quiz-home__folder-name">{folder.name}</span>
          <span className="quiz-home__folder-stats">
            <span>セット {setCount}</span>
            <span>問題 {questionCount}</span>
            <span>復習 {reviewCount}</span>
            <span>正答 {correctRate}%</span>
          </span>
          <span className="quiz-home__folder-date">更新 {formatDisplayDate(folder.updatedAt)}</span>
        </span>
        {!editMode ? <span className="quiz-home__folder-arrow"><ChevronRightIcon /></span> : null}
      </button>

      {editMode ? (
        <button type="button" className="quiz-home__delete-button" onClick={onDelete}>
          <TrashIcon size={18} />
          <span>削除</span>
        </button>
      ) : null}
    </article>
  );
}

function CreateFolderDialog({
  folderName,
  onChange,
  onCancel,
  onCreate,
}: {
  folderName: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const dialogRef = useModalFocus<HTMLFormElement>(onCancel);
  const titleId = useId();

  return (
    <div
      className="quiz-home__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={dialogRef}
        className="quiz-home__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <h2 id={titleId} className="quiz-home__sheet-title">フォルダを新規作成</h2>
        <input
          data-dialog-autofocus
          value={folderName}
          onChange={(event) => onChange(event.target.value)}
          className="quiz-home__input"
          placeholder="フォルダ名"
          aria-label="フォルダ名"
        />
        <div className="quiz-home__sheet-actions">
          <button type="button" className="quiz-home__sheet-button" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="quiz-home__sheet-button quiz-home__sheet-button--primary" disabled={!folderName.trim()}>
            作成
          </button>
        </div>
      </form>
    </div>
  );
}

function HomeMenu({
  copied,
  importError,
  onClose,
  onExport,
  onImport,
  onCopyMaterialTemplate,
  onCopyPastExamTemplate,
  onOpenSync,
  onOpenPrivacy,
  onClearAll,
}: {
  copied: string;
  importError: string;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onCopyMaterialTemplate: () => void;
  onCopyPastExamTemplate: () => void;
  onOpenSync: () => void;
  onOpenPrivacy: () => void;
  onClearAll: () => void;
}) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);
  const titleId = useId();

  return (
    <div className="quiz-home__overlay" onClick={onClose}>
      <div ref={dialogRef} className="quiz-home__menu" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="quiz-home__menu-header">
          <div>
            <h2 id={titleId}>メニュー</h2>
            <p>問題作成とデータ管理</p>
          </div>
          <button data-dialog-autofocus type="button" className="quiz-home__menu-close" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="quiz-home__menu-section" aria-labelledby="template-menu-title">
          <h3 id="template-menu-title">ChatGPTで問題を作る</h3>
          <p className="quiz-home__menu-help">指示文をコピーしたあと、ChatGPTの入力欄に貼り付けて資料や過去問を送ります。</p>
          <button type="button" className="quiz-home__menu-item quiz-home__menu-item--template" onClick={onCopyMaterialTemplate}>
            <span className="quiz-home__menu-item-icon"><CopyIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>資料から問題を作る</strong>
              <small>教科書・講義資料・文章向け</small>
            </span>
            <span className="quiz-home__menu-item-state">{copied === '資料から問題作成' ? 'コピー済み' : 'コピー'}</span>
          </button>
          <button type="button" className="quiz-home__menu-item quiz-home__menu-item--template" onClick={onCopyPastExamTemplate}>
            <span className="quiz-home__menu-item-icon"><CopyIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>過去問をまとめる</strong>
              <small>複数年度の過去問を整理する場合</small>
            </span>
            <span className="quiz-home__menu-item-state">{copied === '過去問を集約' ? 'コピー済み' : 'コピー'}</span>
          </button>
        </section>

        <section className="quiz-home__menu-section" aria-labelledby="app-info-menu-title">
          <h3 id="app-info-menu-title">アプリ情報</h3>
          <button type="button" className="quiz-home__menu-item" onClick={onOpenPrivacy}>
            <span className="quiz-home__menu-item-icon"><DocumentOutlineIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>プライバシーポリシー</strong>
              <small>保存されるデータと削除方法を確認</small>
            </span>
            <ChevronRightIcon size={18} />
          </button>
        </section>

        <section className="quiz-home__menu-section" aria-labelledby="data-menu-title">
          <h3 id="data-menu-title">データ管理</h3>
          <button type="button" className="quiz-home__menu-item" onClick={onOpenSync}>
            <span className="quiz-home__menu-item-icon"><SyncIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>端末間の同期</strong>
              <small>スマホやPCで同じデータを使う</small>
            </span>
            <ChevronRightIcon size={18} />
          </button>
          <button type="button" className="quiz-home__menu-item" onClick={onExport}>
            <span className="quiz-home__menu-item-icon"><DownloadIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>バックアップを書き出す</strong>
              <small>現在のデータをJSONで保存</small>
            </span>
          </button>
          <button type="button" className="quiz-home__menu-item" onClick={onImport}>
            <span className="quiz-home__menu-item-icon"><UploadIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>バックアップを読み込む</strong>
              <small>保存したJSONから復元</small>
            </span>
          </button>
        </section>

        <details className="quiz-home__menu-more">
          <summary>その他</summary>
          <button type="button" className="quiz-home__menu-item quiz-home__menu-item--danger" onClick={onClearAll}>
            <span className="quiz-home__menu-item-icon"><TrashIcon /></span>
            <span className="quiz-home__menu-item-text">
              <strong>全データを削除</strong>
              <small>フォルダ・問題・学習記録を消去</small>
            </span>
          </button>
        </details>

        {copied ? <div className="quiz-home__menu-notice">コピーしました。次にChatGPTを開き、入力欄へ貼り付けてください。</div> : null}
        {importError ? <div className="quiz-home__menu-error">{importError}</div> : null}
      </div>
    </div>
  );
}

function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>('[data-dialog-autofocus]');
      const first = dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
      (preferred ?? first)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return dialogRef;
}

function getFolderSummary(data: AppData, folderId: string) {
  const sets = data.problemSets.filter((set) => set.folderId === folderId);
  const setIds = new Set(sets.map((set) => set.id));
  const questions = data.questions.filter((question) => setIds.has(question.setId));
  const questionIds = new Set(questions.map((question) => question.id));
  const progress = data.progress.filter((item) => questionIds.has(item.questionId));
  const logs = data.answerLogs.filter((log) => log.folderId === folderId);
  const correct = logs.filter((log) => log.isCorrect).length;

  return {
    setCount: sets.length,
    questionCount: questions.length,
    reviewCount: progress.filter(isReviewTarget).length,
    correctRate: logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100),
  };
}
