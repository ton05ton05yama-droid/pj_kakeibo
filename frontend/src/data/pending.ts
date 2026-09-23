/**
 * 端末に保留した記録（仕様書 §3.6、docs/05_platform.md §6.5）。
 *
 * - 保留するのは **記録の追加だけ**。直す・消す・金額待ち・出す額・精算の操作・設定は保留しない
 *   （2台の操作がぶつかるのを防ぐ。精算とロックの操作は絶対に保留しない）。
 * - 置き場所は localStorage（キー `kakeibo.pending.expenses`）。7日ルール対策に
 *   `navigator.storage.persist()` を頼む（05 §6）。
 * - 記録の `id` は端末で採番済み（`crypto.randomUUID()`。04 §2.5）なので、送り直しても二重にならない。
 * - 保留の行は `sync: 'pending' | 'failed'` を持ち、合計には入らない（§6.2 の isCounted が除く）。
 */
import type { DateTimeKey, Expense, HouseholdData, PersonKey } from '../domain'
import { createExpense } from '../domain'
import type { NewExpenseInput, Repository } from './repository'
import { RepositoryError } from './repository'

/** localStorage のキー（05 §6.5） */
export const PENDING_KEY = 'kakeibo.pending.expenses'

/** 端末に置く1件（送るときは input をそのまま送る） */
export interface PendingExpense {
  input: NewExpenseInput
  /** 記録した人 */
  by: PersonKey
  /** 記録した日時（端末の時計。送れたらサーバーの値で置き換わる） */
  at: DateTimeKey
  /** 'pending' = つながったら送る、'failed' = 送れなかった（その月が精算中など） */
  sync: 'pending' | 'failed'
}

/* ------------------------------------------------------------------ *
 * 置き場所（localStorage。読めない・書けないときは黙って諦める）
 * ------------------------------------------------------------------ */

/** 金額の範囲（§7.5・D10。`domain` の assertAmount と同じ） */
const MIN_AMOUNT = 1
const MAX_AMOUNT = 9_999_999

function isPendingExpense(value: unknown): value is PendingExpense {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<PendingExpense>
  const input = row.input as Partial<NewExpenseInput> | undefined
  if (input === undefined || typeof input.id !== 'string' || typeof input.date !== 'string') return false
  if (typeof input.amount !== 'number') return false
  // 範囲外（0・1000万以上・NaN・小数）の行は読み捨てる。読んだ先の createExpense が投げて画面が真っ白になるのを防ぐ
  if (!Number.isInteger(input.amount) || input.amount < MIN_AMOUNT || input.amount > MAX_AMOUNT) return false
  return row.sync === 'pending' || row.sync === 'failed'
}

export function readPending(): PendingExpense[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPendingExpense)
  } catch {
    // プライベートウインドウ・保存を止めている・壊れた JSON
    return []
  }
}

function writePending(rows: readonly PendingExpense[]): void {
  try {
    if (rows.length === 0) window.localStorage.removeItem(PENDING_KEY)
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(rows))
  } catch {
    // 書けなくても画面は動かす（保留は諦める）
  }
}

/** 1件足す（同じ id があれば入れ替える＝送り直しても二重にならない） */
export function addPending(row: PendingExpense): void {
  const rows = readPending().filter((x) => x.input.id !== row.input.id)
  rows.push(row)
  writePending(rows)
}

export function removePending(id: string): void {
  writePending(readPending().filter((x) => x.input.id !== id))
}

/** 送れなかった（その月が精算中になっていたなど）。行は残して「送れませんでした」にする */
export function markPendingFailed(id: string): void {
  writePending(readPending().map((x) => (x.input.id === id ? { ...x, sync: 'failed' } : x)))
}

export function clearPending(): void {
  writePending([])
}

/* ------------------------------------------------------------------ *
 * 画面に出す形
 * ------------------------------------------------------------------ */

/**
 * 保留の行を記録の形にする（合計には入らない。§6.2）。
 * 1行ずつ包んで、`createExpense` が投げた行（壊れた日付など）は端末から消して飛ばす。
 * 1件の壊れた行で `loadSnapshot` が落ちると、全画面が出なくなるため。
 */
