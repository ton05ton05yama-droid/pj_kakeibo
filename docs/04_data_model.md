# データモデル（Supabase）

- 版: 1.5（2026-09-23。ユーザーの決定〈仕様書 §12.1 Q2〉で **月の途中でも精算できる**ようにした: `settle_confirm` から「締め待ちの月だけ」の条件を外し〈`open` でも押せる〉、`private.s20_state()` に `p_settle_mode` を足し、`defer_expense` から `month_not_ended` を外し、`app_status` のお知らせ行を「月が終わった精算中の月」だけにした。あわせて 〈§12.1 Q9〉で初期データの呼び名・ID を **まさと `masato` ／ りさこ `risako`** に確定させた。**テーブル・制約・RLS は変えていない**。1.4 は同日、ユーザーの決定〈仕様書 §12.1 Q3〉で `household_members.default_payer`〈記録の既定の払った人。本人だけが変えられる〉と RPC `update_default_payer` を足した。1.3 は同日、カテゴリの初期データを15件にし〈仕様書 §8。`subscriptions` → `entertainment`、`medical`・`big_purchase`・`tax` を追加〉、画面の対応表に S-04〈月を選ぶ〉を足したもの〈1.3 ではテーブル・制約・RLS・RPC を変えていない〉。1.2 は同日、記録をタブにしたのに合わせて S-11・S-12 の呼び方を直したもの。1.1 は同日、出す額の元に戻すをサーバーの控え〈`private.contribution_undo`〉から戻す形にしたもの）
- 位置づけ: データ（テーブル・制約・RLS・RPC）の**正本**。画面は `docs/03_ui_spec.md`（以下「仕様書」）、お金の計算と月の状態は仕様書 §4.0.2・§6（実装の詳細は `docs/02_settlement.md`。以下「02」）が正本で、この文書はそれを実装できる形に落としたもの。
- 状態: **草案**。この文書の SQL（`sql` のコードブロックを上から順に流したもの）は、2026-09-22 に Supabase の Postgres イメージ（`public.ecr.aws/supabase/postgres:17.6.1.167`）で適用し、仕様書 §9 の見本データ（8月・9月の全シナリオ）を流して、合計・動かす額・共用の過不足が仕様書 §9.6 と一致すること、RLS が §2.2 の権限表どおりに拒否することを確かめた（§11。見本データを流す SQL は、まだリポジトリに無い）。**2026-09-23 に変えた `settle_confirm`・`private.s20_state`・`defer_expense`・`app_status`（仕様書 §12.1 Q2）と、足した `household_members.default_payer`・`update_default_payer`（Q3）は、まだこの検証を流していない**（§11 の「まだのこと」）。Supabase の本番プロジェクトではまだ動かしていない。
- 実装に移すときは `supabase/migrations/` にこの SQL を分けて置き、この文書と同じ変更で直す。

---

## 0. 方針

1. **ブラウザから supabase-js で直接読む・書く。守りは RLS。** サーバー層は置かない（`docs/05_platform.md` §1）。
2. **書き込みは2種類に分ける。**
   - 1行を足す・直す・消すだけのもの → テーブルへの直接の書き込み（RLS ＋ トリガーで守る）。記録・毎月の支払いのひな形・自分のプロフィール。
   - 状態が移る・複数行にまたがる・判定が要るもの → RPC（関数の中で所属と状態を確かめる）。精算・出す額・来月に回す・人の設定・毎月の支払いの行の生成。
3. **判定は DB の関数1か所で行う**（月の状態・S-20 の状態・赤い点・お知らせ行）。2台で同じ結果にする（仕様書 §6.2）。
4. **Data API への公開は明示の grant で行う。** 新しい Supabase プロジェクトでは public スキーマのテーブルが自動では公開されない（既存プロジェクトも 2026-10-30 から。platform.md §3.1）。`anon` には `ping()` 以外なにも許さない。
5. **月は「その月の1日」の `date` で持つ**（`2026-09-01` ＝ 9月）。今日と月の境目は DB の時刻を JST にしたもの（`private.jst_today()`）。
6. **金額は円の `integer`**。出す額の端数だけ切り捨て（02 §6）。
7. **名前は仕様書 §1.1 の内部名に合わせる**（`expense`、`paid_by`、`contribution`、`accounting_month` など）。毎月の支払いのひな形は仕様書の内部名 `fixed_cost_template` に合わせて `fixed_cost_templates`、行からの参照は仕様書 §6.5 の `fixed_cost_id`。
8. 共用は人の行を作らず、`paid_by = null` で表す（仕様書 §1.1）。

---

## 1. テーブル一覧

| テーブル | 役割 | 主な画面 | 書き込み |
|---|---|---|---|
| `households` | 家計（1件だけ） | S-04・S-10・S-20（月切替の下限。値そのものは画面に出さず、選べる／選べないの別だけ） | 管理者が SQL エディタで |
| `household_members` | 人の設定（呼び名・色・出す割合・並び順・記録の既定の払った人） | S-02、S-12、S-20〜S-22、S-30、S-33 | RPC `update_member`・`update_default_payer` |
| `profiles` | 本人だけの状態（初回の済み・新着の判定） | S-02、S-10 | 本人が直接 |
| `categories` | 15カテゴリ（固定。仕様書 §8） | S-11（記録タブ）、S-13、S-14、S-32 | 管理者（マイグレーション） |
| `fixed_cost_templates` | 毎月の支払いのひな形 | S-30〜S-32 | 直接（追加・直す）＋ RPC（やめる・追加の取り消し） |
| `expenses` | 記録（手入力と毎月の支払いの行） | S-10〜S-15、S-22 | 直接（足す・直す・消す）＋ RPC（行の生成・来月に回す） |
| `month_contributions` | その月の各人の手取り・割合・出す額 | S-20、S-21、S-22 | RPC `decide_contributions`・`undo_decide_contributions` だけ（definer。直接の insert・update・delete は許さない） |
| `month_settlements` | 月の精算（精算中・精算済み・やり直し中）と確定時の月の値 | S-20、赤い点 | RPC だけ |
| `month_settlement_lines` | 確定時の各人の値（出す額・もう払った分・動かす額・済んだ分） | S-20、S-22 | RPC だけ |
| `settlement_checks` | 入れた／受け取ったのチェック | S-20、S-22 | RPC だけ |
| `settlement_events` | 精算の操作の記録（追記だけ。仕様書 §9.7 の形） | —（調べる用） | RPC だけ |

ほかに、端末からは読めない `private.contribution_undo`（出す額を決めたのを元に戻すための控え。§8.3）がある。

容量: 記録は年に数千行（platform.md §1.1 の見積り）。どのテーブルも Free の 500 MB には遠い。

---

## 2. SQL 草案: 共通とテーブル

### 2.1 共通

```sql
-- 公開しないスキーマ（Data API の公開スキーマに加えない）
create schema if not exists private;
grant usage on schema private to authenticated;   -- ポリシーから private の関数を呼ぶのに要る（platform.md U5。検証では要った）

-- JST の今日・月初・月ごとのロックの鍵
create or replace function private.jst_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

create or replace function private.month_of(d date) returns date
language sql immutable set search_path = '' as $$
  select date_trunc('month', d)::date
$$;

create or replace function private.month_lock_key(p_household uuid, p_month date) returns bigint
language sql immutable set search_path = '' as $$
  select hashtextextended(p_household::text || ':' || p_month::text, 0)
$$;
```

テストで「今日」を差し替えたいときは、テスト用のデータベースでだけ `private.jst_today()` を `current_setting('kakeibo.today', true)` を先に見る形に置き換える（本番の関数は端末から今日を受け取らない）。

### 2.2 家計・人

```sql
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'ふたりの家計',
  start_month date not null check (start_month = date_trunc('month', start_month)::date),  -- 家計を作った月（月切替の下限。仕様書 §3.4）
  created_at  timestamptz not null default now()
);

-- 人の設定（呼び名・色・出す割合は2人とも変えられる。記録の既定の払った人だけ本人だけ。仕様書 §2.2）
create table public.household_members (
  household_id      uuid not null references public.households(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  position          smallint not null check (position in (1, 2)),              -- 並び順（まさと 1 → りさこ 2。2台で同じ）
  display_name      text not null check (char_length(display_name) between 1 and 6),  -- 呼び名（6文字まで）
  color             text not null check (color in ('teal', 'amber')),          -- teal = --who-a、amber = --who-b
  contribution_rate smallint not null default 40 check (contribution_rate between 0 and 100),  -- 出す割合（%）
  default_payer     text not null default 'self' check (default_payer in ('self', 'joint')),   -- 記録の既定の払った人（S-30。self = 自分、joint = 共用。本人だけが変えられる。仕様書 §1.1・§2.2・§12.1 Q3）
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (household_id, position),
  unique (household_id, color) deferrable initially deferred                 -- 色の入れ替えを1つの取引で行うため
);
create unique index household_members_user_id_key on public.household_members (user_id);  -- 1人1家計（MVP）

-- 本人だけのもの（仕様書 §2.2 の最後の行）
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  onboarded_at timestamptz,          -- null なら S-02（はじめに）を出す
  last_seen_at timestamptz,          -- S-10 を前回見た時刻（新着の判定。仕様書 §1.1 last_seen_at。null〈初めて S-10 を見る〉なら新着を出さない）
  updated_at   timestamptz not null default now()
);
```

- 表示名・割合は `auth.users` の `user_metadata` に持たない（Auto Confirm で上書きされる不具合。platform.md §2.2 の4）。
- 表示はライトだけ（仕様書 §3.9）なので、表示の設定は DB にも端末にも持たない。
- **`default_payer`（記録の既定の払った人）は端末ではなく人に持つ**（2台目でログインしても同じ既定になる。仕様書 S-30）。`profiles`（本人だけのテーブル）ではなくここに置いたのは、呼び名・色・割合と同じ「人の設定」で、S-12 が払った人のアバター・呼び名を読むときと同じ行から取れるため。**本人だけが変えられる**きまりは、テーブルへの update を grant せず（§6.3）RPC `update_default_payer`（`where user_id = auth.uid()`）だけで守る。`update_member` はこの列に触れない（2人とも変えられる列だけを直す）。
- `default_payer` は 2026-09-23 に足した列（仕様書 §12.1 Q3）。**まだ本番に入れていないので、この `create table` に直接書いた。** 入れた後に足すときは `alter table public.household_members add column default_payer text not null default 'self' check (default_payer in ('self', 'joint'));`（既定があるので、いる2行はそのまま「自分」になる）と `update_default_payer` の `create or replace` を同じマイグレーションで流す。列の grant は増やさない。

### 2.3 カテゴリ

```sql
create table public.categories (
  id         text primary key,          -- 'groceries' など（§10 の初期データ）
  sort_order smallint not null unique,  -- S-11（記録タブ）のグリッドの並び（1〜15。3列×5行。仕様書 §8）
  name       text not null unique,      -- 表示名「食料品」
  icon       text not null,             -- Lucide のアイコン名
  name_hints text[] not null default '{}'  -- S-32 で名前からカテゴリを推測する語
);
```

### 2.4 毎月の支払いのひな形

```sql
create table public.fixed_cost_templates (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  name         text not null check (char_length(btrim(name)) > 0),
  category_id  text not null references public.categories(id),
  paid_by      uuid references auth.users(id),              -- 払う人。null = 共用（既定）
  amount_kind  text not null check (amount_kind in ('fixed', 'variable')),  -- 毎月同じ ／ 金額待ち
  amount       integer check (amount between 1 and 9999999),
  start_month  date not null check (start_month = date_trunc('month', start_month)::date),  -- この月の分から作る。追加した月。DB の今日で決める（端末の値は使わない。02 §10 C10。§7 のトリガー）
  end_month    date check (end_month = date_trunc('month', end_month)::date),              -- この月の分から作らない（支払いをやめる）
  created_by   uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  check ((amount_kind = 'fixed') = (amount is not null)),
  check (end_month is null or end_month >= start_month)
);
create index fixed_cost_templates_household_idx on public.fixed_cost_templates (household_id);
```

- ひな形を直しても、作ってある行は変わらない（行は作った時点の値を写して持つ。仕様書 §6.5）。だからひな形に版を持たせる必要はない。
- 「支払いをやめる」は行を消さずに `end_month` を入れる（RPC `stop_template`。作ってある行は残る）。
- `start_month` は追加した月。DB の今日で決める（端末の値は使わない。02 §10 C10）。端末が送っても、§7 のトリガーが `private.month_of(private.jst_today())` で上書きする。
- 追加の元に戻す（`delete_template`）は、作った人が作った直後に、行が手つかずのときだけ（02 §2.5・§10 C13。§8.3）。

