/**
 * S-20 の押せないとき（§1.4 その場の1行）と、S-21 出す額・S-04 月を選ぶ。
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setRepository } from '@/data'
import { SettleScreen } from '../settle-screen'
import { renderWithProviders, signIn } from './helpers'

afterEach(() => {
  setRepository(null)
  restoreOnline()
})

let onlineDescriptor: PropertyDescriptor | undefined
function goOffline(): void {
  onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
}
function restoreOnline(): void {
  if (onlineDescriptor) Object.defineProperty(window.navigator, 'onLine', onlineDescriptor)
  else Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  onlineDescriptor = undefined
}

const waitForStatus = (text: string | RegExp) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument())

describe('S-20 押したのに進めないとき（§1.4）', () => {
  it('前の月が締め待ちなら「先に8月を精算してください」（§6.4）', async () => {
    const repository = await signIn('sep-ready')
    await repository.reopenMonth('2026-08')
    renderWithProviders(<SettleScreen />)
    // 8月をやり直したので、既定の月は8月になる。9月へ送ってから押す
    await waitForStatus('やり直し中・済んだ分を引いています')
    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    expect(screen.getByText('精算できます')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'この金額で精算' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('先に8月を精算してください'))
    expect(screen.getByText('精算できます')).toBeInTheDocument()
  })

  it('相手が先に押していたら「9月はもう精算中です」（§6.3 ケースJ）', async () => {
    const repository = await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')
    // 2台目（相手）が先に押した
    await repository.confirmMonth('2026-09', null)

    await userEvent.click(screen.getByRole('button', { name: 'この金額で精算' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('9月はもう精算中です'))
    // 画面は精算中に更新する
    expect(screen.getByText('精算中')).toBeInTheDocument()
  })

  it('オフラインでは「オンラインで直せます」を主ボタンの直下に出す（§3.6）', async () => {
    await signIn('sep-ready')
    goOffline()
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')
    expect(screen.getByText('オフライン（表示は最後に取得した内容）')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'この金額で精算' }))

    expect(screen.getByRole('alert')).toHaveTextContent('オンラインで直せます')
    expect(screen.getByText('精算できます')).toBeInTheDocument()
  })
})

describe('S-20 `undecided`（10月）', () => {
  it('先月の手取りで出した額を出し、［この額で決める］で決められる（§4 S-20 `undecided`）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: '次の月' }))

    expect(screen.getByText('10月の出す額がまだです')).toBeInTheDocument()
    expect(screen.getByText('¥120,000')).toBeInTheDocument()
    expect(screen.getByText('¥88,000')).toBeInTheDocument()
    expect(screen.getAllByText('先月の手取りで')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'この額で決める' }))
    await waitFor(() => expect(screen.getByText('10月の出す額を決めました')).toBeInTheDocument())
  })
})

describe('S-21 出す額', () => {
  it('手取りと割合から出す額を出し、［決める］で保存する（§4 S-21）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')
    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    await userEvent.click(screen.getByRole('button', { name: '手取りを変える' }))

    const sheet = await screen.findByRole('dialog', { name: '10月の出す額' })
    expect(within(sheet).getByRole('button', { name: 'まさとの手取り 300,000円' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'りさこの手取り 220,000円' })).toBeInTheDocument()
    expect(within(sheet).getAllByText('× 40% ＝')).toHaveLength(2)

    await userEvent.click(within(sheet).getByRole('button', { name: '決める' }))
    await waitFor(() => expect(screen.getByText('10月の出す額を決めました')).toBeInTheDocument())
  })

  it('欄が空のまま［決める］を押すと「手取りを入れてください」（§1.4）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')
    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    await userEvent.click(screen.getByRole('button', { name: '手取りを変える' }))

    const sheet = await screen.findByRole('dialog', { name: '10月の出す額' })
    // 開いたときの入力先は自分の欄。最初のキー（⌫）で今の値を置き換える
    await userEvent.click(within(sheet).getByRole('button', { name: '1文字消す' }))
    expect(within(sheet).getByRole('button', { name: 'まさとの手取り 未入力' })).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: '決める' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('手取りを入れてください')

    // 入れ直せば決められる
    for (const key of ['3', '0', '0', '0', '0', '0']) {
      await userEvent.click(within(sheet).getByRole('button', { name: key }))
    }
    expect(within(sheet).getByRole('button', { name: 'まさとの手取り 300,000円' })).toBeInTheDocument()
  })
})

describe('S-04 月を選ぶ（精算タブから）', () => {
  it('年月を押すとマスが開き、選ぶとその月を見る（§3.4・§2.3 E6）', async () => {
    await signIn('sep-ready')
    renderWithProviders(<SettleScreen />)
    await waitForStatus('精算できます')

    await userEvent.click(screen.getByRole('button', { name: '2026年9月（月を選ぶ）' }))
    const sheet = await screen.findByRole('dialog', { name: '月を選ぶ' })
    expect(within(sheet).getByRole('button', { name: '2026年10月 今月' })).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: '2026年8月' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '2026年8月（月を選ぶ）' })).toBeInTheDocument()
    // 8月は精算済み（§9.7）
    expect(screen.getByText(/精算済み/)).toBeInTheDocument()
  })
})
