import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppData, Folder } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Layout } from '../components/Layout';
import {
  CheckIcon,
  ChevronRightIcon,
  FolderOutlineIcon,
  PlusIcon,
  TrashIcon,
} from '../components/UiIcons';
import { buildAppDataView } from '../utils/appDataView';
import { formatDisplayDate } from '../utils/date';
import './HomeScreen.css';

interface HomeScreenProps {
  data: AppData;
  onCreateFolder: (name: string) => void;
  onCreateSample: () => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenFolder: (folderId: string) => void;
}

export function HomeScreen({
  data,
  onCreateFolder,
  onCreateSample,
  onDeleteFolder,
  onOpenFolder,
}: HomeScreenProps) {
  const [folderName, setFolderName] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const folders = useMemo(() => buildAppDataView(data).folders, [data]);

  const handleCreateFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setFolderName('');
    setCreateOpen(false);
  };

  return (
    <Layout>
      <div className="quiz-home">
        <header className="quiz-home__header">
          <h1 className="quiz-home__title">Quiz Make</h1>
        </header>

        <section className="quiz-home__actions" aria-label="ホーム操作">
          <HomeCircleButton active={editMode} icon={editMode ? 'done' : 'delete'} label={editMode ? '完了' : '削除'} onClick={() => setEditMode((value) => !value)} />
          <HomeCircleButton icon="add" label="フォルダ" onClick={() => setCreateOpen(true)} />
        </section>

        <section className="quiz-home__folder-list" aria-label="フォルダ一覧">
          {folders.length === 0 ? (
            <div className="quiz-home__empty">
              <div className="quiz-home__empty-icon" aria-hidden="true"><PlusIcon size={24} /></div>
              <h2>学習フォルダを作りましょう</h2>
              <p>科目や試験ごとに整理すると、問題と復習記録を探しやすくなります。</p>
              <div className="quiz-home__empty-actions">
                <button type="button" onClick={onCreateSample}>サンプルで試す</button>
                <button type="button" className="quiz-home__empty-secondary" onClick={() => setCreateOpen(true)}>自分のフォルダを作る</button>
              </div>
            </div>
          ) : folders.map(({ folder, ...summary }) => {
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
            <span aria-label={`問題セット ${setCount}`}>📁 {setCount}</span>
            <span aria-label={`問題 ${questionCount}`}>🏷 {questionCount}</span>
            <span aria-label={`復習 ${reviewCount}`}>🔖 {reviewCount}</span>
            <span aria-label={`正答率 ${correctRate}%`}>✅ {correctRate}%</span>
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

  return createPortal(
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
    </div>,
    document.body,
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
