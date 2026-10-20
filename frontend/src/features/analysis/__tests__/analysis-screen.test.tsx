/**
 * 分析タブ（S-40・S-41 と、期間を選ぶ S-04）を、仕様書 §9 の見本データで確かめる。
 * 数字は支出タブ（S-10・S-13）と同じ数え方（§9.6）。言葉は仕様書 §1・S-40・S-41 のとおり。
 */
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnnounceProvider } from '@/app/providers/announce-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, setRepository } from '@/data'
import type { HouseholdData, ScenarioId } from '@/domain'
import { system } from '@/theme'
import { AnalysisScreen } from '../analysis-screen'
import { forgetAnalysisPeriod } from '../use-analysis-period'

async function openAnalysisTab(
  scenario: ScenarioId = 'sep-open',
  /** 読み込んだ家計のデータを差し替える（見本データに無い形を作るとき） */
  change?: (d: HouseholdData) => HouseholdData
): Promise<{ unmount: () => void }> {
  const repository = createLocalRepository(scenario)
  await repository.auth.signIn('masato', 'pw')
  if (change) {
    const snapshot = await repository.loadSnapshot()
    setRepository({ ...repository, loadSnapshot: async () => ({ ...snapshot, data: change(snapshot.data) }) })
  } else {
    setRepository(repository)
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AnnounceProvider>
          <ToastProvider>
            <MemoryRouter>
              <AnalysisScreen />
            </MemoryRouter>
          </ToastProvider>
        </AnnounceProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
  await screen.findByRole('heading', { name: '分析' })
  return { unmount: view.unmount }
}

const s40 = (): Element | null => document.querySelector('[data-screen="S-40"]')

/** カテゴリの行（押せる行）の文字を上から */
function categoryRows(): string[] {
  const root = s40()
  if (!(root instanceof HTMLElement)) return []
  return within(root)
    .getAllByRole('button')
    .filter((button) => !button.hasAttribute('aria-label'))
    .map((button) => button.textContent ?? '')
}

beforeEach(() => {
  forgetAnalysisPeriod()
})
afterEach(() => {
  setRepository(null)
})

describe('S-40 分析（sep-open・9/22）', () => {
  it('既定は過去3か月（今月を含む）。家計を作った8月より前は含めないので 8月〜9月', async () => {
    await openAnalysisTab()
    expect(screen.getByRole('button', { name: '始めの月 2026年8月（押すと選び直す）' })).toHaveTextContent('2026年8月')
    expect(screen.getByRole('button', { name: '終わりの月 2026年9月（押すと選び直す）' })).toHaveTextContent(
      '2026年9月'
    )
    expect(screen.getByText('8月〜9月のふたりの支出')).toBeInTheDocument()
    // 8月 255,890 ＋ 9月 180,670
    expect(screen.getByText('¥436,560')).toBeInTheDocument()
  })

  it('金額待ちがあると注記が出て `action` になる', async () => {
    await openAnalysisTab()
    expect(screen.getByText('金額待ち 2件は入っていません')).toBeInTheDocument()
    expect(s40()).toHaveAttribute('data-state', 'action')
  })

  it('月ごとの推移に、各月の合計と月の名前が古い順に出る', async () => {
    await openAnalysisTab()
    const chart = screen.getByRole('img', { name: '8月 255,890、9月 180,670' })
    expect(within(chart).getByText('255,890')).toBeInTheDocument()
    expect(within(chart).getByText('180,670')).toBeInTheDocument()
    expect(within(chart).getByText('8月')).toBeInTheDocument()
    expect(within(chart).getByText('9月')).toBeInTheDocument()
    // 棒は押せない
    expect(within(chart).queryByRole('button')).not.toBeInTheDocument()
  })

  it('カテゴリは多い順で、0円のカテゴリは出さない', async () => {
    await openAnalysisTab()
    expect(screen.getByRole('heading', { name: 'カテゴリ' })).toBeInTheDocument()
    expect(categoryRows()).toEqual([
      '住まい181,960',
      'レジャー86,800',
      '食料品66,160',
      '外食42,850',
      '光熱費14,220',
      '日用品11,770',
      '通信11,000',
      '交際9,820',
      '交通6,600',
      'エンタメ3,180',
      '医療2,200',
    ])
  })

  it('人ごとの合計・人の名前は出さない（P10）', async () => {
    await openAnalysisTab()
    const root = s40()
    expect(root?.textContent).not.toMatch(/まさと|りさこ|共用/)
  })

  it('金額待ちが無い期間は `normal`（精算済みの8月だけ）', async () => {
    await openAnalysisTab()
    await userEvent.click(screen.getByRole('button', { name: /^終わりの月/ }))
    const sheet = await screen.findByRole('dialog', { name: '月を選ぶ' })
    await userEvent.click(within(sheet).getByRole('button', { name: '2026年8月' }))
    expect(screen.getByText('8月のふたりの支出')).toBeInTheDocument()
    expect(screen.getByText('¥255,890')).toBeInTheDocument()
    expect(screen.queryByText(/金額待ち/)).not.toBeInTheDocument()
    expect(s40()).toHaveAttribute('data-state', 'normal')
  })
})

describe('期間を選ぶ（S-04 に見出しを出す）', () => {
  it('始めの月のチップで「始めの月」の S-04 が開き、選ぶと合計が変わる', async () => {
    await openAnalysisTab()
    await userEvent.click(screen.getByRole('button', { name: /^始めの月/ }))
    const sheet = await screen.findByRole('dialog', { name: '月を選ぶ' })
    expect(within(sheet).getByRole('heading', { name: '始めの月' })).toBeInTheDocument()
    expect(sheet.querySelector('[data-screen="S-04"]')).not.toBeNull()
    // いまの始めの月が選択中。家計を作る前の月はボタンにしない
    expect(within(sheet).getByRole('button', { name: '2026年8月' })).toHaveAttribute('aria-current', 'true')
    expect(within(sheet).queryByRole('button', { name: '2026年7月' })).not.toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: '2026年9月 今月' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 1か月だけなら S-10 と同じ言い方・同じ合計、カテゴリは S-13 と同じ（§9.6）
    expect(screen.getByText('9月のふたりの支出')).toBeInTheDocument()
    expect(screen.getByText('¥180,670')).toBeInTheDocument()
    expect(categoryRows().slice(0, 3)).toEqual(['住まい92,980', '食料品31,210', '外食20,850'])
    expect(categoryRows()).toHaveLength(10)
  })

  it('終わりの月のチップでは見出しが「終わりの月」になる', async () => {
    await openAnalysisTab()
    await userEvent.click(screen.getByRole('button', { name: /^終わりの月/ }))
    const sheet = await screen.findByRole('dialog', { name: '月を選ぶ' })
    expect(within(sheet).getByRole('heading', { name: '終わりの月' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '2026年9月 今月' })).toHaveAttribute('aria-current', 'true')
  })

  it('終わりの月を始めの月より前にすると、始めの月も同じ月になる', async () => {
    await openAnalysisTab('sep-prep')
    expect(screen.getByText('8月〜10月のふたりの支出')).toBeInTheDocument()
    expect(screen.getByText('¥547,910')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^始めの月/ }))
    await userEvent.click(await screen.findByRole('button', { name: '2026年10月 今月' }))
    expect(screen.getByText('10月のふたりの支出')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^終わりの月/ }))
    await userEvent.click(await screen.findByRole('button', { name: '2026年9月' }))
    expect(screen.getByRole('button', { name: '始めの月 2026年9月（押すと選び直す）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '終わりの月 2026年9月（押すと選び直す）' })).toBeInTheDocument()
  })

  it('12か月を超えたら、終わりの月を始めの月の11か月後にする（年をまたぐ言い方）', async () => {
    await openAnalysisTab('sep-open', (d) => ({ ...d, household: { ...d.household, createdMonth: '2024-01' } }))
    // 家計が古ければちょうど3か月
    expect(screen.getByText('7月〜9月のふたりの支出')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^始めの月/ }))
    const sheet = await screen.findByRole('dialog', { name: '月を選ぶ' })
    await userEvent.click(within(sheet).getByRole('button', { name: '前の年' }))
    await userEvent.click(within(sheet).getByRole('button', { name: '2025年3月' }))
    expect(screen.getByRole('button', { name: '始めの月 2025年3月（押すと選び直す）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '終わりの月 2026年2月（押すと選び直す）' })).toBeInTheDocument()
    expect(screen.getByText('2025年3月〜2026年2月のふたりの支出')).toBeInTheDocument()
    // この期間には記録が無い
    expect(screen.getByText('この期間の記録はありません')).toBeInTheDocument()
  })

  it('選んだ期間は、タブを移って戻っても覚えている', async () => {
    const first = await openAnalysisTab()
    await userEvent.click(screen.getByRole('button', { name: /^始めの月/ }))
    await userEvent.click(await screen.findByRole('button', { name: '2026年9月 今月' }))
    expect(screen.getByText('9月のふたりの支出')).toBeInTheDocument()
    first.unmount()

    await openAnalysisTab()
    expect(screen.getByText('9月のふたりの支出')).toBeInTheDocument()
    expect(screen.getByText('¥180,670')).toBeInTheDocument()
  })
})

describe('S-40 `empty`', () => {
  it('期間に記録が無いと、合計 ¥0 と1文だけ（推移とカテゴリは出さない）', async () => {
    await openAnalysisTab('sep-open', (d) => ({ ...d, expenses: [] }))
    expect(s40()).toHaveAttribute('data-state', 'empty')
    expect(screen.getByText('¥0')).toBeInTheDocument()
    expect(screen.getByText('この期間の記録はありません')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'カテゴリ' })).not.toBeInTheDocument()
    expect(screen.queryByText(/金額待ち/)).not.toBeInTheDocument()
    // 期間は選び直せる
    expect(screen.getByRole('button', { name: /^始めの月/ })).toBeInTheDocument()
  })
})

