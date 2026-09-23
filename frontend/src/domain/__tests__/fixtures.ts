/**
 * テストの期待値と、§6.3 の合成ケースのデータ。
 * 正本: docs/03_ui_spec.md §6.3・§9.6・§9.8、docs/02_settlement.md §9。
 * モックの EXPECT・CASES・buildCaseData（mock/index.html §4・§5）と同じ値にする。
 */
import { contributionOf } from '../calc'
import { createExpense, createMonthSettlement } from '../operations'
import { buildScenario } from '../sampleData'
import type { CategoryKey, DateTimeKey, HouseholdData, MonthKey, PersonAmounts, PersonKey, S20State } from '../types'

/** undefined を許さずに取り出す（テストの読みやすさのため） */
export function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`${what} がありません`)
  return v
}

/** §9.6 のシナリオ別の結果 */
export const EXPECT = {
  aug: {
    adv: { a: 24940, b: 96930 },
    joint: 134020,
    total: 255890,
    contrib: { a: 118000, b: 92000 },
    settle: { a: 93060, b: -4930 },
    jointNet: -45890,
    fixedSum: 96470,
    fixedCount: 4,
    advCount: { a: 6, b: 6 },
  },
  sepOpen: {
    adv: { a: 29160, b: 18470 },
    joint: 133040,
    total: 180670,
    contrib: { a: 120000, b: 88000 },
    settle: { a: 90840, b: 69530 },
    jointNet: 27330,
    count: 20,
    fixedSum: 101930,
    fixedCount: 4,
    advCount: { a: 6, b: 5 },
    byCat: [
      ['housing', 92980],
      ['groceries', 31210],
      ['dining', 20850],
      ['utilities', 9840],
      ['household_goods', 7340],
      ['telecom', 5500],
      ['leisure', 4400],
      ['social', 4320],
      ['transport', 2640],
      ['entertainment', 1590],
    ] as [CategoryKey, number][],
  },
  sepPrep: {
    adv: { a: 31310, b: 22070 },
    joint: 146550,
    total: 199930,
    settle: { a: 88690, b: 65930 },
    jointNet: 8070,
    count: 25,
  },
  sepFinal: {
    adv: { a: 37510, b: 22070 },
    joint: 146550,
    total: 206130,
    settle: { a: 82490, b: 65930 },
    jointNet: 1870,
    fixedSum: 108130,
    fixedCount: 5,
    advCount: { a: 8, b: 6 },
    byCat: [
      ['housing', 92980],
      ['groceries', 39230],
      ['dining', 24450],
      ['utilities', 16040],
      ['leisure', 10400],
      ['household_goods', 8980],
      ['telecom', 5500],
      ['social', 4320],
      ['transport', 2640],
      ['entertainment', 1590],
    ] as [CategoryKey, number][],
  },
  sepRedo: {
    adv: { a: 40810, b: 22070 },
    joint: 146550,
    total: 209430,
    settle: { a: 79190, b: 65930 },
    jointNet: -1430,
    remaining: { a: -3300, b: 0 },
    advCount: { a: 9, b: 6 },
  },
  /** V7 の合成データ（sep-open ＋ 家賃を今月はなし ＋ 未送信 999円） */
  syn7: { total: 95670, count: 19, fixedSum: 16930 },
  /** §6.3 の合成ケース */
  cases: {
    B: { settle: { a: 90000, b: -12000 }, jointNet: 28000 },
    C: { settle: { a: 90000, b: 0 }, jointNet: 28000 },
    C0: { settle: { a: 0, b: 0 }, jointNet: 10000 },
    D: { settle: { a: 90000, b: 65000 }, jointNet: -22000 },
    E: { settle: { a: -10000, b: -7000 }, jointNet: -32000 },
    L: { contribA: 113382 },
  },
} as const

/** §9.8 シナリオごとの期待値（S-20 の状態・赤い点・新着・10月） */
export interface ScenarioExpect {
  s20: S20State
  /** ［この月を精算する］を押したときの状態 */
  s20now?: S20State
  /** 既定の月 */
  s20m?: MonthKey
  newA?: number
  newB?: number
  attA: string | null
  attB: string | null
  octTotal?: number
  octPending?: number
}

export const SCENARIO_EXPECT: Record<string, ScenarioExpect> = {
  'sep-open': { s20: 'estimate', s20now: 'prep', newA: 3, newB: 2, attA: null, attB: null },
  'sep-prep': { s20: 'prep', attA: '1:2026-09', attB: '1:2026-09', octTotal: 92090, octPending: 2 },
  'sep-ready': { s20: 'ready', attA: '1:2026-09', attB: '1:2026-09', octTotal: 92090, octPending: 3 },
  'sep-transfer': { s20: 'transfer', attA: '2:2026-09:82490', attB: '2:2026-09:65930' },
  'sep-transfer-half': { s20: 'transfer', attA: null, attB: '2:2026-09:65930' },
  'sep-settled': { s20: 'undecided', s20m: '2026-10', attA: null, attB: null },
  'sep-redo': { s20: 'redo', attA: '1:2026-09', attB: '1:2026-09' },
}

