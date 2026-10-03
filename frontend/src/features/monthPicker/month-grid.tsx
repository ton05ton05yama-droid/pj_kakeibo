import { Box, Grid } from '@chakra-ui/react'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { IconButton } from '@/components'
import { ButtonBox } from '@/components/primitives'
import { type MonthKey, yearNumber } from '@/domain'
import { formatYearMonth } from '@/lib/format'

export type MonthGridProps = {
  /** 選択中の月（この月の年から始める） */
  viewMonth: MonthKey
  /** 選べる最初の月（家計を作った月）。これより前はボタンにしない */
  firstMonth: MonthKey
  /** 選べる最後の月。これより先はボタンにしない */
  lastMonth: MonthKey
  /** 今月（JST）。マスに「今月」を添える */
  currentMonth: MonthKey
  /** マスを押した */
  onPick: (m: MonthKey) => void
  /** 選択中のマス（シートを開いたときのフォーカス先） */
  selectedRef?: RefObject<HTMLElement | null>
}

const monthKeyOf = (year: number, month: number): MonthKey => `${year}-${String(month).padStart(2, '0')}`

/**
 * 年の行「‹ 2026 ›」と12か月のマス（S-04 の中身。S-32 の「何月分から」でも同じものを使う）。
 *
 * 選べない月は**ボタンにしない**（P7。`--text-disabled` の文字だけ）。
 * 進めない向きの年の矢印は出さない。年を変えても閉じない。
 */
export function MonthGrid({ viewMonth, firstMonth, lastMonth, currentMonth, onPick, selectedRef }: MonthGridProps) {
  const [year, setYear] = useState(() => yearNumber(viewMonth))
  const gridRef = useRef<HTMLDivElement>(null)
  const ownSelectedRef = useRef<HTMLElement | null>(null)
  const yearChanged = useRef(false)

  // 選択中の月が変わったら、その月の年から始める
  useEffect(() => {
    setYear(yearNumber(viewMonth))
  }, [viewMonth])

  const firstYear = yearNumber(firstMonth)
  const lastYear = yearNumber(lastMonth)
  const canGoPrevYear = year - 1 >= firstYear
  const canGoNextYear = year + 1 <= lastYear

  // 年を変えて矢印が消えたときは、その年の選択中の月か、選べる最初のマスへ移す（§4.0.3）
  useEffect(() => {
    void year
    if (!yearChanged.current) return
    yearChanged.current = false
    const active = document.activeElement
    if (active instanceof HTMLElement && document.body.contains(active) && active !== document.body) return
    const cell = ownSelectedRef.current ?? gridRef.current?.querySelector('button')
    cell?.focus()
  }, [year])

  const stepYear = useCallback((delta: number) => {
    yearChanged.current = true
    setYear((y) => y + delta)
  }, [])

  const cells = []
  for (let i = 1; i <= 12; i++) {
    const m = monthKeyOf(year, i)
    const label = `${i}月`
    if (m < firstMonth || m > lastMonth) {
      // 選べない月はボタンにしない（P7・B10）
      cells.push(
        <Box
          key={m}
          h='rowMin'
          display='grid'
          placeItems='center'
          color='text.disabled'
          fontSize='lg'
          fontWeight='medium'
        >
          {label}
        </Box>
      )
      continue
    }
    const selected = m === viewMonth
    const isCurrent = m === currentMonth
    cells.push(
      <ButtonBox
        type='button'
        key={m}
        ref={(node: HTMLButtonElement | null) => {
          if (!selected) return
          ownSelectedRef.current = node
          if (selectedRef) selectedRef.current = node
        }}
        onClick={() => onPick(m)}
        aria-label={`${formatYearMonth(year, i)}${isCurrent ? ' 今月' : ''}`}
        {...(selected ? { 'aria-current': true } : {})}
        cursor='pointer'
        h='rowMin'
        display='flex'
        flexDirection='column'
        alignItems='center'
        justifyContent='center'
        gap='2px'
        border='1px solid'
        borderColor={selected ? 'text.accent' : 'border'}
        borderRadius='control'
        bg={selected ? 'bg.accent.subtle' : 'bg.surface'}
        color={selected ? 'text.accent.strong' : 'text.main'}
        fontSize='lg'
        fontWeight={selected ? 'semibold' : 'medium'}
        _active={{ bg: 'bg.muted' }}
      >
        {label}
        {isCurrent ? (
          <Box as='span' fontSize='sm' fontWeight='medium' lineHeight='1' color={selected ? 'inherit' : 'text.sub'}>
            今月
          </Box>
        ) : null}
      </ButtonBox>
    )
  }

  return (
    <>
      {/* 年の行「‹ 2026 ›」。進めない向きの矢印は出さない（P7）。年を変えてもシートは閉じない */}
      <Grid gridTemplateColumns='44px 1fr 44px' alignItems='center' minH='tapMin'>
        {canGoPrevYear ? (
          <IconButton label='前の年' icon='back' color='text.accent' onClick={() => stepYear(-1)} />
        ) : (
          <span />
        )}
        <Box textAlign='center' fontSize='xl' fontWeight='bold' lineHeight='tight' fontVariantNumeric='tabular-nums'>
          {year}
        </Box>
        {canGoNextYear ? (
          <IconButton label='次の年' icon='forward' color='text.accent' onClick={() => stepYear(1)} />
        ) : (
          <span />
        )}
      </Grid>
      {/* 12か月のマス（3列×4行） */}
      <Grid ref={gridRef} gridTemplateColumns='repeat(3, 1fr)' gap={2} mt={2}>
        {cells}
      </Grid>
    </>
  )
}
