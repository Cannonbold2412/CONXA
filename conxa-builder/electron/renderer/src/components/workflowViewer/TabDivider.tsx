import { ArrowRightLeft } from 'lucide-react'

type TabDividerProps = {
  /** 1-indexed tab position (StepEditorDTO.tab.index + 1) — "Tab 2", not the internal tab_1 id. */
  tabNumber: number
  url?: string
}

/** Marks a tab-boundary crossing in the step list — the visible twin of the tab_open/tab_switch
 * marker step the compiler inserts (see compiler/build.py::_insert_tab_markers). Renders once
 * per crossing, immediately before the first step recorded on the newly-active tab. */
export function TabDivider({ tabNumber, url }: TabDividerProps) {
  let host = ''
  try {
    host = url ? new URL(url).hostname : ''
  } catch {
    host = ''
  }

  return (
    <li className="flex items-center gap-2 px-1 py-1.5" aria-hidden={false}>
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-brand flex items-center gap-1 whitespace-nowrap text-[0.65rem] font-semibold uppercase tracking-wide">
        <ArrowRightLeft className="size-3" />
        Tab {tabNumber}
        {host ? <span className="text-muted-foreground normal-case tracking-normal">— {host}</span> : null}
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </li>
  )
}
