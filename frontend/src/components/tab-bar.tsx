import { Box, Grid } from '@chakra-ui/react'
import { NavLink } from 'react-router'
import { Icon, type IconName } from './icon'

export type TabDef = {
  to: string
  label: string
  icon: IconName
}

/** 並びは 記録 → 支出 → 精算 → 設定（2台で同じ。§3.1）。これ以上は増やさない */
export const tabs: readonly TabDef[] = [
  { to: '/record', label: '記録', icon: 'tabRecord' },
  { to: '/expenses', label: '支出', icon: 'tabExpenses' },
  { to: '/settle', label: '精算', icon: 'tabSettle' },
  { to: '/settings', label: '設定', icon: 'tabSettings' },
]

export type TabBarProps = {
  /** 精算タブの赤い点（§3.2。条件の判定は DB 側の関数で行う） */
  showSettleDot?: boolean
}

/**
 * 下部タブバー（§3.1）: 4等分、高さ 56px ＋ safe-area。
 * 選ばれているタブはアイコンの後ろに 56×28px のピルを敷き、アイコンとラベルを text.accent にする。
 */
export function TabBar({ showSettleDot }: TabBarProps) {
  return (
    <Grid
      as='nav'
      aria-label='タブ'
      // シートが開いているあいだ inert を付ける目印（components/bottom-sheet.tsx）
      data-app-tabbar
      position='fixed'
      left='0'
      right='0'
      bottom='0'
      zIndex='sticky'
      gridTemplateColumns='repeat(4, 1fr)'
      h='calc(var(--tabbar-h) + var(--sa-bottom))'
      pb='var(--sa-bottom)'
      pl='env(safe-area-inset-left, 0px)'
      pr='env(safe-area-inset-right, 0px)'
      bg='bg.surface'
      borderTop='1px solid'
      borderColor='border'
    >
      {tabs.map((tab) => {
        const dot = showSettleDot && tab.to === '/settle'
        return (
          <Box
            asChild
            key={tab.to}
            display='flex'
            flexDirection='column'
            alignItems='center'
            justifyContent='center'
            gap='2px'
            color='text.muted'
            fontSize='xs'
            fontWeight='semibold'
            lineHeight='1.2'
            transition='background {durations.fast}'
            _active={{ bg: 'bg.muted' }}
            css={{
              '&[aria-current="page"]': { color: 'text.accent' },
              '&[aria-current="page"] .tab-pill': { bg: 'bg.accent.subtle' },
            }}
          >
            <NavLink to={tab.to}>
              <Box
                className='tab-pill'
                position='relative'
                w='56px'
                h='28px'
                display='grid'
                placeItems='center'
                borderRadius='full'
              >
                <Icon name={tab.icon} size='iconTab' />
                {dot ? (
                  <Box
                    position='absolute'
                    top='1px'
                    right='12px'
                    w='8px'
                    h='8px'
                    borderRadius='full'
                    bg='text.danger'
                    aria-hidden
                  />
                ) : null}
              </Box>
              {tab.label}
              {dot ? <VisuallyHidden>（やることがあります）</VisuallyHidden> : null}
            </NavLink>
          </Box>
        )
      })}
    </Grid>
  )
}

/** 読み上げだけの文字 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <Box as='span' position='absolute' w='1px' h='1px' overflow='hidden' whiteSpace='nowrap' clipPath='inset(50%)'>
      {children}
    </Box>
  )
}
