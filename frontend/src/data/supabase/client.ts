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

/**
 * つながらないときの文面（ブラウザごとに違う）。
 * Chrome/Edge は 'TypeError: Failed to fetch'、Safari は 'Load failed'、Firefox は 'NetworkError ...'、
 * iOS の WKWebView は 'Network request failed'。文面に頼り切らず `navigator.onLine` も見る。
 */
const OFFLINE_RE = /failed to fetch|load failed|networkerror|network request failed/i

/**
 * RLS に弾かれた・行が返らなかったときの既定の文言。
 * どの操作で起きたかは呼び出し側が知っているので、`supabase/index.ts` がこの文言のときだけ
 * 操作ごとの文言（「相手の記録は直せません」など）に差し替える。
 */
export const NOT_ALLOWED = 'この操作はできません'

/** つながっていないとみなすか（文面 ＋ 端末の状態） */
function isOffline(message: string): boolean {
  return OFFLINE_RE.test(message) || (typeof navigator !== 'undefined' && navigator.onLine === false)
}

/**
 * DB のエラーを画面の1行（仕様書 §1.4）に結びつく形に変える。
 *
 * RLS で弾かれた（`42501`）・行が返らなかった（`PGRST116`）は、**理由をここでは決めない**。
 * 「その月が精算中」なのか「相手の行」なのかは、呼び出し側（S-12・S-14 の画面）が手元の
 * `monthStatus` で判定済みなので、ここで月の状態を引き直さず `not_allowed` で返す（案1）。
 */
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
  // RLS の with check / using に弾かれた（Postgres の 42501）
  if (error.code === '42501' || message.includes('violates row-level security policy')) {
    return new RepositoryError('not_allowed', NOT_ALLOWED, error.details ?? null)
  }
  // .single() が 0 件（＝ RLS で読めない・その行が無い）
  if (error.code === 'PGRST116') {
    return new RepositoryError('not_allowed', NOT_ALLOWED, error.details ?? null)
  }
  // JWT の期限切れ。つながっていないのではなく、ログインし直してもらう
  if (error.code === 'PGRST301') {
    return new RepositoryError('not_allowed', 'ログインし直してください')
  }
  if (isOffline(message)) {
    return new RepositoryError('offline', 'つながりませんでした')
  }
  return new RepositoryError('unknown', message)
}

export function toAuthError(error: { message: string; status?: number }): AuthError {
  if (error.status === 400 || error.message.includes('Invalid login credentials')) {
    return new AuthError('invalid_credentials', 'ID かパスワードが違います')
  }
  if (isOffline(error.message)) {
    return new AuthError('offline', 'つながりませんでした')
  }
  return new AuthError('unknown', error.message)
}
