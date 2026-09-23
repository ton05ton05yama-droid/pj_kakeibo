import { Box, Grid } from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyKey, type KeypadKey, parsePastedAmount } from '@/lib/amount'
import { Icon } from './icon'
import { ButtonBox } from './primitives'

const keys: readonly KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'backspace']

/** キーの読み上げ名（§7.5） */
const keyLabel = (key: KeypadKey): string => (key === 'backspace' ? '1文字消す' : key === '00' ? 'ゼロゼロ' : key)

export type KeypadProps = {
  onKey: (key: KeypadKey) => void
}

/**
 * テンキー（§7.5）: 3列×4行、キーの高さ 48px、間 4px、キーの地 bg.muted、数字 24px medium。
 * 金額の読み上げは、シートの外に置いた共通の読み上げ用の要素（useAnnounce）で行う。
 */
export function Keypad({ onKey }: KeypadProps) {
  return (
    <Grid gridTemplateColumns='repeat(3, 1fr)' gap='4px'>
      {keys.map((key) => (
        <ButtonBox
          type='button'
          key={key}
          aria-label={keyLabel(key)}
          onClick={() => onKey(key)}
          h='keypadKey'
          display='grid'
          placeItems='center'
          borderRadius='control'
          bg='bg.muted'
          color='text.main'
          fontSize='display'
          fontWeight='medium'
          fontVariantNumeric='tabular-nums'
          transition='background {durations.fast}'
          _active={{ bg: 'bg.accent.subtle' }}
        >
          {key === 'backspace' ? <Icon name='backspace' size='24px' /> : key}
        </ButtonBox>
      ))}
    </Grid>
  )
}

export type UseAmountInputOptions = {
  /** 直すときの今の値（円の整数）。空のときは未入力 */
  initial?: number | null
  /** S-21 の手取りは 0 を入れられる */
  allowZero?: boolean
  /** 外付けキーボード（数字・Backspace）と貼り付けを受け付ける。シートが開いているあいだだけ true */
  keyboard?: boolean
}

export type AmountInput = {
  /** 入力中の数字の並び（空文字は未入力） */
  digits: string
  /** 円の整数。未入力は 0 */
  value: number
  isEmpty: boolean
  /** 受け付けない入力の直後だけ true（金額を揺らす） */
  shaking: boolean
  press: (key: KeypadKey) => void
  pasteText: (text: string) => void
  /** 値を入れ直す（次のキーで置き換える状態に戻す） */
  reset: (next?: number | null) => void
}

/**
 * 金額の入力の状態（§7.5 テンキー）。
 * 直すとき（S-14・S-21）は最初のキーで置き換える。7桁まで。
 * 受け付けない値（7桁を超える・小数点・日付・文字）は値を変えず、金額を揺らす。
 */
export function useAmountInput(options: UseAmountInputOptions = {}): AmountInput {
  const { initial = null, allowZero = false, keyboard = false } = options
  const initialDigits = initial == null ? '' : String(initial)
  const [digits, setDigits] = useState(initialDigits)
  // 直すときは最初のキーで置き換える（新しく入れるときは置き換えるものが無い）
  const [replace, setReplace] = useState(initialDigits !== '')
  const [shaking, setShaking] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const shake = useCallback(() => {
    setShaking(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShaking(false), 320)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const press = useCallback(
    (key: KeypadKey) => {
      setDigits((current) => {
        const result = applyKey(current, key, { replace, allowZero })
        if (result.rejected) {
          shake()
          return current
        }
        return result.digits
      })
      setReplace(false)
    },
    [replace, allowZero, shake]
  )

  const pasteText = useCallback(
    (text: string) => {
      const parsed = parsePastedAmount(text)
      if (parsed == null) {
        shake()
        return
      }
      setDigits(parsed.replace(allowZero ? /^0+(?=\d)/ : /^0+/, ''))
      setReplace(false)
    },
    [allowZero, shake]
  )

  const reset = useCallback((next?: number | null) => {
    const value = next == null ? '' : String(next)
    setDigits(value)
    setReplace(value !== '')
  }, [])

  // 外付けキーボードの数字・Backspace・貼り付けも受け付ける（§7.5）
  useEffect(() => {
    if (!keyboard) return
    const isTyping = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        press(event.key as KeypadKey)
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        press('backspace')
      }
    }
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return
      const text = event.clipboardData?.getData('text') ?? ''
      if (!text.trim()) return
      event.preventDefault()
      pasteText(text)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('paste', onPaste)
    }
  }, [keyboard, press, pasteText])

  return {
    digits,
    value: Number(digits || 0),
    isEmpty: digits === '',
    shaking,
    press,
    pasteText,
    reset,
  }
}

export type AmountDisplayProps = {
  /** 入力中の金額（円の整数） */
  value: number
  /** 未入力のときは text.muted の「¥0」 */
  muted?: boolean
  /** 受け付けない入力の直後だけ揺らす */
  shaking?: boolean
}

/** 入力中の金額（§7.3）: 32px bold、`¥` は 0.75em、tabular-nums */
export function AmountDisplay({ value, muted, shaking }: AmountDisplayProps) {
  return (
    <Box
      ml='auto'
      fontSize='4xl'
      fontWeight='bold'
      lineHeight='tight'
      fontVariantNumeric='tabular-nums'
      whiteSpace='nowrap'
      color={muted ? 'text.muted' : undefined}
      animation={shaking ? 'shake 0.32s {easings.out}' : undefined}
    >
      <Box as='span' fontSize='0.75em' mr='2px'>
        ¥
      </Box>
      {new Intl.NumberFormat('ja-JP').format(value)}
    </Box>
  )
}
