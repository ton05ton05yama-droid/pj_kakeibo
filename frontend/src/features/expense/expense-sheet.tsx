import { Box, Flex } from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnounce } from '@/app/providers'
import {
  AmountDisplay,
  Avatar,
  BottomSheet,
  CategoryGrid,
  Chip,
  Icon,
  InlineMessage,
  Keypad,
  PrimaryButton,
  Segmented,
  type SegmentedItem,
  TextButton,
  useAmountInput,
} from '@/components'
import { InputBox, LabelBox } from '@/components/primitives'
import {
  CATEGORIES,
  type CategoryKey,
  categoryName,
  type DateKey,
  type DateTimeKey,
  type Expense,
  type HouseholdData,
  isLockedStatus,
  monthStatus,
  type Payer,
  type PersonKey,
} from '@/domain'
import { formatNumber, formatYen, formatYenSuffix } from '@/lib/format'
import {
  dateLong,
  dateShortWeek,
  hourMinute,
  lockedViewText,
  monthDay,
  paidByText,
  payerName,
  recordedByName,
  rowName,
  templateLabel,
  truncate,
  unsentNote,
} from './text'

/** S-14 の5つの形（§4 S-14） */
export type ExpenseSheetMode = 'own' | 'partner' | 'fixed' | 'locked' | 'unsent'

/** シートの中の入力（閉じたときの「入力をやめました　元に戻す」で、そのまま開き直せるように持つ） */
export type ExpenseDraft = {
  /** 入力中の金額（数字の並び。空文字は未入力） */
  digits: string
  cat: CategoryKey
  memo: string
  payer: Payer
  dateSel: 'today' | 'yesterday' | 'other'
  otherDate: DateKey
}

export type ExpenseSheetCloseResult = { dirty: boolean; draft: ExpenseDraft }

/** 日付を1日ずらす（JST の文字列のまま） */
export function addDays(date: DateKey, k: number): DateKey {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + k))
  return d.toISOString().slice(0, 10)
}

/** 記録の種類と月の状態から S-14 の形を決める（§4 S-14） */
export function expenseSheetMode(d: HouseholdData, e: Expense, viewer: PersonKey, now: DateTimeKey): ExpenseSheetMode {
  if (e.sync === 'failed') return 'unsent'
  if (isLockedStatus(monthStatus(d, e.month, now))) return 'locked'
  if (e.tpl !== null) return 'fixed'
  return e.by === viewer ? 'own' : 'partner'
}

/** 記録から入力の初期値を作る */
export function draftFromExpense(e: Expense, today: DateKey): ExpenseDraft {
  const dateSel = e.date === today ? 'today' : e.date === addDays(today, -1) ? 'yesterday' : 'other'
  return {
    digits: e.amount === null ? '' : String(e.amount),
    cat: e.cat,
    memo: e.memo,
    payer: e.payer,
    dateSel,
    otherDate: e.date,
  }
}

/** 入力から日付を決める（§4 S-12 の［今日｜昨日｜ほかの日］） */
export const draftDate = (draft: ExpenseDraft, today: DateKey): DateKey =>
  draft.dateSel === 'today' ? today : draft.dateSel === 'yesterday' ? addDays(today, -1) : draft.otherDate

/** シートの読み上げ名（§4.0.3 の表） */
function sheetLabel(e: Expense): string {
  const amount = e.skipped ? '今月はなし' : e.amount === null ? '金額待ち' : `${formatNumber(e.amount)}円`
  return `記録（${categoryName(e.cat)} ${amount}）`
}

export type ExpenseSheetProps = {
  open: boolean
  d: HouseholdData
  now: DateTimeKey
  expense: Expense
  mode: ExpenseSheetMode
  /** その場の1行（§1.4）。置き場所は金額の行の左（注記の代わり） */
  message: { text: string; tone: 'error' | 'info' } | null
  /** 「入力をやめました」の元に戻すで開き直すときの入力 */
  initialDraft?: ExpenseDraft | null
  onSave: (draft: ExpenseDraft) => void
  /** 金額が 0 のまま保存した */
  onEmpty: () => void
  onDelete: () => void
  /** 今月はなし（`fixed`） */
  onSkip: () => void
  /** ［精算を開く］（`locked`。§2.3 E3） */
  onOpenSettle: () => void
  onClose: (result: ExpenseSheetCloseResult) => void
}

