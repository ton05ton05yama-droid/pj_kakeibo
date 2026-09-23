import { Box } from '@chakra-ui/react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Toast } from '@/components'

/** トーストは6秒で消える（§3.7） */
const TOAST_MS = 6000

export type ToastOptions = {
  /** 文言は §1.4 の表にあるものだけ */
  text: string
  /** 「元に戻す」。パスワードの変更とログアウトでは置かない */
  onUndo?: () => void
  /** S-20 のように下端に固定した部分があるときの持ち上げ（その部分の高さ） */
  offsetBottom?: string
  /** タブバーの無い画面（S-01・S-02）から出すときは false（既定は true） */
  withTabBar?: boolean
}

export type ToastApi = {
  /** 一度に1つ。新しいものを出すと前のものは消える */
  show: (options: ToastOptions) => void
  /** シートを開いたときなどに消す（§3.7） */
  hide: () => void
}

const ToastContext = createContext<ToastApi>({ show: () => {}, hide: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

/**
 * トーストの出し入れ（§3.7）。
 *
 * `role="status"` の入れ物は**いつも置いたまま**にして、中身だけを入れ替える。
 * 入れ物ごと出し入れすると、画面を描き直すたびに読み上げが起きてしまうため
 * （「表示中は中身を作り直さない」§3.7）。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastOptions | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setCurrent(null)
  }, [])

  const show = useCallback((options: ToastOptions) => {
    window.clearTimeout(timer.current)
    setCurrent(options)
    timer.current = window.setTimeout(() => setCurrent(null), TOAST_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const undo = current?.onUndo
  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {/* 入れ物はアンマウントしない（中身が空のあいだは何も出ない） */}
      <Box role='status' aria-live='polite'>
        {current ? (
          <Toast
            text={current.text}
            offsetBottom={current.offsetBottom}
            withTabBar={current.withTabBar}
            onUndo={
              undo
                ? () => {
                    hide()
                    undo()
                  }
                : undefined
            }
          />
        ) : null}
      </Box>
    </ToastContext.Provider>
  )
}
