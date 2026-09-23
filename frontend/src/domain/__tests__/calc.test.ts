/**
 * calc.ts の小さな判定（お知らせ行の種類・月の並び・割合・新着）と、
 * ［この金額で精算］を止める理由の順。
 * 正本: docs/03_ui_spec.md §3.2・§2.1・§6.2・§4.0.2・S-10、docs/02_settlement.md §2。
 */
import { describe, expect, it } from 'vitest'
import {
  attention,
  confirmBlock,
  contributionOf,
  countNewExpenses,
  defaultExpenseMonth,
  isNewExpense,
  monthsUntil,
  noticeKind,
  rateFor,
} from '../calc'
import { createExpense } from '../operations'
import { buildScenario } from '../sampleData'
import type { Attention, HouseholdData } from '../types'
import { must } from './fixtures'

describe('お知らせ行の種類（§3.2 の条件1・条件2）', () => {
  it('条件1（締め待ち）は closing、条件2（自分のカードが未チェック）は transfer', () => {
    expect(noticeKind({ kind: 1, m: '2026-09' })).toBe('closing')
    expect(noticeKind({ kind: 2, m: '2026-09', amount: 82490 })).toBe('transfer')
  })

  it('月が終わって未精算なら closing（sep-prep）', () => {
    const b = buildScenario('sep-prep')
    const a = must(attention(b.data, 'a', b.now), '9月の赤い点')
    expect(a).toEqual({ kind: 1, m: '2026-09' })
    expect(noticeKind(a)).toBe('closing')
  })

  it('精算中で自分のカードが未チェックなら transfer（sep-transfer）', () => {
    const b = buildScenario('sep-transfer')
    const a = must(attention(b.data, 'a', b.now), 'まさとの赤い点')
    expect(a).toEqual({ kind: 2, m: '2026-09', amount: 82490 })
    expect(noticeKind(a)).toBe('transfer')
  })

  it('チェックを付けた人には出ず、相手には transfer のまま（sep-transfer-half）', () => {
    const b = buildScenario('sep-transfer-half')
    expect(attention(b.data, 'a', b.now)).toBeNull()
    const bb = must(attention(b.data, 'b', b.now), 'りさこの赤い点')
    expect(noticeKind(bb)).toBe('transfer')
  })

  it('月の途中は出さない（sep-open）', () => {
    const b = buildScenario('sep-open')
    expect(attention(b.data, 'a', b.now)).toBeNull()
    expect(attention(b.data, 'b', b.now)).toBeNull()
  })
})

