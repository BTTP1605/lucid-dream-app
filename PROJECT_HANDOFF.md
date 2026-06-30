# 明晰夢誘導モバイルアプリ - プロジェクト引き継ぎドキュメント

## プロジェクト概要

**プロジェクト名:** lucid_dream_mobile（明晰夢誘導モバイルアプリ）
**バージョン:** 1.0.0
**作成者:** BTTP（Back To The Past）
**最終更新:** 2026-01-28

### アプリの目的
ユーザーが明晰夢（lucid dream）に誘導されるまでの遅延時間、音声、再生時間を設定し、瞑想状態に導くモバイルアプリ。

---

## 技術スタック

### フロントエンド
- **フレームワーク:** React Native 0.81.5
- **ランタイム:** Expo SDK 54
- **言語:** TypeScript 5.9
- **スタイリング:** NativeWind 4 + Tailwind CSS 3.4
- **ルーティング:** Expo Router 6
- **状態管理:** React Context + useState + AsyncStorage
- **パッケージマネージャー:** pnpm 9.12.0

### バックエンド
- **ランタイム:** Node.js
- **フレームワーク:** Express 4.22
- **API:** tRPC 11.7.2
- **データベース:** MySQL（TiDB Cloud）
- **ORM:** Drizzle ORM 0.44.7
- **認証:** Manus OAuth

### 主要ライブラリ
- **音声処理:** expo-audio 1.1.0, expo-av 16.0.8
- **通知:** expo-notifications 0.32.15
- **ストレージ:** @react-native-async-storage/async-storage 2.2.0
- **セキュア保存:** expo-secure-store 15.0.8
- **API通信:** @trpc/client 11.7.2, @trpc/react-query 11.7.2
- **データ取得:** @tanstack/react-query 5.90.12
- **UI:** @react-native-community/slider 5.1.2
- **検証:** Zod 4.2.1

---

## プロジェクト構成

```
lucid_dream_mobile/
├── app/                          # Expo Router ページ
│   ├── _layout.tsx              # ルートレイアウト（プロバイダー設定）
│   ├── (tabs)/
│   │   ├── _layout.tsx          # タブバーレイアウト
│   │   └── index.tsx            # ホーム画面（メイン実装）
│   ├── oauth/
│   │   └── callback.tsx         # OAuth認証コールバック
│   └── dev/
│       └── theme-lab.tsx        # テーマラボ
├── components/                   # React Nativeコンポーネント
│   ├── screen-container.tsx     # SafeArea ラッパー
│   ├── themed-view.tsx          # テーマ対応ビュー
│   ├── haptic-tab.tsx           # タップフィードバック
│   └── ui/
│       ├── icon-symbol.tsx      # アイコン管理
│       └── collapsible.tsx      # 折りたたみUI
├── hooks/                        # カスタムフック
│   ├── use-audio-player.ts      # 音声再生管理
│   ├── use-audio-recorder.ts    # 音声録音管理
│   ├── use-settings-storage.ts  # 設定永続化
│   ├── use-auth.ts              # 認証状態管理
│   ├── use-colors.ts            # テーマカラー
│   └── use-color-scheme.ts      # ダークモード検出
├── server/                       # バックエンド
│   ├── routers.ts               # tRPC ルーター定義
│   ├── db.ts                    # データベース関数
│   ├── storage.ts               # S3 ストレージ
│   └── _core/                   # フレームワーク（編集不可）
├── drizzle/                      # ORM スキーマ
│   ├── schema.ts                # テーブル定義
│   ├── relations.ts             # リレーション定義
│   └── migrations/              # マイグレーション
├── lib/                          # ユーティリティ
│   ├── trpc.ts                  # tRPC クライアント
│   └── utils.ts                 # ヘルパー関数
├── constants/                    # 定数
│   └── theme.ts                 # テーマ定義
├── assets/                       # 静的アセット
│   └── images/
│       ├── icon.png             # アプリアイコン（カスタム生成）
│       ├── splash-icon.png      # スプラッシュスクリーン
│       ├── favicon.png          # ウェブファビコン
│       └── android-icon-*.png   # Android適応型アイコン
├── app.config.ts                # Expo 設定
├── tailwind.config.js           # Tailwind 設定
├── theme.config.js              # テーマカラー定義
├── package.json                 # 依存関係
├── tsconfig.json                # TypeScript 設定
├── drizzle.config.ts            # Drizzle 設定
├── design.md                    # デザイン仕様書
├── todo.md                      # 開発進捗チェックリスト
└── .project-config.json         # プロジェクト設定

```

---

