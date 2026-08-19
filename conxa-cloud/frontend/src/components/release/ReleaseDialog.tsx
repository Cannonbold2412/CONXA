'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { releaseVersion, type ReleaseResult } from '@/api/workflowsApi'
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
import { Rocket } from 'lucide-react'

/** Confirm-then-release for a "ready" (published, undeployed) version — the
 * one action in this entire product that turns "published" into "deployed".
 * Cloud-only, admin-gated server-side (require_admin, same as rollback).
 * Only ever rendered for rows releaseState.canReleaseTo() says are eligible. */
export function ReleaseDialog({
  slug,
  skillSlug,
  version,
  currentStableVersion,
  onReleased,
}: {
  slug: string
  skillSlug: string
  version: string
  currentStableVersion: string | null
  onReleased: (result: ReleaseResult) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => releaseVersion(slug, skillSlug, version),
    onSuccess: (result) => {
      setError('')
      setOpen(false)
      onReleased(result)
    },
    onError: (e: unknown) => setError((e as Error)?.message ?? 'Release failed'),
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
        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Rocket className="size-3.5" />
          Release to Production
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Release v{version}?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Current stable: <span className="font-mono text-zinc-200">v{currentStableVersion ?? '— none yet'}</span>
            <br />
            Target: <span className="font-mono text-zinc-200">v{version}</span>
            <br />
            <br />
            Every entitled runtime will receive v{version} at its next sync. This is the only
            action that deploys a published version to customer machines.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200" disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              setError('')
              mutation.mutate()
            }}
          >
            {mutation.isPending ? 'Releasing...' : `Release v${version}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
