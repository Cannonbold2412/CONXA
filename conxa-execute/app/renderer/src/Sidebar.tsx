import { useEffect, useRef, useState } from "react";
import type { SessionSummary } from "./bridge";
import { Icon, Row, paths } from "./ui";

export type View = "chat" | "search" | "skills" | "runs";

const NAV: { view: Exclude<View, "chat">; label: string; icon: string }[] = [
  { view: "search", label: "Search", icon: paths.search },
  { view: "skills", label: "Skills", icon: paths.grid },
  { view: "runs", label: "Runs", icon: paths.pulse },
];

type Props = {
  width: number;
  collapsed: boolean;
  resizing: boolean;
  onResizeStart: (e: React.PointerEvent) => void;
  view: View;
  onNav: (view: Exclude<View, "chat">) => void;
  onNewChat: () => void;
  sessions: SessionSummary[];
  sessionId: string | null;
  running: (id: string) => boolean;
  onPick: (s: SessionSummary) => void;
  onDelete: (id: string) => void;
  error: string;
  initials: string;
  displayName: string;
  workspaceName: string;
  onSettings: () => void;
};

export function Sidebar({
  width, collapsed, resizing, onResizeStart, view, onNav, onNewChat, sessions, sessionId, running, onPick, onDelete,
  error, initials, displayName, workspaceName, onSettings,
}: Props) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [accountOpen]);

  const navBtn = (active: boolean) =>
    `flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors ${
      active ? "bg-bg-active text-fg" : "text-fg-soft hover:bg-bg-hover hover:text-fg"
    }`;

  return (
    <nav
      aria-label="Chats"
      style={{ width }}
      className={`relative flex shrink-0 flex-col border-r border-line bg-bg-sidebar px-2.5 pb-2.5 pt-3.5 ${resizing ? "" : "transition-[width]"}`}
    >
      {!collapsed && (
        <div onPointerDown={onResizeStart} className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-line" />
      )}

      <button
        type="button"
        onClick={onNewChat}
        title="New chat (Ctrl N)"
        className="mb-2 flex h-[38px] w-full items-center gap-2.5 rounded-[10px] border border-line px-2.5 text-[14px] text-fg transition-colors hover:border-brand/35 hover:bg-bg-hover"
      >
        <span className="text-brand"><Icon d={paths.plus} size={16} stroke={2} /></span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left">New chat</span>
            <span className="font-mono text-[11px] text-fg-dim">Ctrl N</span>
          </>
        )}
      </button>

      {NAV.map((n) => (
        <button key={n.view} type="button" title={n.label} aria-current={view === n.view ? "page" : undefined} onClick={() => onNav(n.view)} className={navBtn(view === n.view)}>
          <Icon d={n.icon} size={16} />
          {!collapsed && n.label}
        </button>
      ))}

      {error && !collapsed && (
        <p className="mt-2 rounded-lg bg-err-bg px-2.5 py-1.5 text-[12px] text-err-fg">{error}</p>
      )}

      {!collapsed && <div className="px-2.5 pb-2 pt-5 text-[12px] font-medium text-fg-dim">Recents</div>}
      <div className="sidebar-scroll -mx-1 min-h-0 flex-1 space-y-px overflow-auto px-1">
        {!collapsed && sessions.length === 0 && <p className="px-2.5 text-[12px] text-fg-dim">No chats yet.</p>}
        {!collapsed && sessions.map((s) => (
          <Row
            key={s.id}
            active={view === "chat" && s.id === sessionId}
            onClick={() => onPick(s)}
            onDelete={() => onDelete(s.id)}
            icon={running(s.id) ? <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-ok" title="Running" /> : undefined}
          >
            {s.title}
          </Row>
        ))}
      </div>

      <div ref={accountRef} className="relative pt-2">
        {accountOpen && (
          <div role="menu" className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-line bg-bg-active p-1.5 text-[13.5px] shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
            <button role="menuitem" type="button" className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left hover:bg-bg-raised" onClick={() => { setAccountOpen(false); onSettings(); }}>
              <span className="flex items-center gap-2.5"><Icon d={paths.settings} size={15} /> Settings</span>
              <span className="font-mono text-[11px] text-fg-dim">Ctrl ,</span>
            </button>
          </div>
        )}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((v) => !v)}
          className={`flex h-[52px] w-full items-center gap-2.5 rounded-[10px] text-left hover:bg-bg-hover ${collapsed ? "justify-center" : "px-2"}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand/35 bg-bg-active text-[12px] font-semibold text-brand">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13.5px] font-medium">{displayName}</span>
                {workspaceName && <span className="truncate text-[12px] text-fg-dim">{workspaceName}</span>}
              </span>
              <span className="text-fg-dim"><Icon d={paths.updown} size={16} /></span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
