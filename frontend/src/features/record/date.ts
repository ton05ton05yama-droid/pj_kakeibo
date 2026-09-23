/**
 * 記録の日付（S-12 の［今日｜昨日｜ほかの日］）の小さな純粋関数。
 *
 * 「今日」は端末の時計ではなく、必ず `useHousehold()` が返す `now`（サーバーの日付）から出す（02 §10 C10）。
 * dayjs は使わない（指示のとおり素の Date と自前のユーティリティ）。
 */
import type { DateKey } from '@/domain'

/** 日付のセグメントの選択肢（§4 S-12 の要素5） */
export type DateChoice = 'today' | 'yesterday' | 'other'

const WEEKDAYS = '日月火水木金土'

/** 'YYYY-MM-DD' を k 日ずらす（UTC で計算するので夏時間の影響を受けない） */
export function addDays(date: DateKey, k: number): DateKey {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + k)
  return new Date(t).toISOString().slice(0, 10)
}

/** 曜日の1文字（「土」） */
export function weekdayOf(date: DateKey): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  return WEEKDAYS[new Date(t).getUTCDay()] ?? ''
}

/** 「9/19（土）」（［ほかの日］を選んだあとのセグメントの文字） */
export function formatDateWithWeekday(date: DateKey): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayOf(date)}）`
}

/** セグメントの選択から、実際に保存する日付を出す */
export function resolveDate(choice: DateChoice, otherDate: DateKey | null, today: DateKey): DateKey {
  if (choice === 'today') return today
  if (choice === 'yesterday') return addDays(today, -1)
  return otherDate ?? today
}

/** 端末の日付選択で選ばれた日付を、セグメントのどこに当てるか（今日・昨日はそのマスを選ぶ） */
export function choiceForDate(date: DateKey, today: DateKey): DateChoice {
  if (date === today) return 'today'
  if (date === addDays(today, -1)) return 'yesterday'
  return 'other'
}
