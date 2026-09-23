/**
 * Supabase 実装（`data/supabase/`）の、DB に触らない部分を偽のクライアントで確かめる。
 *
 * 見るのは3つ。
 *   1. RPC の `blocked` を、ローカル実装と同じ `detail` の形にそろえること（D2）
 *   2. DB のエラー・ログインのエラーを、画面の1行（§1.4）に結びつく形に変えること
 *   3. オフラインのとき、保留するのは **記録の追加だけ**（精算・ロックの操作は絶対に保留しない。§3.6）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearPending, readPending } from '../pending'
import { AuthError, type Repository, RepositoryError } from '../repository'
import { createSupabaseRepository } from '../supabase'

const UID_A = '11111111-1111-4111-8111-111111111111'
const UID_B = '22222222-2222-4222-8222-222222222222'

const CONFIG = { url: 'https://example.invalid', publishableKey: 'publishable', emailDomain: 'kakeibo.invalid' }

/** つながらないときに supabase-js が返すエラー */
const OFFLINE_ERROR = { message: 'TypeError: Failed to fetch' }

interface PostgrestLikeError {
  message: string
  code?: string
  details?: string | null
}

interface QueryOutcome {
  data: unknown
  error: PostgrestLikeError | null
}

/** insert / update の戻り（テーブルの既定の列）。04 §2.5 の列に合わせる */
const BASE_ROWS: Record<string, Record<string, unknown>> = {
  expenses: {
    fixed_cost_id: null,
    period_month: null,
    name: null,
    skipped: false,
    amount_set_by: null,
    amount_set_at: null,
    created_at: '2026-10-01T21:05:00+09:00',
    updated_by: null,
    updated_at: null,
  },
  fixed_cost_templates: { start_month: '2026-10-01' },
}

const TABLES: Record<string, Record<string, unknown>[]> = {
  households: [{ id: 'h1', name: 'かけいぼ', start_month: '2026-08-01' }],
  household_members: [
    {
      household_id: 'h1',
      user_id: UID_A,
      position: 1,
      display_name: 'まさと',
      color: 'teal',
      contribution_rate: 40,
      default_payer: 'self',
    },
    {
      household_id: 'h1',
      user_id: UID_B,
      position: 2,
      display_name: 'りさこ',
      color: 'amber',
      contribution_rate: 40,
      default_payer: 'self',
    },
  ],
  profiles: [{ user_id: UID_A, onboarded_at: '2026-08-01T21:00:00+09:00', last_seen_at: null }],
  fixed_cost_templates: [],
  expenses: [
    {
      id: 'e1',
      spent_on: '2026-09-22',
      accounting_month: '2026-09-01',
      category_id: 'groceries',
      amount: 1280,
      paid_by: UID_A,
      memo: 'スーパー',
      fixed_cost_id: null,
      period_month: null,
      name: null,
      skipped: false,
      amount_set_by: null,
      amount_set_at: null,
      created_by: UID_A,
      created_at: '2026-09-22T12:30:00+09:00',
      updated_by: null,
      updated_at: null,
    },
  ],
  month_contributions: [],
  month_settlements: [],
  month_settlement_lines: [],
  settlement_checks: [],
}

/** `app_status()`（04 §8.2） */
const APP_STATUS = {
  today: '2026-10-01',
  current_month: '2026-10-01',
  settle_default_month: '2026-09-01',
  months: [],
  badge: false,
  notice: null,
}

interface FakeOptions {
  /** RPC の戻り（app_status 以外。名前ごとに返す） */
  rpc?: (name: string, args: Record<string, unknown>) => unknown
  /** テーブルの書き込みのエラー（insert / update / delete） */
  tableError?: () => PostgrestLikeError | null
  /** つながらない状態にする */
  offline?: () => boolean
  signInError?: { message: string; status?: number }
}

interface FakeCalls {
  rpc: { name: string; args: Record<string, unknown> }[]
  /** insert を送った回数（つながらなくても数える＝送ろうとしたか） */
  inserts: { table: string; row: unknown }[]
}

