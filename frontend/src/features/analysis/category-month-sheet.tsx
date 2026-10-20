import { Box, Flex } from '@chakra-ui/react'
import { BottomSheet, Icon, SheetHeader } from '@/components'
import { type AnalysisPeriod, type CategoryKey, type CategoryMonthAmount, categoryName } from '@/domain'
import { formatNumber, formatYen } from '@/lib/format'
import { monthShort, periodText } from './text'

export type CategoryMonthSheetProps = {
  open: boolean
  cat: CategoryKey
  period: AnalysisPeriod
  /** 期間の各月のそのカテゴリの合計（古い順・0円の月も。計算は `domain/categoryByMonth`） */
  rows: readonly CategoryMonthAmount[]
  onClose: () => void
}

/**
 * S-41 カテゴリの月ごと（シート）。
 *
 * 期間の各月を古い順に、月・金額・灰色の横棒で並べる。0円の月も「0」で出す。行は押せない。
 * 人の色は使わない（人ごとの合計も出さない。P10）。状態は `normal` だけ。
 */
export function CategoryMonthSheet({ open, cat, period, rows, onClose }: CategoryMonthSheetProps) {
  const total = rows.reduce((s, row) => s + row.amount, 0)
  const max = Math.max(1, ...rows.map((row) => row.amount))
  const name = categoryName(cat)
  return (
    <BottomSheet open={open} label={`${name}（${periodText(period)}）`} onClose={onClose}>
      <Box data-screen='S-41' data-state='normal'>
        <Box as='h2' mt={1}>
          <SheetHeader>
            <Flex as='span' alignItems='center' gap={2}>
              <Icon name={cat} />
              {name}
            </Flex>
          </SheetHeader>
        </Box>
        <Flex alignItems='baseline' gap={2} mb={2}>
          <Box as='span' fontSize='bodySm' fontWeight='medium' color='text.sub'>
            {periodText(period)}
          </Box>
          <Box as='span' fontSize='lg' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
            {formatYen(total)}
          </Box>
        </Flex>
        {rows.map((row) => (
          <Box key={row.month} py={2} data-month={row.month}>
            <Flex justifyContent='space-between' alignItems='baseline' gap={2} fontSize='lg'>
              <Box as='span' fontWeight='medium'>
                {monthShort(row.month)}
              </Box>
              <Box as='span' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
                {formatNumber(row.amount)}
              </Box>
            </Flex>
            <Box aria-hidden h='6px' mt='6px' borderRadius='full' bg='bg.muted' overflow='hidden'>
              <Box h='100%' w={`${((row.amount / max) * 100).toFixed(1)}%`} borderRadius='full' bg='text.muted' />
            </Box>
          </Box>
        ))}
      </Box>
    </BottomSheet>
  )
}
