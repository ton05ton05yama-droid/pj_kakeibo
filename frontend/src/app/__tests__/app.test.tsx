/**
 * ルーティング（§2.1）のテスト。
 *
 * 4つのタブそれぞれに**本物の画面**が割り当たっていること（仮の中身が残っていないこと）を、
 * 各画面の §1.3・§1.4 の文言で確かめる。データは見本データ（§9）のローカル実装。
 */
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnnounceProvider } from '@/app/providers/announce-provider'
import { AuthProvider } from '@/app/providers/auth-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, setRepository } from '@/data'
import type { ScenarioId } from '@/domain'
import { forgetExpenseMonth } from '@/features/expense'
import { resetSettleMonth } from '@/features/settle/use-settle-month'
import { system } from '@/theme'
import { App } from '../app'

/** 仮の中身（PlaceholderScreen）が残っていたら出る文字 */
const PLACEHOLDER = /はこれから作ります/

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

let originalUserAgent: string

function Wrapper({ path, children }: { path: string; children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return (
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AnnounceProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
            </ToastProvider>
          </AnnounceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}

/** 見本データを積んだローカル実装でログインしてから、そのパスで開く */
async function open(path: string, scenario: ScenarioId = 'sep-open'): Promise<void> {
  const repository = createLocalRepository(scenario)
  await repository.auth.signIn('masato', 'pw')
  setRepository(repository)
  render(
    <Wrapper path={path}>
      <App />
    </Wrapper>
  )
}

function setUserAgent(value: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true })
}

beforeEach(() => {
  originalUserAgent = window.navigator.userAgent
  setRepository(null)
  forgetExpenseMonth()
  resetSettleMonth()
})

afterEach(() => {
  setUserAgent(originalUserAgent)
  setRepository(null)
})

describe('タブのルート（§2.1）', () => {
  it('/record は S-11 記録（何に払った？）', async () => {
    await open('/record')
    expect(await screen.findByRole('heading', { name: '何に払った？' })).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('/expenses は S-10 支出（月の合計と内訳リンク）', async () => {
    await open('/expenses')
    expect(await screen.findByText('9月のふたりの支出')).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('/settle は S-20 精算（［この金額で精算］か［出す額を決める］が出る）', async () => {
    await open('/settle', 'sep-ready')
    expect(await screen.findByText('精算できます')).toBeInTheDocument()
    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '')
    expect(labels.some((text) => text.includes('この金額で精算') || text.includes('出す額を決める'))).toBe(true)
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('/settings は S-30 設定（ホーム画面に追加・ログアウト）', async () => {
    // 「ホーム画面に追加」は Safari で開いたときだけ出る（§4 S-03）
    setUserAgent(IOS_SAFARI)
    await open('/settings')
    expect(await screen.findByText('ふたりの設定')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ホーム画面に追加' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('知らないパスは記録タブ（§2.1）', async () => {
    await open('/')
    expect(await screen.findByRole('heading', { name: '何に払った？' })).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })
})

describe('精算の［金額を入れる］→ S-15 を順に（§2.3 E1・§3.7）', () => {
  it('進み具合つきで順に開き、途中はトーストを出さず、閉じたときに1つだけ出す', async () => {
    await open('/settle')
    expect(await screen.findByText('見込み・9/22時点')).toBeInTheDocument()

    // 月の途中でも［この月を精算する］で `prep` にできる（§6.3 ケースM）
    await userEvent.click(screen.getByRole('button', { name: 'この月を精算する' }))
    await userEvent.click(screen.getByRole('button', { name: '金額を入れる' }))

    // 1件目（ガス代）。精算から開いたので「1 / 2」と［次へ］
    const first = await screen.findByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })
    expect(within(first).getByText('1 / 2')).toBeInTheDocument()
    await userEvent.click(within(first).getByRole('button', { name: '6' }))
    await userEvent.click(within(first).getByRole('button', { name: '2' }))
    await userEvent.click(within(first).getByRole('button', { name: 'ゼロゼロ' }))
    await userEvent.click(within(first).getByRole('button', { name: '次へ' }))

    // 2件目（電気代）。途中なのでトーストは出さない（§3.7）
    const second = await screen.findByRole('dialog', { name: '金額を入れる（電気代（9月分））' })
    expect(within(second).getByText('2 / 2')).toBeInTheDocument()
    expect(screen.queryByText(/を入れました/)).not.toBeInTheDocument()

    await userEvent.click(within(second).getByRole('button', { name: '9' }))
    await userEvent.click(within(second).getByRole('button', { name: 'ゼロゼロ' }))
    await userEvent.click(within(second).getByRole('button', { name: '0' }))
    await userEvent.click(within(second).getByRole('button', { name: '入れる' }))

    // 閉じたときに、最後の操作のトーストを1つだけ出す
    expect(await screen.findByText('電気代 9,000円を入れました')).toBeInTheDocument()
    expect(screen.queryByText('ガス代 6,200円を入れました')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