/**
 * S-14 記録を見る・直す（§4 S-14）。
 *
 * 記録の種類と月の状態で5つの形に分かれる:
 * `own`（自分の記録）／`partner`（相手の記録・見るだけ）／`fixed`（毎月の支払いの行・2人とも直せる）／
 * `locked`（精算中・精算済みの月・見るだけ）／`unsent`（送れなかった記録）。
 */
export function ExpenseSheet(props: ExpenseSheetProps) {
  const { open, d, now, expense, mode, onClose } = props
  const today = now.slice(0, 10)
  const initial = props.initialDraft ?? draftFromExpense(expense, today)
  const base = useRef(draftFromExpense(expense, today))
  const [draft, setDraft] = useState<ExpenseDraft>(initial)
  const [grid, setGrid] = useState(false)
  const [memoMode, setMemoMode] = useState(false)
  const amount = useAmountInput({ initial: expense.amount, keyboard: open && !memoMode })
  const announce = useAnnounce()
  const { reset } = amount
  const [emptyShake, setEmptyShake] = useState(false)
  const shakeTimer = useRef<number | undefined>(undefined)
  const memoRef = useRef<HTMLInputElement>(null)

  // メモのチップを押したら、その欄へフォーカスを移す（端末のキーボードが開く）
  useEffect(() => {
    if (memoMode) memoRef.current?.focus()
  }, [memoMode])

  // 開き直したとき（「入力をやめました」の元に戻す）は、入力のまま戻す
  const initialDigits = initial.digits
  useEffect(() => {
    reset(initialDigits === '' ? null : Number(initialDigits))
  }, [reset, initialDigits])

  useEffect(() => () => window.clearTimeout(shakeTimer.current), [])

  useEffect(() => {
    if (!amount.isEmpty) announce(`金額 ${formatYenSuffix(amount.value)}`)
  }, [amount.isEmpty, amount.value, announce])

  const shakeEmpty = useCallback(() => {
    setEmptyShake(true)
    window.clearTimeout(shakeTimer.current)
    shakeTimer.current = window.setTimeout(() => setEmptyShake(false), 320)
  }, [])

  const current: ExpenseDraft = { ...draft, digits: amount.digits }
  const dirty =
    current.digits !== base.current.digits ||
    current.cat !== base.current.cat ||
    current.memo !== base.current.memo ||
    current.payer !== base.current.payer ||
    draftDate(current, today) !== expense.date

  const close = () => onClose({ dirty, draft: current })

  if (mode === 'partner' || mode === 'locked') {
    return (
      <ReadOnlyView
        open={open}
        d={d}
        now={now}
        expense={expense}
        mode={mode}
        onOpenSettle={props.onOpenSettle}
        onClose={close}
      />
    )
  }

  const save = () => {
    if (amount.isEmpty || amount.value === 0) {
      shakeEmpty()
      props.onEmpty()
      return
    }
    props.onSave(current)
  }

  // カテゴリを選び直す（シートの中身がグリッドに切り替わる。選ぶと戻る）
  if (grid) {
    return (
      <BottomSheet open={open} tall label={sheetLabel(expense)} onClose={close}>
        <Box data-screen='S-14' data-state={mode}>
          <Box as='h2' mt={1} mb={3} fontSize='xl' fontWeight='bold' lineHeight='tight'>
            何に払った？
          </Box>
          <CategoryGrid
            items={CATEGORIES.map((c) => ({ key: c.key, label: c.name, icon: c.key }))}
            selectedKey={draft.cat}
            onSelect={(key) => {
              setDraft((prev) => ({ ...prev, cat: key as CategoryKey }))
              setGrid(false)
            }}
          />
        </Box>
      </BottomSheet>
    )
  }

  const note =
    mode === 'unsent'
      ? unsentNote(monthStatus(d, expense.month, now), expense.month)
      : mode === 'fixed'
        ? `毎月の支払いから・変わるのは今月の分だけ${
            expense.amountBy !== null && expense.amountAt !== null
              ? `・金額: ${d.people[expense.amountBy].name} ${monthDay(expense.amountAt)}`
              : ''
          }`
        : `記録 ${monthDay(expense.at)} ${hourMinute(expense.at)}${
            expense.editedAt !== null ? `・直した ${monthDay(expense.editedAt)} ${hourMinute(expense.editedAt)}` : ''
          }`

  const amountRow = (
    <Flex alignItems='center' justifyContent='space-between' gap={2} minH='control'>
      <Box maxW='50%'>
        {props.message !== null ? (
          <InlineMessage tone={props.message.tone}>{props.message.text}</InlineMessage>
        ) : (
          <Box fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
            {note}
          </Box>
        )}
      </Box>
      <AmountDisplay value={amount.value} muted={amount.isEmpty} shaking={amount.shaking || emptyShake} />
    </Flex>
  )

  const payerItems: readonly SegmentedItem<Payer>[] = [
    { value: 'a', label: d.people.a.name, leading: <Avatar who='a' name={d.people.a.name} size='sm' /> },
    { value: 'b', label: d.people.b.name, leading: <Avatar who='b' name={d.people.b.name} size='sm' /> },
    { value: 'joint', label: '共用', leading: <Avatar who='joint' size='sm' /> },
  ]
  const payerSegment = (
    <Box mt={2}>
      <Box fontSize='sm' fontWeight='semibold' color='text.sub' lineHeight='22px'>
        払った人
      </Box>
      <Segmented
        dense
        label='払った人'
        items={payerItems}
        value={draft.payer}
        onChange={(payer) => setDraft((prev) => ({ ...prev, payer }))}
      />
    </Box>
  )

  // 毎月の支払いから作られた行（2人とも直せる。カテゴリはひな形のまま）
  if (mode === 'fixed') {
    return (
      <BottomSheet
        open={open}
        tall
        label={sheetLabel(expense)}
        onClose={close}
        footer={
          /* 上の［払った人］との間を空ける（12px。§4 S-14 `fixed` の縦の寸法） */
          <Flex alignItems='center' justifyContent='space-between' gap={3} mt={3}>
            <TextButton tone='danger' onClick={props.onSkip}>
              今月はなし
            </TextButton>
            <PrimaryButton fullWidth={false} onClick={save} style={{ flex: 1, maxWidth: '200px' }}>
              保存
            </PrimaryButton>
          </Flex>
        }
      >
        <Box data-screen='S-14' data-state='fixed'>
          <Flex as='h2' alignItems='center' gap={2} mt={1} fontSize='xl' fontWeight='bold' lineHeight='tight'>
            <Icon name={expense.cat} />
            {templateLabel(expense)}
          </Flex>
          {amountRow}
          <Keypad onKey={amount.press} />
          {payerSegment}
        </Box>
      </BottomSheet>
    )
  }

  // own・unsent
  const otherLabel = draft.dateSel === 'other' ? dateShortWeek(draft.otherDate) : 'ほかの日'
  return (
    <BottomSheet
      open={open}
      tall
      adjustForKeyboard={memoMode}
      label={sheetLabel(expense)}
      onClose={close}
      footer={
        /* 上の［払った人］との間を空ける（4px。§4 S-14 `own` の縦の寸法 518px） */
        <Flex alignItems='center' justifyContent='space-between' gap={3} mt={1}>
          <TextButton tone='danger' onClick={props.onDelete}>
            削除
          </TextButton>
          <PrimaryButton fullWidth={false} onClick={save} style={{ flex: 1, maxWidth: '200px' }}>
            保存
          </PrimaryButton>
        </Flex>
      }
    >
      <Box data-screen='S-14' data-state={mode}>
        <Flex alignItems='center' justifyContent='space-between' gap={2} minH='tapMin'>
          <Chip
            icon={draft.cat}
            iconEnd='expand'
            label={`カテゴリを変える（いまは${categoryName(draft.cat)}）`}
            onClick={() => setGrid(true)}
          >
            {categoryName(draft.cat)}
          </Chip>
          <Chip
            selected={draft.memo !== ''}
            label={`メモ${draft.memo !== '' ? `: ${draft.memo}` : ''}`}
            onClick={() => setMemoMode(true)}
          >
            {draft.memo !== '' ? `メモ: ${truncate(draft.memo, 8)}` : 'メモ'}
          </Chip>
        </Flex>
        {amountRow}
        {memoMode ? (
          <Box>
            <LabelBox
              htmlFor='expense-memo'
              position='absolute'
              w='1px'
              h='1px'
              overflow='hidden'
              clipPath='inset(50%)'
            >
              メモ
            </LabelBox>
            <InputBox
              id='expense-memo'
              ref={memoRef}
              maxLength={30}
              enterKeyHint='done'
              autoComplete='off'
              placeholder='メモ（30字まで）'
              value={draft.memo}
              onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
              onBlur={() => setMemoMode(false)}
              h='control'
              w='100%'
              px={3}
              borderRadius='control'
              bg='bg.input'
              border='1px solid'
              borderColor='border.strong'
              fontSize='input'
              fontWeight='medium'
            />
          </Box>
        ) : (
          <Keypad onKey={amount.press} />
        )}
        <Box mt={2} position='relative'>
          <Segmented
            label='日付'
            items={[
              { value: 'today', label: '今日' },
              { value: 'yesterday', label: '昨日' },
              { value: 'other', label: otherLabel },
            ]}
            value={draft.dateSel}
            onChange={(value) => {
              if (value === 'other') {
                const input = document.getElementById('expense-date')
                if (input instanceof HTMLInputElement) {
                  try {
                    input.showPicker()
                  } catch {
                    input.focus()
                  }
                }
                setDraft((prev) => ({ ...prev, dateSel: 'other' }))
                return
              }
              setDraft((prev) => ({ ...prev, dateSel: value }))
            }}
          />
          {/* 端末の日付選択（見た目は出さない。セグメントの「ほかの日」から開く） */}
          <InputBox
            type='date'
            id='expense-date'
            tabIndex={-1}
            aria-hidden
            min={`${d.household.createdMonth}-01`}
            max={today}
            value={draft.otherDate}
            onChange={(event) => setDraft((prev) => ({ ...prev, dateSel: 'other', otherDate: event.target.value }))}
            position='absolute'
            right='0'
            bottom='0'
            w='1px'
            h='1px'
            opacity='0'
            pointerEvents='none'
          />
        </Box>
        {payerSegment}
      </Box>
    </BottomSheet>
  )
}