/** テーブルへの問い合わせを組み立てる（使うメソッドだけ。最後に await で結果を返す） */
function createQuery(table: string, options: FakeOptions, calls: FakeCalls): unknown {
  let rows: Record<string, unknown>[] = TABLES[table] ?? []
  let single = false
  let write: Record<string, unknown> | null = null
  /** 書き込み（insert / update / delete）か。tableError は書き込みだけに出す */
  let mutating = false

  const outcome = (): QueryOutcome => {
    if (options.offline?.() === true) return { data: null, error: OFFLINE_ERROR }
    const error = mutating ? (options.tableError?.() ?? null) : null
    if (error !== null) return { data: null, error }
    if (write !== null) {
      const row = { ...(BASE_ROWS[table] ?? {}), ...write }
      return { data: single ? row : [row], error: null }
    }
    return { data: single ? (rows[0] ?? null) : rows, error: null }
  }

  const query = {
    select: (): unknown => query,
    insert: (row: Record<string, unknown>): unknown => {
      mutating = true
      calls.inserts.push({ table, row })
      write = row
      return query
    },
    update: (row: Record<string, unknown>): unknown => {
      mutating = true
      write = { ...(rows[0] ?? {}), ...row }
      return query
    },
    delete: (): unknown => {
      mutating = true
      return query
    },
    eq: (): unknown => query,
    order: (): unknown => query,
    limit: (n: number): unknown => {
      rows = rows.slice(0, n)
      return query
    },
    single: (): unknown => {
      single = true
      return query
    },
    // biome-ignore lint/suspicious/noThenProperty: supabase-js の問い合わせは await できる（thenable）ので、偽物も同じ形にする
    then: <T>(onfulfilled?: (value: QueryOutcome) => T | PromiseLike<T>): Promise<T | QueryOutcome> =>
      Promise.resolve(outcome()).then(onfulfilled),
  }
  return query
}

