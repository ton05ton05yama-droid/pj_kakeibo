import { Box, Grid } from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BottomSheet, IconButton } from '@/components'
import { ButtonBox } from '@/components/primitives'
import { type MonthKey, yearNumber } from '@/domain'
import { formatYearMonth } from '@/lib/format'

export type MonthPickerSheetProps = {
  open: boolean
  /** いま見ている月（開いたタブの月） */
  viewMonth: MonthKey
  /** 家計を作った月。これより前の月は選べない */
  createdMonth: MonthKey
  /** 今月（JST）。これより先の月は選べない */
  currentMonth: MonthKey
  /** マスを押した。シートを閉じて、開いたタブでその月を見る */
  onPick: (m: MonthKey) => void
  /** 閉じる（下へのスワイプ・背景のタップ・つまみ・Esc）。何も変えない */
  onClose: () => void
}

const monthKeyOf = (year: number, month: number): MonthKey => `${year}-${String(month).padStart(2, '0')}`

/**
 * S-04 月を選ぶ（§4 S-04・§3.4・§2.3 E6）。
 *
 * 支出（S-10）と精算（S-20）の上部バーの年月から開く**同じ部品**で、違うのは移る先のタブだけ。
 * 状態は `normal` のみ。金額・精算の状態はマスに出さない（選ぶ前に読む量を増やさない）。
 * 家計を作る前の月と今月より先の月は**ボタンにしない**（P7。`--text-disabled` の文字だけ）。
 */
export function MonthPickerSheet({
  open,
  viewMonth,
  createdMonth,
  currentMonth,
  onPick,
  onClose,
}: MonthPickerSheetProps) {
  const [year, setYear] = useState(() => yearNumber(viewMonth))
  const gridRef = useRef<HTMLDivElement>(null)
  const currentCellRef = useRef<HTMLElement | null>(null)
  const yearChanged = useRef(false)

  // 開いたときは、いま見ている月の年から始める
  useEffect(() => {
    if (open) setYear(yearNumber(viewMonth))
  }, [open, viewMonth])

  const firstYear = yearNumber(createdMonth)
  const lastYear = yearNumber(currentMonth)
  const canGoPrevYear = year - 1 >= firstYear
  const canGoNextYear = year + 1 <= lastYear

  // 年を変えて矢印が消えたときは、その年の「いま見ている月」か、選べる最初のマスへ移す（§4.0.3）
  useEffect(() => {
    if (!open || !yearChanged.current) return
    yearChanged.current = false
    const active = document.activeElement
    if (active instanceof HTMLElement && document.body.contains(active) && active !== document.body) return
    const cell = currentCellRef.current ?? gridRef.current?.querySelector('button')
    cell?.focus()
  }, [open])

  const stepYear = useCallback((delta: number) => {
    yearChanged.current = true
    setYear((y) => y + delta)
  }, [])

  const cells = []
  for (let i = 1; i <= 12; i++) {
    const m = monthKeyOf(year, i)
    const label = `${i}月`
    if (m < createdMonth || m > currentMonth) {
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
          if (selected) currentCellRef.current = node
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
    <BottomSheet open={open} label='月を選ぶ' onClose={onClose} initialFocusRef={currentCellRef}>
      <Box data-screen='S-04' data-state='normal'>
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
      </Box>
    </BottomSheet>
  )
}
