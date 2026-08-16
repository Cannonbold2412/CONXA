import { cmd } from '@/lib/ipc'
import type { BackendEvent } from '@/lib/ipc'

export type Workflow = {
  id: string
  slug: string
  name: string
  owner_user_id: string
  group_id: string
  target_url: string
  protected_url: string
  protected_url_marker_text: string
  status: 'needs_auth' | 'ready' | 'error'
  created_at: number
  updated_at: number
  // The single recording this workflow holds.
  session_id: string | null
  recorded_at: number | null
  recording_status: 'recorded' | 'compiled' | 'error' | null
  skill_id: string | null
  edited_at: number | null
  last_test_at: number | null
  last_test_status: 'passed' | 'failed' | 'never'
  last_test_error: string | null
  last_test_inputs: Record<string, unknown>
  signed_off: boolean
  compile_status: 'ok' | 'review_needed' | 'failed' | null
  compile_min_confidence: number | null
  compile_steps_with_warnings: number | null
  stage: 'recording' | 'ready_to_compile' | 'queued' | 'compiling' | 'needs_review' | 'needs_test' | 'ready' | 'error'
  step_count?: number
}

export type WorkflowsResponse = { workflows: Workflow[] }

export type SkillPackBuild = {
  last_built_at: number
  output_path: string
  version: string
}

export type SkillPackInstaller = {
  built_at: number
  installer_path: string
  filename: string
  version: string
  runtime_version: string
  release_notes?: string
}

/** The one shared package every workflow in the workspace compiles into —
 * see conxa_core.models.workflow.SkillPack. */
export type SkillPack = {
  workspace_id: string
  company_slug: string
  company_name: string
  status: 'idle' | 'building' | 'error'
  build: SkillPackBuild | null
  installer: SkillPackInstaller | null
  created_at: number
  updated_at: number
}

export type RunEvent = {
  event: 'step_failure' | 'recovery_attempt' | 'run_outcome'
  run_id: string
  workflow_id: string
  skill_slug: string
  step_id: string | null
  data: Record<string, unknown>
  ts: string
}

export type RunOutcome = {
  status: 'success' | 'failure' | 'aborted'
  duration_ms: number
  total_steps: number
  recovered_steps: number
  failed_step_id: string | null
}

export type Run = {
  run_id: string
  workflow_id: string
  skill_slug: string
  events: RunEvent[]
  outcome: RunOutcome | null
}

export type RunsResponse = { runs: Run[] }

export type CompiledSkillFiles = {
  'execution.json': Record<string, unknown> | unknown[] | null
  'recovery.json': Record<string, unknown> | unknown[] | null
  'input.json': Record<string, unknown> | unknown[] | null
  'inputs.json'?: Record<string, unknown> | unknown[] | null
}

export type InstallerBuildResult = {
  installer_path: string
  filename: string
  company: string
  workspace_id: string
  version: string
  runtime_version: string
  release_notes?: string
  cloud_download_url?: string
  cloud_version_download_url?: string
  cloud_sha256?: string
  cloud_upload_error?: string
  cloud_upload_error_message?: string
  cloud_workspace_id?: string
  cloud_tracking_url?: string
  cloud_tracking_token_present?: boolean
  cloud_sync_endpoint?: string
  installed_runtime_path?: string
}

export type SkillPackReleaseResult = {
  slug: string
  version: string
  cloud_api?: string
  workspace_id: string
  tracking_url: string
  tracking_token_present: boolean
  sync_token_present: boolean
  sync_endpoint: string
  published_at?: number
}

export type SkillPackVersion = {
  slug: string
  version: string
  release_notes: string
  skills: string[]
  workspace_id: string
  owner_user_id?: string
  published_at: number
  files_written?: number
  is_latest: boolean
}

export type SkillPackVersionsResponse = { slug: string; versions: SkillPackVersion[] }

export type TrackingEvent = {
  e: string
  ts: number
  si?: number
  l?: number
  sc?: string
  fc?: string
  tier?: string
  dur?: number
  tot?: number
  rec?: number
  fsi?: number | null
}

