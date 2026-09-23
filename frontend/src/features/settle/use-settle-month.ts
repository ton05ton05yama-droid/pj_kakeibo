/**
 * 精算タブが見ている月（§3.4）。
 *
 * - 月は**タブごとに持つ**。アプリを開いたときの既定は「締め待ちか精算中の月のうち一番古い月。
 *   無ければ今月」（`defaultSettleMonth`）。
 * - アプリを開いているあいだは、タブを移っても最後に見た月のまま。タブを離れると画面が
 *   外れるので、見ていた月はこのファイルの中（このタブの持ち物）に覚えておく。
 */
import { useCallback, useEffect, useState } from 'react'
import type { MonthKey } from '@/domain'

/** アプリを開いているあいだ、精算タブが最後に見ていた月 */
let remembered: MonthKey | null = null

export function useSettleMonth(defaultMonth: MonthKey | null): {
  month: MonthKey | null
  setMonth: (m: MonthKey) => void
} {
  const [month, setLocal] = useState<MonthKey | null>(remembered)

  const setMonth = useCallback((m: MonthKey) => {
    remembered = m
    setLocal(m)
  }, [])

  // 既定の月を使うのは**最初に開いたときだけ**。そのあと月の状態が変わっても、
  // 見ている月は動かさない（§3.4「アプリを開いたときは各タブの既定の月にする」）
  useEffect(() => {
    if (month === null && defaultMonth !== null) {
      remembered = defaultMonth
      setLocal(defaultMonth)
    }
  }, [month, defaultMonth])

  return { month: month ?? defaultMonth, setMonth }
}

/** テストで最初の状態に戻す（本番では呼ばない） */
export function resetSettleMonth(): void {
  remembered = null
}
