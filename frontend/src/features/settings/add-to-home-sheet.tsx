import { Box, Flex } from '@chakra-ui/react'
import { useRef } from 'react'
import { BottomSheet, Icon, PrimaryButton } from '@/components'

export type AddToHomeSheetProps = {
  /** 閉じる（下へのスワイプ・背景のタップ・つまみ・Esc・［わかった］） */
  onClose: () => void
}

/**
 * S-03 ホーム画面に追加（案内）。
 *
 * 見出しは置かない（読み上げ名はシートの名前「ホーム画面に追加」。§4.0.3）。
 * 手順のアイコンは押せないので青にしない（`text.sub`。§7.2）。
 * 入口（S-02・S-30）を出すかの判定は `useAddToHome()`。
 */
export function AddToHomeSheet({ onClose }: AddToHomeSheetProps) {
  // 開いたら［わかった］へフォーカスを移す（シートの最初の操作。§4.0.3）
  const okRef = useRef<HTMLElement | null>(null)
  return (
    <BottomSheet
      open
      label='ホーム画面に追加'
      onClose={onClose}
      initialFocusRef={okRef}
      footer={
        <Box
          mt={4}
          ref={(node: HTMLDivElement | null) => {
            okRef.current = node?.querySelector('button') ?? null
          }}
        >
          <PrimaryButton onClick={onClose}>わかった</PrimaryButton>
        </Box>
      }
    >
      <Box data-screen='S-03' data-state='normal'>
        <Flex as='ol' direction='column' gap={3} my={3} listStyleType='none'>
          <Step n={1}>
            <Flex as='span' alignItems='center' gap='6px'>
              共有
              <Icon name='share' color='text.sub' />
              を押す
            </Flex>
          </Step>
          <Step n={2}>
            <Flex as='span' alignItems='center' gap='6px'>
              「ホーム画面に追加」
              <Icon name='addToHome' color='text.sub' />
            </Flex>
          </Step>
          <Step n={3}>「追加」</Step>
        </Flex>
        <Box fontSize='sm' fontWeight='medium' color='text.muted' lineHeight='ui'>
          ホーム画面から開くと、もう一度ログインが要ることがあります
        </Box>
      </Box>
    </BottomSheet>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <Flex as='li' alignItems='center' gap={3} fontSize='lg' fontWeight='medium'>
      <Box
        display='grid'
        placeItems='center'
        flex='none'
        w='28px'
        h='28px'
        borderRadius='full'
        bg='bg.muted'
        color='text.sub'
        fontSize='md'
        fontWeight='bold'
        aria-hidden
      >
        {n}
      </Box>
      {children}
    </Flex>
  )
}
