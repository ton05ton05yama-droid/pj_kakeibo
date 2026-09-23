import { Box } from '@chakra-ui/react'
import { useId, useRef } from 'react'
import { BottomSheet, IconButton, InlineMessage, PrimaryButton, SheetHeader } from '@/components'
import { LabelBox } from '@/components/primitives'
import { BareInput, Field } from './settings-ui'
import type { PasswordDraft } from './sheets'
import type { SettingsActions } from './use-settings-actions'

export type PasswordSheetProps = {
  draft: PasswordDraft
  onDraft: (next: PasswordDraft) => void
  /** 閉じる（下へのスワイプ・背景のタップ・つまみ・Esc）。入力があれば「入力をやめました」 */
  onClose: () => void
  /** 変えられたので閉じる（「入力をやめました」は出さない） */
  onDone: () => void
  online: boolean
  actions: SettingsActions
}

/**
 * S-34 パスワードを変える。
 *
 * 状態: `normal`（入力前・入力中）／ `action`（8文字未満 → 欄の下に「8文字以上にしてください」）／
 * `done`（トースト「パスワードを変えました」。**元に戻すは無し**。ログインしたまま）。
 * Supabase の Secure password change は OFF にする前提（05 §2.2）。
 */
export function PasswordSheet({ draft, onDraft, onClose, onDone, online, actions }: PasswordSheetProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const fieldError = draft.err && draft.err.field === 'pw' ? draft.err : null
  const footError = draft.err && draft.err.field === null ? draft.err : null

  const save = async (): Promise<void> => {
    // オフラインの書き込みは保留しない（§3.6）
    if (!online) {
      onDraft({ ...draft, err: { text: 'オンラインで直せます', tone: 'info', field: null } })
      return
    }
    if (draft.pw.length < 8) {
      onDraft({ ...draft, err: { text: '8文字以上にしてください', tone: 'error', field: 'pw' } })
      return
    }
    const password = draft.pw
    onDone()
    await actions.changePassword(password)
  }

  return (
    <BottomSheet
      open
      label='パスワードを変える'
      onClose={onClose}
      adjustForKeyboard
      initialFocusRef={inputRef}
      footer={
        <Box mt={3}>
          <PrimaryButton onClick={() => void save()}>変える</PrimaryButton>
        </Box>
      }
    >
      <Box data-screen='S-34' data-state={draft.err ? 'action' : 'normal'}>
        <Box mt={1}>
          <SheetHeader>
            <LabelBox htmlFor={id}>パスワードを変える</LabelBox>
          </SheetHeader>
        </Box>
        <Field>
          <BareInput
            id={id}
            inputRef={inputRef}
            type={draft.show ? 'text' : 'password'}
            autoComplete='new-password'
            value={draft.pw}
            invalid={fieldError !== null}
            onChange={(event) => onDraft({ ...draft, pw: event.target.value, dirty: true, err: null })}
            trailing={
              <IconButton
                label={draft.show ? 'パスワードを隠す' : 'パスワードを表示'}
                icon={draft.show ? 'eyeOff' : 'eye'}
                aria-pressed={draft.show}
                onClick={() => onDraft({ ...draft, show: !draft.show })}
              />
            }
          />
          {fieldError ? <InlineMessage tone='error'>{fieldError.text}</InlineMessage> : null}
        </Field>
        <Box mt='6px' fontSize='sm' fontWeight='medium' color='text.muted' lineHeight='ui'>
          12文字以上がおすすめです
        </Box>
        {footError ? (
          <Box mt={1}>
            <InlineMessage tone='info'>{footError.text}</InlineMessage>
          </Box>
        ) : null}
      </Box>
    </BottomSheet>
  )
}
