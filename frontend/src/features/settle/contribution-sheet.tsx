import { Box, Flex } from '@chakra-ui/react'
import { useEffect, useMemo, useRef } from 'react'
import { useAnnounce } from '@/app/providers'
import { Avatar, BottomSheet, InlineMessage, Keypad, PrimaryButton, SheetHeader } from '@/components'
import { ButtonBox } from '@/components/primitives'
import type { DateTimeKey, HouseholdData, MonthKey, PersonKey } from '@/domain'
import { addMonth, decideContributions, PERSON_KEYS, rateFor } from '@/domain'
import { monthDay, monthShort, num, yen } from './format'
import { BUTTON } from './labels'
import { displayName, whoName } from './people'
import { type NetDigits, useNetInput } from './use-net-input'

/** 欄の初期値: その月に決めてあればその手取り、無ければ先月の手取り、どちらも無ければ空 */
export function initialNets(data: HouseholdData, month: MonthKey): NetDigits {
  const current = data.contributions[month] ?? {}
  const previous = data.contributions[addMonth(month, -1)] ?? {}
  const read = (p: PersonKey): string => {
    const decided = current[p] ?? previous[p]
    return decided ? String(decided.net) : ''
  }
  return { a: read('a'), b: read('b') }
}

export type ContributionSheetProps = {
  open: boolean
  data: HouseholdData
  month: MonthKey
  viewer: PersonKey
  now: DateTimeKey
  /** その場の1行（見出しの行の右。高さを増やさない。§4 S-21） */
  message: { text: string; tone: 'error' | 'info' } | null
  /** ［決める］。2人分の手取りを渡す（0 も保存する） */
  onDecide: (nets: Record<PersonKey, number>) => void
  /** 手取りの欄が空のまま［決める］を押した（空の欄を入力先にして止める） */
  onEmpty: (p: PersonKey) => void
  onClose: () => void
}

/**
 * S-21 出す額（§4 S-21・§2.3 E5）。入口は S-20 の中だけ。
 * 出す額は `floor(手取り × 割合 ÷ 100)`（計算は domain の `decideContributions`。§6.2）。
 * 割合は表示だけ（変えるのは S-33）。手取りは 0 を入れられる。
 */
export function ContributionSheet({
  open,
  data,
  month,
  viewer,
  now,
  message,
  onDecide,
  onEmpty,
  onClose,
}: ContributionSheetProps) {
  const announce = useAnnounce()
  const ownFieldRef = useRef<HTMLButtonElement>(null)
  const initial = useMemo(() => initialNets(data, month), [data, month])
  const { nets, target, shaking, setTarget, press } = useNetInput(initial, viewer)

  // 入力のたびに「まさとの手取り 300,000円」と読み上げる（要素は作り直さない。§7.5）
  const typed = useRef(false)
  const value = nets[target]
  useEffect(() => {
    if (!typed.current) return
    announce(`${whoName(data, target)}の手取り ${value === '' ? '未入力' : `${num(Number(value))}円`}`)
  }, [announce, data, target, value])

  // 出す額は［決める］で保存するのと同じ関数で出す（決め直しても、その月に保存した割合を使う）
  const entered: Partial<Record<PersonKey, number>> = {}
  for (const p of PERSON_KEYS) if (nets[p] !== '') entered[p] = Number(nets[p])
  const plan = decideContributions(data, month, entered, viewer, now)
  const current = data.contributions[month] ?? {}

  const decide = (): void => {
    const empty = PERSON_KEYS.find((p) => nets[p] === '')
    if (empty) {
      setTarget(empty)
      onEmpty(empty)
      return
    }
    onDecide({ a: Number(nets.a), b: Number(nets.b) })
  }

  return (
    <BottomSheet
      open={open}
      tall
      label={`${monthShort(month)}の出す額`}
      onClose={onClose}
      initialFocusRef={ownFieldRef}
      footer={<PrimaryButton onClick={decide}>{BUTTON.decide}</PrimaryButton>}
    >
      <SheetHeader
        trailing={
          message ? (
            <Box whiteSpace='nowrap'>
              <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
            </Box>
          ) : undefined
        }
      >
        {`${monthShort(month)}の出す額`}
      </SheetHeader>

      {PERSON_KEYS.map((p) => {
        const digits = nets[p]
        const has = digits !== ''
        const decided = current[p]
        const name = whoName(data, p)
        return (
          <Box key={p} mt={p === 'b' ? 2 : 0}>
            <Flex alignItems='center' gap={2} h='28px'>
              <Avatar who={p} name={name} />
              <Box flex='none' fontSize='lg' fontWeight='semibold' lineHeight='ui'>
                {displayName(data, p, viewer)}
              </Box>
              {decided ? (
                <Box
                  ml='auto'
                  minW='0'
                  overflow='hidden'
                  textOverflow='ellipsis'
                  whiteSpace='nowrap'
                  fontSize='sm'
                  color='text.muted'
                >
                  {`決めた: ${whoName(data, decided.by)} ${monthDay(decided.at)}`}
                </Box>
              ) : null}
            </Flex>
            <Flex alignItems='center' gap='6px' mt={1} fontSize='md' color='text.sub'>
              <Box as='span'>手取り</Box>
              <ButtonBox
                type='button'
                ref={p === viewer ? ownFieldRef : undefined}
                onClick={() => setTarget(p)}
                aria-pressed={target === p}
                aria-label={`${name}の手取り ${has ? `${num(Number(digits))}円` : '未入力'}`}
                flex='1'
                minW='0'
                h='control'
                px='10px'
                textAlign='right'
                borderRadius='control'
                border='1px solid'
                borderColor={target === p ? 'transparent' : 'border.strong'}
                outline={target === p ? '2px solid' : undefined}
                outlineColor={target === p ? 'focusRing' : undefined}
                bg='bg.input'
                color='text.main'
                fontSize='lg'
                fontWeight='medium'
                fontVariantNumeric='tabular-nums'
                animation={shaking && target === p ? 'shake 0.32s {easings.out}' : undefined}
              >
                {has ? num(Number(digits)) : ''}
              </ButtonBox>
              <Box as='span' whiteSpace='nowrap'>{`× ${rateFor(data, month, p)}% ＝`}</Box>
              <Box
                minW='96px'
                textAlign='right'
                color='text.main'
                fontSize='2xl'
                fontWeight='bold'
                lineHeight='tight'
                fontVariantNumeric='tabular-nums'
              >
                {has ? yen(plan[p]?.amount ?? 0) : ''}
              </Box>
            </Flex>
          </Box>
        )
      })}

      <Box mt={3}>
        <Keypad
          onKey={(key) => {
            typed.current = true
            press(key)
          }}
        />
      </Box>
    </BottomSheet>
  )
}
