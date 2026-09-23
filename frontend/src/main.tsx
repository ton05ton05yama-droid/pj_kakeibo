import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { AppProviders } from './app/providers'
import { installOnlineFlush, requestPersistentStorage } from './data'

// 端末に保留した記録（§3.6）が7日で消えないように頼む（05 §6 の7日ルール）
requestPersistentStorage()
// つながったら保留した記録を送る（§3.6。アプリで1回だけ購読する）
installOnlineFlush()

const container = document.getElementById('root')
if (!container) throw new Error('#root が見つかりません')

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
)
