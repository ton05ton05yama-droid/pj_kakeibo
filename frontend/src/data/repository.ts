/**
 * データ層のインターフェース。画面はこの形だけを見る。
 *
 * 実装は2つ（`data/index.ts` が環境変数で選ぶ）:
 *   - `data/local/`     仕様書 §9 の見本データを使うメモリ実装（Supabase を作る前の開発用）
 *   - `data/supabase/`  `@supabase/supabase-js` を使う実装
 *
 * 決まり（04 §0・CLAUDE.md §3）
 * - 読むのは `loadSnapshot()` 1つ。画面に出す数字は、その `HouseholdData` から `domain/` の
 *   純粋関数（`settleModel`・`s20State`・`attention` など）で出す。データ層は計算しない。
 * - 状態が移るもの・判定が要るもの（精算・出す額・来月に回す・ひな形をやめる）は RPC。
 *   戻り値は `RpcResult` で、画面の1行（§1.4）に当てられる `reason` を持つ。
 * - 精算の操作は冪等（チェックは「反転」ではなく「付ける／外す」を送る）。
 * - 画面が持っている数字を信じて書き込まない（確定は見ていた額を渡し、違えば `stale`）。
 */
import type {
  CategoryKey,
  DateTimeKey,
  Expense,
  HouseholdData,
  MonthKey,
  Payer,
  PersonAmounts,
  PersonKey,
} from '../domain'

/* ------------------------------------------------------------------ *
 * 戻り値
 * ------------------------------------------------------------------ */

export interface RpcOk<T> {
  result: 'ok'
  value: T
}
/** もうその状態だった（冪等。押し直し・2台の二重押し） */
export interface RpcAlready<T> {
  result: 'already'
  value: T
}
/**
 * `blocked` の `detail` の形（reason ごと。ここに無い reason は detail を持たない）。
 *
 * 両方の実装がこの形にそろえる（ローカル実装が正。Supabase 実装は RPC の json を写し替える）。
 */
export interface BlockedDetails {
  /** 「先に8月を精算してください」 */
  previous_month: { m: MonthKey }
  /** 「金額待ちが2件あります」 */
  pending: { count: number }
  /** 先月の手取りが無くて［この額で決める］が使えない人 */
  no_previous: { people: PersonKey[] }
}

/** detail を持たない reason の detail */
export type EmptyDetail = Record<string, never>

/** その reason の detail の形 */
export type BlockedDetail<R extends string> = R extends keyof BlockedDetails ? BlockedDetails[R] : EmptyDetail

/** reason の union で分配する（`reason` で絞ると detail の形も決まる） */
type BlockedOf<R extends string> = R extends string ? { result: 'blocked'; reason: R; detail: BlockedDetail<R> } : never

/**
 * 条件が合わないので何もしなかった。
 * `RpcResult<T, never>`（止まる理由が決まっていない操作）でも `result === 'blocked'` を見られるよう、
 * reason が never のときだけ分配せずに1つの形にする。
 */
export type RpcBlocked<R extends string> = [R] extends [never]
  ? { result: 'blocked'; reason: string; detail: EmptyDetail }
  : BlockedOf<R>

/** `blocked` を作る（両方の実装で使う） */
export function rpcBlocked<R extends string>(reason: R, detail: BlockedDetail<R>): RpcBlocked<R> {
  return { result: 'blocked', reason, detail } as unknown as RpcBlocked<R>
}
/** 見ていた数字と違う（［この金額で精算］だけ） */
export interface RpcStale {
  result: 'stale'
}

export type RpcResult<T, R extends string = never> = RpcOk<T> | RpcAlready<T> | RpcBlocked<R>

/** 書き込みの途中で止まったもの（例外。画面は §1.4 の1行を出す） */
export class RepositoryError extends Error {
  readonly code: 'month_locked' | 'fixed_row_immutable' | 'not_member' | 'not_allowed' | 'offline' | 'unknown'
  readonly detail: string | null
  constructor(code: RepositoryError['code'], message: string, detail: string | null = null) {
    super(message)
    this.name = 'RepositoryError'
    this.code = code
    this.detail = detail
  }
}

