/**
 * 分析タブ（S-40・S-41）の画面に出す文字（仕様書 §1 の言葉）。
 * 計算はしない（数字は `domain/analysis` が出したものを受け取る）。
 */
import { type AnalysisPeriod, type MonthKey, monthNumber, yearNumber } from '@/domain'
import { formatYearMonth } from '@/lib/format'

/** '2026-09' → 「9月」 */
export const monthShort = (m: MonthKey): string => `${monthNumber(m)}月`

/** '2026-09' → 「2026年9月」（期間のチップ） */
export const monthLabel = (m: MonthKey): string => formatYearMonth(yearNumber(m), monthNumber(m))

/**
 * 期間の言い方。「8月〜10月」、年をまたぐときは「2025年12月〜2026年2月」。
 * 1か月だけのときは「9月」（支出タブの「9月のふたりの支出」と同じ言い方。本書の決め）。
 */
export function periodText(p: AnalysisPeriod): string {
  if (p.from === p.to) return monthShort(p.from)
  if (yearNumber(p.from) !== yearNumber(p.to)) return `${monthLabel(p.from)}〜${monthLabel(p.to)}`
  return `${monthShort(p.from)}〜${monthShort(p.to)}`
}

/** 期間のチップの読み上げ名「始めの月 2026年8月（押すと選び直す）」 */
export const periodChipLabel = (which: 'from' | 'to', m: MonthKey): string =>
  `${which === 'from' ? '始めの月' : '終わりの月'} ${monthLabel(m)}（押すと選び直す）`
