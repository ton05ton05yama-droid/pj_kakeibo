-- 仕様書 §9.8 のシナリオを順に流し、§9.6 の金額と一致することを確かめる。
-- 「ログイン中の人」は 04 §11 の手順4（request.jwt.claim.sub ＋ set role authenticated）で真似る。
-- 確かめは postgres（reset role）で行う。

\set H   '11111111-1111-1111-1111-111111111111'
\set MA  '00000000-0000-0000-0000-00000000000a'
\set RI  '00000000-0000-0000-0000-00000000000b'
\set T1  '10000001-0000-4000-8000-000000000000'
\set T2  '10000002-0000-4000-8000-000000000000'
\set T3  '10000003-0000-4000-8000-000000000000'
\set T4  '10000004-0000-4000-8000-000000000000'
\set T5  '10000005-0000-4000-8000-000000000000'

\echo '### 8月: ひな形 → ensure_month → 出す額'
set kakeibo.today = '2026-08-01';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;

-- 仕様書 §9.2（すべて 2026-08-01 にまさとが作った）。start_month はトリガーが今日の月で入れる
insert into public.fixed_cost_templates (id, household_id, name, category_id, paid_by, amount_kind, amount) values
  (:'T1', :'H', '家賃',     'housing',       null,  'fixed',    85000),
  (:'T2', :'H', '光回線',   'telecom',       :'MA', 'fixed',     5500),
  (:'T3', :'H', '動画配信', 'entertainment', :'RI', 'fixed',     1590),
  (:'T4', :'H', '電気代',   'utilities',     null,  'variable',  null),
  (:'T5', :'H', 'ガス代',   'utilities',     :'MA', 'variable',  null);

select test.eq('ensure_month(8月) が作った行', public.ensure_month('2026-08-01'), 5);
select test.eq('ensure_month(8月) の2回目は0件', public.ensure_month('2026-08-01'), 0);
select test.eq('8月 出す額 まさと', public.decide_contributions('2026-08-01', jsonb_build_object(:'MA', 295000)) ->> 'result', 'ok');
reset role;

select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
set kakeibo.today = '2026-08-02';
select test.eq('8月 出す額 りさこ', public.decide_contributions('2026-08-01', jsonb_build_object(:'RI', 230000)) ->> 'result', 'ok');
reset role;

select test.eq('8月の出す額（まさと）', (select contribution from public.month_contributions where month='2026-08-01' and user_id=:'MA'), 118000);
select test.eq('8月の出す額（りさこ）', (select contribution from public.month_contributions where month='2026-08-01' and user_id=:'RI'), 92000);

\echo '### 8月〜9/22 の手入力の記録（管理者で入れる）'
set kakeibo.upto = '2026-09-22 23:59:59+09';
\i /tests/sample_expenses.sql
select test.eq('8月の記録の件数', (select count(*)::int from public.expenses where accounting_month='2026-08-01'), 23);

\echo '### 8/24 まさとが ガス代（8月分）に 4,380 を入れる'
set kakeibo.today = '2026-08-24';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
update public.expenses set amount = 4380 where fixed_cost_id = :'T5' and period_month = '2026-08-01';
reset role;
select test.eq('金額を入れた人', (select amount_set_by from public.expenses where fixed_cost_id=:'T5' and period_month='2026-08-01'), :'MA'::uuid);

\echo '### 9/1 9月分を作り、電気代（8月分）を来月に回し、8月を精算する'
set kakeibo.today = '2026-09-01';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('ensure_month(9月) が作った行', public.ensure_month('2026-09-01'), 5);
select test.eq('電気代（8月分）を来月に回す',
  public.defer_expense((select id from public.expenses where fixed_cost_id=:'T4' and period_month='2026-08-01'), '2026-08-01') ->> 'accounting_month',
  '2026-09-01');
select test.eq('8月を精算する', public.settle_confirm('2026-08-01') ->> 'result', 'ok');
reset role;

select test.eq('8月 支出合計',  (select expense_total      from public.month_settlements where month='2026-08-01'), 255890);
select test.eq('8月 共用払い',  (select joint_paid         from public.month_settlements where month='2026-08-01'), 134020);
select test.eq('8月 出す額合計',(select contribution_total from public.month_settlements where month='2026-08-01'), 210000);
select test.eq('8月 共用の収支',(select joint_net          from public.month_settlements where month='2026-08-01'), -45890);
select test.eq('8月 まさと もう払った分', (select advance from public.month_settlement_lines where month='2026-08-01' and user_id=:'MA'), 24940);
select test.eq('8月 りさこ もう払った分', (select advance from public.month_settlement_lines where month='2026-08-01' and user_id=:'RI'), 96930);
select test.eq('8月 まさと 動かす額',     (select settlement from public.month_settlement_lines where month='2026-08-01' and user_id=:'MA'), 93060);
select test.eq('8月 りさこ 動かす額',     (select settlement from public.month_settlement_lines where month='2026-08-01' and user_id=:'RI'), -4930);

