import { Box, Grid } from '@chakra-ui/react'
import { Avatar, Icon } from '@/components'
import type { DateTimeKey, HouseholdData, MonthKey, PersonKey } from '@/domain'
import { PERSON_KEYS } from '@/domain'
import { yen } from '../format'
import { displayName, whoName } from '../people'
import { decidePlan } from '../undecided'

export type DecideBlockProps = {
  data: HouseholdData
  month: MonthKey
  viewer: PersonKey
  now: DateTimeKey
}

/**
 * 出す額のブロック（§4 S-20 `undecided`）。カードの代わりに出す。
 * 決まっている人の行は「✓ 決めた」、決まっていない人の行は「先月の手取りで」。
 * 先月の手取りも無い人の行は「—」にする（主ボタンは［出す額を決める］になる）。
 */
export function DecideBlock({ data, month, viewer, now }: DecideBlockProps) {
  const current = data.contributions[month] ?? {}
  const { plan } = decidePlan(data, month, viewer, now)

  return (
    <Box mt={2} p={4} borderRadius='card' bg='bg.surface' border='1px solid' borderColor='border'>
      {PERSON_KEYS.map((p) => {
        const decided = current[p]
        const planned = plan[p]
        const amount = decided ? yen(decided.amount) : planned ? yen(planned.amount) : '—'
        return (
          <Grid
            key={p}
            gridTemplateColumns='auto 1fr auto'
            alignItems='center'
            columnGap={2}
            py='6px'
            aria-label={`${whoName(data, p)}の出す額 ${amount}`}
          >
            <Avatar who={p} name={whoName(data, p)} />
            <Box fontSize='lg' fontWeight='semibold' lineHeight='ui'>
              {displayName(data, p, viewer)}
            </Box>
            <Box fontSize='2xl' fontWeight='bold' lineHeight='tight' fontVariantNumeric='tabular-nums'>
              {amount}
            </Box>
            {decided ? (
              <Box gridColumn='2 / 4' display='flex' alignItems='center' gap={1} fontSize='sm' color='text.muted'>
                <Icon name='check' size='12px' />
                決めた
              </Box>
            ) : planned ? (
              <Box gridColumn='2 / 4' fontSize='sm' color='text.muted'>
                先月の手取りで
              </Box>
            ) : null}
          </Grid>
        )
      })}
    </Box>
  )
}
