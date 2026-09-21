"use strict";
/**
 * Form-path MCP client — same Client + StdioClientTransport pattern as
 * runtime/app/scheduler_daemon.js. Spawns the *installed* runtime exe, never
 * Electron's process.execPath. watch: true for a person at the desk — the browser it
 * opens renders in this app's own panel (CONXA_HOST_BROWSER_CDP / CONXA_HOST_CONTROL_URL,
 * set on this process's env by main.js before ensureEngine ever spawns the runtime, and
 * forwarded below along with everything else in `process.env`).
 */

const { connectStdio, toolText } = require("../vendor/opencode/mcp/stdio");
const { resolveRuntimeCommand } = require("./runtime_path");
const { classifyRunResult, extractRunId, CHAT_TOOLS } = require("./classify");

let engine = null; // { client, transport }

function runtimeMissingError() {
  const err = new Error(
    "Conxa runtime is not installed. Install a skill pack first, then reopen CONXA.",
  );
  err.code = "runtime_missing";
  return err;
}

async function ensureEngine() {
  if (engine && engine.client) return engine.client;
  const cmd = resolveRuntimeCommand();
  if (!cmd) throw runtimeMissingError();
  const env = { ...process.env };
  if (cmd.conxaDir && !env.CONXA_DIR) env.CONXA_DIR = cmd.conxaDir;
  if (cmd.conxaDir && /[\\/]\.conxa-dev$/i.test(cmd.conxaDir) && !env.CONXA_ENV) {
    env.CONXA_ENV = "dev";
  }
  const { client, transport } = await connectStdio({
    command: cmd.command,
    args: cmd.args,
    env,
    name: "conxa-execute",
    version: "0.1.0",
  });
  transport.onclose = () => {
    if (engine && engine.transport === transport) engine = null;
  };
  engine = { client, transport };
  return client;
}

async function stopEngine() {
  const cur = engine;
  engine = null;
  if (!cur) return;
  try {
    await Promise.race([
      cur.client.close(),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (_) {}
  const pid = cur.transport && cur.transport.pid;
  if (pid) {
    try { process.kill(pid); } catch (_) {}
  }
}

// Tools that legitimately block on a person (sign-in) or a long run outlive the SDK's 60s default
// request timeout. execute_skill: the runtime bounds itself at 210s; authenticate: up to 600s.
const TOOL_TIMEOUT_MS = { execute_skill: 5 * 60 * 1000, authenticate: 11 * 60 * 1000 };

async function callTool(name, args) {
  const client = await ensureEngine();
  const timeout = TOOL_TIMEOUT_MS[name];
  const res = await client.callTool({ name, arguments: args || {} }, undefined, timeout ? { timeout } : undefined);
  return toolText(res);
}

function badReplyError(toolName, text) {
  // A non-JSON reply from list_skills/get_skill_inputs means the runtime hit
  // a protocol error, not that there are zero skills / zero inputs — treating
  // it as "empty" would show the user a confident wrong answer (e.g. "no
  // skills installed" when the runtime actually failed to respond sanely).
  console.error(`mcp_client: ${toolName} returned an unparseable reply:`, text);
  const err = new Error(`CONXA couldn't read the runtime's reply to ${toolName}. Restart CONXA and try again.`);
  err.code = "runtime_bad_reply";
  return err;
}

async function listSkills() {
  const text = await callTool("list_skills", {});
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badReplyError("list_skills", text);
  }
  return { ok: true, skills: parsed.skills || [], total: parsed.total || 0 };
}

async function getSkillInputs(skill, workspace_id) {
  const text = await callTool("get_skill_inputs", {
    skill,
    ...(workspace_id ? { workspace_id } : {}),
  });
  try {
    return { ok: true, schema: JSON.parse(text) };
  } catch {
    throw badReplyError("get_skill_inputs", text);
  }
}

async function executeSkill({ skill, workspace_id, inputs }) {
  const text = await callTool("execute_skill", {
    skill,
    ...(workspace_id ? { workspace_id } : {}),
    inputs: inputs || {},
    watch: true,
  });
  return {
    ok: true,
    text,
    status: classifyRunResult(text),
    run_id: extractRunId(text),
  };
}

async function listChatTools() {
  const client = await ensureEngine();
  const listed = await client.listTools();
  const tools = (listed.tools || []).filter((t) => CHAT_TOOLS.has(t.name));
  return tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    inputSchema: t.inputSchema || { type: "object", properties: {} },
  }));
}

module.exports = {
  stopEngine,
  callTool,
  listSkills,
  getSkillInputs,
  executeSkill,
  listChatTools,
};
