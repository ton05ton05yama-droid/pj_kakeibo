import { Box, Flex } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Avatar, BackAppBar, Icon, OfflineRow, PrimaryButton, TextButton, usePageScrolled } from '@/components'
import type { FixedCostTemplate, HouseholdData, Payer } from '@/domain'
import { formatNumber, formatYen } from '@/lib/format'
import { DashTag, SettingsGroup, SettingsRow } from './settings-ui'

export type FixedCostsPageProps = {
  data: HouseholdData
  /** やめていないひな形（S-30 の件数と同じもの） */
  templates: readonly FixedCostTemplate[]
  onBack: () => void
  /** 行を押す（null = ＋ 追加） */
  onOpen: (id: string | null) => void
  /** 変更の履歴が1件以上ある（そのときだけ「変更の履歴」を出す） */
  hasHistory: boolean
  /** 「変更の履歴」を押す（S-35 を開く） */
  onOpenHistory: () => void
  online: boolean
}

/**
 * S-31 毎月の支払い（設定・ページ）。
 *
 * 一番大きく見せるものは「毎月 ¥92,090」と、その下の「＋ 金額待ち 2件」。
 * 並びは「毎月同じ（金額の多い順）」→「金額待ち」。
 * その月の金額はここでは入れない（支出・精算で入れる）。
 * 状態: `empty`（1文と塗りの［＋ 追加］）／ `normal`。
 * ［＋ 追加］の下に文字ボタン「変更の履歴」（履歴が1件以上あるときだけ。条件つき (+1)）。
 */
export function FixedCostsPage({
  data,
  templates,
  onBack,
  onOpen,
  hasHistory,
  onOpenHistory,
  online,
}: FixedCostsPageProps) {
  const scrolled = usePageScrolled()
  const fixed = templates.filter((t) => t.kind === 'fixed').sort((x, y) => (y.amount ?? 0) - (x.amount ?? 0))
  const variable = templates.filter((t) => t.kind === 'variable')
  const total = fixed.reduce((sum, t) => sum + (t.amount ?? 0), 0)
  const empty = templates.length === 0
  const historyButton: ReactNode = hasHistory ? (
    <Flex justifyContent='center' mt='8px' mb='24px'>
      <TextButton onClick={onOpenHistory}>変更の履歴</TextButton>
    </Flex>
  ) : null

  return (
    <Box data-screen='S-31' data-state={empty ? 'empty' : 'normal'}>
      <BackAppBar backLabel='設定' onBack={onBack} scrolled={scrolled}>
        毎月の支払い
      </BackAppBar>
      {online ? null : <OfflineRow />}

      {empty ? (
        <>
          <Box mt={6} fontSize='lg' color='text.sub' lineHeight='body'>
            毎月の支払いを入れると、毎月自動で記録されます
          </Box>
          <Box mt={4}>
            <PrimaryButton onClick={() => onOpen(null)}>
              <Icon name='add' />
              追加
            </PrimaryButton>
          </Box>
          {historyButton}
        </>
      ) : (
        <>
          <Box mt={2} fontSize='3xl' fontWeight='bold' lineHeight='tight' fontVariantNumeric='tabular-nums'>
            毎月 {formatYen(total)}
          </Box>
          {variable.length > 0 ? (
            <Box fontSize='bodySm' fontWeight='medium' color='text.muted' lineHeight='ui'>
              ＋ 金額待ち {variable.length}件
            </Box>
          ) : null}

          <SettingsGroup mt='16px'>
            {[...fixed, ...variable].map((t) => (
              <SettingsRow
                key={t.id}
                leading={<Icon name={t.cat} color='text.sub' />}
                value={
                  <Flex alignItems='center' gap={1}>
                    <Avatar who={t.payer} name={payerName(data, t.payer)} size='sm' />
                    {payerName(data, t.payer)}
                  </Flex>
                }
                trailing={
                  <Box minW='76px' textAlign='right' fontWeight='semibold' fontVariantNumeric='tabular-nums'>
                    {t.kind === 'fixed' ? formatNumber(t.amount ?? 0) : <DashTag>金額待ち</DashTag>}
                  </Box>
                }
                onClick={() => onOpen(t.id)}
              >
                <Box overflow='hidden' textOverflow='ellipsis' whiteSpace='nowrap'>
                  {t.name}
                </Box>
              </SettingsRow>
            ))}
          </SettingsGroup>

          <SettingsGroup mt='8px' {...(hasHistory ? {} : { mb: '24px' })}>
            <SettingsRow leading={<Icon name='add' />} accent onClick={() => onOpen(null)}>
              追加
            </SettingsRow>
          </SettingsGroup>
          {historyButton}
        </>
      )}
    </Box>
  )
}

/** 払う人の呼び名（共用は「共用」） */
function payerName(data: HouseholdData, payer: Payer): string {
  return payer === 'joint' ? '共用' : data.people[payer].name
}
