import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PersonKey } from '@/domain'
import { defaultAuthClient } from './auth-client'

/**
 * ログイン中の人（S-01・§3.8）。
 * 画面では「ID」を入れさせ、固定ドメインの擬似メールに変える（docs/05_platform.md §4）。
 * **その変換はデータ層（`src/data/`）が持つ**ので、ここでは ID をそのまま渡す。
 *
 * ここにあるのは**入れ物だけ**で、実際のログインは `AuthClient` が行う
 * （`app/providers/auth-client.ts` がデータ層の `AuthRepository` を包む）。
 */
export type AuthUser = {
  /** ログイン中の人（呼び名・色はデータ層の snapshot から引く） */
  viewer: PersonKey
}

export type SignInResult =
  | { ok: true }
  | {
      ok: false
      /** その場の1行（§1.4。例「IDかパスワードがちがいます」） */
      message: string
    }

export type AuthClient = {
  /** 開いたときに今のログイン状態を取る */
  currentUser: () => Promise<AuthUser | null>
  signIn: (loginId: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  /** ほかの端末・ほかのタブでセッションが変わったら呼ぶ（戻り値は購読をやめる関数） */
  onChange: (listener: (user: AuthUser | null) => void) => () => void
}

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

export type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  signIn: (loginId: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  user: null,
  signIn: async () => ({ ok: false, message: 'IDかパスワードがちがいます' }),
  signOut: async () => {},
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

export type AuthProviderProps = {
  children: ReactNode
  /** 既定はデータ層をそのまま包んだもの。テストでは差し替えられる */
  client?: AuthClient
}

export function AuthProvider({ children, client = defaultAuthClient }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  // 開いたときの状態を取り、そのあとはデータ層の合図（onChange）で追う
  useEffect(() => {
    let alive = true
    const apply = (next: AuthUser | null): void => {
      if (!alive) return
      setUser(next)
      setStatus(next === null ? 'signedOut' : 'signedIn')
    }
    const unsubscribe = client.onChange(apply)
    void client.currentUser().then(apply)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [client])

  const signIn = useCallback(
    async (loginId: string, password: string): Promise<SignInResult> => {
      const result = await client.signIn(loginId, password)
      if (result.ok) {
        setUser(await client.currentUser())
        setStatus('signedIn')
      }
      return result
    },
    [client]
  )

  const signOut = useCallback(async () => {
    await client.signOut()
    setUser(null)
    setStatus('signedOut')
  }, [client])

  const value = useMemo<AuthContextValue>(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
