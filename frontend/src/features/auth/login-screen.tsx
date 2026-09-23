import { Box } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'
import { useAuth } from '@/app/providers'
import { IconButton, InlineMessage, Page, PrimaryButton, TextField } from '@/components'
import { FormBox } from '@/components/primitives'
import { APP_NAME, BUTTON, MESSAGE, RESET_NOTE } from './text'

/** 止まった理由（その場の1行は欄の下に出す。§4.0.3） */
type Problem = 'id' | 'password' | 'failed'

const LINE: Record<Problem, string> = {
  id: MESSAGE.emptyId,
  password: MESSAGE.emptyPassword,
  failed: MESSAGE.signInFailed,
}

/**
 * S-01 ログイン（§4 S-01）。
 *
 * 状態は4つ（`empty`「空のまま押した」／`normal`／`action`「失敗」／`done`「移る途中」）。
 * 新規登録と「パスワードを忘れた」は置かない（サインアップは OFF・メールは届かない）。
 * ID を擬似メールに変えるのはデータ層（05 §4）。
 */
export function LoginScreen() {
  const { signIn } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [busy, setBusy] = useState(false)

  const state = busy ? 'done' : problem === 'failed' ? 'action' : problem !== null ? 'empty' : 'normal'
  const failed = problem === 'failed'

  /** 欄に入力したら、その場の1行は消す（§4.0.3） */
  const clear = (): void => setProblem(null)

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (busy) return
    if (loginId.trim() === '') {
      setProblem('id')
      return
    }
    if (password === '') {
      setProblem('password')
      return
    }
    setProblem(null)
    setBusy(true)
    void signIn(loginId.trim(), password).then((result) => {
      if (result.ok) return // 入れたらこの画面ごと入れ替わる（app/app.tsx）
      setBusy(false)
      setProblem('failed')
    })
  }

  return (
    <Page withTabBar={false}>
      <FormBox
        data-screen='S-01'
        data-state={state}
        onSubmit={submit}
        display='flex'
        flexDirection='column'
        justifyContent='center'
        flex='1'
        py={6}
      >
        <Box as='h1' fontSize='display' fontWeight='bold' lineHeight='tight' textAlign='center' mb={5}>
          {APP_NAME}
        </Box>

        {/* プレースホルダーは置かない（相手の ID を見せず、入力済みに見せない。§4 S-01） */}
        <TextField
          label='ID'
          name='username'
          value={loginId}
          onChange={(event) => {
            setLoginId(event.target.value)
            clear()
          }}
          {...(problem === 'id' ? { error: LINE.id } : {})}
          invalid={failed}
          autoCapitalize='off'
          autoCorrect='off'
          spellCheck={false}
          autoComplete='username'
        />

        <TextField
          label='パスワード'
          name='password'
          type={shown ? 'text' : 'password'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            clear()
          }}
          {...(problem === 'password' ? { error: LINE.password } : {})}
          invalid={failed}
          autoComplete='current-password'
          trailing={
            <IconButton
              label={shown ? 'パスワードを隠す' : 'パスワードを表示'}
              aria-pressed={shown}
              icon={shown ? 'eyeOff' : 'eye'}
              onClick={() => setShown((value) => !value)}
            />
          }
        />
        {failed ? <InlineMessage>{LINE.failed}</InlineMessage> : null}

        <Box mt={5}>
          <PrimaryButton type='submit' loading={busy}>
            {BUTTON.signIn}
          </PrimaryButton>
        </Box>

        {/* 失敗したときだけ（§4 S-01） */}
        {failed ? (
          <Box mt={3} textAlign='center' fontSize='sm' fontWeight='medium' lineHeight='ui' color='text.muted'>
            {RESET_NOTE}
          </Box>
        ) : null}
      </FormBox>
    </Page>
  )
}
