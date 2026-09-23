/**
 * 精算タブの文言（正本: 仕様書 §1.3 ボタン文言・§1.4 状態ラベル／トースト／その場の1行）。
 *
 * **ここにある文字列だけを使う**。新しい言い方は作らない（§0.6 の5）。
 */
import type { DateTimeKey, MonthKey, MonthStatus } from '@/domain'
import { monthDay, monthShort, yen } from './format'

/* ボタン（§1.3） ---------------------------------------------------- */

export const BUTTON = {
  /** S-20 `undecided`（先月の値が無いとき）・`empty` → S-21 */
  openContribution: '出す額を決める',
  /** S-20 `undecided`。表示している出す額で決める */
  decideShown: 'この額で決める',
  /** S-20（出す額のブロック・計算を見るの中） → S-21 */
  changeNet: '手取りを変える',
  /** S-21。保存して閉じる */
  decide: '決める',
  /** S-20。式をその場で開く・閉じる */
  showCalc: '計算を見る',
  /** S-20 `estimate`。画面の状態だけを変える（月の状態は変えない） */
  settleNow: 'この月を精算する',
  /** S-20 `ready`・`redo`。精算中にする（ロック） */
  confirm: 'この金額で精算',
  /** S-20 `prep` → S-15 を順に */
  fillAmount: '金額を入れる',
  /** S-20 `transfer`・`settled` */
  reopen: '精算をやり直す',
} as const

/** チェックのボタン（§1.3）。入れる側は「入れた」、受け取る側は「受け取った」（§6.1-6） */
export const checkLabel = (isIn: boolean): string => (isIn ? '入れた' : '受け取った')

/** 向きの動詞（§6.1-3） */
export const flowVerb = (isIn: boolean): string => (isIn ? '共用へ入れる' : '共用から受け取る')

/* 状態ラベル（§1.4。S-20 の状態の1行） ------------------------------ */

export const STATUS = {
  /** `undecided`・`empty` */
  undecided: (m: MonthKey): string => `${monthShort(m)}の出す額がまだです`,
  /** `estimate` */
  estimate: (now: DateTimeKey): string => `見込み・${monthDay(now)}時点`,
  /** `prep` */
  prep: (count: number): string => `精算のまえに あと${count}件`,
  /** `ready` */
  ready: '精算できます',
  /** `ready`（2人とも 0円のとき。§6.3 ケースC） */
  noMove: (m: MonthKey): string => `${monthShort(m)}はお金を動かしません`,
  /** `transfer`（前に [鍵] を付ける） */
  transfer: '精算中',
  /** `settled`（前に [鍵] を付ける） */
  settled: (at: DateTimeKey): string => `精算済み ${monthDay(at)}`,
  /** `redo` */
  redo: 'やり直し中・済んだ分を引いています',
} as const

/** 数字の無い式（§6.1-5）。状態の1行の右に続けて置く */
export const FORMULA = '動かす額 ＝ 出す額 − もう払った分'

/* 注記（S-20・S-22） ------------------------------------------------ */

export const NOTE = {
  /** `estimate` の注記（金額待ちを含まないこと。§6.1-8） */
  excluded: (count: number): string => `金額待ち ${count}件を含みません`,
  /** `prep` */
  pendingHint: '金額が決まると、動かす額が出ます',
  /** `estimate` で、自分のもう払った分が 0件のとき */
  noAdvance: '自分のお金で払ったら記録すると、この額から引かれます',
  /** 0円のカード */
  noMove: '動かすお金はありません',
  /** やり直した後、残りが 0 のカード */
  done: (transferred: number): string => `済み（${yen(transferred)} ${checkLabel(transferred > 0)}）`,
  /** S-22 の一覧の下 */
  jointExcluded: '共用で払ったものは入りません',
} as const

/* トースト（§1.4。すべて「元に戻す」付き） --------------------------- */

export const TOAST = {
  decided: (m: MonthKey): string => `${monthShort(m)}の出す額を決めました`,
  confirmed: (m: MonthKey): string => `${monthShort(m)}を精算中にしました`,
  /** 2人とも 0円・やり直し後にすべて済み のときと、チェックがそろったとき */
  settled: (m: MonthKey): string => `${monthShort(m)}の精算がおわりました`,
  checked: (name: string, isIn: boolean): string => `${name}が${checkLabel(isIn)}ことを記録しました`,
  /** 相手のカードのチェックで精算済みになったとき */
  checkedAndSettled: (name: string, isIn: boolean, m: MonthKey): string =>
    `${name}が${checkLabel(isIn)}ことを記録しました（${monthShort(m)}の精算がおわりました）`,
  unchecked: (name: string, isIn: boolean): string => `${name}の「${checkLabel(isIn)}」を外しました`,
  reopened: (m: MonthKey): string => `${monthShort(m)}の精算をやり直します`,
} as const

/* その場の1行（§1.4。押したボタンの直下） --------------------------- */

export const LINE = {
  /** オフラインで書き込もうとした */
  offline: 'オンラインで直せます',
  /** 前の月が締め待ちのまま［この金額で精算］ */
  previousMonth: (m: MonthKey): string => `先に${monthShort(m)}を精算してください`,
  /** 相手が先に［この金額で精算］を押していた */
  alreadyConfirmed: (m: MonthKey): string => `${monthShort(m)}はもう精算中です`,
  /** 精算中・精算済みの月に書き込もうとした（S-21） */
  locked: (m: MonthKey, status: MonthStatus): string =>
    `${monthShort(m)}は${status === 'settled' ? '精算済み' : '精算中'}です（先に精算をやり直します）`,
  /** 手取りの欄が空のまま［決める］（S-21） */
  netRequired: '手取りを入れてください',
} as const
