-- どのマイグレーションまで流してあるかを確かめる（読むだけ。何も書き換えない）。
-- Supabase のダッシュボード → SQL Editor に貼って Run。applied が false の行から先を、番号順に流す（docs/06_setup.md 手順2）。
-- 0009 は関数の中身を置き換えるだけなので、中身にある決まった文で見分ける。
select no, file, applied from (values
  ('0001', '0001_schema.sql',            to_regclass('public.households') is not null),
  ('0002', '0002_functions.sql',         to_regprocedure('private.is_month_locked(uuid, date)') is not null),
  ('0003', '0003_rls.sql',               exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'templates_select')),
  ('0004', '0004_triggers.sql',          exists (select 1 from pg_trigger where tgname = 'templates_before_insert')),
  ('0005', '0005_rpc.sql',               to_regprocedure('public.app_status()') is not null),
  ('0006', '0006_rpc_month_summary.sql', to_regprocedure('public.month_summary(date, boolean)') is not null),
  ('0007', '0007_seed_categories.sql',   (select count(*) from public.categories) = 15),
  ('0008', '0008_salary_to_joint.sql',   exists (select 1 from information_schema.columns
                                                  where table_schema = 'public' and table_name = 'household_members'
                                                    and column_name = 'salary_to_joint')),
  ('0009', '0009_salary_redecide.sql',   coalesce(position('excluded.salary_to_joint' in
                                                  pg_get_functiondef(to_regprocedure('public.decide_contributions(date, jsonb)'))) > 0, false)),
  ('0010', '0010_template_start_and_history.sql', to_regclass('public.fixed_cost_template_changes') is not null)
) as m(no, file, applied)
order by no;
