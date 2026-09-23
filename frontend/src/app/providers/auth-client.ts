/**
 * データ層（`data/repository.ts` の `AuthRepository`）を `AuthProvider` の形に包む。
 *
 * - ID → 擬似メールの変換はデータ層が持つ（05 §4）。ここでは ID をそのまま渡す。
 * - 失敗の1行は §1.4 の「IDかパスワードがちがいます」だけ（理由は分けない。
 *   どの ID があるかを推測させないため。§4 S-01）。
 */
import { getRepository } from '@/data'
import type { AuthClient, AuthUser, SignInResult } from './auth-provider'

/** ログインに失敗したときのその場の1行（§1.4） */
const SIGN_IN_FAILED = 'IDかパスワードがちがいます'

export type AuthClientOptions = {
  /**
   * ログイン・ログアウトで人が変わったときに呼ぶ。
   * `AppProviders` は、ここで前の人ぶんの問い合わせを捨てる（TanStack Query の `clear()`）。
   */
  onSessionChange?: () => void
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const changed = (): void => options.onSessionChange?.()
  return {
    async currentUser(): Promise<AuthUser | null> {
      return await getRepository().auth.currentUser()
    },

    async signIn(loginId: string, password: string): Promise<SignInResult> {
      try {
        await getRepository().auth.signIn(loginId, password)
      } catch {
        return { ok: false, message: SIGN_IN_FAILED }
      }
      changed()
      return { ok: true }
    },

    async signOut(): Promise<void> {
      await getRepository().auth.signOut()
      changed()
    },

    onChange(listener: (user: AuthUser | null) => void): () => void {
      return getRepository().auth.onChange(listener)
    },
  }
}

/** 既定の実装（`AuthProvider` の client を渡さなかったとき） */
export const defaultAuthClient: AuthClient = createAuthClient()
