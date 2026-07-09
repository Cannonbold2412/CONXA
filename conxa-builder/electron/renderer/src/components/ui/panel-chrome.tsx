import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Shared elevated-panel chrome — gradient fill + soft shadow + hairline ring, giving panels real
 * depth instead of the flat single-tone `bg-white/[0.0x]` boxes used ad hoc elsewhere. Originally
 * built for the skill-package inspector; promoted here so Human Edit's panels (workflow list,
 * wizard shell, tools rail) can reuse the same "premium" treatment instead of three different
 * one-off panel styles.
 *
 * `size="default"` is the full hero treatment — reserve it for a screen's few top-level panels.
 * `size="sm"` is a lighter variant (smaller radius/shadow) for the many nested boxes within them
 * (step editor card, suggestion cards) — using `default` everywhere makes a page look over-decorated.
 */
const panelChromeVariants = cva('flex min-h-0 min-w-0 flex-col border border-white/10', {
  variants: {
    size: {
      default:
        'rounded-[1.5rem] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(7,10,16,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04]',
      sm: 'rounded-2xl bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] shadow-[0_10px_30px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.03]',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

export function PanelChrome({
  children,
  className,
  size,
}: {
  children: ReactNode
  className?: string
} & VariantProps<typeof panelChromeVariants>) {
  return <div className={cn(panelChromeVariants({ size }), className)}>{children}</div>
}
