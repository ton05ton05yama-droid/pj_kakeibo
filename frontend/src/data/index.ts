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

/** Supabase につなぐ設定がそろっているか */
export function hasSupabaseConfig(): boolean {
  return read('VITE_SUPABASE_URL') !== '' && read('VITE_SUPABASE_PUBLISHABLE_KEY') !== ''
}

let cached: Repository | null = null

/** つながったら、端末に保留した記録を送る（§3.6。タップは要らない） */
function installOnlineFlush(repository: Repository): void {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => {
    void repository.flushPending()
  })
}

/** 画面が使うリポジトリ（1つだけ作って使い回す） */
export function getRepository(): Repository {
  if (cached === null) {
    cached = hasSupabaseConfig()
      ? createSupabaseRepository({
          url: read('VITE_SUPABASE_URL'),
          publishableKey: read('VITE_SUPABASE_PUBLISHABLE_KEY'),
          emailDomain: read('VITE_AUTH_EMAIL_DOMAIN') || DEFAULT_EMAIL_DOMAIN,
        })
      : createLocalRepository()
    // 保留した記録が7日で消えないように頼む（05 §6。main.tsx からも呼んでよい）
    requestPersistentStorage()
    installOnlineFlush(cached)
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