\echo '### 9/1 20:30 まさとが［入れた］ / 9/2 8:15 りさこが［受け取った］'
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('まさとのチェック', public.settle_set_check('2026-08-01', :'MA', true) ->> 'status', 'confirmed');
reset role;
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
set kakeibo.today = '2026-09-02';
select test.eq('りさこのチェックで精算済み', public.settle_set_check('2026-08-01', :'RI', true) ->> 'status', 'settled');
reset role;
select test.eq('8月の状態', private.month_status(:'H', '2026-08-01'), 'settled');

\echo '### 9月: 出す額（まさと 9/1・りさこ 9/3）と 9/10 の 電気代（8月分）9,840'
set kakeibo.today = '2026-09-01';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('9月 出す額 まさと', public.decide_contributions('2026-09-01', jsonb_build_object(:'MA', 300000)) ->> 'result', 'ok');
reset role;
set kakeibo.today = '2026-09-03';
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('9月 出す額 りさこ', public.decide_contributions('2026-09-01', jsonb_build_object(:'RI', 220000)) ->> 'result', 'ok');
set kakeibo.today = '2026-09-10';
update public.expenses set amount = 9840 where fixed_cost_id = :'T4' and period_month = '2026-08-01';
reset role;
select test.eq('9月の出す額（まさと）', (select contribution from public.month_contributions where month='2026-09-01' and user_id=:'MA'), 120000);
select test.eq('9月の出す額（りさこ）', (select contribution from public.month_contributions where month='2026-09-01' and user_id=:'RI'), 88000);

\echo '### sep-open（9/22。見込み。金額待ち2件は入らない）'
set kakeibo.today = '2026-09-22';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
create temp table sum_open as select public.month_summary('2026-09-01') as j;
select test.eq('sep-open 支出合計',        (select (j->'joint'->>'expense_total')::int from sum_open), 180670);
select test.eq('sep-open 共用払い',        (select (j->'joint'->>'joint_paid')::int from sum_open), 133040);
select test.eq('sep-open 共用の収支',      (select (j->'joint'->>'joint_net')::int from sum_open), 27330);
select test.eq('sep-open まさと もう払った分', (select (j->'members'->0->>'advance')::int from sum_open), 29160);
select test.eq('sep-open りさこ もう払った分', (select (j->'members'->1->>'advance')::int from sum_open), 18470);
select test.eq('sep-open まさと 動かす額', (select (j->'members'->0->>'settlement')::int from sum_open), 90840);
select test.eq('sep-open りさこ 動かす額', (select (j->'members'->1->>'settlement')::int from sum_open), 69530);
select test.eq('sep-open 金額待ち',        (select (j->'pending'->>'count')::int from sum_open), 2);
select test.eq('sep-open S-20 の状態',     (select j->>'view_state' from sum_open), 'estimate');
select test.eq('sep-open 月の状態',        (select j->>'status' from sum_open), 'open');
select test.eq('sep-open 止まる理由',      (select j->'blocker'->>'reason' from sum_open), 'pending');
select test.eq('sep-open 先月の手取り（まさと）', (select (j->'members'->0->>'previous_net_income')::int from sum_open), 295000);
select test.eq('［この月を精算する］を押すと prep',
  (select public.month_summary('2026-09-01', true) ->> 'view_state'), 'prep');
select test.eq('sep-open の赤い点（9月はまだ終わっていないので出さない）',
  (public.app_status() ->> 'badge')::boolean, false);
select test.eq('sep-open の精算タブの既定の月', public.app_status() ->> 'settle_default_month', '2026-09-01');
reset role;

\echo '### 月の途中の精算（仕様書 §12.1 Q2。04 §11 の確かめたこと）'
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('金額待ちが残っていれば止まる', public.settle_confirm('2026-09-01') ->> 'reason', 'pending');
select test.eq('今月より先の月は止まる',       public.settle_confirm('2026-10-01') ->> 'reason', 'future_month');
-- 来月に回すは、月の途中でもできる（month_not_ended は返らない）
select test.eq('9月の金額待ちを来月に回す',
  public.defer_expense((select id from public.expenses where fixed_cost_id=:'T5' and period_month='2026-09-01'), '2026-09-01') ->> 'accounting_month',
  '2026-10-01');
select test.eq('来月に回すを元に戻す',
  public.defer_expense((select id from public.expenses where fixed_cost_id=:'T5' and period_month='2026-09-01'), '2026-10-01', true) ->> 'accounting_month',
  '2026-09-01');
-- 2件とも［今月はなし］にして、月の途中に精算する
update public.expenses set skipped = true
 where accounting_month = '2026-09-01' and amount is null;
