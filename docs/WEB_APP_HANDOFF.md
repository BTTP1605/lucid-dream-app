# Web版 明晰夢誘導アプリ 引き継ぎドキュメント

**最終更新:** 2026-07-03
**管理者:** BTTP (BTTP1605 / bttp1605@gmail.com)

---

## 1. プロジェクト概要

睡眠後の指定時間にアファメーション音声を再生し、明晰夢へ誘導するWebアプリ。

- **本番URL:** https://bttp1605.github.io/lucid-dream-app/
- **利用者:** オンラインコミュニティ「操夢部」の会員が現在使用中
- **本番リポジトリ:** https://github.com/BTTP1605/lucid-dream-app
- **テスト環境URL:** https://bttp1605.github.io/lucid-dream-app-dev/
- **テスト用リポジトリ:** https://github.com/BTTP1605/lucid-dream-app-dev

### 主な機能
- 開始までの遅延タイマー(即時/1/5/10/15/30/45/60分)
- 音声再生(プリセット3種 + 自分の録音)、再生時間まで自動リピート
- 再生時間(1/5/10/30/45/60/90/120分)、時間終了で自動停止
- 音量調節、設定の自動保存・復元
- マイク録音(IndexedDBに永続保存、次回起動時に復元)

---

## 2. 最重要ルール: 本番環境を壊さない

- 本番は操夢部会員が使用中。**`lucid-dream-app`の`gh-pages`ブランチを直接変更しない。force pushしない。**
- 開発・修正は必ず作業用ブランチで行う。
- 変更は必ず**テスト環境(`lucid-dream-app-dev`)で動作確認**し、**管理者が明示的にOKした後だけ**本番反映する。

---

## 3. リポジトリ構成

| リポジトリ | ブランチ | 内容 |
|---|---|---|
| lucid-dream-app | `main` | ソースコード(正) |
| lucid-dream-app | `gh-pages` | 本番配信物(ビルド成果物のみ) |
| lucid-dream-app-dev | `main` | ソースのミラー(テスト時に更新) |
| lucid-dream-app-dev | `gh-pages` | テスト環境配信物 |

> **経緯(2026-07-03):** それ以前はソースコードがリポジトリ未コミットで、`gh-pages`のビルド済みファイルしか存在しなかった。ソースマップから実ソースを復元し、`main`にコミットした。以後は`main`のソースが唯一の正。
> `codex`ブランチの旧引き継ぎメモ、`docs/archive/`の旧Manus/Expo版資料は参考資料(アーカイブ)。

### ソースファイル構成

```
lucid-dream-app/
├── src/
│   ├── App.js                    # アプリ本体(全ロジック・UI)
│   ├── App.css / index.css       # スタイル(ダークテーマ)
│   └── services/
│       ├── StorageService.js     # 設定のlocalStorage保存
│       └── RecordingService.js   # 録音のIndexedDB保存
├── public/
│   ├── audio/                    # プリセット音声3ファイル(計約70MB)
│   ├── index.html                # タイトル・メタ情報
│   └── manifest.json             # PWAマニフェスト
├── docs/                         # 本ドキュメント・アーカイブ
└── package.json                  # homepage設定済み(本番パス用)
```

---

## 4. 技術スタック

- **React 19 + Create React App (react-scripts 5)** — フロントエンドのみ、**バックエンドなし**
- データ保存はすべて端末内: 設定=localStorage(`lucid_dream_settings_v1`)、録音=IndexedDB(`LucidDreamDB`)
- ホスティング: GitHub Pages(無料、公開リポジトリ必須)
- **採用しない技術**(旧Manus版の名残。参考資料扱い): React Native / Expo / tRPC / MySQL / Drizzle / Manus OAuth

### 実装上の重要ポイント(src/App.js)
- **カウントダウンは実時刻ベース**(終了時刻をDate.now()と比較)。バックグラウンドでsetIntervalが間引かれても時間がズレない。タブ復帰時(visibilitychange)に即再計算。
- **音声はループ再生**(`audio.loop = true`)。再生時間が音声より長い場合はリピート。
- **モバイルの自動再生制限対策:** 遅延開始時に音量0で一瞬再生→停止して「アンロック」してから待機。
- **Wake Lock:** 遅延中・再生中に画面スリープを防止。タブ復帰時に再取得。
- **録音形式はブラウザに合わせ自動選択**(webm/opus → webm → mp4)。iOS Safariはmp4になる。
- 録音データがないのに「自分の録音」設定が残っていた場合のガードあり(無音開始を防止)。

---

## 5. 開発フロー(標準手順)

### 前提
- Node.js / npm / Git がインストール済み
- GitHubへのpush権限(認証はGit Credential Manager。**トークン期限切れで`Invalid username or token`が出たら、pushし直すとブラウザ認証が開くのでサインインする**)

