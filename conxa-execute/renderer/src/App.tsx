import { useCallback, useEffect, useMemo, useState } from "react";
import type { HistoryRow, SkillRow } from "./bridge";
import { SettingsModal } from "./SettingsModal";
import { Icon, Row, Starburst, paths } from "./ui";

type Mode = "form" | "chat";

function statusLabel(status: string) {
  if (status === "completed") return "Done";
  if (status === "busy") return "Busy";
  return "Failed";
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
  const [query, setQuery] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");

  const refreshHistory = useCallback(async () => {
    const h = await api.history();
    setHistory(h.items || []);
  }, [api]);

  const load = useCallback(async () => {
    const st = await api.runtimeStatus();
    setRuntimeOk(st.ok);
    setRuntimeMsg(st.ok ? "" : st.message || "Runtime missing");
    const s = await api.getSettings();
    setHasKey(Boolean(s.hasKey));
    setBaseURL(s.baseURL || "");
    setModel(s.model || "");
    await refreshHistory();
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
  }, [api, refreshHistory]);

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
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) => `${s.name || ""} ${s.skill}`.toLowerCase().includes(q));
  }, [skills, query]);
  const emptyChatHome = mode === "chat" && chatLog.length === 0 && !selected;
  const formPicker = mode === "form" && !selected;

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
    if (!text || busy) return;
    setChatInput("");
    const next = [...chatLog, { role: "user", content: text }];
    setChatLog(next);
    setBusy(true);
    const r = await api.chatSend({ text, messages: next });
    setBusy(false);
    setChatLog([...next, { role: "assistant", content: r.ok ? r.text || "" : r.message || "Error" }]);
    await refreshHistory();
  }

  async function saveSettings() {
    const r = await api.saveSettings({ baseURL, model, apiKey });
    if (r.ok) {
      setHasKey(Boolean(r.hasKey));
      setApiKey("");
      setShowSettings(false);
    }
  }

  function goHome() {
    setSelected(null);
    setChatLog([]);
    setFormMsg("");
    setMode("chat");
  }

  function pickSkill(s: SkillRow) {
    setSelected(s);
    setMode("form");
    setChatLog([]);
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
          disabled={mode === "chat" && (!runtimeOk || !hasKey || busy)}
          placeholder={
            mode === "form"
              ? "Switch to Chat to ask in words — or pick a skill on the left."
              : hasKey
                ? "How can I help you today?"
                : "Add your API key in Settings to use chat"
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
            <span>{model || "Your model"}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-30"
              disabled={mode !== "chat" || !runtimeOk || !hasKey || busy}
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
    <div className="flex h-full bg-bg text-fg">
      <aside className={`flex shrink-0 flex-col border-r border-line bg-bg-sidebar transition-[width] ${collapsed ? "w-[52px]" : "w-[260px]"}`}>
        <div className="flex items-center gap-1 px-2 pt-2">
          <button type="button" className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover" onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar">
            <Icon d={paths.panel} />
          </button>
          {!collapsed && (
            <div className="flex rounded-lg bg-bg p-0.5 text-[12px]">
              <span className="rounded-md bg-bg-active px-2.5 py-1">Form and Chat</span>
            </div>
          )}
        </div>

        <div className="px-2 pt-3">
          <button type="button" onClick={goHome} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-bg-hover hover:text-fg">
            <Icon d={paths.plus} />
            {!collapsed && "New"}
          </button>
        </div>

        {!collapsed && (
          <div className="px-2 pt-2">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1.5">
              <Icon d={paths.search} size={14} />
              <input className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-dim" placeholder="Search skills" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
          {!collapsed && <p className="mb-1 px-2 text-[11px] text-fg-dim">Skills</p>}
          {filtered.length === 0 && !collapsed && <p className="px-2 text-[12px] text-fg-dim">No skills yet.</p>}
          {filtered.map((s) => (
            <Row
              key={`${s.workspace_id || ""}:${s.skill}`}
              active={selected?.skill === s.skill && selected?.workspace_id === s.workspace_id}
              onClick={() => pickSkill(s)}
              icon={<Icon d={paths.play} size={15} />}
            >
              {collapsed ? "" : (s.name || s.skill)}
            </Row>
          ))}

          {!collapsed && <p className="mb-1 mt-5 px-2 text-[11px] text-fg-dim">Runs</p>}
          {history.slice(0, 24).map((h, i) => (
            <Row key={`${h.at}-${i}`} icon={<Icon d={paths.list} size={15} />}>
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
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-active text-xs">C</span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left text-[13px]">Conxa Execute</span>
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
            <div className="mb-8 flex items-center gap-3">
              <Starburst />
              <h1 className="font-serif text-[40px] font-normal tracking-tight">Ready when you are</h1>
            </div>
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
          <div className="mx-auto w-full max-w-lg flex-1 overflow-auto px-6 py-10">
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
            {!hasKey && (
              <p className="mx-auto mt-4 max-w-[720px] rounded-xl border border-warn/40 bg-[#2a2114] px-4 py-2 text-sm text-[#e8d4b0]">
                Chat needs your own API key. Open Settings — the form still runs skills with no model.
              </p>
            )}
            <div className="min-h-0 flex-1 space-y-4 overflow-auto px-8 py-8">
              {chatLog.map((m, i) => (
                <div key={i} className="mx-auto max-w-[720px]">
                  <div className="mb-1 text-[11px] text-fg-dim">{m.role === "user" ? "You" : "Conxa"}</div>
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
        baseURL={baseURL}
        model={model}
        apiKey={apiKey}
        hasKey={hasKey}
        onBaseURL={setBaseURL}
        onModel={setModel}
        onApiKey={setApiKey}
        onSave={saveSettings}
      />
    </div>
  );
}
