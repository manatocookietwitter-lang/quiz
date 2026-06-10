import { useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { CHATGPT_TEMPLATE_PROMPT } from '../utils/importValidator';
import './ImportScreen.css';

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
      <div className="quiz-import">
        <header className="quiz-import__header">
          <BackButton onClick={onBack} className="quiz-import__back" />
          <div className="quiz-import__title-wrap">
            <h1 className="quiz-import__title">問題セット追加</h1>
            <p className="quiz-import__subtitle">{folderName}</p>
          </div>
          <div className="quiz-import__spacer" />
        </header>

        <main className="quiz-import__content">
          <section className="quiz-import__title-card">
            <label htmlFor="setTitle" className="quiz-import__label">問題セット名</label>
            <input
              id="setTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="空欄ならJSONのsetTitleを使用"
              className="quiz-import__input"
            />
          </section>

          <button type="button" onClick={handleCopyTemplate} className="quiz-import__template-button">
            {copied ? 'コピーしました' : 'ChatGPTテンプレートをコピー'}
          </button>

          <section className="quiz-import__json-card">
            <label htmlFor="jsonText" className="quiz-import__label">JSON貼り付け欄</label>
            <textarea
              id="jsonText"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder='{ "setTitle": "問題セット名", "source": "資料名", "questions": [...] }'
              className="quiz-import__textarea"
            />
          </section>

          {error ? <div className="quiz-import__error">{error}</div> : null}
        </main>

        <button
          type="button"
          onClick={handleImport}
          disabled={!jsonText.trim()}
          className="quiz-import__submit"
        >
          取り込む
        </button>
      </div>
    </Layout>
  );
}
