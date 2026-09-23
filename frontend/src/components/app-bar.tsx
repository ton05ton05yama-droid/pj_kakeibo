import { Box, Grid } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { formatYearMonth } from '@/lib/format'
import { IconButton } from './buttons'
import { Icon } from './icon'
import { ButtonBox } from './primitives'

const barStyle = {
  position: 'sticky' as const,
  top: '0',
  zIndex: 'sticky',
  h: 'appbar',
  alignItems: 'center',
  ml: 'calc(-1 * var(--pad-l))',
  mr: 'calc(-1 * var(--pad-r))',
  pl: 'calc(var(--pad-l) - 12px)',
  pr: 'calc(var(--pad-r) - 12px)',
  bg: 'bg.page',
  transition: 'background {durations.fast}',
}

export type MonthAppBarProps = {
  year: number
  month: number
  /** 前の月へ（一番古いのは家計を作った月） */
  onPrevMonth: () => void
  /** 次の月へ。今月より先には進めないので、進めないときは › を出さない（P7） */
  onNextMonth: () => void
  /** 年月を押すと S-04（月を選ぶ）が開く */
  onOpenMonthPicker: () => void
  canGoPrev?: boolean
  canGoNext?: boolean
  /** 既定の月以外を見ているときは年月を text.accent にする（§3.4） */
  isDefaultMonth?: boolean
  /** ページを少し送ったら下に 1px の罫線を出す */
  scrolled?: boolean
}

/** 上部バー・月切替（§3.4・§7.5）。置くのは支出と精算だけ */
export function MonthAppBar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onOpenMonthPicker,
  canGoPrev = true,
  canGoNext = true,
  isDefaultMonth = true,
  scrolled,
}: MonthAppBarProps) {
  return (
    <Grid
      {...barStyle}
      gridTemplateColumns='44px 1fr 44px'
      bg={scrolled ? 'bg.surface' : 'bg.page'}
      boxShadow={scrolled ? '0 1px 0 {colors.border}' : undefined}
    >
      {canGoPrev ? <IconButton label='前の月' icon='back' onClick={onPrevMonth} /> : <span />}
      <Box as='h1' justifySelf='center' display='inline-flex' minW='0' fontSize='xl' fontWeight='bold'>
        <ButtonBox
          type='button'
          onClick={onOpenMonthPicker}
          aria-label={`${formatYearMonth(year, month)}（月を選ぶ）`}
          display='inline-flex'
          alignItems='center'
          gap={1}
          minH='tapMin'
          px={2}
          borderRadius='control'
          fontSize='xl'
          fontWeight='bold'
          lineHeight='tight'
          color={isDefaultMonth ? 'text.main' : 'text.accent'}
          _active={{ bg: 'bg.muted' }}
        >
          {formatYearMonth(year, month)}
          <Icon name='expand' size='16px' />
        </ButtonBox>
      </Box>
      {canGoNext ? <IconButton label='次の月' icon='forward' onClick={onNextMonth} /> : <span />}
    </Grid>
  )
}

export type PlainAppBarProps = {
  /** 見出し（S-11・S-30 のタブのトップ） */
  children: ReactNode
  scrolled?: boolean
}

/** 月を持たない画面の上部バー（見出しだけ） */
export function PlainAppBar({ children, scrolled }: PlainAppBarProps) {
  return (
    <Grid
      {...barStyle}
      gridTemplateColumns='44px 1fr 44px'
      bg={scrolled ? 'bg.surface' : 'bg.page'}
      boxShadow={scrolled ? '0 1px 0 {colors.border}' : undefined}
    >
      <span />
      <Box as='h1' justifySelf='center' fontSize='xl' fontWeight='bold' lineHeight='tight'>
        {children}
      </Box>
      <span />
    </Grid>
  )
}

export type BackAppBarProps = {
  /** 戻る先の名前（例「設定」→「‹ 設定」） */
  backLabel: string
  onBack: () => void
  children?: ReactNode
  scrolled?: boolean
}

/** 戻るの付いた上部バー（S-31 の「‹ 設定」） */
export function BackAppBar({ backLabel, onBack, children, scrolled }: BackAppBarProps) {
  return (
    <Grid
      {...barStyle}
      gridTemplateColumns='auto 1fr 44px'
      bg={scrolled ? 'bg.surface' : 'bg.page'}
      boxShadow={scrolled ? '0 1px 0 {colors.border}' : undefined}
    >
      <ButtonBox
        type='button'
        onClick={onBack}
        display='inline-flex'
        alignItems='center'
        gap='2px'
        minH='tapMin'
        pl={1}
        pr={2}
        color='text.accent'
        fontSize='lg'
        fontWeight='semibold'
        borderRadius='control'
        _active={{ bg: 'bg.muted' }}
      >
        <Icon name='back' />
        {backLabel}
      </ButtonBox>
      <Box as='h1' justifySelf='center' fontSize='xl' fontWeight='bold' lineHeight='tight'>
        {children}
      </Box>
      <span />
    </Grid>
  )
}
