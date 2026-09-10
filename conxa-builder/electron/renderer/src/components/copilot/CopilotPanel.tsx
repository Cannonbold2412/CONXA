import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeftRight, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { copilotTurn, errorMessage } from '@/api/workflowApi'
import type { WorkflowRevalidationResponse } from '@/types/workflow'
import { useCopilotStore } from '@/store/copilotStore'
import { ProposalCard } from './ProposalCard'
import { CopilotMessage, CopilotThinkingBubble } from './CopilotMessage'

type Props = {
  skillId: string
  corner: 'right' | 'left'
  onClose: () => void
  onProposalAccepted: (result: WorkflowRevalidationResponse) => void
}

export function CopilotPanel({ skillId, corner, onClose, onProposalAccepted }: Props) {
  const messages = useCopilotStore((s) => s.messages)
  const pendingProposal = useCopilotStore((s) => s.pendingProposal)
  const sending = useCopilotStore((s) => s.sending)
  const streamingText = useCopilotStore((s) => s.streamingText)
  const addMessage = useCopilotStore((s) => s.addMessage)
  const editFromIndex = useCopilotStore((s) => s.editFromIndex)
  const setPendingProposal = useCopilotStore((s) => s.setPendingProposal)
  const setSending = useCopilotStore((s) => s.setSending)
  const appendStreamingDelta = useCopilotStore((s) => s.appendStreamingDelta)
  const clearStreamingText = useCopilotStore((s) => s.clearStreamingText)
  const toggleCorner = useCopilotStore((s) => s.toggleCorner)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

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
      if (reply) addMessage({ role: 'assistant', text: reply })
      // Only ever one proposal on screen at a time — a second turn while one is pending would
      // otherwise silently orphan the first (BUILD-26: the copilot proposes one diff at a time).
      setPendingProposal(result.proposals?.[0] ?? null)
    } catch (err) {
      toast.error(errorMessage(err, 'Conxa Copilot could not respond'))
    } finally {
      setSending(false)
      clearStreamingText()
    }
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
        <div className="min-w-0">
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
                onClick={toggleCorner}
              >
                <ArrowLeftRight className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Move to {corner === 'right' ? 'left' : 'right'}</TooltipContent>
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
          ) : null}
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
