-- 毎月の支払い: 何月分から記録するかを選べるようにし、ひな形の変更の履歴を残す（2026-10-03 の決定）
-- 正本: docs/03_ui_spec.md S-31・S-32・S-35・§12.1 Q29〜Q31、docs/04_data_model.md §2.4・§2.9・§6・§7・§8.3。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。
--
-- 0001〜0009 は本番に流し済みなので書き換えず、足りない分をここに足す（04 §11）。
--
-- 【この文書で決めたこと】
--  (1) 開始月（start_month）は端末の値を使う。ただし範囲の外（null・家計を作った月より前・今月より後）は
--      今月にする（古い端末が送る 2000-01-01 も今月になる）。「今日」は DB の時計（02 §10 C10 は変えない）。
--  (2) 開始月から今月までに精算中・精算済みの月があれば、追加させない（month_locked。detail は一番新しいロック中の月）。
--      開始月が今月なら今までどおり止めない（今月がロック中なら、その月の行が作られないだけ。来月から作る）。
--  (3) 履歴はトリガーだけが書く（端末は読むだけ）。値は「変更の後」と「変更の前」をそのまま持つ。
--  (4) 元に戻す（トーストの［元に戻す］）は、新しい履歴を足さずに、直前の履歴を消す。
--      見分け方: 同じひな形の一番新しい 'update' が、同じ人・1分以内で、ちょうど逆向きの変更のとき。
--      やめるの取り消し（end_month を null に戻す）は、一番新しい 'stop' を消す。
--  (5) 直したときの「何月分から」は、まだ作っていない最初の月（そのひな形の行の最後の対象月の翌月。行が無ければ開始月）。
--      stop_template の end_month と同じ決め方。

-- ===== 1. 履歴のテーブル（04 §2.9） =====

create table if not exists public.fixed_cost_template_changes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  template_id  uuid not null references public.fixed_cost_templates(id) on delete cascade,
  change       text not null check (change in ('add', 'update', 'stop')),
  from_month   date not null check (from_month = date_trunc('month', from_month)::date),  -- 何月分から
  before       jsonb,                                         -- 変更の前の値（add は null）
  after        jsonb,                                         -- 変更の後の値（stop は null）
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz not null default now(),
  check ((change = 'add') = (before is null)),
  check ((change = 'stop') = (after is null))
);
create index if not exists fixed_cost_template_changes_household_idx
  on public.fixed_cost_template_changes (household_id, changed_at desc);
create index if not exists fixed_cost_template_changes_template_idx
  on public.fixed_cost_template_changes (template_id, changed_at desc);

alter table public.fixed_cost_template_changes enable row level security;

-- 見るのは2人。書くのはトリガーだけ（insert・update・delete の grant は出さない）。
-- Supabase は新しい表に既定で全部の権限を出すので、0003 §6.3 と同じく先に全部外す
revoke all on public.fixed_cost_template_changes from anon, authenticated;
create policy template_changes_select on public.fixed_cost_template_changes for select to authenticated
  using (household_id in (select private.my_household_ids()));
grant select on public.fixed_cost_template_changes to authenticated;

-- ひな形の値（履歴の before・after の形）
create or replace function private.template_values(t public.fixed_cost_templates) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'name',        t.name,
    'category_id', t.category_id,
    'paid_by',     t.paid_by,
    'amount_kind', t.amount_kind,
    'amount',      t.amount)
$$;

revoke all on function private.template_values(public.fixed_cost_templates) from public;

-- ===== 2. 追加のとき: 開始月を確かめる（04 §7。0004 の templates_before_insert を置き換える） =====

create or replace function private.templates_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_today_month date := private.month_of(private.jst_today());
  v_first       date;
  v_month       date;
  v_locked      date;
begin
  select start_month into v_first from public.households where id = new.household_id;
  if new.start_month is null
     or new.start_month <> private.month_of(new.start_month)
     or new.start_month < v_first
     or new.start_month > v_today_month then
    new.start_month := v_today_month;
  end if;

  -- 前の月から始めるときは、今月までにロック中の月が無いこと（確定との競合を防ぐため、月ごとに鍵を取る）
  if new.start_month < v_today_month then
    v_month := new.start_month;
    while v_month <= v_today_month loop
      perform pg_advisory_xact_lock_shared(private.month_lock_key(new.household_id, v_month));
      if private.is_month_locked(new.household_id, v_month) then
        v_locked := v_month;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
    if v_locked is not null then
      raise exception 'month_locked' using detail = v_locked::text;
    end if;
  end if;

  new.created_at := now();   -- delete_template の「作ってから1分」を端末の値で延ばせないように
  return new;
end $$;

-- ===== 3. 履歴を書く（04 §7） =====

create or replace function private.templates_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_before jsonb;
  v_after  jsonb;
  v_from   date;
  v_last   public.fixed_cost_template_changes;
begin
  if tg_op = 'INSERT' then
    insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by, changed_at)
    values (new.household_id, new.id, 'add', new.start_month, null, private.template_values(new), new.created_by, new.created_at);
    return null;
  end if;

  -- 値を直した
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
      delete from public.fixed_cost_template_changes where id = v_last.id;   -- 元に戻した
    else
      select coalesce((max(e.period_month) + interval '1 month')::date, new.start_month) into v_from
        from public.expenses e where e.fixed_cost_id = new.id;
      insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by)
      values (new.household_id, new.id, 'update', v_from, v_before, v_after, v_uid);
    end if;
  end if;

  -- 支払いをやめた・やめるを取り消した
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

drop trigger if exists templates_after_write on public.fixed_cost_templates;
create trigger templates_after_write
  after insert or update on public.fixed_cost_templates
  for each row execute function private.templates_after_write();
revoke all on function private.templates_after_write() from public;

-- 既にあるひな形の「追加」を入れる（開始月・作った人・作った時刻はひな形のもの）
insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by, changed_at)
select t.household_id, t.id, 'add', t.start_month, null, private.template_values(t), t.created_by, t.created_at
  from public.fixed_cost_templates t
 where not exists (select 1 from public.fixed_cost_template_changes c where c.template_id = t.id);
-- 既にやめているひな形の「やめた」（時刻は最後に直した時刻）
insert into public.fixed_cost_template_changes (household_id, template_id, change, from_month, before, after, changed_by, changed_at)
select t.household_id, t.id, 'stop', t.end_month, private.template_values(t), null, t.updated_by, t.updated_at
  from public.fixed_cost_templates t
 where t.end_month is not null
   and not exists (select 1 from public.fixed_cost_template_changes c where c.template_id = t.id and c.change = 'stop');

-- ===== 4. 追加を元に戻す（04 §8.3。開始月から今月まで複数の月に行ができるため、条件を直す） =====

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
                   and (e.accounting_month <> e.period_month        -- 来月に回した
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
  delete from public.fixed_cost_templates where id = p_template_id and household_id = v_household;  -- 履歴も消える（on delete cascade）
  return jsonb_build_object('result', 'ok');
end $$;

-- ===== 5. 名前からの推測の語（仕様書 §8。通信に「WiFi」を足す。大文字・小文字は区別しない） =====

update public.categories
   set name_hints = array_append(name_hints, 'WiFi')
 where id = 'telecom' and not ('WiFi' = any (name_hints));
