import { Box, Flex } from '@chakra-ui/react'
import { Avatar } from '@/components'
import type { SettleModel } from '@/domain'
import { num } from '../format'

export type JointLineProps = {
  model: SettleModel
  /** 月の途中（見込み）は「残る見込み」「出る見込み」（§6.1-8） */
  estimate: boolean
}

/**
 * 共用の行（§6.1-7）。**最後に1行だけ**、灰色の家のアイコンで出す。カードにしない。
 * 警告の色にしない（足りなくても赤にしない。§6.3 ケースD）。
 */
export function JointLine({ model, estimate }: JointLineProps) {
  const jointNet = model.jointNet ?? 0
  const body =
    jointNet > 0 ? (
      <>
        共用に{' '}
        <Box as='b' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
          {num(jointNet)}円
        </Box>{' '}
        {estimate ? '残る見込み' : '残ります'}
      </>
    ) : jointNet < 0 ? (
      <>
        共用の残高から{' '}
        <Box as='b' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
          {num(jointNet)}円
        </Box>{' '}
        {estimate ? '出る見込み' : '出ます'}
      </>
    ) : estimate ? (
      '共用の残高は変わらない見込み'
    ) : (
      '共用の残高は変わりません'
    )

  return (
    <Flex alignItems='center' gap={2} minH='24px' fontSize='lg' lineHeight='ui' color='text.main'>
      <Avatar who='joint' size='sm' />
      <Box as='span'>{body}</Box>
    </Flex>
  )
}
