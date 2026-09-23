# 実装基盤の調査（Supabase Free / Vercel Hobby / フロント構成 / スマホ運用 / Git複数アカウント）

- 調査日: 2026-09-22（下表の「確認日」はすべてこの日に一次情報を取得して確認）
- 対象: pj_kakeibo（2人用家計管理アプリ。Supabase 無料プラン + Vercel Hobby）
- 凡例
  - **[公式]** = 提供元の公式ドキュメント・changelog・公式ブログ（一次情報）
  - **[二次]** = コミュニティ回答・Issue・第三者記事（一次情報で裏付けられないもの）
  - **未確認** = 一次情報で確認できなかった。推測で断定しない
  - **（提案）** = 事実ではなく本プロジェクト向けの設計提案

---

## 0. 結論（推奨構成）

| レイヤ | 推奨 | 主な理由 |
|---|---|---|
| ホスティング | Vercel Hobby に **静的 SPA** として配置（SPA rewrite のみ） | 認証必須・SEO不要。Functions をほぼ使わないので Hobby 枠（Active CPU 4時間/月等）を消費しない |
| フロント | **Vite + React + TypeScript + Chakra UI v3 + TanStack Query** | 参考アプリのトークン/部品は Chakra 依存でフレームワーク非依存に移植可。Supabase は RLS 前提でブラウザから直接叩けるので SSR の利点が小さい |
| Supabase クライアント | `@supabase/supabase-js` のみ（`@supabase/ssr` は不要） | `@supabase/ssr` は SSR フレームワーク向け。クライアント専用 SPA は supabase-js で足りる [公式] |
| DB / 認可 | Supabase Free（東京 `ap-northeast-1`）、`households` + `household_members` + `private.my_household_ids()`（security definer）で RLS | Supabase 公式の推奨パターン（関数を `select` で包む・`to authenticated`・インデックス） |
| 認証 | メール+パスワード、**新規サインアップ OFF**、2ユーザーをダッシュボードで手動作成（Auto Confirm）。画面上は「ID」入力 → 固定ドメインの擬似メールに変換 | Supabase Auth にユーザー名ログインは無い。**example/test ドメインは拒否される**ので自分が管理するドメインを使う |
| API キー | **publishable key** をクライアントに。secret key はブラウザで使わない | 旧 `anon` / `service_role` は 2026 年末までに廃止予定 [公式] |
| 一時停止対策 | 1日1回の外部 ping（Vercel Cron 1回/日 or GitHub Actions）＋ 2人の日常利用 | Free は1週間 DB 活動が乏しいと一時停止 [公式]。pg_cron が活動扱いになるかは未確認 |
| バックアップ | 週1で `supabase db dump`（GitHub Actions 等で private に保管）（提案） | Free は自動バックアップ無し。公式が CLI での定期エクスポートを推奨 |
| スマホ | ホーム画面追加（manifest + アイコン）、`viewport-fit=cover` + `env(safe-area-inset-*)`、入力欄 16px 以上 | iOS 26 はホーム画面追加で既定で Web アプリとして開く [公式] |
| Git | このリポジトリだけ `git@github-personal:ton05ton05yama-droid/pj_kakeibo.git` + リポジトリローカルの `user.name` / `user.email` | Vercel Hobby × private リポジトリは **コミット作者 = Hobby チームのオーナー** でないとデプロイがブロックされる [公式] |

---

## 1. Supabase Free プラン

### 1.1 上限・仕様

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| DB サイズ | 500 MB（Shared CPU / 500 MB RAM）。超過すると **read-only モード**。ディスクは 1 GB あるが、判定は DB サイズ 500 MB | [公式] https://supabase.com/pricing / https://supabase.com/docs/guides/platform/database-size | 2026-09-22 |
| MAU | 50,000 | [公式] https://supabase.com/pricing | 2026-09-22 |
| 帯域（Egress） | 5 GB（＋ cached egress 5 GB） | [公式] https://supabase.com/pricing | 2026-09-22 |
| ファイルストレージ | 1 GB | [公式] https://supabase.com/pricing | 2026-09-22 |
| プロジェクト数 | アクティブ 2 件まで。一時停止中のプロジェクトは数に含まれない | [公式] https://supabase.com/pricing / https://supabase.com/docs/guides/platform/billing-on-supabase | 2026-09-22 |
| Edge Functions | 50 万回/月 | [公式] https://supabase.com/pricing | 2026-09-22 |
| Realtime | 同時接続 200、メッセージ 200 万/月 | [公式] https://supabase.com/docs/guides/platform/billing-on-supabase | 2026-09-22 |
| ログ保持 | API / DB ログ 1 日 | [公式] https://supabase.com/pricing | 2026-09-22 |
| 超過時 | 通知 → 猶予期間 → 継続超過で制限（一時停止・read-only・API が 402 を返す等）。猶予は1回きりで、2回目は即制限 | [公式] https://supabase.com/docs/guides/platform/billing-faq | 2026-09-22 |
| リージョン | 東京 `ap-northeast-1` を選べる（プランによる制限の記載は無し）。作成後に変更できるかは未確認 | [公式] https://supabase.com/docs/guides/platform/regions | 2026-09-22 |
| 参考: Pro | $25/月〜 | [公式] https://supabase.com/pricing | 2026-09-22 |

**容量見積り（提案・概算）**: 支出1行 ≒ 数百バイト（インデックス込み）。2人 × 1日10件 × 365日 ≒ 7,300行/年 → 年に数 MB 程度で、500 MB には遠く届かない。

### 1.2 無操作による一時停止（pause）

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 停止条件 | 直近1週間に**ユーザーによる DB 活動**が十分でないと Free プロジェクトは一時停止。目安として「毎日数回のリクエストがあれば十分」と記載 | [公式] https://supabase.com/docs/guides/platform/free-project-pausing / https://supabase.com/pricing | 2026-09-22 |
| 復帰方法 | ダッシュボード（Studio）で該当プロジェクトを開き、Resume ボタンで再開 | [公式] https://supabase.com/docs/guides/platform/free-project-pausing | 2026-09-22 |
| 復帰できる期間 | 現行の公式ページでは停止後 **1年** | [公式] 同上 | 2026-09-22 |
| 90日という記述 | 2024-06-24 の changelog は「90日」。旧 URL やスクリーンショットにも 90日表記が残っており、公式内で記述がぶれている。**正は現行の Project Pausing ページ（1年）**と扱い、停止させない運用を前提にする | [公式] https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days ／ [二次] https://github.com/supabase/agent-skills/issues/592 | 2026-09-22 |
| 公式の回避策 | Pro へのアップグレードのみ（有料プランは無操作で停止しない） | [公式] https://supabase.com/docs/guides/platform/free-project-pausing | 2026-09-22 |
| 非公式の回避策 | 外部スケジューラから1日1回、DB に届くリクエストを送る（GitHub Actions など）。**Auth の health エンドポイントは Postgres に届かないので効かない**という報告あり | [二次] https://github.com/travisvn/supabase-pause-prevention / https://runhooks.app/blog/preventing-supabase-free-tier-pausing/ | 2026-09-22 |
| pg_cron は活動扱いか | **未確認**。第三者記事に「DB 内の pg_cron だけでは停止を防げなかった」という報告があるが、公式の記載は無し | [二次] https://levelup.gitconnected.com/supabase-free-tier-will-pause-your-app-heres-the-github-actions-fix-8c1fd35b49ca | 2026-09-22 |

