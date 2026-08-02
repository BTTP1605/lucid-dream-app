# Web版 明晰夢誘導アプリ 引き継ぎドキュメント

**最終更新:** 2026-07-31 (2)
**管理者:** BTTP (BTTP1605 / bttp1605@gmail.com)

---

## 1. プロジェクト概要

睡眠後の指定時間にアファメーション音声を再生し、明晰夢へ誘導するWebアプリ。

- **本番URL(現行):** https://bttp.info/app/lucid-dream/ ← **エックスサーバー・会員ゲート付き**
- **旧本番URL:** https://bttp1605.github.io/lucid-dream-app/ (移行期間中の併存。案内では8月末まで)
- **テスト環境:** https://bttp1605.github.io/lucid-dream-app-dev/
- **利用者:** オンラインコミュニティ「操夢部」の会員(約20名)
- **ソースリポジトリ:** https://github.com/BTTP1605/lucid-dream-app

### 主な機能
- 開始までの遅延(即時 / 1 / 5 / 10 / 15 / 30 / 45分 / 1 / 4.5 / 5 / 5.5 / 6時間)
- 音声再生(プリセット3種 + 自分の録音)、再生時間まで自動リピート
- 再生時間(1 / 5 / 10 / 30 / 45 / 60 / 90 / 120分)、時間終了で自動停止
- 設定の自動保存・復元(遅延・再生時間・音声の選択)
- マイク録音(IndexedDBに永続保存、次回起動時に復元)
- 長時間遅延中のバックグラウンド維持(無音キープアライブ)
- アンケート(任意参加): 使用記録と、翌朝の「明晰夢に成功したか」の質問

> **4.5〜6時間の遅延について:** 入眠から約4時間半〜5時間後の「二度寝」で明晰夢を見やすいとされる知見(WBTB)に基づく選択肢。2026-07-31追加。

---

## 2. 最重要ルール: 本番環境を壊さない

- 本番は操夢部会員が使用中。**作業は必ず作業用ブランチで行う。**
- 変更は必ず**テスト環境(`lucid-dream-app-dev`)で動作確認**し、**管理者が明示的にOKした後だけ**本番反映する。
- `gh-pages` ブランチを手で編集しない。デプロイは履歴を残す方式で行い、**force push しない**。
- エックスサーバーへのデプロイは公開ディレクトリを一度クリアするため、**必ず先にビルドを完了させてから**実行する。

---

## 3. 構成と配信先

### ソース(GitHub)

| ブランチ | 内容 |
|---|---|
| `main` | ソースコード(唯一の正) |
| `gh-pages` | 旧本番(GitHub Pages)の配信物 |
| 作業用ブランチ | 開発中の変更 |

### 配信先

| 環境 | 配信元 | 備考 |
|---|---|---|
| 本番(現行) | エックスサーバー `/app/lucid-dream/` | 会員ゲート(index.php)。FTPSデプロイ |
| 旧本番 | `lucid-dream-app` の `gh-pages` | 併存中。8月末に案内スタブ化予定 |
| テスト | `lucid-dream-app-dev` の `gh-pages` | ゲートなし |

