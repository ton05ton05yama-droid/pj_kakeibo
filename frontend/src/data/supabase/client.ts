/**
 * Supabase の入り口。
 *
 * - ブラウザから直接呼び、守りは RLS（04 §0 の1）。
 * - 端末に置くのは **publishable key だけ**。secret key・DB の接続文字列は置かない（05 §2.2）。
 * - 画面では「ID」を入れさせ、固定ドメインの擬似メールに変える（05 §4）。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AuthError, RepositoryError } from '../repository'

export interface SupabaseConfig {
  url: string
  publishableKey: string
  /** 擬似メールのドメイン（`masato` → `masato@<この値>`） */
  emailDomain: string
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // サインアップは無効。ユーザーはダッシュボードで作る（05 §4）
      detectSessionInUrl: false,
    },
  })
}

/** ID → 擬似メール（DB で ID からメールを引かない。05 §4 の1） */
export function toPseudoEmail(loginId: string, emailDomain: string): string {
  return `${loginId.trim().toLowerCase()}@${emailDomain}`
}

/**
 * 擬似メール → ID（`masato@kakeibo.example.jp` → `masato`）。
 * 端末から読めるのはログイン中の人のメールだけ（`auth.users` は Data API に出していない）。
 * 相手の ID はどの画面にも出さないので、空のままでよい（S-01 は本人が入れる）。
 */
export function loginIdFromEmail(email: string | undefined): string {
  if (email === undefined) return ''
  const at = email.indexOf('@')
  return at < 0 ? email : email.slice(0, at)
}

interface PostgrestLikeError {
  message: string
  code?: string
  details?: string | null
}

/** DB のエラーを画面の1行（仕様書 §1.4）に結びつく形に変える */
export function toRepositoryError(error: PostgrestLikeError): RepositoryError {
  const message = error.message
  if (message.includes('month_locked')) {
    return new RepositoryError('month_locked', 'その月は精算中です', error.details ?? null)
  }
  if (message.includes('fixed_row_immutable')) {
    return new RepositoryError('fixed_row_immutable', 'この行は直せません')
  }
  if (message.includes('not_member')) {
    return new RepositoryError('not_member', '家計に入っていません')
  }
  if (error.code === 'PGRST301' || message.includes('Failed to fetch')) {
    return new RepositoryError('offline', 'つながりませんでした')
  }
  return new RepositoryError('unknown', message)
}

export function toAuthError(error: { message: string; status?: number }): AuthError {
  if (error.status === 400 || error.message.includes('Invalid login credentials')) {
    return new AuthError('invalid_credentials', 'ID かパスワードが違います')
  }
  if (error.message.includes('Failed to fetch')) {
    return new AuthError('offline', 'つながりませんでした')
  }
  return new AuthError('unknown', error.message)
}
