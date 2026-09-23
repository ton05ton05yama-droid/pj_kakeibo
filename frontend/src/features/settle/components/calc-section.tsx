import { Box } from '@chakra-ui/react'
import { useEffect, useRef } from 'react'
import { TextButton } from '@/components'
import type { HouseholdData, PersonKey, SettleModel } from '@/domain'
import { isLockedStatus, PERSON_KEYS } from '@/domain'
import { num } from '../format'
import { BUTTON, JOINT_SALARY_LABEL } from '../labels'
import { displayName } from '../people'

export type CalcSectionProps = {
  data: HouseholdData
  model: SettleModel
  viewer: PersonKey
  open: boolean
  onToggle: () => void
  /** 「手取りを変える」→ S-21（精算中・精算済みの月では出さない。E5） */
  onOpenContribution: () => void
}

/** 開いたとき、式の最後の行が固定部分とタブバーの上に見えるところまでページを送る（§7.5） */
function scrollIntoView(node: HTMLElement): void {
  let parent: HTMLElement | null = node.parentElement
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow === 'auto' || overflow === 'scroll') break
    parent = parent.parentElement
  }
  if (!parent) return
  const foot = parent.querySelector<HTMLElement>('[data-settle-foot]')
  const limit = foot ? foot.getBoundingClientRect().top : parent.getBoundingClientRect().bottom
  const dy = Math.ceil(node.getBoundingClientRect().bottom - limit + 8)
  if (dy <= 0) return
  let reduce = false
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // 無くてもよい
  }
  parent.scrollBy({ top: dy, behavior: reduce ? 'auto' : 'smooth' })
}

/**
 * 「計算を見る ▾」（§4 S-20 の8番目の要素・§6.1-5）。
 * 数字の入った式は**開いた先だけ**に置く。開いた状態は覚えない（毎回閉じて始まる。§7.5）。
 */
export function CalcSection({ data, model, viewer, open, onToggle, onOpenContribution }: CalcSectionProps) {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const node = bodyRef.current
    if (!node) return
    const id = requestAnimationFrame(() => scrollIntoView(node))
    return () => cancelAnimationFrame(id)
  }, [open])

  return (
    <Box mt={1}>
      <TextButton iconEnd={open ? 'collapse' : 'expand'} aria-expanded={open} onClick={onToggle}>
        {BUTTON.showCalc}
      </TextButton>
      {open ? (
        <Box ref={bodyRef} mt={1} pt={1} pb={2} fontSize='bodySm' color='text.sub' lineHeight='ui'>
          {PERSON_KEYS.map((p) => {
            const transferred = model.transferred[p]
            return (
              <Box key={p}>
                <Box fontWeight='semibold' mt={2}>
                  {displayName(data, p, viewer)}
                </Box>
                <Box fontVariantNumeric='tabular-nums'>
                  {`出す額 ${num(model.contrib[p] ?? 0)} − もう払った分 ${num(model.adv[p])}`}
                  {/* 給料の入り先が共用の月だけ（S-22 の行と同じ出し方。§6.2） */}
                  {model.jointSalary[p] > 0 ? ` − ${JOINT_SALARY_LABEL} ${num(model.jointSalary[p])}` : ''}
                  {transferred !== 0 ? ` ${transferred > 0 ? '−' : '＋'} 済んだ分 ${num(transferred)}` : ''}
                </Box>
              </Box>
            )
          })}
          <Box fontWeight='semibold' mt={2}>
            共用
          </Box>
          <Box fontVariantNumeric='tabular-nums'>
            {`出す額の合計 ${num((model.contrib.a ?? 0) + (model.contrib.b ?? 0))} − 支出の合計 ${num(model.total)}`}
            {/* 共用の行は通帳の動きなので、給料の残りも式に出す（§6.2・§6.3 ケースN。0 の月は出さない） */}
            {model.jointLedger && model.jointLedger.salaryRemainder > 0
              ? ` ＋ 給料の残り ${num(model.jointLedger.salaryRemainder)}`
              : ''}
          </Box>
          {isLockedStatus(model.status) ? null : (
            <TextButton onClick={onOpenContribution}>{BUTTON.changeNet}</TextButton>
          )}
        </Box>
      ) : null}
    </Box>
  )
}
