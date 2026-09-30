import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, paths } from "./ui";

function Chrome({
  label,
  onClick,
  disabled,
  children,
  size = "small",
  className = "",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  size?: "small" | "wide";
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`app-region-no-drag flex items-center justify-center text-fg-dim transition-colors hover:bg-bg-elevated hover:text-fg disabled:pointer-events-none disabled:opacity-40 ${
        size === "wide" ? "h-11 w-11" : "h-8 w-8 rounded-lg"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The current chat's name, with a Rename / Delete menu. */
function ChatTitle({ title, onRename, onDelete }: { title: string; onRename: (t: string) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function commit() {
    const next = (draft || "").trim();
    setDraft(null);
    if (next && next !== title) onRename(next);
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        aria-label="Chat name"
        className="app-region-no-drag h-[30px] w-[320px] rounded-lg border border-brand/50 bg-bg-elevated px-2.5 text-center text-[13.5px] text-fg outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    );
  }

  return (
    <div ref={ref} className="app-region-no-drag relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[30px] max-w-[420px] items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] text-fg-soft hover:bg-bg-elevated hover:text-fg"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{title}</span>
        <span className="text-fg-dim"><Icon d={paths.chevron} size={14} /></span>
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-xl border border-line bg-bg-active p-1.5 text-[13.5px] shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
          <button role="menuitem" type="button" className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-fg hover:bg-bg-raised" onClick={() => { setOpen(false); setDraft(title); }}>
            <Icon d={paths.edit} size={15} /> Rename
          </button>
          <button role="menuitem" type="button" className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-err hover:bg-bg-raised" onClick={() => { setOpen(false); onDelete(); }}>
            <Icon d={paths.trash} size={15} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

type Props = {
  leftWidth: number;
  onToggleSidebar: () => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  title: string | null;
  onRename: (title: string) => void;
  onDelete: () => void;
  browserAvailable: boolean;
  browserHidden: boolean;
  onToggleBrowser: () => void;
};

export function TitleBar({
  leftWidth,
  onToggleSidebar,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  title,
  onRename,
  onDelete,
  browserAvailable,
  browserHidden,
  onToggleBrowser,
}: Props) {
  const wc = window.conxaExecute.windowControls;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    void wc.isMaximized().then((value) => {
      if (mounted) setIsMaximized(value);
    });
    const unsubscribe = wc.onMaximizeChange(setIsMaximized);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [wc]);

  return (
    <header className="app-region-drag flex h-11 shrink-0 select-none items-center border-b border-line">
      <div style={{ width: leftWidth, minWidth: "fit-content" }} className="flex h-full shrink-0 items-center gap-0.5 border-r border-line bg-bg-sidebar px-2.5">
        <Chrome label="Toggle sidebar" onClick={onToggleSidebar}>
          <Icon d={paths.panel} size={16} />
        </Chrome>
        <Chrome label="Back" onClick={onBack} disabled={!canGoBack}>
          <Icon d={paths.back} size={16} />
        </Chrome>
        <Chrome label="Forward" onClick={onForward} disabled={!canGoForward}>
          <Icon d={paths.forward} size={16} />
        </Chrome>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        {title && <ChatTitle title={title} onRename={onRename} onDelete={onDelete} />}
      </div>

      {/* Account lives in the sidebar footer only — a second avatar here used to
          toggle the same popover, which is anchored to the sidebar, so clicking
          it opened a menu in the opposite corner of the window. */}
      <div className="app-region-no-drag flex h-full items-center pr-1">
        <button
          type="button"
          aria-label={browserHidden ? "Show browser panel" : "Hide browser panel"}
          aria-pressed={browserAvailable && !browserHidden}
          title={browserAvailable ? undefined : "The browser panel opens when a skill runs"}
          disabled={!browserAvailable}
          onClick={onToggleBrowser}
          className={`mr-2.5 flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors hover:bg-bg-elevated hover:text-fg disabled:pointer-events-none disabled:opacity-40 ${
            browserAvailable && !browserHidden ? "text-fg" : "text-fg-dim"
          }`}
        >
          <Icon d={paths.browser} size={15} /> Browser
        </button>
        <Chrome label="Minimize" size="wide" onClick={() => void wc.minimize()}>
          <Icon d={paths.minimize} size={14} />
        </Chrome>
        <Chrome
          label={isMaximized ? "Restore" : "Maximize"}
          size="wide"
          onClick={() => {
            void wc.toggleMaximize().then((maximized) => setIsMaximized(maximized));
          }}
        >
          <Icon d={isMaximized ? paths.restore : paths.maximize} size={13} />
        </Chrome>
        <Chrome
          label="Close"
          size="wide"
          className="hover:bg-err/80 hover:text-white"
          onClick={() => void wc.close()}
        >
          <Icon d={paths.x} size={14} />
        </Chrome>
      </div>
    </header>
  );
}
