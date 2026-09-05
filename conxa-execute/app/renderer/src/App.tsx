import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, ChatMode, Entitlement, HistoryRow, Identity, SessionSummary, SkillRow } from "./bridge";
import { SettingsModal } from "./SettingsModal";
import { TitleBar } from "./TitleBar";
import { Icon, Row, paths } from "./ui";

type Mode = "form" | "chat";

function statusLabel(status: string) {
  if (status === "completed") return "Done";
  if (status === "busy") return "Busy";
  return "Failed";
}

function userDisplayName(identity: Identity | null, signedIn: boolean) {
  if (identity?.name?.trim()) return identity.name.trim();
  if (identity?.email?.trim()) return identity.email.split("@")[0];
  return signedIn ? "Account" : "Guest";
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fieldList(schema: Record<string, unknown>): { name: string; required: boolean; description: string }[] {
  const props = (schema.properties || schema.fields || {}) as Record<string, { description?: string; type?: string }>;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  if (props && typeof props === "object" && !Array.isArray(props) && Object.keys(props).length) {
    return Object.keys(props).map((name) => ({
      name,
      required: required.has(name),
      description: String(props[name]?.description || ""),
    }));
  }
  if (Array.isArray(schema)) {
    return (schema as { name?: string; key?: string; required?: boolean; description?: string }[]).map((f) => ({
      name: String(f.name || f.key || ""),
      required: Boolean(f.required),
      description: String(f.description || ""),
    }));
  }
  return [];
}

export function App() {
  const api = window.conxaExecute;
  const [runtimeOk, setRuntimeOk] = useState<boolean | null>(null);
  const [runtimeMsg, setRuntimeMsg] = useState("");
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [selected, setSelected] = useState<SkillRow | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [hasKey, setHasKey] = useState(false);
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("byok");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [plansUrl, setPlansUrl] = useState("");

  const refreshHistory = useCallback(async () => {
    const h = await api.history();
    setHistory(h.items || []);
  }, [api]);

  const refreshSessions = useCallback(async () => {
    const r = await api.listSessions();
    const list = r.sessions || [];
    setSessions(list);
    return list;
  }, [api]);

  const refreshAccount = useCallback(async () => {
    const status = await api.authStatus();
    setSignedIn(status.signedIn);
    setIdentity(status.identity || null);
    if (!status.signedIn) {
      setEntitlement(null);
      return;
    }
    const e = await api.getEntitlement();
    setEntitlement(e.entitlement || null);
    setPlansUrl(e.plansUrl || "");
  }, [api]);

  const load = useCallback(async () => {
    const st = await api.runtimeStatus();
    setRuntimeOk(st.ok);
    setRuntimeMsg(st.ok ? "" : st.message || "Runtime missing");
    const s = await api.getSettings();
    setHasKey(Boolean(s.hasKey));
    setBaseURL(s.baseURL || "");
    setModel(s.model || "");
    setChatMode(s.mode || "byok");
    await refreshHistory();
    await refreshAccount();

    const list = await refreshSessions();
    const current = list[0] || (await api.createSession()).session;
    if (current) {
      setSessionId(current.id);
      const loaded = await api.loadSession({ id: current.id });
      setChatLog(loaded.session?.messages || []);
    }

    if (!st.ok) {
      setSkills([]);
      return;
    }
    const listed = await api.listSkills();
    if (!listed.ok) {
      setRuntimeOk(false);
      setRuntimeMsg(listed.message || "Could not list skills");
      setSkills([]);
      return;
    }
    setSkills(listed.skills || []);
  }, [api, refreshHistory, refreshSessions, refreshAccount]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected) {
      setSchema({});
      setValues({});
      return;
    }
    api.getInputs({ skill: selected.skill, workspace_id: selected.workspace_id }).then((r) => {
      const sc = (r.schema || {}) as Record<string, unknown>;
      setSchema(sc);
      const fields = fieldList(sc);
      const next: Record<string, string> = {};
      for (const f of fields) next[f.name] = "";
      setValues(next);
    });
  }, [api, selected]);

  const fields = useMemo(() => fieldList(schema), [schema]);
  const displayLog = useMemo(
    () => chatLog.filter((m) => (m.role === "user" || m.role === "assistant") && m.content),
    [chatLog],
  );
  const chatReady = chatMode === "byok" ? hasKey : signedIn;
  const emptyChatHome = mode === "chat" && displayLog.length === 0 && !selected;
  const formPicker = mode === "form" && !selected;
  const displayName = userDisplayName(identity, signedIn);
  const initials = userInitials(displayName);
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
  const canGoBack = Boolean(selected) || sessionIndex > 0;
  const canGoForward = sessionIndex >= 0 && sessionIndex < sessions.length - 1;

  async function runForm() {
    if (!selected || busy) return;
    setBusy(true);
    setFormMsg("");
    const r = await api.execute({ skill: selected.skill, workspace_id: selected.workspace_id, inputs: values });
    setBusy(false);
    setFormMsg(!r.ok ? (r.message || "Run failed") : `${statusLabel(r.status || "failed")}${r.run_id ? ` · ${r.run_id}` : ""}\n${r.text || ""}`);
    await refreshHistory();
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || busy || !sessionId) return;
    setChatInput("");
    setChatLog((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    const r = await api.chatSend({ text, sessionId });
    setBusy(false);
    if (r.ok) {
      // Reload from the session store rather than hand-appending — main.js
      // may have pruned/compacted the transcript for this turn, and that's
      // the authoritative post-turn state.
      const loaded = await api.loadSession({ id: sessionId });
      setChatLog(loaded.session?.messages || []);
    } else {
      setChatLog((prev) => [...prev, { role: "assistant", content: r.message || "Error" }]);
    }
    await refreshHistory();
    await refreshSessions();
  }

  async function saveSettings() {
    const r = await api.saveSettings({ baseURL, model, apiKey, mode: chatMode });
    if (r.ok) {
      setHasKey(Boolean(r.hasKey));
      setApiKey("");
      setShowSettings(false);
    }
  }

  async function changeMode(next: ChatMode) {
    setChatMode(next);
    await api.saveSettings({ mode: next });
  }

  async function login() {
    const r = await api.authLogin();
    if (r.ok) await refreshAccount();
  }

  async function logout() {
    await api.authLogout();
    await refreshAccount();
  }

  async function goHome() {
    setSelected(null);
    setFormMsg("");
    setMode("chat");
    const r = await api.createSession();
    if (r.session) {
      await refreshSessions();
      setSessionId(r.session.id);
      setChatLog([]);
    }
  }

  async function pickSession(s: SessionSummary) {
    setSelected(null);
    setMode("chat");
    setSessionId(s.id);
    const loaded = await api.loadSession({ id: s.id });
    setChatLog(loaded.session?.messages || []);
  }

  function pickSkill(s: SkillRow) {
    setSelected(s);
    setMode("form");
  }

  async function deleteChat(id: string) {
    await api.deleteSession({ id });
    const list = await refreshSessions();
    if (sessionId === id) {
      const next = list[0] || (await api.createSession()).session;
      if (next) {
        setSessionId(next.id);
        const loaded = await api.loadSession({ id: next.id });
        setChatLog(loaded.session?.messages || []);
      } else {
        setSessionId(null);
        setChatLog([]);
      }
    }
  }

  async function deleteRun(at: string) {
    const r = await api.deleteHistory({ at });
    if (r.ok) setHistory(r.items || []);
  }

  function handleBack() {
    if (selected) {
      setSelected(null);
      setMode("chat");
      return;
    }
    if (sessionIndex > 0) pickSession(sessions[sessionIndex - 1]);
  }

  function handleForward() {
    if (sessionIndex >= 0 && sessionIndex < sessions.length - 1) {
      pickSession(sessions[sessionIndex + 1]);
    }
  }

  const composer = (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="rounded-2xl border border-line bg-bg-elevated px-3 pb-2 pt-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <textarea
          className="min-h-[72px] w-full resize-none bg-transparent px-1 text-[15px] text-fg placeholder:text-fg-dim outline-none"
          rows={emptyChatHome ? 3 : 2}
          value={mode === "chat" ? chatInput : ""}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && mode === "chat") {
              e.preventDefault();
              sendChat();
            }
          }}
          disabled={mode === "chat" && (!runtimeOk || !chatReady || busy)}
          placeholder={
            mode === "form"
              ? "Switch to Chat to ask in words — or pick a skill from the home screen."
              : chatReady
                ? "How can I help you today?"
                : chatMode === "byok"
                  ? "Add your API key in Settings to use chat"
                  : "Sign in to CONXA in Settings to use chat"
          }
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted">
              <Icon d={paths.plus} size={16} />
            </span>
            <div className="flex rounded-full bg-bg p-0.5 text-[12px]">
              <button type="button" className={`rounded-full px-3 py-1 ${mode === "chat" ? "bg-bg-active text-fg" : "text-fg-dim"}`} onClick={() => setMode("chat")}>Chat</button>
              <button type="button" className={`rounded-full px-3 py-1 ${mode === "form" ? "bg-bg-active text-fg" : "text-fg-dim"}`} onClick={() => setMode("form")}>Form</button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-fg-dim">
            <span>{chatMode === "byok" ? model || "Your model" : "CONXA"}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-30"
              disabled={mode !== "chat" || !runtimeOk || !chatReady || busy}
              onClick={sendChat}
              aria-label="Send"
            >
              <Icon d={paths.send} size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <TitleBar
        onToggleSidebar={() => setCollapsed((v) => !v)}
        onMenu={() => setShowSettings(true)}
        onBack={handleBack}
        onForward={handleForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        initials={initials}
        onProfile={() => setAccountOpen((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
      <aside className={`flex shrink-0 flex-col border-r border-line bg-bg-sidebar transition-[width] ${collapsed ? "w-[52px]" : "w-[260px]"}`}>
        <div className="px-2 pt-3">
          <button type="button" onClick={goHome} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-bg-hover hover:text-fg">
            <Icon d={paths.plus} />
            {!collapsed && "New"}
          </button>
        </div>

        <div className="sidebar-scroll min-h-0 flex-1 overflow-auto px-2 py-3">
          {!collapsed && <p className="mb-1 px-2 text-[11px] text-fg-dim">Chats</p>}
          {sessions.length === 0 && !collapsed && <p className="px-2 text-[12px] text-fg-dim">No chats yet.</p>}
          {sessions.map((s) => (
            <Row
              key={s.id}
              active={s.id === sessionId}
              onClick={() => pickSession(s)}
              onDelete={collapsed ? undefined : () => deleteChat(s.id)}
              icon={<Icon d={paths.list} size={15} />}
            >
              {collapsed ? "" : s.title}
            </Row>
          ))}

          {!collapsed && <p className="mb-1 mt-5 px-2 text-[11px] text-fg-dim">Runs</p>}
          {history.slice(0, 24).map((h, i) => (
            <Row
              key={`${h.at}-${i}`}
              onDelete={collapsed ? undefined : () => deleteRun(h.at)}
              icon={<Icon d={paths.list} size={15} />}
            >
              {collapsed ? "" : (
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{h.skill || "run"}</span>
                  <span className={h.status === "completed" ? "text-ok" : "text-err"}>{statusLabel(h.status)}</span>
                </span>
              )}
            </Row>
          ))}
        </div>

        <div className="relative border-t border-line p-2">
          {accountOpen && (
            <div className="absolute bottom-14 left-2 right-2 rounded-xl border border-line bg-bg-elevated p-1 text-[13px] shadow-xl">
              <button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-bg-hover" onClick={() => { setAccountOpen(false); setShowSettings(true); }}>
                <span className="flex items-center gap-2"><Icon d={paths.settings} size={15} /> Settings</span>
                <span className="text-[11px] text-fg-dim">Ctrl ,</span>
              </button>
            </div>
          )}
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-bg-hover" onClick={() => setAccountOpen((v) => !v)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-active text-[11px] font-medium text-fg">
              {initials}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left text-[13px]">{displayName}</span>
                <Icon d={paths.chevron} size={14} />
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {runtimeOk === false && (
          <div className="border-b border-err/30 bg-[#3a1c1c] px-5 py-2 text-sm text-[#f0c4c4]">{runtimeMsg}</div>
        )}

        {emptyChatHome && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
            <h1 className="mb-8 font-serif text-[40px] font-normal tracking-tight">Ready when you are</h1>
            {composer}
            <div className="mt-5 flex max-w-[720px] flex-wrap justify-center gap-2">
              {skills.slice(0, 5).map((s) => (
                <button
                  key={s.skill}
                  type="button"
                  className="rounded-full border border-line bg-transparent px-3.5 py-1.5 text-[13px] text-fg-muted hover:bg-bg-hover hover:text-fg"
                  onClick={() => pickSkill(s)}
                >
                  {s.name || s.skill}
                </button>
              ))}
            </div>
          </div>
        )}

        {formPicker && (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <p className="mb-6 font-serif text-3xl">Pick a skill to fill and run</p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {skills.map((s) => (
                <button key={s.skill} type="button" className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-fg-muted hover:bg-bg-hover" onClick={() => pickSkill(s)}>
                  {s.name || s.skill}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "form" && selected && (
          <div className="mx-auto w-full max-w-lg flex-1 overflow-auto theme-scroll px-6 py-10">
            <h1 className="font-serif text-3xl">{selected.name || selected.skill}</h1>
            {selected.description && <p className="mt-2 text-sm text-fg-muted">{selected.description}</p>}
            <div className="mt-8 space-y-4">
              {fields.map((f) => (
                <label key={f.name} className="block text-sm">
                  <span className="text-fg-muted">{f.name}{f.required ? " *" : ""}</span>
                  <input className="mt-1.5 w-full rounded-xl border border-line bg-bg-elevated px-3 py-2.5" value={values[f.name] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} disabled={!runtimeOk} />
                  {f.description && <span className="mt-1 block text-xs text-fg-dim">{f.description}</span>}
                </label>
              ))}
              {fields.length === 0 && <p className="text-sm text-fg-muted">This skill has no declared inputs.</p>}
              <button type="button" className="rounded-xl bg-fg px-5 py-2.5 text-sm font-medium text-bg disabled:opacity-40" disabled={!runtimeOk || busy} onClick={runForm}>
                {busy ? "Running…" : "Run"}
              </button>
              {formMsg && <pre className="whitespace-pre-wrap text-xs text-fg-dim">{formMsg}</pre>}
            </div>
          </div>
        )}

        {mode === "chat" && !emptyChatHome && (
          <div className="flex min-h-0 flex-1 flex-col">
            {!chatReady && (
              <p className="mx-auto mt-4 max-w-[720px] rounded-xl border border-warn/40 bg-[#2a2114] px-4 py-2 text-sm text-[#e8d4b0]">
                {chatMode === "byok"
                  ? "Chat needs your own API key. Open Settings — the form still runs skills with no model."
                  : "Sign in to CONXA in Settings to use chat — the form still runs skills with no login."}
              </p>
            )}
            <div className="theme-scroll min-h-0 flex-1 space-y-4 overflow-auto px-8 py-8">
              {displayLog.map((m, i) => (
                <div key={i} className="mx-auto max-w-[720px]">
                  <div className="mb-1 text-[11px] text-fg-dim">{m.role === "user" ? "You" : "CONXA"}</div>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">{composer}</div>
          </div>
        )}
      </main>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        mode={chatMode}
        onModeChange={changeMode}
        baseURL={baseURL}
        model={model}
        apiKey={apiKey}
        hasKey={hasKey}
        onBaseURL={setBaseURL}
        onModel={setModel}
        onApiKey={setApiKey}
        onSave={saveSettings}
        signedIn={signedIn}
        identity={identity}
        entitlement={entitlement}
        plansUrl={plansUrl}
        onLogin={login}
        onLogout={logout}
      />
      </div>
    </div>
  );
}
