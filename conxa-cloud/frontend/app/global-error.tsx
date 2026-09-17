'use client'

import { useEffect } from 'react'

/** Catches an error in the root layout itself (where app/error.tsx can't reach —
 *  it renders inside the layout it's meant to catch errors from). Must render its
 *  own <html>/<body> since it replaces the root layout entirely. Kept minimal and
 *  inline-styled: nothing above this in the tree is guaranteed to have rendered. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app global error]', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#09090b', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100svh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ maxWidth: 28 + 'rem', width: '100%' }}>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: '0.75rem' }}>
              The app hit an error loading this page. Try again, or reload if it keeps happening.
            </p>
            <pre
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#fca5a5',
                maxHeight: '8rem',
                overflow: 'auto',
                borderRadius: '0.375rem',
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              {error.message || 'Unknown error'}
              {error.digest ? `\nRef: ${error.digest}` : ''}
            </pre>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  background: '#fafafa',
                  color: '#09090b',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  background: 'transparent',
                  color: '#fafafa',
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
