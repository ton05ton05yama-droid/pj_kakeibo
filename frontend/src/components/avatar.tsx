import { Box } from '@chakra-ui/react'
import { Icon } from './icon'

/** 人の識別色（§7.2）。色は人に結びつけ、変数名に人の名前を入れない */
export type WhoColor = 'a' | 'b' | 'joint'

export type AvatarSize = 'sm' | 'md' | 'lg'

const box: Record<AvatarSize, string> = { sm: 'avatarSm', md: 'avatar', lg: 'avatarLg' }
const font: Record<AvatarSize, string> = { sm: '12px', md: '13px', lg: 'display' }
const houseIcon: Record<AvatarSize, string> = { sm: '12px', md: '16px', lg: '32px' }

export type AvatarProps = {
  /** 'joint'（共用）は家のアイコン、そのほかは呼び名の1文字目 */
  who: WhoColor
  /** 呼び名。頭文字を出すのに使う（共用では使わない） */
  name?: string
  /** 20px（流れの印・セグメント）／28px（一覧・カード）／56px（S-02・S-33） */
  size?: AvatarSize
}

/**
 * アバター（§7.5）。色だけに頼らないため、必ず頭文字か家のアイコンと一緒に出す（§7.2 の1）。
 * 読み上げは呼び名の文字（または家のアイコン）ではなく、周りの文で伝える前提で装飾扱いにする。
 */
export function Avatar({ who, name, size = 'md' }: AvatarProps) {
  return (
    <Box
      display='inline-grid'
      placeItems='center'
      flex='none'
      w={box[size]}
      h={box[size]}
      borderRadius='full'
      bg={`who.${who}`}
      color={`who.${who}.on`}
      fontSize={font[size]}
      fontWeight='bold'
      lineHeight='1'
      aria-hidden
    >
      {who === 'joint' ? <Icon name='joint' size={houseIcon[size]} /> : (name?.slice(0, 1) ?? '')}
    </Box>
  )
}
