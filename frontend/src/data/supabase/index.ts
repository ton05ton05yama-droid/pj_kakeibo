/**
 * Supabase 実装。テーブルと RPC は `docs/04_data_model.md` に合わせる。
 *
 * - 1行を足す・直す・消すだけのものはテーブルへの直接の書き込み（RLS ＋ トリガーで守る。04 §0 の2）。
 * - 状態が移る・判定が要るものは RPC。
 * - 帰属月・記録した人・金額を入れた人・ひな形の追加した月はサーバーが入れるので、端末の値を当てにしない。
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { DateTimeKey, Expense, HouseholdData, MonthKey, PersonAmounts, PersonKey } from '../../domain'
import { monthsBetween, PERSON_KEYS } from '../../domain'
import { createPendingApi, deviceNow, withPending } from '../pending'
import {
  type AuthRepository,
  type BlockedDetail,
  type ExpensePatch,
  type NewExpenseInput,
  type Repository,
  RepositoryError,
  type RpcBlocked,
  type RpcResult,
  rpcBlocked,
  type SessionUser,
  type Snapshot,
  type TemplateInput,
} from '../repository'
import {
  type AppStatusJson,
  buildPersonMap,
  type ExpenseRow,
  type FixedCostTemplateChangeRow,
  type FixedCostTemplateRow,
  fromPayer,
  type HouseholdMemberRow,
  type HouseholdRow,
  type MonthContributionRow,
  type MonthSettlementLineRow,
  type MonthSettlementRow,
  type PersonMap,
  type ProfileRow,
  type SettlementCheckRow,
  toContributions,
  toDateTimeKey,
  toDbMonth,
  toExpense,
  toHousehold,
  toMonthKey,
  toPerson,
  toSettlements,
  toTemplate,
  toTemplateChange,
} from '../types'
import {
  createSupabaseClient,
  loginIdFromEmail,
  NOT_ALLOWED,
  type SupabaseConfig,
  toAuthError,
  toPseudoEmail,
  toRepositoryError,
} from './client'

const EXPENSE_COLUMNS =
  'id, spent_on, accounting_month, category_id, amount, paid_by, memo, ' +
  'fixed_cost_id, period_month, name, skipped, amount_set_by, amount_set_at, ' +
  'created_by, created_at, updated_by, updated_at'

const TEMPLATE_COLUMNS =
  'id, name, category_id, paid_by, amount_kind, amount, start_month, end_month, created_by, created_at'

const TEMPLATE_CHANGE_COLUMNS = 'id, template_id, change, from_month, before, after, changed_by, changed_at'

interface RpcJson {
  result?: 'ok' | 'already' | 'blocked' | 'stale'
  reason?: string
  [key: string]: unknown
}

function fail(error: PostgrestError | null): void {
  if (error !== null) throw toRepositoryError(error)
}

/**
 * 1行も書けなかった・読めなかったとき（RLS の 42501・0件の PGRST116）だけ、
 * その操作の文言に差し替えて投げる（文言はローカル実装が正本）。ほかのエラーはそのまま。
 */
function failRow(error: PostgrestError | null, message: string): void {
  if (error === null) return
  const converted = toRepositoryError(error)
  // 「ログインし直してください」など、理由が決まっている not_allowed はそのまま通す
  if (converted.code === 'not_allowed' && converted.message === NOT_ALLOWED) {
    throw new RepositoryError('not_allowed', message, converted.detail)
  }
  throw converted
}

/** 一度に読む行の上限（05 §3.5。Data API の Max rows の既定は 1000 なので、明示して超過に気づけるようにする） */
const READ_LIMIT = 5000

/**
 * RPC の `blocked` を、ローカル実装と同じ `detail` の形にそろえる（ローカルが正。repository.ts の BlockedDetails）。
 * DB は `previous_month` を `month`（その月の1日）、`no_previous` を `users`（UUID の配列）で返すので写し替える。
 */
