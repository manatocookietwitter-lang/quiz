# ストア用プライバシー申告案

申告時点の実装に基づく案です。SDKや機能を追加した場合は必ず再確認してください。

## Apple App Privacy

- Tracking: いいえ
- Data linked to the user: なし（アカウント、氏名、メールアドレスを取得しない）
- Data not linked to the user / App Functionality:
  - User Content / Other User Content: 任意同期時のみ。問題、解説、ノート
  - Usage Data / Product Interaction: 任意同期時のみ。回答履歴、正答状況、復習状態
- Analytics: 使用しない
- Third-party advertising: 使用しない

## Google Play Data safety

- データを収集するか: はい（任意のクラウド同期を使う場合のみ）
- データを共有するか: いいえ
- 収集データ:
  - その他のユーザー生成コンテンツ: 問題、解説、ノート
  - アプリの操作: 回答履歴、正答状況、復習状態
- 目的: アプリの機能（端末間同期・復元）
- 処理: 任意、ユーザーが同期操作をした場合のみ
- 転送時の暗号化: はい（HTTPS）
- 削除要求: アプリの同期設定からクラウドデータを削除可能
- アカウント作成: なし
- 広告: なし

## 使用サービス

- Supabase: 任意同期の保存先
- OpenAI / ChatGPT: QuizMakeからAPI通信しない。テンプレートをクリップボードへコピーするだけ
- GitHub Pages: Web版、プライバシーポリシー、サポートページの配信
