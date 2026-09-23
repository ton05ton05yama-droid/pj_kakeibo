-- トリガー（docs/04_data_model.md §7）
-- 正本: docs/04_data_model.md（この文書の SQL をそのまま実行順に分けたもの）。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。

-- ===== 記録・出す額・ひな形のトリガー（§7） =====

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
