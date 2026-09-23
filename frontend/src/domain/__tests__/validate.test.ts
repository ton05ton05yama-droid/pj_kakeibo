/**
 * 入れてよい数の範囲（記録の金額 1〜9,999,999、手取り 0〜9,999,999）。
 * 正本: docs/02_settlement.md §7.2 の注、docs/04_data_model.md §3 の check 制約、docs/03_ui_spec.md S-12・S-21。
 */
import { describe, expect, it } from 'vitest'
import { createExpense, decideContributions } from '../operations'
import { buildScenario } from '../sampleData'
import { AMOUNT_MAX, assertAmount, assertNet } from '../validate'

const newExpense = (amount: number) =>
  createExpense({
    id: 'v01',
    date: '2026-09-20',
    payer: 'a',
    cat: 'other',
    amount,
    memo: 'テスト',
    by: 'a',
    at: '2026-09-20T12:00',
  })

describe('記録の金額（1〜9,999,999）', () => {
  it.each([1, 2, 1000, AMOUNT_MAX])('%i は入れられる', (n) => {
    expect(() => assertAmount(n)).not.toThrow()
  })

  it.each([0, -1, 10_000_000, AMOUNT_MAX + 1])('%i は入れられない', (n) => {
    expect(() => assertAmount(n)).toThrow()
  })

  it('整数でない数は入れられない（円の整数だけ）', () => {
    expect(() => assertAmount(1000.5)).toThrow()
    expect(() => assertAmount(Number.NaN)).toThrow()
    expect(() => assertAmount(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('手取り（0〜9,999,999）', () => {
  it.each([0, 1, 220000, AMOUNT_MAX])('%i は入れられる', (n) => {
    expect(() => assertNet(n)).not.toThrow()
  })

  it.each([-1, 10_000_000, AMOUNT_MAX + 1])('%i は入れられない', (n) => {
    expect(() => assertNet(n)).toThrow()
  })

  it('手取り 0 は入れられ、出す額も 0 になる', () => {
    const b = buildScenario('sep-open')
    const plan = decideContributions(b.data, '2026-10', { a: 0 }, 'a', '2026-10-01T10:00')
    expect(plan.a?.net).toBe(0)
    expect(plan.a?.amount).toBe(0)
  })
})

describe('操作から範囲を見る', () => {
  it('記録を作るときに範囲の外なら止まる', () => {
    expect(() => newExpense(1)).not.toThrow()
    expect(() => newExpense(AMOUNT_MAX)).not.toThrow()
    expect(() => newExpense(0)).toThrow()
    expect(() => newExpense(10_000_000)).toThrow()
  })

  it('金額待ちの行（金額が無い行）は作れる', () => {
    expect(() =>
      createExpense({
        id: 'v02',
        date: '2026-09-01',
        payer: 'joint',
        cat: 'utilities',
        amount: null,
        memo: '電気代',
        tpl: 't4',
        by: 'auto',
        at: '2026-09-01T00:00',
      })
    ).not.toThrow()
  })

  it('出す額を決めるときに手取りの範囲の外なら止まる', () => {
    const b = buildScenario('sep-open')
    const at = '2026-10-01T10:00'
    expect(() => decideContributions(b.data, '2026-10', { a: AMOUNT_MAX }, 'a', at)).not.toThrow()
    expect(() => decideContributions(b.data, '2026-10', { a: 10_000_000 }, 'a', at)).toThrow()
    expect(() => decideContributions(b.data, '2026-10', { a: -1 }, 'a', at)).toThrow()
  })
})
