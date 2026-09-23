import { defineTokens } from '@chakra-ui/react'

/**
 * 仕様書 §7.1 の CSS トークンを Chakra v3 のトークンに写したもの。
 * 色の値は参考UI（pj_income_visualization/frontend/src/config/theme.ts）のパレットにそろえ、
 * 参考UIに無い色は作らない。テーマはライトだけ（仕様書 §3.9）なので `_dark` は定義しない。
 */
export const tokens = defineTokens({
  fonts: {
    body: {
      value: `"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif`,
    },
    heading: {
      value: `"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif`,
    },
  },

  // §7.3 タイポスケール
  fontSizes: {
    xs: { value: '11px' }, // タブバーのラベルだけ
    sm: { value: '12px' }, // 注記・バッジ
    bodySm: { value: '13px' }, // 補足・状態の1行・式
    md: { value: '14px' }, // チップ・セグメント・トースト・動詞
    lg: { value: '16px' }, // 一覧の主な文字・ボタン・入力欄（これより小さくしない）
    xl: { value: '18px' }, // 上部バーの年月・シートの見出し
    '2xl': { value: '20px' }, // 出す額（S-21）
    display: { value: '24px' }, // テンキーの数字・S-22 の結果・S-01 のアプリ名・56px のアバターの頭文字
    '3xl': { value: '28px' }, // 月の合計・精算のカードの金額
    '4xl': { value: '32px' }, // 入力中の金額
    input: { value: '16px' },
  },
  fontWeights: {
    regular: { value: '400' },
    medium: { value: '500' }, // 入力値・本文
    semibold: { value: '600' }, // ラベル・ボタン
    bold: { value: '700' }, // 金額・見出し
  },
  lineHeights: {
    tight: { value: '1.25' }, // 金額・見出し
    ui: { value: '1.4' }, // 1行の UI
    body: { value: '1.6' }, // 日本語の文
  },

  // §7.4 余白（4px 刻み。1〜10 は Chakra の既定と同じ値なので gutter だけ足す）
  spacing: {
    gutter: { value: '16px' },
  },

  // §7.1 sizes
  sizes: {
    tapMin: { value: '44px' },
    control: { value: '48px' }, // 主ボタン・入力欄・テンキーのキー
    controlSm: { value: '44px' }, // セグメント・そのほかのボタン・文字だけのボタン
    chip: { value: '36px' },
    rowMin: { value: '56px' },
    appbar: { value: '48px' },
    tabbar: { value: '56px' }, // ＋ env(safe-area-inset-bottom)
    notice: { value: '48px' },
    offline: { value: '32px' },
    avatar: { value: '28px' },
    avatarSm: { value: '20px' },
    avatarLg: { value: '56px' },
    icon: { value: '20px' },
    iconTab: { value: '24px' },
    keypadKey: { value: '48px' },
    gridCell: { value: '72px' }, // カテゴリのグリッド
    contentMax: { value: '480px' },
  },

  // §7.4 角丸
  radii: {
    tag: { value: '4px' },
    control: { value: '10px' }, // ボタン・入力欄・セグメント・テンキーのキー
    card: { value: '12px' }, // カード・トースト・お知らせ行
    sheet: { value: '16px' }, // シートの上端
  },

  // §7.4 影（浮くものだけに使う）
  shadows: {
    sheet: { value: '0 -8px 24px rgba(24, 24, 27, .12), 0 0 1px rgba(24, 24, 27, .30)' },
    toast: { value: '0 8px 16px rgba(24, 24, 27, .16), 0 0 1px rgba(24, 24, 27, .30)' },
  },

  durations: {
    fast: { value: '120ms' },
    base: { value: '220ms' },
  },
  easings: {
    out: { value: 'cubic-bezier(.2, .8, .2, 1)' },
  },

  // §7.1 z-index（このアプリの中だけで使う。Chakra の部品の重なりには使わない）
  zIndex: {
    raised: { value: 1 },
    sticky: { value: 10 }, // 上部バー・日付の見出し・タブバー
    overlay: { value: 50 }, // 背景幕
    sheet: { value: 100 }, // ボトムシート
    toast: { value: 150 },
  },

  // 参考UIのパレット（セマンティックトークンの参照先）
  colors: {
    gray: {
      50: { value: '#fafafa' },
      100: { value: '#f4f4f5' },
      200: { value: '#e4e4e7' },
      300: { value: '#d4d4d8' },
      400: { value: '#a1a1aa' },
      500: { value: '#71717a' },
      600: { value: '#52525b' },
      700: { value: '#3f3f46' },
      800: { value: '#27272a' },
      900: { value: '#18181b' },
    },
    blue: {
      100: { value: '#dbeafe' },
      200: { value: '#bfdbfe' },
      300: { value: '#a3cfff' },
      500: { value: '#3b82f6' },
      600: { value: '#2563eb' },
      700: { value: '#173da6' },
    },
    red: {
      50: { value: '#fef2f2' },
      500: { value: '#ef4444' },
      600: { value: '#dc2626' },
    },
    green: {
      50: { value: '#f0fdf4' },
      700: { value: '#116932' },
    },
    orange: {
      700: { value: '#92310a' },
    },
    teal: {
      100: { value: '#ccfbf1' },
      600: { value: '#0d9488' },
      700: { value: '#0c5d56' },
    },
    amber: {
      500: { value: '#f59e0b' }, // CHART_KPI_COLORS.generalCost
      700: { value: '#b45309' }, // ranking.bronze
    },
    yellow: {
      100: { value: '#fef9c3' },
    },
  },
})
