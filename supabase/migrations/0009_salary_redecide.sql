-- 出す額を決め直したとき、給料の入り先だけ今の設定を取り込む（2026-09-23 の決定）
-- 正本: docs/03_ui_spec.md S-21・§6.2・§11、docs/02_settlement.md §3、docs/04_data_model.md §2.6・§8.3。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。
--
-- 0001〜0008 は本番に流し済みなので書き換えず、足りない分をここに足す（04 §11）。
--
-- 【決めたこと】
--   出す割合（contribution_rate）は「これからこうする」という取り決めなので、決めた月の値を動かさない。
--   給料の入り先（salary_to_joint）は「その月の給料が実際にどこへ入ったか」という事実なので、
--   決め直したときは household_members のいまの値で上書きする。
--     新しく作る行  : いまの値を写す（0008 から変わらない）
--     決めてある行  : contribution_rate は保存した値のまま／salary_to_joint はいまの値で上書き
--
-- 【元に戻す（undo）】
--   上書きするようになったので、控え（private.contribution_undo.rows）に salary_to_joint を足し、
--   undo_decide_contributions で前の値に戻す。0008 までに控えた行にはこの鍵が無いので、
--   無いときは今の値のまま（coalesce）にして、古い控えでも止まらないようにする。

-- ===== 1. 出す額を決める（04 §8.3） =====

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
    -- ［この額で決める］: まだ決まっていない人だけを「先月の手取り × いまの割合・いまの入り先」で作る。
    -- 決めてある行には触れない（on conflict do nothing）ので、決め直しにはならない。
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
    -- 書き込む前の行: 手取りを送ってきた人（家計の人だけ）。
    -- 割合は控えない（決め直しで動かないため）。入り先は上書きするので控える。
    select jsonb_object_agg(hm.user_id::text,
             case when c.user_id is null then 'null'::jsonb
                  else jsonb_build_object('net_income', c.net_income,
                                          'salary_to_joint', c.salary_to_joint,
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
          contribution_rate = public.month_contributions.contribution_rate,  -- 取り決め: 保存した割合のまま
          salary_to_joint   = excluded.salary_to_joint,                      -- 事実: いまの設定で上書き
          decided_by        = excluded.decided_by,
          decided_at        = excluded.decided_at;
    -- 出す額（contribution）は生成列なので、手取りと保存した割合から計算し直される。
  end if;
  -- 控え。同じ取引で2回呼んだとき（now() が同じ）は、先に控えた前の値を残して足す（jsonb の || は右が勝つ）
  insert into private.contribution_undo (household_id, month, decided_at, decided_by, rows)
  values (v_household, v_month, now(), v_uid, coalesce(v_rows, '{}'::jsonb))
  on conflict (household_id, month, decided_at) do update
    set rows = excluded.rows || private.contribution_undo.rows;
  return jsonb_build_object('result', 'ok', 'prev', jsonb_build_object('decided_at', now()));
end $$;

-- ===== 2. 元に戻す（04 §8.3） =====

-- 0005 と同じで、違うのは戻す値に salary_to_joint を足したところだけ。
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
  -- 前の値がある人: 手取り・給料の入り先・決めた人・時刻を前の値に戻す（割合は動かないので戻さない）。
  -- 0008 までの控えには salary_to_joint が無いので、そのときは今の値のまま。
  update public.month_contributions c
     set net_income      = (x.value ->> 'net_income')::integer,
         salary_to_joint = coalesce((x.value ->> 'salary_to_joint')::boolean, c.salary_to_joint),
         decided_by      = (x.value ->> 'decided_by')::uuid,
         decided_at      = (x.value ->> 'decided_at')::timestamptz
    from jsonb_each(v_undo.rows) x
   where c.household_id = v_household and c.month = v_month
     and c.user_id = (x.key)::uuid and x.value <> 'null'::jsonb;
  delete from private.contribution_undo
   where household_id = v_household and month = v_month and decided_at = v_undo.decided_at;
  return jsonb_build_object('result', 'ok');
end $$;

-- ===== 3. 実行の権限（04 §8.3） =====

-- create or replace は権限を引き継ぐが、0005・0008 と同じ形でもう一度はっきりさせる。
revoke execute on function public.decide_contributions(date, jsonb)              from public, anon;
revoke execute on function public.undo_decide_contributions(date, timestamptz)   from public, anon;
grant execute on function public.decide_contributions(date, jsonb),
                          public.undo_decide_contributions(date, timestamptz) to authenticated;
