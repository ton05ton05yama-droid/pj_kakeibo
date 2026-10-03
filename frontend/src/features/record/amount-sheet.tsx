/**
 * S-12 記録（いくら？）— 記録タブ（S-11）のカテゴリから開く「高い」シート。
 *
 * 正本: docs/03_ui_spec.md §4 S-12、mock/index.html の `SHEETS['S-12']`。
 * 要素（上から）: つまみ ／ ‹ カテゴリ名・メモ ／ 金額の行 ／ テンキー（メモのときは1行の入力欄）／
 * 日付［今日｜昨日｜ほかの日］／「払った人」＋［まさと｜りさこ｜共用］／［記録する］。
 * 状態: `empty`（¥0 のまま押した）・`normal`・`action`（金額待ちの注記・ロックの案内）・`done`（閉じてトースト）。
 */
import { Box, Flex } from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnounce } from '@/app/providers'
import {
  AmountDisplay,
  Avatar,
  BottomSheet,
  Chip,
  DatePickerOverlay,
  Icon,
  type IconName,
  InlineMessage,
  type InlineMessageTone,
  Keypad,
  openDatePicker,
  PrimaryButton,
  Segmented,
  useAmountInput,
} from '@/components'
import { ButtonBox, InputBox, LabelBox } from '@/components/primitives'
import type { DateKey, HouseholdData, Payer, Person, PersonKey } from '@/domain'
import { categoryName, monthOf, PERSON_KEYS } from '@/domain'
import { formatYenSuffix } from '@/lib/format'
import { choiceForDate, type DateChoice, formatDateWithWeekday, resolveDate } from './date'
import type { RecordDraft } from './draft'
import { isDirty } from './draft'
import { payerName } from './messages'
import { hasPendingHint } from './pending-hint'

/** メモのチップは8字で切る（§4 S-12 の要素2） */
function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}

export type SheetMessage = { text: string; tone: InlineMessageTone }

export type SubmitResult = { ok: true } | { ok: false; message: SheetMessage }

export type AmountSheetProps = {
  /** 開いたときの値（「入力をやめました」の元に戻すで、入力のまま開き直すときは、そのときの値） */
  initial: RecordDraft
  data: HouseholdData
  people: Record<PersonKey, Person>
  /** 「今日」（サーバーの日付。02 §10 C10） */
  today: DateKey
  now: string
  /** 保存する。止まったときは、その場の1行に出す文言を返す */
  onSubmit: (draft: RecordDraft, date: DateKey) => Promise<SubmitResult>
  /** 閉じる。入力があったときだけ、そのときの値を渡す（「入力をやめました」のため。§3.7） */
  onClose: (unsaved: RecordDraft | null) => void
}

