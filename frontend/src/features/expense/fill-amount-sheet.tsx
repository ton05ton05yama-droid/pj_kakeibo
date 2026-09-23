import { Box, Flex } from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnounce } from '@/app/providers'
import {
  AmountDisplay,
  Avatar,
  BottomSheet,
  Icon,
  InlineMessage,
  Keypad,
  PrimaryButton,
  TextButton,
  useAmountInput,
} from '@/components'
import type { Expense, HouseholdData } from '@/domain'
import { formatNumber, formatYenSuffix } from '@/lib/format'
import { paysText, templateLabel } from './text'

/** シートを閉じたときに返すもの（入力があれば「入力をやめました」を出す。§3.7） */
export type FillAmountCloseResult = { dirty: boolean }

export type FillAmountSheetProps = {
  open: boolean
  d: HouseholdData
  /** いま入れている金額待ちの行 */
  expense: Expense
  /** 同じひな形の前の月の金額（「先月 4,380」）。無ければ null */
  previousAmount: number | null
  /** 来月に回せるか（翌月がロックされていないときだけ。`domain/canDefer`） */
  canDefer: boolean
  /** 精算から開いたときの進み具合「1 / 2」。支出から開いたときは null */
  progress: { index: number; total: number } | null
  /** その場の1行（§1.4）。親が「オンラインで直せます」「9月は精算中です…」を渡す */
  message: { text: string; tone: 'error' | 'info' } | null
  /** 金額を入れる（［入れる］／［次へ］） */
  onFill: (amount: number) => void
  /** 金額が 0 のまま押した（その場の1行「金額を入れてください」を出すのは親） */
  onEmpty: () => void
  onDefer: () => void
  onSkip: () => void
  onClose: (result: FillAmountCloseResult) => void
}

/**
 * S-15 金額を入れる（金額待ち）（§4 S-15・§2.3 E1）。
 *
 * 支出の金額待ちの行からも、精算の［金額を入れる］からも**同じ部品・同じ文言**で開く。
 * 違うのは、精算から開いたときだけ「1 / 2」と［次へ］になること。
 * 状態は `empty`（0 のまま押した）／`normal`／`action`（精算から開いたとき）。
 */
export function FillAmountSheet({
  open,
  d,
  expense,
  previousAmount,
  canDefer,
  progress,
  message,
  onFill,
  onEmpty,
  onDefer,
  onSkip,
  onClose,
}: FillAmountSheetProps) {
  const amount = useAmountInput({ keyboard: open })
  const announce = useAnnounce()
  const { reset } = amount

  // 次の金額待ちへ進んだら入力を空に戻す（精算から開いたときは、閉じずに行が変わる）
  const shownRow = useRef(expense.id)
  useEffect(() => {
    if (shownRow.current === expense.id) return
    shownRow.current = expense.id
    reset(null)
  }, [expense.id, reset])

  // 0 のまま押したときも金額を揺らす（§4 S-15 `empty`）
  const [emptyShake, setEmptyShake] = useState(false)
  const shakeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(shakeTimer.current), [])
  const shakeEmpty = useCallback(() => {
    setEmptyShake(true)
    window.clearTimeout(shakeTimer.current)
    shakeTimer.current = window.setTimeout(() => setEmptyShake(false), 320)
  }, [])

  useEffect(() => {
    if (!amount.isEmpty) announce(`金額 ${formatYenSuffix(amount.value)}`)
  }, [amount.isEmpty, amount.value, announce])

  const isLast = progress === null || progress.index === progress.total - 1
  const state = message?.text === '金額を入れてください' ? 'empty' : progress !== null ? 'action' : 'normal'

  const submit = () => {
    if (amount.isEmpty || amount.value === 0) {
      shakeEmpty()
      onEmpty()
      return
    }
    onFill(amount.value)
  }

  return (
    <BottomSheet
      open={open}
      tall
      label={`金額を入れる（${templateLabel(expense)}）`}
      onClose={() => onClose({ dirty: !amount.isEmpty })}
      footer={<PrimaryButton onClick={submit}>{isLast ? '入れる' : '次へ'}</PrimaryButton>}
    >
      <Box data-screen='S-15' data-state={state}>
        {/* 精算から開いたときだけ進み具合を出す */}
        {progress !== null ? (
          <Box fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
            {progress.index + 1} / {progress.total}
          </Box>
        ) : null}
        <Flex as='h2' alignItems='center' gap={2} mt={1} fontSize='xl' fontWeight='bold' lineHeight='tight'>
          <Icon name={expense.cat} />
          {templateLabel(expense)}
        </Flex>
        <Flex alignItems='center' gap='6px' mt={1} fontSize='bodySm' fontWeight='medium' color='text.sub'>
          <Avatar
            who={expense.payer}
            name={expense.payer === 'joint' ? undefined : d.people[expense.payer].name}
            size='sm'
          />
          {paysText(d, expense.payer)}
        </Flex>
        {/* 金額の行: 左は参考「先月 4,380」。その場の1行は、出ているあいだこの参考の代わりに出す（§4.0.3） */}
        <Flex alignItems='center' justifyContent='space-between' gap={2} minH='control'>
          <Box maxW='50%'>
            {message !== null ? (
              <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
            ) : previousAmount !== null ? (
              <Box fontSize='bodySm' fontWeight='medium' lineHeight='ui' color='text.muted'>
                先月 {formatNumber(previousAmount)}
              </Box>
            ) : null}
          </Box>
          <AmountDisplay value={amount.value} muted={amount.isEmpty} shaking={amount.shaking || emptyShake} />
        </Flex>
        <Keypad onKey={amount.press} />
        <Flex justifyContent='space-between' alignItems='center' mt={2}>
          {canDefer ? <TextButton onClick={onDefer}>来月に回す</TextButton> : <span />}
          <TextButton tone='danger' onClick={onSkip}>
            今月はなし
          </TextButton>
        </Flex>
      </Box>
    </BottomSheet>
  )
}
