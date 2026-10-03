import { type Ref, useCallback, useLayoutEffect, useRef } from 'react'
import { InputBox } from './primitives'

/**
 * 端末の日付選択を開く。`showPicker()` が無い・断られたときは focus に任せる。
 *
 * iPhone の Safari は、見えない欄に `showPicker()`・`focus()` しても開かないことがある。
 * 指で押したときは `DatePickerOverlay` が直接受けるので、ここを通るのはキーボード・読み上げから押したときだけ。
 */
export function openDatePicker(input: HTMLInputElement | null): void {
  if (input === null) return
  try {
    input.showPicker()
  } catch {
    input.focus()
  }
}

export type DatePickerOverlayProps = {
  ref?: Ref<HTMLInputElement>
  id?: string
  value: string
  min: string
  max: string
  onChange: (value: string) => void
  /** 欄を押したとき（日付選択が開く前） */
  onOpen?: () => void
  /** 日付選択の「リセット」（欄が空になる）。今日に戻す（§4 S-12 の要素5。§12.1 Q28） */
  onReset: () => void
}

/**
 * 日付のセグメント［今日｜昨日｜ほかの日］の「ほかの日」のマスに重ねる、見えない日付の欄（§4 S-12 の要素5）。
 *
 * 指で押したときに、ボタンではなくこの欄そのものが押されるようにする。
 * iPhone の Safari で日付選択を確実に開けるのは、利用者が欄を直接押したときだけのため。
 * 置き場所は `position: relative` を付けたセグメントの親（3マス・すき間 2px。§7.5）。
 */
export function DatePickerOverlay({ ref, id, value, min, max, onChange, onOpen, onReset }: DatePickerOverlayProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  // 値は value 属性を書かずに中身だけ入れる（React の value にしない）。
  // iPhone の「リセット」は value 属性の日に戻すので、属性に選んだ日が入っていると、リセットしても何も変わらない
  useLayoutEffect(() => {
    const input = inputRef.current
    if (input !== null && input.value !== value) input.value = value
  })

  return (
    <InputBox
      ref={setRef}
      id={id}
      type='date'
      tabIndex={-1}
      aria-hidden='true'
      min={min}
      max={max}
      onClick={(event) => {
        onOpen?.()
        // Android・パソコンのブラウザは、欄を押しただけでは開かないことがあるので開きに行く
        openDatePicker(event.currentTarget)
      }}
      onChange={(event) => {
        const input = event.currentTarget
        const next = input.value
        if (next === '') {
          onReset()
          return
        }
        // iPhone の日付選択は min・max を守らず、先の日も選べてしまうので、範囲の外は受けない（欄も元に戻す）
        if (next < min || next > max) {
          input.value = value
          return
        }
        onChange(next)
      }}
      position='absolute'
      top='0'
      right='0'
      w='calc((100% - 4px) / 3)'
      h='100%'
      minW='0'
      m='0'
      p='0'
      border='0'
      borderRadius='full'
      opacity='0'
      cursor='pointer'
      // 16px 未満だと、iPhone の Safari は欄を押したときに画面を拡大する
      fontSize='16px'
      css={{ appearance: 'none', WebkitAppearance: 'none' }}
    />
  )
}
