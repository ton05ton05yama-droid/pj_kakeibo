import { chakra } from '@chakra-ui/react'

/**
 * 素の `button` / `input` に Chakra のスタイルの書き方を足したもの。
 * `Box as='button'` だと DOM の属性（type・disabled など）が型に出ないので、こちらを使う。
 */
export const ButtonBox = chakra('button', {
  base: { cursor: 'pointer', textAlign: 'inherit' },
})

export const InputBox = chakra('input')

export const FormBox = chakra('form')

export const LabelBox = chakra('label')
