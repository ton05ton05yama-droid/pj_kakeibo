# 参考UIのデザイン言語とモバイルへの適用方針（pj_kakeibo）

- 作成日: 2026-09-22
- ※ 色合わせ（2026-09-22）の後の値の正本は仕様書 §3.9・§7。この文書の色・面の組み方・ダーク・§5 の CSS 変数は写さない
- 調べたもの: `/Users/yamaguchimasato/workspace/pj_income_visualization/frontend`（Next.js 14.2 + Chakra UI v3.36.1 + TanStack Query。デスクトップの業務アプリ）
- 読んだファイル: `src/config/theme.ts`、`src/styles/globals.css`、`src/pages/_app.tsx`、`src/pages/_document.tsx`、`src/components/{Button,Tab,Toggle,Badge,Input,Modal,Text,Layout}/*`、`src/components/ui/{dialog,drawer,toaster,notification-badge,provider,switch}.tsx`、`src/features/form/Styles.ts`、`src/features/dashboard/components/kpis/Card.tsx`、`src/features/manualInput/components/shared/HistoryItem.tsx`、Chakra v3 の既定レシピ（node_modules 内の button / input / tabs / dialog / shadows / radii / semantic colors）
- 「使用回数」は `src/{features,pages,components}` の .tsx（stories・test を除く）を grep して数えた値
- コントラスト比は WCAG 2.x の相対輝度で計算した。色覚の見え方は Machado 2009（重度 1.0）で模擬し、色差は CIEDE2000（ΔE00）で測った

---

## 0. 要約

- **そのまま使うもの**: フォント Noto Sans JP、zinc グレー（Chakra の `gray` は Tailwind zinc と同じ値）、青のアクセント、`text.* / bg.* / border.*` のセマンティックな命名、「薄いグレーのページ + 白いカード + shadow-xs」という面の組み方、「選択中 = 薄い青の面 + 青い文字」という表し方、12px semibold のピル型バッジ。
- **モバイル用に変えるもの**: 文字（本文 12〜14px → 15〜16px、入力欄は 16px 以上）、高さ（32〜40px → 44〜48px）、角丸（ボタン 4px → 10px、カード 8px → 12px）、中央のモーダル → ボトムシート、サイドバー → 下部タブバー（4つ）、ツールチップ → 画面上の文言、確認モーダル → Undo トースト。
- **参考UIから持ち込まないもの**: 白地で AA（4.5:1）に届かない文字色（`text.danger #ef4444` 3.76:1、`text.success #22c55e` 2.28:1、`text.link #3b82f6` 3.68:1 など）、`text.main` より薄い `text.strong`、282箇所ある `bg='white'` の直書き、宣言だけで読み込まれていない Noto Sans JP、`lang='en'`。
- **ダークモード**: zinc の段を逆向きに割り当てる（ページ 950 / 面 900 / 押したとき 800）。主な文字色はライト・ダークとも 4.5:1 以上あることを確かめた。
- **3者の識別色**: まさと = teal、パートナー = amber、共用 = zinc のインク色（無彩色に家のアイコンを添える）。青は「押せるもの」専用にして、人の色には使わない。ライト・ダークのどちらでも、3種類の色覚の模擬すべてで ΔE00 が 23 以上離れている。共用に紫を使う案は、P型・D型の見え方でアクセントの青とほとんど同じになる（ΔE00 5.1 / 0.5）ので採らなかった。

---

## 1. 参考UIのデザイン言語（実測値）

### 1.1 土台

| 項目 | 実装 | メモ |
|---|---|---|
| フォント | `fonts.body` と `fonts.heading` に `"Noto Sans JP", sans-serif`（theme.ts） | **Web フォントとして読み込んでいない**（next/font も `<link>` も無い）。端末に Noto Sans JP が入っていなければ OS 既定のゴシック体になる。PDF 出力だけ `/fonts/NotoSansJP-*.ttf` を登録している |
| テーマ | `<ChakraProvider forcedTheme='light'>`、`html { color-scheme: light }` | ライト固定。ダーク用のトークンは無い |
| ページの背景 | `html, body { background-color: #fafafa; overflow: hidden }`。MainLayout は `background.content #F5F7FA` | 100vh 固定のアプリシェルで、main の中だけスクロールする |
| `lang` | `_document.tsx` が `<Html lang='en'>` | 日本語の UI なのに en になっている |
| globals.css | create-next-app の雛形の変数（`--primary-glow`、`--tile-*` など）が残っている | 実際には使われていない |
| アイコン | react-icons の Md / Lu / Fa が混ざっている | 16〜20px |
| z-index | `app.base 0 < raised 1 < above 2 < sticky 10 < stickyHeader 20 < overlay 50 < modal 100 < modalAbove 110 < toast 150 < datePicker 200 < max 999` | Chakra 組み込みの modal・toast なども同じ段に上書きしている |

### 1.2 文字

フォントサイズ（`semanticTokens.fontSizes` の `app.*`）と使用回数:

| トークン | px | 使用回数 | 主な用途 |
|---|---|---|---|
| app.2xs | 10 | 64 | 通知バッジの数字 |
| app.xs | 11 | 294 | 表の補足、変更履歴の差分 |
| app.sm | 12 | **843** | ボタンの文字、バッジ、サイドバーの見出し、エラーメッセージ |
| app.body-sm | 13 | 111 | ヘルプのリンク |
| app.md | 14 | **732** | 本文、入力値、ラベル、タブ、サイドバーの項目 |
| app.body-lg | 15 | 19 | KPI カードの見出し |
| app.lg | 16 | 213 | 画面の見出し |
| app.xl | 18 | 38 | KPI の値 |
| app.2xl | 20 | 18 | 大きな見出し |
| app.3xl / app.4xl | 28 / 32 | 少ない | 大きな数値 |

- 太さの使用回数: semibold(600) 734 > medium(500) 583 > bold(700) 241 > normal(400) 45 > extrabold(800) 5（選択中のタブ）。役割はおおむね **ラベル・ボタン = 600、入力値・本文 = 500、数値・見出し = 700**。
- 行間は Chakra の既定値のままで、独自の指定は無い。
- 業務アプリなので詰まっていて、本文の中心は 12〜14px。

### 1.3 色

