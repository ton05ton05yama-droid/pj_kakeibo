import { defineSemanticTokens } from '@chakra-ui/react'

/**
 * 仕様書 §7.1 の CSS 変数と同じ名前のセマンティックトークン（`--text-main` → `text.main`）。
 * ライトだけなので `_dark` は定義しない（仕様書 §3.9）。
 */
export const semanticTokens = defineSemanticTokens({
  colors: {
    bg: {
      page: { value: '{colors.white}' }, // アプリの地は白
      surface: { value: '{colors.white}' },
      subtle: { value: '{colors.gray.50}' }, // 薄い面（日付の見出し）
      muted: { value: '{colors.gray.100}' }, // テンキーのキー・セグメントの地・チップ・押している間
      input: { value: '{colors.white}' },
      inverse: { value: '{colors.gray.700}' }, // トースト
      accent: {
        DEFAULT: { value: '{colors.blue.600}' },
        pressed: { value: '{colors.blue.700}' },
        subtle: {
          DEFAULT: { value: '{colors.blue.100}' }, // 選択中・ハイライト
          pressed: { value: '{colors.blue.200}' },
        },
      },
      danger: { subtle: { value: '{colors.red.50}' } },
      success: { subtle: { value: '{colors.green.50}' } },
    },
    backdrop: { value: 'rgba(24, 24, 27, 0.36)' }, // gray.900 の 36%
    text: {
      main: { value: '{colors.gray.800}' },
      sub: { value: '{colors.gray.600}' },
      muted: { value: '{colors.gray.500}' },
      placeholder: { value: '{colors.gray.500}' }, // 参考UIの gray.400 は白地 2.56:1 なので1段濃くする
      disabled: { value: '{colors.gray.400}' }, // S-04 の選べない月の文字だけ（§7.1）
      accent: {
        DEFAULT: { value: '{colors.blue.600}' },
        strong: { value: '{colors.blue.700}' },
      },
      danger: { value: '{colors.red.600}' },
      success: { value: '{colors.green.700}' },
      warning: { value: '{colors.orange.700}' },
      onAccent: { value: '{colors.white}' },
      onInverse: { value: '{colors.gray.50}' },
      inverseAction: { value: '{colors.blue.300}' }, // トーストの「元に戻す」
    },
    border: {
      DEFAULT: { value: '{colors.gray.200}' }, // まとまりの区切り
      strong: { value: '{colors.gray.300}' }, // 入力欄の枠
      accent: { value: '{colors.blue.300}' },
      danger: { value: '{colors.red.500}' },
    },
    focusRing: { value: '{colors.blue.500}' },

    // §7.2 3者の識別色（色は人に結びつける。変数名に人の名前を入れない）
    who: {
      a: {
        DEFAULT: { value: '{colors.teal.600}' }, // 塗り（アバター・流れの印）
        on: { value: '{colors.gray.900}' }, // 塗りの上の頭文字
        fg: { value: '{colors.teal.700}' }, // 面に置く文字・アイコン
        subtle: { value: '{colors.teal.100}' }, // 飾り用。見分けには使わない
      },
      b: {
        DEFAULT: { value: '{colors.amber.500}' },
        on: { value: '{colors.gray.900}' },
        fg: { value: '{colors.amber.700}' },
        subtle: { value: '{colors.yellow.100}' },
      },
      joint: {
        DEFAULT: { value: '{colors.gray.700}' },
        on: { value: '{colors.white}' },
        fg: { value: '{colors.gray.700}' },
        subtle: { value: '{colors.gray.200}' },
      },
    },
  },
})
