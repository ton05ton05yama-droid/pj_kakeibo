/**
 * 金額の入力（仕様書 §7.5 テンキー）の純粋な処理。
 * 金額は円の整数。7桁まで。受け付けない値は値を変えず「揺らす」（切り詰めない）。
 */

export const MAX_AMOUNT_DIGITS = 7

export type KeypadKey = '0' | '00' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'backspace'

/**
 * 先頭の 0 を落とす。
 * allowZero（S-21 の手取り）は先頭の 0 を1つ残す（空の欄で「0」「00」を押すと 0）。
 */
export function normalizeDigits(digits: string, allowZero: boolean): string {
  return digits.replace(allowZero ? /^0+(?=\d)/ : /^0+/, '')
}

/**
 * 貼り付けの判定。数字と桁区切り（¥・￥・円・全角は可）だけを受け付ける。
 * 7桁を超える値、小数点や日付を含む値は受け付けない（null を返す）。
 */
export function parsePastedAmount(text: string): string | null {
  const t = String(text ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
  if (!/^[¥￥\s]*[0-9][0-9,，]*\s*円?\s*$/.test(t)) return null
  const n = t.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
  return n.length > MAX_AMOUNT_DIGITS ? null : n
}

export type ApplyKeyOptions = {
  /** 直すとき（S-14・S-21）は最初のキーで今の値を置き換える */
  replace: boolean
  /** S-21 の手取りは 0 を入れられる */
  allowZero: boolean
}

export type ApplyKeyResult = {
  digits: string
  /** 受け付けなかった（金額を揺らす） */
  rejected: boolean
}

/** テンキーのキー（と外付けキーボードの数字・Backspace）を今の値に当てる */
export function applyKey(current: string, key: KeypadKey, options: ApplyKeyOptions): ApplyKeyResult {
  const base = options.replace ? '' : current
  if (key === 'backspace') {
    return { digits: options.replace ? '' : current.slice(0, -1), rejected: false }
  }
  const next = normalizeDigits(base + key, options.allowZero)
  if (next.length > MAX_AMOUNT_DIGITS) return { digits: current, rejected: true }
  return { digits: next, rejected: false }
}