export function pendingExpenseRows(): Expense[] {
  const rows: Expense[] = []
  for (const row of readPending()) {
    try {
      rows.push(
        createExpense({
          id: row.input.id,
          date: row.input.date,
          payer: row.input.payer,
          cat: row.input.cat,
          amount: row.input.amount,
          memo: row.input.memo,
          by: row.by,
          at: row.at,
          sync: row.sync,
        })
      )
    } catch {
      removePending(row.input.id)
    }
  }
  return rows
}

/** 家計のデータに保留の行を混ぜる（loadSnapshot の最後で呼ぶ） */
export function withPending(data: HouseholdData): HouseholdData {
  const rows = pendingExpenseRows()
  if (rows.length === 0) return data
  return { ...data, expenses: [...data.expenses, ...rows] }
}

/* ------------------------------------------------------------------ *
 * 変わったことを知らせる（送れたら画面を読み直す）
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>()

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyPending(): void {
  for (const listener of listeners) listener()
}

/* ------------------------------------------------------------------ *
 * 端末の時計・保存の永続化
 * ------------------------------------------------------------------ */

/** 端末の時計の「いま」（サーバーにつながっていないので端末の値を使う） */
export function deviceNow(): DateTimeKey {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 保存を消されにくくする（05 §6 の7日ルール）。
 * 使えない環境（iOS Safari のタブなど）では何も起きない。
 */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.()
  } catch {
    // 使えない環境では何もしない
  }
}

/* ------------------------------------------------------------------ *
 * 両方の実装が使う保留の口
 * ------------------------------------------------------------------ */

export type PendingApi = Pick<
  Repository,
  'enqueueExpense' | 'pendingExpenses' | 'flushPending' | 'dropPending' | 'updatePending'
>

export interface PendingOptions {
  /** 記録した人と日時（保留の行に持たせる） */
  context: () => Promise<{ by: PersonKey; at: DateTimeKey }>
  /** 実際に送る（リポジトリの addExpense） */
  send: (input: NewExpenseInput) => Promise<Expense>
}

/** `enqueueExpense` / `pendingExpenses` / `flushPending` を作る（ローカル実装・Supabase 実装で共通） */
export function createPendingApi(options: PendingOptions): PendingApi {
  let flushing = false
  return {
    async enqueueExpense(input: NewExpenseInput): Promise<void> {
      const { by, at } = await options.context()
      addPending({ input, by, at, sync: 'pending' })
      // 7日ルールで消えないように頼む（05 §6）
      requestPersistentStorage()
      notifyPending()
    },

    async pendingExpenses(): Promise<Expense[]> {
      return pendingExpenseRows()
    },

    /** S-14 `unsent` の［削除］。DB には何も送らず端末から消すだけ */
    async dropPending(id: string): Promise<void> {
      removePending(id)
      notifyPending()
    },

    /**
     * S-14 `unsent` の［保存］。同じ id で置き換える（`addPending` が同じ id の行を入れ替える）。
     * 「送れませんでした」の行を直したときは、もう一度送る対象（'pending'）に戻す。
     */
    async updatePending(id: string, input: NewExpenseInput): Promise<void> {
      const before = readPending().find((x) => x.input.id === id)
      const { by, at } = before ?? (await options.context())
      // id を変えることは無いが、変わっても古い行が残らないように消してから足す
      if (input.id !== id) removePending(id)
      addPending({ input, by, at, sync: 'pending' })
      requestPersistentStorage()
      notifyPending()
    },

    async flushPending(): Promise<void> {
      if (flushing) return
      const rows = readPending().filter((row) => row.sync === 'pending')
      if (rows.length === 0) return
      flushing = true
      let changed = false
      try {
        for (const row of rows) {
          try {
            await options.send(row.input)
            removePending(row.input.id)
            changed = true
          } catch (error) {
            // まだつながっていない・家計を読み込む前 → 送れるまで 'pending' のまま待つ
            if (error instanceof RepositoryError && (error.code === 'offline' || error.code === 'not_member')) break
            // その月が精算中になっていたなど → 「送れませんでした」（S-14 `unsent` で直す）
            markPendingFailed(row.input.id)
            changed = true
          }
        }
      } finally {
        flushing = false
      }
      if (changed) notifyPending()
    },
  }
}
