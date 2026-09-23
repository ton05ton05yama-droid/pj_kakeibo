import { Box, Flex } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Icon } from './icon'
import { ButtonBox } from './primitives'

export type NoticeRowProps = {
  children: ReactNode
  /** 押すと精算タブのその月へ（道案内だけ。操作は置かない。§2.3 E2） */
  onClick: () => void
}

/** お知らせ行（§3.5）: 高さ 48px、白い面に 1px の罫線、角丸 12px。赤や警告の色は使わない */
export function NoticeRow({ children, onClick }: NoticeRowProps) {
  return (
    <ButtonBox
      type='button'
      onClick={onClick}
      display='flex'
      alignItems='center'
      gap='10px'
      w='100%'
      minH='notice'
      px={3}
      mt={1}
      mb={2}
      bg='bg.surface'
      border='1px solid'
      borderColor='border'
      borderRadius='card'
      fontSize='md'
      fontWeight='medium'
      color='text.main'
      textAlign='left'
      _active={{ bg: 'bg.muted' }}
    >
      <Icon name='tabSettle' color='text.accent' />
      <Box flex='1'>{children}</Box>
      <Icon name='forward' size='16px' color='text.muted' />
    </ButtonBox>
  )
}

/** オフラインの行（§3.6）: 高さ 32px、bg.muted、cloud-off 16px ＋ 13px text.sub */
export function OfflineRow() {
  return (
    <Flex
      alignItems='center'
      gap='6px'
      h='offline'
      ml='calc(-1 * var(--pad-l))'
      mr='calc(-1 * var(--pad-r))'
      pl='var(--pad-l)'
      pr='var(--pad-r)'
      bg='bg.muted'
      color='text.sub'
      fontSize='bodySm'
      fontWeight='medium'
    >
      <Icon name='offline' size='16px' />
      オフライン（表示は最後に取得した内容）
    </Flex>
  )
}
