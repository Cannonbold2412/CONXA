'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { rollbackRelease, type RollbackResult } from '@/api/workflowsApi'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { History } from 'lucide-react'

/** Confirm-then-rollback for a single release history row. Cloud-only — see
 * docs/App-Flow.md. Only ever rendered for rows releaseState.canRollbackTo()
 * already says are valid targets. Rollback is scoped to exactly one skill;
 * there is no group-level or bulk rollback action anywhere in Cloud. */
export function RollbackDialog({
  skillSlug,
  version,
  currentStableVersion,
  onRolledBack,
}: {
  skillSlug: string
  version: string
  currentStableVersion: string | null
  onRolledBack: (result: RollbackResult) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => rollbackRelease(skillSlug, version),
    onSuccess: (result) => {
      setError('')
      setOpen(false)
      onRolledBack(result)
    },
    onError: (e: unknown) => setError((e as Error)?.message ?? 'Rollback failed'),
  })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return
        setOpen(nextOpen)
        if (nextOpen) setError('')
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-300">
          <History className="size-3.5" />
          Rollback
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Rollback to v{version}?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Current stable: <span className="font-mono text-zinc-200">v{currentStableVersion ?? '—'}</span>
            <br />
            Target: <span className="font-mono text-zinc-200">v{version}</span>
            <br />
            <br />
            Runtimes will receive v{version} at their next sync. No artifact is rebuilt or copied — the
            stable channel simply points back to this already-published release.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200" disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 text-white hover:bg-amber-700"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              setError('')
              mutation.mutate()
            }}
          >
            {mutation.isPending ? 'Rolling back...' : `Rollback to v${version}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
