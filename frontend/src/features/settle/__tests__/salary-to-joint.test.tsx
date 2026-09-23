/**
 * 給料の入り先が「共用口座」の月の画面（S-20・S-21・S-22）。
 * 正本: docs/03_ui_spec.md §6.2・§6.3 ケースN。
 *
 * 数字は §6.3 ケースN（§9 の9月の確定値に「りさこの給料は共用に入る」を重ねたもの）:
 * - まさと 120,000 − 37,510 − 0 ＝ 82,490（共用へ入れる）
 * - りさこ 88,000 − 22,070 − 88,000 ＝ −22,070（共用から受け取る）
 * - 共用 220,000 ＋ 82,490 − 146,550 − 22,070 ＝ 133,870（うち 給料の残り 132,000）
 *
 * 見本データ（§9）の既定は2人とも「自分の口座」なので、既定のままの月も併せて見る
 * （注記を出さない・今までどおり1行）。
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Repository } from '@/data'
import { setRepository } from '@/data'
import type { PersonFlags, ScenarioId } from '@/domain'
import { PERSON_KEYS } from '@/domain'
import { SettleScreen } from '../settle-screen'
import { renderWithProviders, signIn } from './helpers'

afterEach(() => setRepository(null))

const waitForStatus = (text: string | RegExp) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument())

/**
 * 見本データに「給料の入り先」を重ねる（domain の `withSalaryToJoint` と同じ形）。
 * 人の設定と、9月の出す額に保存してある値（決めた月のスナップショット）の両方を合わせる。
 */
async function signInWithSalaryToJoint(flags: PersonFlags, scenario: ScenarioId = 'sep-ready'): Promise<Repository> {
  const repository = await signIn(scenario)
  const snapshot = await repository.loadSnapshot()
  for (const p of PERSON_KEYS) {
    snapshot.data.people[p].salaryToJoint = flags[p]
    const c = snapshot.data.contributions['2026-09']?.[p]
    if (c) c.salaryToJoint = flags[p]
  }
  return repository
}

describe('S-20 共用の行（§6.3 ケースN）', () => {
  it('給料が共用に入る人がいる月は、共用の行が通帳の動きになり、下に「うち 給料の残り」を足す', async () => {
    await signInWithSalaryToJoint({ a: false, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.getByText(/共用に/)).toHaveTextContent('共用に 133,870円 残ります')
    expect(screen.getByText('うち 給料の残り 132,000円')).toBeInTheDocument()

    // カードの見た目・矢印・動詞は変えない（りさこは「共用から受け取る」）
    expect(screen.getByText('¥82,490')).toBeInTheDocument()
    expect(screen.getByText('¥22,070')).toBeInTheDocument()
    expect(screen.getByText('共用へ入れる')).toBeInTheDocument()
    expect(screen.getByText('共用から受け取る')).toBeInTheDocument()
  })

  it('給料が共用に入る人がいない月は、今までどおり1行のまま（§9 の見本データの既定）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.getByText(/共用に/)).toHaveTextContent('共用に 1,870円 残ります')
    expect(screen.queryByText(/うち 給料の残り/)).not.toBeInTheDocument()
  })

  it('2人とも共用に入る月は、どちらも立替の実費だけ受け取る', async () => {
    await signInWithSalaryToJoint({ a: true, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.getByText('¥37,510')).toBeInTheDocument()
    expect(screen.getByText('¥22,070')).toBeInTheDocument()
    expect(screen.getAllByText('共用から受け取る')).toHaveLength(2)
    // 520,000 − 37,510 − 22,070 − 146,550 ＝ 313,870
    expect(screen.getByText(/共用に/)).toHaveTextContent('共用に 313,870円 残ります')
    expect(screen.getByText('うち 給料の残り 312,000円')).toBeInTheDocument()
  })

  it('給料の残りが 0 の月は「0円」の注記を出さない（手取り < 出す額。§6.3 ケースN のエッジ）', async () => {
    const repository = await signInWithSalaryToJoint({ a: false, b: true })
    const snapshot = await repository.loadSnapshot()
    const c = snapshot.data.contributions['2026-09']?.b
    expect(c).toBeDefined()
    if (c) {
      c.net = 50000
      c.amount = 60000
    }
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.queryByText(/うち 給料の残り/)).not.toBeInTheDocument()
    // 60,000 − 22,070 − 50,000 ＝ −12,070（足りない分は精算額に残る）
    expect(screen.getByText('¥12,070')).toBeInTheDocument()
  })

  it('給料が共用に入る月は数字の無い式を出さない（§6.1-5）', async () => {
    await signInWithSalaryToJoint({ a: false, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    // 式に「− 共用に入った給料」が無く、りさこの 88,000 − 22,070 とカードの 22,070 が合わなく見えるため
    expect(screen.queryByText('動かす額 ＝ 出す額 − もう払った分')).not.toBeInTheDocument()
  })

  it('給料が共用に入る人がいない月は、今までどおり数字の無い式を出す（§9 の見本データの既定）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.getByText('動かす額 ＝ 出す額 − もう払った分')).toBeInTheDocument()
  })

  it('「計算を見る」の式にも、共用に入った給料と給料の残りを出す', async () => {
    await signInWithSalaryToJoint({ a: false, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: '計算を見る' }))

    expect(screen.getByText('出す額 120,000 − もう払った分 37,510')).toBeInTheDocument()
    expect(screen.getByText('出す額 88,000 − もう払った分 22,070 − 共用に入った給料 88,000')).toBeInTheDocument()
    expect(screen.getByText('出す額の合計 208,000 − 支出の合計 206,130 ＋ 給料の残り 132,000')).toBeInTheDocument()
  })
})

