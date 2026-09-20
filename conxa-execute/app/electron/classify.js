"use strict";
/** Copied from runtime/app/scheduler_daemon.js so form history matches scheduled runs. */

/** Chat path: Conxa MCP tools only. No bash, write, or OpenCode default tools. */
const CHAT_TOOLS = new Set(["list_skills", "get_skill_inputs", "execute_skill", "authenticate"]);

function classifyRunResult(text) {
  const t = String(text || "");
  const trimmed = t.trim();
  if (trimmed.startsWith("Done.")) return "completed";
  if (t.includes("Too many workflows are already running")) return "busy";
  return "failed";
}

function extractRunId(text) {
  const m = /\(run_id:\s*([^)]+)\)/.exec(String(text || ""));
  return m ? m[1].trim() : null;
}

module.exports = { classifyRunResult, extractRunId, CHAT_TOOLS };
