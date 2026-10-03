/**
 * カテゴリ（15個・1階層で固定。正本: docs/03_ui_spec.md §8）
 *
 * 並びは S-11 のグリッド順（3列×5行。左から右へ、上から下へ）。
 * key は DB の categories.id、モックの CATEGORIES.key と同じ。
 */
import type { Category, CategoryKey } from './types'

export const CATEGORIES: readonly Category[] = [
  { key: 'groceries', name: '食料品', icon: 'shopping-basket', guess: [] },
  { key: 'dining', name: '外食', icon: 'utensils-crossed', guess: [] },
  { key: 'household_goods', name: '日用品', icon: 'spray-can', guess: [] },
  { key: 'transport', name: '交通', icon: 'train-front', guess: ['駐車場'] },
  { key: 'leisure', name: 'レジャー', icon: 'ticket', guess: [] },
  {
    key: 'entertainment',
    name: 'エンタメ',
    icon: 'tv',
    guess: ['動画', '音楽', '配信', 'Netflix', 'Spotify'],
  },
  { key: 'social', name: '交際', icon: 'gift', guess: [] },
  { key: 'housing', name: '住まい', icon: 'building-2', guess: ['家賃', '管理費'] },
  { key: 'utilities', name: '光熱費', icon: 'lightbulb', guess: ['電気', 'ガス', '水道', '光熱'] },
  { key: 'telecom', name: '通信', icon: 'wifi', guess: ['携帯', 'スマホ', '光', '回線', 'Wi-Fi', 'WiFi', 'NHK'] },
  { key: 'insurance', name: '保険', icon: 'shield', guess: ['保険'] },
  { key: 'medical', name: '医療', icon: 'stethoscope', guess: ['病院', '薬'] },
  { key: 'big_purchase', name: '大型出費', icon: 'sofa', guess: ['家電', '家具'] },
  { key: 'tax', name: '税金', icon: 'landmark', guess: ['税', '年金'] },
  { key: 'other', name: 'その他', icon: 'ellipsis', guess: [] },
]

const BY_KEY = new Map<CategoryKey, Category>(CATEGORIES.map((c) => [c.key, c]))

/** カテゴリの定義を引く（無ければ undefined） */
export function findCategory(key: CategoryKey): Category | undefined {
  return BY_KEY.get(key)
}

/** カテゴリの表示名（§8）。見つからなければ「その他」 */
export function categoryName(key: CategoryKey): string {
  return BY_KEY.get(key)?.name ?? 'その他'
}

/** カテゴリのアイコン名（Lucide。§7.6） */
export function categoryIcon(key: CategoryKey): string {
  return BY_KEY.get(key)?.icon ?? 'ellipsis'
}

/**
 * 名前からカテゴリを推測する（S-32・§8 の決め方）。
 * 名前に含まれる語のうち一番長い語のカテゴリ。同じ長さなら §8 の並びが先のカテゴリ。
 * 大文字・小文字は区別しない。どの語も含まなければ null。
 */
export function guessCategory(name: string | null | undefined): CategoryKey | null {
  const n = (name ?? '').toLowerCase()
  let best: CategoryKey | null = null
  let bestLen = 0
  for (const c of CATEGORIES) {
    for (const g of c.guess) {
      const len = [...g].length
      if (len > bestLen && n.includes(g.toLowerCase())) {
        best = c.key
        bestLen = len
      }
    }
  }
  return best
}
