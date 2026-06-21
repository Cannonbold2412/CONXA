"use client"

import * as React from "react"
import { ChevronDown, Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type InfoHintTone = "muted" | "brand"
type InfoHintSize = "sm" | "md"

export type InfoHintProps = {
  /** Short heading for the help card. */
  label: string
  /** Plain-language explanation — always visible. Friendly for non-technical users. */
  summary: React.ReactNode
  /** Optional deeper, technical explanation behind a "Technical details" disclosure. */
  details?: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  tone?: InfoHintTone
  size?: InfoHintSize
  /** Accessible label for the trigger; defaults to `More about {label}`. */
  triggerLabel?: string
  className?: string
  contentClassName?: string
}

const iconSize: Record<InfoHintSize, string> = {
  sm: "size-3",
  md: "size-3.5",
}

/**
 * Click-to-open help affordance with graduated disclosure:
 * a plain-language summary for everyone, plus an optional "Technical details"
 * section for power users. Renders as a sibling button (never nested inside
 * another interactive element) and stops propagation so opening help never
 * triggers a surrounding toggle/row.
 */
export function InfoHint({
  label,
  summary,
  details,
  side = "top",
  align = "center",
  tone = "muted",
  size = "sm",
  triggerLabel,
  className,
  contentClassName,
}: InfoHintProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel ?? `More about ${label}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-zinc-500 outline-none transition-colors",
            "hover:text-brand focus-visible:ring-2 focus-visible:ring-brand-ring",
            "data-[state=open]:text-brand",
            tone === "brand" && "text-brand/70",
            className,
          )}
        >
          <Info className={iconSize[size]} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        onClick={(e) => e.stopPropagation()}
        className={cn("w-72 p-3.5", contentClassName)}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-brand/25 bg-brand/10 text-brand"
            aria-hidden
          >
            <Info className="size-3" />
          </span>
          <h3 className="min-w-0 flex-1 text-sm font-semibold leading-tight text-zinc-100">
            {label}
          </h3>
        </div>
        <div className="mt-2 text-[0.8rem] leading-relaxed text-zinc-300">{summary}</div>
        {details ? (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-3">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[0.72rem] font-medium text-zinc-300 outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand-ring"
              >
                <span>Technical details</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-zinc-500 transition-transform duration-200",
                    detailsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <div className="mt-2 space-y-1.5 rounded-md border border-white/8 bg-black/25 px-2.5 py-2 text-[0.72rem] leading-relaxed text-zinc-400">
                {details}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
