/**
 * 分析タブ（S-40・S-41）の集計（正本: 仕様書 S-40・S-41。数え方と期間の上限は §12.2 Q37 の確認待ち）。
 *
 * 月は**帰属月**（精算と同じ数え方。来月に回した行は回した先の月）。
 * 数えるのは支出タブの合計・S-13 の内訳と同じ記録で、月ごとの集計は `summarize` をそのまま使う
 * （金額待ち・今月はなし・未送信は入れない）。1か月だけの期間なら S-10 の合計・S-13 の内訳と同じ数字になる。
 *
 * ここはすべて純粋関数。「今日」は必ず引数 now で受け取る。
 */
import { summarize } from './calc'
import { addMonth, monthOf, monthsBetween } from './month'
import type { CategoryKey, CategoryTotal, DateTimeKey, HouseholdData, MonthKey } from './types'

/** 期間は12か月まで（本書の決め） */
export const ANALYSIS_MAX_MONTHS = 12

/** 分析の期間（始めの月〜終わりの月。両端を含む） */
export interface AnalysisPeriod {
  from: MonthKey
  to: MonthKey
}

/** 月ごとの合計（S-40 の棒） */
export interface AnalysisMonthTotal {
  month: MonthKey
  total: number
}

/** あるカテゴリの月ごとの合計（S-41 の行） */
export interface CategoryMonthAmount {
  month: MonthKey
  amount: number
}

/** S-40 の中身 */
export interface AnalysisSummary {
  /** 期間の合計（支出タブの合計を月ごとに足したもの） */
  total: number
  /** 合計に入れた記録の件数（0 なら `empty`） */
  count: number
  /** 金額待ちの件数（合計には入っていない。S-13 と同じ注記） */
  pendingCount: number
  /** 期間の各月の合計（古い順。0円の月も入れる） */
  months: AnalysisMonthTotal[]
  /** カテゴリ別の合計（多い順。0円のカテゴリは入れない） */
  categories: CategoryTotal[]
}

const maxMonth = (a: MonthKey, b: MonthKey): MonthKey => (a > b ? a : b)
const minMonth = (a: MonthKey, b: MonthKey): MonthKey => (a < b ? a : b)

/** 選べる最初の月（家計を作った月）と最後の月（今月）。S-04 と同じ */
function selectableRange(d: HouseholdData, now: DateTimeKey): AnalysisPeriod {
  return { from: d.household.createdMonth, to: monthOf(now) }
}

/** 既定の期間: 過去3か月（今月を含む）。家計を作った月より前は含めない */
export function defaultAnalysisPeriod(d: HouseholdData, now: DateTimeKey): AnalysisPeriod {
  const range = selectableRange(d, now)
  return { from: maxMonth(addMonth(range.to, -2), range.from), to: range.to }
}

/**
 * 期間を選べる範囲（家計を作った月〜今月）・前後・12か月までにそろえる。
 * 覚えておいた期間を開き直したときに使う（その間に月が変わっていても崩れないように）。
 */
export function clampAnalysisPeriod(d: HouseholdData, period: AnalysisPeriod, now: DateTimeKey): AnalysisPeriod {
  const range = selectableRange(d, now)
  const clamp = (m: MonthKey): MonthKey => minMonth(maxMonth(m, range.from), range.to)
  const to = clamp(period.to)
  let from = minMonth(clamp(period.from), to)
  if (monthsBetween(from, to).length > ANALYSIS_MAX_MONTHS) from = addMonth(to, -(ANALYSIS_MAX_MONTHS - 1))
  return { from, to }
}

/**
 * 始めの月を選んだ（本書の決め）。
 * 終わりの月より後なら、終わりの月を同じ月にする。12か月を超えたら、終わりの月を始めの月の11か月後にする。
 */
export function pickAnalysisFrom(period: AnalysisPeriod, from: MonthKey): AnalysisPeriod {
  if (from > period.to) return { from, to: from }
  if (monthsBetween(from, period.to).length > ANALYSIS_MAX_MONTHS) {
    return { from, to: addMonth(from, ANALYSIS_MAX_MONTHS - 1) }
  }
  return { from, to: period.to }
}

/**
 * 終わりの月を選んだ（本書の決め）。
 * 始めの月より前なら、始めの月を同じ月にする。12か月を超えたら、始めの月を終わりの月の11か月前にする。
 */
export function pickAnalysisTo(period: AnalysisPeriod, to: MonthKey): AnalysisPeriod {
  if (to < period.from) return { from: to, to }
  if (monthsBetween(period.from, to).length > ANALYSIS_MAX_MONTHS) {
    return { from: addMonth(to, -(ANALYSIS_MAX_MONTHS - 1)), to }
  }
  return { from: period.from, to }
}

/** 集計する月（期間を選べる範囲・12か月までにそろえてから、古い順） */
function periodMonths(d: HouseholdData, from: MonthKey, to: MonthKey, now: DateTimeKey): MonthKey[] {
  const p = clampAnalysisPeriod(d, { from, to }, now)
  return monthsBetween(p.from, p.to)
}

/** S-40: 期間の合計・月ごとの合計・カテゴリ別の合計 */
export function analysisSummary(d: HouseholdData, from: MonthKey, to: MonthKey, now: DateTimeKey): AnalysisSummary {
  let total = 0
  let count = 0
  let pendingCount = 0
  const months: AnalysisMonthTotal[] = []
  // 月の古い順・各月の多い順に足していき、最後に多い順へ並べ直す（同じ額は先に出た順。1か月なら S-13 と同じ並び）
  const byCat = new Map<CategoryKey, number>()
  for (const m of periodMonths(d, from, to, now)) {
    const sum = summarize(d.expenses, m)
    total += sum.total
    count += sum.count
    pendingCount += sum.pending.length
    months.push({ month: m, total: sum.total })
    for (const row of sum.byCat) byCat.set(row.cat, (byCat.get(row.cat) ?? 0) + row.amount)
  }
  const categories: CategoryTotal[] = [...byCat.entries()]
    .map(([cat, amount]) => ({ cat, amount }))
    .filter((row) => row.amount !== 0)
    .sort((x, y) => y.amount - x.amount)
  return { total, count, pendingCount, months, categories }
}

/** S-41: あるカテゴリの月ごとの合計（古い順。0円の月も入れる） */
export function categoryByMonth(
  d: HouseholdData,
  cat: CategoryKey,
  from: MonthKey,
  to: MonthKey,
  now: DateTimeKey
): CategoryMonthAmount[] {
  return periodMonths(d, from, to, now).map((m) => ({
    month: m,
    amount: summarize(d.expenses, m).byCat.find((row) => row.cat === cat)?.amount ?? 0,
  }))
}
