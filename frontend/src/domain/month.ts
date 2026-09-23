/**
 * 月（'YYYY-MM'）と日付の小さなユーティリティ。
 * 日付は JST の文字列のまま扱い、文字列の大小で前後を比べられるようにする（dayjs は使わない）。
 */
import type { DateKey, DateTimeKey, MonthKey } from './types'

/** 日付・日時からその月を取る（'2026-09-22T12:30' → '2026-09'） */
export const monthOf = (date: DateKey | DateTimeKey): MonthKey => date.slice(0, 7)

/** 日時からその日を取る（'2026-09-22T12:30' → '2026-09-22'） */
export const dateOf = (at: DateTimeKey): DateKey => at.slice(0, 10)

/** 月を k か月進める（負なら戻す） */
export function addMonth(m: MonthKey, k: number): MonthKey {
  let y = Number(m.slice(0, 4))
  let mo = Number(m.slice(5, 7)) + k
  while (mo > 12) {
    mo -= 12
    y++
  }
  while (mo < 1) {
    mo += 12
    y--
  }
  return `${y}-${String(mo).padStart(2, '0')}`
}

/** 月の前後（a < b なら負、同じなら 0、a > b なら正） */
export const compareMonths = (a: MonthKey, b: MonthKey): number => (a < b ? -1 : a > b ? 1 : 0)

/** その月の1日 */
export const firstDayOf = (m: MonthKey): DateKey => `${m}-01`

/** その月の日数 */
export function daysInMonth(m: MonthKey): number {
  const y = Number(m.slice(0, 4))
  const mo = Number(m.slice(5, 7))
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/** その月の末日 */
export const lastDayOf = (m: MonthKey): DateKey => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`

/** その月がもう終わっているか（「今日」は now。§4.0.2） */
export const isMonthEnded = (m: MonthKey, now: DateTimeKey): boolean => m < monthOf(now)

/** from から to まで（両端を含む）の月を古い順に並べる */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  let m = from
  while (m <= to) {
    out.push(m)
    m = addMonth(m, 1)
  }
  return out
}

/** 月の番号（1〜12）。文言の「9月」に使う */
export const monthNumber = (m: MonthKey): number => Number(m.slice(5, 7))

/** 年（2026） */
export const yearNumber = (m: MonthKey): number => Number(m.slice(0, 4))
