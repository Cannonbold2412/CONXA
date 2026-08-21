'use client'
import { queryKeys } from '@/lib/queryKeys'
import { toneBadgeClasses, type Tone } from '@/lib/tone'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  deleteLlmKey,
  fetchLlmKey,
  fetchMachines,
  fetchMe,
  revokeMachine,
  setLlmKey,
  type ByokKeyStatus,
  type MachineDevice,
  type MeResponse,
  type ProxyIdentityStatus,
} from '@/api/productApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/product/ProductPrimitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  CreditCard,
  KeyRound,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  Users,
} from 'lucide-react'


function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function proxyStatusTone(status?: ProxyIdentityStatus): Tone {
  if (status === 'trusted') return 'good'
  if (!status) return 'neutral'
  return 'warn'
}

function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <Badge variant="outline" className={toneBadgeClasses(tone)}>
      {label}
    </Badge>
  )
}

function identityStatusLabel(status?: ProxyIdentityStatus) {
  if (status === 'trusted') return 'Trusted'
  if (!status) return 'Local session'
  return 'Needs attention'
}

function FieldRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-t border-white/6 py-3 first:border-t-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={mono ? 'min-w-0 truncate font-mono text-xs text-zinc-200' : 'min-w-0 truncate text-sm font-medium text-zinc-200'}>
        {value || 'Not configured'}
      </span>
    </div>
  )
}

function PostureRow({
  icon: Icon,
  label,
  detail,
  status,
  tone,
}: {
  icon: typeof ShieldCheck
  label: string
  detail: string
  status: string
  tone: Tone
}) {
  return (
    <div className="flex items-start gap-3 border-t border-white/6 py-4 first:border-t-0">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-300">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-white">{label}</p>
          <StatusBadge label={status} tone={tone} />
        </div>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{detail}</p>
      </div>
    </div>
  )
}

function SettingsCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof ShieldCheck
  children: ReactNode
}) {
  return (
    <Card className="border-white/8 bg-white/[0.025] shadow-none">
      <CardHeader className="border-b border-white/6 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon className="size-4 text-zinc-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

function AdminLink({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string
  icon: typeof ShieldCheck
  title: string
  detail: string
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-24 items-start gap-3 rounded-lg border border-white/8 bg-black/20 p-4 transition-colors hover:border-white/14 hover:bg-white/[0.045]"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-300">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{detail}</p>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" />
    </Link>
  )
}

function formatIsoTime(value?: string) {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function MachineDeviceList() {
  const queryClient = useQueryClient()
  const machinesQ = useQuery({ queryKey: queryKeys.machines, queryFn: fetchMachines })
  const revokeM = useMutation({
    mutationFn: revokeMachine,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.machines }),
  })

  const machines: MachineDevice[] = machinesQ.data?.machines ?? []

  return (
    <SettingsCard title="Build Studio Devices" icon={Monitor}>
      {machinesQ.isLoading ? <LoadingState /> : null}
      {machinesQ.isError ? <ErrorState message={(machinesQ.error as Error).message} /> : null}
      {!machinesQ.isLoading && !machinesQ.isError && machines.length === 0 ? (
        <EmptyState title="No devices registered yet" description="Devices appear here the first time Build Studio compiles or signs in from a new machine." />
      ) : null}
      {machines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-[40rem] w-full text-left text-sm">
            <thead className="border-b border-white/6 text-xs text-zinc-500">
              <tr>
                <th className="px-2 py-2 font-medium">Machine</th>
                <th className="px-2 py-2 font-medium">First seen</th>
                <th className="px-2 py-2 font-medium">Last seen</th>
                <th className="px-2 py-2 font-medium">Last IP</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {machines.map((machine) => (
                <tr key={machine.machine_hash} className="hover:bg-white/[0.025]">
                  <td className="px-2 py-2 font-mono text-xs text-zinc-400">{machine.machine_hash.slice(0, 12)}…</td>
                  <td className="px-2 py-2 whitespace-nowrap text-zinc-300">{formatIsoTime(machine.first_seen)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-zinc-300">{formatIsoTime(machine.last_seen)}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-500">{machine.last_ip || '—'}</td>
                  <td className="px-2 py-2">
                    <StatusBadge label={machine.revoked ? 'Revoked' : 'Active'} tone={machine.revoked ? 'bad' : 'good'} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {!machine.revoked ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-zinc-400 hover:text-red-300"
                        disabled={revokeM.isPending}
                        onClick={() => {
                          if (window.confirm(`Revoke device ${machine.machine_hash.slice(0, 12)}…? It will need to re-register to compile again.`)) {
                            revokeM.mutate(machine.machine_hash)
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SettingsCard>
  )
}

function ByokForm({ existing, onDone }: { existing?: ByokKeyStatus; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? '')
  const [deployment, setDeployment] = useState(existing?.deployment ?? '')
  const [apiVersion, setApiVersion] = useState(existing?.api_version ?? '')
  const [apiKey, setApiKey] = useState('')

  const saveM = useMutation({
    mutationFn: () =>
      setLlmKey({
        endpoint: endpoint.trim(),
        deployment: deployment.trim(),
        api_version: apiVersion.trim(),
        api_key: apiKey.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.llmKey })
      toast.success('LLM key saved')
      onDone()
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save LLM key')
    },
  })

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!endpoint.trim() || !deployment.trim() || !apiKey.trim()) {
          toast.error('Endpoint, deployment, and API key are required.')
          return
        }
        saveM.mutate()
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="byok-endpoint" className="text-xs text-zinc-400">Azure OpenAI endpoint</Label>
        <Input
          id="byok-endpoint"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://your-resource.openai.azure.com"
          className="border-white/10 bg-black/30 font-mono text-xs"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="byok-deployment" className="text-xs text-zinc-400">Deployment name</Label>
          <Input
            id="byok-deployment"
            value={deployment}
            onChange={(e) => setDeployment(e.target.value)}
            placeholder="gpt-4o"
            className="border-white/10 bg-black/30 font-mono text-xs"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="byok-api-version" className="text-xs text-zinc-400">API version</Label>
          <Input
            id="byok-api-version"
            value={apiVersion}
            onChange={(e) => setApiVersion(e.target.value)}
            placeholder="2024-08-01-preview"
            className="border-white/10 bg-black/30 font-mono text-xs"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="byok-api-key" className="text-xs text-zinc-400">API key</Label>
        <Input
          id="byok-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={existing?.configured ? 'Stored — enter a new key to replace' : 'Key is encrypted at rest and never returned'}
          className="border-white/10 bg-black/30 font-mono text-xs"
          autoComplete="new-password"
        />
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        Compiles run against your own Azure OpenAI deployment — no screenshot of your systems ever
        leaves your tenancy. The key is AES-256-GCM encrypted and never sent back to the browser.
      </p>
      <div className="flex justify-end gap-2">
        {existing?.configured ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-zinc-400 hover:text-zinc-200"
            onClick={onDone}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={saveM.isPending}
          className="cursor-pointer border border-cyan-400/30 bg-white/[0.04] text-cyan-200 hover:bg-white/[0.06]"
        >
          {saveM.isPending ? 'Saving…' : existing?.configured ? 'Replace key' : 'Save key'}
        </Button>
      </div>
    </form>
  )
}

function ByokPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const keyQ = useQuery({ queryKey: queryKeys.llmKey, queryFn: fetchLlmKey, enabled: isAdmin })
  const deleteM = useMutation({
    mutationFn: deleteLlmKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.llmKey })
      setEditing(false)
      toast.success('LLM key removed')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to remove LLM key')
    },
  })

  if (!isAdmin) {
    return (
      <SettingsCard title="Bring Your Own LLM Key" icon={LockKeyhole}>
        <EmptyState
          title="Owner or admin required"
          description="BYOK configuration is managed by workspace owners and admins on the Enterprise plan."
        />
      </SettingsCard>
    )
  }

  const status = keyQ.data

  return (
    <SettingsCard title="Bring Your Own LLM Key (Enterprise BYOK)" icon={LockKeyhole}>
      {keyQ.isLoading ? <LoadingState /> : null}
      {keyQ.isError ? <ErrorState message={(keyQ.error as Error).message} /> : null}
      {keyQ.isSuccess && status ? (
        editing ? (
          <ByokForm existing={status.configured ? status : undefined} onDone={() => setEditing(false)} />
        ) : status.configured ? (
          <>
            <FieldRow label="Provider" value={titleCase(String(status.provider ?? ''))} />
            <FieldRow label="Endpoint" value={status.endpoint} mono />
            <FieldRow label="Deployment" value={status.deployment} mono />
            <FieldRow label="API version" value={status.api_version} mono />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer border-white/8 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                onClick={() => setEditing(true)}
              >
                Replace configuration
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-zinc-400 hover:text-red-300"
                disabled={deleteM.isPending}
                onClick={() => {
                  if (window.confirm('Remove the stored Azure OpenAI key? Compiles fall back to the shared managed pool.')) {
                    deleteM.mutate()
                  }
                }}
              >
                Remove key
              </Button>
            </div>
          </>
        ) : (
          <>
            <EmptyState
              title="No custom LLM key configured"
              description="Point compiles at your own Azure OpenAI deployment for security-review compliance."
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer border-cyan-400/30 bg-white/[0.04] text-cyan-200 hover:bg-white/[0.06]"
                onClick={() => setEditing(true)}
              >
                Configure key
              </Button>
            </div>
          </>
        )
      ) : null}
    </SettingsCard>
  )
}

function SettingsBody({ me }: { me: MeResponse }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <SettingsCard title="Workspace" icon={Building2}>
          <FieldRow label="Workspace name" value={me.workspace.name} />
          <FieldRow label="Workspace slug" value={me.workspace.slug} mono />
          <FieldRow label="Workspace ID" value={me.workspace.id} mono />
          <FieldRow label="Current role" value={titleCase(me.workspace.role)} />
        </SettingsCard>

        <SettingsCard title="Access & Security" icon={ShieldCheck}>
          <PostureRow
            icon={LockKeyhole}
            label="Authentication"
            detail="Dashboard access is bound to the active Clerk organization context."
            status={me.auth_required ? 'Enforced' : 'Local mode'}
            tone={me.auth_required ? 'good' : 'warn'}
          />
          <PostureRow
            icon={KeyRound}
            label="Session verification"
            detail="Shows whether this dashboard request is tied to a verified workspace identity."
            status={identityStatusLabel(me.proxy_identity_status)}
            tone={proxyStatusTone(me.proxy_identity_status)}
          />
          <PostureRow
            icon={Users}
            label="Signed-in user"
            detail={me.user.email ?? me.user.id}
            status={titleCase(me.user.auth_provider)}
            tone="neutral"
          />
        </SettingsCard>
      </div>

      <SettingsCard title="Administration" icon={Users}>
        <div className="grid gap-3 md:grid-cols-3">
          <AdminLink href="/team" icon={Users} title="Team" detail="Manage workspace members and access." />
          <AdminLink href="/billing" icon={CreditCard} title="Billing" detail="Review plan, usage, and subscription state." />
          <AdminLink href="/audit" icon={ClipboardCheck} title="Audit" detail="Inspect workspace activity and export evidence." />
        </div>
      </SettingsCard>

      <MachineDeviceList />

      <ByokPanel isAdmin={me.workspace.role === 'owner' || me.workspace.role === 'admin'} />
    </div>
  )
}

export function SettingsPage() {
  const meQ = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe })

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Settings"
        description="Workspace identity and admin entry points."
        info="Workspace identity, access context, and admin entry points."
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
        {meQ.isLoading ? <LoadingState /> : null}
        {meQ.isError ? <ErrorState message={(meQ.error as Error).message} /> : null}
        {meQ.data ? <SettingsBody me={meQ.data} /> : null}
      </div>
    </div>
  )
}
