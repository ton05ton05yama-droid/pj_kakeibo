/**
 * §9.6 の検算 V1〜V10（モックの runVerification と同じ値になることを確かめる）。
 * 正本: docs/03_ui_spec.md §9.6、docs/02_settlement.md §3.3・§9。
 */
import { describe, expect, it } from 'vitest'
import { computeSettle, contributionOf, settleModel, summarize } from '../calc'
import { createExpense, skipRow } from '../operations'
import { buildScenario } from '../sampleData'
import type { SettleModel } from '../types'
import { EXPECT, findCase, must } from './fixtures'

const open = buildScenario('sep-open')
const prep = buildScenario('sep-prep')
const ready = buildScenario('sep-ready')
const redo = buildScenario('sep-redo')

const m8 = settleModel(open.data, '2026-08', open.now)
const m9o = settleModel(open.data, '2026-09', open.now)
const m9p = settleModel(prep.data, '2026-09', prep.now)
const m9f = settleModel(ready.data, '2026-09', ready.now)
const m9r = settleModel(redo.data, '2026-09', redo.now)

interface Named {
  name: string
  md: SettleModel
  ex: {
    adv: { a: number; b: number }
    joint: number
    total: number
    settle: { a: number; b: number }
    jointNet: number
  }
}

const SETS: Named[] = [
  { name: '8月', md: m8, ex: EXPECT.aug },
  { name: '9月見込み', md: m9o, ex: EXPECT.sepOpen },
  { name: '9月 sep-prep 参考', md: m9p, ex: EXPECT.sepPrep },
  { name: '9月確定', md: m9f, ex: EXPECT.sepFinal },
  { name: 'やり直し後', md: m9r, ex: EXPECT.sepRedo },
]

describe('V1 支出合計 ＝ 立替_まさと ＋ 立替_りさこ ＋ 共用払い', () => {
  for (const { name, md, ex } of SETS) {
    it(name, () => {
      expect(md.total).toBe(md.adv.a + md.adv.b + md.joint)
      expect(md.adv).toEqual(ex.adv)
      expect(md.joint).toBe(ex.joint)
      expect(md.total).toBe(ex.total)
    })
  }
})

describe('V2 出す額 ＝ floor(手取り × 割合 ÷ 100)', () => {
  it.each([
    [295000, 118000],
    [230000, 92000],
    [300000, 120000],
    [220000, 88000],
  ])('%i × 40 ÷ 100 ＝ %i', (net, amount) => {
    expect(contributionOf(net, 40)).toBe(amount)
  })

  it('見本データの出す額が式と合う', () => {
    for (const cm of Object.values(open.data.contributions)) {
      for (const p of ['a', 'b'] as const) {
        const c = must(cm[p], `出す額（${p}）`)
        expect(c.amount).toBe(contributionOf(c.net, c.ratePct))
      }
    }
    expect(must(open.data.contributions['2026-08'], '8月').a?.amount).toBe(118000)
    expect(must(open.data.contributions['2026-09'], '9月').b?.amount).toBe(88000)
  })
})

describe('V3 精算額 ＝ 出す額 − 立替', () => {
  for (const { name, md, ex } of SETS) {
    it(name, () => {
      expect(md.settle).toEqual(ex.settle)
      expect(md.contrib.a).not.toBeNull()
      expect(md.settle?.a).toBe((md.contrib.a ?? 0) - md.adv.a)
      expect(md.settle?.b).toBe((md.contrib.b ?? 0) - md.adv.b)
    })
  }
})

describe('V4 共用の過不足 ＝ Σ出す額 − 支出合計 ＝ Σ精算額 − 共用払い', () => {
  for (const { name, md, ex } of SETS) {
    it(name, () => {
      expect(md.jointNet).toBe(ex.jointNet)
      expect(md.jointNet).toBe((md.settle?.a ?? 0) + (md.settle?.b ?? 0) - md.joint)
      expect(md.jointNet).toBe((md.contrib.a ?? 0) + (md.contrib.b ?? 0) - md.total)
    })
  }
})

it('V5 2人とも精算額 < 0 なら 共用の過不足 < 0（ケースE）', () => {
  const c = findCase('E')
  const r = computeSettle(
    { a: contributionOf(c.net.a, 40), b: contributionOf(c.net.b, 40) },
    c.adv,
    c.adv.a + c.adv.b + c.joint
  )
  expect(r.settle.a).toBeLessThan(0)
  expect(r.settle.b).toBeLessThan(0)
  expect(r.jointNet).toBeLessThan(0)
  expect(r.settle).toEqual(EXPECT.cases.E.settle)
  expect(r.jointNet).toBe(EXPECT.cases.E.jointNet)
})

