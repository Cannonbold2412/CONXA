"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

/** Same junction the installer and mcp_hosts.js write: conxa-runtime/current/conxa-runtime.exe */
function resolveRuntimeCommand() {
  if (process.env.CONXA_EXECUTE_RUNTIME) {
    const cmd = process.env.CONXA_EXECUTE_RUNTIME;
    const extra = process.env.CONXA_EXECUTE_RUNTIME_ARGS
      ? process.env.CONXA_EXECUTE_RUNTIME_ARGS.split(" ").filter(Boolean)
      : [];
    if (fs.existsSync(cmd)) return { command: cmd, args: extra };
  }
  const roots = [];
  if (process.env.CONXA_DIR) roots.push(process.env.CONXA_DIR);
  roots.push(path.join(os.homedir(), ".conxa"));
  roots.push(path.join(os.homedir(), ".conxa-dev"));
  for (const root of roots) {
    const exe = path.join(root, "conxa-runtime", "current", "conxa-runtime.exe");
    if (fs.existsSync(exe)) return { command: exe, args: [], conxaDir: root };
  }
  return null;
}

module.exports = { resolveRuntimeCommand };
