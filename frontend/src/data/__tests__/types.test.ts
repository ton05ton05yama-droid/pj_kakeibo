/**
 * DB の行 → ドメインの型の写し替え（`data/types.ts`）。
 * 行の形は docs/04_data_model.md §2 の列の定義に合わせたダミー（Supabase はまだ無い）。
 */
import { describe, expect, it } from 'vitest'
import type { HouseholdData, MonthContributions } from '../../domain'
import { settleModel } from '../../domain'
import {
  buildPersonMap,
  type ExpenseRow,
  type FixedCostTemplateRow,
  fromPayer,
  type HouseholdMemberRow,
  type HouseholdRow,
  type MonthContributionRow,
  type MonthSettlementLineRow,
  type MonthSettlementRow,
  type SettlementCheckRow,
  toContributions,
  toDbMonth,
  toExpense,
  toHousehold,
  toMonthKey,
  toPayer,
  toPerson,
  toSettlements,
  toTemplate,
} from '../types'

/** 04 §2.2 household_members（position 1 = まさと = a、2 = りさこ = b） */
const UID_A = '11111111-1111-4111-8111-111111111111'
const UID_B = '22222222-2222-4222-8222-222222222222'

const MEMBER_ROWS: HouseholdMemberRow[] = [
  {
    household_id: 'h1',
    user_id: UID_A,
    position: 1,
    display_name: 'まさと',
    color: 'teal',
    contribution_rate: 40,
    salary_to_joint: false,
    default_payer: 'self',
  },
  {
    household_id: 'h1',
    user_id: UID_B,
    position: 2,
    display_name: 'りさこ',
    color: 'amber',
    contribution_rate: 40,
    salary_to_joint: false,
    default_payer: 'self',
  },
]

const persons = buildPersonMap(MEMBER_ROWS)

describe('月・人・払った人の写し替え', () => {
  it('月は「その月の1日」と YYYY-MM を行き来する', () => {
    expect(toMonthKey('2026-09-01')).toBe('2026-09')
    expect(toDbMonth('2026-09')).toBe('2026-09-01')
    expect(toMonthKey(toDbMonth('2026-12'))).toBe('2026-12')
  })

  it('人は position で a / b に結ぶ', () => {
    expect(persons.keyOf[UID_A]).toBe('a')
    expect(persons.keyOf[UID_B]).toBe('b')
    expect(persons.idOf).toEqual({ a: UID_A, b: UID_B })
  })

  it('払った人は null が共用（行き帰りで同じ値になる）', () => {
    expect(toPayer(null, persons)).toBe('joint')
    expect(toPayer(UID_B, persons)).toBe('b')
    // 家計に居ない人の行は共用として扱う（消えたメンバー）
    expect(toPayer('33333333-3333-4333-8333-333333333333', persons)).toBe('joint')
    expect(fromPayer('joint', persons)).toBeNull()
    expect(fromPayer('a', persons)).toBe(UID_A)
    expect(fromPayer(toPayer(UID_B, persons), persons)).toBe(UID_B)
  })
})

describe('家計・人・ひな形', () => {
  it('家計は start_month が「作った月」になる', () => {
    const row: HouseholdRow = { id: 'h1', name: 'かけいぼ', start_month: '2026-08-01' }
    expect(toHousehold(row, 'kakeibo.invalid')).toEqual({
      createdMonth: '2026-08',
      appName: 'かけいぼ',
      emailDomain: 'kakeibo.invalid',
    })
  })

  it('人は色を a / b に、最後に見た日時を分まで写す', () => {
    const person = toPerson(MEMBER_ROWS[1] as HouseholdMemberRow, 'risako', {
      user_id: UID_B,
      onboarded_at: '2026-08-01T21:00:00+09:00',
      last_seen_at: '2026-09-21T21:00:00+09:00',
    })
    expect(person).toEqual({
      id: 'risako',
      name: 'りさこ',
      color: 'b',
      ratePct: 40,
      salaryToJoint: false,
      defaultPayer: 'self',
      lastSeen: '2026-09-21T21:00',
    })
    // profiles の行が無ければ「まだ見ていない」
    expect(toPerson(MEMBER_ROWS[0] as HouseholdMemberRow, 'masato', null).lastSeen).toBeNull()
  })

  it('ひな形は作った人・作った日時・やめた月を写す', () => {
    const row: FixedCostTemplateRow = {
      id: 't1',
      name: '家賃',
      category_id: 'housing',
      paid_by: null,
      amount_kind: 'fixed',
      amount: 85000,
      start_month: '2026-08-01',
      end_month: null,
      created_by: UID_A,
      created_at: '2026-08-01T21:00:00+09:00',
    }
    expect(toTemplate(row, persons)).toEqual({
      id: 't1',
      name: '家賃',
      cat: 'housing',
      payer: 'joint',
      kind: 'fixed',
      amount: 85000,
      from: '2026-08',
      until: null,
      createdBy: 'a',
      createdAt: '2026-08-01T21:00',
    })
    // 支払いをやめた行
    expect(toTemplate({ ...row, end_month: '2026-10-01' }, persons).until).toBe('2026-10')
  })
})

