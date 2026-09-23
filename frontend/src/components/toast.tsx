import { Box, Flex } from '@chakra-ui/react'
import { ButtonBox } from './primitives'

export type ToastProps = {
  text: string
  /** 「元に戻す」。パスワードの変更とログアウトでは置かない（§3.7） */
  onUndo?: (() => void) | undefined
  /**
   * 下端に固定した部分（S-20 の主ボタン）があるときの、その高さぶんの持ち上げ。
   * タブバーが無い画面では '0px' を渡す
   */
  offsetBottom?: string | undefined
  /**
   * 下にタブバーがある画面（タブのトップ）は true（既定）。
   * タブバーの無い画面（S-01・S-02）は false にして、画面の下端から 16px の位置に出す
   * （モックの `.toast.nobar`）。
   */
  withTabBar?: boolean | undefined
}

/**
 * トースト（§3.7・§7.5）: 下の中央、タブバーの 8px 上、最小の高さ 48px、角丸 12px、bg.inverse。
 *
 * **見た目だけを担当する**。出し入れ（6秒・一度に1つ）と `role="status"` の入れ物は
 * `ToastProvider` が持つ（app/providers/toast-provider.tsx）。
 */
export function Toast({ text, onUndo, offsetBottom = '0px', withTabBar = true }: ToastProps) {
  return (
    <Flex
      position='fixed'
      left='var(--pad-l)'
      right='var(--pad-r)'
      bottom={
        withTabBar
          ? `calc(var(--tabbar-h) + var(--sa-bottom) + 8px + ${offsetBottom})`
          : `calc(var(--sa-bottom) + 16px + ${offsetBottom})`
      }
      zIndex='toast'
      alignItems='center'
      gap={3}
      minH='48px'
      pl={4}
      pr={2}
      py='6px'
      borderRadius='card'
      bg='bg.inverse'
      color='text.onInverse'
      fontSize='md'
      fontWeight='medium'
      lineHeight='ui'
      boxShadow='toast'
      maxW='contentMax'
      mx='auto'
    >
      <Box flex='1'>{text}</Box>
      {onUndo ? (
        <ButtonBox
          type='button'
          onClick={onUndo}
          minH='tapMin'
          px={2}
          borderRadius='control'
          color='text.inverseAction'
          fontSize='md'
          fontWeight='bold'
          whiteSpace='nowrap'
        >
          元に戻す
        </ButtonBox>
      ) : null}
    </Flex>
  )
}
