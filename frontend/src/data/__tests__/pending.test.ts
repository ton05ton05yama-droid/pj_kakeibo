/**
 * 端末に保留した記録（§3.6・05 §6.5）の、localStorage まわりの取り扱い。
 *
 * 見るのは2つ。
 *   1. 壊れた行・範囲外の金額が localStorage にあっても、`loadSnapshot()` が落ちないこと（R2-D05）
 *   2. つながったら（`online`）保留の行が送られること（`installOnlineFlush`。BR2-06）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installOnlineFlush, setRepository } from '../index'
import { createLocalRepository } from '../local'
import type { PendingExpense } from '../pending'
import { clearPending, PENDING_KEY, readPending } from '../pending'
import type { Repository } from '../repository'

/** localStorage に直接置く1件（端末に前のバージョンが書いた行・手で壊した行のつもり） */
function row(id: string, amount: number): PendingExpense {
  return {
    input: { id, date: '2026-09-22', cat: 'dining', amount, payer: 'a', memo: 'ランチ' },
    by: 'a',
    at: '2026-09-22T12:30',
    sync: 'pending',
  }
}

async function signedIn(): Promise<Repository> {
  const repository = createLocalRepository('sep-open')
  await repository.auth.signIn('masato', 'pw')
  return repository
}

beforeEach(() => {
  clearPending()
  setRepository(null)
})

describe('保留の行の読み込み（R2-D05）', () => {
  it('金額が範囲外の行があっても読み込めて、その行は読み捨てる', async () => {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([row('bad-0', 0), row('bad-max', 10_000_000), row('bad-nan', Number.NaN), row('ok', 1280)])
    )
    const repository = await signedIn()
    const snapshot = await repository.loadSnapshot()
    const unsent = snapshot.data.expenses.filter((e) => e.sync !== null)
    expect(unsent.map((e) => e.id)).toEqual(['ok'])
    // 読み捨てた行は、そのあとの保留の一覧にも出ない
    expect((await repository.pendingExpenses()).map((e) => e.id)).toEqual(['ok'])
  })

  it('NaN は JSON では null になるので、その行も読み捨てる', async () => {
    // JSON.stringify(NaN) === 'null'。読み込み側が落ちないことを確かめる
    expect(JSON.stringify({ amount: Number.NaN })).toBe('{"amount":null}')
    window.localStorage.setItem(PENDING_KEY, JSON.stringify([row('bad-nan', Number.NaN), row('ok', 1280)]))
    expect(readPending().map((r) => r.input.id)).toEqual(['ok'])
  })
})

describe('つながったら送る（installOnlineFlush。BR2-06）', () => {
  it('オフラインで保留 → online で送られて localStorage が空になる', async () => {
    const repository = await signedIn()
    await repository.loadSnapshot()
    setRepository(repository)
    const stop = installOnlineFlush()

    await repository.enqueueExpense({
      id: 'p-online',
      date: '2026-09-22',
      cat: 'groceries',
      amount: 1280,
      payer: 'a',
      memo: 'スーパー',
    })
    expect(window.localStorage.getItem(PENDING_KEY)).not.toBeNull()

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => {
      expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
    })

    stop()
    // 購読をやめたら、もう送らない（残ったままになる）
    await repository.enqueueExpense({
      id: 'p-after',
      date: '2026-09-22',
      cat: 'groceries',
      amount: 500,
      payer: 'a',
      memo: '',
    })
    window.dispatchEvent(new Event('online'))
    expect(readPending().map((r) => r.input.id)).toEqual(['p-after'])
  })
})
