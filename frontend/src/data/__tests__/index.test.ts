/**
 * データ層の入り口（`data/index.ts`）が、環境変数でどちらの実装を返すかだけを見る。
 *
 * - 空なら **仕様書 §9 の見本データを使うローカル実装**（Supabase のプロジェクトがまだ無くても動く）
 * - `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` がそろえば Supabase 実装
 *
 * テストでは `.env.local` の値が見えないように、`vite.config.ts` の `test.env` で3つとも空にしている。
 * Supabase 実装はここでは作らず（本物は `data/__tests__/supabase.test.ts` が見る）、
 * 渡された設定だけを覚える偽物に差し替える。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summarize } from '../../domain'
import type { Repository } from '../repository'
import type { SupabaseConfig } from '../supabase/client'

/** 偽の Supabase 実装に渡された設定（作られた順） */
const created = vi.hoisted(() => ({ configs: [] as SupabaseConfig[] }))

vi.mock('../supabase', () => ({
  createSupabaseRepository: (config: SupabaseConfig): Repository => {
    created.configs.push(config)
    return { supabase: config } as unknown as Repository
  },
}))

const { getRepository, hasSupabaseConfig, setRepository } = await import('../index')

beforeEach(() => {
  setRepository(null)
  created.configs.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  setRepository(null)
})

describe('getRepository()', () => {
  it('環境変数が空なら、見本データ（§9）のローカル実装を返す', async () => {
    expect(hasSupabaseConfig()).toBe(false)

    const repository = getRepository()
    expect(created.configs).toHaveLength(0)

    await repository.auth.signIn('masato', 'pw')
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.viewer).toBe('a')
    expect(snapshot.data.people.a.name).toBe('まさと')
    expect(snapshot.data.people.b.name).toBe('りさこ')
    // §9.6 V1 の9月の支出の合計（見込み）
    expect(summarize(snapshot.data.expenses, '2026-09').total).toBe(180670)
  })

  it('URL と key を入れると Supabase 実装を返す（ドメインは既定の `kakeibo.invalid`）', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    expect(hasSupabaseConfig()).toBe(true)

    getRepository()
    expect(created.configs).toEqual([
      { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', emailDomain: 'kakeibo.invalid' },
    ])
  })

  it('1つだけ作って使い回し、`setRepository(null)` のあとは作り直す', () => {
    const first = getRepository()
    expect(getRepository()).toBe(first)

    setRepository(null)
    expect(getRepository()).not.toBe(first)
  })
})
