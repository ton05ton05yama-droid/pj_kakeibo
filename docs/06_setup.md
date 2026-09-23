# セットアップ手順（Supabase を作ってからやること）

- 版: 1.0（2026-09-23）
- 位置づけ: **まさと本人が手を動かすための手順書**。何を決めるかの正本は `docs/05_platform.md`（以下「05」）、データの正本は `docs/04_data_model.md`（以下「04」）、画面の正本は `docs/03_ui_spec.md`（以下「仕様書」）。この文書はそれらを「上から順にやる形」に並べ直したもので、決め事を新しく作らない。
- 前提: この Mac に Node 24 / pnpm 11 / Docker が入っている。GitHub は個人アカウント `ton05ton05yama-droid`（CLAUDE.md §4）。
- **まだ決まっていないこと**: 擬似メールのドメイン（05 §9）。手順2の前に決める。

かかる時間の目安: 30〜45分（ドメインを持っていれば）。

---

## 0. 先に決めること

| 決めること | 決め方 | 使うところ |
|---|---|---|
| **擬似メールのドメイン** | 自分が管理するドメインのサブドメイン（例 `kakeibo.example.jp`）。MX は要らない。`example.com`・`.test`・`.invalid` は Supabase に拒否される（05 §4 の2） | 手順3・手順7 |
| **使い始める月** | 家計を作った月。この月より前は選べなくなる（仕様書 §3.4）。ふつうは「今月」 | 手順5 |
| **最初のパスワード** | 2人分。8文字以上（12文字以上をすすめる）。あとで各自が S-34 で変える | 手順3 |

---

## 1. Supabase のプロジェクトを作る

1. <https://supabase.com> に GitHub（個人アカウント）でログインする。
2. **New project**。
   - Organization: 個人の Free のもの（無ければ作る）。
   - Name: `kakeibo`
   - Database Password: 強いものを自動生成し、**パスワード管理アプリに入れる**。リポジトリ・チャットに残さない（05 §2.2）。
   - Region: **Northeast Asia (Tokyo) `ap-northeast-1`**（05 §0）。
   - Plan: Free。
3. 作り終わるまで2〜3分待つ。

> Free は **1週間だれも触らないと一時停止**する（05 §3.1）。手順9 の `ping()` の呼び出しを設定するまでは、週に1回アプリを開く。

---

## 2. マイグレーションを流す

`supabase/migrations/` のファイルを **この順に** 流す。流し方は2つある。どちらでもよい。

### (a) ダッシュボードの SQL エディタ（かんたん。初回はこちら）

ダッシュボード → 左の **SQL Editor** → **New query** に、次のファイルの中身を **1つずつ、上から順に** 貼って **Run**。

| 順 | ファイル | 中身 |
|---:|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | スキーマとテーブル（04 §2） |
| 2 | `supabase/migrations/0002_functions.sql` | 所属と判定の関数（04 §5） |
| 3 | `supabase/migrations/0003_rls.sql` | RLS のポリシーと明示の grant（04 §6） |
| 4 | `supabase/migrations/0004_triggers.sql` | トリガー（04 §7） |
| 5 | `supabase/migrations/0005_rpc.sql` | RPC（04 §8.3） |
| 6 | `supabase/migrations/0006_rpc_month_summary.sql` | `month_summary`（04 §8.2 の形） |
| 7 | `supabase/migrations/0007_seed_categories.sql` | カテゴリ15件（04 §10・仕様書 §8） |

エラーが出たら、**そのファイルの途中で止まっている**。直してから次に進む（前のファイルを流し直す必要はない。どれも `create or replace` か `create table`）。

### (b) psql（何度もやるならこちら）

ダッシュボード → **Connect** → **Session pooler** の接続文字列を控える（パスワードは手順1のもの）。

```sh
cd /Users/yamaguchimasato/workspace/pj_kakeibo
export PGURL='postgresql://postgres.<ref>:<パスワード>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
for f in supabase/migrations/*.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -q "$PGURL" -f "$f" || break
done
```

> `PGURL` は **シェルの履歴とリポジトリに残さない**。`export` の行は `.env.local` などに書かず、その場で打つ（05 §2.2）。

### 流したあとの確かめ

SQL エディタで:

```sql
select count(*) from public.categories;                     -- → 15
select count(*) from pg_policies where schemaname = 'public';  -- → 19
select public.ping();                                       -- → 1
```

---

## 3. サインアップを止めて、2人のユーザーを作る

1. ダッシュボード → **Authentication** → **Sign In / Providers** → **Email**
   - **Allow new users to sign up** を **オフ**（サインアップは無効。05 §0）。
   - **Confirm email** はオフのままでよい（メールは届かない）。
   - Save。
2. **Authentication** → **Users** → **Add user** → **Create new user**
   - Email: `masato@<手順0で決めたドメイン>`
   - Password: 手順0で決めたまさとのパスワード
   - **Auto Confirm User** に **チェック**（05 §4 の3）
   - Create user
3. もう一度 **Add user** で `risako@<同じドメイン>`（りさこのパスワード。Auto Confirm にチェック）。
4. できた2行の **User UID**（UUID）を控える。次の手順で使う。

> ここで出たエラー「Signups not allowed」は、サインアップを止めたのに **Add user** ではなく別の口から作ったとき。必ず Users → Add user から作る（05 §8 U3）。

---

## 4. 家計と2人の初期データを入れる

SQL エディタで、`<masato_uid>`・`<risako_uid>` を手順3の UUID に、`2026-10-01` を手順0で決めた「使い始める月の1日」に置き換えて流す（04 §10）。

