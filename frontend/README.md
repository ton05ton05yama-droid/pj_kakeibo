# frontend（ふたりの家計簿）

スマホ専用の静的 SPA。**Vite + React + TypeScript + Chakra UI v3 + TanStack Query**（`docs/05_platform.md` §1）。

正本は次の2つで、迷ったらこの2つを見る。

- UI（画面ID・状態・文言・見た目・見本データ）: `docs/03_ui_spec.md` ＋ `mock/index.html`
- お金の計算・月の状態: `docs/03_ui_spec.md` §4.0.2・§6 と `docs/02_settlement.md`

## 始め方

```bash
cd frontend
pnpm install
pnpm dev        # http://localhost:5173
```

この Mac には pnpm 11 / Node 24 が入っている。パッケージマネージャは **pnpm**（`pnpm-lock.yaml` を使う）。

| コマンド | 何をするか |
|---|---|
| `pnpm dev` | 開発サーバ（5173） |
| `pnpm build` | 型を見てから本番のビルド（`dist/`） |
| `pnpm preview` | ビルドしたものを見る |
| `pnpm typecheck` | 型だけ見る |
| `pnpm lint` / `pnpm lint:fix` | biome（形も直す） |
| `pnpm format` | biome の整形だけ |
| `pnpm test` / `pnpm test:run` | vitest（見張り／1回だけ） |
| `pnpm test:sql` | `supabase/migrations` を Postgres に当てて見本データで確かめる（04 §11） |

`pnpm test:sql` は **Docker が要る**（Supabase の Postgres イメージを動かす）。Supabase プロジェクトは不要。

`/__components` は**開発のときだけ**出る共通部品の見本（アプリの画面ではない）。

## 環境変数

`.env.example` を `.env.local` に写して入れる。**実際のキーはリポジトリに入れない**（`.env*` は `.gitignore` 済み。`docs/05_platform.md` §2.2）。

| 名前 | 中身 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase プロジェクトの URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key（`sb_publishable_…`。ブラウザに出てよい） |
| `VITE_AUTH_EMAIL_DOMAIN` | ID を擬似メールに変えるときのドメイン |

URL と key がそろっていれば Supabase の実装を使い、無ければ**仕様書 §9 の見本データを使うローカル実装**で動く（`src/data/index.ts` の `hasSupabaseConfig()`）。

`.env.local` に値があると Supabase 実装になる。空ならローカル実装（見本データ）。

secret key・DB の接続文字列は `VITE_` の変数に置かない。

## デプロイ（Vercel）

`vercel.json` に SPA の rewrite（静的ファイル以外は `/index.html` へ）を置いてある。
これ以外の **Root Directory = `frontend` ／ Framework = Vite ／ Output = `dist`** は
Vercel のダッシュボードで入れる設定（`docs/05_platform.md` §5.2）。まだデプロイはしていない。

Node 22.12 以上（手元は 24.18）。`package.json` の `engines` に書いてある。

## 置き場所

```
src/
├── app/          起動・プロバイダ（Chakra・TanStack Query・トースト・読み上げ・認証）・ルーティング
├── components/   共通部品（仕様書 §7.5）
├── features/     画面と機能単位のフック（features/<機能名>/）
├── domain/       計算・型・月の状態（純粋関数。§6.2）
├── data/         リポジトリ層（型・ローカル実装・Supabase 実装）
├── theme/        仕様書 §7.1〜§7.4 のトークン（Chakra v3 の createSystem）
└── lib/          小さな道具（金額の入力・表示の整形）
```

## 決まりごと

- 型は `strict`。`any` を使わない。関数と props に型を付ける。
- 計算は `domain/` の純粋関数に閉じ込め、UI から DB の値を直接計算しない。金額は円の整数。
- UI の文言は仕様書 §1.3・§1.4 の表にある文字列をそのまま使う（新しい言葉は先に表へ）。
- テーマは**ライトだけ**（§3.9）。`_dark` を定義せず、`.dark` のクラスも付けない。
- 日付は素の `Date` と自前の小さなユーティリティ（`dayjs` は使わない）。アイコンは `lucide-react`。
- コミットはユーザーに頼まれたときだけ（`CLAUDE.md` §4）。
