import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { type InitialEntry, MemoryRouter } from 'react-router'
import { AnnounceProvider } from '@/app/providers/announce-provider'
import { ToastProvider } from '@/app/providers/toast-provider'
import { createLocalRepository, type Repository, setRepository } from '@/data'
import type { ScenarioId } from '@/domain'
import { system } from '@/theme'
import { resetSettleMonth } from '../use-settle-month'

/** 見本データ（§9）を積んだローカル実装で、その人としてログインした状態にする */
export async function signIn(scenario: ScenarioId, who: 'masato' | 'risako' = 'masato'): Promise<Repository> {
  resetSettleMonth()
  const repository = createLocalRepository(scenario)
  await repository.auth.signIn(who, 'pw')
  setRepository(repository)
  return repository
}

/** `initialEntries` を渡すと、支出タブから月を渡して開いた状態（`state: { month }`）を作れる */
export function renderWithProviders(ui: ReactNode, initialEntries: InitialEntry[] = ['/settle']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AnnounceProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
          </ToastProvider>
        </AnnounceProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}
