/**
 * §6.3 ケース別の表示のもとになる計算（ケース A〜M）。
 * 正本: docs/03_ui_spec.md §6.3、docs/02_settlement.md §9.6。
 */
import { describe, expect, it } from 'vitest'
import {
  computeSettle,
  confirmBlock,
  contributionOf,
  flowOf,
  isLockedStatus,
  jointNetKindOf,
  monthStatus,
  s20State,
  settleModel,
  settlementOf,
  summarize,
} from '../calc'
import { confirmMonth, setCheck } from '../operations'
import { buildScenario } from '../sampleData'
import { buildCaseData, EXPECT, findCase, must } from './fixtures'

/** 合成ケースの精算額を出す */
function caseSettle(id: string) {
  const c = findCase(id)
  return computeSettle(
    { a: contributionOf(c.net.a, 40), b: contributionOf(c.net.b, 40) },
    c.adv,
    c.adv.a + c.adv.b + c.joint
  )
}

it('ケースA 2人とも共用へ入れる（見本 9月 確定値）', () => {
  const b = buildScenario('sep-ready')
  const md = settleModel(b.data, '2026-09', b.now)
  expect(md.settle).toEqual(EXPECT.sepFinal.settle)
  expect(flowOf(md.settle?.a ?? 0)).toBe('in')
  expect(flowOf(md.settle?.b ?? 0)).toBe('in')
  expect(md.jointNet).toBe(1870)
  expect(jointNetKindOf(md.jointNet ?? 0)).toBe('remain')
  expect(s20State(b.data, md)).toBe('ready')
})

it('ケースB 片方が共用から受け取る', () => {
  const r = caseSettle('B')
  expect(r.settle).toEqual(EXPECT.cases.B.settle)
  expect(flowOf(r.settle.a)).toBe('in')
  expect(flowOf(r.settle.b)).toBe('out')
  expect(r.jointNet).toBe(28000)
  expect(jointNetKindOf(r.jointNet)).toBe('remain')
})

describe('ケースC 0円の人がいる', () => {
  it('片方が 0円（チェックは要らない）', () => {
    const r = caseSettle('C')
    expect(r.settle).toEqual(EXPECT.cases.C.settle)
    expect(flowOf(r.settle.b)).toBe('none')
    expect(r.jointNet).toBe(28000)
  })

  it('0円の人にはチェックを付けない（DB の nothing_to_move。02 §7.1）', () => {
    const { data, now } = buildCaseData(findCase('C'))
    expect(confirmMonth(data, '2026-09', 'a', now)).toBe('confirmed')
    // りさこは 0円。押しても何も書かず、チェックは付かない
    expect(setCheck(data, '2026-09', 'b', true, 'b', '2026-10-01T21:10')).toEqual({
      settledNow: false,
      checked: false,
    })
    const rec = must(settlementOf(data, '2026-09'), '9月の精算')
    expect(rec.checks.b).toBeUndefined()
    expect(monthStatus(data, '2026-09', '2026-10-01T21:10')).toBe('confirmed')
    // 0円でないまさとのチェックだけで精算済みになる
    expect(setCheck(data, '2026-09', 'a', true, 'a', '2026-10-01T21:20').settledNow).toBe(true)
    expect(monthStatus(data, '2026-09', '2026-10-01T21:20')).toBe('settled')
  })

  it('2人とも 0円なら［この金額で精算］と同時に精算済み', () => {
    const { data, now } = buildCaseData(findCase('C0'))
    const md = settleModel(data, '2026-09', now)
    expect(md.settle).toEqual(EXPECT.cases.C0.settle)
    // 2人とも 0円でも共用は 1万円足りない（動かす額と共用の過不足は別もの。§6.2）
    expect(md.jointNet).toBe(EXPECT.cases.C0.jointNet)
    expect(jointNetKindOf(md.jointNet ?? 0)).toBe('draw')
    expect(confirmMonth(data, '2026-09', 'a', now)).toBe('settled')
    expect(monthStatus(data, '2026-09', now)).toBe('settled')
  })
})

it('ケースD 共用が足りない', () => {
  const r = caseSettle('D')
  expect(r.settle).toEqual(EXPECT.cases.D.settle)
  expect(r.jointNet).toBe(-22000)
  expect(jointNetKindOf(r.jointNet)).toBe('draw')
})

it("ケースD' 受け取り＋共用も足りない（見本 8月）", () => {
  const b = buildScenario('sep-open')
  const md = settleModel(b.data, '2026-08', b.now)
  expect(md.settle).toEqual({ a: 93060, b: -4930 })
  expect(flowOf(md.settle?.b ?? 0)).toBe('out')
  expect(md.jointNet).toBe(-45890)
  expect(jointNetKindOf(md.jointNet ?? 0)).toBe('draw')
})

