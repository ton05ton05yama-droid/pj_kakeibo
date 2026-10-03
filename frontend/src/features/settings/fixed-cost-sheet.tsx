import { Box, Flex } from '@chakra-ui/react'
import { useEffect, useId, useRef } from 'react'
import {
  Avatar,
  BottomSheet,
  CategoryGrid,
  type CategoryGridItem,
  Chip,
  InlineMessage,
  PrimaryButton,
  Segmented,
  type SegmentedItem,
  SheetHeader,
  TextButton,
} from '@/components'
import { LabelBox } from '@/components/primitives'
import { RepositoryError, type TemplateInput } from '@/data'
import type { AmountKind, CategoryKey, DateTimeKey, HouseholdData, MonthKey, Payer } from '@/domain'
import { addMonth, CATEGORIES, categoryName, guessCategory, isLockedStatus, monthStatus, monthsBetween } from '@/domain'
import { MonthGrid } from '@/features/monthPicker'
import { lockedMessage } from '@/features/record/messages'
import { parsePastedAmount } from '@/lib/amount'
import { BareInput, Field, FieldLabel } from './settings-ui'
import { monthLabel, type TemplateDraft } from './sheets'
import type { SettingsActions } from './use-settings-actions'

/** カテゴリのグリッド（15個・§8 の並び）。アイコンの名前はカテゴリのキーと同じ（§7.6） */
const GRID_ITEMS: readonly CategoryGridItem[] = CATEGORIES.map((c) => ({ key: c.key, label: c.name, icon: c.key }))

const KIND_ITEMS: readonly SegmentedItem<AmountKind>[] = [
  { value: 'fixed', label: '毎月同じ' },
  { value: 'variable', label: '金額待ち' },
]

export type FixedCostSheetProps = {
  draft: TemplateDraft
  onDraft: (next: TemplateDraft) => void
  data: HouseholdData
  /** 今月（追加のときの「9月分から記録します」） */
  month: MonthKey
  /** 今月がもう精算中・精算済み（そのときは来月分から作る） */
  monthLocked: boolean
  /** 「今日」（月の状態を決める。§4.0.2） */
  now: DateTimeKey
  onClose: () => void
  onDone: () => void
  online: boolean
  actions: SettingsActions
}

/**
 * S-32 毎月の支払いを追加・直す（高いシート）。
 *
 * 見出しは置かない（一番大きく見せるものは名前の欄。読み上げ名はシートの名前。§4.0.3）。
 * 名前を入れるとカテゴリを推測して入れる（§8）。払う人の既定は共用、金額の既定は「毎月同じ」。
 * 直したときの変更は**まだ作っていない月から**効く（§6.5。今月分は S-14 `fixed` で直す）。
 */
