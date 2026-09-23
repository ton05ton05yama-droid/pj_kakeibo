import { Box, Flex } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Icon } from './icon'
import { ButtonBox } from './primitives'

export type ListRowProps = {
  /** 左のアバター（28px）など */
  leading?: ReactNode
  /** カテゴリ名など、行の主な文字（16px medium） */
  title: ReactNode
  /** メモ（13px。ハイライト中は自動で text.sub になる） */
  memo?: ReactNode
  /** 右の金額（16px semibold・tabular-nums） */
  amount?: ReactNode
  /** バッジ（未送信・毎月など）。title のうしろに並ぶ */
  badge?: ReactNode
  /** 押せる行にする */
  onClick?: () => void
  /** 行全体を薄くする（今月はなしの行など） */
  muted?: boolean
  /** S-14・S-15 から保存した直後の 1.2秒（§7.5）。記録タブからの保存では付けない（§3.4） */
  highlighted?: boolean
  /** 右端に › を出す */
  showChevron?: boolean
}

/**
 * 一覧の行（§7.5）: 最小の高さ 56px、区切り線は文字の左端（40px）から。
 * 最後の行の区切り線は CSS（:last-child）で消える。
 */
export function ListRow({
  leading,
  title,
  memo,
  amount,
  badge,
  onClick,
  muted,
  highlighted,
  showChevron,
}: ListRowProps) {
  const content = (
    <>
      {leading}
      <Flex flex='1' minW='0' flexWrap='wrap' alignItems='baseline' columnGap={2} rowGap={0}>
        <Box fontSize='lg' fontWeight='medium' lineHeight='ui' color={muted ? 'text.muted' : undefined}>
          {title}
        </Box>
        {memo ? (
          <Box
            fontSize='bodySm'
            fontWeight='medium'
            // ハイライト中（bg.accent.subtle の上）は text.muted が 3.96:1 で届かないので text.sub（§7.1）
            color={highlighted ? 'text.sub' : 'text.muted'}
            minW='0'
            maxW='100%'
            overflow='hidden'
            textOverflow='ellipsis'
            whiteSpace='nowrap'
          >
            {memo}
          </Box>
        ) : null}
        {badge}
      </Flex>
      {amount !== undefined ? (
        <Box
          fontSize='lg'
          fontWeight='semibold'
          textAlign='right'
          whiteSpace='nowrap'
          fontVariantNumeric='tabular-nums'
          color={muted ? 'text.muted' : undefined}
        >
          {amount}
        </Box>
      ) : null}
      {showChevron ? <Icon name='forward' size='16px' color='text.muted' /> : null}
    </>
  )

  const styles = {
    position: 'relative',
    w: '100%',
    minH: 'rowMin',
    alignItems: 'center',
    gap: 3,
    py: 2,
    textAlign: 'left',
    borderRadius: 'control',
    animation: highlighted ? 'rowHighlight 1.2s {easings.out}' : undefined,
    _after: {
      content: '""',
      position: 'absolute',
      left: '40px',
      right: 0,
      bottom: 0,
      borderBottom: '1px solid',
      borderColor: 'border',
    },
    _last: { _after: { display: 'none' } },
    // 動きは止めるが、色だけの変化（保存直後のハイライト）は残す（§7.1）
    css: highlighted
      ? {
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
            background: 'var(--chakra-colors-bg-accent-subtle)',
          },
        }
      : undefined,
  } as const

  if (!onClick) {
    return <Flex {...styles}>{content}</Flex>
  }
  return (
    <ButtonBox type='button' onClick={onClick} display='flex' _active={{ bg: 'bg.muted' }} {...styles}>
      {content}
    </ButtonBox>
  )
}

/** 日付の見出し（§7.5）: 13px semibold、高さ 32px、上部バーの下に貼り付く */
export function DateHeading({ children }: { children: ReactNode }) {
  return (
    <Box
      position='sticky'
      top='var(--appbar-h)'
      zIndex='raised'
      h='offline'
      mt={2}
      ml='calc(-1 * var(--pad-l))'
      mr='calc(-1 * var(--pad-r))'
      pl='var(--pad-l)'
      pr='var(--pad-r)'
      display='flex'
      alignItems='center'
      bg='bg.subtle'
      borderTop='1px solid'
      borderBottom='1px solid'
      borderColor='border'
      fontSize='bodySm'
      fontWeight='semibold'
      color='text.sub'
    >
      {children}
    </Box>
  )
}