> **重要:** `package.json` の `homepage` は `https://bttp.info/app/lucid-dream` です。
> GitHub Pages 向けにビルドする場合は **`PUBLIC_URL` で上書き**してください(下記手順参照)。
> 上書きを忘れると、GitHub Pages側でJS/CSSが404になります。

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
│   ├── audio/
│   │   ├── affirmation.mp3       # 女性(約20MB)
│   │   ├── affirmation-male.mp3  # 男性(約32MB)
│   │   ├── binaural-beats.mp3    # バイノーラルビート(約20MB)
│   │   └── silence.mp3           # キープアライブ用の無音(30秒・117KB)
│   ├── index.html
│   └── manifest.json
├── server/
│   ├── index.php                 # 会員ゲート(未解錠は403)
│   ├── htaccess-lucid-dream
│   └── api/                      # アンケートAPI(PHP)
│       ├── _survey.php           # 共通処理(保存先・入力検証)
│       ├── session.php           # 使用記録の登録
│       ├── pending.php           # 未回答の質問の取得
│       └── answer.php            # 回答の保存
├── docs/                         # 本ドキュメント・アーカイブ
└── package.json                  # homepage = /app/lucid-dream
```

---

## 4. 技術スタック

- **React 19 + Create React App (react-scripts 5)** — フロントエンドのみ、**アプリ用バックエンドなし**
- データ保存はすべて端末内: 設定=localStorage(`lucid_dream_settings_v1`)、録音=IndexedDB(`LucidDreamDB`)
- 会員ゲートのみPHP(エックスサーバー)
- **採用しない技術**(旧Manus版の名残。`docs/archive/`は参考資料): React Native / Expo / tRPC / MySQL / Drizzle / Manus OAuth

### 実装上の重要ポイント(src/App.js)

- **カウントダウンは実時刻ベース**(終了時刻と`Date.now()`を比較)。バックグラウンドで`setInterval`が間引かれても時間がズレない。タブ復帰時(`visibilitychange`)に即再計算。
- **無音キープアライブ(長時間遅延の要):** 遅延中は `silence.mp3` をループ再生し続ける。端末から見て「再生中」の状態を維持することで、ブラウザがページを停止させるのを防ぐ。遅延終了時は**本再生の開始が成功してから**無音を止める(先に止めると再生セッションをOSに回収され、音が鳴らなくなることがある)。
- **iOSは`volume`を無視する。** 音量の一時的な抑制には必ず `muted` を使うこと(`volume = 0` は効かず、フル音量で鳴ってしまう)。この制約のため**アプリ内の音量スライダーは2026-07-31に削除**した。音量は端末の音量ボタンで調整する。再びアプリ内で音量を扱うなら Web Audio API の GainNode が必要。
- **モバイルの自動再生制限対策:** 開始ボタン(ユーザー操作)の中で、本音声を `muted` で一瞬再生→停止して「アンロック」しておく。キープアライブの開始も同じくユーザー操作の中で行う必要がある。
- **音声はループ再生**(`audio.loop = true`)。再生時間が音声より長い場合は繰り返す。遅延終了時は `currentTime = 0` で頭から流す。
- **Wake Lock:** 遅延中・再生中に画面スリープを防止。タブ復帰時に再取得。
- **録音形式はブラウザに合わせ自動選択**(webm/opus → webm → mp4)。iOS Safariはmp4になる。
- 録音データがないのに「自分の録音」設定が残っていた場合のガードあり(無音開始を防止)。

### アンケート機能(2026-08-02追加)

会員に翌朝「明晰夢に成功したか」をたずね、そのときの設定と一緒に記録する。どの遅延設定が効果的かを調べるのが目的。

- **参加は任意。** 同意した端末だけが記録される(`lucid_dream_survey_consent_v1`)。送るのは端末ごとの匿名ID(`lucid_dream_device_id_v1`)と回答のみ。
- **対象の朝:** 開始時刻が午前7時より前なら当日、それ以降なら翌日。同じ晩に何度使っても質問は1回。
- **就寝中は圏外のことがある**ため、使用記録は端末のキュー(`lucid_dream_survey_outbox_v1`)に貯め、次回起動時やタブ復帰時に再送する。
- **保存先:** `/app/_private/lucid-dream/sessions-YYYY-MM.jsonl` と `answers-YYYY-MM.jsonl`。追記のみなので同時アクセスで壊れない。
- **認証:** 会員Cookieを流用(`require_app`)。APIは会員でなければ403。
- **GitHub Pages版では機能を表示しない**(APIがないため。`isSurveySupported()`がホスト名で判定)。

---

## 5. 開発フロー(標準手順)

### 前提
- Node.js / npm / Git
- GitHubへのpush権限(認証はGit Credential Manager。**`Invalid username or token`が出たらpushし直すとブラウザ認証が開く**)
- エックスサーバーのFTPパスワード: `Claude-code\.xserver-ftp.local.json`(Git管理外。`appPassword`キーを使用)

### 1) 修正とテスト環境での確認

```bash
git clone https://github.com/BTTP1605/lucid-dream-app.git
cd lucid-dream-app
npm ci
git checkout -b feature/変更内容

npm start                                  # ローカル確認 http://localhost:3000
npm test -- --watchAll=false

# テスト環境用にビルド(PUBLIC_URLの上書きが必須)
PUBLIC_URL=/lucid-dream-app-dev npm run build
# PowerShell: $env:PUBLIC_URL="/lucid-dream-app-dev"; npm run build

git push origin feature/変更内容
```

ビルド結果(`build`の中身)を `lucid-dream-app-dev` の `gh-pages` ブランチにコミットしてpush
→ https://bttp1605.github.io/lucid-dream-app-dev/ で確認 → **管理者OKを取る**

### 2) 本番反映(管理者OK後のみ)

```bash
git checkout main
git merge --ff-only feature/変更内容
git push origin main
```

**エックスサーバー(現行本番):**

```bash
# PUBLIC_URLを指定せずにビルド(package.jsonのhomepageが使われる)
npm run build