**パレット**（`tokens.colors`）: `gray` は Tailwind **zinc** と同じ値。blue / red / green / orange などは Chakra v3 の既定値で、700 番以降は Tailwind と違う（例: blue.700 = #173da6、red.700 = #991919、green.700 = #116932）。

| 段 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gray (zinc) | #fafafa | #f4f4f5 | #e4e4e7 | #d4d4d8 | #a1a1aa | #71717a | #52525b | #3f3f46 | #27272a | #18181b | #09090b |
| blue | #eff6ff | #dbeafe | #bfdbfe | #a3cfff | #60a5fa | #3b82f6 | #2563eb | #173da6 | #1a3478 | #14204a | #0c142e |
| red | #fef2f2 | #fee2e2 | #fecaca | #fca5a5 | #f87171 | #ef4444 | #dc2626 | #991919 | #511111 | #300c0c | #1f0808 |
| green | #f0fdf4 | #dcfce7 | #bbf7d0 | #86efac | #4ade80 | #22c55e | #16a34a | #116932 | #124a28 | #042713 | #03190c |
| orange | #fff7ed | #ffedd5 | #fed7aa | #fdba74 | #fb923c | #f97316 | #ea580c | #92310a | #6c2710 | #3b1106 | #220a04 |
| teal | #f0fdfa | #ccfbf1 | #99f6e4 | #5eead4 | #2dd4bf | #14b8a6 | #0d9488 | #0c5d56 | #114240 | #032726 | #021716 |

このほか yellow / purple / pink / cyan も定義されている。グラフ用の `CHART_KPI_COLORS` には Tailwind の値が使われている（売上 blue #3b82f6、原価 emerald #10b981、利益 violet #8b5cf6、販管費 amber #f59e0b、マイナス #ff6b6b）。

**セマンティックトークン（文字）**:

| トークン | 参照先 | hex | 白地との比 | 使用回数 |
|---|---|---|---|---|
| text.main | gray.800 | #27272a | 14.89 | 1108 |
| text.sub | gray.600 | #52525b | 7.73 | 369 |
| text.muted | gray.500 | #71717a | 4.83 | 310 |
| text.strong | gray.700 | #3f3f46 | 10.44 | 94（main より**薄い**） |
| text.placeholder | gray.400 | #a1a1aa | 2.56 ✗ | 41 |
| text.link | blue.500 | #3b82f6 | 3.68 ✗ | — |
| text.accent | blue.600 | #2563eb | 5.17 | 29 |
| text.accent.strong | blue.700 | #173da6 | 9.31 | 71 |
| text.danger | red.500 | #ef4444 | 3.76 ✗ | 149 |
| text.success | green.500 | #22c55e | 2.28 ✗ | — |
| text.warning | orange.500 | #f97316 | 2.80 ✗ | 31 |

**セマンティックトークン（背景・枠）**:

| トークン | 参照先 | hex | 用途 |
|---|---|---|---|
| bg.subtle | gray.50 | #fafafa | 補助的な面（67回） |
| bg.muted | gray.100 | #f4f4f5 | トラック、hover（44回） |
| bg.default | gray.200 | #e4e4e7 | （43回） |
| bg.inverse | gray.700 | #3f3f46 | 暗い面 |
| bg.info | blue.50 | #eff6ff | 情報を伝える面 |
| bg.primary | blue.100 | #dbeafe | **選択中・主ボタン** |
| bg.primary.hover | blue.200 | #bfdbfe | その hover |
| bg.primary.active | blue.600 | #2563eb | 塗りの青 |
| bg.danger / .emphasis / .strong | red.50 / 100 / 200 | #fef2f2 / #fee2e2 / #fecaca | エラー、危険な操作のボタン |
| bg.success | green.50 | #f0fdf4 | 成功 |
| bg.warning / .subtle | yellow.200 / orange.50 | #fef08a / #fff7ed | 警告 |
| bg.caution | yellow.50 | #fefce8 | 注意 |
| border.default | gray.200 | #e4e4e7 | **ほぼすべての枠と区切り線（277回）** |
| border.emphasis | gray.300 | #d4d4d8 | 強めの枠（21回） |
| border.accent | blue.300 | #a3cfff | 選択中の枠 |
| border.danger | red.200 | #fecaca | エラーの入力欄 |

**アプリ固有の背景**: `background.main #F8F9FB`、`background.sidebar #FFFFFF`、`background.content #F5F7FA`（MainLayout のページ背景）。どれも青みのあるグレーで、zinc からは外れている。カードの白は `bg='white'` の直書き（282回）。

### 1.4 角丸・影・余白・枠

- **角丸**の使用回数: 8px 151（カード、サイドバーの項目、モーダル）、4px 116（ボタン、入力欄は Chakra の l2 = 4px）、md = 6px 84（履歴カード、小さなパネル）、full 81（セグメント、丸）、2xl = 16px 45（ピル型バッジ）、10px 28（KPI カード）、12px 13。
- **影**は Chakra v3 の既定値を使っていて、ほぼ `xs` だけ（53回）。
  - xs: `0px 1px 2px rgba(24,24,27,.10), 0px 0px 1px rgba(24,24,27,.20)` … カード、サイドバー
  - sm: `0px 2px 4px rgba(24,24,27,.10), 0px 0px 1px rgba(24,24,27,.30)` … enclosed 型のタブ、浮いたボタン
  - lg: `0px 8px 16px rgba(24,24,27,.10), 0px 0px 1px rgba(24,24,27,.30)` … ポップオーバー
  - モーダルの背景幕: blackAlpha.500 = `rgba(0,0,0,.36)`
- **余白**: gap は 12px(266) / 8px(259) / 16px(149) / 10px(109) / 20px(105) / 4px(103) / 6px(99) の順に多い。padding は 12 / 16 / 20 / 24px が中心で、ラベルの横だけ 5px。4px 刻みを基本にしつつ 5 / 6 / 10px が混ざっている。
  - カード: p 20px、gap 16px（ダッシュボード）。KPI カードは px 20 / py 12 / gap 12
  - モーダル: ヘッダーとフッターが px 24 / py 16、本文が px 24 / py 12
  - サイドバー: 幅 220px（畳むと 48px）、上 24px、セクションの間 28px、項目の間 6px
- **枠**: ほぼすべて `1px solid #e4e4e7`。区切り線、入力欄、カードの枠が同じ色で、強調したいときだけ #d4d4d8。カードは「枠なし + shadow-xs」（ダッシュボード）と「1px の枠 + 影なし」（履歴）の2種類がある。

