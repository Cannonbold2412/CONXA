import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchGroup } from '@/api/groupsApi'
import { GroupAuthWizard } from '@/components/GroupAuthWizard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShieldCheck } from 'lucide-react'

/** Shown before a workflow runs (Test Skill, etc.): names the owning group and
 * how many apps it needs, then walks any missing/expired sessions before
 * letting the run proceed. Mirrors the "belongs to the Sales group and
 * requires authentication to 5 applications" gate the runtime shows in
 * Claude Desktop — see runtime/browser.js's beginInteractiveAuth message. */
export function RunGateDialog({
  open,
  onOpenChange,
  groupId,
  onReady,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  groupId: string
  onReady: () => void
}) {
  const qc = useQueryClient()
  const [continued, setContinued] = useState(false)

  const groupQ = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => fetchGroup(groupId),
    enabled: open,
  })

  function handleOpenChange(v: boolean) {
    if (!v) setContinued(false)
    onOpenChange(v)
  }

  const group = groupQ.data?.group
  const auth = groupQ.data?.auth

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Authentication required</DialogTitle>
        </DialogHeader>

        {!group || !auth ? (
          <p className="py-4 text-sm text-zinc-500">Loading…</p>
        ) : !continued ? (
          <div className="space-y-4 pt-1">
            <p className="text-sm leading-6 text-zinc-300">
              This workflow belongs to the <span className="font-semibold text-white">{group.name}</span> group and requires
              authentication to {auth.apps_total} application{auth.apps_total === 1 ? '' : 's'}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/10 bg-white/[0.06] text-zinc-300" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (auth.ready) {
                    onOpenChange(false)
                    onReady()
                  } else {
                    setContinued(true)
                  }
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : auth.ready ? (
          <div className="space-y-4 pt-1 text-center">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-emerald-300">
              <ShieldCheck className="size-4" /> All applications connected
            </div>
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false)
                onReady()
              }}
            >
              Run workflow
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <GroupAuthWizard
              groupId={groupId}
              onAllAuthenticated={() => {
                qc.invalidateQueries({ queryKey: ['group', groupId] })
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