function createFakeClient(options: FakeOptions = {}): { client: SupabaseClient; calls: FakeCalls } {
  const calls: FakeCalls = { rpc: [], inserts: [] }
  const client = {
    from: (table: string) => createQuery(table, options, calls),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.rpc.push({ name, args })
      if (options.offline?.() === true) return { data: null, error: OFFLINE_ERROR }
      if (name === 'app_status') return { data: APP_STATUS, error: null }
      return { data: options.rpc?.(name, args) ?? { result: 'ok' }, error: null }
    },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: UID_A, email: 'masato@kakeibo.invalid' } } } }),
      signInWithPassword: async () => ({ data: {}, error: options.signInError ?? null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

/** 家計を読み込んだ状態のリポジトリ（人の対応が要る操作はこれが先） */
async function loaded(options: FakeOptions = {}): Promise<{ repository: Repository; calls: FakeCalls }> {
  const { client, calls } = createFakeClient(options)
  const repository = createSupabaseRepository(CONFIG, client)
  await repository.loadSnapshot()
  return { repository, calls }
}

beforeEach(() => {
  clearPending()
})

describe('Supabase 実装: 読み込み', () => {
  it('テーブルの行をドメインの形にして返す（app_status で毎月の支払いの行も作る）', async () => {
    const { repository, calls } = await loaded()
    const snapshot = await repository.loadSnapshot()
    expect(calls.rpc.map((c) => c.name)).toContain('app_status')
    expect(snapshot.viewer).toBe('a')
    expect(snapshot.data.people.a.name).toBe('まさと')
    expect(snapshot.data.people.b.name).toBe('りさこ')
    expect(snapshot.data.household.createdMonth).toBe('2026-08')
    expect(snapshot.data.expenses).toHaveLength(1)
    expect(snapshot.onboardedAt).toBe('2026-08-01T21:00')
  })
})

describe('Supabase 実装: blocked の detail をそろえる（D2）', () => {
  it('previous_month は月を YYYY-MM にして渡す', async () => {
    const { repository } = await loaded({
      rpc: (name) =>
        name === 'settle_confirm' ? { result: 'blocked', reason: 'previous_month', month: '2026-08-01' } : {},
    })
    const result = await repository.confirmMonth('2026-09', null)
    expect(result).toEqual({ result: 'blocked', reason: 'previous_month', detail: { m: '2026-08' } })
  })

  it('pending は件数だけを渡す', async () => {
    const { repository } = await loaded({
      rpc: (name) => (name === 'settle_confirm' ? { result: 'blocked', reason: 'pending', count: 2 } : {}),
    })
    const result = await repository.confirmMonth('2026-09', null)
    expect(result).toEqual({ result: 'blocked', reason: 'pending', detail: { count: 2 } })
  })

  it('undecided は detail を持たない', async () => {
    const { repository } = await loaded({
      rpc: (name) => (name === 'settle_confirm' ? { result: 'blocked', reason: 'undecided' } : {}),
    })
    expect(await repository.confirmMonth('2026-09', null)).toEqual({
      result: 'blocked',
      reason: 'undecided',
      detail: {},
    })
  })

  it('no_previous は UUID を a / b に直して people で渡す', async () => {
    const { repository } = await loaded({
      rpc: (name) =>
        name === 'decide_contributions' ? { result: 'blocked', reason: 'no_previous', users: [UID_B] } : {},
    })
    const result = await repository.decideContributions('2026-10', null)
    expect(result).toEqual({ result: 'blocked', reason: 'no_previous', detail: { people: ['b'] } })
  })

  it('［この金額で精算］の stale と already はそのまま返す', async () => {
    const stale = await loaded({ rpc: () => ({ result: 'stale', live: {} }) })
    expect(await stale.repository.confirmMonth('2026-09', { a: 1, b: 2 })).toEqual({ result: 'stale' })

    const already = await loaded({ rpc: () => ({ result: 'already', status: 'settled' }) })
    expect(await already.repository.confirmMonth('2026-09', null)).toEqual({
      result: 'already',
      value: { status: 'settled' },
    })
  })
})

describe('Supabase 実装: エラーを画面の1行に変える', () => {
  it('その月が精算中なら month_locked（§1.4）', async () => {
    const { repository } = await loaded({ tableError: () => ({ message: 'month_locked', details: '2026-09-01' }) })
    await expect(
      repository.addExpense({ id: 'x1', date: '2026-09-15', cat: 'dining', amount: 1000, payer: 'joint', memo: '' })
    ).rejects.toMatchObject({ name: 'RepositoryError', code: 'month_locked', detail: '2026-09-01' })
  })

  it('毎月の支払いの行は直せない（fixed_row_immutable）', async () => {
    const { repository } = await loaded({ tableError: () => ({ message: 'fixed_row_immutable' }) })
    await expect(repository.updateExpense('e1', { amount: 1 })).rejects.toMatchObject({
      code: 'fixed_row_immutable',
    })
  })

  it('つながらないときは offline', async () => {
    let offline = false
    const { repository } = await loaded({ offline: () => offline })
    offline = true
    await expect(repository.setCheck('2026-09', 'a', true)).rejects.toMatchObject({ code: 'offline' })
  })

  it('ID かパスワードが違えば AuthError（S-01）', async () => {
    const { client } = createFakeClient({ signInError: { message: 'Invalid login credentials', status: 400 } })
    const repository = createSupabaseRepository(CONFIG, client)
    await expect(repository.auth.signIn('masato', 'x')).rejects.toBeInstanceOf(AuthError)
    await expect(repository.auth.signIn('masato', 'x')).rejects.toMatchObject({ code: 'invalid_credentials' })
  })

  it('ログインでつながらないときは offline', async () => {
    const { client } = createFakeClient({ signInError: OFFLINE_ERROR })
    const repository = createSupabaseRepository(CONFIG, client)
    await expect(repository.auth.signIn('masato', 'x')).rejects.toMatchObject({ code: 'offline' })
  })
})

describe('Supabase 実装: オフラインの保留（§3.6・05 §6.5）', () => {
  it('保留するのは記録の追加だけ（精算・ロック・直すは保留しない）', async () => {
    let offline = false
    const { repository } = await loaded({ offline: () => offline })
    offline = true

    // 精算・ロックの操作は絶対に保留しない（2台の操作がぶつかるのを防ぐ）
    await expect(repository.confirmMonth('2026-09', null)).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.setCheck('2026-09', 'a', true)).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.reopenMonth('2026-09')).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.undoConfirm('2026-09', 1)).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.decideContributions('2026-10', { a: 1 })).rejects.toBeInstanceOf(RepositoryError)
    // 直す・消す・金額待ち・設定も保留しない
    await expect(repository.updateExpense('e1', { amount: 1 })).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.deleteExpense('e1')).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.fillAmount('e1', 100)).rejects.toBeInstanceOf(RepositoryError)
    await expect(repository.updateDefaultPayer('joint')).rejects.toBeInstanceOf(RepositoryError)
    expect(readPending()).toEqual([])

    // 記録の追加だけは端末に置く
    await repository.enqueueExpense({
      id: 'p1',
      date: '2026-10-01',
      cat: 'groceries',
      amount: 1280,
      payer: 'a',
      memo: 'スーパー',
    })
    expect(readPending()).toHaveLength(1)
    const pending = await repository.pendingExpenses()
    expect(pending[0]).toMatchObject({ id: 'p1', amount: 1280, sync: 'pending', by: 'a' })
  })

  it('つながったら送る（送れなければ「送れませんでした」にして残す）', async () => {
    let offline = false
    let locked = false
    const { repository, calls } = await loaded({
      offline: () => offline,
      tableError: () => (locked ? { message: 'month_locked' } : null),
    })
    offline = true
    await repository.enqueueExpense({
      id: 'p1',
      date: '2026-10-01',
      cat: 'groceries',
      amount: 1280,
      payer: 'a',
      memo: 'スーパー',
    })
    // つながっていないあいだは 'pending' のまま残す（送れるまで待つ）
    await repository.flushPending()
    expect(readPending()).toHaveLength(1)
    expect(readPending()[0]?.sync).toBe('pending')

    // その月が精算中になっていたら「送れませんでした」（S-14 `unsent` で直す）
    offline = false
    locked = true
    await repository.flushPending()
    expect(readPending()[0]?.sync).toBe('failed')
    // 'failed' の行は送り直さない（送ろうとした回数が増えない）
    const tries = calls.inserts.length
    await repository.flushPending()
    expect(calls.inserts).toHaveLength(tries)
  })

  it('送れたら保留から消える（同じ id で送るので二重にならない）', async () => {
    const { repository, calls } = await loaded()
    await repository.enqueueExpense({
      id: 'p1',
      date: '2026-10-01',
      cat: 'groceries',
      amount: 1280,
      payer: 'a',
      memo: 'スーパー',
    })
    await repository.flushPending()
    expect(readPending()).toEqual([])
    expect(calls.inserts).toHaveLength(1)
    expect(calls.inserts[0]?.row).toMatchObject({ id: 'p1', amount: 1280, spent_on: '2026-10-01' })
  })

  it('保留の行は家計のデータに混ざる（合計には入らない）', async () => {
    const { repository } = await loaded()
    await repository.enqueueExpense({
      id: 'p1',
      date: '2026-10-01',
      cat: 'groceries',
      amount: 1280,
      payer: 'a',
      memo: 'スーパー',
    })
    const snapshot = await repository.loadSnapshot()
    const row = snapshot.data.expenses.find((e) => e.id === 'p1')
    expect(row).toMatchObject({ sync: 'pending', amount: 1280, month: '2026-10' })
  })
})
