/**
 * 給料の入り先（S-33「給料の入り先」）の計算。
 * 正本: docs/03_ui_spec.md §6.2（`共用に入った給料`・`精算額`）・§6.3 ケースN・§9.6 検算 V11。
 *
 * 見本データ（§9）の既定は2人とも「自分の口座」なので、V1〜V10 と §9.8 の期待値は変わらない
 * （それは verification.test.ts / scenarios.test.ts が見る）。ここでは「共用口座」を重ねた月を見る。
 */
import { describe, expect, it } from 'vitest'
import {
  computeJointLedger,
  computeJointSalary,
  computeSettle,
  contributionOf,
  jointSalaryOf,
  PERSON_KEYS,
  salaryToJointFor,
  settleModel,
} from '../calc'
import { addMonth } from '../month'
import { confirmMonth, decideContributions, saveContributions } from '../operations'
import { buildScenario } from '../sampleData'
import type { HouseholdData, MonthKey, PersonFlags, PersonKey, SettleModel } from '../types'
import { EXPECT } from './fixtures'

/** 9月（締め待ち・金額待ちなし）のデータに「給料の入り先」を重ねる */
function withSalaryToJoint(flags: PersonFlags, scenario: 'sep-ready' | 'sep-open' = 'sep-ready') {
  const b = buildScenario(scenario)
  for (const p of PERSON_KEYS) {
    b.data.people[p].salaryToJoint = flags[p]
    const c = b.data.contributions['2026-09']?.[p]
    if (c) c.salaryToJoint = flags[p]
  }
  return b
}

/**
 * 検算 V11（§9.6）。
 * 共用の月間収支 ＝ Σ手取り(共用に入る人) ＋ Σ(正の精算額) − 共用払い − Σ|負の精算額|
 *                ＝ (Σ出す額 − 支出合計) ＋ Σ(手取り − 共用に入った給料)
 */
function checkV11(md: SettleModel): void {
  const ledger = md.jointLedger
  const settle = md.settle
  expect(ledger).not.toBeNull()
  expect(settle).not.toBeNull()
  if (!ledger || !settle) return

  // 左辺: 通帳の動きをそのまま足し引きする
  let salaryIn = 0
  let plus = 0
  let minus = 0
  for (const p of PERSON_KEYS) {
    if (md.salaryToJoint[p]) salaryIn += md.net[p] ?? 0
    if (settle[p] > 0) plus += settle[p]
    else minus += -settle[p]
  }
  const byFlow = salaryIn + plus - md.joint - minus

  // 右辺: 出す額ベースの過不足 ＋ 給料の残り
  let salaryRemainder = 0
  for (const p of PERSON_KEYS) {
    if (!md.salaryToJoint[p]) continue
    salaryRemainder += (md.net[p] ?? 0) - md.jointSalary[p]
  }
  const byIdentity = (md.jointNet ?? 0) + salaryRemainder

  expect(byFlow).toBe(byIdentity)
  expect(ledger.balance).toBe(byFlow)
  expect(ledger.salaryRemainder).toBe(salaryRemainder)
}

describe('共用に入った給料（§6.2）', () => {
  it('入り先が自分の口座なら 0', () => {
    expect(jointSalaryOf(220000, 88000, false)).toBe(0)
  })

  it('入り先が共用なら min(手取り, 出す額)', () => {
    expect(jointSalaryOf(220000, 88000, true)).toBe(88000)
  })

  it('手取り < 出す額 なら手取りまで（§6.3 ケースN のエッジ）', () => {
    expect(jointSalaryOf(50000, 60000, true)).toBe(50000)
  })

  it('手取りが決まっていない月は 0', () => {
    expect(jointSalaryOf(null, null, true)).toBe(0)
    expect(computeJointSalary({ a: null, b: null }, { a: null, b: null }, { a: true, b: true })).toEqual({ a: 0, b: 0 })
  })

  it('その月の値は保存したものを使い、人の設定を変えても動かない', () => {
    const b = buildScenario('sep-ready')
    expect(salaryToJointFor(b.data, '2026-09', 'b')).toBe(false)
    const c = b.data.contributions['2026-09']?.b
    expect(c).toBeDefined()
    if (c) c.salaryToJoint = true
    b.data.people.b.salaryToJoint = false
    expect(salaryToJointFor(b.data, '2026-09', 'b')).toBe(true)
    // 出す額を決めていない月は人の設定に落ちる
    b.data.people.b.salaryToJoint = true
    expect(salaryToJointFor(b.data, '2026-12', 'b')).toBe(true)
  })
})

