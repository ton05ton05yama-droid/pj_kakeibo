import { Box } from '@chakra-ui/react'
import { Icon, type IconName } from './icon'

export type BadgeProps = {
  children: React.ReactNode
  /** [鍵] 精算中・精算済みのように、前にアイコンを置くとき */
  icon?: IconName
}

/**
 * バッジ（§7.5）。ピル・12px semibold。**灰色だけ**を使う
 * （見込み・新着・未送信・送れませんでした・毎月・済み・精算中・精算済み）。
 */
export function Badge({ children, icon }: BadgeProps) {
  return (
    <Box
      display='inline-flex'
      alignItems='center'
      gap='3px'
      px='10px'
      py='2px'
      borderRadius='full'
      bg='bg.muted'
      color='text.sub'
      fontSize='sm'
      fontWeight='semibold'
      lineHeight='ui'
      whiteSpace='nowrap'
    >
      {icon ? <Icon name={icon} size='12px' /> : null}
      {children}
    </Box>
  )
}