describe('記録', () => {
  const manual: ExpenseRow = {
    id: 'e1',
    spent_on: '2026-09-22',
    accounting_month: '2026-09-01',
    category_id: 'groceries',
    amount: 1280,
    paid_by: UID_A,
    memo: 'スーパー',
    fixed_cost_id: null,
    period_month: null,
    name: null,
    skipped: false,
    amount_set_by: null,
    amount_set_at: null,
    created_by: UID_A,
    created_at: '2026-09-22T12:30:00+09:00',
    updated_by: null,
    updated_at: null,
  }

  it('手入力の記録はメモと記録した人を写す', () => {
    const e = toExpense(manual, persons)
    expect(e).toMatchObject({
      id: 'e1',
      date: '2026-09-22',
      month: '2026-09',
      labelMonth: null,
      payer: 'a',
      cat: 'groceries',
      amount: 1280,
      memo: 'スーパー',
      tpl: null,
      by: 'a',
      at: '2026-09-22T12:30',
      amountBy: null,
      amountAt: null,
      skipped: false,
      sync: null,
      editedAt: null,
      editedBy: null,
    })
    // メモが無ければ空文字（画面では出さない）
    expect(toExpense({ ...manual, memo: null }, persons).memo).toBe('')
  })

  it('直した記録は直した人と日時を写す', () => {
    const e = toExpense({ ...manual, updated_by: UID_A, updated_at: '2026-09-23T08:10:00+09:00' }, persons)
    expect(e.editedBy).toBe('a')
    expect(e.editedAt).toBe('2026-09-23T08:10')
  })

  it('毎月の支払いの行は「毎月」・名前・対象月を写す（金額待ちは amount が null）', () => {
    const fixedRow: ExpenseRow = {
      ...manual,
      id: 'e2',
      spent_on: '2026-09-01',
      category_id: 'utilities',
      amount: null,
      paid_by: null,
      memo: null,
      fixed_cost_id: 't4',
      period_month: '2026-09-01',
      name: '電気代',
      created_by: null,
      created_at: '2026-09-01T00:00:00+09:00',
    }
    expect(toExpense(fixedRow, persons)).toMatchObject({
      month: '2026-09',
      labelMonth: '2026-09',
      payer: 'joint',
      amount: null,
      memo: '電気代',
      tpl: 't4',
      by: 'auto',
      at: '2026-09-01T00:00',
    })
    // 来月に回した行（帰属月だけ進む。対象月は変わらない）
    expect(toExpense({ ...fixedRow, accounting_month: '2026-10-01' }, persons)).toMatchObject({
      month: '2026-10',
      labelMonth: '2026-09',
    })
    // 金額を入れた行
    const filled = toExpense(
      { ...fixedRow, amount: 6200, amount_set_by: UID_A, amount_set_at: '2026-10-01T20:40:00+09:00' },
      persons
    )
    expect(filled.amountBy).toBe('a')
    expect(filled.amountAt).toBe('2026-10-01T20:40')
  })
})

describe('出す額', () => {
  it('月 → 人 の形にまとめる（家計に居ない人の行は捨てる）', () => {
    const rows: MonthContributionRow[] = [
      {
        month: '2026-09-01',
        user_id: UID_A,
        net_income: 300000,
        contribution_rate: 40,
        salary_to_joint: false,
        contribution: 120000,
        decided_by: UID_A,
        decided_at: '2026-09-01T21:00:00+09:00',
      },
      {
        month: '2026-09-01',
        user_id: UID_B,
        net_income: 220000,
        contribution_rate: 40,
        salary_to_joint: false,
        contribution: 88000,
        decided_by: UID_B,
        decided_at: '2026-09-03T08:15:00+09:00',
      },
      {
        month: '2026-10-01',
        user_id: '33333333-3333-4333-8333-333333333333',
        net_income: 1,
        contribution_rate: 40,
        salary_to_joint: false,
        contribution: 0,
        decided_by: UID_A,
        decided_at: '2026-10-01T21:00:00+09:00',
      },
    ]
    const out = toContributions(rows, persons)
    expect(Object.keys(out)).toEqual(['2026-09'])
    expect(out['2026-09']).toEqual({
      a: { net: 300000, ratePct: 40, salaryToJoint: false, amount: 120000, by: 'a', at: '2026-09-01T21:00' },
      b: { net: 220000, ratePct: 40, salaryToJoint: false, amount: 88000, by: 'b', at: '2026-09-03T08:15' },
    })
  })
})