### 2.5 記録

```sql
create table public.expenses (
  id               uuid primary key default gen_random_uuid(),  -- 端末で採番してよい（オフラインの保留・消した記録の元に戻す）
  household_id     uuid not null references public.households(id),
  spent_on         date not null,                               -- 日付（JST）。毎月の支払いの行はその月の1日
  accounting_month date not null check (accounting_month = date_trunc('month', accounting_month)::date),  -- 帰属月
  category_id      text not null references public.categories(id),
  amount           integer check (amount between 1 and 9999999),  -- null = 金額待ち（毎月の支払いの行だけ）
  paid_by          uuid references auth.users(id),              -- 払った人。null = 共用
  memo             text check (char_length(memo) <= 30),        -- 手入力のメモ
  -- ここから毎月の支払いの行だけ
  fixed_cost_id    uuid references public.fixed_cost_templates(id),
  period_month     date,                                        -- 対象月「（9月分）」。来月に回しても変わらない
  name             text,                                        -- 作った時点のひな形の名前
  skipped          boolean not null default false,              -- 今月はなし
  amount_set_by    uuid references auth.users(id),              -- 「金額: まさと 10/1」
  amount_set_at    timestamptz,
  -- 記録した人と時刻
  created_by       uuid default auth.uid() references auth.users(id),  -- 手入力 = 記録した人。毎月の支払いの行は null（画面では「毎月」）
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id),              -- 「直した 9/23 8:10」
  updated_at       timestamptz,
  constraint expenses_kind_chk check (
    (fixed_cost_id is null                                        -- 手入力の記録
       and period_month is null and name is null
       and created_by is not null and amount is not null and not skipped
       and accounting_month = date_trunc('month', spent_on)::date)
    or
    (fixed_cost_id is not null                                    -- 毎月の支払いの行
       and period_month is not null and name is not null
       and created_by is null
       and spent_on = period_month
       and accounting_month >= period_month)
  ),
  constraint expenses_fixed_period_key unique (fixed_cost_id, period_month)  -- ひな形 × 対象月で1行（§3）
);
create index expenses_household_month_idx on public.expenses (household_id, accounting_month);
create index expenses_pending_idx on public.expenses (household_id, accounting_month)
  where amount is null and not skipped;                           -- 金額待ちの件数（S-10・S-20・赤い点）
create index expenses_created_by_idx on public.expenses (created_by);  -- RLS の条件
```

- 手入力と毎月の支払いの行を1つのテーブルに入れるのは、S-10 の一覧・S-13 の内訳・精算の集計が「その月の記録すべて」を同じ条件で読むため。
- 削除は物理削除（削除の跡は残さない。仕様書 §12.1 Q13）。6秒の「元に戻す」は、同じ `id`・`created_at` で入れ直す。
- 毎月の支払いの行は消せない（「今月はなし」で状態を変える。仕様書 §6.5）。

### 2.6 出す額

```sql
create table public.month_contributions (
  household_id      uuid not null references public.households(id),
  month             date not null check (month = date_trunc('month', month)::date),
  user_id           uuid not null references auth.users(id),
  net_income        integer not null check (net_income between 0 and 9999999),        -- 手取り
  contribution_rate smallint not null check (contribution_rate between 0 and 100),      -- 決めたときの割合（%）
  contribution      integer generated always as ((net_income * contribution_rate) / 100) stored,  -- 出す額 ＝ floor(手取り × 割合 ÷ 100)
  decided_by        uuid not null default auth.uid() references auth.users(id),        -- 「決めた: まさと 9/1」
  decided_at        timestamptz not null default now(),
  primary key (household_id, month, user_id)
);
```

- 割合を月ごとに保存するので、あとで割合を変えても決めた月の出す額は変わらない（仕様書 §2.2）。決め直すときも保存した割合を使う（仕様書 S-21）。
- `(net_income * contribution_rate) / 100` は整数の割り算で、非負なので切り捨てと同じ（仕様書 §6.2、02 §6）。
- 書き込みは RPC だけ（§6.3 で `authenticated` には select だけを許す）。割合と決めた人はサーバーで決める（割合は、新しく作る行なら `household_members.contribution_rate`、決めてある行なら保存済みの値のまま。決めた人は `auth.uid()`）。
- 元に戻すときの前の値も、端末から受け取らない。`decide_contributions` が書き込む前の行を `private.contribution_undo` に控え、端末には書いた時刻だけを返す。`undo_decide_contributions` は月と時刻だけを受け取り、控えから戻す（§8.3）。

### 2.7 精算

```sql
-- 月の精算。行があるのは、一度でも［この金額で精算］を押した月だけ。
-- 進行中・締め待ちは保存しない（日付から決まる）。やり直した後だけ status = 'reopened'（締め待ちとして扱う）。
create table public.month_settlements (
  household_id       uuid not null references public.households(id),
  month              date not null check (month = date_trunc('month', month)::date),
  status             text not null check (status in ('confirmed', 'settled', 'reopened')),
  round              smallint not null default 1 check (round >= 1),  -- ［この金額で精算］を押した回数（やり直すたびに次で +1）
  -- ［この金額で精算］の時点の月の値（仕様書 §6.2 の最後の項）
  expense_total      integer not null,
  joint_paid         integer not null,
  contribution_total integer not null,
  joint_net          integer not null,
  confirmed_by       uuid not null references auth.users(id),
  confirmed_at       timestamptz not null,
  settled_at         timestamptz,                                   -- 「精算済み 10/2」
  reopened_by        uuid references auth.users(id),
  reopened_at        timestamptz,
  reopened_from      text check (reopened_from in ('confirmed', 'settled')),  -- やり直しを元に戻すときの戻り先
  primary key (household_id, month)
);

-- ［この金額で精算］の時点の各人の値
create table public.month_settlement_lines (
  household_id uuid not null,
  month        date not null,
  user_id      uuid not null references auth.users(id),
  contribution integer not null,                  -- 出す額
  advance      integer not null,                  -- もう払った分
  settlement   integer not null,                  -- 動かす額（符号つき: ＋ 共用へ入れる ／ − 共用から受け取る）
  transferred  integer not null default 0,        -- 済んだ分（それまでの回のチェックの合計。符号つき）
  remaining    integer generated always as (settlement - transferred) stored,  -- この回にチェックする額（あと ◯円）
  primary key (household_id, month, user_id),
  foreign key (household_id, month) references public.month_settlements (household_id, month) on delete cascade
);

-- 入れた ／ 受け取った。1つの回・1枚のカードに1つ
create table public.settlement_checks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  month        date not null,
  round        smallint not null,
  user_id      uuid not null references auth.users(id),   -- どの人のカードか
  amount       integer not null check (amount <> 0),       -- その回の remaining（符号つき）
  checked_by   uuid not null references auth.users(id),   -- 押した人（どちらのカードでも押せる。仕様書 S-20 transfer）
  checked_at   timestamptz not null default now(),
  unique (household_id, month, round, user_id),
  foreign key (household_id, month) references public.month_settlements (household_id, month) on delete cascade
);
create index settlement_checks_month_idx on public.settlement_checks (household_id, month);

-- 精算の操作の記録（追記だけ）
create table public.settlement_events (
  id             bigint generated always as identity primary key,
  household_id   uuid not null references public.households(id),
  month          date not null,
  round          smallint,
  action         text not null check (action in
                   ('confirm', 'undo_confirm', 'check', 'uncheck', 'settled', 'unsettled', 'reopen', 'undo_reopen')),
  target_user_id uuid references auth.users(id),
  amount         integer,
  actor          uuid references auth.users(id),           -- null = 自動（精算済み）
  at             timestamptz not null default now()
);
create index settlement_events_month_idx on public.settlement_events (household_id, month, at);
```

- 済んだ分の求め方: その月の `settlement_checks` の `amount` の合計（全部の回）。やり直した後の締め待ちでは、これがそのまま「済んだ分」になる。もう一度確定するとき、その値を `month_settlement_lines.transferred` に写す（02 §7）。
- チェックを外すと、その回のチェックの行を消す（`settlement_events` に `uncheck` が残る）。

### 2.8 インデックスのまとめ

| インデックス | 使うところ |
|---|---|
| `household_members_user_id_key`（一意） | `private.my_household_ids()`（全ポリシー） |
| `expenses_household_month_idx` | 月の一覧・集計（S-10・S-13・S-20・S-22） |
| `expenses_pending_idx`（部分） | 金額待ちの件数（S-10・S-20・赤い点） |
| `expenses_created_by_idx` | 手入力の記録の更新・削除のポリシー |
| `expenses_fixed_period_key`（一意） | `ensure_month` の冪等性、S-15 の「先月 4,380」 |
| `fixed_cost_templates_household_idx` | S-30・S-31、`ensure_month` |
| 各テーブルの主キー（`household_id, month, …`） | 月ごとの出す額・精算・チェック |
| `settlement_checks_month_idx`、`settlement_events_month_idx` | 済んだ分の合計、操作の記録 |

---

## 3. 帰属月・対象月・一意制約・`ensure_month`

- **帰属月** `accounting_month`: その記録を何月の精算に入れるか。
  - 手入力の記録: 日付の月（JST）。トリガーが `spent_on` から毎回入れ直すので、端末が送った値は使わない。
  - 毎月の支払いの行: 作った対象の月。［来月に回す］で1か月進む（RPC `defer_expense` だけが変えられる）。
- **対象月** `period_month`: 毎月の支払いの行が「何月分」か。作ったあと変わらない。
- **一意制約はひな形 × 対象月**（`unique (fixed_cost_id, period_month)`）。
  - 仕様書 §0.2・§6.5 のとおり、ひな形 × 対象月で一意にする。来月に回した行と翌月の行が同じ帰属月に並ぶ（9月には s04 電気代（8月分）と s05 電気代（9月分）が両方ある）ので、帰属月では一意にできない（02 §10 C1 は済み）。
- **`ensure_month(月)`** はその月の分の行を作る。
  - 作るのは「対象月 ＝ その月」で、ひな形の `start_month ≦ 月 < end_month`、その月がロックされていないとき。
  - `insert … on conflict (fixed_cost_id, period_month) do nothing` なので、何度呼んでも、2台が同時に呼んでも1行だけ（冪等）。
  - `app_status()` がアプリを開いたとき・タブを選んだときに、家計を作った月から今月までの全部の月について呼ぶ（締め待ちの月をだれも開いていなくても、行が抜けない）。cron は使わない（仕様書 §6.5）。
  - ひな形を追加したら、続けて `ensure_month(今月)` を呼んで今月分をすぐ作る（仕様書 S-32「9月分から記録します」）。
- 元の月の「電気代（8月分）　9月に回しました」は `period_month = 8月 and accounting_month <> 8月` の行として探す。

---

## 4. ロック

- 精算中・精算済みの月（`month_settlements.status in ('confirmed','settled')`）を**ロック中**と呼ぶ。判定は `private.is_month_locked()`。
- ロック中の月について、RLS とトリガーの両方で書き込みを止める。
  - RLS（§6）: 記録の足す・直す・消す、出す額の書き込みの条件に「その帰属月がロック中でない」を入れる。権限表（仕様書 §2.2 の右端の列）をそのまま読める形にするため。
  - トリガー（§7）: その月の**共有**アドバイザリーロックを取ってから、もう一度ロック中かを確かめる。確定の RPC は同じ鍵の**排他**ロックを取る。これで「確定と同時に記録が入る」競合が起きない（02 §8.1 の3）。
- 直す前の月と直した後の月の両方を確かめる（日付を変えてロック中の月に入れる・出すのを止める）。
- ロック中の月で止まったときのエラーは `month_locked`（`detail` に月）。画面では「9月は精算中です（直すには精算をやり直します）」（仕様書 §1.4）。

---

## 5. 所属と判定の関数（security definer）

RLS の中で所属テーブルを引くと再帰になるので、`private` スキーマの `security definer` 関数で引く（platform.md §3.1 の公式の推奨）。`set search_path = ''` とスキーマ修飾をいつも付ける。

