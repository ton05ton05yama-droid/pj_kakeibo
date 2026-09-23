/**
 * 記録タブ（S-11・S-12）のテスト。
 * 見本データ（仕様書 §9）をそのまま使うローカル実装につなぎ、画面の表示・状態・操作を確かめる。
 */
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnnounceProvider } from '@/app/providers/announce-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, setRepository } from '@/data'
import type { Repository } from '@/data/repository'
import type { ScenarioId } from '@/domain'
import { system } from '@/theme'
import { addDays, choiceForDate, formatDateWithWeekday, resolveDate } from '../date'
import { lockedMessage, recordToastText } from '../messages'
import { hasPendingHint } from '../pending-hint'
import { RecordScreen } from '../record-screen'

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return (
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AnnounceProvider>
          <ToastProvider>{children}</ToastProvider>
        </AnnounceProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}

/** 見本データにつないだ記録タブを出す（ログイン済み） */
async function openRecordTab(
  scenario: ScenarioId = 'sep-open',
  before?: (repository: Repository) => Promise<void>
): Promise<Repository> {
  const repository = createLocalRepository(scenario)
  await repository.auth.signIn('masato', 'pw')
  if (before) await before(repository)
  setRepository(repository)
  render(wrap(<RecordScreen />))
  await screen.findByRole('button', { name: '食料品' })
  return repository
}

/** 入力中の金額（「¥」だけ別の要素なので、要素の中身をまとめて見る） */
function expectAmount(text: string): void {
  expect(screen.getAllByText((_content, el) => el?.textContent === text).length).toBeGreaterThan(0)
}

/** テンキーで金額を入れる */
async function typeAmount(digits: string): Promise<void> {
  for (const key of digits) {
    await userEvent.click(screen.getByRole('button', { name: key }))
  }
}

afterEach(() => {
  setRepository(null)
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
})

