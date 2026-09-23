/**
 * S-11 記録（何に払った？）— 記録タブのトップ（アプリはいつもここで開く）。
 *
 * 正本: docs/03_ui_spec.md §4 S-11、mock/index.html の `renderS11`。
 * 要素（上から）: 見出しの行「何に払った？」／（オフラインのときだけ）オフラインの行／カテゴリのグリッド（3列×5行）。
 * 月切替・一覧・合計・お知らせ行・主ボタンは置かない（§2.1）。状態は `normal` だけ。
 *
 * カテゴリを押すと S-12（いくら？）のシートが開く。ここでは保存しない（§11 #1）。
 * 保存したらシートを閉じて**このタブに留まる**（支出タブへ移らない。§3.4）。
 */
import { Box } from '@chakra-ui/react'
import { useState } from 'react'
import { useToast } from '@/app/providers'
import {
  CategoryGrid,
  type CategoryGridItem,
  type IconName,
  OfflineRow,
  PlainAppBar,
  usePageScrolled,
} from '@/components'
import { useAddExpense, useDeleteExpense, useHousehold } from '@/data'
import { RepositoryError } from '@/data/repository'
import type { CategoryKey, DateKey } from '@/domain'
import { CATEGORIES, dateOf, isLockedStatus, monthOf, monthStatus } from '@/domain'
import { AmountSheet, type SubmitResult } from './amount-sheet'
import { newDraft, type RecordDraft } from './draft'
import { lockedMessage, recordToastText } from './messages'
import { useOnline } from './use-online'

/** カテゴリのグリッドの15マス（並びは §8 のとおり。アイコンの名前はカテゴリのキーと同じ。§7.6） */
const GRID_ITEMS: readonly CategoryGridItem[] = CATEGORIES.map((c) => ({
  key: c.key,
  label: c.name,
  icon: c.key as IconName,
}))

/** 端末で採番する記録の ID（04 §2.5。オフラインで作った記録も同じ ID で送る） */
function newExpenseId(): string {
  return crypto.randomUUID()
}

export function RecordScreen() {
  const scrolled = usePageScrolled()
  const online = useOnline()
  const { data: snapshot } = useHousehold()
  const toast = useToast()
  const addExpense = useAddExpense()
  const deleteExpense = useDeleteExpense()

  /** シートに渡す初めの値（null ならシートは閉じている）。元に戻すで入力のまま開き直すので、値ごと持つ */
  const [draft, setDraft] = useState<RecordDraft | null>(null)
  /** 開き直すたびにシートを作り直す（前の入力が残らないように） */
  const [openCount, setOpenCount] = useState(0)

  const openSheet = (next: RecordDraft) => {
    // シートを開くとトーストは消える（§3.7）
    toast.hide()
    setDraft(next)
    setOpenCount((n) => n + 1)
  }

  const onSelectCategory = (key: string) => {
    if (snapshot === undefined) return
    openSheet(newDraft(key as CategoryKey, snapshot.viewer, snapshot.data.people[snapshot.viewer].defaultPayer))
  }

  /** 閉じる。入力があったときだけ「入力をやめました　元に戻す」（押すと入力のまま開き直す。§3.7） */
  const onCloseSheet = (unsaved: RecordDraft | null) => {
    setDraft(null)
    if (unsaved === null) return
    toast.show({ text: '入力をやめました', onUndo: () => openSheet(unsaved) })
  }

  const onSubmit = async (current: RecordDraft, date: DateKey): Promise<SubmitResult> => {
    if (snapshot === undefined) return { ok: false, message: { text: 'オンラインで直せます', tone: 'info' } }
    const { data, now } = snapshot
    // 精算中・精算済みの月の日付では記録しない（既定の「今日」でもここに来ることがある。§12.1 Q2）
    const status = monthStatus(data, monthOf(date), now)
    if (isLockedStatus(status)) {
      return { ok: false, message: { text: lockedMessage(monthOf(date), status), tone: 'info' } }
    }
    const id = newExpenseId()
    const amount = Number(current.digits)
    try {
      await addExpense.mutateAsync({
        id,
        date,
        cat: current.cat,
        amount,
        payer: current.payer,
        memo: current.memo.trim(),
      })
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'month_locked') {
        return { ok: false, message: { text: lockedMessage(monthOf(date), status), tone: 'info' } }
      }
      return { ok: false, message: { text: 'オンラインで直せます', tone: 'info' } }
    }
    setDraft(null)
    toast.show({
      text: recordToastText({
        date,
        today: dateOf(now),
        cat: current.cat,
        amount,
        payer: current.payer,
        people: data.people,
        offline: !online,
      }),
      onUndo: () => deleteExpense.mutate({ id }),
    })
    return { ok: true }
  }

  return (
    <>
      <PlainAppBar scrolled={scrolled}>何に払った？</PlainAppBar>
      {online ? null : <OfflineRow />}
      {/* オフラインの行が出ているときだけ、下の余白を 16 → 8px に詰める（セルの高さは変えない。§4 S-11） */}
      <Box data-screen='S-11' data-state='normal' mt={2} pb={online ? '16px' : '8px'}>
        <CategoryGrid items={GRID_ITEMS} onSelect={onSelectCategory} />
      </Box>
      {draft === null || snapshot === undefined ? null : (
        <AmountSheet
          key={openCount}
          initial={draft}
          data={snapshot.data}
          people={snapshot.data.people}
          today={dateOf(snapshot.now)}
          now={snapshot.now}
          onSubmit={onSubmit}
          onClose={onCloseSheet}
        />
      )}
    </>
  )
}
