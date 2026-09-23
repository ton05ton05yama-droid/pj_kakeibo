/**
 * S-12 `action` の注記「金額待ちは支出タブの上から入れます」を出すかどうか（§4 S-12 の状態）。
 *
 * 「S-10 の金額待ちの行（要素7）と同じ範囲」に、選んだカテゴリの行があるときだけ出す。
 * その範囲は S-10 と同じ決まり（モックの `pendingShown`）:
 *   今月を見ていて、前の月が締め待ちで金額待ちが残っているあいだは**前の月**の金額待ち。
 *   それ以外は、その月の金額待ち。
 *
 * 計算そのものは `domain/` の純粋関数（`summarize`・`monthStatus`・`addMonth`）で行い、ここは組み合わせるだけ。
 */
import type { CategoryKey, Expense, HouseholdData, MonthKey } from '@/domain'
import { addMonth, monthOf, monthStatus, summarize } from '@/domain'

/** S-10 の金額待ちの行に出る行（並びは見ないので、ここでは並べ替えない） */
export function pendingShown(d: HouseholdData, m: MonthKey, now: string): Expense[] {
  const previous = addMonth(m, -1)
  if (m === monthOf(now) && previous >= d.household.createdMonth && monthStatus(d, previous, now) === 'closing') {
    const rows = summarize(d.expenses, previous).pending
    if (rows.length > 0) return rows
  }
  return summarize(d.expenses, m).pending
}

/** 選んだ日付の月の金額待ちに、選んだカテゴリの行があるか */
export function hasPendingHint(d: HouseholdData, m: MonthKey, cat: CategoryKey, now: string): boolean {
  return pendingShown(d, m, now).some((e) => e.cat === cat)
}