**設計への示唆（提案）**
- 2人が日常的に使えば通常は停止しないが、旅行などで1週間使わない可能性はある。**外部から1日1回 ping**:
  - 案A: Vercel Cron（Hobby は1日1回・UTC・±59分。§4.3）→ `api/keepalive.ts` → Supabase の RPC `ping()` を呼ぶ。
  - 案B: GitHub Actions の `schedule`（private リポジトリは無料枠 2,000分/月から消費。1回1分未満）。自動無効化（活動が60日無いと止まる）は **public リポジトリのみ**が対象 [公式] https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows / https://docs.github.com/en/billing/concepts/product-billing/github-actions（確認日 2026-09-22）
  - ping 用の RPC は `select 1` 相当の副作用なし関数にし、実データのテーブルは anon に公開しない。
- 停止してもデータは1年は復元できるが、**停止中はアプリが使えない**。Resume の手順を運用メモに残す。

### 1.3 バックアップ

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 自動バックアップ | Free は**無し**（ダッシュボードからも取得不可） | [公式] https://supabase.com/docs/guides/platform/backups | 2026-09-22 |
| 公式推奨 | Supabase CLI の `supabase db dump` で定期的にエクスポートし、別の場所に保管 | [公式] 同上 | 2026-09-22 |
| `db dump` の仕様 | Docker コンテナ内で `pg_dump` を実行。**`auth` / `storage` / 拡張機能のスキーマは除外**。`--data-only`、`--db-url`、`--linked` などのオプションあり | [公式] https://supabase.com/docs/reference/cli/supabase-db-dump | 2026-09-22 |

**注意（提案）**: `auth` スキーマはダンプに含まれない。別プロジェクトへ復元するとユーザーの UUID が変わるので、`created_by` / `paid_by` などの `auth.users(id)` 参照を付け替える手順が要る。2人しかいないので「ユーザーを作り直す → UUID を対応付けて UPDATE」で足りるが、その手順は運用メモに書いておく。

### 1.4 pg_cron（Supabase Cron）

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 機能 | Postgres 内で cron 構文のジョブを実行。1秒ごと〜年1回まで指定可。SQL / DB 関数の実行や、HTTP リクエスト（Edge Function の呼び出し等）ができる | [公式] https://supabase.com/docs/guides/cron | 2026-09-22 |
| 推奨上限 | 同時実行 8 ジョブ以下、1ジョブ 10分以内 | [公式] 同上 | 2026-09-22 |
| Free で使えるか | 公式ドキュメントにプラン別の記載は**見当たらない**（未確認）。Supabase の collaborator（2025-07）が「どのプランでも使え、制約は CPU・メモリ・ディスクだけ」と回答 | [二次] https://github.com/orgs/supabase/discussions/37405 | 2026-09-22 |

**設計への示唆（提案）**: 月末の締め・精算は「その月を開いたときにその場で集計する」方式にし、cron に頼らない。cron が止まったりずれたりしても整合が崩れない。

---

## 2. Supabase Auth（2人だけの ID/パスワード運用）

### 2.1 事実

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| メール確認の既定 | ホスト型プロジェクトでは「Confirm email」が既定で ON。Auth Providers 画面で切り替えられる | [公式] https://supabase.com/docs/guides/auth/passwords | 2026-09-22 |
| Confirm email を OFF にすると | メール確認なしでサインインでき、DB 上は暗黙的に確認済みになる | [公式] https://supabase.com/docs/guides/auth/general-configuration | 2026-09-22 |
| サインアップ無効化 | 「Allow new users to sign up」を OFF にすると既存ユーザーだけがサインインできる | [公式] 同上 | 2026-09-22 |
| サインアップ OFF でも管理者は作成できるか | ダッシュボードからの招待・作成はできたという報告あり。**公式ドキュメントに明記は無い**（実運用で確認すること） | [二次] https://github.com/orgs/supabase/discussions/4296 | 2026-09-22 |
| ダッシュボードでの手動作成 | Authentication → Users → Add user → Create new user。「Auto Confirm User」のチェックがある | [二次] https://github.com/supabase/auth/issues/1226 / https://drdroid.io/stack-diagnosis/supabase-auth-user-sign-up-disabled | 2026-09-22 |
| Auto Confirm の既知の不具合 | Auto Confirm で作成すると `raw_user_meta_data` が上書きされ、before insert トリガーで入れた値が消える（2025-07 報告） | [二次] https://github.com/supabase/supabase/issues/37413 | 2026-09-22 |
| Admin API | `auth.admin.createUser`（`email_confirm: true` で確認済み作成）と `auth.admin.updateUserById`（パスワード変更可）は**サーバー専用**。secret（service_role）キーをブラウザに出さないこと | [公式] https://supabase.com/docs/reference/javascript/auth-admin-createuser / https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid | 2026-09-22 |
| ユーザー名ログイン | Supabase Auth にユーザー名ログインは**無い**（collaborator 回答、2023-08）。ユーザー名からメールを引いてから `signInWithPassword` する回避策が一般的 | [二次] https://github.com/orgs/supabase/discussions/16619 | 2026-09-22 |
| **example/test ドメイン** | エラーコード `email_address_invalid` は「example / test ドメインは現在サポートしていない」という意味。**`@example.com` などの擬似メールは使えない**。ブロック対象ドメインの完全な一覧は未確認 | [公式] https://supabase.com/docs/guides/auth/debugging/error-codes ／ [二次] https://github.com/supabase/auth/issues/2702 | 2026-09-22 |
| 既定 SMTP | カスタム SMTP を設定しないと、プロジェクトのチームメンバー以外にはメールを送らない（`email_address_not_authorized`）。上限は 2通/時、SLA なし | [公式] https://supabase.com/docs/guides/auth/auth-smtp / https://supabase.com/docs/guides/auth/rate-limits | 2026-09-22 |
| パスワードリセット | メールでのリセットには SMTP が要る | [公式] https://supabase.com/docs/guides/auth/passwords | 2026-09-22 |
| Secure password change | ON にすると、セッション作成から24時間を過ぎたユーザーは、パスワード変更の前に nonce（メール、無ければ電話に送信）での再認証が必要 | [公式] https://supabase.com/docs/guides/auth/password-security | 2026-09-22 |
| 漏洩パスワード検知 | HaveIBeenPwned 連携は **Pro 以上** | [公式] 同上 | 2026-09-22 |
| セッション | 既定では無期限（リフレッシュトークンは期限なし・1回限り使用）。時間制限・非アクティブタイムアウト・単一セッションは **Pro 以上**。JWT は既定1時間 | [公式] https://supabase.com/docs/guides/auth/sessions | 2026-09-22 |
| レート制限（既定） | サインアップ/サインイン 30回/5分（burst 30）、トークン 150回/5分 など。多くは変更可 | [公式] https://supabase.com/docs/guides/auth/rate-limits | 2026-09-22 |
| API キー | publishable（`sb_publishable_...`）はブラウザ可。secret（`sb_secret_...`）はブラウザ不可で、User-Agent で判定され 401 になる。旧 `anon` / `service_role` は **2026年末までに廃止予定** | [公式] https://supabase.com/docs/guides/api/api-keys | 2026-09-22 |

