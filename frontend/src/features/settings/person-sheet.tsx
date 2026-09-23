import { Box, Flex } from '@chakra-ui/react'
import { useId, useRef } from 'react'
import { Avatar, BottomSheet, Icon, InlineMessage, PrimaryButton } from '@/components'
import { ButtonBox, LabelBox } from '@/components/primitives'
import type { Person, PersonKey } from '@/domain'
import { BareInput, Field, FieldLabel } from './settings-ui'
import { charLength, type PersonDraft, toHalfWidthDigits } from './sheets'
import type { SettingsActions } from './use-settings-actions'

/** 色の読み上げ名（§4.0.3） */
const COLOR_LABEL: Record<PersonKey, string> = { a: 'ティール', b: 'アンバー' }

export type PersonSheetProps = {
  draft: PersonDraft
  onDraft: (next: PersonDraft) => void
  /** 直す前の値（トーストの「元に戻す」で書き戻す） */
  before: Person
  onClose: () => void
  onDone: () => void
  online: boolean
  actions: SettingsActions
}

/**
 * S-33 人の設定（呼び名・色・出す割合）。**相手の行からも開いて直せる**（§2.2）。
 *
 * 一番大きく見せるものはアバター（56px。呼び名の入力に合わせて頭文字が変わる）。
 * 状態: `normal` ／ `action`（呼び名が空・7文字以上、割合が 0〜100 の外）／ `done`（トースト「保存しました」）。
 * 割合の変更は、出す額をまだ決めていない月から効く（§6.5）。
 */
export function PersonSheet({ draft, onDraft, before, onClose, onDone, online, actions }: PersonSheetProps) {
  const nameId = useId()
  const rateId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const colorLabelId = useId()

  const errorFor = (field: string): string | undefined =>
    draft.err && draft.err.field === field ? draft.err.text : undefined
  const footError = draft.err && draft.err.field === null ? draft.err : null

  const save = async (): Promise<void> => {
    if (!online) {
      onDraft({ ...draft, err: { text: 'オンラインで直せます', tone: 'info', field: null } })
      return
    }
    const name = draft.name.trim()
    if (name === '') {
      onDraft({ ...draft, err: { text: '呼び名を入れてください', tone: 'error', field: 'name' } })
      return
    }
    if (charLength(name) > 6) {
      onDraft({ ...draft, err: { text: '呼び名は6文字までです', tone: 'error', field: 'name' } })
      return
    }
    const rate = toHalfWidthDigits(draft.rate)
    if (!/^\d{1,3}$/.test(rate) || Number(rate) > 100) {
      onDraft({ ...draft, err: { text: '0〜100で入れてください', tone: 'error', field: 'rate' } })
      return
    }
    onDone()
    await actions.savePerson(draft.person, { name, color: draft.color, ratePct: Number(rate) }, before)
  }

  return (
    <BottomSheet
      open
      label={`人の設定（${draft.name}）`}
      onClose={onClose}
      adjustForKeyboard
      initialFocusRef={nameRef}
      footer={
        <Box mt={3}>
          <PrimaryButton onClick={() => void save()}>保存</PrimaryButton>
        </Box>
      }
    >
      <Box data-screen='S-33' data-state={draft.err ? 'action' : 'normal'}>
        <Flex justifyContent='center' mt={1}>
          <Avatar who={draft.color} name={draft.name} size='lg' />
        </Flex>

        <Field>
          <LabelBox htmlFor={nameId} fontSize='bodySm' fontWeight='semibold' color='text.sub' lineHeight='ui'>
            呼び名
          </LabelBox>
          <BareInput
            id={nameId}
            inputRef={nameRef}
            value={draft.name}
            autoComplete='off'
            invalid={errorFor('name') !== undefined}
            onChange={(event) => onDraft({ ...draft, name: event.target.value, dirty: true, err: null })}
          />
          {errorFor('name') ? <InlineMessage tone='error'>{errorFor('name')}</InlineMessage> : null}
        </Field>

        <Field>
          <FieldLabel id={colorLabelId}>色</FieldLabel>
          <Flex gap={4} role='radiogroup' aria-labelledby={colorLabelId}>
            {(['a', 'b'] as const).map((color) => {
              const selected = color === draft.color
              return (
                <ButtonBox
                  key={color}
                  type='button'
                  role='radio'
                  aria-checked={selected}
                  aria-label={COLOR_LABEL[color]}
                  onClick={() => onDraft({ ...draft, color, dirty: true })}
                  w='tapMin'
                  h='tapMin'
                  borderRadius='full'
                  display='grid'
                  placeItems='center'
                  border='2px solid'
                  borderColor={selected ? 'text.main' : 'transparent'}
                >
                  {/* 丸には text.muted の 1px の縁を付ける（アンバーは白地で 3:1 に届かないため。§7.2） */}
                  <Box
                    w='32px'
                    h='32px'
                    borderRadius='full'
                    display='grid'
                    placeItems='center'
                    bg={`who.${color}`}
                    color={`who.${color}.on`}
                    boxShadow='inset 0 0 0 1px {colors.text.muted}'
                  >
                    {selected ? <Icon name='check' size='16px' /> : null}
                  </Box>
                </ButtonBox>
              )
            })}
          </Flex>
        </Field>

        <Field>
          <LabelBox htmlFor={rateId} fontSize='bodySm' fontWeight='semibold' color='text.sub' lineHeight='ui'>
            出す割合
          </LabelBox>
          <Flex alignItems='center' gap={2}>
            <BareInput
              id={rateId}
              inputMode='numeric'
              pattern='[0-9]*'
              autoComplete='off'
              value={draft.rate}
              maxW='120px'
              textAlign='right'
              invalid={errorFor('rate') !== undefined}
              onChange={(event) => onDraft({ ...draft, rate: event.target.value, dirty: true, err: null })}
            />
            <Box fontSize='lg'>%</Box>
          </Flex>
          {errorFor('rate') ? <InlineMessage tone='error'>{errorFor('rate')}</InlineMessage> : null}
        </Field>

        <Box mt={2} fontSize='sm' fontWeight='medium' color='text.muted' lineHeight='ui'>
          割合の変更は、出す額をまだ決めていない月から
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
