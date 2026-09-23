import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/app/providers'
import { useDeferExpense, useFillAmount, useHousehold, useSetSkipped } from '@/data'
import type { Expense, HouseholdData, MonthKey } from '@/domain'
import { addMonth, canDefer as canDeferRow, isLockedStatus, monthStatus } from '@/domain'
import { FillAmountSheet, lockMessage, monthShort } from '@/features/expense'
import { formatNumber } from '@/lib/format'
import { useOnline } from '@/lib/use-online'

/** 途中では出さずに覚えておくトースト（§3.7・§1.4 の ※） */
type HeldToast = { text: string; onUndo?: () => void }

/** トーストが出ているあいだ（§3.7）。この間だけ「入力をやめました」を元に戻せる */
const UNDO_MS = 6000

/**
 * 下端に固定した部分（S-20 の合計と［この金額で精算］）の高さ。
 * トーストはこの分だけ持ち上げる（§3.7。`settle-screen.tsx` と同じ測り方）。
 */
function settleFootHeight(): string {
  const node = document.querySelector('[data-settle-foot]')
  return node ? `${Math.round(node.getBoundingClientRect().height)}px` : '0px'
}

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
  /** 入力のまま閉じた（「元に戻す」を押せるあいだは、この部品を残したまま何も出さない） */
  const [closed, setClosed] = useState(false)
  /** 開き直すときの行と入力中の金額（S-14 の restoreDraft と同じ形） */
  const [restore, setRestore] = useState<{ index: number; digits: string } | null>(null)
  const doneTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(doneTimer.current), [])

  const fillAmount = useFillAmount()
  const deferExpense = useDeferExpense()
  const setSkipped = useSetSkipped()

  /**
   * 閉じる。覚えていたトーストがあれば、ここで1つだけ出す。
   *
   * S-15 は押した元のタブ（精算タブ）の上に重なっているので、閉じると下に S-20 が出る。
   * トーストは下端に固定した部分の高さぶん持ち上げる（§3.7。`settle-screen.tsx` と同じ測り方）。
   */
  const finish = useCallback(
    (instead?: HeldToast) => {
      const shown = instead ?? held.current
      held.current = null
      setMessage(null)
      // 閉じる前に測る（閉じたあとは下端の固定部分の高さが変わっていることがある）
      const offsetBottom = settleFootHeight()
      onDone()
      if (shown) {
        toast.show({ text: shown.text, offsetBottom, ...(shown.onUndo ? { onUndo: shown.onUndo } : {}) })
      }
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

  // 入力のまま閉じたあいだは何も出さない（「元に戻す」で同じ行から開き直せるように残しておく）
  if (closed || snapshot === undefined || expense === undefined) return null
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

  /**
   * 入力のまま閉じた（§3.7）。「入力をやめました　元に戻す」で、閉じたときの行・入力のまま開き直せる。
   * 元に戻せるあいだはこの部品を残し、トーストが消えたら閉じる。
   */
  const giveUp = (at: number, digits: string): void => {
    // 入力があったときは「入力をやめました」を優先する（トーストは一度に1つ。§3.7）
    held.current = null
    setMessage(null)
    setClosed(true)
    const offsetBottom = settleFootHeight()
    window.clearTimeout(doneTimer.current)
    doneTimer.current = window.setTimeout(() => {
      setClosed(false)
      onDone()
    }, UNDO_MS)
    toast.show({
      text: '入力をやめました',
      offsetBottom,
      onUndo: () => {
        window.clearTimeout(doneTimer.current)
        setRestore({ index: at, digits })
        setIndex(at)
        setClosed(false)
      },
    })
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
      initialDigits={restore !== null && restore.index === index ? restore.digits : null}
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
        if (result.dirty) {
          giveUp(index, result.digits)
          return
        }
        finish()
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
