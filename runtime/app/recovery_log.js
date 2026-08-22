"use strict";
// Recovery log — the append-only JSONL audit of every cascade event, extracted
// verbatim from run.js. Rotates at 10 MB, never throws (a logging failure must
// not break an in-flight recovery).
const fs   = require("fs");
const path = require("path");

const CONXA_DIR = process.env.CONXA_DIR || require("./host_bridge").env().conxaDir;
const RECOVERY_LOG = path.join(CONXA_DIR, "logs", "recovery.log");
const RECOVERY_LOG_MAX = 10 * 1024 * 1024;

function appendRecoveryEvent(event) {
  try {
    fs.mkdirSync(path.dirname(RECOVERY_LOG), { recursive: true });
    if (fs.existsSync(RECOVERY_LOG) && fs.statSync(RECOVERY_LOG).size > RECOVERY_LOG_MAX) {
      fs.renameSync(RECOVERY_LOG, `${RECOVERY_LOG}.1`);
    }
    fs.appendFileSync(RECOVERY_LOG, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
  } catch (_) {}
}

module.exports = { CONXA_DIR, RECOVERY_LOG, RECOVERY_LOG_MAX, appendRecoveryEvent };
