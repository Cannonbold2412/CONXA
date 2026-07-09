import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { editorHelp } from '@/lib/editorHelp'
import { ADD_ACTION_OPTIONS, type AddActionKind } from '@/lib/workflowViewerHelpers'
import { ChevronDown, Plus } from 'lucide-react'

type WorkflowHeaderProps = {
  version: number
  onAddAction: (actionKind: AddActionKind) => void
}

export function WorkflowHeader({ version, onAddAction }: WorkflowHeaderProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  return (
    <div className="border-border/80 space-y-2 border-b bg-muted/5 p-3">
      <div className="flex items-center gap-1.5">
        <h2 className="text-foreground text-base font-semibold tracking-tight">Workflow</h2>
        <InfoHint {...editorHelp.workflowTips} side="bottom" align="start" />
      </div>
      <div className="flex items-center gap-2">
        <p className="text-muted-foreground min-w-0 flex-1 text-xs">Version {version}</p>
        <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2.5 text-xs"
              aria-label="Add action after the selected step"
            >
              <Plus className="size-3.5" />
              Add
              <ChevronDown className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" className="max-h-96 w-52 overflow-y-auto p-1">
            {ADD_ACTION_OPTIONS.map((option, index) => {
              const prev = ADD_ACTION_OPTIONS[index - 1]
              const showCategory = !prev || prev.category !== option.category
              return (
                <div key={option.value}>
                  {showCategory ? (
                    <div className="px-2 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground first:pt-1">
                      {option.category}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="hover:bg-white/[0.07] focus-visible:bg-white/[0.07] flex h-8 w-full items-center rounded-sm px-2 text-left text-xs text-zinc-200 outline-none"
                    onClick={() => {
                      setAddMenuOpen(false)
                      onAddAction(option.value)
                    }}
                  >
                    {option.label}
                  </button>
                </div>
              )
            })}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
