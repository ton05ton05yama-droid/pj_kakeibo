# 実装基盤（Supabase・Vercel・iOS・Git）

- 版: 1.3（2026-09-23。ユーザーの決定〈仕様書 §12.1 Q9〉で **呼び名・ログインID・アプリ名が確定した**（まさと `masato` ／ りさこ `risako` ／「ふたりの家計簿」）ので §4・§9 P4 を直し、§5.3 のモックの公開版に未反映のものへ「月の途中でも精算できる」〈§12.1 Q2〉を足した。1.2 は同日、§5.3 に設定の「記録の払った人」〈仕様書 §12.1 Q3〉を足したもの。1.1 は同日、記録タブ化・S-04・カテゴリ15個が未反映であることを書き足したもの。1.0 は 2026-09-22）
- 位置づけ: どこで動かし、どう守り、どう運用するかの決定事項と手順。根拠（一次情報・確認日）は `docs/research/platform.md`（以下「調査」）にあり、ここでは決めたことと手順だけを書く。
- 調査 §7.1 は Git の設定を変える前の状態の記録。**実施後の状態はこの文書の §7**。
- まだ Supabase のプロジェクトも Vercel のプロジェクトも作っていない（2026-09-22 時点）。作ったら §3.6・§5.3 に実際の値（URL など。キーは書かない）を足す。

---

## 1. 採用構成と理由

| レイヤ | 採用 | 理由 |
|---|---|---|
| ホスティング | Vercel Hobby に**静的 SPA** として置く（全パスを `/index.html` へ rewrite） | ログイン必須で SEO が要らない。Functions をほぼ使わないので Hobby の枠を気にしなくてよい（調査 §4.1） |
| フロント | **Vite + React + TypeScript + Chakra UI v3 + TanStack Query** | 参考UI（pj_income_visualization）のトークンと部品が Chakra 依存で移しやすい。SSR の利点が小さく、`@supabase/ssr` と Proxy まわりの落とし穴を避けられる（調査 §5.2） |
| Supabase クライアント | `@supabase/supabase-js` だけ | SPA なので `@supabase/ssr` は要らない（調査 §5.1） |
| DB・認可 | Supabase Free（東京 `ap-northeast-1`）。ブラウザから直接読み書きし、**RLS** で守る | サーバー層を置かない。家計・所属・`private.my_household_ids()`（security definer）の公式の推奨パターン（`docs/04_data_model.md`） |
| 認証 | メール＋パスワード。**新規サインアップ OFF**、2ユーザーをダッシュボードで手動作成。画面は「ID」入力 → 自前ドメインの擬似メールに変換（§4） | Supabase Auth にユーザー名ログインは無い。example / test ドメインは拒否される（調査 §2.1） |
| 判定・確定 | DB の関数（RPC）。cron に頼らず、開いたときに判定する | 2台で同じ結果にする。Hobby の Cron は1日1回で時刻もずれる（調査 §4.2） |
| 同期 | リアルタイム同期は使わない。開き直し・タブの選び直しで取り直す | 仕様書 §6.3 ケースJ |
| テーマ | ライトだけ（参考UIと同じく `ChakraProvider` に `forcedTheme='light'`）。CSS 変数（仕様書 §7.1）→ Chakra の `semanticTokens`（`_dark` は定義しない） | 仕様書 §3.9・§7.1 |

ルーター（TanStack Router か React Router）は未選定（調査 §5.2 の対象外）。

---

## 2. リポジトリとローカル開発

### 2.1 置き場所（予定）

```
pj_kakeibo/
├── README.md / CLAUDE.md
├── docs/                 仕様・設計（01〜05、research/）
├── mock/                 UI の正本のモック（mock/index.html、1ファイル・ビルド無し）
├── src/                  アプリ（Vite + React）          ← これから
├── public/               manifest・アイコン               ← これから
├── supabase/migrations/  04 の SQL を分けたもの           ← これから
└── vercel.json           SPA の rewrite                    ← これから
```

### 2.2 環境変数

