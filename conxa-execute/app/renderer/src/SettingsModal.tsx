import { useEffect, useState } from "react";
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
  const [version, setVersion] = useState("");
  const [checkPhase, setCheckPhase] = useState<"idle" | "checking" | "available" | "not-available" | "error">("idle");
  const [latestVersion, setLatestVersion] = useState("");
  const [checkError, setCheckError] = useState("");
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.conxaExecute.update.getVersion().then((v) => { if (mounted) setVersion(v); }).catch(() => {});
    const unsub = window.conxaExecute.update.onStatus((msg) => {
      if (!mounted) return;
      if (msg.phase === "download-progress") setDownloadPercent(msg.percent);
      else if (msg.phase === "downloaded") { setDownloadPercent(null); setDownloaded(true); }
      else if (msg.phase === "error") { setCheckPhase("error"); setCheckError(msg.message); }
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const checkForUpdate = async () => {
    setCheckPhase("checking");
    setCheckError("");
    try {
      const result = await window.conxaExecute.update.check();
      setVersion(result.currentVersion);
      if (result.error) {
        setCheckPhase("error");
        setCheckError(result.error);
      } else if (result.available && result.latestVersion) {
        setCheckPhase("available");
        setLatestVersion(result.latestVersion);
      } else {
        setCheckPhase("not-available");
      }
    } catch (err) {
      setCheckPhase("error");
      setCheckError(String(err));
    }
  };

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

          <section className="mb-8">
            <h3 className="mb-1 text-[15px] font-medium">Your CONXA account</h3>
            <p className="mb-3 text-sm text-fg-muted">Signed in as {identity?.email || identity?.name || identity?.user_id}.</p>
            <Button variant="secondary" onClick={onLogout}>Sign out</Button>
          </section>

          <section>
            <h3 className="mb-1 text-[15px] font-medium">Software update</h3>
            <p className="mb-3 text-sm text-fg-muted">
              CONXA updates itself in the background. Check here if you want the latest version right away.
            </p>
            <div className="space-y-2 rounded-lg border border-line bg-bg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Current version</span>
                <span className="text-fg">{version || "—"}</span>
              </div>

              {checkPhase === "available" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">New version available</span>
                  <span className="text-fg">{latestVersion}</span>
                </div>
              )}
              {checkPhase === "not-available" && <p className="text-sm text-fg-dim">You're up to date.</p>}
              {checkPhase === "error" && <p className="text-sm text-err">{checkError}</p>}

              {downloadPercent !== null && (
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-fg-dim">
                    <span>Downloading update…</span>
                    <span>{Math.round(downloadPercent)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-active">
                    <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${downloadPercent}%` }} />
                  </div>
                </div>
              )}
              {downloaded && <p className="text-sm text-fg-dim">Update downloaded — install now, or it will install next time you quit.</p>}

              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={checkForUpdate} disabled={checkPhase === "checking"}>
                  {checkPhase === "checking" ? "Checking…" : "Check for updates"}
                </Button>
                {downloaded && <Button onClick={() => window.conxaExecute.update.install()}>Install now</Button>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
