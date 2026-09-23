import { Box, Flex } from '@chakra-ui/react'
import { Avatar, Badge, BottomSheet } from '@/components'
import type { Expense, HouseholdData, PersonKey, S20State, SettleModel } from '@/domain'
import { categoryName } from '@/domain'
import { FlowMark } from './components/flow-mark'
import { pendingLabel } from './components/prep-list'
import { monthDay, num, yen } from './format'
import { checkLabel, flowVerb, JOINT_SALARY_LABEL, NOTE } from './labels'
import { displayName, whoName } from './people'

/** S-20 がカードを出す状態だけで開く（状態キーは S-20 のものをそのまま使う。§4 S-22） */
export const S22_STATES: readonly S20State[] = ['estimate', 'ready', 'transfer', 'settled', 'redo']

/** 一覧は新しい順（日付 → 記録日時 → 通し番号） */
const byNewest = (x: Expense, y: Expense): number =>
  y.date.localeCompare(x.date) || y.at.localeCompare(x.at) || y.seq - x.seq

/** 一覧のメモの位置に出す名前。金額待ちの種類の行は「（◯月分）」を付ける */
function rowName(d: HouseholdData, e: Expense): string {
  if (!e.tpl) return e.memo
  const tpl = d.templates.find((t) => t.id === e.tpl)
  return tpl?.kind === 'variable' ? pendingLabel(e) : e.memo
}

export type BreakdownSheetProps = {
  open: boolean
  data: HouseholdData
  model: SettleModel
  state: S20State
  person: PersonKey
  viewer: PersonKey
  onClose: () => void
}

function Divider() {
  return <Box as='hr' borderTop='1px solid' borderColor='border' my={3} w='100%' />
}

function Row({ label, value, sub }: { label: string; value?: string; sub?: boolean }) {
  return (
    <Flex
      justifyContent='space-between'
      alignItems='baseline'
      gap={2}
      py='2px'
      pl={sub ? 3 : 0}
      fontSize={sub ? 'bodySm' : 'lg'}
      color={sub ? 'text.muted' : undefined}
    >
      <Box as='span'>{label}</Box>
      {value !== undefined ? (
        <Box as='span' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
          {value}
        </Box>
      ) : null}
    </Flex>
  )
}

/**
 * S-22 1人ぶんの内訳（§4 S-22・§2.3 E4）。**見るだけ**（直すのは支出タブ）。
 * 一番大きく見せるものは結果の行の動かす額（24px bold）。
 * 流れの印・動詞・金額は見出しの行に置かず、式の下の結果の行に1回だけ出す。
 */
