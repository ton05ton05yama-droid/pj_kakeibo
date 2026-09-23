/**
 * 金額待ち・来月に回す・今月はなし・出す額・やり直しの操作。
 * 正本: docs/02_settlement.md §5・§6・§7、docs/03_ui_spec.md §6.2・§6.5・S-15・S-21。
 */
import { describe, expect, it } from 'vitest'
import {
  canDefer,
  contributionOf,
  contributionsOf,
  isPending,
  monthStatus,
  remainingOf,
  s20State,
  settleModel,
  settlementOf,
  summarize,
} from '../calc'
import {
  confirmMonth,
  createExpense,
  createMonthSettlement,
  decideContributions,
  deferRow,
  ensureMonth,
  fillAmount,
  findExpense,
  nextSeq,
  pendingQueue,
  reopenMonth,
  saveContributions,
  setCheck,
  skipRow,
  sortPending,
  toggleCheck,
  undeferRow,
  unskipRow,
} from '../operations'
import { buildScenario } from '../sampleData'
import { must } from './fixtures'

describe('端数（§6・§6.2）', () => {
  it.each([
    [295000, 40, 118000],
    [230000, 40, 92000],
    [283457, 40, 113382],
    [0, 40, 0],
    [9999999, 100, 9999999],
    [123456, 33, 40740],
    [1, 50, 0],
  ])('floor(%i × %i ÷ 100) ＝ %i', (net, rate, amount) => {
    expect(contributionOf(net, rate)).toBe(amount)
  })

  it('端数が出るのは出す額だけ（ほかは整数の足し引き）', () => {
    const b = buildScenario('sep-ready')
    const md = settleModel(b.data, '2026-09', b.now)
    for (const n of [md.total, md.joint, md.adv.a, md.adv.b, md.settle?.a ?? 0, md.jointNet ?? 0]) {
      expect(Number.isInteger(n)).toBe(true)
    }
  })
})

describe('金額待ち（§5.2）', () => {
  it('金額を入れると、その月の計算に入る', () => {
    const b = buildScenario('sep-prep')
    const before = summarize(b.data.expenses, '2026-09')
    fillAmount(b.data, 's06', 6200, 'a', '2026-10-01T20:40')
    const after = summarize(b.data.expenses, '2026-09')
    expect(after.total - before.total).toBe(6200)
    expect(after.adv.a - before.adv.a).toBe(6200)
    expect(after.pending).toHaveLength(1)
    expect(findExpense(b.data, 's06')?.amountBy).toBe('a')
  })

  it('金額待ちは合計に入らない', () => {
    const b = buildScenario('sep-open')
    const s = summarize(b.data.expenses, '2026-09')
    expect(s.pending.map((e) => e.id)).toEqual(['s05', 's06'])
    expect(s.rows.filter((e) => isPending(e))).toHaveLength(2)
    expect(s.count).toBe(20)
  })

  it('片付けの順は 個人の行 → 共用の行（S-20 prep）', () => {
    const b = buildScenario('sep-prep')
    expect(pendingQueue(b.data, '2026-09').map((e) => e.id)).toEqual(['s06', 's05'])
  })
})

describe('金額待ちの並び（S-10 要素7）', () => {
  it('同じ対象月ならひな形の順（電気代 → ガス代。払う人は見ない）', () => {
    const b = buildScenario('sep-prep')
    const rows = summarize(b.data.expenses, '2026-09').pending
    expect(sortPending(b.data, rows).map((e) => e.memo)).toEqual(['電気代', 'ガス代'])
    // 逆に並べて渡しても同じ順になる
    expect(sortPending(b.data, [...rows].reverse()).map((e) => e.id)).toEqual(['s05', 's06'])
  })

  it('対象月が古いほうが先（回ってきた9月分 → その月の10月分）', () => {
    const b = buildScenario('sep-ready')
    const rows = summarize(b.data.expenses, '2026-10').pending
    expect(sortPending(b.data, rows).map((e) => e.id)).toEqual(['s05', 'o04', 'o05'])
    expect(sortPending(b.data, rows).map((e) => e.labelMonth)).toEqual(['2026-09', '2026-10', '2026-10'])
  })

  it('渡した配列は変えない（新しい配列を返す）', () => {
    const b = buildScenario('sep-ready')
    const rows = summarize(b.data.expenses, '2026-10').pending
    const before = rows.map((e) => e.id)
    const sorted = sortPending(b.data, rows)
    expect(rows.map((e) => e.id)).toEqual(before)
    expect(sorted).not.toBe(rows)
  })
})

