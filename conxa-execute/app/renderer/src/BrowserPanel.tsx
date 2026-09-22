import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PanelTab } from "./bridge";
import { Icon, paths } from "./ui";

// One entry per active run. A run holds several tabs (a group skill opens one login per
// missing app, all under the same run), so the panel is Chrome-shaped: a chip per tab, with
// a compact run selector above it only when more than one run is live. The order runs first
// appeared in stays stable so switching between them doesn't reflow.
const WIDTH_KEY = "conxa.browserPanelWidth";
const MIN_W = 360;
const MIN_CHAT_W = 320;

type RunEntry = { runId: string; tabs: PanelTab[] };

function activeTabOf(tabs: PanelTab[]): PanelTab | null {
  return tabs.find((t) => t.active) ?? tabs[0] ?? null;
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MenuItem({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-fg-muted hover:bg-bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * The in-app browser panel. Renders the Chrome-style header (tab strip + address bar) and a
 * placeholder div — the actual page content is a native WebContentsView the main process
 * floats above that rect (see browser_panel.js). That's why the placeholder is otherwise
 * empty: anything drawn inside it would be invisibly stuck underneath the real browser view,
 * so the header has to stay outside it.
 */
export function BrowserPanel() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false); // ⤢ — fill all width the chat column can spare
  const [menuOpen, setMenuOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState<string | null>(null); // non-null while the user is typing
  // null = untouched, fall back to the 45% default; otherwise the user-dragged width in px.
  const [width, setWidth] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY));
      return v >= MIN_W ? v : null;
    } catch { return null; }
  });

  useEffect(() => {
    return window.conxaExecute.panel.onTabsChanged(({ runId, tabs, focus }) => {
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
      // first is still going) does not steal focus from whatever the user is looking at —
      // except a login (`focus`): it is blocking a run on the user, so it always comes forward.
      setSelected((cur) => (cur === null || focus ? runId : cur));
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
  const activeTabInfo = activeRun ? activeTabOf(activeRun.tabs) : null;
  const activeTab = activeTabInfo?.id ?? null;

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

  // Leaving a tab (or the tab navigating) discards a half-typed address.
  useEffect(() => { setUrlDraft(null); }, [activeTab, activeTabInfo?.url]);

  // The ⋮ menu is a plain popover — any outside click closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  function currentRect() {
    const el = placeholderRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }

  function selectRun(runId: string) {
    setSelected(runId);
    const run = runs.find((r) => r.runId === runId);
    const tab = run ? activeTabOf(run.tabs) : null;
    const rect = currentRect();
    if (tab && rect) void window.conxaExecute.panel.selectTab({ runId, tabId: tab.id, rect });
  }

  function selectTab(tabId: string) {
    if (!activeRun) return;
    const rect = currentRect();
    if (rect) void window.conxaExecute.panel.selectTab({ runId: activeRun.runId, tabId, rect });
  }

  function closeTab(tabId: string) {
    if (!activeRun) return;
    void window.conxaExecute.panel.closeTab({ runId: activeRun.runId, tabId });
  }

  function closeRun() {
    if (!activeRun) return;
    // Closing the last tab makes the main process end the run's panel, so closing them in turn
    // covers the whole run without a separate run-close op.
    for (const t of activeRun.tabs) closeTab(t.id);
  }

  function nav(action: "back" | "forward" | "reload" | "stop" | "load", url?: string) {
    if (!activeRun || !activeTab) return;
    void window.conxaExecute.panel.navigate({ runId: activeRun.runId, tabId: activeTab, action, url });
  }

  // Drag the left edge to resize. Pointer capture keeps the move events flowing to the
  // handle even when the cursor crosses the native browser view floating above the page.
  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    const parent = asideRef.current?.parentElement;
    if (!parent) return;
    e.preventDefault();
    setExpanded(false);
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    const right = parent.getBoundingClientRect().right;
    const max = Math.max(MIN_W, parent.clientWidth - MIN_CHAT_W);
    const move = (ev: PointerEvent) => setWidth(Math.min(max, Math.max(MIN_W, Math.round(right - ev.clientX))));
    const up = () => {
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", up);
      h.removeEventListener("pointercancel", up);
      setWidth((w) => {
        try { if (w !== null) localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* private mode */ }
        return w;
      });
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  }

  if (runs.length === 0) return null;

  return (
    <aside
      ref={asideRef}
      style={!expanded && width !== null ? { width } : undefined}
      className={`relative flex ${expanded ? "w-full" : width === null ? "w-[45%]" : ""} min-w-[360px] max-w-[calc(100%-320px)] shrink-0 flex-col border-l border-line bg-bg-elevated`}
    >
      {/* Sits just outside the aside so it never overlaps the native browser view. */}
      <div
        onPointerDown={onHandleDown}
        className="absolute -left-1.5 top-0 bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-brand/40 active:bg-brand/60"
      />

      {runs.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
          {runs.map((r, i) => (
            <button
              key={r.runId}
              type="button"
              onClick={() => selectRun(r.runId)}
              className={`rounded-md px-2.5 py-0.5 text-[11px] transition-colors ${
                r.runId === selected ? "bg-bg-active text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg"
              }`}
            >
              Run {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Tab strip */}
      <div className="flex shrink-0 items-center gap-1 px-2 pt-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {activeRun?.tabs.map((t) => (
            <div
              key={t.id}
              className={`flex h-7 min-w-[90px] max-w-[180px] items-center gap-1 rounded-md pl-2.5 pr-1 text-[12px] transition-colors ${
                t.id === activeTab ? "bg-bg-active text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg"
              }`}
            >
              <button type="button" onClick={() => selectTab(t.id)} className="min-w-0 flex-1 truncate text-left" title={t.label}>
                {t.label}
              </button>
              {t.isLogin && (
                <button
                  type="button"
                  aria-label={`I'm done signing in to ${t.label}`}
                  title="I'm done signing in"
                  onClick={() => activeRun && void window.conxaExecute.panel.loginDone({ runId: activeRun.runId, tabId: t.id })}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-dim hover:bg-bg-hover hover:text-fg"
                >
                  <Icon d={paths.check} size={12} />
                </button>
              )}
              <button
                type="button"
                aria-label={`Close ${t.label}`}
                title="Close tab"
                onClick={() => closeTab(t.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-dim hover:bg-bg-hover hover:text-fg"
              >
                <Icon d={paths.x} size={12} />
              </button>
            </div>
          ))}
          <IconButton label="New tab" onClick={() => activeRun && void window.conxaExecute.panel.newTab({ runId: activeRun.runId })}>
            <Icon d={paths.plus} size={14} />
          </IconButton>
        </div>
        <div className="relative flex shrink-0 items-center">
          <IconButton label="More" onClick={() => setMenuOpen((v) => !v)}>
            <Icon d={paths.dots} size={14} />
          </IconButton>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-50 w-48 rounded-lg border border-line bg-bg-elevated py-1 text-[12px] shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem
                disabled={!activeTabInfo?.url}
                onClick={() => {
                  if (activeTabInfo?.url) void navigator.clipboard.writeText(activeTabInfo.url);
                  setMenuOpen(false);
                }}
              >
                Copy link
              </MenuItem>
              <MenuItem
                disabled={!activeTabInfo?.url}
                onClick={() => {
                  if (activeTabInfo?.url) void window.conxaExecute.openExternal({ url: activeTabInfo.url });
                  setMenuOpen(false);
                }}
              >
                Open in default browser
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (activeTab) closeTab(activeTab);
                  setMenuOpen(false);
                }}
              >
                Close tab
              </MenuItem>
            </div>
          )}
          <IconButton label={expanded ? "Shrink panel" : "Expand panel"} onClick={() => setExpanded((v) => !v)}>
            <Icon d={expanded ? paths.restore : paths.expand} size={14} />
          </IconButton>
          <IconButton label="Close browser" onClick={closeRun}>
            <Icon d={paths.x} size={14} />
          </IconButton>
        </div>
      </div>

      {/* Address bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        <IconButton label="Back" disabled={!activeTabInfo?.canGoBack} onClick={() => nav("back")}>
          <Icon d={paths.back} size={14} />
        </IconButton>
        <IconButton label="Forward" disabled={!activeTabInfo?.canGoForward} onClick={() => nav("forward")}>
          <Icon d={paths.forward} size={14} />
        </IconButton>
        <IconButton label={activeTabInfo?.loading ? "Stop" : "Reload"} onClick={() => nav(activeTabInfo?.loading ? "stop" : "reload")}>
          <Icon d={activeTabInfo?.loading ? paths.x : paths.reload} size={14} />
        </IconButton>
        <input
          value={urlDraft ?? activeTabInfo?.url ?? ""}
          placeholder="Type a URL"
          spellCheck={false}
          onChange={(e) => setUrlDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && urlDraft) {
              nav("load", urlDraft);
              setUrlDraft(null);
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setUrlDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 text-[12px] text-fg outline-none placeholder:text-fg-dim focus:border-fg-dim"
        />
      </div>

      {/* Left empty on purpose — the real content is a native view the main process
          positions over this rect. See the bounds effect above. */}
      <div ref={placeholderRef} className="min-h-0 flex-1" />
    </aside>
  );
}