```sql
create or replace function private.my_household_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.household_members where user_id = (select auth.uid())
$$;

create or replace function private.my_household_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.household_members where user_id = (select auth.uid())
$$;

create or replace function private.is_member(p_household uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members
                 where household_id = p_household and user_id = p_user)
$$;

create or replace function private.is_month_locked(p_household uuid, p_month date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.month_settlements
                 where household_id = p_household and month = p_month
                   and status in ('confirmed', 'settled'))
$$;

-- 月の状態（02 §2.1）: open / closing / confirmed / settled
create or replace function private.month_status(p_household uuid, p_month date) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.status from public.month_settlements s
      where s.household_id = p_household and s.month = p_month
        and s.status in ('confirmed', 'settled')),
    case when p_month >= private.month_of(private.jst_today()) then 'open' else 'closing' end)
$$;

-- S-20 の状態キー（02 §2.4。仕様書 S-20「状態の決め方」の順）
-- p_settle_mode = 画面が精算のモードか（月の途中に［この月を精算する］を押したか。仕様書 §12.1 Q2）。
-- **端末の中だけの値で、DB には保存しない**（仕様書 §11 #45）。渡さなければ今までどおり estimate になる。
create or replace function private.s20_state(p_household uuid, p_month date, p_settle_mode boolean default false) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when st = 'settled'   then 'settled'
    when st = 'confirmed' then 'transfer'
    when n_this = 0 and n_prev = 0 then 'empty'
    when n_this < n_members then 'undecided'
    when st = 'open' and not coalesce(p_settle_mode, false) and n_checks = 0 then 'estimate'
    when n_pending > 0    then 'prep'
    when n_checks > 0     then 'redo'
    else 'ready' end
  from (select
    private.month_status(p_household, p_month) as st,
    (select count(*) from public.month_contributions
      where household_id = p_household and month = p_month) as n_this,
    (select count(*) from public.month_contributions
      where household_id = p_household and month = (p_month - interval '1 month')::date) as n_prev,
    (select count(*) from public.household_members where household_id = p_household) as n_members,
    (select count(*) from public.expenses
      where household_id = p_household and accounting_month = p_month
        and amount is null and not skipped) as n_pending,
    (select count(*) from public.settlement_checks
      where household_id = p_household and month = p_month) as n_checks) s
$$;

-- その月の計算（02 §3）。進行中・締め待ちの表示と、確定の値のもと
create or replace function private.month_live(p_household uuid, p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (
    select paid_by, amount from public.expenses
     where household_id = p_household and accounting_month = p_month
       and amount is not null and not skipped
  ), m as (
    select hm.user_id, hm.position, c.contribution,
           coalesce((select sum(e.amount) from e where e.paid_by = hm.user_id), 0)::integer as advance,
           coalesce((select sum(sc.amount) from public.settlement_checks sc
                      where sc.household_id = p_household and sc.month = p_month
                        and sc.user_id = hm.user_id), 0)::integer as transferred
      from public.household_members hm
      left join public.month_contributions c
        on c.household_id = hm.household_id and c.month = p_month and c.user_id = hm.user_id
     where hm.household_id = p_household
  )
  select jsonb_build_object(
    'members', (select jsonb_agg(jsonb_build_object(
                   'user_id', user_id, 'contribution', contribution, 'advance', advance,
                   'settlement', contribution - advance, 'transferred', transferred,
                   'remaining', contribution - advance - transferred) order by position) from m),
    'joint_paid',         (select coalesce(sum(amount), 0) from e where paid_by is null),
    'expense_total',      (select coalesce(sum(amount), 0) from e),
    'contribution_total', (select sum(contribution) from m),
    'joint_net',          (select sum(contribution) from m) - (select coalesce(sum(amount), 0) from e),
    'pending_count',      (select count(*) from public.expenses
                            where household_id = p_household and accounting_month = p_month
                              and amount is null and not skipped)
  )
$$;

revoke all on all functions in schema private from public;
grant execute on function private.my_household_ids(), private.my_household_id(),
                          private.is_member(uuid, uuid), private.is_month_locked(uuid, date),
                          private.month_of(date), private.jst_today() to authenticated;
```

`private` を Data API の公開スキーマ（Settings → API → Exposed schemas）に加えないこと。加えると `month_live` などを端末から直接呼べてしまう。

---

## 6. RLS

### 6.1 権限表（仕様書 §2.2）との対応

| 仕様書 §2.2 の行 | 見る | 足す | 直す・消す | ロック中 | 実装 |
|---|---|---|---|---|---|
| 手入力の記録 | 2人 | 2人（記録した人 = 自分） | 記録した人だけ | だれもできない | `expenses_select`・`expenses_insert_manual`・`expenses_update_manual`・`expenses_delete_manual` ＋ トリガー |
| 毎月の支払いから作られた行 | 2人 | 自動 | 2人（金額・払った人・今月はなし。カテゴリは変えない） | だれも直せない | `expenses_update_fixed` ＋ 列の grant ＋ トリガー（カテゴリ・名前・日付・帰属月を守る）。足すのは `ensure_month` だけ。消すポリシーは無い |
| その月の出す額 | 2人 | 2人（相手の分も） | 2人 | だれも直せない | `contributions_select`（読むだけ）。書き込みは RPC `decide_contributions`・`undo_decide_contributions`（definer。所属・月のロック・割合・決めた人を関数の中で決める。元に戻す値は `private.contribution_undo` の控えから取り、端末からは受け取らない）＋ トリガー。テーブルへの直接の insert・update・delete は grant しない |
| 毎月の支払いのひな形 | 2人 | 2人 | 2人 | 作った行は変わらない | `templates_*`。やめる・追加の取り消しは RPC |
| 呼び名・色・出す割合 | 2人 | — | 2人（相手の分も） | 決めた月の出す額は変わらない | `members_select`。書き込みは RPC `update_member`（色の入れ替えを1つの取引で行うため） |
| 記録の既定の払った人 | 本人（画面に出すのは本人の設定だけ。DB では `members_select` で2人とも読める） | — | **本人だけ** | 変わらない（1件ごとの記録ではないので月のロックと関わらない） | `household_members.default_payer`。書き込みは RPC `update_default_payer` だけ（definer。`where user_id = auth.uid()` で自分の行しか直さない）。テーブルへの update は grant しない（§6.3） |
| 精算の操作 | 2人 | — | 2人（押した人と時刻を残す） | — | 読むだけのポリシー。書き込みは精算の RPC だけ |
| パスワード・ログアウト | 本人 | — | 本人 | — | Supabase Auth（`auth.updateUser`・`auth.signOut`）。`profiles` は本人だけ |

### 6.2 ポリシー

```sql
alter table public.households             enable row level security;
alter table public.household_members      enable row level security;
alter table public.profiles               enable row level security;
alter table public.categories             enable row level security;
alter table public.fixed_cost_templates   enable row level security;
alter table public.expenses               enable row level security;
alter table public.month_contributions    enable row level security;
alter table public.month_settlements      enable row level security;
alter table public.month_settlement_lines enable row level security;
alter table public.settlement_checks      enable row level security;
alter table public.settlement_events      enable row level security;

-- 家計・人
create policy households_select on public.households for select to authenticated
  using (id in (select private.my_household_ids()));
create policy members_select on public.household_members for select to authenticated
  using (household_id in (select private.my_household_ids()));

-- 本人だけ
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- カテゴリ（全員が読む）
create policy categories_select on public.categories for select to authenticated using (true);

-- 毎月の支払いのひな形: 2人とも
create policy templates_select on public.fixed_cost_templates for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy templates_insert on public.fixed_cost_templates for insert to authenticated
  with check (household_id in (select private.my_household_ids())
              and created_by = (select auth.uid())
              and (paid_by is null or private.is_member(household_id, paid_by)));
create policy templates_update on public.fixed_cost_templates for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids())
              and (paid_by is null or private.is_member(household_id, paid_by)));

-- 記録: 見るのは2人
create policy expenses_select on public.expenses for select to authenticated
  using (household_id in (select private.my_household_ids()));
-- 手入力の記録: 足すのは2人（記録した人 = 自分）。毎月の支払いの行は直接足せない
create policy expenses_insert_manual on public.expenses for insert to authenticated
  with check (household_id in (select private.my_household_ids())
              and fixed_cost_id is null
              and created_by = (select auth.uid())
              and not private.is_month_locked(household_id, accounting_month));
-- 手入力の記録: 直す・消すのは記録した人だけ
create policy expenses_update_manual on public.expenses for update to authenticated
  using (fixed_cost_id is null and created_by = (select auth.uid())
         and not private.is_month_locked(household_id, accounting_month))
  with check (fixed_cost_id is null and created_by = (select auth.uid())
              and household_id in (select private.my_household_ids())
              and not private.is_month_locked(household_id, accounting_month));
create policy expenses_delete_manual on public.expenses for delete to authenticated
  using (fixed_cost_id is null and created_by = (select auth.uid())
         and not private.is_month_locked(household_id, accounting_month));
-- 毎月の支払いの行: 2人とも直せる（仕様書 §6.5「fixed_cost_id is not null の行だけ、記録した人以外の更新を許す」）
create policy expenses_update_fixed on public.expenses for update to authenticated
  using (fixed_cost_id is not null and household_id in (select private.my_household_ids())
         and not private.is_month_locked(household_id, accounting_month))
  with check (fixed_cost_id is not null and household_id in (select private.my_household_ids())
              and not private.is_month_locked(household_id, accounting_month));

-- 出す額: 読むのは2人。書くのは RPC（decide_contributions・undo_decide_contributions。definer）だけ（§6.3 で select だけを grant）。
-- 元に戻すための控え private.contribution_undo は private スキーマにあり、端末からは読めない（§8.3）
create policy contributions_select on public.month_contributions for select to authenticated
  using (household_id in (select private.my_household_ids()));

-- 精算: 読むだけ（書くのは RPC）
create policy settlements_select on public.month_settlements for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy settlement_lines_select on public.month_settlement_lines for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy settlement_checks_select on public.settlement_checks for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy settlement_events_select on public.settlement_events for select to authenticated
  using (household_id in (select private.my_household_ids()));
```

### 6.3 明示の grant

```sql
-- anon にはテーブルを何も許さない。authenticated にも必要な列だけ
revoke all on all tables in schema public from anon, authenticated;

grant select on public.households, public.household_members, public.categories,
                public.month_settlements, public.month_settlement_lines,
                public.settlement_checks, public.settlement_events to authenticated;

grant select, insert on public.profiles to authenticated;
grant update (onboarded_at, last_seen_at) on public.profiles to authenticated;

grant select, insert on public.fixed_cost_templates to authenticated;
grant update (name, category_id, paid_by, amount_kind, amount) on public.fixed_cost_templates to authenticated;

grant select, insert, delete on public.expenses to authenticated;
grant update (spent_on, category_id, amount, paid_by, memo, skipped) on public.expenses to authenticated;

grant select on public.month_contributions to authenticated;   -- 書き込みは RPC だけ（割合・決めた人をサーバーで決めるため）
```

- 列の grant は「その列を画面から直すことがある」ものだけ。帰属月・記録した人・金額を入れた人はトリガーが入れる。
- `household_members` は `select` だけ（`update` を grant しない）。呼び名・色・割合は RPC `update_member`、記録の既定の払った人は RPC `update_default_payer` で書く。`default_payer` を「本人だけ」にできるのは、この RPC が `auth.uid()` の行しか直さないため（§6.1）。
- ひな形の insert は表単位の grant で、列を絞っていない（列の grant で `start_month` を外すと、端末が送ったときに permission denied になるため）。`start_month` と `created_at` は、端末が送っても §7 のトリガーが DB の値で上書きする。
- 毎月の支払いの行で直せない列（カテゴリ・日付・メモ）は、列の grant では通ってしまうので、トリガーで止める（§7）。

---

## 7. トリガー

