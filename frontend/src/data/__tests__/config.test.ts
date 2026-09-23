import { afterEach, describe, expect, it, vi } from 'vitest'

/** 環境変数を差し替えてから data 層を読み直す（import.meta.env はモジュールの評価時に読む） */
async function loadWith(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('../index')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('hasSupabaseConfig（設定の形の判定）', () => {
  it('URL と鍵がそろっていれば true', async () => {
    const { hasSupabaseConfig } = await loadWith({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy',
    })
    expect(hasSupabaseConfig()).toBe(true)
  })

  it('URL が空なら false（見本データで動く）', async () => {
    const { hasSupabaseConfig } = await loadWith({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy',
    })
    expect(hasSupabaseConfig()).toBe(false)
  })

  it('URL の形になっていない値（変数名をそのまま貼ったときなど）は false', async () => {
    const { hasSupabaseConfig } = await loadWith({
      VITE_SUPABASE_URL: 'VITE_SUPABASE_URL',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy',
    })
    expect(hasSupabaseConfig()).toBe(false)
  })

  it('http/https 以外の形も false', async () => {
    const { hasSupabaseConfig } = await loadWith({
      VITE_SUPABASE_URL: 'ftp://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy',
    })
    expect(hasSupabaseConfig()).toBe(false)
  })

  it('形が壊れていても getRepository() は落ちない（見本データのリポジトリを返す）', async () => {
    const { getRepository } = await loadWith({
      VITE_SUPABASE_URL: 'VITE_SUPABASE_URL',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy',
    })
    expect(() => getRepository()).not.toThrow()
  })
})
