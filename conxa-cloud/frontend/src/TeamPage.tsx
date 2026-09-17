'use client'

import Link from 'next/link'
import { useState } from 'react'
import { OrganizationProfile } from '@clerk/nextjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  FileText,
  KeyRound,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { errorMessage } from '@/lib/apiBase'
import { formatCount, formatEpochDateTime, titleCase as sharedTitleCase } from '@/lib/format'
import {
  createExecuteGrant,
  fetchAuditEvents,
  fetchEntitlements,
  fetchExecuteGrants,
  fetchMe,
  fetchSubscription,
  revokeExecuteGrant,
  type AuditEvent,
  type EntitlementMeter,
  type ExecuteGrant,
} from '@/api/productApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/product/ProductPrimitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clerkAppearance } from '@/lib/clerkAppearance'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys'
import { toneBadgeClasses, type Tone } from '@/lib/tone'


function formatTime(value?: number | null) {
  return formatEpochDateTime(value, 'No activity yet')
}

function titleCase(value?: string | null) {
  return value ? sharedTitleCase(value) : 'Member'
}

function seatPercent(meter?: EntitlementMeter) {
  if (!meter || meter.unlimited || !meter.limit) return 0
  return Math.min(100, Math.round((meter.used / meter.limit) * 100))
}

function seatTone(meter?: EntitlementMeter): Tone {
  if (!meter || meter.unlimited || !meter.limit) return 'neutral'
  return seatPercent(meter) >= 80 ? 'warn' : 'good'
}


function StatusPill({
  children,
  tone = 'neutral',
  icon: Icon,
}: {
  children: React.ReactNode
  tone?: Tone
  icon?: LucideIcon
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5', toneBadgeClasses(tone))}>
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </Badge>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-white/[0.06]', className)} />
}

function AlertRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-sm text-amber-100">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <div className="min-w-0 border-t border-white/8 px-4 py-3 first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon className="size-3.5" />
        <p className="text-xs font-medium uppercase">{label}</p>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className={cn('mt-1 truncate text-xs', tone === 'warn' ? 'text-amber-200' : 'text-zinc-500')}>{detail}</p> : null}
    </div>
  )
}

