import { Box, Flex } from '@chakra-ui/react'
import { useId, useRef } from 'react'
import { Avatar, BottomSheet, Icon, InlineMessage, PrimaryButton, Segmented, type SegmentedItem } from '@/components'
import { ButtonBox, LabelBox } from '@/components/primitives'
import type { Person, PersonKey } from '@/domain'
import { BareInput, Field, FieldLabel } from './settings-ui'
import { charLength, type PersonDraft, toHalfWidthDigits } from './sheets'
import { SALARY_TO_LABEL, type SalaryTo, type SettingsActions } from './use-settings-actions'

/** 色の読み上げ名（§4.0.3） */
const COLOR_LABEL: Record<PersonKey, string> = { a: 'ティール', b: 'アンバー' }

/** 給料の入り先の選択肢（既定は「自分の口座」）。アバターは付けず文字だけ */
const SALARY_TO_ITEMS: readonly SegmentedItem<SalaryTo>[] = [
  { value: 'self', label: SALARY_TO_LABEL.self },
  { value: 'joint', label: SALARY_TO_LABEL.joint },
]

/**
 * 相手の行の、押せない値の見せ方（押せないボタンを作らない。P7・B10）。
 * モックの `.rov` と同じ（高さ 44px・16px 600・`--text-main`）。
 */
function ReadOnlyValue({ children }: { children: string }) {
  return (
    <Box
      minH='controlSm'
      display='flex'
      alignItems='center'
      fontSize='lg'
      fontWeight='semibold'
      color='text.main'
      lineHeight='ui'
    >
      {children}
    </Box>
  )
}

export type PersonSheetProps = {
  draft: PersonDraft
  onDraft: (next: PersonDraft) => void
  /** 直す前の値（トーストの「元に戻す」で書き戻す） */
  before: Person
  /** 見ている人（相手の行では出す割合と給料の入り先を読み取り専用にする。§2.2） */
  viewer: PersonKey
  onClose: () => void
  onDone: () => void
  online: boolean
  actions: SettingsActions
}

/**
 * S-33 人の設定（呼び名・色・出す割合・給料の入り先）。**相手の行からも開ける**（§2.2）。
 *
 * 一番大きく見せるものはアバター（56px。呼び名の入力に合わせて頭文字が変わる）。
 * 状態: `normal` ／ `action`（呼び名が空・7文字以上、割合が 0〜100 の外）／ `done`（トースト「保存しました」）。
 * 割合は次に決める月から、給料の入り先は決め直した月から効く（§6.2・S-33。2026-09-23 の §12.1 Q27）。
 *
 * 直せる範囲は §2.2 の権限表のとおり（2026-09-23 の決定）:
 * - 呼び名・色 … 2人とも（相手の打ち間違いを直せるようにするため）
 * - 出す割合・給料の入り先 … **本人だけ**。相手の行では値の表示にする（押せないボタンを作らない。P7）
 */
export function PersonSheet({ draft, onDraft, before, viewer, onClose, onDone, online, actions }: PersonSheetProps) {
  /** 本人の行か（相手の行では出す割合と給料の入り先を変えられない。§2.2） */
  const own = draft.person === viewer
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
    // 相手の行では割合を直せないので、確かめるのも本人の行だけ（§2.2）
    const rate = own ? toHalfWidthDigits(draft.rate) : String(before.ratePct)
    if (own && (!/^\d{1,3}$/.test(rate) || Number(rate) > 100)) {
      onDraft({ ...draft, err: { text: '0〜100で入れてください', tone: 'error', field: 'rate' } })
      return
    }
    onDone()
    await actions.savePerson(
      draft.person,
      { name, color: draft.color, own, ratePct: Number(rate), salaryToJoint: draft.salaryToJoint },
      before
    )
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
      <Box data-screen='S-33' data-state={draft.err ? 'action' : own ? 'normal' : 'partner'}>
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
          {own ? (
            <LabelBox htmlFor={rateId} fontSize='bodySm' fontWeight='semibold' color='text.sub' lineHeight='ui'>
              出す割合
            </LabelBox>
          ) : (
            <FieldLabel>出す割合</FieldLabel>
          )}
          {own ? (
            <>
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
            </>
          ) : (
            <ReadOnlyValue>{`${before.ratePct}%`}</ReadOnlyValue>
          )}
        </Field>

        {/* 給料の入り先（§6.2）。お金の入り方は本人の事情なので、割合と同じで本人だけ（§2.2） */}
        <Field>
          <FieldLabel>給料の入り先</FieldLabel>
          {own ? (
            <Segmented
              items={SALARY_TO_ITEMS}
              value={draft.salaryToJoint ? 'joint' : 'self'}
              onChange={(value) => onDraft({ ...draft, salaryToJoint: value === 'joint', dirty: true })}
              label='給料の入り先'
            />
          ) : (
            <ReadOnlyValue>{SALARY_TO_LABEL[before.salaryToJoint ? 'joint' : 'self']}</ReadOnlyValue>
          )}
        </Field>

        {own ? (
          <Box mt={2} fontSize='sm' fontWeight='medium' color='text.muted' lineHeight='ui'>
            割合は次に決める月から、給料の入り先は決め直した月から
          </Box>
        ) : (
          <Box mt={2} fontSize='bodySm' fontWeight='medium' color='text.sub' lineHeight='ui'>
            本人だけが変えられます
          </Box>
        )}
        {footError ? (
          <Box mt={1}>
            <InlineMessage tone='info'>{footError.text}</InlineMessage>
          </Box>
        ) : null}
      </Box>
    </BottomSheet>
  )
}
