import { Box } from '@chakra-ui/react'
import type { ReactNode } from 'react'

export type SettleFootProps = {
  children: ReactNode
  /** 文字ボタンだけの固定部分（`estimate` の［この月を精算する］）は 8 ＋ 44 ＋ 4 ＝ 56px・中央寄せ */
  textOnly?: boolean
  /** その場の1行が出ているあいだは 上 4・下 0 にして 72px に抑える（§4 S-20 `ready` の縦の寸法） */
  withMessage?: boolean
}

/**
 * 下端に固定した部分（§4 S-20 の9番目の要素）。
 * ふだんは 上 8 ＋ 主ボタン 48 ＋ 下 12 ＝ 68px。置くのはボタン1つだけで、注記は足さない。
 */
export function SettleFoot({ children, textOnly, withMessage }: SettleFootProps) {
  return (
    <Box
      data-settle-foot=''
      position='sticky'
      bottom='0'
      mt='auto'
      ml='calc(-1 * var(--pad-l))'
      mr='calc(-1 * var(--pad-r))'
      pl='var(--pad-l)'
      pr='var(--pad-r)'
      pt={withMessage ? 1 : 2}
      pb={withMessage ? 0 : textOnly ? 1 : 3}
      bg='bg.page'
      zIndex='raised'
      textAlign={textOnly ? 'center' : undefined}
    >
      {children}
    </Box>
  )
}
