import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { HistoryRow, SearchHit, SkillRow } from "./bridge";
import { formatDuration } from "./runResult";
import { Icon, paths } from "./ui";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (Number.isNaN(s)) return "";
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  let v = s;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
    v /= n;
  }
  return rtf.format(Math.round(v), "year");
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="theme-scroll min-h-0 flex-1 overflow-auto px-10 pb-12 pt-12">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-medium tracking-[-0.02em]">{title}</h1>
          <p className="m-0 text-[14px] text-fg-dim">{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <label className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-bg-elevated px-3.5 text-fg-dim focus-within:border-brand/40">
      <Icon d={paths.search} size={16} />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full flex-1 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-fg-dim"
      />
    </label>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13.5px] text-fg-dim">{children}</p>;
}

export function SearchPage({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await window.conxaExecute.searchSessions({ query });
      if (cancelled) return;
      setError(r.ok ? "" : r.message || "Search failed.");
      setResults(r.results || []);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <Page title="Search" subtitle="Find a chat by its name or anything said in it.">
      <SearchBox value={query} onChange={setQuery} placeholder="Search your chats" autoFocus />
      {error && <p className="text-[13px] text-err">{error}</p>}
      {results && results.length === 0 && !error && <Empty>No chats match “{query.trim()}”.</Empty>}
      {results && results.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-col gap-1 rounded-xl px-3.5 py-3 text-left hover:bg-bg-hover">
                <span className="flex items-baseline gap-3">
                  <span className="flex-1 truncate text-[14px] font-medium text-fg">{r.title}</span>
                  <span className="shrink-0 text-[12px] text-fg-dim">{relativeTime(r.updatedAt)}</span>
                </span>
                {r.snippet && <span className="line-clamp-2 text-[13px] leading-normal text-fg-muted">{r.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function SkillsPage({ skills, runtimeOk, onRunForm, onAskChat }: {
  skills: SkillRow[];
  runtimeOk: boolean | null;
  onRunForm: (s: SkillRow) => void;
  onAskChat: (s: SkillRow) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? skills.filter((s) => `${s.name || ""} ${s.skill} ${s.description || ""}`.toLowerCase().includes(q)) : skills;
  }, [skills, filter]);

  return (
    <Page title="Skills" subtitle="Everything Conxa can run on this computer. Fill a form yourself, or ask in chat.">
      {skills.length > 6 && <SearchBox value={filter} onChange={setFilter} placeholder="Filter skills" />}
      {runtimeOk === false && <Empty>The Conxa runtime isn't installed, so there are no skills to show yet.</Empty>}
      {runtimeOk !== false && skills.length === 0 && <Empty>No skills are installed for this workspace yet.</Empty>}
      {skills.length > 0 && shown.length === 0 && <Empty>No skills match “{filter.trim()}”.</Empty>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        {shown.map((s) => (
          <div key={`${s.workspace_id || ""}/${s.skill}`} className="flex flex-col gap-3 rounded-[14px] border border-line bg-bg-sidebar p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand"><Icon d={paths.grid} size={15} /></span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-medium leading-snug">{s.name || s.skill}</span>
                <span className="line-clamp-3 text-[12.5px] leading-normal text-fg-dim">{s.description || "No description."}</span>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <button type="button" onClick={() => onRunForm(s)} className="h-8 rounded-[9px] bg-brand px-3 text-[13px] font-semibold text-bg hover:bg-brand/90">Run with form</button>
              <button type="button" onClick={() => onAskChat(s)} className="h-8 rounded-[9px] border border-line px-3 text-[13px] text-fg-soft hover:bg-bg-hover hover:text-fg">Ask in chat</button>
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

const RUN_FILTERS = [
  { key: "all", label: "All" },
  { key: "completed", label: "Done" },
  { key: "failed", label: "Failed" },
  { key: "awaiting_auth", label: "Waiting" },
] as const;

const PILL: Record<string, string> = {
  completed: "bg-ok/12 text-ok",
  awaiting_auth: "bg-warn/12 text-warn",
  busy: "bg-warn/12 text-warn",
};
const PILL_LABEL: Record<string, string> = { completed: "Done", awaiting_auth: "Waiting for sign-in", busy: "Busy", cancelled: "Cancelled" };

export function RunsPage({ items, skillName, canOpenChat, onOpenChat, onDelete }: {
  items: HistoryRow[];
  skillName: (slug?: string) => string;
  canOpenChat: (sessionId: string) => boolean;
  onOpenChat: (sessionId: string) => void;
  onDelete: (at: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof RUN_FILTERS)[number]["key"]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = items.filter((r) => filter === "all" || (filter === "failed" ? !["completed", "awaiting_auth"].includes(r.status) : r.status === filter));

  return (
    <Page title="Runs" subtitle="The latest skill runs on this computer, from chat and from forms.">
      <div role="group" aria-label="Filter runs" className="flex gap-1.5">
        {RUN_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`h-8 rounded-full border px-3.5 text-[13px] ${filter === f.key ? "border-brand/45 bg-bg-active text-fg" : "border-line text-fg-muted hover:text-fg"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 && <Empty>{items.length ? "No runs match this filter." : "No runs yet. Ask Conxa to run a skill, or use a form."}</Empty>}
      {shown.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-line bg-bg-sidebar">
          {shown.map((r, i) => {
            const expanded = open === r.at;
            return (
              <div key={r.at} className={i ? "border-t border-line" : ""}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : r.at)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_150px_110px_52px_44px] items-center gap-3 px-4 py-3 text-left text-[13.5px] hover:bg-bg-hover"
                >
                  <span className="truncate font-medium text-fg">{skillName(r.skill)}</span>
                  <span>
                    <span className={`inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-medium ${PILL[r.status] || "bg-err/12 text-err"}`}>
                      {PILL_LABEL[r.status] || "Failed"}
                    </span>
                  </span>
                  <span className="text-[12.5px] text-fg-dim">{relativeTime(r.at)}</span>
                  <span className="text-right font-mono text-[12px] text-fg-dim">{formatDuration(r.duration_ms)}</span>
                  <span className="text-right text-[12px] capitalize text-fg-dim">{r.via || "chat"}</span>
                </button>
                {expanded && (
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    {r.message && <pre className="theme-scroll m-0 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-bg px-3 py-2.5 font-mono text-[12px] leading-relaxed text-fg-muted">{r.message}</pre>}
                    <div className="flex gap-2">
                      {r.session_id && canOpenChat(r.session_id) && (
                        <button type="button" onClick={() => onOpenChat(r.session_id!)} className="h-8 rounded-[9px] border border-line px-3 text-[13px] text-fg-soft hover:bg-bg-hover hover:text-fg">Open chat</button>
                      )}
                      <button type="button" onClick={() => onDelete(r.at)} className="h-8 rounded-[9px] px-3 text-[13px] text-err hover:bg-bg-hover">Remove from list</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
