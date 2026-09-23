/**
 * DB の行の形（snake_case）と、DB ↔ ドメインの型の変換。
 *
 * - アプリが使う型は `domain/types.ts` が正本（`Expense`・`HouseholdData`・`MonthSettlement` など）。
 *   ここでは定義し直さず、DB の行をその形に写すだけにする。
 * - DB の形は `docs/04_data_model.md` §2 のテーブルと §8.2 の RPC の出力が正本。
 * - 大きな違いは3つ。
 *   1. 人: DB は `auth.users.id`（UUID）、ドメインは並び順の `'a' | 'b'`（§6.1）。`household_members.position` で結ぶ。
 *   2. 月: DB は「その月の1日」の `date`（`2026-09-01`）、ドメインは `'2026-09'`。
 *   3. 共用: DB は `paid_by = null`、ドメインは `'joint'`。
 */
import type {
  CategoryKey,
  DateTimeKey,
  DoneEntry,
  Expense,
  FixedCostTemplate,
  Household,
  MonthContributions,
  MonthKey,
  MonthSettlement,
  Payer,
  Person,
  PersonAmounts,
  PersonKey,
  SettlementCheck,
} from '../domain'
import { createMonthSettlement, nextSeq } from '../domain'

/** 「その月の1日」（DB の月） */
export type DbMonth = string
/** 日付（JST）。`2026-09-22` */
export type DbDate = string

/* ------------------------------------------------------------------ *
 * 月・人・払った人の写し替え
 * ------------------------------------------------------------------ */

/** `2026-09-01` → `2026-09` */
export const toMonthKey = (m: DbMonth): MonthKey => m.slice(0, 7)
/** `2026-09` → `2026-09-01` */
export const toDbMonth = (m: MonthKey): DbMonth => `${m}-01`

/** UUID ↔ `'a' | 'b'` の対応（`household_members.position` から作る） */
export interface PersonMap {
  /** UUID → 人 */
  keyOf: Record<string, PersonKey>
  /** 人 → UUID */
  idOf: Record<PersonKey, string>
}

export function buildPersonMap(rows: readonly HouseholdMemberRow[]): PersonMap {
  const keyOf: Record<string, PersonKey> = {}
  const idOf: Record<PersonKey, string> = { a: '', b: '' }
  for (const row of rows) {
    const key: PersonKey = row.position === 2 ? 'b' : 'a'
    keyOf[row.user_id] = key
    idOf[key] = row.user_id
  }
  return { keyOf, idOf }
}

/** DB の `paid_by`（null = 共用）→ ドメインの `Payer` */
export function toPayer(userId: string | null, persons: PersonMap): Payer {
  if (userId === null) return 'joint'
  return persons.keyOf[userId] ?? 'joint'
}

/** ドメインの `Payer` → DB の `paid_by` */
export function fromPayer(payer: Payer, persons: PersonMap): string | null {
  return payer === 'joint' ? null : persons.idOf[payer]
}

/* ------------------------------------------------------------------ *
 * DB の行（04 §2）
 * ------------------------------------------------------------------ */

export interface HouseholdRow {
  id: string
  name: string
  start_month: DbMonth
}

export interface HouseholdMemberRow {
  household_id: string
  user_id: string
  position: number
  display_name: string
  color: 'teal' | 'amber'
  contribution_rate: number
  default_payer: 'self' | 'joint'
}

export interface ProfileRow {
  user_id: string
  onboarded_at: string | null
  last_seen_at: string | null
}

export interface FixedCostTemplateRow {
  id: string
  name: string
  category_id: string
  paid_by: string | null
  amount_kind: 'fixed' | 'variable'
  amount: number | null
  start_month: DbMonth
  end_month: DbMonth | null
  created_by: string
  created_at: string
}

export interface ExpenseRow {
  id: string
  spent_on: DbDate
  accounting_month: DbMonth
  category_id: string
  amount: number | null
  paid_by: string | null
  memo: string | null
  fixed_cost_id: string | null
  period_month: DbMonth | null
  name: string | null
  skipped: boolean
  amount_set_by: string | null
  amount_set_at: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string | null
}

export interface MonthContributionRow {
  month: DbMonth
  user_id: string
  net_income: number
  contribution_rate: number
  contribution: number
  decided_by: string
  decided_at: string
}