```sql
-- 記録: 帰属月を入れる・ロックを確かめる・毎月の支払いの行を守る・直した人を残す
create or replace function private.expenses_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform pg_advisory_xact_lock_shared(private.month_lock_key(old.household_id, old.accounting_month));
    if private.is_month_locked(old.household_id, old.accounting_month) then
      raise exception 'month_locked' using detail = old.accounting_month::text;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.fixed_cost_id is null then
    new.accounting_month := private.month_of(new.spent_on);   -- 手入力は日付の月
  end if;

  if tg_op = 'UPDATE' then
    if old.fixed_cost_id is not null and (
         new.fixed_cost_id is distinct from old.fixed_cost_id
      or new.period_month  is distinct from old.period_month
      or new.category_id   is distinct from old.category_id
      or new.name          is distinct from old.name
      or new.spent_on      is distinct from old.spent_on
      or new.memo          is distinct from old.memo
      or (new.accounting_month is distinct from old.accounting_month
          and coalesce(current_setting('kakeibo.defer', true), '') <> 'on')) then
      raise exception 'fixed_row_immutable';
    end if;
    if old.fixed_cost_id is not null and new.amount is distinct from old.amount then
      new.amount_set_by := v_uid;
      new.amount_set_at := now();
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := v_uid;
    new.updated_at := now();
  end if;

  perform pg_advisory_xact_lock_shared(private.month_lock_key(new.household_id, new.accounting_month));
  if private.is_month_locked(new.household_id, new.accounting_month) then
    raise exception 'month_locked' using detail = new.accounting_month::text;
  end if;
  if new.paid_by is not null and not private.is_member(new.household_id, new.paid_by) then
    raise exception 'paid_by_not_member';
  end if;
  return new;
end $$;

create trigger expenses_before_write
  before insert or update or delete on public.expenses
  for each row execute function private.expenses_before_write();

-- 出す額: ロックを確かめる（確定との競合を防ぐ）
create or replace function private.contributions_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock_shared(private.month_lock_key(new.household_id, new.month));
  if private.is_month_locked(new.household_id, new.month) then
    raise exception 'month_locked' using detail = new.month::text;
  end if;
  return new;
end $$;

create trigger contributions_before_write
  before insert or update on public.month_contributions
  for each row execute function private.contributions_before_write();

-- 毎月の支払いのひな形: 追加した月（start_month）は DB の今日で決める（端末の値は使わない。02 §10 C10）。
-- 作った時刻も DB の時刻にする（delete_template の「作ってから1分」を端末の値で延ばせないように）
create or replace function private.templates_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.start_month := private.month_of(private.jst_today());
  new.created_at  := now();
  return new;
end $$;

create trigger templates_before_insert
  before insert on public.fixed_cost_templates
  for each row execute function private.templates_before_insert();
```

- RLS の `with check` は BEFORE トリガーの後の行で評価されるので、端末が帰属月をまちがえて送っても、トリガーが直した値で確かめる。
- ひな形の `start_month` は、端末が `2026-09-01` を送っても、今日が 10/1 なら `2026-10-01` になる（前の月にさかのぼって行を作らない。§11）。
- ひな形の `updated_by`・`updated_at` も同じ形のトリガーで入れる（草案では省略）。

---

## 8. RPC

### 8.1 一覧

すべて `public` スキーマ、`authenticated` だけが呼べる（`ping` だけ `anon` も可）。戻り値は `jsonb` で、うまくいかなかったときは例外ではなく `{"result": "blocked", "reason": …}` を返す（画面の1行に対応させやすいため）。`month_locked` など、書き込みの途中で止まったものは例外。

| RPC | 画面 | 入力 | 出力 | 冪等 | 種類 |
|---|---|---|---|---|---|
| `app_status()` | 起動・タブの切り替え（赤い点・お知らせ行・精算タブの既定の月） | なし | §8.2 | ○（`ensure_month` を含む） | definer |
| `month_summary(p_month date, p_settle_mode boolean default false)` | S-20・S-21・S-22 | 月、画面が精算のモードか（保存しない。仕様書 §12.1 Q2） | §8.2 | ○（読むだけ） | definer（未実装。`month_live`・`s20_state` と下の表の値を組み立てる） |
| `ensure_month(p_month date)` | S-10・S-20 を開いたとき、S-32 の追加の後 | 月 | 作った行の数 | ○ | definer |
| `decide_contributions(p_month date, p_net_incomes jsonb default null)` | S-20［この額で決める］（null）・S-21［決める］（`{"<user_id>": 手取り}`） | 月、手取り | `ok`（`prev`: `{decided_at}`〈書いた時刻だけ。元に戻すに渡す。書き込む前の行はサーバーが `private.contribution_undo` に控える〉）／ `blocked: locked` ／ `blocked: no_previous`（先月の値が無い人の `users`） | ○（null のときは決まっていない人だけ埋める。決めてある行の割合は変えない） | definer |
| `undo_decide_contributions(p_month date, p_decided_at timestamptz)` | 出す額を決めたときのトーストの元に戻す | 月、`decide_contributions` が返した `prev.decided_at`（戻す値は受け取らない） | `ok` ／ `blocked: locked`（精算中・精算済み）／ `blocked: changed`（そのあと決め直された・もう戻した・決めたのが自分でない） | ○（2回目は `changed`） | definer |
| `defer_expense(p_expense_id uuid, p_from_month date, p_undo boolean default false)` | S-15［来月に回す］とその元に戻す | 行、いまの帰属月 | `ok`（新しい帰属月）／ `already` ／ `blocked: not_pending・nothing_to_undo`。翌月がロック中なら例外 `month_locked` | ○（`p_from_month` が違えば何もしない） | definer |
| `settle_confirm(p_month date, p_expected jsonb default null)` | S-20［この金額で精算］ | 月、見ていたカードの額 `{"<user_id>": remaining}` | `ok`（`status`: confirmed か settled、`round`）／ `already` ／ `blocked: future_month・previous_month・undecided・pending` ／ `stale`（最新の `live`） | ○ | definer |
| `settle_set_check(p_month date, p_user_id uuid, p_checked boolean)` | S-20［入れた］［受け取った］、付いたチェックをもう一度押す | 月、カードの人、付ける／外す | `ok`（`status`）／ `blocked: not_locked・nothing_to_move` | ○（反転ではなく値を指定） | definer |
| `settle_reopen(p_month date)` | S-20［精算をやり直す］ | 月 | `ok`（`round`）／ `already` | ○ | definer |
| `settle_undo_confirm(p_month date, p_round smallint)` | ［この金額で精算］のトーストの元に戻す | 月、回 | `ok` ／ `already` ／ `blocked: checked` | ○ | definer |
| `settle_undo_reopen(p_month date, p_round smallint)` | ［精算をやり直す］のトーストの元に戻す | 月、回 | `ok`（戻った `status`）／ `already` ／ `blocked: changed` | ○ | definer |
| `update_member(p_user_id uuid, p_display_name text, p_color text, p_rate smallint)` | S-02（自分の呼び名）・S-33 | 人、呼び名、色、割合 | `ok` | ○ | definer |
| `update_default_payer(p_default_payer text)` | S-30 の「記録の払った人」（とそのトーストの元に戻す） | `self` か `joint` | `ok`（`default_payer`） | ○ | definer |
| `stop_template(p_template_id uuid, p_undo boolean default false)` | S-32［支払いをやめる］とその元に戻す | ひな形 | `ok`（`end_month`: トーストの「（10月から）」） | ○ | definer |
| `delete_template(p_template_id uuid)` | S-32 の追加の元に戻す | ひな形 | `ok` ／ `blocked: not_found・too_late・locked_rows`（`too_late` = 作った人でない・作ってから1分を過ぎた・行が直された。02 §10 C13） | ○ | definer |
| `ping()` | 一時停止を防ぐ外部からの呼び出し（`docs/05_platform.md` §3.1） | なし | `1` | ○ | invoker（`anon` 可。テーブルに触れない） |

記録の払った人の元に戻すは `update_default_payer(前の値)`（トーストの「元に戻す」。値は2つしかないので、画面が持っていた前の値をそのまま渡す）。チェックの元に戻すは `settle_set_check(…, false)`、（自動の）精算済みの元に戻すは最後のチェックを `false` にする。出す額を決めたのの元に戻すは `undo_decide_contributions(月, 決めたときに返った prev.decided_at)`（サーバーの控えから、新しく作った行は消し、上書きした行は手取り・決めた人・時刻を前の値に戻す。割合は戻さない。02 §2.5）。金額・払った人・今月はなしの元に戻すは、直す前の値で `expenses` を update し直す。

### 8.2 判定の出力

**`app_status()`**（`sep-transfer`・まさと）

```json
{
  "today": "2026-10-01",
  "current_month": "2026-10-01",
  "settle_default_month": "2026-09-01",
  "months": [
    {"month": "2026-08-01", "status": "settled"},
    {"month": "2026-09-01", "status": "confirmed"},
    {"month": "2026-10-01", "status": "open"}
  ],
  "badge": true,
  "notice": {"kind": "transfer", "month": "2026-09-01", "direction": "in", "amount": 82490}
}
```

- `badge`（赤い点）と `notice`（お知らせ行）は同じ条件（仕様書 §3.2・§3.5）。`kind: "closing"` が条件1、`"transfer"` が条件2（自分のカードの「あと」が 0 でなく、その回のチェックが無い）。**どちらも「月が終わった月」だけ**（条件2 は `month < 今月`）。月の途中に［この月を精算する］で精算した月は、その月が終わるまで出さない（仕様書 §12.1 Q2・Q23。2026-09-23）。
- 複数の月で当てはまるときは古い月を出す（02 §10 C9）。
- `settle_default_month` は締め待ちか精算中の一番古い月、無ければ今月（仕様書 §3.4）。

**`month_summary(p_month)`**（`sep-ready`・9月。画面に要る値をまとめて返す）

```json
{
  "month": "2026-09-01",
  "status": "closing",
  "view_state": "ready",
  "as_of": "2026-10-01T20:50:00+09:00",
  "round": null,
  "members": [
    {
      "user_id": "…a", "position": 1,
      "contribution": {"net_income": 300000, "rate": 40, "amount": 120000,
                       "decided_by": "…a", "decided_at": "2026-09-01T…"},
      "previous_net_income": 295000,
      "advance": 37510, "settlement": 82490, "transferred": 0, "remaining": 82490,
      "direction": "in",
      "check": null,
      "past_checks": []
    },
    {"user_id": "…b", "position": 2, "…": "…", "settlement": 65930, "remaining": 65930, "direction": "in"}
  ],
  "joint": {"joint_paid": 146550, "expense_total": 206130, "contribution_total": 208000, "joint_net": 1870},
  "pending": {"count": 0, "items": []},
  "blocker": null
}
```

- `view_state` は `private.s20_state(household, month, settle_mode)`。`settle_mode` は端末が持つ「月の途中に［この月を精算する］を押したか」（保存しない。仕様書 §12.1 Q2・§11 #45）で、`month_summary` の引数として受け取り、そのまま渡す。`blocker` は［この金額で精算］を押したら止まる理由（`previous_month` など。月の途中でも同じ）。
- 進行中・締め待ちは `private.month_live()` から、精算中・精算済みは `month_settlement_lines` と `month_settlements` の保存値から作る。
- `direction` は `remaining` の符号（`in` / `out` / `none`）。`check` はその回のチェック（押した人・時刻）、`past_checks` はそれまでの回のチェック（S-22 `redo` の「済んだ分（10/2 入れた）− 82,490」）。
- `pending.items` は S-20 `prep` の「精算のまえに」の行（名前・対象月）。全件を入れる（S-15 の順送りに使う。S-20 `prep` の表示は3件まで）。並びは仕様書 S-20 要素3 のとおり（払う人が個人の行 → 共用の行。それぞれの中は対象月の古い順、同じならひな形の順。端末で並べ替えてよい）。
- `previous_net_income` は、S-20 `undecided` の「先月の手取りで」と、その行の出す額に使う（null なら「—」にし、主ボタンを［出す額を決める］にする）。S-21 では欄の初期値に使う（null なら欄は空）。

### 8.3 本体（草案。2026-09-22 の検証済み。2026-09-23 に変えた関数は未検証。§11）

