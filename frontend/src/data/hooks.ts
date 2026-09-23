/**
 * 読み書きのフック（TanStack Query）。
 *
 * - 読むのは `useHousehold()`（家計のデータ一式）1つ。月ごとの数字は `useMonth()` が
 *   その中身から `domain/` の純粋関数で出す（データ層は計算しない）。
 * - 楽観更新は使わない。書いたあとに `snapshot` を invalidate して読み直す（CLAUDE.md §3）。
 */

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type {
  Attention,
  ConfirmBlock,
  DateTimeKey,
  Expense,
  MonthKey,
  MonthStatus,
  MonthSummary,
  PersonAmounts,
  PersonKey,
  S20State,
  SettleModel,
} from '../domain'
import {
  attention,
  confirmBlock,
  countNewExpenses,
  defaultSettleMonth,
  monthStatus,
  monthsUntil,
  pendingQueue,
  s20State,
  settleModel,
  summarize,
} from '../domain'
import { getRepository } from './index'
import { subscribePending } from './pending'
import { queryKeys } from './queryKeys'
import type {
  ExpensePatch,
  NewExpenseInput,
  Repository,
  RpcResult,
  SessionUser,
  Snapshot,
  TemplateInput,
} from './repository'

function repo(): Repository {
  return getRepository()
}

/* ------------------------------------------------------------------ *
 * 読む
 * ------------------------------------------------------------------ */