function blockedFrom<R extends string>(json: RpcJson, fallback: R, persons: PersonMap | null): RpcBlocked<R> {
  const reason = (json.reason ?? fallback) as R
  let detail: unknown = {}
  if (reason === 'previous_month') {
    if (typeof json.month === 'string') detail = { m: toMonthKey(json.month) }
  } else if (reason === 'pending') {
    detail = { count: typeof json.count === 'number' ? json.count : 0 }
  } else if (reason === 'no_previous') {
    const users: unknown[] = Array.isArray(json.users) ? json.users : []
    detail = {
      people: users
        .filter((u): u is string => typeof u === 'string')
        .map((u) => persons?.keyOf[u])
        .filter((p): p is PersonKey => p !== undefined),
    }
  }
  return rpcBlocked(reason, detail as BlockedDetail<R>)
}

/** サーバーの日付（JST）＋ 端末の時刻 → ドメインの `now`（02 §10 C10: 月の境目はサーバーが決める） */
function nowFrom(today: string): DateTimeKey {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${today}T${hh}:${mm}`
}

/** `client` はテストで差し替えるための引数（既定は publishable key で作る。05 §2.2） */
export function createSupabaseRepository(
  config: SupabaseConfig,
  client: SupabaseClient = createSupabaseClient(config)
): Repository {
  /** ログインしているあいだ変わらないもの（人の対応と家計の id） */
  let persons: PersonMap | null = null
  let householdId: string | null = null
  /** 最後に読んだログイン中の人（オフラインでも保留の行に持たせる） */
  let viewer: PersonKey | null = null
  /** 最後に読んだ今月（サーバーの日付。ひな形を足したあとに開始月から今月までの行を作るのに使う） */
  let currentMonth: MonthKey | null = null

  function toRpcResult<T, R extends string>(json: RpcJson, pick: (j: RpcJson) => T): RpcResult<T, R> {
    if (json.result === 'blocked') return blockedFrom(json, 'unknown' as R, persons)
    if (json.result === 'already') return { result: 'already', value: pick(json) }
    return { result: 'ok', value: pick(json) }
  }

  async function rpc(name: string, args: Record<string, unknown> = {}): Promise<RpcJson> {
    const { data, error } = await client.rpc(name, args)
    fail(error)
    return (data ?? {}) as RpcJson
  }

  async function requireSession(): Promise<{ userId: string; email: string | undefined }> {
    const { data } = await client.auth.getSession()
    const id = data.session?.user.id
    if (id === undefined) throw new RepositoryError('not_member', 'ログインしていません')
    return { userId: id, email: data.session?.user.email }
  }

  function requirePersons(): PersonMap {
    if (persons === null) throw new RepositoryError('not_member', '家計を読み込んでいません')
    return persons
  }

  const auth: AuthRepository = {
    async currentUser(): Promise<SessionUser | null> {
      const { data } = await client.auth.getSession()
      const id = data.session?.user.id
      if (id === undefined) return null
      return { viewer: persons === null ? 'a' : (persons.keyOf[id] ?? 'a') }
    },
    async signIn(loginId, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email: toPseudoEmail(loginId, config.emailDomain),
        password,
      })
      if (error !== null) throw toAuthError(error)
      void data
      persons = null
      return { viewer: 'a' }
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error !== null) throw toAuthError(error)
      persons = null
      householdId = null
      viewer = null
    },
    async updatePassword(newPassword) {
      const { error } = await client.auth.updateUser({ password: newPassword })
      if (error !== null) throw toAuthError(error)
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const id = session?.user.id
        listener(id === undefined ? null : { viewer: persons?.keyOf[id] ?? 'a' })
      })
      return () => {
        data.subscription.unsubscribe()
      }
    },
  }

  const repository: Repository = {
    auth,

    async loadSnapshot(): Promise<Snapshot> {
      const session = await requireSession()
      const userId = session.userId
      // app_status は毎月の支払いの行の生成（ensure_month）も済ませる（04 §3）
      const status = (await rpc('app_status')) as unknown as AppStatusJson
      const now = nowFrom(status.today)
      currentMonth = toMonthKey(status.current_month)

      const [households, members, profiles, templates, changes, expenses, contributions, settlements, lines, checks] =
        await Promise.all([
          client.from('households').select('id, name, start_month').limit(1).single(),
          client
            .from('household_members')
            .select(
              'household_id, user_id, position, display_name, color, contribution_rate, salary_to_joint, default_payer'
            )
            .order('position'),
          client.from('profiles').select('user_id, onboarded_at, last_seen_at'),
          client.from('fixed_cost_templates').select(TEMPLATE_COLUMNS).order('created_at'),
          client
            .from('fixed_cost_template_changes')
            .select(TEMPLATE_CHANGE_COLUMNS)
            .order('changed_at')
            .limit(READ_LIMIT),
          client.from('expenses').select(EXPENSE_COLUMNS).limit(READ_LIMIT),
          client
            .from('month_contributions')
            .select(
              'month, user_id, net_income, contribution_rate, salary_to_joint, contribution, decided_by, decided_at'
            ),
          client
            .from('month_settlements')
            .select(
              'month, status, round, expense_total, joint_paid, contribution_total, joint_net, ' +
                'confirmed_by, confirmed_at, settled_at, reopened_by, reopened_at, reopened_from'
            ),
          client
            .from('month_settlement_lines')
            .select('month, user_id, contribution, advance, settlement, transferred, remaining')
            .limit(READ_LIMIT),
          client
            .from('settlement_checks')
            .select('month, round, user_id, amount, checked_by, checked_at')
            .limit(READ_LIMIT),
        ])
      fail(households.error)
      fail(members.error)
      fail(profiles.error)
      fail(templates.error)
      fail(changes.error)
      fail(expenses.error)
      fail(contributions.error)
      fail(settlements.error)
      fail(lines.error)
      fail(checks.error)

      // 上限ぴったりなら、読み切れていない見込みが高い（ページングは入れていない）。
      // 合計がずれたまま画面に出すより、読めなかったことを伝えて止める
      for (const result of [expenses, changes, lines, checks]) {
        if (Array.isArray(result.data) && result.data.length >= READ_LIMIT) {
          throw new RepositoryError('unknown', 'データが多すぎます（読み切れませんでした）')
        }
      }

      const householdRow = households.data as unknown as HouseholdRow
      householdId = householdRow.id
      const memberRows = (members.data ?? []) as unknown as HouseholdMemberRow[]
      const map = buildPersonMap(memberRows)
      persons = map
      const profileRows = (profiles.data ?? []) as unknown as ProfileRow[]
      const contributionMap = toContributions((contributions.data ?? []) as unknown as MonthContributionRow[], map)

      const peopleEntries = memberRows.map((row) => {
        const key: PersonKey = row.position === 2 ? 'b' : 'a'
        const profile = profileRows.find((p) => p.user_id === row.user_id) ?? null
        const loginId = row.user_id === userId ? loginIdFromEmail(session.email) : ''
        return [key, toPerson(row, loginId, profile)] as const
      })
      const people = {
        a: peopleEntries.find(([k]) => k === 'a')?.[1],
        b: peopleEntries.find(([k]) => k === 'b')?.[1],
      }
      if (people.a === undefined || people.b === undefined) {
        throw new RepositoryError('not_member', '家計の2人がそろっていません')
      }

      const data: HouseholdData = {
        household: toHousehold(householdRow, config.emailDomain),
        people: { a: people.a, b: people.b },
        templates: ((templates.data ?? []) as unknown as FixedCostTemplateRow[]).map((t) => toTemplate(t, map)),
        templateChanges: ((changes.data ?? []) as unknown as FixedCostTemplateChangeRow[]).map((c) =>
          toTemplateChange(c, map)
        ),
        contributions: contributionMap,
        expenses: ((expenses.data ?? []) as unknown as ExpenseRow[]).map((e) => toExpense(e, map)),
        settlements: toSettlements(
          (settlements.data ?? []) as unknown as MonthSettlementRow[],
          (lines.data ?? []) as unknown as MonthSettlementLineRow[],
          (checks.data ?? []) as unknown as SettlementCheckRow[],
          contributionMap,
          map
        ),
      }

      const myProfile = profileRows.find((p) => p.user_id === userId) ?? null
      viewer = map.keyOf[userId] ?? 'a'
      return {
        // 端末に保留した記録を混ぜる（合計には入らない。§3.6）
        data: withPending(data),
        now,
        viewer,
        onboardedAt: myProfile?.onboarded_at ? toDateTimeKey(myProfile.onboarded_at) : null,
      }
    },

    async addExpense(input: NewExpenseInput): Promise<Expense> {
      const { userId } = await requireSession()
      const map = requirePersons()
      if (householdId === null) throw new RepositoryError('not_member', '家計を読み込んでいません')
      const { data, error } = await client
        .from('expenses')
        .insert({
          id: input.id,
          household_id: householdId,
          spent_on: input.date,
          // 帰属月はトリガーが日付から入れ直す（04 §7）。RLS の with check のために同じ値を送る
          accounting_month: `${input.date.slice(0, 7)}-01`,
          category_id: input.cat,
          amount: input.amount,
          paid_by: fromPayer(input.payer, map),
          memo: input.memo === '' ? null : input.memo,
          created_by: userId,
        })
        .select(EXPENSE_COLUMNS)
        .single()
      fail(error)
      return toExpense(data as unknown as ExpenseRow, map)
    },

    async updateExpense(id, patch: ExpensePatch) {
      const map = requirePersons()
      const row: Record<string, unknown> = {}
      if (patch.date !== undefined) row.spent_on = patch.date
      if (patch.cat !== undefined) row.category_id = patch.cat
      if (patch.amount !== undefined) row.amount = patch.amount
      if (patch.payer !== undefined) row.paid_by = fromPayer(patch.payer, map)
      if (patch.memo !== undefined) row.memo = patch.memo === '' ? null : patch.memo
      const { data, error } = await client.from('expenses').update(row).eq('id', id).select(EXPENSE_COLUMNS).single()
      // 1行も返らない＝ RLS に弾かれた（相手の記録・精算中の月）。
      // 「精算中」なのか「相手の行」なのかは、呼び出し側が手元の monthStatus で決める
      failRow(error, '相手の記録は直せません')
      if (!data) throw new RepositoryError('not_allowed', '相手の記録は直せません')
      return toExpense(data as unknown as ExpenseRow, map)
    },

    async deleteExpense(id) {
      // delete は消せなくてもエラーにならない（RLS の using に合う行が0件なだけ）ので、
      // 消した行を返させて0件なら断る（04 §6.1。文言はローカル実装が正本）
      const { data, error } = await client.from('expenses').delete().eq('id', id).select('id')
      failRow(error, 'この記録は消せません')
      if (!data || data.length === 0) throw new RepositoryError('not_allowed', 'この記録は消せません')
    },

    async restoreExpense(expense) {
      const map = requirePersons()
      if (householdId === null) throw new RepositoryError('not_member', '家計を読み込んでいません')
      const { data, error } = await client
        .from('expenses')
        .insert({
          id: expense.id,
          household_id: householdId,
          spent_on: expense.date,
          accounting_month: toDbMonth(expense.month),
          category_id: expense.cat,
          amount: expense.amount,
          paid_by: fromPayer(expense.payer, map),
          memo: expense.memo === '' ? null : expense.memo,
          created_by: map.idOf[expense.by === 'auto' ? 'a' : expense.by],
        })
        .select(EXPENSE_COLUMNS)
        .single()
      fail(error)
      return toExpense(data as unknown as ExpenseRow, map)
    },

    async fillAmount(id, amount) {
      // 金額を入れた人・時刻はトリガーが入れる（04 §7）
      return repository.updateExpense(id, { amount })
    },

    async setSkipped(id, skipped) {
      const map = requirePersons()
      const { data, error } = await client
        .from('expenses')
        .update({ skipped })
        .eq('id', id)
        .select(EXPENSE_COLUMNS)
        .single()
      fail(error)
      return toExpense(data as unknown as ExpenseRow, map)
    },

    async deferExpense(id, undo = false) {
      const map = requirePersons()
      const { data: current, error: readError } = await client
        .from('expenses')
        .select('accounting_month')
        .eq('id', id)
        .single()
      fail(readError)
      void map
      const json = await rpc('defer_expense', {
        p_expense_id: id,
        p_from_month: (current as unknown as { accounting_month: string }).accounting_month,
        p_undo: undo,
      })
      return toRpcResult(json, (j) => ({ month: toMonthKey(j.accounting_month as string) }))
    },

    async decideContributions(m, nets) {
      const map = requirePersons()
      let payload: Record<string, number> | null = null
      if (nets !== null) {
        payload = {}
        for (const p of PERSON_KEYS) {
          const net = nets[p]
          if (net === undefined) continue
          payload[map.idOf[p]] = net
        }
      }
      const json = await rpc('decide_contributions', { p_month: toDbMonth(m), p_net_incomes: payload })
      return toRpcResult<{ decidedAt: DateTimeKey }, 'locked' | 'no_previous'>(json, (j) => ({
        // 元に戻すにそのまま渡す（丸めずに持つ。04 §8.3）
        decidedAt: (j.prev as { decided_at: string }).decided_at,
      }))
    },

    async undoDecideContributions(m, decidedAt) {
      const json = await rpc('undo_decide_contributions', {
        p_month: toDbMonth(m),
        p_decided_at: decidedAt,
      })
      return toRpcResult<null, 'locked' | 'changed'>(json, () => null)
    },

    async confirmMonth(m, expected: PersonAmounts | null) {
      const map = requirePersons()
      let payload: Record<string, number> | null = null
      if (expected !== null) {
        payload = {}
        for (const p of PERSON_KEYS) payload[map.idOf[p]] = expected[p]
      }
      const json = await rpc('settle_confirm', { p_month: toDbMonth(m), p_expected: payload })
      if (json.result === 'stale') return { result: 'stale' }
      if (json.result === 'blocked') {
        // detail はローカル実装と同じ形にそろえる（previous_month は月、pending は件数）
        return blockedFrom<'future_month' | 'previous_month' | 'undecided' | 'pending'>(json, 'undecided', map)
      }
      if (json.result === 'already') {
        return { result: 'already', value: { status: json.status as 'confirmed' | 'settled' } }
      }
      return {
        result: 'ok',
        value: { status: json.status as 'confirmed' | 'settled', round: json.round as number },
      }
    },

    async setCheck(m, person, checked) {
      const map = requirePersons()
      const json = await rpc('settle_set_check', {
        p_month: toDbMonth(m),
        p_user_id: map.idOf[person],
        p_checked: checked,
      })
      return toRpcResult(json, (j) => ({ status: j.status as 'confirmed' | 'settled' }))
    },

    async reopenMonth(m) {
      const json = await rpc('settle_reopen', { p_month: toDbMonth(m) })
      return toRpcResult(json, (j) => ({ round: (j.round as number | undefined) ?? 0 }))
    },

    async undoConfirm(m, round) {
      const json = await rpc('settle_undo_confirm', { p_month: toDbMonth(m), p_round: round })
      return toRpcResult<null, 'checked'>(json, () => null)
    },

    async undoReopen(m, round) {
      const json = await rpc('settle_undo_reopen', { p_month: toDbMonth(m), p_round: round })
      return toRpcResult(json, (j) => ({
        status: (j.status as 'confirmed' | 'settled' | undefined) ?? 'confirmed',
      }))
    },

    async updatePerson(person, patch) {
      const map = requirePersons()
      await rpc('update_member', {
        p_user_id: map.idOf[person],
        p_display_name: patch.name,
        // ドメインの a / b を DB の teal / amber に戻す（§7.2）
        p_color: patch.color === 'b' ? 'amber' : 'teal',
        // 相手の行に渡しても DB 側（update_member）が無視する（出す割合は本人だけ。§2.2）
        p_rate: patch.ratePct ?? null,
      })
    },

    async updateContributionRate(ratePct) {
      await rpc('update_contribution_rate', { p_rate: ratePct })
    },

    async updateSalaryToJoint(salaryToJoint) {
      await rpc('update_salary_to_joint', { p_salary_to_joint: salaryToJoint })
    },

    async updateDefaultPayer(value) {
      await rpc('update_default_payer', { p_default_payer: value })
    },

    async updateLastSeen(at) {
      const { userId } = await requireSession()
      const { error } = await client
        .from('profiles')
        .update({ last_seen_at: `${at}:00+09:00` })
        .eq('user_id', userId)
      fail(error)
    },

    async markOnboarded(at) {
      const { userId } = await requireSession()
      const { error } = await client
        .from('profiles')
        .update({ onboarded_at: `${at}:00+09:00` })
        .eq('user_id', userId)
      fail(error)
    },

    async addTemplate(input: TemplateInput) {
      const map = requirePersons()
      if (householdId === null) throw new RepositoryError('not_member', '家計を読み込んでいません')
      const { data, error } = await client
        .from('fixed_cost_templates')
        .insert({
          household_id: householdId,
          name: input.name,
          category_id: input.cat,
          paid_by: fromPayer(input.payer, map),
          amount_kind: input.kind,
          amount: input.amount,
          // 開始月。範囲の外（省略の 2000-01-01 も）はトリガーが今月にする（0010 の templates_before_insert）
          start_month: input.from === undefined ? '2000-01-01' : toDbMonth(input.from),
        })
        .select('start_month')
        .single()
      if (error !== null) {
        const converted = toRepositoryError(error)
        // 開始月から今月までに精算中・精算済みの月があった（detail はその月の1日 → 月にそろえる）
        if (converted.code === 'month_locked') {
          throw new RepositoryError(
            'month_locked',
            converted.message,
            converted.detail === null ? null : toMonthKey(converted.detail)
          )
        }
        throw converted
      }
      // 追加したら開始月から今月までの行をすぐ作る（S-32「9月分から記録します」。04 §3）
      const start = toMonthKey((data as unknown as { start_month: string }).start_month)
      const months = currentMonth !== null && start <= currentMonth ? monthsBetween(start, currentMonth) : [start]
      for (const m of months) await rpc('ensure_month', { p_month: toDbMonth(m) })
    },

    async updateTemplate(id, input, from) {
      const map = requirePersons()
      // 0011 の update_template（何月分から変えるか・手つかずの行の書き換え・開始月を広げる・履歴は DB が行う）
      const json = await rpc('update_template', {
        p_template_id: id,
        p_name: input.name,
        p_category_id: input.cat,
        p_paid_by: fromPayer(input.payer, map),
        // 金額の種類は変えない。金額待ちのときは DB が無視する
        p_amount: input.kind === 'fixed' ? input.amount : null,
        p_from_month: from === undefined ? null : toDbMonth(from),
      })
      if (json.result === 'blocked') {
        // その月から今月までに精算中・精算済みの月があった（addTemplate の month_locked と同じ形にそろえる）
        if (json.reason === 'locked') {
          throw new RepositoryError(
            'month_locked',
            'その月は精算中です',
            typeof json.month === 'string' ? toMonthKey(json.month) : null
          )
        }
        throw new RepositoryError('unknown', 'ひな形を直せませんでした')
      }
      return typeof json.change_id === 'string' ? json.change_id : null
    },

    async undoTemplateChange(changeId) {
      const json = await rpc('undo_update_template', { p_change_id: changeId })
      return toRpcResult<null, 'too_late' | 'locked' | 'not_found'>(json, () => null)
    },

    async stopTemplate(id, undo = false) {
      const json = await rpc('stop_template', { p_template_id: id, p_undo: undo })
      return toRpcResult(json, (j) => ({
        until: j.end_month === undefined || j.end_month === null ? null : toMonthKey(j.end_month as string),
      }))
    },

    async deleteTemplate(id) {
      const json = await rpc('delete_template', { p_template_id: id })
      return toRpcResult<null, 'not_found' | 'too_late' | 'locked_rows'>(json, () => null)
    },

    /* 端末に保留した記録（§3.6。記録の追加だけ。精算・ロックの操作は絶対に保留しない） */
    ...createPendingApi({
      // オフラインでも動くよう、最後に読んだ人と端末の時計を使う
      context: async () => ({ by: viewer ?? 'a', at: deviceNow() }),
      send: (input) => repository.addExpense(input),
    }),
  }

  return repository
}
