import { Box, Flex } from '@chakra-ui/react'
import {
  Avatar,
  Icon,
  InlineMessage,
  OfflineRow,
  PlainAppBar,
  Segmented,
  type SegmentedItem,
  usePageScrolled,
} from '@/components'
import type { DefaultPayer, FixedCostTemplate, HouseholdData, PersonKey } from '@/domain'
import { PERSON_KEYS } from '@/domain'
import { GroupTitle, SegmentRow, SettingsGroup, SettingsRow } from './settings-ui'

/** 記録の払った人の選択肢は［自分｜共用］の2つだけ（相手を既定にはできない。§11 #42）。アバターは付けず文字だけ */
const DEFAULT_PAYER_ITEMS: readonly SegmentedItem<DefaultPayer>[] = [
  { value: 'self', label: '自分' },
  { value: 'joint', label: '共用' },
]

export type SettingsScreenProps = {
  data: HouseholdData
  viewer: PersonKey
  /** やめていないひな形（件数に出す） */
  templates: readonly FixedCostTemplate[]
  online: boolean
  /** Safari で開いているときだけ「ホーム画面に追加」の行を出す */
  showAddToHome: boolean
  /** 「記録の払った人」の行の直下に出すその場の1行（オフラインのとき） */
  payerMessage: string | null
  onOpenPerson: (person: PersonKey) => void
  onOpenTemplates: () => void
  onSetDefaultPayer: (value: DefaultPayer) => void
  onOpenPassword: () => void
  onOpenAddToHome: () => void
  onLogout: () => void
}

/**
 * S-30 設定（タブのトップ）。
 *
 * 一番大きく見せるものはふたりの行（アバター 28px ＋ 呼び名 16px ＋ 出す割合）。
 * 塗りの青は置かない（主要アクション無し。行を選ぶ）。表示（テーマ）の切り替えは置かない（§3.9）。
 * 「記録の払った人」は**本人だけ**の設定なので「自分（◯◯）」に置く（§2.2）。
 * 余白は詰めてある（375×548 でスクロールが要らないようにするため。§4 S-30「縦の寸法」）。
 */
export function SettingsScreen({
  data,
  viewer,
  templates,
  online,
  showAddToHome,
  payerMessage,
  onOpenPerson,
  onOpenTemplates,
  onSetDefaultPayer,
  onOpenPassword,
  onOpenAddToHome,
  onLogout,
}: SettingsScreenProps) {
  const scrolled = usePageScrolled()
  const me = data.people[viewer]

  return (
    <Box data-screen='S-30' data-state={templates.length > 0 ? 'normal' : 'empty'}>
      <PlainAppBar scrolled={scrolled}>設定</PlainAppBar>
      {online ? null : <OfflineRow />}

      <GroupTitle mt='4px' mb='4px'>
        ふたりの設定
      </GroupTitle>
      <SettingsGroup>
        {PERSON_KEYS.map((p) => (
          <SettingsRow
            key={p}
            leading={<Avatar who={data.people[p].color} name={data.people[p].name} />}
            value={`出す割合 ${data.people[p].ratePct}%`}
            showChevron
            onClick={() => onOpenPerson(p)}
          >
            {/* 自分の名前の後ろに「（自分）」を付ける（§3.8） */}
            {data.people[p].name}
            {p === viewer ? '（自分）' : ''}
          </SettingsRow>
        ))}
      </SettingsGroup>

      <SettingsGroup mt='4px'>
        <SettingsRow
          leading={
            <Flex w='avatar' h='avatar' flex='none' alignItems='center' justifyContent='center' color='text.sub'>
              <Icon name='fixedCost' />
            </Flex>
          }
          value={templates.length > 0 ? `${templates.length}件` : 'まだありません'}
          showChevron
          onClick={onOpenTemplates}
        >
          毎月の支払い
        </SettingsRow>
      </SettingsGroup>

      <GroupTitle mt='8px' mb='4px'>
        自分（{me.name}）
      </GroupTitle>
      <SettingsGroup mb='8px'>
        {/* 行全体は押せない。押せるのはセグメントの項目だけで、押すとその場で切り替えて保存する（§4 S-30） */}
        <SegmentRow label='記録の払った人'>
          <Segmented
            items={DEFAULT_PAYER_ITEMS}
            value={me.defaultPayer}
            onChange={onSetDefaultPayer}
            label='記録の払った人'
          />
          {payerMessage ? (
            <Box mt='4px'>
              <InlineMessage tone='info'>{payerMessage}</InlineMessage>
            </Box>
          ) : null}
        </SegmentRow>
        <SettingsRow showChevron onClick={onOpenPassword}>
          パスワードを変える
        </SettingsRow>
        {showAddToHome ? (
          <SettingsRow showChevron onClick={onOpenAddToHome}>
            ホーム画面に追加
          </SettingsRow>
        ) : null}
        <SettingsRow accent onClick={onLogout}>
          ログアウト
        </SettingsRow>
      </SettingsGroup>
    </Box>
  )
}
