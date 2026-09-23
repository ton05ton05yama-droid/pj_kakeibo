/**
 * S-20 精算（月）の表示と操作（仕様書 §4 S-20・§6・§9 の見本データ）。
 * 金額は §9.6 の検算と同じ数字を使う。
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '@/app/app'
import { AuthProvider } from '@/app/providers/auth-provider'
import { setRepository } from '@/data'
import { SettleScreen } from '../settle-screen'
import { renderWithProviders, signIn } from './helpers'

afterEach(() => setRepository(null))

/** 状態の1行が出るまで待つ（最初の読み込みが終わった合図） */
const waitForStatus = (text: string | RegExp) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument())

describe('S-20 `estimate`（月の途中・9/22）', () => {
  it('見込みの1行・2人のカード・共用の行・金額待ちの注記を出す（§9.6 V2）', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    // 数字の無い式は状態の1行に続けて出す（§6.1-5）
    expect(screen.getByText('動かす額 ＝ 出す額 − もう払った分')).toBeInTheDocument()
    expect(screen.getByText('¥90,840')).toBeInTheDocument()
    expect(screen.getByText('¥69,530')).toBeInTheDocument()
    expect(screen.getByText(/共用に/)).toHaveTextContent('共用に 27,330円 残る見込み')
    expect(screen.getByText('金額待ち 2件を含みません')).toBeInTheDocument()
    // 向きは動詞で示し、符号は出さない（§6.1-3・4）
    expect(screen.getAllByText('共用へ入れる')).toHaveLength(2)
    expect(screen.queryByText(/−90,840|-90,840/)).not.toBeInTheDocument()
  })

  it('チェックのボタンは出さず、下端は文字ボタン［この月を精算する］だけ（§4 S-20 `estimate`）', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    expect(screen.getByRole('button', { name: 'この月を精算する' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'この金額で精算' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '入れた' })).not.toBeInTheDocument()
  })

  it('［この月を精算する］を押すと、月の途中でも `prep` になる（§6.3 ケースM）', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    await userEvent.click(screen.getByRole('button', { name: 'この月を精算する' }))

    expect(screen.getByText('精算のまえに あと2件')).toBeInTheDocument()
    // 並びは 払う人が個人の行（ガス代 = まさと）→ 共用の行（電気代）
    expect(screen.getAllByRole('listitem').map((node) => node.textContent)).toEqual([
      '・ガス代（9月分）の金額',
      '・電気代（9月分）の金額',
    ])
    expect(screen.getByText('金額が決まると、動かす額が出ます')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '金額を入れる' })).toBeInTheDocument()
    // 動かす額は出さない（決まっていない数字で振り込ませない。§6.1-9）
    expect(screen.queryByText('¥90,840')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'この月を精算する' })).not.toBeInTheDocument()
  })
})

describe('S-20 `ready` → `transfer`（10/1）', () => {
  it('精算できます・確定の金額を出す（§6.3 ケースA）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.getByText('¥82,490')).toBeInTheDocument()
    expect(screen.getByText('¥65,930')).toBeInTheDocument()
    expect(screen.getByText(/共用に/)).toHaveTextContent('共用に 1,870円 残ります')
    expect(screen.getByRole('button', { name: 'この金額で精算' })).toBeInTheDocument()
  })

  it('［この金額で精算］で精算中になり、トーストで元に戻せる（§1.4）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: 'この金額で精算' }))

    await waitFor(() => expect(screen.getByText('9月を精算中にしました')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('精算中')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '精算をやり直す' })).toBeInTheDocument()
  })
})

