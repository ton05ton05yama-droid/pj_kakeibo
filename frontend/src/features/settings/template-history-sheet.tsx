import { Box, Flex } from '@chakra-ui/react'
import { BottomSheet, Icon, SheetHeader } from '@/components'
import type { CategoryKey, Payer, Person, PersonKey, TemplateChange, TemplateValues } from '@/domain'
import { categoryName } from '@/domain'
import { formatMonthDay, formatYenSuffix } from '@/lib/format'
import { monthLabel } from './sheets'

/** S-35 の1行（画面に出す文字をそろえたもの） */
export interface HistoryLine {
  id: string
  /** 1段目のアイコン（カテゴリ） */
  cat: CategoryKey
  /** 1段目の名前（変更の後の名前。やめたときは前の名前） */
  name: string
  /** 1段目の右「10月分から」 */
  from: string
  /** 2段目「追加 5,500円・まさと」「記録を始める月 10月分 → 9月分、名前 光回線 → Wi-Fi」「やめました」 */
  what: string
  /** 3段目「まさと 10/3」 */
  who: string
}

function payerName(payer: Payer, people: Record<PersonKey, Person>): string {
  return payer === 'joint' ? '共用' : people[payer].name
}

/** 金額の文字（金額待ちは「金額待ち」、毎月同じは「5,500円」） */
function amountText(v: TemplateValues): string {
  return v.kind === 'variable' || v.amount === null ? '金額待ち' : formatYenSuffix(v.amount)
}

/** 2段目（直したときは変わった項目を「、」でつなぐ。並びは 記録を始める月・名前・カテゴリ・払う人・金額） */
function whatText(c: TemplateChange, people: Record<PersonKey, Person>): string {
  if (c.change === 'stop') return 'やめました'
  if (c.change === 'add') {
    if (c.after === null) return '追加'
    return `追加 ${amountText(c.after)}・${payerName(c.after.payer, people)}`
  }
  const b = c.before
  const a = c.after
  if (b === null || a === null) return ''
  const parts: string[] = []
  // 開始月は、前と後の両方にあって違うときだけ（0011 より前の履歴には開始月が無い）
  if (b.from !== undefined && a.from !== undefined && b.from !== a.from) {
    parts.push(`記録を始める月 ${monthLabel(b.from)}分 → ${monthLabel(a.from)}分`)
  }
  if (b.name !== a.name) parts.push(`名前 ${b.name} → ${a.name}`)
  if (b.cat !== a.cat) parts.push(`${categoryName(b.cat)} → ${categoryName(a.cat)}`)
  if (b.payer !== a.payer) parts.push(`${payerName(b.payer, people)} → ${payerName(a.payer, people)}`)
  if (amountText(b) !== amountText(a)) parts.push(`${amountText(b)} → ${amountText(a)}`)
  return parts.join('、')
}

/** 履歴を新しい順の行にする（同じ時刻なら後に書いたほうを先に） */
export function historyLines(changes: readonly TemplateChange[], people: Record<PersonKey, Person>): HistoryLine[] {
  return changes
    .map((c, i) => ({ c, i }))
    .sort((x, y) => (x.c.at < y.c.at ? 1 : x.c.at > y.c.at ? -1 : y.i - x.i))
    .flatMap(({ c }) => {
      const v = c.after ?? c.before
      if (v === null) return []
      const day = formatMonthDay(Number(c.at.slice(5, 7)), Number(c.at.slice(8, 10)))
      return [
        {
          id: c.id,
          cat: v.cat,
          name: v.name,
          from: `${monthLabel(c.from)}分から`,
          what: whatText(c, people),
          who: c.by === null ? day : `${people[c.by].name} ${day}`,
        },
      ]
    })
}

export type TemplateHistorySheetProps = {
  changes: readonly TemplateChange[]
  people: Record<PersonKey, Person>
  onClose: () => void
}

/**
 * S-35 変更の履歴（設定・高いシート。読み取り専用）。
 *
 * S-31 の「変更の履歴」から開く。行は押せない。状態は `normal` だけ
 * （履歴が0件のときは S-31 に入口を出さないので、空の状態は無い）。操作は閉じるだけ。
 */
export function TemplateHistorySheet({ changes, people, onClose }: TemplateHistorySheetProps) {
  const lines = historyLines(changes, people)
  return (
    <BottomSheet open label='変更の履歴' onClose={onClose} tall>
      <Box data-screen='S-35' data-state='normal'>
        <Box mt={1} mb={1}>
          <SheetHeader>変更の履歴</SheetHeader>
        </Box>
        <Box
          as='ul'
          listStyleType='none'
          m={0}
          p={0}
          css={{ '& > li + li': { borderTop: '1px solid {colors.border}' } }}
        >
          {lines.map((line) => (
            <Box as='li' key={line.id} py='10px'>
              <Flex alignItems='center' gap={2} fontSize='lg' fontWeight='medium' lineHeight='ui'>
                <Icon name={line.cat} size='20px' color='text.sub' />
                <Box flex='1' minW='0' overflow='hidden' textOverflow='ellipsis' whiteSpace='nowrap'>
                  {line.name}
                </Box>
                <Box fontSize='md' color='text.sub' whiteSpace='nowrap'>
                  {line.from}
                </Box>
              </Flex>
              <Box mt='2px' pl='28px' fontSize='bodySm' fontWeight='medium' color='text.sub' lineHeight='ui'>
                {line.what}
              </Box>
              <Box mt='2px' pl='28px' fontSize='sm' fontWeight='medium' color='text.muted' lineHeight='ui'>
                {line.who}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </BottomSheet>
  )
}
