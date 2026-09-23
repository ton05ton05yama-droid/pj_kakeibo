/**
 * 支出タブの画面に出す文字（正本: docs/03_ui_spec.md §1.1・§1.3・§1.4）。
 * 新しい文言は作らない。計算はしない（数字は `domain/` が出したものを受け取る）。
 */
import type { DateKey, DateTimeKey, Expense, HouseholdData, MonthKey, MonthStatus, Payer } from '@/domain'
import { monthNumber, yearNumber } from '@/domain'
import { formatMonthDay, formatNumber, formatYearMonth } from '@/lib/format'

/** '2026-09' → 「9月」 */
export const monthShort = (m: MonthKey): string => `${monthNumber(m)}月`

/** '2026-09' → 「2026年9月」 */
export const monthLabel = (m: MonthKey): string => formatYearMonth(yearNumber(m), monthNumber(m))

/** '2026-09-22T12:03' → 「9/22」 */
export const monthDay = (at: DateKey | DateTimeKey): string =>
  formatMonthDay(Number(at.slice(5, 7)), Number(at.slice(8, 10)))

/** '2026-09-22T12:03' → 「12:03」（日付だけなら空） */
export const hourMinute = (at: DateTimeKey): string =>
  at.length > 10 ? `${Number(at.slice(11, 13))}:${at.slice(14, 16)}` : ''

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 曜日の1文字（JST の日付文字列から） */
export function weekday(date: DateKey): string {
  const day = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  ).getUTCDay()
  return WEEKDAYS[day] ?? ''
}

/** '2026-09-22' → 「9月22日（火）」（日付の見出し） */
export const dateLong = (date: DateKey): string =>
  `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekday(date)}）`

/** '2026-09-19' → 「9/19（土）」（日付のセグメントの「ほかの日」） */
export const dateShortWeek = (date: DateKey): string => `${monthDay(date)}（${weekday(date)}）`

/** 毎月の支払いの行の名前「ガス代（9月分）」（対象月。来月に回しても変わらない。§1.1） */
export const templateLabel = (e: Expense): string => `${e.memo}（${monthNumber(e.labelMonth ?? e.month)}月分）`

/** 一覧のメモの位置に出す名前。金額待ちの種類の行だけ「（◯月分）」を付ける */
export function rowName(d: HouseholdData, e: Expense): string {
  if (e.tpl === null) return e.memo
  const tpl = d.templates.find((t) => t.id === e.tpl)
  return tpl?.kind === 'variable' ? templateLabel(e) : e.memo
}

/** 払った人の呼び名（共用は「共用」。§1.1） */
export const payerName = (d: HouseholdData, payer: Payer): string => (payer === 'joint' ? '共用' : d.people[payer].name)

/** 「まさとが払った」／「共用で払った」（S-14 partner・locked） */
export const paidByText = (d: HouseholdData, payer: Payer): string =>
  payer === 'joint' ? '共用で払った' : `${payerName(d, payer)}が払った`

/** 「まさとが払う」／「共用で払う」（S-15 の補足） */
export const paysText = (d: HouseholdData, payer: Payer): string =>
  payer === 'joint' ? '共用で払う' : `${payerName(d, payer)}が払う`

/** 「9月は精算中です」／「9月は精算済みです」 */
export const lockStateText = (status: MonthStatus, m: MonthKey): string =>
  `${monthShort(m)}は${status === 'settled' ? '精算済み' : '精算中'}です`

/** ロック中の月の日付で押したときのその場の1行（§1.4） */
export const lockMessage = (status: MonthStatus, m: MonthKey): string =>
  `${lockStateText(status, m)}（先に精算をやり直します）`

/** S-14 `locked` の固定の1文（§4 S-14） */
export const lockedViewText = (status: MonthStatus, m: MonthKey): string =>
  `${lockStateText(status, m)}（直すには精算をやり直します）`

/** S-14 `unsent` の注記（§4 S-14） */
export const unsentNote = (status: MonthStatus, m: MonthKey): string => `送れませんでした: ${lockStateText(status, m)}`

/** ロック中の月の合計の下のバッジ（§4 S-10 `locked`） */
export const lockBadgeText = (status: MonthStatus, settledAt: DateTimeKey | null): string =>
  status === 'settled' && settledAt !== null ? `精算済み ${monthDay(settledAt)}` : '精算中'

/** 記録した人（'auto' は「毎月の支払い」） */
export const recordedByName = (d: HouseholdData, e: Expense): string =>
  e.by === 'auto' ? '毎月の支払い' : d.people[e.by].name

/** 一覧・内訳の金額（一覧の行は `¥` を省く。§1.1） */
export const rowAmount = (amount: number | null): string => (amount === null ? '' : formatNumber(amount))

/** メモのチップの文字（8字で切る。§4 S-12） */
export function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}