it('V6 残り ＝ 精算額（新） − 済んだ分', () => {
  expect(m9r.transferred).toEqual({ a: 82490, b: 65930 })
  expect(m9r.remaining).toEqual(EXPECT.sepRedo.remaining)
  expect(m9r.remaining?.a).toBe((m9r.settle?.a ?? 0) - m9r.transferred.a)
})

describe('V7 金額待ち・今月はなし・未送信は合計に入れない', () => {
  it('9月見込み（金額待ち2件を除く）', () => {
    expect(m9o.sum.count).toBe(EXPECT.sepOpen.count)
    expect(m9o.sum.total).toBe(180670)
    expect(m9o.sum.pending).toHaveLength(2)
  })

  it('sep-prep の参考値', () => {
    expect(m9p.sum.count).toBe(EXPECT.sepPrep.count)
    expect(m9p.sum.total).toBe(199930)
  })

  it('合成（家賃を今月はなし・未送信 999円を1件足す）', () => {
    const syn = buildScenario('sep-open').data
    skipRow(syn, 's01')
    const unsent = createExpense({
      id: 'v01',
      date: '2026-09-15',
      payer: 'a',
      cat: 'groceries',
      amount: 999,
      memo: '検算（未送信）',
      by: 'a',
      at: '2026-09-15T12:00',
      sync: 'pending',
    })
    syn.expenses.push(unsent)
    const s = summarize(syn.expenses, '2026-09')
    expect(s.total).toBe(EXPECT.syn7.total)
    expect(s.count).toBe(EXPECT.syn7.count)
    expect(s.fixedSum).toBe(EXPECT.syn7.fixedSum)
    expect(s.unsent).toHaveLength(1)
    expect(s.byCat.reduce((t, x) => t + x.amount, 0)).toBe(s.total)
  })
})

describe('V8 カテゴリ別の合計の和 ＝ 支出合計', () => {
  it('9月見込みの内訳', () => {
    expect(m9o.sum.byCat.map((x) => [x.cat, x.amount])).toEqual(EXPECT.sepOpen.byCat)
  })

  it('9月確定の内訳', () => {
    expect(m9f.sum.byCat.map((x) => [x.cat, x.amount])).toEqual(EXPECT.sepFinal.byCat)
  })

  const ALL: [string, SettleModel][] = [
    ['8月', m8],
    ['9月見込み', m9o],
    ['9月確定', m9f],
    ['やり直し後', m9r],
  ]
  it.each(ALL)('%s の和が支出合計に等しい', (_name, md) => {
    expect(md.sum.byCat.reduce((s, x) => s + x.amount, 0)).toBe(md.sum.total)
  })
})

it('V9 毎月の支払いのまとまり ＝ 金額ありの行の和', () => {
  expect(m9o.sum.fixedSum).toBe(EXPECT.sepOpen.fixedSum)
  expect(m9o.sum.fixedCount).toBe(4)
  expect(m8.sum.fixedSum).toBe(EXPECT.aug.fixedSum)
  expect(m8.sum.fixedCount).toBe(4)
  expect(m9f.sum.fixedSum).toBe(EXPECT.sepFinal.fixedSum)
  expect(m9f.sum.fixedCount).toBe(5)
})

describe('V10 §6.3 の合成ケース B・C・D・L', () => {
  it.each(['B', 'C', 'D'] as const)('ケース%s', (id) => {
    const c = findCase(id)
    const r = computeSettle(
      { a: contributionOf(c.net.a, 40), b: contributionOf(c.net.b, 40) },
      c.adv,
      c.adv.a + c.adv.b + c.joint
    )
    expect(r.settle).toEqual(EXPECT.cases[id].settle)
    expect(r.jointNet).toBe(EXPECT.cases[id].jointNet)
  })

  it('ケースL 端数は切り捨て', () => {
    expect(contributionOf(283457, 40)).toBe(EXPECT.cases.L.contribA)
  })
})

describe('S-22 もう払った分の件数（§9.6）', () => {
  const COUNTS: [string, SettleModel, { a: number; b: number }][] = [
    ['8月', m8, EXPECT.aug.advCount],
    ['9月見込み', m9o, EXPECT.sepOpen.advCount],
    ['9月確定', m9f, EXPECT.sepFinal.advCount],
    ['やり直し後', m9r, EXPECT.sepRedo.advCount],
  ]
  it.each(COUNTS)('%s', (_name, md, ex) => {
    expect(md.sum.advRows.a).toHaveLength(ex.a)
    expect(md.sum.advRows.b).toHaveLength(ex.b)
  })

  it('9月確定のまさとの明細（8件 37,510）', () => {
    expect(m9f.sum.advRows.a.map((e) => e.id).sort()).toEqual(['s02', 's06', 's08', 's11', 's13', 's20', 's22', 's26'])
    expect(m9f.sum.advRows.a.reduce((s, e) => s + (e.amount ?? 0), 0)).toBe(37510)
  })
})