## 実装済み機能

### ✅ ホーム画面UI
- 遅延時間セクション（0～60分、8段階）
- 音声選択セクション（4種類）
- 再生時間セクション（1～45分、7段階）
- 音量スライダー（0.5～1.5倍）
- 「誘導を開始する」メインボタン
- 残り時間表示（MM:SS形式）

### ✅ 音声再生機能
- **プリセット音声3種類:**
  - アファメーション（女性）
  - アファメーション（男性）
  - バイノーラルビート
- 音声ファイルは CDN（Manus Files）から読み込み
- 音量調節機能
- 再生状態管理
- 自動停止機能

### ✅ 遅延タイマー
- 0～60分の遅延設定
- リアルタイムカウントダウン表示
- 遅延完了後の自動再生

### ✅ 再生時間タイマー
- 設定時間後の自動停止
- 残り時間のリアルタイム表示
- カウントダウン表示

### ✅ 設定の永続化
- AsyncStorage を使用したローカル保存
- 遅延時間、再生時間、音量の自動保存
- アプリ起動時の自動復元

### ✅ ブランディング
- カスタムアプリアイコン（月と脳波パターン）
- スプラッシュスクリーン設定
- ダークテーマ（深紺黒背景）
- app.config.ts の完全設定

### ✅ バックエンド基盤
- Manus OAuth 認証
- MySQL データベース接続
- tRPC API フレームワーク
- ユーザー管理テーブル

---

## 未実装機能

### ⏳ 録音機能（フェーズ3）
- [ ] マイク許可リクエスト
- [ ] 録音開始・停止
- [ ] 録音ファイルの保存
- [ ] 録音ファイルの再生

### ⏳ セッション履歴機能
- [ ] セッション記録の保存
- [ ] 履歴画面の実装
- [ ] 統計情報の表示

### ⏳ プッシュ通知 + 統計分析機能（検討中）
- [ ] セッション完了後の通知
- [ ] 明晰夢実行結果の回答フォーム
- [ ] サーバーへのデータ送信
- [ ] 統計分析ロジック

### ⏳ テストと最適化
- [ ] iOS 実機テスト
- [ ] Android 実機テスト
- [ ] バッテリー消費最適化
- [ ] UI 応答性確認

---

## 主要ファイルの説明

### app/(tabs)/index.tsx（メイン画面）
**行数:** 421行
**責務:** アプリのメイン画面実装

**主要な実装:**
- 遅延時間、音声選択、再生時間、音量の状態管理
- 遅延タイマーとカウントダウンタイマーのロジック
- 音声再生・停止の制御
- 設定の永続化との連携
- UI レンダリング

**重要な関数:**
- `startPlaybackAfterDelay()` — 遅延後の再生開始
- `formatTime()` — 時間フォーマット
- 遅延タイマー useEffect
- カウントダウンタイマー useEffect

### hooks/use-audio-player.ts
**責務:** 音声再生の管理

**機能:**
- プリセット音声の読み込み（CDN URL）
- 音量調節
- 再生・一時停止・停止
- 再生状態の追跡
- iOS サイレントモード対応

**プリセット音声 URL:**
```typescript
const PRESET_AUDIOS = {
  "affirmation-female": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663122612210/guRzJvXdPfyakaJs.mp3",
  "affirmation-male": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663122612210/kYRYponZWNMcgicN.mp3",
  "binaural-beats": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663122612210/BinauralBeats.mp3",
};
```

### hooks/use-settings-storage.ts
**責務:** ユーザー設定の永続化

**保存される設定:**
```typescript
interface Settings {
  delayMinutes: number;    // 遅延時間（デフォルト: 0）
  playDuration: number;    // 再生時間（デフォルト: 1）
  volume: number;          // 音量（デフォルト: 0.5）
}
```

**機能:**
- AsyncStorage への保存・読み込み
- 設定値のマージ
- リセット機能

### hooks/use-audio-recorder.ts
**責務:** 音声録音の管理

**機能:**
- マイク許可リクエスト
- 録音開始・停止
- ローカル URI 管理
- 削除機能

**注意:** 現在、録音ファイルはメモリ内のみで、AsyncStorage への永続化はまだ未実装

---

## データベーススキーマ

### users テーブル（既存）
```typescript
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
```

**TODO:** アプリ固有のテーブル（セッション履歴、統計データなど）はまだ未定義

---

## 環境変数・シークレット

### 必須環境変数
```
DATABASE_URL=mysql://...  # TiDB Cloud 接続文字列
JWT_SECRET=...            # JWT署名キー
OAUTH_SERVER_URL=...      # Manus OAuth サーバー
```