/** ログイン中の人（無ければ null） */
export function useSession(): UseQueryResult<SessionUser | null> {
  return useQuery({
    queryKey: queryKeys.session(),
    queryFn: () => repo().auth.currentUser(),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** 家計のデータ一式・「今日」・ログイン中の人（全画面の土台） */
export function useHousehold(enabled = true): UseQueryResult<Snapshot> {
  const client = useQueryClient()
  // 端末に保留した記録が送れたら読み直す（§3.6。つながったら自動で送る）
  useEffect(
    () =>
      subscribePending(() => {
        void client.invalidateQueries({ queryKey: queryKeys.snapshot() })
      }),
    [client]
  )
  return useQuery({
    queryKey: queryKeys.snapshot(),
    queryFn: () => repo().loadSnapshot(),
    enabled,
  })
}

/** 支出タブ（S-10・S-13）の集計。§6.2 の計算は domain が行う */
export function useMonthExpenses(month: MonthKey): {
  summary: MonthSummary | null
  status: MonthStatus | null
  newCount: number
} {
  const { data } = useHousehold()
  return useMemo(() => {
    if (data === undefined) return { summary: null, status: null, newCount: 0 }
    return {
      summary: summarize(data.data.expenses, month),
      status: monthStatus(data.data, month, data.now),
      newCount: countNewExpenses(data.data, data.viewer, month),
    }
  }, [data, month])
}

/**
 * 精算タブ（S-20〜S-22）。
 * `settleNow` は端末が持つ「月の途中に［この月を精算する］を押した月」（保存しない。§12.1 Q2）。
 */
export function useMonth(
  month: MonthKey,
  settleNow: MonthKey | null = null
): {
  model: SettleModel | null
  state: S20State | null
  blocker: ConfirmBlock | null
  pending: Expense[]
} {
  const { data } = useHousehold()
  return useMemo(() => {
    if (data === undefined) return { model: null, state: null, blocker: null, pending: [] }
    const model = settleModel(data.data, month, data.now)
    return {
      model,
      state: s20State(data.data, model, settleNow),
      blocker: confirmBlock(data.data, month, data.now),
      pending: pendingQueue(data.data, month),
    }
  }, [data, month, settleNow])
}

/** 赤い点・お知らせ行（§3.2・§3.5）と、月切替の範囲・精算タブの既定の月（§3.4） */
export function useAppStatus(): {
  now: DateTimeKey | null
  viewer: PersonKey | null
  notice: Attention | null
  months: MonthKey[]
  settleDefaultMonth: MonthKey | null
} {
  const { data } = useHousehold()
  return useMemo(() => {
    if (data === undefined) {
      return { now: null, viewer: null, notice: null, months: [], settleDefaultMonth: null }
    }
    return {
      now: data.now,
      viewer: data.viewer,
      notice: attention(data.data, data.viewer, data.now),
      months: monthsUntil(data.data, data.now),
      settleDefaultMonth: defaultSettleMonth(data.data, data.now),
    }
  }, [data])
}

/* ------------------------------------------------------------------ *
 * 書く
 * ------------------------------------------------------------------ */

/** 書いたあとに読み直す（楽観更新はしない） */
function useRefresh(): () => Promise<void> {
  const client = useQueryClient()
  return async () => {
    await client.invalidateQueries({ queryKey: queryKeys.snapshot() })
  }
}

function useWrite<TArgs, TResult>(
  run: (repository: Repository, args: TArgs) => Promise<TResult>
): UseMutationResult<TResult, Error, TArgs> {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (args: TArgs) => run(repo(), args),
    onSuccess: () => refresh(),
  })
}

/* 記録 --------------------------------------------------------------- */

export function useAddExpense(): UseMutationResult<Expense, Error, NewExpenseInput> {
  return useWrite((r, input: NewExpenseInput) => r.addExpense(input))
}

/**
 * オフラインのときの記録の追加（端末に保留する。§3.6）。
 * 保留するのは記録の追加だけ。ほかの書き込みは保留しない（「オンラインで直せます」）。
 */
export function useEnqueueExpense(): UseMutationResult<void, Error, NewExpenseInput> {
  return useWrite((r, input: NewExpenseInput) => r.enqueueExpense(input))
}

export function useUpdateExpense(): UseMutationResult<Expense, Error, { id: string; patch: ExpensePatch }> {
  return useWrite((r, { id, patch }) => r.updateExpense(id, patch))
}

export function useDeleteExpense(): UseMutationResult<void, Error, { id: string }> {
  return useWrite((r, { id }) => r.deleteExpense(id))
}

/** 消した記録の元に戻す（同じ id で入れ直す） */
export function useRestoreExpense(): UseMutationResult<Expense, Error, Expense> {
  return useWrite((r, expense: Expense) => r.restoreExpense(expense))
}

/** 金額待ちに金額を入れる（S-15） */
export function useFillAmount(): UseMutationResult<Expense, Error, { id: string; amount: number }> {
  return useWrite((r, { id, amount }) => r.fillAmount(id, amount))
}

/** 今月はなし（と、その元に戻す） */
export function useSetSkipped(): UseMutationResult<Expense, Error, { id: string; skipped: boolean }> {
  return useWrite((r, { id, skipped }) => r.setSkipped(id, skipped))
}

/** 来月に回す（`undo` で1か月戻す） */
export function useDeferExpense(): UseMutationResult<
  RpcResult<{ month: MonthKey }, 'not_fixed_row' | 'not_pending' | 'nothing_to_undo'>,
  Error,
  { id: string; undo?: boolean }
> {
  return useWrite((r, { id, undo }) => r.deferExpense(id, undo ?? false))
}

/* 出す額 ------------------------------------------------------------- */

export function useDecideContributions(): UseMutationResult<
  RpcResult<{ decidedAt: DateTimeKey }, 'locked' | 'no_previous'>,
  Error,
  { m: MonthKey; nets: Partial<Record<PersonKey, number>> | null }
> {
  return useWrite((r, { m, nets }) => r.decideContributions(m, nets))
}

export function useUndoDecideContributions(): UseMutationResult<
  RpcResult<null, 'locked' | 'changed'>,
  Error,
  { m: MonthKey; decidedAt: DateTimeKey }
> {
  return useWrite((r, { m, decidedAt }) => r.undoDecideContributions(m, decidedAt))
}

/* 精算 --------------------------------------------------------------- */

export function useConfirmMonth(): UseMutationResult<
  Awaited<ReturnType<Repository['confirmMonth']>>,
  Error,
  { m: MonthKey; expected: PersonAmounts | null }
> {
  return useWrite((r, { m, expected }) => r.confirmMonth(m, expected))
}

export function useSetCheck(): UseMutationResult<
  RpcResult<{ status: 'confirmed' | 'settled' }, 'not_locked' | 'nothing_to_move'>,
  Error,
  { m: MonthKey; person: PersonKey; checked: boolean }
> {
  return useWrite((r, { m, person, checked }) => r.setCheck(m, person, checked))
}

export function useReopenMonth(): UseMutationResult<RpcResult<{ round: number }, never>, Error, { m: MonthKey }> {
  return useWrite((r, { m }) => r.reopenMonth(m))
}

export function useUndoConfirm(): UseMutationResult<RpcResult<null, 'checked'>, Error, { m: MonthKey; round: number }> {
  return useWrite((r, { m, round }) => r.undoConfirm(m, round))
}

export function useUndoReopen(): UseMutationResult<
  RpcResult<{ status: 'confirmed' | 'settled' }, 'changed'>,
  Error,
  { m: MonthKey; round: number }
> {
  return useWrite((r, { m, round }) => r.undoReopen(m, round))
}

/* 設定 --------------------------------------------------------------- */

export function useUpdatePerson(): UseMutationResult<
  void,
  Error,
  { person: PersonKey; name: string; color: PersonKey; ratePct: number }
> {
  return useWrite((r, { person, name, color, ratePct }) => r.updatePerson(person, { name, color, ratePct }))
}

export function useUpdateDefaultPayer(): UseMutationResult<void, Error, 'self' | 'joint'> {
  return useWrite((r, value: 'self' | 'joint') => r.updateDefaultPayer(value))
}

export function useUpdateLastSeen(): UseMutationResult<void, Error, DateTimeKey> {
  return useWrite((r, at: DateTimeKey) => r.updateLastSeen(at))
}

export function useMarkOnboarded(): UseMutationResult<void, Error, DateTimeKey> {
  return useWrite((r, at: DateTimeKey) => r.markOnboarded(at))
}

/* 毎月の支払い -------------------------------------------------------- */

export function useAddTemplate(): UseMutationResult<void, Error, TemplateInput> {
  return useWrite((r, input: TemplateInput) => r.addTemplate(input))
}

export function useUpdateTemplate(): UseMutationResult<void, Error, { id: string; input: TemplateInput }> {
  return useWrite((r, { id, input }) => r.updateTemplate(id, input))
}

export function useStopTemplate(): UseMutationResult<
  RpcResult<{ until: MonthKey | null }, never>,
  Error,
  { id: string; undo?: boolean }
> {
  return useWrite((r, { id, undo }) => r.stopTemplate(id, undo ?? false))
}

export function useDeleteTemplate(): UseMutationResult<
  RpcResult<null, 'not_found' | 'too_late' | 'locked_rows'>,
  Error,
  { id: string }
> {
  return useWrite((r, { id }) => r.deleteTemplate(id))
}

/* ログイン ------------------------------------------------------------ */

export function useSignIn(): UseMutationResult<SessionUser, Error, { loginId: string; password: string }> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ loginId, password }: { loginId: string; password: string }) => repo().auth.signIn(loginId, password),
    onSuccess: async () => {
      await client.invalidateQueries()
    },
  })
}

export function useSignOut(): UseMutationResult<void, Error, void> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => repo().auth.signOut(),
    onSuccess: () => {
      client.clear()
    },
  })
}

export function useUpdatePassword(): UseMutationResult<void, Error, string> {
  return useMutation({ mutationFn: (password: string) => repo().auth.updatePassword(password) })
}
