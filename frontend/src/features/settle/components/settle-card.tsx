import { Box, Flex } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Avatar, Badge, Icon } from '@/components'
import { ButtonBox } from '@/components/primitives'
import type { HouseholdData, PersonKey, S20State, SettleModel } from '@/domain'
import { monthDay, yen } from '../format'
import { checkLabel, flowVerb, NOTE } from '../labels'
import { displayName, whoName } from '../people'
import { CheckButton } from './check-button'
import { FlowMark } from './flow-mark'

export type SettleCardProps = {
  person: PersonKey
  data: HouseholdData
  model: SettleModel
  state: S20State
  viewer: PersonKey
  /** カードを押すと S-22（1人ぶんの内訳） */
  onOpenBreakdown: () => void
  /** ［入れた］／［受け取った］。付いたチェックを押すと外れる */
  onCheck: () => void
  /** チェックのボタンで出したその場の1行（金額の行の直下。§4 S-20） */
  message?: ReactNode
}

/**
 * 人のカード（§4 S-20・§6.1）。
 * 1人1枚・2枚は同じ大きさ・並びは2台とも まさと → りさこ。金額はいつも正の数で、
 * 向きは流れの印と動詞で示す（§6.1-1〜4）。
 *
 * 外枠は役割を持たない箱にし、カード全体を覆う透明のボタン（読み上げ名「まさとの内訳」）で
 * S-22 を開く。チェックのボタンはその**兄弟**として上に重ねる（入れ子にしない。§7.5）。
 */
export function SettleCard({ person, data, model, state, viewer, onOpenBreakdown, onCheck, message }: SettleCardProps) {
  const remaining = model.remaining?.[person] ?? 0
  const transferred = model.transferred[person]
  const check = model.checks[person]
  const estimate = state === 'estimate'
  const isIn = remaining > 0
  const showCheck = state === 'transfer' || state === 'settled'
  const name = whoName(data, person)

  const zeroText = transferred !== 0 ? NOTE.done(transferred) : NOTE.noMove
  const showDoneTag = remaining === 0 && transferred === 0 && !estimate

  return (
    <Box
      position='relative'
      p={4}
      mb={2}
      borderRadius='card'
      bg='bg.surface'
      border='1px solid'
      borderColor='border'
      css={{ '&:has(> [data-card-hit]:active)': { bg: 'bg.muted' } }}
    >
      {/* カード全体を覆う透明のボタン（§7.5）。チェックのボタンはこの上に重ねる */}
      <ButtonBox
        type='button'
        data-card-hit=''
        onClick={onOpenBreakdown}
        aria-label={`${name}の内訳`}
        position='absolute'
        inset='0'
        w='100%'
        borderRadius='inherit'
      />
      <Flex alignItems='center' gap={2}>
        <Avatar who={person} name={name} />
        <Box flex='1' minW='0' fontSize='lg' fontWeight='semibold' lineHeight='ui'>
          {displayName(data, person, viewer)}
        </Box>
        {showDoneTag ? <Badge>済み</Badge> : null}
        <Icon name='forward' size='16px' color='text.muted' />
      </Flex>

      {remaining === 0 ? (
        <Box mt={2} fontSize='lg' fontWeight='medium' lineHeight='ui' color='text.sub'>
          {zeroText}
        </Box>
      ) : (
        <>
          <Flex alignItems='center' gap={2} mt={2} fontSize='md' fontWeight='medium' color='text.sub'>
            <FlowMark from={isIn ? person : 'joint'} to={isIn ? 'joint' : person} amount={remaining} data={data} />
            <Box as='span'>{flowVerb(isIn)}</Box>
          </Flex>
          <Flex
            alignItems='center'
            justifyContent='space-between'
            flexWrap='wrap'
            gap={2}
            mt={1}
            minH={showCheck ? 'tapMin' : undefined}
          >
            <Box
              fontSize='3xl'
              fontWeight='bold'
              lineHeight='tight'
              fontVariantNumeric='tabular-nums'
              color={estimate ? 'text.sub' : undefined}
            >
              {transferred !== 0 ? (
                <Box as='span' fontSize='lg' fontWeight='semibold' mr={1}>
                  あと
                </Box>
              ) : null}
              {yen(remaining)}
            </Box>
            {showCheck ? (
              <CheckButton
                label={checkLabel(isIn)}
                checked={check !== undefined}
                own={person === viewer}
                {...(check
                  ? {
                      ariaLabel: `${checkLabel(isIn)} ${monthDay(check.at)} ${whoName(data, check.by)}（押すと外れる）`,
                    }
                  : {})}
                onClick={onCheck}
              />
            ) : null}
          </Flex>
        </>
      )}

      {/* 見込みで、自分がまだ自分のお金で払っていないとき（§4 S-20 `estimate`） */}
      {estimate && person === viewer && model.sum.advRows[person].length === 0 ? (
        <Box mt='6px' fontSize='sm' color='text.muted' lineHeight='ui'>
          {NOTE.noAdvance}
        </Box>
      ) : null}

      {message}
    </Box>
  )
}