| 名前 | 置き場所 | 中身 |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel（Production・Preview）、手元の `.env.local` | プロジェクトの URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 同上 | publishable key（`sb_publishable_…`）。ブラウザに出てよい |
| `VITE_AUTH_EMAIL_DOMAIN` | 同上 | ID を擬似メールに変えるときのドメイン（§4） |
| secret key（`sb_secret_…`） | **オーナーの手元だけ**（パスワード再設定のスクリプトを動かすとき） | リポジトリ・Vercel・ブラウザに置かない |
| DB の接続文字列 | バックアップを動かす場所だけ（§3.2） | リポジトリに置かない |

- `.gitignore` で `.env` と `.env.*` を除外済み（`.env.example` だけは入れてよい）。
- `VITE_` で始まる変数はビルドに埋め込まれてブラウザに届く。secret をこの名前で置かない。

---

## 3. Supabase Free の制約と対策

### 3.1 一時停止（直近1週間の DB 活動が乏しいと止まる）

- 止まるとアプリが使えない。データは停止後 1年は復元できる（公式の現行の記述。調査 §1.2）。再開はダッシュボードでプロジェクトを開いて Resume。
- 2人が毎日使えばふつうは止まらないが、旅行などで1週間使わないことはある。**外部から1日1回、DB に届く呼び出しをする。**
  - 呼ぶのは RPC `ping()`（`select 1`。テーブルに触れず、`anon` で呼べる唯一の関数。`docs/04_data_model.md` §8.1）。
  - 案A（推奨）: GitHub Actions の `schedule` で1日1回 `POST {URL}/rest/v1/rpc/ping`（ヘッダー `apikey: <publishable key>`）。private リポジトリなので Actions の無料枠（2,000分/月）から1回1分未満を使う。60日無活動で止まる自動無効化は public リポジトリだけ（調査 §1.2）。
  - 案B: Vercel Cron（Hobby は1日1回・UTC・±59分）から `api/keepalive.ts` を呼ぶ。Functions を1本足すことになる。
  - `select 1` の RPC で「活動」と数えられるかは公式に書かれていない（Auth の health エンドポイントは Postgres に届かないので効かないという報告はある）。pg_cron だけに頼らない（調査 U1）。
- Resume の手順と、止まったことに気づく方法（アプリが開けない）を2人で共有しておく。

### 3.2 バックアップ（Free は自動バックアップ無し）

- 公式の推奨どおり `supabase db dump` で定期的に書き出す（調査 §1.3）。週1回を目安にする。
  - `supabase db dump --db-url "$DB_URL" -f schema.sql` と `supabase db dump --db-url "$DB_URL" --data-only -f data.sql`
  - `auth`・`storage`・拡張のスキーマは含まれない。別のプロジェクトへ戻すときは2人のユーザーを作り直し、新しい UUID に `household_members`・`expenses.created_by`・`paid_by` などを付け替える（2人なので UPDATE で足りる）。
- どこで動かし、どこに置くかは未決（§9）。候補: (a) オーナーの Mac で手動か launchd、(b) GitHub Actions で動かし、暗号化してから private な場所へ。家計のデータなので、平文でリポジトリにコミットしない。

### 3.3 キー

- ブラウザには **publishable key** だけを置く。旧 `anon` / `service_role` キーは 2026年末までに廃止予定なので、最初から新しいキーを使う（調査 §2.1）。
- secret key はブラウザで使えない（User-Agent で判定されて 401）。パスワードの再設定など管理の操作は、オーナーの手元のスクリプトからだけ行う（§4）。
- publishable key が漏れても、RLS と明示の grant で `anon` は `ping()` 以外なにもできない（`docs/04_data_model.md` §6.3）。

### 3.4 Data API の明示 grant

- public スキーマの新しいテーブルは自動では Data API に公開されない（2026-05-30 以降に作るプロジェクトの既定。既存プロジェクトも 2026-10-30 から）。**マイグレーションに grant を必ず書く**（`docs/04_data_model.md` §6.3）。grant は「テーブルに触れるか」、RLS は「どの行が見えるか」で、別の層。
- Settings → API → Exposed schemas は `public` のまま。`private` を加えない。

### 3.5 そのほかの上限