### 2.2 「ID 風ログイン」運用案（提案）

1. **画面**: 「ID」と「パスワード」だけ。ID `masato` → `masato@<固定ドメイン>` に変換して `signInWithPassword`。ユーザー名→メールの検索は不要（DB を引かないので、ユーザー名からメールを探り当てられる問題も起きない）。
2. **固定ドメイン**: `example.com` や `.test` は拒否される（上表）。次のどちらか。
   - (a) **自分が管理するドメインのサブドメイン**（MX 不要。メールは届かない前提）← 推奨
   - (b) オーナーの Gmail の `+` エイリアス（例: `…+kakeibo-masato@gmail.com`）。届くアドレスなので、将来カスタム SMTP を入れればメールでのリセットもできる。ただし Supabase が `+` 付きアドレスをそのまま受け付けるかは**未確認**（作成時に確かめる）。
3. **設定**: Allow new users to sign up = **OFF**。2ユーザーはダッシュボードで Auto Confirm を付けて作成（Confirm email は ON のままでよい）。
4. **表示名・割合は `household_members` に持つ**。`user_metadata` には頼らない（Auto Confirm で上書きされる既知の不具合があるため）。
5. **パスワードを忘れたとき**: メールは届かないので、オーナーが手元のスクリプトから `auth.admin.updateUserById`（secret key）で再設定する。ブラウザにこの機能を置かない。
6. **パスワード変更（ログイン中）**: `supabase.auth.updateUser({ password })`。**Secure password change は OFF** にする（ON だと24時間経過後に届かないメールへ nonce が送られ、変更できなくなる）。
7. **セッションは無期限が既定**なので、再ログインはまれ（ただし §6.4 の iOS ストレージ削除に注意）。
8. 漏洩パスワード検知は Free では使えないので、長めのパスフレーズを使う。

---

## 3. 2人で1つの家計を共有する RLS 設計

### 3.1 公式の推奨事項（事実）

| 推奨 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| `auth.uid()` を `select` で包む | `(select auth.uid()) = user_id` と書くと、行ごとではなく文ごとに1回だけ評価される | [公式] https://supabase.com/docs/guides/database/postgres/row-level-security | 2026-09-22 |
| ロールを明示 | ポリシーに `to authenticated` を付ける（付けないと anon にも適用される） | [公式] 同上 | 2026-09-22 |
| 所属判定は security definer 関数で | 所属テーブルを引く関数を**公開していないスキーマ**（例 `private`）に作り、`security definer` + `set search_path = ''` + スキーマ修飾で書く。RLS の再帰を避けられる | [公式] 同上 | 2026-09-22 |
| インデックス | ポリシーの条件に使う列にはインデックスを張る（無いと全件スキャン） | [公式] 同上 | 2026-09-22 |
| UPDATE | UPDATE には対応する SELECT ポリシーも要る。`using`（更新してよい既存行）と `with check`（更新後の行）を分けて書く | [公式] 同上 | 2026-09-22 |
| JWT のチーム情報 | `app_metadata` を使う方法もあるが、JWT が更新されるまで反映されない | [公式] 同上 | 2026-09-22 |
| **Data API の明示 grant（破壊的変更）** | public スキーマの新しいテーブルは、**自動では Data API に公開されない**。2026-05-30 以降に作る新規プロジェクトでは既定。既存の全プロジェクトにも **2026-10-30** に適用。RLS の挙動は変わらず、grant は「テーブルに触れるか」、RLS は「どの行が見えるか」という別の層 | [公式] https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically | 2026-09-22 |

### 3.2 実装例（提案。仮置きの前提「閲覧は両者・編集/削除は登録者のみ・共有設定は2人とも編集可」に沿う）

```sql
-- 公開しないスキーマ（Data API の公開スキーマに加えない）
create schema if not exists private;

-- 家計と所属
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id      uuid not null references public.households(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  display_name      text not null,          -- 「まさと」「パートナー」（設定で変更）
  contribution_rate numeric(5,4),           -- 例 0.4000（各自別）
  primary key (household_id, user_id)
);
create index household_members_user_id_idx on public.household_members (user_id);

-- 所属判定（RLS の再帰を避ける）
create or replace function private.my_household_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select household_id
  from public.household_members
  where user_id = (select auth.uid())
$$;
revoke all on function private.my_household_ids() from public;
grant usage on schema private to authenticated;              -- 要検証: ポリシーから呼ぶのに必要か
grant execute on function private.my_household_ids() to authenticated;

-- 支出: 閲覧 = 同じ家計の2人 / 追加 = 本人名義で / 更新・削除 = 登録者のみ
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  spent_on     date not null,
  category     text not null,
  amount       integer not null check (amount >= 0),     -- 円
  paid_by      uuid references auth.users(id),           -- null = 共用（口座/カード）
  created_by   uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now()
);
create index expenses_household_spent_on_idx on public.expenses (household_id, spent_on);
create index expenses_created_by_idx        on public.expenses (created_by);

alter table public.expenses enable row level security;

create policy expenses_select on public.expenses
  for select to authenticated
  using (household_id in (select private.my_household_ids()));

create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    household_id in (select private.my_household_ids())
    and created_by = (select auth.uid())
  );

create policy expenses_update on public.expenses
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and household_id in (select private.my_household_ids())
  );

create policy expenses_delete on public.expenses
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- 明示 grant（anon には付与しない）
grant select, insert, update, delete on public.expenses to authenticated;

-- 共有設定（固定費・拠出額など）: 2人とも全操作可
-- create policy fixed_costs_all on public.fixed_costs
--   for all to authenticated
--   using      (household_id in (select private.my_household_ids()))
--   with check (household_id in (select private.my_household_ids()));

-- 所属（相手の表示名を見る・割合を編集する）。行の追加・削除は SQL エディタから管理者が行う
alter table public.household_members enable row level security;
create policy members_select on public.household_members
  for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy members_update on public.household_members
  for update to authenticated
  using      (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
grant select on public.household_members to authenticated;
grant update (display_name, contribution_rate) on public.household_members to authenticated; -- 列単位で更新を許可
```

