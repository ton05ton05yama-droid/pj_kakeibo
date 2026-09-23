/**
 * お金の計算と月の状態（正本: docs/03_ui_spec.md §4.0.2・§6.2・S-20、docs/02_settlement.md §2〜§7）
 *
 * ここはすべて純粋関数。DOM も日付の「いま」も触らない（「今日」は必ず引数 now で受け取る。02 §10 C10）。
 * 金額は円の整数で、符号つきで持つ（画面でいつも正の数にするのは UI の仕事。§6.1）。
 * モックの CALC（mock/index.html §2）と同じふるまいにする。
 */
import { addMonth, monthOf, monthsBetween } from './month'
import type {
  Attention,
  CategoryKey,
  CategoryTotal,
  ConfirmBlock,
  DoneEntry,
  Expense,
  FlowDirection,
  HouseholdData,
  JointNetKind,
  MonthContributions,
  MonthKey,
  MonthSettlement,
  MonthStatus,
  MonthSummary,
  PersonAmounts,
  PersonAmountsOrNull,
  PersonKey,
  S20State,
  SettleAmounts,
  SettleModel,
} from './types'

/** 人の並び（2台とも まさと → りさこ。§6.1） */
export const PERSON_KEYS: readonly PersonKey[] = ['a', 'b']

/**
 * 出す額 ＝ floor(手取り × 割合 ÷ 100)（§6.2・§6.3 ケースL）。
 * 割合は % の整数で持つ。手取りも割合も非負なので、切り捨て ＝ 整数除算と同じ（DB の整数の割り算と一致する）。
 */
export const contributionOf = (net: number, ratePct: number): number => Math.floor((net * ratePct) / 100)

/**
 * その月に使う出す割合（§6.2）。
 * その月に保存した割合があればそれ（決め直しても変えない）、無ければ人の設定の割合。
 */
export function rateFor(d: HouseholdData, m: MonthKey, p: PersonKey): number {
  const c = d.contributions[m]?.[p]
  return c ? c.ratePct : d.people[p].ratePct
}

/** 金額待ち ＝ 毎月の支払いの行で、金額が無く、今月はなしでもない（§5.2） */
export const isPending = (e: Expense): boolean => e.tpl !== null && e.amount === null && !e.skipped

/** 合計に入れる ＝ 金額が入っていて、今月はなしでなく、未送信でない（§6.2・V7） */
export const isCounted = (e: Expense): boolean => e.amount !== null && !e.skipped && e.sync === null

/** ロック中（記録・出す額を直せない）の月か（§2.3） */
export const isLockedStatus = (st: MonthStatus): boolean => st === 'confirmed' || st === 'settled'

/** 動かす額の向き（§6.1）。＞0 = 共用へ入れる、＜0 = 共用から受け取る、0 = 動かすお金はありません */
export const flowOf = (amount: number): FlowDirection => (amount > 0 ? 'in' : amount < 0 ? 'out' : 'none')

/** 共用の過不足の向き（§1.1）。＞0 = 残ります、＜0 = 残高から出ます、0 = 変わりません */
export const jointNetKindOf = (jointNet: number): JointNetKind =>
  jointNet > 0 ? 'remain' : jointNet < 0 ? 'draw' : 'same'

/** その月（帰属月）の集計（§6.2） */
export function summarize(expenses: readonly Expense[], m: MonthKey): MonthSummary {
  const rows = expenses.filter((e) => e.month === m)
  const adv: PersonAmounts = { a: 0, b: 0 }
  const advRows: Record<PersonKey, Expense[]> = { a: [], b: [] }
  let joint = 0
  let total = 0
  let count = 0
  const byCatMap = new Map<CategoryKey, number>()
  for (const e of rows) {
    if (!isCounted(e) || e.amount === null) continue
    count++
    total += e.amount
    if (e.payer === 'joint') joint += e.amount
    else {
      adv[e.payer] += e.amount
      advRows[e.payer].push(e)
    }
    byCatMap.set(e.cat, (byCatMap.get(e.cat) ?? 0) + e.amount)
  }
  const byCat: CategoryTotal[] = [...byCatMap.entries()]
    .map(([cat, amount]) => ({ cat, amount }))
    .sort((x, y) => y.amount - x.amount)
  const pending = rows.filter(isPending)
  const fixedRows = rows.filter((e) => e.tpl !== null && !isPending(e))
  const fixedCounted = fixedRows.filter(isCounted)
  const fixedSum = fixedCounted.reduce((s, e) => s + (e.amount ?? 0), 0)
  /** この月が対象月なのに、来月に回して出ていった行（S-10 の「9月に回しました」。§5.3） */
  const deferredOut = expenses.filter((e) => e.tpl !== null && e.labelMonth === m && e.month !== m)
  const manual = rows.filter((e) => e.tpl === null)
  const unsent = rows.filter((e) => e.sync !== null)
  return {
    m,
    rows,
    adv,
    advRows,
    joint,
    total,
    count,
    byCat,
    pending,
    fixedRows,
    fixedCount: fixedCounted.length,
    fixedSum,
    deferredOut,
    manual,
    unsent,
  }
}

