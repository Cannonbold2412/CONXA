type TabDividerProps = {
  /** 1-indexed tab position (StepEditorDTO.tab.index + 1) — used only in the tooltip/title, not
   *  the label itself (the board reads "New tab", not "Tab 2"). */
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
    <li className="flex items-center gap-3 px-1 py-2.5" title={`Tab ${tabNumber}`} aria-hidden={false}>
      <span className="h-px flex-1 bg-white/10" />
      <span className="whitespace-nowrap text-xs text-zinc-500">
        New tab{host ? ` · ${host}` : ''}
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </li>
  )
}
