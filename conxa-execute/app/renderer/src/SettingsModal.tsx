import type { ExecuteContext, Identity } from "./bridge";
import { Button, Icon, paths } from "./ui";

type Props = {
  open: boolean;
  onClose: () => void;
  identity: Identity | null;
  contexts: ExecuteContext[];
  activeWorkspaceId: string;
  onSwitchContext: (workspaceId: string) => void;
  switchingContext: boolean;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onLogout: () => void;
};

const KIND_LABEL: Record<ExecuteContext["kind"], string> = {
  personal: "Personal",
  member: "Team",
  grant: "Granted access",
};

export function SettingsModal({
  open, onClose, identity, contexts, activeWorkspaceId, onSwitchContext, switchingContext, theme, onThemeChange, onLogout,
}: Props) {
  if (!open) return null;
  const active = contexts.find((c) => c.workspace_id === activeWorkspaceId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={onClose}>
      <div
        className="flex h-[min(640px,85vh)] w-[min(860px,94vw)] overflow-hidden rounded-2xl border border-line bg-bg-sidebar shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <nav className="flex w-56 shrink-0 flex-col border-r border-line p-3">
          <p className="mb-3 px-1 text-[13px] font-medium text-fg">CONXA</p>
          <p className="px-2 pb-1 text-[11px] text-fg-dim">Settings</p>
          <div className="rounded-lg bg-bg-active px-2.5 py-1.5 text-[13px]">General</div>
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-8">
          <div className="mb-6 flex items-start justify-between">
            <h2 id="settings-title" className="text-xl font-medium">General</h2>
            <button type="button" className="rounded-md p-1 text-fg-dim hover:bg-bg-hover hover:text-fg" onClick={onClose} aria-label="Close">
              <Icon d={paths.x} size={18} />
            </button>
          </div>

          <section className="mb-8">
            <h3 className="mb-4 text-[15px] font-medium">Appearance</h3>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-fg-muted">Theme</span>
              <div className="flex rounded-lg border border-line bg-bg p-0.5">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs ${theme === "light" ? "bg-bg-active text-fg" : "text-fg-dim hover:text-fg"}`}
                  onClick={() => onThemeChange("light")}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs ${theme === "dark" ? "bg-bg-active text-fg" : "text-fg-dim hover:text-fg"}`}
                  onClick={() => onThemeChange("dark")}
                >
                  Dark
                </button>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h3 className="mb-1 text-[15px] font-medium">Execute access</h3>
            <p className="mb-3 text-sm text-fg-muted">
              Chat draws from this context's AI Usage Credits pool.
              {active && typeof active.credits_remaining === "number"
                ? ` ${active.credits_remaining.toLocaleString()} credits left.`
                : ""}
            </p>
            <div className="space-y-1.5">
              {contexts.map((c) => (
                <button
                  key={c.workspace_id}
                  type="button"
                  disabled={switchingContext || c.workspace_id === activeWorkspaceId}
                  onClick={() => onSwitchContext(c.workspace_id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    c.workspace_id === activeWorkspaceId
                      ? "border-brand/50 bg-brand/10 text-fg"
                      : "border-line text-fg-muted hover:bg-bg-hover hover:text-fg"
                  }`}
                >
                  <span>{c.workspace_name}</span>
                  <span className="text-[11px] text-fg-dim">{KIND_LABEL[c.kind]}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-[15px] font-medium">Your CONXA account</h3>
            <p className="mb-3 text-sm text-fg-muted">Signed in as {identity?.email || identity?.name || identity?.user_id}.</p>
            <Button variant="secondary" onClick={onLogout}>Sign out</Button>
          </section>
        </div>
      </div>
    </div>
  );
}
