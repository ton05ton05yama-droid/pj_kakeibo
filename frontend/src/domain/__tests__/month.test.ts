/** 月と日付のユーティリティ（§4.0.2・§3.4） */
import { describe, expect, it } from 'vitest'
import {
  addMonth,
  compareMonths,
  dateOf,
  daysInMonth,
  firstDayOf,
  isMonthEnded,
  lastDayOf,
  monthNumber,
  monthOf,
  monthsBetween,
  yearNumber,
} from '../month'

it('日時から月・日を取る', () => {
  expect(monthOf('2026-09-22T12:30')).toBe('2026-09')
  expect(monthOf('2026-09-22')).toBe('2026-09')
  expect(dateOf('2026-09-22T12:30')).toBe('2026-09-22')
})

describe('月を進める・戻す', () => {
  it.each([
    ['2026-09', 1, '2026-10'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-09', 0, '2026-09'],
    ['2026-09', 12, '2027-09'],
    ['2026-09', -12, '2025-09'],
    ['2026-01', -13, '2024-12'],
  ])('%s の %i か月後は %s', (m, k, want) => {
    expect(addMonth(m, k)).toBe(want)
  })
})

it('月の前後を比べる', () => {
  expect(compareMonths('2026-08', '2026-09')).toBeLessThan(0)
  expect(compareMonths('2026-09', '2026-09')).toBe(0)
  expect(compareMonths('2026-10', '2026-09')).toBeGreaterThan(0)
})

it('月の1日・末日・日数', () => {
  expect(firstDayOf('2026-09')).toBe('2026-09-01')
  expect(daysInMonth('2026-09')).toBe(30)
  expect(daysInMonth('2026-02')).toBe(28)
  expect(daysInMonth('2028-02')).toBe(29)
  expect(lastDayOf('2026-08')).toBe('2026-08-31')
})

it('月が終わったかは日付だけで決まる（§4.0.2）', () => {
  expect(isMonthEnded('2026-09', '2026-09-30T23:59')).toBe(false)
  expect(isMonthEnded('2026-09', '2026-10-01T00:00')).toBe(true)
})

it('月を古い順に並べる', () => {
  expect(monthsBetween('2026-08', '2026-11')).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
  expect(monthsBetween('2026-09', '2026-09')).toEqual(['2026-09'])
  expect(monthsBetween('2026-10', '2026-09')).toEqual([])
})

it('年と月の番号（文言の「9月」に使う）', () => {
  expect(yearNumber('2026-09')).toBe(2026)
  expect(monthNumber('2026-09')).toBe(9)
})
