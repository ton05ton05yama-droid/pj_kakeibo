# pj_kakeibo（ふたりの家計簿）

まさととパートナーの2人が、それぞれのスマホで家計の支出を記録し、相手の記録も見られる家計簿アプリ。
毎月の支払い（金額が後で分かるものを含む）と、月ごとの「出す額（手取り × 割合）」を扱う。給料が共用口座に入る人は、出す額までが共用に入っているものとして精算額から引く（仕様書 §6.2・S-33）。
月末に「だれが共用といくら入れる・受け取るか」を、2台で同じ画面・同じ式で確かめて精算を終える。

## いまの段階

**設計・モック段階。実装はこれから。**

- 仕様書（UI の正本）、お金の計算・データモデル・基盤の設計、モックがそろった段階。
- アプリのコード（`frontend/src/`）と Supabase のマイグレーション（`supabase/migrations/`）は作り始めている。Vercel のデプロイはまだ。手順は `docs/06_setup.md`。

## モックの見方

- `mock/index.html` をブラウザで開く（ビルド無し・1ファイル）。
- 公開版（Artifact）の URL: https://claude.ai/artifact/N3jt4vwZnXuhPVCc9hsakz（非公開。パートナーに見せるときはページの Share から共有する。**2026-09-23 の変更〈記録タブ化・S-04・カテゴリ15個・設定の「記録の払った人」・月の途中でも精算できる〈S-20 の［この月を精算する］〉・呼び名「りさこ」／ ID `risako`・給料の入り先〈S-33〉と出す割合を本人だけに・出す額を決め直したときは給料の入り先だけいまの設定を取り込む〈仕様書 §12.1 Q27〉〉は未反映。再公開は 05 §5.3**）
- 閲覧者（まさと／りさこ）・シナリオ（9/22〜10/3）・端末の大きさを、画面の外の操作パネルで切り替える。色合いは参考UI（pj_income_visualization）にそろえた白い地のライトだけ。使い方は `mock/README.md`。

## ドキュメント

| 文書 | 役割 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | このリポジトリで作業するときのルール（正本の関係、UI を変える手順、Git） |
| [`docs/01_requirements.md`](docs/01_requirements.md) | 要件の要約、確定した決定事項（ユーザーの決定は §2.5）、仮置きの前提と未確定事項、作らないもの |
| [`docs/02_settlement.md`](docs/02_settlement.md) | お金の計算の実装の詳細（決まりの正本は仕様書 §6。実装の詳細は 02）: 月の状態、精算の式、金額待ち・来月に回す、端数、やり直し、2台の同時操作、見本データでの計算例 |
| [`docs/03_ui_spec.md`](docs/03_ui_spec.md) | **UI の正本**（モックと対）。お金の計算の決まり（§4.0.2・§6）もここが正本。認知負荷の上限、用語・文言、タブ責務、画面仕様 S-01〜S-34、フロー、トークン、見本データ、決まったこと・未確定事項（§12） |
| [`docs/04_data_model.md`](docs/04_data_model.md) | **データの正本**。Supabase のテーブル・制約・RLS・RPC の SQL 草案（ローカルの Postgres で検証済み）、画面との対応表 |
| [`docs/05_platform.md`](docs/05_platform.md) | 採用構成と理由、Supabase Free / Vercel Hobby の制約と対策、ID 風ログイン、PWA・iOS、Git の個人アカウント設定、初回デプロイで確かめること |
| [`mock/README.md`](mock/README.md) | モックの目的・開き方・操作パネル・URL のハッシュ・更新ルール（画面ID・状態キー・シナリオの期待値は仕様書 §4.0.1・§9.8） |
| `docs/research/` | 調査資料（参考UIのトークン `reference-ui.md`、市場の UX `market-ux.md`、基盤の一次情報 `platform.md`） |

## 技術構成（予定）

| レイヤ | 構成 |
|---|---|
| フロント | Vite + React + TypeScript + Chakra UI v3 + TanStack Query の静的 SPA（スマホ専用・ホーム画面に追加して使う） |
| ホスティング | Vercel Hobby（静的配信のみ） |
| DB・認証 | Supabase Free（東京）。supabase-js でブラウザから直接使い、RLS で守る。判定・確定は DB の関数（RPC） |
| ログイン | 新規登録なし。2人分のユーザーを手動で作り、画面は ID ＋ パスワード（内部で擬似メールに変換） |
| リポジトリ | 個人 GitHub `ton05ton05yama-droid/pj_kakeibo`（private）。push は `git@github-personal:` だけ（`docs/05_platform.md` §7） |