補足（提案）
- `paid_by` が同じ家計のメンバーかどうかは、FK だけでは保証できない。トリガーか、`with check` に `paid_by is null or paid_by in (select user_id from household_members …)` を足して担保する。
- **精算済み月のロック**: `settlements(household_id, month, locked_at)` を用意し、`expenses` の insert / update / delete の条件に「その月がロックされていない」を加える（`private.is_month_locked(household_id, spent_on)` のような security definer 関数）。解除は `locked_at = null` にする操作として UI に出す。
- 初期データ（家計1件・メンバー2件）は、ダッシュボードの SQL エディタ（RLS の対象外）で投入する。
- 月の境界は JST で扱う。`spent_on` は date 型で持ち、クライアントが JST の日付を送る。集計も `spent_on` の範囲で行う。

---

## 4. Vercel Hobby

### 4.1 非商用条件と主な上限

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 位置づけ | 無料。個人・小規模向け。**個人の非商用利用に限る** | [公式] https://vercel.com/docs/plans/hobby（last_updated 2026-09-14） | 2026-09-22 |
| 「商用」の定義 | 制作に関わる誰かの金銭的利益のためのデプロイ（決済・販売の宣伝・制作の受託・アフィリエイトが主目的・広告掲載など）。寄付の募集は商用に当たらない | [公式] https://vercel.com/docs/limits/fair-use-guidelines（2026-09-14） | 2026-09-22 |
| 本件の該当性（解釈） | 2人の家計簿で、決済・広告・受託は無い → 非商用の範囲と解釈できる（最終判断は Vercel 側。迷う場合は問い合わせるよう公式に記載あり） | 同上 | 2026-09-22 |
| 月間の枠 | Fast Data Transfer 100 GB、Edge Requests 100万、Function Invocations 100万、Active CPU 4 CPU時間、Provisioned Memory 360 GB時間、Image Transformations 5,000 など | [公式] https://vercel.com/docs/plans/hobby | 2026-09-22 |
| 超過時 | 多くの場合、30日経つまでその機能を使えない | [公式] 同上 | 2026-09-22 |
| その他 | プロジェクト 200、デプロイ 100回/日、Functions 最大実行 300秒、ランタイムログ 1時間、チーム共同作業 不可 | [公式] 同上 | 2026-09-22 |
| Functions のリージョン | 既定は `iad1`（米国ワシントンD.C.）。Hobby は1リージョンのみ。東京は `hnd1` | [公式] https://vercel.com/docs/functions/configuring-functions/region / https://vercel.com/docs/regions | 2026-09-22 |

### 4.2 Cron Jobs

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 本数 | 1プロジェクト100本（全プラン共通） | [公式] https://vercel.com/docs/cron-jobs/usage-and-pricing（2026-07-15） | 2026-09-22 |
| Hobby の頻度 | **1日1回まで**。1日に複数回動く式（毎時・30分ごと等）は**デプロイ時にエラー** | [公式] 同上 | 2026-09-22 |
| Hobby の精度 | 時間単位（±59分）。例: `0 1 * * *` は 1:00〜1:59 のどこかで実行 | [公式] 同上 | 2026-09-22 |
| タイムゾーン | **常に UTC** | [公式] https://vercel.com/docs/cron-jobs（2026-09-16） | 2026-09-22 |
| 呼び出し方 | 本番デプロイの URL へ HTTP GET。User-Agent は `vercel-cron/1.0` | [公式] 同上 | 2026-09-22 |
| 課金 | 実体は Vercel Functions の呼び出しなので、Functions の枠を消費 | [公式] https://vercel.com/docs/cron-jobs/usage-and-pricing | 2026-09-22 |

**示唆（提案）**: Hobby の Cron は keep-alive 程度にしか向かない。「月末に精算を促す」ような時刻が大事な処理は、アプリを開いた時点で判定する（cron に依存しない）。

### 4.3 private リポジトリのデプロイとコミット作者

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 基本ルール | private リポジトリのコミットは、**コミット作者がその Vercel プロジェクトにアクセス権を持つとき**だけデプロイされる | [公式] https://vercel.com/docs/git（2026-09-08） | 2026-09-22 |
| Hobby の場合 | **コミット作者 = Hobby チームのオーナー**でなければならない。Login Connections に登録された Git アカウントとコミット作者を突き合わせて判定。一致しないとデプロイは止まり、Git 側に「Pro へ移行を」という案内が出る | [公式] https://vercel.com/docs/git / https://vercel.com/docs/deployments/troubleshoot-project-collaboration（2026-03-13） | 2026-09-22 |
| Organization のリポジトリ | GitHub **Organization** の private リポジトリは Hobby にデプロイできない（public 化か Pro が必要）→ **個人アカウント配下に置く** | [公式] https://vercel.com/docs/git | 2026-09-22 |
| 公式ドキュメント同士の食い違い | 同じ /docs/git に「この制限は Organization 等のコミット作者が対象で、個人アカウントのコラボレーターには適用されない」という一文もある。一方 troubleshoot ページは Hobby 全般で「作者はオーナーであること」としている。**安全側（作者 = オーナー）で運用する** | [公式] 同上 | 2026-09-22 |
| 照合の条件 | Git クライアントに設定したメールが、Git プロバイダ（GitHub）で**確認済み**のメールと一致すること。`dev+work@…` と `dev@…` は**別人扱い** | [公式] https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel（2026-07-28） | 2026-09-22 |
| Vercel 側のメール | Git 連携していない場合は、Vercel アカウントのメールをコミットのメールに合わせる。Vercel アカウントにはメールを3つまで登録できる | [公式] https://vercel.com/docs/deployments/troubleshoot-project-collaboration / https://vercel.com/docs/accounts | 2026-09-22 |
| AI エージェント作者 | 2025-06-06 の changelog: **Claude Code / Cursor Agent が作成したコミット**はチームシート無しでデプロイを起動できるようにした（Hobby に適用されるか、作者と Co-authored-by のどちらで判定するかは記載なし） | [公式] https://vercel.com/changelog/claude-code-and-cursor-agent-no-longer-require-a-team-seat | 2026-09-22 |

#### Co-authored-by トレーラーは影響するか → **未確認（公式には影響するという記載なし）**

