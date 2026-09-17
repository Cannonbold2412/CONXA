'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Next's native error boundary for everything under the root layout — replaces a
 *  hand-rolled React class component with the framework's own mechanism. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="bg-background text-foreground flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The page hit an error. Try again, or reload if it keeps happening.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="bg-muted/50 text-destructive max-h-32 overflow-auto rounded-md p-3 font-mono text-xs">
            {error.message || 'Unknown error'}
            {error.digest ? `\nRef: ${error.digest}` : ''}
          </pre>
          <div className="flex gap-2">
            <Button type="button" onClick={() => reset()}>
              Try again
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
