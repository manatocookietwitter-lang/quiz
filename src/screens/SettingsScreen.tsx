import { useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Layout } from '../components/Layout';
import {
  ChevronRightIcon,
  CopyIcon,
  DocumentOutlineIcon,
  DownloadIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from '../components/UiIcons';
import { CHATGPT_MATERIAL_TEMPLATE_PROMPT, CHATGPT_PAST_EXAM_TEMPLATE_PROMPT } from '../utils/importValidator';
import { writeClipboardText } from '../utils/nativePlatform';
import './SettingsScreen.css';

interface SettingsScreenProps {
  onExport: () => void;
  onImportBackup: (file: File) => Promise<string | null>;
  onClearAll: () => void;
  onOpenSync: () => void;
  onOpenPrivacy: () => void;
}

export function SettingsScreen({ onExport, onImportBackup, onClearAll, onOpenSync, onOpenPrivacy }: SettingsScreenProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState('');
  const [message, setMessage] = useState('');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const copyTemplate = async (template: string, label: string) => {
    try {
      await writeClipboardText(template);
      setCopied(label);
      setMessage('コピーしました。次にChatGPTを開き、入力欄へ貼り付けてください。');
      window.setTimeout(() => {
        setCopied('');
        setMessage('');
      }, 2200);
    } catch {
      setMessage('テンプレートのコピーに失敗しました。');
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const error = await onImportBackup(file);
    setMessage(error ?? '');
  };

  return (
    <Layout>
      <div className="settings-screen">
        <header className="settings-screen__header">
          <p>QUIZ MAKE</p>
          <h1>設定</h1>
        </header>

        <main className="settings-screen__body">
          <section className="settings-section" aria-labelledby="settings-template-title">
            <div className="settings-section__heading">
              <h2 id="settings-template-title">ChatGPTで問題を作る</h2>
              <p>用途を選んで指示文をコピーし、ChatGPTの入力欄へ貼り付けます。</p>
            </div>
            <SettingsRow
              icon={<CopyIcon />}
              title="資料から問題を作る"
              detail="教科書・講義資料・文章向けの指示文"
              state={copied === 'material' ? 'コピー済み' : 'コピー'}
              onClick={() => void copyTemplate(CHATGPT_MATERIAL_TEMPLATE_PROMPT, 'material')}
            />
            <SettingsRow
              icon={<CopyIcon />}
              title="過去問をまとめる"
              detail="複数年度の過去問を整理する指示文"
              state={copied === 'past-exam' ? 'コピー済み' : 'コピー'}
              onClick={() => void copyTemplate(CHATGPT_PAST_EXAM_TEMPLATE_PROMPT, 'past-exam')}
            />
          </section>

          <section className="settings-section" aria-labelledby="settings-data-title">
            <div className="settings-section__heading"><h2 id="settings-data-title">データ管理</h2></div>
            <SettingsRow icon={<SyncIcon />} title="端末間の同期" detail="スマホやPCで同じデータを使う" arrow onClick={onOpenSync} />
            <SettingsRow icon={<DownloadIcon />} title="バックアップを書き出す" detail="現在のデータをJSONで保存" onClick={onExport} />
            <SettingsRow icon={<UploadIcon />} title="バックアップを読み込む" detail="保存したJSONから復元" onClick={() => fileInputRef.current?.click()} />
          </section>

          <section className="settings-section" aria-labelledby="settings-info-title">
            <div className="settings-section__heading"><h2 id="settings-info-title">アプリ情報</h2></div>
            <SettingsRow icon={<DocumentOutlineIcon />} title="プライバシーポリシー" detail="保存されるデータと削除方法" arrow onClick={onOpenPrivacy} />
          </section>

          <section className="settings-section settings-section--danger" aria-labelledby="settings-danger-title">
            <div className="settings-section__heading">
              <h2 id="settings-danger-title">データの削除</h2>
              <p>実行すると端末内の学習データを元に戻せません。先にバックアップしてください。</p>
            </div>
            <SettingsRow icon={<TrashIcon />} title="全データを削除" detail="フォルダ・問題・学習記録を消去" danger onClick={() => setClearConfirmOpen(true)} />
          </section>

          {message ? <div className={message.includes('失敗') ? 'settings-screen__notice settings-screen__notice--error' : 'settings-screen__notice'} role="status">{message}</div> : null}
        </main>

        <input ref={fileInputRef} type="file" accept="application/json,.json" className="settings-screen__file-input" onChange={(event) => void importBackup(event)} />

        <ConfirmDialog
          open={clearConfirmOpen}
          title="全データを削除しますか？"
          message="フォルダ、問題セット、問題、回答記録、復習Level、曖昧登録をすべて削除します。この操作は元に戻せません。"
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

function SettingsRow({ icon, title, detail, state, arrow = false, danger = false, onClick }: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  state?: string;
  arrow?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={danger ? 'settings-row settings-row--danger' : 'settings-row'} onClick={onClick}>
      <span className="settings-row__icon" aria-hidden="true">{icon}</span>
      <span className="settings-row__text"><strong>{title}</strong><small>{detail}</small></span>
      {state ? <span className="settings-row__state">{state}</span> : null}
      {arrow ? <ChevronRightIcon size={19} /> : null}
    </button>
  );
}
