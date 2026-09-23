/**
 * ログイン（S-01）と はじめに（S-02）の文言。
 *
 * **正本は仕様書 §1.3（ボタン）・§1.4（その場の1行）・§4 S-01・S-02。**
 * ここにある文字列だけを使う（新しい言い方は作らない。§0.6 の5）。
 */

/** アプリ名（S-01 の一番大きく見せるもの。index.html の `<title>` と同じ） */
export const APP_NAME = 'ふたりの家計簿'

/** ボタン（§1.3） */
export const BUTTON = {
  /** S-01 → S-02（初回）か S-11 */
  signIn: 'ログイン',
  /** S-02 → S-11（記録タブ） */
  start: 'はじめる',
  /** S-02・S-30（Safari で開いたときだけ）→ S-03 */
  addToHome: 'ホーム画面に追加',
} as const

/** その場の1行（§1.4） */
export const MESSAGE = {
  /** S-01 */
  emptyId: 'IDを入れてください',
  /** S-01 */
  emptyPassword: 'パスワードを入れてください',
  /** S-01 */
  signInFailed: 'IDかパスワードがちがいます',
  /** S-02・S-33 */
  emptyName: '呼び名を入れてください',
  /** S-02・S-33 */
  longName: '呼び名は6文字までです',
} as const

/** S-02 の説明（§4 S-02） */
export const ONBOARDING = {
  title: 'あなたの呼び名',
  lead: 'ふたりの家計で払ったものだけを記録します',
  note: '共用 ＝ ふたりの共用口座・共用カード',
} as const

/** S-01 の注記（失敗したときだけ。§4 S-01） */
export const RESET_NOTE = '忘れたときは まさとが再設定します'

/** 呼び名の上限（§1.4「呼び名は6文字までです」） */
export const NAME_MAX = 6

/** 呼び名の文字数（絵文字などを1文字と数える） */
export const charLength = (value: string): number => [...value].length
