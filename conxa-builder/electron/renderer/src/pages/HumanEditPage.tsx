import { type ChangeEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { HumanEditPoolBadge } from '@/components/EntitlementMeters'
import type { WorkflowResponse } from '@/types/workflow'
import {
  confirmOptionalInterstitial,
  deleteStep,
  errorMessage,
  fetchMetrics,
  fetchRecordingScreenshots,
  fetchSkillList,
  fetchWorkflow,
  postApplyRecordingVisual,
  postApplyStepFrame,
  postClearStepVisual,
  postInsertStep,
  postReorder,
  postSignOff,
  redoWorkflow,
  undoWorkflow,
} from '@/api/workflowApi'
import { RecordingScreenshotsPanel } from '@/components/RecordingScreenshotsPanel'
import { WorkflowPlanPanel } from '@/components/WorkflowPlanPanel'
import { CompileHealthBanner } from '@/components/CompileHealthBanner'
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel'
import { WorkflowViewer } from '@/components/WorkflowViewer'
import { InlineRetargetFlow, type InlineRetargetFlowHandle } from '@/components/retarget/InlineRetargetFlow'
import { SuggestionsInlinePanel } from '@/components/SuggestionsPanel'
import { ParameterizationInlinePanel } from '@/components/ParameterizationDrawer'
import { useEditorStore } from '@/store/editorStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoHint } from '@/components/ui/info-hint'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { editorHelp } from '@/lib/editorHelp'
import { fieldSelectClass } from '@/lib/fieldStyles'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  Copy,
  Home,
  Image as ImageIcon,
  Lightbulb,
  type LucideIcon,
  Map as MapIcon,
  Redo2,
  RefreshCw,
  SlidersHorizontal,
  Undo2,
  Wrench,
} from 'lucide-react'
import type { HelpEntry } from '@/lib/editorHelp'

type ToolPaneKey = 'suggestions' | 'variables' | 'screenshots' | 'workflowPlan' | 'diagnostics'

const SKILL_ID_CAPTION_CLASS =
  'max-w-[12rem] truncate font-mono text-[10px] leading-none text-zinc-500 sm:max-w-[16rem]'

const FLOW_STEPS = ['Record', 'Compile', 'Edit', 'Approve'] as const

/** Compact "how editing works" strip for newcomers on the landing screen. */
function FlowExplainer() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
      {FLOW_STEPS.map((step, i) => (
        <span key={step} className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-md border px-1.5 py-0.5 font-medium',
              step === 'Edit'
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-white/10 bg-white/[0.03] text-zinc-400',
            )}
          >
            {step}
          </span>
          {i < FLOW_STEPS.length - 1 ? <span className="text-zinc-600">→</span> : null}
        </span>
      ))}
    </div>
  )
}