### 1.5 部品ごとの見た目

**Button（CustomButton）** — Chakra の `variant='outline'` をもとに背景色だけ差し替えている。高さ 32px（モーダルでは 35px、幅 100px）、px 12px、gap 8px、角丸 4px、文字 12px semibold、アイコン 16px。

| type | 背景 | 文字 | 枠 | hover |
|---|---|---|---|---|
| primary | #dbeafe（blue.100） | #173da6（blue.700） | #bfdbfe | #bfdbfe |
| secondary | #ffffff | #27272a | #e4e4e7 | #f4f4f5 |
| outline | transparent | #27272a | #e4e4e7 | #f4f4f5 |
| danger | #fee2e2 | #991919 | #fecaca | #fecaca |

→ **主ボタンも塗りの青ではなく「薄い青の面 + 濃い青の文字」**。塗りの青（#2563eb に白文字）は SegmentToggle の選択中にしか使っていない。

**Tabs（CustomTabs）** — Chakra の `line` 型。文字は 14px で、選択中は #27272a の extrabold(800)、それ以外は #71717a の normal(400)。下線は 2px の #18181b（gray.solid）で、**青ではなく黒**。タブ列の下に 1px #e4e4e7 の線がある。各タブの padding は上下 8px・左 8px・右 12px、アイコンと文字の間は 10px。URL の `?tab=` と連動する。横にスクロールするときはスクロールバーを隠す。`enclosed` 型では角丸 6px と shadow-sm が付く。

**SegmentToggle** — ピル型のトラック（背景 #f4f4f5、1px #e4e4e7、角丸 full、項目の間 2px）。項目は Chakra の `size='xs'`（高さ 32px、12px）。選択中は塗りの青（#2563eb に白文字）、それ以外は透明。

**SideBar / SideBarButton** — 背景 #fff に shadow-xs、幅 220px。セクション見出しは 12px semibold の #a1a1aa。項目は高さ 33px、角丸 8px、px 12px、アイコン 18px、文字 14px semibold。**選択中は背景 #dbeafe で文字とアイコンが #2563eb**、それ以外は #52525b。通知の件数は右端に NotificationBadge で出す。

**Badge** — ピル型（角丸 16px）、12px semibold、px 10px / py 2px。青系は背景 #bfdbfe に文字 #173da6、灰系は背景 #f4f4f5 に文字 #27272a。NotificationBadge は直径 20px の #ef4444 の丸に、白の 10px semibold。

**Input（CustomInput / CustomNumberInput / form の Styles）** — 高さ 40px（Chakra の md）、px 12px、角丸 4px、背景 #fff、枠 1px #e4e4e7、値は 14px medium の #27272a、プレースホルダーは #71717a。キーボード操作でフォーカスしたときは、枠が #3b82f6 になり `0 0 0 1px #3b82f6` のリングが付く。ラベルは入力欄の上に 14px（太さ 400〜500）、左に 5px の余白、必須なら赤い `*`。数値の入力は 3桁ごとにカンマを入れ、`inputMode` を指定する。上限を超えると枠が #fecaca になり、12px の赤い文言が出る。パスワード欄は右端に目のアイコン（20px、#71717a）がある。

**Modal（Dialog / MasterModalShell / ConfirmDeleteModal）** — 画面中央に出る。背景 #fff、角丸 8px、背景幕は rgba(0,0,0,.36)。ヘッダーとフッターは固定で、本文だけスクロールする（最大の高さ 90vh、最大幅 650px、中身の幅 500px）。フッターは [閉じる(outline)] [保存(primary)] を中央にそろえ（各 100×35px、間 20px）、編集のときは左端に [削除(danger)] が付く。入力が足りずに保存できないときは、ツールチップで理由を出す。削除の確認は幅 400px・p 24px で、本文 12px の #52525b と [キャンセル][削除] のボタン。

**Card** — KPI カードは背景 #fff、角丸 10px、shadow-xs、px 20 / py 12px。見出しは 15px semibold、値は 18px bold、前期との差は 12px semibold（増えたら緑と上向きの矢印、減ったら赤と下向きの矢印）。履歴カードは背景 #fff、1px #e4e4e7、角丸 6px、p 16px。差分の行は #f4f4f5 の面の中に「古い値（赤 #dc2626）→ 新しい値（緑 #16a34a）」と並べる。

**Toast** — 右下（bottom-end）に出る。p 12px、タイトル 14px bold、説明は medium。**アクションボタン（`toast.action`）を置けるので、Undo トーストはこの形をそのまま使える。**

**Text（LongText）** — 収まらない文字は省略し、ホバーしたときにツールチップで全文を出す。

### 1.6 持ち込まない・直すもの

1. 白地で 4.5:1 に届かない文字色: text.danger #ef4444（3.76）、text.success #22c55e（2.28）、text.warning #f97316（2.80）、text.link #3b82f6（3.68）、text.placeholder #a1a1aa（2.56）。→ 一段濃い色を使う（§5）。
2. text.strong（#3f3f46）が text.main（#27272a）より薄く、名前と中身が逆になっている。→ strong というトークンは作らず、強調は太さで表す。
3. background.content #F5F7FA と background.main #F8F9FB が zinc から外れた青みのあるグレーになっている。→ zinc にそろえる（ページは #fafafa。参考UIの html の背景色と同じ）。
4. `bg='white'` の直書き（282箇所）。→ ダークモードに対応するため、必ずトークン（`--bg-surface`）を使う。
5. フォントを読み込んでおらず、`lang='en'` になっている。→ Google Fonts で読み込み、`lang="ja"` にする。
6. `html, body { overflow: hidden }` と 100vh 固定の組み合わせ。→ モバイルでは普通に縦へスクロールさせ、高さは `dvh` で指定する（iOS のアドレスバーが縮む動きやスクロールを妨げない）。
7. ホバーが前提のつくり（ツールチップ、hover の色、押せないボタンの理由をツールチップで出す）。→ タッチ操作では :active の見た目と、画面上の文言で伝える。
8. react-icons の3系統が混ざっている。→ 1系統（Lucide 系の線のアイコン）にそろえる。

---

## 2. モバイルへの適用方針

### 2.1 そのまま使うもの

