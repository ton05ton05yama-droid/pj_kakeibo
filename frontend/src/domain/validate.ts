/**
 * 入れてよい数の範囲（正本: docs/02_settlement.md §7.2 の表の下の注、docs/04_data_model.md §3 の
 * `expenses.amount` / `settlement_lines.net_income` の check、docs/03_ui_spec.md S-12・S-21）。
 *
 * DB の check 制約と同じ範囲をドメイン側でも見て、ローカル実装でも同じところで止まるようにする。
 * ここで投げるのは作り間違いを知らせるためのもので、画面には出さない（文言は仕様書 §1.4）。
 */

/** 金額・手取りの上限（7桁。テンキーは7桁まで） */
export const AMOUNT_MAX = 9_999_999

/** 記録の金額の下限（0円の記録は作れない） */
export const AMOUNT_MIN = 1

/** 手取りの下限（手取りが無い月は 0 で、出す額も 0 になる） */
export const NET_MIN = 0

/** 記録の金額（1〜9,999,999 の整数）。外れていたら投げる */
export function assertAmount(n: number): void {
  if (!Number.isInteger(n) || n < AMOUNT_MIN || n > AMOUNT_MAX) {
    throw new Error(`金額は ${AMOUNT_MIN}〜${AMOUNT_MAX} の整数です: ${n}`)
  }
}

/** 手取り（0〜9,999,999 の整数）。外れていたら投げる */
export function assertNet(n: number): void {
  if (!Number.isInteger(n) || n < NET_MIN || n > AMOUNT_MAX) {
    throw new Error(`手取りは ${NET_MIN}〜${AMOUNT_MAX} の整数です: ${n}`)
  }
}