export function AmountSheet({ initial, data, people, today, now, onSubmit, onClose }: AmountSheetProps) {
  const [memo, setMemo] = useState(initial.memo)
  const [memoMode, setMemoMode] = useState(false)
  const [dateChoice, setDateChoice] = useState<DateChoice>(initial.dateChoice)
  const [otherDate, setOtherDate] = useState<DateKey | null>(initial.otherDate)
  const [payer, setPayer] = useState<Payer>(initial.payer)
  const [message, setMessage] = useState<SheetMessage | null>(null)
  /** 金額を入れずに押したときも金額を揺らす（§4 S-12 `empty`） */
  const [errorShake, setErrorShake] = useState(false)
  const [saving, setSaving] = useState(false)

  const amount = useAmountInput({ keyboard: true })
  const announce = useAnnounce()
  const memoRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const shakeTimer = useRef<number | undefined>(undefined)
  const blurTimer = useRef<number | undefined>(undefined)
  const restored = useRef(false)
  const announcePending = useRef(false)

  // 入力のまま開き直したときは、そのときの金額に戻す（貼り付けと同じ扱いなので、続けて数字を足せる）
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (initial.digits !== '') amount.pasteText(initial.digits)
  }, [initial.digits, amount.pasteText])

  // 金額は、シートの外に置いた共通の読み上げ用の要素の中身だけを入力のたびに更新する（§7.5）
  useEffect(() => {
    if (!announcePending.current) return
    announcePending.current = false
    announce(`金額 ${formatYenSuffix(amount.value)}`)
  }, [amount.value, announce])

  useEffect(
    () => () => {
      window.clearTimeout(shakeTimer.current)
      window.clearTimeout(blurTimer.current)
    },
    []
  )

  // メモのチップを押したら、テンキーの場所が1行の入力欄になり、端末のキーボードが開く
  useEffect(() => {
    if (memoMode) memoRef.current?.focus()
  }, [memoMode])

  const cat = initial.cat
  const date = resolveDate(dateChoice, otherDate, today)
  const current: RecordDraft = { cat, digits: amount.digits, memo, dateChoice, otherDate, payer }
  const dirty = isDirty(current, initial)

  // 注記は、これから保存する月（選んでいる日付の月。既定は今日）の金額待ちに、選んだカテゴリの行があるとき
  const hint = hasPendingHint(data, monthOf(date), cat, now)
  const state =
    message === null ? (hint ? 'action' : 'normal') : message.text === '金額を入れてください' ? 'empty' : 'action'

  const shake = useCallback(() => {
    setErrorShake(true)
    window.clearTimeout(shakeTimer.current)
    shakeTimer.current = window.setTimeout(() => setErrorShake(false), 320)
  }, [])

  const press = (key: Parameters<typeof amount.press>[0]) => {
    // キーを押したら、その場の1行は種類に関係なく消す（§4.0.3）
    setMessage(null)
    announcePending.current = true
    amount.press(key)
  }

  const chooseDate = (next: DateChoice) => {
    if (next === 'other') {
      openDatePicker(dateRef.current)
      return
    }
    setDateChoice(next)
    setMessage(null)
  }

  const onPickedDate = (value: string) => {
    setOtherDate(value)
    setDateChoice(choiceForDate(value, today))
    setMessage(null)
  }

  // 日付選択の「リセット」は今日に戻す（カレンダーも今日を指すので、見た目とそろう。§12.1 Q28）
  const onResetDate = () => {
    setOtherDate(null)
    setDateChoice('today')
    setMessage(null)
  }

  const save = async () => {
    if (amount.value === 0) {
      setMessage({ text: '金額を入れてください', tone: 'error' })
      shake()
      return
    }
    setSaving(true)
    const result = await onSubmit(current, date)
    setSaving(false)
    if (!result.ok) setMessage(result.message)
  }

  const close = () => onClose(dirty ? current : null)

  const catIcon = cat as IconName
  const catLabel = categoryName(cat)

  return (
    <BottomSheet
      open
      tall
      adjustForKeyboard={memoMode}
      label={`いくら？（${catLabel}）`}
      onClose={close}
      footer={
        <Box mt='4px'>
          <PrimaryButton onClick={save} loading={saving}>
            記録する
          </PrimaryButton>
        </Box>
      }
    >
      <Box data-screen='S-12' data-state={state}>
        {/* 見出しの行: ‹ カテゴリ名（押すと記録タブのカテゴリに戻る）と、メモのチップ */}
        <Flex alignItems='center' justifyContent='space-between' gap={2} minH='tapMin'>
          <ButtonBox
            type='button'
            onClick={close}
            aria-label={`カテゴリを選び直す（いまは${catLabel}。押すとカテゴリに戻る）`}
            display='inline-flex'
            alignItems='center'
            gap='2px'
            minH='tapMin'
            pl={1}
            pr={2}
            borderRadius='control'
            color='text.accent'
            fontSize='lg'
            fontWeight='semibold'
            _active={{ bg: 'bg.muted' }}
          >
            <Icon name='back' />
            <Icon name={catIcon} />
            <Box as='span' color='text.main'>
              {catLabel}
            </Box>
          </ButtonBox>
          <Chip onClick={() => setMemoMode(true)} selected={memo !== ''} label={memo === '' ? 'メモ' : `メモ: ${memo}`}>
            {memo === '' ? 'メモ' : `メモ: ${truncate(memo, 8)}`}
          </Chip>
        </Flex>

        {/* 金額の行: 右に金額、左は条件つきの注記か、その場の1行（出ているあいだは注記の代わり。§4.0.3） */}
        <Flex alignItems='center' justifyContent='space-between' gap={2} minH='48px'>
          {message !== null ? (
            <Box maxW='50%'>
              <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
            </Box>
          ) : hint ? (
            <Box maxW='50%' fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
              金額待ちは支出タブの上から入れます
            </Box>
          ) : null}
          <AmountDisplay value={amount.value} muted={amount.isEmpty} shaking={amount.shaking || errorShake} />
        </Flex>

        {memoMode ? (
          <Box my={2}>
            <LabelBox
              htmlFor='record-memo'
              position='absolute'
              w='1px'
              h='1px'
              overflow='hidden'
              whiteSpace='nowrap'
              clipPath='inset(50%)'
            >
              メモ
            </LabelBox>
            <InputBox
              ref={memoRef}
              id='record-memo'
              value={memo}
              maxLength={30}
              placeholder='メモ（30字まで）'
              autoComplete='off'
              enterKeyHint='done'
              onChange={(event) => setMemo(event.currentTarget.value)}
              onBlur={() => {
                // キーボードを閉じたらテンキーに戻る（押したボタンの click を妨げないよう少し遅らせる）
                window.clearTimeout(blurTimer.current)
                blurTimer.current = window.setTimeout(() => setMemoMode(false), 200)
              }}
              h='control'
              w='100%'
              px={3}
              borderRadius='control'
              bg='bg.input'
              border='1px solid'
              borderColor='border.strong'
              color='text.main'
              fontSize='input'
              fontWeight='medium'
              css={{ '&::placeholder': { color: 'text.placeholder' } }}
              _focus={{
                outline: '2px solid',
                outlineColor: 'focusRing',
                outlineOffset: '0',
                borderColor: 'transparent',
              }}
            />
          </Box>
        ) : (
          <Keypad onKey={press} />
        )}

        {/* 日付［今日｜昨日｜ほかの日］。「ほかの日」は端末の日付選択（指で押したときは、マスに重ねた欄が直接受ける） */}
        <Box position='relative' mt={2}>
          <Segmented<DateChoice>
            label='日付'
            value={dateChoice}
            onChange={chooseDate}
            items={[
              { value: 'today', label: '今日' },
              { value: 'yesterday', label: '昨日' },
              {
                value: 'other',
                label: dateChoice === 'other' && otherDate !== null ? formatDateWithWeekday(otherDate) : 'ほかの日',
              },
            ]}
          />
          <DatePickerOverlay
            ref={dateRef}
            value={otherDate ?? ''}
            min={`${data.household.createdMonth}-01`}
            max={today}
            onChange={onPickedDate}
            onReset={onResetDate}
          />
        </Box>

        {/* 払った人。既定は設定（S-30）で決めた値。ここでその1件だけ別の人に変えられる */}
        <Box mt={2}>
          <Box fontSize='sm' fontWeight='semibold' color='text.sub' lineHeight='22px'>
            払った人
          </Box>
          <Segmented<Payer>
            dense
            label='払った人'
            value={payer}
            onChange={setPayer}
            items={[...PERSON_KEYS, 'joint' as const].map((who) => ({
              value: who,
              label: payerName(who, people),
              leading: payerAvatar(who, people),
            }))}
          />
        </Box>
      </Box>
    </BottomSheet>
  )
}

/** セグメントの中の 20px のアバター（色は人に割り当てる。§7.2） */
function payerAvatar(who: Payer, people: Record<PersonKey, Person>) {
  if (who === 'joint') return <Avatar who='joint' size='sm' />
  return <Avatar who={people[who].color} name={people[who].name} size='sm' />
}