/** ログインで止まったもの（S-01 の「ID かパスワードが違います」） */
export class AuthError extends Error {
  readonly code: 'invalid_credentials' | 'offline' | 'unknown'
  constructor(code: AuthError['code'], message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

/* ------------------------------------------------------------------ *
 * 入出力
 * ------------------------------------------------------------------ */

/** 画面が使う1回ぶんの読み込み（家計のデータ・「今日」・ログイン中の人） */
export interface Snapshot {
  data: HouseholdData
  /** 「今日」（サーバーの日付 ＋ 端末の時刻。02 §10 C10） */
  now: DateTimeKey
  /** ログイン中の人 */
  viewer: PersonKey
  /** S-02（はじめに）を済ませたか。null ならまだ */
  onboardedAt: DateTimeKey | null
}

/** 記録を1件足す（S-12）。id は端末で採番してよい（04 §2.5） */
export interface NewExpenseInput {
  id: string
  date: string
  cat: CategoryKey
  amount: number
  payer: Payer
  memo: string
}

/** 記録を直す（S-14）。渡した項目だけ変える */
export interface ExpensePatch {
  date?: string
  cat?: CategoryKey
  amount?: number
  payer?: Payer
  memo?: string
}

/** 毎月の支払いのひな形を足す・直す（S-32） */
export interface TemplateInput {
  name: string
  cat: CategoryKey
  payer: Payer
  kind: 'fixed' | 'variable'
  amount: number | null
}

export interface SessionUser {
  viewer: PersonKey
}

export interface AuthRepository {
  /** いまのセッション（無ければ null） */
  currentUser(): Promise<SessionUser | null>
  /** ID とパスワードでログイン（ID は固定ドメインの擬似メールに変える。05 §4） */
  signIn(loginId: string, password: string): Promise<SessionUser>
  signOut(): Promise<void>
  /** S-34 パスワードを変える */
  updatePassword(newPassword: string): Promise<void>
  /** セッションが変わったら呼ぶ（戻り値は購読をやめる関数） */
  onChange(listener: (user: SessionUser | null) => void): () => void
}

export interface Repository {
  readonly auth: AuthRepository

  /** 家計のデータ一式。毎月の支払いの行の生成（`ensure_month`）もここで済ませる */
  loadSnapshot(): Promise<Snapshot>

  /* 記録（S-12・S-14・S-15） -------------------------------------- */

  addExpense(input: NewExpenseInput): Promise<Expense>
  updateExpense(id: string, patch: ExpensePatch): Promise<Expense>
  deleteExpense(id: string): Promise<void>
  /** 消したのを元に戻す（同じ id・記録日時で入れ直す。04 §2.5） */
  restoreExpense(expense: Expense): Promise<Expense>
  /** 金額待ちに金額を入れる（S-15） */
  fillAmount(id: string, amount: number): Promise<Expense>

  /* 端末に保留した記録（§3.6・05 §6.5） ---------------------------- *
   * オフラインで保留するのは **記録の追加だけ**。直す・消す・金額待ち・出す額・
   * 精算の操作・設定は絶対に保留しない（2台の操作がぶつかるのを防ぐ）。 */

  /** オフラインのときに記録を端末へ保留する（id は端末で採番済みなので送り直しても二重にならない） */
  enqueueExpense(input: NewExpenseInput): Promise<void>
  /** 保留中の記録（`sync` が 'pending' か 'failed' の行） */
  pendingExpenses(): Promise<Expense[]>
  /** 保留中の記録を送る（送れなければ 'failed' にする。つながらないときは残す） */
  flushPending(): Promise<void>
  /** 保留中の記録を端末から消す（S-14 `unsent` の［削除］。DB には何も送らない） */
  dropPending(id: string): Promise<void>
  /** 保留中の記録を直す（S-14 `unsent` の［保存］。同じ id で置き換える＝送り直しても二重にならない） */
  updatePending(id: string, input: NewExpenseInput): Promise<void>
  /** 今月はなし（毎月の支払いの行だけ。`skipped` を指定する＝冪等） */
  setSkipped(id: string, skipped: boolean): Promise<Expense>
  /** 来月に回す（`undo` で1か月戻す） */
  deferExpense(
    id: string,
    undo?: boolean
  ): Promise<RpcResult<{ month: MonthKey }, 'not_fixed_row' | 'not_pending' | 'nothing_to_undo'>>

  /* 出す額（S-20・S-21） ------------------------------------------ */

  /** 出す額を決める。`nets` が null なら［この額で決める］（先月の手取りで） */
  decideContributions(
    m: MonthKey,
    nets: Partial<Record<PersonKey, number>> | null
  ): Promise<RpcResult<{ decidedAt: DateTimeKey }, 'locked' | 'no_previous'>>
  /** 出す額を決めたのを元に戻す（トーストの「元に戻す」） */
  undoDecideContributions(m: MonthKey, decidedAt: DateTimeKey): Promise<RpcResult<null, 'locked' | 'changed'>>

  /* 精算（S-20） --------------------------------------------------- */

  /** ［この金額で精算］。`expected` は見ていたカードの「あと」（違えば stale） */
  confirmMonth(
    m: MonthKey,
    expected: PersonAmounts | null
  ): Promise<
    | RpcOk<{ status: 'confirmed' | 'settled'; round: number }>
    | RpcAlready<{ status: 'confirmed' | 'settled' }>
    | RpcBlocked<'future_month' | 'previous_month' | 'undecided' | 'pending'>
    | RpcStale
  >
  /** ［入れた］［受け取った］（付ける／外すを指定する＝冪等） */
  setCheck(
    m: MonthKey,
    person: PersonKey,
    checked: boolean
  ): Promise<RpcResult<{ status: 'confirmed' | 'settled' }, 'not_locked' | 'nothing_to_move'>>
  /** ［精算をやり直す］ */
  reopenMonth(m: MonthKey): Promise<RpcResult<{ round: number }, never>>
  /** ［この金額で精算］のトーストの元に戻す */
  undoConfirm(m: MonthKey, round: number): Promise<RpcResult<null, 'checked'>>
  /** ［精算をやり直す］のトーストの元に戻す */
  undoReopen(m: MonthKey, round: number): Promise<RpcResult<{ status: 'confirmed' | 'settled' }, 'changed'>>

  /* 設定（S-02・S-30・S-33） --------------------------------------- */

  /**
   * 呼び名・色（**2人とも**変えられる。色を選ぶと相手は残りの色になる。§2.2）。
   *
   * `ratePct` は **本人の行にだけ**効く。相手の行に渡しても出す割合は変わらない
   * （2026-09-23 の決定。出す割合は本人だけ）。新しい画面は `updateContributionRate()` を使い、
   * ここには呼び名と色だけを渡す。
   */
  updatePerson(person: PersonKey, patch: { name: string; color: PersonKey; ratePct?: number }): Promise<void>
  /** 出す割合（**本人だけ**。S-33。`updateDefaultPayer` と同じ仕組み） */
  updateContributionRate(ratePct: number): Promise<void>
  /** 給料の入り先（**本人だけ**。S-33。true = 共用口座、false = 自分の口座） */
  updateSalaryToJoint(salaryToJoint: boolean): Promise<void>
  /** 記録の既定の払った人（本人だけ） */
  updateDefaultPayer(value: 'self' | 'joint'): Promise<void>
  /** 支出タブを見た時刻（新着の判定） */
  updateLastSeen(at: DateTimeKey): Promise<void>
  /** S-02（はじめに）を済ませた */
  markOnboarded(at: DateTimeKey): Promise<void>

  /* 毎月の支払い（S-31・S-32） ------------------------------------- */

  addTemplate(input: TemplateInput): Promise<void>
  updateTemplate(id: string, input: TemplateInput): Promise<void>
  /** 支払いをやめる（`undo` で取り消す）。`until` はトーストの「（10月から）」 */
  stopTemplate(id: string, undo?: boolean): Promise<RpcResult<{ until: MonthKey | null }, never>>
  /** 追加を元に戻す（作った人が作った直後に、行が手つかずのときだけ） */
  deleteTemplate(id: string): Promise<RpcResult<null, 'not_found' | 'too_late' | 'locked_rows'>>
}