- フォント Noto Sans JP、zinc グレー、青のアクセント、各色の値（§1.3）
- セマンティックな命名（text / bg / border に main / sub / muted / subtle / accent / danger などを付ける形）。CSS 変数名に写す（`text.main` → `--text-main`）
- 面の組み方: 薄いグレーのページ（#fafafa）に白いカードを置き、shadow-xs を付ける。枠線は 1px #e4e4e7 だけ
- 選択中の表し方: 背景 #dbeafe に文字 #2563eb / #173da6（サイドバーの選択中や青いバッジと同じ）
- 太さの役割: ラベル・ボタンは 600、値・本文は 500、金額・見出しは 700
- サイズの段（`app.*` の 11〜32px をそのまま使い、使う段を大きい側にずらす）
- ピル型のバッジ（12px semibold、px 10 / py 2、角丸 full）と、通知用の赤い丸
- フォーカスの見せ方: `outline: 2px solid #3b82f6; outline-offset: 2px`（SideBar のリンクと同じ）
- 金額入力の 3桁区切りと `inputMode="numeric"`
- z-index の段（sticky 10 / overlay 50 / modal 100 / toast 150）
- アクション付きのトースト（Undo に使う）

### 2.2 モバイル用に調整するもの

| 項目 | 参考UI | モバイル（pj_kakeibo） | 理由 |
|---|---|---|---|
| 本文 | 12〜14px | 一覧の主な文字 16px、補足 13px、注記 12px | 片手で持って、屋外でも読める大きさにする |
| 入力欄の文字 | 14px | **16px 以上**（金額の入力は 32px bold） | iOS の Safari は 16px 未満の入力欄にフォーカスすると画面を拡大してしまう |
| 行間 | 既定のまま | 本文 1.6、1行の UI 1.4、金額 1.25 | 日本語を読みやすくする |
| 数字 | 指定なし | `font-variant-numeric: tabular-nums` にして右揃え | 金額の桁をそろえる（フォントで効くかはモックで確かめる） |
| ボタンの高さ | 32 / 35px | 主ボタン 48px（横幅いっぱい）、ほかは 44px | タップできる領域を 44px 以上にする |
| 主ボタンの見た目 | 薄い青の面 + 青い文字 | **塗りの青 #2563eb に白文字（5.17:1）**。1画面に1つだけ置く | 「1画面に主な操作は1つ」が見ただけで分かるようにする。塗りの青は参考UIでも SegmentToggle の選択中に使っている |
| そのほかのボタン | 白 + 枠 | 白 + 枠（#e4e4e7）、高さ 44px。できれば文字だけのボタン（アクセント色の文字）で済ませる | ボタンの数を減らし、見た目も軽くする |
| 削除 | 危険な操作のボタン + 確認モーダル | 編集シートの中に赤い文字のボタンを置き、押したらすぐ削除して Undo トーストを出す | 確認ダイアログより Undo |
| 入力欄 | 高さ 40px、角丸 4px、枠 #e4e4e7 | 高さ 48px、角丸 10px、枠 #d4d4d8、フォーカスすると 2px の #3b82f6 のリング | タップしやすく、見分けやすくする |
| 角丸 | ボタン 4px、カード 8〜10px | タグ 4px、ボタン・入力欄 10px、カード 12px、シートの上端 16px、ピルは full | 指で扱う大きさに合わせる |
| 余白 | 5 / 10px が混ざる | 4px 刻み（4, 8, 12, 16, 20, 24, 32）、画面の左右は 16px | 半端な値をなくす |
| カードの内側の余白 | 20px | 16px | 幅 375px でも中身の場所を確保する |
| ナビゲーション | 左のサイドバー（220px） | **下部タブバーに 4つ**（高さ 56px + セーフエリア、アイコン 24px + ラベル 11px） | 親指が届く位置に置く |
| ナビの選択中 | 背景 #dbeafe + 青い文字 | アイコンの後ろに #dbeafe のピル（56×28px）、アイコンとラベルは #2563eb。選ばれていないものは #71717a | 参考UIの選択中の表し方を流用する |
| 画面の中の切り替え | line 型のタブ（黒い下線） | セグメント（ピル型）。選択中は白い面 + shadow-xs + #27272a の 600（参考UIの enclosed 型タブと同じ表し方） | 塗りの青は主ボタン専用にして、目立つものを1つに絞る |
| モーダル | 画面中央のダイアログ | **ボトムシート**（上端の角丸 16px、つまみ 36×4px、最大の高さ 90dvh）。下へのスワイプか背景のタップで閉じる。主ボタンは1つだけ下端に固定し、[閉じる] ボタンは置かない | 片手で届き、閉じ方を増やさない |
| トースト | 右下 | 下の中央、タブバーの 8px 上。暗い面（inverse）に「元に戻す」を置き、6秒で消える | Undo を親指の位置に出す |
| 一覧 | 表（CustomTable） | リストの行（最小の高さ 56px）。左に支払元のアバター 28px、真ん中に「カテゴリ・メモ」16px と「日付」13px、右に金額 16px の 600 | 横幅が足りないため |
| 日付の入力 | 自作の DatePicker のポップオーバー | 初期値は「今日」。変えるときはブラウザ標準の `<input type="date">` か「今日・昨日・その他」のチップを使う | 入力の手間を省く |
| ツールチップ | 押せない理由や、省略した文字の全文 | 使わない。ボタンは押せなくせず、押したら足りない項目を示す。全文は折り返して出す | タッチにはホバーが無い |
| 押したときの見た目 | :hover の色 | :active で背景を --bg-muted にする（120ms） | タッチ操作に合わせる |
| ページのスクロール | 固定したシェルの中でスクロール | 文書全体のスクロールと、`position: sticky/fixed` のバー、`env(safe-area-inset-*)` | iOS の動きに合わせる |
| 背景幕 | rgba(0,0,0,.36) | ライト .36、ダーク .60 | ダークでも後ろの画面を十分に沈ませる |
| アイコン | Md / Lu / Fa が混ざる、16〜20px | Lucide 系の線のアイコン、線の太さ 2px、一覧 20px、タブバー 24px | そろえる |

### 2.3 使わないもの

サイドバー、表（CustomTable、並べ替え、絞り込み）、ツールチップ、パンくずリスト、ボタンを3つ並べるフッター、extrabold(800)、10px の文字、create-next-app の雛形に入っていた CSS 変数。

