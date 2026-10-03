/**
 * ドメインの型（正本: docs/03_ui_spec.md §1.1・§4.0.2・§6、docs/02_settlement.md §1・§2）
 *
 * - 画面の言葉と内部名の対応は仕様書 §1.1。ここでは内部名（英語）を使う。
 * - 金額はすべて円の整数。符号つきで持ち、画面でいつも正の数にするのは UI の仕事（§6.1）。
 */

/** 人。a = まさと、b = りさこ（並びは2台とも a → b。§6.1） */
export type PersonKey = 'a' | 'b'

/** 払った人。'joint' = 共用（DB では paid_by = null）。§1.1 */
export type Payer = PersonKey | 'joint'

/** 記録した人。'auto' = 毎月の支払いから作られた行（画面では「毎月」） */
export type RecordedBy = PersonKey | 'auto'

/** 月 'YYYY-MM'（JST のカレンダー月） */
export type MonthKey = string
/** 日付 'YYYY-MM-DD'（JST） */
export type DateKey = string
/** 日時 'YYYY-MM-DDTHH:mm'（JST）。文字列のまま比べられる形で持つ */
export type DateTimeKey = string

/** カテゴリ（15個・1階層で固定。§8。key は DB の categories.id と同じ） */
export type CategoryKey =
  | 'groceries'
  | 'dining'
  | 'household_goods'
  | 'transport'
  | 'leisure'
  | 'entertainment'
  | 'social'
  | 'housing'
  | 'utilities'
  | 'telecom'
  | 'insurance'
  | 'medical'
  | 'big_purchase'
  | 'tax'
  | 'other'

/** カテゴリの定義（§8） */
export interface Category {
  key: CategoryKey
  /** 表示名（§8 の「表示名」） */
  name: string
  /** Lucide のアイコン名（§8） */
  icon: string
  /** S-32 の名前からの推測に使う語（§8） */
  guess: readonly string[]
}

/** 月の状態（§4.0.2 の正本）。進行中・締め待ちは保存せず日付から決まる */
export type MonthStatus = 'open' | 'closing' | 'confirmed' | 'settled'

/** 保存する月の状態（月の精算の行に持つ値。null = やり直した後） */
export type StoredMonthStatus = 'confirmed' | 'settled' | null

/** S-20 の状態キー（8つ。§4.0.1・S-20「状態の決め方」） */
export type S20State = 'settled' | 'transfer' | 'empty' | 'undecided' | 'estimate' | 'prep' | 'redo' | 'ready'

/** 毎月の支払いのひな形の種類（§1.1）。fixed = 毎月同じ、variable = 金額待ち */
export type AmountKind = 'fixed' | 'variable'

/** 記録（S-12）を開いたときの払った人の既定（§1.1 `default_payer`） */
export type DefaultPayer = 'self' | 'joint'

/** 端末に保留した記録の状態（§3.6）。null = 送信済み */
export type SyncState = 'pending' | 'failed' | null

/** 動かす額の向き（§6.1）。in = 共用へ入れる、out = 共用から受け取る、none = 動かすお金はありません */
export type FlowDirection = 'in' | 'out' | 'none'

/** 共用の過不足の向き（§1.1）。remain = 共用に残る、draw = 共用の残高から出る、same = 変わらない */
export type JointNetKind = 'remain' | 'draw' | 'same'

/** 人ごとの金額（円の整数） */
export type PersonAmounts = Record<PersonKey, number>
/** 人ごとの金額（決まっていなければ null） */
export type PersonAmountsOrNull = Record<PersonKey, number | null>
/** 人ごとの ある・なし（給料の入り先など） */
export type PersonFlags = Record<PersonKey, boolean>

/** 人（§9.1） */
export interface Person {
  /** ログインに使う ID（擬似メールの左側） */
  id: string
  /** 呼び名（6文字まで。§1.4） */
  name: string
  /** 識別色（§7.2）。a = ティール、b = アンバー */
  color: PersonKey
  /** 出す割合（% の整数。§6.2）。**本人だけが変えられる**（§2.2。2026-09-23 の決定） */
  ratePct: number
  /**
   * 給料の入り先（S-33）。true = 共用口座に入る、false = 自分の口座（既定）。
   * **本人だけが変えられる**（お金の入り方は本人の事情なので、出す割合と同じ扱い。§2.2）
   */
  salaryToJoint: boolean
  /** 記録の払った人の既定（S-30） */
  defaultPayer: DefaultPayer
  /** 最後に S-10 を見た日時（新着の判定。§1.1）。null = まだ見ていない */
  lastSeen: DateTimeKey | null
}

