import { Box } from '@chakra-ui/react'
import { useRef } from 'react'
import { BottomSheet } from '@/components'
import type { MonthKey } from '@/domain'
import { MonthGrid } from './month-grid'

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

/**
 * S-04 月を選ぶ（§4 S-04・§3.4・§2.3 E6）。
 *
 * 支出（S-10）と精算（S-20）の上部バーの年月から開く**同じ部品**で、違うのは移る先のタブだけ。
 * 状態は `normal` のみ。金額・精算の状態はマスに出さない（選ぶ前に読む量を増やさない）。
 * 家計を作る前の月と今月より先の月は**ボタンにしない**（P7。`--text-disabled` の文字だけ）。
 * 年の行と12か月のマスは `MonthGrid`（S-32 の「何月分から」と同じもの）。
 */

export function MonthPickerSheet({
  open,
  viewMonth,
  createdMonth,
  currentMonth,
  onPick,
  onClose,
}: MonthPickerSheetProps) {
  const currentCellRef = useRef<HTMLElement | null>(null)

  return (
    <BottomSheet open={open} label='月を選ぶ' onClose={onClose} initialFocusRef={currentCellRef}>
      <Box data-screen='S-04' data-state='normal'>
        <MonthGrid
          viewMonth={viewMonth}
          firstMonth={createdMonth}
          lastMonth={currentMonth}
          currentMonth={currentMonth}
          onPick={onPick}
          selectedRef={currentCellRef}
        />
      </Box>
    </BottomSheet>
  )
}
