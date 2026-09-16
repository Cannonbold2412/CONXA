import { useEffect, useRef, useState } from "react";
import type { PanelTab } from "./bridge";
import { Icon, paths } from "./ui";

// One entry per active run — the tab strip is per-RUN (per the approved design: a run
// that itself opens several browser tabs mid-skill just shows its current one; there is
// no second-level tab UI for that here). The order runs first appeared in stays stable
// so switching between them doesn't reflow while more start/finish around it.
type RunEntry = { runId: string; tabs: PanelTab[] };

function activeTabId(tabs: PanelTab[]): string | null {
  return tabs.find((t) => t.active)?.id ?? tabs[0]?.id ?? null;
}

/**
 * The in-app browser panel (see the plan this shipped under: "Conxa Execute — in-app
 * browser panel"). Renders only the tab strip and a placeholder div — the actual page
 * content is a native WebContentsView the main process floats above this rect (see
 * browser_panel.js). That's why the placeholder is otherwise empty: anything drawn
 * inside it would be invisibly stuck underneath the real browser view.
 */
export function BrowserPanel() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return window.conxaExecute.panel.onTabsChanged(({ runId, tabs }) => {
      setRuns((prev) => {
        if (tabs.length === 0) return prev.filter((r) => r.runId !== runId);
        const idx = prev.findIndex((r) => r.runId === runId);
        if (idx === -1) return [...prev, { runId, tabs }];
        const next = [...prev];
        next[idx] = { runId, tabs };
        return next;
      });
      // A brand-new run takes the foreground — this is the "slides in on execution"
      // moment. A run that already had the strip open (a second run starting while the
      // first is still going) does not steal focus from whatever the user is looking at.
      setSelected((cur) => (cur === null ? runId : cur));
    });
  }, []);

  // Drop a run from `selected` the instant it disappears from `runs` so the effect below
  // doesn't keep reporting bounds for a run that no longer has any view to receive them.
  useEffect(() => {
    if (selected && !runs.some((r) => r.runId === selected)) {
      setSelected(runs[0]?.runId ?? null);
    }
  }, [runs, selected]);

  const activeRun = runs.find((r) => r.runId === selected) || null;
  const activeTab = activeRun ? activeTabId(activeRun.tabs) : null;

  // Report the placeholder's rect to the main process whenever it moves/resizes, and
  // whenever the selected run/tab changes — that's what actually places the native view.
  useEffect(() => {
    const el = placeholderRef.current;
    if (!el || !activeRun || !activeTab) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      window.conxaExecute.panel.setBounds({
        runId: activeRun.runId,
        tabId: activeTab,
        rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("resize", report);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [activeRun, activeTab]);

  function selectRun(runId: string) {
    setSelected(runId);
    const run = runs.find((r) => r.runId === runId);
    const tabId = run ? activeTabId(run.tabs) : null;
    const el = placeholderRef.current;
    if (!tabId || !el) return;
    const r = el.getBoundingClientRect();
    window.conxaExecute.panel.selectTab({
      runId,
      tabId,
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    });
  }

  if (runs.length === 0) return null;

  return (
    <aside className="flex w-[45%] min-w-[360px] shrink-0 flex-col border-l border-line bg-bg-elevated">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        <span className="ml-1 text-fg-dim"><Icon d={paths.panel} size={14} /></span>
        {runs.map((r, i) => (
          <button
            key={r.runId}
            type="button"
            onClick={() => selectRun(r.runId)}
            className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
              r.runId === selected ? "bg-bg-active text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg"
            }`}
          >
            Run {i + 1}
          </button>
        ))}
      </div>
      {/* Left empty on purpose — the real content is a native view the main process
          positions over this rect. See the effect above. */}
      <div ref={placeholderRef} className="min-h-0 flex-1" />
    </aside>
  );
}
