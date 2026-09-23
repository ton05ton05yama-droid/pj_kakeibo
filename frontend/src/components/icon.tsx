import { Box } from '@chakra-ui/react'
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CalendarSync,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CirclePlus,
  CloudOff,
  Delete,
  Ellipsis,
  Eye,
  EyeOff,
  Gift,
  House,
  Landmark,
  Lightbulb,
  Lock,
  type LucideIcon,
  Plus,
  ReceiptText,
  Settings,
  Share,
  Shield,
  ShoppingBasket,
  Sofa,
  SprayCan,
  SquarePlus,
  Stethoscope,
  Ticket,
  TrainFront,
  Tv,
  UtensilsCrossed,
  Wifi,
} from 'lucide-react'

/** 仕様書 §7.6 の対応表。同じアイコンを別の意味に使わない */
export const icons = {
  // タブ（§3.1）
  tabRecord: CirclePlus, // 記録（記録タブだけ。＋ 追加 は plus）
  tabExpenses: ReceiptText, // 支出
  tabSettle: ArrowLeftRight, // 精算
  tabSettings: Settings, // 設定
  // 共通
  joint: House, // 共用（アバター）。住まいのカテゴリは building-2
  fixedCost: CalendarSync, // 毎月の支払い
  flow: ArrowRight, // 流れの矢印（いつも右向き）
  lock: Lock, // 精算中・精算済み
  add: Plus, // ＋ 追加
  offline: CloudOff,
  backspace: Delete, // テンキーの ⌫
  forward: ChevronRight, // 行の先がある ›・次の月 ›・S-04 の次の年 ›
  back: ChevronLeft, // 戻る ‹・前の月 ‹・S-04 の前の年 ‹
  expand: ChevronDown, // 計算を見る ▾・カテゴリのチップ ▾・上部バーの年月
  collapse: ChevronUp, // 計算を見る ▴
  check: Check, // 決めた・付いたチェック ✓・選択中
  share: Share, // ホーム画面に追加の手順（S-03）
  addToHome: SquarePlus, // 同上
  eye: Eye,
  eyeOff: EyeOff,
  // カテゴリ（§8。15個・1階層で固定）
  groceries: ShoppingBasket,
  dining: UtensilsCrossed,
  household_goods: SprayCan,
  transport: TrainFront,
  leisure: Ticket,
  entertainment: Tv, // repeat は使わない（毎月の支払い calendar-sync と紛らわしい）
  social: Gift,
  housing: Building2,
  utilities: Lightbulb,
  telecom: Wifi,
  insurance: Shield,
  medical: Stethoscope,
  big_purchase: Sofa,
  tax: Landmark,
  other: Ellipsis,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof icons

export type IconProps = {
  name: IconName
  /** 大きさ。既定は 20px（一覧のアイコン）。タブバーは '24px'。sizes トークン名か CSS の長さ */
  size?: string
  /** Chakra の色トークン名（例 'text.accent'）。既定は文字の色を継ぐ */
  color?: string
  /** 読み上げる意味があるときだけ付ける。既定は装飾（aria-hidden） */
  label?: string
}

/**
 * Lucide のアイコン（線の太さ 2px）。§7.6 の名前で呼ぶ。
 * 大きさは CSS で決めるので、端末の文字サイズに合わせて崩れない。
 */
export function Icon({ name, size = 'icon', color, label }: IconProps) {
  const Lucide = icons[name]
  return (
    <Box asChild w={size} h={size} flex='none' {...(color ? { color } : {})}>
      <Lucide strokeWidth={2} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />
    </Box>
  )
}
