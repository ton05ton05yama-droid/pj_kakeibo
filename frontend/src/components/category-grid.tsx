import { Box, Grid } from '@chakra-ui/react'
import { Icon, type IconName } from './icon'
import { ButtonBox } from './primitives'

export type CategoryGridItem = {
  /** カテゴリの内部キー（§8。アイコンの名前も同じキー） */
  key: string
  label: string
  icon: IconName
}

export type CategoryGridProps = {
  items: readonly CategoryGridItem[]
  /** 選択中のカテゴリ（S-14・S-32 のチップから開いたグリッド） */
  selectedKey?: string
  onSelect: (key: string) => void
}

/**
 * カテゴリのグリッド（§7.5）: 3列、1マス 72px、間 8px。
 * 選択中は bg.accent.subtle ＋ text.accent.strong ＋ チェック（縁は border.accent、文字は 500）。
 */
export function CategoryGrid({ items, selectedKey, onSelect }: CategoryGridProps) {
  return (
    <Grid gridTemplateColumns='repeat(3, 1fr)' gap={2}>
      {items.map((item) => {
        const selected = item.key === selectedKey
        return (
          <ButtonBox
            type='button'
            key={item.key}
            onClick={() => onSelect(item.key)}
            {...(selected ? { 'aria-current': true as const } : {})}
            position='relative'
            h='gridCell'
            display='flex'
            flexDirection='column'
            alignItems='center'
            justifyContent='center'
            gap={1}
            border='1px solid'
            borderColor={selected ? 'border.accent' : 'border'}
            borderRadius='control'
            bg={selected ? 'bg.accent.subtle' : 'bg.surface'}
            color={selected ? 'text.accent.strong' : undefined}
            fontSize='md'
            fontWeight='medium'
            _active={{ bg: 'bg.muted' }}
          >
            <Icon name={item.icon} size='24px' color={selected ? 'text.accent.strong' : 'text.sub'} />
            {item.label}
            {selected ? (
              <Box position='absolute' top='6px' right='6px'>
                <Icon name='check' size='16px' />
              </Box>
            ) : null}
          </ButtonBox>
        )
      })}
    </Grid>
  )
}