select test.eq('片付けたら ready', public.month_summary('2026-09-01', true) ->> 'view_state', 'ready');
select test.eq('精算のモードでなければ見込みのまま', public.month_summary('2026-09-01', false) ->> 'view_state', 'estimate');
select test.eq('月の途中でも精算できる', public.settle_confirm('2026-09-01') ->> 'result', 'ok');
reset role;
select test.eq('月の途中の精算 まさと 動かす額', (select settlement from public.month_settlement_lines where month='2026-09-01' and user_id=:'MA'), 90840);
select test.eq('月の途中の精算 りさこ 動かす額', (select settlement from public.month_settlement_lines where month='2026-09-01' and user_id=:'RI'), 69530);
select test.eq('月の途中の精算 共用の収支', (select joint_net from public.month_settlements where month='2026-09-01'), 27330);
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('月の途中に精算しても赤い点は出ない', (public.app_status() ->> 'badge')::boolean, false);
select test.eq('精算をやり直す', public.settle_reopen('2026-09-01') ->> 'result', 'ok');
reset role;
select test.eq('やり直したら月の状態は open に戻る', private.month_status(:'H', '2026-09-01'), 'open');
-- 検証だけの後始末（月の途中の精算をなかったことにして、仕様書 §9.8 の続きに戻す）
delete from public.month_settlements where month = '2026-09-01';
update public.expenses set skipped = false where accounting_month = '2026-09-01' and amount is null;
select test.eq('後始末のあと 9月に精算の行は無い', (select count(*)::int from public.month_settlements where month='2026-09-01'), 0);

\echo '### sep-prep（10/1 20:00。9/23〜9/30 の記録を足し、10月分を作る）'
set kakeibo.upto = '2026-10-01 00:00:00+09';
\i /tests/sample_expenses.sql
set kakeibo.today = '2026-10-01';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('ensure_month(10月) が作った行', public.ensure_month('2026-10-01'), 5);
create temp table sum_prep as select public.month_summary('2026-09-01') as j;
select test.eq('sep-prep 支出合計（参考値）', (select (j->'joint'->>'expense_total')::int from sum_prep), 199930);
select test.eq('sep-prep 共用払い（参考値）', (select (j->'joint'->>'joint_paid')::int from sum_prep), 146550);
select test.eq('sep-prep まさと もう払った分', (select (j->'members'->0->>'advance')::int from sum_prep), 31310);
select test.eq('sep-prep りさこ もう払った分', (select (j->'members'->1->>'advance')::int from sum_prep), 22070);
select test.eq('sep-prep S-20 の状態', (select j->>'view_state' from sum_prep), 'prep');
select test.eq('sep-prep 月の状態',   (select j->>'status' from sum_prep), 'closing');
select test.eq('sep-prep 金額待ちの件数', (select (j->'pending'->>'count')::int from sum_prep), 2);
select test.eq('sep-prep 金額待ちの1件目（個人 → 共用の順）', (select j->'pending'->'items'->0->>'name' from sum_prep), 'ガス代');
select test.eq('sep-prep の赤い点', (public.app_status() ->> 'badge')::boolean, true);
select test.eq('sep-prep のお知らせ行', public.app_status() -> 'notice' ->> 'kind', 'closing');
select test.eq('sep-prep のお知らせ行の月', public.app_status() -> 'notice' ->> 'month', '2026-09-01');
reset role;
select test.eq('10月の毎月の支払いの合計',
  (select sum(amount)::int from public.expenses where accounting_month='2026-10-01' and amount is not null), 92090);

\echo '### sep-ready（10/1 20:40 ガス代 6,200 → 20:41 電気代（9月分）を来月に回す）'
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
update public.expenses set amount = 6200 where fixed_cost_id = :'T5' and period_month = '2026-09-01';
select test.eq('電気代（9月分）を来月に回す',
  public.defer_expense((select id from public.expenses where fixed_cost_id=:'T4' and period_month='2026-09-01'), '2026-09-01') ->> 'accounting_month',
  '2026-10-01');
create temp table sum_ready as select public.month_summary('2026-09-01') as j;
select test.eq('sep-ready 支出合計',   (select (j->'joint'->>'expense_total')::int from sum_ready), 206130);
select test.eq('sep-ready 共用払い',   (select (j->'joint'->>'joint_paid')::int from sum_ready), 146550);
select test.eq('sep-ready 共用の収支', (select (j->'joint'->>'joint_net')::int from sum_ready), 1870);
select test.eq('sep-ready まさと もう払った分', (select (j->'members'->0->>'advance')::int from sum_ready), 37510);
select test.eq('sep-ready りさこ もう払った分', (select (j->'members'->1->>'advance')::int from sum_ready), 22070);
select test.eq('sep-ready まさと 動かす額', (select (j->'members'->0->>'settlement')::int from sum_ready), 82490);
select test.eq('sep-ready りさこ 動かす額', (select (j->'members'->1->>'settlement')::int from sum_ready), 65930);
select test.eq('sep-ready S-20 の状態', (select j->>'view_state' from sum_ready), 'ready');
select test.eq('sep-ready 止まる理由なし', (select j->'blocker' from sum_ready), 'null'::jsonb);
select test.eq('10月の金額待ち', (select (public.month_summary('2026-10-01') -> 'pending' ->> 'count')::int), 3);
reset role;