| 項目 | Free の上限 | このアプリでは |
|---|---|---|
| DB サイズ | 500 MB（超えると read-only） | 年に数 MB（調査 §1.1 の見積り） |
| アクティブなプロジェクト | 2件 | 個人アカウントに既存のプロジェクトがあるか確かめる（§8 U12） |
| ログ | 1日 | 障害はすぐ調べる |
| 漏洩パスワード検知 | Pro 以上 | 長めのパスフレーズを使う |
| セッション | 無期限（時間制限は Pro 以上）。JWT は1時間 | 再ログインはまれ。ただし iOS の Safari のタブでは7日で消えることがある（§6） |
| Data API の Max rows | 既定 1000（Dashboard の API Settings で変えられる） | 1回の読み込み（`loadSnapshot`）で `.limit(5000)` を明示し、Dashboard でも 5000 にする。返った件数が上限と同じなら読み切れていないので「データが多すぎます（読み切れませんでした）」で止める（ページングは入れていない） |

### 3.6 プロジェクトを作るときの設定

| 設定 | 値 |
|---|---|
| アカウント | 個人（ton05ton05yama-droid の GitHub か gmail で登録）。会社の組織に作らない |
| リージョン | 東京 `ap-northeast-1`（作った後に変えられるかは未確認。調査 U11） |
| Authentication → Sign In / Providers → Allow new users to sign up | **OFF** |
| Email provider → Confirm email | ON のままでよい（ユーザーは Auto Confirm で作る） |
| Secure password change | **OFF**（ON だと 24時間後に届かないメールへ確認コードが送られ、パスワードを変えられなくなる。仕様書 S-34） |
| API keys | publishable key と secret key を発行し、旧キーは使わない |
| Exposed schemas | `public`（既定のまま） |
| 拡張 | 要らない（pg_cron は使わない） |

---

## 4. ID 風ログイン

1. **画面**: 「ID」と「パスワード」だけ（仕様書 S-01）。ID `masato` → `masato@<VITE_AUTH_EMAIL_DOMAIN>` に変えて `signInWithPassword`。DB で ID からメールを引かない（ID の有無を探られない）。
2. **ドメイン**: `example.com` や `.test` は Supabase に拒否される。自分が管理するドメインのサブドメイン（例 `kakeibo.<自分のドメイン>`）を使う。MX は要らない（メールは届かない前提）。自分のドメインが無いときの代わり（gmail の `+` エイリアス）は、Supabase が受け付けるか未確認（調査 §2.2、U4）。**どのドメインにするかは未決**（§9）。
3. **ユーザーを作る**（オーナーが1回だけ）: ダッシュボード → Authentication → Users → Add user → Create new user、**Auto Confirm User** にチェック。2人分（`masato@…`、`risako@…`。ID は 2026-09-23 に確定した。仕様書 §12.1 Q9）。サインアップ OFF のままで作れるかは作るときに確かめる（U3）。
4. **家計と人の行を入れる**: SQL エディタで `docs/04_data_model.md` §10 の初期データ（家計・2人・プロフィール）。`display_name` は「まさと」「りさこ」（仕様書 §9.1・§12.1 Q9）。呼び名・割合は `household_members` に持ち、`user_metadata` に頼らない（Auto Confirm で上書きされる不具合がある）。
5. **パスワードを忘れたとき**: メールは届かないので、オーナーが手元のスクリプトから `auth.admin.updateUserById`（secret key）で再設定する。ブラウザにこの機能は置かない（仕様書 S-01 の注記「忘れたときは まさとが再設定します」）。
6. **ログイン中のパスワード変更**: `supabase.auth.updateUser({ password })`（S-34）。8文字以上、12文字以上をすすめる。
7. **最初に渡すもの**: URL・ID・最初のパスワード（仕様書 §5 (g)）。パスワードはチャットに残さない方法で渡し、S-34 で変えてもらう。

---

## 5. Vercel Hobby

### 5.1 条件

- 個人の非商用に限る。2人の家計簿で決済・広告・受託は無いので範囲内と解釈している（最終判断は Vercel。調査 §4.1）。
- **private リポジトリのコミットは、コミット作者 ＝ Hobby チームのオーナーでないとデプロイが止まる。** 作者のメール（`ton05.ton05.yama@gmail.com`）が GitHub で**確認済み**で、Vercel のログイン連携の GitHub アカウント（ton05ton05yama-droid）と一致していること。`a+b@…` と `a@…` は別人扱い（調査 §4.3）。
- GitHub の Organization 配下の private リポジトリは Hobby にデプロイできない。個人アカウント配下に置く（済み）。
- Claude Code のコミットには `Co-Authored-By: Claude …` の行が付く。Hobby でこれが止める理由になるかは公式に書かれていない（止まったという投稿はあるが、原因は別だったという Vercel の回答もある）。**初回デプロイで確かめる**（U6）。

