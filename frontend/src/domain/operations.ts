/**
 * データを変える操作（正本: docs/02_settlement.md §2・§5・§7、docs/03_ui_spec.md §6.5・S-20）
 *
 * 計算（calc.ts）は純粋関数だが、ここは渡された家計のデータ（HouseholdData）をその場で書き換える。
 * 本番では同じことを DB の関数（RPC）が行う（04 §8）。ローカル実装とテストはこの関数を使い、
 * モックの MODEL（mock/index.html §3）と同じふるまいにする。
 */

import {
  contributionOf,
  isLockedStatus,
  isPending,
  monthStatus,
  PERSON_KEYS,
  rateFor,
  remainingOf,
  settleModel,
} from './calc'
import { addMonth, monthOf } from './month'
import type {
  Contribution,
  DateTimeKey,
  Expense,
  FixedCostTemplate,
  HouseholdData,
  MonthKey,
  MonthSettlement,
  PersonKey,
} from './types'
import { assertAmount, assertNet } from './validate'

let seq = 0
/** 並び順を保つための通し番号（表示の安定のためだけに使う） */
export const nextSeq = (): number => ++seq

/** 記録を1件作る（毎月の支払いの行は tpl を渡す） */
export interface NewExpense {
  id: string
  date: string
  payer: Expense['payer']
  cat: Expense['cat']
  amount: number | null
  memo: string
  by: Expense['by']
  at: DateTimeKey
  /** 帰属月（既定は日付の月） */
  month?: MonthKey | undefined
  /** 対象月「（◯月分）」（毎月の支払いの行だけ。既定は日付の月） */
  labelMonth?: MonthKey | undefined
  tpl?: string | null | undefined
  amountBy?: PersonKey | null | undefined
  amountAt?: DateTimeKey | null | undefined
  skipped?: boolean | undefined
  sync?: Expense['sync'] | undefined
}

export function createExpense(x: NewExpense): Expense {
  // 金額待ち（amount === null）は毎月の支払いの行だけ。入っているときは範囲を見る（D10）
  if (x.amount !== null) assertAmount(x.amount)
  const tpl = x.tpl ?? null
  return {
    id: x.id,
    date: x.date,
    month: x.month ?? monthOf(x.date),
    labelMonth: tpl ? (x.labelMonth ?? monthOf(x.date)) : null,
    payer: x.payer,
    cat: x.cat,
    amount: x.amount,
    memo: x.memo,
    tpl,
    by: x.by,
    at: x.at,
    amountBy: x.amountBy ?? null,
    amountAt: x.amountAt ?? null,
    skipped: x.skipped ?? false,
    sync: x.sync ?? null,
    editedAt: null,
    editedBy: null,
    seq: nextSeq(),
  }
}

/** 精算の行の初期値（一度も精算していない月には行が無い） */
export function createMonthSettlement(): MonthSettlement {
  return {
    status: null,
    round: 0,
    snapshot: null,
    undoSnapshot: null,
    confirmedBy: null,
    confirmedAt: null,
    settledAt: null,
    reopenedBy: null,
    reopenedAt: null,
    reopenedFrom: null,
    transferred: { a: 0, b: 0 },
    done: { a: [], b: [] },
    checks: {},
  }
}

export const findExpense = (d: HouseholdData, id: string): Expense | undefined => d.expenses.find((e) => e.id === id)

function mustFind(d: HouseholdData, id: string): Expense {
  const e = findExpense(d, id)
  if (!e) throw new Error(`記録が見つかりません: ${id}`)
  return e
}

/** 金額待ちに金額を入れる（S-15） */
export function fillAmount(d: HouseholdData, id: string, amount: number, by: PersonKey, at: DateTimeKey): void {
  const e = mustFind(d, id)
  e.amount = amount
  e.amountBy = by
  e.amountAt = at
  e.skipped = false
}

/** 来月に回す（帰属月を1か月進める。対象月「（9月分）」と日付は変わらない。§5.3） */
export function deferRow(d: HouseholdData, id: string): void {
  const e = mustFind(d, id)
  e.month = addMonth(e.month, 1)
}

/** 来月に回すを元に戻す（対象月より前には戻らない。§5.3） */
export function undeferRow(d: HouseholdData, id: string): void {
  const e = mustFind(d, id)
  const back = addMonth(e.month, -1)
  if (e.labelMonth !== null && back < e.labelMonth) return
  e.month = back
}

/** 今月はなし（行を消さずに状態を変える。§5.4） */
export function skipRow(d: HouseholdData, id: string): void {
  mustFind(d, id).skipped = true
}

/** 今月はなしを元に戻す */
export function unskipRow(d: HouseholdData, id: string): void {
  mustFind(d, id).skipped = false
}

