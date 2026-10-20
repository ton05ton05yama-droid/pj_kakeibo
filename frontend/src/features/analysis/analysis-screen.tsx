import { Box, Flex } from '@chakra-ui/react'
import { useState } from 'react'
import { Chip, Icon, PlainAppBar, SectionTitle, usePageScrolled } from '@/components'
import { ButtonBox } from '@/components/primitives'
import { useHousehold } from '@/data'
import {
  type AnalysisMonthTotal,
  analysisSummary,
  type CategoryKey,
  categoryByMonth,
  categoryName,
  type DateTimeKey,
  type HouseholdData,
  monthOf,
  pickAnalysisFrom,
  pickAnalysisTo,
} from '@/domain'
import { MonthPickerSheet } from '@/features/monthPicker'
import { formatNumber, formatYen } from '@/lib/format'
import { CategoryMonthSheet } from './category-month-sheet'
import { monthLabel, monthShort, periodChipLabel, periodText } from './text'
import { useAnalysisPeriod } from './use-analysis-period'

type SheetState = { kind: 'from' } | { kind: 'to' } | { kind: 'category'; cat: CategoryKey } | null

/** 月ごとの推移の高さ（棒の上の金額を含む） */
const CHART_H = '140px'
/** 棒の上の金額の行の高さ */
const CHART_LABEL_H = '18px'

/** S-40 分析（タブのトップ）。データが届くまでは中身を出さない */
export function AnalysisScreen() {
  const { data } = useHousehold()
  if (data === undefined) return null
  return <AnalysisTab d={data.data} now={data.now} />
}

/**
 * S-40 分析（仕様書 S-40）。「この期間、何にいくら払った？」に答える。
 *
 * 上から 期間のチップ2つ → 期間の合計 → （あれば）金額待ちの注記 → 月ごとの推移 → カテゴリ別。
 * 数え方は支出タブの合計・S-13 の内訳と同じ（帰属月。金額待ち・今月はなし・未送信は入れない）。
 * 人の色・人ごとの合計は出さない（P10）。状態は `normal` ／ `action`（注記あり）／ `empty`。
 */
function AnalysisTab({ d, now }: { d: HouseholdData; now: DateTimeKey }) {
  const scrolled = usePageScrolled()
  const [period, setPeriod] = useAnalysisPeriod(d, now)
  const [sheet, setSheet] = useState<SheetState>(null)
  const summary = analysisSummary(d, period.from, period.to, now)
  const empty = summary.count === 0
  const state = empty ? 'empty' : summary.pendingCount > 0 ? 'action' : 'normal'
  const currentMonth = monthOf(now)
  const closeSheet = () => setSheet(null)
  const catMax = summary.categories[0]?.amount ?? 1

  return (
    <Box data-screen='S-40' data-state={state} display='flex' flexDirection='column' flex='1'>
      <PlainAppBar scrolled={scrolled}>分析</PlainAppBar>

      {/* 期間の行「［2026年8月 ▾］〜［2026年10月 ▾］」 */}
      <Flex alignItems='center' gap={2} flexWrap='wrap'>
        <Chip iconEnd='expand' label={periodChipLabel('from', period.from)} onClick={() => setSheet({ kind: 'from' })}>
          {monthLabel(period.from)}
        </Chip>
        <Box as='span' aria-hidden color='text.sub' fontSize='md'>
          〜
        </Box>
        <Chip iconEnd='expand' label={periodChipLabel('to', period.to)} onClick={() => setSheet({ kind: 'to' })}>
          {monthLabel(period.to)}
        </Chip>
      </Flex>

      <Box mt={2} fontSize='bodySm' fontWeight='medium' color='text.sub'>
        {periodText(period)}のふたりの支出
      </Box>
      <Box mt='2px' fontSize='3xl' fontWeight='bold' lineHeight='tight' fontVariantNumeric='tabular-nums'>
        {formatYen(summary.total)}
      </Box>
      {summary.pendingCount > 0 ? (
        <Box mt={1} fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
          金額待ち {summary.pendingCount}件は入っていません
        </Box>
      ) : null}

      {empty ? (
        <Box mt={8} textAlign='center' fontSize='lg' lineHeight='body' color='text.sub'>
          この期間の記録はありません
        </Box>
      ) : (
        <>
          <MonthBars months={summary.months} />
          <SectionTitle>カテゴリ</SectionTitle>
          <Box>
            {summary.categories.map((row) => (
              <ButtonBox
                key={row.cat}
                type='button'
                onClick={() => setSheet({ kind: 'category', cat: row.cat })}
                display='flex'
                alignItems='center'
                gap={2}
                w='100%'
                minH='tapMin'
                py={2}
                borderRadius='control'
                textAlign='left'
                _active={{ bg: 'bg.muted' }}
              >
                <Box flex='1' minW='0'>
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
                    <Box
                      h='100%'
                      w={`${((row.amount / catMax) * 100).toFixed(1)}%`}
                      borderRadius='full'
                      bg='text.muted'
                    />
                  </Box>
                </Box>
                <Icon name='forward' size='16px' color='text.muted' />
              </ButtonBox>
            ))}
          </Box>
        </>
      )}
      <Box h={4} flex='none' />

      {/* シート（§4.0.3。ルートにはしない）。S-04 は支出・精算と同じ部品で、見出しだけ足す */}
      <MonthPickerSheet
        open={sheet?.kind === 'from' || sheet?.kind === 'to'}
        heading={sheet?.kind === 'to' ? '終わりの月' : '始めの月'}
        viewMonth={sheet?.kind === 'to' ? period.to : period.from}
        createdMonth={d.household.createdMonth}
        currentMonth={currentMonth}
        onPick={(m) => {
          setPeriod(sheet?.kind === 'to' ? pickAnalysisTo(period, m) : pickAnalysisFrom(period, m))
          closeSheet()
        }}
        onClose={closeSheet}
      />
      {sheet?.kind === 'category' ? (
        <CategoryMonthSheet
          open
          cat={sheet.cat}
          period={period}
          rows={categoryByMonth(d, sheet.cat, period.from, period.to, now)}
          onClose={closeSheet}
        />
      ) : null}
    </Box>
  )
}

