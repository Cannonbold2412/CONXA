import { useState } from "react";
import type { HistoryRow } from "./bridge";
import { formatDuration, parseRunResult, type RunStatus } from "./runResult";
import { Icon, paths } from "./ui";

const LOOK: Record<RunStatus, { icon: string; tile: string; line: string }> = {
  completed: { icon: paths.tick, tile: "bg-ok/12 text-ok", line: "Completed" },
  failed: { icon: paths.x, tile: "bg-err/12 text-err", line: "Didn't finish" },
  cancelled: { icon: paths.x, tile: "bg-bg-active text-fg-dim", line: "Cancelled" },
  busy: { icon: paths.warning, tile: "bg-warn/12 text-warn", line: "Not started — too many runs at once" },
  awaiting_auth: { icon: paths.shield, tile: "bg-warn/12 text-warn", line: "Waiting for you to sign in" },
};

// History statuses written by main.js; anything unknown reads as a failure, like classify.js.
function asStatus(s: string | undefined): RunStatus | null {
  if (!s) return null;
  return (["completed", "failed", "cancelled", "busy", "awaiting_auth"] as string[]).includes(s) ? (s as RunStatus) : "failed";
}

/** One execute_skill call in a chat: what ran, how it ended, and anything worth a look. */
export function RunCard({ skillName, resultText, entry, onShowBrowser }: {
  skillName: string;
  resultText: string;
  entry?: HistoryRow;
  onShowBrowser: () => void;
}) {
  const [open, setOpen] = useState(false);
  const result = parseRunResult(resultText);
  // The run history is updated when a sign-in-parked run ends, so it wins over the first reply.
  const status = asStatus(entry?.status) ?? result.status;
  const look = LOOK[status];
  const duration = formatDuration(entry?.duration_ms);
  const detail = status === "completed" ? "" : status === result.status ? result.detail : entry?.message || "";

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-bg-sidebar">
      <div className="flex min-h-[54px] items-center gap-3 px-4 py-2">
        <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg ${look.tile}`}>
          <Icon d={look.icon} size={15} stroke={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">{skillName}</span>
          <span className="text-[12px] text-fg-dim">{look.line} · ran on this computer</span>
        </span>
        {duration && <span className="font-mono text-[12px] text-fg-dim">{duration}</span>}
        {detail && (
          <button
            type="button"
            aria-label={open ? "Hide details" : "Show details"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-dim hover:bg-bg-elevated hover:text-fg"
          >
            <Icon d={open ? paths.chevronUp : paths.chevron} size={16} />
          </button>
        )}
      </div>

      {open && detail && (
        <pre className="theme-scroll max-h-56 overflow-auto whitespace-pre-wrap border-t border-line px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-muted">{detail}</pre>
      )}

      {status === "awaiting_auth" && (
        <div className="flex items-center gap-2.5 border-t border-line bg-warn/5 px-4 py-2.5">
          <span className="flex-1 text-[13px] leading-normal text-warn-fg">Sign in in the browser panel — the run starts by itself when you're done.</span>
          <button type="button" onClick={onShowBrowser} className="whitespace-nowrap text-[13px] text-brand hover:text-brand/80">Show browser</button>
        </div>
      )}

      {result.downloads.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line px-4 py-2.5">
          <span className="text-[12px] text-fg-dim">Downloaded</span>
          {result.downloads.map((d) => (
            <span key={d} className="flex items-center gap-2 text-[13px] text-fg-soft" title={d}>
              <span className="text-fg-dim"><Icon d={paths.file} size={14} /></span>
              <span className="truncate">{d.split(/[\\/]/).pop()}</span>
            </span>
          ))}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="flex items-start gap-2.5 border-t border-line bg-warn/5 px-4 py-2.5">
          <span className="mt-0.5 shrink-0 text-warn"><Icon d={paths.warning} size={15} stroke={1.9} /></span>
          <span className="flex-1 text-[13px] leading-normal text-warn-fg">{result.warnings.join(" ")}</span>
          {result.url && (
            <button type="button" onClick={() => void window.conxaExecute.openExternal({ url: result.url! })} className="whitespace-nowrap text-[13px] text-brand hover:text-brand/80">
              Open page
            </button>
          )}
        </div>
      )}
    </div>
  );
}