describe('家計を作った月から今月まで（§2.1）', () => {
  it('見本データは8月から10月まで', () => {
    const b = buildScenario('sep-ready')
    expect(monthsUntil(b.data, b.now)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('年をまたぐ（2026-12 → 2027-01）', () => {
    const b = buildScenario('sep-open')
    const d: HouseholdData = { ...b.data, household: { ...b.data.household, createdMonth: '2026-12' } }
    expect(monthsUntil(d, '2027-01-15T10:00')).toEqual(['2026-12', '2027-01'])
    expect(monthsUntil(d, '2027-03-01T00:00')).toEqual(['2026-12', '2027-01', '2027-02', '2027-03'])
  })

  it('作った月が今月なら今月だけ', () => {
    const b = buildScenario('sep-open')
    const d: HouseholdData = { ...b.data, household: { ...b.data.household, createdMonth: '2026-09' } }
    expect(monthsUntil(d, '2026-09-22T12:30')).toEqual(['2026-09'])
  })
})

describe('その月に使う出す割合（§6.2）', () => {
  it('その月に保存した割合が無ければ人の設定の割合', () => {
    const b = buildScenario('sep-open')
    expect(b.data.contributions['2026-10']).toBeUndefined()
    expect(rateFor(b.data, '2026-10', 'a')).toBe(b.data.people.a.ratePct)
    expect(rateFor(b.data, '2026-10', 'a')).toBe(40)
  })

  it('割合 0 でも人の設定として使う（0 は「未設定」ではない）', () => {
    const b = buildScenario('sep-open')
    b.data.people.a.ratePct = 0
    expect(rateFor(b.data, '2026-10', 'a')).toBe(0)
    expect(contributionOf(300000, 0)).toBe(0)
  })

  it('割合 100 を保存した月は 100（手取りがそのまま出す額）', () => {
    const b = buildScenario('sep-open')
    b.data.contributions['2026-10'] = {
      a: { net: 300000, ratePct: 100, salaryToJoint: false, amount: 300000, by: 'a', at: '2026-10-01T10:00' },
    }
    expect(rateFor(b.data, '2026-10', 'a')).toBe(100)
    expect(contributionOf(300000, 100)).toBe(300000)
    // 保存した月は、人の設定を変えても変わらない
    b.data.people.a.ratePct = 40
    expect(rateFor(b.data, '2026-10', 'a')).toBe(100)
  })

  it('保存した割合が 0 の月は 0（人の設定に落ちない）', () => {
    const b = buildScenario('sep-open')
    b.data.contributions['2026-10'] = {
      a: { net: 300000, ratePct: 0, salaryToJoint: false, amount: 0, by: 'a', at: '2026-10-01T10:00' },
    }
    expect(rateFor(b.data, '2026-10', 'a')).toBe(0)
  })
})

describe('新着（§1.1・S-10）', () => {
  const partnerRow = createExpense({
    id: 'n01',
    date: '2026-09-20',
    payer: 'b',
    cat: 'groceries',
    amount: 1200,
    memo: 'テスト',
    by: 'b',
    at: '2026-09-20T12:00',
  })

  it('まだ一度も見ていない（last_seen_at が null）ときは新着を出さない', () => {
    expect(isNewExpense(partnerRow, 'a', null)).toBe(false)
  })

  it('最後に見たあとに相手が足した行だけ新着', () => {
    expect(isNewExpense(partnerRow, 'a', '2026-09-20T11:59')).toBe(true)
    // ちょうど同じ時刻は新着にしない（e.at > lastSeen）
    expect(isNewExpense(partnerRow, 'a', '2026-09-20T12:00')).toBe(false)
    expect(isNewExpense(partnerRow, 'a', '2026-09-20T12:01')).toBe(false)
  })

  it('自分の記録と毎月の支払いの行は新着にしない', () => {
    expect(isNewExpense(partnerRow, 'b', '2026-09-20T11:59')).toBe(false)
    const autoRow = createExpense({
      id: 'n02',
      date: '2026-09-01',
      payer: 'joint',
      cat: 'housing',
      amount: 85000,
      memo: '家賃',
      tpl: 't1',
      by: 'auto',
      at: '2026-09-20T12:00',
    })
    expect(isNewExpense(autoRow, 'a', '2026-09-20T11:59')).toBe(false)
  })

  it('件数も last_seen_at が null なら 0 件', () => {
    const b = buildScenario('sep-open')
    expect(countNewExpenses(b.data, 'a', '2026-09')).toBe(3)
    b.data.people.a.lastSeen = null
    expect(countNewExpenses(b.data, 'a', '2026-09')).toBe(0)
  })
})

describe('止める理由の順は DB と同じ（0005_rpc.sql settle_confirm・0006 の blocker）', () => {
  it('previous と undecided と pending が同時に欠けた月では previous を返す', () => {
    const b = buildScenario('sep-prep')
    // 8月を締め待ちに戻し、9月の出す額を消す。金額待ちは2件残っている
    delete b.data.settlements['2026-08']
    delete b.data.contributions['2026-09']
    expect(confirmBlock(b.data, '2026-09', b.now)).toEqual({ reason: 'previous', m: '2026-08' })
  })

  it('previous が片付くと undecided、出す額が決まると pending の順で出る', () => {
    const b = buildScenario('sep-prep')
    delete b.data.contributions['2026-09']
    expect(confirmBlock(b.data, '2026-09', b.now)).toEqual({ reason: 'undecided' })
    const back = buildScenario('sep-prep')
    expect(confirmBlock(back.data, '2026-09', back.now)).toEqual({ reason: 'pending', count: 2 })
  })

  it('ロック中はいちばん先に locked（ほかが欠けていても）', () => {
    const b = buildScenario('sep-transfer')
    delete b.data.settlements['2026-08']
    const block = confirmBlock(b.data, '2026-09', b.now)
    expect(block).toEqual({ reason: 'locked', status: 'confirmed' })
  })

  it('まだ来ていない月は future_month で止まる（前の月が締め待ちでも）', () => {
    const b = buildScenario('sep-prep') // いまは 2026-10-01
    // 10月（今月）は前の月が片付いていないので previous、11月（来月）は future_month
    expect(confirmBlock(b.data, '2026-10', b.now)).toEqual({ reason: 'previous', m: '2026-09' })
    expect(confirmBlock(b.data, '2026-11', b.now)).toEqual({ reason: 'future_month' })
  })

  it('お知らせ行の型はそのまま noticeKind に渡せる', () => {
    const a: Attention = { kind: 1, m: '2026-09' }
    expect(noticeKind(a)).toBe('closing')
  })
})

describe('支出タブの既定の月は今月（§3.4）', () => {
  it('その日時のカレンダー月を返す（年またぎ・月初も同じ）', () => {
    expect(defaultExpenseMonth('2026-09-22T10:00')).toBe('2026-09')
    // 年またぎ: 12月の末日の23:59 はまだ12月
    expect(defaultExpenseMonth('2026-12-31T23:59')).toBe('2026-12')
    // 月初の0:00 はもうその月
    expect(defaultExpenseMonth('2026-03-01T00:00')).toBe('2026-03')
  })
})