export interface MonthSettlementRow {
  month: DbMonth
  status: 'confirmed' | 'settled' | 'reopened'
  round: number
  expense_total: number
  joint_paid: number
  contribution_total: number
  joint_net: number
  confirmed_by: string
  confirmed_at: string
  settled_at: string | null
  reopened_by: string | null
  reopened_at: string | null
  reopened_from: 'confirmed' | 'settled' | null
}

export interface MonthSettlementLineRow {
  month: DbMonth
  user_id: string
  contribution: number
  advance: number
  settlement: number
  transferred: number
  remaining: number
}

export interface SettlementCheckRow {
  month: DbMonth
  round: number
  user_id: string
  amount: number
  checked_by: string
  checked_at: string
}

/** `app_status()`（04 §8.2） */
export interface AppStatusJson {
  today: DbDate
  current_month: DbMonth
  settle_default_month: DbMonth
  months: { month: DbMonth; status: 'open' | 'closing' | 'confirmed' | 'settled' }[]
  badge: boolean
  notice:
    | { kind: 'closing'; month: DbMonth }
    | { kind: 'transfer'; month: DbMonth; direction: 'in' | 'out'; amount: number }
    | null
}

/* ------------------------------------------------------------------ *
 * DB の行 → ドメインの型
 * ------------------------------------------------------------------ */

/** タイムスタンプ（`2026-10-01T21:00:00+09:00`）→ ドメインの `DateTimeKey`（`2026-10-01T21:00`） */
export function toDateTimeKey(at: string): DateTimeKey {
  return at.slice(0, 16)
}

export function toHousehold(row: HouseholdRow, emailDomain: string): Household {
  return {
    createdMonth: toMonthKey(row.start_month),
    appName: row.name,
    emailDomain,
  }
}

export function toPerson(row: HouseholdMemberRow, loginId: string, profile: ProfileRow | null): Person {
  return {
    id: loginId,
    name: row.display_name,
    // DB は teal / amber、ドメインは a / b（§7.2 の割り当ては まさと teal・りさこ amber）
    color: row.color === 'amber' ? 'b' : 'a',
    ratePct: row.contribution_rate,
    defaultPayer: row.default_payer,
    lastSeen: profile?.last_seen_at ? toDateTimeKey(profile.last_seen_at) : null,
  }
}

export function toTemplate(row: FixedCostTemplateRow, persons: PersonMap): FixedCostTemplate {
  return {
    id: row.id,
    name: row.name,
    cat: row.category_id as CategoryKey,
    payer: toPayer(row.paid_by, persons),
    kind: row.amount_kind,
    amount: row.amount,
    from: toMonthKey(row.start_month),
    until: row.end_month === null ? null : toMonthKey(row.end_month),
    createdBy: persons.keyOf[row.created_by] ?? 'a',
    createdAt: toDateTimeKey(row.created_at),
  }
}

export function toExpense(row: ExpenseRow, persons: PersonMap): Expense {
  return {
    id: row.id,
    date: row.spent_on,
    month: toMonthKey(row.accounting_month),
    labelMonth: row.period_month === null ? null : toMonthKey(row.period_month),
    payer: toPayer(row.paid_by, persons),
    cat: row.category_id as CategoryKey,
    amount: row.amount,
    // 手入力はメモ、毎月の支払いの行は作った時点のひな形の名前（§1.1）
    memo: row.fixed_cost_id === null ? (row.memo ?? '') : (row.name ?? ''),
    tpl: row.fixed_cost_id,
    by: row.created_by === null ? 'auto' : (persons.keyOf[row.created_by] ?? 'a'),
    at: toDateTimeKey(row.created_at),
    amountBy: row.amount_set_by === null ? null : (persons.keyOf[row.amount_set_by] ?? null),
    amountAt: row.amount_set_at === null ? null : toDateTimeKey(row.amount_set_at),
    skipped: row.skipped,
    sync: null,
    editedAt: row.updated_at === null ? null : toDateTimeKey(row.updated_at),
    editedBy: row.updated_by === null ? null : (persons.keyOf[row.updated_by] ?? null),
    seq: nextSeq(),
  }
}

