/**
 * オンラインかどうか（§3.6）。
 * オフラインのあいだは、記録タブの見出しの行のすぐ下にオフラインの行を出し、
 * 記録のトーストを「…はつながったら送ります」にする。
 */
import { useEffect, useState } from 'react'

const read = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export function useOnline(): boolean {
  const [online, setOnline] = useState(read)

  useEffect(() => {
    const update = () => setOnline(read())
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
