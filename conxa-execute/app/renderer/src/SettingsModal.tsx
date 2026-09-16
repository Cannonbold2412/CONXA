import type { ChatMode, Entitlement, Identity } from "./bridge";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: ChatMode;
  baseURL: string;
  model: string;
  apiKey: string;
  hasKey: boolean;
  onBaseURL: (v: string) => void;
  onModel: (v: string) => void;
  onApiKey: (v: string) => void;
  onSave: () => void;
  signedIn: boolean;
  identity: Identity | null;
  entitlement: Entitlement | null;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onLogin: () => void;
  onLogout: () => void;
  redeemCode: string;
  onRedeemCodeChange: (v: string) => void;
  onRedeem: () => void;
  redeeming: boolean;
  redeemMsg: { type: "ok" | "err"; text: string } | null;
};

export function SettingsModal({
  open, onClose, mode, baseURL, model, apiKey, hasKey,
  onBaseURL, onModel, onApiKey, onSave, signedIn, identity, entitlement, theme, onThemeChange, onLogin, onLogout,
  redeemCode, onRedeemCodeChange, onRedeem, redeeming, redeemMsg,
}: Props) {
  if (!open) return null;
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
          <input
            className="mb-3 rounded-lg border border-line bg-bg px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-dim"
            placeholder="Search"
            disabled
          />
          <p className="px-2 pb-1 text-[11px] text-fg-dim">Settings</p>
          <div className="rounded-lg bg-bg-active px-2.5 py-1.5 text-[13px]">General</div>
          <p className="mt-4 px-2 pb-1 text-[11px] text-fg-dim">Mode</p>
          <p className="px-2.5 py-1 text-[13px] text-fg-muted">
            {mode === "byok" ? "Your key runs chat." : "CONXA runs chat for you."}
          </p>
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-8">
          <div className="mb-6 flex items-start justify-between">
            <h2 id="settings-title" className="text-xl font-medium">General</h2>
            <button type="button" className="rounded-md p-1 text-fg-dim hover:bg-bg-hover hover:text-fg" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
            <h3 className="mb-1 text-[15px] font-medium">Execute seat</h3>
            {entitlement?.mode === "workspace_pool" ? (
              <p className="text-sm text-fg-muted">
                ✓ Paid by {entitlement.workspace_name || "your workspace"}. Chat draws from their AI Usage Credits pool
                {typeof entitlement.remaining === "number" ? ` — ${entitlement.remaining.toLocaleString()} credits left.` : "."}
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-fg-muted">Have an invite code from a workspace admin? Redeem it to have your chat paid for by their AI Usage Credits pool.</p>
                <div className="flex gap-2">
                  <input
                    className="w-[min(360px,55%)] rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-shadow focus:border-brand/50 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]"
                    value={redeemCode}
                    onChange={(e) => onRedeemCodeChange(e.target.value)}
                    placeholder="Invite code"
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg hover:bg-white disabled:opacity-40"
                    disabled={!redeemCode.trim() || redeeming}
                    onClick={onRedeem}
                  >
                    {redeeming ? "Redeeming…" : "Redeem"}
                  </button>
                </div>
                {redeemMsg && (
                  <p className={`mt-2 text-sm ${redeemMsg.type === "err" ? "text-err" : "text-ok"}`}>{redeemMsg.text}</p>
                )}
              </>
            )}
          </section>

          {mode === "byok" ? (
            <section>
              <h3 className="mb-1 text-[15px] font-medium">Your model</h3>
              <p className="mb-4 text-sm text-fg-muted">Paste an OpenAI-compatible URL and key. Skills still run with no key from the form.</p>
              <label className="mb-3 flex items-center justify-between gap-6 text-sm">
                <span className="shrink-0 text-fg-muted">Base URL</span>
                <input className="w-[min(360px,55%)] rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-shadow focus:border-brand/50 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]" value={baseURL} onChange={(e) => onBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
              </label>
              <label className="mb-3 flex items-center justify-between gap-6 text-sm">
                <span className="shrink-0 text-fg-muted">Model</span>
                <input className="w-[min(360px,55%)] rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-shadow focus:border-brand/50 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]" value={model} onChange={(e) => onModel(e.target.value)} placeholder="gpt-4o-mini" />
              </label>
              <label className="mb-5 flex items-center justify-between gap-6 text-sm">
                <span className="shrink-0 text-fg-muted">API key</span>
                <input className="w-[min(360px,55%)] rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-shadow focus:border-brand/50 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]" type="password" value={apiKey} onChange={(e) => onApiKey(e.target.value)} placeholder={hasKey ? "•••• saved" : "Required for chat"} />
              </label>
              <button type="button" className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg hover:bg-white" onClick={onSave}>
                Save
              </button>
            </section>
          ) : (
            <section>
              <h3 className="mb-1 text-[15px] font-medium">Your CONXA account</h3>
              {!signedIn ? (
                <>
                  <p className="mb-4 text-sm text-fg-muted">Sign in to use {mode === "topup" ? "Top-up" : "Subscription"} chat — your account holds the balance/plan, no key to paste.</p>
                  <button type="button" className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg hover:bg-white" onClick={onLogin}>
                    Sign in with CONXA
                  </button>
                </>
              ) : (
                <>
                  <p className="mb-3 text-sm text-fg-muted">Signed in as {identity?.email || identity?.name || identity?.user_id}.</p>
                  {entitlement?.mode === "subscription" && (
                    <p className="mb-3 text-sm text-fg-muted">
                      Plan {entitlement.plan_id} — {(entitlement.quota_used ?? 0).toLocaleString()} / {(entitlement.quota_total ?? 0).toLocaleString()} tokens used this period.
                    </p>
                  )}
                  {entitlement?.mode !== "subscription" && entitlement?.mode !== "workspace_pool" && (
                    <p className="mb-3 text-sm text-fg-muted">Balance: {(entitlement?.topup_balance ?? 0).toLocaleString()} tokens.</p>
                  )}
                  <div className="flex gap-2">
                    <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover" onClick={onLogout}>
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
