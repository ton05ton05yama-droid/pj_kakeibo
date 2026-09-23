import { Box, Flex } from '@chakra-ui/react'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from '@/components'
import { ButtonBox, InputBox } from '@/components/primitives'

/**
 * 設定タブの中だけで使う小さな部品（見た目の値はモックの CSS と同値）。
 * `.sec` `.sgroup` `.srow` `.srow-seg` `.dash-tag` と、ラベルを持たない入力欄。
 */

export type GroupTitleProps = {
  children: ReactNode
  /** 上の余白（S-30 は余白を詰めてある。§4 S-30「縦の寸法」） */
  mt: string
  mb: string
}

/** まとまりの見出し（13px semibold text.sub。文字の高さは 21px＝行間 1.6） */
export function GroupTitle({ children, mt, mb }: GroupTitleProps) {
  return (
    <Box as='h2' fontSize='bodySm' fontWeight='semibold' color='text.sub' lineHeight='body' mt={mt} mb={mb}>
      {children}
    </Box>
  )
}

export type SettingsGroupProps = {
  children: ReactNode
  mt?: string
  mb?: string
}

/** 行のまとまり（角丸 12px・1px の枠・白い面。行のあいだに 1px の区切り線） */
export function SettingsGroup({ children, mt, mb }: SettingsGroupProps) {
  return (
    <Box
      borderRadius='card'
      overflow='hidden'
      border='1px solid'
      borderColor='border'
      bg='bg.surface'
      {...(mt ? { mt } : {})}
      {...(mb ? { mb } : {})}
      css={{ '& > * + *': { borderTop: '1px solid {colors.border}' } }}
    >
      {children}
    </Box>
  )
}

export type SettingsRowProps = {
  /** 左のアバターやアイコン（28px） */
  leading?: ReactNode
  children: ReactNode
  /** 右の値（「出す割合 40%」「5件」・払う人） */
  value?: ReactNode
  /** いちばん右（› の手前）に置くもの（S-31 の金額） */
  trailing?: ReactNode
  /** 右端の ›（先がある行だけ） */
  showChevron?: boolean
  /** 文字を青くする（ログアウト） */
  accent?: boolean
  onClick: () => void
}

/** 設定の行（最小の高さ 56px。押せる行だけを作る） */
export function SettingsRow({ leading, children, value, trailing, showChevron, accent, onClick }: SettingsRowProps) {
  return (
    <ButtonBox
      type='button'
      onClick={onClick}
      display='flex'
      alignItems='center'
      gap={3}
      w='100%'
      minH='rowMin'
      px={3}
      py={2}
      bg='bg.surface'
      textAlign='left'
      fontSize='lg'
      fontWeight={accent ? 'semibold' : 'medium'}
      color={accent ? 'text.accent' : 'text.main'}
      _active={{ bg: 'bg.muted' }}
    >
      {leading}
      <Box flex='1' minW='0'>
        {children}
      </Box>
      {value !== undefined ? (
        <Box color='text.sub' fontSize='md' whiteSpace='nowrap'>
          {value}
        </Box>
      ) : null}
      {trailing}
      {showChevron ? <Icon name='forward' color='text.muted' /> : null}
    </ButtonBox>
  )
}

export type SegmentRowProps = {
  /** 1段目のラベル（13px semibold text.sub） */
  label: string
  children: ReactNode
}

/**
 * 2段の設定の行（ラベル ＋ セグメント。S-30 の「記録の払った人」）。
 * 行全体は押せない（押せるのはセグメントの項目だけ）。高さ 76px（4 ＋ 18 ＋ 4 ＋ 44 ＋ 6）。
 */
export function SegmentRow({ label, children }: SegmentRowProps) {
  return (
    <Box bg='bg.surface' pt='4px' px={3} pb='6px'>
      <Box
        as='span'
        display='block'
        fontSize='bodySm'
        fontWeight='semibold'
        color='text.sub'
        lineHeight='18px'
        mb='4px'
      >
        {label}
      </Box>
      {children}
    </Box>
  )
}

/** 破線のタグ「金額待ち」（S-31。金額がまだ入っていない行） */
export function DashTag({ children }: { children: ReactNode }) {
  return (
    <Box
      display='inline-flex'
      alignItems='center'
      px={2}
      py='2px'
      border='1.5px dashed'
      borderColor='border.strong'
      borderRadius='tag'
      fontSize='bodySm'
      fontWeight='semibold'
      color='text.sub'
      whiteSpace='nowrap'
    >
      {children}
    </Box>
  )
}

export type FieldLabelProps = { children: ReactNode; id?: string; htmlFor?: string }

/** 欄の上のラベル（13px semibold text.sub）。セグメントや入力欄の読み上げ名に使う */
export function FieldLabel({ children, id }: FieldLabelProps) {
  return (
    <Box as='span' {...(id ? { id } : {})} fontSize='bodySm' fontWeight='semibold' color='text.sub' lineHeight='ui'>
      {children}
    </Box>
  )
}

export type BareInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** 枠を赤くする */
  invalid?: boolean
  /** 左に置く固定の文字（「¥」） */
  prefix?: string
  /** 右に重ねる操作（目のアイコン） */
  trailing?: ReactNode
  maxW?: string
  textAlign?: 'left' | 'right'
  /** 開いたときにフォーカスを移す欄に付ける（S-32 の名前の欄） */
  inputRef?: Ref<HTMLInputElement>
}

/**
 * ラベルを持たない入力欄（§7.5 の見た目は `TextField` と同じ）。
 * S-32 の金額（ラベルは「金額」のセグメントと共有）と S-33 の割合（うしろに「%」）で使う。
 * → `TextField` から入力欄だけを切り出して共通に上げたい。
 */
export function BareInput({ invalid, prefix, trailing, maxW, textAlign, inputRef, ...rest }: BareInputProps) {
  return (
    <Box position='relative' {...(maxW ? { maxW } : {})}>
      {prefix ? (
        <Box
          position='absolute'
          left={3}
          top='50%'
          transform='translateY(-50%)'
          color='text.sub'
          fontSize='lg'
          fontWeight='semibold'
        >
          {prefix}
        </Box>
      ) : null}
      <InputBox
        {...(inputRef ? { ref: inputRef } : {})}
        aria-invalid={invalid ? true : undefined}
        h='control'
        w='100%'
        pl={prefix ? '32px' : 3}
        pr={trailing ? '48px' : 3}
        borderRadius='control'
        bg='bg.input'
        border='1px solid'
        borderColor={invalid ? 'border.danger' : 'border.strong'}
        color='text.main'
        fontSize='input'
        fontWeight='medium'
        {...(textAlign ? { textAlign } : {})}
        _focus={{ outline: '2px solid', outlineColor: 'focusRing', outlineOffset: '0', borderColor: 'transparent' }}
        {...rest}
      />
      {trailing ? (
        <Box position='absolute' right='2px' top='2px'>
          {trailing}
        </Box>
      ) : null}
    </Box>
  )
}

/** 欄と欄のあいだ（`.field`: 上 12px・中の間 4px） */
export function Field({ children, mt = 3 }: { children: ReactNode; mt?: number }) {
  return (
    <Flex direction='column' gap={1} mt={mt}>
      {children}
    </Flex>
  )
}