```sql
-- その月の毎月の支払いの行を作る（§3）
create or replace function public.ensure_month(p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_count     integer;
begin
  if v_household is null then raise exception 'not_member'; end if;
  if v_month > private.month_of(private.jst_today()) then return 0; end if;
  if private.is_month_locked(v_household, v_month) then return 0; end if;

  insert into public.expenses
    (household_id, spent_on, accounting_month, period_month, category_id,
     amount, paid_by, fixed_cost_id, name, created_by)
  select t.household_id, v_month, v_month, v_month, t.category_id,
         case when t.amount_kind = 'fixed' then t.amount end,
         t.paid_by, t.id, t.name, null
    from public.fixed_cost_templates t
   where t.household_id = v_household
     and t.start_month <= v_month
     and (t.end_month is null or v_month < t.end_month)
  on conflict on constraint expenses_fixed_period_key do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ［この金額で精算］（02 §2.2）
create or replace function public.settle_confirm(p_month date, p_expected jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_prev      date := (private.month_of(p_month) - interval '1 month')::date;
  v_row       public.month_settlements;
  v_live      jsonb;
  v_round     smallint;
  v_status    text;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock(private.month_lock_key(v_household, v_month));   -- 記録の書き込みと順番に並べる

  select * into v_row from public.month_settlements
   where household_id = v_household and month = v_month for update;
  if found and v_row.status in ('confirmed', 'settled') then
    return jsonb_build_object('result', 'already', 'status', v_row.status);   -- 「9月はもう精算中です」
  end if;
  -- 月の途中（open）でも押せる（仕様書 §12.1 Q2。2026-09-23 に 'closing' だけの条件を外した）。
  -- 今月より先の月も month_status は 'open' を返すので、この守りは通り、下の future_month で止める。
  -- 次の if は到達しない守り（confirmed・settled は上の already で返る）。
  if private.month_status(v_household, v_month) not in ('open', 'closing') then
    return jsonb_build_object('result', 'blocked', 'reason', 'not_closing');
  end if;
  if v_month > private.month_of(private.jst_today()) then
    return jsonb_build_object('result', 'blocked', 'reason', 'future_month');
  end if;
  if v_prev >= (select start_month from public.households where id = v_household)
     and not private.is_month_locked(v_household, v_prev) then
    return jsonb_build_object('result', 'blocked', 'reason', 'previous_month', 'month', v_prev);  -- 「先に8月を精算してください」
  end if;

  v_live := private.month_live(v_household, v_month);
  if exists (select 1 from jsonb_array_elements(v_live -> 'members') x
              where x -> 'contribution' = 'null'::jsonb) then
    return jsonb_build_object('result', 'blocked', 'reason', 'undecided');
  end if;
  if (v_live ->> 'pending_count')::integer > 0 then
    return jsonb_build_object('result', 'blocked', 'reason', 'pending',
                              'count', (v_live ->> 'pending_count')::integer);
  end if;
  if p_expected is not null and p_expected <> (
       select jsonb_object_agg(x ->> 'user_id', x -> 'remaining')
         from jsonb_array_elements(v_live -> 'members') x) then
    return jsonb_build_object('result', 'stale', 'live', v_live);           -- 見ていた数字と違う
  end if;

  v_round := coalesce(v_row.round, 0) + 1;
  insert into public.month_settlements as s
    (household_id, month, status, round, expense_total, joint_paid, contribution_total,
     joint_net, confirmed_by, confirmed_at)
  values
    (v_household, v_month, 'confirmed', v_round,
     (v_live ->> 'expense_total')::integer, (v_live ->> 'joint_paid')::integer,
     (v_live ->> 'contribution_total')::integer, (v_live ->> 'joint_net')::integer,
     v_uid, now())
  on conflict (household_id, month) do update
    set status = 'confirmed', round = excluded.round,
        expense_total = excluded.expense_total, joint_paid = excluded.joint_paid,
        contribution_total = excluded.contribution_total, joint_net = excluded.joint_net,
        confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at,
        settled_at = null;

  delete from public.month_settlement_lines where household_id = v_household and month = v_month;
  insert into public.month_settlement_lines
    (household_id, month, user_id, contribution, advance, settlement, transferred)
  select v_household, v_month, (x ->> 'user_id')::uuid,
         (x ->> 'contribution')::integer, (x ->> 'advance')::integer,
         (x ->> 'settlement')::integer, (x ->> 'transferred')::integer
    from jsonb_array_elements(v_live -> 'members') x;

  insert into public.settlement_events (household_id, month, round, action, actor)
  values (v_household, v_month, v_round, 'confirm', v_uid);

  v_status := 'confirmed';
  if not exists (select 1 from public.month_settlement_lines
                  where household_id = v_household and month = v_month and remaining <> 0) then
    update public.month_settlements set status = 'settled', settled_at = now()   -- 2人とも 0円（残り 0）なら同時に精算済み
     where household_id = v_household and month = v_month;
    insert into public.settlement_events (household_id, month, round, action, actor)
    values (v_household, v_month, v_round, 'settled', null);
    v_status := 'settled';
  end if;

  return jsonb_build_object('result', 'ok', 'status', v_status, 'round', v_round);
end $$;

-- ［入れた］［受け取った］（付ける・外すを指定する）
create or replace function public.settle_set_check(p_month date, p_user_id uuid, p_checked boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_row       public.month_settlements;
  v_remaining integer;
  v_all       boolean;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock(private.month_lock_key(v_household, v_month));
  select * into v_row from public.month_settlements
   where household_id = v_household and month = v_month for update;
  if not found or v_row.status not in ('confirmed', 'settled') then
    return jsonb_build_object('result', 'blocked', 'reason', 'not_locked');
  end if;
  select remaining into v_remaining from public.month_settlement_lines
   where household_id = v_household and month = v_month and user_id = p_user_id;
  if v_remaining is null or v_remaining = 0 then
    return jsonb_build_object('result', 'blocked', 'reason', 'nothing_to_move');  -- 0円のカードは最初から済み
  end if;

  if p_checked then
    insert into public.settlement_checks (household_id, month, round, user_id, amount, checked_by)
    values (v_household, v_month, v_row.round, p_user_id, v_remaining, v_uid)
    on conflict (household_id, month, round, user_id) do nothing;
    if found then
      insert into public.settlement_events (household_id, month, round, action, target_user_id, amount, actor)
      values (v_household, v_month, v_row.round, 'check', p_user_id, v_remaining, v_uid);
    end if;
  else
    delete from public.settlement_checks
     where household_id = v_household and month = v_month
       and round = v_row.round and user_id = p_user_id;
    if found then
      insert into public.settlement_events (household_id, month, round, action, target_user_id, actor)
      values (v_household, v_month, v_row.round, 'uncheck', p_user_id, v_uid);
    end if;
  end if;

  select bool_and(exists (select 1 from public.settlement_checks c
                           where c.household_id = l.household_id and c.month = l.month
                             and c.round = v_row.round and c.user_id = l.user_id))
    into v_all
    from public.month_settlement_lines l
   where l.household_id = v_household and l.month = v_month and l.remaining <> 0;

  if v_all and v_row.status = 'confirmed' then
    update public.month_settlements set status = 'settled', settled_at = now()
     where household_id = v_household and month = v_month;
    insert into public.settlement_events (household_id, month, round, action, actor)
    values (v_household, v_month, v_row.round, 'settled', null);
  elsif not v_all and v_row.status = 'settled' then
    update public.month_settlements set status = 'confirmed', settled_at = null
     where household_id = v_household and month = v_month;
    insert into public.settlement_events (household_id, month, round, action, actor)
    values (v_household, v_month, v_row.round, 'unsettled', null);
  end if;

  return jsonb_build_object('result', 'ok',
    'status', (select status from public.month_settlements
                where household_id = v_household and month = v_month));
end $$;

-- ［精算をやり直す］（チェックは消さない）
create or replace function public.settle_reopen(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_row       public.month_settlements;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock(private.month_lock_key(v_household, v_month));
  select * into v_row from public.month_settlements
   where household_id = v_household and month = v_month for update;
  if not found or v_row.status = 'reopened' then
    return jsonb_build_object('result', 'already');
  end if;
  update public.month_settlements
     set status = 'reopened', reopened_from = v_row.status,
         reopened_by = v_uid, reopened_at = now()
   where household_id = v_household and month = v_month;
  insert into public.settlement_events (household_id, month, round, action, actor)
  values (v_household, v_month, v_row.round, 'reopen', v_uid);
  return jsonb_build_object('result', 'ok', 'round', v_row.round);
end $$;
```

<details>
<summary>残りの RPC（app_status・出す額の元に戻すの控え private.contribution_undo・decide_contributions・undo_decide_contributions・defer_expense・元に戻す・人の設定・ひな形・ping）</summary>

