/**
 * ローカル実装（Supabase を作る前の開発用）。
 *
 * 仕様書 §9 の見本データ（`domain/sampleData.ts` の `buildScenario`）をメモリに持ち、
 * 書き込みは `domain/operations.ts`（DB の RPC と同じふるまい）で行う。
 * リロードで初期状態に戻る。
 */

import type { Contribution, DateTimeKey, Expense, HouseholdData, MonthKey, PersonKey, ScenarioId } from '../../domain'
import {
  addMonth,
  buildScenario,
  canDefer,
  confirmBlock,
  createExpense,
  deferRow,
  confirmMonth as domainConfirmMonth,
  decideContributions as domainDecide,
  fillAmount as domainFillAmount,
  reopenMonth as domainReopen,
  setCheck as domainSetCheck,
  ensureMonth,
  findExpense,
  isLockedStatus,
  monthOf,
  monthStatus,
  monthsUntil,
  PERSON_KEYS,
  saveContributions,
  settleModel,
  undeferRow,
} from '../../domain'
import { createPendingApi, withPending } from '../pending'
import {
  AuthError,
  type AuthRepository,
  rpcBlocked as blocked,
  type ExpensePatch,
  type NewExpenseInput,
  type Repository,
  RepositoryError,
  type RpcOk,
  type SessionUser,
  type Snapshot,
  type TemplateInput,
} from '../repository'

function ok<T>(value: T): RpcOk<T> {
  return { result: 'ok', value }
}

/** 2つの日時の差（ミリ秒）。どちらも JST の 'YYYY-MM-DDTHH:mm' なので、同じ読み方をすれば差は正しい */
function elapsedMs(from: DateTimeKey, to: DateTimeKey): number {
  return new Date(to).getTime() - new Date(from).getTime()
}

/** 「今日」は見本データの時点から動かさない（02 §10 C10。now は必ず引数で渡す） */
interface LocalState {
  data: HouseholdData
  now: DateTimeKey
  viewer: PersonKey
  onboardedAt: DateTimeKey | null
  /** 出す額を決めたのを元に戻すための控え（04 §8.3 private.contribution_undo） */
  undo: Map<string, { m: MonthKey; by: PersonKey; rows: Partial<Record<PersonKey, Contribution | null>> }>
}

/** 見本データのログイン ID（仕様書 §9.1） */
function loginKey(state: LocalState, loginId: string): PersonKey | null {
  for (const p of PERSON_KEYS) {
    if (state.data.people[p].id === loginId.trim().toLowerCase()) return p
  }
  return null
}