### 5.2 設定

- Vercel には **ton05ton05yama-droid の GitHub でログインして** Hobby を作る。ブラウザの GitHub が会社のアカウントでログイン中なら、シークレットウィンドウか、GitHub からログアウトしてから。
- Vercel GitHub App は個人アカウントに入れ、対象は「Only select repositories」で `pj_kakeibo` だけ。
- Vercel アカウントのメールにも gmail を足して確認しておく。
- `vercel.json` に SPA の rewrite（すべてのパス → `/index.html`）。フレームワークは Vite、出力は `dist`。
- 環境変数は §2.2 の `VITE_` の3つ。
- Functions は使わない（一時停止対策を案B にしたときだけ `api/keepalive.ts` の1本）。

### 5.3 公開 URL

- 本番: （初回デプロイ後に書く）
- モックの公開版（Artifact）: https://claude.ai/artifact/N3jt4vwZnXuhPVCc9hsakz（2026-09-22 公開。記録タブ化・月を選ぶシート〈S-04〉・カテゴリ15個・設定の「記録の払った人」・**月の途中でも精算できる〈S-20 の［この月を精算する］〉**・**呼び名「りさこ」／ ID `risako`**〈いずれも 2026-09-23〉・日付選択の「リセット」で今日に戻す〈仕様書 §12.1 Q28。2026-10-03〉・毎月の支払いの開始月と変更の履歴〈同 Q29〜Q31。2026-10-03〉は未反映。`README.md` と `mock/README.md` にも同じ URL）

---

## 6. PWA・iOS の注意点

| こと | 決め | 根拠 |
|---|---|---|
| ホーム画面に追加 | manifest（`name`・`short_name`・192px と 512px のアイコン・maskable・`display: standalone`・`start_url`・`theme_color`）と `apple-touch-icon` を置く。iOS 26 はホーム画面に追加すると既定で Web アプリとして開く | 調査 §6.1 |
| 追加の案内 | Safari のタブで開いているとき（`display-mode: standalone` でないとき）だけ S-02・S-30 に「ホーム画面に追加」を出す | 仕様書 S-03 |
| ログインの持ち越し | Safari のタブとホーム画面の Web アプリでストレージを共有するかは未確認。「ホーム画面から開くと、もう一度ログインが要ることがあります」と S-03 に書いておく | 調査 §6.4、仕様書 §12.2 Q18 |
| 7日ルール | Safari のタブで7日操作しないと localStorage などが消え、ログアウトされる。ホーム画面の Web アプリは独自に数える。`navigator.storage.persist()` を要求する | 調査 §6.4 |
| 入力欄の拡大 | 入力欄は 16px 以上。`maximum-scale` などで拡大を禁じない | 調査 §6.3、仕様書 §7.1 |
| safe-area | `viewport-fit=cover` と `env(safe-area-inset-*)`（タブバーの下、上部バー） | 調査 §6.2 |
| キーボード | 金額は自前のテンキー。端末のキーボードを使うシート（S-12・S-14 のメモ、S-32・S-33・S-34）は `visualViewport` に合わせて位置を変え、最大の高さを「見えている高さ − 8px」に縮めて中をスクロールできるようにする（フォーカスした欄と主ボタンが両方見える） | 仕様書 §4.0.3 |
| テーマの色 | `<meta name="theme-color" content="#ffffff">` を1つだけ（ライトだけ。manifest の `theme_color`・`background_color` も #ffffff） | 仕様書 §3.9 |
| Service Worker | 最初は入れないか、アプリの殻のキャッシュだけ。入れるなら更新は `autoUpdate` | 調査 §6.5 |
| オフライン | **記録の追加だけ**端末に保留し、つながったら自動で送る。ほかの書き込みは保留せず「オンラインで直せます」。精算の操作は絶対に保留しない。調査 §6.5 の「MVP は書き込みにオンライン必須・主ボタンを無効にする」は、仕様書 §3.6（押せないボタンを作らない P7、記録の追加だけ保留 Q11）で置き換えた | 仕様書 §3.6 |
| 保留の仕組み | TanStack Query の `setMutationDefaults` ＋ `PersistQueryClientProvider` ＋ `resumePausedMutations`、または IndexedDB の自前の列。記録の `id` は端末で採番（`crypto.randomUUID()`）して、送り直しても二重にならないようにする | 調査 §6.5、`docs/04_data_model.md` §2.5 |
| 通知 | 入れない（Web Push は iOS ではホーム画面に追加したときだけ） | 仕様書 §2.4、§12.1 Q17 |

