import { Box, Flex } from '@chakra-ui/react'
import { Avatar } from '@/components'
import type { SettleModel } from '@/domain'
import { num } from '../format'
import { NOTE } from '../labels'

export type JointLineProps = {
  model: SettleModel
  /** 月の途中（見込み）は「残る見込み」「出る見込み」（§6.1-8） */
  estimate: boolean
}

/**
 * 共用の行（§6.1-7）。**最後に1行だけ**、灰色の家のアイコンで出す。カードにしない。
 * 警告の色にしない（足りなくても赤にしない。§6.3 ケースD）。
 *
 * 出す額は通帳の動き（`jointLedger.balance`）で、給料が共用に入る人がいない月は
 * 共用の過不足（`jointNet`）と同じ値になる（§6.2）。給料が共用に入る人がいる月だけ、
 * その下に「うち 給料の残り ◯円」を1行足す（§6.3 ケースN）。
 */
export function JointLine({ model, estimate }: JointLineProps) {
  const ledger = model.jointLedger
  const amount = ledger ? ledger.balance : (model.jointNet ?? 0)
  const body =
    amount > 0 ? (
      <>
        共用に{' '}
        <Box as='b' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
          {num(amount)}円
        </Box>{' '}
        {estimate ? '残る見込み' : '残ります'}
      </>
    ) : amount < 0 ? (
      <>
        共用の残高から{' '}
        <Box as='b' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
          {num(amount)}円
        </Box>{' '}
        {estimate ? '出る見込み' : '出ます'}
      </>
    ) : estimate ? (
      '共用の残高は変わらない見込み'
    ) : (
      '共用の残高は変わりません'
    )

  return (
    <Box>
      <Flex alignItems='center' gap={2} minH='24px' fontSize='lg' lineHeight='ui' color='text.main'>
        <Avatar who='joint' size='sm' />
        <Box as='span'>{body}</Box>
      </Flex>
      {/*
        給料が共用に入る人がいる月だけ（いない月は今までどおり1行のまま。§6.3 ケースN）。
        残りが 0 の月は「0円」を出さない（モックと同じ）。
        字下げ 28px は 家のアイコン 20 ＋ すきま 8 で、上の文の頭にそろえるため。
      */}
      {ledger && ledger.salaryRemainder > 0 ? (
        <Box mt='2px' pl='28px' fontSize='sm' color='text.muted' lineHeight='ui'>
          {NOTE.salaryRemainder(ledger.salaryRemainder)}
        </Box>
      ) : null}
    </Box>
  )
}