export function HumanEditPage() {
  const EDITOR_SIDEBAR_WIDTH_KEY = 'ai-native-editor-sidebar-width'
  const EDITOR_SIDEBAR_MIN = 280
  const EDITOR_SIDEBAR_MAX = 560
  const { skillId } = useParams<{ skillId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromPath = searchParams.get('from') ? decodeURIComponent(searchParams.get('from')!) : null
  const qc = useQueryClient()
  const [flowStatus, setFlowStatus] = useState('Load a saved skill to edit, or go home to record a new one.')
  const [resumePick, setResumePick] = useState('')
  const [manualSkillId, setManualSkillId] = useState('')
  const [workflowPaneWidth, setWorkflowPaneWidth] = useState(340)
  const [isResizingPane, setIsResizingPane] = useState(false)
  const [openTool, setOpenTool] = useState<ToolPaneKey | null>(null)
  const [showAllScreenshots, setShowAllScreenshots] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const splitPaneRef = useRef<HTMLDivElement | null>(null)
  const stepEditorRef = useRef<InlineRetargetFlowHandle>(null)
  const selected = useEditorStore((s) => s.selectedStepIndex)
  const setValidationReport = useEditorStore((s) => s.setValidationReport)
  const setSelectedStepIndex = useEditorStore((s) => s.setSelectedStepIndex)
  const canUndo = useEditorStore((s) => s.canUndo)
  const canRedo = useEditorStore((s) => s.canRedo)
  const dirtyCount = useEditorStore((s) => s.dirtySteps.size)
  const setHistoryState = useEditorStore((s) => s.setHistoryState)
  const resetHistory = useEditorStore((s) => s.resetHistory)

  // Only used by the "Resume a skill" picker on the no-skill-selected landing state
  // below — skip the full skills-directory scan entirely when a skill is already
  // open (e.g. arriving here via a "Review" link), since the result is unused then.
  const skillsListQ = useQuery({
    queryKey: ['skillList'],
    queryFn: fetchSkillList,
    staleTime: 60_000,
    enabled: !skillId,
  })

  const q = useQuery({
    queryKey: ['workflow', skillId],
    queryFn: () => fetchWorkflow(skillId as string),
    enabled: Boolean(skillId),
    staleTime: 30_000,
  })

  const version = Number((q.data?.package_meta.version as number) ?? 0)
  const savedSkills = skillsListQ.data?.skills ?? []

  const onWorkflowUpdated = useCallback(
    (wf: WorkflowResponse) => {
      if (!skillId) return
      qc.setQueryData(['workflow', skillId], wf)
    },
    [qc, skillId],
  )

  const currentStep = useMemo(() => {
    if (!q.data || selected === null) return null
    return q.data.steps.find((s) => s.step_index === selected) ?? null
  }, [q.data, selected])

  useEffect(() => {
    if (skillId) {
      setFlowStatus('Editing workflow.')
      resetHistory()
    }
  }, [skillId, resetHistory])

  const onHistoryUpdate = useCallback(
    (canUndo: boolean, canRedo: boolean) => setHistoryState(canUndo, canRedo),
    [setHistoryState],
  )

  useEffect(() => {
    if (!q.data) return
    if (q.data.steps.length === 0) {
      setSelectedStepIndex(null)
      return
    }
    if (selected === null || !q.data.steps.some((step) => step.step_index === selected)) {
      setSelectedStepIndex(q.data.steps[0].step_index)
    }
  }, [q.data, selected, setSelectedStepIndex])

  useEffect(() => {
    const stored = window.localStorage.getItem(EDITOR_SIDEBAR_WIDTH_KEY)
    if (!stored) return
    const parsed = Number.parseInt(stored, 10)
    if (Number.isNaN(parsed)) return
    setWorkflowPaneWidth(Math.max(EDITOR_SIDEBAR_MIN, Math.min(EDITOR_SIDEBAR_MAX, parsed)))
  }, [])

  useEffect(() => {
    window.localStorage.setItem(EDITOR_SIDEBAR_WIDTH_KEY, String(workflowPaneWidth))
  }, [workflowPaneWidth])

  useEffect(() => {
    if (!isResizingPane) return
    const onMouseMove = (event: MouseEvent) => {
      const rect = splitPaneRef.current?.getBoundingClientRect()
      if (!rect) return
      const proposed = event.clientX - rect.left
      const nextWidth = Math.max(EDITOR_SIDEBAR_MIN, Math.min(EDITOR_SIDEBAR_MAX, proposed))
      setWorkflowPaneWidth(nextWidth)
    }
    const onMouseUp = () => {
      setIsResizingPane(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingPane])

  const handleUndo = useCallback(async () => {
    if (!skillId || !canUndo) return
    try {
      const r = await undoWorkflow(skillId)
      onWorkflowUpdated(r.workflow)
      setHistoryState(r.can_undo, r.can_redo)
      toast.success('Undone')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not undo'))
    }
  }, [skillId, canUndo, onWorkflowUpdated, setHistoryState])

  const handleRedo = useCallback(async () => {
    if (!skillId || !canRedo) return
    try {
      const r = await redoWorkflow(skillId)
      onWorkflowUpdated(r.workflow)
      setHistoryState(r.can_undo, r.can_redo)
      toast.success('Redone')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not redo'))
    }
  }, [skillId, canRedo, onWorkflowUpdated, setHistoryState])

  useEffect(() => {
    if (!skillId) return
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase()
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable
      if (isEditable) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        void handleUndo()
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        void handleRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [skillId, handleUndo, handleRedo])

  const onReorder = (newOrder: number[]) => {
    if (!skillId) return
    const prevSelected = useEditorStore.getState().selectedStepIndex
    postReorder(skillId, newOrder)
      .then((r) => {
        onWorkflowUpdated(r.workflow)
        if (r.can_undo !== undefined) setHistoryState(r.can_undo, r.can_redo ?? false)
        if (prevSelected !== null) {
          const newPos = newOrder.findIndex((origIdx) => origIdx === prevSelected)
          if (newPos !== -1) useEditorStore.getState().setSelectedStepIndex(newPos)
        }
      })
      .catch((err) => {
        toast.error(errorMessage(err, 'Could not reorder steps'))
        void q.refetch()
      })
  }

  const onDelete = async (index: number) => {
    if (!skillId) return
    if (index === selected) {
      const savedOk = await (stepEditorRef.current?.submitIfDirty() ?? Promise.resolve(true))
      if (!savedOk) {
        toast.error('Could not save the open step — fix errors before deleting.')
        return
      }
    }
    deleteStep(skillId, index)
      .then((r) => {
        onWorkflowUpdated(r.workflow)
        if (r.can_undo !== undefined) setHistoryState(r.can_undo, r.can_redo ?? false)
        useEditorStore.getState().reindexDirtyAfterDelete(index)
        const n = r.workflow.steps.length
        const sel = useEditorStore.getState().selectedStepIndex
        if (n === 0) {
          useEditorStore.getState().setSelectedStepIndex(null)
          return
        }
        if (sel === null) {
          useEditorStore.getState().setSelectedStepIndex(0)
          return
        }
        if (index < sel) useEditorStore.getState().setSelectedStepIndex(sel - 1)
        else if (index === sel) useEditorStore.getState().setSelectedStepIndex(Math.min(sel, n - 1))
      })
      .catch((err: Error) => {
        toast.error(errorMessage(err, 'Could not delete step'))
        void q.refetch()
      })
  }

  const onConfirmOptionalHint = (index: number) => {
    if (!skillId) return
    confirmOptionalInterstitial(skillId, index)
      .then((r) => {
        onWorkflowUpdated(r.workflow)
        if (r.can_undo !== undefined) setHistoryState(r.can_undo, r.can_redo ?? false)
        toast.success('Step converted to an optional try-dismiss branch')
      })
      .catch((err) => {
        toast.error(errorMessage(err, 'Could not confirm this step as optional'))
        void q.refetch()
      })
  }

  const onAddAction = async (actionKind: string) => {
    if (!skillId) return
    const savedOk = await (stepEditorRef.current?.submitIfDirty() ?? Promise.resolve(true))
    if (!savedOk) {
      toast.error('Could not save the open step before adding an action.')
      return
    }
    const currentSteps = q.data?.steps ?? []
    const insertAfter = selected === null ? (currentSteps.length > 0 ? currentSteps.length - 1 : null) : selected
    try {
      const res = await postInsertStep(skillId, {
        action_kind: actionKind,
        insert_after: insertAfter,
      })
      onWorkflowUpdated(res.workflow)
      if (res.can_undo !== undefined) setHistoryState(res.can_undo, res.can_redo ?? false)
      const nextIndex = insertAfter === null ? res.workflow.steps.length - 1 : insertAfter + 1
      useEditorStore.getState().setSelectedStepIndex(nextIndex)
      toast.success('Action added')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add action'))
    }
  }

  const approveWorkflow = async () => {
    if (!skillId) return
    const savedOk = await (stepEditorRef.current?.submitIfDirty() ?? Promise.resolve(true))
    if (!savedOk) {
      toast.error('Could not save the open step — fix errors or tap Save step, then try Approve.')
      return
    }
    const dirtySteps = useEditorStore.getState().dirtySteps
    if (dirtySteps.size > 0) {
      const label =
        dirtySteps.size === 1
          ? `step ${[...dirtySteps][0]}`
          : `${dirtySteps.size} steps (${[...dirtySteps].sort((a, b) => a - b).join(', ')})`
      toast.warning(`Still have unsaved changes on ${label} — switch to each and save before approving`)
      return
    }
    let signOff
    try {
      signOff = await postSignOff(skillId)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not approve this workflow — please try again.'))
      return
    }
    setFlowStatus('Approved; your skill stays the same id and title on disk.')
    void qc.invalidateQueries({ queryKey: ['skillList'] })
    if (signOff.built) {
      toast.success(`${skillId} approved and built — ready to test.`)
      navigate('/test')
      return
    }
    if (signOff.build_error) {
      toast.error(`Approved, but the package failed to build: ${signOff.build_error}`)
    } else if (signOff.waiting_on.length > 0) {
      toast.success(
        `Approved. Waiting on ${signOff.waiting_on.length === 1 ? signOff.waiting_on[0] : `${signOff.waiting_on.length} other workflows`} before this plugin can build.`,
      )
    } else {
      toast.success(`${skillId} saved in place — same skill id as when you compiled from the recording.`)
    }
    navigate(fromPath ?? '/edit')
  }

  const onDroppedRecordingScreenshot = useCallback(
    async (stepIndex: number, eventIndex: number, frameLabel?: string) => {
      if (!skillId) return
      try {
        const res = await postApplyRecordingVisual(skillId, stepIndex, {
          event_index: eventIndex,
          frame_label: frameLabel,
        })
        onWorkflowUpdated(res.workflow)
        if (res.can_undo !== undefined) setHistoryState(res.can_undo, res.can_redo ?? false)
        useEditorStore.getState().clearStepDirty(stepIndex)
        void qc.invalidateQueries({ queryKey: ['recordingScreenshots', skillId] })
        toast.success('Screenshot attached — anchors recomputed')
      } catch (err) {
        toast.error(errorMessage(err, 'Could not apply recording screenshot'))
      }
    },
    [onWorkflowUpdated, qc, setHistoryState, skillId],
  )

  const allScreenshotsQ = useQuery({
    queryKey: ['recordingScreenshots', skillId],
    queryFn: () => fetchRecordingScreenshots(skillId as string),
    enabled: !!skillId && openTool === 'screenshots' && showAllScreenshots,
  })

  const onSelectAllScreenshot = useCallback(
    (eventIndex: number, frameLabel: string) => {
      if (selected === null) return
      void onDroppedRecordingScreenshot(selected, eventIndex, frameLabel)
    },
    [onDroppedRecordingScreenshot, selected],
  )

  const onClearStepVisual = useCallback(
    async (stepIndex: number) => {
      if (!skillId) return
      try {
        const res = await postClearStepVisual(skillId, stepIndex)
        onWorkflowUpdated(res.workflow)
        if (res.can_undo !== undefined) setHistoryState(res.can_undo, res.can_redo ?? false)
        useEditorStore.getState().clearStepDirty(stepIndex)
        toast.success('Screenshot removed — anchors cleared')
      } catch (err) {
        toast.error(errorMessage(err, 'Could not remove screenshot'))
      }
    },
    [onWorkflowUpdated, setHistoryState, skillId],
  )

  const onApplyStepFrame = useCallback(
    async (frameLabel: string) => {
      if (!skillId || selected === null) return
      try {
        const res = await postApplyStepFrame(skillId, selected, frameLabel)
        onWorkflowUpdated(res.workflow)
        if (res.can_undo !== undefined) setHistoryState(res.can_undo, res.can_redo ?? false)
        useEditorStore.getState().clearStepDirty(selected)
        toast.success('Frame applied — anchors recomputed')
      } catch (err) {
        toast.error(errorMessage(err, 'Could not apply frame'))
      }
    },
    [onWorkflowUpdated, selected, setHistoryState, skillId],
  )

  const openSkillForEdit = useCallback(
    (id: string) => {
      const sid = id.trim()
      if (!sid) {
        setFlowStatus('Enter or choose a skill id.')
        toast.error('Enter or pick a skill id first.')
        return
      }
      setSelectedStepIndex(0)
      setValidationReport(null)
      setFlowStatus(`Opened skill ${sid} for editing.`)
      navigate(`/edit/${sid}`)
      void qc.invalidateQueries({ queryKey: ['workflow', sid] })
      void qc.invalidateQueries({ queryKey: ['skillList'] })
    },
    [qc, navigate, setSelectedStepIndex, setValidationReport],
  )

  const refreshMetrics = useCallback(() => {
    fetchMetrics()
      .then((data) => {
        setMetrics(data)
        toast.message('Metrics refreshed')
      })
      .catch((err: Error) => {
        setMetrics({ error: err.message })
        toast.error('Could not load metrics')
      })
  }, [])

  if (!skillId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader
          title="Edit Skill"
          description="After recording compiles into a skill, open it here — your edits overwrite that same skill package (same id/title)."
          actions={
            <>
              <Button variant="outline" size="sm" asChild className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]">
                <Link to="/record">
                  <Home className="size-3.5" />
                  Home
                </Link>
              </Button>
            </>
          }
        />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card className="border-white/8 bg-white/[0.035] shadow-none">
              <CardHeader className="border-b border-white/8">
                <CardTitle className="flex items-center gap-2 text-white">
                  Open a skill
                  <InfoHint {...editorHelp.openSkill} side="bottom" align="start" />
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Fine-tune a compiled workflow, then Approve to save it back to the same skill.
                </CardDescription>
                <FlowExplainer />
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <fieldset className="space-y-4 rounded-xl border border-white/8 bg-black/20 p-4">
                  <legend className="flex items-center gap-1.5 px-1.5 text-sm font-semibold text-zinc-200">
                    <span>Resume a skill</span>
                    <InfoHint {...editorHelp.resume} side="top" align="start" />
                  </legend>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label className="text-zinc-200" htmlFor="resume">
                        Saved skills
                      </Label>
                      <div className="relative">
                        <select
                          id="resume"
                          className={cn(
                            fieldSelectClass,
                            'h-10 appearance-none border-white/10 bg-black/30 pr-10 text-zinc-100 transition-colors hover:border-white/20 focus-visible:border-white/25',
                          )}
                          value={resumePick}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                            setResumePick(e.target.value)
                            setManualSkillId('')
                          }}
                        >
                          <option value="" className="bg-zinc-950 text-zinc-200">
                            Choose a skill to resume...
                          </option>
                          {savedSkills.map((s) => (
                            <option key={s.skill_id} value={s.skill_id} className="bg-zinc-950 text-zinc-100">
                              {s.title} - v{s.version} - {s.step_count} steps
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                      </div>
                      <p className="text-xs text-zinc-500">
                        {savedSkills.length > 0
                          ? `${savedSkills.length} saved skill${savedSkills.length === 1 ? '' : 's'} available`
                          : 'No saved skills yet. Enter a skill id manually to continue.'}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-zinc-200" htmlFor="manualId">
                        Or enter skill id
                      </Label>
                      <Input
                        id="manualId"
                        type="text"
                        placeholder="skill_abc123"
                        value={manualSkillId}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          setManualSkillId(e.target.value)
                          setResumePick('')
                        }}
                        className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="brand" onClick={() => openSkillForEdit(resumePick || manualSkillId)}>
                      Load and edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void skillsListQ.refetch()}
                      disabled={skillsListQ.isFetching}
                      className="gap-1.5 border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                    >
                      <RefreshCw className={cn('size-3.5', skillsListQ.isFetching && 'animate-spin')} />
                      Refresh list
                    </Button>
                  </div>
                  {skillsListQ.isError ? (
                    <p className="text-sm text-red-300" role="alert">
                      {(skillsListQ.error as Error).message}
                    </p>
                  ) : null}
                </fieldset>

                <p className="text-sm text-zinc-500" role="status" aria-live="polite">
                  {flowStatus}
                </p>
              </CardContent>
            </Card>

            <Card className="border-white/8 bg-white/[0.035] shadow-none">
              <CardHeader className="border-b border-white/8">
                <CardTitle className="flex items-center gap-2 text-white">
                  Diagnostics
                  <Badge variant="outline" className="border-white/10 text-[0.6rem] font-normal uppercase tracking-wide text-zinc-500">
                    Technical
                  </Badge>
                  <InfoHint {...editorHelp.diagnostics} side="bottom" align="end" className="ml-auto" />
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Optional behind-the-scenes signals. You don't need these to edit — they help when reporting an issue.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-6">
                <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-sm text-zinc-300 outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-brand-ring"
                    >
                      <span>{diagnosticsOpen ? 'Hide raw metrics' : 'Show raw metrics'}</span>
                      <ChevronDown className={cn('size-4 text-zinc-500 transition-transform duration-200', diagnosticsOpen && 'rotate-180')} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="mt-3 h-64 rounded-lg border border-white/8 bg-black/20 p-3">
                      <pre className="font-mono text-xs leading-6 break-words whitespace-pre-wrap text-zinc-400">
                        {JSON.stringify(metrics ?? { info: 'Click "Refresh metrics"' }, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
                <Button
                  type="button"
                  variant="outline"
                  onClick={refreshMetrics}
                  className="w-full gap-1.5 border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                >
                  <RefreshCw className="size-3.5" />
                  Refresh metrics
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    )
  }

  if (q.isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Edit Skill" description="Preparing the workflow editor and loading steps." />
        <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:px-6">
          <div className="bg-muted/15 border-border/60 max-w-2xl rounded-lg border p-4 shadow-sm">
            <Skeleton className="mb-2 h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:min-h-0 md:grid-cols-3">
            <Skeleton className="h-full min-h-[220px] rounded-lg md:min-h-0" />
            <Skeleton className="h-full min-h-[220px] rounded-lg md:min-h-0" />
            <Skeleton className="h-full min-h-[220px] rounded-lg md:min-h-0" />
          </div>
        </div>
      </div>
    )
  }
  if (q.isError) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Edit Skill" description="The skill could not be opened." />
        <main className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-md border-red-500/20 bg-red-500/5 shadow-none">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300">
                  <AlertCircle className="size-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base text-white">Failed to load skill</CardTitle>
                  <CardDescription className="break-words text-red-200">{(q.error as Error).message}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="default" asChild className="bg-white text-black hover:bg-zinc-200">
                <Link to={fromPath ?? '/edit'}>
                  {fromPath ? 'Back to Plugin' : 'Back to choose skill'}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }
  if (!q.data) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Edit Skill" description="The editor did not receive workflow data." />
        <main className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-md border-white/10 bg-white/[0.04] shadow-none">
            <CardHeader>
              <CardTitle className="text-base text-white">No workflow data</CardTitle>
              <CardDescription className="text-zinc-400">
                The compiled skill opened, but Build Studio did not receive a workflow payload. Go back to the
                plugin and open the compiled workflow again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="default" asChild className="bg-white text-black hover:bg-zinc-200">
                <Link to={fromPath ?? '/plugins'}>{fromPath ? 'Back to Plugin' : 'Back to Plugins'}</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const wf = q.data
  const skillTitle =
    typeof wf.package_meta.title === 'string' && wf.package_meta.title.trim()
      ? wf.package_meta.title.trim()
      : skillId
  const suggestionCount = wf.suggestions.length
  const splitPaneStyle = {
    ['--workflow-pane-width' as string]: `${workflowPaneWidth}px`,
  } as CSSProperties

  const toolPanes: {
    key: ToolPaneKey
    label: string
    icon: LucideIcon
    iconClass: string
    help: HelpEntry
    controls: string
    count?: number | string
  }[] = [
    { key: 'suggestions', label: 'Suggestions', icon: Lightbulb, iconClass: 'text-amber-300', help: editorHelp.toolSuggestions, controls: 'suggestions-modal', count: suggestionCount },
    { key: 'variables', label: 'Input variables', icon: SlidersHorizontal, iconClass: 'text-sky-300', help: editorHelp.toolVariables, controls: 'variables-modal' },
    { key: 'workflowPlan', label: 'Workflow plan', icon: MapIcon, iconClass: 'text-violet-300', help: editorHelp.toolWorkflowPlan, controls: 'workflow-plan-modal' },
    { key: 'diagnostics', label: 'Diagnostics', icon: Wrench, iconClass: 'text-zinc-400', help: editorHelp.toolDiagnostics, controls: 'diagnostics-modal' },
  ]
  // Not a top-bar tab — opened from the "Recording screenshots" button inside the Pick
  // Element phase of the re-target wizard, but reuses the same dialog/state machinery.
  const screenshotsTool = {
    key: 'screenshots' as const,
    label: 'Recording screenshots',
    icon: ImageIcon,
    iconClass: 'text-fuchsia-300',
    help: editorHelp.toolScreenshots,
    controls: 'recording-screenshots-modal',
    count: currentStep?.screenshot?.frames?.length ?? '—',
  }
  const activeTool = openTool === 'screenshots' ? screenshotsTool : (toolPanes.find((t) => t.key === openTool) ?? null)

  return (
    <TooltipProvider>
    <div className="flex h-full min-h-0 flex-col">
    <PageHeader
      title={`Skill: ${skillTitle}`}
      description={
        skillId ? (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide leading-none text-zinc-600">
                Skill id
              </span>
              <span className={cn(SKILL_ID_CAPTION_CLASS, 'min-w-0 text-left')} title={skillId}>
                {skillId}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 shrink-0 p-0 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 [&_svg]:size-2.5"
                    aria-label="Copy skill id"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(skillId)
                        .then(() => toast.success('Skill id copied'))
                        .catch(() => toast.error('Could not copy'))
                    }
                  >
                    <Copy className="size-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy skill id</TooltipContent>
              </Tooltip>
            </div>
            {version > 0 && (
              <Badge variant="outline" className="border-white/10 font-mono text-[0.65rem] text-zinc-500">
                v{version}
              </Badge>
            )}
          </div>
        ) : null
      }
      actions={
        <div className="flex w-full items-center gap-3">
          {fromPath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-white/12 bg-white/[0.045] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                  onClick={() => navigate(fromPath)}
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to plugin</TooltipContent>
            </Tooltip>
          )}
          {/* Inspector tool-launchers live on the LEFT (secondary "views"); the primary
              commit cluster (pool / unsaved / undo-redo / Approve) is pinned RIGHT via
              ml-auto. This spreads the row across its full width instead of jamming
              everything right, so the tools sit at their natural width with no scroll. */}
          <div className="flex h-9 items-center overflow-hidden rounded-md border border-white/12 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {toolPanes.map((tool, i) => {
              const Icon = tool.icon
              const active = openTool === tool.key
              return (
                <div key={tool.key} className="flex h-full items-center">
                  {i > 0 && <div className="h-5 w-px bg-white/12" />}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={active}
                        aria-controls={tool.controls}
                        className={cn(
                          'h-full gap-1.5 rounded-none px-3 text-zinc-300 hover:bg-white/[0.07] hover:text-white',
                          active && 'bg-brand/14 text-brand hover:bg-brand/18 hover:text-brand',
                        )}
                        onClick={() => setOpenTool(tool.key)}
                      >
                        <Icon className={cn('size-3.5 shrink-0', !active && tool.iconClass)} />
                        <span className="hidden text-xs font-medium lg:inline">{tool.label}</span>
                        {tool.count !== undefined && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'shrink-0 px-1.5 text-[0.65rem] font-semibold',
                              active ? 'border-brand/40 text-brand' : 'border-white/15 text-zinc-400',
                            )}
                          >
                            {tool.count}
                          </Badge>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{tool.label}</TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <HumanEditPoolBadge className="h-9" />
          {dirtyCount > 0 && (
            <span
              className="hidden h-9 items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/10 px-2.5 text-[0.7rem] font-medium text-amber-200 sm:inline-flex"
              role="status"
              aria-live="polite"
            >
              <span className="size-1.5 rounded-full bg-amber-300" aria-hidden />
              {dirtyCount} unsaved
            </span>
          )}
          <div className="flex h-9 items-center overflow-hidden rounded-md border border-white/12 bg-white/[0.045]">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-full rounded-none px-3 text-zinc-300 hover:bg-white/[0.07] hover:text-white disabled:opacity-30"
                  onClick={() => void handleUndo()}
                  disabled={!canUndo}
                  aria-label="Undo"
                >
                  <Undo2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo · Ctrl+Z</TooltipContent>
            </Tooltip>
            <div className="h-5 w-px bg-white/12" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-full rounded-none px-3 text-zinc-300 hover:bg-white/[0.07] hover:text-white disabled:opacity-30"
                  onClick={() => void handleRedo()}
                  disabled={!canRedo}
                  aria-label="Redo"
                >
                  <Redo2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo · Ctrl+Y</TooltipContent>
            </Tooltip>
          </div>
          <div className="hidden h-7 w-px bg-white/15 sm:block" aria-hidden />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="brand"
                size="sm"
                className="ring-brand-ring/50 h-9 gap-1.5 px-4 text-sm font-semibold ring-1"
                onClick={() => void approveWorkflow()}
              >
                <BadgeCheck className="size-4" aria-hidden />
                Approve
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign off this workflow — builds the package and moves to Test Skill</TooltipContent>
          </Tooltip>
          </div>
        </div>
      }
      className="py-3.5"
    />
    <CompileHealthBanner compileHealth={wf.compile_health} onOpenDiagnostics={() => setOpenTool('diagnostics')} />
    <div
      ref={splitPaneRef}
        className="relative grid flex-1 min-h-0 w-full min-w-0 grid-cols-1 overflow-hidden border-t border-white/8 md:min-h-0 md:[grid-template-columns:var(--workflow-pane-width)_minmax(0,1fr)] md:items-stretch"
        style={splitPaneStyle}
      >
        <WorkflowViewer
          steps={wf.steps}
          onReorder={onReorder}
          onDelete={onDelete}
          onConfirmOptionalHint={onConfirmOptionalHint}
          onAddAction={(actionKind) => void onAddAction(actionKind)}
          onDroppedRecordingScreenshot={(stepIndex, eventIndex) =>
            void onDroppedRecordingScreenshot(stepIndex, eventIndex)
          }
          onClearStepVisual={(stepIndex) => void onClearStepVisual(stepIndex)}
        />
        <div
          className="group absolute inset-y-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize md:block"
          style={{ left: workflowPaneWidth }}
          onMouseDown={(event) => {
            event.preventDefault()
            setIsResizingPane(true)
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workflow sidebar"
        >
          <div className="mx-auto h-full w-px bg-white/10 transition-colors group-hover:bg-white/35 group-active:bg-white/45" />
        </div>
        <InlineRetargetFlow
          key={currentStep?.id ?? 'empty-step-editor'}
          ref={stepEditorRef}
          step={currentStep}
          skillId={skillId}
          onWorkflowUpdated={onWorkflowUpdated}
          onHistoryUpdate={onHistoryUpdate}
          onOpenScreenshots={() => setOpenTool('screenshots')}
          screenshotCount={screenshotsTool.count}
        />
      </div>
    </div>
    <Dialog
      open={activeTool !== null}
      onOpenChange={(open) => {
        if (!open) {
          setOpenTool(null)
          setShowAllScreenshots(false)
        }
      }}
    >
      <DialogContent
        className={cn(
          // sm:max-w-none is required: the base DialogContent sets sm:max-w-sm (384px),
          // and an unprefixed max-w-none does NOT override a sm:-prefixed class (different
          // tailwind-merge scope), so without this every tool dialog was silently clamped
          // to 384px and its content overflowed/clipped instead of using the width below.
          'anim-pop flex h-[min(85vh,880px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none',
          activeTool?.key === 'screenshots'
            ? 'w-[min(1500px,96vw)]'
            : activeTool?.key === 'variables'
              ? 'w-[min(1400px,96vw)]'
              : 'w-[min(1100px,94vw)]',
        )}
        id={activeTool?.controls}
      >
        {activeTool && (
          <>
            <DialogHeader className="flex-col gap-3 border-b border-white/8 py-4 pl-5 pr-12">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                  <activeTool.icon className={cn('size-4.5', activeTool.iconClass)} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <DialogTitle className="flex items-center gap-2 text-base leading-none">
                    <span className="truncate">{activeTool.label}</span>
                    {activeTool.count !== undefined && (
                      <Badge variant="outline" className="shrink-0 border-brand/40 text-[0.65rem] text-brand">
                        {activeTool.count}
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 max-w-2xl">{activeTool.help.summary}</DialogDescription>
                </div>
                <InfoHint {...activeTool.help} side="bottom" align="end" triggerLabel={`About ${activeTool.label}`} />
              </div>
              {activeTool.key === 'screenshots' && (
                <div className="flex justify-end pl-12">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 whitespace-nowrap"
                    onClick={() => setShowAllScreenshots((v) => !v)}
                  >
                    <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                    {showAllScreenshots ? 'Show 5 frames for this step' : 'Show all recording screenshots'}
                  </Button>
                </div>
              )}
            </DialogHeader>
            {activeTool.key === 'variables' ? (
              // Own bounded flex layout (not the shared ScrollArea below): its footer sits
              // below an internal, properly height-constrained scroll region instead of
              // scrolling out of view at the end of an unbounded content column.
              <ParameterizationInlinePanel workflow={wf} onSaved={onWorkflowUpdated} />
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-5">
                  {activeTool.key === 'suggestions' && <SuggestionsInlinePanel suggestions={wf.suggestions} />}
                  {activeTool.key === 'screenshots' && (
                    <RecordingScreenshotsPanel
                      frames={currentStep?.screenshot?.frames ?? []}
                      activeFrameLabel={currentStep?.screenshot?.default_frame_label ?? null}
                      canClearVisual={!!currentStep && !currentStep.flags.is_scroll}
                      onApplyFrame={currentStep && !currentStep.flags.is_scroll ? onApplyStepFrame : undefined}
                      onClearVisual={selected !== null ? () => void onClearStepVisual(selected) : undefined}
                      showAllFrames={showAllScreenshots}
                      allItems={allScreenshotsQ.data?.items}
                      isLoadingAllFrames={allScreenshotsQ.isLoading}
                      onSelectAllFrame={
                        currentStep && !currentStep.flags.is_scroll ? onSelectAllScreenshot : undefined
                      }
                    />
                  )}
                  {activeTool.key === 'workflowPlan' && <WorkflowPlanPanel workflow={wf} />}
                  {activeTool.key === 'diagnostics' && <DiagnosticsPanel workflow={wf} currentStep={currentStep} />}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  )
}
