import { Outlet } from 'react-router'
import { Page, TabBar } from '@/components'
import { useAppStatus } from '@/data'

/**
 * タブのトップの土台（§3.1）。
 * スクロールする箱はステータスバーの下から始め、下はタブバーの上まで。
 * シートはこの外（body 直下）に出すので、タブバーの上に重なる。
 */
export function AppLayout() {
  // 赤い点の条件は、支出タブのお知らせ行と同じ（§3.2・§3.5）。
  // ［この月を精算する］で画面の状態を変えても、赤い点は変えない（月の途中は出さない。§12.1 Q2）
  const { notice } = useAppStatus()
  return (
    <>
      <Page>
        <Outlet />
      </Page>
      <TabBar showSettleDot={notice !== null} />
    </>
  )
}