```sql
create or replace function public.app_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_current   date := private.month_of(private.jst_today());
  v_m         date;
  v_status    text;
  v_months    jsonb := '[]'::jsonb;
  v_default   date;
  v_notice    jsonb;
  v_remaining integer;
begin
  if v_household is null then raise exception 'not_member'; end if;
  select start_month into v_m from public.households where id = v_household;
  -- 何年も使ったら、精算済みの月を飛ばして始める形にする（草案では全部の月を回す）
  while v_m <= v_current loop
    perform public.ensure_month(v_m);
    v_status := private.month_status(v_household, v_m);
    v_months := v_months || jsonb_build_object('month', v_m, 'status', v_status);
    if v_default is null and v_status in ('closing', 'confirmed') then
      v_default := v_m;
    end if;
    if v_notice is null and v_status = 'closing' then
      v_notice := jsonb_build_object('kind', 'closing', 'month', v_m);
    -- 条件2 は「**月が終わった**精算中の月」だけ（月の途中に精算した月は、その月が終わるまで出さない。
    -- 仕様書 §3.2・§3.5・§12.1 Q2・Q23。赤い点とお知らせ行の条件は変えない）
    elsif v_notice is null and v_status = 'confirmed' and v_m < v_current then
      select l.remaining into v_remaining
        from public.month_settlement_lines l
        join public.month_settlements s on s.household_id = l.household_id and s.month = l.month
       where l.household_id = v_household and l.month = v_m and l.user_id = v_uid
         and l.remaining <> 0
         and not exists (select 1 from public.settlement_checks c
                          where c.household_id = l.household_id and c.month = l.month
                            and c.round = s.round and c.user_id = l.user_id);
      if found then
        v_notice := jsonb_build_object('kind', 'transfer', 'month', v_m,
                      'direction', case when v_remaining > 0 then 'in' else 'out' end,
                      'amount', abs(v_remaining));
      end if;
    end if;
    v_m := (v_m + interval '1 month')::date;
  end loop;
  return jsonb_build_object(
    'today', private.jst_today(), 'current_month', v_current,
    'settle_default_month', coalesce(v_default, v_current),
    'months', v_months, 'badge', v_notice is not null, 'notice', v_notice);
end $$;

-- 出す額を決めたのを元に戻すための控え（端末からは読めない。private スキーマで、どのロールにも grant しない）。
-- decide_contributions が書き込む前の行を入れ、undo_decide_contributions がここから戻して消す。
-- 戻さなかった控えは残る（1か月に数行なので消さない）。
create table private.contribution_undo (
  household_id uuid not null references public.households(id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  decided_at   timestamptz not null,                          -- その decide で書いた時刻（書いた行の decided_at と同じ）
  decided_by   uuid not null references auth.users(id),       -- 決めた人（元に戻せるのはこの人だけ）
  rows         jsonb not null,                                -- 書き込む前の行 {"<user_id>": null | {"net_income", "decided_by", "decided_at"}}
  primary key (household_id, month, decided_at)
);
revoke all on private.contribution_undo from public, anon, authenticated;

-- 出す額を決める。p_net_incomes が null なら「この額で決める」（決まっていない人を 先月の手取り × いまの割合 で）。
-- 割合と決めた人はサーバーで決める: 新しく作る行は household_members の割合、決めてある行は保存済みの割合のまま（仕様書 S-21）。
-- 書き込む前の行（行が無かった人は null）は private.contribution_undo に控え、端末には書いた時刻（prev.decided_at）だけを返す。
create or replace function public.decide_contributions(p_month date, p_net_incomes jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_prev      date := (private.month_of(p_month) - interval '1 month')::date;
  v_missing   jsonb;
  v_rows      jsonb;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock_shared(private.month_lock_key(v_household, v_month));   -- 確定と順番に並べる
  if private.is_month_locked(v_household, v_month) then
    return jsonb_build_object('result', 'blocked', 'reason', 'locked');
  end if;

  if p_net_incomes is null then
    select jsonb_agg(hm.user_id) into v_missing
      from public.household_members hm
     where hm.household_id = v_household
       and not exists (select 1 from public.month_contributions c
                        where c.household_id = v_household and c.month = v_month and c.user_id = hm.user_id)
       and not exists (select 1 from public.month_contributions p
                        where p.household_id = v_household and p.month = v_prev and p.user_id = hm.user_id);
    if v_missing is not null then
      return jsonb_build_object('result', 'blocked', 'reason', 'no_previous', 'users', v_missing);
    end if;
    -- 書き込む前の行: 決まっていない人（どれも行が無い）
    select jsonb_object_agg(hm.user_id::text, 'null'::jsonb) into v_rows
      from public.household_members hm
     where hm.household_id = v_household
       and not exists (select 1 from public.month_contributions c
                        where c.household_id = v_household and c.month = v_month and c.user_id = hm.user_id);
    insert into public.month_contributions
      (household_id, month, user_id, net_income, contribution_rate, decided_by, decided_at)
    select v_household, v_month, hm.user_id, p.net_income, hm.contribution_rate, v_uid, now()
      from public.household_members hm
      join public.month_contributions p
        on p.household_id = hm.household_id and p.month = v_prev and p.user_id = hm.user_id
     where hm.household_id = v_household
    on conflict (household_id, month, user_id) do nothing;
  else
    -- 書き込む前の行: 手取りを送ってきた人（家計の人だけ）。割合は控えない（決め直しで割合は変わらないため）
    select jsonb_object_agg(hm.user_id::text,
             case when c.user_id is null then 'null'::jsonb
                  else jsonb_build_object('net_income', c.net_income,
                                          'decided_by', c.decided_by, 'decided_at', c.decided_at) end)
      into v_rows
      from jsonb_object_keys(p_net_incomes) k
      join public.household_members hm on hm.household_id = v_household and hm.user_id = k::uuid
      left join public.month_contributions c
        on c.household_id = v_household and c.month = v_month and c.user_id = hm.user_id;
    insert into public.month_contributions
      (household_id, month, user_id, net_income, contribution_rate, decided_by, decided_at)
    select v_household, v_month, hm.user_id, (x.value)::integer, hm.contribution_rate, v_uid, now()
      from jsonb_each_text(p_net_incomes) x
      join public.household_members hm
        on hm.household_id = v_household and hm.user_id = (x.key)::uuid
    on conflict (household_id, month, user_id) do update
      set net_income        = excluded.net_income,
          contribution_rate = public.month_contributions.contribution_rate,  -- 決めてある月は保存した割合のまま（上書きしない）
          decided_by        = excluded.decided_by,
          decided_at        = excluded.decided_at;
    -- 出す額（contribution）は生成列なので、手取りと保存した割合から計算し直される。
    -- 生成列にしない場合は set contribution = floor(excluded.net_income * public.month_contributions.contribution_rate / 100) を足す。
  end if;
  -- 控え。同じ取引で2回呼んだとき（now() が同じ）は、先に控えた前の値を残して足す（jsonb の || は右が勝つ）
  insert into private.contribution_undo (household_id, month, decided_at, decided_by, rows)
  values (v_household, v_month, now(), v_uid, coalesce(v_rows, '{}'::jsonb))
  on conflict (household_id, month, decided_at) do update
    set rows = excluded.rows || private.contribution_undo.rows;
  return jsonb_build_object('result', 'ok', 'prev', jsonb_build_object('decided_at', now()));
end $$;

-- 出す額を決めたのを元に戻す（トーストの「元に戻す」）。p_decided_at は decide_contributions が返した prev.decided_at。
-- 戻す値は端末から受け取らず、private.contribution_undo の控えから取る。
-- 戻さないとき: 精算中・精算済みの月（locked）。控えが無い（もう戻した・ほかの時刻）、決めたのが自分でない、
-- そのあと誰かが決め直した（いまの行の decided_at・decided_by がその decide のものでない）とき（changed）。
create or replace function public.undo_decide_contributions(p_month date, p_decided_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_undo      private.contribution_undo%rowtype;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock_shared(private.month_lock_key(v_household, v_month));
  if private.is_month_locked(v_household, v_month) then
    return jsonb_build_object('result', 'blocked', 'reason', 'locked');
  end if;
  perform 1 from public.month_contributions
   where household_id = v_household and month = v_month for update;
  select * into v_undo from private.contribution_undo
   where household_id = v_household and month = v_month and decided_at = p_decided_at
   for update;
  if not found or v_undo.decided_by is distinct from v_uid then
    return jsonb_build_object('result', 'blocked', 'reason', 'changed');
  end if;
  -- いまの行が、その decide で書いたままか（行が無い・時刻か決めた人が違う → そのあと決め直された）
  if exists (select 1 from jsonb_object_keys(v_undo.rows) k
               left join public.month_contributions c
                 on c.household_id = v_household and c.month = v_month and c.user_id = k::uuid
              where c.decided_at is distinct from v_undo.decided_at
                 or c.decided_by is distinct from v_undo.decided_by) then
    return jsonb_build_object('result', 'blocked', 'reason', 'changed');
  end if;
  -- 前が null の人: 行を消す
  delete from public.month_contributions c
   using jsonb_each(v_undo.rows) x
   where c.household_id = v_household and c.month = v_month
     and c.user_id = (x.key)::uuid and x.value = 'null'::jsonb;
  -- 前の値がある人: 手取り・決めた人・時刻を前の値に戻す（割合は戻さない。決め直しで割合は変わらないため）
  update public.month_contributions c
     set net_income = (x.value ->> 'net_income')::integer,
         decided_by = (x.value ->> 'decided_by')::uuid,
         decided_at = (x.value ->> 'decided_at')::timestamptz
    from jsonb_each(v_undo.rows) x
   where c.household_id = v_household and c.month = v_month
     and c.user_id = (x.key)::uuid and x.value <> 'null'::jsonb;
  delete from private.contribution_undo
   where household_id = v_household and month = v_month and decided_at = v_undo.decided_at;
  return jsonb_build_object('result', 'ok');
end $$;

-- 来月に回す（p_undo = true で1か月戻す）。p_from_month が今の帰属月と違えば何もしない（2台の二重押し対策）
create or replace function public.defer_expense(p_expense_id uuid, p_from_month date, p_undo boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := private.my_household_id();
  v_row       public.expenses;
  v_to        date;
begin
  if v_household is null then raise exception 'not_member'; end if;
  select * into v_row from public.expenses
   where id = p_expense_id and household_id = v_household for update;
  if not found or v_row.fixed_cost_id is null then
    return jsonb_build_object('result', 'blocked', 'reason', 'not_fixed_row');
  end if;
  if v_row.accounting_month <> private.month_of(p_from_month) then
    return jsonb_build_object('result', 'already', 'accounting_month', v_row.accounting_month);
  end if;
  if not p_undo then
    if v_row.amount is not null or v_row.skipped then
      return jsonb_build_object('result', 'blocked', 'reason', 'not_pending');
    end if;
    -- 「その月が終わってから」の条件は 2026-09-23 に外した（仕様書 §12.1 Q2・S-15）。
    -- 条件は「翌月がロックされていないこと」だけで、それは下の update をトリガーが確かめる。
    v_to := (v_row.accounting_month + interval '1 month')::date;
  else
    if v_row.accounting_month <= v_row.period_month then
      return jsonb_build_object('result', 'blocked', 'reason', 'nothing_to_undo');
    end if;
    v_to := (v_row.accounting_month - interval '1 month')::date;
  end if;
  perform set_config('kakeibo.defer', 'on', true);
  update public.expenses set accounting_month = v_to where id = p_expense_id;  -- ロックはトリガーが確かめる
  perform set_config('kakeibo.defer', 'off', true);
  return jsonb_build_object('result', 'ok', 'accounting_month', v_to);
end $$;

-- ［この金額で精算］の元に戻す
create or replace function public.settle_undo_confirm(p_month date, p_round smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_row       public.month_settlements;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock(private.month_lock_key(v_household, v_month));
  select * into v_row from public.month_settlements
   where household_id = v_household and month = v_month for update;
  if not found or v_row.status not in ('confirmed', 'settled') or v_row.round <> p_round then
    return jsonb_build_object('result', 'already');
  end if;
  if exists (select 1 from public.settlement_checks
              where household_id = v_household and month = v_month and round = p_round) then
    return jsonb_build_object('result', 'blocked', 'reason', 'checked');
  end if;
  delete from public.month_settlement_lines where household_id = v_household and month = v_month;
  if v_row.round = 1 then
    delete from public.month_settlements where household_id = v_household and month = v_month;
  else
    update public.month_settlements
       set status = 'reopened', round = round - 1, settled_at = null
     where household_id = v_household and month = v_month;
  end if;
  insert into public.settlement_events (household_id, month, round, action, actor)
  values (v_household, v_month, p_round, 'undo_confirm', v_uid);
  return jsonb_build_object('result', 'ok');
end $$;

-- ［精算をやり直す］の元に戻す（やり直した後に数字が変わっていたら戻さない）
create or replace function public.settle_undo_reopen(p_month date, p_round smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_row       public.month_settlements;
  v_live      jsonb;
begin
  if v_household is null then raise exception 'not_member'; end if;
  perform pg_advisory_xact_lock(private.month_lock_key(v_household, v_month));
  select * into v_row from public.month_settlements
   where household_id = v_household and month = v_month for update;
  if not found or v_row.status <> 'reopened' or v_row.round <> p_round then
    return jsonb_build_object('result', 'already');
  end if;
  v_live := private.month_live(v_household, v_month);
  if (v_live ->> 'expense_total')::integer <> v_row.expense_total
     or (v_live ->> 'joint_paid')::integer <> v_row.joint_paid
     or (v_live ->> 'contribution_total')::integer is distinct from v_row.contribution_total
     or (v_live ->> 'pending_count')::integer > 0
     or exists (select 1 from jsonb_array_elements(v_live -> 'members') x
                  join public.month_settlement_lines l
                    on l.household_id = v_household and l.month = v_month
                   and l.user_id = (x ->> 'user_id')::uuid
                 where (x ->> 'settlement')::integer is distinct from l.settlement) then
    return jsonb_build_object('result', 'blocked', 'reason', 'changed');
  end if;
  update public.month_settlements set status = v_row.reopened_from
   where household_id = v_household and month = v_month;
  insert into public.settlement_events (household_id, month, round, action, actor)
  values (v_household, v_month, p_round, 'undo_reopen', v_uid);
  return jsonb_build_object('result', 'ok', 'status', v_row.reopened_from);
end $$;

-- 人の設定（S-02・S-33）。色を選ぶと相手は残りの色になる
create or replace function public.update_member(p_user_id uuid, p_display_name text, p_color text, p_rate smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
begin
  if v_household is null or not private.is_member(v_household, p_user_id) then
    raise exception 'not_member';
  end if;
  update public.household_members
     set color = case when p_color = 'teal' then 'amber' else 'teal' end,
         updated_by = v_uid, updated_at = now()
   where household_id = v_household and user_id <> p_user_id and color = p_color;
  update public.household_members
     set display_name = p_display_name, color = p_color, contribution_rate = p_rate,
         updated_by = v_uid, updated_at = now()
   where household_id = v_household and user_id = p_user_id;
  return jsonb_build_object('result', 'ok');
end $$;

-- 記録の既定の払った人（S-30 の「自分」）。本人の行だけを直す（仕様書 §2.2・§12.1 Q3）
create or replace function public.update_default_payer(p_default_payer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if p_default_payer is null or p_default_payer not in ('self', 'joint') then
    raise exception 'bad_default_payer';
  end if;
  update public.household_members
     set default_payer = p_default_payer, updated_by = v_uid, updated_at = now()
   where user_id = v_uid;          -- 自分の行だけ（相手の既定は変えられない。household_members_user_id_key で1行）
  if not found then raise exception 'not_member'; end if;
  return jsonb_build_object('result', 'ok', 'default_payer', p_default_payer);
end $$;

-- 支払いをやめる（まだ作っていない月から作らない）。p_undo = true でやめるを取り消す
create or replace function public.stop_template(p_template_id uuid, p_undo boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_end       date;
begin
  if v_household is null then raise exception 'not_member'; end if;
  if p_undo then
    update public.fixed_cost_templates set end_month = null, updated_by = v_uid, updated_at = now()
     where id = p_template_id and household_id = v_household;
    return jsonb_build_object('result', 'ok');
  end if;
  select coalesce((max(e.period_month) + interval '1 month')::date, t.start_month) into v_end
    from public.fixed_cost_templates t
    left join public.expenses e on e.fixed_cost_id = t.id
   where t.id = p_template_id and t.household_id = v_household
   group by t.start_month;
  if v_end is null then return jsonb_build_object('result', 'blocked', 'reason', 'not_found'); end if;
  update public.fixed_cost_templates set end_month = v_end, updated_by = v_uid, updated_at = now()
   where id = p_template_id;
  return jsonb_build_object('result', 'ok', 'end_month', v_end);   -- トースト「（10月から）」
end $$;

-- 毎月の支払いの追加を元に戻す（作った行ごと消す）。できるのは、作った人が作った直後に、行が手つかずのときだけ（02 §2.5・§10 C13）。
-- ロック中の月に行があれば消さない
create or replace function public.delete_template(p_template_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_t         public.fixed_cost_templates;
begin
  if v_household is null then raise exception 'not_member'; end if;
  select * into v_t from public.fixed_cost_templates
   where id = p_template_id and household_id = v_household;
  if not found then
    return jsonb_build_object('result', 'blocked', 'reason', 'not_found');
  end if;
  if v_t.created_by is distinct from v_uid                         -- 作った人でない
     or v_t.created_at < now() - interval '1 minute'               -- 作ってから1分を過ぎた（6秒のトーストより十分長い）
     or exists (select 1 from public.expenses e                     -- 行が手つかずでない
                 where e.fixed_cost_id = v_t.id
                   and (e.period_month <> v_t.start_month           -- 追加した月より後の月の行がある
                     or e.accounting_month <> e.period_month        -- 来月に回した
                     or e.amount_set_by is not null                 -- 金額を入れた
                     or e.updated_at is not null                    -- 直した
                     or e.skipped)) then                            -- 今月はなしにした
    return jsonb_build_object('result', 'blocked', 'reason', 'too_late');
  end if;
  if exists (select 1 from public.expenses e
              where e.fixed_cost_id = p_template_id
                and private.is_month_locked(e.household_id, e.accounting_month)) then
    return jsonb_build_object('result', 'blocked', 'reason', 'locked_rows');
  end if;
  delete from public.expenses where fixed_cost_id = p_template_id and household_id = v_household;
  delete from public.fixed_cost_templates where id = p_template_id and household_id = v_household;
  return jsonb_build_object('result', 'ok');
end $$;

-- 一時停止を防ぐための呼び出し（テーブルに触れない）
create or replace function public.ping() returns integer
language sql stable set search_path = '' as $$ select 1 $$;

-- 実行の権限（Supabase は public の関数を既定で anon にも許すので、まとめて外してから付ける）
revoke execute on all functions in schema public from public, anon;
grant execute on function public.ensure_month(date), public.settle_confirm(date, jsonb),
  public.settle_set_check(date, uuid, boolean), public.settle_reopen(date),
  public.settle_undo_confirm(date, smallint), public.settle_undo_reopen(date, smallint),
  public.decide_contributions(date, jsonb), public.undo_decide_contributions(date, timestamptz),
  public.defer_expense(uuid, date, boolean),
  public.app_status(), public.update_member(uuid, text, text, smallint),
  public.update_default_payer(text),
  public.stop_template(uuid, boolean), public.delete_template(uuid) to authenticated;
grant execute on function public.ping() to anon, authenticated;
```

