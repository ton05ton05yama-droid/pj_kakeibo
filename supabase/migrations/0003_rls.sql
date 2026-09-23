-- RLS のポリシーと明示の grant（docs/04_data_model.md §6）
-- 正本: docs/04_data_model.md（この文書の SQL をそのまま実行順に分けたもの）。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。

-- ===== ポリシー（§6.2） =====

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

-- ===== 明示の grant（§6.3） =====

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
