import { describe, expect, it } from 'vitest'
import { applyKey, normalizeDigits, parsePastedAmount } from '../amount'

describe('金額の入力（仕様書 §7.5 テンキー）', () => {
  it('先頭の 0 を落とす。手取り（allowZero）は 0 を1つ残す', () => {
    expect(normalizeDigits('007', false)).toBe('7')
    expect(normalizeDigits('0', false)).toBe('')
    expect(normalizeDigits('0', true)).toBe('0')
    expect(normalizeDigits('00', true)).toBe('0')
  })

  it('7桁を超える入力は受け付けず、値を変えない（切り詰めない）', () => {
    expect(applyKey('1234567', '8', { replace: false, allowZero: false })).toEqual({
      digits: '1234567',
      rejected: true,
    })
  })

  it('直すときは最初のキーで置き換える', () => {
    expect(applyKey('1280', '5', { replace: true, allowZero: false })).toEqual({
      digits: '5',
      rejected: false,
    })
    expect(applyKey('1280', '5', { replace: false, allowZero: false })).toEqual({
      digits: '12805',
      rejected: false,
    })
  })

  it('⌫ は1文字消す。置き換える前の ⌫ は空にする', () => {
    expect(applyKey('1280', 'backspace', { replace: false, allowZero: false }).digits).toBe('128')
    expect(applyKey('1280', 'backspace', { replace: true, allowZero: false }).digits).toBe('')
  })

  it('貼り付けは数字と桁区切り（¥・円・全角）だけを受け付ける', () => {
    expect(parsePastedAmount('1,280')).toBe('1280')
    expect(parsePastedAmount('¥1,280')).toBe('1280')
    expect(parsePastedAmount('1280円')).toBe('1280')
    expect(parsePastedAmount('１２８０')).toBe('1280')
  })

  it('小数点・日付・文字・7桁を超える値は受け付けない', () => {
    expect(parsePastedAmount('1280.5')).toBeNull()
    expect(parsePastedAmount('2026/09/22')).toBeNull()
    expect(parsePastedAmount('ガス代')).toBeNull()
    expect(parsePastedAmount('12345678')).toBeNull()
  })
})
