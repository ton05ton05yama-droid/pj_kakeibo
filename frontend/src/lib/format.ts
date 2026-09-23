/** 画面に出す文字の作り方。金額は円の整数（仕様書 §6.2） */

const numberFormat = new Intl.NumberFormat('ja-JP')

/** 1280 → 「1,280」 */
export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

/** 1280 → 「¥1,280」（¥ を前に付ける表し方。§6.1） */
export function formatYen(value: number): string {
  return `¥${numberFormat.format(value)}`
}

/** 1280 → 「1,280円」（文の中・読み上げ） */
export function formatYenSuffix(value: number): string {
  return `${numberFormat.format(value)}円`
}

/** 2026, 9 → 「2026年9月」 */
export function formatYearMonth(year: number, month: number): string {
  return `${year}年${month}月`
}

/** 9, 22 → 「9/22」 */
export function formatMonthDay(month: number, day: number): string {
  return `${month}/${day}`
}
