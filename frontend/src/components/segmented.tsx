import { Box, Flex } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { ButtonBox } from './primitives'

export type SegmentedItem<T extends string> = {
  value: T
  label: string
  /** 払った人のセグメントで、ラベルの前に置くアバター（20px） */
  leading?: ReactNode
}

export type SegmentedProps<T extends string> = {
  items: readonly SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  /** 読み上げ名（例「払った人」「日付」） */
  label: string
  /** 払った人のセグメント（アバター入り）は余白を詰める */
  dense?: boolean
}

/**
 * セグメント（§7.5）: 地は bg.muted、角丸 full、高さ 44px。
 * 選択中は bg.accent.subtle の地に 1px の text.accent の縁、文字は text.accent.strong 600。
 * 選ぶとその場で保存する使い方（S-30）でも確認ダイアログは出さない（P6）。
 */
export function Segmented<T extends string>({ items, value, onChange, label, dense }: SegmentedProps<T>) {
  return (
    <Flex
      role='radiogroup'
      aria-label={label}
      gap='2px'
      h='controlSm'
      borderRadius='full'
      bg='bg.muted'
      boxShadow='inset 0 0 0 1px {colors.border}'
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <ButtonBox
            type='button'
            key={item.value}
            role='radio'
            aria-checked={selected}
            onClick={() => onChange(item.value)}
            position='relative'
            isolation='isolate'
            flex='1'
            minW='0'
            h='controlSm'
            display='inline-flex'
            alignItems='center'
            justifyContent='center'
            gap={dense ? '4px' : '6px'}
            px={dense ? '4px' : '6px'}
            borderRadius='full'
            fontSize='md'
            whiteSpace='nowrap'
            overflow='hidden'
            color={selected ? 'text.accent.strong' : 'text.sub'}
            fontWeight={selected ? 'semibold' : 'medium'}
            _before={
              selected
                ? {
                    content: '""',
                    position: 'absolute',
                    inset: '3px',
                    zIndex: -1,
                    borderRadius: 'full',
                    bg: 'bg.accent.subtle',
                    boxShadow: 'inset 0 0 0 1px {colors.text.accent}',
                  }
                : undefined
            }
          >
            {item.leading}
            {/* 呼び名が入りきらないときは末尾を…で省く（アバターは欠けさせない） */}
            <Box as='span' minW='0' overflow='hidden' textOverflow='ellipsis' whiteSpace='nowrap'>
              {item.label}
            </Box>
          </ButtonBox>
        )
      })}
    </Flex>
  )
}