function TeamSummary({
  workspaceName,
  role,
  plan,
  seatMeter,
  latestAudit,
  seatsUnavailable,
  loading,
}: {
  workspaceName?: string
  role?: string
  plan?: string
  seatMeter?: EntitlementMeter
  latestAudit?: AuditEvent
  seatsUnavailable: boolean
  loading: boolean
}) {
  const seatState = seatTone(seatMeter)
  const seatUsage = seatMeter?.unlimited
    ? `${formatCount(seatMeter.used)} active`
    : `${formatCount(seatMeter?.used)} / ${formatCount(seatMeter?.limit)}`

  return (
    <section className="overflow-hidden rounded-xl border border-white/8 bg-[#0d1014]">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="good" icon={ShieldCheck}>
              {titleCase(role)}
            </StatusPill>
            <StatusPill icon={CreditCard}>{titleCase(plan ?? 'development')} plan</StatusPill>
          </div>
          {loading ? (
            <div className="mt-5 space-y-2">
              <SkeletonBlock className="h-7 w-64" />
              <SkeletonBlock className="h-4 w-80 max-w-full" />
            </div>
          ) : (
            <>
              <h2 className="mt-5 truncate text-2xl font-semibold text-white">{workspaceName ?? 'Team workspace'}</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">
                Manage members, roles, and seats for this workspace.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-zinc-100 text-zinc-950 hover:bg-white">
            <a href="#members">
              <Users className="size-3.5" />
              Manage members
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]">
            <Link href="/billing">
              <CreditCard className="size-3.5" />
              Seats
            </Link>
          </Button>
        </div>
      </div>

      {seatsUnavailable ? (
        <div className="border-t border-white/8 p-4">
          <AlertRow message="Seat usage is unavailable right now." />
        </div>
      ) : null}

      <div className="grid border-t border-white/8 md:grid-cols-4">
        <SummaryMetric
          icon={Users}
          label="Seats"
          value={seatUsage}
          detail={seatMeter?.unlimited ? 'Unlimited capacity' : `${formatCount(seatMeter?.remaining)} remaining`}
          tone={seatState}
        />
        <SummaryMetric icon={KeyRound} label="Your role" value={titleCase(role)} detail="Workspace permissions" tone="good" />
        <SummaryMetric icon={CreditCard} label="Plan" value={titleCase(plan ?? 'development')} detail="Billing controls seats" />
        <SummaryMetric
          icon={Activity}
          label="Last team activity"
          value={latestAudit ? titleCase(latestAudit.action) : 'None'}
          detail={formatTime(latestAudit?.created_at)}
        />
      </div>
    </section>
  )
}

function RoleGuide() {
  const roles = [
    {
      role: 'Owner',
      detail: 'Full workspace and billing control.',
    },
    {
      role: 'Admin',
      detail: 'Manage members and workspace operations.',
    },
    {
      role: 'Member',
      detail: 'Use shared workspace resources.',
    },
  ]

  return (
    <section className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
      <div className="border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Role guide</h2>
        <p className="mt-1 text-sm text-zinc-500">Use the least access each teammate needs.</p>
      </div>
      <div className="divide-y divide-white/8">
        {roles.map((item) => (
          <div key={item.role} className="flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">{item.role}</p>
              <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
            </div>
            <StatusPill>{item.role}</StatusPill>
          </div>
        ))}
      </div>
    </section>
  )
}

function TeamLinks({ latestAudit }: { latestAudit?: AuditEvent }) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
      <div className="border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Team operations</h2>
        <p className="mt-1 text-sm text-zinc-500">Related controls for seats and activity.</p>
      </div>
      <div className="divide-y divide-white/8">
        <Link href="/billing" className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-white/[0.04]">
          <span className="flex min-w-0 items-center gap-3">
            <CreditCard className="size-4 shrink-0 text-zinc-500" />
            <span>
              <span className="block font-medium text-white">Seat plan</span>
              <span className="mt-0.5 block text-xs text-zinc-500">Review included seats and billing.</span>
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-zinc-500" />
        </Link>
        <Link href="/audit" className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-white/[0.04]">
          <span className="flex min-w-0 items-center gap-3">
            <FileText className="size-4 shrink-0 text-zinc-500" />
            <span>
              <span className="block font-medium text-white">Audit activity</span>
              <span className="mt-0.5 block text-xs text-zinc-500">{latestAudit ? formatTime(latestAudit.created_at) : 'No activity yet'}</span>
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-zinc-500" />
        </Link>
      </div>
    </section>
  )
}