export function BreakdownSheet({ open, data, model, state, person, viewer, onClose }: BreakdownSheetProps) {
  const remaining = model.remaining?.[person] ?? 0
  const transferred = model.transferred[person]
  const isIn = remaining > 0
  const estimate = state === 'estimate'
  const rows = model.sum.advRows[person].slice().sort(byNewest)
  const check = model.checks[person]
  const net = model.net[person]
  const pending = model.pending.filter((e) => e.payer === person)
  const name = whoName(data, person)

  return (
    <BottomSheet open={open} label={`${name}の内訳`} onClose={onClose}>
      {/* 状態キーは S-20 のものをそのまま使う（§4 S-22） */}
      <Box data-screen='S-22' data-state={state}>
        <Flex alignItems='center' gap={2} mt={1}>
          <Avatar who={person} name={name} />
          <Box flex='1' minW='0' fontSize='lg' fontWeight='semibold' lineHeight='ui'>
            {displayName(data, person, viewer)}
          </Box>
          {estimate ? <Badge>見込み</Badge> : null}
        </Flex>

        <Divider />
        <Row label='出す額' value={num(model.contrib[person] ?? 0)} />
        {net !== null ? <Row label={`手取り ${num(net)} × ${model.ratePct[person]}%`} sub /> : null}
        <Row label='もう払った分' value={`− ${num(model.adv[person])}`} />
        {/* 給料の入り先が共用の月だけ（出す額までしか充てない。§6.2・§6.3 ケースN）。
            入る額が 0 の月は「− 0」を出さない（モックと同じ） */}
        {model.jointSalary[person] > 0 ? (
          <>
            <Row label={JOINT_SALARY_LABEL} value={`− ${num(model.jointSalary[person])}`} />
            {net !== null ? <Row label={NOTE.salaryCap(net)} sub /> : null}
          </>
        ) : null}
        {model.done[person].map((entry) => (
          <Row
            key={`${entry.at}-${entry.amount}`}
            label={`済んだ分（${monthDay(entry.at)} ${checkLabel(entry.amount > 0)}）`}
            value={`${entry.amount > 0 ? '−' : '＋'} ${num(entry.amount)}`}
          />
        ))}
        <Divider />

        {remaining === 0 ? (
          <Box fontSize='lg' fontWeight='semibold' lineHeight='ui'>
            {transferred !== 0 ? NOTE.done(transferred) : NOTE.noMove}
          </Box>
        ) : (
          <>
            <Flex alignItems='center' gap={2} fontSize='md' fontWeight='medium' color='text.sub'>
              <FlowMark from={isIn ? person : 'joint'} to={isIn ? 'joint' : person} amount={remaining} data={data} />
              <Box as='span'>{flowVerb(isIn)}</Box>
            </Flex>
            <Box
              fontSize='display'
              fontWeight='bold'
              lineHeight='tight'
              textAlign='right'
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
          </>
        )}

        {/* 押した日と押した人（S-20 のボタンは「✓ 入れた」だけ。§4 S-22） */}
        {(state === 'transfer' || state === 'settled') && check && remaining !== 0 ? (
          <Box mt={1} fontSize='sm' color='text.muted'>
            {`${checkLabel(isIn)}: ${monthDay(check.at)} ${whoName(data, check.by)}`}
          </Box>
        ) : null}

        {estimate && pending.length > 0 ? (
          <Box mt='6px' fontSize='sm' color='text.muted' lineHeight='ui'>
            {`${pending.map((e) => pendingLabel(e)).join('・')}は金額待ちで入っていません`}
          </Box>
        ) : null}

        <Box as='h3' mt={4} mb={1} fontSize='bodySm' fontWeight='semibold' color='text.sub'>
          {`もう払った分（${rows.length}件）`}
        </Box>
        <Box>
          {rows.map((e) => (
            <Flex
              key={e.id}
              alignItems='center'
              gap={3}
              minH='tapMin'
              py={1}
              borderBottom='1px solid'
              borderColor='border'
              _last={{ borderBottom: 'none' }}
            >
              <Box flex='none' w='40px' fontSize='bodySm' color='text.sub' fontVariantNumeric='tabular-nums'>
                {monthDay(e.date)}
              </Box>
              <Flex flex='1' minW='0' flexWrap='wrap' alignItems='baseline' columnGap={2}>
                <Box fontSize='lg' fontWeight='medium' lineHeight='ui'>
                  {categoryName(e.cat)}
                </Box>
                <Box
                  fontSize='bodySm'
                  fontWeight='medium'
                  color='text.muted'
                  minW='0'
                  maxW='100%'
                  overflow='hidden'
                  textOverflow='ellipsis'
                  whiteSpace='nowrap'
                >
                  {rowName(data, e)}
                </Box>
                {e.tpl ? <Badge>毎月</Badge> : null}
              </Flex>
              <Box fontSize='lg' fontWeight='semibold' fontVariantNumeric='tabular-nums' whiteSpace='nowrap'>
                {num(e.amount ?? 0)}
              </Box>
            </Flex>
          ))}
        </Box>
        <Box my={2} fontSize='sm' color='text.muted'>
          {NOTE.jointExcluded}
        </Box>
      </Box>
    </BottomSheet>
  )
}
