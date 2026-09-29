import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Phrase } from './narrative'

/** Renders a narrative `Phrase`, lifting its emphasised spans to full-strength text. */
export function Sentence({ parts }: { parts: Phrase }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <span key={index} className="font-medium text-zinc-100">
            {part.strong}
          </span>
        ),
      )}
    </>
  )
}

/**
 * The one section shell every dashboard panel uses.
 *
 * `question` stays small and grey; `answer` is the large line underneath that answers it in
 * plain words, so a reader gets the conclusion before the chart. No box around it — sections
 * are separated by space and hairlines, not by cards.
 */
export function SectionCard({
  question,
  answer,
  context,
  href,
  hrefLabel = 'View all',
  children,
  className,
}: {
  question: string
  answer?: ReactNode
  context?: ReactNode
  href?: string
  hrefLabel?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-6', className)}>
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-sm font-medium text-zinc-400">{question}</h2>
          {answer ? (
            <p className="text-lg font-medium leading-snug tracking-[-0.01em] text-zinc-100 sm:text-xl">{answer}</p>
          ) : null}
          {context ? <p className="text-xs leading-relaxed text-zinc-400">{context}</p> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="shrink-0 whitespace-nowrap rounded-md text-sm text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
          >
            {hrefLabel} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}