### 2.4 モバイル用の部品（モックでの寸法）

- **画面**: 幅 375〜430px、左右 16px。中身の最大幅は 480px（広い画面では中央に寄せる）
- **上部バー**: 高さ 48px、背景 --bg-page（スクロールしたら --bg-surface にして下に線を引く）。タイトルは 18px bold、または月の切り替え「‹ 2026年9月 ›」（矢印のタップ領域は 44×44px）
- **下部タブバー**: 高さ 56px + `env(safe-area-inset-bottom)`、背景 --bg-surface、上に 1px の --border。4つを均等に割る（1つあたり約 94×56px）
- **主ボタン**: 高さ 48px、角丸 10px、16px semibold、背景 --bg-accent、文字 --text-on-accent。押している間は --bg-accent-pressed
- **文字だけのボタン**: 高さ 44px、16px semibold、--text-accent（削除は --text-danger）
- **ボトムシート**: 背景 --bg-surface、上端の角丸 16px。つまみは上から 8px の位置に 36×4px、色は --border-strong。padding は 16px に下のセーフエリアを足す。影は --shadow-sheet。220ms の `cubic-bezier(.2,.8,.2,1)` で出し、`prefers-reduced-motion` のときは動かさない
- **Undo トースト**: 背景 --bg-inverse、文字は --text-on-inverse の 14px medium、「元に戻す」は --text-inverse-action の 14px bold。角丸 12px、最小の高さ 48px、左右 16px。一度に1つだけ出す
- **リストの行**: 最小の高さ 56px、左右 16px。区切り線は 1px の --border で、文字の左端から引く
- **カード**: 背景 --bg-surface、角丸 12px、p 16px、影 --shadow-xs（ダークでは影が見えないので 1px の --border も付ける）
- **チップ**（カテゴリの選択など）: 高さ 36px（上下の余白と合わせて 44px）、px 14px、14px medium、角丸 full、背景 --bg-muted。選択中は背景 --bg-accent-subtle、文字 --text-accent-strong、✓ のアイコン
- **金額の入力**: 32px bold、`¥` は 0.75em、右揃え、`inputmode="numeric"`、3桁区切り。金額が後で分かる項目がまだ入力されていないときは、「破線の枠 + 『金額を入れる』（--text-muted）」で示す。警告色のオレンジは使わない（§4.3）
- **セクションの見出し**: 13px semibold の --text-sub（ページの背景に直接置くので、muted ではなく sub を使う）
- **通知の印**: タブのアイコンの右上に 8px の赤い丸（件数を出すなら 18px の赤い丸に 11px の白い数字）

---

## 3. ダークモードのトークン対応表

参考アプリはライト固定なので、ここで新しく決める。方針は次のとおり。

- zinc の段を反対側に割り当てる（50 ↔ 950、100 ↔ 900 …）。
- 面は「ページ 950 → 面 900 → 押したとき・トラック 800」と明るくしていき、手前にあるものほど明るくする。
- 文字は main 100、sub 300、muted 400 にする。アクセントなどの有彩色は 400 番台に上げる。
- ダークでは影がほとんど見えないので、カードの縁は 1px の枠で出す。

| トークン | ライト | 比※ | ダーク | 比※ | 用途 |
|---|---|---|---|---|---|
| --bg-page | #fafafa (zinc-50) | — | #09090b (zinc-950) | — | ページの背景 |
| --bg-surface | #ffffff | 1.04（対 page） | #18181b (zinc-900) | 1.12（対 page） | カード、シート、タブバー |
| --bg-muted | #f4f4f5 (zinc-100) | — | #27272a (zinc-800) | — | セグメントのトラック、チップ、押したとき |
| --bg-input | #ffffff | — | #09090b | — | 入力欄 |
| --bg-inverse | #27272a | 14.27（対 page） | #3f3f46 (zinc-700) | 1.91（対 page） | トースト |
| --bg-accent | #2563eb (blue-600) | 白い文字 5.17 | #2563eb | 白い文字 5.17、面との比 3.43 | 主ボタン |
| --bg-accent-pressed | #173da6 | 白い文字 9.31 | #173da6 | 白い文字 9.31 | 主ボタンを押している間 |
| --bg-accent-subtle | #dbeafe (blue-100) | — | #14204a (blue-900) | — | 選択中 |
| --bg-danger-subtle | #fef2f2 | — | #300c0c | — | エラーの面 |
| --bg-success-subtle | #f0fdf4 | — | #042713 | — | 精算済みの面（使う場合） |
| --text-main | #27272a | 14.89 | #f4f4f5 | 16.12 | 本文、金額 |
| --text-sub | #52525b | 7.73（page では 7.41） | #d4d4d8 | 11.99 | 補足、見出し |
| --text-muted | #71717a | 4.83（page では 4.63） | #a1a1aa | 6.91（muted の面では 5.81） | 日付、プレースホルダー |
| --text-disabled | #a1a1aa | 2.56 | #71717a | 3.67 | 押せない状態（読ませたい文字には使わない） |
| --text-accent | #2563eb | 5.17 | #60a5fa | 6.97 | リンク、選択中のタブ |
| --text-accent-strong | #173da6 | subtle の上で 7.63 | #a3cfff | subtle の上で 9.68 | 選択中のチップの文字 |
| --text-danger | #dc2626 | 4.83 | #f87171 | 6.40 | 削除、エラー |
| --text-success | #116932 | 6.79 | #4ade80 | 10.17 | 成功（控えめに使う） |
| --text-warning | #92310a | 7.88 | #fb923c | 7.83 | 警告（基本は使わない。§4.3） |
| --text-on-accent | #ffffff | 5.17 | #ffffff | 5.17 | 主ボタンの文字 |
| --text-on-inverse | #fafafa | 14.27 | #fafafa | 10.01 | トーストの文字 |
| --text-inverse-action | #93c5fd | 8.26 | #93c5fd | 5.79 | トーストの「元に戻す」 |
| --border | #e4e4e7 | 1.27 | #27272a | 1.19 | 区切り線、カードの縁 |
| --border-strong | #d4d4d8 | 1.48 | #3f3f46 | 1.70（入力欄の上では 1.91） | 入力欄の枠、シートのつまみ |
| --border-accent | #a3cfff | 1.62 | #3b82f6 | 4.82 | 選択中のチップの縁（補助） |
| --border-danger | #ef4444 | 3.76 | #f87171 | 6.40 | エラーのある入力欄 |
| --focus-ring | #3b82f6 | 3.68 | #60a5fa | 6.97 | フォーカスのリング |
| --backdrop | rgba(0,0,0,.36) | — | rgba(0,0,0,.60) | — | シートの背景幕 |
| --shadow-xs | 参考UIと同じ | — | `0 1px 1px rgba(0,0,0,.64), inset 0 0 1px rgba(212,212,216,.2)` | — | カード |

