/**
 * 分析タブ（S-40・S-41）の集計。
 * 1か月だけなら S-10 の合計・S-13 の内訳（§9.6）と同じ数字になること、
 * 期間の決め（既定・12か月まで・始めと終わりの入れ替わり・選べる範囲）を確かめる。
 */
import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_MAX_MONTHS,
  analysisSummary,
  categoryByMonth,
  clampAnalysisPeriod,
  defaultAnalysisPeriod,
  pickAnalysisFrom,
  pickAnalysisTo,
} from '../analysis'
import { summarize } from '../calc'
import { buildScenario } from '../sampleData'
import type { HouseholdData } from '../types'
import { EXPECT } from './fixtures'

const open = buildScenario('sep-open')
const prep = buildScenario('sep-prep')

/** 家計を作った月だけ変えたデータ（12か月を超える期間を作るため） */
function createdAt(d: HouseholdData, m: string): HouseholdData {
  return { ...d, household: { ...d.household, createdMonth: m } }
}

describe('1か月の期間は S-10・S-13 と同じ（sep-open の9月）', () => {
  const s = analysisSummary(open.data, '2026-09', '2026-09', open.now)

  it('合計 180,670・金額待ち 2件', () => {
    expect(s.total).toBe(EXPECT.sepOpen.total)
    expect(s.total).toBe(180670)
    expect(s.pendingCount).toBe(2)
    expect(s.count).toBe(EXPECT.sepOpen.count)
    expect(s.months).toEqual([{ month: '2026-09', total: 180670 }])
  })

  it('カテゴリ別は S-13 の内訳と同じ並び・同じ額（住まい 92,980・食料品 31,210 …）', () => {
    expect(s.categories.map((x) => [x.cat, x.amount])).toEqual(EXPECT.sepOpen.byCat)
    expect(s.categories).toEqual(summarize(open.data.expenses, '2026-09').byCat)
  })

  it('S-41 の1か月も S-13 と同じ（外食 20,850）', () => {
    expect(categoryByMonth(open.data, 'dining', '2026-09', '2026-09', open.now)).toEqual([
      { month: '2026-09', amount: 20850 },
    ])
  })
})

describe('いくつかの月の期間', () => {
  it('sep-open（9/22）の8月〜9月: 255,890 ＋ 180,670', () => {
    const s = analysisSummary(open.data, '2026-08', '2026-09', open.now)
    expect(s.total).toBe(436560)
    expect(s.months).toEqual([
      { month: '2026-08', total: 255890 },
      { month: '2026-09', total: 180670 },
    ])
    // カテゴリの合計は期間の合計と一致し、多い順に並ぶ
    expect(s.categories.reduce((t, x) => t + x.amount, 0)).toBe(s.total)
    const amounts = s.categories.map((x) => x.amount)
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
    expect(s.categories[0]).toEqual({ cat: 'housing', amount: 181960 })
  })

  it('sep-prep（10/1）の8月〜10月: 月ごとの合計と金額待ち（9月の2件＋10月の分）', () => {
    const s = analysisSummary(prep.data, '2026-08', '2026-10', prep.now)
    expect(s.months).toEqual([
      { month: '2026-08', total: 255890 },
      { month: '2026-09', total: EXPECT.sepPrep.total },
      { month: '2026-10', total: 92090 },
    ])
    expect(s.total).toBe(255890 + 199930 + 92090)
    expect(s.pendingCount).toBe(4)
  })

  it('S-41 は0円の月も古い順に入れる（外食の10月は 0）', () => {
    expect(categoryByMonth(prep.data, 'dining', '2026-08', '2026-10', prep.now)).toEqual([
      { month: '2026-08', amount: 22000 },
      { month: '2026-09', amount: 24450 },
      { month: '2026-10', amount: 0 },
    ])
  })

  it('記録の無い期間は合計 0・件数 0・カテゴリなし（月は 0 で並ぶ）', () => {
    const d = { ...open.data, expenses: [] }
    const s = analysisSummary(d, '2026-08', '2026-09', open.now)
    expect(s).toEqual({
      total: 0,
      count: 0,
      pendingCount: 0,
      months: [
        { month: '2026-08', total: 0 },
        { month: '2026-09', total: 0 },
      ],
      categories: [],
    })
  })
})

describe('既定の期間（過去3か月・今月を含む）', () => {
  it('家計を作った月より前は含めない（sep-open は 8月〜9月）', () => {
    expect(defaultAnalysisPeriod(open.data, open.now)).toEqual({ from: '2026-08', to: '2026-09' })
  })

  it('10/1 なら 8月〜10月', () => {
    expect(defaultAnalysisPeriod(prep.data, prep.now)).toEqual({ from: '2026-08', to: '2026-10' })
  })

  it('家計が古ければちょうど3か月（年をまたぐ）', () => {
    const d = createdAt(open.data, '2024-01')
    expect(defaultAnalysisPeriod(d, '2026-02-10T09:00')).toEqual({ from: '2025-12', to: '2026-02' })
  })
})

describe('期間の選び直し（12か月まで・入れ替わり）', () => {
  it('始めの月を終わりの月より後にしたら、終わりの月も同じ月にする', () => {
    expect(pickAnalysisFrom({ from: '2026-08', to: '2026-09' }, '2026-10')).toEqual({
      from: '2026-10',
      to: '2026-10',
    })
  })

  it('終わりの月を始めの月より前にしたら、始めの月も同じ月にする', () => {
    expect(pickAnalysisTo({ from: '2026-08', to: '2026-09' }, '2026-07')).toEqual({ from: '2026-07', to: '2026-07' })
  })

  it('始めの月を選んで12か月を超えたら、終わりの月を11か月後にする', () => {
    expect(pickAnalysisFrom({ from: '2026-06', to: '2026-09' }, '2025-06')).toEqual({
      from: '2025-06',
      to: '2026-05',
    })
    // ちょうど12か月はそのまま
    expect(pickAnalysisFrom({ from: '2026-06', to: '2026-09' }, '2025-10')).toEqual({
      from: '2025-10',
      to: '2026-09',
    })
  })

  it('終わりの月を選んで12か月を超えたら、始めの月を11か月前にする', () => {
    expect(pickAnalysisTo({ from: '2025-01', to: '2025-03' }, '2026-09')).toEqual({ from: '2025-10', to: '2026-09' })
  })

  it('集計も12か月までにそろえる（終わりの月を残す）', () => {
    const d = createdAt(open.data, '2024-01')
    const s = analysisSummary(d, '2024-01', '2026-09', open.now)
    expect(s.months).toHaveLength(ANALYSIS_MAX_MONTHS)
    expect(s.months[0]?.month).toBe('2025-10')
    expect(s.months.at(-1)?.month).toBe('2026-09')
  })
})

describe('選べる範囲にそろえる（家計を作った月〜今月）', () => {
  it('家計を作る前・今月より先は外す', () => {
    expect(clampAnalysisPeriod(open.data, { from: '2026-05', to: '2026-12' }, open.now)).toEqual({
      from: '2026-08',
      to: '2026-09',
    })
    const s = analysisSummary(open.data, '2026-05', '2026-12', open.now)
    expect(s.months.map((x) => x.month)).toEqual(['2026-08', '2026-09'])
  })

  it('始めの月が終わりの月より後なら、同じ月にする', () => {
    expect(clampAnalysisPeriod(open.data, { from: '2026-09', to: '2026-08' }, open.now)).toEqual({
      from: '2026-08',
      to: '2026-08',
    })
  })
})
