import { Box, Flex } from '@chakra-ui/react'
import { type InputHTMLAttributes, useId } from 'react'
import { InputBox, LabelBox } from './primitives'

export type InlineMessageTone = 'error' | 'info'

export type InlineMessageProps = {
  children: React.ReactNode
  /** エラー = text.danger、案内 = text.sub（§1.4 の色の列） */
  tone?: InlineMessageTone
}

/**
 * その場の1行（§1.4・§4.0.3）: 13px、`role="alert"`。
 * シートの高さを増やさない場所に出す（置き場所は画面ごとに決まっている）。
 */
export function InlineMessage({ children, tone = 'error' }: InlineMessageProps) {
  return (
    <Box
      role='alert'
      fontSize='bodySm'
      fontWeight='medium'
      lineHeight='ui'
      color={tone === 'error' ? 'text.danger' : 'text.sub'}
    >
      {children}
    </Box>
  )
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** 上に置くラベル（13px semibold text.sub） */
  label: string
  /**
   * ラベルを読み上げだけにする（見出しが欄の名前を兼ねているとき。S-02）。
   * 欄との結びつきは残すので、読み上げでは欄の名前が分かる
   */
  hideLabel?: boolean
  /** 枠を赤くし、下にその場の1行を出す */
  error?: string
  /**
   * 枠だけ赤くする（その場の1行は別の場所に出すとき）。
   * S-01 でログインに失敗したときは、2つの欄を赤くして1行はパスワードの下に1つだけ出す
   */
  invalid?: boolean
  /** 案内の1行（エラーではないとき） */
  hint?: string
  /** 右に重ねる操作（目のアイコンなど） */
  trailing?: React.ReactNode
  /** 左に置く固定の文字（「¥」など） */
  prefix?: string
}

/** 入力欄（文字。§7.5）: 高さ 48px、角丸 10px、1px border.strong、16px medium */
export function TextField({ label, hideLabel, error, invalid, hint, trailing, prefix, ...rest }: TextFieldProps) {
  const id = useId()
  const bad = error !== undefined && error !== '' ? true : invalid === true
  return (
    <Flex direction='column' gap={1} mt={3}>
      <LabelBox
        htmlFor={id}
        fontSize='bodySm'
        fontWeight='semibold'
        color='text.sub'
        lineHeight='ui'
        {...(hideLabel
          ? {
              position: 'absolute',
              w: '1px',
              h: '1px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              clipPath: 'inset(50%)',
            }
          : {})}
      >
        {label}
      </LabelBox>
      <Box position='relative'>
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
          id={id}
          aria-invalid={bad ? true : undefined}
          h='control'
          w='100%'
          pl={prefix ? '32px' : 3}
          pr={trailing ? '48px' : 3}
          borderRadius='control'
          bg='bg.input'
          border='1px solid'
          borderColor={bad ? 'border.danger' : 'border.strong'}
          color='text.main'
          fontSize='input'
          fontWeight='medium'
          css={{ '&::placeholder': { color: 'text.placeholder' } }}
          _focus={{
            outline: '2px solid',
            outlineColor: 'focusRing',
            outlineOffset: '0',
            borderColor: 'transparent',
          }}
          {...rest}
        />
        {trailing ? (
          <Box position='absolute' right='2px' top='2px'>
            {trailing}
          </Box>
        ) : null}
      </Box>
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      {!error && hint ? <InlineMessage tone='info'>{hint}</InlineMessage> : null}
    </Flex>
  )
}
