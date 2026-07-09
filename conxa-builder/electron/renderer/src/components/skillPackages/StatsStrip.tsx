import { Clock, FileCode2, GitBranch, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/skillPackageTree'
import { PanelChrome } from '@/components/ui/panel-chrome'
import type { SkillPackageSummary } from '@/api/workflowApi'

export function StatsStrip({ packages }: { packages: SkillPackageSummary[] }) {
  const totalWorkflows = packages.reduce((s, p) => s + p.workflows.length, 0)
  const totalFiles = packages.reduce((s, p) => s + p.files.length, 0)
  const lastModified = packages.reduce((max, p) => Math.max(max, p.modified_at), 0)

  const stats = [
    {
      label: 'Packages',
      value: packages.length,
      icon: Package,
      iconClass: 'text-zinc-300',
      ringClass: 'border-white/10 bg-white/[0.06]',
    },
    {
      label: 'Workflows',
      value: totalWorkflows,
      icon: GitBranch,
      iconClass: 'text-emerald-300',
      ringClass: 'border-emerald-500/20 bg-emerald-500/[0.08]',
    },
    {
      label: 'Files',
      value: totalFiles,
      icon: FileCode2,
      iconClass: 'text-blue-300',
      ringClass: 'border-blue-500/20 bg-blue-500/[0.08]',
    },
    {
      label: 'Last updated',
      value: lastModified > 0 ? relativeTime(lastModified) : '—',
      icon: Clock,
      iconClass: 'text-zinc-400',
      ringClass: 'border-white/10 bg-white/[0.06]',
    },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, iconClass, ringClass }) => (
        <PanelChrome
          key={label}
          className="flex-row items-center gap-3.5 px-4 py-3.5 rounded-[1.2rem]"
        >
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl border', ringClass)}>
            <Icon className={cn('size-4', iconClass)} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-none tracking-tight text-white">{value}</p>
            <p className="mt-1.5 truncate text-[11px] leading-none text-zinc-500">{label}</p>
          </div>
        </PanelChrome>
      ))}
    </div>
  )
}