\echo '### 給料の入り先（仕様書 §6.2・§6.3 ケースN・§9.6 検算 V11。04 §11 の確かめたこと）'
-- (1) 見本データの既定（2人とも「自分の口座」）では、今までの月の数字が変わらない（回帰）
create temp table live_default as select private.month_live(:'H', '2026-09-01') as j;
select test.eq('既定 共用の過不足（Σ出す額 − 支出合計）', (select (j->>'joint_net')::int from live_default), 1870);
select test.eq('既定 共用の通帳の動き',     (select (j->>'joint_balance')::int from live_default), 1870);
select test.eq('既定 共用に入った給料の合計', (select (j->>'salary_applied')::int from live_default), 0);
select test.eq('既定 給料の残り',           (select (j->>'salary_remainder')::int from live_default), 0);
select test.eq('既定 共用に入る人がいるか', (select (j->>'has_salary_to_joint')::boolean from live_default), false);
select test.eq('既定 まさと 動かす額', (select (j->'members'->0->>'settlement')::int from live_default), 82490);
select test.eq('既定 りさこ 動かす額', (select (j->'members'->1->>'settlement')::int from live_default), 65930);

-- (2) りさこの給料が共用に入る月（仕様書 §6.3 ケースN）
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('りさこが給料の入り先を共用にする', public.update_salary_to_joint(true) ->> 'salary_to_joint', 'true');
select test.eq('9月を決め直す（決めてある行）', public.decide_contributions('2026-09-01', jsonb_build_object(:'RI', 220000)) ->> 'result', 'ok');
reset role;
-- 決め直すと、給料の入り先だけいまの設定を取り込む（事実。2026-09-23 の決定。04 §2.6）
select test.eq('決め直すと決めた月の入り先はいまの設定になる',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'RI'), true);
-- 割合は取り決めなので、決め直しても保存した値のまま
select test.eq('決め直しても決めた月の割合は 40% のまま',
  (select contribution_rate from public.month_contributions where month='2026-09-01' and user_id=:'RI')::int, 40);
select test.eq('9月の入り先（りさこ）', (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'RI'), true);
select test.eq('9月の出す額（りさこ）は変わらない', (select contribution from public.month_contributions where month='2026-09-01' and user_id=:'RI'), 88000);
create temp table live_n as select private.month_live(:'H', '2026-09-01') as j;
select test.eq('ケースN まさと 共用に入った給料', (select (j->'members'->0->>'joint_salary')::int from live_n), 0);
select test.eq('ケースN まさと 動かす額',         (select (j->'members'->0->>'settlement')::int from live_n), 82490);
select test.eq('ケースN りさこ 共用に入った給料', (select (j->'members'->1->>'joint_salary')::int from live_n), 88000);
select test.eq('ケースN りさこ 動かす額（共用から受け取る）', (select (j->'members'->1->>'settlement')::int from live_n), -22070);
select test.eq('ケースN 共用に入る給料',   (select (j->>'salary_in')::int from live_n), 220000);
select test.eq('ケースN 給料の残り',       (select (j->>'salary_remainder')::int from live_n), 132000);
select test.eq('ケースN 共用の過不足',     (select (j->>'joint_net')::int from live_n), 1870);
select test.eq('ケースN 共用に残る額',     (select (j->>'joint_balance')::int from live_n), 133870);
select test.eq('ケースN 共用に入る人がいる', (select (j->>'has_salary_to_joint')::boolean from live_n), true);
select test.eq('検算 V11（共用の通帳の動き ＝ 共用の過不足 ＋ 給料の残り）',
  (select (j->>'joint_balance')::int from live_n),
  (select (j->>'joint_net')::int + (j->>'salary_remainder')::int from live_n));

-- (3) 設定を戻しただけでは決めた月は動かない。動くのは決め直したとき（2026-09-23 の決定）
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('りさこが入り先を自分の口座に戻す', public.update_salary_to_joint(false) ->> 'salary_to_joint', 'false');
reset role;
select test.eq('人の設定は自分の口座に戻った', (select salary_to_joint from public.household_members where user_id=:'RI'), false);
select test.eq('決め直していない月の入り先は共用のまま',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'RI'), true);
select test.eq('決め直していない月の動かす額も変わらない（りさこ）',
  (private.month_live(:'H', '2026-09-01') -> 'members' -> 1 ->> 'settlement')::int, -22070);
