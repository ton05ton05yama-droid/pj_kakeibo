/**
 * 支出タブ（S-10・S-13・S-14・S-15・S-04）を、仕様書 §9 の見本データで確かめる。
 * 数字は §9.6、状態と新着は §9.8 のとおり。
 */
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnnounceProvider } from '@/app/providers/announce-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, type Repository, setRepository } from '@/data'
import type { ScenarioId } from '@/domain'
import { system } from '@/theme'
import { ExpensesScreen } from '../expenses-screen'
import { forgetExpenseMonth } from '../use-expense-month'

async function openExpensesTab(
  scenario: ScenarioId = 'sep-open',
  loginId = 'masato',
  /** 画面を出す前にデータをいじる（シナリオに無い状態を作るとき） */
  prepare?: (repository: Repository) => Promise<void>
): Promise<void> {
  const repository = createLocalRepository(scenario)
  await repository.auth.signIn(loginId, 'pw')
  if (prepare) await prepare(repository)
  setRepository(repository)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AnnounceProvider>
          <ToastProvider>
            <MemoryRouter>
              <ExpensesScreen />
            </MemoryRouter>
          </ToastProvider>
        </AnnounceProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
  await screen.findByRole('button', { name: /月を選ぶ/ })
}

/** テンキーの金額（`¥` は別の span なので、まとめて textContent で見る） */
function shownAmount(sheet: HTMLElement): string | null {
  for (const node of sheet.querySelectorAll('div')) {
    const text = node.textContent ?? ''
    if (/^¥[\d,]+$/.test(text)) return text
  }
  return null
}

beforeEach(() => {
  forgetExpenseMonth()
})
afterEach(() => {
  setRepository(null)
})

describe('S-10 支出（sep-open・9/22・まさと）', () => {
  it('月の合計・注記・内訳リンクが §9.6 のとおり出る', async () => {
    await openExpensesTab()
    expect(screen.getByText('9月のふたりの支出')).toBeInTheDocument()
    expect(screen.getByText('¥180,670')).toBeInTheDocument()
    expect(screen.getByText('＋ 金額待ち 2件')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '多いのは 住まい・食料品・外食' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026年9月（月を選ぶ）' })).toBeInTheDocument()
    // 今月より先には進めない（› を出さない）
    expect(screen.queryByRole('button', { name: '次の月' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前の月' })).toBeInTheDocument()
  })

  it('金額待ちの行が、対象月の古い順・ひな形の順に出る', async () => {
    await openExpensesTab()
    expect(screen.getByRole('button', { name: /電気代（9月分）.*金額を入れる/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ガス代（9月分）.*金額を入れる/ })).toBeInTheDocument()
  })

  it('前回見たあとに相手が記録した行に「新着」が付く（§9.8 まさとは3件）', async () => {
    await openExpensesTab()
    expect(screen.getAllByText('新着')).toHaveLength(3)
    // 9/20 の「ランチ 4,850」（りさこが記録）に付く
    expect(screen.getByRole('button', { name: /外食 ランチ 新着 4,850/ })).toBeInTheDocument()
  })

  it('りさこの視点では新着が2件になる（§9.8）', async () => {
    await openExpensesTab('sep-open', 'risako')
    expect(screen.getAllByText('新着')).toHaveLength(2)
  })

  it('日付の見出しが出て、毎月の支払いは1行にまとまる（件数は出さない）', async () => {
    await openExpensesTab()
    expect(screen.getByText('9月22日（火）')).toBeInTheDocument()
    const group = screen.getByRole('button', { name: /毎月の支払い/ })
    expect(group).toHaveAttribute('aria-expanded', 'false')
    expect(within(group).getByText('101,930')).toBeInTheDocument()
    await userEvent.click(group)
    expect(screen.getByRole('button', { name: /住まい 家賃 85,000/ })).toBeInTheDocument()
    // 8月から回した「電気代（8月分）」も同じまとまりに並ぶ
    expect(screen.getByRole('button', { name: /光熱費 電気代（8月分） 9,840/ })).toBeInTheDocument()
  })
})

describe('S-10 の状態', () => {
  it('精算済みの月は `locked` になり、合計の下にバッジが出る', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: '前の月' }))
    expect(screen.getByText('8月のふたりの支出')).toBeInTheDocument()
    expect(screen.getByText('¥255,890')).toBeInTheDocument()
    expect(screen.getByText('精算済み 9/2')).toBeInTheDocument()
    expect(document.querySelector('[data-screen="S-10"]')).toHaveAttribute('data-state', 'locked')
  })

  it('締め待ちの月に金額待ちが残っていると `action` になり、お知らせ行が出る', async () => {
    await openExpensesTab('sep-prep')
    expect(screen.getByRole('button', { name: /9月の精算ができます/ })).toBeInTheDocument()
    expect(document.querySelector('[data-screen="S-10"]')).toHaveAttribute('data-state', 'action')
  })

  it('条件2・受け取る側のお知らせ行は「8月: 共用から 4,930円 受け取る」（§9.6 の8月・りさこ）', async () => {
    // 8月はりさこが受け取る側（精算額 −4,930）。まだ［受け取った］を押していない形に戻す
    await openExpensesTab('sep-open', 'risako', async (repository) => {
      await repository.setCheck('2026-08', 'b', false)
    })
    expect(screen.getByRole('button', { name: /8月: 共用から 4,930円 受け取る/ })).toBeInTheDocument()
    // 符号は落とす（「− 4,930円」にしない）
    expect(screen.queryByText(/-4,930/)).not.toBeInTheDocument()
  })
})

