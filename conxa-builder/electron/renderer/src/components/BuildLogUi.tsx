import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared streaming-log line coloring — used by both Publish Skill Package and
 * Build Installer's log panels so their color conventions never drift apart. */
export function getLogLineStyle(line: string): string {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('fail') || l.includes('exception') || l.includes('traceback'))
    return 'text-red-400'
  if (l.includes('warn')) return 'text-amber-400'
  if (
    l.includes('✓') ||
    l.includes('success') ||
    l.includes('complete') ||
    l.includes('done') ||
    l.includes('finished')
  )
    return 'text-emerald-400'
  if (l.includes('upload') || l.includes('publish') || l.includes('cloud')) return 'text-sky-400'
  if (l.includes('build') || l.includes('pack') || l.includes('compil')) return 'text-violet-300'
  return 'text-zinc-400'
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-white/8 hover:text-zinc-300"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export function ResultCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="mt-0.5 shrink-0 text-zinc-500">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block break-all font-mono text-[11px] text-sky-400 underline-offset-2 hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-300">{value}</p>
        )}
      </div>
      <CopyButton text={value} />
    </div>
  )
}

export function BuildLogPanel({ logs }: { logs: string[] }) {
  return (
    <div className="space-y-px">
      {logs.map((line, index) => (
        <div key={index} className={cn('leading-5', getLogLineStyle(line))}>
          <span className="mr-2 select-none text-zinc-700">{String(index + 1).padStart(3, ' ')}</span>
          {line}
        </div>
      ))}
    </div>
  )
}