※ 特に書いていなければ、ライトは #ffffff に対する比、ダークは #18181b（面）に対する比。

**コントラスト比の目安**

- 本文やラベル（24px 未満、太字なら 18.66px 未満）: **4.5:1 以上**。表の text-main / sub / muted / accent / danger / success / warning は、ライトとダークの両方で満たしている。
- 大きな文字（24px 以上、太字なら 18.66px 以上）と、見分けるのに必要な図形（アイコン、入力欄の縁、フォーカスのリング）: **3:1 以上**。
- 例外として扱うもの: --border（区切り線は飾りなので対象外）、--text-disabled（押せない状態の表示）。入力欄の枠 --border-strong はライトで 1.48:1 と 3:1 に届かないため、入力欄は「上のラベル + 中の値またはプレースホルダー」で見分けられるようにし、枠だけに頼らない。
- 気をつける組み合わせ: ライトの --text-muted を --bg-muted（#f4f4f5）の上に置くと 4.40:1 で基準に届かない。灰色の面の上の文字には --text-sub 以上を使う。
- テーマの切り替え: OS の設定（`prefers-color-scheme`）に従うのを基本にし、設定画面で「自動 / ライト / ダーク」を選べるようにする（`data-theme`）。`color-scheme` も一緒に切り替えて、日付の入力などブラウザ標準の部品の色も合わせる。`<meta name="theme-color">` はライトで #fafafa、ダークで #09090b。

---

## 4. 3者の識別色（まさと / パートナー / 共用）

### 4.1 提案

| | ライト: 塗り | 塗りの上の文字 | 面に置く文字色 | 薄い面（飾り用） | ダーク: 塗り | 塗りの上の文字 | 面に置く文字色 | 薄い面 |
|---|---|---|---|---|---|---|---|---|
| **まさと（A）** teal | #0d9488 | #18181b（4.73） | #0f766e（5.47） | #ccfbf1 | #2dd4bf | #18181b（9.52） | #2dd4bf（9.52） | #134e4a |
| **パートナー（B）** amber | #d97706 | #18181b（5.56） | #b45309（5.02） | #fef3c7 | #fbbf24 | #18181b（10.61） | #fbbf24（10.61） | #451a03 |
| **共用** zinc のインク色 | #3f3f46 | #ffffff（10.44） | #3f3f46（10.44） | #e4e4e7 | #71717a | #ffffff（4.83） | #d4d4d8（11.99） | #3f3f46 |

塗りの色どうしの見分けやすさ（3色の組み合わせのうち、いちばん近い2色の ΔE00。20 以上ならはっきり違って見えるという目安）:

| | 一般 | P型 | D型 | T型 |
|---|---|---|---|---|
| ライト（#0d9488 / #d97706 / #3f3f46） | 36.1 | 24.4 | 23.2 | 34.6 |
| ダーク（#2dd4bf / #fbbf24 / #71717a） | 36.9 | 25.8 | 23.1 | 34.5 |

- 塗りの色と面とのコントラスト比は、ライトで 3.74 / 3.19 / 10.44、ダークで 9.52 / 10.61 / 3.67。どれも図形の基準である 3:1 を超えている。
- アクセントの青との色差（いちばん近い見え方の場合）: teal は T型で 13.7（ダークは 11.0）、amber は 47 以上、共用のインク色は 25 以上。青を人の色に使わないことで、「押せるもの」との取り違えを防いでいる。

### 4.2 この組み合わせにした理由

- **性別の連想を避けた**: 青 = 男、ピンク = 女という連想を避けるため、どちらにも寄らない teal と amber を選んだ。どちらをどちらに割り当てても不自然にならないので、設定で入れ替えられるようにする。
- **青は押せるもの専用にした**: 人に青を使うと、押せるものと見分けにくくなる。共用に紫を使う案も試したが、紫 #7c3aed とアクセントの青 #2563eb の色差は P型で 5.1、D型で 0.5 しかなく、ほとんど同じ色に見えるのでやめた。
- **共用は無彩色にした**: 精算で意味を持つのは「個人が立て替えた支出」なので、個人の分だけを色で目立たせ、共用（共用の口座・カード）は落ち着いた色にした。色が少ないほど画面が騒がしくならない。無彩色が「押せない状態」に見えないよう、共用には必ず家（財布）のアイコンを添える。
- **明るさにも差をつけた**: 色覚の型によっては色味の違いがほとんど残らないので、明るさでも見分けられるようにした。ライトは teal が中くらい、amber がやや明るい、インク色が暗い。ダークは teal と amber が明るく、灰色が中くらい。
- **参考UIの言語から外れない**: 参考UIもグラフには emerald・violet・amber といった Tailwind の色を使っているので、Tailwind の teal と amber を加えても違和感はない。ただし参考UIのパレットには amber や Tailwind 版の teal-400 などが無いので、pj_kakeibo の側で定義する。

### 4.3 使い方のルール

1. **色だけに頼らない**: 支払元は必ずアバター（頭文字か家のアイコン）や名前と一緒に表示する。アバターは塗りの色の丸（一覧では 28px、小さいものは 20px）に、「塗りの上の文字」の色で頭文字（12〜13px bold）を入れる。共用は家のアイコン。
2. **薄い面は飾りにだけ使う**: 薄い面の色どうしは色覚の型によって見分けられない（ライトの D型で ΔE00 2.3、ダークで 1.4）。見分ける必要がある場所では、必ず塗りの色（点、アバター、縦線）を使う。
3. **色は人に結びつける**: ログインしている人ではなく、人そのものに色を割り当てる。こうすると、2人が同じ画面を見て同じ色で話ができる。自分の記録は、名前の横に「（自分）」と書いて示す。
4. **状態を表す色とぶつけない**: amber と警告のオレンジは D型で色差 1.6（ダークでは 7.2）、teal と成功の緑は T型で 4.2（ダークでは 2.9）しかなく、ほぼ同じに見える。そこで次のようにする。
   - 金額が未入力の状態は、オレンジではなく「破線の枠 + 文言 + アイコン」で示す。
   - 精算済みは、緑の面ではなく「鍵のアイコン + 『精算済み』の灰色のバッジ」で示す。
   - 精算でのお金の向き（個人 → 共用 / 共用 → 個人）は赤や緑を使わず、「A → 共用 ¥12,000」のように**矢印と文言**で示す。