describe('来月に回す（§5.3）', () => {
  it('帰属月だけが1か月進み、対象月と日付は変わらない', () => {
    const b = buildScenario('sep-prep')
    deferRow(b.data, 's05')
    const e = findExpense(b.data, 's05')
    expect(e?.month).toBe('2026-10')
    expect(e?.labelMonth).toBe('2026-09')
    expect(e?.date).toBe('2026-09-01')
    expect(summarize(b.data.expenses, '2026-09').pending.map((x) => x.id)).toEqual(['s06'])
    expect(
      summarize(b.data.expenses, '2026-10')
        .pending.map((x) => x.id)
        .sort()
    ).toEqual(['o04', 'o05', 's05'])
  })

  it('元の月には「◯月に回しました」の行として残る', () => {
    const b = buildScenario('sep-ready')
    expect(summarize(b.data.expenses, '2026-09').deferredOut.map((e) => e.id)).toEqual(['s05'])
  })

  it('元に戻すと帰属月が1か月戻り、対象月より前には戻らない', () => {
    const b = buildScenario('sep-ready')
    undeferRow(b.data, 's05')
    expect(findExpense(b.data, 's05')?.month).toBe('2026-09')
    undeferRow(b.data, 's05')
    expect(findExpense(b.data, 's05')?.month).toBe('2026-09')
  })

  it('回せるのは金額待ちの行で、翌月がロックされていないときだけ', () => {
    const b = buildScenario('sep-prep')
    const pending = findExpense(b.data, 's05')
    const filled = findExpense(b.data, 's01')
    expect(pending && canDefer(b.data, pending, b.now)).toBe(true)
    expect(filled && canDefer(b.data, filled, b.now)).toBe(false)
    // 翌月（10月）を精算中にすると回せなくなる
    saveContributions(b.data, '2026-10', decideContributions(b.data, '2026-10', { a: 300000, b: 220000 }, 'a', b.now))
    for (const e of pendingQueue(b.data, '2026-10')) fillAmount(b.data, e.id, 1000, 'a', b.now)
    confirmMonth(b.data, '2026-10', 'a', b.now)
    const still = findExpense(b.data, 's05')
    expect(still && canDefer(b.data, still, b.now)).toBe(false)
  })
})

describe('今月はなし（§5.4）', () => {
  it('計算に入らず、元に戻すと入る', () => {
    const b = buildScenario('sep-open')
    const before = summarize(b.data.expenses, '2026-09').total
    skipRow(b.data, 's01')
    const skipped = summarize(b.data.expenses, '2026-09')
    expect(skipped.total).toBe(before - 85000)
    expect(skipped.rows.some((e) => e.id === 's01')).toBe(true)
    unskipRow(b.data, 's01')
    expect(summarize(b.data.expenses, '2026-09').total).toBe(before)
  })

  it('金額待ちを今月はなしにすると、片付いたものとして扱う', () => {
    const b = buildScenario('sep-prep')
    skipRow(b.data, 's05')
    skipRow(b.data, 's06')
    const md = settleModel(b.data, '2026-09', b.now)
    expect(md.pending).toHaveLength(0)
    expect(s20State(b.data, md)).toBe('ready')
  })
})

