/**
 * 支出タブの並び（正本: docs/03_ui_spec.md §4 S-10 の要素7・8・9）。
 * 並べ替えだけを行い、金額の計算はしない（計算は `domain/` が行う）。
 */
import type { DateKey, Expense, HouseholdData, MonthKey } from '@/domain'
import { addMonth, monthOf, monthStatus, sortPending, summarize } from '@/domain'

/** ひな形の並び（S-31 で作った順） */
function templateIndex(d: HouseholdData, e: Expense): number {
  const i = d.templates.findIndex((t) => t.id === e.tpl)
  return i < 0 ? 999 : i
}

/** 手入力の一覧の並び: 新しい日が上。同じ日の中は記録した時刻が新しい順（S-10 要素8） */
export function sortByNewest(rows: readonly Expense[]): Expense[] {
  return [...rows].sort((x, y) => y.date.localeCompare(x.date) || y.at.localeCompare(x.at) || y.seq - x.seq)
}

/**
 * 「毎月の支払い」のまとまりの並び（S-10 要素9）:
 * その月の分（ひな形の順）→ 前の月から回してきた分（対象月の古い順、同じならひな形の順）
 */
export function sortFixedRows(d: HouseholdData, m: MonthKey, rows: readonly Expense[]): Expense[] {
  return [...rows].sort((x, y) => {
    const dx = Number((x.labelMonth ?? x.month) !== m)
    const dy = Number((y.labelMonth ?? y.month) !== m)
    if (dx !== dy) return dx - dy
    const lx = x.labelMonth ?? x.month
    const ly = y.labelMonth ?? y.month
    if (lx !== ly) return lx.localeCompare(ly)
    return templateIndex(d, x) - templateIndex(d, y)
  })
}

/**
 * S-10 の金額待ちの行に出す行（S-10 要素7）。
 *
 * 今月を見ていて、前の月が締め待ちで金額待ちが残っているあいだは**前の月**の金額待ちを出し、
 * 今月の分は出さない（今月の分は、前の月の金額待ちが片付くと出る）。
 * 合計の下の注記「＋ 金額待ち n件」の件数は、見ている月の数のまま（ここでは数えない）。
 */
export function pendingShownFor(d: HouseholdData, m: MonthKey, now: string): Expense[] {
  const previous = addMonth(m, -1)
  if (m === monthOf(now) && previous >= d.household.createdMonth && monthStatus(d, previous, now) === 'closing') {
    const rows = sortPending(d, summarize(d.expenses, previous).pending)
    if (rows.length > 0) return rows
  }
  return sortPending(d, summarize(d.expenses, m).pending)
}

export type DateGroup = { date: DateKey; rows: Expense[] }

/** 日付ごとにまとめる（並び替え済みの行を渡す） */
export function groupByDate(rows: readonly Expense[]): DateGroup[] {
  const groups: DateGroup[] = []
  for (const e of rows) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.date === e.date) last.rows.push(e)
    else groups.push({ date: e.date, rows: [e] })
  }
  return groups
}
