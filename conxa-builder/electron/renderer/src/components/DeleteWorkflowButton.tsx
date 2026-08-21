import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { deleteWorkflowEntity, type Workflow } from '@/api/workflowsApi'
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
import { Trash2 } from 'lucide-react'

/** Confirm-then-delete a workflow (recording + built output included). Moved
 * verbatim out of the removed per-workflow detail page so the group page's
 * workflow row can offer the same action. */
export function DeleteWorkflowButton({
  workflow,
  onDeleted,
  iconOnly = false,
}: {
  workflow: Workflow
  onDeleted: () => void
  iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => deleteWorkflowEntity(workflow.id),
    onSuccess: () => {
      setError('')
      setOpen(false)
      onDeleted()
    },
    onError: (e: Error) => setError(e.message || 'Failed to delete workflow.'),
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
        <Button
          size={iconOnly ? 'icon-sm' : 'sm'}
          variant="outline"
          className="border-white/10 bg-white/[0.04] text-zinc-400 hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-400"
          disabled={mutation.isPending}
          title={iconOnly ? `Delete ${workflow.name}` : undefined}
        >
          <Trash2 className="size-3.5" />
          {!iconOnly && 'Delete'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete &ldquo;{workflow.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            This deletes the workflow, its recording, and any built output. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200" disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              setError('')
              mutation.mutate()
            }}
          >
            {mutation.isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
