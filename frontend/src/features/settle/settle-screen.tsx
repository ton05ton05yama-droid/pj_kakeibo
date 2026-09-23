import { Box } from '@chakra-ui/react'
import { type ReactNode, useCallback, useEffect, useReducer, useState } from 'react'
import { useLocation } from 'react-router'
import { useToast } from '@/app/providers'
import { InlineMessage, MonthAppBar, OfflineRow, PrimaryButton, TextButton, usePageScrolled } from '@/components'
import {
  RepositoryError,
  useConfirmMonth,
  useDecideContributions,
  useHousehold,
  useReopenMonth,
  useSetCheck,
  useUndoConfirm,
  useUndoDecideContributions,
  useUndoReopen,
} from '@/data'
import type { Expense, MonthKey, PersonKey } from '@/domain'
import {
  addMonth,
  defaultSettleMonth,
  monthNumber,
  monthOf,
  PERSON_KEYS,
  pendingQueue,
  s20State,
  settleModel,
  yearNumber,
} from '@/domain'
import { MonthPickerSheet } from '@/features/monthPicker'
import { useOnline } from '@/lib/use-online'
import { BreakdownSheet, S22_STATES } from './breakdown-sheet'
import { CalcSection } from './components/calc-section'
import { DecideBlock } from './components/decide-block'
import { JointLine } from './components/joint-line'
import { PrepList } from './components/prep-list'
import { SettleCard } from './components/settle-card'
import { SettleFoot } from './components/settle-foot'
import { StatusLine } from './components/status-line'
import { ContributionSheet } from './contribution-sheet'
import { BUTTON, LINE, NOTE, TOAST } from './labels'
import { whoName } from './people'
import { decidePlan } from './undecided'
import { useSettleMonth } from './use-settle-month'

/** その場の1行の置き場所（§4 S-20）。押したボタンの直下に出す */
type MessageAt = 'main' | 'a' | 'b' | 'redo' | 'status'
type Message = { at: MessageAt; text: string; tone: 'error' | 'info' }
type SheetState = null | { id: 'month' } | { id: 'contribution' } | { id: 'breakdown'; person: PersonKey }

export type SettleScreenProps = {
  /**
   * ［金額を入れる］（S-20 `prep`）で S-15 を順に開く。S-15 は支出タブの担当の画面なので、
   * つなぐのはアプリ側（`app/app.tsx`）。渡されるまでは押しても何も起きない。
   */
  onFillPending?: (queue: readonly Expense[]) => void
}

/**
 * S-20 精算（月）（§4 S-20・§6）。
 *
 * 状態は8つ（`settled` `transfer` `empty` `undecided` `estimate` `prep` `redo` `ready`）で、
 * 決め方は domain の `s20State`（§4 S-20「状態の決め方」）。画面の中で式は書かない（§6.2）。
 *
 * `settleNow`（［この月を精算する］）は**この端末の画面の状態**で、保存しない。
 * 精算タブをもう一度押す・ほかのタブへ移る・月を切り替えると `estimate`（見込み）に戻る（§6.3 ケースM）。
 */