</details>

---

## 9. 画面 ↔ テーブル・RPC の対応

「読む」は supabase-js の `select`（RLS で絞られる）か RPC。月の一覧は `accounting_month = 見ている月`。

| 画面 | 読む | 書く |
|---|---|---|
| S-01 ログイン | — | `auth.signInWithPassword`（ID を擬似メールに変える。`docs/05_platform.md` §4） |
| S-02 はじめに | `household_members`（自分）、`profiles` | `update_member`（自分の呼び名）、`profiles.onboarded_at` |
| S-03 ホーム画面に追加 | — | — |
| S-04 月を選ぶ | `app_status`（`today`・`current_month`）、`households`（`start_month`。選べる範囲の下限。`months` からは取らない。仕様書 S-04） | — |
| S-10 支出 | `app_status`（お知らせ行・行の生成・月の状態）、`expenses`（その月。今月を見ていて前の月が締め待ちなら、前の月の金額待ちも。仕様書 S-10 要素7）、`expenses`（対象月 ＝ その月・帰属月 ≠ その月:「9月に回しました」）、`month_settlements`（[鍵] のバッジ）、`household_members`（アバター）、`profiles.last_seen_at`（新着。null〈初めて S-10 を見る〉なら新着を出さない）、`households`（`start_month`。‹ の下限。`months` からは取らない） | `profiles.last_seen_at`（S-10 を離れるとき） |
| S-11 記録（何に払った？。記録タブのトップ） | `categories` | — |
| S-12 記録（いくら？。記録タブから開くシート） | `categories`、`expenses`（選んだ日付の月の金額待ちの行に、選んだカテゴリの行があるか。仕様書 S-12 `action`）、`household_members`（アバターと呼び名、自分の `default_payer` ＝ 払った人の初期値。仕様書 S-12 要素6） | `expenses` insert（オフラインなら端末に保留して、同じ `id` で後から） |
| S-13 内訳 | S-10 と同じ結果をカテゴリで集計（端末で） | — |
| S-14 `own` | `expenses` | `expenses` update ／ delete（元に戻す = 同じ `id` で insert） |
| S-14 `partner`・`locked` | `expenses`、`household_members` | — |
| S-14 `fixed` | `expenses` | `expenses` update（`amount`・`paid_by`・`skipped`） |
| S-14 `unsent` | 端末の保留 | `expenses` insert（日付を変えて） |
| S-15 金額を入れる | `expenses`（その行と、同じひな形の前の対象月の行 =「先月 4,380」）、`app_status`（翌月がロックされていないか ＝「来月に回す」を出すか。仕様書 S-15 `canDefer`） | `expenses` update（`amount`・`skipped`）、`defer_expense` |
| S-20 精算 | `month_summary(月, 精算のモードか)`、`app_status`、`households`（`start_month`。‹ の下限。`months` からは取らない） | `decide_contributions`、`undo_decide_contributions`、`settle_confirm`、`settle_set_check`、`settle_reopen`、`settle_undo_*`。**［この月を精算する］は書かない**（端末が持つ「精算のモード」を立て、`month_summary` に渡して読み直すだけ。保存しない。仕様書 §12.1 Q2・§11 #45） |
| S-21 出す額 | `month_summary`（手取り・割合・決めた人・先月の手取り）、`household_members` | `decide_contributions(p_month, {user_id: 手取り})`、`undo_decide_contributions` |
| S-22 1人ぶんの内訳 | `month_summary`（その人の数字とチェック）、`expenses`（その月・`paid_by` = その人・金額あり・今月はなしでない）、`expenses`（その月・`paid_by` = その人・金額待ちで今月はなしでない。`estimate` の注記） | — |
| S-30 設定 | `household_members`（呼び名・色・出す割合と、自分の `default_payer`）、`fixed_cost_templates`（`end_month` が null のもの〈やめていないもの〉の件数。仕様書 S-30） | `update_default_payer`（「記録の払った人」。その場で保存し、トーストの元に戻すは前の値でもう一度呼ぶ） |
| S-31 毎月の支払い | `fixed_cost_templates`（`end_month` が null のもの。毎月同じの合計・金額待ちの件数・行） | — |
| S-32 追加・直す | `categories`（`name_hints` で推測）、`fixed_cost_templates` | `fixed_cost_templates` insert → `ensure_month(今月)`、update、`stop_template`、`delete_template`（追加の元に戻す） |
| S-33 人の設定 | `household_members` | `update_member` |
| S-34 パスワード | — | `auth.updateUser({ password })` |

---

## 10. 初期データ

家計・人・プロフィールは、2人のユーザーを Supabase のダッシュボードで作った後（`docs/05_platform.md` §4）、SQL エディタ（RLS の対象外）で入れる。カテゴリはマイグレーションに入れる。

```sql
-- 初期データ（カテゴリ。仕様書 §8。name_hints は S-32 の推測に使う）
insert into public.categories (id, sort_order, name, icon, name_hints) values
  ('groceries',       1, '食料品',   'shopping-basket',  '{}'),
  ('dining',          2, '外食',     'utensils-crossed', '{}'),
  ('household_goods', 3, '日用品',   'spray-can',        '{}'),
  ('transport',       4, '交通',     'train-front',      '{駐車場}'),
  ('leisure',         5, 'レジャー', 'ticket',           '{}'),
  ('entertainment',   6, 'エンタメ', 'tv',               '{動画,音楽,配信,Netflix,Spotify}'),
  ('social',          7, '交際',     'gift',             '{}'),
  ('housing',         8, '住まい',   'building-2',       '{家賃,管理費}'),
  ('utilities',       9, '光熱費',   'lightbulb',        '{光熱,電気,ガス,水道}'),
  ('telecom',        10, '通信',     'wifi',             '{携帯,スマホ,光,回線,Wi-Fi,NHK}'),
  ('insurance',      11, '保険',     'shield',           '{保険}'),
  ('medical',        12, '医療',     'stethoscope',      '{病院,薬}'),
  ('big_purchase',   13, '大型出費', 'sofa',             '{家電,家具}'),
  ('tax',            14, '税金',     'landmark',         '{税,年金}'),
  ('other',          15, 'その他',   'ellipsis',         '{}');
```

- 2026-09-23 に12件から15件にした（仕様書 §8。ユーザーの指示）。`subscriptions`「サブスク」→ `entertainment`「エンタメ」（`id` も名前もアイコンも変える。`repeat` は毎月の支払いの `calendar-sync` と紛らわしいので `tv`）、`medical`・`big_purchase`・`tax` を追加。`sort_order` は仕様書 §8 の並び（3列×5行）に合わせて 1〜15 に振り直した。
- `sofa` が Lucide のそのバージョンに無ければ `package` を入れる（仕様書 §8）。
- **まだ本番に入れていないので、`update` のマイグレーションではなくこの `insert` を直した。** 入れた後に変えるときは、`categories` の `id` を `expenses.category_id`・`fixed_cost_templates.category_id` が参照している（`on delete` を書いていないので既定の `no action`）ので、`update public.categories set id = 'entertainment' where id = 'subscriptions'` だけでは参照している行が残って失敗する。順は (1) 新しい行を **`sort_order` は 100 番台の仮の値で** insert、(2) 参照している行（`expenses.category_id`・`fixed_cost_templates.category_id`）の `category_id` を付け替え、(3) 古い行を delete、(4) 全15件の `sort_order` を 1〜15 に振り直す（残っている旧行とぶつかるときは、そちらも一度 100 番台に逃がす）。`name` も unique なので、名前を使い回すときも同じ逃がし方をする。(2) は `expenses_before_write` に止められる（毎月の支払いから作られた行は `fixed_row_immutable`、精算中・精算済みの月の行は `month_locked`。§7）ので、テーブルのオーナーで `alter table public.expenses disable trigger expenses_before_write;` → 付け替え → `alter table public.expenses enable trigger expenses_before_write;` の順で流す。`fixed_cost_templates` は before insert のトリガーだけなので、そのまま付け替えられる（§7）。

```sql
-- 初期データ（家計と2人。<…> はダッシュボードで作ったユーザーの UUID）
insert into public.households (id, start_month) values (gen_random_uuid(), '2026-10-01') returning id;  -- 使い始める月
insert into public.household_members (household_id, user_id, position, display_name, color, contribution_rate) values
  ('<household_id>', '<masato_uid>', 1, 'まさと', 'teal',  40),
  ('<household_id>', '<risako_uid>', 2, 'りさこ', 'amber', 40);  -- 呼び名は 2026-09-23 に確定（仕様書 §12.1 Q9・§9.1）
insert into public.profiles (user_id) values ('<masato_uid>'), ('<risako_uid>');
```

- `default_payer` は書かない（既定の `'self'` ＝ 記録の払った人「自分」。仕様書 S-30・§9.1）。変えるのは本人が S-30 で選んだときだけ。

- `id` は仕様書 §8 の「内部キー」、`name_hints` は仕様書 §8 の「S-32 の名前からの推測」の列に合わせた（モックの `CATEGORIES` の `key` も同じ）。
- 推測は名前に語が含まれるかで決める。複数のカテゴリに当たったときは仕様書 §8 の決め方（当たった語が一番長いもの、同じ長さなら §8 の並びが先のもの。大文字・小文字は区別しない）。「光熱費」は「光熱」（光熱費）が「光」（通信）より長いので光熱費、「光回線」は「回線」で通信、「住民税」は「税」で税金になる。
- 見本データ（仕様書 §9）はモックのためのもので、本番には入れない。

---

## 11. 確かめたこと・まだのこと

**確かめたこと**（2026-09-22、`public.ecr.aws/supabase/postgres:17.6.1.167` をローカルの Docker で起動し、この文書の SQL を適用。「今日」はテスト用に差し替えた。手順は下の「再現の手順」）

