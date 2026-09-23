import { Box } from '@chakra-ui/react'
import type { Expense } from '@/domain'
import { monthNumber } from '@/domain'
import { NOTE } from '../labels'

export type PrepListProps = {
  /** 片付ける順に並べた金額待ちの行（払う人が個人の行 → 共用の行。§4 S-20 `prep`） */
  queue: readonly Expense[]
}

/** 金額待ちの行の名前（「ガス代（9月分）」。§1.1） */
export const pendingLabel = (e: Expense): string =>
  e.labelMonth ? `${e.memo}（${monthNumber(e.labelMonth)}月分）` : e.memo

/**
 * 「精算のまえに」の行（§4 S-20 `prep`）。押せない。3行まで、それ以上は「ほか n件」。
 * 動かす額は出さない（決まっていない数字で振り込ませない。§6.1-9）。
 */
export function PrepList({ queue }: PrepListProps) {
  const shown = queue.slice(0, 3)
  const rest = queue.length - shown.length
  return (
    <>
      <Box as='ul' listStyleType='none' mt={2} mb={1} fontSize='lg' lineHeight='body'>
        {shown.map((e) => (
          <Box as='li' key={e.id}>{`・${pendingLabel(e)}の金額`}</Box>
        ))}
        {rest > 0 ? <Box as='li'>{`・ほか ${rest}件`}</Box> : null}
      </Box>
      <Box fontSize='bodySm' color='text.sub' lineHeight='ui'>
        {NOTE.pendingHint}
      </Box>
    </>
  )
}
