-- 給料の入り先（S-33）と、出す割合を本人だけにする（2026-09-23 の決定）
-- 正本: docs/03_ui_spec.md §2.2・§6.2・§6.3 ケースN・§9.6 検算 V11、docs/04_data_model.md。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。
--
-- 0001〜0007 は本番に流し済みなので書き換えず、足りない分をここに足す（04 §11）。
--
-- 【この文書で決めたこと】
--  (1) 出す割合（contribution_rate）と給料の入り先（salary_to_joint）は **本人だけ** が変えられる。
--      守り方は `update_default_payer` と同じ **本人限定の RPC**（security definer）にそろえた。
--      列の grant では守らない: month_contributions と同じく household_members にも
--      update の grant を出していない（0003 §6.3 は select だけ）ので、端末は RPC 以外から
--      この2列を書けない。トリガーを足さないぶん、仕組みが1つで済む。
--  (2) 呼び名・色は今までどおり2人とも変えられる（相手の打ち間違いを直せるようにするため）。
--      `update_member` は相手の行に対しては呼び名と色だけを直す。
--  (3) 精算の計算は private.month_live() 1か所で直す。settle_confirm・settle_set_check・
--      app_status・month_summary は month_live と month_settlement_lines を通して新しい式になる。
--  (4) month_settlement_lines に列は足さない。共用に入った給料は、決めた月の
--      month_contributions（net_income・salary_to_joint。ロック中は決め直せない）から
--      `min(手取り, 出す額)` で出せるので、保存する値を増やさない。

-- ===== 1. 列を足す（04 §2.2・§2.6） =====

-- 人の設定: 給料の入り先（true = 共用口座、false = 自分の口座。既定は自分の口座）
alter table public.household_members
  add column if not exists salary_to_joint boolean not null default false;

-- 出す額: 決めた時点の給料の入り先（割合と同じスナップショット。あとで設定を変えても決めた月は動かない）
alter table public.month_contributions
  add column if not exists salary_to_joint boolean not null default false;

-- 列の grant。0003 §6.3 の grant はテーブル全体の select なので、足した列も読める。
-- ここで同じ grant をもう一度出して、読める列が増えたことをはっきりさせる（書き込みは RPC だけ）。
grant select on public.household_members   to authenticated;
grant select on public.month_contributions to authenticated;
-- RLS は 0003 の members_select・contributions_select をそのまま使う（行の見え方は変わらない）。

-- ===== 2. その月の計算（02 §3・仕様書 §6.2） =====

