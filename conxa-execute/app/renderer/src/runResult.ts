// Reads the runtime's plain-text execute_skill reply (runtime/app/server.js success path) for the
// run card. Status prefixes mirror electron/classify.js — keep the two in step.

export type RunStatus = "completed" | "failed" | "awaiting_auth" | "busy" | "cancelled";

export type RunResult = {
  status: RunStatus;
  runId: string | null;
  url: string | null;
  warnings: string[];
  downloads: string[];
  detail: string;
};

function block(text: string, heading: string): string[] {
  const m = new RegExp(`^${heading}:\\n((?:  .*(?:\\n|$))+)`, "m").exec(text);
  return m ? m[1].split("\n").map((l) => l.trim()).filter(Boolean) : [];
}

export function parseRunResult(raw: string): RunResult {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const t = text.trim();
  let status: RunStatus = "failed";
  if (/^(Done|Dry run complete)\./.test(t)) status = "completed";
  else if (/^Execution cancelled/.test(t)) status = "cancelled";
  else if (text.includes("Too many workflows are already running")) status = "busy";
  else if (/^(Authentication required — please sign in|Waiting for authentication to complete)/.test(t)) status = "awaiting_auth";
  const runId = /\(run_id:\s*([^)]+)\)/.exec(text)?.[1].trim() ?? null;
  const url = status === "completed" ? /URL:\s*(\S+)/.exec(t)?.[1] ?? null : null;
  const detail = status === "completed" ? "" : t.replace(/\s*\(run_id:[^)]*\)\s*$/, "");
  return { status, runId, url, warnings: block(text, "Warning"), downloads: block(text, "Downloaded files"), detail };
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