export type TrackingRunSummary = {
  run_id: string
  workflow_id: string
  workflow_ver: string
  runtime_ver: string
  uid: string
  wid: string
  status: 'ok' | 'fail' | 'running'
  duration_ms: number
  total_steps: number
  recovered_steps: number
  failed_step_id: number | null
  failure_code: string | null
  started_at: number
  server_ts: number
}

export type TrackingRunsResponse = { runs: TrackingRunSummary[]; total: number }

export type TrackingRunDetail = {
  run_id: string
  company: string
  workflow_id: string
  workflow_ver: string
  runtime_ver: string
  uid: string
  wid: string
  timeline: TrackingEvent[]
}

export function normalizeWorkflowList(data: unknown): Workflow[] {
  if (Array.isArray(data)) return data as Workflow[]
  if (data && typeof data === 'object') {
    const workflows = (data as { workflows?: unknown }).workflows
    if (Array.isArray(workflows)) return workflows as Workflow[]
  }
  return []
}

export function fetchWorkflows(): Promise<WorkflowsResponse> {
  return cmd<WorkflowsResponse>('list_workflows')
}

export type SkillPackStatusWorkflow = {
  id: string
  name: string
  slug: string
  skill_id: string | null
  signed_off: boolean
  last_test_status: 'passed' | 'failed' | 'never'
}

/** Read-only status for the Publish / Build Installer pages — is the
 * workspace's shared skill package built yet, and what workflows are in it. */
export function fetchSkillPack(): Promise<{ skill_pack: SkillPack | null; workflows: SkillPackStatusWorkflow[] }> {
  return cmd('get_skill_pack')
}

export function fetchWorkflow(id: string): Promise<{ workflow: Workflow }> {
  return cmd<{ workflow: Workflow }>('get_workflow', { workflow_id: id })
}

export function createWorkflow(body: {
  name: string
  target_url: string
  group_id?: string
  protected_url?: string
  protected_url_marker_text?: string
}): Promise<{ workflow: Workflow }> {
  return cmd<{ workflow: Workflow }>('create_workflow', body)
}

export function deleteWorkflowEntity(id: string): Promise<{ deleted: boolean }> {
  return cmd<{ deleted: boolean }>('delete_workflow', { workflow_id: id })
}

export function getWorkflowRecordingStatus(sessionId: string): Promise<{
  session_id: string
  browser_open: boolean
  event_count: number
  ended_by_user: boolean
  binding_errors: string[]
  reached_wait_url?: boolean
  capture_hover?: boolean
  current_url?: string
}> {
  return cmd('get_recording_status', { session_id: sessionId })
}

export function startWorkflowRecord(
  workflowId: string,
  urlVariables?: Record<string, string>,
  captureHover = false,
): Promise<{
  session_id: string
  workflow_id: string
  downloads_dir?: string
  /** Non-blocking: a sibling app in this workflow's group looks signed out, but it
   * isn't required by this specific workflow, so recording started anyway. See
   * cmd_start_recording's expired_sibling_names handling. */
  warnings?: string[]
}> {
  return cmd('start_recording', {
    workflow_id: workflowId,
    auth_mode: false,
    url_variables: urlVariables ?? {},
    capture_hover: captureHover,
  })
}

export function finalizeWorkflow(
  workflowId: string,
  sessionId: string,
): Promise<{ status: string; session_id: string; workflow_id: string; workflow_kind: 'workflow' }> {
  return cmd<{ status: string; session_id: string; workflow_id: string; workflow_kind: 'workflow' }>(
    'stop_recording',
    { workflow_id: workflowId, session_id: sessionId },
  )
}

export function cancelRecording(
  sessionId: string,
  workflowId?: string,
): Promise<{ ok: boolean }> {
  return cmd<{ ok: boolean }>('cancel_recording', {
    session_id: sessionId,
    workflow_id: workflowId ?? '',
  })
}

/** Answers a "file_picker_request" event (see RecordWorkflowDialog) with the path(s) the
 * user chose in the Studio's own file-pick dialog, or `null` paths on cancel. */
