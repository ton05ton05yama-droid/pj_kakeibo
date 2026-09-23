/**
 * S-20 `undecided` の「出す額のブロック」と［この額で決める］が使う値（§4 S-20）。
 *
 * どちらも**同じ計算**（先月の手取り × いまの出す割合）で出す。計算は domain の
 * `decideContributions` に閉じ込め、画面の中で式を書かない（§6.2）。
 */
import type { Contribution, DateTimeKey, HouseholdData, MonthKey, PersonKey } from '@/domain'
import { addMonth, decideContributions, PERSON_KEYS } from '@/domain'

/** まだ決めていない人の、先月の手取り（先月も決めていない人は入らない） */
export function undecidedNets(d: HouseholdData, m: MonthKey): Partial<Record<PersonKey, number>> {
  const current = d.contributions[m] ?? {}
  const previous = d.contributions[addMonth(m, -1)] ?? {}
  const nets: Partial<Record<PersonKey, number>> = {}
  for (const p of PERSON_KEYS) {
    if (current[p]) continue
    const before = previous[p]
    if (before) nets[p] = before.net
  }
  return nets
}

export interface DecidePlan {
  /** 決まっていない人の、先月の手取りで出した行 */
  plan: Partial<Record<PersonKey, Contribution>>
  /** 先月の手取りも無い人がいる（主ボタンを［出す額を決める］にする） */
  missing: boolean
}

export function decidePlan(d: HouseholdData, m: MonthKey, viewer: PersonKey, now: DateTimeKey): DecidePlan {
  const current = d.contributions[m] ?? {}
  const plan = decideContributions(d, m, undecidedNets(d, m), viewer, now)
  const missing = PERSON_KEYS.some((p) => !current[p] && !plan[p])
  return { plan, missing }
}
