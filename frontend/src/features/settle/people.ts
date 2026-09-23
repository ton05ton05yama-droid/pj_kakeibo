/** 人の呼び名（§1.1・§3.8）。自分の名前のうしろには「（自分）」を付ける */
import type { HouseholdData, Payer, PersonKey } from '@/domain'

/** 呼び名（共用は「共用」） */
export const whoName = (d: HouseholdData, who: Payer): string => (who === 'joint' ? '共用' : d.people[who].name)

/** 自分の名前のうしろに付ける「（自分）」（§3.8） */
export const selfMark = (p: PersonKey, viewer: PersonKey): string => (p === viewer ? '（自分）' : '')

/** 名前＋（自分）。読み上げ名・見出しで使う */
export const displayName = (d: HouseholdData, p: PersonKey, viewer: PersonKey): string =>
  `${whoName(d, p)}${selfMark(p, viewer)}`