describe('S-20 `transfer`（精算中）', () => {
  it('自分のカードのボタンだけが押せる形で、2人ぶん出る（§4 S-20 `transfer`）', async () => {
    await signIn('sep-transfer-half', 'risako')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算中')

    // まさとは押し済み（「✓ 入れた」。読み上げ名に日付と押した人が入る）
    expect(screen.getByRole('button', { name: '入れた 10/2 まさと（押すと外れる）' })).toBeInTheDocument()
    // りさこ（自分）はこれから押す
    expect(screen.getByRole('button', { name: '入れた' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('チェックを押すと記録され、そろうと精算済みになる（§1.4 のトースト）', async () => {
    await signIn('sep-transfer-half', 'risako')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算中')

    await userEvent.click(screen.getByRole('button', { name: '入れた' }))

    await waitFor(() => expect(screen.getByText('9月の精算がおわりました')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/精算済み/)).toBeInTheDocument())
  })

  it('権限による差は「（自分）」の位置だけで、並びは2台とも まさと → りさこ（§4 S-20）', async () => {
    await signIn('sep-transfer', 'risako')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算中')

    const cards = screen.getAllByRole('button', { name: /の内訳$/ })
    expect(cards.map((node) => node.getAttribute('aria-label'))).toEqual(['まさとの内訳', 'りさこの内訳'])
    expect(screen.getByText('りさこ（自分）')).toBeInTheDocument()
    expect(screen.getByText('まさと')).toBeInTheDocument()
  })
})

describe('S-20 `redo`（やり直し中・10/3）', () => {
  it('残りと向きだけを出し、数字の無い式は出さない（§6.3 ケースI-1）', async () => {
    await signIn('sep-redo')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('やり直し中・済んだ分を引いています')

    expect(screen.getByText('共用から受け取る')).toBeInTheDocument()
    expect(screen.getByText('あと')).toBeInTheDocument()
    expect(screen.getByText('¥3,300')).toBeInTheDocument()
    expect(screen.getByText('済み（¥65,930 入れた）')).toBeInTheDocument()
    expect(screen.getByText(/共用の残高から/)).toHaveTextContent('共用の残高から 1,430円 出ます')
    expect(screen.queryByText('動かす額 ＝ 出す額 − もう払った分')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この金額で精算' })).toBeInTheDocument()
  })
})

describe('S-20 「計算を見る」（§6.1-5）', () => {
  it('開くまで数字の入った式を出さない', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    expect(screen.queryByText(/出す額 120,000 − もう払った分 37,510/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '計算を見る' }))
    expect(screen.getByText('出す額 120,000 − もう払った分 37,510')).toBeInTheDocument()
    expect(screen.getByText('出す額 88,000 − もう払った分 22,070')).toBeInTheDocument()
    expect(screen.getByText('出す額の合計 208,000 − 支出の合計 206,130')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '手取りを変える' })).toBeInTheDocument()
  })
})

describe('S-22 1人ぶんの内訳', () => {
  it('カードを押すと内訳が開き、式と結果の行を出す（§4 S-22）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: 'まさとの内訳' }))

    const sheet = await screen.findByRole('dialog', { name: 'まさとの内訳' })
    expect(within(sheet).getByText('出す額')).toBeInTheDocument()
    expect(within(sheet).getByText('120,000')).toBeInTheDocument()
    expect(within(sheet).getByText('手取り 300,000 × 40%')).toBeInTheDocument()
    expect(within(sheet).getByText('− 37,510')).toBeInTheDocument()
    expect(within(sheet).getByText('¥82,490')).toBeInTheDocument()
    expect(within(sheet).getByText('もう払った分（8件）')).toBeInTheDocument()
    expect(within(sheet).getByText('共用で払ったものは入りません')).toBeInTheDocument()
  })
})

describe('S-20 ［この月を精算する］は画面の状態だけ（§6.3 ケースM）', () => {
  it('月を切り替えると見込みに戻る（保存しない）', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    await userEvent.click(screen.getByRole('button', { name: 'この月を精算する' }))
    expect(screen.getByText('精算のまえに あと2件')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '前の月' }))
    expect(screen.getByText(/精算済み/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    expect(screen.getByText('見込み・9/22時点')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この月を精算する' })).toBeInTheDocument()
  })
})

describe('S-22 見込みのとき（§4 S-22）', () => {
  it('見出しに「見込み」、金額待ちの行は入っていないと添える', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    await userEvent.click(screen.getByRole('button', { name: 'まさとの内訳' }))

    const sheet = await screen.findByRole('dialog', { name: 'まさとの内訳' })
    expect(within(sheet).getByText('見込み')).toBeInTheDocument()
    expect(within(sheet).getByText('ガス代（9月分）は金額待ちで入っていません')).toBeInTheDocument()
    expect(within(sheet).getByText('¥90,840')).toBeInTheDocument()
  })
})

describe('S-20 支出タブから月を渡して開く', () => {
  it("state: { month: '2026-08' } で /settle を開くと8月が出る", async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />, [{ pathname: '/settle', state: { month: '2026-08' } }])
    await waitForStatus(/精算済み/)

    expect(screen.getByRole('button', { name: '2026年8月（月を選ぶ）' })).toBeInTheDocument()
    // 既定の月（9月）は開かない
    expect(screen.queryByText('見込み・9/22時点')).not.toBeInTheDocument()
  })
})