type ReadOnlyViewProps = {
  open: boolean
  d: HouseholdData
  now: DateTimeKey
  expense: Expense
  mode: 'partner' | 'locked'
  onOpenSettle: () => void
  onClose: () => void
}

/**
 * S-14 `partner`（相手の記録）・`locked`（精算中・精算済みの月の記録）: 見るだけ。
 * 最後の1文は開いた時から出す固定の1文（§1.4 のその場の1行ではない）。
 */
function ReadOnlyView({ open, d, now, expense, mode, onOpenSettle, onClose }: ReadOnlyViewProps) {
  const amount = expense.skipped ? '今月はなし' : expense.amount === null ? '金額待ち' : formatYen(expense.amount)
  const note =
    expense.tpl !== null
      ? `毎月の支払いから${
          expense.amountBy !== null && expense.amountAt !== null
            ? `・金額: ${d.people[expense.amountBy].name} ${monthDay(expense.amountAt)}`
            : ''
        }`
      : `記録: ${recordedByName(d, expense)} ${monthDay(expense.at)} ${hourMinute(expense.at)}${
          expense.editedAt !== null ? `・直した ${monthDay(expense.editedAt)} ${hourMinute(expense.editedAt)}` : ''
        }`
  const memo = rowName(d, expense)
  return (
    <BottomSheet open={open} label={sheetLabel(expense)} onClose={onClose}>
      <Box data-screen='S-14' data-state={mode}>
        <Box mt={1} fontSize='3xl' fontWeight='bold' lineHeight='tight' fontVariantNumeric='tabular-nums'>
          {amount}
        </Box>
        <Flex alignItems='center' gap={2} mt={2} fontSize='lg' fontWeight='medium'>
          <Icon name={expense.cat} />
          {categoryName(expense.cat)}
        </Flex>
        <Flex alignItems='center' gap={2} mt={1} fontSize='lg'>
          <Avatar
            who={expense.payer}
            name={expense.payer === 'joint' ? undefined : payerName(d, expense.payer)}
            size='sm'
          />
          {paidByText(d, expense.payer)}
        </Flex>
        <Box mt={1} fontSize='lg'>
          {dateLong(expense.date)}
        </Box>
        {memo !== '' ? (
          <Box mt={1} fontSize='lg' color='text.sub'>
            {memo}
          </Box>
        ) : null}
        <Box as='hr' my={3} borderTop='1px solid' borderColor='border' />
        <Box fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
          {note}
        </Box>
        <Box mt={2} fontSize='bodySm' fontWeight='medium' lineHeight='ui' color='text.sub'>
          {mode === 'partner'
            ? '直せるのは記録した人だけです'
            : lockedViewText(monthStatus(d, expense.month, now), expense.month)}
        </Box>
        {mode === 'locked' ? (
          <Box mt={1}>
            <TextButton onClick={onOpenSettle}>精算を開く</TextButton>
          </Box>
        ) : null}
      </Box>
    </BottomSheet>
  )
}