5. **変数名に人の名前を入れない**: パートナーの表示名はまだ決まっていないので、`--who-a` / `--who-b` / `--who-joint` という名前にする（表示名は設定で変える）。

---

## 5. CSS 変数（モックでそのまま使える形）

フォントの読み込みと viewport の指定（`<head>`）:

```html
<html lang="ja">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400..700&display=swap" rel="stylesheet">
```

`maximum-scale=1` などで拡大を禁止してはいけない。入力欄の拡大は、文字を 16px 以上にすることで防ぐ。

```css
/* ===== pj_kakeibo tokens — light (default) ===== */
:root {
  color-scheme: light;

  /* --- font --- */
  --font-sans: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif;
  --fw-regular: 400;
  --fw-medium: 500;   /* 入力値・本文 */
  --fw-semibold: 600; /* ラベル・ボタン */
  --fw-bold: 700;     /* 金額・見出し */

  /* 参考UIの app.* と同じ段（2xs=10px は使わない） */
  --fs-xs: 11px;      /* タブバーのラベルだけ */
  --fs-sm: 12px;      /* 注記、バッジ */
  --fs-body-sm: 13px; /* 補足（日付・支払元）、セクション見出し */
  --fs-md: 14px;      /* チップ、トースト */
  --fs-body-lg: 15px;
  --fs-lg: 16px;      /* 一覧の主な文字、ボタン、入力欄（これより小さくしない） */
  --fs-xl: 18px;      /* 上部バー・シートのタイトル */
  --fs-2xl: 20px;
  --fs-3xl: 28px;     /* 今月の合計 */
  --fs-4xl: 32px;     /* 金額の入力 */
  --fs-input: 16px;

  --lh-tight: 1.25;   /* 金額、見出し */
  --lh-ui: 1.4;       /* 1行の UI */
  --lh-body: 1.6;     /* 日本語の本文 */

  /* --- spacing（4px 刻み） --- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --gutter: 16px;

  /* --- sizes --- */
  --tap-min: 44px;
  --control-h: 48px;     /* 主ボタン、入力欄 */
  --control-h-sm: 44px;  /* そのほかのボタン、文字だけのボタン */
  --chip-h: 36px;        /* 上下の余白と合わせてタップ領域 44px */
  --row-min-h: 56px;
  --appbar-h: 48px;
  --tabbar-h: 56px;      /* これに env(safe-area-inset-bottom) を足す */
  --avatar: 28px;
  --avatar-sm: 20px;
  --icon: 20px;
  --icon-tab: 24px;
  --content-max-w: 480px;

  /* --- radius --- */
  --radius-tag: 4px;
  --radius-control: 10px;
  --radius-card: 12px;
  --radius-sheet: 16px;
  --radius-full: 9999px;

  /* --- z-index（参考UIの app.* と同じ段） --- */
  --z-base: 0;
  --z-raised: 1;
  --z-sticky: 10;   /* 上部バー、タブバー */
  --z-overlay: 50;  /* 背景幕 */
  --z-sheet: 100;   /* ボトムシート */
  --z-toast: 150;
  --z-max: 999;

  /* --- motion --- */
  --dur-fast: 120ms;
  --dur: 220ms;
  --ease-out: cubic-bezier(.2, .8, .2, 1);

  /* --- color: background --- */
  --bg-page: #fafafa;
  --bg-surface: #ffffff;
  --bg-muted: #f4f4f5;
  --bg-input: #ffffff;
  --bg-inverse: #27272a;
  --bg-accent: #2563eb;
  --bg-accent-pressed: #173da6;
  --bg-accent-subtle: #dbeafe;
  --bg-accent-subtle-pressed: #bfdbfe;
  --bg-danger-subtle: #fef2f2;
  --bg-success-subtle: #f0fdf4;
  --backdrop: rgba(0, 0, 0, .36);

  /* --- color: text --- */
  --text-main: #27272a;
  --text-sub: #52525b;
  --text-muted: #71717a;
  --text-placeholder: #71717a;
  --text-disabled: #a1a1aa;
  --text-accent: #2563eb;
  --text-accent-strong: #173da6;
  --text-danger: #dc2626;
  --text-success: #116932;
  --text-warning: #92310a;
  --text-on-accent: #ffffff;
  --text-on-inverse: #fafafa;
  --text-inverse-action: #93c5fd;

  /* --- color: border --- */
  --border: #e4e4e7;
  --border-strong: #d4d4d8;
  --border-accent: #a3cfff;
  --border-danger: #ef4444;
  --focus-ring: #3b82f6;

  /* --- shadow（参考UI = Chakra v3 の値） --- */
  --shadow-xs: 0 1px 2px rgba(24, 24, 27, .10), 0 0 1px rgba(24, 24, 27, .20);
  --shadow-sm: 0 2px 4px rgba(24, 24, 27, .10), 0 0 1px rgba(24, 24, 27, .30);
  --shadow-sheet: 0 -8px 24px rgba(24, 24, 27, .12), 0 0 1px rgba(24, 24, 27, .30);
  --shadow-toast: 0 8px 16px rgba(24, 24, 27, .16), 0 0 1px rgba(24, 24, 27, .30);

  /* --- who（支払元）: a = まさと, b = パートナー, joint = 共用 --- */
  --who-a: #0d9488;          /* 塗り（点・アバター・縦線） */
  --who-a-on: #18181b;       /* 塗りの上の頭文字 */
  --who-a-fg: #0f766e;       /* 面に置く文字・アイコン */
  --who-a-subtle: #ccfbf1;   /* 飾り用。見分けには使わない */
  --who-b: #d97706;
  --who-b-on: #18181b;
  --who-b-fg: #b45309;
  --who-b-subtle: #fef3c7;
  --who-joint: #3f3f46;
  --who-joint-on: #ffffff;
  --who-joint-fg: #3f3f46;
  --who-joint-subtle: #e4e4e7;
}

/* ===== dark — OS の設定に従う（data-theme="light" で明示したときは除く） ===== */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg-page: #09090b;
    --bg-surface: #18181b;
    --bg-muted: #27272a;
    --bg-input: #09090b;
    --bg-inverse: #3f3f46;
    --bg-accent: #2563eb;
    --bg-accent-pressed: #173da6;
    --bg-accent-subtle: #14204a;
    --bg-accent-subtle-pressed: #1a3478;
    --bg-danger-subtle: #300c0c;
    --bg-success-subtle: #042713;
    --backdrop: rgba(0, 0, 0, .60);

    --text-main: #f4f4f5;
    --text-sub: #d4d4d8;
    --text-muted: #a1a1aa;
    --text-placeholder: #a1a1aa;
    --text-disabled: #71717a;
    --text-accent: #60a5fa;
    --text-accent-strong: #a3cfff;
    --text-danger: #f87171;
    --text-success: #4ade80;
    --text-warning: #fb923c;
    --text-on-accent: #ffffff;
    --text-on-inverse: #fafafa;
    --text-inverse-action: #93c5fd;

    --border: #27272a;
    --border-strong: #3f3f46;
    --border-accent: #3b82f6;
    --border-danger: #f87171;
    --focus-ring: #60a5fa;

    --shadow-xs: 0 1px 1px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .20);
    --shadow-sm: 0 2px 4px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .30);
    --shadow-sheet: 0 -8px 24px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .30);
    --shadow-toast: 0 8px 16px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .30);

    --who-a: #2dd4bf;
    --who-a-on: #18181b;
    --who-a-fg: #2dd4bf;
    --who-a-subtle: #134e4a;
    --who-b: #fbbf24;
    --who-b-on: #18181b;
    --who-b-fg: #fbbf24;
    --who-b-subtle: #451a03;
    --who-joint: #71717a;
    --who-joint-on: #ffffff;
    --who-joint-fg: #d4d4d8;
    --who-joint-subtle: #3f3f46;
  }
}

/* ===== dark — 設定画面で明示したとき（上のブロックと同じ値） ===== */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-page: #09090b;
  --bg-surface: #18181b;
  --bg-muted: #27272a;
  --bg-input: #09090b;
  --bg-inverse: #3f3f46;
  --bg-accent: #2563eb;
  --bg-accent-pressed: #173da6;
  --bg-accent-subtle: #14204a;
  --bg-accent-subtle-pressed: #1a3478;
  --bg-danger-subtle: #300c0c;
  --bg-success-subtle: #042713;
  --backdrop: rgba(0, 0, 0, .60);

  --text-main: #f4f4f5;
  --text-sub: #d4d4d8;
  --text-muted: #a1a1aa;
  --text-placeholder: #a1a1aa;
  --text-disabled: #71717a;
  --text-accent: #60a5fa;
  --text-accent-strong: #a3cfff;
  --text-danger: #f87171;
  --text-success: #4ade80;
  --text-warning: #fb923c;
  --text-on-accent: #ffffff;
  --text-on-inverse: #fafafa;
  --text-inverse-action: #93c5fd;

  --border: #27272a;
  --border-strong: #3f3f46;
  --border-accent: #3b82f6;
  --border-danger: #f87171;
  --focus-ring: #60a5fa;

  --shadow-xs: 0 1px 1px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .20);
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .30);
  --shadow-sheet: 0 -8px 24px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .30);
  --shadow-toast: 0 8px 16px rgba(0, 0, 0, .64), inset 0 0 1px rgba(212, 212, 216, .30);

  --who-a: #2dd4bf;
  --who-a-on: #18181b;
  --who-a-fg: #2dd4bf;
  --who-a-subtle: #134e4a;
  --who-b: #fbbf24;
  --who-b-on: #18181b;
  --who-b-fg: #fbbf24;
  --who-b-subtle: #451a03;
  --who-joint: #71717a;
  --who-joint-on: #ffffff;
  --who-joint-fg: #d4d4d8;
  --who-joint-subtle: #3f3f46;
}

/* ===== 土台（モックの共通スタイル） ===== */
html {
  font-family: var(--font-sans);
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  background: var(--bg-page);
  color: var(--text-main);
}
body {
  margin: 0;
  line-height: var(--lh-body);
  background: var(--bg-page);
  -webkit-tap-highlight-color: transparent;
}
input, select, textarea { font: inherit; font-size: max(var(--fs-input), 1em); }
.num { font-variant-numeric: tabular-nums; }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
```