```sql
insert into public.households (id, start_month)
values (gen_random_uuid(), '2026-10-01')
returning id;     -- ← 出てきた id を下の <household_id> に入れる

insert into public.household_members
  (household_id, user_id, position, display_name, color, contribution_rate) values
  ('<household_id>', '<masato_uid>', 1, 'まさと', 'teal',  40),
  ('<household_id>', '<risako_uid>', 2, 'りさこ', 'amber', 40);

insert into public.profiles (user_id) values ('<masato_uid>'), ('<risako_uid>');
```

- 呼び名・色・出す割合は、あとからアプリの設定（S-33）で2人とも変えられる。
- 「記録の払った人」（`default_payer`）はここでは書かない。既定は「自分」で、本人が S-30 で変える（04 §10）。
- 確かめ: `select * from public.household_members;` が2行。

---

## 5. 毎月の支払いのひな形（任意。あとでアプリからも足せる）

家賃・光回線などは、アプリの **設定 → 毎月の支払い → 追加**（S-32）から入れるのがふつう。
入れた月から行が作られる（前の月にはさかのぼらない。04 §7）ので、**使い始める月のうちに入れる**。

---

## 6. 端末の設定（`.env.local`）

```sh
cd /Users/yamaguchimasato/workspace/pj_kakeibo/frontend
cp .env.example .env.local
```

`.env.local` に入れる値（ダッシュボード → **Project Settings**）:

| 変数 | どこから取るか |
|---|---|
| `VITE_SUPABASE_URL` | Project Settings → **Data API** → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project Settings → **API Keys** → **publishable**（旧 anon）キー |
| `VITE_AUTH_EMAIL_DOMAIN` | 手順0で決めたドメイン（`@` は入れない） |

- **secret key（service_role）は入れない**。ブラウザに出る値で、RLS を素通りする（05 §2.2）。
- `.env.local` は Git に入れない（`frontend/.gitignore` で除いてある）。

動かして確かめる:

```sh
pnpm install
pnpm dev
```

ブラウザで ID `masato` ＋ 手順3のパスワードでログインできれば通っている。
**3つの変数が空のままだと、Supabase につながず、仕様書 §9 の見本データで動く**（開発用）。

---

## 7. Vercel に出す

1. <https://vercel.com> に **個人の GitHub アカウント**でログインする（会社のアカウントで入らない。CLAUDE.md §4）。
2. **Add New → Project** → `ton05ton05yama-droid/pj_kakeibo` を Import。
3. 設定:
   - **Root Directory**: `frontend`
   - Framework Preset: **Vite**（自動で入る）
   - Build Command: `pnpm build` / Output Directory: `dist`（自動）
4. **Environment Variables** に手順6の3つを入れる（Production / Preview / Development の3つとも）。
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_AUTH_EMAIL_DOMAIN`
5. **Deploy**。

> **Hobby × private リポジトリは、コミットの作者が Vercel のオーナーのメールでないとデプロイが止まる**（05 §8 U6）。作者を変えるコミットを作らない。止まったら、Vercel の Settings → Git の **Ignored Build Step** ではなく、コミットの作者（`git log -1 --format='%ae %ce'`）を確かめる。

出たあと:

- Project Settings → **Domains** で URL を控える。2人に渡すのはこの URL・ID・最初のパスワード（05 §4 の7）。
- Supabase の **Authentication → URL Configuration → Site URL** に、この URL を入れる。

---

## 8. スマホに入れる（2人とも）

1. iPhone の **Safari** でその URL を開く。
2. ID とパスワードでログイン → S-02（はじめに）で呼び名を確かめる。
3. 共有ボタン → **ホーム画面に追加**（S-03 に案内がある）。
4. 追加したアイコンから開く（Safari のタブからではなく）。

---

## 9. 一時停止を防ぐ（任意。05 §3.1）

Free は1週間だれも触らないと止まる。2人が毎日使うなら要らないが、止めたくなければ外から `ping()` を叩く。

```sh
curl -s -X POST "<VITE_SUPABASE_URL>/rest/v1/rpc/ping" \
  -H "apikey: <publishable key>" -H "Content-Type: application/json" -d '{}'
# → 1
```

これを週1回動かす（GitHub Actions のスケジュール、または cron）。`ping()` はテーブルに触れないので、キーが漏れても家計のデータは出ない（04 §8.1）。

---

## 10. パスワードを忘れたとき（05 §4 の5）

メールは届かないので、オーナー（まさと）が手元から再設定する。**secret key を使うので、リポジトリにも `.env.local` にも置かず、その場で打つ。**

```sh
# ダッシュボード → Project Settings → API Keys → secret key（service_role）
read -s SUPABASE_SECRET_KEY
curl -s -X PUT "<VITE_SUPABASE_URL>/auth/v1/admin/users/<user_uid>" \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"<新しいパスワード>"}'
unset SUPABASE_SECRET_KEY
```

---

## 11. SQL を直したくなったら

1. `docs/04_data_model.md` を直す（04 が正本。CLAUDE.md §3）。
2. `supabase/migrations/` に**新しい番号のファイル**を足す（すでに流したファイルは書き換えない）。
3. ローカルで確かめる。

   ```sh
   bash supabase/tests/run.sh
   ```

   Docker で Supabase の Postgres を起動し、全マイグレーションを流して、仕様書 §9 の見本データで §9.6 の金額・§2.2 の権限・RPC の戻り値を確かめる（141件）。終わるとコンテナは消える（`KEEP=1` を付けると残る）。
4. 通ったら、手順2 の (a) か (b) で本番に流す。
