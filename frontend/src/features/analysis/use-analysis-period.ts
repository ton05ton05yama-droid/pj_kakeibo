import { useCallback, useState } from 'react'
import {
  type AnalysisPeriod,
  clampAnalysisPeriod,
  type DateTimeKey,
  defaultAnalysisPeriod,
  type HouseholdData,
} from '@/domain'

/**
 * 分析タブが見ている期間（本書の決め）。
 *
 * アプリを開いたときは既定（過去3か月・今月を含む）。開いているあいだはタブを移っても最後に選んだ期間のまま
 * （タブを切り替えると画面は外れるので、このモジュールの変数で覚えておく）。端末に保存しない。
 * 覚えた期間は、出すたびに選べる範囲（家計を作った月〜今月）・12か月までにそろえる。
 */
let remembered: AnalysisPeriod | null = null

/** テストのあいだだけ使う（覚えた期間を捨てる） */
export function forgetAnalysisPeriod(): void {
  remembered = null
}

export function useAnalysisPeriod(d: HouseholdData, now: DateTimeKey): [AnalysisPeriod, (p: AnalysisPeriod) => void] {
  const [period, setPeriodState] = useState<AnalysisPeriod>(() => remembered ?? defaultAnalysisPeriod(d, now))
  const setPeriod = useCallback((next: AnalysisPeriod) => {
    remembered = next
    setPeriodState(next)
  }, [])
  return [clampAnalysisPeriod(d, period, now), setPeriod]
}