- 公式ドキュメントが挙げる判定対象は**コミット作者**だけで、Co-authored-by には触れていない（上表）。
- コミュニティでは「`Co-Authored-By: Claude <noreply@anthropic.com>` や cursor-agent のトレーラーが原因でブロックされた」という投稿がある（2026-03）。ただしそのうち1件では、**Vercel のスタッフが原因は Claude ではなく別の GitHub ユーザーのコミットだ**と回答している。
  - [二次] https://community.vercel.com/t/vercel-hobby-plan-deployment-blocked-by-claude-code-ai-co-author-attribution/35972
  - [二次] https://community.vercel.com/t/vercel-deployment-blocked-for-cursor-agent-co-authored-commits-on-hobby-team/35720（スタッフ回答なし）
  - [二次] https://github.com/netteran/locreport/pull/16（2026-09-16。トレーラーは疑われただけで確証なし。リポジトリを public にしたらデプロイが通った）
- 同じ時期に、GitHub 連携の外れ・コミットのメール不一致による Hobby のブロック報告が多数ある（2026-03〜05）。対処はいずれも「GitHub 連携を付け直す」「`git config user.email` を GitHub の確認済みメールに合わせる」だった。
  - [二次] https://community.vercel.com/t/vercel-hobby-plan-deployment-blocked-because-commit-author-lacks-access/35446
  - [二次] https://community.vercel.com/t/vercel-deployment-blocked-initial-deployment-was-ok/37979
  - [二次] https://community.vercel.com/t/title-deployment-blocked-on-hobby-plan-private-repo-from-cli/42775（CLI デプロイでも同様に止まった例）

**運用方針（提案）**
1. リポジトリは**個人アカウント `ton05ton05yama-droid` 配下の private** にする（Organization 配下にしない）。
2. コミット作者のメールを **GitHub で確認済みのメールと完全一致**させる（§7）。
3. 最初のデプロイで、Co-authored-by 付きのコミットが通るかを**実際に確かめる**。止まった場合は GitHub のコミットステータスにある Vercel の文言で原因を切り分け、(a) 作者メールと GitHub 連携を点検 → (b) それでも止まるならトレーラーを外して再コミット、public 化、Pro のどれにするかをユーザーが判断する。

---

## 5. フロント構成

### 5.1 事実

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| Next.js の最新 | 16.3（2026-08-03）。16（2025-10-21）で Turbopack が既定・React Compiler が安定版 | [公式] https://nextjs.org/blog | 2026-09-22 |
| `@supabase/ssr` の要否 | **SSR フレームワーク用**（Cookie でセッションを持ち、サーバー描画時にログイン済みにする）。クライアント専用 SPA は `@supabase/supabase-js` を使う | [公式] https://supabase.com/docs/guides/auth/server-side/creating-a-client | 2026-09-22 |
| Next.js × Supabase の必須事項 | `createBrowserClient` と `createServerClient` を分け、**トークン更新のために Proxy（Next 16 の `proxy.ts`。15 以前は `middleware.ts`）が必須**。サーバー側で `getSession()` を信用せず `getClaims()` で検証する。Next 15 以前で `proxy.ts` を置いても呼ばれず、ログアウトされてしまう | [公式] https://supabase.com/docs/guides/auth/server-side/nextjs | 2026-09-22 |
| 環境変数名 | Next.js: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | [公式] https://supabase.com/docs/guides/auth/server-side/creating-a-client | 2026-09-22 |
| React SPA の公式クイックスタート | `@supabase/supabase-js` を使い、`getClaims` でローカルの JWT を検証 | [公式] https://supabase.com/docs/guides/auth/quickstarts/react | 2026-09-22 |
| Chakra UI v3 + Next App Router | 生成される Provider（ChakraProvider + next-themes）を `"use client"` でルートに置く。`<html suppressHydrationWarning>`、`optimizePackageImports` を推奨。現行 3.37.0 | [公式] https://chakra-ui.com/docs/get-started/frameworks/next-app | 2026-09-22 |
| Chakra UI v3 + Vite | `@chakra-ui/react` と `@emotion/react`、Provider でラップ。Vite 8 以降は `resolve.tsconfigPaths`、それより前は `vite-tsconfig-paths`。Node 20 以上 | [公式] https://chakra-ui.com/docs/get-started/frameworks/vite | 2026-09-22 |
| Vite SPA を Vercel に置く | 直接 URL を開けるように `vercel.json` に全パスを `/index.html` へ rewrite する設定を入れる。環境変数は `VITE_` 接頭辞 | [公式] https://vercel.com/docs/frameworks/frontend/vite（2026-08-26） | 2026-09-22 |
| Vite でサーバー処理を足す | 公式は Nitro を推奨。フレームワーク無しでも `/api` 配下の TS/JS は Node.js ランタイムの Function になる | [公式] 同上 / https://vercel.com/docs/functions/runtimes/node-js | 2026-09-22 |
| 参考アプリ | Next.js 14.2 / Pages Router / Chakra UI 3.36 / TanStack Query 5 / next-themes | ローカル `pj_income_visualization/frontend/package.json` | 2026-09-22 |

### 5.2 比較（提案）

| 観点 | **Vite SPA（推奨）** | Next.js App Router | Next.js Pages Router |
|---|---|---|---|
| Supabase 連携 | supabase-js だけ。RLS 前提でブラウザから直接 | `@supabase/ssr` + `proxy.ts` + `getClaims()`。Cookie 周りの実装と検証が増える | クライアント専用なら実質 SPA と同じ。SSR するなら `@supabase/ssr` |
| Chakra UI v3 | そのまま動く | Provider は client 境界。Chakra 部品は基本的にクライアントコンポーネントになり、RSC の利点は小さい | 参考アプリと同じ構成 |
| Vercel Hobby の消費 | 静的配信のみ（Fast Data Transfer / Edge Requests）。Functions はほぼ 0 | SSR・Server Actions が Functions（Active CPU 4時間/月）を使う。既定の `iad1` → 東京の Supabase まで往復するので `hnd1` への変更が要る | SSR した分だけ同様 |
| 体感速度 | ブラウザ → Supabase 東京へ直接 | サーバーを経由すると1ホップ増える | 同左 |
| PWA | `vite-plugin-pwa`（manifest 生成・Workbox の SW・更新方式 autoUpdate/prompt。現行 v1.2.0）[公式] https://vite-pwa-org.netlify.app/guide/ | `app/manifest.ts` が標準。SW は手書きか Serwist [公式] https://nextjs.org/docs/app/guides/progressive-web-apps | 手作業 |
| 参考アプリとの近さ | トークン（`theme.ts`）と部品は Chakra 依存なので移植できる。ルーティングは書き直す | ディレクトリ構成は別物 | 最も近い |
| 将来サーバー処理が要るとき | `/api` の Vercel Function か Supabase Edge Functions を足す | 標準で持てる | API Routes |