describe('出す額（S-21・§6.2）', () => {
  it('決めた月の割合を使い、人の設定を変えても決めた月は変わらない', () => {
    const b = buildScenario('sep-open')
    b.data.people.a.ratePct = 50
    const again = decideContributions(b.data, '2026-09', { a: 300000 }, 'a', '2026-09-25T10:00')
    expect(again.a?.ratePct).toBe(40)
    expect(again.a?.amount).toBe(120000)
    // まだ決めていない月は人の設定の割合で決まる
    const next = decideContributions(b.data, '2026-10', { a: 300000 }, 'a', '2026-10-01T10:00')
    expect(next.a?.ratePct).toBe(50)
    expect(next.a?.amount).toBe(150000)
  })

  it('決めた人の分だけ保存する', () => {
    const b = buildScenario('sep-open')
    saveContributions(b.data, '2026-10', decideContributions(b.data, '2026-10', { b: 220000 }, 'b', '2026-10-01T10:00'))
    expect(contributionsOf(b.data, '2026-10').a).toBeUndefined()
    expect(contributionsOf(b.data, '2026-10').b?.amount).toBe(88000)
    const md = settleModel(b.data, '2026-10', '2026-10-01T10:00')
    expect(md.decided).toBe(false)
    expect(s20State(b.data, md)).toBe('undecided')
  })
})

describe('やり直し（§7）', () => {
  it('チェックは済んだ分として残り、月は日付どおりの状態に戻る', () => {
    const b = buildScenario('sep-settled')
    reopenMonth(b.data, '2026-09', 'a', '2026-10-03T20:05')
    const rec = must(settlementOf(b.data, '2026-09'), '9月の精算')
    expect(rec.status).toBeNull()
    expect(rec.reopenedFrom).toBe('settled')
    expect(rec.transferred).toEqual({ a: 82490, b: 65930 })
    expect(rec.done.a).toHaveLength(1)
    expect(rec.checks).toEqual({})
    expect(monthStatus(b.data, '2026-09', '2026-10-03T20:05')).toBe('closing')
  })

  it('月の途中でやり直すと進行中に戻る（§4.0.2）', () => {
    const b = buildScenario('sep-open')
    for (const e of pendingQueue(b.data, '2026-09')) fillAmount(b.data, e.id, 6200, 'a', b.now)
    confirmMonth(b.data, '2026-09', 'a', b.now)
    reopenMonth(b.data, '2026-09', 'a', b.now)
    expect(monthStatus(b.data, '2026-09', b.now)).toBe('open')
    // チェックが付く前にやり直したので、チェックの記録は残らない → 見込みに戻る（S-20 estimate）
    const md = settleModel(b.data, '2026-09', b.now)
    expect(md.hasDone).toBe(false)
    expect(s20State(b.data, md)).toBe('estimate')
    expect(s20State(b.data, md, '2026-09')).toBe('ready')
  })

  it('チェックが付いたあとにやり直すと、月の途中でも redo になる（S-20）', () => {
    const b = buildScenario('sep-open')
    for (const e of pendingQueue(b.data, '2026-09')) fillAmount(b.data, e.id, 6200, 'a', b.now)
    confirmMonth(b.data, '2026-09', 'a', b.now)
    const checked = must(settlementOf(b.data, '2026-09'), '9月の精算').checks
    expect(checked).toEqual({})
    setCheck(b.data, '2026-09', 'a', true, 'a', b.now)
    reopenMonth(b.data, '2026-09', 'a', b.now)
    const md = settleModel(b.data, '2026-09', b.now)
    expect(monthStatus(b.data, '2026-09', b.now)).toBe('open')
    expect(md.hasDone).toBe(true)
    expect(md.transferred.a).not.toBe(0)
    expect(s20State(b.data, md)).toBe('redo')
  })

  it('やり直したあとの残りは、チェックの向きが逆でも正しく出る', () => {
    const b = buildScenario('sep-redo')
    const md = settleModel(b.data, '2026-09', b.now)
    expect(remainingOf(md.settle ?? { a: 0, b: 0 }, md.transferred)).toEqual({ a: -3300, b: 0 })
  })

  it('もう一度精算すると、残りが 0 でない人のチェックだけで精算済みになる', () => {
    const b = buildScenario('sep-redo')
    expect(confirmMonth(b.data, '2026-09', 'a', '2026-10-03T21:00')).toBe('confirmed')
    expect(must(settlementOf(b.data, '2026-09'), '9月の精算').round).toBe(2)
    const md = settleModel(b.data, '2026-09', '2026-10-03T21:00')
    expect(md.remaining).toEqual({ a: -3300, b: 0 })
    const r = setCheck(b.data, '2026-09', 'a', true, 'a', '2026-10-03T21:05')
    expect(r.settledNow).toBe(true)
    expect(monthStatus(b.data, '2026-09', '2026-10-03T21:05')).toBe('settled')
  })

  it('チェックを外すと精算中に戻る', () => {
    const b = buildScenario('sep-settled')
    toggleCheck(b.data, '2026-09', 'b', 'b', '2026-10-02T13:00')
    expect(monthStatus(b.data, '2026-09', '2026-10-02T13:00')).toBe('confirmed')
    expect(must(settlementOf(b.data, '2026-09'), '9月の精算').settledAt).toBeNull()
  })
})