/** 家計（§9） */
export interface Household {
  /** 家計を作った月。月の範囲の下限（§2.1） */
  createdMonth: MonthKey
  appName: string
  /** 擬似メールの固定ドメイン（docs/05_platform.md §0） */
  emailDomain: string
}

/** 毎月の支払い（ひな形。§9.2） */
export interface FixedCostTemplate {
  id: string
  /** 名前（画面に出す。行に写される） */
  name: string
  cat: CategoryKey
  payer: Payer
  kind: AmountKind
  /** 毎月同じの金額。金額待ちは null */
  amount: number | null
  /** 行を作り始める月 */
  from: MonthKey
  /** やめた月（この月からは作らない）。null = 続いている */
  until: MonthKey | null
  createdBy: PersonKey
  /** 追加した日時（追加を元に戻せるのは1分のあいだだけ。04 delete_template） */
  createdAt: DateTimeKey
}

/**
 * ひな形の値（履歴の「変更の前」「変更の後」。DB の jsonb は name・category_id・paid_by・amount_kind・amount、
 * 0011 からは start_month も）
 */
export interface TemplateValues {
  name: string
  cat: CategoryKey
  payer: Payer
  kind: AmountKind
  /** 毎月同じの金額。金額待ちは null */
  amount: number | null
  /**
   * 開始月（行を作り始める月。jsonb の start_month）。0011 より前に書いた履歴には無い。
   * S-35 は前と後の両方にあって違うときだけ「記録を始める月 10月分 → 9月分」を出す
   */
  from?: MonthKey
}

/**
 * 毎月の支払いの変更の履歴（S-35。DB は public.fixed_cost_template_changes。トリガーだけが書く）。
 * add = 追加した、update = 直した、stop = やめた。
 */
export interface TemplateChange {
  id: string
  templateId: string
  change: 'add' | 'update' | 'stop'
  /** 何月分から効くか（「10月分から」） */
  from: MonthKey
  /** 変更の前の値（add は null） */
  before: TemplateValues | null
  /** 変更の後の値（stop は null） */
  after: TemplateValues | null
  /** 変えた人（DB で人が分からない古い行だけ null） */
  by: PersonKey | null
  at: DateTimeKey
}

/** 記録（§9.4・§9.5。DB は public.expenses） */
export interface Expense {
  id: string
  /** 日付（DB の spent_on）。毎月の支払いの行は対象月の1日 */
  date: DateKey
  /** 帰属月（DB の accounting_month）。どの月の精算に入れるか */
  month: MonthKey
  /** 対象月「（◯月分）」（DB の period_month）。毎月の支払いの行だけ。来月に回しても変わらない */
  labelMonth: MonthKey | null
  payer: Payer
  cat: CategoryKey
  /** 金額。null = 金額待ち（毎月の支払いの行だけ） */
  amount: number | null
  /** 手入力のメモ、または毎月の支払いの名前 */
  memo: string
  /** ひな形の ID（DB の fixed_cost_id）。null = 手入力の記録 */
  tpl: string | null
  /** 記録した人。'auto' = 毎月の支払いの行 */
  by: RecordedBy
  /** 記録した日時 */
  at: DateTimeKey
  /** 金額を入れた人（「金額: まさと 10/1」） */
  amountBy: PersonKey | null
  amountAt: DateTimeKey | null
  /** 今月はなし（§5.4） */
  skipped: boolean
  /** 端末に保留した記録（§3.6）。null = 送信済み */
  sync: SyncState
  /** 直した日時・人（「直した 9/23 8:10」） */
  editedAt: DateTimeKey | null
  editedBy: PersonKey | null
  /** 同じ日付の並び順を保つための通し番号（表示の安定のためだけに使う） */
  seq: number
}

/** 出す額（月ごと。§9.3。DB は month_contributions） */
export interface Contribution {
  /** 手取り */
  net: number
  /** 決めたときの割合（% の整数） */
  ratePct: number
  /**
   * 決めたときの給料の入り先（§6.2）。割合と同じで、あとで設定を変えても
   * 決めた月の精算は変わらない。
   */
  salaryToJoint: boolean
  /** 出す額 ＝ floor(net × ratePct ÷ 100) */
  amount: number
  /** 決めた人 */
  by: PersonKey
  at: DateTimeKey
}

/** その月の出す額（決まっていない人は入っていない） */
export type MonthContributions = Partial<Record<PersonKey, Contribution>>

/** 振込のチェック（§1.1 `transfer_check`） */
export interface SettlementCheck {
  /** 押した人（どちらのカードでも押せる） */
  by: PersonKey
  at: DateTimeKey
  /** その回の残り（符号つき） */
  amount: number
}

