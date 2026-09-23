/**
 * つながっているか（§3.6）。
 * オフラインのときは、精算の操作を保留せずその場で断る（§3.6・platform.md §6.5）。
 *
 * 共通に上げたい部品（いまは精算タブの中だけで使う）。
 */
import { useEffect, useState } from 'react'

const read = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export function useOnline(): boolean {
  const [online, setOnline] = useState(read)

  useEffect(() => {
    const update = () => setOnline(read())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    update()
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
