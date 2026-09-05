"use strict";
/**
 * Form-path MCP client — same Client + StdioClientTransport pattern as
 * runtime/app/scheduler_daemon.js. Spawns the *installed* runtime exe, never
 * Electron's process.execPath. watch: true for a person at the desk.
 */

const { connectStdio, toolText } = require("../vendor/opencode/mcp/stdio");
const { resolveRuntimeCommand } = require("./runtime_path");
const { classifyRunResult, extractRunId } = require("./classify");
const { CHAT_TOOLS } = require("./chat_tools");

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

async function callTool(name, args) {
  const client = await ensureEngine();
  const res = await client.callTool({ name, arguments: args || {} });
  return toolText(res);
}

async function listSkills() {
  const text = await callTool("list_skills", {});
  try {
    const parsed = JSON.parse(text);
    return { ok: true, skills: parsed.skills || [], total: parsed.total || 0, raw: text };
  } catch {
    return { ok: true, skills: [], total: 0, raw: text };
  }
}

async function getSkillInputs(skill, workspace_id) {
  const text = await callTool("get_skill_inputs", {
    skill,
    ...(workspace_id ? { workspace_id } : {}),
  });
  try {
    return { ok: true, schema: JSON.parse(text), raw: text };
  } catch {
    return { ok: true, schema: {}, raw: text };
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
  classifyRunResult,
  extractRunId,
  CHAT_TOOLS,
  ensureEngine,
  stopEngine,
  callTool,
  listSkills,
  getSkillInputs,
  executeSkill,
  listChatTools,
  resolveRuntimeCommand,
  runtimeMissingError,
};
