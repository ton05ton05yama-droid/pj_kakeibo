/**
 * 見本データ（正本: docs/03_ui_spec.md §9。ID もそろえる）
 *
 * Supabase を作る前のローカル実装と、ドメインのテストで使う。
 * モックの DATA・SCENARIOS（mock/index.html §1・§4）と同じ内容・同じ ID。
 */
import { confirmMonth, createExpense, deferRow, fillAmount, reopenMonth, toggleCheck } from './operations'
import type {
  CategoryKey,
  DateKey,
  DateTimeKey,
  Expense,
  FixedCostTemplate,
  Household,
  HouseholdData,
  MonthContributions,
  MonthKey,
  Payer,
  Person,
  PersonKey,
  RecordedBy,
} from './types'

/** 記録の種（[ID, 日付, 払った人, カテゴリ, 金額(null = 金額待ち), メモ・名前, 記録した人, 記録日時, 追加]） */
export interface ExpenseSeedExtra {
  tpl?: string
  /** 帰属月（来月に回した行） */
  month?: MonthKey
  /** 対象月「（◯月分）」 */
  labelMonth?: MonthKey
  amountBy?: PersonKey
  amountAt?: DateTimeKey
}

export type ExpenseSeed = [
  id: string,
  date: DateKey,
  payer: Payer,
  cat: CategoryKey,
  amount: number | null,
  memo: string,
  by: RecordedBy,
  at: DateTimeKey,
  extra?: ExpenseSeedExtra,
]

/** 種から記録を作る */
export function expenseFromSeed(t: ExpenseSeed): Expense {
  const [id, date, payer, cat, amount, memo, by, at, x = {}] = t
  return createExpense({
    id,
    date,
    payer,
    cat,
    amount,
    memo,
    by,
    at,
    month: x.month,
    labelMonth: x.labelMonth,
    tpl: x.tpl ?? null,
    amountBy: x.amountBy ?? null,
    amountAt: x.amountAt ?? null,
  })
}

export const SAMPLE_HOUSEHOLD: Household = {
  createdMonth: '2026-08',
  appName: 'ふたりの家計簿',
  emailDomain: 'kakeibo.invalid',
}

/** §9.1 人 */
export const SAMPLE_PEOPLE: Record<PersonKey, Person> = {
  a: {
    id: 'masato',
    name: 'まさと',
    color: 'a',
    ratePct: 40,
    defaultPayer: 'self',
    lastSeen: '2026-09-17T22:00',
  },
  b: {
    id: 'risako',
    name: 'りさこ',
    color: 'b',
    ratePct: 40,
    defaultPayer: 'self',
    lastSeen: '2026-09-21T21:00',
  },
}

/** §9.2 毎月の支払い（ひな形）。すべて 2026-08-01 にまさとが作った */
export const SAMPLE_TEMPLATES: FixedCostTemplate[] = [
  {
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
  },
  {
    id: 't2',
    name: '光回線',
    cat: 'telecom',
    payer: 'a',
    kind: 'fixed',
    amount: 5500,
    from: '2026-08',
    until: null,
    createdBy: 'a',
    createdAt: '2026-08-01T21:00',
  },
  {
    id: 't3',
    name: '動画配信',
    cat: 'entertainment',
    payer: 'b',
    kind: 'fixed',
    amount: 1590,
    from: '2026-08',
    until: null,
    createdBy: 'a',
    createdAt: '2026-08-01T21:00',
  },
  {
    id: 't4',
    name: '電気代',
    cat: 'utilities',
    payer: 'joint',
    kind: 'variable',
    amount: null,
    from: '2026-08',
    until: null,
    createdBy: 'a',
    createdAt: '2026-08-01T21:00',
  },
  {
    id: 't5',
    name: 'ガス代',
    cat: 'utilities',
    payer: 'a',
    kind: 'variable',
    amount: null,
    from: '2026-08',
    until: null,
    createdBy: 'a',
    createdAt: '2026-08-01T21:00',
  },
]

/** §9.3 出す額（月ごと。手取り・割合・出す額を保存） */
export const SAMPLE_CONTRIBUTIONS: Record<MonthKey, MonthContributions> = {
  '2026-08': {
    a: { net: 295000, ratePct: 40, amount: 118000, by: 'a', at: '2026-08-01' },
    b: { net: 230000, ratePct: 40, amount: 92000, by: 'b', at: '2026-08-02' },
  },
  '2026-09': {
    a: { net: 300000, ratePct: 40, amount: 120000, by: 'a', at: '2026-09-01' },
    b: { net: 220000, ratePct: 40, amount: 88000, by: 'b', at: '2026-09-03' },
  },
}

