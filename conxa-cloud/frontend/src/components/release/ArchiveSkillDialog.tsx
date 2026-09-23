'use client'

import { archiveSkill, unarchiveSkill, type ArchiveResult } from '@/api/workflowsApi'
import { Archive, ArchiveRestore } from 'lucide-react'
import { ConfirmVersionActionDialog } from './ConfirmVersionActionDialog'

/** Confirm-then-archive (or restore) for one skill — the only place in Cloud
 * that pulls a published workflow out of runtime visibility without deleting
 * anything. Archiving removes the skill from pack.json's skills/skill_groups
 * union, so installed runtimes drop it from list_skills at their next sync;
 * files already synced to a customer's machine are left alone. Version
 * history, snapshots and the stable channel are untouched, which is what
 * makes restoring a one-click action. */
export function ArchiveSkillDialog({
  skillSlug,
  archived,
  onChanged,
}: {
  skillSlug: string
  archived: boolean
  onChanged: (result: ArchiveResult) => void
}) {
  if (archived) {
    return (
      <ConfirmVersionActionDialog
        mutationFn={() => unarchiveSkill(skillSlug)}
        onSuccess={onChanged}
        errorFallback="Restore failed"
        triggerIcon={<ArchiveRestore className="size-3.5" />}
        triggerLabel="Restore"
        triggerClassName="border border-white/10 bg-white/[0.04] text-zinc-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.06] hover:text-emerald-300"
        title="Restore this workflow?"
        description="If it has a released version, customers' AI assistants will see and be able to run it again at their next sync. Nothing was deleted while it was archived."
        actionClassName="bg-emerald-600 text-white hover:bg-emerald-700"
        actionLabel="Restore"
        actionPendingLabel="Restoring..."
      />
    )
  }

  return (
    <ConfirmVersionActionDialog
      mutationFn={() => archiveSkill(skillSlug)}
      onSuccess={onChanged}
      errorFallback="Archive failed"
      triggerIcon={<Archive className="size-3.5" />}
      triggerLabel="Archive"
      triggerClassName="border border-white/10 bg-white/[0.04] text-zinc-300 hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-300"
      title="Archive this workflow?"
      description="Customers who already installed it keep the files on their machine, but their AI assistant will no longer see or run it. You can restore it any time — its version history and release stay intact."
      actionClassName="bg-red-600 text-white hover:bg-red-700"
      actionLabel="Archive"
      actionPendingLabel="Archiving..."
    />
  )
}
