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
import { createLocalRepository, type Repository, RepositoryError, setRepository } from '@/data'
import type { ScenarioId } from '@/domain'
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
  /** 毎月の支払いを空にする（`empty` の状態を見る。変更の履歴も空にする） */
  noTemplates?: boolean
  /** 見本データのシナリオ（既定は sep-open ＝ 9/22） */
  scenario?: ScenarioId
}

async function setup(options: SetupOptions = {}): Promise<Repository> {
  const repository = createLocalRepository(options.scenario)
  await repository.auth.signIn(options.loginId ?? 'masato', 'pw')
  if (options.noTemplates) {
    const snapshot = await repository.loadSnapshot()
    snapshot.data.templates.length = 0
    snapshot.data.templateChanges = []
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

  it('変更の履歴があるときだけ、［＋ 追加］の下に「変更の履歴」を出す', async () => {
    await openS31()
    expect(screen.getByRole('button', { name: '変更の履歴' })).toBeInTheDocument()
  })

  it('変更の履歴が無ければ「変更の履歴」を出さない', async () => {
    await openS31({ noTemplates: true })
    expect(screen.queryByRole('button', { name: '変更の履歴' })).not.toBeInTheDocument()
  })

  it('「変更の履歴」で S-35 が開き、新しい順に追加・直した・やめたが並ぶ', async () => {
    const repository = await setup()
    await repository.updateTemplate('t2', {
      name: 'Wi-Fi',
      cat: 'telecom',
      payer: 'joint',
      kind: 'fixed',
      amount: 4980,
    })
    await repository.stopTemplate('t1')
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(await screen.findByRole('button', { name: '変更の履歴' }))
    const dialog = await screen.findByRole('dialog', { name: '変更の履歴' })
    expect(within(dialog).getByText('変更の履歴')).toBeInTheDocument()
    expect(dialog.querySelector('[data-screen="S-35"]')).toHaveAttribute('data-state', 'normal')
    const rows = within(dialog).getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    // いちばん新しいのは「やめた」（名前はやめる前の名前）
    expect(rows[0]).toHaveTextContent('家賃10月分からやめましたまさと 9/22')
    expect(rows[1]).toHaveTextContent('Wi-Fi10月分から名前 光回線 → Wi-Fi、まさと → 共用、5,500円 → 4,980円まさと 9/22')
    // 見本データのひな形の「追加」（金額待ちは「金額待ち」）
    expect(rows.find((r) => r.textContent?.startsWith('電気代'))).toHaveTextContent(
      '電気代8月分から追加 金額待ち・共用まさと 8/1'
    )
    expect(rows.at(-1)).toHaveTextContent('家賃8月分から追加 85,000円・共用まさと 8/1')
  })

  it('S-35: 開始月を広げた変更は「記録を始める月 10月分 → 9月分」を先に出す', async () => {
    const repository = createLocalRepository('sep-redo')
    await repository.auth.signIn('masato', 'pw')
    const news = { name: '新聞', cat: 'other', payer: 'joint', kind: 'fixed', amount: 3000 } as const
    await repository.addTemplate({ ...news, from: '2026-10' })
    const t = (await repository.loadSnapshot()).data.templates.find((x) => x.name === '新聞')
    if (!t) throw new Error('足したひな形が無い')
    await repository.updateTemplate(t.id, { ...news, amount: 3500 }, '2026-09')
    setRepository(repository)
    render(
      <Wrapper>
        <SettingsTab />
      </Wrapper>
    )
    await screen.findByText('ふたりの設定')
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(await screen.findByRole('button', { name: '変更の履歴' }))
    const dialog = await screen.findByRole('dialog', { name: '変更の履歴' })
    const rows = within(dialog).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('新聞9月分から記録を始める月 10月分 → 9月分、3,000円 → 3,500円まさと 10/3')
    // 追加の行には開始月の変化を出さない
    expect(rows[1]).toHaveTextContent('新聞10月分から追加 3,000円・共用まさと 10/3')
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

  it('追加のシートは、払う人が共用・金額が「毎月同じ」で開き、注記は「［9月分 ▾］から記録します」', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    expect(within(dialog).getByRole('radio', { name: '共用' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: '毎月同じ' })).toBeChecked()
    const chip = within(dialog).getByRole('button', { name: '記録を始める月 9月分（押すと選び直す）' })
    expect(chip).toHaveTextContent('9月分')
    expect(within(dialog).getByText('から記録します')).toBeInTheDocument()
    expect(within(dialog).getByText('選ぶ')).toBeInTheDocument()
  })

  it('記録を始める月を前の月にでき、保存するとその月から記録する（sep-redo ＝ 10/3）', async () => {
    const repository = await setup({ scenario: 'sep-redo' })
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getAllByRole('button', { name: '追加' })[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), '新聞')
    await userEvent.click(within(dialog).getByRole('button', { name: '記録を始める月 10月分（押すと選び直す）' }))

    // 中身が「何月分から」の月のマスに入れ替わる（シートは重ねない）
    expect(within(dialog).getByText('何月分から')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('名前')).not.toBeInTheDocument()
    // 選べるのは 家計を作った月（8月）〜 既定の開始月（今月＝10月）。範囲の外はボタンにしない
    expect(within(dialog).getByRole('button', { name: '2026年8月' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '2026年10月 今月' })).toHaveAttribute('aria-current', 'true')
    expect(within(dialog).queryByRole('button', { name: '2026年7月' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '2026年11月' })).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '2026年9月' }))
    // フォームに戻り、チップの文字が選んだ月になる（入力はそのまま）
    expect(within(dialog).getByRole('button', { name: '記録を始める月 9月分（押すと選び直す）' })).toBeInTheDocument()
    // フォーカスは開始月のチップに戻る（名前の欄に戻してキーボードを開かない）
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: '記録を始める月 9月分（押すと選び直す）' })
    )
    expect(within(dialog).getByLabelText('名前')).toHaveValue('新聞')

    await userEvent.click(within(dialog).getByRole('button', { name: /カテゴリ/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /その他/ }))
    await userEvent.type(within(dialog).getByLabelText('毎月の金額'), '3000')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('新聞を追加しました')).toBeInTheDocument()
    const snapshot = await repository.loadSnapshot()
    const t = snapshot.data.templates.find((x) => x.name === '新聞')
    expect(t?.from).toBe('2026-09')
    const months = snapshot.data.expenses.filter((e) => e.tpl === t?.id).map((e) => e.labelMonth)
    expect(months.sort()).toEqual(['2026-09', '2026-10'])
  })

  it('ロック中の月が入る月を押すと、選ばずにマスの下に案内を出す', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.click(within(dialog).getByRole('button', { name: '記録を始める月 9月分（押すと選び直す）' }))
    // 8月は精算済み（§9.7）
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年8月' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('8月は精算済みです（先に精算をやり直します）')
    // グリッドのまま（選んだことにしない）
    expect(within(dialog).getByText('何月分から')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '2026年9月 今月' })).toHaveAttribute('aria-current', 'true')
    // 選べる月を押すとフォームに戻り、1行は消える
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年9月 今月' }))
    expect(within(dialog).getByRole('button', { name: '記録を始める月 9月分（押すと選び直す）' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('保存したときにサーバーがロック中を返したら、シートを閉じずに固定部分の直上に案内を出す', async () => {
    const repository = await openAdd()
    repository.addTemplate = async () => {
      throw new RepositoryError('month_locked', 'その月は精算中です', '2026-09')
    }
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), 'ガス代')
    await userEvent.type(within(dialog).getByLabelText('毎月の金額'), '6200')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('9月は精算中です（先に精算をやり直します）')
    expect(screen.getByRole('dialog', { name: '毎月の支払いを追加' })).toBeInTheDocument()
    expect(screen.queryByText('ガス代を追加しました')).not.toBeInTheDocument()
  })

  it('カテゴリが空のまま保存すると、カテゴリのチップにフォーカスを移す', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), 'クリーニング')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('カテゴリを選んでください')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'カテゴリ 選ぶ' })).toHaveFocus()
  })

  it('名前に「Wifi」と入れると通信を推測する（ハイフンなし）', async () => {
    await openAdd()
    const dialog = screen.getByRole('dialog', { name: '毎月の支払いを追加' })
    await userEvent.type(within(dialog).getByLabelText('名前'), 'Wifi')
    expect(within(dialog).getByText('通信')).toBeInTheDocument()
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

  async function openEdit(
    name: string,
    options: SetupOptions = {}
  ): Promise<{ repository: Repository; dialog: HTMLElement }> {
    const repository = await setup(options)
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
    const dialog = await screen.findByRole('dialog', { name: `毎月の支払いを直す（${name}）` })
    return { repository, dialog }
  }

  it('直すシートは値が入って開き、「［10月分 ▾］から変更します」・下端に［支払いをやめる］が出る（金額の種類は出さない）', async () => {
    const { dialog } = await openEdit('家賃')
    expect(within(dialog).getByLabelText('名前')).toHaveValue('家賃')
    expect(within(dialog).getByLabelText('毎月の金額')).toHaveValue('85000')
    const chip = within(dialog).getByRole('button', { name: '変更を始める月 10月分（押すと選び直す）' })
    expect(chip).toHaveTextContent('10月分')
    expect(within(dialog).getByText('から変更します')).toBeInTheDocument()
    expect(within(dialog).queryByText(/変更は10月分から/)).not.toBeInTheDocument()
    // 金額の種類のセグメントは無い（直せない。§12.1 Q33）
    expect(within(dialog).queryByRole('radio', { name: '毎月同じ' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: '金額待ち' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '支払いをやめる' })).toBeInTheDocument()
  })

  it('金額待ちのひな形を直すときは、金額の欄の代わりに値の表示「金額待ち」を出す', async () => {
    const { dialog } = await openEdit('ガス代')
    expect(within(dialog).getByText('金額待ち')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('毎月の金額')).not.toBeInTheDocument()
    // ラジオは払う人のセグメントの3つだけ
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3)
    expect(within(dialog).queryByRole('radio', { name: '金額待ち' })).not.toBeInTheDocument()
  })

  it('毎月同じのひな形で金額を空にして保存すると「金額を入れてください」', async () => {
    const { dialog } = await openEdit('家賃')
    await userEvent.clear(within(dialog).getByLabelText('毎月の金額'))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('金額を入れてください')).toBeInTheDocument()
  })

  it('前の月から直すと、その月以降の手つかずの行だけを書き換える（個別に直した行はそのまま）', async () => {
    const { repository } = await openEdit('光回線')
    // 家賃の9月の行は S-14 で個別に直してある
    const before = await repository.loadSnapshot()
    const rentSep = before.data.expenses.find((e) => e.tpl === 't1' && e.labelMonth === '2026-09')
    if (!rentSep) throw new Error('9月の行が無い')
    await repository.updateExpense(rentSep.id, { amount: 86000 })
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))

    await userEvent.click(screen.getByRole('button', { name: /家賃/ }))
    const dialog = await screen.findByRole('dialog', { name: '毎月の支払いを直す（家賃）' })
    await userEvent.click(within(dialog).getByRole('button', { name: '変更を始める月 10月分（押すと選び直す）' }))
    expect(within(dialog).getByText('何月分から')).toBeInTheDocument()
    // 選べるのは 家計を作った月（8月）〜 既定の月（10月）
    expect(within(dialog).getByRole('button', { name: '2026年8月' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '2026年10月' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '2026年11月' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年9月 今月' }))
    const chip = within(dialog).getByRole('button', { name: '変更を始める月 9月分（押すと選び直す）' })
    expect(document.activeElement).toBe(chip)

    const amount = within(dialog).getByLabelText('毎月の金額')
    await userEvent.clear(amount)
    await userEvent.type(amount, '90000')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
    const after = await repository.loadSnapshot()
    expect(after.data.templates.find((t) => t.id === 't1')?.amount).toBe(90000)
    // 個別に直した9月の行はそのまま
    expect(after.data.expenses.find((e) => e.id === rentSep.id)?.amount).toBe(86000)
    expect(after.data.templateChanges?.at(-1)).toMatchObject({ templateId: 't1', change: 'update', from: '2026-09' })
  })

  it('前の月から直すと手つかずの行が変わり、トーストの「元に戻す」で行も戻って履歴も消える', async () => {
    const { repository, dialog } = await openEdit('光回線')
    await userEvent.click(within(dialog).getByRole('button', { name: '変更を始める月 10月分（押すと選び直す）' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年9月 今月' }))
    const amount = within(dialog).getByLabelText('毎月の金額')
    await userEvent.clear(amount)
    await userEvent.type(amount, '4980')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await screen.findByText('保存しました')
    const edited = await repository.loadSnapshot()
    expect(edited.data.expenses.find((e) => e.tpl === 't2' && e.labelMonth === '2026-09')?.amount).toBe(4980)

    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot()
      expect(snapshot.data.templates.find((t) => t.id === 't2')?.amount).toBe(5500)
      expect(snapshot.data.expenses.find((e) => e.tpl === 't2' && e.labelMonth === '2026-09')?.amount).toBe(5500)
      expect(snapshot.data.templateChanges?.some((c) => c.change === 'update')).toBe(false)
    })
  })

  it('直すときに開始月より前の月を選ぶと、その月の行を作る（sep-redo ＝ 10/3）', async () => {
    const repository = createLocalRepository('sep-redo')
    await repository.auth.signIn('masato', 'pw')
    await repository.addTemplate({
      name: '新聞',
      cat: 'other',
      payer: 'joint',
      kind: 'fixed',
      amount: 3000,
      from: '2026-10',
    })
    setRepository(repository)
    render(
      <Wrapper>
        <SettingsTab />
      </Wrapper>
    )
    await screen.findByText('ふたりの設定')
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getByRole('button', { name: /新聞/ }))
    const dialog = await screen.findByRole('dialog', { name: '毎月の支払いを直す（新聞）' })
    // 10月の行はもうあるので、既定は11月
    await userEvent.click(within(dialog).getByRole('button', { name: '変更を始める月 11月分（押すと選び直す）' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年9月' }))
    // 値は変えずに月だけ前にしても保存する（開始月が広がる）
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
    const after = await repository.loadSnapshot()
    const t = after.data.templates.find((x) => x.name === '新聞')
    expect(t?.from).toBe('2026-09')
    expect(
      after.data.expenses
        .filter((e) => e.tpl === t?.id)
        .map((e) => e.labelMonth)
        .sort()
    ).toEqual(['2026-09', '2026-10'])
  })

  it('直すときに月だけ後のままで値も同じなら、何もせずに閉じる', async () => {
    const { repository, dialog } = await openEdit('家賃')
    const count = (await repository.loadSnapshot()).data.templateChanges?.length ?? 0
    await userEvent.click(within(dialog).getByRole('button', { name: '変更を始める月 10月分（押すと選び直す）' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年9月 今月' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '毎月の支払いを直す（家賃）' })).not.toBeInTheDocument()
    )
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
    expect((await repository.loadSnapshot()).data.templateChanges).toHaveLength(count)
  })

  it('直すときにロック中の月が入る月を押すと、選ばずにマスの下に案内を出す', async () => {
    const { dialog } = await openEdit('家賃')
    await userEvent.click(within(dialog).getByRole('button', { name: '変更を始める月 10月分（押すと選び直す）' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '2026年8月' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('8月は精算済みです（先に精算をやり直します）')
    expect(within(dialog).getByText('何月分から')).toBeInTheDocument()
  })

  it('直して保存したときにサーバーがロック中を返したら、シートを閉じずに固定部分の直上に案内を出す', async () => {
    const { repository, dialog } = await openEdit('家賃')
    repository.updateTemplate = async () => {
      throw new RepositoryError('month_locked', 'その月は精算中です', '2026-09')
    }
    const amount = within(dialog).getByLabelText('毎月の金額')
    await userEvent.clear(amount)
    await userEvent.type(amount, '90000')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('9月は精算中です（先に精算をやり直します）')
    expect(screen.getByRole('dialog', { name: '毎月の支払いを直す（家賃）' })).toBeInTheDocument()
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
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

  it('直したのをトーストの「元に戻す」で戻すと、その変更の履歴も消える', async () => {
    const repository = await setup()
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getByRole('button', { name: /光回線/ }))
    const dialog = await screen.findByRole('dialog', { name: '毎月の支払いを直す（光回線）' })
    const amount = within(dialog).getByLabelText('毎月の金額')
    await userEvent.clear(amount)
    await userEvent.type(amount, '4980')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await screen.findByText('保存しました')
    const edited = await repository.loadSnapshot()
    expect(edited.data.templateChanges?.at(-1)).toMatchObject({ templateId: 't2', change: 'update', from: '2026-10' })

    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot()
      expect(snapshot.data.templates.find((t) => t.id === 't2')?.amount).toBe(5500)
      expect(snapshot.data.templateChanges?.some((c) => c.change === 'update')).toBe(false)
    })
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