/** §9.4 2026年8月（精算済み）。電気代（8月分）は来月に回したので 9月の s04 */
export const SAMPLE_AUG: ExpenseSeed[] = [
  ['a01', '2026-08-01', 'joint', 'housing', 85000, '家賃', 'auto', '2026-08-01T00:00', { tpl: 't1' }],
  ['a02', '2026-08-01', 'a', 'telecom', 5500, '光回線', 'auto', '2026-08-01T00:00', { tpl: 't2' }],
  ['a03', '2026-08-01', 'b', 'entertainment', 1590, '動画配信', 'auto', '2026-08-01T00:00', { tpl: 't3' }],
  [
    'a04',
    '2026-08-01',
    'a',
    'utilities',
    4380,
    'ガス代',
    'auto',
    '2026-08-01T00:00',
    { tpl: 't5', amountBy: 'a', amountAt: '2026-08-24T00:00' },
  ],
  ['a05', '2026-08-02', 'joint', 'groceries', 6840, 'スーパー', 'a', '2026-08-02T18:40'],
  ['a06', '2026-08-03', 'a', 'dining', 4200, 'ランチ', 'a', '2026-08-03T13:05'],
  ['a07', '2026-08-05', 'b', 'household_goods', 1980, 'ドラッグストア', 'b', '2026-08-05T20:12'],
  ['a08', '2026-08-08', 'joint', 'groceries', 5120, 'スーパー', 'b', '2026-08-08T19:30'],
  ['a09', '2026-08-10', 'b', 'leisure', 82400, '旅行の宿', 'b', '2026-08-10T22:45'],
  ['a10', '2026-08-11', 'joint', 'transport', 3960, '高速代', 'a', '2026-08-11T21:10'],
  ['a11', '2026-08-11', 'a', 'dining', 5600, '旅行先の夕食', 'a', '2026-08-11T21:12'],
  ['a12', '2026-08-14', 'joint', 'groceries', 7310, 'スーパー', 'a', '2026-08-14T18:55'],
  ['a13', '2026-08-16', 'b', 'social', 5500, '実家への手土産', 'b', '2026-08-16T10:20'],
  ['a14', '2026-08-18', 'joint', 'household_goods', 2450, '洗剤・ティッシュ', 'b', '2026-08-18T19:02'],
  ['a15', '2026-08-20', 'a', 'groceries', 1280, 'コンビニ', 'a', '2026-08-20T22:31'],
  ['a16', '2026-08-22', 'joint', 'dining', 8900, '焼肉', 'b', '2026-08-22T21:40'],
  ['a17', '2026-08-24', 'joint', 'groceries', 6480, 'スーパー', 'a', '2026-08-24T18:20'],
  ['a18', '2026-08-25', 'a', 'housing', 3980, '収納ケース', 'a', '2026-08-25T20:05'],
  ['a19', '2026-08-27', 'b', 'groceries', 2160, 'パン屋', 'b', '2026-08-27T09:15'],
  ['a20', '2026-08-29', 'b', 'dining', 3300, 'カフェ', 'a', '2026-08-29T16:48'],
  ['a21', '2026-08-30', 'joint', 'groceries', 5760, 'スーパー', 'b', '2026-08-30T18:10'],
  ['a22', '2026-08-31', 'joint', 'medical', 2200, '病院（2人分）', 'a', '2026-08-31T12:30'],
]