/**
 * まだ作っていない最初の月（そのひな形の行の最後の対象月の翌月。行が無ければ開始月）。
 * 直すときの「［10月分 ▾］から変更します」の既定・やめたときの「（10月から）」（0011 の update_template と同じ）
 */
export function firstUnmadeMonth(d: HouseholdData, t: FixedCostTemplate): MonthKey {
  let last: MonthKey | null = null
  for (const e of d.expenses) {
    if (e.tpl !== t.id || e.labelMonth === null) continue
    if (last === null || e.labelMonth > last) last = e.labelMonth
  }
  return last === null ? t.from : addMonth(last, 1)
}

/**
 * その月の毎月の支払いの行を作る（§6.5。DB の RPC ensure_month と同じ）。
 * ひな形 × 対象月で1行だけ。ロック中の月には作らない。作った行を返す。
 */
export function ensureMonth(
  d: HouseholdData,
  m: MonthKey,
  now: DateTimeKey,
  makeId: (tpl: FixedCostTemplate, month: MonthKey) => string = (tpl, month) => `${tpl.id}-${month}`
): Expense[] {
  if (isLockedStatus(monthStatus(d, m, now))) return []
  if (m < d.household.createdMonth || m > monthOf(now)) return []
  const made: Expense[] = []
  for (const tpl of d.templates) {
    if (m < tpl.from) continue
    if (tpl.until !== null && m >= tpl.until) continue
    if (d.expenses.some((e) => e.tpl === tpl.id && e.labelMonth === m)) continue
    const e = createExpense({
      id: makeId(tpl, m),
      date: `${m}-01`,
      month: m,
      labelMonth: m,
      payer: tpl.payer,
      cat: tpl.cat,
      amount: tpl.kind === 'fixed' ? tpl.amount : null,
      memo: tpl.name,
      tpl: tpl.id,
      by: 'auto',
      at: `${m}-01T00:00`,
    })
    d.expenses.push(e)
    made.push(e)
  }
  return made
}

/**
 * 出す額を決める（S-21［決める］・S-20［この額で決める］。04 §8.3 の decide_contributions と同じ形）。
 * 渡された人の行だけを作って返す（d は変えない。保存は saveContributions で行う）。
 * 割合は取り決めなので、その月に保存した値があればそれ、無ければ人の設定の割合（§6.2）。
 * 給料の入り先はその月の事実なので、決め直すといつも今の設定を取り込む（2026-09-23 の決定）。
 */
export function decideContributions(
  d: HouseholdData,
  m: MonthKey,
  nets: Partial<Record<PersonKey, number>>,
  by: PersonKey,
  at: DateTimeKey
): Partial<Record<PersonKey, Contribution>> {
  const out: Partial<Record<PersonKey, Contribution>> = {}
  for (const p of PERSON_KEYS) {
    const net = nets[p]
    if (net == null) continue
    assertNet(net)
    const ratePct = rateFor(d, m, p)
    out[p] = {
      net,
      ratePct,
      salaryToJoint: d.people[p].salaryToJoint,
      amount: contributionOf(net, ratePct),
      by,
      at,
    }
  }
  return out
}

/** 決めた出す額を保存する（決めた人の分だけ上書きする） */
export function saveContributions(
  d: HouseholdData,
  m: MonthKey,
  decided: Partial<Record<PersonKey, Contribution>>
): void {
  let cm = d.contributions[m]
  if (!cm) {
    cm = {}
    d.contributions[m] = cm
  }
  for (const p of PERSON_KEYS) {
    const c = decided[p]
    if (c) cm[p] = c
  }
}

/**
 * ［この金額で精算］（§2.2）。その時点の値を保存してロックする。
 * 残りが2人とも 0 なら、そのまま精算済みにする（§6.3 ケースC）。
 */
export function confirmMonth(d: HouseholdData, m: MonthKey, by: PersonKey, at: DateTimeKey): 'confirmed' | 'settled' {
  // すでにロック中なら何も書かずに今の status を返す（DB の settle_confirm の 'already'。04 §8.3）。
  // isLockedStatus と同じ判定だが、返り値の型を絞るために展開して書く。
  const st = monthStatus(d, m, at)
  if (st === 'confirmed' || st === 'settled') return st
  const md = settleModel(d, m, at)
  if (!md.settle || md.contrib.a === null || md.contrib.b === null) {
    throw new Error(`${m} の出す額が決まっていません`)
  }
  let rec = d.settlements[m]
  if (!rec) {
    rec = createMonthSettlement()
    d.settlements[m] = rec
  }
  rec.round += 1
  rec.status = 'confirmed'
  rec.confirmedBy = by
  rec.confirmedAt = at
  rec.settledAt = null
  rec.checks = {}
  rec.snapshot = {
    contrib: { a: md.contrib.a, b: md.contrib.b },
    net: { ...md.net },
    ratePct: { ...md.ratePct },
    salaryToJoint: { ...md.salaryToJoint },
    adv: { ...md.adv },
    jointSalary: { ...md.jointSalary },
    joint: md.joint,
    total: md.total,
    settle: { ...md.settle },
    jointNet: md.jointNet ?? 0,
  }
  const rem = remainingOf(md.settle, rec.transferred)
  if (rem.a === 0 && rem.b === 0) {
    rec.status = 'settled'
    rec.settledAt = at
  }
  return rec.status
}

