import { Box, Flex } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/app/providers'
import {
  Avatar,
  Badge,
  DateHeading,
  Icon,
  ListRow,
  MonthAppBar,
  NoticeRow,
  OfflineRow,
  usePageScrolled,
} from '@/components'
import { ButtonBox } from '@/components/primitives'
import {
  useDeferExpense,
  useDeleteExpense,
  useFillAmount,
  useHousehold,
  useRestoreExpense,
  useSetSkipped,
  useUpdateExpense,
  useUpdateLastSeen,
} from '@/data'
import {
  type Attention,
  addMonth,
  attention,
  canDefer as canDeferRow,
  categoryName,
  type DateTimeKey,
  type Expense,
  type HouseholdData,
  isLockedStatus,
  isNewExpense,
  type MonthKey,
  monthNumber,
  monthOf,
  monthStatus,
  type PersonKey,
  summarize,
} from '@/domain'
import { MonthPickerSheet } from '@/features/monthPicker'
import { formatNumber, formatYen } from '@/lib/format'
import { BreakdownSheet } from './breakdown-sheet'
import { draftDate, type ExpenseDraft, ExpenseSheet, expenseSheetMode } from './expense-sheet'
import { FillAmountSheet } from './fill-amount-sheet'
import { groupByDate, pendingShownFor, sortByNewest, sortFixedRows } from './ordering'
import { dateLong, lockBadgeText, lockMessage, monthShort, payerName, rowName, templateLabel } from './text'
import { useExpenseMonth } from './use-expense-month'
import { useOnline } from './use-online'

type SheetState =
  | { kind: 'month' }
  | { kind: 'breakdown' }
  | { kind: 'expense'; id: string }
  | { kind: 'fill'; id: string }
  | null

type Message = { text: string; tone: 'error' | 'info' } | null

/** お知らせ行の文言（§3.5。条件は精算タブの赤い点と同じ） */
function noticeText(a: Attention): string {
  if (a.kind === 1) return `${monthShort(a.m)}の精算ができます`
  return a.amount > 0
    ? `${monthShort(a.m)}: 共用へ ${formatNumber(a.amount)}円 入れる`
    : `${monthShort(a.m)}: 共用から ${formatNumber(a.amount)}円 受け取る`
}

/** S-10 支出（§4 S-10）。データが届くまでは中身を出さない */
export function ExpensesScreen() {
  const { data } = useHousehold()
  if (data === undefined) return null
  return <ExpensesTab d={data.data} now={data.now} viewer={data.viewer} />
}