/** §9.5 2026年9月 9/1〜9/22（sep-open で見える分） */
export const SAMPLE_SEP_OPEN: ExpenseSeed[] = [
  ['s01', '2026-09-01', 'joint', 'housing', 85000, '家賃', 'auto', '2026-09-01T00:00', { tpl: 't1' }],
  ['s02', '2026-09-01', 'a', 'telecom', 5500, '光回線', 'auto', '2026-09-01T00:00', { tpl: 't2' }],
  ['s03', '2026-09-01', 'b', 'entertainment', 1590, '動画配信', 'auto', '2026-09-01T00:00', { tpl: 't3' }],
  [
    's04',
    '2026-08-01',
    'joint',
    'utilities',
    9840,
    '電気代',
    'auto',
    '2026-08-01T00:00',
    { tpl: 't4', month: '2026-09', labelMonth: '2026-08', amountBy: 'b', amountAt: '2026-09-10T00:00' },
  ],
  ['s05', '2026-09-01', 'joint', 'utilities', null, '電気代', 'auto', '2026-09-01T00:00', { tpl: 't4' }],
  ['s06', '2026-09-01', 'a', 'utilities', null, 'ガス代', 'auto', '2026-09-01T00:00', { tpl: 't5' }],
  ['s07', '2026-09-02', 'joint', 'groceries', 6120, 'スーパー', 'a', '2026-09-02T19:10'],
  ['s08', '2026-09-03', 'a', 'dining', 3400, 'ランチ', 'a', '2026-09-03T12:50'],
  ['s09', '2026-09-05', 'joint', 'household_goods', 2980, '洗剤・ラップ', 'b', '2026-09-05T20:30'],
  ['s10', '2026-09-06', 'b', 'groceries', 1760, 'パン屋', 'b', '2026-09-06T09:40'],
  ['s11', '2026-09-07', 'a', 'leisure', 4400, '映画（2人分）', 'a', '2026-09-07T21:15'],
  ['s12', '2026-09-09', 'joint', 'groceries', 7040, 'スーパー', 'b', '2026-09-09T18:25'],
  ['s13', '2026-09-12', 'a', 'dining', 12600, '記念日ディナー', 'a', '2026-09-12T22:05'],
  ['s14', '2026-09-13', 'joint', 'transport', 2640, '駐車場', 'a', '2026-09-13T17:30'],
  ['s15', '2026-09-14', 'b', 'household_goods', 2380, 'ドラッグストア', 'b', '2026-09-14T20:44'],
  ['s16', '2026-09-16', 'joint', 'groceries', 6590, 'スーパー', 'a', '2026-09-16T18:35'],
  ['s17', '2026-09-18', 'b', 'social', 4320, '友人の出産祝い', 'b', '2026-09-18T21:02'],
  ['s18', '2026-09-19', 'joint', 'housing', 7980, 'カーテン', 'b', '2026-09-19T15:20'],
  ['s19', '2026-09-20', 'joint', 'dining', 4850, 'ランチ', 'b', '2026-09-20T13:40'],
  ['s20', '2026-09-21', 'a', 'household_goods', 1980, '電球', 'a', '2026-09-21T11:05'],
  ['s21', '2026-09-21', 'b', 'groceries', 8420, 'コストコ', 'a', '2026-09-21T21:30'],
  ['s22', '2026-09-22', 'a', 'groceries', 1280, 'コンビニ', 'a', '2026-09-22T12:03'],
]

/** §9.5 9/23〜9/30（sep-prep 以降で見える分） */
export const SAMPLE_SEP_LATE: ExpenseSeed[] = [
  ['s23', '2026-09-23', 'joint', 'groceries', 5870, 'スーパー', 'a', '2026-09-23T18:15'],
  ['s24', '2026-09-26', 'b', 'dining', 3600, 'カフェ', 'b', '2026-09-26T15:30'],
  ['s25', '2026-09-27', 'joint', 'leisure', 6000, '美術館（2人分）', 'b', '2026-09-27T17:05'],
  ['s26', '2026-09-29', 'a', 'groceries', 2150, '八百屋', 'a', '2026-09-29T19:20'],
  ['s27', '2026-09-30', 'joint', 'household_goods', 1640, 'ゴミ袋', 'a', '2026-09-30T21:00'],
]

/** §9.5 sep-redo でまさとが足す記録 */
export const SAMPLE_S28: ExpenseSeed = [
  's28',
  '2026-09-28',
  'a',
  'household_goods',
  3300,
  'ハンガー',
  'a',
  '2026-10-03T20:10',
]

/** §9.5 10月（10/1 に自動で作られる行） */
export const SAMPLE_OCT: ExpenseSeed[] = [
  ['o01', '2026-10-01', 'joint', 'housing', 85000, '家賃', 'auto', '2026-10-01T00:00', { tpl: 't1' }],
  ['o02', '2026-10-01', 'a', 'telecom', 5500, '光回線', 'auto', '2026-10-01T00:00', { tpl: 't2' }],
  ['o03', '2026-10-01', 'b', 'entertainment', 1590, '動画配信', 'auto', '2026-10-01T00:00', { tpl: 't3' }],
  ['o04', '2026-10-01', 'joint', 'utilities', null, '電気代', 'auto', '2026-10-01T00:00', { tpl: 't4' }],
  ['o05', '2026-10-01', 'a', 'utilities', null, 'ガス代', 'auto', '2026-10-01T00:00', { tpl: 't5' }],
]

/** §9.7 8月の精算（9月分はシナリオで順に反映する） */
export const SAMPLE_AUG_SETTLE = {
  confirm: { by: 'a' as PersonKey, at: '2026-09-01T20:10' },
  checks: [
    { p: 'a' as PersonKey, by: 'a' as PersonKey, at: '2026-09-01T20:30' },
    { p: 'b' as PersonKey, by: 'b' as PersonKey, at: '2026-09-02T08:15' },
  ],
}

/** シナリオ（§9.5・§10.2） */
export type ScenarioId =
  | 'sep-open'
  | 'sep-prep'
  | 'sep-ready'
  | 'sep-transfer'
  | 'sep-transfer-half'
  | 'sep-settled'
  | 'sep-redo'

