import { useCallback, useState } from 'react'
import type { MonthKey } from '@/domain'

/**
 * 支出タブが見ている月（§3.4）。
 *
 * 月は**タブごとに持つ**。アプリを開いたときは既定の月（支出は今月）で、
 * 開いているあいだはタブを移っても最後に見た月のまま（タブを切り替えると画面は外れるので、
 * このモジュールの変数で覚えておく）。端末だけのもので、保存も共有もしない。
 */
let remembered: MonthKey | null = null

/** テストのあいだだけ使う（覚えた月を捨てる） */
export function forgetExpenseMonth(): void {
  remembered = null
}

export function useExpenseMonth(defaultMonth: MonthKey): [MonthKey, (m: MonthKey) => void] {
  const [month, setMonthState] = useState<MonthKey>(() => remembered ?? defaultMonth)
  const setMonth = useCallback((next: MonthKey) => {
    remembered = next
    setMonthState(next)
  }, [])
  return [month, setMonth]
}
