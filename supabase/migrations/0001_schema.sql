-- スキーマとテーブル（docs/04_data_model.md §2）
-- 正本: docs/04_data_model.md（この文書の SQL をそのまま実行順に分けたもの）。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。

-- ===== private スキーマと共通の関数（§2.1） =====

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

-- ===== 家計・人・本人だけのもの（§2.2） =====

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

-- ===== カテゴリ（§2.3） =====

create table public.categories (
  id         text primary key,          -- 'groceries' など（§10 の初期データ）
  sort_order smallint not null unique,  -- S-11（記録タブ）のグリッドの並び（1〜15。3列×5行。仕様書 §8）
  name       text not null unique,      -- 表示名「食料品」
  icon       text not null,             -- Lucide のアイコン名
  name_hints text[] not null default '{}'  -- S-32 で名前からカテゴリを推測する語
);

-- ===== 毎月の支払いのひな形（§2.4） =====

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

-- ===== 記録（§2.5） =====

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

-- ===== 出す額（§2.6） =====

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

-- ===== 精算（§2.7） =====

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
