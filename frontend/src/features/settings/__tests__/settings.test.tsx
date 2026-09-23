/**
 * 設定タブ（S-30・S-31・S-32・S-33・S-34）と S-03 のテスト。
 *
 * 見本データ（§9。既定のシナリオ `sep-open` ＝ 2026-09-22）で、表示・権限による違い・
 * 状態の切り替わり・主要な操作（記録の払った人を変える・毎月の支払いを足す／直す／やめる・
 * 呼び名と割合を保存する・パスワードを変える）を見る。
 */
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '@/app/providers/auth-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, type Repository, setRepository } from '@/data'
import { system } from '@/theme'
import { SettingsTab } from '../settings-tab'

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return (
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}

type SetupOptions = {
  /** ログインする人（既定はまさと） */
  loginId?: 'masato' | 'risako'
  /** 毎月の支払いを空にする（`empty` の状態を見る） */
  noTemplates?: boolean
}

async function setup(options: SetupOptions = {}): Promise<Repository> {
  const repository = createLocalRepository()
  await repository.auth.signIn(options.loginId ?? 'masato', 'pw')
  if (options.noTemplates) {
    const snapshot = await repository.loadSnapshot()
    snapshot.data.templates.length = 0
  }
  setRepository(repository)
  render(
    <Wrapper>
      <SettingsTab />
    </Wrapper>
  )
  await screen.findByText('ふたりの設定')
  return repository
}

beforeEach(() => {
  setRepository(null)
})

afterEach(() => {
  setRepository(null)
})