/** チェックを付ける・外す（冪等。02 §8.1）。そろったら自動で精算済み */
export function setCheck(
  d: HouseholdData,
  m: MonthKey,
  p: PersonKey,
  checked: boolean,
  by: PersonKey,
  at: DateTimeKey
): { settledNow: boolean; checked: boolean } {
  const rec = d.settlements[m]
  if (!rec) throw new Error(`${m} は精算中ではありません`)
  const md = settleModel(d, m, at)
  const remaining = md.remaining
  if (!remaining) throw new Error(`${m} の出す額が決まっていません`)
  // 0円のカードは最初から済み。チェックは付けず、何も書かない（DB の nothing_to_move。02 §7.1）
  if (checked && remaining[p] === 0) return { settledNow: false, checked: false }
  if (checked) rec.checks[p] = { by, at, amount: remaining[p] }
  else delete rec.checks[p]
  const all = PERSON_KEYS.every((q) => remaining[q] === 0 || rec.checks[q])
  const was = rec.status
  if (all) {
    rec.status = 'settled'
    if (was !== 'settled') rec.settledAt = at
  } else {
    rec.status = 'confirmed'
    rec.settledAt = null
  }
  return { settledNow: all && was !== 'settled', checked: !!rec.checks[p] }
}

/** ［入れた］／［受け取った］。もう一度押すと外れる（画面の操作。中身は setCheck） */
export function toggleCheck(
  d: HouseholdData,
  m: MonthKey,
  p: PersonKey,
  by: PersonKey,
  at: DateTimeKey
): { settledNow: boolean; checked: boolean } {
  const rec = d.settlements[m]
  if (!rec) throw new Error(`${m} は精算中ではありません`)
  return setCheck(d, m, p, !rec.checks[p], by, at)
}

/**
 * ［精算をやり直す］（§7.1）。月は進行中か締め待ちに戻る（日付で決まる）。
 * 付いていたチェックは消さず「済んだ分」として残す（§6.3 ケースI）。
 */
export function reopenMonth(d: HouseholdData, m: MonthKey, by: PersonKey, at: DateTimeKey): void {
  const rec = d.settlements[m]
  if (!rec) throw new Error(`${m} はまだ精算していません`)
  const md = settleModel(d, m, at)
  for (const p of PERSON_KEYS) {
    const c = rec.checks[p]
    if (c && md.remaining && md.remaining[p] !== 0) {
      rec.transferred[p] += md.remaining[p]
      // 回（round）も持たせる（DB の settlement_checks.round と同じ）。
      // やり直しの元に戻すが「このやり直しで移した分」だけを戻すために要る
      rec.done[p].push({ amount: md.remaining[p], at: c.at, by: c.by, round: rec.round })
    }
  }
  rec.reopenedFrom = rec.status === 'settled' ? 'settled' : 'confirmed'
  rec.checks = {}
  rec.status = null
  // 確定時の値は捨てずに退避する（元に戻すで書き戻す。02 §7）
  rec.undoSnapshot = rec.snapshot
  rec.snapshot = null
  rec.settledAt = null
  rec.reopenedBy = by
  rec.reopenedAt = at
}

/** ひな形の並び順（S-10・S-20 の金額待ちの並びに使う） */
function templateIndex(d: HouseholdData, e: Expense): number {
  const i = d.templates.findIndex((t) => t.id === e.tpl)
  return i < 0 ? 999 : i
}

/** 金額待ちの並び（S-10 要素7）: 対象月の古い順、同じならひな形の順 */
export function sortPending(d: HouseholdData, rows: readonly Expense[]): Expense[] {
  return [...rows].sort((x, y) => {
    const lx = x.labelMonth ?? x.month
    const ly = y.labelMonth ?? y.month
    if (lx !== ly) return lx < ly ? -1 : 1
    return templateIndex(d, x) - templateIndex(d, y)
  })
}

/**
 * 締め待ちの片付けの順（S-20 `prep` の「精算のまえに」の行と、精算から S-15 を順に開く順）:
 * 払う人が個人の行 → 共用の行。それぞれの中は対象月の古い順、同じならひな形の順。
 */
export function pendingQueue(d: HouseholdData, m: MonthKey): Expense[] {
  const rows = d.expenses.filter((e) => e.month === m && isPending(e))
  return sortPending(d, rows).sort((x, y) => Number(x.payer === 'joint') - Number(y.payer === 'joint'))
}
