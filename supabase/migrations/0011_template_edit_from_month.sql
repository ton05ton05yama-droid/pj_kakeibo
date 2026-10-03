-- 毎月の支払いを直すときも「何月分から変えるか」を選べるようにする（2026-10-03 の決定）
-- 正本: docs/03_ui_spec.md S-32・S-35・§12.1 Q32・Q33、docs/04_data_model.md §2.9・§7・§8.3。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。
--
-- 0001〜0010 は本番に流し済みなので書き換えず、足りない分をここに足す（04 §11）。
--
-- 【この文書で決めたこと】
--  (1) 直すときは RPC `update_template` を使う。選んだ月（何月分から）より後の、もう作ってある行のうち
--      **手つかずの行だけ**を新しい値に書き換える（来月に回していない・金額を入れた人がいない・直されていない・
--      今月はなしでない）。精算中・精算済みの月の行には触れない。S-14 で個別に直した行はそのまま。
--  (2) 開始月より前の月を選んだら、開始月をその月まで広げ、その月から行を作る（ロックされていない月だけ）。
--  (3) 選んだ月から今月までにロック中の月があれば `blocked: locked`（追加のときの month_locked と同じ考え方）。
--  (4) 金額の種類（amount_kind）は直さない（仕様書 §12.1 Q33。やめて足し直す）。
--  (5) 書き換えた行は「直した」にしない（updated_by・updated_at・amount_set_by を付けない）。手つかずのまま。
--  (6) 元に戻すは RPC `undo_update_template`（変更した人が1分以内に、そのひな形の一番新しい履歴のときだけ）。
--      ひな形を前の値（開始月も）に戻し、その変更で作った行を消し、書き換えた行を前の値に戻し、履歴を消す。
--  (7) 履歴の値（before・after）に開始月（start_month）も入れる。開始月だけを広げた変更も履歴に残る。
--  (8) 0010 の「同じ人・1分以内・逆向きなら履歴を消す」は、古い端末の直接の update のために残す。

-- ===== 1. 履歴の値に開始月を入れる（04 §2.9） =====

create or replace function private.template_values(t public.fixed_cost_templates) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'name',        t.name,
    'category_id', t.category_id,
    'paid_by',     t.paid_by,
    'amount_kind', t.amount_kind,
    'amount',      t.amount,
    'start_month', t.start_month)
$$;

-- ===== 2. 履歴を書くトリガー（0010 を置き換える。04 §7） =====
--  kakeibo.change_from: update_template が選んだ「何月分から」（無ければ、まだ作っていない最初の月）
--  kakeibo.skip_history: undo_update_template が履歴を自分で消すあいだ、書かない
--  kakeibo.last_change_id: 足した履歴の id（update_template が戻り値に入れる）

create or replace function private.templates_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_before jsonb;
  v_after  jsonb;
  v_from   date;
  v_last   public.fixed_cost_template_changes;
  v_id     uuid;
begin
  if coalesce(current_setting('kakeibo.skip_history', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by, changed_at)
    values (new.household_id, new.id, 'add', new.start_month, null, private.template_values(new), new.created_by, new.created_at);
    return null;
  end if;

  -- 値（開始月を含む）を直した
  v_before := private.template_values(old);
  v_after  := private.template_values(new);
  if v_before is distinct from v_after then
    select * into v_last from public.fixed_cost_template_changes
     where template_id = new.id
     order by changed_at desc, id desc
     limit 1;
    if found and v_last.change = 'update'
       and v_last.changed_by is not distinct from v_uid
       and v_last.changed_at > now() - interval '1 minute'
       and v_last.before = v_after and v_last.after = v_before then
      delete from public.fixed_cost_template_changes where id = v_last.id;   -- 元に戻した（古い端末の直接の update）
    else
      v_from := nullif(current_setting('kakeibo.change_from', true), '')::date;
      if v_from is null then
        select coalesce((max(e.period_month) + interval '1 month')::date, new.start_month) into v_from
          from public.expenses e where e.fixed_cost_id = new.id;
      end if;
      insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by)
      values (new.household_id, new.id, 'update', v_from, v_before, v_after, v_uid)
      returning id into v_id;
      perform set_config('kakeibo.last_change_id', v_id::text, true);
    end if;
  end if;

  -- 支払いをやめた・やめるを取り消した（0010 と同じ）
  if old.end_month is null and new.end_month is not null then
    insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by)
    values (new.household_id, new.id, 'stop', new.end_month, private.template_values(new), null, v_uid);
  elsif old.end_month is not null and new.end_month is null then
    delete from public.fixed_cost_template_changes
     where id = (select c.id from public.fixed_cost_template_changes c
                  where c.template_id = new.id and c.change = 'stop'
                  order by c.changed_at desc, c.id desc limit 1);
  end if;
  return null;