-- 決め直すと、いまの設定（自分の口座）になり、動かす額も戻る
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('戻したあとに9月を決め直す', public.decide_contributions('2026-09-01', jsonb_build_object(:'RI', 220000)) ->> 'result', 'ok');
reset role;
select test.eq('決め直した月の入り先は自分の口座',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'RI'), false);
select test.eq('決め直した月の割合は 40% のまま',
  (select contribution_rate from public.month_contributions where month='2026-09-01' and user_id=:'RI')::int, 40);
select test.eq('決め直した月の動かす額（りさこ）',
  (private.month_live(:'H', '2026-09-01') -> 'members' -> 1 ->> 'settlement')::int, 65930);
-- ケースN に戻す（設定を共用にしてから決め直す。以降は共用のまま進む）
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('りさこが入り先を共用に戻す', public.update_salary_to_joint(true) ->> 'salary_to_joint', 'true');
select test.eq('もう一度9月を決め直す', public.decide_contributions('2026-09-01', jsonb_build_object(:'RI', 220000)) ->> 'result', 'ok');
reset role;
select test.eq('決めた月の入り先は共用に戻った', (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'RI'), true);
select test.eq('ケースN の動かす額（りさこ）',
  (private.month_live(:'H', '2026-09-01') -> 'members' -> 1 ->> 'settlement')::int, -22070);

-- (4) 出す割合・給料の入り先は本人だけ（仕様書 §2.2。2026-09-23）
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('りさこが update_member でまさとの割合を送っても ok は返る',
  public.update_member(:'MA', 'まさと', 'teal', 99::smallint) ->> 'result', 'ok');
select test.eq('りさこが自分の割合を変える', (public.update_contribution_rate(45::smallint) ->> 'contribution_rate')::int, 45);
select test.eq('りさこが自分の入り先を変える', (public.update_salary_to_joint(true) ->> 'salary_to_joint')::boolean, true);
select test.fails('給料の入り先も直接書けない',
  $$update public.household_members set salary_to_joint = true$$, 'permission denied');
select test.fails('割合は 0〜100 だけ',        $$select public.update_contribution_rate(101::smallint)$$, 'bad_rate');
select test.fails('割合に null は渡せない',    $$select public.update_contribution_rate(null::smallint)$$, 'bad_rate');
select test.fails('入り先に null は渡せない',  $$select public.update_salary_to_joint(null::boolean)$$, 'bad_salary_to_joint');
select test.fails('update_member の割合も 0〜100 だけ',
  $$select public.update_member('00000000-0000-0000-0000-00000000000b', 'りさこ', 'amber', 101::smallint)$$, 'bad_rate');
reset role;
select test.eq('まさとの割合は 40 のまま',       (select contribution_rate from public.household_members where user_id=:'MA')::int, 40);
select test.eq('まさとの入り先は自分の口座のまま', (select salary_to_joint from public.household_members where user_id=:'MA'), false);
select test.eq('変わったのはりさこの行だけ（割合）',   (select contribution_rate from public.household_members where user_id=:'RI')::int, 45);
select test.eq('変わったのはりさこの行だけ（入り先）', (select salary_to_joint from public.household_members where user_id=:'RI'), true);

-- (5) 精算したあと（ロック中）も同じ式で出る。決めたときに保存した値で固まる（仕様書 §6.1 の11・§6.3 ケースN）
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('ケースN のまま9月を精算する', public.settle_confirm('2026-09-01') ->> 'result', 'ok');
create temp table sum_n as select public.month_summary('2026-09-01') as j;
reset role;
select test.eq('ロック後 支出合計',   (select (j->'joint'->>'expense_total')::int from sum_n), 206130);
select test.eq('ロック後 共用払い',   (select (j->'joint'->>'joint_paid')::int from sum_n), 146550);
select test.eq('ロック後 共用に入る給料',         (select (j->'joint'->>'salary_in')::int from sum_n), 220000);
select test.eq('ロック後 共用に入った給料の合計', (select (j->'joint'->>'salary_applied')::int from sum_n), 88000);
select test.eq('ロック後 給料の残り',             (select (j->'joint'->>'salary_remainder')::int from sum_n), 132000);
select test.eq('ロック後 共用の過不足',           (select (j->'joint'->>'joint_net')::int from sum_n), 1870);
select test.eq('ロック後 共用に残る額',           (select (j->'joint'->>'joint_balance')::int from sum_n), 133870);
select test.eq('ロック後 共用に入る人がいる',     (select (j->'joint'->>'has_salary_to_joint')::boolean from sum_n), true);
select test.eq('検算 V11（ロック後も 共用に残る額 ＝ 共用の過不足 ＋ 給料の残り）',
  (select (j->'joint'->>'joint_balance')::int from sum_n),
  (select (j->'joint'->>'joint_net')::int + (j->'joint'->>'salary_remainder')::int from sum_n));
