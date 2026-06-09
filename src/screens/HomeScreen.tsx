import { useRef, useState } from 'react';
import type { AppData, Folder, StudyStats } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FolderCard } from '../components/FolderCard';
import { Layout } from '../components/Layout';
import { CHATGPT_TEMPLATE_PROMPT } from '../utils/importValidator';

interface HomeScreenProps {
  data: AppData;
  stats: StudyStats;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onStartReview: () => void;
  onExport: () => void;
  onImportBackup: (file: File) => Promise<string | null>;
  onClearAll: () => void;
}

export function HomeScreen({
  data,
  stats,
  onCreateFolder,
  onDeleteFolder,
  onOpenFolder,
  onStartReview,
  onExport,
  onImportBackup,
  onClearAll,
}: HomeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [folderName, setFolderName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [importError, setImportError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleAddFolder = () => {
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

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_TEMPLATE_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setImportError('テンプレートのコピーに失敗しました。ブラウザのコピー権限を確認してください。');
    }
  };

  return (
    <Layout>
      <HomeHeader onOpenMenu={() => setMenuOpen(true)} />

      <main className="flex min-h-0 flex-1 flex-col bg-[#050505]">
        <section className="shrink-0 px-4 pt-4">
          <div className="flex justify-center gap-6">
            <RoundActionButton
              label={editMode ? '完了' : '編集'}
              icon={editMode ? '✓' : '✎'}
              active={editMode}
              onClick={() => setEditMode((value) => !value)}
            />
            <RoundActionButton label="新規作成" icon="＋" onClick={() => setCreateOpen(true)} />
          </div>
        </section>

        <section className="shrink-0 px-4 pt-4">
          <StudyStatsCard stats={stats} />
          <button
            type="button"
            onClick={onStartReview}
            disabled={stats.reviewCount === 0}
            className={`mt-3 flex h-[52px] w-full items-center justify-center rounded-2xl text-sm font-bold text-white active:scale-[0.98] disabled:text-neutral-500 ${
              stats.reviewCount > 0 ? 'bg-[#14B8B8]' : 'bg-[#2A2A2A]'
            }`}
          >
            <span>復習する</span>
            <span className="ml-2 text-[11px] font-semibold text-white/75">Level順</span>
          </button>
          {importError ? (
            <div className="mt-3 max-h-20 overflow-y-auto rounded-2xl bg-rose-500/15 p-3 text-xs font-semibold leading-relaxed text-rose-200 no-scrollbar">
              {importError}
            </div>
          ) : null}
        </section>

        <section className="mt-4 flex min-h-0 flex-1 flex-col px-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">フォルダ</h2>
            <span className="text-sm font-semibold text-[#A3A3A3]">{data.folders.length}件</span>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3 no-scrollbar">
            {data.folders.length === 0 ? (
              <EmptyFolderState onCreate={() => setCreateOpen(true)} />
            ) : (
              data.folders.map((folder) => {
                const summary = getFolderSummary(data, folder.id);
                return (
                  <FolderCard
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
              })
            )}
          </div>
        </section>
      </main>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFileChange} />

      {createOpen ? (
        <AddFolderSheet
          folderName={folderName}
          onChange={setFolderName}
          onCancel={() => {
            setCreateOpen(false);
            setFolderName('');
          }}
          onCreate={handleAddFolder}
        />
      ) : null}

      {menuOpen ? (
        <HomeMenu
          copied={copied}
          onClose={() => setMenuOpen(false)}
          onExport={() => {
            setMenuOpen(false);
            onExport();
          }}
          onImport={() => {
            setMenuOpen(false);
            fileInputRef.current?.click();
          }}
          onCopyTemplate={handleCopyTemplate}
          onClearAll={() => {
            setMenuOpen(false);
            setClearConfirmOpen(true);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="フォルダを削除しますか？"
        message="このフォルダ内の問題セット、問題、学習記録、復習レベルもすべて削除されます。"
        confirmLabel="削除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteFolder(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        title="全データを削除しますか？"
        message="フォルダ、問題セット、問題、回答記録、復習レベル、曖昧登録をすべて削除します。先にJSONエクスポートしておくことをおすすめします。"
        confirmLabel="全削除"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          onClearAll();
          setClearConfirmOpen(false);
        }}
      />
    </Layout>
  );
}

function HomeHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="h-[88px] shrink-0 rounded-b-3xl bg-[#202124] px-4 pb-3 safe-top">
      <div className="grid h-full grid-cols-[56px_1fr_56px] items-center">
        <div aria-hidden="true" />
        <h1 className="text-center text-xl font-bold text-white">Quiz make</h1>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2A2A2A] text-2xl font-bold leading-none text-white active:scale-95"
            aria-label="メニュー"
          >
            ≡
          </button>
        </div>
      </div>
    </header>
  );
}