**推奨**: **Vite + React + TypeScript の SPA**。理由は次のとおり。(1) 全画面ログイン必須で SEO が要らず、SSR の利点がほとんど無い。(2) 認可は RLS に集約でき、サーバー層が要らない。(3) Hobby の Functions 枠とリージョン設定を気にしなくてよい。(4) `@supabase/ssr` と Proxy まわりの落とし穴（Next 15/16 でのファイル名の違い、`getSession` を信用しない等）を避けられる。
Next.js を選ぶなら App Router + `@supabase/ssr` + `proxy.ts` + Functions のリージョンを `hnd1` に、が最低条件。
ルーター（TanStack Router / React Router）の選定は本調査の対象外。

---

## 6. スマホ運用（PWA・standalone・safe-area・入力ズーム・オフライン）

### 6.1 ホーム画面追加 / standalone

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| iOS 26 / iPadOS 26 | ホーム画面に追加したサイトは**既定で Web アプリとして開く**。manifest は必須ではなくなったが、manifest の `display` やアイコンは引き続き使われる。利用者は「Web アプリとして開く」をオフにもできる | [公式] https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/（2025-06-09） | 2026-09-22 |
| Chrome（Android）のインストール条件 | HTTPS。manifest に `name` または `short_name`、192px と 512px のアイコン、`start_url`、`display`（`standalone` 等）があり、`prefer_related_applications` が無いか false。加えて利用の実績（1回以上タップし、30秒以上閲覧） | [公式] https://web.dev/articles/install-criteria（更新 2024-09-19） | 2026-09-22 |
| Service Worker は必須か | web.dev の現行の条件には**含まれていない**。ただし Lighthouse の説明（2024-04-16）はまだ SW を条件に挙げており、記述が食い違う（→ SW は任意として扱い、入れる場合は更新方式を決める） | [公式] https://web.dev/articles/install-criteria / https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest | 2026-09-22 |
| manifest の推奨 | 512px を必ず含める。Android 向けに maskable アイコン（512px 以上）。iOS はスプラッシュ等で manifest の一部を使わない | [公式] https://web.dev/learn/pwa/web-app-manifest | 2026-09-22 |
| standalone の判定 | `matchMedia('(display-mode: standalone)')` | [公式] https://nextjs.org/docs/app/guides/progressive-web-apps（v16.3.5, 2026-07-30） | 2026-09-22 |
| Web Push | iOS 16.4 以降は**ホーム画面に追加した場合のみ**使える | [公式] 同上 | 2026-09-22 |

### 6.2 safe-area

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| `viewport-fit=cover` | 画面全体を埋める指定。その場合は safe-area-inset を使うよう強く推奨されている | [公式] https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport | 2026-09-22 |
| `env(safe-area-inset-*)` | top / right / bottom / left。矩形の画面なら 0。フォールバック値を指定できる。Baseline（2020-01 から広く対応） | [公式] https://developer.mozilla.org/en-US/docs/Web/CSS/env | 2026-09-22 |
| ズーム禁止は避ける | `user-scalable=no` や `maximum-scale` でズームを禁じるのはアクセシビリティ上の問題（WCAG は2倍以上の拡大を要求） | [公式] MDN viewport（同上） | 2026-09-22 |
| キーボードと viewport | `interactive-widget`（`resizes-visual` が既定 / `resizes-content` / `overlays-content`）。iOS Safari での対応状況は**未確認** | [公式] 同上 | 2026-09-22 |

実装メモ（提案）: 下部タブバーは `padding-bottom: calc(8px + env(safe-area-inset-bottom))`。上部は `env(safe-area-inset-top)`。`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`。

### 6.3 iOS の入力欄ズーム（16px 未満）

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| 挙動 | iOS Safari（iOS 上の WebKit）は、**描画時のフォントサイズが 16px 未満**の入力欄にフォーカスするとページを拡大する。16px 以上なら拡大しない。`transform: scale()` で縮めた結果 16px を下回っても拡大する。macOS Safari では起きない | [二次] https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/ / https://defensivecss.dev/tip/input-zoom-safari/ / https://takazudomodular.com/pj/zudo-tauri/docs/mobile/ios-input-auto-zoom/ | 2026-09-22 |
| Apple / WebKit の公式文書 | **未確認**（公式の仕様書・ドキュメントは見つからなかった。多数の二次情報で一貫して観測されている挙動） | — | 2026-09-22 |
| 対策 | input / select / textarea を 16px 以上にする（UI 制約どおり）。ズーム禁止の meta で逃げない | [二次] 同上 / [公式] MDN viewport | 2026-09-22 |

Chakra v3 の `Input size="sm"` などは 16px 未満になり得るので、入力系のレシピで `fontSize: "md"`（16px）を下限にする（提案）。

### 6.4 ストレージとログイン状態（iOS）

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| Safari の 7日ルール | Safari を使っていて、そのサイトを **7日間操作しないと**、スクリプトから書き込めるストレージ（localStorage・IndexedDB・SW のキャッシュ等）が削除される | [公式] https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/（2020-03-24） | 2026-09-22 |
| ホーム画面の Web アプリ | Safari の一部ではなく、**独自に日数を数える**（その Web アプリを使っていれば削除されない） | [公式] 同上 | 2026-09-22 |
| 永続化 | `navigator.storage.persist()` を要求できる。WebKit はホーム画面の Web アプリかどうか等から判断して許可する | [公式] https://webkit.org/blog/14403/updates-to-storage-policy/（2023-08-10） | 2026-09-22 |
| Safari とホーム画面アプリでストレージを共有するか | **未確認**（本調査では一次情報を見つけられず）。「インストール後に再ログインが要る」前提で設計する | — | — |

示唆（提案）: supabase-js は既定でセッションを localStorage に置く。**Safari のタブで使い続けると7日無操作でログアウトされ得る**ので、初回ログイン後に「ホーム画面に追加」を1回だけ案内する（standalone 起動時は出さない）。

### 6.5 オフライン時の扱い（提案）

事実（TanStack Query）[公式] https://tanstack.com/query/latest/docs/framework/react/guides/network-mode / https://tanstack.com/query/latest/docs/framework/react/guides/mutations（確認日 2026-09-22）
- 既定の `networkMode: 'online'` では、オフライン中はクエリもミューテーションも発火せず `fetchStatus: 'paused'` になる。取得中に回線が切れたら再試行を止め、回線が戻れば続きを実行する。
- オフライン中のミューテーションをリロード後も保持するには、`setMutationDefaults`（リロード後に関数を復元するため）＋ `PersistQueryClientProvider` ＋ `resumePausedMutations` が要る。保存されるのは状態だけで、関数はシリアライズされない。

