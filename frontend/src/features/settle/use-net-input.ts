/**
 * S-21 の手取りの欄ふたつぶんのテンキー入力（§7.5 テンキー）。
 *
 * - 入力先は1つ（欄を押すと移る）。**最初に押したキーで値を置き換える**（直すとき）。
 * - 7桁まで。受け付けない値は値を変えず「揺らす」（切り詰めない）。
 * - 手取りは 0 を入れられる（先頭の 0 は1つ残す）。
 * - 外付けキーボードの数字・Backspace・貼り付けも受け付ける。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PersonKey } from '@/domain'
import { applyKey, type KeypadKey, parsePastedAmount } from '@/lib/amount'

export type NetDigits = Record<PersonKey, string>

export type NetInput = {
  nets: NetDigits
  target: PersonKey
  shaking: boolean
  setTarget: (p: PersonKey) => void
  press: (key: KeypadKey) => void
}

export function useNetInput(initial: NetDigits, viewer: PersonKey, onChange?: (p: PersonKey) => void): NetInput {
  const [nets, setNets] = useState<NetDigits>(initial)
  const [target, setTargetState] = useState<PersonKey>(viewer)
  const [replaced, setReplaced] = useState<Record<PersonKey, boolean>>({ a: false, b: false })
  const [shaking, setShaking] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const shake = useCallback(() => {
    setShaking(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShaking(false), 320)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const setTarget = useCallback((p: PersonKey) => setTargetState(p), [])

  const press = useCallback(
    (key: KeypadKey) => {
      setNets((current) => {
        const result = applyKey(current[target], key, { replace: !replaced[target], allowZero: true })
        if (result.rejected) {
          shake()
          return current
        }
        return { ...current, [target]: result.digits }
      })
      setReplaced((current) => ({ ...current, [target]: true }))
      onChange?.(target)
    },
    [target, replaced, shake, onChange]
  )

  const paste = useCallback(
    (text: string) => {
      const parsed = parsePastedAmount(text)
      if (parsed == null) {
        shake()
        return
      }
      setNets((current) => ({ ...current, [target]: parsed.replace(/^0+(?=\d)/, '') }))
      setReplaced((current) => ({ ...current, [target]: true }))
      onChange?.(target)
    },
    [target, shake, onChange]
  )

  useEffect(() => {
    const isTyping = (node: EventTarget | null): boolean =>
      node instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)

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
      paste(text)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('paste', onPaste)
    }
  }, [press, paste])

  return { nets, target, shaking, setTarget, press }
}
