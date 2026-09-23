import { Box, Flex } from '@chakra-ui/react'
import { useState } from 'react'
import { useToast } from '@/app/providers'
import {
  AmountDisplay,
  Avatar,
  Badge,
  BottomSheet,
  CategoryGrid,
  Chip,
  DateHeading,
  InlineMessage,
  Keypad,
  ListRow,
  MonthAppBar,
  NoticeRow,
  OfflineRow,
  PrimaryButton,
  SectionTitle,
  Segmented,
  TextButton,
  TextField,
  useAmountInput,
  usePageScrolled,
} from '@/components'
import { formatYen } from '@/lib/format'

/**
 * 共通部品の見本（開発のときだけ出す `/__components`）。
 * 画面の正本はモック（mock/index.html）と仕様書 §4 で、ここは**部品の見た目と使い方の確認用**。
 */
export function ComponentsPreview() {
  const scrolled = usePageScrolled()
  const toast = useToast()
  const [payer, setPayer] = useState('a')
  const [sheetOpen, setSheetOpen] = useState(false)
  const amount = useAmountInput({ keyboard: sheetOpen })

  return (
    <>
      <MonthAppBar
        year={2026}
        month={9}
        scrolled={scrolled}
        onPrevMonth={() => {}}
        onNextMonth={() => {}}
        onOpenMonthPicker={() => setSheetOpen(true)}
        canGoNext={false}
      />
      <OfflineRow />
      <NoticeRow onClick={() => {}}>9月の精算ができます</NoticeRow>

      <SectionTitle>ボタン</SectionTitle>
      <PrimaryButton onClick={() => toast.show({ text: '保存しました', onUndo: () => {} })}>記録する</PrimaryButton>
      <Flex gap={2} mt={2}>
        <TextButton>計算を見る</TextButton>
        <TextButton tone='danger'>削除</TextButton>
        <TextButton tone='sub' icon='check'>
          入れた
        </TextButton>
      </Flex>

      <SectionTitle>セグメント・チップ</SectionTitle>
      <Segmented
        label='払った人'
        dense
        value={payer}
        onChange={setPayer}
        items={[
          { value: 'a', label: 'まさと', leading: <Avatar who='a' name='ま' size='sm' /> },
          { value: 'b', label: 'りさこ', leading: <Avatar who='b' name='り' size='sm' /> },
          { value: 'joint', label: '共用', leading: <Avatar who='joint' size='sm' /> },
        ]}
      />
      <Flex gap={2} mt={2} alignItems='center'>
        <Chip icon='groceries' iconEnd='expand' onClick={() => {}} selected>
          食料品
        </Chip>
        <Chip onClick={() => {}}>メモ</Chip>
        <Badge icon='lock'>精算済み</Badge>
        <Badge>毎月</Badge>
      </Flex>

      <SectionTitle>一覧の行</SectionTitle>
      <DateHeading>9/22（火）</DateHeading>
      <ListRow
        leading={<Avatar who='a' name='ま' />}
        title='食料品'
        memo='スーパー'
        amount={formatYen(1280)}
        onClick={() => {}}
      />
      <ListRow
        leading={<Avatar who='joint' />}
        title='光熱費'
        badge={<Badge>毎月</Badge>}
        amount={formatYen(6200)}
        highlighted
        onClick={() => {}}
      />

      <SectionTitle>カテゴリのグリッド</SectionTitle>
      <CategoryGrid
        selectedKey='dining'
        onSelect={() => {}}
        items={[
          { key: 'groceries', label: '食料品', icon: 'groceries' },
          { key: 'dining', label: '外食', icon: 'dining' },
          { key: 'household_goods', label: '日用品', icon: 'household_goods' },
        ]}
      />

      <SectionTitle>入力欄・その場の1行</SectionTitle>
      <TextField label='ID' placeholder='masato' />
      <TextField label='名前' error='名前を入れてください' defaultValue='' />
      <Box mt={2}>
        <InlineMessage tone='info'>9月は精算中です（先に精算をやり直します）</InlineMessage>
      </Box>

      <SectionTitle>シート・テンキー</SectionTitle>
      <PrimaryButton onClick={() => setSheetOpen(true)}>シートを開く</PrimaryButton>
      <Box h={8} />

      <BottomSheet
        open={sheetOpen}
        tall
        label='いくら？（食料品）'
        onClose={() => setSheetOpen(false)}
        footer={<PrimaryButton onClick={() => setSheetOpen(false)}>記録する</PrimaryButton>}
      >
        <Flex alignItems='center' justifyContent='space-between' gap={2} minH='48px'>
          <Box fontSize='bodySm' color='text.muted' maxW='50%'>
            記録 9/22 12:03
          </Box>
          <AmountDisplay value={amount.value} muted={amount.isEmpty} shaking={amount.shaking} />
        </Flex>
        <Box mt={3}>
          <Keypad onKey={amount.press} />
        </Box>
      </BottomSheet>
    </>
  )
}