/** 済んだ分の明細（やり直したときに残るチェック。§7.1） */
export interface DoneEntry {
  /** 符号つき（入れた ＋、受け取った −） */
  amount: number
  at: DateTimeKey
  by: PersonKey
  /** そのチェックを付けた回（DB の settlement_checks.round と同じ。やり直しの元に戻すが使う） */
  round: number
}

/** ［この金額で精算］の時点に保存する値（§6.2 の最後の項） */
export interface SettlementSnapshot {
  contrib: PersonAmounts
  net: PersonAmountsOrNull
  ratePct: PersonAmounts
  /** 決めたときの給料の入り先（§6.2） */
  salaryToJoint: PersonFlags
  adv: PersonAmounts
  /** 共用に入った給料 ＝ 給料の入り先が共用なら min(手取り, 出す額)、そうでなければ 0（§6.2） */
  jointSalary: PersonAmounts
  joint: number
  total: number
  settle: PersonAmounts
  jointNet: number
}

/** 月の精算（DB は month_settlements。行があるのは一度でも精算した月だけ） */
export interface MonthSettlement {
  /** null = やり直した後（締め待ちか進行中として扱う） */
  status: StoredMonthStatus
  /** ［この金額で精算］を押した回数（やり直すたびに次の確定で +1） */
  round: number
  snapshot: SettlementSnapshot | null
  /** ［精算をやり直す］で捨てる前の確定時の値（元に戻すで書き戻す。02 §7・04 settle_undo_reopen） */
  undoSnapshot: SettlementSnapshot | null
  confirmedBy: PersonKey | null
  confirmedAt: DateTimeKey | null
  settledAt: DateTimeKey | null
  reopenedBy: PersonKey | null
  reopenedAt: DateTimeKey | null
  /** やり直しを元に戻すときの戻り先 */
  reopenedFrom: 'confirmed' | 'settled' | null
  /** 済んだ分（それまでの回のチェックの合計。符号つき） */
  transferred: PersonAmounts
  /** 済んだ分の明細 */
  done: Record<PersonKey, DoneEntry[]>
  /** いまの回のチェック */
  checks: Partial<Record<PersonKey, SettlementCheck>>
}

/** 家計のデータ一式（ローカル実装・テストで使う形） */
export interface HouseholdData {
  household: Household
  people: Record<PersonKey, Person>
  templates: FixedCostTemplate[]
  /**
   * 毎月の支払いの変更の履歴（古い順。S-35）。省略可（見本データ〈§9〉は持たない。
   * ローカル実装は読み込み時にひな形から「追加」を作る）
   */
  templateChanges?: TemplateChange[]
  contributions: Record<MonthKey, MonthContributions>
  expenses: Expense[]
  settlements: Record<MonthKey, MonthSettlement>
}

/** カテゴリ別の合計（S-13） */
export interface CategoryTotal {
  cat: CategoryKey
  amount: number
}

/** その月（帰属月）の集計（§6.2） */
export interface MonthSummary {
  m: MonthKey
  /** その月の記録すべて（金額待ち・今月はなし・未送信も含む） */
  rows: Expense[]
  /** もう払った分（立替） */
  adv: PersonAmounts
  /** もう払った分の明細（S-22） */
  advRows: Record<PersonKey, Expense[]>
  /** 共用払い */
  joint: number
  /** 支出合計 */
  total: number
  /** 合計に入れた件数 */
  count: number
  /** カテゴリ別（多い順） */
  byCat: CategoryTotal[]
  /** 金額待ちの行 */
  pending: Expense[]
  /** 毎月の支払いの行（金額待ちを除く） */
  fixedRows: Expense[]
  /** 毎月の支払いのまとまりの件数（金額ありの行。S-10・V9） */
  fixedCount: number
  /** 毎月の支払いのまとまりの合計 */
  fixedSum: number
  /** この月が対象月だが、来月に回して出ていった行（S-10 の「9月に回しました」） */
  deferredOut: Expense[]
  /** 手入力の記録 */
  manual: Expense[]
  /** 未送信の記録（合計に入れない） */
  unsent: Expense[]
}

/** 精算額と共用の過不足（§6.2） */
export interface SettleAmounts {
  /** 精算額 ＝ 出す額 − 立替 − 共用に入った給料 */
  settle: PersonAmounts
  /** 共用に入った給料（給料の入り先が自分の口座の人は 0） */
  jointSalary: PersonAmounts
  /** 共用の過不足 ＝ Σ出す額 − 支出合計（給料の入り先では変わらない） */
  jointNet: number
}