select test.eq('ロック後 まさと 共用に入った給料', (select (j->'members'->0->>'joint_salary')::int from sum_n), 0);
select test.eq('ロック後 まさと 動かす額',         (select (j->'members'->0->>'settlement')::int from sum_n), 82490);
select test.eq('ロック後 りさこ 共用に入った給料', (select (j->'members'->1->>'joint_salary')::int from sum_n), 88000);
select test.eq('ロック後 りさこ 動かす額（共用から受け取る）', (select (j->'members'->1->>'settlement')::int from sum_n), -22070);
-- ロックしたあとに人の設定を戻しても、精算中の月の数字は動かない（月ごとの保存）
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('ロック中に入り先を自分の口座に戻す', public.update_salary_to_joint(false) ->> 'salary_to_joint', 'false');
select test.eq('戻しても精算中の 共用に残る額は動かない',
  (public.month_summary('2026-09-01') -> 'joint' ->> 'joint_balance')::int, 133870);
reset role;
-- 検証だけの後始末（ケースN の精算をなかったことにして、回を 1 に戻す）
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('ケースN の精算をやり直す', public.settle_reopen('2026-09-01') ->> 'result', 'ok');
reset role;
delete from public.month_settlements where month = '2026-09-01';
select test.eq('ケースN のあと 9月に精算の行は無い', (select count(*)::int from public.month_settlements where month='2026-09-01'), 0);

-- 検証だけの後始末（見本データの既定に戻して、§9.8 の続き〈sep-transfer〉に入る）
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select public.update_contribution_rate(40::smallint);
select public.update_salary_to_joint(false);
reset role;
update public.month_contributions set salary_to_joint = false where month = '2026-09-01';
create temp table live_back as select private.month_live(:'H', '2026-09-01') as j;
select test.eq('後始末のあと まさと 動かす額', (select (j->'members'->0->>'settlement')::int from live_back), 82490);
select test.eq('後始末のあと りさこ 動かす額', (select (j->'members'->1->>'settlement')::int from live_back), 65930);
select test.eq('後始末のあと 共用の通帳の動き', (select (j->>'joint_balance')::int from live_back), 1870);
select test.eq('後始末のあと りさこの割合', (select contribution_rate from public.household_members where user_id=:'RI')::int, 40);

\echo '### sep-transfer（10/1 21:00 ［この金額で精算］）'
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('9月を精算する', public.settle_confirm('2026-09-01') ->> 'result', 'ok');
select test.eq('回', (public.month_summary('2026-09-01') ->> 'round')::int, 1);
select test.eq('sep-transfer S-20 の状態', public.month_summary('2026-09-01') ->> 'view_state', 'transfer');
select test.eq('sep-transfer のお知らせ行（まさと）', public.app_status() -> 'notice' ->> 'kind', 'transfer');
select test.eq('sep-transfer のお知らせ行の額（まさと）', (public.app_status() -> 'notice' ->> 'amount')::int, 82490);
select test.eq('sep-transfer のお知らせ行の向き（まさと）', public.app_status() -> 'notice' ->> 'direction', 'in');
reset role;
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('sep-transfer のお知らせ行の額（りさこ）', (public.app_status() -> 'notice' ->> 'amount')::int, 65930);
reset role;
select test.eq('精算中は記録を足せない（month_locked）', (select 1), 1);
select test.fails('精算中の月には記録を足せない',
  $$insert into public.expenses (household_id, spent_on, accounting_month, category_id, amount, paid_by, created_by)
    values ('11111111-1111-1111-1111-111111111111','2026-09-15','2026-09-01','dining',1000,null,'00000000-0000-0000-0000-00000000000a')$$,
  'month_locked');

\echo '### sep-transfer-half（10/2 9:10）→ sep-settled（10/2 12:30）'
set kakeibo.today = '2026-10-02';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('まさとの［入れた］', public.settle_set_check('2026-09-01', :'MA', true) ->> 'status', 'confirmed');
select test.eq('チェックしたまさとには赤い点が出ない', (public.app_status() ->> 'badge')::boolean, false);
reset role;
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
select test.eq('まだのりさこには赤い点が出る', (public.app_status() ->> 'badge')::boolean, true);
select test.eq('りさこの［入れた］で精算済み', public.settle_set_check('2026-09-01', :'RI', true) ->> 'status', 'settled');
select test.eq('sep-settled で赤い点は消える', (public.app_status() ->> 'badge')::boolean, false);
select test.eq('sep-settled の既定の月', public.app_status() ->> 'settle_default_month', '2026-10-01');
reset role;
select test.eq('sep-settled 月の状態', private.month_status(:'H','2026-09-01'), 'settled');