describe('S-04 月を選ぶ（精算タブから開く）', () => {
  it('支出タブと同じ共通部品が開き、S-04 の目印と 12 か月のマスが出る（§4 S-04）', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    await userEvent.click(screen.getByRole('button', { name: '2026年9月（月を選ぶ）' }))

    const sheet = screen.getByRole('dialog', { name: '月を選ぶ' })
    // 画面の目印（共通部品が持っている）
    expect(sheet.querySelector('[data-screen="S-04"]')).toHaveAttribute('data-state', 'normal')
    // 家計を作った年・今年がどちらも 2026 なので、年の矢印は出ない（P7）
    expect(within(sheet).queryByRole('button', { name: '前の年' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '次の年' })).not.toBeInTheDocument()
    // 8月・9月だけが選べる。いま見ている月は aria-current
    expect(within(sheet).getByRole('button', { name: '2026年8月' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '2026年9月 今月' })).toHaveAttribute('aria-current', 'true')
    expect(within(sheet).queryByRole('button', { name: '2026年7月' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '2026年10月' })).not.toBeInTheDocument()
  })

  it('マスを押すと、シートを閉じて精算タブでその月を見る', async () => {
    await signIn('sep-open')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('見込み・9/22時点')

    await userEvent.click(screen.getByRole('button', { name: '2026年9月（月を選ぶ）' }))
    await userEvent.click(screen.getByRole('button', { name: '2026年8月' }))

    expect(screen.queryByRole('dialog', { name: '月を選ぶ' })).not.toBeInTheDocument()
    expect(screen.getByText(/精算済み/)).toBeInTheDocument()
  })
})

describe('S-20 `prep` → ［金額を入れる］（§2.3 E1・§4 S-15 `action`）', () => {
  /**
   * S-15 をつないでいるのはアプリ側（`app/app.tsx`）なので、ここだけ `App` ごと出す。
   * 見本データは `sep-open`（2026-09-22。金額待ちが ガス代・電気代 の2件）。
   */
  async function openPrep(): Promise<void> {
    await signIn('sep-open')
    renderWithProviders(
      <AuthProvider>
        <App />
      </AuthProvider>
    )
    await waitForStatus('見込み・9/22時点')
    await userEvent.click(screen.getByRole('button', { name: 'この月を精算する' }))
    await userEvent.click(screen.getByRole('button', { name: '金額を入れる' }))
  }

  /** 2件とも金額を入れる（ガス代 6,200 → 電気代 9,000。§9.6 V3 の確定値になる） */
  async function fillBoth(): Promise<void> {
    const first = await screen.findByRole('dialog', { name: '金額を入れる（ガス代（9月分））' })
    await userEvent.click(within(first).getByRole('button', { name: '6' }))
    await userEvent.click(within(first).getByRole('button', { name: '2' }))
    await userEvent.click(within(first).getByRole('button', { name: 'ゼロゼロ' }))
    await userEvent.click(within(first).getByRole('button', { name: '次へ' }))

    const second = await screen.findByRole('dialog', { name: '金額を入れる（電気代（9月分））' })
    await userEvent.click(within(second).getByRole('button', { name: '9' }))
    await userEvent.click(within(second).getByRole('button', { name: 'ゼロゼロ' }))
    await userEvent.click(within(second).getByRole('button', { name: '0' }))
    await userEvent.click(within(second).getByRole('button', { name: '入れる' }))
  }

  it('2件片付けると S-20 が `ready` になり、トーストは1つだけ出る（§3.7）', async () => {
    await openPrep()
    await fillBoth()

    // 最後の操作のぶんだけ（途中の［次へ］では出さない）
    expect(await screen.findByText('電気代 9,000円を入れました')).toBeInTheDocument()
    expect(screen.queryByText('ガス代 6,200円を入れました')).not.toBeInTheDocument()
    expect(screen.getAllByText(/円を入れました$/)).toHaveLength(1)
    // シートは閉じて、押した元の S-20 が出ている
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitForStatus('精算できます')
    expect(screen.getByRole('button', { name: 'この金額で精算' })).toBeInTheDocument()
  })

  it('月の途中の `prep` から片付け終わっても `estimate` に戻らない（タブを移さない。§6.3 ケースM）', async () => {
    await openPrep()
    // シートは精算タブの上に重なるだけで、支出タブへは移らない
    expect(screen.queryByText('9月のふたりの支出')).not.toBeInTheDocument()

    await fillBoth()

    await waitForStatus('精算できます')
    // ［この月を精算する］は押したままなので、見込みには戻らない
    expect(screen.queryByText('見込み・9/22時点')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'この月を精算する' })).not.toBeInTheDocument()
    expect(screen.queryByText('9月のふたりの支出')).not.toBeInTheDocument()
  })
})