**補足**
- ダークのブロックが2つあるのは、「OS の設定に従う」場合と「設定画面でダークを選んだ」場合の両方に対応するため。値はまったく同じなので、変えるときは両方を直す（モックのビルド処理があるなら、どちらかから生成してもよい）。
- 実装（Next.js + Chakra v3）に移すときは、同じ名前で `semanticTokens` の `{ _light, _dark }` を定義すれば対応が取れる（例: `--text-main` → `text.main: { value: { _light: '{colors.gray.800}', _dark: '{colors.gray.100}' } }`）。

---

## 付録: 確かめたことと、その方法

- 使用回数: `grep -rhoE "fontSize=['{\"][^ >]+"` のように、プロパティごとに集計した（stories・test は除いた）。
- Chakra の既定値（影、角丸、ボタンの outline 型、line 型タブの下線、入力欄の高さ 40px、背景幕 .36）は、`node_modules/@chakra-ui/react/dist/esm/theme/` のレシピとトークンを直接読んで確かめた。
- コントラスト比と色差は Python（numpy）で計算した。色覚の模擬は Machado 2009 の行列（重度 1.0）を線形 RGB に掛けて求め、色差は CIEDE2000 で測った。候補として teal / amber / violet、teal / orange / violet、cyan / amber / purple、Okabe-Ito 系、teal / amber / fuchsia、teal / amber / zinc の各段を比べ、3種類の色覚の模擬すべてで最も近い2色の色差がいちばん大きく、しかもアクセントの青と重ならない組み合わせを選んだ。
- まだ確かめていないこと: Noto Sans JP で `tabular-nums` が効くかどうか（効かなくても害はない。右揃えにしておけば困らない）。モックで実際に表示して確かめる。