方針（提案）
1. **MVP では書き込みにオンラインを必須にする**。オフラインのときは画面上部に1行「オフライン（表示は最後に取得した内容）」を出し、主ボタンを無効にする。精算・ロックの操作は絶対にキューに積まない（2人の操作がぶつかって整合が崩れるのを防ぐ）。
2. 表示は TanStack Query のキャッシュ（必要なら persist）で直前の内容を見せる。
3. 後から「支出の追加だけオフラインでキューに積む」を足す余地は残す（`setMutationDefaults` の方式）。その場合は `created_at` ではなく `spent_on` で集計しているので、同期が遅れても月の帰属はずれない。
4. SW は最初は入れないか、アプリシェルのキャッシュだけにする。更新方式は `prompt`（更新の案内）より `autoUpdate` のほうが UI が少なく済む。

---

## 7. Git の複数アカウント（会社アカウントの Mac で、このリポジトリだけ個人 GitHub にする）

### 7.1 この Mac の現状（2026-09-22 に読み取り専用で確認。何も変更していない）

- グローバルの `user.name` / `user.email` は**会社のもの**。
- `credential.https://github.com.helper` = `gh auth git-credential`。gh の有効アカウントは**会社アカウント**で、Git の操作プロトコルは https。
- `~/.ssh/config` に `Host github-personal`（`HostName github.com` / `IdentityFile ~/.ssh/id_ed25519_github_personal` / `IdentitiesOnly yes`）が**既にある**。
- `ssh -T git@github-personal` → **`ton05ton05yama-droid` として認証に成功**。
- `pj_kakeibo` はまだ git リポジトリではない。

### 7.2 事実

| 項目 | 内容 | 出典 | 確認日 |
|---|---|---|---|
| SSH で複数アカウント | `~/.ssh/config` にアカウントごとの Host を作り、別々の鍵を指定する。`IdentitiesOnly` を付けると、ssh-agent に鍵が複数あっても指定した鍵を使う | [公式] https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/managing-multiple-accounts | 2026-09-22 |
| 同じ鍵を複数アカウントで使う | できない（別アカウントに登録済みの鍵は追加できない） | [公式] https://docs.github.com/en/authentication/troubleshooting-ssh/error-key-already-in-use | 2026-09-22 |
| 接続テスト | `ssh -T git@<host>` で、成功すると「Hi ユーザー名!」と表示される | [公式] https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection | 2026-09-22 |
| リポジトリごとのメール | `--global` を付けずに `git config user.email` を設定すると、そのリポジトリだけ上書きされる | [公式] https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address | 2026-09-22 |
| コミットの帰属 | コミットのメールを GitHub アカウントに追加すると、そのアカウントのコミットとして扱われる | [公式] 同上 | 2026-09-22 |
| noreply アドレス | 形式は `ID+USERNAME@users.noreply.github.com` | [公式] https://docs.github.com/en/account-and-profile/reference/email-addresses-reference | 2026-09-22 |
| メール公開をブロックする設定 | 有効だと、push 時に最新コミットの作者メールが非公開設定のメールなら **push が拒否される** | [公式] https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/blocking-command-line-pushes-that-expose-your-personal-email-address | 2026-09-22 |
| worktree と設定 | `.git/config`（リポジトリローカルの設定）は全ての linked worktree で共有される（`extensions.worktreeConfig` を有効にした場合だけ worktree ごとの設定を持てる） | [公式] https://git-scm.com/docs/git-config | 2026-09-22 |
| `includeIf "gitdir:…/"` | パターンが `/` で終わると配下すべてに一致する | [公式] 同上 | 2026-09-22 |
| gh の有効アカウント | `gh auth switch` はホスト単位で有効アカウントを切り替える（リポジトリ単位ではない） | [公式] https://cli.github.com/manual/gh_auth_switch | 2026-09-22 |
| gh の環境変数 | `GH_TOKEN` は保存済みの認証情報より優先。`GH_REPO` で対象リポジトリを指定。`GH_CONFIG_DIR` で設定ディレクトリを切り替え | [公式] https://cli.github.com/manual/gh_help_environment | 2026-09-22 |
| gh と SSH の Host 別名 | `gh repo create` は Host 別名を使ったリモートを作れない（`github.com` の URL を書く）。別名のリモートを gh が GitHub のリモートとして認識するかは**未確認**（認識できないという報告あり） | [二次] https://github.com/cli/cli/discussions/11371 / https://github.com/cli/cli/issues/4621 | 2026-09-22 |
| Vercel のログイン連携 | Hobby チームには、各サービスにつきログイン連携を1つしか持てない（GitHub アカウントは1つ）。別の GitHub アカウントで登録し直すなら、先に GitHub からログアウトする | [公式] https://vercel.com/docs/accounts / https://vercel.com/docs/git/vercel-for-github | 2026-09-22 |
| 個人リポジトリの取り込み | 個人アカウントのリポジトリを Vercel に取り込めるのは**そのリポジトリのオーナー**だけ（コラボレーターは不可） | [公式] https://vercel.com/docs/git/vercel-for-github | 2026-09-22 |

### 7.3 手順案（提案。実行はしていない）

```sh
# 1) GitHub 上のリポジトリ作成は Web UI で行う（ブラウザで ton05ton05yama-droid としてログインして private で作成）
#    → gh は会社アカウントが有効なので、gh repo create を使わない

# 2) ローカル
cd /Users/yamaguchimasato/workspace/pj_kakeibo
git init -b main
git config user.name  "ton05ton05yama-droid"
git config user.email "ton05.ton05.yama@gmail.com"     # GitHub で「確認済み」になっていること
git remote add origin git@github-personal:ton05ton05yama-droid/pj_kakeibo.git

# 3) push 前の確認
git config --show-origin --get user.email   # → .git/config の gmail になっていること
git log -1 --format='%an <%ae>'             # → 作者が個人アカウントであること
ssh -T git@github-personal                  # → Hi ton05ton05yama-droid!
```

