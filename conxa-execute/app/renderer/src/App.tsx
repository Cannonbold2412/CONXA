import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Attachment, ChatMessage, ConfirmRun, ExecuteContext, HistoryRow, Identity, SessionSummary, SkillRow } from "./bridge";
import { SettingsModal } from "./SettingsModal";
import { TitleBar } from "./TitleBar";
import { BrowserPanel } from "./BrowserPanel";
import { Button, Icon, MsgActions, Row, paths } from "./ui";

type Mode = "form" | "chat";

function statusLabel(status: string) {
  if (status === "completed") return "Done";
  if (status === "busy") return "Busy";
  if (status === "awaiting_auth") return "Waiting for sign-in";
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

// CONXA's replies use plain **bold** markdown; render it instead of showing the literal asterisks.
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
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

type LiveTurn = { user: ChatMessage; editIndex: number | null; content: string; thinking: string };
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;
const TEXT_EXT = /\.(txt|md|csv|tsv|json|jsonl|ya?ml|xml|html?|css|log|py|js|jsx|ts|tsx|java|c|cpp|h|go|rs|rb|php|sh|sql|toml|ini)$/i;

function msgText(m: ChatMessage): string {
  return typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
}
function msgImages(m: ChatMessage): string[] {
  return typeof m.content === "string" ? [] : m.content.flatMap((p) => (p.type === "image_url" ? [p.image_url.url] : []));
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
  const [, setHistory] = useState<HistoryRow[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [showSettings, setShowSettings] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [chatLog, setChatLog] = useState<(ChatMessage & { error?: boolean })[]>([]);
  // In-flight turns, keyed by chat. The main process only saves a transcript when its turn ends,
  // so the sent message and streamed text live here until then (lets you switch chats mid-run).
  const [live, setLive] = useState<Record<string, LiveTurn>>({});
  const [chatErrors, setChatErrors] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingRun, setPendingRun] = useState<ConfirmRun | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;
  const liveNow = sessionId ? live[sessionId] : undefined;
  const chatBusy = Boolean(liveNow);
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

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const w = Number(localStorage.getItem("conxa-sidebar-width"));
    return w >= 200 && w <= 480 ? w : 260;
  });
  const [resizing, setResizing] = useState(false);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing(true);
    let w = sidebarWidth;
    const move = (ev: PointerEvent) => {
      w = Math.min(480, Math.max(200, ev.clientX));
      setSidebarWidth(w);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      localStorage.setItem("conxa-sidebar-width", String(w));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

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
    () =>
      chatLog
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => (m.role === "user" || m.role === "assistant") && (msgText(m) || msgImages(m).length)),
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

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setAttachError("");
    const added: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_ATTACH_BYTES) { setAttachError(`${f.name} is larger than 10 MB.`); continue; }
      const isImage = /^image\/(png|jpe?g|gif|webp)$/.test(f.type);
      const isText = f.type.startsWith("text/") || TEXT_EXT.test(f.name);
      if (!isImage && !isText) { setAttachError(`${f.name}: only images and text files are supported.`); continue; }
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        if (isImage) r.readAsDataURL(f); else r.readAsText(f);
      });
      added.push({ name: f.name, mime: f.type, kind: isImage ? "image" : "text", data });
    }
    setAttachments((prev) => [...prev, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function sendChat() {
    const text = chatInput.trim();
    if ((!text && attachments.length === 0) || chatBusy || !sessionId) return;
    const sid = sessionId;
    const editIndex = editingIndex;
    const files = attachments;
    setChatInput("");
    setAttachments([]);
    setAttachError("");
    setEditingIndex(null);
    const shown: ChatMessage["content"] = files.some((a) => a.kind === "image")
      ? [{ type: "text", text }, ...files.filter((a) => a.kind === "image").map((a) => ({ type: "image_url" as const, image_url: { url: a.data } }))]
      : text;
    setChatLog((prev) => [...(editIndex !== null ? prev.slice(0, editIndex) : prev), { role: "user", content: shown }]);
    setLive((prev) => ({ ...prev, [sid]: { user: { role: "user", content: shown }, editIndex, content: "", thinking: "" } }));
    const requestId = crypto.randomUUID();
    const unsubscribe = api.onChatDelta((delta) => {
      if (delta.requestId !== requestId) return;
      setLive((prev) => {
        const base = prev[sid];
        if (!base) return prev;
        return {
          ...prev,
          [sid]: delta.type === "reasoning"
            ? { ...base, thinking: base.thinking + delta.text }
            : { ...base, content: base.content + delta.text },
        };
      });
    });
    try {
      const r = await api.chatSend({ text, sessionId: sid, requestId, editIndex: editIndex ?? undefined, attachments: files });
      if (sessionRef.current === sid) {
        if (r.ok) {
          // Reload from the session store rather than hand-appending — main.js
          // may have pruned/compacted the transcript for this turn, and that's
          // the authoritative post-turn state.
          const loaded = await api.loadSession({ id: sid });
          setChatLog(loaded.session?.messages || []);
        } else {
          setChatLog((prev) => [...prev, { role: "assistant", content: r.message || "Something went wrong.", error: true }]);
        }
      } else if (!r.ok) {
        setChatErrors((prev) => ({ ...prev, [sid]: r.message || "Something went wrong." }));
      }
    } finally {
      unsubscribe();
      setLive((prev) => { const n = { ...prev }; delete n[sid]; return n; });
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
    setEditingIndex(null);
  }

  async function pickSession(s: SessionSummary) {
    setSelected(null);
    setMode("chat");
    setSessionId(s.id);
    setEditingIndex(null);
    const loaded = await api.loadSession({ id: s.id });
    if (!loaded.ok) {
      setSidebarError(loaded.message || "Could not open that chat.");
      return;
    }
    setSidebarError("");
    const err = chatErrors[s.id];
    if (err) setChatErrors(({ [s.id]: _gone, ...rest }) => rest);
    setChatLog([
      ...withLive(s.id, loaded.session?.messages || []),
      ...(err ? [{ role: "assistant", content: err, error: true }] : []),
    ]);
  }

  function withLive(id: string, stored: ChatMessage[]): ChatMessage[] {
    const turn = live[id];
    if (!turn) return stored;
    return [...(turn.editIndex !== null ? stored.slice(0, turn.editIndex) : stored), turn.user];
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
      setEditingIndex(null);
    }
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
    <div className="mx-auto w-full max-w-[900px]">
      <div className="rounded-2xl border border-line bg-bg-elevated px-3 pb-2 pt-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition-shadow focus-within:border-brand/50 focus-within:shadow-[0_0_0_3px_rgba(217,119,87,0.15)]">
        {editingIndex !== null && (
          <div className="mb-1.5 flex items-center justify-between rounded-lg bg-bg px-2 py-1 text-[12px] text-fg-dim">
            <span>Editing message — sending will remove the replies after it</span>
            <button
              type="button"
              className="rounded p-0.5 hover:text-fg"
              aria-label="Cancel edit"
              onClick={() => {
                setEditingIndex(null);
                setChatInput("");
              }}
            >
              <Icon d={paths.x} size={12} />
            </button>
          </div>
        )}
        {(attachments.length > 0 || attachError) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg bg-bg px-2 py-1 text-[12px] text-fg-muted">
                {a.kind === "image" && <img src={a.data} alt="" className="h-5 w-5 rounded object-cover" />}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button type="button" className="hover:text-fg" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                  <Icon d={paths.x} size={12} />
                </button>
              </span>
            ))}
            {attachError && <span className="text-[12px] text-err">{attachError}</span>}
          </div>
        )}
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
          disabled={!runtimeOk || !chatReady || chatBusy}
          placeholder={chatReady ? "How can I help you today?" : "Waiting for Execute access…"}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-bg-hover hover:text-fg"
              aria-label="Attach files"
              title="Attach images or text files (up to 10 MB)"
              onClick={() => fileInput.current?.click()}
            >
              <Icon d={paths.plus} size={16} />
            </button>
            <div className="flex rounded-full bg-bg p-0.5 text-[12px]">
              <button type="button" className={`rounded-full px-3 py-1 ${mode === "chat" ? "bg-bg-active text-fg" : "text-fg-dim"}`} onClick={() => setMode("chat")}>Chat</button>
              <button type="button" className={`rounded-full px-3 py-1 ${mode === "form" ? "bg-bg-active text-fg" : "text-fg-dim"}`} onClick={() => setMode("form")}>Form</button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-fg-dim">
            <span>{activeContext ? `CONXA · ${activeContext.workspace_name}` : "CONXA"}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-30"
              disabled={!runtimeOk || !chatReady || chatBusy}
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
      <aside
        style={{ width: collapsed ? 52 : sidebarWidth }}
        className={`relative flex shrink-0 flex-col border-r border-line bg-bg-sidebar ${resizing ? "" : "transition-[width]"}`}
      >
        {!collapsed && (
          <div
            onPointerDown={startResize}
            className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-line"
          />
        )}
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
              icon={s.id in live
                ? <span className="mx-[5px] h-[7px] w-[7px] rounded-full bg-ok" title="Running" />
                : <Icon d={paths.list} size={15} />}
            >
              {collapsed ? "" : s.title}
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
              <p className="mx-auto mt-4 max-w-[900px] rounded-xl border border-warn/40 bg-warn-bg px-4 py-2 text-sm text-warn-fg">
                Waiting for Execute access — the form still runs skills without chat.
              </p>
            )}
            <div className="theme-scroll min-h-0 flex-1 space-y-4 overflow-auto px-4 py-8">
              {displayLog.map(({ m, idx }) =>
                m.role === "user" ? (
                  <div key={idx} className="group mx-auto flex max-w-[900px] flex-col items-end">
                    <div className="max-w-[70%] whitespace-pre-wrap rounded-2xl bg-bg-elevated px-4 py-2.5 text-[15px] leading-relaxed">
                      {msgImages(m).map((u, k) => <img key={k} src={u} alt="" className="mb-2 max-h-48 rounded-lg" />)}
                      {msgText(m)}
                    </div>
                    <MsgActions className="mt-1" text={msgText(m)} onEdit={chatBusy ? undefined : () => { setChatInput(msgText(m)); setEditingIndex(idx); }} />
                  </div>
                ) : (
                  <div key={idx} className="group mx-auto max-w-[900px]">
                    <div className="mb-1 text-[11px] text-fg-dim">{m.error ? "Couldn't run that" : "CONXA"}</div>
                    <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${m.error ? "text-err" : ""}`}>{renderBold(msgText(m))}</div>
                    <MsgActions className="mt-1" text={msgText(m)} />
                  </div>
                )
              )}
              {pendingRun && (
                <div className="mx-auto max-w-[900px] rounded-xl border border-line bg-bg-elevated px-4 py-3">
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
              {liveNow && (
                <div className="mx-auto max-w-[900px]">
                  <div className="mb-1 text-[11px] text-fg-dim">CONXA</div>
                  {liveNow.thinking && (
                    <pre className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-dim">{liveNow.thinking}</pre>
                  )}
                  {liveNow.content && (
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{renderBold(liveNow.content)}</div>
                  )}
                </div>
              )}
            </div>
            <div className="px-4 pb-6">{composer}</div>
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
