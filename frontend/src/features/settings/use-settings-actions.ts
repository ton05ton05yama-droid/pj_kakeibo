import { useRef } from 'react'
import { useToast } from '@/app/providers'
import type { Snapshot, TemplateInput } from '@/data'
import {
  useAddTemplate,
  useDeleteTemplate,
  useSignOut,
  useStopTemplate,
  useUpdateDefaultPayer,
  useUpdatePassword,
  useUpdatePerson,
  useUpdateTemplate,
} from '@/data'
import type { DefaultPayer, Person, PersonKey } from '@/domain'
import { monthLabel } from './sheets'

/** 保存する人の値（S-33） */
export interface PersonValues {
  name: string
  color: PersonKey
  ratePct: number
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
  /** 呼び名・色・出す割合（S-33） */
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
      await updatePerson.mutateAsync({ person, ...values })
      toast.show({
        text: '保存しました',
        onUndo: () => {
          // 色は片方を戻せば相手も残りの色に戻る
          void updatePerson.mutateAsync({
            person,
            name: before.name,
            color: before.color,
            ratePct: before.ratePct,
          })
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
