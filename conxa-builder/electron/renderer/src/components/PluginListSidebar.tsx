import { PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Plugin } from '@/api/pluginApi'

export type PluginBadgeTone = 'done' | 'ready' | 'warning'

const TONE_CLASSES: Record<PluginBadgeTone, { badge: string; bar: string }> = {
  done: {
    badge: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300',
    bar: 'bg-emerald-500/50',
  },
  ready: {
    badge: 'border-sky-500/30 bg-sky-500/[0.08] text-sky-300',
    bar: 'bg-sky-500/40',
  },
  warning: {
    badge: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
    bar: 'bg-amber-500/30',
  },
}

function packageNameFromOutputPath(outputPath?: string | null): string {
  if (!outputPath) return 'No package'
  const leaf = outputPath.split(/[\\/]+/).filter(Boolean).pop() ?? outputPath
  return leaf.endsWith('-plugin') ? leaf.slice(0, -'-plugin'.length) : leaf
}

/** Shared "Built Packages" list — used by both Publish Skill Package and Build
 * Installer, which both operate on the same set of built plugins but badge
 * them differently (publish status vs. installer status). Kept as one
 * component so the two pages can't drift out of sync visually. */
export function PluginListSidebar({
  plugins,
  selectedId,
  onSelect,
  heading,
  subheading,
  emptyTitle,
  emptySubtitle,
  badgeFor,
}: {
  plugins: Plugin[]
  selectedId: string | null
  onSelect: (id: string) => void
  heading: string
  subheading: string
  emptyTitle: string
  emptySubtitle: string
  badgeFor: (plugin: Plugin) => { label: string; tone: PluginBadgeTone }
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-white/8">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{heading}</h2>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            {plugins.length}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-600">{subheading}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 rounded-full border border-white/8 bg-white/[0.03] p-3">
              <PackageCheck className="size-6 text-zinc-700" />
            </div>
            <p className="text-xs font-medium text-zinc-500">{emptyTitle}</p>
            <p className="mt-1 text-[11px] text-zinc-600">{emptySubtitle}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {plugins.map((plugin) => {
              const selected = selectedId === plugin.id
              const { label, tone } = badgeFor(plugin)
              const toneClasses = TONE_CLASSES[tone]
              return (
                <button
                  key={plugin.id}
                  type="button"
                  onClick={() => onSelect(plugin.id)}
                  className={cn(
                    'group w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-all duration-150',
                    selected
                      ? 'border-sky-500/25 bg-sky-500/[0.08] text-white'
                      : 'border-transparent text-zinc-300 hover:border-white/8 hover:bg-white/[0.04] hover:text-white',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium leading-snug">
                        {packageNameFromOutputPath(plugin.build?.output_path)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500">{plugin.name}</p>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0 text-[10px] font-medium', toneClasses.badge)}>
                      {label}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className={cn('h-0.5 flex-1 rounded-full', toneClasses.bar)} />
                    <span className="text-[10px] text-zinc-600">{plugin.workflows.length}w</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
