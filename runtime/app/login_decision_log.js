"use strict";
// AUTH-7 — a small, append-only JSONL record of which signal decided each interactive sign-in,
// so login_signals.js's ladder timing (CONXA_LOGIN_BACKUP_AGREE_MS, CONXA_LOGIN_TIMEKEEPER_BUDGET_MS)
// can eventually be tuned from real data instead of guesswork. Modeled directly on
// recovery_log.js's shape (JSONL, size-capped single-generation rotation, never throws) but kept
// as its OWN file/module rather than reusing recovery_log.js: that module's reader
// (readRecentEvents) filters by `slug` and feeds an agent-facing failure's `recovery_trail` — a
// login decision has no `slug` in scope and is not a recovery-cascade event, so it has no business
// anywhere near that reader, even though nothing would actually break (the slug filter would just
// never match). This is purely an operator/tuning log; nothing reads it back at runtime.
//
// Never any cookie/token value or name — only which signal fired and when (see login_signals.js's
// own ticketSignature comment on the same "secrets stay on the machine" rule).
const fs   = require("fs");
const path = require("path");

const CONXA_DIR = process.env.CONXA_DIR || require("./host_bridge").env().conxaDir;
const LOGIN_DECISION_LOG = path.join(CONXA_DIR, "logs", "login_signals.log");
const LOGIN_DECISION_LOG_MAX = 2 * 1024 * 1024;

// `decision` is one of login_signals.js's ladder reasons (judge_yes/lookouts_agreed/…),
// "human_override" (AUTH-6), or a wait's own non-ladder terminal outcome (timeout/closed/gone).
function record(key, decision, waitedMs) {
  try {
    fs.mkdirSync(path.dirname(LOGIN_DECISION_LOG), { recursive: true });
    if (fs.existsSync(LOGIN_DECISION_LOG) && fs.statSync(LOGIN_DECISION_LOG).size > LOGIN_DECISION_LOG_MAX) {
      fs.renameSync(LOGIN_DECISION_LOG, `${LOGIN_DECISION_LOG}.1`);
    }
    fs.appendFileSync(LOGIN_DECISION_LOG, `${JSON.stringify({ ts: new Date().toISOString(), key, decision, waitedMs })}\n`);
  } catch (_) {}
}

module.exports = { CONXA_DIR, LOGIN_DECISION_LOG, LOGIN_DECISION_LOG_MAX, record };
