import { Flex } from '@chakra-ui/react'
import { Avatar, Icon } from '@/components'
import type { HouseholdData, Payer } from '@/domain'
import { num } from '../format'
import { whoName } from '../people'

export type FlowMarkProps = {
  from: Payer
  to: Payer
  /** 読み上げ名に入れる金額（いつも正の数） */
  amount: number
  data: HouseholdData
}

/**
 * 流れの印（§6.1-3）: 「[ま] → [家]」。**矢印はいつも右向き**で、向きは並べる順で表す。
 * アバターは飾りなので、まとまりを1つの `role="img"` にして読み上げ名を付ける。
 */
export function FlowMark({ from, to, amount, data }: FlowMarkProps) {
  return (
    <Flex
      as='span'
      alignItems='center'
      gap='2px'
      flex='none'
      role='img'
      aria-label={`${whoName(data, from)}から${whoName(data, to)}へ ${num(amount)}円`}
    >
      <Avatar who={from} name={from === 'joint' ? undefined : data.people[from].name} size='sm' />
      <Icon name='flow' size='16px' />
      <Avatar who={to} name={to === 'joint' ? undefined : data.people[to].name} size='sm' />
    </Flex>
  )
}