/** 精算額_i ＝ 出す額_i − 立替_i、共用の過不足 ＝ Σ出す額 − 支出合計（§6.2） */
export function computeSettle(contrib: PersonAmounts, adv: PersonAmounts, total: number): SettleAmounts {
  return {
    settle: { a: contrib.a - adv.a, b: contrib.b - adv.b },
    jointNet: contrib.a + contrib.b - total,
  }
}

/** 残り_i ＝ 精算額_i − 済んだ分_i（済んだ分は 入れた ＋、受け取った −。§7.1） */
export const remainingOf = (settle: PersonAmounts, transferred: PersonAmounts): PersonAmounts => ({
  a: settle.a - transferred.a,
  b: settle.b - transferred.b,
})

/**
 * 月の状態（§4.0.2）。
 * 精算中・精算済みは保存した値、進行中・締め待ちは日付だけで決まる。
 */
export function monthStatus(d: HouseholdData, m: MonthKey, now: string): MonthStatus {
  const rec = d.settlements[m]
  if (rec?.status) return rec.status
  return m < monthOf(now) ? 'closing' : 'open'
}

/**
 * 精算の見え方（S-20・S-22 で共通）。
 * 精算中・精算済みは［この金額で精算］の時点に保存した値から出す（§6.2）。
 */
export function settleModel(d: HouseholdData, m: MonthKey, now: string): SettleModel {
  const status = monthStatus(d, m, now)
  const rec = d.settlements[m] ?? null
  const sum = summarize(d.expenses, m)
  const cm = d.contributions[m] ?? {}
  const snap = isLockedStatus(status) && rec?.snapshot ? rec.snapshot : null
  const contrib: PersonAmountsOrNull = snap
    ? { ...snap.contrib }
    : { a: cm.a ? cm.a.amount : null, b: cm.b ? cm.b.amount : null }
  const net: PersonAmountsOrNull = snap ? { ...snap.net } : { a: cm.a ? cm.a.net : null, b: cm.b ? cm.b.net : null }
  const ratePct: PersonAmounts = snap ? { ...snap.ratePct } : { a: rateFor(d, m, 'a'), b: rateFor(d, m, 'b') }
  const adv: PersonAmounts = snap ? { ...snap.adv } : { ...sum.adv }
  const joint = snap ? snap.joint : sum.joint
  const total = snap ? snap.total : sum.total
  const ca = contrib.a
  const cb = contrib.b
  const amounts = ca !== null && cb !== null ? computeSettle({ a: ca, b: cb }, adv, total) : null
  const transferred: PersonAmounts = rec ? { ...rec.transferred } : { a: 0, b: 0 }
  const remaining = amounts ? remainingOf(amounts.settle, transferred) : null
  const done: Record<PersonKey, DoneEntry[]> = rec ? { a: [...rec.done.a], b: [...rec.done.b] } : { a: [], b: [] }
  return {
    m,
    status,
    rec,
    sum,
    contrib,
    net,
    ratePct,
    adv,
    joint,
    total,
    decided: amounts !== null,
    settle: amounts ? amounts.settle : null,
    jointNet: amounts ? amounts.jointNet : null,
    transferred,
    remaining,
    checks: rec ? { ...rec.checks } : {},
    done,
    pending: sum.pending,
    hasTransferred: transferred.a !== 0 || transferred.b !== 0,
    /** チェックの記録がある（やり直した後。済んだ分の合計が 0 でも。S-20 `redo`） */
    hasDone: done.a.length > 0 || done.b.length > 0,
  }
}

/**
 * S-20 の状態（上から順に当てはまったもの。S-20「状態の決め方」・02 §2.4）。
 *
 * @param settleNow ［この月を精算する］を押した月（画面の状態だけで保存しない。§6.3 ケースM）。
 *   その月は、月の途中でも `estimate` を飛ばして `prep` ／ `ready` になる。
 */
export function s20State(d: HouseholdData, model: SettleModel, settleNow?: MonthKey | null): S20State {
  if (model.status === 'settled') return 'settled'
  if (model.status === 'confirmed') return 'transfer'
  // empty: その月にも前の月にも、出す額を決めた人がいない
  const cm = d.contributions[model.m] ?? {}
  const pm = d.contributions[addMonth(model.m, -1)] ?? {}
  if (!(cm.a || cm.b || pm.a || pm.b)) return 'empty'
  if (!model.decided) return 'undecided'
  // 月の途中は見込み。ただし［この月を精算する］を押した月と、やり直し中の月は片付け／精算のモードにする
  if (model.status === 'open' && settleNow !== model.m && !model.hasDone) return 'estimate'
  if (model.pending.length > 0) return 'prep'
  if (model.hasDone) return 'redo'
  return 'ready'
}