export function toContributions(
  rows: readonly MonthContributionRow[],
  persons: PersonMap
): Record<MonthKey, MonthContributions> {
  const out: Record<MonthKey, MonthContributions> = {}
  for (const row of rows) {
    const m = toMonthKey(row.month)
    const p = persons.keyOf[row.user_id]
    if (p === undefined) continue
    const cm = out[m] ?? {}
    cm[p] = {
      net: row.net_income,
      ratePct: row.contribution_rate,
      amount: row.contribution,
      by: persons.keyOf[row.decided_by] ?? p,
      at: toDateTimeKey(row.decided_at),
    }
    out[m] = cm
  }
  return out
}

function zero(): PersonAmounts {
  return { a: 0, b: 0 }
}

/**
 * 精算の行（04 §2.7 の3テーブル）→ ドメインの `MonthSettlement`。
 *
 * ドメインは「済んだ分（transferred・done）」と「いまの回のチェック（checks）」を分けて持つ。
 * DB では、確定した回の `month_settlement_lines.transferred` が済んだ分、
 * `settlement_checks` がその回（と前の回）のチェックなので、次のように写す。
 *   - 精算中・精算済み: 済んだ分 = 行の transferred、いまの回のチェック = round が同じチェック
 *   - やり直し中（`reopened`）: 行（lines）は確定した回のままで古いので使わず、
 *     済んだ分 = `settlement_checks` の**すべての回**の合計（`private.month_live` と同じ式）。
 *     チェックはすべて済んだ分の明細にし、checks は空にする（02 §7）
 */
export function toSettlements(
  settlements: readonly MonthSettlementRow[],
  lines: readonly MonthSettlementLineRow[],
  checks: readonly SettlementCheckRow[],
  contributions: Record<MonthKey, MonthContributions>,
  persons: PersonMap
): Record<MonthKey, MonthSettlement> {
  const out: Record<MonthKey, MonthSettlement> = {}
  for (const row of settlements) {
    const m = toMonthKey(row.month)
    const rec = createMonthSettlement()
    const reopened = row.status === 'reopened'
    rec.status = row.status === 'confirmed' || row.status === 'settled' ? row.status : null
    rec.round = row.round
    rec.confirmedBy = persons.keyOf[row.confirmed_by] ?? null
    rec.confirmedAt = toDateTimeKey(row.confirmed_at)
    rec.settledAt = row.settled_at === null ? null : toDateTimeKey(row.settled_at)
    rec.reopenedBy = row.reopened_by === null ? null : (persons.keyOf[row.reopened_by] ?? null)
    rec.reopenedAt = row.reopened_at === null ? null : toDateTimeKey(row.reopened_at)
    rec.reopenedFrom = row.reopened_from

    const transferred = zero()
    const contrib = zero()
    const adv = zero()
    const settle = zero()
    // 行（lines）は確定した回の値。やり直し中は古いので読まない
    if (!reopened) {
      for (const line of lines) {
        if (line.month !== row.month) continue
        const p = persons.keyOf[line.user_id]
        if (p === undefined) continue
        transferred[p] = line.transferred
        contrib[p] = line.contribution
        adv[p] = line.advance
        settle[p] = line.settlement
      }
    }

    const myChecks = checks.filter((c) => c.month === row.month)
    const done: Record<PersonKey, DoneEntry[]> = { a: [], b: [] }
    const current: Partial<Record<PersonKey, SettlementCheck>> = {}
    for (const c of myChecks.slice().sort((x, y) => x.round - y.round)) {
      const p = persons.keyOf[c.user_id]
      if (p === undefined) continue
      const by = persons.keyOf[c.checked_by] ?? p
      const at = toDateTimeKey(c.checked_at)
      if (reopened) {
        // すべての回のチェックが済んだ分（private.month_live の transferred と同じ）
        done[p].push({ amount: c.amount, at, by })
        transferred[p] += c.amount
      } else if (c.round < row.round) {
        done[p].push({ amount: c.amount, at, by })
      } else {
        current[p] = { by, at, amount: c.amount }
      }
    }
    rec.transferred = transferred
    rec.done = done
    rec.checks = current

    if (!reopened) {
      const cm = contributions[m] ?? {}
      rec.snapshot = {
        contrib,
        net: { a: cm.a?.net ?? null, b: cm.b?.net ?? null },
        ratePct: { a: cm.a?.ratePct ?? 0, b: cm.b?.ratePct ?? 0 },
        adv,
        joint: row.joint_paid,
        total: row.expense_total,
        settle,
        jointNet: row.joint_net,
      }
    }
    out[m] = rec
  }
  return out
}