export function createLocalRepository(scenario: ScenarioId = 'sep-open'): Repository {
  const built = buildScenario(scenario)
  const state: LocalState = {
    data: built.data,
    now: built.now,
    viewer: 'a',
    onboardedAt: built.now,
    undo: new Map(),
  }
  let signedIn = false
  const listeners = new Set<(user: SessionUser | null) => void>()
  const notify = (): void => {
    for (const listener of listeners) listener(signedIn ? { viewer: state.viewer } : null)
  }

  const requireSignedIn = (): PersonKey => {
    if (!signedIn) throw new RepositoryError('not_member', 'ログインしていません')
    return state.viewer
  }

  const mustFind = (id: string): Expense => {
    const e = findExpense(state.data, id)
    if (!e) throw new RepositoryError('unknown', '記録が見つかりません')
    return e
  }

  const assertUnlocked = (m: MonthKey): void => {
    if (isLockedStatus(monthStatus(state.data, m, state.now))) {
      throw new RepositoryError('month_locked', 'その月は精算中です', m)
    }
  }

  const auth: AuthRepository = {
    async currentUser() {
      return signedIn ? { viewer: state.viewer } : null
    },
    async signIn(loginId, password) {
      const p = loginKey(state, loginId)
      if (p === null || password.length === 0) {
        throw new AuthError('invalid_credentials', 'ID かパスワードが違います')
      }
      state.viewer = p
      signedIn = true
      notify()
      return { viewer: p }
    },
    async signOut() {
      signedIn = false
      notify()
    },
    async updatePassword() {
      // ローカル実装は覚えない（本番は supabase.auth.updateUser）
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  const repository: Repository = {
    auth,

    async loadSnapshot(): Promise<Snapshot> {
      requireSignedIn()
      // 家計を作った月から今月まで、抜けている行を作る（04 §3。app_status と同じ）
      for (const m of monthsUntil(state.data, state.now)) {
        ensureMonth(state.data, m, state.now)
      }
      return {
        // 端末に保留した記録を混ぜる（合計には入らない。§3.6）
        data: withPending(state.data),
        now: state.now,
        viewer: state.viewer,
        onboardedAt: state.onboardedAt,
      }
    },

    async addExpense(input: NewExpenseInput) {
      const viewer = requireSignedIn()
      assertUnlocked(monthOf(input.date))
      const e = createExpense({
        id: input.id,
        date: input.date,
        payer: input.payer,
        cat: input.cat,
        amount: input.amount,
        memo: input.memo,
        by: viewer,
        at: state.now,
      })
      state.data.expenses.push(e)
      return e
    },

    async updateExpense(id, patch: ExpensePatch) {
      const viewer = requireSignedIn()
      const e = mustFind(id)
      assertUnlocked(e.month)
      if (e.tpl !== null) {
        // 毎月の支払いの行（S-14 `fixed`）は、**2人とも**払った人と金額だけ直せる（§2.2）。
        // 日付・カテゴリ・メモはひな形が持つので、行からは直せない
        if (patch.date !== undefined || patch.cat !== undefined || patch.memo !== undefined) {
          throw new RepositoryError('fixed_row_immutable', 'この行は直せません')
        }
      } else if (e.by !== viewer) {
        throw new RepositoryError('not_allowed', '相手の記録は直せません')
      }
      if (patch.date !== undefined) {
        assertUnlocked(monthOf(patch.date))
        e.date = patch.date
        e.month = monthOf(patch.date)
      }
      if (patch.cat !== undefined) e.cat = patch.cat
      if (patch.amount !== undefined) e.amount = patch.amount
      if (patch.payer !== undefined) e.payer = patch.payer
      if (patch.memo !== undefined) e.memo = patch.memo
      e.editedAt = state.now
      e.editedBy = viewer
      return e
    },

    async deleteExpense(id) {
      const viewer = requireSignedIn()
      const e = mustFind(id)
      assertUnlocked(e.month)
      if (e.tpl !== null || e.by !== viewer) {
        throw new RepositoryError('not_allowed', 'この記録は消せません')
      }
      state.data.expenses = state.data.expenses.filter((x) => x.id !== id)
    },

    async restoreExpense(expense) {
      requireSignedIn()
      assertUnlocked(expense.month)
      state.data.expenses.push({ ...expense })
      return expense
    },

    async fillAmount(id, amount) {
      const viewer = requireSignedIn()
      const e = mustFind(id)
      assertUnlocked(e.month)
      domainFillAmount(state.data, id, amount, viewer, state.now)
      return e
    },

    async setSkipped(id, skipped) {
      requireSignedIn()
      const e = mustFind(id)
      assertUnlocked(e.month)
      e.skipped = skipped
      return e
    },

    async deferExpense(id, undo = false) {
      requireSignedIn()
      const e = mustFind(id)
      if (e.tpl === null) return blocked('not_fixed_row', {})
      if (!undo) {
        if (!canDefer(state.data, e, state.now)) {
          if (e.amount !== null || e.skipped) return blocked('not_pending', {})
          throw new RepositoryError('month_locked', '来月は精算中です', addMonth(e.month, 1))
        }
        deferRow(state.data, id)
      } else {
        if (e.labelMonth === null || e.month <= e.labelMonth) return blocked('nothing_to_undo', {})
        assertUnlocked(addMonth(e.month, -1))
        undeferRow(state.data, id)
      }
      return ok({ month: e.month })
    },

    async decideContributions(m, nets) {
      const viewer = requireSignedIn()
      if (isLockedStatus(monthStatus(state.data, m, state.now))) return blocked('locked', {})
      const prev = addMonth(m, -1)
      let input: Partial<Record<PersonKey, number>>
      if (nets === null) {
        // ［この額で決める］: 決まっていない人を「先月の手取り × いまの割合」で
        input = {}
        const missing: PersonKey[] = []
        for (const p of PERSON_KEYS) {
          if (state.data.contributions[m]?.[p]) continue
          const before = state.data.contributions[prev]?.[p]
          if (!before) {
            missing.push(p)
            continue
          }
          input[p] = before.net
        }
        if (missing.length > 0) return blocked('no_previous', { people: missing })
      } else {
        input = nets
      }
      const before: Partial<Record<PersonKey, Contribution | null>> = {}
      for (const p of PERSON_KEYS) {
        if (input[p] === undefined) continue
        before[p] = state.data.contributions[m]?.[p] ?? null
      }
      const decided = domainDecide(state.data, m, input, viewer, state.now)
      saveContributions(state.data, m, decided)
      const stamp: DateTimeKey = state.now
      state.undo.set(`${m}:${stamp}`, { m, by: viewer, rows: before })
      return ok({ decidedAt: stamp })
    },

    async undoDecideContributions(m, decidedAt) {
      const viewer = requireSignedIn()
      if (isLockedStatus(monthStatus(state.data, m, state.now))) return blocked('locked', {})
      const undo = state.undo.get(`${m}:${decidedAt}`)
      if (!undo || undo.by !== viewer) return blocked('changed', {})
      const cm = state.data.contributions[m] ?? {}
      for (const p of PERSON_KEYS) {
        if (!(p in undo.rows)) continue
        const now = cm[p]
        // そのあと誰かが決め直していたら戻さない
        if (!now || now.at !== decidedAt || now.by !== undo.by) return blocked('changed', {})
      }
      for (const p of PERSON_KEYS) {
        if (!(p in undo.rows)) continue
        const before = undo.rows[p]
        if (before === null || before === undefined) delete cm[p]
        else cm[p] = before
      }
      state.data.contributions[m] = cm
      state.undo.delete(`${m}:${decidedAt}`)
      return ok(null)
    },

    async confirmMonth(m, expected) {
      const viewer = requireSignedIn()
      const status = monthStatus(state.data, m, state.now)
      if (isLockedStatus(status)) {
        return { result: 'already', value: { status: status as 'confirmed' | 'settled' } }
      }
      if (m > monthOf(state.now)) return blocked('future_month', {})
      const block = confirmBlock(state.data, m, state.now)
      if (block !== null) {
        if (block.reason === 'previous') return blocked('previous_month', { m: block.m })
        if (block.reason === 'pending') return blocked('pending', { count: block.count })
        if (block.reason === 'undecided') return blocked('undecided', {})
      }
      if (expected !== null) {
        const model = settleModel(state.data, m, state.now)
        const remaining = model.remaining
        if (!remaining || PERSON_KEYS.some((p) => remaining[p] !== expected[p])) {
          return { result: 'stale' }
        }
      }
      const status2 = domainConfirmMonth(state.data, m, viewer, state.now)
      return ok({ status: status2, round: state.data.settlements[m]?.round ?? 1 })
    },

    async setCheck(m, person, checked) {
      const viewer = requireSignedIn()
      const rec = state.data.settlements[m]
      if (!rec || !isLockedStatus(monthStatus(state.data, m, state.now))) {
        return blocked('not_locked', {})
      }
      const model = settleModel(state.data, m, state.now)
      if (!model.remaining || model.remaining[person] === 0) return blocked('nothing_to_move', {})
      domainSetCheck(state.data, m, person, checked, viewer, state.now)
      return ok({ status: (rec.status ?? 'confirmed') as 'confirmed' | 'settled' })
    },

    async reopenMonth(m) {
      const viewer = requireSignedIn()
      const rec = state.data.settlements[m]
      if (!rec || rec.status === null) return { result: 'already', value: { round: rec?.round ?? 0 } }
      domainReopen(state.data, m, viewer, state.now)
      return ok({ round: rec.round })
    },

    async undoConfirm(m, round) {
      requireSignedIn()
      const rec = state.data.settlements[m]
      if (!rec || rec.status === null || rec.round !== round) {
        return { result: 'already', value: null }
      }
      if (PERSON_KEYS.some((p) => rec.checks[p])) return blocked('checked', {})
      if (round === 1) delete state.data.settlements[m]
      else {
        rec.status = null
        rec.round -= 1
        rec.snapshot = null
        rec.settledAt = null
      }
      return ok(null)
    },

    async undoReopen(m, round) {
      requireSignedIn()
      const rec = state.data.settlements[m]
      if (!rec || rec.status !== null || rec.round !== round) {
        return { result: 'already', value: { status: 'confirmed' } }
      }
      const back = rec.reopenedFrom
      const snap = rec.undoSnapshot
      if (back === null || snap === null) return blocked('changed', {})
      // やり直したあとに数字が変わっていたら戻さない（04 §8.2 settle_undo_reopen と同じ突き合わせ）:
      // 支出合計・共用払い・出す額の合計・各人の精算額が確定したときと同じで、金額待ちが0件
      const model = settleModel(state.data, m, state.now)
      const live = model.settle
      if (model.pending.length > 0 || !model.decided || live === null) return blocked('changed', {})
      const contribTotal = (model.contrib.a ?? 0) + (model.contrib.b ?? 0)
      const same =
        model.total === snap.total &&
        model.joint === snap.joint &&
        contribTotal === snap.contrib.a + snap.contrib.b &&
        PERSON_KEYS.every((p) => live[p] === snap.settle[p])
      if (!same) return blocked('changed', {})
      // 済んだ分をチェックに戻す。
      // 戻すのは **このやり直しで done に移した分だけ**（＝いまの回〈rec.round〉に積んだ行）。
      // 前の回で済んだ分まで戻すと、確定 → チェック → やり直し → 精算 → やり直し → 元に戻す で
      // 古い「入れた／受け取った」が二重に戻ってしまう（02 §7）。
      for (const p of PERSON_KEYS) {
        const entries = rec.done[p]
        const last = entries[entries.length - 1]
        if (!last || last.round !== rec.round) continue
        rec.checks[p] = { by: last.by, at: last.at, amount: last.amount }
        rec.transferred[p] -= last.amount
        entries.pop()
      }
      // 確定したときの値を書き戻してから状態を戻す
      rec.snapshot = snap
      rec.undoSnapshot = null
      rec.status = back
      rec.reopenedFrom = null
      rec.reopenedAt = null
      rec.reopenedBy = null
      return ok({ status: back })
    },

    async updatePerson(person, patch) {
      const viewer = requireSignedIn()
      const other: PersonKey = person === 'a' ? 'b' : 'a'
      if (state.data.people[other].color === patch.color) {
        state.data.people[other].color = patch.color === 'a' ? 'b' : 'a'
      }
      state.data.people[person].name = patch.name
      state.data.people[person].color = patch.color
      // 出す割合は本人の行だけ（相手の行に渡ってきても変えない。§2.2。DB の update_member と同じ）
      if (patch.ratePct !== undefined && person === viewer) {
        state.data.people[person].ratePct = patch.ratePct
      }
    },

    async updateContributionRate(ratePct) {
      const viewer = requireSignedIn()
      state.data.people[viewer].ratePct = ratePct
    },

    async updateSalaryToJoint(salaryToJoint) {
      const viewer = requireSignedIn()
      state.data.people[viewer].salaryToJoint = salaryToJoint
    },

    async updateDefaultPayer(value) {
      const viewer = requireSignedIn()
      state.data.people[viewer].defaultPayer = value
    },

    async updateLastSeen(at) {
      const viewer = requireSignedIn()
      state.data.people[viewer].lastSeen = at
    },

    async markOnboarded(at) {
      requireSignedIn()
      state.onboardedAt = at
    },

    async addTemplate(input: TemplateInput) {
      const viewer = requireSignedIn()
      const m = monthOf(state.now)
      state.data.templates.push({
        id: `t-${Date.now().toString(36)}`,
        name: input.name,
        cat: input.cat,
        payer: input.payer,
        kind: input.kind,
        amount: input.amount,
        from: m,
        until: null,
        createdBy: viewer,
        createdAt: state.now,
      })
      // 追加したら今月分の行をすぐ作る（S-32「9月分から記録します」）
      ensureMonth(state.data, m, state.now)
    },

    async updateTemplate(id, input) {
      requireSignedIn()
      const t = state.data.templates.find((x) => x.id === id)
      if (!t) throw new RepositoryError('unknown', 'ひな形が見つかりません')
      t.name = input.name
      t.cat = input.cat
      t.payer = input.payer
      t.kind = input.kind
      t.amount = input.amount
    },

    async stopTemplate(id, undo = false) {
      requireSignedIn()
      const t = state.data.templates.find((x) => x.id === id)
      if (!t) return ok({ until: null })
      if (undo) {
        t.until = null
        return ok({ until: null })
      }
      const months = state.data.expenses
        .filter((e) => e.tpl === id && e.labelMonth !== null)
        .map((e) => e.labelMonth as MonthKey)
      const last = months.length === 0 ? null : months.reduce((x, y) => (x > y ? x : y))
      t.until = last === null ? t.from : addMonth(last, 1)
      return ok({ until: t.until })
    },

    async deleteTemplate(id) {
      const viewer = requireSignedIn()
      const t = state.data.templates.find((x) => x.id === id)
      if (!t) return blocked('not_found', {})
      const rows = state.data.expenses.filter((e) => e.tpl === id)
      const untouched = rows.every(
        (e) =>
          e.labelMonth === t.from &&
          e.month === e.labelMonth &&
          e.amountBy === null &&
          e.editedAt === null &&
          !e.skipped
      )
      // 作った人・行が手つかず・作ってから1分のあいだだけ（04 §8.2 delete_template）
      const since = elapsedMs(t.createdAt, state.now)
      if (t.createdBy !== viewer || !untouched || !Number.isFinite(since) || since > 60_000) {
        return blocked('too_late', {})
      }
      if (rows.some((e) => isLockedStatus(monthStatus(state.data, e.month, state.now)))) {
        return blocked('locked_rows', {})
      }
      state.data.expenses = state.data.expenses.filter((e) => e.tpl !== id)
      state.data.templates = state.data.templates.filter((x) => x.id !== id)
      return ok(null)
    },

    /* 端末に保留した記録（§3.6。記録の追加だけ） ------------------- */
    ...createPendingApi({
      context: async () => ({ by: state.viewer, at: state.now }),
      send: (input) => repository.addExpense(input),
    }),
  }

  return repository
}
