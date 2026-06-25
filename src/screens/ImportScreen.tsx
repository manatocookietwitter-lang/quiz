import { type ChangeEvent, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { CHATGPT_TEMPLATE_PROMPT } from '../utils/importValidator';
import './ImportScreen.css';

interface ImportScreenProps {
  folderName: string;
  onBack: () => void;
  onImport: (titleOverride: string, jsonText: string, stayOnScreen?: boolean) => string | null;
  onImportComplete: () => void;
}

interface ImportResult {
  successCount: number;
  failures: { fileName: string; error: string }[];
}

interface ImportFileItem {
  id: string;
  fileName: string;
  fallbackTitle: string;
  detectedSetTitle: string;
  editableSetTitle: string;
  userEditedTitle: boolean;
  rawText: string;
  readError?: string;
}

export function ImportScreen({ folderName, onBack, onImport, onImportComplete }: ImportScreenProps) {
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [importFiles, setImportFiles] = useState<ImportFileItem[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState('');
  const [notice, setNotice] = useState('');

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_TEMPLATE_PROMPT);
      setCopied(true);
      setNotice('テンプレートをクリップボードにコピーしました');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('テンプレートのコピーに失敗しました。端末のコピー権限を確認してください。');
    }
  };

  const handleReadClipboard = async () => {
    setError('');
    setNotice('');
    try {
      const text = await navigator.clipboard.readText();
      setJsonText(text);
      const extractedTitle = extractSetTitle(text);
      if (extractedTitle) {
        setTitle(extractedTitle);
        setTitleEdited(false);
      }
      setNotice('クリップボードから読み込みました');
    } catch {
      setError('クリップボードを読み込めませんでした。ブラウザの権限を確認してください。');
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setError('');
    setNotice('');
    setImportResult(null);
    const files = Array.from(event.target.files ?? []);
    setIsPreparingFiles(true);
    const items = await Promise.all(files.map(async (file) => {
      const fallbackTitle = getFileBaseName(file.name);
      try {
        const rawText = normalizeJsonText(await file.text());
        const detectedSetTitle = extractSetTitle(rawText);
        return {
          id: `${file.name}_${file.lastModified}_${file.size}`,
          fileName: file.name,
          fallbackTitle: fallbackTitle || '無題の問題セット',
          detectedSetTitle,
          editableSetTitle: detectedSetTitle || fallbackTitle || '無題の問題セット',
          userEditedTitle: false,
          rawText,
        };
      } catch (readError) {
        return {
          id: `${file.name}_${file.lastModified}_${file.size}`,
          fileName: file.name,
          fallbackTitle: fallbackTitle || '無題の問題セット',
          detectedSetTitle: '',
          editableSetTitle: fallbackTitle || '無題の問題セット',
          userEditedTitle: false,
          rawText: '',
          readError: readError instanceof Error ? readError.message : 'ファイルの読み込みに失敗しました。',
        };
      }
    }));
    setImportFiles(items);
    setIsPreparingFiles(false);
  };
  const handleJsonTextChange = (value: string) => {
    setJsonText(value);
    setImportResult(null);
    setNotice('');
    const titleResult = readSetTitle(value);
    if (!titleEdited && titleResult.parsed) {
      setTitle(titleResult.title || '無題の問題セット');
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setTitleEdited(true);
  };

  const handleFileTitleChange = (id: string, value: string) => {
    setImportFiles((items) => items.map((item) => (
      item.id === id ? { ...item, editableSetTitle: value, userEditedTitle: true } : item
    )));
  };

  const handleImport = async () => {
    setError('');
    setImportResult(null);
    setNotice('');

    const hasFiles = importFiles.length > 0;
    const hasPastedJson = jsonText.trim().length > 0;
    const totalItems = importFiles.length + (hasPastedJson ? 1 : 0);

    setIsImporting(true);
    setImportProgress(hasFiles ? `取り込み中... 0 / ${totalItems}` : '取り込み中...');
    await yieldToUi();

    if (!hasFiles) {
      const normalizedJsonText = normalizeJsonText(jsonText);
      const pastedTitle = title.trim() || extractSetTitle(jsonText) || '無題の問題セット';
      const result = onImport(pastedTitle, normalizedJsonText, true);
      if (result) {
        setError(result);
        setIsImporting(false);
        setImportProgress('');
        return;
      }
      setImportResult({ successCount: 1, failures: [] });
      setImportProgress('取り込み完了');
      setNotice('取り込み完了。問題セット一覧へ戻ります');
      window.setTimeout(onImportComplete, 700);
      return;
    }

    let successCount = 0;
    const failures: ImportResult['failures'] = [];
    let processedCount = 0;

    if (hasPastedJson) {
      setImportProgress(`貼り付けJSONを取り込み中... ${processedCount + 1} / ${totalItems}`);
      await yieldToUi();
      const normalizedJsonText = normalizeJsonText(jsonText);
      const pastedTitle = title.trim() || extractSetTitle(jsonText) || '無題の問題セット';
      const result = onImport(pastedTitle, normalizedJsonText, true);
      if (result) {
        failures.push({ fileName: '貼り付けJSON', error: result });
      } else {
        successCount += 1;
      }
      processedCount += 1;
      setImportProgress(`取り込み中... ${processedCount} / ${totalItems}`);
    }

    for (const file of importFiles) {
      setImportProgress(`${file.fileName} を取り込み中... ${processedCount + 1} / ${totalItems}`);
      await yieldToUi();
      if (file.readError) {
        failures.push({ fileName: file.fileName, error: file.readError });
        processedCount += 1;
        continue;
      }
      const fileTitle = getFinalFileTitle(file, importFiles.length === 1 ? title.trim() : '');
      if (!fileTitle) {
        failures.push({ fileName: file.fileName, error: '問題セット名を入力してください。' });
        processedCount += 1;
        continue;
      }
      const result = onImport(fileTitle, file.rawText, true);
      if (result) {
        failures.push({ fileName: file.fileName, error: result });
      } else {
        successCount += 1;
      }
      processedCount += 1;
      setImportProgress(`取り込み中... ${processedCount} / ${totalItems}`);
    }

    setImportResult({ successCount, failures });
    setIsImporting(false);
    setImportProgress('');
    if (successCount > 0 && failures.length === 0) {
      setNotice('取り込み完了。問題セット一覧へ戻ります');
      window.setTimeout(onImportComplete, 700);
    }
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
            <div className="quiz-import__card-heading">
              <span>1</span>
              <h2>問題セット名</h2>
            </div>
            <label htmlFor="setTitle" className="quiz-import__label">問題セット名</label>
            <input
              id="setTitle"
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="JSONのsetTitleを読み込むか入力"
              className="quiz-import__input"
            />
          </section>

          <section className="quiz-import__tool-card">
            <div className="quiz-import__card-heading">
              <span>2</span>
              <h2>ChatGPTで作る</h2>
            </div>
            <button type="button" onClick={handleCopyTemplate} className="quiz-import__template-button">
              {copied ? 'コピーしました' : 'ChatGPTテンプレートをコピー'}
            </button>
          </section>

          <section className="quiz-import__file-card">
            <div className="quiz-import__card-heading">
              <span>3</span>
              <h2>JSONを読み込む</h2>
            </div>
            <button type="button" onClick={handleReadClipboard} className="quiz-import__clipboard-button">
              クリップボードから読み込む
            </button>
            <label htmlFor="jsonFiles" className="quiz-import__label">JSONファイル選択</label>
            <input
              id="jsonFiles"
              type="file"
              accept=".json,application/json"
              multiple
              onChange={handleFileChange}
              className="quiz-import__file-input"
            />
            {isPreparingFiles ? <p className="quiz-import__file-preparing">ファイルを読み込み中...</p> : null}
            {importFiles.length > 0 ? (
              <div className="quiz-import__file-list">
                <p>取り込み予定：</p>
                {importFiles.map((file, index) => (
                  <div key={file.id} className="quiz-import__file-item">
                    <span>{index + 1}. {file.fileName}</span>
                    <input
                      value={file.editableSetTitle}
                      onChange={(event) => handleFileTitleChange(file.id, event.target.value)}
                      className="quiz-import__file-title-input"
                      placeholder="問題セット名"
                    />
                    {file.readError ? <small>{file.readError}</small> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="quiz-import__json-card">
            <div className="quiz-import__card-heading">
              <span>4</span>
              <h2>JSON貼り付け欄</h2>
            </div>
            <label htmlFor="jsonText" className="quiz-import__label">JSON貼り付け欄</label>
            <textarea
              id="jsonText"
              value={jsonText}
              onChange={(event) => handleJsonTextChange(event.target.value)}
              placeholder="ここにJSONを貼り付けるか、クリップボード/JSONファイルから読み込んでください"
              className="quiz-import__textarea"
            />
          </section>

          {notice ? <div className="quiz-import__notice">{notice}</div> : null}
          {importProgress ? <div className="quiz-import__progress"><span />{importProgress}</div> : null}

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
          disabled={isImporting || isPreparingFiles || (!jsonText.trim() && importFiles.length === 0)}
          className="quiz-import__submit"
        >
          {isImporting ? '取り込み中...' : '取り込む'}
        </button>
      </div>
    </Layout>
  );
}

function extractSetTitle(text: string) {
  return readSetTitle(text).title;
}

function getFinalFileTitle(file: ImportFileItem, globalTitle = '') {
  const editedTitle = file.editableSetTitle.trim();
  const globalOverride = globalTitle.trim();
  if (globalOverride) return globalOverride;
  if (file.userEditedTitle && editedTitle) return editedTitle;
  return file.detectedSetTitle.trim() || extractSetTitle(file.rawText) || file.fallbackTitle.trim() || '無題の問題セット';
}
function readSetTitle(text: string): { parsed: boolean; title: string } {
  const normalizedText = normalizeJsonText(text);
  try {
    const parsed = JSON.parse(normalizedText) as { setTitle?: unknown; title?: unknown };
    const setTitle = typeof parsed.setTitle === 'string' && parsed.setTitle.trim() ? parsed.setTitle.trim() : '';
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : '';
    return {
      parsed: true,
      title: setTitle || title,
    };
  } catch {
    const title = extractSetTitleByRegex(normalizedText);
    return { parsed: Boolean(title), title };
  }
}

function getFileBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/u, '').trim();
}

function normalizeJsonText(text: string) {
  return text.replace(/^\uFEFF/u, '').trim();
}

function extractSetTitleByRegex(text: string) {
  const match = text.match(/"setTitle"\s*:\s*"((?:\\.|[^"\\])*)"/u) ?? text.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/u);
  if (!match) return '';
  try {
    return JSON.parse(`"${match[1]}"`).trim();
  } catch {
    return match[1].trim();
  }
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
