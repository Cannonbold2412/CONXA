import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchPlugins, normalizePluginList } from '@/api/pluginApi'
import { useSelectionStore } from '@/store/selectionStore'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ExternalLink, Globe } from 'lucide-react'

/** The compact "current automation" picker shown at the top of every stage page
 * (Record/Compile/Human Edit/Test Skill/Publish/Build Installer), backed by the
 * single shared selection store — kills the old four-page re-selection shuffle
 * without collapsing the pages into one workspace. */
export function PluginSwitcher() {
  const navigate = useNavigate()
  const { selectedPluginId, setSelectedPluginId } = useSelectionStore()
  const { data, isLoading } = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, staleTime: 10_000 })
  const plugins = normalizePluginList(data)

  // Deep-selects a sane default: keep the persisted selection if it still
  // exists, otherwise fall back to the first available plugin.
  useEffect(() => {
    if (isLoading) return
    if (selectedPluginId && plugins.some((p) => p.id === selectedPluginId)) return
    setSelectedPluginId(plugins[0]?.id ?? null)
  }, [isLoading, plugins, selectedPluginId, setSelectedPluginId])

  if (isLoading) return null

  if (plugins.length === 0) {
    return (
      <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-3 sm:px-6">
        <Globe className="size-4 shrink-0 text-zinc-600" />
        <p className="flex-1 text-xs text-zinc-500">No automations yet — create one from Record to get started.</p>
        <Button size="sm" variant="outline" onClick={() => navigate('/record')}>
          Go to Record
        </Button>
      </div>
    )
  }

  const selected = plugins.find((p) => p.id === selectedPluginId) ?? plugins[0]

  return (
    <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-3 sm:px-6">
      <Select value={selected?.id} onValueChange={(id) => setSelectedPluginId(id)}>
        <SelectTrigger className="h-8 max-w-72 border-white/10 bg-white/[0.04] text-sm text-zinc-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {plugins.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-zinc-400 hover:text-white"
          onClick={() => navigate(`/plugins/${encodeURIComponent(selected.id)}`)}
        >
          <ExternalLink className="size-3.5" /> Overview
        </Button>
      )}
    </div>
  )
}

/** Convenience hook for stage pages: the currently selected plugin's id, or null
 * if none is selected/available yet. */
export function useSelectedPluginId(): string | null {
  return useSelectionStore((s) => s.selectedPluginId)
}