describe('S-04 月を選ぶ', () => {
  it('12か月のマスが出て、選べない月はボタンにしない', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: '2026年9月（月を選ぶ）' }))
    const sheet = screen.getByRole('dialog', { name: '月を選ぶ' })
    // 家計を作った年・今年がどちらも 2026 なので、年の矢印は出ない
    expect(within(sheet).queryByRole('button', { name: '前の年' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '次の年' })).not.toBeInTheDocument()
    // 8月・9月だけが選べる（1〜7月は家計を作る前、10〜12月は今月より先）
    expect(within(sheet).getByRole('button', { name: '2026年8月' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '2026年9月 今月' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '2026年7月' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '2026年10月' })).not.toBeInTheDocument()
    // いま見ている月は aria-current
    expect(within(sheet).getByRole('button', { name: '2026年9月 今月' })).toHaveAttribute('aria-current', 'true')
  })

  it('マスを押すと、シートを閉じてその月を見る', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: '2026年9月（月を選ぶ）' }))
    await userEvent.click(screen.getByRole('button', { name: '2026年8月' }))
    expect(screen.queryByRole('dialog', { name: '月を選ぶ' })).not.toBeInTheDocument()
    expect(screen.getByText('8月のふたりの支出')).toBeInTheDocument()
  })
})

describe('S-13 内訳', () => {
  it('多い順に出て、金額待ちの注記が付く（§4 S-13 の 9/22 の例）', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: '多いのは 住まい・食料品・外食' }))
    const sheet = screen.getByRole('dialog', { name: '9月の内訳' })
    expect(within(sheet).getByText('92,980')).toBeInTheDocument()
    expect(within(sheet).getByText('31,210')).toBeInTheDocument()
    expect(within(sheet).getByText('20,850')).toBeInTheDocument()
    expect(within(sheet).getByText('金額待ち 2件は入っていません')).toBeInTheDocument()
  })
})

describe('S-14 記録を見る・直す', () => {
  it('`own`（自分の記録）は直せる（注記・カテゴリ・削除・保存）', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /食料品 コンビニ 1,280/ }))
    const sheet = screen.getByRole('dialog', { name: '記録（食料品 1,280円）' })
    expect(within(sheet).getByText('記録 9/22 12:03')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'カテゴリを変える（いまは食料品）' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'メモ: コンビニ' })).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: '今日' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'まさと' })).toBeChecked()
    expect(within(sheet).getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('`partner`（相手の記録）は見るだけ（§2.2 の権限）', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /外食 ランチ 新着 4,850/ }))
    const sheet = screen.getByRole('dialog', { name: '記録（外食 4,850円）' })
    expect(within(sheet).getByText('直せるのは記録した人だけです')).toBeInTheDocument()
    expect(within(sheet).getByText('共用で払った')).toBeInTheDocument()
    expect(within(sheet).getByText('記録: りさこ 9/20 13:40')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('`fixed`（毎月の支払いの行）は金額と払った人だけ直せる', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /毎月の支払い/ }))
    await userEvent.click(screen.getByRole('button', { name: /住まい 家賃 85,000/ }))
    const sheet = screen.getByRole('dialog', { name: '記録（住まい 85,000円）' })
    expect(within(sheet).getByText('毎月の支払いから・変わるのは今月の分だけ')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '今月はなし' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '保存' })).toBeInTheDocument()
    // カテゴリはひな形のまま（ここでは変えない）
    expect(within(sheet).queryByRole('button', { name: /カテゴリを変える/ })).not.toBeInTheDocument()
  })

  it('`locked`（精算済みの月の記録）は見るだけで、［精算を開く］がある', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: '前の月' }))
    await userEvent.click(screen.getByRole('button', { name: /食料品 コンビニ 1,280/ }))
    const sheet = screen.getByRole('dialog', { name: '記録（食料品 1,280円）' })
    expect(within(sheet).getByText('8月は精算済みです（直すには精算をやり直します）')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '精算を開く' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('保存すると、その行に色が付く（§7.5 の 1.2秒のハイライト）', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /食料品 コンビニ 1,280/ }))
    for (const key of ['2', '0', '0', '0']) {
      await userEvent.click(screen.getByRole('button', { name: key }))
    }
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    const row = await screen.findByRole('button', { name: /食料品 コンビニ 2,000/ })
    expect(getComputedStyle(row).animation).toContain('rowHighlight')
    // ほかの行には付かない
    const other = screen.getByRole('button', { name: /外食 ランチ 新着 4,850/ })
    expect(getComputedStyle(other).animation).not.toContain('rowHighlight')
  })

  it('削除するとトースト「削除しました」が出て、一覧から消える', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /食料品 コンビニ 1,280/ }))
    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /食料品 コンビニ 1,280/ })).not.toBeInTheDocument()
  })
})