function ExpensesTab({ d, now, viewer }: { d: HouseholdData; now: DateTimeKey; viewer: PersonKey }) {
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()
  const scrolled = usePageScrolled()
  const defaultMonth = monthOf(now)
  const [month, setMonth] = useExpenseMonth(defaultMonth)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [message, setMessage] = useState<Message>(null)
  const [restoreDraft, setRestoreDraft] = useState<ExpenseDraft | null>(null)
  const [fixedOpen, setFixedOpen] = useState(false)

  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()
  const restoreExpense = useRestoreExpense()
  const fillAmount = useFillAmount()
  const setSkipped = useSetSkipped()
  const deferExpense = useDeferExpense()
  const markSeen = useUpdateLastSeen()

  // 新着は、この画面を開いた時点のものを覚えておく（S-10 を離れると消える。§1.1）
  const newIds = useRef<Set<string> | null>(null)
  if (newIds.current === null) {
    const lastSeen = d.people[viewer].lastSeen
    newIds.current = new Set(d.expenses.filter((e) => isNewExpense(e, viewer, lastSeen)).map((e) => e.id))
  }

  // S-10 を離れたら「新着」を消す（最後に見た時刻を今にする）
  const nowRef = useRef(now)
  nowRef.current = now
  const markSeenRef = useRef(markSeen)
  markSeenRef.current = markSeen
  useEffect(() => {
    return () => {
      markSeenRef.current.mutate(nowRef.current)
    }
  }, [])

  const sum = summarize(d.expenses, month)
  const status = monthStatus(d, month, now)
  const locked = isLockedStatus(status)
  const notice = attention(d, viewer, now)
  const shownPending = pendingShownFor(d, month, now)
  const empty = sum.rows.length === 0 && sum.deferredOut.length === 0
  const state = empty
    ? 'empty'
    : locked
      ? 'locked'
      : notice !== null || (sum.pending.length > 0 && status === 'closing')
        ? 'action'
        : 'normal'

  const find = (id: string): Expense | undefined => d.expenses.find((e) => e.id === id)

  /** シートを開く（出ていたトーストは消える。§3.7） */
  const openSheet = (next: SheetState) => {
    toast.hide()
    setMessage(null)
    setRestoreDraft(null)
    setSheet(next)
  }
  const closeSheet = () => {
    setMessage(null)
    setRestoreDraft(null)
    setSheet(null)
  }

  const changeMonth = (next: MonthKey) => {
    setMonth(next)
    setFixedOpen(false)
  }

  /** 書き込む前の関門（§3.6・§4.0.2）。止まったら true */
  const blocked = (months: readonly (MonthKey | null)[], allowOffline = false): boolean => {
    if (!online && !allowOffline) {
      setMessage({ text: 'オンラインで直せます', tone: 'info' })
      return true
    }
    for (const m of months) {
      if (m === null) continue
      const s = monthStatus(d, m, now)
      if (isLockedStatus(s)) {
        setMessage({ text: lockMessage(s, m), tone: 'info' })
        return true
      }
    }
    return false
  }

  /* ---- S-14 の操作 ------------------------------------------------ */

  const saveExpense = async (e: Expense, draft: ExpenseDraft, mode: string) => {
    const date = draftDate(draft, now.slice(0, 10))
    const nextMonth = monthOf(date)
    if (blocked([mode === 'unsent' ? null : e.month, mode === 'fixed' ? null : nextMonth])) return
    const amount = Number(draft.digits || 0)

    if (mode === 'fixed') {
      const same = amount === e.amount && draft.payer === e.payer && !e.skipped
      if (same) return closeSheet()
      const before = { amount: e.amount, payer: e.payer, skipped: e.skipped }
      await fillAmount.mutateAsync({ id: e.id, amount })
      if (draft.payer !== e.payer) await updateExpense.mutateAsync({ id: e.id, patch: { payer: draft.payer } })
      if (e.skipped) await setSkipped.mutateAsync({ id: e.id, skipped: false })
      closeSheet()
      toast.show({
        text: '直しました',
        ...(before.amount !== null
          ? {
              onUndo: () => {
                void (async () => {
                  await fillAmount.mutateAsync({ id: e.id, amount: before.amount ?? 0 })
                  if (before.payer !== draft.payer) {
                    await updateExpense.mutateAsync({ id: e.id, patch: { payer: before.payer } })
                  }
                  if (before.skipped) await setSkipped.mutateAsync({ id: e.id, skipped: true })
                })()
              },
            }
          : {}),
      })
      return
    }

    const same =
      amount === e.amount &&
      draft.payer === e.payer &&
      draft.cat === e.cat &&
      draft.memo === e.memo &&
      date === e.date &&
      e.sync === null
    if (same) return closeSheet()
    const before = { date: e.date, cat: e.cat, amount: e.amount ?? 0, payer: e.payer, memo: e.memo }
    await updateExpense.mutateAsync({
      id: e.id,
      patch: { date, cat: draft.cat, amount, payer: draft.payer, memo: draft.memo.trim() },
    })
    closeSheet()
    changeMonth(nextMonth)
    toast.show({
      text: '直しました',
      onUndo: () => updateExpense.mutate({ id: e.id, patch: before }),
    })
  }

  const removeExpense = async (e: Expense, mode: string) => {
    if (blocked(mode === 'unsent' ? [] : [e.month], mode === 'unsent')) return
    await deleteExpense.mutateAsync({ id: e.id })
    closeSheet()
    toast.show({ text: '削除しました', onUndo: () => restoreExpense.mutate(e) })
  }

  const skipRow = async (e: Expense) => {
    if (blocked([e.month])) return
    await setSkipped.mutateAsync({ id: e.id, skipped: true })
    closeSheet()
    toast.show({
      text: `${e.memo}を今月はなしにしました`,
      onUndo: () => setSkipped.mutate({ id: e.id, skipped: false }),
    })
  }

  /* ---- S-15 の操作 ------------------------------------------------ */

  const fillRow = async (e: Expense, amount: number) => {
    if (blocked([e.month])) return
    await fillAmount.mutateAsync({ id: e.id, amount })
    closeSheet()
    // 元に戻す: 金額を「金額待ち」へ戻すデータ層の口がまだ無い（報告の「仕様書との食い違い」を参照）
    toast.show({ text: `${e.memo} ${formatNumber(amount)}円を入れました` })
  }

  const deferRow = async (e: Expense) => {
    if (blocked([e.month])) return
    const next = addMonth(e.month, 1)
    await deferExpense.mutateAsync({ id: e.id })
    closeSheet()
    toast.show({
      text: `${e.memo}を${monthShort(next)}に回しました`,
      onUndo: () => deferExpense.mutate({ id: e.id, undo: true }),
    })
  }

  /* ---- 画面 -------------------------------------------------------- */

  const openExpense = find(sheet?.kind === 'expense' ? sheet.id : '')
  const openPending = find(sheet?.kind === 'fill' ? sheet.id : '')

  const listRow = (e: Expense) => {
    const memo = rowName(d, e)
    return (
      <ListRow
        key={e.id}
        leading={<Avatar who={e.payer} name={e.payer === 'joint' ? undefined : payerName(d, e.payer)} />}
        title={categoryName(e.cat)}
        memo={memo}
        amount={e.skipped ? '今月はなし' : formatNumber(e.amount ?? 0)}
        muted={e.skipped}
        badge={
          <Flex gap={1}>
            {newIds.current?.has(e.id) ? <Badge>新着</Badge> : null}
            {e.sync === 'pending' ? <Badge>未送信</Badge> : null}
            {e.sync === 'failed' ? <Badge>送れませんでした</Badge> : null}
          </Flex>
        }
        onClick={() => openSheet({ kind: 'expense', id: e.id })}
      />
    )
  }

  const notes: string[] = []
  if (sum.pending.length > 0) notes.push(`＋ 金額待ち ${sum.pending.length}件`)
  if (sum.unsent.length > 0) notes.push(`未送信 ${sum.unsent.length}件`)

  return (
    <Box data-screen='S-10' data-state={state} display='flex' flexDirection='column' flex='1'>
      <MonthAppBar
        year={Number(month.slice(0, 4))}
        month={monthNumber(month)}
        canGoPrev={month > d.household.createdMonth}
        canGoNext={month < defaultMonth}
        isDefaultMonth={month === defaultMonth}
        scrolled={scrolled}
        onPrevMonth={() => changeMonth(addMonth(month, -1))}
        onNextMonth={() => changeMonth(addMonth(month, 1))}
        onOpenMonthPicker={() => openSheet({ kind: 'month' })}
      />
      {!online ? <OfflineRow /> : null}
      {notice !== null ? (
        <NoticeRow onClick={() => navigate('/settle', { state: { month: notice.m } })}>{noticeText(notice)}</NoticeRow>
      ) : null}
      <Box mt={1} fontSize='bodySm' fontWeight='medium' color='text.sub'>
        {monthShort(month)}のふたりの支出
      </Box>
      <Box mt='2px' fontSize='3xl' fontWeight='bold' lineHeight='tight' fontVariantNumeric='tabular-nums'>
        {formatYen(sum.total)}
      </Box>
      {locked ? (
        <Box mt={1}>
          <Badge icon='lock'>{lockBadgeText(status, d.settlements[month]?.settledAt ?? null)}</Badge>
        </Box>
      ) : null}
      {notes.length > 0 ? (
        <Box fontSize='bodySm' fontWeight='medium' lineHeight='ui' color='text.muted'>
          {notes.join('・')}
        </Box>
      ) : null}
      {sum.count > 0 ? (
        <Box>
          <ButtonBox
            type='button'
            onClick={() => openSheet({ kind: 'breakdown' })}
            display='inline-flex'
            alignItems='center'
            gap='2px'
            minH='tapMin'
            color='text.accent'
            fontSize='lg'
            fontWeight='medium'
          >
            多いのは{' '}
            {sum.byCat
              .slice(0, 3)
              .map((x) => categoryName(x.cat))
              .join('・')}
            <Icon name='forward' size='16px' />
          </ButtonBox>
        </Box>
      ) : null}
      {empty ? (
        <Box mt={8} textAlign='center' fontSize='lg' lineHeight='body' color='text.sub'>
          記録タブから、ふたりの家計で払ったものを記録します
        </Box>
      ) : null}
      {/* 金額待ちの行（破線）。見出しは置かない（合計の下の注記が見出しを兼ねる） */}
      {shownPending.length > 0 ? (
        <Box mt={4}>
          {shownPending.map((e) => (
            <ButtonBox
              key={e.id}
              type='button'
              onClick={() => openSheet({ kind: 'fill', id: e.id })}
              display='flex'
              alignItems='center'
              gap='10px'
              w='100%'
              minH='rowMin'
              px={3}
              mb={2}
              border='1.5px dashed'
              borderColor='border.strong'
              borderRadius='control'
              bg='bg.surface'
              textAlign='left'
              _active={{ bg: 'bg.muted' }}
            >
              <Icon name={e.cat} color='text.sub' />
              <Box flex='1' minW='0' fontSize='lg' fontWeight='medium'>
                {templateLabel(e)}
              </Box>
              <Avatar who={e.payer} name={e.payer === 'joint' ? undefined : payerName(d, e.payer)} size='sm' />
              <Box fontSize='md' fontWeight='semibold' color='text.accent' whiteSpace='nowrap'>
                金額を入れる
              </Box>
            </ButtonBox>
          ))}
        </Box>
      ) : null}
      {/* 日付ごとの一覧（新しい日が上。同じ日の中は記録した時刻が新しい順） */}
      {groupByDate(sortByNewest(sum.manual)).map((group) => (
        <Box key={group.date}>
          <DateHeading>{dateLong(group.date)}</DateHeading>
          <Box>{group.rows.map(listRow)}</Box>
        </Box>
      ))}
      {/* 毎月の支払いのまとまり（一覧の最後。件数は出さない） */}
      {sum.fixedRows.length > 0 || sum.deferredOut.length > 0 ? (
        <Box mt={2}>
          <ButtonBox
            type='button'
            aria-expanded={fixedOpen}
            onClick={() => setFixedOpen((v) => !v)}
            position='relative'
            display='flex'
            alignItems='center'
            gap={3}
            w='100%'
            minH='rowMin'
            py={2}
            borderRadius='control'
            textAlign='left'
            _active={{ bg: 'bg.muted' }}
          >
            <Box w='avatar' h='avatar' display='grid' placeItems='center' color='text.sub'>
              <Icon name='fixedCost' />
            </Box>
            <Box flex='1' fontSize='lg' fontWeight='medium'>
              毎月の支払い
            </Box>
            <Box fontSize='lg' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
              {formatNumber(sum.fixedSum)}
            </Box>
            <Icon name={fixedOpen ? 'collapse' : 'expand'} size='16px' color='text.muted' />
          </ButtonBox>
          {fixedOpen ? (
            <Box>
              {sortFixedRows(d, month, sum.fixedRows).map(listRow)}
              {sum.deferredOut.map((e) => (
                <ListRow
                  key={e.id}
                  muted
                  leading={<Box w='avatar' h='avatar' />}
                  title=''
                  memo={`${templateLabel(e)}　${monthShort(e.month)}に回しました`}
                />
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}
      <Box h={4} flex='none' />

      {/* シート（§4.0.3。ルートにはしない） */}
      <MonthPickerSheet
        open={sheet?.kind === 'month'}
        viewMonth={month}
        createdMonth={d.household.createdMonth}
        currentMonth={defaultMonth}
        onPick={(m) => {
          changeMonth(m)
          closeSheet()
        }}
        onClose={closeSheet}
      />
      <BreakdownSheet open={sheet?.kind === 'breakdown'} month={month} summary={sum} onClose={closeSheet} />
      {openExpense !== undefined ? (
        <ExpenseSheet
          key={openExpense.id}
          open
          d={d}
          now={now}
          expense={openExpense}
          mode={expenseSheetMode(d, openExpense, viewer, now)}
          message={message}
          initialDraft={restoreDraft}
          onSave={(draft) => {
            void saveExpense(openExpense, draft, expenseSheetMode(d, openExpense, viewer, now))
          }}
          onEmpty={() => setMessage({ text: '金額を入れてください', tone: 'error' })}
          onDelete={() => {
            void removeExpense(openExpense, expenseSheetMode(d, openExpense, viewer, now))
          }}
          onSkip={() => {
            void skipRow(openExpense)
          }}
          onOpenSettle={() => {
            closeSheet()
            navigate('/settle', { state: { month: openExpense.month } })
          }}
          onClose={(result) => {
            const id = openExpense.id
            setSheet(null)
            setMessage(null)
            if (result.dirty) {
              toast.show({
                text: '入力をやめました',
                onUndo: () => {
                  setRestoreDraft(result.draft)
                  setSheet({ kind: 'expense', id })
                },
              })
            }
          }}
        />
      ) : null}
      {openPending !== undefined ? (
        <FillAmountSheet
          key={openPending.id}
          open
          d={d}
          expense={openPending}
          previousAmount={previousAmountOf(d, openPending)}
          canDefer={canDeferRow(d, openPending, now)}
          progress={null}
          message={message}
          onFill={(amount) => {
            void fillRow(openPending, amount)
          }}
          onEmpty={() => setMessage({ text: '金額を入れてください', tone: 'error' })}
          onDefer={() => {
            void deferRow(openPending)
          }}
          onSkip={() => {
            void skipRow(openPending)
          }}
          onClose={(result) => {
            setSheet(null)
            setMessage(null)
            if (result.dirty) toast.show({ text: '入力をやめました' })
          }}
        />
      ) : null}
    </Box>
  )
}

/** 同じひな形の前の対象月の金額（S-15 の「先月 4,380」） */
function previousAmountOf(d: HouseholdData, e: Expense): number | null {
  const previous = addMonth(e.labelMonth ?? e.month, -1)
  const row = d.expenses.find(
    (x) => x.tpl === e.tpl && (x.labelMonth ?? x.month) === previous && x.amount !== null && !x.skipped
  )
  return row?.amount ?? null
}