---

## 7. Git（このリポジトリは個人 GitHub）

この Mac の Git のグローバル設定と gh は会社のもの。このリポジトリだけを個人アカウント（ton05ton05yama-droid）で扱う。

### 7.1 実施済みの状態（2026-09-22）

- リポジトリローカルの設定（`.git/config`）
  - `user.name = ton05ton05yama-droid`
  - `user.email = ton05.ton05.yama@gmail.com`
  - `credential.helper = ""`（空。グローバルの資格情報ヘルパー＝ gh の会社アカウントをこのリポジトリで使わないため）
  - `remote.origin.url = git@github-personal:ton05ton05yama-droid/pj_kakeibo.git`
- GitHub のリポジトリ `ton05ton05yama-droid/pj_kakeibo` は **private** で作成済み（空）。
- SSH 鍵 `~/.ssh/id_ed25519_github_personal` を作成し、`~/.ssh/config` に次の Host を追加した（元の設定は `~/.ssh/config.bak-20260922`）。`ssh -T git@github-personal` で ton05ton05yama-droid として認証できることを確認済み。

  ```
  # 個人GitHub (ton05ton05yama-droid) 用。リモートURLは git@github-personal:<owner>/<repo>.git
  Host github-personal
      HostName github.com
      User git
      IdentityFile ~/.ssh/id_ed25519_github_personal
      IdentitiesOnly yes
      AddKeysToAgent yes
      UseKeychain yes
  ```

- `.git/hooks/pre-commit`（`user.email` が個人用でなければコミットを拒否）と `.git/hooks/pre-push`（`git@github-personal:` 以外への push を拒否）を置いた（§7.2）。**`.git/hooks` はバージョン管理されない**ので、別の場所で clone したら作り直す（§7.4）。
- 会社用のグローバル `~/.gitconfig` と、gh の認証（会社アカウント Yamaguchi780）には**触れていない**。
- まだコミットは無い（ブランチ `main`、2026-09-22 時点）。

### 7.2 フックの中身

`.git/hooks/pre-commit`

```sh
#!/bin/sh
# pj_kakeibo: 個人GitHub以外の名義でのコミットを防ぐ（会社メールの混入防止）
# 作者（author）と記録者（committer）の両方のメールを確かめる（--author や GIT_AUTHOR_EMAIL・GIT_COMMITTER_EMAIL での上書きも止める）
expected="ton05.ton05.yama@gmail.com"
for ident in GIT_AUTHOR_IDENT GIT_COMMITTER_IDENT; do
  email="$(git var "$ident" | sed -n 's/^.*<\(.*\)>.*$/\1/p')"
  if [ "$email" != "$expected" ]; then
    echo "pre-commit: $ident のメールが '$email' です。個人用 '$expected' でコミットしてください。" >&2
    exit 1
  fi
done
```

`.git/hooks/pre-push`

```sh
#!/bin/sh
# pj_kakeibo: 個人GitHub用 SSH 別名以外への push を防ぐ
case "$2" in
  git@github-personal:*) exit 0 ;;
  *) echo "pre-push: push 先 '$2' は個人用(git@github-personal:)ではありません。" >&2; exit 1 ;;
esac
```

- pre-commit は、`git var GIT_AUTHOR_IDENT` と `git var GIT_COMMITTER_IDENT` からメールを取り出し、どちらかが個人用でなければ拒否する。`git config user.email` だけを見る形だと、`--author`・`GIT_AUTHOR_EMAIL`・`GIT_COMMITTER_EMAIL` での上書きを通してしまうため（2026-09-22 に git 2.50.1 の使い捨てのリポジトリで、古い形は `--author` と `GIT_COMMITTER_EMAIL` を通し、この形は `--author`・`GIT_AUTHOR_EMAIL`・`GIT_COMMITTER_EMAIL`・`git -c user.email=…` をすべて拒否することを確かめた）。
- **いま置いてある `.git/hooks/pre-commit` は、まだ `git config user.email` だけを見る古い形**（§7.1 の時点のもの）。この形に置き換えるのは、ユーザーに確認してから行う。
- pre-commit は `git commit --no-verify` で飛ばせてしまう。飛ばさないこと。
- worktree を作っても `.git/config` と `.git/hooks` は共有されるので、同じ設定とフックが効く（調査 §7.2）。

