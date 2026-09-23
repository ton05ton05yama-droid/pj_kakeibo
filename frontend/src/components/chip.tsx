import { Box } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icon'
import { ButtonBox } from './primitives'

export type ChipProps = {
  children: ReactNode
  onClick?: () => void
  /** 選択中（bg.accent.subtle ＋ text.accent.strong。縁は持たない） */
  selected?: boolean
  /** 前に置くアイコン（カテゴリのチップなど） */
  icon?: IconName
  /** うしろに置くアイコン（カテゴリのチップの ▾） */
  iconEnd?: IconName
  /** 読み上げ名（例「カテゴリを変える（いまは食料品）」） */
  label?: string
}

/** チップ（§7.5）: 高さ 36px（上下の余白と合わせてタップ領域 44px）、角丸 full */
export function Chip({ children, onClick, selected, icon, iconEnd, label }: ChipProps) {
  const inner = (
    <Box
      display='inline-flex'
      alignItems='center'
      gap='6px'
      h='chip'
      px='14px'
      maxW='100%'
      borderRadius='full'
      bg={selected ? 'bg.accent.subtle' : 'bg.muted'}
      color={selected ? 'text.accent.strong' : 'text.sub'}
      fontSize='md'
      fontWeight='medium'
      whiteSpace='nowrap'
      overflow='hidden'
      textOverflow='ellipsis'
    >
      {icon ? <Icon name={icon} size='16px' /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size='16px' /> : null}
    </Box>
  )

  const outer = { display: 'inline-flex', alignItems: 'center', minH: 'tapMin', maxW: '100%' } as const

  if (!onClick) {
    return <Box {...outer}>{inner}</Box>
  }
  return (
    <ButtonBox type='button' onClick={onClick} {...(label ? { 'aria-label': label } : {})} {...outer}>
      {inner}
    </ButtonBox>
  )
}