export interface Scenario {
  id: ScenarioId
  label: string
  /** そのシナリオの「今日」 */
  now: DateTimeKey
  /** 前のシナリオからの操作 */
  apply: ((d: HouseholdData) => void) | null
}

export const SCENARIOS: Scenario[] = [
  { id: 'sep-open', label: 'sep-open（9/22）', now: '2026-09-22T12:30', apply: null },
  {
    id: 'sep-prep',
    label: 'sep-prep（10/1、金額待ち2件）',
    now: '2026-10-01T20:00',
    apply: (d) => {
      d.expenses.push(...SAMPLE_SEP_LATE.map(expenseFromSeed), ...SAMPLE_OCT.map(expenseFromSeed))
    },
  },
  {
    id: 'sep-ready',
    label: 'sep-ready（10/1、ガス代入力・電気代は10月へ）',
    now: '2026-10-01T20:50',
    apply: (d) => {
      fillAmount(d, 's06', 6200, 'a', '2026-10-01T20:40')
      deferRow(d, 's05')
    },
  },
  {
    id: 'sep-transfer',
    label: 'sep-transfer（10/1、精算中）',
    now: '2026-10-01T21:00',
    apply: (d) => {
      confirmMonth(d, '2026-09', 'a', '2026-10-01T21:00')
    },
  },
  {
    id: 'sep-transfer-half',
    label: 'sep-transfer-half（10/2、まさとだけ入れた）',
    now: '2026-10-02T09:10',
    apply: (d) => {
      toggleCheck(d, '2026-09', 'a', 'a', '2026-10-02T09:10')
    },
  },
  {
    id: 'sep-settled',
    label: 'sep-settled（10/2）',
    now: '2026-10-02T12:30',
    apply: (d) => {
      toggleCheck(d, '2026-09', 'b', 'b', '2026-10-02T12:30')
    },
  },
  {
    id: 'sep-redo',
    label: 'sep-redo（10/3、ハンガー 3,300 を足した）',
    now: '2026-10-03T20:10',
    apply: (d) => {
      reopenMonth(d, '2026-09', 'a', '2026-10-03T20:05')
      d.expenses.push(expenseFromSeed(SAMPLE_S28))
    },
  },
]

/** 見本データの初期状態（8月の精算まで反映する前の形） */
function baseData(): HouseholdData {
  return {
    household: { ...SAMPLE_HOUSEHOLD },
    people: structuredClone(SAMPLE_PEOPLE),
    templates: structuredClone(SAMPLE_TEMPLATES),
    contributions: structuredClone(SAMPLE_CONTRIBUTIONS),
    expenses: [...SAMPLE_AUG.map(expenseFromSeed), ...SAMPLE_SEP_OPEN.map(expenseFromSeed)],
    settlements: {},
  }
}

/**
 * シナリオ sc の時点の家計のデータを作る（毎回新しいオブジェクトを返す）。
 * 8月の精算（§9.7）を先に反映し、そのあとシナリオの操作を順に当てる。
 */
export function buildScenario(sc: ScenarioId = 'sep-open'): { data: HouseholdData; now: DateTimeKey } {
  const d = baseData()
  confirmMonth(d, '2026-08', SAMPLE_AUG_SETTLE.confirm.by, SAMPLE_AUG_SETTLE.confirm.at)
  for (const c of SAMPLE_AUG_SETTLE.checks) toggleCheck(d, '2026-08', c.p, c.by, c.at)
  for (const s of SCENARIOS) {
    if (s.apply) {
      s.apply(d)
      // sep-open 以外では、新着の判定をその時点までに見たことにする（§9.8 の新着の期待値は sep-open だけ）
      d.people.a.lastSeen = s.now
      d.people.b.lastSeen = s.now
    }
    if (s.id === sc) break
  }
  const found = SCENARIOS.find((s) => s.id === sc)
  if (!found) throw new Error(`シナリオが見つかりません: ${sc}`)
  return { data: d, now: found.now }
}

/**
 * 見本データ一式（モックの `DATA` と同じまとまり）。
 * ローカル実装が「初期データ」として読むときは、これか buildScenario() を使う。
 */
export const sampleData = {
  household: SAMPLE_HOUSEHOLD,
  people: SAMPLE_PEOPLE,
  templates: SAMPLE_TEMPLATES,
  contributions: SAMPLE_CONTRIBUTIONS,
  aug: SAMPLE_AUG,
  sepOpen: SAMPLE_SEP_OPEN,
  sepLate: SAMPLE_SEP_LATE,
  s28: SAMPLE_S28,
  oct: SAMPLE_OCT,
  augSettle: SAMPLE_AUG_SETTLE,
} as const