function RoundActionButton({
  label,
  icon,
  active = false,
  onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-20 flex-col items-center gap-2 active:scale-95">
      <span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white ${active ? 'bg-[#0F9F9F]' : 'bg-[#14B8B8]'}`}>
        {icon}
      </span>
      <span className="text-xs font-semibold text-white">{label}</span>
    </button>
  );
}

function StudyStatsCard({ stats }: { stats: StudyStats }) {
  const items = [
    { label: '今日', value: stats.todayCount },
    { label: '累計', value: stats.totalCount },
    { label: '正答率', value: `${stats.correctRate}%` },
    { label: '復習', value: stats.reviewCount },
    { label: '曖昧', value: stats.ambiguousCount },
  ];

  return (
    <div className="rounded-2xl bg-[#1F1F1F] p-3">
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-[#252525] px-3 py-2">
            <div className="text-[11px] font-semibold text-[#A3A3A3]">{item.label}</div>
            <div className="mt-1 text-lg font-bold leading-none text-white">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyFolderState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl bg-[#1F1F1F] p-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2A2A2A] text-2xl">📁</div>
      <h3 className="mt-3 text-base font-bold text-white">フォルダがありません</h3>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 h-11 rounded-2xl bg-[#14B8B8] px-6 text-sm font-bold text-white active:scale-[0.98]"
      >
        新規作成
      </button>
    </div>
  );
}

function AddFolderSheet({
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
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[#1F1F1F] p-5 text-white">
        <h2 className="text-lg font-bold">フォルダを新規作成</h2>
        <label htmlFor="folderName" className="mt-4 block text-xs font-semibold text-[#A3A3A3]">
          フォルダ名
        </label>
        <input
          id="folderName"
          value={folderName}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例：数学"
          autoFocus
          className="mt-2 h-12 w-full rounded-2xl border border-neutral-700 bg-[#050505] px-4 text-base font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-[#14B8B8]"
        />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="h-12 rounded-2xl bg-[#2A2A2A] text-sm font-bold text-white active:scale-[0.98]">
            キャンセル
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={!folderName.trim()}
            className="h-12 rounded-2xl bg-[#14B8B8] text-sm font-bold text-white active:scale-[0.98] disabled:bg-[#2A2A2A] disabled:text-neutral-500"
          >
            作成
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeMenu({
  copied,
  onClose,
  onExport,
  onImport,
  onCopyTemplate,
  onClearAll,
}: {
  copied: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onCopyTemplate: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[#1F1F1F] p-4 text-white" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">メニュー</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2A2A2A] text-xl font-bold">
            ×
          </button>
        </div>
        <div className="space-y-2">
          <MenuButton label="JSONエクスポート" onClick={onExport} />
          <MenuButton label="JSONインポート" onClick={onImport} />
          <MenuButton label={copied ? 'コピーしました' : 'ChatGPTテンプレートをコピー'} onClick={onCopyTemplate} />
          <MenuButton label="全データ削除" danger onClick={onClearAll} />
        </div>
      </div>
    </div>
  );
}

function MenuButton({ label, danger = false, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[52px] w-full items-center rounded-2xl px-4 text-left text-sm font-bold active:scale-[0.99] ${
        danger ? 'bg-rose-500/15 text-rose-200' : 'bg-[#2A2A2A] text-white'
      }`}
    >
      {label}
    </button>
  );
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
    reviewCount: progress.filter((item) => item.isReview && !item.isGraduated).length,
    correctRate: logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100),
  };
}
