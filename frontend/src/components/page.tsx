import { Box } from '@chakra-ui/react'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'

const PageScrolledContext = createContext(false)

/** 上部バーの下の罫線を出すかどうか（ページを 4px 以上送ったら true） */
export function usePageScrolled(): boolean {
  return useContext(PageScrolledContext)
}

export type PageProps = {
  children: ReactNode
  /** 下にタブバーがある画面（タブのトップ）は true */
  withTabBar?: boolean
}

/**
 * スクロールする箱（§3.1・§7.4）。
 * 上端は safe-area の下から始め、下端はタブバーの上まで。左右は gutter（safe-area を下回らない）、
 * 中身の最大幅は 480px で、広い画面では中央に寄せる。
 */
export function Page({ children, withTabBar = true }: PageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onScroll = () => setScrolled(node.scrollTop > 4)
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <PageScrolledContext.Provider value={scrolled}>
      <Box
        ref={ref}
        // シートが開いているあいだ inert を付ける目印（components/bottom-sheet.tsx）
        data-app-page
        position='fixed'
        left='0'
        right='0'
        top='var(--sa-top)'
        bottom={withTabBar ? 'calc(var(--tabbar-h) + var(--sa-bottom))' : '0'}
        overflowY='auto'
        overflowX='hidden'
        overscrollBehavior='contain'
        pl='var(--pad-l)'
        pr='var(--pad-r)'
        bg='bg.page'
      >
        <Box maxW='contentMax' mx='auto' minH='100%' display='flex' flexDirection='column'>
          {children}
        </Box>
      </Box>
    </PageScrolledContext.Provider>
  )
}

/** セクションの見出し（13px semibold text.sub、上 24px・下 8px。§7.4） */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Box as='h2' fontSize='bodySm' fontWeight='semibold' color='text.sub' mt={6} mb={2}>
      {children}
    </Box>
  )
}