-- 共用に入った給料_i ＝ その月の給料の入り先が共用なら min(手取り_i, 出す額_i)、そうでなければ 0
--   精算額_i ＝ 出す額_i − 立替_i − 共用に入った給料_i
--   共用の過不足 ＝ Σ出す額 − 支出合計（給料の入り先では変わらない）
--   共用の月間収支（通帳の動き。S-20 の共用の行）
--     ＝ Σ手取り(共用に入る人) ＋ Σ(正の精算額) − 共用払い − Σ|負の精算額|
--     ＝ Σ手取り(共用に入る人) ＋ Σ精算額 − 共用払い
--     ＝ (Σ出す額 − 支出合計) ＋ Σ(手取り − 共用に入った給料)      ← 検算 V11（§9.6）
create or replace function private.month_live(p_household uuid, p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (
    select paid_by, amount from public.expenses
     where household_id = p_household and accounting_month = p_month
       and amount is not null and not skipped
  ), m as (
    select hm.user_id, hm.position, c.contribution, c.net_income,
           -- その月の給料の入り先: 決めた月は保存した値、決めていなければ人の設定（仕様書 §6.2）
           coalesce(c.salary_to_joint, hm.salary_to_joint) as salary_to_joint,
           -- 共用に入った給料。出す額が決まっていない月は 0
           case when c.contribution is null then 0
                when c.salary_to_joint then least(c.net_income, c.contribution)
                else 0 end::integer as joint_salary,
           coalesce((select sum(e.amount) from e where e.paid_by = hm.user_id), 0)::integer as advance,
           coalesce((select sum(sc.amount) from public.settlement_checks sc
                      where sc.household_id = p_household and sc.month = p_month
                        and sc.user_id = hm.user_id), 0)::integer as transferred
      from public.household_members hm
      left join public.month_contributions c
        on c.household_id = hm.household_id and c.month = p_month and c.user_id = hm.user_id
     where hm.household_id = p_household
  ), s as (
    select *,
           (contribution - advance - joint_salary) as settlement,
           -- 共用に入る人の手取り（その月に出す額を決めていない人は数えない。手取りが無いため）
           case when salary_to_joint then coalesce(net_income, 0) else 0 end::integer as salary_in
      from m
  )
  select jsonb_build_object(
    'members', (select jsonb_agg(jsonb_build_object(
                   'user_id', user_id, 'contribution', contribution, 'advance', advance,
                   'salary_to_joint', salary_to_joint, 'joint_salary', joint_salary,
                   'settlement', settlement, 'transferred', transferred,
                   'remaining', settlement - transferred) order by position) from s),
    'joint_paid',         (select coalesce(sum(amount), 0) from e where paid_by is null),
    'expense_total',      (select coalesce(sum(amount), 0) from e),
    'contribution_total', (select sum(contribution) from s),
    'joint_net',          (select sum(contribution) from s) - (select coalesce(sum(amount), 0) from e),
    -- 共用の通帳の動き。出す額が決まっていない人がいる月は sum() が NULL を飛ばすので、
    -- joint_net も joint_balance も「決めた人の分だけの部分和」が返る（null にはならない）。
    -- 端末側（frontend/src/domain/calc.ts settleModel）は同じ月に jointLedger を null にするので、返る形が違う。
    -- この RPC は今は端末から呼んでいないので、呼ぶ前にどちらかへそろえること（04 §8.2）。
    'salary_in',          (select coalesce(sum(salary_in), 0) from s),
    'salary_applied',     (select coalesce(sum(joint_salary), 0) from s),
    'salary_remainder',   (select coalesce(sum(salary_in) - sum(joint_salary), 0) from s),
    'has_salary_to_joint',(select bool_or(salary_to_joint) from s),
    'joint_balance',      (select coalesce(sum(salary_in), 0) + sum(settlement) from s)
                            - (select coalesce(sum(amount), 0) from e where paid_by is null),
    'pending_count',      (select count(*) from public.expenses
                            where household_id = p_household and accounting_month = p_month
                              and amount is null and not skipped)
  )
$$;

-- ===== 3. 出す額を決める（給料の入り先を月に控える） =====

-- 04 §8.3 の decide_contributions に、割合と同じ扱いで salary_to_joint を足したもの。
--   新しく作る行  : household_members のいまの値を写す
--   決めてある行  : 保存した値のまま（決め直しても動かない。割合と同じ）
-- 元に戻す控え（private.contribution_undo）は手取り・決めた人・時刻だけで今までどおり
-- （決め直しで割合と給料の入り先は変わらないので、戻す値も要らない）。
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
    select jsonb_object_agg(hm.user_id::text, 'null'::jsonb) into v_rows
      from public.household_members hm
     where hm.household_id = v_household
       and not exists (select 1 from public.month_contributions c
                        where c.household_id = v_household and c.month = v_month and c.user_id = hm.user_id);
    insert into public.month_contributions
      (household_id, month, user_id, net_income, contribution_rate, salary_to_joint, decided_by, decided_at)
    select v_household, v_month, hm.user_id, p.net_income, hm.contribution_rate, hm.salary_to_joint, v_uid, now()
      from public.household_members hm
      join public.month_contributions p
        on p.household_id = hm.household_id and p.month = v_prev and p.user_id = hm.user_id
     where hm.household_id = v_household
    on conflict (household_id, month, user_id) do nothing;
  else
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
      (household_id, month, user_id, net_income, contribution_rate, salary_to_joint, decided_by, decided_at)
    select v_household, v_month, hm.user_id, (x.value)::integer,
           hm.contribution_rate, hm.salary_to_joint, v_uid, now()
      from jsonb_each_text(p_net_incomes) x
      join public.household_members hm
        on hm.household_id = v_household and hm.user_id = (x.key)::uuid
    on conflict (household_id, month, user_id) do update
      set net_income        = excluded.net_income,
          contribution_rate = public.month_contributions.contribution_rate,  -- 決めてある月は保存した割合のまま
          salary_to_joint   = public.month_contributions.salary_to_joint,    -- 給料の入り先も保存した値のまま
          decided_by        = excluded.decided_by,
          decided_at        = excluded.decided_at;
  end if;
  insert into private.contribution_undo (household_id, month, decided_at, decided_by, rows)
  values (v_household, v_month, now(), v_uid, coalesce(v_rows, '{}'::jsonb))
  on conflict (household_id, month, decided_at) do update
    set rows = excluded.rows || private.contribution_undo.rows;
  return jsonb_build_object('result', 'ok', 'prev', jsonb_build_object('decided_at', now()));
end $$;

-- ===== 4. 人の設定（§2.2 の権限表） =====

-- 呼び名・色は2人とも、出す割合は本人だけ（2026-09-23 の決定）。
-- 相手の行に p_rate を渡しても出す割合は変えない。p_rate が null のときも今の値のまま。
create or replace function public.update_member(p_user_id uuid, p_display_name text, p_color text, p_rate smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_self      boolean := (p_user_id = v_uid);
begin
  if v_household is null or not private.is_member(v_household, p_user_id) then
    raise exception 'not_member';
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 100) then
    raise exception 'bad_rate';
  end if;
  update public.household_members
     set color = case when p_color = 'teal' then 'amber' else 'teal' end,
         updated_by = v_uid, updated_at = now()
   where household_id = v_household and user_id <> p_user_id and color = p_color;
  update public.household_members
     set display_name = p_display_name,
         color = p_color,
         -- 出す割合は本人の行だけ（相手の行では今の値のまま。仕様書 §2.2）
         contribution_rate = case when v_self then coalesce(p_rate, contribution_rate)
                                  else contribution_rate end,
         updated_by = v_uid, updated_at = now()
   where household_id = v_household and user_id = p_user_id;
  return jsonb_build_object('result', 'ok');
end $$;

-- 出す割合（S-33）。本人の行だけを直す（update_default_payer と同じ仕組み）
create or replace function public.update_contribution_rate(p_rate smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'bad_rate';
  end if;
  update public.household_members
     set contribution_rate = p_rate, updated_by = v_uid, updated_at = now()
   where user_id = v_uid;          -- 自分の行だけ（household_members_user_id_key で1行）
  if not found then raise exception 'not_member'; end if;
  return jsonb_build_object('result', 'ok', 'contribution_rate', p_rate);
end $$;

-- 給料の入り先（S-33）。本人の行だけを直す（update_default_payer と同じ仕組み）
create or replace function public.update_salary_to_joint(p_salary_to_joint boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if p_salary_to_joint is null then
    raise exception 'bad_salary_to_joint';
  end if;
  update public.household_members
     set salary_to_joint = p_salary_to_joint, updated_by = v_uid, updated_at = now()
   where user_id = v_uid;          -- 自分の行だけ（相手の入り先は変えられない）
  if not found then raise exception 'not_member'; end if;
  return jsonb_build_object('result', 'ok', 'salary_to_joint', p_salary_to_joint);
end $$;

-- ===== 5. month_summary（04 §8.2 の出力に 共用に入った給料 と 共用の通帳の動き を足す） =====

-- 0006 の注意書きはそのまま活きる:
--   【いまは端末からこの RPC を呼んでいない】画面に出す数字の正本は frontend/src/domain で、
--   端末は loadSnapshot() で読んだ行から自分で計算している。この関数は将来の取り替え先。
--   将来これを使うときは、金額待ちの並び（pending）を frontend の sortPending と同じ
--   「対象月の古い順 → fixed_cost_templates.created_at 順」にそろえること。

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
    -- 保存値から（振り込んでいるあいだに数字が動かない。仕様書 §6.1 の11）。
    -- 共用に入った給料は、決めた月の month_contributions（ロック中は決め直せない）から出す。
    select jsonb_agg(jsonb_build_object(
             'user_id', hm.user_id,
             'position', hm.position,
             'contribution', case when c.user_id is null then null else jsonb_build_object(
                 'net_income', c.net_income, 'rate', c.contribution_rate, 'amount', l.contribution,
                 'salary_to_joint', c.salary_to_joint,
                 'decided_by', c.decided_by, 'decided_at', c.decided_at) end,
             'previous_net_income', p.net_income,
             'salary_to_joint', coalesce(c.salary_to_joint, hm.salary_to_joint),
             'joint_salary', case when c.user_id is null then 0
                                  when c.salary_to_joint then least(c.net_income, l.contribution)
                                  else 0 end,
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
      'contribution_total', v_row.contribution_total, 'joint_net', v_row.joint_net)
      || (select jsonb_build_object(
            'salary_in',           coalesce(sum(x.salary_in), 0),
            'salary_applied',      coalesce(sum(x.joint_salary), 0),
            'salary_remainder',    coalesce(sum(x.salary_in) - sum(x.joint_salary), 0),
            'has_salary_to_joint', coalesce(bool_or(x.flag), false),
            'joint_balance',       coalesce(sum(x.salary_in), 0) + coalesce(sum(x.settlement), 0)
                                     - v_row.joint_paid)
            from (select (m ->> 'joint_salary')::integer     as joint_salary,
                         (m ->> 'settlement')::integer        as settlement,
                         (m ->> 'salary_to_joint')::boolean   as flag,
                         case when (m ->> 'salary_to_joint')::boolean
                              then coalesce((m -> 'contribution' ->> 'net_income')::integer, 0)
                              else 0 end                      as salary_in
                    from jsonb_array_elements(coalesce(v_members, '[]'::jsonb)) m) x);
  else
    -- いまの記録から（見込み・締め待ち・やり直し中）
    v_live := private.month_live(v_household, v_month);

    select jsonb_agg(jsonb_build_object(
             'user_id', hm.user_id,
             'position', hm.position,
             'contribution', case when c.user_id is null then null else jsonb_build_object(
                 'net_income', c.net_income, 'rate', c.contribution_rate, 'amount', c.contribution,
                 'salary_to_joint', c.salary_to_joint,
                 'decided_by', c.decided_by, 'decided_at', c.decided_at) end,
             'previous_net_income', p.net_income,
             'salary_to_joint', (x -> 'salary_to_joint'),
             'joint_salary',    (x ->> 'joint_salary')::integer,
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
      'joint_paid',          (v_live -> 'joint_paid'),
      'expense_total',       (v_live -> 'expense_total'),
      'contribution_total',  (v_live -> 'contribution_total'),
      'joint_net',           (v_live -> 'joint_net'),
      'salary_in',           (v_live -> 'salary_in'),
      'salary_applied',      (v_live -> 'salary_applied'),
      'salary_remainder',    (v_live -> 'salary_remainder'),
      'has_salary_to_joint', (v_live -> 'has_salary_to_joint'),
      'joint_balance',       (v_live -> 'joint_balance'));
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

-- ===== 6. 実行の権限（04 §8.3） =====

-- Supabase は public の関数を既定で PUBLIC（anon を含む）に許すので、まず外してから付ける
revoke execute on function public.update_contribution_rate(smallint) from public, anon;
revoke execute on function public.update_salary_to_joint(boolean)    from public, anon;
revoke execute on function public.update_member(uuid, text, text, smallint) from public, anon;
revoke execute on function public.decide_contributions(date, jsonb)  from public, anon;
revoke execute on function public.month_summary(date, boolean)       from public, anon;

grant execute on function public.update_contribution_rate(smallint),
                          public.update_salary_to_joint(boolean),
                          public.update_member(uuid, text, text, smallint),
                          public.decide_contributions(date, jsonb),
                          public.month_summary(date, boolean) to authenticated;

-- settle_confirm・settle_set_check・settle_reopen・app_status は本体を変えない。
-- 精算額は private.month_live() から来るので、この文書だけで新しい式になる。
