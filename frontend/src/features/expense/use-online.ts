import { useEffect, useState } from 'react'

/**
 * つながっているか（§3.6）。
 * オフラインのときは上部バーのすぐ下に1行出し、記録の追加以外の書き込みは
 * その場の1行「オンラインで直せます」で止める。
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