/**
 * 月ごとの推移（縦棒）。地なし・棒は灰色・角丸 4px。高さは期間の一番多い月を 100% にする。
 * 棒の上に金額（6か月まで）、下に「8月」。棒は押せない。読み上げは全体で1つ（中の文字は読ませない）。月が多いときは棒が細くなる（12本で 1本 約 20px）。
 */
function MonthBars({ months }: { months: readonly AnalysisMonthTotal[] }) {
  const max = Math.max(1, ...months.map((m) => m.total))
  // 読み上げは棒をまとめて1つにする（「8月 255,890、9月 180,670」）
  const label = months.map((m) => `${monthShort(m.month)} ${formatNumber(m.total)}`).join('、')
  // 7か月以上は棒が細く、棒の上の金額が隣と重なるので出さない（読み上げには残す。仕様書 S-40・§12.2 Q37）
  const showAmounts = months.length <= 6
  return (
    <Box mt={4} role='img' aria-label={label} data-chart='months'>
      <Flex h={CHART_H} alignItems='stretch' gap={2}>
        {months.map((m) => (
          <Flex key={m.month} flex='1' minW='0' flexDirection='column' alignItems='center' justifyContent='flex-end'>
            <Box
              h={CHART_LABEL_H}
              fontSize='sm'
              fontWeight='medium'
              lineHeight={CHART_LABEL_H}
              color='text.sub'
              whiteSpace='nowrap'
              fontVariantNumeric='tabular-nums'
            >
              {showAmounts ? formatNumber(m.total) : null}
            </Box>
            <Box
              w='100%'
              maxW='48px'
              h={`calc((100% - ${CHART_LABEL_H}) * ${(m.total / max).toFixed(4)})`}
              borderRadius='4px'
              bg='text.muted'
            />
          </Flex>
        ))}
      </Flex>
      <Flex gap={2} mt={1}>
        {months.map((m) => (
          <Box
            key={m.month}
            flex='1'
            minW='0'
            textAlign='center'
            fontSize='sm'
            fontWeight='medium'
            color='text.sub'
            whiteSpace='nowrap'
          >
            {monthShort(m.month)}
          </Box>
        ))}
      </Flex>
    </Box>
  )
}