it('ケースE 2人とも受け取るのは共用から出る月だけ', () => {
  const r = caseSettle('E')
  expect(r.settle).toEqual(EXPECT.cases.E.settle)
  expect(r.jointNet).toBeLessThan(0)
})

describe('ケースF 金額待ちのまま月が終わった', () => {
  const b = buildScenario('sep-prep')
  const md = settleModel(b.data, '2026-09', b.now)

  it('S-20 は prep で、金額待ちが2件残っている', () => {
    expect(s20State(b.data, md)).toBe('prep')
    expect(md.pending.map((e) => e.memo)).toEqual(['電気代', 'ガス代'])
    expect(confirmBlock(b.data, '2026-09', b.now)).toEqual({ reason: 'pending', count: 2 })
  })

  it('参考値（画面には出さない）', () => {
    expect(md.settle).toEqual(EXPECT.sepPrep.settle)
    expect(md.jointNet).toBe(EXPECT.sepPrep.jointNet)
  })

  it('月の途中（9/22）は estimate で見込みを出す', () => {
    const o = buildScenario('sep-open')
    const om = settleModel(o.data, '2026-09', o.now)
    expect(s20State(o.data, om)).toBe('estimate')
    expect(om.settle).toEqual(EXPECT.sepOpen.settle)
    expect(om.jointNet).toBe(27330)
    expect(om.pending).toHaveLength(2)
  })
})

describe('ケースG 来月に回す', () => {
  it('8月: 電気代（8月分）は8月の精算に入っていない（9月に回した）', () => {
    const b = buildScenario('sep-open')
    const aug = summarize(b.data.expenses, '2026-08')
    expect(aug.rows.some((e) => e.id === 's04')).toBe(false)
    expect(aug.deferredOut.map((e) => e.id)).toEqual(['s04'])
    expect(aug.total).toBe(255890)
  })

  it('9月: 回ってきた電気代（8月分）は9月の共用払いに入る', () => {
    const b = buildScenario('sep-open')
    const sep = summarize(b.data.expenses, '2026-09')
    const s04 = sep.rows.find((e) => e.id === 's04')
    expect(s04?.labelMonth).toBe('2026-08')
    expect(s04?.month).toBe('2026-09')
    expect(sep.joint).toBe(133040)
  })

  it('10月: 回した電気代（9月分）が10月の金額待ちに入る', () => {
    const b = buildScenario('sep-ready')
    const oct = summarize(b.data.expenses, '2026-10')
    expect(oct.total).toBe(92090)
    expect(oct.pending.map((e) => e.id).sort()).toEqual(['o04', 'o05', 's05'])
  })
})

it('ケースH 出す額が決まらないまま月が終わった', () => {
  const b = buildScenario('sep-prep')
  delete b.data.contributions['2026-09']
  const md = settleModel(b.data, '2026-09', b.now)
  expect(md.decided).toBe(false)
  expect(md.settle).toBeNull()
  expect(s20State(b.data, md)).toBe('undecided')
  expect(confirmBlock(b.data, '2026-09', b.now)).toEqual({ reason: 'undecided' })
})

describe('ケースI やり直した後の残りと向き', () => {
  it('I-1 向きが逆になる（見本 10/3）', () => {
    const b = buildScenario('sep-redo')
    const md = settleModel(b.data, '2026-09', b.now)
    expect(md.settle).toEqual(EXPECT.sepRedo.settle)
    expect(md.transferred).toEqual({ a: 82490, b: 65930 })
    expect(md.remaining).toEqual({ a: -3300, b: 0 })
    // 入れたのに、受け取る側になった（矢印と動詞が逆になる）
    expect(flowOf(md.transferred.a)).toBe('in')
    expect(flowOf(md.remaining?.a ?? 0)).toBe('out')
    expect(flowOf(md.remaining?.b ?? 0)).toBe('none')
    expect(md.jointNet).toBe(-1430)
    expect(s20State(b.data, md)).toBe('redo')
    expect(md.hasDone).toBe(true)
  })

  it('I-2 同じ向き（合成）', () => {
    const { data, now } = buildCaseData(findCase('I2'))
    const md = settleModel(data, '2026-09', now)
    expect(md.settle).toEqual({ a: 83770, b: 65930 })
    expect(md.remaining).toEqual({ a: 1280, b: 0 })
    expect(flowOf(md.remaining?.a ?? 0)).toBe('in')
    expect(s20State(data, md)).toBe('redo')
  })

  it('I-3 入れたのに受け取る側になった（合成）', () => {
    const { data, now } = buildCaseData(findCase('I3'))
    const md = settleModel(data, '2026-09', now)
    expect(md.settle).toEqual({ a: -1000, b: 65930 })
    expect(md.remaining).toEqual({ a: -3000, b: 0 })
    expect(flowOf(md.remaining?.a ?? 0)).toBe('out')
  })
})

