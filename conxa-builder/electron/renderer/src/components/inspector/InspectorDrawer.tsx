import { useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, fetchSkillPackageFiles, fetchSkillPackageList } from '@/api/workflowApi'
import { buildSkillPackage, type Workflow } from '@/api/workflowsApi'
import { PanelChrome } from '@/components/ui/panel-chrome'
import { StructureTrieRows } from '@/components/skillPackages/StructureTree'
import {
  buildPathTrie,
  defaultSkillPackageActiveKey,
  imageMimeFromKey,
  isImageVisualKey,
  orderedSkillPackageKeys,
} from '@/lib/skillPackageTree'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FolderKanban, Hammer, Loader2 } from 'lucide-react'

/** The demoted home for compiler/packaging internals (bundle_root path, raw
 * package file tree) that used to live on the top-level Packages page and on
 * every default surface. Reachable on demand from the workflow overview instead
 * of being a wall the user has to climb — see conxa-builder-workflow-redesign.md
 * §3.3/§6 ("View Package" -> Inspector). Also hosts the manual "Rebuild
 * package" escape hatch now that Build Skill Package no longer has its own page
 * (superseded by auto-build-on-sign-off, see cmd_sign_off_workflow).
 *
 * Every workflow's compiled skill lands in the same shared local package
 * directory, so this drawer finds the one package containing this particular
 * workflow's own compiled skill. "Rebuild package" only recompiles this one
 * workflow (see buildSkillPackage's skillSlug param) — a sibling workflow
 * that isn't ready yet is never touched or required. */
export function InspectorDrawer({ workflow, trigger }: { workflow: Workflow; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const qc = useQueryClient()

  const listQ = useQuery({
    queryKey: ['skillPackages'],
    queryFn: fetchSkillPackageList,
    enabled: open,
    staleTime: 10_000,
  })

  const matchedPackage = useMemo(() => {
    const packages = listQ.data?.packages ?? []
    return packages.find((pkg) => pkg.workflows.some((wf) => wf.workflow_slug === workflow.slug)) ?? null
  }, [listQ.data, workflow.slug])

  const filesQ = useQuery({
    queryKey: ['skillPackageFiles', matchedPackage?.package_name],
    queryFn: () => fetchSkillPackageFiles(matchedPackage!.package_name),
    enabled: open && !!matchedPackage,
  })

  const visibleFiles = useMemo(() => {
    if (filesQ.data) return orderedSkillPackageKeys(Object.keys(filesQ.data.files))
    if (matchedPackage) return orderedSkillPackageKeys(matchedPackage.files)
    return []
  }, [filesQ.data, matchedPackage])
  const trie = useMemo(() => buildPathTrie(visibleFiles), [visibleFiles])
  const resolvedActiveFile = useMemo(() => {
    if (visibleFiles.length === 0) return null
    if (activeFile && visibleFiles.includes(activeFile)) return activeFile
    return defaultSkillPackageActiveKey(visibleFiles)
  }, [activeFile, visibleFiles])
  const activeSource = resolvedActiveFile && filesQ.data ? filesQ.data.files[resolvedActiveFile] ?? '' : ''
  const activeIsImage = resolvedActiveFile ? isImageVisualKey(resolvedActiveFile) : false

  async function handleOpenFolder() {
    if (!matchedPackage) return
    try {
      const bundleRoot = listQ.data?.bundle_root ?? ''
      const sep = bundleRoot.includes('\\') ? '\\' : '/'
      const folderPath =
        matchedPackage.package_path ??
        (bundleRoot
          ? `${bundleRoot}${sep}${matchedPackage.package_folder ?? matchedPackage.package_name}`
          : matchedPackage.package_folder ?? matchedPackage.package_name)
      await window.conxa.openExternal(`file:///${folderPath.replace(/\\/g, '/')}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not open package folder.'))
    }
  }

  async function handleRebuild() {
    setRebuilding(true)
    try {
      await buildSkillPackage(workflow.slug)
      toast.success('Package rebuilt.')
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skillPackages'] }),
        qc.invalidateQueries({ queryKey: ['skillPackageFiles', matchedPackage?.package_name] }),
        qc.invalidateQueries({ queryKey: ['workflow', workflow.id] }),
      ])
    } catch (err) {
      toast.error(errorMessage(err, 'Could not rebuild the package.'))
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 border-white/10 bg-[#0a0c0f] p-0 text-zinc-100 sm:max-w-2xl">
        <SheetHeader className="border-b border-white/8 px-5 py-4">
          <SheetTitle className="text-white">Inspector — {workflow.name}</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Package files and internals, for reference — not part of the everyday flow.
          </SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {listQ.data && (
              <Badge variant="outline" className="border-white/10 bg-white/[0.04] font-mono text-[11px] text-zinc-400">
                {listQ.data.bundle_root}
              </Badge>
            )}
            <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-200" onClick={() => void handleOpenFolder()} disabled={!matchedPackage}>
              <FolderKanban className="size-3.5" /> Open in Explorer
            </Button>
            <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-200" onClick={() => void handleRebuild()} disabled={rebuilding}>
              {rebuilding ? <Loader2 className="size-3.5 animate-spin" /> : <Hammer className="size-3.5" />} Rebuild package
            </Button>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          {listQ.isLoading ? (
            <p className="p-5 text-sm text-zinc-500">Loading…</p>
          ) : listQ.isError ? (
            <p className="p-5 text-sm text-red-400">{(listQ.error as Error)?.message ?? 'Could not load packages.'}</p>
          ) : !matchedPackage ? (
            <p className="p-5 text-sm text-zinc-500">No built package yet for this automation.</p>
          ) : (
            <>
              <PanelChrome className="w-56 shrink-0 overflow-y-auto rounded-none border-y-0 border-l-0 p-2">
                <StructureTrieRows nodes={trie.children} depth={0} pathPrefix="" activeFile={resolvedActiveFile} onPick={setActiveFile} />
              </PanelChrome>
              <div className="min-w-0 flex-1 overflow-y-auto p-3">
                {!resolvedActiveFile ? (
                  <p className="text-sm text-zinc-500">Select a file.</p>
                ) : activeIsImage ? (
                  <img
                    src={`data:${imageMimeFromKey(resolvedActiveFile)};base64,${activeSource}`}
                    alt={resolvedActiveFile}
                    className="max-w-full rounded-lg border border-white/10"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-100">{activeSource}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