export function FixedCostSheet({
  draft,
  onDraft,
  data,
  month,
  monthLocked,
  now,
  onClose,
  onDone,
  online,
  actions,
}: FixedCostSheetProps) {
  const nameId = useId()
  const amountId = useId()
  const payerLabelId = useId()
  const kindLabelId = useId()
  const catLabelId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const catChipRef = useRef<HTMLDivElement>(null)
  const monthCellRef = useRef<HTMLElement | null>(null)
  const catButtonRef = useRef<HTMLButtonElement>(null)
  const fromButtonRef = useRef<HTMLButtonElement>(null)
  /** グリッドから戻ったときは、押したチップにフォーカスを戻す（名前の欄に戻してキーボードを開かない。§4.0.3） */
  const returnTo = useRef<'cat' | 'from' | null>(null)
  const saving = useRef(false)

  const editing = draft.tplId !== null
  const state = draft.err ? 'action' : editing ? 'normal' : 'empty'
  const label = editing ? `毎月の支払いを直す（${draft.origName}）` : '毎月の支払いを追加'

  const errorFor = (field: string): string | undefined =>
    draft.err && draft.err.field === field ? draft.err.text : undefined
  const footError = draft.err && draft.err.field === null ? draft.err : null

  // 記録を始める月（追加のときだけ）。既定は今月、今月がロック中なら来月（S-32）
  const defaultFrom = monthLocked ? addMonth(month, 1) : month
  const startMonth = draft.from ?? defaultFrom

  // カテゴリが空のまま保存したら、カテゴリのチップにフォーカスを移す（気づけるように）
  useEffect(() => {
    if (draft.err?.field !== 'cat') return
    catChipRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [draft.err])

  /**
   * その月から今月までにある、精算中・精算済みの月のうち一番新しい月の1行
   * 「9月は精算中です（先に精算をやり直します）」（§1.4）。無ければ null
   */
  const lockedLineFrom = (from: MonthKey): string | null => {
    if (from >= month) return null
    const locked = monthsBetween(from, month).filter((m) => isLockedStatus(monthStatus(data, m, now)))
    const newest = locked.at(-1)
    return newest === undefined ? null : lockedMessage(newest, monthStatus(data, newest, now))
  }

  /** 「何月分から」の月のマスを押した。ロック中の月が入るなら選ばずに1行を出し、マスのままにする */
  const pickMonth = (m: MonthKey): void => {
    const line = lockedLineFrom(m)
    if (line !== null) {
      onDraft({ ...draft, fromMsg: line })
      return
    }
    returnTo.current = 'from'
    onDraft({ ...draft, from: m, monthGrid: false, fromMsg: null, dirty: true, err: null })
  }

  const payerItems: readonly SegmentedItem<Payer>[] = [
    { value: 'a', label: data.people.a.name, leading: <Avatar who='a' name={data.people.a.name} size='sm' /> },
    { value: 'b', label: data.people.b.name, leading: <Avatar who='b' name={data.people.b.name} size='sm' /> },
    { value: 'joint', label: '共用', leading: <Avatar who='joint' size='sm' /> },
  ]

  /** 名前を入れる。自分でカテゴリを選んでいなければ、名前からカテゴリを推測して入れる（§8） */
  const onName = (value: string): void => {
    const next: TemplateDraft = { ...draft, name: value, dirty: true, err: null }
    if (!draft.catManual) next.cat = guessCategory(value)
    onDraft(next)
  }

  /**
   * 金額の欄（端末のキーボード）。貼り付けと同じ判定（§7.5 テンキー）。
   * 受け付けない値は**切り詰めずに入力のまま残し**、欄を赤い枠にする。
   */
  const onAmount = (value: string): void => {
    if (value.trim() === '') {
      onDraft({ ...draft, amount: '', amountBad: false, dirty: true, err: null })
      return
    }
    const parsed = parsePastedAmount(value)
    if (parsed === null) {
      onDraft({ ...draft, amount: value, amountBad: true, dirty: true, err: null })
      return
    }
    onDraft({ ...draft, amount: parsed, amountBad: false, dirty: true, err: null })
  }

  const fail = (text: string, field: string | null, tone: 'error' | 'info' = 'error'): void => {
    onDraft({ ...draft, err: { text, tone, field } })
  }

  const save = async (): Promise<void> => {
    if (!online) return fail('オンラインで直せます', null, 'info')
    const name = draft.name.trim()
    if (name === '') return fail('名前を入れてください', 'name')
    if (draft.cat === null) return fail('カテゴリを選んでください', 'cat')
    if (draft.kind === 'fixed' && draft.amountBad) return fail('金額を入れてください', 'amount')
    if (draft.kind === 'fixed' && Number(draft.amount) === 0) {
      return fail('金額を入れるか「金額待ち」を選んでください', 'amount')
    }
    const input: TemplateInput = {
      name,
      cat: draft.cat,
      payer: draft.payer,
      kind: draft.kind,
      amount: draft.kind === 'fixed' ? Number(draft.amount) : null,
    }
    const id = draft.tplId
    if (id !== null) {
      const before = data.templates.find((t) => t.id === id)
      if (!before) return
      const beforeInput: TemplateInput = {
        name: before.name,
        cat: before.cat,
        payer: before.payer,
        kind: before.kind,
        amount: before.amount,
      }
      // 何も変わっていなければ、何もせずに閉じる（トーストも出さない）
      if (
        beforeInput.name === input.name &&
        beforeInput.cat === input.cat &&
        beforeInput.payer === input.payer &&
        beforeInput.kind === input.kind &&
        beforeInput.amount === input.amount
      ) {
        onDone()
        return
      }
      onDone()
      await actions.updateTemplate(id, input, beforeInput)
      return
    }
    // 追加は、サーバーが断ったとき（相手が先に精算した、など）にシートに1行を出すので、書けてから閉じる
    if (saving.current) return
    saving.current = true
    try {
      await actions.addTemplate({ ...input, from: startMonth })
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'month_locked') {
        const m = (error.detail ?? startMonth).slice(0, 7)
        const status = monthStatus(data, m, now)
        return fail(lockedMessage(m, isLockedStatus(status) ? status : 'confirmed'), null, 'info')
      }
      onDone()
      throw error
    } finally {
      saving.current = false
    }
    onDone()
  }

  const stop = async (): Promise<void> => {
    if (!online) return fail('オンラインで直せます', null, 'info')
    const id = draft.tplId
    if (id === null) return
    const name = draft.name.trim() || draft.origName
    onDone()
    await actions.stopTemplate(id, name)
  }

  // 「何月分から」の月のマスを出しているあいだは、シートの中身をマスに差し替える（シートを重ねない。§4.0.3・B8）
  if (draft.monthGrid && !editing) {
    return (
      <BottomSheet open label={label} onClose={onClose} tall initialFocusRef={monthCellRef}>
        <Box data-screen='S-32' data-state={state}>
          <Box mt={1} mb={1}>
            <SheetHeader>何月分から</SheetHeader>
          </Box>
          {/* 選べる月は 家計を作った月 〜 既定の開始月（範囲の外はボタンにしない。P7） */}
          <MonthGrid
            viewMonth={startMonth}
            firstMonth={data.household.createdMonth}
            lastMonth={defaultFrom}
            currentMonth={month}
            onPick={pickMonth}
            selectedRef={monthCellRef}
          />
          {draft.fromMsg ? (
            <Box mt={2}>
              <InlineMessage tone='info'>{draft.fromMsg}</InlineMessage>
            </Box>
          ) : null}
        </Box>
      </BottomSheet>
    )
  }

  // カテゴリのグリッドを出しているあいだは、シートの中身をグリッドに差し替える（シートを重ねない。§4.0.3）
  if (draft.grid) {
    return (
      <BottomSheet open label={label} onClose={onClose} tall>
        <Box data-screen='S-32' data-state={state}>
          <Box mt={1} mb={3}>
            <SheetHeader>カテゴリ</SheetHeader>
          </Box>
          <CategoryGrid
            items={GRID_ITEMS}
            {...(draft.cat ? { selectedKey: draft.cat } : {})}
            onSelect={(key) => {
              returnTo.current = 'cat'
              onDraft({ ...draft, cat: key as CategoryKey, catManual: true, grid: false, dirty: true, err: null })
            }}
          />
        </Box>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet
      open
      label={label}
      onClose={onClose}
      tall
      adjustForKeyboard
      initialFocusRef={
        returnTo.current === 'from' ? fromButtonRef : returnTo.current === 'cat' ? catButtonRef : nameRef
      }
      footer={
        <Flex mt={editing ? 2 : 0} alignItems='center' justifyContent='space-between' gap={3}>
          {editing ? (
            <TextButton tone='danger' onClick={() => void stop()}>
              支払いをやめる
            </TextButton>
          ) : null}
          {/* 追加のときは横幅いっぱい */}
          <Box flex='1' {...(editing ? { maxW: '200px' } : {})}>
            <PrimaryButton onClick={() => void save()}>保存</PrimaryButton>
          </Box>
        </Flex>
      }
    >
      <Box data-screen='S-32' data-state={state}>
        <Field mt={1}>
          <LabelBox htmlFor={nameId} fontSize='bodySm' fontWeight='semibold' color='text.sub' lineHeight='ui'>
            名前
          </LabelBox>
          <BareInput
            id={nameId}
            inputRef={nameRef}
            value={draft.name}
            autoComplete='off'
            enterKeyHint='done'
            invalid={errorFor('name') !== undefined}
            onChange={(event) => onName(event.target.value)}
          />
          {errorFor('name') ? <InlineMessage tone='error'>{errorFor('name')}</InlineMessage> : null}
        </Field>

        {/* S-32 は欄と欄の間を 8px に詰める（開始月の行を足しても 375×548 の高いシートに入れるため。§4 S-32 の縦の寸法） */}
        <Field mt={2}>
          <FieldLabel id={catLabelId}>カテゴリ</FieldLabel>
          <Box ref={catChipRef}>
            <Chip
              ref={catButtonRef}
              label={`カテゴリ ${draft.cat === null ? '選ぶ' : categoryName(draft.cat)}`}
              {...(draft.cat ? { icon: draft.cat } : {})}
              iconEnd='expand'
              onClick={() => onDraft({ ...draft, grid: true })}
            >
              {draft.cat === null ? '選ぶ' : categoryName(draft.cat)}
            </Chip>
          </Box>
          {errorFor('cat') ? <InlineMessage tone='error'>{errorFor('cat')}</InlineMessage> : null}
        </Field>

        <Field mt={2}>
          <FieldLabel id={payerLabelId}>払う人</FieldLabel>
          <Segmented
            items={payerItems}
            value={draft.payer}
            onChange={(payer) => onDraft({ ...draft, payer, dirty: true })}
            label='払う人'
            dense
          />
        </Field>

        <Field mt={2}>
          <FieldLabel id={kindLabelId}>金額</FieldLabel>
          <Segmented
            items={KIND_ITEMS}
            value={draft.kind}
            onChange={(kind) => onDraft({ ...draft, kind, dirty: true, err: null })}
            label='金額'
          />
          {draft.kind === 'fixed' ? (
            <Box mt={2}>
              <BareInput
                id={amountId}
                aria-label='毎月の金額'
                inputMode='numeric'
                pattern='[0-9]*'
                autoComplete='off'
                prefix='¥'
                value={draft.amount}
                invalid={draft.amountBad || errorFor('amount') !== undefined}
                onChange={(event) => onAmount(event.target.value)}
              />
            </Box>
          ) : null}
          {errorFor('amount') ? <InlineMessage tone='error'>{errorFor('amount')}</InlineMessage> : null}
        </Field>

        {editing ? (
          <Box mt={2} fontSize='sm' fontWeight='medium' color='text.muted' lineHeight='ui'>
            {`変更は${monthLabel(addMonth(month, 1))}分から`}
          </Box>
        ) : (
          // 開始月の行「［9月分 ▾］から記録します」。チップのタップ領域 44px がそのまま行の高さ
          <Flex
            alignItems='center'
            minH='tapMin'
            mt='4px'
            fontSize='md'
            fontWeight='medium'
            color='text.sub'
            lineHeight='ui'
          >
            <Chip
              ref={fromButtonRef}
              label={`記録を始める月 ${monthLabel(startMonth)}分（押すと選び直す）`}
              iconEnd='expand'
              onClick={() => onDraft({ ...draft, monthGrid: true, fromMsg: null })}
            >
              {`${monthLabel(startMonth)}分`}
            </Chip>
            <span>から記録します</span>
          </Flex>
        )}
        {footError ? (
          <Box mt={1}>
            <InlineMessage tone='info'>{footError.text}</InlineMessage>
          </Box>
        ) : null}
      </Box>
    </BottomSheet>
  )
}