/** その月の精算の記録（一度も精算していない月は null） */
export const settlementOf = (d: HouseholdData, m: MonthKey): MonthSettlement | null => d.settlements[m] ?? null

/** その月の出す額（決めた人だけ入っている） */
export const contributionsOf = (d: HouseholdData, m: MonthKey): MonthContributions => d.contributions[m] ?? {}

/** お知らせ行の種類（04 §8.2 の notice.kind）。条件1 = closing、条件2 = transfer */
export const noticeKind = (a: Attention): 'closing' | 'transfer' => (a.kind === 1 ? 'closing' : 'transfer')

/** 家計を作った月から今月まで（古い順。§2.1） */
export function monthsUntil(d: HouseholdData, now: string): MonthKey[] {
  return monthsBetween(d.household.createdMonth, monthOf(now))
}

/**
 * 赤い点・お知らせ行（§3.2・§3.5。条件は同じ）。一番古い月の1つだけを返す（02 §10 C9）。
 * どちらも「月が終わったあと」だけ出す（月の途中に精算した月も、その月が終わるまで出さない）。
 */
export function attention(d: HouseholdData, viewer: PersonKey, now: string): Attention | null {
  for (const m of monthsUntil(d, now)) {
    const st = monthStatus(d, m, now)
    // 条件1: 月が終わったのに、まだ［この金額で精算］を押していない
    if (st === 'closing') return { kind: 1, m }
    // 条件2: 月が終わった精算中の月で、自分のカードが未チェック
    if (st === 'confirmed' && m < monthOf(now)) {
      const md = settleModel(d, m, now)
      if (md.remaining && md.remaining[viewer] !== 0 && !md.checks[viewer]) {
        return { kind: 2, m, amount: md.remaining[viewer] }
      }
    }
  }
  return null
}

/** 精算タブの既定の月（§3.4）: 締め待ちか精算中の月のうち一番古い月。無ければ今月 */
export function defaultSettleMonth(d: HouseholdData, now: string): MonthKey {
  for (const m of monthsUntil(d, now)) {
    const st = monthStatus(d, m, now)
    if (st === 'closing' || st === 'confirmed') return m
  }
  return monthOf(now)
}

/** 支出タブの既定の月（§3.4）: 今月 */
export const defaultExpenseMonth = (now: string): MonthKey => monthOf(now)

/**
 * ［この金額で精算］を押せないわけ（§4.0.2 の条件 (1)〜(3)）。押せるなら null。
 * 文言は §1.4（「先に8月を精算してください」など）。UI 側で当てる。
 *
 * 見る順は DB とそろえる（locked → 前の月 → 出す額 → 金額待ち。
 * supabase/migrations/0005_rpc.sql の settle_confirm と 0006_rpc_month_summary.sql の blocker）。
 * 2つ以上が同時に欠けている月でも、2台と DB で同じ理由が出るようにするため。
 */
export function confirmBlock(d: HouseholdData, m: MonthKey, now: string): ConfirmBlock | null {
  const status = monthStatus(d, m, now)
  if (isLockedStatus(status)) return { reason: 'locked', status }
  const prev = addMonth(m, -1)
  if (prev >= d.household.createdMonth) {
    const ps = monthStatus(d, prev, now)
    if (!isLockedStatus(ps)) return { reason: 'previous', m: prev }
  }
  const model = settleModel(d, m, now)
  if (!model.decided) return { reason: 'undecided' }
  if (model.pending.length > 0) return { reason: 'pending', count: model.pending.length }
  return null
}

/** 来月に回せるか（§5.3・S-15）: 金額待ちの行で、翌月がロックされていないとき */
export function canDefer(d: HouseholdData, e: Expense, now: string): boolean {
  if (!isPending(e)) return false
  return !isLockedStatus(monthStatus(d, addMonth(e.month, 1), now))
}

/** 新着（§1.1）: 相手が足した手入力の記録で、自分が最後に見たあとに作られたもの */
export function isNewExpense(e: Expense, viewer: PersonKey, lastSeen: string | null): boolean {
  if (lastSeen === null) return false
  if (e.by === 'auto' || e.by === viewer) return false
  return e.at > lastSeen
}

/** その月の新着の件数（S-10 のバッジ） */
export function countNewExpenses(d: HouseholdData, viewer: PersonKey, m: MonthKey): number {
  const lastSeen = d.people[viewer].lastSeen
  return d.expenses.filter((e) => e.month === m && isNewExpense(e, viewer, lastSeen)).length
}
