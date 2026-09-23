-- month_summary（docs/04_data_model.md §8.1・§8.2）
-- 04 は出力の形だけを決めていて、本体は「まだのこと」（§11）。ここで §8.2 の形のとおりに実装する。
-- 04 にこの本体を写すのは 04 の担当（CLAUDE.md §3。04 が正本）。
--
-- 進行中・締め待ち（open / closing / reopened）は private.month_live() から、
-- 精算中・精算済み（confirmed / settled）は month_settlements・month_settlement_lines の保存値から作る。

create or replace function public.month_summary(p_month date, p_settle_mode boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_month     date := private.month_of(p_month);
  v_prev      date := (private.month_of(p_month) - interval '1 month')::date;
  v_start     date;
  v_row       public.month_settlements;
  v_locked    boolean;
  v_live      jsonb;
  v_round     smallint;
  v_members   jsonb;
  v_joint     jsonb;
  v_pending   jsonb;
  v_blocker   jsonb;
begin
  if v_household is null then raise exception 'not_member'; end if;
  select start_month into v_start from public.households where id = v_household;

  select * into v_row from public.month_settlements
   where household_id = v_household and month = v_month;
  v_locked := found and v_row.status in ('confirmed', 'settled');
  v_round  := case when found then v_row.round end;

  if v_locked then
    -- 保存値から（振り込んでいるあいだに数字が動かない。仕様書 §6.1 の11）
    select jsonb_agg(jsonb_build_object(
             'user_id', hm.user_id,
             'position', hm.position,
             'contribution', case when c.user_id is null then null else jsonb_build_object(
                 'net_income', c.net_income, 'rate', c.contribution_rate, 'amount', l.contribution,
                 'decided_by', c.decided_by, 'decided_at', c.decided_at) end,
             'previous_net_income', p.net_income,
             'advance', l.advance,
             'settlement', l.settlement,
             'transferred', l.transferred,
             'remaining', l.remaining,
             'direction', case when l.remaining > 0 then 'in'
                               when l.remaining < 0 then 'out' else 'none' end,
             'check', (select jsonb_build_object('round', sc.round, 'amount', sc.amount,
                                                 'checked_by', sc.checked_by, 'checked_at', sc.checked_at)
                         from public.settlement_checks sc
                        where sc.household_id = v_household and sc.month = v_month
                          and sc.round = v_row.round and sc.user_id = hm.user_id),
             'past_checks', coalesce((select jsonb_agg(jsonb_build_object(
                                 'round', sc.round, 'amount', sc.amount,
                                 'checked_by', sc.checked_by, 'checked_at', sc.checked_at) order by sc.round)
                         from public.settlement_checks sc
                        where sc.household_id = v_household and sc.month = v_month
                          and sc.round < v_row.round and sc.user_id = hm.user_id), '[]'::jsonb))
             order by hm.position)
      into v_members
      from public.household_members hm
      join public.month_settlement_lines l
        on l.household_id = hm.household_id and l.month = v_month and l.user_id = hm.user_id
      left join public.month_contributions c
        on c.household_id = hm.household_id and c.month = v_month and c.user_id = hm.user_id
      left join public.month_contributions p
        on p.household_id = hm.household_id and p.month = v_prev and p.user_id = hm.user_id
     where hm.household_id = v_household;

    v_joint := jsonb_build_object(
      'joint_paid', v_row.joint_paid, 'expense_total', v_row.expense_total,
      'contribution_total', v_row.contribution_total, 'joint_net', v_row.joint_net);
  else
    -- いまの記録から（見込み・締め待ち・やり直し中）
    v_live := private.month_live(v_household, v_month);

    select jsonb_agg(jsonb_build_object(
             'user_id', hm.user_id,
             'position', hm.position,
             'contribution', case when c.user_id is null then null else jsonb_build_object(
                 'net_income', c.net_income, 'rate', c.contribution_rate, 'amount', c.contribution,
                 'decided_by', c.decided_by, 'decided_at', c.decided_at) end,
             'previous_net_income', p.net_income,
             'advance',     (x ->> 'advance')::integer,
             'settlement',  case when c.user_id is null then null else (x ->> 'settlement')::integer end,
             'transferred', (x ->> 'transferred')::integer,
             'remaining',   case when c.user_id is null then null else (x ->> 'remaining')::integer end,
             'direction',   case when c.user_id is null then null
                                 when (x ->> 'remaining')::integer > 0 then 'in'
                                 when (x ->> 'remaining')::integer < 0 then 'out' else 'none' end,
             'check', null,
             'past_checks', coalesce((select jsonb_agg(jsonb_build_object(
                                 'round', sc.round, 'amount', sc.amount,
                                 'checked_by', sc.checked_by, 'checked_at', sc.checked_at) order by sc.round)
                         from public.settlement_checks sc
                        where sc.household_id = v_household and sc.month = v_month
                          and sc.user_id = hm.user_id), '[]'::jsonb))
             order by hm.position)
      into v_members
      from jsonb_array_elements(v_live -> 'members') x
      join public.household_members hm
        on hm.household_id = v_household and hm.user_id = (x ->> 'user_id')::uuid
      left join public.month_contributions c
        on c.household_id = hm.household_id and c.month = v_month and c.user_id = hm.user_id
      left join public.month_contributions p
        on p.household_id = hm.household_id and p.month = v_prev and p.user_id = hm.user_id;

    v_joint := jsonb_build_object(
      'joint_paid',         (v_live -> 'joint_paid'),
      'expense_total',      (v_live -> 'expense_total'),
      'contribution_total', (v_live -> 'contribution_total'),
      'joint_net',          (v_live -> 'joint_net'));
  end if;

  -- 金額待ち（S-20 prep の「精算のまえに」。全件。並びは 個人 → 共用、対象月の古い順、ひな形の順）
  select jsonb_build_object(
           'count', count(*),
           'items', coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'name', e.name, 'period_month', e.period_month,
               'paid_by', e.paid_by, 'category_id', e.category_id, 'fixed_cost_id', e.fixed_cost_id)
             order by (e.paid_by is null), e.period_month, e.name), '[]'::jsonb))
    into v_pending
    from public.expenses e
   where e.household_id = v_household and e.accounting_month = v_month
     and e.amount is null and not e.skipped;

  -- ［この金額で精算］を押したら止まる理由（settle_confirm と同じ順。書き込まない）
  if v_locked then
    v_blocker := null;
  elsif v_month > private.month_of(private.jst_today()) then
    v_blocker := jsonb_build_object('reason', 'future_month');
  elsif v_prev >= v_start and not private.is_month_locked(v_household, v_prev) then
    v_blocker := jsonb_build_object('reason', 'previous_month', 'month', v_prev);
  elsif exists (select 1 from jsonb_array_elements(v_members) m
                 where m -> 'contribution' = 'null'::jsonb) then
    v_blocker := jsonb_build_object('reason', 'undecided');
  elsif (v_pending ->> 'count')::integer > 0 then
    v_blocker := jsonb_build_object('reason', 'pending', 'count', (v_pending ->> 'count')::integer);
  else
    v_blocker := null;
  end if;

  return jsonb_build_object(
    'month',      v_month,
    'status',     private.month_status(v_household, v_month),
    'view_state', private.s20_state(v_household, v_month, p_settle_mode),
    'as_of',      to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI:SS') || '+09:00',
    'round',      v_round,
    'members',    coalesce(v_members, '[]'::jsonb),
    'joint',      v_joint,
    'pending',    v_pending,
    'blocker',    v_blocker);
end $$;

-- Supabase は public の関数を既定で PUBLIC（anon を含む）に許すので、まず外してから付ける（04 §0.4・§8.3）
revoke execute on function public.month_summary(date, boolean) from public, anon;
grant execute on function public.month_summary(date, boolean) to authenticated;