/**
 * 共用の月間収支（通帳の動き。§6.2・S-20 の注記）。
 *
 * `balance` ＝ Σ手取り(共用に入る人) ＋ Σ(正の精算額) − 共用払い − Σ|負の精算額|
 *           ＝ (Σ出す額 − 支出合計) ＋ Σ(手取り − 共用に入った給料)   ← 検算 V11
 */
export interface JointLedger {
  /** 共用に入る給料の合計（Σ手取り。入り先が共用の人だけ） */
  salaryIn: number
  /** そのうち出す額に充てた分の合計（Σ共用に入った給料） */
  salaryApplied: number
  /** 給料の残り ＝ salaryIn − salaryApplied（S-20 の注記「うち 給料の残り ◯円」） */
  salaryRemainder: number
  /** 共用の過不足（出す額ベース。Σ出す額 − 支出合計） */
  jointNet: number
  /** 共用に残る額（通帳の動き） */
  balance: number
  /** その月に給料が共用に入る人がいる（DB の `has_salary_to_joint` と同じ出力。**S-20 の注記の条件ではない**。注記は `salaryRemainder > 0` のときだけ。04 §8.2） */
  hasSalaryToJoint: boolean
}

/** 精算の見え方（S-20・S-22 で共通に使う。§6.2） */
export interface SettleModel {
  m: MonthKey
  status: MonthStatus
  rec: MonthSettlement | null
  sum: MonthSummary
  /** 出す額（決まっていなければ null） */
  contrib: PersonAmountsOrNull
  net: PersonAmountsOrNull
  ratePct: PersonAmounts
  /** その月の給料の入り先（決めた月は保存した値。§6.2） */
  salaryToJoint: PersonFlags
  /** もう払った分 */
  adv: PersonAmounts
  /** 共用に入った給料（S-22 の行）。decided でなければ 2人とも 0 */
  jointSalary: PersonAmounts
  joint: number
  total: number
  /** 2人とも出す額が決まっている */
  decided: boolean
  /** 動かす額（符号つき）。decided でなければ null */
  settle: PersonAmounts | null
  /** 共用の過不足。decided でなければ null */
  jointNet: number | null
  /** 共用の通帳の動き（S-20 の共用の行）。decided でなければ null */
  jointLedger: JointLedger | null
  /** 済んだ分 */
  transferred: PersonAmounts
  /** 残り ＝ 動かす額 − 済んだ分 */
  remaining: PersonAmounts | null
  checks: Partial<Record<PersonKey, SettlementCheck>>
  done: Record<PersonKey, DoneEntry[]>
  /** 金額待ちの行 */
  pending: Expense[]
  /** 済んだ分が 0 でない人がいる */
  hasTransferred: boolean
  /** チェックの記録がある（やり直した後。済んだ分の合計が 0 でも） */
  hasDone: boolean
}

/** 赤い点・お知らせ行（§3.2・§3.5）。kind 1 = 締め待ち、kind 2 = 自分のカードが未チェック */
export type Attention = { kind: 1; m: MonthKey } | { kind: 2; m: MonthKey; amount: number }

/** ［この金額で精算］を押せないわけ（§4.0.2 の条件 (1)〜(3)） */
export type ConfirmBlock =
  /** (1) 出す額が決まっていない */
  | { reason: 'undecided' }
  /** (2) 金額待ちが残っている */
  | { reason: 'pending'; count: number }
  /** (3) 前の月がまだ精算されていない（「先に8月を精算してください」） */
  | { reason: 'previous'; m: MonthKey }
  /** すでに精算中・精算済み（「9月はもう精算中です」） */
  | { reason: 'locked'; status: MonthStatus }
  /** まだ来ていない月（DB の future_month。04 §8.2 settle_confirm） */
  | { reason: 'future_month' }

/* ------------------------------------------------------------------ *
 * 別名（docs/04_data_model.md §8.2 の RPC が使っている名前）
 * データ層（data/）は 04 の語彙で読むので、同じ型に別名を付けておく。
 * ------------------------------------------------------------------ */

/** `direction`（04 §8.2）= 動かす額の向き */
export type Direction = FlowDirection
/** `view_state`（04 §8.2 month_summary）= S-20 の状態キー */
export type SettleViewState = S20State
/** `blocker`（04 §8.2 month_summary）= ［この金額で精算］を押したら止まる理由 */
export type Blocker = ConfirmBlock
/** `notice`（04 §8.2 app_status）= お知らせ行・赤い点 */
export type Notice = Attention
