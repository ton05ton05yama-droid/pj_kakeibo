import { useEffect, useState } from 'react'

/**
 * オンラインかどうか（§3.6）。
 *
 * 設定の書き込み（記録の追加以外）は保留しないので、オフラインのあいだは押しても何もせず、
 * その場の1行「オンラインで直せます」を出す。
 *
 * 共通に上げたい部品（いまは設定タブの中に置いてある）。
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    try {
      return navigator.onLine !== false
    } catch {
      // 取れない環境ではオンライン扱い（書き込みを止めない）
      return true
    }
  })

  useEffect(() => {
    const goOnline = (): void => setOnline(true)
    const goOffline = (): void => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
