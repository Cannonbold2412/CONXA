import { type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { AccountControls } from '@/components/layout/AccountControls'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  /** Short one-liner shown next to the title. */
  description?: ReactNode
  /** Longer detail revealed by hovering/focusing the info icon. */
  info?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, info, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('border-b border-white/8 px-4 py-4 sm:px-6', className)}>
      <div className="flex h-9 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="shrink-0 text-base font-semibold text-white">{title}</h1>
          {description != null && description !== false ? (
            <p
              className={cn(
                'hidden min-w-0 truncate text-sm text-zinc-500 lg:block',
                typeof description !== 'string' && 'shrink-0',
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {info != null ? (
          <div className="group relative flex shrink-0 items-center">
            <button
              type="button"
              aria-label="More details"
              className="flex rounded-md p-1 text-zinc-600 transition-colors hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
            >
              <Info className="size-4" aria-hidden />
            </button>
            <div
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-white/10 bg-[#0d0f12] px-3 py-2 text-xs leading-relaxed text-zinc-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {info}
            </div>
          </div>
        ) : null}
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        <AccountControls />
      </div>
    </div>
  )
}