describe('S-15 金額を入れる', () => {
  it('見出し・払う人・先月の金額・来月に回す・今月はなしが出る', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /ガス代（9月分）.*金額を入れる/ }))
    const sheet = screen.getByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })
    expect(within(sheet).getByText('まさとが払う')).toBeInTheDocument()
    expect(within(sheet).getByText('先月 4,380')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '来月に回す' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '今月はなし' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '入れる' })).toBeInTheDocument()
    // 支出から開いたときは「1 / 2」を出さない
    expect(within(sheet).queryByText('1 / 2')).not.toBeInTheDocument()
  })

  it('0 のまま押すと「金額を入れてください」（記録しない）', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /ガス代（9月分）.*金額を入れる/ }))
    await userEvent.click(screen.getByRole('button', { name: '入れる' }))
    expect(screen.getByRole('alert')).toHaveTextContent('金額を入れてください')
    expect(screen.getByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })).toBeInTheDocument()
  })

  it('金額を入れると合計に入り、トーストが出る', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /ガス代（9月分）.*金額を入れる/ }))
    for (const key of ['6', '2', '0', '0']) {
      await userEvent.click(screen.getByRole('button', { name: key }))
    }
    await userEvent.click(screen.getByRole('button', { name: '入れる' }))
    expect(await screen.findByText('ガス代 6,200円を入れました')).toBeInTheDocument()
    // 180,670 ＋ 6,200
    expect(await screen.findByText('¥186,870')).toBeInTheDocument()
    expect(screen.getByText('＋ 金額待ち 1件')).toBeInTheDocument()
  })

  it('来月に回すと、その行が翌月へ移る', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /電気代（9月分）.*金額を入れる/ }))
    await userEvent.click(screen.getByRole('button', { name: '来月に回す' }))
    expect(await screen.findByText('電気代を10月に回しました')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /電気代（9月分）.*金額を入れる/ })).not.toBeInTheDocument()
  })

  it('金額を入れたまま背景をタップすると、元に戻すで同じ金額のまま開き直せる（§3.7）', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /ガス代（9月分）.*金額を入れる/ }))
    for (const key of ['6', '2', '0', '0']) {
      await userEvent.click(screen.getByRole('button', { name: key }))
    }
    const sheet = screen.getByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })
    expect(shownAmount(sheet)).toBe('¥6,200')

    // 背景幕（シートのすぐ前にある）をタップして閉じる
    const backdrop = sheet.previousElementSibling
    if (!(backdrop instanceof HTMLElement)) throw new Error('背景幕が見つかりません')
    await userEvent.click(backdrop)
    expect(screen.queryByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })).not.toBeInTheDocument()
    expect(await screen.findByText('入力をやめました')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    const again = await screen.findByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })
    expect(shownAmount(again)).toBe('¥6,200')
  })

  it('今月はなしにすると、金額待ちから外れる', async () => {
    await openExpensesTab()
    await userEvent.click(screen.getByRole('button', { name: /ガス代（9月分）.*金額を入れる/ }))
    await userEvent.click(screen.getByRole('button', { name: '今月はなし' }))
    expect(await screen.findByText('ガス代を今月はなしにしました')).toBeInTheDocument()
    expect(screen.getByText('＋ 金額待ち 1件')).toBeInTheDocument()
  })
})
