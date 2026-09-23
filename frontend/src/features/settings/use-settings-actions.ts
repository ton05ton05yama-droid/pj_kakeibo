import { useRef } from 'react'
import { useToast } from '@/app/providers'
import type { Snapshot, TemplateInput } from '@/data'
import {
  useAddTemplate,
  useDeleteTemplate,
  useSignOut,
  useStopTemplate,
  useUpdateContributionRate,
  useUpdateDefaultPayer,
  useUpdatePassword,
  useUpdatePerson,
  useUpdateSalaryToJoint,
  useUpdateTemplate,
} from '@/data'
import type { DefaultPayer, Person, PersonKey } from '@/domain'
import { monthLabel } from './sheets'

/** 給料の入り先（S-33）。'joint' = 共用口座、'self' = 自分の口座 */
export type SalaryTo = 'self' | 'joint'

/** 給料の入り先の呼び名（§1.1。セグメントの項目とトーストで同じ言葉を使う） */
export const SALARY_TO_LABEL: Record<SalaryTo, string> = { self: '自分の口座', joint: '共用口座' }

/** 保存する人の値（S-33） */
export interface PersonValues {
  name: string
  color: PersonKey
  /**
   * 本人の行か（§2.2。出す割合と給料の入り先は**本人だけ**が変えられるので、
   * 相手の行では送らない）
   */
  own: boolean
  ratePct: number
  salaryToJoint: boolean
}

/**
 * 設定タブの書き込み（トーストの「元に戻す」まで）。
 *
 * **設定タブ（いちばん外）で1つだけ作る。** シートは保存すると閉じて消えるので、
 * 「元に戻す」を押したときに動くように、書き込みは閉じない側に置く。
 */
export interface SettingsActions {
  /** 記録の払った人（S-30。その場で保存してトースト） */
  setDefaultPayer: (value: DefaultPayer, previous: DefaultPayer) => Promise<void>
  /** 呼び名・色・出す割合・給料の入り先（S-33。割合と入り先は本人の行だけ。§2.2） */
  savePerson: (person: PersonKey, values: PersonValues, before: Person) => Promise<void>
  /** 毎月の支払いを足す（S-32） */
  addTemplate: (input: TemplateInput) => Promise<void>
  /** 毎月の支払いを直す（S-32）。変更はまだ作っていない月から効く（§6.5） */
  updateTemplate: (id: string, input: TemplateInput, before: TemplateInput) => Promise<void>
  /** 支払いをやめる（S-32） */
  stopTemplate: (id: string, name: string) => Promise<void>
  /** パスワードを変える（S-34。元に戻すは無し） */
  changePassword: (password: string) => Promise<void>
  /** ログアウト（S-30 → S-01。確認なし・元に戻すは無し） */
  signOut: () => Promise<void>
}

export function useSettingsActions(snapshot: Snapshot | undefined): SettingsActions {
  const toast = useToast()

  // 「元に戻す」を押した時点の最新のデータを見る（足したひな形の ID を引くため）
  const latest = useRef<Snapshot | undefined>(snapshot)
  latest.current = snapshot

  const updateDefaultPayer = useUpdateDefaultPayer()
  const updatePerson = useUpdatePerson()
  const updateContributionRate = useUpdateContributionRate()
  const updateSalaryToJoint = useUpdateSalaryToJoint()
  const addTemplateM = useAddTemplate()
  const updateTemplateM = useUpdateTemplate()
  const stopTemplateM = useStopTemplate()
  const deleteTemplateM = useDeleteTemplate()
  const updatePassword = useUpdatePassword()
  const signOutM = useSignOut()

  return {
    async setDefaultPayer(value, previous) {
      await updateDefaultPayer.mutateAsync(value)
      toast.show({
        text: `記録の払った人を『${value === 'joint' ? '共用' : '自分'}』にしました`,
        onUndo: () => {
          void updateDefaultPayer.mutateAsync(previous)
        },
      })
    },

    async savePerson(person, values, before) {
      // 直す前の値はここで控える（`before` は読み込んだデータそのものなので、
      // 書き込んだあとに読むと新しい値になっていて「元に戻す」が効かない）
      const prev = {
        name: before.name,
        color: before.color,
        ratePct: before.ratePct,
        salaryToJoint: before.salaryToJoint,
      }
      // 呼び名と色は2人とも変えられる。出す割合と給料の入り先は本人の行だけ（§2.2）
      await updatePerson.mutateAsync({ person, name: values.name, color: values.color })
      const rateChanged = values.own && values.ratePct !== prev.ratePct
      const salaryChanged = values.own && values.salaryToJoint !== prev.salaryToJoint
      if (rateChanged) await updateContributionRate.mutateAsync(values.ratePct)
      if (salaryChanged) await updateSalaryToJoint.mutateAsync(values.salaryToJoint)
      toast.show({
        // 給料の入り先を変えたときは、何を変えたかが分かる言い方にする（§1.4）
        text: salaryChanged
          ? `給料の入り先を『${SALARY_TO_LABEL[values.salaryToJoint ? 'joint' : 'self']}』にしました`
          : '保存しました',
        onUndo: () => {
          // 色は片方を戻せば相手も残りの色に戻る
          void updatePerson.mutateAsync({ person, name: prev.name, color: prev.color })
          if (rateChanged) void updateContributionRate.mutateAsync(prev.ratePct)
          if (salaryChanged) void updateSalaryToJoint.mutateAsync(prev.salaryToJoint)
        },
      })
    },

    async addTemplate(input) {
      const known = new Set((latest.current?.data.templates ?? []).map((t) => t.id))
      await addTemplateM.mutateAsync(input)
      toast.show({
        text: `${input.name}を追加しました`,
        onUndo: () => {
          const added = (latest.current?.data.templates ?? []).find((t) => !known.has(t.id))
          if (added) void deleteTemplateM.mutateAsync({ id: added.id })
        },
      })
    },

    async updateTemplate(id, input, before) {
      await updateTemplateM.mutateAsync({ id, input })
      toast.show({
        text: '保存しました',
        onUndo: () => {
          void updateTemplateM.mutateAsync({ id, input: before })
        },
      })
    },

    async stopTemplate(id, name) {
      const result = await stopTemplateM.mutateAsync({ id })
      const until = result.result === 'blocked' ? null : result.value.until
      toast.show({
        text: until === null ? `${name}をやめました` : `${name}をやめました（${monthLabel(until)}から）`,
        onUndo: () => {
          void stopTemplateM.mutateAsync({ id, undo: true })
        },
      })
    },

    async changePassword(password) {
      await updatePassword.mutateAsync(password)
      // 元に戻すは置かない（§1.4）
      toast.show({ text: 'パスワードを変えました' })
    },

    async signOut() {
      toast.hide()
      await signOutM.mutateAsync()
    },
  }
}
