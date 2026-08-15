import { cmd } from '@/lib/ipc'
import type { Workflow } from '@/api/workflowsApi'
import type { WorkflowStage } from '@/components/StagePath'

export type GroupApp = {
  id: string
  name: string
  login_url: string
  success_url: string
  captured_at: number | null
  storage_state_path: string
  last_error: string
}

export type Group = {
  id: string
  slug: string
  name: string
  workspace_id: string
  apps: GroupApp[]
  created_at: number
  updated_at: number
}

export type GroupSummary = {
  id: string
  slug: string
  name: string
  workflow_count: number
  /** How this group's workflows are distributed across the lifecycle — keys are
   * only present for stages that have at least one workflow in them. */
  stages: Partial<Record<WorkflowStage, number>>
  /** The first few workflows in the group, so a group card can show its contents.
   * Capped server-side (WORKFLOW_PREVIEW_LIMIT); `workflow_count` holds the total. */
  workflow_preview: { id: string; name: string; stage: WorkflowStage }[]
  apps_total: number
  apps_authenticated: number
  ready: boolean
  created_at: number
  updated_at: number
}

export type GroupAppStatus = {
  id: string
  name: string
  login_url: string
  success_url: string
  state: 'ready' | 'missing' | 'expired'
  captured_at: number | null
  last_error: string
}

export type GroupAuthStatus = {
  group_id: string
  apps: GroupAppStatus[]
  apps_total: number
  apps_authenticated: number
  ready: boolean
  first_missing_app_id: string | null
}

export function fetchGroups(): Promise<{ groups: GroupSummary[] }> {
  return cmd('list_groups')
}

export function fetchGroup(groupId: string): Promise<{ group: Group; auth: GroupAuthStatus; workflows: Workflow[] }> {
  return cmd('get_group', { group_id: groupId })
}

export function createGroup(name: string): Promise<{ group: Group }> {
  return cmd('create_group', { name })
}

export function renameGroup(groupId: string, name: string): Promise<{ group: Group }> {
  return cmd('rename_group', { group_id: groupId, name })
}

export function deleteGroup(groupId: string): Promise<{ deleted: boolean; reassigned_to: string }> {
  return cmd('delete_group', { group_id: groupId })
}

export function addGroupApp(groupId: string, name: string, loginUrl: string, successUrl: string): Promise<{ group: Group }> {
  return cmd('add_group_app', { group_id: groupId, name, login_url: loginUrl, success_url: successUrl })
}

export function updateGroupApp(
  groupId: string,
  appId: string,
  body: { name?: string; login_url?: string; success_url?: string },
): Promise<{ group: Group }> {
  return cmd('update_group_app', { group_id: groupId, app_id: appId, ...body })
}

export function removeGroupApp(groupId: string, appId: string): Promise<{ group: Group }> {
  return cmd('remove_group_app', { group_id: groupId, app_id: appId })
}

export function getGroupAuthStatus(groupId: string): Promise<GroupAuthStatus> {
  return cmd('get_group_auth_status', { group_id: groupId })
}

export function startGroupAppAuth(
  groupId: string,
  appId: string,
): Promise<{ session_id: string; group_id: string; app_id: string; login_url: string }> {
  return cmd('start_group_app_auth', { group_id: groupId, app_id: appId })
}

export function finishGroupAppAuth(
  sessionId: string,
  groupId: string,
  appId: string,
): Promise<{ group: Group; auth: GroupAuthStatus }> {
  return cmd('finish_group_app_auth', { session_id: sessionId, group_id: groupId, app_id: appId })
}

export function cancelGroupAppAuth(sessionId: string): Promise<{ ok: boolean }> {
  return cmd('cancel_group_app_auth', { session_id: sessionId })
}