\echo '### sep-redo（10/3 20:05 やり直す → 20:10 s28 を記録）'
set kakeibo.today = '2026-10-03';
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('精算をやり直す', public.settle_reopen('2026-09-01') ->> 'result', 'ok');
insert into public.expenses (household_id, id, spent_on, accounting_month, category_id, amount, paid_by, memo, created_by)
  values (:'H', 'bbbb0028-0000-4000-8000-000000000000', '2026-09-28', '2026-09-01', 'household_goods', 3300, :'MA', 'ハンガー', :'MA');
create temp table sum_redo as select public.month_summary('2026-09-01') as j;
select test.eq('sep-redo 支出合計',   (select (j->'joint'->>'expense_total')::int from sum_redo), 209430);
select test.eq('sep-redo 共用の収支', (select (j->'joint'->>'joint_net')::int from sum_redo), -1430);
select test.eq('sep-redo まさと もう払った分', (select (j->'members'->0->>'advance')::int from sum_redo), 40810);
select test.eq('sep-redo まさと 動かす額',     (select (j->'members'->0->>'settlement')::int from sum_redo), 79190);
select test.eq('sep-redo まさと 済んだ分',     (select (j->'members'->0->>'transferred')::int from sum_redo), 82490);
select test.eq('sep-redo まさと 残り',         (select (j->'members'->0->>'remaining')::int from sum_redo), -3300);
select test.eq('sep-redo まさと 向き',         (select j->'members'->0->>'direction' from sum_redo), 'out');
select test.eq('sep-redo りさこ 動かす額',     (select (j->'members'->1->>'settlement')::int from sum_redo), 65930);
select test.eq('sep-redo りさこ 残り',         (select (j->'members'->1->>'remaining')::int from sum_redo), 0);
select test.eq('sep-redo りさこ 向き',         (select j->'members'->1->>'direction' from sum_redo), 'none');
select test.eq('sep-redo S-20 の状態', (select j->>'view_state' from sum_redo), 'redo');
select test.eq('sep-redo の赤い点', (public.app_status() ->> 'badge')::boolean, true);
select test.eq('sep-redo のお知らせ行', public.app_status() -> 'notice' ->> 'kind', 'closing');
reset role;

\echo '### RLS（仕様書 §2.2 の権限表）'
select set_config('request.jwt.claim.sub', :'RI', false);
set role authenticated;
with u as (update public.expenses set amount = 1 where id = 'bbbb0022-0000-4000-8000-000000000000' returning 1)
select test.eq('りさこはまさとの記録を直せない', (select count(*)::int from u), 0);
with d as (delete from public.expenses where id = 'bbbb0022-0000-4000-8000-000000000000' returning 1)
select test.eq('りさこはまさとの記録を消せない', (select count(*)::int from d), 0);
with d as (delete from public.expenses where fixed_cost_id is not null and accounting_month = '2026-10-01' returning 1)
select test.eq('毎月の支払いの行はだれも消せない', (select count(*)::int from d), 0);
select test.fails('他人名義では足せない',
  $$insert into public.expenses (household_id, spent_on, accounting_month, category_id, amount, paid_by, created_by)
    values ('11111111-1111-1111-1111-111111111111','2026-10-02','2026-10-01','dining',1000,null,'00000000-0000-0000-0000-00000000000a')$$,
  'row-level security');
select test.fails('毎月の支払いの行は直接足せない',
  $$insert into public.expenses (household_id, spent_on, accounting_month, period_month, category_id, amount, paid_by, fixed_cost_id, name, created_by)
    values ('11111111-1111-1111-1111-111111111111','2026-11-01','2026-11-01','2026-11-01','housing',85000,null,'10000001-0000-4000-8000-000000000000','家賃',null)$$,
  'row-level security');
select test.fails('毎月の支払いの行のカテゴリは変えられない',
  $$update public.expenses set category_id = 'dining' where fixed_cost_id is not null and accounting_month = '2026-10-01'$$,
  'fixed_row_immutable');
select test.fails('日付を動かして精算済みの月に入れられない',
  $$update public.expenses set spent_on = '2026-08-15' where id = 'bbbb0024-0000-4000-8000-000000000000'$$,
  'month_locked');
select test.fails('出す額は直接書けない',
  $$update public.month_contributions set net_income = 1$$, 'permission denied');
select test.fails('人の設定は直接書けない',
  $$update public.household_members set contribution_rate = 99$$, 'permission denied');
select test.fails('元に戻すための控えは読めない',
  $$select count(*) from private.contribution_undo$$, 'permission denied');
reset role;

set role anon;
select test.fails('anon は記録を読めない', $$select count(*) from public.expenses$$, 'permission denied');
select test.fails('anon は app_status を呼べない', $$select public.app_status()$$, 'permission denied');
select test.fails('anon は month_summary を呼べない', $$select public.month_summary('2026-09-01')$$, 'permission denied');
select test.eq('anon は ping だけ呼べる', public.ping(), 1);
reset role;

