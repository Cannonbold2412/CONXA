'use client'

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'

/** Every query failure lands here even if the page rendering it forgets to
 *  read `error` — the three drifted error-surfacing mechanisms this
 *  replaces (silent DashboardError swallow, unchecked casts, missed catches)
 *  all shared the same root cause: nothing guaranteed a failure was seen
 *  anywhere. This does not toast (a background refetch failing quietly while
 *  stale data still renders is normal), it guarantees the failure is at
 *  least logged with its request id for support/debugging. */
function logQueryError(error: unknown, queryKey: unknown) {
  const requestId = (error as { requestId?: string })?.requestId
  console.error('[query failed]', queryKey, error, requestId ? { requestId } : undefined)
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
        queryCache: new QueryCache({
          onError: (error, query) => logQueryError(error, query.queryKey),
        }),
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" closeButton richColors expand={false} />
    </QueryClientProvider>
  )
}