describe('毎月の支払いの行を作る（§6.5）', () => {
  it('ひな形 × 対象月で1行だけ作る（2回呼んでも増えない）', () => {
    const b = buildScenario('sep-ready')
    const now = '2026-11-01T09:00'
    const made = ensureMonth(b.data, '2026-11', now)
    expect(made.map((e) => e.memo)).toEqual(['家賃', '光回線', '動画配信', '電気代', 'ガス代'])
    expect(ensureMonth(b.data, '2026-11', now)).toHaveLength(0)
    const s = summarize(b.data.expenses, '2026-11')
    expect(s.total).toBe(85000 + 5500 + 1590)
    expect(s.pending).toHaveLength(2)
  })

  it('ロック中の月には作らない', () => {
    const b = buildScenario('sep-transfer')
    expect(ensureMonth(b.data, '2026-09', b.now)).toHaveLength(0)
  })

  it('通し番号は呼ぶたびに増え、作った行に振られる（並びを保つため）', () => {
    const first = nextSeq()
    expect(nextSeq()).toBe(first + 1)
    const e1 = createExpense({
      id: 'q01',
      date: '2026-09-20',
      payer: 'a',
      cat: 'other',
      amount: 100,
      memo: 'あと',
      by: 'a',
      at: '2026-09-20T12:00',
    })
    const e2 = createExpense({
      id: 'q02',
      date: '2026-09-20',
      payer: 'a',
      cat: 'other',
      amount: 100,
      memo: 'さき',
      by: 'a',
      at: '2026-09-20T12:00',
    })
    expect(e2.seq).toBe(e1.seq + 1)
  })

  it('精算の行の初期値（一度も精算していない月の形）', () => {
    const rec = createMonthSettlement()
    expect(rec).toEqual({
      status: null,
      round: 0,
      snapshot: null,
      undoSnapshot: null,
      confirmedBy: null,
      confirmedAt: null,
      settledAt: null,
      reopenedBy: null,
      reopenedAt: null,
      reopenedFrom: null,
      transferred: { a: 0, b: 0 },
      done: { a: [], b: [] },
      checks: {},
    })
    // 呼ぶたびに別のオブジェクト（月どうしで中身を共有しない）
    const other = createMonthSettlement()
    other.transferred.a = 100
    other.done.a.push({ amount: 100, at: '2026-10-02T09:10', by: 'a', round: 1 })
    expect(rec.transferred.a).toBe(0)
    expect(rec.done.a).toHaveLength(0)
  })
})