describe('§6.3 ケースN りさこの給料が共用に入る（9月の確定値に重ねる）', () => {
  const { data, now } = withSalaryToJoint({ a: false, b: true })
  const md = settleModel(data, '2026-09', now)

  it('もとの月の値（立替・共用払い・支出合計・出す額）は変わらない', () => {
    expect(md.adv).toEqual(EXPECT.sepFinal.adv)
    expect(md.joint).toBe(EXPECT.sepFinal.joint)
    expect(md.total).toBe(EXPECT.sepFinal.total)
    expect(md.contrib).toEqual({ a: 120000, b: 88000 })
  })

  it('共用に入った給料は まさと 0・りさこ 88,000', () => {
    expect(md.jointSalary).toEqual({ a: 0, b: 88000 })
  })

  it('精算額は まさと ＋82,490（共用へ入れる）・りさこ −22,070（共用から受け取る）', () => {
    expect(md.settle).toEqual({ a: 82490, b: -22070 })
    expect(md.settle?.a).toBe(120000 - 37510 - 0)
    expect(md.settle?.b).toBe(88000 - 22070 - 88000)
  })

  it('共用の過不足（出す額ベース）は 1,870 のまま', () => {
    expect(md.jointNet).toBe(EXPECT.sepFinal.jointNet)
  })

  it('共用には 133,870 残る（うち 給料の残り 132,000）', () => {
    expect(md.jointLedger).toEqual({
      salaryIn: 220000,
      salaryApplied: 88000,
      salaryRemainder: 132000,
      jointNet: 1870,
      balance: 133870,
      hasSalaryToJoint: true,
    })
    // 220,000 ＋ 82,490 − 146,550 − 22,070 ＝ 133,870
    expect(220000 + 82490 - 146550 - 22070).toBe(133870)
    // 内訳: 出す額ベースの過不足 1,870 ＋ 給料の残り 132,000
    expect(1870 + 132000).toBe(133870)
  })

  it('V11 の等式が成り立つ', () => {
    checkV11(md)
  })
})

describe('§6.3 ケースN のエッジ', () => {
  it('2人とも共用に入る: どちらも立替の実費だけ受け取る', () => {
    const { data, now } = withSalaryToJoint({ a: true, b: true })
    const md = settleModel(data, '2026-09', now)
    expect(md.jointSalary).toEqual({ a: 120000, b: 88000 })
    expect(md.settle).toEqual({ a: -EXPECT.sepFinal.adv.a, b: -EXPECT.sepFinal.adv.b })
    // 共用には 2人の手取りが入り、支出を払って残る
    expect(md.jointLedger?.balance).toBe(300000 + 220000 - 37510 - 22070 - 146550)
    expect(md.jointLedger?.salaryRemainder).toBe(300000 - 120000 + (220000 - 88000))
    checkV11(md)
  })

  it('手取り < 出す額: 共用に入った給料は手取りまで。残りは追加で共用へ入れる', () => {
    const { data, now } = withSalaryToJoint({ a: false, b: true })
    const c = data.contributions['2026-09']?.b
    expect(c).toBeDefined()
    if (!c) return
    // 手取りより出す額が大きい形（割合 0〜100 では起きないが、式が手取りで止まることを見る）
    c.net = 50000
    c.amount = 60000
    const md = settleModel(data, '2026-09', now)
    expect(md.jointSalary.b).toBe(50000)
    // 60,000 − 22,070 − 50,000 ＝ −12,070（足りない 10,000 は精算額に残る）
    expect(md.settle?.b).toBe(60000 - EXPECT.sepFinal.adv.b - 50000)
    expect(md.jointLedger?.salaryRemainder).toBe(0)
    checkV11(md)
  })

  it('手取りが未入力の月: 共用に入った給料は 0（出す額も決まっていない）', () => {
    const b = buildScenario('sep-ready')
    b.data.people.a.salaryToJoint = true
    b.data.people.b.salaryToJoint = true
    const next: MonthKey = addMonth('2026-09', 1)
    const md = settleModel(b.data, next, b.now)
    expect(md.decided).toBe(false)
    expect(md.jointSalary).toEqual({ a: 0, b: 0 })
    expect(md.settle).toBeNull()
    expect(md.jointLedger).toBeNull()
  })

  it('給料が共用に入る人がいない月は hasSalaryToJoint が false（S-20 の注記の条件は salaryRemainder > 0。ここは出力の形の確認）', () => {
    const b = buildScenario('sep-ready')
    const md = settleModel(b.data, '2026-09', b.now)
    expect(md.jointLedger?.hasSalaryToJoint).toBe(false)
    expect(md.jointLedger?.salaryRemainder).toBe(0)
    expect(md.jointLedger?.balance).toBe(md.jointNet)
    expect(md.settle).toEqual(EXPECT.sepFinal.settle)
    checkV11(md)
  })
})