/** §6.3 の合成ケース（B・C・D・E・L・I-2・I-3 は合成の数字） */
export interface SettleCase {
  id: string
  label: string
  net: PersonAmounts
  adv: PersonAmounts
  joint: number
  transferred?: PersonAmounts
}

export const CASES: SettleCase[] = [
  {
    id: 'B',
    label: 'B: 片方が共用から受け取る',
    net: { a: 300000, b: 220000 },
    adv: { a: 30000, b: 100000 },
    joint: 50000,
  },
  {
    id: 'C',
    label: 'C: 0円の人がいる',
    net: { a: 300000, b: 220000 },
    adv: { a: 30000, b: 88000 },
    joint: 62000,
  },
  {
    id: 'C0',
    label: 'C: 2人とも 0円',
    net: { a: 300000, b: 220000 },
    adv: { a: 120000, b: 88000 },
    joint: 10000,
  },
  {
    id: 'D',
    label: 'D: 共用が足りない',
    net: { a: 300000, b: 220000 },
    adv: { a: 30000, b: 23000 },
    joint: 177000,
  },
  {
    id: 'E',
    label: 'E: 2人とも受け取る',
    net: { a: 300000, b: 220000 },
    adv: { a: 130000, b: 95000 },
    joint: 15000,
  },
  {
    id: 'I2',
    label: 'I-2: やり直し・同じ向き',
    net: { a: 300000, b: 220000 },
    adv: { a: 36230, b: 22070 },
    joint: 146550,
    transferred: { a: 82490, b: 65930 },
  },
  {
    id: 'I3',
    label: 'I-3: 入れたのに受け取る側に',
    net: { a: 300000, b: 220000 },
    adv: { a: 121000, b: 22070 },
    joint: 146550,
    transferred: { a: 2000, b: 65930 },
  },
  {
    id: 'L',
    label: 'L: 手取り×割合の端数',
    net: { a: 283457, b: 220000 },
    adv: { a: 37510, b: 22070 },
    joint: 146550,
  },
]

export const findCase = (id: string): SettleCase => {
  const c = CASES.find((x) => x.id === id)
  if (!c) throw new Error(`ケースが見つかりません: ${id}`)
  return c
}

/**
 * 合成ケースのデータ（9月を「締め待ち・金額待ちなし」にして、人ごとの立替を1行ずつにまとめる）。
 * モックの buildCaseData と同じ組み立て。
 */
export function buildCaseData(c: SettleCase): { data: HouseholdData; now: DateTimeKey } {
  const base = buildScenario('sep-open').data
  const augSettlement = must(base.settlements['2026-08'], '8月の精算')
  const augContribution = must(base.contributions['2026-08'], '8月の出す額')
  const mk = (p: PersonKey) => ({
    net: c.net[p],
    ratePct: 40,
    amount: contributionOf(c.net[p], 40),
    by: p,
    at: '2026-09-01',
  })
  const memo = `ケース${c.id.replace('I2', 'I-2').replace('I3', 'I-3')}（合成）`
  const d: HouseholdData = {
    household: base.household,
    people: base.people,
    templates: base.templates,
    settlements: { '2026-08': augSettlement },
    contributions: { '2026-08': augContribution, '2026-09': { a: mk('a'), b: mk('b') } },
    expenses: base.expenses.filter((e) => e.month === '2026-08'),
  }
  d.expenses.push(
    createExpense({
      id: 'c01',
      date: '2026-09-10',
      payer: 'a',
      cat: 'other',
      amount: c.adv.a,
      memo,
      by: 'a',
      at: '2026-09-10T12:00',
    }),
    createExpense({
      id: 'c02',
      date: '2026-09-11',
      payer: 'b',
      cat: 'other',
      amount: c.adv.b,
      memo,
      by: 'b',
      at: '2026-09-11T12:00',
    }),
    createExpense({
      id: 'c03',
      date: '2026-09-12',
      payer: 'joint',
      cat: 'other',
      amount: c.joint,
      memo,
      by: 'a',
      at: '2026-09-12T12:00',
    })
  )
  if (c.transferred) {
    const rec = createMonthSettlement()
    rec.round = 1
    rec.transferred = { ...c.transferred }
    rec.done = {
      a: [{ amount: c.transferred.a, at: '2026-10-02T09:10', by: 'a' }],
      b: [{ amount: c.transferred.b, at: '2026-10-02T12:30', by: 'b' }],
    }
    d.settlements['2026-09'] = rec
  }
  return { data: d, now: '2026-10-01T20:50' }
}

/** 赤い点・お知らせ行を文字列にして比べる（モックの attKey と同じ） */
export function attentionKey(a: { kind: number; m: string; amount?: number } | null): string | null {
  if (!a) return null
  return [a.kind, a.m].concat(a.amount != null ? [String(a.amount)] : []).join(':')
}
