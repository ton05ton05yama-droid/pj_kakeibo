-- RPC（docs/04_data_model.md §8.3）
-- 正本: docs/04_data_model.md（この文書の SQL をそのまま実行順に分けたもの）。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。

-- ===== 行の生成・精算（§8.3 の本体） =====

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

-- ===== app_status・出す額・来月に回す・元に戻す・人の設定・ひな形・ping（§8.3 の残り） =====

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
