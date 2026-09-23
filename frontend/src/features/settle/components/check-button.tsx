import { Box } from '@chakra-ui/react'
import { TextButton } from '@/components'
import { ButtonBox } from '@/components/primitives'

export type CheckButtonProps = {
  /** 「入れた」／「受け取った」 */
  label: string
  /** 付いているチェックは「✓ 入れた」（灰色の文字。押すと外れる） */
  checked: boolean
  /** 自分のカードの未チェックだけ塗りの青、相手のカードは青い文字（§4 S-20 `transfer`） */
  own: boolean
  /** 付いたチェックの読み上げ名（「入れた 10/2 まさと（押すと外れる）」。§4.0.3） */
  ariaLabel?: string
  onClick: () => void
}

/**
 * 振込のチェック（§4 S-20 `transfer`・`settled`）。
 * 見た目は3つだけ: 塗り（自分の未チェック）／青い文字（相手の未チェック）／灰色の文字と ✓（付いたチェック）。
 * どれも高さ 44px にして、2枚のカードの高さをそろえる。
 * カードを開く操作と入れ子にしないため、カード全体を覆うボタンの**上に重ねる**（外側の箱で重ねる）。
 */
export function CheckButton({ label, checked, own, ariaLabel, onClick }: CheckButtonProps) {
  const labelProps = ariaLabel ? { 'aria-label': ariaLabel } : {}
  return (
    <Box position='relative' zIndex='raised' flex='none'>
      {checked ? (
        <TextButton tone='sub' icon='check' onClick={onClick} aria-pressed={true} {...labelProps}>
          {label}
        </TextButton>
      ) : own ? (
        // 塗りの青。主ボタン（48px）ではなくチェックのボタンなので 44px・幅は文字ぶん（§7.5）
        <ButtonBox
          type='button'
          onClick={onClick}
          aria-pressed={false}
          {...labelProps}
          display='inline-flex'
          alignItems='center'
          justifyContent='center'
          minH='tapMin'
          px={5}
          borderRadius='control'
          bg='bg.accent'
          color='text.onAccent'
          fontSize='lg'
          fontWeight='semibold'
          lineHeight='ui'
          transition='background {durations.fast}'
          _active={{ bg: 'bg.accent.pressed' }}
        >
          {label}
        </ButtonBox>
      ) : (
        <TextButton onClick={onClick} aria-pressed={false} {...labelProps}>
          {label}
        </TextButton>
      )}
    </Box>
  )
}
