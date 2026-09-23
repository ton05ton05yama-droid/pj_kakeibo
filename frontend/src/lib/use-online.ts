import { useEffect, useState } from 'react'

/**
 * つながっているか（§3.6）。
 *
 * オフラインのあいだに端末へ保留するのは **記録の追加だけ**（`data/pending.ts`）。
 * それ以外の書き込み（直す・消す・金額待ち・出す額・精算の操作・設定）は保留せず、
 * その場の1行「オンラインで直せます」で止める（05 §6.5）。
 *
 * 画面ごとの出し方は各タブが決める（記録タブは見出しの下、支出・精算タブは上部バーの下）。
 * ここが持つのは「いま つながっているか」だけ。
 */

/** `navigator` が読めない環境ではオンライン扱いにする（読めないことを理由に書き込みを止めない） */
const read = (): boolean => {
  try {
    return navigator.onLine !== false
  } catch {
    return true
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(read)

  useEffect(() => {
    // 最初の描画とマウントのあいだに変わっていることがあるので、ここでも読み直す
    setOnline(read())
    // 出来事は `navigator` を読み直さずそのまま受ける（読めない環境でも切り替わる）
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
