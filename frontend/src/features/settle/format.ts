/**
 * 精算タブの中だけで使う、文字の作り方（仕様書 §6.1・§7.3）。
 *
 * - 金額はいつも正の数で出す（＋−・赤／緑・「マイナス」を使わない。§6.1-4）。向きは
 *   流れの印と動詞で示すので、ここでは必ず絶対値にする。
 * - 共通の作り方は `@/lib/format` にある。ここはそれを精算の言い方に合わせて包むだけ。
 */
import type { DateTimeKey, MonthKey } from '@/domain'
import { monthNumber } from '@/domain'
import { formatMonthDay, formatNumber } from '@/lib/format'

/** 1280 → 「1,280」（いつも正の数） */
export const num = (value: number): string => formatNumber(Math.abs(value))

/** 1280 → 「¥1,280」（いつも正の数） */
export const yen = (value: number): string => `¥${num(value)}`

/** '2026-09' → 「9月」 */
export const monthShort = (m: MonthKey): string => `${monthNumber(m)}月`

/** '2026-10-02T09:10' → 「10/2」 */
export const monthDay = (at: DateTimeKey): string => formatMonthDay(Number(at.slice(5, 7)), Number(at.slice(8, 10)))
