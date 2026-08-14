import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import './PrivacyScreen.css';

interface PrivacyScreenProps {
  onBack: () => void;
}

export function PrivacyScreen({ onBack }: PrivacyScreenProps) {
  return (
    <Layout><div className="privacy-screen">
      <header className="privacy-screen__header">
        <BackButton onClick={onBack} label="設定へ戻る" />
        <div>
          <h1>プライバシーポリシー</h1>
          <p>QuizMakeで扱うデータについて</p>
        </div>
      </header>
      <main className="privacy-screen__body">
        <p className="privacy-screen__updated">制定日・最終更新日：2026年8月5日</p>

        <section>
          <h2>1. 基本方針</h2>
          <p>QuizMakeは、問題作成と学習記録をできるだけ端末内で完結させます。広告、アクセス解析、行動追跡は使用していません。</p>
        </section>

        <section>
          <h2>2. 端末内に保存するデータ</h2>
          <p>フォルダ、問題セット、問題・解説、回答履歴、正答状況、復習状態、詳細解説、カテゴリーノート、同期設定を端末内に保存します。</p>
        </section>

        <section>
          <h2>3. ログインと共有機能</h2>
          <p>問題作成と学習にはログイン不要です。共有機能へログインする場合、メールアドレスをSupabase Authで処理し、ログイン用リンクを送信します。</p>
          <p>利用者が共有操作を行った場合だけ、問題セットのタイトル、説明、科目、対象、難易度、作成者表示名、問題・選択肢・正解・解説・参照情報を共有用データとして保存します。公開範囲はリンク、グループ、全体公開から選べます。回答履歴、正答率、復習状態、曖昧登録は共有されません。</p>
          <p>グループでは表示名、役割、参加状態、招待情報を保存します。通報時は対象、理由、詳細、通報者アカウントを保存します。</p>
        </section>

        <section>
          <h2>4. 任意のクラウド同期</h2>
          <p>利用者が同期機能を有効にして保存操作を行った場合だけ、問題データ、学習履歴、ノート、設定、ランダムに生成した同期ID、更新日時をSupabaseへ送信します。この同期機能のために氏名、メールアドレス、連絡先、正確な位置情報、広告識別子を追加取得することはありません。</p>
          <p>同期IDはクラウドデータを読み書きするための秘密情報です。第三者へ共有しないでください。通信はHTTPSで暗号化されます。</p>
        </section>

        <section>
          <h2>5. クリップボードとファイル</h2>
          <p>テンプレートのコピー、同期IDのコピー、利用者が明示的に実行した貼り付けのためにクリップボードへアクセスします。選択したJSONファイルはバックアップの読み込みに使用し、バックアップの書き出し時には端末の共有・保存画面を開きます。これらを自動送信することはありません。</p>
        </section>

        <section>
          <h2>6. 保存期間と削除</h2>
          <p>フォルダ、問題、学習履歴、詳細解説、カテゴリーノートは、アプリ内の「端末の学習データを削除」、端末のアプリデータ消去、またはアンインストールまで保存されます。同期設定は同期画面で解除するか、端末のアプリデータを消去するまで残ります。クラウド上の同期データは、同期設定の「クラウドデータを削除」を実行するまで保存されます。</p>
          <p>共有は各問題セットの「共有を停止」から削除できます。共有アカウントと関連する共有データは「自分」画面のアカウント削除から削除できます。どちらも端末内の学習データは削除しません。第三者がすでに自分用に追加した独立コピーは、共有停止やアカウント削除後もその第三者の端末に残ることがあります。</p>
        </section>

        <section>
          <h2>7. 外部サービス</h2>
          <p>ログイン、共有、通報、任意同期の保存先としてSupabaseを使用し、Web版の配信にGitHub Pagesを使用します。ChatGPT用テンプレートはクリップボードへコピーするだけで、QuizMakeからOpenAIへデータを直接送信しません。</p>
        </section>

        <section>
          <h2>8. お問い合わせ</h2>
          <p>QuizMake開発者（GitHub: manatocookietwitter-lang）へのお問い合わせは、GitHubのサポートページからお願いします。</p>
          <a href="https://github.com/manatocookietwitter-lang/quiz/issues" target="_blank" rel="noreferrer">サポート・お問い合わせ</a>
        </section>
      </main>
    </div></Layout>
  );
}