describe('ケースJ 2人が同時に操作した（冪等）', () => {
  it('［この金額で精算］を2回押しても1回分', () => {
    const b = buildScenario('sep-ready')
    confirmMonth(b.data, '2026-09', 'a', '2026-10-01T21:00')
    const first = structuredClone(must(settlementOf(b.data, '2026-09'), '9月の精算'))
    confirmMonth(b.data, '2026-09', 'b', '2026-10-01T21:00')
    const second = must(settlementOf(b.data, '2026-09'), '9月の精算')
    expect(second.round).toBe(first.round)
    expect(second.snapshot).toEqual(first.snapshot)
  })

  it('チェックを付けたあとに押し直しても、チェックも snapshot も変わらない', () => {
    const b = buildScenario('sep-ready')
    expect(confirmMonth(b.data, '2026-09', 'a', '2026-10-01T21:00')).toBe('confirmed')
    setCheck(b.data, '2026-09', 'a', true, 'a', '2026-10-02T09:10')
    const before = structuredClone(must(settlementOf(b.data, '2026-09'), '9月の精算'))
    // りさこが同じボタンを押し直す（DB の settle_confirm は 'already' を返して何も書かない）
    expect(confirmMonth(b.data, '2026-09', 'b', '2026-10-02T09:20')).toBe('confirmed')
    const after = must(settlementOf(b.data, '2026-09'), '9月の精算')
    expect(after.checks.a?.at).toBe(before.checks.a?.at)
    expect(after.checks.a?.amount).toBe(before.checks.a?.amount)
    expect(after.snapshot).toEqual(before.snapshot)
    expect(after.round).toBe(before.round)
    expect(after.confirmedBy).toBe('a')
    expect(after.confirmedAt).toBe('2026-10-01T21:00')
  })

  it('精算済みの月を押し直しても settled のまま', () => {
    const b = buildScenario('sep-settled')
    const before = structuredClone(must(settlementOf(b.data, '2026-09'), '9月の精算'))
    expect(confirmMonth(b.data, '2026-09', 'a', '2026-10-02T13:00')).toBe('settled')
    expect(must(settlementOf(b.data, '2026-09'), '9月の精算')).toEqual(before)
  })

  it('チェックは「付ける」を2回送っても1つだけ付く', () => {
    const b = buildScenario('sep-transfer')
    setCheck(b.data, '2026-09', 'a', true, 'a', '2026-10-02T09:10')
    const once = must(settlementOf(b.data, '2026-09'), '9月の精算').checks.a
    setCheck(b.data, '2026-09', 'a', true, 'b', '2026-10-02T09:20')
    expect(must(settlementOf(b.data, '2026-09'), '9月の精算').checks.a?.amount).toBe(once?.amount)
    expect(monthStatus(b.data, '2026-09', '2026-10-02T09:20')).toBe('confirmed')
  })
})

it('ケースK 精算中の月はロックされる', () => {
  const b = buildScenario('sep-transfer')
  expect(isLockedStatus(monthStatus(b.data, '2026-09', b.now))).toBe(true)
  expect(confirmBlock(b.data, '2026-09', b.now)).toEqual({ reason: 'locked', status: 'confirmed' })
})

it('ケースL 手取り × 割合の端数は切り捨て', () => {
  expect(contributionOf(283457, 40)).toBe(113382)
  const { data, now } = buildCaseData(findCase('L'))
  const md = settleModel(data, '2026-09', now)
  expect(md.contrib.a).toBe(113382)
  expect(md.settle?.a).toBe(113382 - 37510)
})

it('ケースM 月の途中の精算でも計算は変わらない（§6.2 の式のまま）', () => {
  const b = buildScenario('sep-open')
  const md = settleModel(b.data, '2026-09', b.now)
  expect(md.settle).toEqual({ a: 90840, b: 69530 })
  expect(md.jointNet).toBe(27330)
  // ［この月を精算する］は画面の状態だけ。金額待ちが残っていれば prep
  expect(s20State(b.data, md, '2026-09')).toBe('prep')
  expect(s20State(b.data, md)).toBe('estimate')
})

it('前の月が締め待ちのままなら、次の月は精算中にできない（§6.4）', () => {
  const b = buildScenario('sep-ready')
  // 8月を締め待ちに戻す（精算の記録を消す）
  delete b.data.settlements['2026-08']
  expect(confirmBlock(b.data, '2026-09', b.now)).toEqual({ reason: 'previous', m: '2026-08' })
  // 家計を作った月は前の月を問わない
  expect(confirmBlock(b.data, '2026-08', b.now)).toBeNull()
})
