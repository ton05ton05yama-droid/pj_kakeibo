/**
 * S-12（記録・いくら？）の入力中の値。
 *
 * シートを閉じたときに「入力をやめました　元に戻す」で**入力のまま開き直す**ので（§3.7）、
 * 入力中の値はまとめて持ち運べる形にしておく。
 */
import type { CategoryKey, DateKey, DefaultPayer, Payer, PersonKey } from '@/domain'
import type { DateChoice } from './date'

export interface RecordDraft {
  cat: CategoryKey
  /** 入力中の金額の数字の並び（空文字は未入力） */
  digits: string
  memo: string
  dateChoice: DateChoice
  otherDate: DateKey | null
  payer: Payer
}

/**
 * カテゴリを押したときの初めの値。
 * 払った人の既定は、設定（S-30）で本人が決めた固定の値（P5。§12.1 Q3）。
 * 'self' はログイン中の人、'joint' は共用。前の記録や選んだカテゴリでは変わらない。
 */
export function newDraft(cat: CategoryKey, viewer: PersonKey, defaultPayer: DefaultPayer): RecordDraft {
  return {
    cat,
    digits: '',
    memo: '',
    dateChoice: 'today',
    otherDate: null,
    payer: defaultPayer === 'joint' ? 'joint' : viewer,
  }
}

/** 入力があるか（「入力をやめました」を出すかどうか。§3.7） */
export function isDirty(draft: RecordDraft, initial: RecordDraft): boolean {
  return (
    draft.digits !== initial.digits ||
    draft.memo !== initial.memo ||
    draft.dateChoice !== initial.dateChoice ||
    draft.otherDate !== initial.otherDate ||
    draft.payer !== initial.payer
  )
}
