import { Box } from '@chakra-ui/react'
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'

type AnnounceFn = (text: string) => void

const AnnounceContext = createContext<AnnounceFn>(() => {})

/**
 * 金額などを読み上げる（§7.5 テンキー）。
 * シートの外に置いた**共通の要素の中身だけ**を入力のたびに更新し、要素を作り直さない。
 */
export function useAnnounce(): AnnounceFn {
  return useContext(AnnounceContext)
}

export function AnnounceProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState('')
  const last = useRef('')

  const announce = useCallback((next: string) => {
    if (next === last.current) return
    last.current = next
    setText(next)
  }, [])

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <Box
        role='status'
        aria-live='polite'
        position='absolute'
        w='1px'
        h='1px'
        overflow='hidden'
        whiteSpace='nowrap'
        clipPath='inset(50%)'
      >
        {text}
      </Box>
    </AnnounceContext.Provider>
  )
}
