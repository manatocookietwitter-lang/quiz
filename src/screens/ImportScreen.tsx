import { useState } from 'react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { CHATGPT_TEMPLATE_PROMPT } from '../utils/importValidator';

interface ImportScreenProps {
  folderName: string;
  onBack: () => void;
  onImport: (titleOverride: string, jsonText: string) => string | null;
}

export function ImportScreen({ folderName, onBack, onImport }: ImportScreenProps) {
  const [title, setTitle] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_TEMPLATE_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('テンプレートのコピーに失敗しました。端末のコピー権限を確認してください。');
    }
  };

  const handleImport = () => {
    setError('');
    const result = onImport(title, jsonText);
    if (result) setError(result);
  };

  return (
    <Layout>
      <Header title="問題セット追加" subtitle={folderName} leftLabel="戻る" onLeft={onBack} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-4">
        <section className="shrink-0 rounded-[24px] bg-neutral-900 p-4 ring-1 ring-white/10">
          <label htmlFor="setTitle" className="text-xs font-black text-neutral-500">問題セット名</label>
          <input
            id="setTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="空欄ならJSONのsetTitleを使用"
            className="mt-2 min-h-[52px] w-full rounded-2xl border border-white/10 bg-neutral-950 px-4 text-base font-bold text-white outline-none placeholder:text-neutral-600 focus:border-cyan-400"
          />
        </section>

        <button
          type="button"
          onClick={handleCopyTemplate}
          className="min-h-[50px] shrink-0 rounded-2xl bg-yellow-400 px-4 text-sm font-black text-neutral-950 active:scale-[0.98]"
        >
          {copied ? 'コピーしました' : 'ChatGPT用テンプレートをコピー'}
        </button>

        <section className="flex min-h-0 flex-1 flex-col rounded-[24px] bg-neutral-900 p-4 ring-1 ring-white/10">
          <label htmlFor="jsonText" className="shrink-0 text-xs font-black text-neutral-500">JSON貼り付け欄</label>
          <textarea
            id="jsonText"
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            placeholder='{ "setTitle": "問題セット名", "source": "資料名", "questions": [...] }'
            className="mt-2 min-h-0 flex-1 resize-none rounded-2xl border border-white/10 bg-neutral-950 p-3 text-sm font-medium leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-cyan-400"
          />
        </section>

        {error ? (
          <div className="max-h-28 shrink-0 overflow-y-auto rounded-2xl bg-rose-500/15 p-3 text-xs font-bold leading-relaxed text-rose-300 ring-1 ring-rose-400/20 no-scrollbar">
            {error}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-4 pt-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={!jsonText.trim()}
          className="min-h-[56px] w-full rounded-2xl bg-cyan-500 px-4 text-base font-black text-neutral-950 active:scale-[0.98] disabled:opacity-40"
        >
          取り込む
        </button>
      </div>
    </Layout>
  );
}
