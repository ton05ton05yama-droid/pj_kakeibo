import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
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

export function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={client}>
        <AnnounceProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/settle']}>{ui}</MemoryRouter>
          </ToastProvider>
        </AnnounceProvider>
      </QueryClientProvider>
    </ChakraProvider>
  )
}