end $$;

-- ===== 3. 記録のトリガー: ひな形の変更を行に写すあいだだけ、名前・カテゴリを書き換えられるようにする（0004 を置き換える。04 §7） =====

create or replace function private.expenses_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_apply boolean := coalesce(current_setting('kakeibo.template_apply', true), '') = 'on';
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
    if v_apply and old.fixed_cost_id is not null then
      -- update_template・undo_update_template が手つかずの行に新しい値を写す（名前・カテゴリ・払う人・金額だけ）。
      -- 「直した」にはしない（手つかずのまま）
      if new.fixed_cost_id    is distinct from old.fixed_cost_id
         or new.period_month  is distinct from old.period_month
         or new.spent_on      is distinct from old.spent_on
         or new.memo          is distinct from old.memo
         or new.skipped       is distinct from old.skipped
         or new.accounting_month is distinct from old.accounting_month then
        raise exception 'fixed_row_immutable';
      end if;
      new.amount_set_by := old.amount_set_by;
      new.amount_set_at := old.amount_set_at;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.updated_by := old.updated_by;
      new.updated_at := old.updated_at;
    else
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

-- ===== 4. ひな形を直す（04 §8.3） =====

create or replace function public.update_template(
  p_template_id uuid, p_name text, p_category_id text, p_paid_by uuid, p_amount integer, p_from_month date
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_today_m   date := private.month_of(private.jst_today());
  v_first     date;
  v_t         public.fixed_cost_templates;
  v_default   date;
  v_from      date;
  v_month     date;
  v_locked    date;
  v_amount    integer;
  v_start     date;
  v_rows      integer := 0;
  v_n         integer;
  v_change    uuid;
begin
  if v_household is null then raise exception 'not_member'; end if;
  select * into v_t from public.fixed_cost_templates
   where id = p_template_id and household_id = v_household
   for update;
  if not found then
    return jsonb_build_object('result', 'blocked', 'reason', 'not_found');
  end if;
  if p_paid_by is not null and not private.is_member(v_household, p_paid_by) then
    raise exception 'paid_by_not_member';
  end if;
  select start_month into v_first from public.households where id = v_household;

  -- 既定の月 ＝ まだ作っていない最初の月。範囲の外（null・家計を作った月より前・既定より後）は既定にする
  select coalesce((max(e.period_month) + interval '1 month')::date, v_t.start_month) into v_default
    from public.expenses e where e.fixed_cost_id = v_t.id;
  v_from := private.month_of(coalesce(p_from_month, v_default));
  if v_from < v_first or v_from > v_default then
    v_from := v_default;
  end if;

  -- 前の月から変えるときは、その月から今月までにロック中の月が無いこと（月ごとに鍵を取る）
  if v_from < v_default then
    v_month := v_from;
    while v_month <= v_today_m loop
      perform pg_advisory_xact_lock_shared(private.month_lock_key(v_household, v_month));
      if private.is_month_locked(v_household, v_month) then
        v_locked := v_month;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
    if v_locked is not null then
      return jsonb_build_object('result', 'blocked', 'reason', 'locked', 'month', v_locked);
    end if;
  end if;

  v_amount := case when v_t.amount_kind = 'fixed' then p_amount end;   -- 金額の種類は変えない（§12.1 Q33）
  v_start  := least(v_t.start_month, v_from);                          -- 前の月を選んだら開始月を広げる

  perform set_config('kakeibo.change_from', v_from::text, true);
  perform set_config('kakeibo.last_change_id', '', true);
  update public.fixed_cost_templates
     set name = btrim(p_name), category_id = p_category_id, paid_by = p_paid_by,
         amount = v_amount, start_month = v_start,
         updated_by = v_uid, updated_at = now()
   where id = v_t.id;
  v_change := nullif(current_setting('kakeibo.last_change_id', true), '')::uuid;
  perform set_config('kakeibo.change_from', '', true);
  perform set_config('kakeibo.last_change_id', '', true);
  if v_change is null then
    return jsonb_build_object('result', 'ok', 'from_month', v_from, 'rows', 0, 'change_id', null);  -- 何も変わっていない
  end if;

  -- もう作ってある行のうち、手つかずでロックされていない月の行を新しい値にする
  perform set_config('kakeibo.template_apply', 'on', true);
  update public.expenses e
     set name = btrim(p_name), category_id = p_category_id, paid_by = p_paid_by,
         amount = case when v_t.amount_kind = 'fixed' then v_amount else e.amount end
   where e.fixed_cost_id = v_t.id
     and e.period_month >= v_from
     and e.accounting_month = e.period_month
     and e.amount_set_by is null and e.updated_at is null and not e.skipped
     and not private.is_month_locked(e.household_id, e.accounting_month);
  get diagnostics v_rows = row_count;
  perform set_config('kakeibo.template_apply', 'off', true);

  -- 開始月を広げたら、その月から行を作る（ensure_month と同じ作り方。ロック中の月は作らない）
  if v_start < v_t.start_month then
    v_month := v_start;
    while v_month < v_t.start_month and v_month <= v_today_m loop
      if not private.is_month_locked(v_household, v_month) then
        insert into public.expenses
          (household_id, spent_on, accounting_month, period_month, category_id,
           amount, paid_by, fixed_cost_id, name, created_by)
        values (v_household, v_month, v_month, v_month, p_category_id,
                v_amount, p_paid_by, v_t.id, btrim(p_name), null)
        on conflict on constraint expenses_fixed_period_key do nothing;
        get diagnostics v_n = row_count;
        v_rows := v_rows + v_n;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end if;

  return jsonb_build_object('result', 'ok', 'from_month', v_from, 'rows', v_rows, 'change_id', v_change);
end $$;

-- ===== 5. 直したのを元に戻す（04 §8.3） =====

create or replace function public.undo_update_template(p_change_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_household uuid := private.my_household_id();
  v_today_m   date := private.month_of(private.jst_today());
  v_c         public.fixed_cost_template_changes;
  v_t         public.fixed_cost_templates;
  v_b         jsonb;
  v_start     date;
  v_month     date;
begin
  if v_household is null then raise exception 'not_member'; end if;
  select * into v_c from public.fixed_cost_template_changes
   where id = p_change_id and household_id = v_household;
  if not found then
    return jsonb_build_object('result', 'blocked', 'reason', 'not_found');
  end if;
  select * into v_t from public.fixed_cost_templates where id = v_c.template_id for update;
  if v_c.change <> 'update'
     or v_c.changed_by is distinct from v_uid
     or v_c.changed_at < now() - interval '1 minute'
     or exists (select 1 from public.fixed_cost_template_changes c
                 where c.template_id = v_c.template_id and c.id <> v_c.id
                   and (c.changed_at > v_c.changed_at or (c.changed_at = v_c.changed_at and c.id > v_c.id))) then
    return jsonb_build_object('result', 'blocked', 'reason', 'too_late');
  end if;

  -- 戻す月（その変更の「何月分から」から今月まで）にロック中の月があれば戻さない
  v_month := v_c.from_month;
  while v_month <= v_today_m loop
    perform pg_advisory_xact_lock_shared(private.month_lock_key(v_household, v_month));
    if private.is_month_locked(v_household, v_month) then
      return jsonb_build_object('result', 'blocked', 'reason', 'locked', 'month', v_month);
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  v_b     := v_c.before;
  v_start := coalesce((v_b ->> 'start_month')::date, v_t.start_month);

  -- その変更で作った行（戻す開始月より前で、手つかずのもの）を消す
  delete from public.expenses e
   where e.fixed_cost_id = v_t.id
     and e.period_month >= v_c.from_month and e.period_month < v_start
     and e.accounting_month = e.period_month
     and e.amount_set_by is null and e.updated_at is null and not e.skipped;

  -- 書き換えた行（手つかずのまま）を前の値に戻す
  perform set_config('kakeibo.template_apply', 'on', true);
  update public.expenses e
     set name = v_b ->> 'name', category_id = v_b ->> 'category_id', paid_by = (v_b ->> 'paid_by')::uuid,
         amount = case when v_t.amount_kind = 'fixed' then (v_b ->> 'amount')::integer else e.amount end
   where e.fixed_cost_id = v_t.id
     and e.period_month >= v_c.from_month
     and e.accounting_month = e.period_month
     and e.amount_set_by is null and e.updated_at is null and not e.skipped;
  perform set_config('kakeibo.template_apply', 'off', true);

  -- ひな形を前の値に戻し、履歴を消す（戻す更新では履歴を書かない）
  perform set_config('kakeibo.skip_history', 'on', true);
  update public.fixed_cost_templates
     set name = v_b ->> 'name', category_id = v_b ->> 'category_id', paid_by = (v_b ->> 'paid_by')::uuid,
         amount = (v_b ->> 'amount')::integer, start_month = v_start,
         updated_by = v_uid, updated_at = now()
   where id = v_t.id;
  perform set_config('kakeibo.skip_history', 'off', true);
  delete from public.fixed_cost_template_changes where id = v_c.id;
  return jsonb_build_object('result', 'ok');
end $$;

revoke execute on function public.update_template(uuid, text, text, uuid, integer, date) from public, anon;
revoke execute on function public.undo_update_template(uuid) from public, anon;
grant execute on function public.update_template(uuid, text, text, uuid, integer, date),
                          public.undo_update_template(uuid) to authenticated;
