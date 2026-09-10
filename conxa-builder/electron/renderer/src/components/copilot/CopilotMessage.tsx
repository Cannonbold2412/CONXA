import { Pencil } from 'lucide-react'
import type { CopilotTurnMessage } from '@/api/workflowApi'
import { cn } from '@/lib/utils'

type Props = {
  message: CopilotTurnMessage
  /** Present only for user messages that can be edited-and-resent (see copilotStore.editFromIndex). */
  onEdit?: () => void
}

export function CopilotMessage({ message, onEdit }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('group flex items-center gap-1', isUser ? 'justify-end' : 'justify-start')}>
      {isUser && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition hover:text-zinc-300 group-hover:opacity-100"
          aria-label="Edit this message and resend"
        >
          <Pencil className="size-3" />
        </button>
      ) : null}
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-white/10 text-zinc-100'
            : 'border border-white/8 bg-black/20 text-zinc-300',
        )}
      >
        {message.text}
      </div>
    </div>
  )
}

/** Shown while a turn is in flight and no reply text has streamed in yet — swaps for the
 *  growing reply itself the moment the first delta arrives (see CopilotPanel). */
export function CopilotThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-zinc-500"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
