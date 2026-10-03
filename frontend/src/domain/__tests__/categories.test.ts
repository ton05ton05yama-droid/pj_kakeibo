/** カテゴリと名前からの推測（§8） */
import { describe, expect, it } from 'vitest'
import { CATEGORIES, categoryIcon, categoryName, guessCategory } from '../categories'

it('カテゴリは15個で、並びは S-11 のグリッド順（§8）', () => {
  expect(CATEGORIES).toHaveLength(15)
  expect(CATEGORIES.map((c) => c.key)).toEqual([
    'groceries',
    'dining',
    'household_goods',
    'transport',
    'leisure',
    'entertainment',
    'social',
    'housing',
    'utilities',
    'telecom',
    'insurance',
    'medical',
    'big_purchase',
    'tax',
    'other',
  ])
  expect(categoryName('groceries')).toBe('食料品')
  expect(categoryIcon('utilities')).toBe('lightbulb')
})

describe('名前からカテゴリを推測する（§8 の決め方）', () => {
  it.each([
    ['ガス代', 'utilities'],
    ['電気代', 'utilities'],
    ['光熱費', 'utilities'],
    ['光回線', 'telecom'],
    ['駐車場代', 'transport'],
    ['住民税', 'tax'],
    ['年金保険料', 'insurance'],
    ['家賃', 'housing'],
    ['NETFLIX', 'entertainment'],
    ['スマホ', 'telecom'],
    ['火災保険', 'insurance'],
    ['病院', 'medical'],
    ['家電のローン', 'big_purchase'],
    // ハイフンなしでも当たる（大文字・小文字は区別しない）
    ['Wi-Fi', 'telecom'],
    ['Wifi', 'telecom'],
    ['WIFI', 'telecom'],
  ])('「%s」→ %s', (name, key) => {
    expect(guessCategory(name)).toBe(key)
  })

  it('どの語も含まなければ推測しない', () => {
    expect(guessCategory('ジム')).toBeNull()
    expect(guessCategory('')).toBeNull()
    expect(guessCategory(null)).toBeNull()
  })
})
