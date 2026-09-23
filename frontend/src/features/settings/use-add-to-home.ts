import { useEffect, useState } from 'react'

/** ホーム画面から開いている（`display-mode: standalone`）か。S-03 の入口を出すかの判定に使う */
function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    // matchMedia が無くてもよい
  }
  // iOS Safari だけが持つ古い印
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return legacy === true
}

/** iOS の Safari で開いているか（Chrome・Firefox・Edge の iOS 版は「ホーム画面に追加」の手順が違うので出さない） */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1)
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

/**
 * 「ホーム画面に追加」（S-03）の入口を出すか（S-02・S-30。§4 S-03）。
 * Safari で開いているときだけ出し、ホーム画面から開いているときは出さない。
 *
 * 共通に上げたい部品（S-02 でも使う）。
 */
export function useAddToHome(): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const update = (): void => setShow(isIosSafari() && !isStandalone())
    update()
    let media: MediaQueryList | null = null
    try {
      media = window.matchMedia('(display-mode: standalone)')
      media.addEventListener('change', update)
    } catch {
      media = null
    }
    return () => {
      media?.removeEventListener('change', update)
    }
  }, [])

  return show
}