describe('決めた月に保存する（§6.2）', () => {
  it('出す額を決めると、そのときの給料の入り先を月ごとに保存する', () => {
    const b = buildScenario('sep-ready')
    b.data.people.b.salaryToJoint = true
    const m: MonthKey = '2026-10'
    const decided = decideContributions(b.data, m, { a: 300000, b: 220000 }, 'a', '2026-10-01T09:00')
    expect(decided.a?.salaryToJoint).toBe(false)
    expect(decided.b?.salaryToJoint).toBe(true)
    saveContributions(b.data, m, decided)
    // あとで設定を戻しても、決めた月の値は動かない
    b.data.people.b.salaryToJoint = false
    expect(salaryToJointFor(b.data, m, 'b')).toBe(true)
  })

  it('決め直すと、給料の入り先は今の設定になる（割合は保存した値のまま）', () => {
    const b = buildScenario('sep-open')
    // 9月は 割合40%・自分の口座 で決めてある。そのあと2つとも設定を変える
    b.data.people.a.ratePct = 50
    b.data.people.a.salaryToJoint = true
    const again = decideContributions(b.data, '2026-09', { a: 300000 }, 'a', '2026-09-25T10:00')
    // 取り決め（割合）は決めた月の値のまま
    expect(again.a?.ratePct).toBe(40)
    expect(again.a?.amount).toBe(120000)
    // 事実（給料の入り先）は決め直した時点の設定
    expect(again.a?.salaryToJoint).toBe(true)
    saveContributions(b.data, '2026-09', again)
    expect(salaryToJointFor(b.data, '2026-09', 'a')).toBe(true)
    // 決め直していない人（りさこ）は動かない
    expect(salaryToJointFor(b.data, '2026-09', 'b')).toBe(false)
  })

  it('設定を戻して決め直すと、給料の入り先も戻る', () => {
    const b = withSalaryToJoint({ a: false, b: true }, 'sep-open')
    expect(salaryToJointFor(b.data, '2026-09', 'b')).toBe(true)
    b.data.people.b.salaryToJoint = false
    // 設定を変えただけでは決めた月は動かない
    expect(salaryToJointFor(b.data, '2026-09', 'b')).toBe(true)
    saveContributions(b.data, '2026-09', decideContributions(b.data, '2026-09', { b: 220000 }, 'b', '2026-09-25T10:00'))
    expect(salaryToJointFor(b.data, '2026-09', 'b')).toBe(false)
    expect(b.data.contributions['2026-09']?.b?.ratePct).toBe(40)
    expect(b.data.contributions['2026-09']?.b?.amount).toBe(88000)
  })

  it('精算中の月は、決めたときに保存した値で表示する', () => {
    const { data, now } = withSalaryToJoint({ a: false, b: true })
    const before = settleModel(data, '2026-09', now)
    expect(confirmMonth(data, '2026-09', 'a', '2026-10-01T21:00')).toBe('confirmed')
    // 精算したあとに設定も月の値も「自分の口座」に戻す
    data.people.b.salaryToJoint = false
    const c = data.contributions['2026-09']?.b
    if (c) c.salaryToJoint = false
    const after = settleModel(data, '2026-09', now)
    expect(after.status).toBe('confirmed')
    expect(after.salaryToJoint).toEqual({ a: false, b: true })
    expect(after.jointSalary).toEqual({ a: 0, b: 88000 })
    expect(after.settle).toEqual(before.settle)
    expect(after.jointLedger).toEqual(before.jointLedger)
    checkV11(after)
  })
})

describe('V11 いろいろな形で等式が成り立つ', () => {
  const FLAGS: PersonFlags[] = [
    { a: false, b: false },
    { a: false, b: true },
    { a: true, b: false },
    { a: true, b: true },
  ]
  it.each(FLAGS.map((f) => [`a=${f.a} b=${f.b}`, f] as const))('9月（%s）', (_name, flags) => {
    const { data, now } = withSalaryToJoint(flags)
    checkV11(settleModel(data, '2026-09', now))
  })

  it('合成（出す額・立替・共用払いを入れ替えても）', () => {
    for (const net of [
      { a: 300000, b: 220000 },
      { a: 283457, b: 190001 },
      { a: 0, b: 220000 },
    ]) {
      for (const flags of FLAGS) {
        const contrib = { a: contributionOf(net.a, 40), b: contributionOf(net.b, 40) }
        const jointSalary = computeJointSalary(net, contrib, flags)
        const adv = { a: 37510, b: 22070 }
        const joint = 146550
        const total = adv.a + adv.b + joint
        const r = computeSettle(contrib, adv, total, jointSalary)
        const ledger = computeJointLedger(net, flags, jointSalary, r.settle, r.jointNet, joint)
        let salaryIn = 0
        let plus = 0
        let minus = 0
        for (const p of PERSON_KEYS) {
          if (flags[p]) salaryIn += net[p]
          if (r.settle[p] > 0) plus += r.settle[p]
          else minus += -r.settle[p]
        }
        expect(ledger.balance).toBe(salaryIn + plus - joint - minus)
        expect(ledger.balance).toBe(r.jointNet + ledger.salaryRemainder)
      }
    }
  })
})

describe('§9 の見本データの既定は変わらない', () => {
  it('2人とも「自分の口座」で、共用に入った給料は 0', () => {
    const b = buildScenario('sep-open')
    for (const p of PERSON_KEYS) {
      expect(b.data.people[p].salaryToJoint).toBe(false)
      for (const m of Object.keys(b.data.contributions)) {
        expect(b.data.contributions[m]?.[p]?.salaryToJoint).toBe(false)
      }
    }
    const check = (d: HouseholdData, m: MonthKey, now: string, p: PersonKey): void => {
      expect(settleModel(d, m, now).jointSalary[p]).toBe(0)
    }
    for (const p of PERSON_KEYS) {
      check(b.data, '2026-08', b.now, p)
      check(b.data, '2026-09', b.now, p)
    }
  })
})
