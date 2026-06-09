# Quiz make

ChatGPTで一括作成した4択問題JSONを取り込み、スマホで1問ずつ学習するための個人用Webアプリです。

## 技術構成

- Vite
- React
- TypeScript
- Tailwind CSS
- localStorage保存
- GitHub Pages対応

## セットアップ

```bash
npm install
```

## ローカル起動

PCのみで確認する場合：

```bash
npm run dev
```

同じWi-Fiのスマホから確認する場合：

```bash
npm run dev -- --host 0.0.0.0
```

表示された `Network: http://...:5173/` をスマホで開いてください。`https://` ではなく `http://` です。

## ビルド

```bash
npm run build
```

## GitHub Pages

`.github/workflows/deploy.yml` を同梱しています。GitHubの `Settings > Pages > Source` を `GitHub Actions` に設定してください。

## 主な機能

- ダークテーマのスマホ専用UI
- フォルダ作成・削除
- 問題セットJSON取り込み
- 4択クイズ
- タップ即時判定
- 解説・参照ページ表示
- 間違えた問題の復習登録
- 曖昧登録・解除
- reviewLevel 1〜3
- level 3正解で復習卒業
- JSONエクスポート/インポート
- ChatGPT用問題作成テンプレートコピー
