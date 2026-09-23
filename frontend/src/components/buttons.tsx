import { Box, chakra } from '@chakra-ui/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icon'

const Base = chakra('button', {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 'control',
    lineHeight: 'ui',
    transition: 'background {durations.fast}',
    _disabled: { cursor: 'default' },
  },
})

type NativeProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'>

export type PrimaryButtonProps = NativeProps & {
  children: ReactNode
  /** 処理中はボタンの中にスピナーを出す（押せなくはしない。P7） */
  loading?: boolean
  /** 既定は横幅いっぱい。シートの下端に2つ並べるときなどは false */
  fullWidth?: boolean
}

/** 主ボタン（§7.5）: 高さ 48px・塗りの青・16px semibold。押せなくしない（P7） */
export function PrimaryButton({ children, loading, fullWidth = true, ...rest }: PrimaryButtonProps) {
  return (
    <Base
      type='button'
      w={fullWidth ? '100%' : 'auto'}
      minH='control'
      px={4}
      bg='bg.accent'
      color='text.onAccent'
      fontSize='lg'
      fontWeight='semibold'
      _active={{ bg: 'bg.accent.pressed' }}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </Base>
  )
}

export type TextButtonTone = 'accent' | 'danger' | 'sub'

export type TextButtonProps = NativeProps & {
  children: ReactNode
  /** accent = 青（既定）、danger = 赤（削除・今月はなし・支払いをやめる）、sub = 灰（やり直す・付いたチェック） */
  tone?: TextButtonTone
  /** 文言の前に置くアイコン（付いたチェックの ✓ など） */
  icon?: IconName
  /** 文言のうしろに置くアイコン（計算を見る ▾ など） */
  iconEnd?: IconName
}

const toneColor: Record<TextButtonTone, string> = {
  accent: 'text.accent',
  danger: 'text.danger',
  sub: 'text.sub',
}

/** 文字のボタン（§7.5）: 高さ 44px・16px semibold */
export function TextButton({ children, tone = 'accent', icon, iconEnd, ...rest }: TextButtonProps) {
  return (
    <Base
      type='button'
      minH='controlSm'
      minW='tapMin'
      px={1}
      gap={1}
      color={toneColor[tone]}
      fontSize='lg'
      fontWeight='semibold'
      _active={{ bg: 'bg.muted' }}
      {...rest}
    >
      {icon ? <Icon name={icon} size='16px' /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size='16px' /> : null}
    </Base>
  )
}

export type IconButtonProps = NativeProps & {
  /** 読み上げ名（§4.0.3 の表。例「前の月」） */
  label: string
  icon: IconName
  iconSize?: string
  color?: string
}

/** アイコンだけのボタン（44×44px のタップ領域） */
export function IconButton({ label, icon, iconSize = 'icon', color = 'text.sub', ...rest }: IconButtonProps) {
  return (
    <Base type='button' w='tapMin' h='tapMin' color={color} aria-label={label} _active={{ bg: 'bg.muted' }} {...rest}>
      <Icon name={icon} size={iconSize} />
    </Base>
  )
}

/** ボタンの中のスピナー（処理中） */
export function Spinner() {
  return (
    <Box
      w='20px'
      h='20px'
      flex='none'
      borderRadius='full'
      border='2px solid currentColor'
      borderRightColor='transparent'
      animation='spin 0.8s linear infinite'
      aria-hidden
    />
  )
}