### Expo 環境変数
```
EXPO_APP_QR_URL=...       # QR コード用 URL
EXPO_PUBLIC_API_BASE_URL=... # API ベース URL
```

### アプリ設定（app.config.ts）
```typescript
appName: "明晰夢誘導モバイルアプリ"
appSlug: "lucid_dream_mobile"
logoUrl: "https://files.manuscdn.com/..." // S3 CDN URL
```

---

## 開発コマンド

```bash
# 開発サーバー起動（フロント + バック同時）
pnpm run dev

# フロントエンドのみ
pnpm run dev:metro

# バックエンドのみ
pnpm run dev:server

# ビルド
pnpm run build

# 本番起動
pnpm run start

# 型チェック
pnpm run check

# リント
pnpm run lint

# フォーマット
pnpm run format

# テスト
pnpm run test

# データベース マイグレーション
pnpm run db:push

# iOS/Android で起動
pnpm run ios
pnpm run android

# QR コード生成
pnpm run qr
```

---

## 開発サーバー情報

**現在のチェックポイント:** 81be192b（カスタムアイコン設定完了）

**前回のチェックポイント:** cc2141ac（設定永続化完了）

**開発サーバー URL:** https://8081-itnsahk13m92ebdyfupa1-fdd40c28.sg1.manus.computer

**API サーバー URL:** https://3000-itnsahk13m92ebdyfupa1-fdd40c28.sg1.manus.computer

**QR コード:** exps://8081-itnsahk13m92ebdyfupa1-fdd40c28.sg1.manus.computer

---

## 次のステップ（推奨）

### 短期（1～2週間）
1. **プッシュ通知 + 統計分析機能の実装**
   - セッション完了後の通知設定
   - 明晰夢実行結果の回答フォーム（3択）
   - サーバーへのデータ送信
   - 統計分析ロジック

2. **セッション履歴機能**
   - セッション記録の DB 保存
   - 履歴画面の実装
   - 統計情報の表示

### 中期（3～4週間）
3. **実機テスト**
   - iOS 実機テスト（QR コード経由）
   - Android 実機テスト
   - バッテリー消費最適化

4. **録音機能の完成**
   - 録音ファイルの AsyncStorage 永続化
   - 録音削除機能の改善

### 長期（1ヶ月以上）
5. **App Store / Google Play 公開準備**
   - ストア用スクリーンショット作成
   - プライバシーポリシー・利用規約作成
   - ビルドと署名設定

---

## 重要な注意事項

### 1. 音声ファイルの管理
- プリセット音声は CDN（Manus Files）から読み込み
- URL は `use-audio-player.ts` の `PRESET_AUDIOS` に定義
- 音声ファイルを変更する場合は、新しい URL を設定

### 2. データベース接続
- TiDB Cloud を使用
- `DATABASE_URL` は `.project-config.json` に保存
- 本番環境では環境変数から読み込む

### 3. 認証
- Manus OAuth を使用
- ユーザーはオプション（現在、ログイン機能は未実装）
- 将来的に統計分析機能を追加する場合は認証が必須

### 4. AsyncStorage の制限
- ローカルストレージのみ（クラウド同期なし）
- デバイス間のデータ同期が必要な場合は、サーバーに保存

### 5. プッシュ通知
- expo-notifications を使用
- iOS/Android で異なる設定が必要
- 本番環境では Firebase Cloud Messaging の設定が必須

---

## トラブルシューティング

### 音声が再生されない
1. `use-audio-player.ts` の URL が有効か確認
2. iOS サイレントモード設定を確認（`setAudioModeAsync`）
3. ネットワーク接続を確認

### 設定が保存されない
1. AsyncStorage の権限を確認
2. `use-settings-storage.ts` の `loadSettings` / `saveSettings` をデバッグ
3. ブラウザの開発者ツールで LocalStorage を確認

### ビルドエラー
1. `pnpm install` で依存関係を再インストール
2. `pnpm run check` で型エラーを確認
3. `pnpm run db:push` でマイグレーションを実行

---

## 参考資料

- **Expo 公式ドキュメント:** https://docs.expo.dev
- **React Native 公式ドキュメント:** https://reactnative.dev
- **Drizzle ORM ドキュメント:** https://orm.drizzle.team
- **tRPC ドキュメント:** https://trpc.io
- **Tailwind CSS ドキュメント:** https://tailwindcss.com

---

**作成日:** 2026-01-28
**最終更新:** 2026-01-28
**引き継ぎ対象:** 他社開発チーム
