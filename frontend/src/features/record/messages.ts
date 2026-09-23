/**
 * 記録タブの文言（正本: docs/03_ui_spec.md §1.3・§1.4）。
 * 表にある文字列だけを組み立てる。新しい文言は作らない（§0.6 の5）。
 */
import type { DateKey, MonthKey, MonthStatus, Payer, Person, PersonKey } from '@/domain'
import { categoryName, monthNumber } from '@/domain'
import { formatNumber } from '@/lib/format'

/** 払った人の呼び名（「共用」は固定。§1.1） */
export function payerName(payer: Payer, people: Record<PersonKey, Person>): string {
  return payer === 'joint' ? '共用' : people[payer].name
}

/**
 * その場の1行「9月は精算中です（先に精算をやり直します）」（§1.4）。
 * 精算中・精算済みの月の日付で［記録する］を押したときだけ出す（案内の色）。
 */
export function lockedMessage(m: MonthKey, status: MonthStatus): string {
  return `${monthNumber(m)}月は${status === 'settled' ? '精算済み' : '精算中'}です（先に精算をやり直します）`
}

export type RecordToastInput = {
  date: DateKey
  /** 「今日」（サーバーの日付）。日付がこれと違うときだけ、文言の先頭に「9/21 」を足す */
  today: DateKey
  cat: Parameters<typeof categoryName>[0]
  amount: number
  payer: Payer
  people: Record<PersonKey, Person>
  /** オフラインのときは「はつながったら送ります」（§3.6） */
  offline: boolean
}

/** 記録したときのトースト（§1.4 の4行） */
export function recordToastText(x: RecordToastInput): string {
  const day = x.date === x.today ? '' : `${Number(x.date.slice(5, 7))}/${Number(x.date.slice(8, 10))} `
  const head = `${day}${categoryName(x.cat)} ${formatNumber(x.amount)}円（${payerName(x.payer, x.people)}）`
  return x.offline ? `${head}はつながったら送ります` : `${head}を記録`
}
