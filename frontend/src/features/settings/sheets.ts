import type { AmountKind, CategoryKey, FixedCostTemplate, MonthKey, Payer, Person, PersonKey } from '@/domain'
import { monthNumber } from '@/domain'

/**
 * 設定タブのシート（S-03・S-32・S-33・S-34）の入力の状態。
 *
 * 入力は**タブ側が持つ**（閉じたときの「入力をやめました　元に戻す」で、同じ入力のまま開き直すため。§1.4・§3.7）。
 */

/** その場の1行（§1.4）。`field` は出す場所（null = 欄に結びつかない1行 → 固定部分の直上） */
export interface SheetError {
  text: string
  tone: 'error' | 'info'
  field: string | null
}

/** S-03 ホーム画面に追加（入力は無い） */
export interface AddToHomeDraft {
  id: 'S-03'
}

/** S-32 毎月の支払いを追加・直す */
export interface TemplateDraft {
  id: 'S-32'
  /** 直すときのひな形の ID（null = 追加） */
  tplId: string | null
  /** 読み上げ名に使う、開いたときの名前 */
  origName: string
  name: string
  cat: CategoryKey | null
  /** 自分でカテゴリを選んだ（以後は名前から推測しない） */
  catManual: boolean
  payer: Payer
  kind: AmountKind
  /** 入力のままの金額（受け付けない値も切り詰めずに残す） */
  amount: string
  /** 受け付けない値が入っている（欄を赤い枠にする） */
  amountBad: boolean
  /** カテゴリのグリッドを出している */
  grid: boolean
  err: SheetError | null
  dirty: boolean
}

/** S-33 人の設定 */
export interface PersonDraft {
  id: 'S-33'
  person: PersonKey
  name: string
  color: PersonKey
  /** 入力のままの割合（**本人の行だけ**変えられる。§2.2） */
  rate: string
  /** 給料の入り先（true = 共用口座。**本人の行だけ**変えられる。§2.2） */
  salaryToJoint: boolean
  err: SheetError | null
  dirty: boolean
}

/** S-34 パスワードを変える */
export interface PasswordDraft {
  id: 'S-34'
  pw: string
  show: boolean
  err: SheetError | null
  dirty: boolean
}

export type SheetDraft = AddToHomeDraft | TemplateDraft | PersonDraft | PasswordDraft

/** 追加のシート（払う人の既定は共用、金額の既定は「毎月同じ」。§4 S-32） */
export function newTemplateDraft(): TemplateDraft {
  return {
    id: 'S-32',
    tplId: null,
    origName: '',
    name: '',
    cat: null,
    catManual: false,
    payer: 'joint',
    kind: 'fixed',
    amount: '',
    amountBad: false,
    grid: false,
    err: null,
    dirty: false,
  }
}

/** 直すシート（ひな形の値を入れて開く） */
export function editTemplateDraft(t: FixedCostTemplate): TemplateDraft {
  return {
    id: 'S-32',
    tplId: t.id,
    origName: t.name,
    name: t.name,
    cat: t.cat,
    catManual: true,
    payer: t.payer,
    kind: t.kind,
    amount: t.amount === null ? '' : String(t.amount),
    amountBad: false,
    grid: false,
    err: null,
    dirty: false,
  }
}

export function personDraft(person: PersonKey, p: Person): PersonDraft {
  return {
    id: 'S-33',
    person,
    name: p.name,
    color: p.color,
    rate: String(p.ratePct),
    salaryToJoint: p.salaryToJoint,
    err: null,
    dirty: false,
  }
}

export function passwordDraft(): PasswordDraft {
  return { id: 'S-34', pw: '', show: false, err: null, dirty: false }
}

/** 入力のあるシートか（閉じたときに「入力をやめました」を出すか） */
export function isDirty(draft: SheetDraft): boolean {
  return draft.id !== 'S-03' && draft.dirty
}

/** シートの読み上げ名（§4.0.3 の表） */
export function sheetLabel(draft: SheetDraft): string {
  switch (draft.id) {
    case 'S-03':
      return 'ホーム画面に追加'
    case 'S-32':
      return draft.tplId === null ? '毎月の支払いを追加' : `毎月の支払いを直す（${draft.origName}）`
    case 'S-33':
      return `人の設定（${draft.name}）`
    case 'S-34':
      return 'パスワードを変える'
  }
}

/** 「10月」（文言の中の月。§1.3） */
export const monthLabel = (m: MonthKey): string => `${monthNumber(m)}月`

/** 呼び名の文字数（絵文字などを1文字と数える。§1.4「呼び名は6文字までです」） */
export const charLength = (s: string): number => [...s].length

/** 全角の数字を半角にする（割合の欄） */
export const toHalfWidthDigits = (s: string): string =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim()