describe('S-11 記録（何に払った？）', () => {
  it('見出しとカテゴリ15個だけを出す（月切替・合計・お知らせ行は置かない）', async () => {
    await openRecordTab()
    expect(screen.getByRole('heading', { name: '何に払った？' })).toBeInTheDocument()
    // §8 の15個（3列×5行）がこの並びで出る
    for (const name of [
      '食料品',
      '外食',
      '日用品',
      '交通',
      'レジャー',
      'エンタメ',
      '交際',
      '住まい',
      '光熱費',
      '通信',
      '保険',
      '医療',
      '大型出費',
      '税金',
      'その他',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    // 月切替・お知らせ行・主ボタンは置かない（§2.1）
    expect(screen.queryByRole('button', { name: /月を選ぶ/ })).toBeNull()
    expect(screen.queryByText('記録する')).toBeNull()
    expect(document.querySelector('[data-screen="S-11"]')?.getAttribute('data-state')).toBe('normal')
  })

  it('オフラインのときだけオフラインの行を出す（§3.6）', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    await openRecordTab()
    expect(screen.getByText('オフライン（表示は最後に取得した内容）')).toBeInTheDocument()
  })
})

describe('S-12 記録（いくら？）', () => {
  it('カテゴリを押すとシートが開き、払った人の既定は設定の値（自分）', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    const sheet = await screen.findByRole('dialog', { name: 'いくら？（食料品）' })
    expect(
      within(sheet).getByRole('button', { name: 'カテゴリを選び直す（いまは食料品。押すとカテゴリに戻る）' })
    ).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'メモ' })).toBeInTheDocument()
    // 日付の既定は今日、払った人の既定は「自分」＝ ログイン中の人
    expect(within(sheet).getByRole('radio', { name: '今日' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'まさと' })).toBeChecked()
    expect(within(sheet).getByRole('button', { name: '記録する' })).toBeInTheDocument()
    expect(document.querySelector('[data-screen="S-12"]')?.getAttribute('data-state')).toBe('normal')
  })

  it('設定（S-30）で「共用」にした人は、払った人が共用で開く（§12.1 Q3）', async () => {
    await openRecordTab('sep-open', async (repository) => {
      await repository.updateDefaultPayer('joint')
    })
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    const sheet = await screen.findByRole('dialog', { name: 'いくら？（食料品）' })
    expect(within(sheet).getByRole('radio', { name: '共用' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'まさと' })).not.toBeChecked()
  })

  it('金額を入れて［記録する］で保存し、記録タブに留まってトーストを出す（フロー a）', async () => {
    const repository = await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await typeAmount('1280')
    expectAmount('¥1,280')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    // シートは閉じ、記録タブ（S-11）に留まる
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { name: '何に払った？' })).toBeInTheDocument()
    expect(screen.getByText('食料品 1,280円（まさと）を記録')).toBeInTheDocument()

    const snapshot = await repository.loadSnapshot()
    const saved = snapshot.data.expenses.find((e) => e.date === '2026-09-22' && e.cat === 'groceries')
    expect(saved).toBeDefined()
    expect(saved?.amount).toBe(1280)
    expect(saved?.payer).toBe('a')
    expect(saved?.by).toBe('a')
    expect(saved?.month).toBe('2026-09')
  })

  it('トーストの「元に戻す」で、いま記録した1件が消える', async () => {
    const repository = await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '外食' }))
    await typeAmount('980')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    await screen.findByText('外食 980円（まさと）を記録')
    const before = (await repository.loadSnapshot()).data.expenses.length

    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    await waitFor(async () => {
      const after = (await repository.loadSnapshot()).data.expenses.length
      expect(after).toBe(before - 1)
    })
  })

  it('¥0 のまま［記録する］は `empty`（金額を入れてください。記録しない）', async () => {
    const repository = await openRecordTab()
    const before = (await repository.loadSnapshot()).data.expenses.length
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('金額を入れてください')
    expect(document.querySelector('[data-screen="S-12"]')?.getAttribute('data-state')).toBe('empty')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((await repository.loadSnapshot()).data.expenses).toHaveLength(before)
    // 次のキーを押すと、その場の1行は消える（§4.0.3）
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('金額待ちのカテゴリは `action`（金額待ちは支出タブの上から入れます）', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '光熱費' }))
    expect(await screen.findByText('金額待ちは支出タブの上から入れます')).toBeInTheDocument()
    expect(document.querySelector('[data-screen="S-12"]')?.getAttribute('data-state')).toBe('action')
  })

  it('金額待ちの無いカテゴリには注記を出さない', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await screen.findByRole('dialog')
    expect(screen.queryByText('金額待ちは支出タブの上から入れます')).toBeNull()
  })

  it('精算中の月の日付で押すと案内を出し、記録しない（§1.4）', async () => {
    // sep-transfer は 10/1。［昨日］＝ 9/30 は精算中の9月に入る
    const repository = await openRecordTab('sep-transfer')
    const before = (await repository.loadSnapshot()).data.expenses.length
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await typeAmount('980')
    await userEvent.click(screen.getByRole('radio', { name: '昨日' }))

    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('9月は精算中です（先に精算をやり直します）')
    expect(document.querySelector('[data-screen="S-12"]')?.getAttribute('data-state')).toBe('action')
    expect((await repository.loadSnapshot()).data.expenses).toHaveLength(before)
  })

  it('［ほかの日］で選んだ日がセグメントの文字になる（§4 S-12 の要素5）', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await screen.findByRole('dialog')
    const dateInput = document.querySelector('input[type="date"]')
    expect(dateInput).not.toBeNull()
    // 家計を作る前の月と今日より先は選べない（§3.4）
    expect((dateInput as HTMLInputElement).min).toBe('2026-08-01')
    expect((dateInput as HTMLInputElement).max).toBe('2026-09-22')
    fireEvent.change(dateInput as HTMLInputElement, { target: { value: '2026-09-19' } })
    expect(await screen.findByRole('radio', { name: '9/19（土）' })).toBeChecked()
  })

  it('今日以外の日付で記録すると、トーストに日付が入る（§1.4）', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await typeAmount('8420')
    await userEvent.click(screen.getByRole('radio', { name: '昨日' }))
    await userEvent.click(screen.getByRole('radio', { name: 'りさこ' }))
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByText('9/21 食料品 8,420円（りさこ）を記録')).toBeInTheDocument()
  })

  it('オフラインのときは「つながったら送ります」のトーストになる（§3.6）', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '日用品' }))
    await typeAmount('1280')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByText('日用品 1,280円（まさと）はつながったら送ります')).toBeInTheDocument()
  })

  it('メモのチップを押すと入力欄になり、入れるとチップに出る', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await userEvent.click(screen.getByRole('button', { name: 'メモ' }))
    const memo = await screen.findByPlaceholderText('メモ（30字まで）')
    await userEvent.type(memo, 'スーパー')
    await waitFor(() => expect(screen.getByRole('button', { name: 'メモ: スーパー' })).toBeInTheDocument())
  })

  it('入力のあるシートを閉じると「入力をやめました」、元に戻すで入力のまま開き直す（§3.7）', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await typeAmount('1280')
    await userEvent.click(
      screen.getByRole('button', { name: 'カテゴリを選び直す（いまは食料品。押すとカテゴリに戻る）' })
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('入力をやめました')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    await screen.findByRole('dialog', { name: 'いくら？（食料品）' })
    expectAmount('¥1,280')
    // 続けて数字を足せる（最初のキーで置き換わらない）
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    expectAmount('¥12,805')
  })

  it('入力の無いシートを閉じてもトーストは出さない', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('入力をやめました')).toBeNull()
  })

  it('7桁を超える金額は受け付けない（値を変えない。§7.5）', async () => {
    await openRecordTab()
    await userEvent.click(screen.getByRole('button', { name: '食料品' }))
    await typeAmount('99999999')
    expectAmount('¥9,999,999')
  })
})