export function resolveFilePicker(
  sessionId: string,
  requestId: string,
  paths: string[] | null,
): Promise<{ ok: boolean }> {
  return cmd<{ ok: boolean }>('resolve_file_picker', {
    session_id: sessionId,
    request_id: requestId,
    paths,
  })
}

export function deleteWorkflow(workflowId: string): Promise<{ deleted: boolean }> {
  return cmd<{ deleted: boolean }>('delete_workflow', { workflow_id: workflowId })
}

export function updateWorkflow(
  workflowId: string,
  body: { skill_id?: string | null; status?: string; name?: string; group_id?: string },
): Promise<{ workflow_id: string; skill_id: string | null; status: string; group_id: string; name: string }> {
  return cmd('update_workflow', { workflow_id: workflowId, ...body })
}

/** Subscribes to backend events of a given `kind` and forwards their `message`
 * to `onLog` for the duration of `fn`. Shared by buildSkillPackage/buildInstaller/
 * testWorkflow, which all stream progress lines this way. */
async function withKindLog<T>(kind: string, onLog: (message: string) => void, fn: () => Promise<T>): Promise<T> {
  const unsub = window.conxa.onEvent((ev: BackendEvent) => {
    if (ev.kind === kind && ev.message) onLog(String(ev.message))
  })
  try {
    return await fn()
  } finally {
    unsub()
  }
}

/** Workspace-scoped: compiles every signed-off workflow into the one shared
 * skill package. company_name is only required the first time this workspace
 * ever builds (nothing to derive it from otherwise). */
export function buildSkillPackage(
  companyName?: string,
  version = '0.1.0',
  onLog: (message: string) => void = () => {},
): Promise<SkillPackBuild> {
  return withKindLog('skill_package_build', onLog, () =>
    cmd<SkillPackBuild>('build_skill_package', { company_name: companyName, version }),
  )
}

export function buildInstaller(
  onLog: (message: string) => void = () => {},
  logoPath?: string | null,
  version?: string,
  releaseNotes?: string,
): Promise<InstallerBuildResult> {
  return withKindLog('installer_build', onLog, () =>
    cmd<InstallerBuildResult>('build_installer', {
      logo_path: logoPath ?? null,
      version,
      release_notes: releaseNotes,
    }),
  )
}

/** The primary, mandatory release-management action — publishes the workspace's
 * shared skill-pack release (version + release notes + built skill files) to
 * Conxa Cloud. Build Installer (above) is a secondary, advanced action that
 * requires a release to already exist. */
export function publishSkillPack(
  version: string,
  releaseNotes: string,
  onLog: (message: string) => void = () => {},
): Promise<SkillPackReleaseResult> {
  return withKindLog('skill_pack_publish', onLog, () =>
    cmd<SkillPackReleaseResult>('publish_skill_pack', {
      version,
      release_notes: releaseNotes,
    }),
  )
}

export function fetchSkillPackVersions(): Promise<SkillPackVersionsResponse> {
  return cmd<SkillPackVersionsResponse>('list_skill_pack_versions')
}

export function getCompiledSkill(
  skillSlug: string,
): Promise<{ workspace_id: string; skill_slug: string; files: CompiledSkillFiles }> {
  return cmd('get_compiled_skill', { skill_slug: skillSlug })
}

export function fetchRuns(workflowId?: string, since?: number): Promise<RunsResponse> {
  return cmd<RunsResponse>('list_runs', { workflow_id: workflowId, since })
}

export function fetchRun(runId: string): Promise<{ run: Run }> {
  return cmd<{ run: Run }>('get_run', { run_id: runId })
}

export function testWorkflow(
  workflowId: string,
  inputs: Record<string, unknown> = {},
  headless = false,
  onLog: (message: string) => void = () => {},
): Promise<unknown> {
  return withKindLog('workflow_test', onLog, () =>
    cmd('test_workflow', {
      workflow_id: workflowId,
      inputs,
      headless,
    }),
  )
}
