import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Attachment, ExecuteContext } from "./bridge";
import { Icon, paths } from "./ui";

type Permission = "ask" | "auto";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Data URLs are base64 (4 chars per 3 bytes); text attachments are the text itself.
function attachmentSize(a: Attachment) {
  return a.kind === "image" ? Math.round((a.data.length - a.data.indexOf(",") - 1) * 0.75) : new Blob([a.data]).size;
}

function extOf(name: string) {
  const m = /\.([a-z0-9]{1,4})$/i.exec(name);
  return m ? m[1].toUpperCase() : "TXT";
}

/** Click-outside-to-close for the small popovers in the composer toolbar. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return { open, setOpen, ref };
}

function MenuItem({ icon, children, hint, onClick }: { icon: string; children: ReactNode; hint?: string; onClick: () => void }) {
  return (
    <button role="menuitem" type="button" onClick={onClick} className="flex h-[38px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] text-fg hover:bg-bg-raised">
      <span className="text-fg-muted"><Icon d={icon} size={16} /></span>
      <span className="flex-1">{children}</span>
      {hint && <span className="font-mono text-[11px] text-fg-dim">{hint}</span>}
    </button>
  );
}

function PermissionOption({ active, icon, iconClass, title, desc, onClick }: {
  active: boolean; icon: string; iconClass: string; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={active}
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-[9px] px-2.5 py-2 text-left ${active ? "bg-bg-raised text-fg" : "text-fg hover:bg-bg-raised"}`}
    >
      <span className={`mt-px ${iconClass}`}><Icon d={icon} size={16} /></span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[13.5px]">{title}</span>
        <span className="text-[12px] text-fg-dim">{desc}</span>
      </span>
      {active && <span className="mt-0.5 text-brand"><Icon d={paths.tick} size={15} stroke={2.2} /></span>}
    </button>
  );
}

type Props = {
  variant: "home" | "thread";
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  ready: boolean;
  busy: boolean;
  attachments: Attachment[];
  attachError: string;
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (index: number) => void;
  onScreenshot: () => void;
  onCaptureBrowser: () => void;
  editing: boolean;
  onCancelEdit: () => void;
  mode: "chat" | "form";
  onMode: (m: "chat" | "form") => void;
  permission: Permission;
  onPermission: (p: Permission) => void;
  contexts: ExecuteContext[];
  activeWorkspaceId: string;
  onSwitchContext: (id: string) => void;
  switchingContext: boolean;
};

export function Composer(p: Props) {
  const plus = usePopover();
  const ws = usePopover();
  const fileInput = useRef<HTMLInputElement>(null);
  const home = p.variant === "home";
  const inputDisabled = !p.ready || p.busy;
  const canSend = p.ready && !p.busy && Boolean(p.value.trim() || p.attachments.length);
  const active = p.contexts.find((c) => c.workspace_id === p.activeWorkspaceId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        fileInput.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const placeholder = !p.ready
    ? "Waiting for Execute access…"
    : p.attachments.length
      ? "Add a message, or send the files as they are…"
      : home ? "What should Conxa do?" : "Reply to Conxa…";

  const menuPos = home ? "top-full mt-1.5" : "bottom-full mb-1.5";

  return (
    <div className="w-full">
      <div className={`relative flex w-full flex-col border border-line bg-bg-elevated shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-colors focus-within:border-brand/40 ${home ? "gap-[22px] rounded-[22px] pb-2.5 pl-[18px] pr-3 pt-[18px]" : "gap-2.5 rounded-[20px] pb-2.5 pl-4 pr-3 pt-3.5"}`}>
        {p.editing && (
          <div className="flex items-center justify-between rounded-lg bg-bg px-2.5 py-1 text-[12px] text-fg-dim">
            <span>Editing message — sending will remove the replies after it</span>
            <button type="button" className="rounded p-0.5 hover:text-fg" aria-label="Cancel edit" onClick={p.onCancelEdit}>
              <Icon d={paths.x} size={12} />
            </button>
          </div>
        )}

        {(p.attachments.length > 0 || p.attachError) && (
          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            {p.attachments.map((a, i) => (
              <div key={i} className="relative">
                {a.kind === "image" ? (
                  <img src={a.data} alt={a.name} title={a.name} className="h-16 w-16 rounded-[10px] border border-line bg-bg-raised object-cover" />
                ) : (
                  <div className="flex h-16 items-center gap-2.5 rounded-[10px] border border-line bg-bg-sidebar pl-2.5 pr-3.5">
                    <span className="flex h-11 w-9 items-center justify-center rounded-md bg-ok/15 text-[10px] font-bold tracking-[0.04em] text-ok">{extOf(a.name)}</span>
                    <span className="flex flex-col gap-0.5">
                      <span className="max-w-[160px] truncate text-[13px] text-fg">{a.name}</span>
                      <span className="text-[12px] text-fg-dim">{formatBytes(attachmentSize(a))}</span>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => p.onRemoveAttachment(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-bg text-fg-soft hover:text-fg"
                >
                  <Icon d={paths.x} size={10} stroke={3} />
                </button>
              </div>
            ))}
            {p.attachError && <span className="text-[12px] text-err">{p.attachError}</span>}
          </div>
        )}

        <textarea
          aria-label="Message Conxa"
          className={`theme-scroll max-h-[220px] w-full resize-none overflow-y-auto bg-transparent leading-normal text-fg outline-none placeholder:text-fg-dim ${home ? "min-h-12 text-[16px]" : "min-h-6 text-[15px]"}`}
          rows={home ? 2 : 1}
          spellCheck={false}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) p.onSend();
            }
          }}
          disabled={inputDisabled}
          placeholder={placeholder}
        />

        <div className="flex items-center gap-1.5">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { p.onAddFiles(e.target.files); e.target.value = ""; }} />
          <div ref={plus.ref} className="relative">
            <button
              type="button"
              aria-label="Add attachments and options"
              aria-haspopup="menu"
              aria-expanded={plus.open}
              onClick={() => plus.setOpen((v) => !v)}
              className={`flex h-8 w-8 items-center justify-center rounded-[10px] border transition-colors ${plus.open ? "border-brand/45 bg-bg-active text-fg" : "border-line text-fg-muted hover:bg-bg-hover hover:text-fg"}`}
            >
              <Icon d={paths.plus} size={16} stroke={1.9} />
            </button>
            {plus.open && (
              <div role="menu" aria-label="Composer options" className={`absolute left-0 z-20 flex w-[280px] flex-col rounded-[14px] border border-line bg-bg-active p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.5)] ${menuPos}`}>
                <MenuItem icon={paths.paperclip} hint="Ctrl U" onClick={() => { plus.setOpen(false); fileInput.current?.click(); }}>Add files or photos</MenuItem>
                <MenuItem icon={paths.screenshot} onClick={() => { plus.setOpen(false); p.onScreenshot(); }}>Take a screenshot</MenuItem>
                <MenuItem icon={paths.browser} onClick={() => { plus.setOpen(false); p.onCaptureBrowser(); }}>Capture the browser panel</MenuItem>
                <div className="mx-1 my-1.5 h-px bg-line" />
                <div className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-fg-dim">Before a skill runs</div>
                <PermissionOption active={p.permission === "ask"} icon={paths.question} iconClass="text-fg-muted" title="Ask me first" desc="Confirm each run before it starts" onClick={() => p.onPermission("ask")} />
                <PermissionOption active={p.permission === "auto"} icon={paths.shield} iconClass="text-ok" title="Auto-approve" desc="Run skills without asking" onClick={() => p.onPermission("auto")} />
              </div>
            )}
          </div>

          <div role="group" aria-label="Input mode" className="flex rounded-[10px] border border-line bg-bg p-0.5">
            {(["chat", "form"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={p.mode === m}
                onClick={() => p.onMode(m)}
                className={`h-[26px] rounded-lg px-3 text-[12.5px] capitalize ${p.mode === m ? "bg-bg-active font-medium text-fg" : "text-fg-dim hover:text-fg"}`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            title="Change whether Conxa asks before running a skill"
            onClick={() => p.onPermission(p.permission === "auto" ? "ask" : "auto")}
            className="flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <span className={p.permission === "auto" ? "text-ok" : ""}>
              <Icon d={p.permission === "auto" ? paths.shield : paths.question} size={14} stroke={1.9} />
            </span>
            {p.permission === "auto" ? "Auto-approve" : "Ask first"}
          </button>

          <div className="flex-1" />

          {p.contexts.length > 0 && (
            <div ref={ws.ref} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={ws.open}
                disabled={p.switchingContext}
                onClick={() => ws.setOpen((v) => !v)}
                className="flex h-8 max-w-[220px] items-center gap-1 rounded-[10px] px-2.5 text-[12.5px] text-fg-dim hover:bg-bg-hover hover:text-fg disabled:opacity-50"
              >
                <span className="truncate">{active?.workspace_name || "Choose workspace"}</span>
                <Icon d={paths.chevron} size={14} />
              </button>
              {ws.open && (
                <div role="menu" className={`absolute right-0 z-20 w-64 rounded-[14px] border border-line bg-bg-active p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.5)] ${menuPos}`}>
                  <div className="px-2.5 pb-1 pt-1 text-[11.5px] font-medium text-fg-dim">Run skills from</div>
                  {p.contexts.map((c) => (
                    <button
                      key={c.workspace_id}
                      role="menuitemradio"
                      aria-checked={c.workspace_id === p.activeWorkspaceId}
                      type="button"
                      onClick={() => { ws.setOpen(false); p.onSwitchContext(c.workspace_id); }}
                      className="flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] text-fg hover:bg-bg-raised"
                    >
                      <span className="flex-1 truncate">{c.workspace_name}</span>
                      {c.workspace_id === p.activeWorkspaceId && <span className="text-brand"><Icon d={paths.tick} size={15} stroke={2.2} /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            aria-label="Send"
            disabled={!canSend}
            onClick={p.onSend}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-fg text-bg transition-colors disabled:bg-bg-active disabled:text-fg-dim"
          >
            <Icon d={paths.arrowUp} size={16} stroke={2.2} />
          </button>
        </div>
      </div>
      {!home && (
        <div className="pt-2.5 text-center text-[11.5px] text-fg-dim">
          Skills run locally on this computer. Conxa can make mistakes — check important results.
        </div>
      )}
    </div>
  );
}
