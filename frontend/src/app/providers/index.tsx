import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { system } from '@/theme'
import { AnnounceProvider } from './announce-provider'
import { createAuthClient } from './auth-client'
import { AuthProvider } from './auth-provider'
import { ToastProvider } from './toast-provider'

/**
 * 同期は使わず、開き直し・タブの選び直しで取り直す（docs/05_platform.md §1・仕様書 §6.3 ケースJ）。
 * 精算・ロックの操作は端末に保留しないので、やり直しは既定のままにする。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

/**
 * ログイン・ログアウトの口（データ層の `AuthRepository` を包んだもの）。
 * 人が変わったら、前の人ぶんの問い合わせは捨てて取り直す。
 */
const authClient = createAuthClient({ onSessionChange: () => queryClient.clear() })

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    // テーマはライトだけ（§3.9）。`.dark` のクラスを付けないので、OS がダークでもライトで出る
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider client={authClient}>
          <AnnounceProvider>
            <ToastProvider>
              <BrowserRouter>{children}</BrowserRouter>
            </ToastProvider>
          </AnnounceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}

export { useAnnounce } from './announce-provider'
export { createAuthClient } from './auth-client'
export { type AuthClient, type AuthStatus, type AuthUser, useAuth } from './auth-provider'
export { type ToastOptions, useToast } from './toast-provider'
