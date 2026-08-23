# ストア用プライバシー申告案

申告時点の実装に基づく案です。SDKや機能を追加した場合は必ず再確認してください。

## Apple App Privacy

- Tracking: いいえ
- Data linked to the user / App Functionality（任意のログイン・同期・共有を使う場合のみ）:
  - Contact Info / Email Address: Magic Linkログインとアカウント管理
  - User Content / Other User Content: 同期する問題、解説、ノート、共有する問題セット
  - Usage Data / Product Interaction: 同期する回答履歴、正答状況、復習状態
- 氏名、電話番号、正確な位置情報、広告識別子: 取得しない
- Analytics: 使用しない
- Third-party advertising: 使用しない

## Google Play Data safety

- データを収集するか: はい（任意のログイン・クラウド同期・共有を使う場合のみ）
- データを共有するか: いいえ
- 収集データ:
  - 個人情報 / メールアドレス: Magic Linkログインとアカウント管理
  - その他のユーザー生成コンテンツ: 問題、解説、ノート
  - アプリの操作: 回答履歴、正答状況、復習状態
- 目的: アプリの機能（ログイン、端末間同期・復元、問題セット共有）
- 処理: 任意、ユーザーがログインして同期または共有を使った場合のみ
- 転送時の暗号化: はい（HTTPS）
- 削除要求: アプリの同期設定からクラウドデータを削除可能
- アカウント作成: 任意（同期・共有利用時のみ）
- アカウント削除: アプリの設定画面から実行可能
- アカウント削除案内URL: `https://manatocookietwitter-lang.github.io/quiz/support.html#account-deletion`
- 広告: なし

## 使用サービス

- Supabase: メールログイン、任意同期、共有機能の保存先
- OpenAI / ChatGPT: QuizMakeからAPI通信しない。テンプレートをクリップボードへコピーするだけ
- GitHub Pages: Web版、プライバシーポリシー、サポートページの配信
