import { useEffect, useState } from 'react'
import { useAuth, useToast } from '@/app/providers'
import { PlainAppBar } from '@/components'
import { useHousehold } from '@/data'
import type { DefaultPayer, PersonKey } from '@/domain'
import { isLockedStatus, monthOf, monthStatus } from '@/domain'
import { useOnline } from '@/lib/use-online'
import { AddToHomeSheet } from './add-to-home-sheet'
import { FixedCostSheet } from './fixed-cost-sheet'
import { FixedCostsPage } from './fixed-costs-page'
import { PasswordSheet } from './password-sheet'
import { PersonSheet } from './person-sheet'
import { SettingsScreen } from './settings-screen'
import { editTemplateDraft, isDirty, newTemplateDraft, passwordDraft, personDraft, type SheetDraft } from './sheets'
import { TemplateHistorySheet } from './template-history-sheet'
import { useAddToHome } from './use-add-to-home'
import { useSettingsActions } from './use-settings-actions'

/**
 * 設定タブ（S-30 → S-31 と、S-03・S-32〜S-35 のシート）。
 *
 * シートはルートにしない（§4.0.3）。入力はここが持ち、閉じたときの
 * 「入力をやめました　元に戻す」で同じ入力のまま開き直せるようにする（§1.4・§3.7）。
 */
export function SettingsTab() {
  const { data: snapshot } = useHousehold()
  const online = useOnline()
  const showAddToHome = useAddToHome()
  const toast = useToast()
  const auth = useAuth()
  const actions = useSettingsActions(snapshot)

  const [sub, setSub] = useState<'S-30' | 'S-31'>('S-30')
  const [sheet, setSheet] = useState<SheetDraft | null>(null)
  const [payerMessage, setPayerMessage] = useState<string | null>(null)

  // つながったら「オンラインで直せます」は消す（§3.6）
  useEffect(() => {
    if (online) setPayerMessage(null)
  }, [online])

  /** シートを開く。出ていたトーストは消す（§3.7） */
  const openSheet = (draft: SheetDraft): void => {
    toast.hide()
    setSheet(draft)
  }

  /** つまみ・背景のタップ・下へのスワイプ・Esc。入力があれば「入力をやめました　元に戻す」 */
  const closeSheet = (): void => {
    const current = sheet
    setSheet(null)
    if (current && isDirty(current)) {
      toast.show({ text: '入力をやめました', onUndo: () => setSheet(current) })
    }
  }

  /** 保存できたので閉じる（「入力をやめました」は出さない） */
  const dropSheet = (): void => setSheet(null)

  if (snapshot === undefined) {
    // 読み込み中（S-30 には読み込みの状態を置かないので、上部バーだけ出す）
    return <PlainAppBar>設定</PlainAppBar>
  }

  const data = snapshot.data
  const viewer = snapshot.viewer
  // 支払いをやめたひな形は、押した時点で件数・一覧・毎月の合計から外す（§4 S-30・S-31）
  const templates = data.templates.filter((t) => t.until === null)
  const month = monthOf(snapshot.now)
  const monthLocked = isLockedStatus(monthStatus(data, month, snapshot.now))
  const templateChanges = data.templateChanges ?? []

  const setDefaultPayer = (value: DefaultPayer): void => {
    // オフラインのときは切り替えない（保留もしない）。この行の直下に1行を出す（§3.6）
    if (!online) {
      setPayerMessage('オンラインで直せます')
      return
    }
    setPayerMessage(null)
    const previous = data.people[viewer].defaultPayer
    if (previous === value) return
    void actions.setDefaultPayer(value, previous)
  }

  const openPerson = (person: PersonKey): void => openSheet(personDraft(person, data.people[person]))

  const openTemplate = (id: string | null): void => {
    if (id === null) {
      openSheet(newTemplateDraft())
      return
    }
    const t = data.templates.find((x) => x.id === id)
    if (t) openSheet(editTemplateDraft(t))
  }

  const logout = (): void => {
    // 確認なしでログアウトする（§4 S-30）。S-01 へ戻すのは認証側の役目。
    // データ層のサインアウトと問い合わせの片付けは AuthClient の中で行う（app/providers/auth-client.ts）
    toast.hide()
    void auth.signOut()
  }

  return (
    <>
      {sub === 'S-30' ? (
        <SettingsScreen
          data={data}
          viewer={viewer}
          templates={templates}
          online={online}
          showAddToHome={showAddToHome}
          payerMessage={payerMessage}
          onOpenPerson={openPerson}
          onOpenTemplates={() => setSub('S-31')}
          onSetDefaultPayer={setDefaultPayer}
          onOpenPassword={() => openSheet(passwordDraft())}
          onOpenAddToHome={() => openSheet({ id: 'S-03' })}
          onLogout={logout}
        />
      ) : (
        <FixedCostsPage
          data={data}
          templates={templates}
          online={online}
          onBack={() => setSub('S-30')}
          onOpen={openTemplate}
          hasHistory={templateChanges.length > 0}
          onOpenHistory={() => openSheet({ id: 'S-35' })}
        />
      )}

      {sheet?.id === 'S-03' ? <AddToHomeSheet onClose={closeSheet} /> : null}

      {sheet?.id === 'S-35' ? (
        <TemplateHistorySheet changes={templateChanges} people={data.people} onClose={closeSheet} />
      ) : null}

      {sheet?.id === 'S-32' ? (
        <FixedCostSheet
          draft={sheet}
          onDraft={setSheet}
          data={data}
          month={month}
          monthLocked={monthLocked}
          now={snapshot.now}
          onClose={closeSheet}
          onDone={dropSheet}
          online={online}
          actions={actions}
        />
      ) : null}

      {sheet?.id === 'S-33' ? (
        <PersonSheet
          draft={sheet}
          onDraft={setSheet}
          before={data.people[sheet.person]}
          viewer={viewer}
          onClose={closeSheet}
          onDone={dropSheet}
          online={online}
          actions={actions}
        />
      ) : null}

      {sheet?.id === 'S-34' ? (
        <PasswordSheet
          draft={sheet}
          onDraft={setSheet}
          onClose={closeSheet}
          onDone={dropSheet}
          online={online}
          actions={actions}
        />
      ) : null}
    </>
  )
}
