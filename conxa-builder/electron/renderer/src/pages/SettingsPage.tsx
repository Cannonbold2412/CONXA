import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { PRIVACY_URL, TERMS_URL } from '@/pages/LegalGateScreen'
import { Button } from '@/components/ui/button'
import { performLogout } from '@/contexts/AuthContext'
import { LogOut, RefreshCw } from 'lucide-react'
import { EntitlementMeters } from '@/components/EntitlementMeters'
import { useUpdater } from '@/hooks/useUpdater'
import { cn } from '@/lib/utils'

const CARD = 'border-white/8 bg-white/[0.03] shadow-none'

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'usage', label: 'Usage' },
  { id: 'about', label: 'About' },
] as const

function initials(source: string) {
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <div>
        <h2 className="text-base font-semibold leading-snug text-white">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b border-white/8 px-5 py-3.5 text-sm last:border-b-0">
      <span className="w-36 shrink-0 text-zinc-400">{label}</span>
      <div className="min-w-0 flex-1 text-white">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { identity, setIdentity } = useAuth()
  const { status, currentVersion, check, startDownload, install } = useUpdater()
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  useEffect(() => {
    if (status.phase === 'downloaded') install()
  }, [status.phase, install])

  const isChecking = status.phase === 'checking'
  const isAvailable = status.phase === 'available'
  const isDownloading = status.phase === 'downloading'
  const isDownloaded = status.phase === 'downloaded'
  const hasError = status.phase === 'error'

  const displayName = identity?.name || identity?.email || ''

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Settings" description="Account and workspace settings for Conxa Build Studio." />
      <div className="flex w-full items-start gap-14 px-6 py-8 md:px-10 md:py-10">
        <nav aria-label="Settings sections" className="sticky top-0 hidden w-44 shrink-0 flex-col gap-0.5 md:flex">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={active === s.id ? 'true' : undefined}
              onClick={() => {
                setActive(s.id)
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
              }}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                active === s.id
                  ? 'border-white/8 bg-white/[0.06] font-medium text-white'
                  : 'border-transparent text-zinc-400 hover:text-white',
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-10">
          <Section id="account" title="Account" description="The account you are signed in with on this machine.">
            <Card className={cn(CARD, 'flex-row items-center gap-4 p-5')}>
              {identity ? (
                <>
                  <div
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1a] text-[15px] font-semibold text-white"
                  >
                    {initials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold leading-snug text-white">{displayName}</p>
                    {identity.name && identity.email && (
                      <p className="truncate text-sm text-zinc-400">{identity.email}</p>
                    )}
                    {identity.org_name && <p className="truncate text-sm text-zinc-500">{identity.org_name}</p>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-white/10 text-zinc-300 hover:text-white"
                    onClick={() => performLogout(setIdentity)}
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </Button>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Not signed in.</p>
              )}
            </Card>
          </Section>

          <Section id="usage" title="Usage" description="What this workspace has used so far.">
            <EntitlementMeters />
          </Section>

          <Section id="about" title="About" description="Details to include when you contact support.">
            <Card className={cn(CARD, 'gap-0 p-0')}>
              <Row label="Product">Conxa Build Studio</Row>
              <Row label="Description">Offline AI-native workflow recorder &amp; compiler</Row>
              <Row label="Version">
                <span className="tabular-nums">{currentVersion || '—'}</span>
                {isAvailable && status.phase === 'available' && (
                  <span className="ml-3 text-zinc-400">
                    {status.latestVersion} available
                  </span>
                )}
              </Row>
              <Row label="Software update">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 text-sm">
                    {isDownloading && status.phase === 'downloading' ? (
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-zinc-400">
                          <span>Downloading update...</span>
                          <span>{Math.round(status.percent)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-zinc-400 transition-all duration-300"
                            style={{ width: `${status.percent}%` }}
                          />
                        </div>
                      </div>
                    ) : isDownloaded ? (
                      <span className="text-zinc-400">Installing and restarting...</span>
                    ) : hasError && status.phase === 'error' ? (
                      <span className="text-xs text-red-400">{status.message}</span>
                    ) : status.phase === 'not-available' ? (
                      <span className="text-zinc-400">You're up to date.</span>
                    ) : null}
                  </div>
                  {!isDownloading && !isDownloaded && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-white/10 text-zinc-300 hover:text-white"
                      onClick={check}
                      disabled={isChecking}
                    >
                      <RefreshCw className={`size-4 ${isChecking ? 'animate-spin' : ''}`} />
                      {isChecking ? 'Checking...' : 'Check for updates'}
                    </Button>
                  )}
                  {(isAvailable || hasError) && (
                    <Button size="sm" onClick={startDownload} disabled={isDownloading}>
                      Update now
                    </Button>
                  )}
                </div>
              </Row>
              <p className="px-5 py-3.5 text-xs text-zinc-500">
                Licensed, not sold.{' '}
                <button
                  type="button"
                  onClick={() => void window.conxa.openExternal(TERMS_URL)}
                  className="text-zinc-300 underline underline-offset-2 hover:text-white"
                >
                  Terms and Conditions
                </button>{' '}
                &middot;{' '}
                <button
                  type="button"
                  onClick={() => void window.conxa.openExternal(PRIVACY_URL)}
                  className="text-zinc-300 underline underline-offset-2 hover:text-white"
                >
                  Privacy Policy
                </button>
              </p>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  )
}
