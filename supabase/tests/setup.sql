-- 検証用データベースだけの仕掛け（04 §11「再現の手順」の手順3）。**本番には流さない**。
--   1. 「今日」を kakeibo.today で差し替えられるようにする（本番の関数は端末から今日を受け取らない）
--   2. 2人のユーザー（本番では Supabase のダッシュボードで作る）
--   3. 家計と人・プロフィール（04 §10 の初期データの <…> を置き換えたもの）
--   4. 期待値を確かめる関数 test.eq

create or replace function private.jst_today() returns date
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('kakeibo.today', true), '')::date,
                  (now() at time zone 'Asia/Tokyo')::date)
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'masato@kakeibo.example.jp', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'risako@kakeibo.example.jp', 'authenticated', 'authenticated');

-- 見本データの家計は 2026年8月から（仕様書 §9）
insert into public.households (id, start_month) values
  ('11111111-1111-1111-1111-111111111111', '2026-08-01');
insert into public.household_members (household_id, user_id, position, display_name, color, contribution_rate) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 1, 'まさと', 'teal',  40),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 2, 'りさこ', 'amber', 40);
insert into public.profiles (user_id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

create schema if not exists test;
create or replace function test.eq(p_label text, p_got anyelement, p_want anyelement) returns void
language plpgsql as $$
begin
  if p_got::text is distinct from p_want::text then
    raise exception 'NG  %  got=%  want=%', p_label, coalesce(p_got::text,'<null>'), coalesce(p_want::text,'<null>');
  end if;
  raise notice 'ok  %  = %', p_label, coalesce(p_got::text,'<null>');
end $$;

-- 例外になることを確かめる（SQL を流して、決めたエラーで止まれば ok）
create or replace function test.fails(p_label text, p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'NG  %  例外にならなかった（% を期待）', p_label, p_expect;
  end if;
  if position(p_expect in v_msg) = 0 then
    raise exception 'NG  %  got=%  want に % を含む', p_label, v_msg, p_expect;
  end if;
  raise notice 'ok  %  （% で止まった）', p_label, p_expect;
end $$;

grant usage on schema test to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;