cd ../xserver-deploy
node deploy.mjs --app lucid-dream
```

**GitHub Pages(旧本番。併存期間中のみ):**

```bash
PUBLIC_URL=/lucid-dream-app npm run build
# build の中身を gh-pages ブランチの worktree にコピーしてコミット&push
git fetch origin gh-pages
git worktree add ../gh-pages-deploy origin/gh-pages
# ../gh-pages-deploy を空にして build の中身をコピー → commit → push origin HEAD:gh-pages
git worktree remove ../gh-pages-deploy
```

> 履歴を保持したデプロイなので、**ロールバックは`gh-pages`を1つ前のコミットに戻すだけ**。
> エックスサーバー側は、前のビルドで `node deploy.mjs --app lucid-dream` を再実行すれば戻せる。

### 3) 反映確認

- エックスサーバー: `https://bttp.info/app/lucid-dream/asset-manifest.json` のバンドル名を確認(トップは未解錠だと403が正常)
- GitHub Pages: 配信中の `index.html` のバンドル名(`main.xxxxxxxx.js`)が新ビルドと一致するか確認

---

## 6. トラブルシューティング

### GitHub Pagesにpushしたのに反映されない
1. **deployジョブが稀にGitHub側エラーで失敗する。** Actionsタブで「pages build and deployment」を確認。失敗していたら`gh-pages`に空コミットをpushすれば再実行される。
2. デプロイ成功済みなら**CDNキャッシュ**(`max-age=600` = 最大10分)。待ってから再読み込み。

### GitHub Pages側でJS/CSSが404になる
`PUBLIC_URL` の上書きを忘れてビルドしている(`homepage`がエックスサーバー用のため)。手順5-1/5-2を参照。

### 会員がアプリを開けない(403)
未解錠。専用解錠リンク(`xserver-deploy\UNLOCK-LINKS.local.md` に記録)を案内する。Cookieは `unlock_app_lucid-dream`(HttpOnly・1年)。

### 長時間の遅延で音が鳴らない
1. キープアライブが動いているか: 開始直後にロック画面へ再生表示(「明晰夢誘導アプリ / 開始時刻まで待機中」)が出ていれば動作中。
2. ロック画面の停止ボタンを押すと無音が止まり、ページも停止しうる。押さないよう案内する。
3. 端末の省電力設定・ブラウザのバックグラウンド制限が強いと停止することがある。充電しながらの利用を推奨。

### 音が大きすぎる・小さすぎる
アプリ内に音量調節はない(2026-07-31に削除)。端末の音量ボタンで調整する。

---

## 7. 既知の制限

- **アプリ内に音量調節がない。** 端末の音量ボタンで調整する(iOSが`volume`を無視するため削除した)。
- **長時間遅延は端末環境に依存する。** 無音キープアライブで大幅に改善したが、OSの省電力設定によっては停止しうる。
- プリセット音声が大きい(20〜32MB)。モバイル回線では初回読み込みに時間がかかる。→ 改善候補: モノラル64〜96kbpsへの再圧縮
- 録音はIndexedDBに蓄積されるが、利用されるのは最新1件のみで削除UIがない。

---

## 8. 今後の検討課題

1. プリセット音声の圧縮(体感速度改善。効果大・作業小)
2. 録音の管理UI(一覧・削除・複数保持)
3. アプリ内の音量調節の復活(Web Audio APIのGainNodeならiOSでも効く)
4. 旧GitHub Pages本番の案内スタブ化(8月末予定)
5. 夢日記・セッション履歴・統計・プッシュ通知(バックエンドが必要。要設計)
6. iOS/Androidネイティブアプリ化(バックグラウンド問題の根本解決)

---

## 9. 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-08-02 | アンケート第1段階を追加(使用記録・翌朝の質問・PHP API)。エックスサーバー本番へ反映。GitHub Pages版は機能非表示のため据え置き。 |
| 2026-07-31 (2) | 音量スライダーを削除(iOSで機能しないため。音量は端末側で調整)。開始遅延の説明文を修正。両本番へ反映。 |
| 2026-07-31 | 開始遅延にWBTB用の長時間プリセット(4.5/5/5.5/6時間)を追加。長時間表示に対応(時間表記・H:MM:SS)。無音キープアライブでバックグラウンド停止を防止。アンロック時の音漏れ防止を`muted`に変更(iOS対応)。エックスサーバー・GitHub Pagesの両本番へ反映。 |
| 2026-07-29 | 本番をエックスサーバー `bttp.info/app/lucid-dream/` へ移行(会員ゲート付き)。`homepage`変更。GitHub Pages版は併存。 |
| 2026-07-03 | ソースマップから実ソースを復元し`main`にコミット(それ以前はソース未コミット)。安定性修正(実時刻タイマー/リピート再生/Wake Lock強化/iOS録音対応/日本語ブランディング)。再生時間を1/5/10/30/45/60/90/120分に変更。テスト環境を構築。 |
| 〜2026-06 | Manus/Expo版から方針転換しWeb版(CRA)として運用開始。 |
