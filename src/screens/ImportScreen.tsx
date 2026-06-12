import { type ChangeEvent, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { CHATGPT_TEMPLATE_PROMPT } from '../utils/importValidator';
import './ImportScreen.css';

interface ImportScreenProps {
  folderName: string;
  onBack: () => void;
  onImport: (titleOverride: string, jsonText: string, stayOnScreen?: boolean) => string | null;
}

interface ImportResult {
  successCount: number;
  failures: { fileName: string; error: string }[];
}

export function ImportScreen({ folderName, onBack, onImport }: ImportScreenProps) {
  const [title, setTitle] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_TEMPLATE_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('テンプレートのコピーに失敗しました。端末のコピー権限を確認してください。');
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setError('');
    setImportResult(null);
    setSelectedFiles(Array.from(event.target.files ?? []));
  };

  const handleImport = async () => {
    setError('');
    setImportResult(null);

    const hasFiles = selectedFiles.length > 0;
    const hasPastedJson = jsonText.trim().length > 0;

    if (!hasFiles) {
      const result = onImport(title, jsonText);
      if (result) setError(result);
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    const failures: ImportResult['failures'] = [];

    if (hasPastedJson) {
      const result = onImport(title, jsonText, true);
      if (result) {
        failures.push({ fileName: '貼り付けJSON', error: result });
      } else {
        successCount += 1;
      }
    }

    for (const file of selectedFiles) {
      try {
        const text = await file.text();
        const result = onImport('', text, true);
        if (result) {
          failures.push({ fileName: file.name, error: result });
        } else {
          successCount += 1;
        }
      } catch (readError) {
        failures.push({
          fileName: file.name,
          error: readError instanceof Error ? readError.message : 'ファイルの読み込みに失敗しました。',
        });
      }
    }

    setImportResult({ successCount, failures });
    setIsImporting(false);
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

          <section className="quiz-import__file-card">
            <label htmlFor="jsonFiles" className="quiz-import__label">JSONファイル選択</label>
            <input
              id="jsonFiles"
              type="file"
              accept=".json,application/json"
              multiple
              onChange={handleFileChange}
              className="quiz-import__file-input"
            />
            {selectedFiles.length > 0 ? (
              <div className="quiz-import__file-list">
                <p>選択中のファイル：</p>
                <ul>
                  {selectedFiles.map((file) => (
                    <li key={`${file.name}_${file.lastModified}`}>{file.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

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

          {importResult ? (
            <div className={importResult.failures.length > 0 ? 'quiz-import__result quiz-import__result--mixed' : 'quiz-import__result'}>
              <p>取り込み完了：{importResult.successCount}件</p>
              <p>失敗：{importResult.failures.length}件</p>
              {importResult.failures.length > 0 ? (
                <ul>
                  {importResult.failures.map((failure) => (
                    <li key={failure.fileName}>
                      <strong>{failure.fileName}</strong>：{failure.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {error ? <div className="quiz-import__error">{error}</div> : null}
        </main>

        <button
          type="button"
          onClick={handleImport}
          disabled={isImporting || (!jsonText.trim() && selectedFiles.length === 0)}
          className="quiz-import__submit"
        >
          {isImporting ? '取り込み中...' : '取り込む'}
        </button>
      </div>
    </Layout>
  );
}
