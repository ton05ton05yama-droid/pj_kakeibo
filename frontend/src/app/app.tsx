import { useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers'
import { useHousehold } from '@/data'
import type { Expense } from '@/domain'
import { LoginScreen, OnboardingScreen } from '@/features/auth'
import { ExpensesScreen } from '@/features/expense'
import { RecordScreen } from '@/features/record'
import { SettingsTab } from '@/features/settings'
import { SettleScreen } from '@/features/settle'
import { FillPendingQueue } from './fill-pending'
import { AppLayout } from './layout'
import { ComponentsPreview } from './routes/components-preview'

/**
 * アプリの入り口。
 *
 * ログインの状態で出し分ける（§4 S-01・S-02）:
 *   `loading` は中身を出さない ／ `signedOut` は S-01 ／
 *   済ませていない人には S-02 ／ そのほかはタブ（§2.1）。
 */
export function App() {
  const { status } = useAuth()
  if (status === 'loading') return null
  if (status === 'signedOut') return <LoginScreen />
  return <SignedIn />
}

/** ログイン済み。各自の初回だけ S-02 を出してから、タブへ入る */
function SignedIn() {
  const { data: snapshot } = useHousehold()
  if (snapshot === undefined) return null
  if (snapshot.onboardedAt === null) return <OnboardingScreen />
  return <Tabs />
}

/**
 * 画面遷移（§2.1）。タブは4つで、アプリはいつも**記録**タブで開く。
 * シート（S-03・S-04・S-12〜S-15・S-21・S-22・S-32〜S-34）はルートにせず、各画面の状態で持つ（§4.0.3）。
 */
function Tabs() {
  const navigate = useNavigate()
  // 精算（S-20 `prep`）から渡された金額待ちの行。タブをまたぐのでここで持つ（§2.3 E1）
  const [fillQueue, setFillQueue] = useState<readonly string[] | null>(null)

  /** ［金額を入れる］。支出タブへ移してから S-15 を順に開く */
  const startFill = (queue: readonly Expense[]): void => {
    if (queue.length === 0) return
    setFillQueue(queue.map((e) => e.id))
    navigate('/expenses')
  }

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path='/record' element={<RecordScreen />} />
          <Route path='/expenses' element={<ExpensesScreen />} />
          <Route path='/settle' element={<SettleScreen onFillPending={startFill} />} />
          <Route path='/settings' element={<SettingsTab />} />
          {/* 共通部品の見本（開発のときだけ。アプリの画面ではない） */}
          {import.meta.env.DEV ? <Route path='/__components' element={<ComponentsPreview />} /> : null}
        </Route>
        {/* 既定は記録タブ（§2.1） */}
        <Route path='*' element={<Navigate to='/record' replace />} />
      </Routes>
      {fillQueue !== null ? (
        <FillPendingQueue key={fillQueue.join(',')} ids={fillQueue} onDone={() => setFillQueue(null)} />
      ) : null}
    </>
  )
}
