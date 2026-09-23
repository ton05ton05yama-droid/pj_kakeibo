/**
 * S-01 ログイン・S-02 はじめに のテスト（§4 S-01・S-02）。
 *
 * 文言は §1.3（ボタン）・§1.4（その場の1行）の表にあるものだけを確かめる。
 * データは見本データ（§9）のローカル実装。
 */
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app/app'
import { AnnounceProvider } from '@/app/providers/announce-provider'
import { AuthProvider } from '@/app/providers/auth-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, type Repository, setRepository } from '@/data'
import { forgetExpenseMonth } from '@/features/expense'
import { system } from '@/theme'

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return (
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AnnounceProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/record']}>{children}</MemoryRouter>
            </ToastProvider>
          </AnnounceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}

function show(): void {
  render(
    <Wrapper>
      <App />
    </Wrapper>
  )
}

beforeEach(() => {
  setRepository(null)
  forgetExpenseMonth()
})

afterEach(() => {
  setRepository(null)
})

describe('S-01 ログイン（§4 S-01）', () => {
  beforeEach(() => {
    setRepository(createLocalRepository())
  })

  it('アプリ名・ID・パスワード・［ログイン］を出す', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'ふたりの家計簿' })).toBeInTheDocument()
    expect(screen.getByLabelText('ID')).toBeInTheDocument()
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    // 新規登録と「パスワードを忘れた」は置かない
    expect(screen.queryByText(/新規登録|パスワードを忘れ/)).not.toBeInTheDocument()
    // 注記は失敗したときだけ
    expect(screen.queryByText('忘れたときは まさとが再設定します')).not.toBeInTheDocument()
  })

  it('空のまま押すと、空の欄の下に1行を出す（§1.4）', async () => {
    show()
    await screen.findByRole('button', { name: 'ログイン' })
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(screen.getByText('IDを入れてください')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('ID'), 'masato')
    // 入力したら1行は消える（§4.0.3）
    expect(screen.queryByText('IDを入れてください')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(screen.getByText('パスワードを入れてください')).toBeInTheDocument()
  })

  it('失敗すると「IDかパスワードがちがいます」と注記を出し、入力は消さない', async () => {
    show()
    await screen.findByRole('button', { name: 'ログイン' })
    await userEvent.type(screen.getByLabelText('ID'), 'dareka')
    await userEvent.type(screen.getByLabelText('パスワード'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByText('IDかパスワードがちがいます')).toBeInTheDocument()
    expect(screen.getByText('忘れたときは まさとが再設定します')).toBeInTheDocument()
    expect(screen.getByLabelText('ID')).toHaveValue('dareka')
  })

  it('目のアイコンでパスワードの表示を切り替える（§4.0.3 の読み上げ名）', async () => {
    show()
    await screen.findByRole('button', { name: 'ログイン' })
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを表示' }))
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを隠す' }))
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('type', 'password')
  })

  it('入れると記録タブ（S-11）になる', async () => {
    show()
    await screen.findByRole('button', { name: 'ログイン' })
    await userEvent.type(screen.getByLabelText('ID'), 'masato')
    await userEvent.type(screen.getByLabelText('パスワード'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByRole('heading', { name: '何に払った？' })).toBeInTheDocument()
  })
})

/** S-02 を出すために「まだ済ませていない人」にしたリポジトリ */
async function signInAsFirstTime(): Promise<Repository> {
  const base = createLocalRepository()
  await base.auth.signIn('risako', 'pw')
  let onboarded = false
  const repository: Repository = {
    ...base,
    async loadSnapshot() {
      const snapshot = await base.loadSnapshot()
      return { ...snapshot, onboardedAt: onboarded ? snapshot.now : null }
    },
    async markOnboarded(at) {
      onboarded = true
      await base.markOnboarded(at)
    },
  }
  setRepository(repository)
  return repository
}

describe('S-02 はじめに（§4 S-02）', () => {
  it('アバター・見出し・入力欄・1文・注記・［はじめる］を出す', async () => {
    await signInAsFirstTime()
    show()
    expect(await screen.findByRole('heading', { name: 'あなたの呼び名' })).toBeInTheDocument()
    // 初期値は管理者が入れた表示名（§9.1）
    expect(screen.getByLabelText('あなたの呼び名')).toHaveValue('りさこ')
    expect(screen.getByText('ふたりの家計で払ったものだけを記録します')).toBeInTheDocument()
    expect(screen.getByText('共用 ＝ ふたりの共用口座・共用カード')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'はじめる' })).toBeInTheDocument()
  })

  it('空・7文字以上では、その場の1行を出す（§1.4）', async () => {
    await signInAsFirstTime()
    show()
    const field = await screen.findByLabelText('あなたの呼び名')
    await userEvent.clear(field)
    await userEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(screen.getByText('呼び名を入れてください')).toBeInTheDocument()

    await userEvent.type(field, 'あいうえおかき')
    await userEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(screen.getByText('呼び名は6文字までです')).toBeInTheDocument()
  })

  it('［はじめる］で呼び名を保存して、記録タブ（S-11）へ移る', async () => {
    const repository = await signInAsFirstTime()
    show()
    const field = await screen.findByLabelText('あなたの呼び名')
    await userEvent.clear(field)
    await userEvent.type(field, 'りさ')
    await userEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(await screen.findByRole('heading', { name: '何に払った？' })).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.people.b.name).toBe('りさ')
    expect(snapshot.onboardedAt).not.toBeNull()
  })
})