\echo '### 記録の既定の払った人（仕様書 §12.1 Q3。04 §11 の確かめたこと）'
select test.eq('いる行の既定は self',
  (select count(*)::int from public.household_members where default_payer = 'self'), 2);
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('まさとが共用にする', public.update_default_payer('joint') ->> 'default_payer', 'joint');
select test.fails('self・joint 以外は止まる', $$select public.update_default_payer('other')$$, 'bad_default_payer');
select test.eq('呼び名・色・割合を直しても既定は変わらない',
  public.update_member(:'MA', 'まさと', 'amber', 50::smallint) ->> 'result', 'ok');
reset role;
select test.eq('まさとの既定', (select default_payer from public.household_members where user_id=:'MA'), 'joint');
select test.eq('りさこの既定は変わらない', (select default_payer from public.household_members where user_id=:'RI'), 'self');
select test.eq('色は入れ替わる（まさと amber → りさこ teal）',
  (select color from public.household_members where user_id=:'RI'), 'teal');
-- 見本データの色に戻す
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select public.update_member(:'MA', 'まさと', 'teal', 40::smallint);
select public.update_default_payer('self');
reset role;

\echo '### 出す額の決め直しと元に戻す（割合は保存した値のまま・入り先はいまの設定）'
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select public.update_member(:'MA', 'まさと', 'teal', 50::smallint);
select test.eq('まさとが入り先を共用にする', public.update_salary_to_joint(true) ->> 'salary_to_joint', 'true');
select test.eq('9月を決め直す', public.decide_contributions('2026-09-01', jsonb_build_object(:'MA', 310000)) ->> 'result', 'ok');
reset role;
select test.eq('決め直しても割合は保存した40%のまま',
  (select contribution_rate from public.month_contributions where month='2026-09-01' and user_id=:'MA')::int, 40);
select test.eq('決め直すと入り先はいまの設定（共用）になる',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'MA'), true);
select test.eq('決め直した出す額', (select contribution from public.month_contributions where month='2026-09-01' and user_id=:'MA'), 124000);
-- 元に戻すと、手取りだけでなく前の入り先にも戻る
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('まさとが入り先を自分の口座に戻す', public.update_salary_to_joint(false) ->> 'salary_to_joint', 'false');
create temp table undo1 as select public.decide_contributions('2026-09-01', jsonb_build_object(:'MA', 999999)) as j;
reset role;
select test.eq('もう一度決め直すと入り先も自分の口座になる',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'MA'), false);
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('元に戻す', public.undo_decide_contributions('2026-09-01',
  (select (j->'prev'->>'decided_at')::timestamptz from undo1)) ->> 'result', 'ok');
select test.eq('2回目は戻せない', public.undo_decide_contributions('2026-09-01',
  (select (j->'prev'->>'decided_at')::timestamptz from undo1)) ->> 'reason', 'changed');
select public.update_member(:'MA', 'まさと', 'teal', 40::smallint);
reset role;
select test.eq('戻したあとの手取り', (select net_income from public.month_contributions where month='2026-09-01' and user_id=:'MA'), 310000);
select test.eq('戻したあとの入り先は前の値（共用）',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'MA'), true);
select test.eq('戻したあとも割合は 40% のまま',
  (select contribution_rate from public.month_contributions where month='2026-09-01' and user_id=:'MA')::int, 40);
-- 見本データの既定（自分の口座）に戻す。決め直しでいまの設定（false）が入る
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('既定に戻すため9月を決め直す', public.decide_contributions('2026-09-01', jsonb_build_object(:'MA', 310000)) ->> 'result', 'ok');
reset role;
select test.eq('まさとの入り先は自分の口座に戻った',
  (select salary_to_joint from public.month_contributions where month='2026-09-01' and user_id=:'MA'), false);

\echo '### 毎月の支払いをやめる・追加を元に戻す'
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select test.eq('動画配信をやめる（10月分があるので11月から）',
  public.stop_template(:'T3') ->> 'end_month', '2026-11-01');
select test.eq('やめるを取り消す', public.stop_template(:'T3', true) ->> 'result', 'ok');
insert into public.fixed_cost_templates (id, household_id, name, category_id, paid_by, amount_kind, amount)
  values ('10000006-0000-4000-8000-000000000000', :'H', '保険', 'insurance', null, 'fixed', 3000);
select test.eq('追加した月は DB の今日の月',
  (select start_month from public.fixed_cost_templates where id='10000006-0000-4000-8000-000000000000'), '2026-10-01'::date);
select test.eq('追加を元に戻す', public.delete_template('10000006-0000-4000-8000-000000000000') ->> 'result', 'ok');
select test.eq('2回目は消せない', public.delete_template('10000006-0000-4000-8000-000000000000') ->> 'reason', 'not_found');
reset role;
