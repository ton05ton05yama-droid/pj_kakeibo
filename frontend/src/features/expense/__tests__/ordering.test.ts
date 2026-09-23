/** 支出タブの並び（§4 S-10 の要素7・8・9） */
import { describe, expect, it } from 'vitest'
import { buildScenario, summarize } from '@/domain'
import { groupByDate, pendingShownFor, sortByNewest, sortFixedRows } from '../ordering'

describe('金額待ちの行に出す行（S-10 要素7）', () => {
  it('見ている月の金額待ちを、対象月の古い順・ひな形の順に出す', () => {
    const { data, now } = buildScenario('sep-open')
    const rows = pendingShownFor(data, '2026-09', now)
    expect(rows.map((e) => e.id)).toEqual(['s05', 's06'])
  })

  it('今月を見ていて前の月が締め待ちなら、前の月の金額待ちを出す（今月の分は出さない）', () => {
    // sep-prep は 10/1。9月は締め待ちで金額待ちが2件残っている
    const { data, now } = buildScenario('sep-prep')
    const rows = pendingShownFor(data, '2026-10', now)
    expect(rows.map((e) => e.id)).toEqual(['s05', 's06'])
    // 10月自身にも金額待ち（o04・o05）はあるが、前の月が片付くまで出さない
    expect(summarize(data.expenses, '2026-10').pending.map((e) => e.id)).toEqual(['o04', 'o05'])
  })

  it('前の月の金額待ちが片付いたら、今月の分が出る', () => {
    const { data, now } = buildScenario('sep-ready')
    expect(pendingShownFor(data, '2026-10', now).map((e) => e.id)).toEqual(['s05', 'o04', 'o05'])
  })
})

describe('一覧の並び（S-10 要素8）', () => {
  it('新しい日が上。同じ日の中は記録した時刻が新しい順', () => {
    const { data } = buildScenario('sep-open')
    const rows = sortByNewest(summarize(data.expenses, '2026-09').manual)
    expect(rows.slice(0, 4).map((e) => e.id)).toEqual(['s22', 's21', 's20', 's19'])
    const groups = groupByDate(rows)
    expect(groups[0]?.date).toBe('2026-09-22')
    expect(groups[1]?.rows.map((e) => e.id)).toEqual(['s21', 's20'])
  })
})

describe('毎月の支払いのまとまりの並び（S-10 要素9）', () => {
  it('その月の分（ひな形の順）→ 前の月から回した分', () => {
    const { data } = buildScenario('sep-open')
    const rows = sortFixedRows(data, '2026-09', summarize(data.expenses, '2026-09').fixedRows)
    // s01 家賃・s02 光回線・s03 動画配信（ひな形の順）→ s04 電気代（8月分。8月から回した分）
    expect(rows.map((e) => e.id)).toEqual(['s01', 's02', 's03', 's04'])
  })
})
