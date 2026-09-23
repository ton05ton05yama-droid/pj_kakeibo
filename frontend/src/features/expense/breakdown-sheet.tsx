import { Box, Flex } from '@chakra-ui/react'
import { BottomSheet, Icon } from '@/components'
import { categoryName, type MonthKey, type MonthSummary } from '@/domain'
import { formatNumber } from '@/lib/format'
import { monthShort } from './text'

export type BreakdownSheetProps = {
  open: boolean
  month: MonthKey
  /** その月の集計（計算は `domain/summarize`） */
  summary: MonthSummary
  onClose: () => void
}

/**
 * S-13 内訳（カテゴリ別）（§4 S-13）。
 *
 * 多い順に、アイコン・カテゴリ名・金額・横棒。0円のカテゴリは出さない。
 * 横棒は灰色だけで、**人の色は使わない**（人ごとの合計も出さない）。
 * 状態は `normal` と `action`（金額待ちの注記があるとき）。
 */
export function BreakdownSheet({ open, month, summary, onClose }: BreakdownSheetProps) {
  const max = summary.byCat[0]?.amount ?? 1
  const pendingCount = summary.pending.length
  return (
    <BottomSheet open={open} label={`${monthShort(month)}の内訳`} onClose={onClose}>
      <Box data-screen='S-13' data-state={pendingCount > 0 ? 'action' : 'normal'}>
        <Box as='h2' mt={1} mb={2} fontSize='xl' fontWeight='bold' lineHeight='tight'>
          {monthShort(month)}の内訳
        </Box>
        {summary.byCat.map((row) => (
          <Box key={row.cat} py={2}>
            <Flex justifyContent='space-between' alignItems='baseline' gap={2} fontSize='lg'>
              <Flex as='span' alignItems='center' gap={2} fontWeight='medium'>
                <Icon name={row.cat} />
                {categoryName(row.cat)}
              </Flex>
              <Box as='span' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
                {formatNumber(row.amount)}
              </Box>
            </Flex>
            <Box aria-hidden h='6px' mt='6px' borderRadius='full' bg='bg.muted' overflow='hidden'>
              <Box h='100%' w={`${((row.amount / max) * 100).toFixed(1)}%`} borderRadius='full' bg='text.muted' />
            </Box>
          </Box>
        ))}
        {pendingCount > 0 ? (
          <Box mt={2} fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
            金額待ち {pendingCount}件は入っていません
          </Box>
        ) : null}
      </Box>
    </BottomSheet>
  )
}
