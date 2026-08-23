# QuizMake ネイティブ提出ビルド

## 共通準備

1. `npm ci`
2. `.env.native.local` に次を設定（値はWeb版と同じSupabaseプロジェクト）

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_ANON_KEY
```

3. `npm run mobile:sync`
4. アプリID `io.github.manatocookietwitterlang.quizmake` がストア登録値と一致することを確認

`mobile:sync` はネイティブ用に相対パスでWeb資産を作り、Android/iOSへコピーします。Windowsで生成されるSwift Packageのパス区切りも自動補正します。

## Android / Google Play

提出環境にはJDK 17とAndroid SDK 36が必要です（現在のAndroid Gradle Plugin 8.13構成）。

1. Android Studioで `android` フォルダを開く
2. 実機またはエミュレーターでデバッグ版を確認
3. **Build > Generate Signed Bundle / APK > Android App Bundle** を選ぶ
4. 新しいアップロード鍵はリポジトリ外へ作り、安全にバックアップする
5. release版AABを作成し、Play Consoleの内部テストへアップロード
6. `store/privacy-declarations.md` を基にData safetyを入力して実機確認後に本番提出

## iOS / App Store

2026年8月時点の提出には、Xcode 26以降とiOS 26 SDK以降が必要です。

1. Macへリポジトリを取得し、共通準備を実行
2. `npm run mobile:ios` でXcodeを開く
3. Signing & Capabilitiesで開発者Teamを選ぶ
4. 実機でクリップボード、JSON共有、同期、オフライン起動、詳細解説の表を確認
5. Generic iOS Deviceを選び、**Product > Archive** を実行
6. OrganizerからApp Store Connectへアップロードし、TestFlightで最終確認

## バージョン更新

- Android: `android/app/build.gradle` の `versionCode` を毎回増やし、`versionName` を更新
- iOS: Xcodeの `CURRENT_PROJECT_VERSION` を毎回増やし、`MARKETING_VERSION` を更新
- JavaScript側: `package.json` の `version` も同じ公開バージョンへ合わせる
