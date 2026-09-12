import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, SquarePen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { copilotTurn, errorMessage, saveCopilotSession } from '@/api/workflowApi'
import type { WorkflowRevalidationResponse } from '@/types/workflow'
import { useDraggable } from '@/hooks/useDraggable'
import { useCopilotStore } from '@/store/copilotStore'
import { ProposalCard } from './ProposalCard'
import { VerifyCard } from './VerifyCard'
import { CopilotMessage, CopilotThinkingBubble } from './CopilotMessage'

type Props = {
  skillId: string
  onClose: () => void
  onProposalAccepted: (result: WorkflowRevalidationResponse) => void
}

export function CopilotPanel({ skillId, onClose, onProposalAccepted }: Props) {
  const messages = useCopilotStore((s) => s.messages)
  const pendingProposal = useCopilotStore((s) => s.pendingProposal)
  const sending = useCopilotStore((s) => s.sending)
  const streamingText = useCopilotStore((s) => s.streamingText)
  const position = useCopilotStore((s) => s.position)
  const addMessage = useCopilotStore((s) => s.addMessage)
  const editFromIndex = useCopilotStore((s) => s.editFromIndex)
  const setPendingProposal = useCopilotStore((s) => s.setPendingProposal)
  const setSending = useCopilotStore((s) => s.setSending)
  const appendStreamingDelta = useCopilotStore((s) => s.appendStreamingDelta)
  const clearStreamingText = useCopilotStore((s) => s.clearStreamingText)
  const setPosition = useCopilotStore((s) => s.setPosition)
  const commitPosition = useCopilotStore((s) => s.commitPosition)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { onPointerDown, onPointerMove, onPointerUp } = useDraggable(position, {
    onDrag: setPosition,
    onDragEnd: commitPosition,
  })

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pendingProposal, streamingText])

  const editMessage = (index: number) => {
    if (sending) return
    const text = editFromIndex(index)
    if (text !== null) setDraft(text)
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    addMessage({ role: 'user', text })
    setSending(true)
    try {
      const result = await copilotTurn(skillId, text, [...messages, { role: 'user', text }], appendStreamingDelta)
      const reply = (result.reply || '').trim() || useCopilotStore.getState().streamingText
      const proposal = result.proposals?.[0] ?? null
      if (reply) {
        addMessage({ role: 'assistant', text: reply })
      } else if (!proposal) {
        // Both LLM calls can come back with an empty reply (e.g. an out-of-scope ask like
        // "remove these steps" — Copilot only proposes field edits/overlay dismissals, never
        // step deletion). Without this, the turn resolves with zero UI feedback and no error,
        // leaving the reviewer thinking the app is broken.
        addMessage({
          role: 'assistant',
          text: "Copilot didn't have a response for that. Try rephrasing, or ask about a specific step — it can suggest field edits or dismiss a known popup, but it can't remove or reorder steps directly.",
        })
      }
      // Only ever one proposal on screen at a time — a second turn while one is pending would
      // otherwise silently orphan the first (BUILD-26: the copilot proposes one diff at a time).
      setPendingProposal(proposal)
    } catch (err) {
      toast.error(errorMessage(err, 'Conxa Copilot could not respond'))
    } finally {
      setSending(false)
      clearStreamingText()
    }
  }

  const newSession = async () => {
    if (sending) return
    const { messages: outgoing } = useCopilotStore.getState()
    if (outgoing.length > 0) {
      try {
        await saveCopilotSession(skillId, outgoing)
      } catch (err) {
        toast.error(errorMessage(err, 'Could not save the previous conversation'))
        // Fall through — never block starting a fresh session on a save failure.
      }
    }
    useCopilotStore.getState().reset()
  }

  return (
    <div
      className={cn(
        'anim-pop mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111318] shadow-2xl',
      )}
      role="dialog"
      aria-label="Human Review Conxa Copilot"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3.5 py-3">
        <div
          className="min-w-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <p className="text-sm font-medium text-white">Conxa Copilot</p>
          <p className="truncate text-xs text-zinc-500">Ask about a failed step, or a step to improve</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-zinc-400 hover:text-white"
                onClick={() => void newSession()}
                aria-label="Start a new Conxa Copilot session"
              >
                <SquarePen className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">New session</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-400 hover:text-white"
            onClick={onClose}
            aria-label="Close Conxa Copilot"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2.5 p-3">
          {messages.length === 0 ? (
            <p className="rounded-lg border border-white/8 bg-black/20 p-3 text-sm text-zinc-500">
              Ask "why did step 3 fail?" or "give me a better assertion for step 5" — I'll answer
              from the compile report, the recovery log, and the failure screenshot when there is
              one.
            </p>
          ) : (
            messages.map((m, i) => (
              <CopilotMessage
                key={i}
                message={m}
                onEdit={m.role === 'user' ? () => editMessage(i) : undefined}
              />
            ))
          )}
          {sending ? (
            streamingText ? (
              <CopilotMessage message={{ role: 'assistant', text: streamingText }} />
            ) : (
              <CopilotThinkingBubble />
            )
          ) : null}
          {pendingProposal ? (
            <ProposalCard skillId={skillId} proposal={pendingProposal} onAccepted={onProposalAccepted} />
          ) : (
            <VerifyCard skillId={skillId} />
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="flex items-end gap-2 border-t border-white/8 p-2.5">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Ask Conxa Copilot…"
          rows={1}
          className="max-h-24 min-h-9 flex-1 resize-none border-white/10 bg-black/20 text-sm text-zinc-100 placeholder:text-zinc-600"
          disabled={sending}
        />
        <Button
          type="button"
          size="icon"
          variant="brand"
          className="size-9 shrink-0"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          aria-label="Send"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