describe('S-30 設定', () => {
  it('ふたりの行・毎月の支払いの件数・自分の欄が出る（自分の名前には「（自分）」を付ける）', async () => {
    await setup()
    expect(screen.getByRole('button', { name: /まさと（自分）/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /りさこ/ })).toBeInTheDocument()
    expect(screen.getAllByText('出す割合 40%')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /毎月の支払い/ })).toHaveTextContent('5件')
    expect(screen.getByText('自分（まさと）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'パスワードを変える' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    // ホーム画面から開いている／Safari でないときは「ホーム画面に追加」の行を出さない
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument()
  })

  it('記録の払った人は本人の欄にだけ出て、既定は「自分」（§9.1 の見本データ）', async () => {
    await setup()
    const group = screen.getByRole('radiogroup', { name: '記録の払った人' })
    expect(within(group).getByRole('radio', { name: '自分' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: '共用' })).not.toBeChecked()
    // 相手を既定にはできない（選べるのは2つだけ。§11 #42）
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
  })

  it('記録の払った人を「共用」にすると、その場で保存してトーストを出す', async () => {
    const repository = await setup()
    await userEvent.click(screen.getByRole('radio', { name: '共用' }))
    expect(await screen.findByText('記録の払った人を『共用』にしました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.people.a.defaultPayer).toBe('joint')
    // 選んだほうが選択中の見た目になる
    await waitFor(() => expect(screen.getByRole('radio', { name: '共用' })).toBeChecked())
  })

  it('相手（りさこ）でログインすると、自分の欄は「自分（りさこ）」になる', async () => {
    await setup({ loginId: 'risako' })
    expect(screen.getByText('自分（りさこ）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /りさこ（自分）/ })).toBeInTheDocument()
  })

  it('毎月の支払いが0件なら「まだありません」（empty）', async () => {
    await setup({ noTemplates: true })
    expect(screen.getByRole('button', { name: /毎月の支払い/ })).toHaveTextContent('まだありません')
  })

  it('オフラインのときは切り替えず、その行の直下に「オンラインで直せます」を出す（§3.6）', async () => {
    const repository = await setup()
    window.dispatchEvent(new Event('offline'))
    await userEvent.click(screen.getByRole('radio', { name: '共用' }))
    expect(await screen.findByText('オンラインで直せます')).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.people.a.defaultPayer).toBe('self')
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.queryByText('オンラインで直せます')).not.toBeInTheDocument())
  })
})

describe('S-31 毎月の支払い', () => {
  async function openS31(options: SetupOptions = {}): Promise<Repository> {
    const repository = await setup(options)
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    return repository
  }

  it('毎月の合計と金額待ちの件数を出し、毎月同じ（金額の多い順）→ 金額待ち の順に並べる', async () => {
    await openS31()
    expect(screen.getByText('毎月 ¥92,090')).toBeInTheDocument()
    expect(screen.getByText('＋ 金額待ち 2件')).toBeInTheDocument()
    const names = ['家賃', '光回線', '動画配信', '電気代', 'ガス代']
    const order = screen
      .getAllByRole('button')
      .map((el) => names.find((n) => (el.textContent ?? '').startsWith(n)))
      .filter((n): n is string => n !== undefined)
    expect(order).toEqual(names)
    // 行には払う人のアバターと呼び名が並ぶ
    expect(screen.getByRole('button', { name: /家賃/ })).toHaveTextContent('家賃共用85,000')
    expect(screen.getAllByText('金額待ち')).toHaveLength(2)
  })

  it('0件なら1文と塗りの［＋ 追加］を出す（empty）', async () => {
    await openS31({ noTemplates: true })
    expect(screen.getByText('毎月の支払いを入れると、毎月自動で記録されます')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument()
    expect(screen.queryByText(/毎月 ¥/)).not.toBeInTheDocument()
  })

  it('‹ 設定 で S-30 に戻る', async () => {
    await openS31()
    await userEvent.click(screen.getByRole('button', { name: '設定' }))
    expect(screen.getByText('ふたりの設定')).toBeInTheDocument()
  })
})

describe('S-32 毎月の支払いを追加・直す', () => {
  async function openAdd(): Promise<Repository> {
    const repository = await setup()
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getAllByRole('button', { name: '追加' })[0] as HTMLElement)
    await screen.findByRole('dialog', { name: '毎月の支払いを追加' })
    return repository
  }

  it('追加のシートは、払う人が共用・金額が「毎月同じ」で開き、注記は「9月分から記録します」', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    expect(within(dialog).getByRole('radio', { name: '共用' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: '毎月同じ' })).toBeChecked()
    expect(within(dialog).getByText('9月分から記録します')).toBeInTheDocument()
    expect(within(dialog).getByText('選ぶ')).toBeInTheDocument()
  })

  it('名前を入れるとカテゴリを推測して入れる（§8。一番長い語で決める）', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), 'ガス代')
    expect(within(dialog).getByText('光熱費')).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByLabelText('名前'))
    await userEvent.type(within(dialog).getByLabelText('名前'), '光回線')
    expect(within(dialog).getByText('通信')).toBeInTheDocument()
  })

  it('足りないところはその欄の下に1行で出す（名前・カテゴリ・金額）', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('名前を入れてください')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('名前'), 'クリーニング')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('カテゴリを選んでください')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: /カテゴリ/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /税金/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('金額を入れるか「金額待ち」を選んでください')).toBeInTheDocument()
  })

  it('金額の欄に受け付けない値を入れると、切り詰めずに残して赤い枠にする（§7.5）', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    const amount = within(dialog).getByLabelText('毎月の金額')
    await userEvent.type(amount, '12345678')
    expect(amount).toHaveValue('12345678')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    await userEvent.clear(amount)
    await userEvent.type(amount, '6,200')
    expect(amount).toHaveValue('6200')
    expect(amount).not.toHaveAttribute('aria-invalid')
  })

  it('保存するとひな形が足されて、トースト「◯◯を追加しました」が出る', async () => {
    const repository = await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), 'ガス代')
    await userEvent.type(within(dialog).getByLabelText('毎月の金額'), '6200')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('ガス代を追加しました')).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    const added = snapshot.data.templates.filter((t) => t.name === 'ガス代' && t.cat === 'utilities')
    expect(added).toHaveLength(2) // 見本データのガス代（金額待ち）＋ 足したもの
    expect(added.at(-1)).toMatchObject({ kind: 'fixed', amount: 6200, payer: 'joint' })
  })

  it('足したひな形は、トーストの「元に戻す」で取り消せる', async () => {
    const repository = await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), '駐車場')
    await userEvent.type(within(dialog).getByLabelText('毎月の金額'), '12000')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await screen.findByText('駐車場を追加しました')
    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot()
      expect(snapshot.data.templates.some((t) => t.name === '駐車場')).toBe(false)
    })
  })

  it('「金額待ち」を選ぶと金額の欄が消える', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    expect(within(dialog).getByLabelText('毎月の金額')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('radio', { name: '金額待ち' }))
    expect(within(dialog).queryByLabelText('毎月の金額')).not.toBeInTheDocument()
  })

  it('直すシートは値が入って開き、注記は「変更は10月分から」・下端に［支払いをやめる］が出る', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getByRole('button', { name: /家賃/ }))
    const dialog = await screen.findByRole('dialog', { name: '毎月の支払いを直す（家賃）' })
    expect(within(dialog).getByLabelText('名前')).toHaveValue('家賃')
    expect(within(dialog).getByLabelText('毎月の金額')).toHaveValue('85000')
    expect(within(dialog).getByText('変更は10月分から')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '支払いをやめる' })).toBeInTheDocument()
  })

  it('支払いをやめると、トースト「◯◯をやめました（10月から）」が出て一覧から外れる', async () => {
    const repository = await setup()
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getByRole('button', { name: /家賃/ }))
    const dialog = await screen.findByRole('dialog', { name: '毎月の支払いを直す（家賃）' })
    await userEvent.click(within(dialog).getByRole('button', { name: '支払いをやめる' }))
    expect(await screen.findByText('家賃をやめました（10月から）')).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.templates.find((t) => t.name === '家賃')?.until).toBe('2026-10')
    // 押した時点で件数・一覧・毎月の合計から外す
    await waitFor(() => expect(screen.queryByRole('button', { name: /家賃/ })).not.toBeInTheDocument())
    expect(screen.getByText('毎月 ¥7,090')).toBeInTheDocument()
  })

  it('入力があるシートを閉じると「入力をやめました　元に戻す」が出る（§3.7）', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), 'ガス代')
    await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(await screen.findByText('入力をやめました')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    const reopened = await screen.findByRole('dialog', { name: '毎月の支払いを追加' })
    expect(within(reopened).getByLabelText('名前')).toHaveValue('ガス代')
  })
})

