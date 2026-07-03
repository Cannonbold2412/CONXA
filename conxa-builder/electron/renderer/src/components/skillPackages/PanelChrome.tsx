import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PanelChrome({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(7,10,16,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04]',
        className,
      )}
    >
      {children}
    </div>
  )
}