### 7.3 守ること

1. push 先はいつも `git@github-personal:ton05ton05yama-droid/pj_kakeibo.git`。**リモートを `https://github.com/…` にしない**（グローバルの資格情報ヘルパーで会社アカウントとして認証される）。
2. コミットの作者は `ton05.ton05.yama@gmail.com`。これが GitHub で確認済みであること（Vercel の作者の照合に必要。§5.1）。
3. **会社のグローバル設定（`~/.gitconfig`）と gh の認証を変えない。** `gh auth switch` はホスト全体の有効アカウントを変え、並行している会社リポジトリの作業に影響するのでしない。
4. gh を使うときは `-R ton05ton05yama-droid/pj_kakeibo` を付ける（SSH の Host 別名のリモートを gh が認識できないことがある。調査 U8）。gh の有効アカウントは会社のものなので、個人の private リポジトリに触るには個人の PAT をコマンド単位で渡す（`GH_TOKEN=… gh … -R ton05ton05yama-droid/pj_kakeibo`）。GitHub の Web で済むことは Web で行う。
5. GitHub で「メールを非公開にする」と「コマンドラインからの push でメールを公開しない」を両方 ON にすると、gmail のコミットの push が拒否される。その場合は noreply アドレス（`ID+ton05ton05yama-droid@users.noreply.github.com`）に変え、フックの `expected` も変える。noreply で Vercel の照合が通るかは未確認（U7）。

### 7.4 別の Mac で clone するとき

```sh
# 1) その Mac 用の鍵を作り、公開鍵を個人アカウントに登録する
#    （ブラウザで ton05ton05yama-droid としてログインし、Settings → SSH and GPG keys → New SSH key）
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_github_personal -C "ton05.ton05.yama@gmail.com"
pbcopy < ~/.ssh/id_ed25519_github_personal.pub

# 2) ~/.ssh/config に §7.1 の Host github-personal を足す（先に控えを取る）
cp ~/.ssh/config ~/.ssh/config.bak-$(date +%Y%m%d)
#    （エディタで §7.1 の Host ブロックを貼る）
ssh -T git@github-personal          # → Hi ton05ton05yama-droid! ...

# 3) clone して、リポジトリローカルの設定を入れる（--global を付けない）
git clone git@github-personal:ton05ton05yama-droid/pj_kakeibo.git
cd pj_kakeibo
git config user.name  "ton05ton05yama-droid"
git config user.email "ton05.ton05.yama@gmail.com"
git config credential.helper ""

# 4) フックを作り直す（中身は §7.2 と同じ）
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
# pj_kakeibo: 個人GitHub以外の名義でのコミットを防ぐ（会社メールの混入防止）
# 作者（author）と記録者（committer）の両方のメールを確かめる（--author や GIT_AUTHOR_EMAIL・GIT_COMMITTER_EMAIL での上書きも止める）
expected="ton05.ton05.yama@gmail.com"
for ident in GIT_AUTHOR_IDENT GIT_COMMITTER_IDENT; do
  email="$(git var "$ident" | sed -n 's/^.*<\(.*\)>.*$/\1/p')"
  if [ "$email" != "$expected" ]; then
    echo "pre-commit: $ident のメールが '$email' です。個人用 '$expected' でコミットしてください。" >&2
    exit 1
  fi
done
EOF
cat > .git/hooks/pre-push <<'EOF'
#!/bin/sh
# pj_kakeibo: 個人GitHub用 SSH 別名以外への push を防ぐ
case "$2" in
  git@github-personal:*) exit 0 ;;
  *) echo "pre-push: push 先 '$2' は個人用(git@github-personal:)ではありません。" >&2; exit 1 ;;
esac
EOF
chmod +x .git/hooks/pre-commit .git/hooks/pre-push
```

その Mac のグローバル設定が個人のものなら `credential.helper` の行は要らないが、入れておいても害はない。