describe('記録タブの純粋関数', () => {
  it('日付のセグメントから保存する日付を出す', () => {
    expect(resolveDate('today', null, '2026-09-22')).toBe('2026-09-22')
    expect(resolveDate('yesterday', null, '2026-09-22')).toBe('2026-09-21')
    expect(resolveDate('other', '2026-09-19', '2026-09-22')).toBe('2026-09-19')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(formatDateWithWeekday('2026-09-19')).toBe('9/19（土）')
    expect(choiceForDate('2026-09-22', '2026-09-22')).toBe('today')
    expect(choiceForDate('2026-09-21', '2026-09-22')).toBe('yesterday')
    expect(choiceForDate('2026-09-19', '2026-09-22')).toBe('other')
  })

  it('トーストと案内の文言が §1.4 のとおり', async () => {
    const repository = createLocalRepository('sep-open')
    await repository.auth.signIn('masato', 'pw')
    const { data, now } = await repository.loadSnapshot()
    expect(
      recordToastText({
        date: '2026-09-22',
        today: '2026-09-22',
        cat: 'groceries',
        amount: 1280,
        payer: 'a',
        people: data.people,
        offline: false,
      })
    ).toBe('食料品 1,280円（まさと）を記録')
    expect(
      recordToastText({
        date: '2026-09-21',
        today: '2026-09-22',
        cat: 'groceries',
        amount: 8420,
        payer: 'b',
        people: data.people,
        offline: false,
      })
    ).toBe('9/21 食料品 8,420円（りさこ）を記録')
    expect(
      recordToastText({
        date: '2026-09-22',
        today: '2026-09-22',
        cat: 'groceries',
        amount: 1280,
        payer: 'joint',
        people: data.people,
        offline: true,
      })
    ).toBe('食料品 1,280円（共用）はつながったら送ります')
    expect(lockedMessage('2026-09', 'confirmed')).toBe('9月は精算中です（先に精算をやり直します）')
    expect(lockedMessage('2026-09', 'settled')).toBe('9月は精算済みです（先に精算をやり直します）')
    // 9/22 は9月の金額待ち（電気代・ガス代 = 光熱費）だけが注記の対象
    expect(hasPendingHint(data, '2026-09', 'utilities', now)).toBe(true)
    expect(hasPendingHint(data, '2026-09', 'groceries', now)).toBe(false)
  })
})