describe('月の精算', () => {
  const contributions: Record<string, MonthContributions> = {
    '2026-09': {
      a: { net: 300000, ratePct: 40, salaryToJoint: false, amount: 120000, by: 'a', at: '2026-09-01T21:00' },
      b: { net: 220000, ratePct: 40, salaryToJoint: false, amount: 88000, by: 'b', at: '2026-09-03T08:15' },
    },
  }

  const settlementRow: MonthSettlementRow = {
    month: '2026-09-01',
    status: 'confirmed',
    round: 2,
    expense_total: 206130,
    joint_paid: 146550,
    contribution_total: 208000,
    joint_net: 1870,
    confirmed_by: UID_A,
    confirmed_at: '2026-10-01T21:00:00+09:00',
    settled_at: null,
    reopened_by: null,
    reopened_at: null,
    reopened_from: null,
  }

  const lines: MonthSettlementLineRow[] = [
    {
      month: '2026-09-01',
      user_id: UID_A,
      contribution: 120000,
      advance: 37510,
      settlement: 82490,
      transferred: 0,
      remaining: 82490,
    },
    {
      month: '2026-09-01',
      user_id: UID_B,
      contribution: 88000,
      advance: 22070,
      settlement: 65930,
      transferred: 0,
      remaining: 65930,
    },
  ]

  it('精算中は行の値を済んだ分に、いまの回のチェックを checks にする', () => {
    const checks: SettlementCheckRow[] = [
      // 前の回のチェック（済んだ分の明細に残る）
      {
        month: '2026-09-01',
        round: 1,
        user_id: UID_A,
        amount: 1000,
        checked_by: UID_A,
        checked_at: '2026-10-01T21:10:00+09:00',
      },
      // いまの回のチェック
      {
        month: '2026-09-01',
        round: 2,
        user_id: UID_B,
        amount: 65930,
        checked_by: UID_B,
        checked_at: '2026-10-02T12:30:00+09:00',
      },
      // ほかの月のチェックは混ざらない
      {
        month: '2026-08-01',
        round: 1,
        user_id: UID_A,
        amount: 999,
        checked_by: UID_A,
        checked_at: '2026-09-01T21:00:00+09:00',
      },
    ]
    const out = toSettlements([settlementRow], lines, checks, contributions, persons)
    const rec = out['2026-09']
    expect(rec).toBeDefined()
    if (!rec) return
    expect(rec.status).toBe('confirmed')
    expect(rec.round).toBe(2)
    expect(rec.transferred).toEqual({ a: 0, b: 0 })
    expect(rec.done.a).toEqual([{ amount: 1000, at: '2026-10-01T21:10', by: 'a', round: 1 }])
    expect(rec.checks).toEqual({ b: { by: 'b', at: '2026-10-02T12:30', amount: 65930 } })
    expect(rec.snapshot).toEqual({
      contrib: { a: 120000, b: 88000 },
      net: { a: 300000, b: 220000 },
      ratePct: { a: 40, b: 40 },
      salaryToJoint: { a: false, b: false },
      adv: { a: 37510, b: 22070 },
      jointSalary: { a: 0, b: 0 },
      joint: 146550,
      total: 206130,
      settle: { a: 82490, b: 65930 },
      jointNet: 1870,
    })
  })

  it('給料が共用に入る月は、保存した行のまま 共用に入った給料 と 精算額 を写す（§6.3 ケースN）', () => {
    // DB の行（りさこの給料は共用に入る月。0008_salary_to_joint.sql の式で保存されたもの）
    const rows: MonthContributionRow[] = [
      {
        month: '2026-09-01',
        user_id: UID_A,
        net_income: 300000,
        contribution_rate: 40,
        salary_to_joint: false,
        contribution: 120000,
        decided_by: UID_A,
        decided_at: '2026-09-01T21:00:00+09:00',
      },
      {
        month: '2026-09-01',
        user_id: UID_B,
        net_income: 220000,
        contribution_rate: 40,
        salary_to_joint: true,
        contribution: 88000,
        decided_by: UID_B,
        decided_at: '2026-09-03T08:15:00+09:00',
      },
    ]
    // month_settlement_lines も DB の新しい式（精算額 ＝ 出す額 − 立替 − 共用に入った給料）で入っている
    const caseNLines: MonthSettlementLineRow[] = [
      {
        month: '2026-09-01',
        user_id: UID_A,
        contribution: 120000,
        advance: 37510,
        settlement: 82490,
        transferred: 0,
        remaining: 82490,
      },
      {
        month: '2026-09-01',
        user_id: UID_B,
        contribution: 88000,
        advance: 22070,
        settlement: -22070,
        transferred: 0,
        remaining: -22070,
      },
    ]
    const caseN = toContributions(rows, persons)
    const out = toSettlements([settlementRow], caseNLines, [], caseN, persons)
    const rec = out['2026-09']
    expect(rec).toBeDefined()
    if (!rec) return
    expect(rec.snapshot?.salaryToJoint).toEqual({ a: false, b: true })
    expect(rec.snapshot?.jointSalary).toEqual({ a: 0, b: 88000 })
    // 保存値そのまま（りさこは共用から 22,070 受け取る）
    expect(rec.snapshot?.settle).toEqual({ a: 82490, b: -22070 })

    // 同じ snapshot から作った画面の数字も、DB の保存値と一致する（端末と DB の式が同じ）
    const data: HouseholdData = {
      household: toHousehold({ id: 'h1', name: 'かけいぼ', start_month: '2026-08-01' }, 'kakeibo.invalid'),
      people: {
        a: toPerson(MEMBER_ROWS[0] as HouseholdMemberRow, 'masato', null),
        b: toPerson({ ...(MEMBER_ROWS[1] as HouseholdMemberRow), salary_to_joint: true }, 'risako', null),
      },
      templates: [],
      contributions: caseN,
      expenses: [],
      settlements: out,
    }
    const md = settleModel(data, '2026-09', '2026-10-02T09:00')
    expect(md.jointSalary).toEqual({ a: 0, b: 88000 })
    expect(md.settle).toEqual(rec.snapshot?.settle)
    expect(md.settle).toEqual({ a: 82490, b: -22070 })
    // 共用に残る額（§6.3 ケースN。検算 V11: 133,870 ＝ 1,870 ＋ 132,000）
    expect(md.jointNet).toBe(1870)
    expect(md.jointLedger?.balance).toBe(133870)
    expect(md.jointLedger?.salaryRemainder).toBe(132000)
  })

  it('やり直し中は行を使わず、すべての回のチェックの合計を済んだ分にする（D7）', () => {
    const reopened: MonthSettlementRow = {
      ...settlementRow,
      status: 'reopened',
      round: 3,
      settled_at: null,
      reopened_by: UID_A,
      reopened_at: '2026-10-03T20:05:00+09:00',
      reopened_from: 'settled',
    }
    // 行（lines）は確定した回のままで、済んだ分としては古い
    const staleLines: MonthSettlementLineRow[] = lines.map((l) => ({ ...l, transferred: 999999 }))
    const checks: SettlementCheckRow[] = [
      {
        month: '2026-09-01',
        round: 1,
        user_id: UID_A,
        amount: 1000,
        checked_by: UID_A,
        checked_at: '2026-10-01T21:10:00+09:00',
      },
      {
        month: '2026-09-01',
        round: 2,
        user_id: UID_A,
        amount: 500,
        checked_by: UID_B,
        checked_at: '2026-10-02T09:10:00+09:00',
      },
      {
        month: '2026-09-01',
        round: 3,
        user_id: UID_B,
        amount: -2000,
        checked_by: UID_B,
        checked_at: '2026-10-03T12:30:00+09:00',
      },
    ]
    const rec = toSettlements([reopened], staleLines, checks, contributions, persons)['2026-09']
    expect(rec).toBeDefined()
    if (!rec) return
    // やり直した後は締め待ち・進行中として扱う（status は保存しない）
    expect(rec.status).toBeNull()
    expect(rec.reopenedFrom).toBe('settled')
    expect(rec.reopenedBy).toBe('a')
    expect(rec.reopenedAt).toBe('2026-10-03T20:05')
    // 済んだ分 = すべての回のチェックの合計（private.month_live と同じ式）
    expect(rec.transferred).toEqual({ a: 1500, b: -2000 })
    expect(rec.checks).toEqual({})
    expect(rec.done.a).toEqual([
      { amount: 1000, at: '2026-10-01T21:10', by: 'a', round: 1 },
      { amount: 500, at: '2026-10-02T09:10', by: 'b', round: 2 },
    ])
    expect(rec.done.b).toEqual([{ amount: -2000, at: '2026-10-03T12:30', by: 'b', round: 3 }])
    // やり直し中は確定した値を持たない（画面はいまの数字で出す）
    expect(rec.snapshot).toBeNull()
  })
})
