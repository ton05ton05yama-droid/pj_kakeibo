import { Box, Flex } from '@chakra-ui/react'
import { Icon } from '@/components'
import type { DateTimeKey, MonthKey, S20State, SettleModel } from '@/domain'
import { FORMULA, STATUS } from '../labels'

export type StatusLineProps = {
  state: S20State
  model: SettleModel
  month: MonthKey
  now: DateTimeKey
  /** 2人とも 0円（§6.3 ケースC） */
  bothZero: boolean
  /** 数字の無い式を続けて出すか（§6.1-5） */
  showFormula: boolean
}

/** 状態の1行の文言（§1.4 の表そのまま）。[鍵] が要るものは icon を返す */
function textOf(props: StatusLineProps): { text: string; lock: boolean } {
  const { state, model, month, now, bothZero } = props
  switch (state) {
    case 'undecided':
    case 'empty':
      return { text: STATUS.undecided(month), lock: false }
    case 'estimate':
      return { text: STATUS.estimate(now), lock: false }
    case 'prep':
      return { text: STATUS.prep(model.pending.length), lock: false }
    case 'ready':
      return { text: bothZero ? STATUS.noMove(month) : STATUS.ready, lock: false }
    case 'transfer':
      return { text: STATUS.transfer, lock: true }
    case 'settled':
      return { text: STATUS.settled(model.rec?.settledAt ?? now), lock: true }
    case 'redo':
      return { text: STATUS.redo, lock: false }
  }
}

/**
 * 状態の1行（§4 S-20 の2番目の要素）。13px `text.sub`。
 * 数字の無い式は**同じ行の右に続けて置く**（全角の空白をはさみ、入りきらなければ折り返す。§4 S-20）。
 */
export function StatusLine(props: StatusLineProps) {
  const { text, lock } = textOf(props)
  return (
    <Flex
      tabIndex={-1}
      flexWrap='wrap'
      alignItems='center'
      minH='28px'
      py={1}
      fontSize='bodySm'
      fontWeight='medium'
      lineHeight='ui'
      color='text.sub'
      _focus={{ outline: 'none' }}
    >
      <Flex as='span' alignItems='center' gap={1}>
        {lock ? <Icon name='lock' size='14px' /> : null}
        {text}
      </Flex>
      {props.showFormula ? (
        <>
          <Box as='span' aria-hidden>
            {'　'}
          </Box>
          <Box as='span' color='text.muted' whiteSpace='nowrap'>
            {FORMULA}
          </Box>
        </>
      ) : null}
    </Flex>
  )
}
