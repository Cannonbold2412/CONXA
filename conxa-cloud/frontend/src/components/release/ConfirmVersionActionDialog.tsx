'use client'

import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
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
import { errorMessage } from '@/lib/apiBase'

/** Shared confirm-then-mutate shell for ReleaseDialog and RollbackDialog —
 *  same open/error state machine, same dialog structure, same button
 *  wiring; only the copy, colour, icon, and mutation differ. */
export function ConfirmVersionActionDialog<TResult>({
  mutationFn,
  onSuccess,
  errorFallback,
  triggerIcon,
  triggerLabel,
  triggerClassName,
  title,
  description,
  actionClassName,
  actionLabel,
  actionPendingLabel,
}: {
  mutationFn: () => Promise<TResult>
  onSuccess: (result: TResult) => void
  errorFallback: string
  triggerIcon: ReactNode
  triggerLabel: string
  triggerClassName: string
  title: string
  description: ReactNode
  actionClassName: string
  actionLabel: string
  actionPendingLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn,
    onSuccess: (result) => {
      setError('')
      setOpen(false)
      onSuccess(result)
    },
    onError: (e: unknown) => setError(errorMessage(e, errorFallback)),
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
        <Button size="sm" className={triggerClassName}>
          {triggerIcon}
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200" disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={actionClassName}
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              setError('')
              mutation.mutate()
            }}
          >
            {mutation.isPending ? actionPendingLabel : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
