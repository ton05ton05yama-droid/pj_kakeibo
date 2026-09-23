-- 所属と判定の関数（docs/04_data_model.md §5）
-- 正本: docs/04_data_model.md（この文書の SQL をそのまま実行順に分けたもの）。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。

-- ===== security definer の判定関数（§5） =====

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