describe('S-41 カテゴリの月ごと', () => {
  it('カテゴリの行を押すと、期間の各月が古い順に出る（0円の月も）', async () => {
    await openAnalysisTab('sep-prep')
    await userEvent.click(screen.getByRole('button', { name: /外食.*46,450/ }))
    const sheet = await screen.findByRole('dialog', { name: '外食（8月〜10月）' })
    expect(sheet.querySelector('[data-screen="S-41"]')).toHaveAttribute('data-state', 'normal')
    expect(within(sheet).getByRole('heading', { name: '外食' })).toBeInTheDocument()
    expect(within(sheet).getByText('8月〜10月')).toBeInTheDocument()
    expect(within(sheet).getByText('¥46,450')).toBeInTheDocument()
    const rows = [...sheet.querySelectorAll('[data-month]')].map((row) => row.textContent)
    expect(rows).toEqual(['8月22,000', '9月24,450', '10月0'])
    // 行は押せない（シートの中のボタンは、つまみ＝閉じる だけ）
    expect(within(sheet).getAllByRole('button')).toHaveLength(1)
    expect(sheet.textContent).not.toMatch(/まさと|りさこ|共用/)
  })

  it('1か月の期間では S-13 と同じ額（外食 20,850）', async () => {
    await openAnalysisTab()
    await userEvent.click(screen.getByRole('button', { name: /^始めの月/ }))
    await userEvent.click(await screen.findByRole('button', { name: '2026年9月 今月' }))
    await userEvent.click(screen.getByRole('button', { name: /外食.*20,850/ }))
    const sheet = await screen.findByRole('dialog', { name: '外食（9月）' })
    expect(within(sheet).getByText('¥20,850')).toBeInTheDocument()
    expect([...sheet.querySelectorAll('[data-month]')].map((row) => row.textContent)).toEqual(['9月20,850'])
  })
})
