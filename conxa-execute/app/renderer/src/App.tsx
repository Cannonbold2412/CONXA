import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, ConfirmRun, ExecuteContext, HistoryRow, Identity, SessionSummary, SkillRow } from "./bridge";
import { SettingsModal } from "./SettingsModal";
import { TitleBar } from "./TitleBar";
import { BrowserPanel } from "./BrowserPanel";
import { Button, Icon, Row, paths } from "./ui";

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

// The runtime's declared-inputs schema is plain JSON-Schema: { properties: {...}, required: [...] }.
function fieldList(schema: Record<string, unknown>): { name: string; required: boolean; description: string }[] {
  const props = (schema.properties || {}) as Record<string, { description?: string; type?: string }>;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  return Object.keys(props).map((name) => ({
    name,
    required: required.has(name),
    description: String(props[name]?.description || ""),
  }));
}

// Confirm card shows what is about to run, but never echoes a secret back onto the screen.
const SECRET_NAME = /pass|secret|token|key|pin\b/i;

function shownInput(name: string, value: unknown) {
  return SECRET_NAME.test(name) ? "••••••" : String(value ?? "");
}

function SkillPills({ skills, onPick, limit }: { skills: SkillRow[]; onPick: (s: SkillRow) => void; limit?: number }) {
  const list = limit ? skills.slice(0, limit) : skills;
  return (
    <div className="flex max-w-[720px] flex-wrap justify-center gap-2">
      {list.map((s) => (
        <button
          key={s.skill}
          type="button"
          className="rounded-full border border-line bg-transparent px-3.5 py-1.5 text-[13px] text-fg-muted hover:bg-bg-hover hover:text-fg"
          onClick={() => onPick(s)}
        >
          {s.name || s.skill}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const api = window.conxaExecute;
  const [runtimeOk, setRuntimeOk] = useState<boolean | null>(null);
  const [runtimeMsg, setRuntimeMsg] = useState("");
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [selected, setSelected] = useState<SkillRow | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown>>({});
  const [inputsError, setInputsError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [formOk, setFormOk] = useState(true);
  const [formDetail, setFormDetail] = useState("");
  const [formDetailsOpen, setFormDetailsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [showSettings, setShowSettings] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [chatLog, setChatLog] = useState<(ChatMessage & { error?: boolean })[]>([]);
  const [streamingMsg, setStreamingMsg] = useState<{ content: string; thinking: string } | null>(null);
  const [pendingRun, setPendingRun] = useState<ConfirmRun | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [contexts, setContexts] = useState<ExecuteContext[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [switchingContext, setSwitchingContext] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [sidebarError, setSidebarError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("conxa-theme") === "light" ? "light" : "dark"),
  );

  useEffect(() => api.onConfirmRun(setPendingRun), [api]);

  function answerRun(approved: boolean) {
    if (!pendingRun) return;
    api.confirmRunReply({ id: pendingRun.id, approved });
    setPendingRun(null);
  }

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("conxa-theme", theme);
  }, [theme]);

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
      setContexts([]);
      setActiveWorkspaceId("");
      return;
    }
    const [settingsRes, contextsRes] = await Promise.all([api.getSettings(), api.getContexts()]);
    const list = contextsRes.contexts || [];
    setContexts(list);
    const stored = settingsRes.activeWorkspaceId || "";
    const serverDefault = contextsRes.active_workspace_id || "";
    const resolved = list.some((c) => c.workspace_id === stored)
      ? stored
      : list.some((c) => c.workspace_id === serverDefault)
        ? serverDefault
        : list[0]?.workspace_id || "";
    setActiveWorkspaceId(resolved);
    if (resolved && resolved !== stored) await api.setContext({ workspaceId: resolved });
  }, [api]);

  const load = useCallback(async () => {
    setStartupError("");
    try {
      const st = await api.runtimeStatus();
      setRuntimeOk(st.ok);
      setRuntimeMsg(st.ok ? "" : st.message || "Runtime missing");
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
    } catch (e) {
      // Any failure here used to leave the app permanently showing a blank
      // window (authChecked never became true) — show a real screen instead.
      setStartupError(e instanceof Error ? e.message : "CONXA couldn't start.");
    } finally {
      setAuthChecked(true);
    }
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
      setInputsError("");
      return;
    }
    let cancelled = false;
    setInputsError("");
    api.getInputs({ skill: selected.skill, workspace_id: selected.workspace_id })
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setInputsError(r.message || "Could not load this skill's inputs.");
          return;
        }
        const sc = (r.schema || {}) as Record<string, unknown>;
        setSchema(sc);
        const fields = fieldList(sc);
        const next: Record<string, string> = {};
        for (const f of fields) next[f.name] = "";
        setValues(next);
      })
      .catch(() => {
        if (!cancelled) setInputsError("Could not load this skill's inputs.");
      });
    return () => {
      cancelled = true;
    };
  }, [api, selected]);

  const fields = useMemo(() => fieldList(schema), [schema]);
  const displayLog = useMemo(
    () => chatLog.filter((m) => (m.role === "user" || m.role === "assistant") && m.content),
    [chatLog],
  );
  // Past the sign-in gate below, `signedIn` is always true — chat is ready
  // as soon as an Execute context (personal or team) has resolved.
  const chatReady = Boolean(activeWorkspaceId);
  const activeContext = contexts.find((c) => c.workspace_id === activeWorkspaceId);
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
    setFormDetail("");
    setFormDetailsOpen(false);
    const r = await api.execute({ skill: selected.skill, workspace_id: selected.workspace_id, inputs: values });
    setBusy(false);
    setFormOk(Boolean(r.ok));
    setFormMsg(!r.ok ? (r.message || "Run failed") : `${statusLabel(r.status || "failed")}${r.run_id ? ` · ${r.run_id}` : ""}`);
    setFormDetail(r.ok ? r.text || "" : "");
    await refreshHistory();
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || busy || !sessionId) return;
    setChatInput("");
    setChatLog((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    setStreamingMsg({ content: "", thinking: "" });
    const requestId = crypto.randomUUID();
    const unsubscribe = api.onChatDelta((delta) => {
      if (delta.requestId !== requestId) return;
      setStreamingMsg((prev) => {
        const base = prev || { content: "", thinking: "" };
        return delta.type === "reasoning"
          ? { ...base, thinking: base.thinking + delta.text }
          : { ...base, content: base.content + delta.text };
      });
    });
    try {
      const r = await api.chatSend({ text, sessionId, requestId });
      if (r.ok) {
        // Reload from the session store rather than hand-appending — main.js
        // may have pruned/compacted the transcript for this turn, and that's
        // the authoritative post-turn state.
        const loaded = await api.loadSession({ id: sessionId });
        setChatLog(loaded.session?.messages || []);
      } else {
        setChatLog((prev) => [...prev, { role: "assistant", content: r.message || "Something went wrong.", error: true }]);
      }
    } finally {
      unsubscribe();
      setStreamingMsg(null);
      setBusy(false);
    }
    await refreshHistory();
    await refreshSessions();
  }

  async function switchContext(workspaceId: string) {
    if (workspaceId === activeWorkspaceId || switchingContext) return;
    setSwitchingContext(true);
    const r = await api.setContext({ workspaceId });
    setSwitchingContext(false);
    if (r.ok) setActiveWorkspaceId(workspaceId);
    else setSidebarError(r.message || "Could not switch context.");
  }

  async function login() {
    setLoginError("");
    const r = await api.authLogin();
    if (r.ok) {
      await refreshAccount();
    } else {
      setLoginError(r.code === "auth_not_configured" ? "Sign-in isn't set up yet. Contact support." : r.message || "Sign-in failed.");
    }
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
    if (!r.session) {
      setSidebarError(r.message || "Could not start a new chat.");
      return;
    }
    setSidebarError("");
    await refreshSessions();
    setSessionId(r.session.id);
    setChatLog([]);
  }

  async function pickSession(s: SessionSummary) {
    setSelected(null);
    setMode("chat");
    setSessionId(s.id);
    const loaded = await api.loadSession({ id: s.id });
    if (!loaded.ok) {
      setSidebarError(loaded.message || "Could not open that chat.");
      return;
    }
    setSidebarError("");
    setChatLog(loaded.session?.messages || []);
  }

  function pickSkill(s: SkillRow) {
    setSelected(s);
    setMode("form");
  }

  async function deleteChat(id: string) {
    const del = await api.deleteSession({ id });
    if (!del.ok) {
      setSidebarError(del.message || "Could not delete that chat.");
      return;
    }
    setSidebarError("");
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
    else setSidebarError(r.message || "Could not delete that run.");
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
      <div className="rounded-2xl border border-line bg-bg-elevated px-3 pb-2 pt-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition-shadow focus-within:border-brand/50 focus-within:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]">
        <textarea
          className="theme-scroll max-h-[220px] min-h-[72px] w-full resize-none overflow-y-auto bg-transparent px-1 text-[15px] text-fg placeholder:text-fg-dim outline-none"
          rows={emptyChatHome ? 3 : 2}
          spellCheck={false}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendChat();
            }
          }}
          disabled={!runtimeOk || !chatReady || busy}
          placeholder={chatReady ? "How can I help you today?" : "Waiting for Execute access…"}
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
            <span>{activeContext && activeContext.kind !== "personal" ? `CONXA · ${activeContext.workspace_name}` : "CONXA"}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-30"
              disabled={!runtimeOk || !chatReady || busy}
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

  if (!authChecked) {
    return <div className="h-full bg-bg" />;
  }

  if (startupError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg text-fg">
        <div className="text-lg font-medium">CONXA couldn't start</div>
        <p className="max-w-sm text-center text-sm text-fg-muted">{startupError}</p>
        <Button onClick={() => { setAuthChecked(false); load(); }}>Retry</Button>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg text-fg">
        <div className="text-lg font-medium">Sign in to CONXA</div>
        <p className="max-w-xs text-center text-sm text-fg-muted">Sign in with your CONXA account to use Execute.</p>
        <Button className="px-5 py-2.5" onClick={login}>Sign in with CONXA</Button>
        {loginError && <p className="max-w-xs text-center text-sm text-err">{loginError}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <TitleBar
        onToggleSidebar={() => setCollapsed((v) => !v)}
        onMenu={() => setShowSettings(true)}
        onBack={handleBack}
        onForward={handleForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
      />

      <div className="flex min-h-0 flex-1">
      <aside className={`flex shrink-0 flex-col border-r border-line bg-bg-sidebar transition-[width] ${collapsed ? "w-[52px]" : "w-[260px]"}`}>
        <div className="px-2 pt-3">
          <button type="button" onClick={goHome} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-bg-hover hover:text-fg">
            <Icon d={paths.plus} />
            {!collapsed && "New"}
          </button>
        </div>

        {sidebarError && !collapsed && (
          <p className="mx-2 mt-2 rounded-lg bg-err-bg px-2.5 py-1.5 text-[12px] text-err-fg">{sidebarError}</p>
        )}

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
          <div className="border-b border-err/30 bg-err-bg px-5 py-2 text-sm text-err-fg">{runtimeMsg}</div>
        )}

        {emptyChatHome && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
            <h1 className="mb-8 font-serif text-[40px] font-normal tracking-tight">Ready when you are</h1>
            {composer}
            <div className="mt-5">
              <SkillPills skills={skills} onPick={pickSkill} limit={5} />
            </div>
          </div>
        )}

        {formPicker && (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <p className="mb-6 font-serif text-3xl">Pick a skill to fill and run</p>
            <SkillPills skills={skills} onPick={pickSkill} />
          </div>
        )}

        {mode === "form" && selected && (
          <div className="mx-auto w-full max-w-lg flex-1 overflow-auto theme-scroll px-6 py-10">
            <h1 className="font-serif text-3xl">{selected.name || selected.skill}</h1>
            {selected.description && <p className="mt-2 text-sm text-fg-muted">{selected.description}</p>}
            <div className="mt-8 space-y-4">
              {inputsError && <p className="text-sm text-err">{inputsError}</p>}
              {!inputsError && fields.map((f) => (
                <label key={f.name} className="block text-sm">
                  <span className="text-fg-muted">{f.name}{f.required ? " *" : ""}</span>
                  <input className="mt-1.5 w-full rounded-xl border border-line bg-bg-elevated px-3 py-2.5 outline-none transition-shadow focus:border-brand/50 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]" value={values[f.name] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} disabled={!runtimeOk} />
                  {f.description && <span className="mt-1 block text-xs text-fg-dim">{f.description}</span>}
                </label>
              ))}
              {!inputsError && fields.length === 0 && <p className="text-sm text-fg-muted">This skill has no declared inputs.</p>}
              <button type="button" className="rounded-xl bg-fg px-5 py-2.5 text-sm font-medium text-bg disabled:opacity-40" disabled={!runtimeOk || busy || Boolean(inputsError)} onClick={runForm}>
                {busy ? "Running…" : "Run"}
              </button>
              {formMsg && (
                <div className="text-sm">
                  <p className={formOk ? "text-fg-muted" : "text-err"}>{formMsg}</p>
                  {formDetail && (
                    <>
                      <button type="button" className="mt-1 text-xs text-fg-dim underline" onClick={() => setFormDetailsOpen((v) => !v)}>
                        {formDetailsOpen ? "Hide details" : "Show details"}
                      </button>
                      {formDetailsOpen && <pre className="mt-1 whitespace-pre-wrap text-xs text-fg-dim">{formDetail}</pre>}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "chat" && !emptyChatHome && (
          <div className="flex min-h-0 flex-1 flex-col">
            {!chatReady && (
              <p className="mx-auto mt-4 max-w-[720px] rounded-xl border border-warn/40 bg-warn-bg px-4 py-2 text-sm text-warn-fg">
                Waiting for Execute access — the form still runs skills without chat.
              </p>
            )}
            <div className="theme-scroll min-h-0 flex-1 space-y-4 overflow-auto px-8 py-8">
              {displayLog.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="mx-auto flex max-w-[720px] justify-end">
                    <div className="max-w-[70%] whitespace-pre-wrap rounded-2xl bg-bg-elevated px-4 py-2.5 text-[15px] leading-relaxed">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="mx-auto max-w-[720px]">
                    <div className="mb-1 text-[11px] text-fg-dim">{m.error ? "Couldn't run that" : "CONXA"}</div>
                    <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${m.error ? "text-err" : ""}`}>{m.content}</div>
                  </div>
                )
              )}
              {pendingRun && (
                <div className="mx-auto max-w-[720px] rounded-xl border border-line bg-bg-elevated px-4 py-3">
                  <div className="mb-1 text-[11px] text-fg-dim">Run this skill?</div>
                  <div className="text-[15px] font-medium">{pendingRun.skill || "Unnamed skill"}</div>
                  {Object.keys(pendingRun.inputs).length > 0 && (
                    <dl className="mt-2 space-y-0.5 text-[13px] text-fg-muted">
                      {Object.entries(pendingRun.inputs).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="shrink-0 text-fg-dim">{k}</dt>
                          <dd className="min-w-0 break-words">{shownInput(k, v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => answerRun(true)}>Run</Button>
                    <Button variant="secondary" onClick={() => answerRun(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              {streamingMsg && (
                <div className="mx-auto max-w-[720px]">
                  <div className="mb-1 text-[11px] text-fg-dim">CONXA</div>
                  {streamingMsg.thinking && (
                    <pre className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-dim">{streamingMsg.thinking}</pre>
                  )}
                  {streamingMsg.content && (
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{streamingMsg.content}</div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 pb-6">{composer}</div>
          </div>
        )}
      </main>

      <BrowserPanel />

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        identity={identity}
        contexts={contexts}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchContext={switchContext}
        switchingContext={switchingContext}
        theme={theme}
        onThemeChange={setTheme}
        onLogout={logout}
      />
      </div>
    </div>
  );
}