注意点
1. **リモートを https にしない**。`https://github.com/...` にすると、グローバルの credential helper（gh の会社アカウント）で認証される。必ず `git@github-personal:` にする。
2. **`ton05.ton05.yama@gmail.com` が `ton05ton05yama-droid` の GitHub で「確認済み」かを Settings → Emails で確認**する（本調査では確認できない）。確認済みでないと、コミットが個人アカウントに紐づかず、Vercel の作者照合にも失敗する。
3. GitHub で「メールを非公開にする」と「コマンドラインからの push でメールを公開しない（ブロック）」の両方が ON だと、gmail で作ったコミットの push が拒否される。その場合は noreply アドレス（`ID+ton05ton05yama-droid@users.noreply.github.com`）を `user.email` にする。noreply で Vercel の作者照合が通るかは**未確認**（GitHub 連携で判定されるので通る見込みだが、初回デプロイで確かめる）。
4. **`gh auth switch` をしない**。ホスト全体で有効アカウントが変わり、並行して会社リポジトリを触っている別セッションに影響する。個人リポジトリで gh を使うときは、`GH_TOKEN=<個人PAT> gh … -R ton05ton05yama-droid/pj_kakeibo` のようにコマンド単位で指定するか、`GH_CONFIG_DIR` を分ける（キーチェーン上のトークンがぶつからないかは**要検証**）。
5. **worktree**: `.git/config` の `user.*` は全 worktree で共有されるので、worktree を作ってもメールは個人のまま。
6. 保険（任意・グローバル設定の変更になるのでユーザーが判断）: グローバルに `includeIf "gitdir:~/workspace/pj_kakeibo/"` で個人用の設定ファイルを読み込ませる。または pre-commit / pre-push フックで `user.email` が gmail であることを確認する。
7. **Vercel の登録**: ブラウザの GitHub が会社アカウントでログイン中なら、シークレットウィンドウか GitHub からログアウトした状態で、`ton05ton05yama-droid` で Vercel（Hobby）に登録する。Vercel GitHub App は個人アカウントに入れ、対象リポジトリは「Only select repositories」で `pj_kakeibo` だけにする（提案）。念のため Vercel アカウントのメールにも gmail を追加・確認しておく。
8. Claude Code のコミットには `Co-Authored-By: Claude … <noreply@anthropic.com>` が付く。Hobby で影響するかは §4.3 のとおり**未確認**。初回デプロイで確かめる。

---

## 8. 未確認事項（実装前後に実地で確認する）

| # | 事項 | 確認方法（提案） |
|---|---|---|
| U1 | Supabase の停止判定で pg_cron が「活動」扱いになるか | 公式には記載なし → 外部からの ping を採用し、pg_cron に頼らない |
| U2 | pg_cron が Free で使えることの公式明記 | collaborator 回答のみ。使うならダッシュボードで拡張機能を有効化できるかを確認 |
| U3 | サインアップ OFF のままダッシュボード / Admin API でユーザーを作れるか | 初期構築時に実際に作成して確認 |
| U4 | `email_address_invalid` で拒否されるドメインの範囲（`.test` / `.invalid` / `.local` 等）と `+` エイリアスの扱い | 自分のドメイン（推奨）で作成して確認 |
| U5 | `private.my_household_ids()` に `grant usage on schema private` が要るか | マイグレーション適用後、`authenticated` で select を試す |
| U6 | Vercel Hobby で `Co-authored-by: Claude` 付きコミットがブロックされるか | 初回デプロイで確認。止まったら §4.3 の順で切り分け |
| U7 | noreply アドレスのコミットが Vercel の作者照合を通るか | noreply を使う場合だけ確認 |
| U8 | gh が SSH Host 別名のリモートを認識するか | 使うときは常に `-R owner/repo` を付けて回避 |
| U9 | iOS で 16px 未満の入力欄がズームされることの Apple / WebKit 公式文書 | 実機（iPhone）で確認。UI 制約で 16px 以上に統一済み |
| U10 | iOS Safari とホーム画面アプリでストレージを共有するか / `interactive-widget` への対応 | 実機で確認 |
| U11 | Supabase プロジェクト作成後にリージョンを変えられるか | 最初から東京で作るので実害なし |
| U12 | GitHub の `ton05.ton05.yama@gmail.com` が確認済みか、個人アカウントに既存の Supabase プロジェクトがあるか（Free は2件まで） | GitHub Settings → Emails / Supabase ダッシュボード |

---

## 9. 出典一覧（すべて 2026-09-22 に確認）

**Supabase**
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/billing-faq
- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/platform/regions
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/debugging/error-codes
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
- https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/auth/quickstarts/react

**Vercel**
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/docs/cron-jobs
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/git
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/deployments/troubleshoot-project-collaboration
- https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel
- https://vercel.com/changelog/claude-code-and-cursor-agent-no-longer-require-a-team-seat
- https://vercel.com/docs/accounts
- https://vercel.com/docs/functions/configuring-functions/region
- https://vercel.com/docs/regions
- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/functions/runtimes/node-js

**フロント / PWA / Web プラットフォーム**
- https://nextjs.org/blog
- https://nextjs.org/docs/app/guides/progressive-web-apps
- https://chakra-ui.com/docs/get-started/frameworks/next-app
- https://chakra-ui.com/docs/get-started/frameworks/vite
- https://vite-pwa-org.netlify.app/guide/
- https://tanstack.com/query/latest/docs/framework/react/guides/network-mode
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- https://webkit.org/blog/14403/updates-to-storage-policy/
- https://web.dev/articles/install-criteria
- https://web.dev/learn/pwa/web-app-manifest
- https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest
- https://developer.mozilla.org/en-US/docs/Web/CSS/env
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport

**GitHub / Git**
- https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/managing-multiple-accounts
- https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address
- https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/blocking-command-line-pushes-that-expose-your-personal-email-address
- https://docs.github.com/en/account-and-profile/reference/email-addresses-reference
- https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection
- https://docs.github.com/en/authentication/troubleshooting-ssh/error-key-already-in-use
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://cli.github.com/manual/gh_auth_switch
- https://cli.github.com/manual/gh_help_environment
- https://git-scm.com/docs/git-config

**二次情報（参考。一次情報で裏付けられないもの）**
- https://github.com/supabase/agent-skills/issues/592
- https://github.com/orgs/supabase/discussions/37405
- https://github.com/orgs/supabase/discussions/4296
- https://github.com/orgs/supabase/discussions/16619
- https://github.com/supabase/auth/issues/1226
- https://github.com/supabase/auth/issues/2702
- https://github.com/supabase/supabase/issues/37413
- https://github.com/travisvn/supabase-pause-prevention
- https://runhooks.app/blog/preventing-supabase-free-tier-pausing/
- https://levelup.gitconnected.com/supabase-free-tier-will-pause-your-app-heres-the-github-actions-fix-8c1fd35b49ca
- https://drdroid.io/stack-diagnosis/supabase-auth-user-sign-up-disabled
- https://community.vercel.com/t/vercel-hobby-plan-deployment-blocked-by-claude-code-ai-co-author-attribution/35972
- https://community.vercel.com/t/vercel-deployment-blocked-for-cursor-agent-co-authored-commits-on-hobby-team/35720
- https://community.vercel.com/t/vercel-hobby-plan-deployment-blocked-because-commit-author-lacks-access/35446
- https://community.vercel.com/t/vercel-deployment-blocked-initial-deployment-was-ok/37979
- https://community.vercel.com/t/title-deployment-blocked-on-hobby-plan-private-repo-from-cli/42775
- https://github.com/netteran/locreport/pull/16
- https://github.com/cli/cli/discussions/11371
- https://github.com/cli/cli/issues/4621
- https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
- https://defensivecss.dev/tip/input-zoom-safari/
- https://takazudomodular.com/pj/zudo-tauri/docs/mobile/ios-input-auto-zoom/