function MemberDirectory() {
  return (
    <section id="members" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Members</h2>
          <p className="mt-1 text-sm text-zinc-500">Invite teammates, update roles, and manage organization membership.</p>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-white/8 bg-[#111318]">
        <OrganizationProfile
          routing="hash"
          appearance={{
            ...clerkAppearance,
            elements: {
              ...clerkAppearance.elements,
              rootBox: 'w-full',
              cardBox: 'w-full max-w-none overflow-hidden border-0 bg-transparent shadow-none',
              card: 'w-full max-w-none bg-transparent shadow-none',
              navbar: 'border-r border-white/8 bg-transparent',
              navbarButton:
                'text-zinc-400 hover:bg-white/[0.05] hover:text-white data-[active=true]:bg-white/[0.07] data-[active=true]:text-white',
              pageScrollBox: 'p-0',
              profilePage: 'p-0',
            },
          }}
        />
      </div>
    </section>
  )
}

function ExecuteSeatsPanel({ seatMeter }: { seatMeter?: EntitlementMeter }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const grantsQ = useQuery({
    queryKey: queryKeys.executeGrants,
    queryFn: fetchExecuteGrants,
    staleTime: 30_000,
    retry: 1,
  })

  const createM = useMutation({
    mutationFn: createExecuteGrant,
    onSuccess: (grant) => {
      setEmail('')
      queryClient.invalidateQueries({ queryKey: queryKeys.executeGrants })
      toast.success(`Invited ${grant.email} — access starts automatically the next time they sign into Conxa Execute with that email.`)
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not create invite'),
  })

  const revokeM = useMutation({
    mutationFn: revokeExecuteGrant,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.executeGrants }),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not revoke seat'),
  })

  const grants: ExecuteGrant[] = grantsQ.data?.grants ?? []
  const statusTone: Record<ExecuteGrant['status'], Tone> = { pending: 'neutral', claimed: 'good', revoked: 'bad' }

  return (
    <section className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Conxa Execute seats</h2>
          <p className="mt-1 max-w-lg text-sm text-zinc-500">
            Grant Conxa Execute access to people independent of Build Studio membership — their
            chat draws from this workspace&apos;s AI Usage Credits pool.
            {seatMeter ? ` ${formatCount(seatMeter.used)} / ${seatMeter.unlimited ? 'Unlimited' : formatCount(seatMeter.limit)} used.` : ''}
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = email.trim()
            if (!trimmed.includes('@')) {
              toast.error('Enter a valid email address.')
              return
            }
            createM.mutate(trimmed)
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="w-56 border-white/10 bg-black/30 text-sm"
          />
          <Button type="submit" size="sm" disabled={createM.isPending}>
            {createM.isPending ? 'Inviting…' : 'Invite'}
          </Button>
        </form>
      </div>

      {grantsQ.isLoading ? <LoadingState /> : null}
      {grantsQ.isError ? <ErrorState message={errorMessage(grantsQ.error)} /> : null}
      {!grantsQ.isLoading && !grantsQ.isError && grants.length === 0 ? (
        <EmptyState
          title="No Execute seats granted yet"
          description="Invite someone by email to give them Conxa Execute access paid for by this workspace."
        />
      ) : null}
      {grants.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-[48rem] w-full text-left text-sm">
            <thead className="border-b border-white/6 bg-black/20 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {grants.map((grant) => (
                <tr key={grant.grant_id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3 align-top text-zinc-300">{grant.email}</td>
                  <td className="px-4 py-3 align-top">
                    <StatusPill tone={statusTone[grant.status]}>{titleCase(grant.status)}</StatusPill>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-zinc-500">
                    {formatTime(new Date(grant.granted_at).getTime() / 1000)}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex justify-end gap-1">
                      {grant.status !== 'revoked' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-zinc-400 hover:text-red-300"
                          disabled={revokeM.isPending && revokeM.variables === grant.grant_id}
                          onClick={() => {
                            if (window.confirm(`Revoke the Execute seat for ${grant.email}?`)) revokeM.mutate(grant.grant_id)
                          }}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

export function TeamPage() {
  const meQ = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, staleTime: 30_000, retry: 1 })
  const entitlementsQ = useQuery({
    queryKey: queryKeys.entitlements,
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })
  const subscriptionQ = useQuery({
    queryKey: queryKeys.subscription,
    queryFn: fetchSubscription,
    staleTime: 30_000,
    retry: 1,
  })
  const auditQ = useQuery({
    queryKey: queryKeys.auditEvents('team'),
    queryFn: () => fetchAuditEvents(4),
    staleTime: 30_000,
    retry: 1,
  })

  const plan = entitlementsQ.data?.plan ?? subscriptionQ.data?.subscription.plan
  const latestAudit = auditQ.data?.audit_events[0]

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Team"
        description="Members, roles, and seats."
        info="Manage workspace members, their roles, and seat assignments."
      />

      <div className="flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <TeamSummary
          workspaceName={meQ.data?.workspace.name}
          role={meQ.data?.workspace.role}
          plan={plan}
          seatMeter={entitlementsQ.data?.meters.seats}
          latestAudit={latestAudit}
          seatsUnavailable={entitlementsQ.isError}
          loading={meQ.isLoading || entitlementsQ.isLoading || subscriptionQ.isLoading}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <RoleGuide />
          <TeamLinks latestAudit={latestAudit} />
        </div>

        <MemberDirectory />

        <ExecuteSeatsPanel seatMeter={entitlementsQ.data?.meters.execute_seats} />
      </div>
    </div>
  )
}