export function SettleScreen({ onFillPending }: SettleScreenProps) {
  const scrolled = usePageScrolled()
  const online = useOnline()
  const toast = useToast()
  const location = useLocation()
  const { data: snapshot } = useHousehold()
  // 書いたあとに描き直す合図（ローカル実装は同じデータをその場で書き換えて返すので、
  // 問い合わせの結果だけでは描き直しが起きないことがある）
  const [, refreshed] = useReducer((n: number) => n + 1, 0)
  const settleDefaultMonth = snapshot ? defaultSettleMonth(snapshot.data, snapshot.now) : null
  const { month, setMonth } = useSettleMonth(settleDefaultMonth)

  const [settleNow, setSettleNow] = useState<MonthKey | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [sheetMessage, setSheetMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null)
  const [pendingToast, setPendingToast] = useState<{ text: string; onUndo?: () => void } | null>(null)

  // 下端に固定した部分の高さを測ってから出す（固定部分が無い状態では、タブバーの 8px 上。§3.7）
  useEffect(() => {
    if (pendingToast === null) return
    const node = document.querySelector('[data-settle-foot]')
    const offsetBottom = node ? `${Math.round(node.getBoundingClientRect().height)}px` : '0px'
    toast.show({
      text: pendingToast.text,
      offsetBottom,
      ...(pendingToast.onUndo ? { onUndo: pendingToast.onUndo } : {}),
    })
    setPendingToast(null)
  }, [pendingToast, toast])

  // 精算タブをもう一度押す・ほかのタブへ移ると、［この月を精算する］のモードは消える（§4 S-20）。
  // タブを押し直したときも履歴の key が変わるので、それを合図にする
  const navigationKey = location.key
  const navigationState: unknown = location.state
  useEffect(() => {
    if (navigationKey === undefined) return
    setSettleNow(null)
    setCalcOpen(false)
    setMessage(null)
    // 支出タブのお知らせ行・S-14 から渡された月を開く（`navigate('/settle', { state: { month } })`）。
    // 外から来る値なので、MonthKey の形かどうかを確かめてから使う
    const passed = (navigationState as { month?: unknown } | null)?.month
    if (typeof passed === 'string' && /^\d{4}-\d{2}$/.test(passed)) setMonth(passed as MonthKey)
  }, [navigationKey, navigationState, setMonth])

  const decide = useDecideContributions()
  const undoDecide = useUndoDecideContributions()
  const confirm = useConfirmMonth()
  const undoConfirm = useUndoConfirm()
  const setCheck = useSetCheck()
  const reopen = useReopenMonth()
  const undoReopen = useUndoReopen()

  const changeMonth = useCallback(
    (next: MonthKey) => {
      setMonth(next)
      setSettleNow(null)
      setCalcOpen(false)
      setMessage(null)
      setSheet(null)
    },
    [setMonth]
  )

  if (snapshot === undefined || month === null) return null

  const { data, now, viewer } = snapshot
  // 精算の見え方と状態は domain の純粋関数で出す（画面の中で式を書かない。§6.2）
  const model = settleModel(data, month, now)
  const state = s20State(data, model, settleNow)
  // 片付ける順（払う人が個人の行 → 共用の行。それぞれの中は対象月の古い順、同じならひな形の順。§4 S-20 `prep`）
  const queue = pendingQueue(data, month)
  const thisMonth = monthOf(now)
  const bothZero =
    model.decided &&
    model.remaining !== null &&
    model.remaining.a === 0 &&
    model.remaining.b === 0 &&
    !model.hasTransferred
  // 数字の無い式は、チェックの記録が無いときだけ（§6.1-5・§6.3 ケースI）。
  // その月に給料が共用に入る人がいるときも出さない（式に「− 共用に入った給料」が無く、
  // カードの金額・向きと合わなく見えるため。§6.1-5・§6.3 ケースN）
  const showFormula =
    ['estimate', 'ready', 'transfer', 'settled'].includes(state) &&
    !model.hasDone &&
    model.jointSalary.a + model.jointSalary.b === 0
  const showCards = !['empty', 'undecided', 'prep'].includes(state)

  /** その場の1行（§1.4）。S-20 では押したボタンの直下に出す */
  const line = (at: MessageAt) =>
    message && message.at === at ? (
      <Box mt={1}>
        <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
      </Box>
    ) : null

  const say = (at: MessageAt, text: string, tone: 'error' | 'info' = 'info') => setMessage({ at, text, tone })

  /** 書き込みが途中で止まったとき（§1.4 の1行を、押したボタンの直下に出す） */
  const run = (at: MessageAt, action: () => Promise<void>): void => {
    void action().catch((error: unknown) => {
      if (error instanceof RepositoryError && error.code === 'month_locked') {
        say(at, LINE.locked(month, model.status))
      }
    })
  }

  /** トーストは、押したあとの画面で測った固定部分の高さの 8px 上に出す（§3.7） */
  const showToast = (text: string, onUndo?: () => void): void =>
    setPendingToast({ text, ...(onUndo ? { onUndo } : {}) })

  /* ［この額で決める］（§4 S-20 `undecided`） */
  const onDecideShown = async (): Promise<void> => {
    if (!online) return say('main', LINE.offline)
    setMessage(null)
    const result = await decide.mutateAsync({ m: month, nets: null })
    if (result.result === 'blocked') {
      if (result.reason === 'locked') say('main', LINE.locked(month, model.status))
      return
    }
    const { decidedAt } = result.value
    refreshed()
    showToast(TOAST.decided(month), () => {
      void undoDecide.mutateAsync({ m: month, decidedAt }).then(refreshed)
    })
  }

  /* S-21 ［決める］ */
  const onDecideNets = async (nets: Record<PersonKey, number>): Promise<void> => {
    if (!online) return setSheetMessage({ text: LINE.offline, tone: 'info' })
    const result = await decide.mutateAsync({ m: month, nets })
    if (result.result === 'blocked') {
      setSheetMessage({ text: LINE.locked(month, model.status), tone: 'info' })
      return
    }
    setSheet(null)
    setSheetMessage(null)
    const { decidedAt } = result.value
    refreshed()
    showToast(TOAST.decided(month), () => {
      void undoDecide.mutateAsync({ m: month, decidedAt }).then(refreshed)
    })
  }

  /* ［この金額で精算］（§4.0.2 closing → confirmed） */
  const onConfirm = async (): Promise<void> => {
    if (!online) return say('main', LINE.offline)
    setMessage(null)
    const result = await confirm.mutateAsync({ m: month, expected: model.remaining })
    if (result.result === 'already') {
      // ケースJ: 相手が先に押していた。押したボタンが消えるので状態の1行の直下に出す
      setCalcOpen(false)
      say('status', LINE.alreadyConfirmed(month))
      return
    }
    if (result.result === 'blocked') {
      if (result.reason === 'previous_month') {
        const previous = typeof result.detail.m === 'string' ? result.detail.m : month
        say('main', LINE.previousMonth(previous))
      }
      return
    }
    if (result.result === 'stale') return
    setCalcOpen(false)
    const { status, round } = result.value
    refreshed()
    showToast(status === 'settled' ? TOAST.settled(month) : TOAST.confirmed(month), () => {
      void undoConfirm.mutateAsync({ m: month, round }).then(refreshed)
    })
  }

  /* ［入れた］／［受け取った］（もう一度押すと外れる。そろったら自動で精算済み） */
  const onCheck = async (person: PersonKey): Promise<void> => {
    if (!online) return say(person, LINE.offline)
    setMessage(null)
    const wasChecked = model.checks[person] !== undefined
    const isIn = (model.remaining?.[person] ?? 0) > 0
    const name = whoName(data, person)
    const result = await setCheck.mutateAsync({ m: month, person, checked: !wasChecked })
    if (result.result === 'blocked') return
    const settledNow = !wasChecked && result.value.status === 'settled'
    const text = settledNow
      ? person === viewer
        ? TOAST.settled(month)
        : TOAST.checkedAndSettled(name, isIn, month)
      : wasChecked
        ? TOAST.unchecked(name, isIn)
        : TOAST.checked(name, isIn)
    refreshed()
    showToast(text, () => {
      void setCheck.mutateAsync({ m: month, person, checked: wasChecked }).then(refreshed)
    })
  }

  /* ［精算をやり直す］ */
  const onReopen = async (): Promise<void> => {
    if (!online) return say('redo', LINE.offline)
    setMessage(null)
    const result = await reopen.mutateAsync({ m: month })
    if (result.result === 'blocked') return
    setCalcOpen(false)
    const { round } = result.value
    refreshed()
    showToast(TOAST.reopened(month), () => {
      void undoReopen.mutateAsync({ m: month, round }).then(refreshed)
    })
  }

  /** シートを開く。出ていたトーストは消す（§3.7） */
  const openSheet = (next: Exclude<SheetState, null>): void => {
    toast.hide()
    setSheet(next)
  }

  const openContribution = (): void => {
    setSheetMessage(null)
    openSheet({ id: 'contribution' })
  }

  const { missing } = decidePlan(data, month, viewer, now)

  /* 下端に固定した部分（状態による。置くのはボタン1つだけ） */
  let foot: ReactNode = null
  if (state === 'empty') {
    foot = <PrimaryButton onClick={openContribution}>{BUTTON.openContribution}</PrimaryButton>
  } else if (state === 'undecided') {
    foot = missing ? (
      <PrimaryButton onClick={openContribution}>{BUTTON.openContribution}</PrimaryButton>
    ) : (
      <PrimaryButton loading={decide.isPending} onClick={() => run('main', onDecideShown)}>
        {BUTTON.decideShown}
      </PrimaryButton>
    )
  } else if (state === 'prep') {
    foot = <PrimaryButton onClick={() => onFillPending?.(queue)}>{BUTTON.fillAmount}</PrimaryButton>
  } else if (state === 'estimate') {
    foot = <TextButton onClick={() => setSettleNow(month)}>{BUTTON.settleNow}</TextButton>
  } else if (state === 'ready' || state === 'redo') {
    foot = (
      <PrimaryButton loading={confirm.isPending} onClick={() => run('main', onConfirm)}>
        {BUTTON.confirm}
      </PrimaryButton>
    )
  }

  return (
    <>
      <Box data-screen='S-20' data-state={state} display='flex' flexDirection='column' flex='1'>
        <MonthAppBar
          year={yearNumber(month)}
          month={monthNumber(month)}
          scrolled={scrolled}
          canGoPrev={month > data.household.createdMonth}
          canGoNext={month < thisMonth}
          isDefaultMonth={month === settleDefaultMonth}
          onPrevMonth={() => changeMonth(addMonth(month, -1))}
          onNextMonth={() => changeMonth(addMonth(month, 1))}
          onOpenMonthPicker={() => openSheet({ id: 'month' })}
        />
        {online ? null : <OfflineRow />}

        <StatusLine state={state} model={model} month={month} now={now} bothZero={bothZero} showFormula={showFormula} />
        {line('status')}

        {state === 'undecided' ? (
          <>
            <DecideBlock data={data} month={month} viewer={viewer} now={now} />
            <Box>
              <TextButton onClick={openContribution}>{BUTTON.changeNet}</TextButton>
            </Box>
          </>
        ) : null}

        {state === 'prep' ? <PrepList queue={queue} /> : null}

        {showCards ? (
          <>
            {PERSON_KEYS.map((p) => (
              <SettleCard
                key={p}
                person={p}
                data={data}
                model={model}
                state={state}
                viewer={viewer}
                onOpenBreakdown={() => openSheet({ id: 'breakdown', person: p })}
                onCheck={() => run(p, () => onCheck(p))}
                message={line(p)}
              />
            ))}
            <JointLine model={model} estimate={state === 'estimate'} />
            {state === 'estimate' && model.pending.length > 0 ? (
              <Box mt='2px' fontSize='sm' color='text.muted' lineHeight='ui'>
                {NOTE.excluded(model.pending.length)}
              </Box>
            ) : null}
            <CalcSection
              data={data}
              model={model}
              viewer={viewer}
              open={calcOpen}
              onToggle={() => setCalcOpen((v) => !v)}
              onOpenContribution={openContribution}
            />
          </>
        ) : null}

        {state === 'transfer' || state === 'settled' ? (
          <Box my={2}>
            <TextButton tone='sub' onClick={() => run('redo', onReopen)}>
              {BUTTON.reopen}
            </TextButton>
            {line('redo')}
          </Box>
        ) : null}
      </Box>

      {/* 下端に固定した部分とシートは、画面の目印の箱の外に置く（§4 S-20 の9番目の要素・§4.0.3） */}
      {foot ? (
        <SettleFoot textOnly={state === 'estimate'} withMessage={message?.at === 'main'}>
          {foot}
          {line('main')}
        </SettleFoot>
      ) : null}

      <MonthPickerSheet
        open={sheet?.id === 'month'}
        viewMonth={month}
        createdMonth={data.household.createdMonth}
        currentMonth={thisMonth}
        onPick={(m) => changeMonth(m)}
        onClose={() => setSheet(null)}
      />
      {sheet?.id === 'contribution' ? (
        <ContributionSheet
          open
          data={data}
          month={month}
          viewer={viewer}
          now={now}
          message={sheetMessage}
          onDecide={(nets) => {
            void onDecideNets(nets).catch((error: unknown) => {
              if (error instanceof RepositoryError && error.code === 'month_locked') {
                setSheetMessage({ text: LINE.locked(month, model.status), tone: 'info' })
              }
            })
          }}
          onEmpty={() => setSheetMessage({ text: LINE.netRequired, tone: 'error' })}
          onClose={() => {
            setSheet(null)
            setSheetMessage(null)
          }}
        />
      ) : null}
      {sheet?.id === 'breakdown' && S22_STATES.includes(state) && model.decided ? (
        <BreakdownSheet
          open
          data={data}
          model={model}
          state={state}
          person={sheet.person}
          viewer={viewer}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  )
}
