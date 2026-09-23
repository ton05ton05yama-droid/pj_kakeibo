import { createSystem, defaultConfig } from '@chakra-ui/react'
import { semanticTokens } from './semantic-tokens'
import { tokens } from './tokens'

/**
 * 仕様書 §7 のビジュアル仕様を Chakra v3 の system にしたもの。
 * ライトだけ（`_dark` を定義せず、`.dark` クラスも付けない。仕様書 §3.9）。
 */
export const system = createSystem(defaultConfig, {
  globalCss: {
    // ===== 土台（仕様書 §7.1） =====
    ':root': {
      colorScheme: 'light',
      // safe-area（§3.1・§7.4）。画面の左右は gutter を下回らない
      '--sa-top': 'env(safe-area-inset-top, 0px)',
      '--sa-bottom': 'env(safe-area-inset-bottom, 0px)',
      '--pad-l': 'max(16px, env(safe-area-inset-left, 0px))',
      '--pad-r': 'max(16px, env(safe-area-inset-right, 0px))',
      // 固定した帯の高さ（tokens.ts の sizes.tabbar・sizes.appbar と同じ値）。
      // 位置（top/bottom）には sizes のトークン名を渡せないので、この CSS 変数を使う（§3.1）
      '--tabbar-h': '56px',
      '--appbar-h': '48px',
      // シートの最大の高さ（§4.0.3）
      '--sheet-max-h': '90dvh',
      '--sheet-tall-max-h': 'calc(100dvh - max(24px, env(safe-area-inset-top, 0px) + 8px))',
    },
    'html, body': { height: '100%' },
    html: {
      fontFamily: 'body',
      fontSize: '16px',
      textSizeAdjust: '100%',
      bg: 'bg.page',
      color: 'text.main',
    },
    body: {
      margin: 0,
      fontSize: 'lg',
      lineHeight: 'body',
      bg: 'bg.page',
      color: 'text.main',
      WebkitTapHighlightColor: 'transparent',
      // スマホ専用。ページ全体の横スクロールは出さない
      overflowX: 'hidden',
    },
    // 入力欄は 16px 以上（iOS の拡大を防ぐ。§7.1）
    'input, select, textarea': {
      fontFamily: 'inherit',
      fontWeight: 'inherit',
      color: 'inherit',
      fontSize: 'max(16px, 1em)',
    },
    button: { cursor: 'pointer' },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: 'focusRing',
      outlineOffset: '2px',
    },
    // 動きを減らす設定のときは、シートの出入り・揺れ・トーストの動きを止める。
    // 色だけの変化（保存直後の行のハイライト）は各部品の側で残す（§7.1）
    '*, *::before, *::after': {
      '@media (prefers-reduced-motion: reduce)': {
        transitionDuration: '0ms !important',
        animationDuration: '0ms !important',
      },
    },
  },
  theme: {
    tokens,
    semanticTokens,
    keyframes: {
      // シートが下から出る（§4.0.3。220ms ease-out）
      sheetUp: { from: { transform: 'translateY(40%)', opacity: 0.4 } },
      // 背景幕
      backdropIn: { from: { opacity: 0 } },
      // 受け付けない入力のときに金額を揺らす（§7.5 テンキー）
      shake: {
        '20%': { transform: 'translateX(-6px)' },
        '40%': { transform: 'translateX(5px)' },
        '60%': { transform: 'translateX(-3px)' },
        '80%': { transform: 'translateX(2px)' },
      },
      // 保存直後の行のハイライト（1.2秒。§7.5 一覧の行）
      rowHighlight: {
        '0%, 70%': { background: 'var(--chakra-colors-bg-accent-subtle)' },
        '100%': { background: 'transparent' },
      },
    },
  },
})
