import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/app/providers'
import { useDeferExpense, useFillAmount, useHousehold, useSetSkipped } from '@/data'
import type { Expense, HouseholdData, MonthKey } from '@/domain'
import { addMonth, canDefer as canDeferRow, isLockedStatus, monthStatus } from '@/domain'
import { FillAmountSheet, lockMessage, monthShort, useOnline } from '@/features/expense'
import { formatNumber } from '@/lib/format'

/** 途中では出さずに覚えておくトースト（§3.7・§1.4 の ※） */
type HeldToast = { text: string; onUndo?: () => void }

export type FillPendingQueueProps = {
  /** 精算（S-20 `prep`）から渡された金額待ちの行。この順に S-15 を開く */
  ids: readonly string[]
  /** 最後まで行った・途中で閉じた */
  onDone: () => void
}

/**
 * S-20 の［金額を入れる］から S-15 を順に開く（§4 S-15 `action`・§2.3 E1）。
 *
 * S-15 は支出タブの部品、押した元は精算タブなので、つなぐのはここ（アプリ側）。
 * **途中の［次へ］・来月に回す・今月はなしではトーストを出さず**、シートが閉じたときに
 * 最後の操作のトーストを1つだけ出す（§3.7）。
 */
export function FillPendingQueue({ ids, onDone }: FillPendingQueueProps) {
  const toast = useToast()
  const online = useOnline()
  const { data: snapshot } = useHousehold()
  const [index, setIndex] = useState(0)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null)
  /** 途中の操作のトースト（最後の1つだけ出す） */
  const held = useRef<HeldToast | null>(null)

  const fillAmount = useFillAmount()
  const deferExpense = useDeferExpense()
  const setSkipped = useSetSkipped()

  /** 閉じる。覚えていたトーストがあれば、ここで1つだけ出す */
  const finish = useCallback(
    (instead?: HeldToast) => {
      const shown = instead ?? held.current
      held.current = null
      setMessage(null)
      onDone()
      if (shown) toast.show(shown)
    },
    [onDone, toast]
  )

  const id = ids[index]
  const expense = id === undefined ? undefined : snapshot?.data.expenses.find((e) => e.id === id)

  // 行が見つからない（消えた・並びが変わった）ときは、そこで終わる
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => {
    if (snapshot === undefined) return
    if (expense === undefined) finishRef.current()
  }, [snapshot, expense])

  if (snapshot === undefined || expense === undefined) return null
  const d = snapshot.data
  const now = snapshot.now

  /** 書き込む前の関門（§3.6・§4.0.2）。止まったら true */
  const blocked = (m: MonthKey): boolean => {
    if (!online) {
      setMessage({ text: 'オンラインで直せます', tone: 'info' })
      return true
    }
    const status = monthStatus(d, m, now)
    if (isLockedStatus(status)) {
      setMessage({ text: lockMessage(status, m), tone: 'info' })
      return true
    }
    return false
  }

  /** 次の行へ。最後だったら閉じて、覚えていたトーストを1つ出す */
  const advance = (): void => {
    setMessage(null)
    if (index + 1 < ids.length) {
      setIndex(index + 1)
      return
    }
    finish()
  }

  const fill = async (e: Expense, amount: number): Promise<void> => {
    if (blocked(e.month)) return
    await fillAmount.mutateAsync({ id: e.id, amount })
    // 元に戻す: 金額を「金額待ち」へ戻すデータ層の口がまだ無い（支出タブの S-15 と同じ）
    held.current = { text: `${e.memo} ${formatNumber(amount)}円を入れました` }
    advance()
  }

  const defer = async (e: Expense): Promise<void> => {
    if (blocked(e.month)) return
    const next = addMonth(e.month, 1)
    await deferExpense.mutateAsync({ id: e.id })
    held.current = {
      text: `${e.memo}を${monthShort(next)}に回しました`,
      onUndo: () => deferExpense.mutate({ id: e.id, undo: true }),
    }
    advance()
  }

  const skip = async (e: Expense): Promise<void> => {
    if (blocked(e.month)) return
    await setSkipped.mutateAsync({ id: e.id, skipped: true })
    held.current = {
      text: `${e.memo}を今月はなしにしました`,
      onUndo: () => setSkipped.mutate({ id: e.id, skipped: false }),
    }
    advance()
  }

  return (
    <FillAmountSheet
      key={expense.id}
      open
      d={d}
      expense={expense}
      previousAmount={previousAmountOf(d, expense)}
      canDefer={canDeferRow(d, expense, now)}
      progress={{ index, total: ids.length }}
      message={message}
      onFill={(amount) => {
        void fill(expense, amount)
      }}
      onEmpty={() => setMessage({ text: '金額を入れてください', tone: 'error' })}
      onDefer={() => {
        void defer(expense)
      }}
      onSkip={() => {
        void skip(expense)
      }}
      onClose={(result) => {
        // 入力があったときは「入力をやめました」を優先する（トーストは一度に1つ。§3.7）
        finish(result.dirty ? { text: '入力をやめました' } : undefined)
      }}
    />
  )
}

/**
 * 同じひな形の前の対象月の金額（S-15 の「先月 4,380」）。
 * 支出タブの同じ関数（`features/expense/expenses-screen.tsx`）と同じ内容。
 * 外に出してもらえたら、そちらを使う（報告の「ほかの担当に頼みたいこと」を参照）。
 */
function previousAmountOf(d: HouseholdData, e: Expense): number | null {
  const previous = addMonth(e.labelMonth ?? e.month, -1)
  const row = d.expenses.find(
    (x) => x.tpl === e.tpl && (x.labelMonth ?? x.month) === previous && x.amount !== null && !x.skipped
  )
  return row?.amount ?? null
}
