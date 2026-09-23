/**
 * §9.8 シナリオごとの期待値（S-20 の状態・赤い点・新着・10月）と、月の途中の精算。
 * 正本: docs/03_ui_spec.md §9.8・§3.2・§4.0.2・S-20、docs/02_settlement.md §2.4。
 */
import { describe, expect, it } from 'vitest'
import { attention, countNewExpenses, defaultSettleMonth, monthStatus, s20State, settleModel, summarize } from '../calc'
import { confirmMonth, fillAmount } from '../operations'
import type { ScenarioId } from '../sampleData'
import { buildScenario, SCENARIOS } from '../sampleData'
import { attentionKey, SCENARIO_EXPECT } from './fixtures'

describe('§9.8 シナリオごとの期待値', () => {
  for (const s of SCENARIOS) {
    const ex = SCENARIO_EXPECT[s.id]
    describe(s.label, () => {
      const b = buildScenario(s.id)
      const m20 = defaultSettleMonth(b.data, b.now)

      it('精算タブの既定の月と S-20 の状態', () => {
        if (ex.s20m) expect(m20).toBe(ex.s20m)
        expect(s20State(b.data, settleModel(b.data, m20, b.now))).toBe(ex.s20)
      })

      if (ex.s20now) {
        it('［この月を精算する］を押すと片付け／精算のモードになる', () => {
          expect(s20State(b.data, settleModel(b.data, m20, b.now), m20)).toBe(ex.s20now)
        })
      }

      it('赤い点・お知らせ行（まさと・りさこ）', () => {
        expect(attentionKey(attention(b.data, 'a', b.now))).toBe(ex.attA)
        expect(attentionKey(attention(b.data, 'b', b.now))).toBe(ex.attB)
      })

      if (ex.newA != null && ex.newB != null) {
        it('新着の件数', () => {
          expect(countNewExpenses(b.data, 'a', '2026-09')).toBe(ex.newA)
          expect(countNewExpenses(b.data, 'b', '2026-09')).toBe(ex.newB)
        })
      }

      if (ex.octTotal != null) {
        it('10月の合計と金額待ちの件数', () => {
          const so = summarize(b.data.expenses, '2026-10')
          expect(so.total).toBe(ex.octTotal)
          expect(so.pending).toHaveLength(ex.octPending ?? 0)
        })
      }
    })
  }
})

describe('どのシナリオでも 8月は精算済み（§9.8 の最終行）', () => {
  const ids: ScenarioId[] = ['sep-open', 'sep-prep', 'sep-settled', 'sep-redo']
  it.each(ids)('%s', (id) => {
    const b = buildScenario(id)
    const md = settleModel(b.data, '2026-08', b.now)
    expect(md.status).toBe('settled')
    expect(s20State(b.data, md)).toBe('settled')
    expect(md.settle).toEqual({ a: 93060, b: -4930 })
    expect(md.jointNet).toBe(-45890)
    expect(md.total).toBe(255890)
  })
})

describe('月の途中の精算（§6.3 ケースM・§3.2）', () => {
  /** sep-open（9/22）の9月を、金額待ちを片付けてから精算する */
  function midMonthSettled() {
    const b = buildScenario('sep-open')
    const m = '2026-09'
    for (const e of settleModel(b.data, m, b.now).pending) fillAmount(b.data, e.id, 6200, 'a', b.now)
    confirmMonth(b.data, m, 'a', b.now)
    return b
  }

  it('月の途中でも［この金額で精算］で精算中になる', () => {
    const b = midMonthSettled()
    const md = settleModel(b.data, '2026-09', b.now)
    expect(md.status).toBe('confirmed')
    expect(md.remaining?.a).not.toBe(0)
    expect(md.remaining?.b).not.toBe(0)
    expect(s20State(b.data, md)).toBe('transfer')
  })

  it('その月が終わるまで赤い点もお知らせ行も出さない', () => {
    const b = midMonthSettled()
    expect(attention(b.data, 'a', b.now)).toBeNull()
    expect(attention(b.data, 'b', b.now)).toBeNull()
  })

  it('月が終わったら今までどおり出る', () => {
    const b = midMonthSettled()
    const oct = '2026-10-01T09:00'
    expect(attention(b.data, 'a', oct)).not.toBeNull()
    expect(attention(b.data, 'b', oct)).not.toBeNull()
  })
})

describe('月の状態（§4.0.2）', () => {
  it('進行中・締め待ちは日付だけで決まる', () => {
    const b = buildScenario('sep-open')
    expect(monthStatus(b.data, '2026-09', '2026-09-22T12:30')).toBe('open')
    expect(monthStatus(b.data, '2026-09', '2026-10-01T00:00')).toBe('closing')
  })

  it('精算中・精算済みは保存した値から決まる', () => {
    const t = buildScenario('sep-transfer')
    expect(monthStatus(t.data, '2026-09', t.now)).toBe('confirmed')
    const s = buildScenario('sep-settled')
    expect(monthStatus(s.data, '2026-09', s.now)).toBe('settled')
  })

  it('やり直すと日付で決まる状態に戻る（月が終わっていれば締め待ち）', () => {
    const r = buildScenario('sep-redo')
    expect(monthStatus(r.data, '2026-09', r.now)).toBe('closing')
  })
})
