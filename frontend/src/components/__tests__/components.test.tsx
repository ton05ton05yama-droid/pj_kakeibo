import { ChakraProvider } from '@chakra-ui/react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '@/app/providers/toast-provider'
import { BottomSheet, DatePickerOverlay, Keypad, Segmented, TabBar, tabs } from '@/components'
import { system } from '@/theme'

function wrap(ui: ReactNode) {
  return render(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

describe('日付の欄（§4 S-12 の要素5）', () => {
  afterEach(() => {
    // jsdom には showPicker が無いので、テストの中だけ足す
    Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker')
  })

  it('欄を直接押すと日付選択を開く。断られたら focus に任せる', async () => {
    const showPicker = vi.fn(() => {
      throw new DOMException('not allowed', 'NotAllowedError')
    })
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { value: showPicker, configurable: true })
    const onOpen = vi.fn()
    const onChange = vi.fn()
    const { container } = wrap(
      <DatePickerOverlay
        value=''
        min='2026-08-01'
        max='2026-09-22'
        onOpen={onOpen}
        onChange={onChange}
        onReset={() => {}}
      />
    )
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    await userEvent.click(input)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(showPicker).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: '2026-09-05' } })
    expect(onChange).toHaveBeenCalledWith('2026-09-05')
  })

  it('範囲の外の日（今日より先・家計を作る前）は受けない', () => {
    const onChange = vi.fn()
    const { container } = wrap(
      <DatePickerOverlay value='' min='2026-08-01' max='2026-09-22' onChange={onChange} onReset={() => {}} />
    )
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-10-03' } })
    fireEvent.change(input, { target: { value: '2026-07-31' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '2026-09-22' } })
    expect(onChange).toHaveBeenCalledWith('2026-09-22')
  })

  it('value 属性は書かず、中身だけ入れる（iPhone の「リセット」が value 属性の日に戻すため）', () => {
    const { container, rerender } = wrap(
      <DatePickerOverlay value='2026-09-10' min='2026-08-01' max='2026-09-22' onChange={() => {}} onReset={() => {}} />
    )
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(input.value).toBe('2026-09-10')
    expect(input.getAttribute('value')).toBeNull()
    rerender(
      <ChakraProvider value={system}>
        <DatePickerOverlay
          value='2026-09-19'
          min='2026-08-01'
          max='2026-09-22'
          onChange={() => {}}
          onReset={() => {}}
        />
      </ChakraProvider>
    )
    expect(input.value).toBe('2026-09-19')
    expect(input.getAttribute('value')).toBeNull()
  })

  it('「リセット」で欄が空になったら onReset を呼ぶ（§12.1 Q28）', () => {
    const onChange = vi.fn()
    const onReset = vi.fn()
    const { container } = wrap(
      <DatePickerOverlay value='2026-09-10' min='2026-08-01' max='2026-09-22' onChange={onChange} onReset={onReset} />
    )
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('セグメント（§7.5）', () => {
  it('選択中の項目が分かり、押すと選び直せる', async () => {
    const onChange = vi.fn()
    wrap(
      <Segmented
        label='払った人'
        value='a'
        onChange={onChange}
        items={[
          { value: 'a', label: 'まさと' },
          { value: 'b', label: 'りさこ' },
          { value: 'joint', label: '共用' },
        ]}
      />
    )
    expect(screen.getByRole('radiogroup', { name: '払った人' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'まさと' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '共用' }))
    expect(onChange).toHaveBeenCalledWith('joint')
  })
})

describe('テンキー（§7.5）', () => {
  it('各キーに読み上げ名がある（「ゼロゼロ」「1文字消す」）', async () => {
    const onKey = vi.fn()
    wrap(<Keypad onKey={onKey} />)
    expect(screen.getByRole('button', { name: 'ゼロゼロ' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '1文字消す' }))
    expect(onKey).toHaveBeenCalledWith('backspace')
  })
})

describe('ボトムシート（§4.0.3）', () => {
  it('読み上げ名はシートごとの名前で、つまみは「閉じる」', () => {
    wrap(
      <BottomSheet open label='いくら？（食料品）' onClose={() => {}}>
        <p>中身</p>
      </BottomSheet>
    )
    expect(screen.getByRole('dialog', { name: 'いくら？（食料品）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })

  it('つまみ・背景のタップ・Esc で閉じる', async () => {
    const onClose = vi.fn()
    wrap(
      <BottomSheet open label='月を選ぶ' onClose={onClose}>
        <p>中身</p>
      </BottomSheet>
    )
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

/* ------------------------------------------------------------------ *
 * トースト（§3.7）
 * ------------------------------------------------------------------ */

/** トーストを出すだけのボタン（テスト用の踏み台） */
function ShowToast({ text }: { text: string }) {
  const toast = useToast()
  return (
    <button type='button' onClick={() => toast.show({ text })}>
      {`出す:${text}`}
    </button>
  )
}

function wrapToast() {
  return wrap(
    <ToastProvider>
      <ShowToast text='削除しました' />
      <ShowToast text='直しました' />
    </ToastProvider>
  )
}

describe('トースト（§3.7）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('一度に1つ（新しいものを出すと前のものは消える）', async () => {
    wrapToast()
    await userEvent.click(screen.getByRole('button', { name: '出す:削除しました' }))
    expect(screen.getByText('削除しました')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '出す:直しました' }))
    expect(screen.getByText('直しました')).toBeInTheDocument()
    expect(screen.queryByText('削除しました')).not.toBeInTheDocument()
  })

  it('6秒で消える', () => {
    // 時計を止めて確かめる（userEvent は偽の時計と相性が悪いので fireEvent を使う）
    vi.useFakeTimers()
    wrapToast()
    fireEvent.click(screen.getByRole('button', { name: '出す:削除しました' }))
    expect(screen.getByText('削除しました')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5999)
    })
    expect(screen.getByText('削除しました')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('削除しました')).not.toBeInTheDocument()
  })

  it('読み上げの入れ物は常時あり、同じ文言なら要素を作り直さない', async () => {
    wrapToast()
    // 何も出ていないあいだも入れ物はある（出し入れのたびに読み上げが起きないようにする）
    const box = screen.getByRole('status')
    expect(box).toHaveAttribute('aria-live', 'polite')

    await userEvent.click(screen.getByRole('button', { name: '出す:削除しました' }))
    expect(screen.getByRole('status')).toBe(box)
    const shown = within(box).getByText('削除しました')

    // 同じ文言をもう一度出しても、要素は作り直さない
    await userEvent.click(screen.getByRole('button', { name: '出す:削除しました' }))
    expect(within(box).getByText('削除しました')).toBe(shown)
    expect(screen.getByRole('status')).toBe(box)
  })
})

/* ------------------------------------------------------------------ *
 * タブバー（§3.1・§3.2）
 * ------------------------------------------------------------------ */

function wrapTabBar(options: { path?: string; showSettleDot?: boolean } = {}) {
  return wrap(
    <MemoryRouter initialEntries={[options.path ?? '/settle']}>
      <TabBar showSettleDot={options.showSettleDot ?? false} />
    </MemoryRouter>
  )
}

/** 赤い点の読み上げ（§4.0.3 の表） */
const DOT_LABEL = '（やることがあります）'

describe('タブバー（§3.1・§3.2）', () => {
  it('4つで、並びは 記録 → 支出 → 精算 → 設定', () => {
    wrapTabBar()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/record', '/expenses', '/settle', '/settings'])
    expect(tabs.map((tab) => tab.label)).toEqual(['記録', '支出', '精算', '設定'])
    for (const [index, label] of ['記録', '支出', '精算', '設定'].entries()) {
      const link = links[index]
      expect(link).toBeDefined()
      if (link) expect(within(link).getByText(label)).toBeInTheDocument()
    }
  })

  it('いま開いているタブに aria-current が付く', () => {
    wrapTabBar({ path: '/expenses' })
    const links = screen.getAllByRole('link')
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]?.getAttribute('href')).toBe('/expenses')
  })

  it('赤い点は精算タブにだけ出る（件数は出さない）', () => {
    wrapTabBar({ showSettleDot: true })
    expect(screen.getByText(DOT_LABEL)).toBeInTheDocument()
    const settle = screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/settle')
    expect(settle).toBeDefined()
    if (settle) expect(within(settle).getByText(DOT_LABEL)).toBeInTheDocument()
  })

  it('赤い点を出さないときは読み上げの文字も出ない', () => {
    wrapTabBar({ showSettleDot: false })
    expect(screen.queryByText(DOT_LABEL)).not.toBeInTheDocument()
  })
})