describe('S-22 1人ぶんの内訳（§6.3 ケースN）', () => {
  it('給料が共用に入る人は「共用に入った給料 − 88,000」と注記を出す', async () => {
    await signInWithSalaryToJoint({ a: false, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: 'りさこの内訳' }))

    const sheet = await screen.findByRole('dialog', { name: 'りさこの内訳' })
    expect(within(sheet).getByText('出す額')).toBeInTheDocument()
    expect(within(sheet).getByText('88,000')).toBeInTheDocument()
    expect(within(sheet).getByText('手取り 220,000 × 40%')).toBeInTheDocument()
    expect(within(sheet).getByText('− 22,070')).toBeInTheDocument()
    expect(within(sheet).getByText('共用に入った給料')).toBeInTheDocument()
    expect(within(sheet).getByText('− 88,000')).toBeInTheDocument()
    expect(within(sheet).getByText('手取り 220,000 のうち 出す額まで')).toBeInTheDocument()
    // 結果の行は今までどおり（向きは動詞で示し、符号は出さない）
    expect(within(sheet).getByText('共用から受け取る')).toBeInTheDocument()
    expect(within(sheet).getByText('¥22,070')).toBeInTheDocument()
  })

  it('給料が自分の口座に入る人の内訳には、その行を出さない', async () => {
    await signInWithSalaryToJoint({ a: false, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: 'まさとの内訳' }))

    const sheet = await screen.findByRole('dialog', { name: 'まさとの内訳' })
    expect(within(sheet).queryByText('共用に入った給料')).not.toBeInTheDocument()
    expect(within(sheet).queryByText(/のうち 出す額まで/)).not.toBeInTheDocument()
    expect(within(sheet).getByText('¥82,490')).toBeInTheDocument()
  })
})

describe('S-21 出す額（§6.3 ケースN）', () => {
  it('給料が共用に入る人の行にだけ「給料は共用に入る」を添える（設定への導線は置かない）', async () => {
    await signInWithSalaryToJoint({ a: false, b: true })
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    await userEvent.click(screen.getByRole('button', { name: '手取りを変える' }))

    const sheet = await screen.findByRole('dialog', { name: '10月の出す額' })
    expect(within(sheet).getAllByText('給料は共用に入る')).toHaveLength(1)
    expect(within(sheet).queryByRole('button', { name: /設定/ })).not.toBeInTheDocument()
  })

  it('2人とも自分の口座なら添え字を出さない（§9 の見本データの既定）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    await userEvent.click(screen.getByRole('button', { name: '手取りを変える' }))

    const sheet = await screen.findByRole('dialog', { name: '10月の出す額' })
    expect(within(sheet).queryByText('給料は共用に入る')).not.toBeInTheDocument()
  })
})
