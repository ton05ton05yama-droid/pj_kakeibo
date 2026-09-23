/**
 * データ層の入り口。
 *
 * 環境変数（`VITE_SUPABASE_URL`・`VITE_SUPABASE_PUBLISHABLE_KEY`）があれば Supabase 実装、
 * 無ければ仕様書 §9 の見本データを使うローカル実装を返す。値の説明は `frontend/.env.example`。
 * 実際のキーはリポジトリに書かない（05 §2.2）。
 */
import { createLocalRepository } from './local'
import { requestPersistentStorage } from './pending'
import type { Repository } from './repository'
import { createSupabaseRepository } from './supabase'

/** 擬似メールのドメインの既定（05 §4。どのドメインにするかは未決なので env で渡せるようにする） */
const DEFAULT_EMAIL_DOMAIN = 'kakeibo.invalid'

function read(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY' | 'VITE_AUTH_EMAIL_DOMAIN'): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 値が Supabase の URL として使える形か。
 *
 * Vercel の Config に変数名をそのまま貼るなど、形になっていない値が入ることがある。
 * そのまま `createClient()` に渡すと例外で画面が真っ白になるので、ここで弾いてローカル実装に落とす。
 */
function isUsableUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Supabase につなぐ設定がそろっているか（形になっていない値は「無い」とみなす） */
export function hasSupabaseConfig(): boolean {
  return isUsableUrl(read('VITE_SUPABASE_URL')) && read('VITE_SUPABASE_PUBLISHABLE_KEY') !== ''
}

let cached: Repository | null = null

/**
 * つながったら、端末に保留した記録を送る（§3.6。タップは要らない）。
 *
 * `main.tsx` で **1回だけ** 呼ぶ（戻り値は購読をやめる関数）。
 * `getRepository()` の中で呼ばないのは、テストで `setRepository()` に差し替えるたびに
 * 購読が増えていくのを防ぐため。リポジトリは event が来たときに引き直す。
 */
export function installOnlineFlush(): () => void {
  if (typeof window === 'undefined') return () => {}
  const onOnline = (): void => {
    void getRepository().flushPending()
  }
  window.addEventListener('online', onOnline)
  return () => {
    window.removeEventListener('online', onOnline)
  }
}

/**
 * Supabase 実装を作る。作れなかったら（設定が壊れているなど）ローカル実装に落とす。
 *
 * 画面が真っ白になるより、見本データでも動いたほうが原因を切り分けやすい。
 * 設定を直すのは開発者なので、理由はコンソールに出すだけにする。
 */
function createSupabaseOrLocal(): Repository {
  try {
    return createSupabaseRepository({
      url: read('VITE_SUPABASE_URL'),
      publishableKey: read('VITE_SUPABASE_PUBLISHABLE_KEY'),
      emailDomain: read('VITE_AUTH_EMAIL_DOMAIN') || DEFAULT_EMAIL_DOMAIN,
    })
  } catch (error) {
    console.error('[kakeibo] Supabase の設定が読めないので、見本データで動かします。', error)
    return createLocalRepository()
  }
}

/** 画面が使うリポジトリ（1つだけ作って使い回す） */
export function getRepository(): Repository {
  if (cached === null) {
    cached = hasSupabaseConfig() ? createSupabaseOrLocal() : createLocalRepository()
    // 保留した記録が7日で消えないように頼む（05 §6。main.tsx からも呼んでよい）
    requestPersistentStorage()
  }
  return cached
}

/** テストで差し替える（本番では呼ばない） */
export function setRepository(repository: Repository | null): void {
  cached = repository
}

export * from './hooks'
export {
  clearPending,
  PENDING_KEY,
  type PendingExpense,
  pendingExpenseRows,
  removePending,
  requestPersistentStorage,
  subscribePending,
} from './pending'
export * from './queryKeys'
export * from './repository'
export type { DbDate, DbMonth } from './types'
export { createLocalRepository, createSupabaseRepository }
