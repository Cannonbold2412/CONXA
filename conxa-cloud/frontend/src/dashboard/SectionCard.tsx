import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The one card shell every dashboard panel uses.
 *
 * `question` is the heading and it is phrased as a question on purpose — a panel titled
 * "Recovery" makes the reader work out why they should care, while "Where does recovery
 * spend its budget?" states the job the panel is doing. `context` carries the one-line
 * answer or scope note underneath.
 */
export function SectionCard({
  question,
  context,
  icon,
  action,
  href,
  hrefLabel = 'View all',
  children,
  className,
  bodyClassName,
}: {
  question: string
  context?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  href?: string
  hrefLabel?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn('gap-0 border-white/8 bg-white/[0.025] py-0 shadow-none', className)}>
      <CardHeader className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-white/6 px-4 py-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {icon ? <span className="mt-0.5 shrink-0 text-zinc-500" aria-hidden>{icon}</span> : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">{question}</h2>
            {context ? <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{context}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
            >
              {hrefLabel}
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={cn('px-4 py-4', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}
