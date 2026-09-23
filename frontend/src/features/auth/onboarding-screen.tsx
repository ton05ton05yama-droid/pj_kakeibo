import { Box, Flex } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar, Page, PrimaryButton, TextButton, TextField } from '@/components'
import { FormBox } from '@/components/primitives'
import { useHousehold, useMarkOnboarded, useUpdatePerson } from '@/data'
import { AddToHomeSheet, useAddToHome } from '@/features/settings'
import { BUTTON, charLength, MESSAGE, NAME_MAX, ONBOARDING } from './text'

/**
 * S-02 はじめに（各自の初回だけ。§4 S-02）。
 *
 * 目的は「相手にどう表示されるかを本人が決める」ことと、
 * 「ふたりの家計の支出だけを記録する」という前提を1行で伝えること。
 * 直せるのは**自分の呼び名だけ**（相手の呼び名は S-33。§2.2）。
 *
 * 状態は `normal` ／ `action`（呼び名が空・7文字以上）。
 */
export function OnboardingScreen() {
  const { data: snapshot } = useHousehold()
  const navigate = useNavigate()
  const showAddToHome = useAddToHome()
  const updatePerson = useUpdatePerson()
  const markOnboarded = useMarkOnboarded()

  const me = snapshot ? snapshot.data.people[snapshot.viewer] : null
  // 初期値は管理者が入れた表示名（§4 S-02）。読み込む前は空のまま出さない
  const [name, setName] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (snapshot === undefined || me === null) return null

  const value = name ?? me.name

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (busy) return
    const trimmed = value.trim()
    if (trimmed === '') {
      setMessage(MESSAGE.emptyName)
      return
    }
    if (charLength(trimmed) > NAME_MAX) {
      setMessage(MESSAGE.longName)
      return
    }
    setMessage(null)
    setBusy(true)
    void (async () => {
      try {
        // 呼び名だけを変える（色と出す割合はそのまま。S-33 で変えられる）
        await updatePerson.mutateAsync({
          person: snapshot.viewer,
          name: trimmed,
          color: me.color,
          ratePct: me.ratePct,
        })
        await markOnboarded.mutateAsync(snapshot.now)
        navigate('/record', { replace: true })
      } catch {
        // 書けなかったらボタンを押せる状態に戻す（S-02 にその場の1行は無い。§1.4）
        setBusy(false)
      }
    })()
  }

  return (
    <Page withTabBar={false}>
      <FormBox data-screen='S-02' data-state={message === null ? 'normal' : 'action'} onSubmit={submit} py={10}>
        {/* 一番大きく見せるもの: アバター 56px（入力に合わせて頭文字が変わる） */}
        <Flex justifyContent='center'>
          <Avatar who={me.color} name={value} size='lg' />
        </Flex>

        <Box as='h1' mt={4} fontSize='xl' fontWeight='bold' lineHeight='tight' textAlign='center'>
          {ONBOARDING.title}
        </Box>

        <TextField
          label={ONBOARDING.title}
          hideLabel
          value={value}
          onChange={(event) => {
            setName(event.target.value)
            setMessage(null)
          }}
          {...(message === null ? {} : { error: message })}
          autoComplete='nickname'
        />

        <Box mt={4} fontSize='lg' lineHeight='body' color='text.sub'>
          {ONBOARDING.lead}
        </Box>
        <Box mt={1} fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
          {ONBOARDING.note}
        </Box>

        <Box mt={6}>
          <PrimaryButton type='submit' loading={busy}>
            {BUTTON.start}
          </PrimaryButton>
        </Box>

        {/* Safari で開いているときだけ（§4 S-03） */}
        {showAddToHome ? (
          <Flex justifyContent='center' mt={2}>
            <TextButton onClick={() => setSheetOpen(true)}>{BUTTON.addToHome}</TextButton>
          </Flex>
        ) : null}
      </FormBox>
      {sheetOpen ? <AddToHomeSheet onClose={() => setSheetOpen(false)} /> : null}
    </Page>
  )
}