### 7.5 確かめるコマンド

```sh
git config --show-origin --get user.email   # → file:.git/config  ton05.ton05.yama@gmail.com
git config --get remote.origin.url          # → git@github-personal:ton05ton05yama-droid/pj_kakeibo.git
git log -1 --format='%an <%ae>'             # → ton05ton05yama-droid <ton05.ton05.yama@gmail.com>
ssh -T git@github-personal                  # → Hi ton05ton05yama-droid!
ls -l .git/hooks/pre-commit .git/hooks/pre-push   # → 実行権限つきで存在する
```

---

## 8. 初回デプロイ時に確かめること

調査 §8 の未確認事項を、確かめる時点ごとに並べ直したもの。確かめたら結果をここに書く。

**Supabase のプロジェクトを作るとき**

- [ ] U12 個人アカウントに既存の Supabase プロジェクトがあるか（Free はアクティブ2件まで）。GitHub の Settings → Emails で `ton05.ton05.yama@gmail.com` が確認済みか
- [ ] U11 東京リージョンで作る（作った後に変えられるかは未確認なので、最初から東京）
- [ ] U2 pg_cron を使わないので確認は不要（使うことにしたら、Free で拡張を有効にできるか）

**ユーザーを作るとき**

- [ ] U3 サインアップ OFF のまま、ダッシュボードでユーザーを作れるか
- [ ] U4 使うドメインのメールアドレスが `email_address_invalid` にならないか（`+` エイリアスにするならそれも）

**マイグレーションを適用したとき**

- [ ] U5 `grant usage on schema private to authenticated` が要るか（ローカルの Postgres では要った）。`authenticated` として `select` と記録の追加を試す
- [ ] Data API の明示 grant: `anon` のキーで `expenses` を読めず、`ping` だけ呼べること
- [ ] `docs/04_data_model.md` §11 の「まだのこと」

**Vercel に初めてデプロイするとき**

- [ ] U6 `Co-Authored-By: Claude …` 付きのコミットでデプロイが止まらないか。止まったら GitHub のコミットの状態にある Vercel の文言で原因を切り分け、(a) 作者のメールと GitHub 連携を点検 → (b) それでも止まるなら、トレーラーを外して入れ直す・public にする・Pro にするのどれにするかをユーザーが決める
- [ ] U7 noreply アドレスを使うことになったときだけ、Vercel の照合が通るか
- [ ] U8 gh が SSH の Host 別名のリモートを認識するか（使うときはいつも `-R` を付けるので、確かめなくても困らない）
- [ ] 一時停止対策の `ping` が動いているか（GitHub Actions の実行の記録）

**実機（iPhone）で**

- [ ] U9 16px 未満の入力欄が拡大されるか（アプリは 16px 以上にそろえてあるので、念のため）
- [ ] U10 Safari のタブとホーム画面の Web アプリでログインが引き継がれるか、`interactive-widget` への対応
- [ ] 仕様書 §12.2 Q18: 初回の順番「ログイン → ホーム画面に追加」でよいか、`tabular-nums` が Noto Sans JP で効くか、`visualViewport` への追従（iPhone SE でキーボードを出したとき、S-32 の名前の欄と［保存］が両方見えるか）、テンキーの読み上げ

**ずっと**

- [ ] U1 `ping` の呼び出しで一時停止が防げているか（止まったら案A と案B を見直す）

---

## 9. 未決（ユーザーが決めること）

| # | こと | 候補 |
|---|---|---|
| P1 | 擬似メールのドメイン | 自分が管理するドメインのサブドメイン（推奨）／ gmail の `+` エイリアス（受け付けられるか未確認） |
| P2 | 一時停止対策の置き場所 | GitHub Actions（推奨。アプリに Functions を足さない）／ Vercel Cron |
| P3 | バックアップの置き場所 | オーナーの Mac で手動か launchd ／ GitHub Actions で暗号化して private な場所へ |
| P4 | ~~アプリ名・パートナーの ID~~ **決まった（2026-09-23）** | アプリ名「ふたりの家計簿」、ID は `masato` ／ `risako`、呼び名は「まさと」「りさこ」（仕様書 §12.1 Q9）。残る未決は P1・P2・P3・P5 |
| P5 | ルーター | TanStack Router ／ React Router |