describe('S-33 人の設定', () => {
  async function openPerson(name: RegExp): Promise<Repository> {
    const repository = await setup()
    await userEvent.click(screen.getByRole('button', { name }))
    return repository
  }

  it('自分の行は呼び名・色・出す割合・給料の入り先を直せる（§2.2）', async () => {
    await openPerson(/まさと（自分）/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（まさと）' })
    expect(within(dialog).getByLabelText('呼び名')).toHaveValue('まさと')
    expect(within(dialog).getByLabelText('出す割合')).toHaveValue('40')
    expect(within(dialog).getByRole('radio', { name: 'ティール' })).toBeChecked()
    // 給料の入り先の既定は「自分の口座」（§9 の見本データ）
    const salary = within(dialog).getByRole('radiogroup', { name: '給料の入り先' })
    expect(within(salary).getByRole('radio', { name: '自分の口座' })).toBeChecked()
    expect(within(dialog).getByText('割合は次に決める月から、給料の入り先は決め直した月から')).toBeInTheDocument()
    expect(document.querySelector('[data-screen="S-33"]')).toHaveAttribute('data-state', 'normal')
  })

  it('相手の行は呼び名と色だけ直せて、出す割合と給料の入り先は値の表示になる（§2.2）', async () => {
    await openPerson(/りさこ/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（りさこ）' })
    // 呼び名と色は2人とも（相手の打ち間違いを直せるようにするため）
    expect(within(dialog).getByLabelText('呼び名')).toHaveValue('りさこ')
    expect(within(dialog).getByRole('radio', { name: 'アンバー' })).toBeChecked()
    // 出す割合と給料の入り先は本人だけ。押せないボタンを作らない（P7）ので値だけ出す
    expect(within(dialog).queryByLabelText('出す割合')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('radiogroup', { name: '給料の入り先' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('出す割合')).toBeInTheDocument()
    expect(within(dialog).getByText('40%')).toBeInTheDocument()
    expect(within(dialog).getByText('給料の入り先')).toBeInTheDocument()
    expect(within(dialog).getByText('自分の口座')).toBeInTheDocument()
    expect(within(dialog).getByText('本人だけが変えられます')).toBeInTheDocument()
    expect(within(dialog).queryByText('割合は次に決める月から、給料の入り先は決め直した月から')).not.toBeInTheDocument()
    expect(document.querySelector('[data-screen="S-33"]')).toHaveAttribute('data-state', 'partner')
  })

  it('呼び名と割合を確かめる（空・7文字以上・0〜100の外）', async () => {
    await openPerson(/まさと（自分）/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（まさと）' })
    const name = within(dialog).getByLabelText('呼び名')

    await userEvent.clear(name)
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('呼び名を入れてください')).toBeInTheDocument()

    await userEvent.type(name, 'あいうえおかき')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('呼び名は6文字までです')).toBeInTheDocument()

    await userEvent.clear(name)
    await userEvent.type(name, 'まさと')
    const rate = within(dialog).getByLabelText('出す割合')
    await userEvent.clear(rate)
    await userEvent.type(rate, '150')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('0〜100で入れてください')).toBeInTheDocument()
  })

  it('保存すると呼び名と割合が変わり、トースト「保存しました」が出る', async () => {
    const repository = await openPerson(/まさと（自分）/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（まさと）' })
    const name = within(dialog).getByLabelText('呼び名')
    await userEvent.clear(name)
    await userEvent.type(name, 'まさ')
    const rate = within(dialog).getByLabelText('出す割合')
    await userEvent.clear(rate)
    await userEvent.type(rate, '45')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.people.a.name).toBe('まさ')
    expect(snapshot.data.people.a.ratePct).toBe(45)
  })

  it('相手の行で保存しても、相手の出す割合は変わらない（§2.2）', async () => {
    const repository = await openPerson(/りさこ/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（りさこ）' })
    const name = within(dialog).getByLabelText('呼び名')
    await userEvent.clear(name)
    await userEvent.type(name, 'りさ')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.people.b.name).toBe('りさ')
    expect(snapshot.data.people.b.ratePct).toBe(40)
    expect(snapshot.data.people.b.salaryToJoint).toBe(false)
  })

  it('給料の入り先を「共用口座」にすると、トーストで何を変えたかが分かり、元に戻せる（S-33）', async () => {
    const repository = await openPerson(/まさと（自分）/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（まさと）' })
    const salary = within(dialog).getByRole('radiogroup', { name: '給料の入り先' })
    await userEvent.click(within(salary).getByRole('radio', { name: '共用口座' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('給料の入り先を『共用口座』にしました')).toBeInTheDocument()
    await waitFor(async () => {
      expect((await repository.loadSnapshot()).data.people.a.salaryToJoint).toBe(true)
    })

    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    await waitFor(async () => {
      expect((await repository.loadSnapshot()).data.people.a.salaryToJoint).toBe(false)
    })
  })

  it('色を選ぶと相手は残りの色になる', async () => {
    const repository = await openPerson(/りさこ/)
    const dialog = await screen.findByRole('dialog', { name: '人の設定（りさこ）' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'ティール' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await screen.findByText('保存しました')
    const snapshot = await repository.loadSnapshot()
    expect(snapshot.data.people.b.color).toBe('a')
    expect(snapshot.data.people.a.color).toBe('b')
  })
})

describe('S-34 パスワードを変える', () => {
  async function openPassword(): Promise<void> {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを変える' }))
    await screen.findByRole('dialog', { name: 'パスワードを変える' })
  }

  it('8文字未満は欄の下に1行を出す', async () => {
    await openPassword()
    const dialog = screen.getByRole('dialog', { name: 'パスワードを変える' })
    await userEvent.type(within(dialog).getByLabelText('パスワードを変える'), 'abc1234')
    await userEvent.click(within(dialog).getByRole('button', { name: '変える' }))
    expect(within(dialog).getByText('8文字以上にしてください')).toBeInTheDocument()
  })

  it('目のアイコンで表示と非表示を切り替えられる', async () => {
    await openPassword()
    const dialog = screen.getByRole('dialog', { name: 'パスワードを変える' })
    const field = within(dialog).getByLabelText('パスワードを変える')
    expect(field).toHaveAttribute('type', 'password')
    await userEvent.click(within(dialog).getByRole('button', { name: 'パスワードを表示' }))
    expect(within(dialog).getByLabelText('パスワードを変える')).toHaveAttribute('type', 'text')
    expect(within(dialog).getByRole('button', { name: 'パスワードを隠す' })).toBeInTheDocument()
  })

  it('変えるとトースト「パスワードを変えました」が出る（元に戻すは無し）', async () => {
    await openPassword()
    const dialog = screen.getByRole('dialog', { name: 'パスワードを変える' })
    await userEvent.type(within(dialog).getByLabelText('パスワードを変える'), 'abcd12345')
    await userEvent.click(within(dialog).getByRole('button', { name: '変える' }))
    expect(await screen.findByText('パスワードを変えました')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument()
  })
})

describe('S-03 ホーム画面に追加', () => {
  it('3つの手順と注記と［わかった］を出す（見出しは置かない）', async () => {
    const { AddToHomeSheet } = await import('../add-to-home-sheet')
    render(
      <Wrapper>
        <AddToHomeSheet onClose={() => {}} />
      </Wrapper>
    )
    const dialog = screen.getByRole('dialog', { name: 'ホーム画面に追加' })
    expect(within(dialog).getByText(/共有/)).toBeInTheDocument()
    expect(within(dialog).getByText(/「ホーム画面に追加」/)).toBeInTheDocument()
    expect(within(dialog).getByText('「追加」')).toBeInTheDocument()
    expect(within(dialog).getByText('ホーム画面から開くと、もう一度ログインが要ることがあります')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'わかった' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('heading')).not.toBeInTheDocument()
  })
})