- 仕様書 §9 の見本データを、仕様書 §9.8 のシナリオの順に操作して、次が §9.6 と一致した。
  - 8月: もう払った分 24,940 ／ 96,930、共用払い 134,020、支出合計 255,890、動かす額 93,060 ／ −4,930、共用 −45,890。2人のチェックで精算済み
  - 9月 `sep-open`: 29,160 ／ 18,470 ／ 133,040 ／ 180,670 → 90,840 ／ 69,530 ／ 27,330、S-20 は `estimate`
  - 9月 `sep-prep`: 31,310 ／ 22,070 ／ 146,550 ／ 199,930、金額待ち 2、S-20 は `prep`、確定は `pending` で止まる
  - 9月 `sep-ready`: 37,510 ／ 22,070 ／ 146,550 ／ 206,130 → 82,490 ／ 65,930 ／ 1,870。10月は 92,090・金額待ち 3件
  - 9月 `sep-redo`: 40,810 → 動かす額 79,190、済んだ分 82,490、残り −3,300、りさこ残り 0、共用 −1,430。2回目の確定のあと、まさとのチェックで精算済み
  - 赤い点・お知らせ行: 締め待ち（条件1）、精算中の自分のカードが未チェック（条件2。まさと「入れる 82,490」、りさこ「入れる 65,930」、8月のりさこ「受け取る 4,930」）、自分がチェックしたら消える
  - 出す額を RPC だけで書くように直したあと（§6.3・§8.3）も、同じシナリオを流して、上の値がすべて変わらないことを確かめた（2026-09-22 の2回目）。
- 同じひな形の電気代（8月分）と電気代（9月分）が9月に並ぶ（対象月での一意制約）。`ensure_month` は2回目以降 0件。
- ［この金額で精算］の2回目は `already`、見ていた数字が違うと `stale`、チェックの2回目は同じ結果。元に戻す（確定・やり直し）とその拒否（やり直し後に記録を足した → `changed`）。
- RLS: りさこはまさとの記録を直せない（0行）・毎月の支払いの行を消せない（0行）・他人名義で足せない（違反）・毎月の支払いの行を直接足せない（違反）。毎月の支払いの行のカテゴリは変えられない（`fixed_row_immutable`）。精算中・精算済みの月には足せず、日付を動かして入れることもできない（`month_locked`）。`anon` は `expenses` を読めず、`ping()` だけ呼べる。
- 色の入れ替え（まさとを amber にするとりさこが teal になる）、支払いをやめたときの `end_month`（10月分があれば11月から）、ケースL の切り捨て 113,382。
- **出す額の決め直し（仕様書 S-21）**: まさととして 9月を 300,000 ／ 220,000・割合 40% で決める → S-33 でまさとの割合を 50 にする（`update_member`）→ S-21 で手取り 310,000 で決め直す。結果は **`contribution_rate = 40`・`contribution = 124,000`**（保存した割合のまま）。まだ決めていない 10月を［この額で決める］で決めると、新しく作る行だけが今の割合を使う（まさと 300,000 × 50% ＝ 150,000、りさこ 220,000 × 40% ＝ 88,000）。
- **出す額の元に戻す（`undo_decide_contributions`。2026-09-23 に、控え〈`private.contribution_undo`〉から戻す形にしてから手順1〜4 で流し直した）**: 決め直したのを戻すと 300,000・40%・120,000 と前の決めた人・時刻に戻る。同じ時刻でもう一度戻すと `blocked: changed`（控えは戻したときに消える）。新しく作った行（10月の［この額で決める］。まさと 300,000 × 50% ＝ 150,000、りさこ 88,000）は戻すと消える（0行）。決めたあと相手が決め直していたら `blocked: changed`。**相手が決めたのを自分が戻すと `blocked: changed`**（相手の時刻を渡しても、控えの決めた人が自分でない）。同じトランザクションで2回決めても控えの主キーで止まらず、戻すとトランザクションの前の値に戻る。精算中の月では、決めるのも戻すのも `blocked: locked`。
- **端末から任意の `prev` を渡す口が無いこと**: `undo_decide_contributions` の引数は月と時刻だけ（前の形の `(date, jsonb)` で呼ぶと `function … does not exist`）。`authenticated` として `private.contribution_undo` を読むと `permission denied for table contribution_undo`。
- **出す額の直接の書き込み**: `authenticated` として `month_contributions` に `update`・`insert`・`delete` すると、どれも `permission denied for table month_contributions`。`select` はでき、RPC（`decide_contributions`・`undo_decide_contributions`）では決められる・戻せる。
- `request.jwt.claims`（JSON）だけを設定して `request.jwt.claim.sub` を設定しないと、このイメージの `auth.uid()` は null になり、RPC は `not_member` で止まる。
- **ひな形の追加した月（§7 のトリガー。2026-09-22 の3回目。手順1〜4 のあとに流した）**: `kakeibo.today = 2026-10-01` で、まさととして `start_month = '2026-09-01'`（と `created_at = '2030-01-01'`）を送って insert しても、`start_month` は 2026-10-01、`created_at` は DB の時刻になった。`ensure_month('2026-09-01')` は 0件で9月に行ができず、`ensure_month('2026-10-01')` で10月分が1行できた。
- **追加の元に戻す（`delete_template`。同じ回）**: 作った直後は `ok`（ひな形と行が消える。2回目は `blocked: not_found`）。次の場合は `blocked: too_late`: 2か月前のひな形（`created_at` を管理者で2か月前にし、8〜10月分の行がある）、金額を入れた行があるひな形（金額待ちの行に 6,200 を入れた。作った直後でも）、相手が作ったひな形（りさこが作ったものを、まさとが戻す。りさこ本人なら `ok`）、作ってから1分を過ぎたひな形（ほかは手つかず）。`locked_rows` の確かめは残したが、`too_late` を通ったあとは今月（進行中でロックされない）の行しか無いので、今の決まりでは起きない（守りとして残す）。

**再現の手順**

この文書の SQL は `sql` のコードブロック（§2〜§10）を上から順に流したもの。ただし §10 の「家計と2人」の初期データは `<household_id>` などをダッシュボードで作った値に置き換えるものなので流さず、代わりに下の初期データを流す。下のテスト用の SQL は `pgsql` のブロックにしてあり、「`sql` のブロックを流す」には入らない。

1. イメージを起動する（タグは `17.6.1.167`）。

   ```sh
   docker run -d --name kakeibo-verify -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.167
   until docker exec kakeibo-verify pg_isready -U postgres -h localhost; do sleep 1; done
   ```

2. この文書の `sql` のブロックを取り出して流す（リポジトリのルートで）。

   ```sh
   python3 - > /tmp/kakeibo_schema.sql <<'PY'
   import re
   t = open('docs/04_data_model.md').read()
   blocks = [b for b in re.findall(r'`{3}sql\n(.*?)`{3}', t, re.S) if '<household_id>' not in b]
   print('\\set ON_ERROR_STOP 1')
   print('\n'.join(blocks))
   PY
   docker exec -i -e PGPASSWORD=postgres kakeibo-verify psql -q -U postgres -h localhost -d postgres < /tmp/kakeibo_schema.sql
   ```

3. 「今日」を差し替えられるようにし、初期データ（§10 の `<household_id>` `<masato_uid>` `<risako_uid>` を置き換えたもの。呼び名は見本データと同じ「まさと」「りさこ」。§9.1・§12.1 Q9）を入れる。`psql` に流すか、`docker exec -it … psql` の中に貼る。

   ```pgsql
   -- テスト用のデータベースだけ: 「今日」を kakeibo.today で差し替えられるようにする（本番の関数は端末から今日を受け取らない）
   create or replace function private.jst_today() returns date
   language sql stable set search_path = '' as $$
     select coalesce(nullif(current_setting('kakeibo.today', true), '')::date,
                     (now() at time zone 'Asia/Tokyo')::date)
   $$;

   -- 2人のユーザー（本番ではダッシュボードで作る）
   insert into auth.users (id, email, aud, role) values
     ('00000000-0000-0000-0000-00000000000a', 'masato@kakeibo.example.jp',  'authenticated', 'authenticated'),
     ('00000000-0000-0000-0000-00000000000b', 'risako@kakeibo.example.jp', 'authenticated', 'authenticated');
   -- 家計と2人（見本データの家計は 2026年8月から）
   insert into public.households (id, start_month) values ('11111111-1111-1111-1111-111111111111', '2026-08-01');
   insert into public.household_members (household_id, user_id, position, display_name, color, contribution_rate) values
     ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 1, 'まさと',     'teal',  40),
     ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 2, 'りさこ', 'amber', 40);
   insert into public.profiles (user_id) values
     ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
   ```

4. ログイン中の人を真似て操作する。このイメージの `auth.uid()` は `request.jwt.claim.sub` を読むので、それを設定してから `authenticated` になる（`request.jwt.claims` だけを設定すると `auth.uid()` が null になり、`not_member` で止まる）。

   ```pgsql
   set kakeibo.today = '2026-09-22';                                                      -- 「今日」
   select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);  -- まさと（1文ずつ流すときは false。begin〜commit の中だけなら true）
   set role authenticated;
   select public.decide_contributions('2026-09-01',
     '{"00000000-0000-0000-0000-00000000000a": 300000, "00000000-0000-0000-0000-00000000000b": 220000}');
   select public.update_member('00000000-0000-0000-0000-00000000000a', 'まさと', 'teal', 50::smallint);
   select public.decide_contributions('2026-09-01', '{"00000000-0000-0000-0000-00000000000a": 310000}');
   select user_id, net_income, contribution_rate, contribution from public.month_contributions where month = '2026-09-01';
   -- → まさと 310000 ／ 40 ／ 124000
   update public.month_contributions set net_income = 1;   -- → permission denied for table month_contributions
   reset role;
   ```

   `decide_contributions` と `undo_decide_contributions` は `now()` を「決めた時刻」に使うので、決めてから戻す確かめは、1文ずつ別のトランザクションで流す（同じトランザクションの中では時刻が変わらない）。

5. 見本データ（仕様書 §9.4・§9.5）は、管理者（`reset role` のまま）で `expenses` に入れ、シナリオの操作（金額を入れる・来月に回す・確定・チェック・やり直し）は上のように人を真似て RPC で行う。ひな形の `start_month` は §7 のトリガーが「今日」の月で入れるので、見本データのひな形（2026-08-01 に作った）は `set kakeibo.today = '2026-08-01'` にしてから入れる（送った `start_month` は使われない）。終わったら `docker rm -f kakeibo-verify`。

   見本データの insert とシナリオの操作の SQL は、リポジトリに無い（2026-09-22 は手で流した）。流せる形にするのは「まだのこと」の検証スクリプトで行う。

**まだのこと**

- **月の途中の精算**（2026-09-23 に足した。仕様書 §12.1 Q2）の確かめ。手順1〜4 で流して、次を見る: `set kakeibo.today = '2026-09-22'` のまま `settle_confirm('2026-09-01')` が通ること（`not_closing` にならない）、そのとき保存される値が、**金額待ち2件を［来月に回す］（または［今月はなし］）で片付けた場合に** 02 §9.2（9月見込み）の **まさと 90,840 ／ りさこ 69,530 ／ 共用 27,330** と一致すること（金額を入れて片付けると、その分だけ値が変わる）、金額待ちが2件残っていれば `blocked: pending` になること、`defer_expense` が今月（9月）の金額待ちでも `ok` になること（`month_not_ended` が返らない）、`settle_reopen` のあと `month_status` が `open` に戻ること、`app_status` のお知らせ行が 9/22 時点では出ず 10/1 に出ること、`private.s20_state(..., true)` が `prep` ／ `ready` を返し `false` なら `estimate` を返すこと、今月より先の月には `blocked: future_month` が返ること。
- **`default_payer` と `update_default_payer`**（2026-09-23 に足した。仕様書 §12.1 Q3）の確かめ。手順1〜4 で流して、次を見る: 自分が変えても相手の行が変わらないこと、`self`・`joint` 以外は `bad_default_payer` で止まること、`update_member`（呼び名・色・割合）が `default_payer` を変えないこと、`authenticated` が `household_members` を直接 `update` すると `permission denied` になること、いる行の既定が `'self'` になること。
- Supabase の本番プロジェクト（PostgREST・supabase-js 経由）での動作。特に `grant usage on schema private` が要ること（ローカルでは要った。platform.md U5）と、Data API の明示 grant の新しい既定での挙動。
- `month_summary()` の本体（出力の形だけ決めた）。
- 2台からの本当の同時実行（アドバイザリーロックの効き目は設計上のもので、並行の負荷テストはしていない）。
- ひな形の `updated_by` を入れるトリガー、`app_status()` の月の範囲の絞り込み（何年か使った後の速さ）。
  - S-04 と上部バーの ‹ › の下限（家計を作った月）は `months` から取らない形（`households.start_month` を読む。§9 の S-04・S-10・S-20 の行）にしてから絞り込む。
- **検証を1コマンドにする（実装の最初）**: `supabase/tests/`（か `scripts/verify_sql.sh`）に、SQL の適用 → 見本データ（仕様書 §9）→ §9.6 の値の確認を1コマンドで流す検証を置く。今は上の「再現の手順」を手で流している（見本データのシナリオを流すスクリプトはリポジトリに無い）。