### 手順

```bash
# 0. 初回のみ
git clone https://github.com/BTTP1605/lucid-dream-app.git
cd lucid-dream-app
npm ci

# 1. 作業ブランチを切って修正
git checkout -b feature/変更内容

# 2. ローカル確認(任意)
npm start        # http://localhost:3000
npm test -- --watchAll=false

# 3. テスト環境用にビルド(パスがテスト用URLに変わる)
PUBLIC_URL=/lucid-dream-app-dev npm run build
# PowerShellの場合: $env:PUBLIC_URL="/lucid-dream-app-dev"; npm run build

# 4. ソースをpush(本番リポの作業ブランチ + devリポのmain)
git push origin feature/変更内容
git push https://github.com/BTTP1605/lucid-dream-app-dev.git feature/変更内容:main

# 5. ビルドをテスト環境のgh-pagesへpush
#    (buildフォルダの中身をdevリポのgh-pagesブランチにコミットしてpush)

# 6. https://bttp1605.github.io/lucid-dream-app-dev/ で動作確認
#    → 管理者OKが出たら本番反映へ
```

### 本番反映(管理者OK後のみ)

```bash
# 1. mainにマージしてpush
git checkout main
git merge --ff-only feature/変更内容
git push origin main

# 2. 本番用にビルド(PUBLIC_URLは指定しない。package.jsonのhomepageが使われる)
npm run build

# 3. gh-pagesへ履歴を保持してデプロイ(force pushしない)
git fetch origin gh-pages
git worktree add ../gh-pages-deploy origin/gh-pages
# ../gh-pages-deploy の中身を全削除(.gitは除く)→ build の中身をコピー
# コミットして push origin HEAD:gh-pages
git worktree remove ../gh-pages-deploy
```

> 履歴を保持してデプロイしているため、**ロールバックは`gh-pages`を1つ前のコミットに戻すだけ**。
> 2026-07-03本番反映時の直前バージョンは `8ebacd3`。

---

## 6. トラブルシューティング

### pushしたのに反映されない
1. **GitHub Pagesのdeployジョブが稀にGitHub側エラーで失敗する。** リポジトリのActionsタブで「pages build and deployment」の結果を確認。失敗していたら`gh-pages`に空コミットをpushすれば再実行される。
2. デプロイ成功済みなら**CDNキャッシュ**(`Cache-Control: max-age=600` = 最大10分)。待ってから再読み込み。
3. 反映確認は、配信中の`index.html`内のバンドル名(`main.xxxxxxxx.js`)が新ビルドと一致するかで判定するのが確実。

### 音声が再生されない
- 配信中の`/audio/*.mp3`がHTTP 200か確認
- スマホは自動再生制限があるため、必ず「誘導を開始する」ボタン(ユーザー操作)経由で開始される設計になっているか確認

### 認証エラー(Invalid username or token)
- Git Credential Managerのトークン期限切れ。pushを再実行するとブラウザ認証が開く。ダメならWindows資格情報マネージャーで`git:https://github.com`を削除して再push。

---

## 7. 既知の制限(Web版の構造的限界)

- **スマホの画面を完全に消灯(ロック)するとブラウザが停止し、遅延タイマーや再生が止まる可能性がある。** Wake Lockで画面が消えないようにして緩和しているが、ユーザーには「画面を点けたまま伏せて置く」運用を案内している(アプリ内に注意文言表示済み)。根本解決はネイティブアプリ化(将来検討)。
- プリセット音声が大きい(20〜32MB/ファイル)。モバイル回線では読み込みに時間がかかることがある。→ 改善候補: モノラル64〜96kbpsへの再圧縮
- 録音はIndexedDBに蓄積されるが、利用されるのは最新1件のみで削除UIがない

---

## 8. 今後の検討課題(優先度順の目安)

1. プリセット音声の圧縮(体感速度改善、効果大・作業小)
2. 録音の管理UI(一覧・削除・複数保持)
3. 開始/再生時間の選択肢のさらなる調整(会員フィードバック次第)
4. 夢日記・セッション履歴・統計・プッシュ通知(旧構想。バックエンドが必要になるため要設計)
5. iOS/Androidネイティブアプリ化(画面消灯問題の根本解決)

---

## 9. 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-07-03 | ソースマップから実ソースを復元しmainにコミット。安定性修正(実時刻タイマー/リピート再生/Wake Lock強化/iOS録音対応/無音開始ガード/日本語ブランディング)。再生時間を1/5/10/30/45/60/90/120分に変更。テスト環境(lucid-dream-app-dev)構築。テスト検証・管理者承認のうえ本番反映(gh-pages `f5528ad`)。 |
| 〜2026-06 | Manus/Expo版から方針転換しWeb版(CRA)として運用開始。ソース未コミットのままgh-pagesのみで運用されていた。 |
