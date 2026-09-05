"use strict";
/**
 * Stdio MCP client — edited copy of anomalyco/opencode
 * packages/opencode/src/mcp/index.ts (commit a935432b5ce337523dfc5014629a09bc16784c42).
 *
 * Kept: Client + StdioClientTransport connect/call/listTools.
 * Removed: OAuth, HTTP/SSE transports, TUI events, catalog, browser MCP, Effect layers.
 *
 * Copyright (c) 2025 opencode — MIT, see ../LICENSE
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const CLIENT_OPTIONS = {
  capabilities: { roots: {} },
};

/**
 * @param {{ command: string, args?: string[], env?: NodeJS.ProcessEnv, name?: string, version?: string }} opts
 */
async function connectStdio(opts) {
  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args || [],
    env: opts.env || process.env,
  });
  const client = new Client(
    { name: opts.name || "conxa-execute", version: opts.version || "0.1.0" },
    CLIENT_OPTIONS,
  );
  await client.connect(transport);
  return { client, transport };
}

function toolText(res) {
  if (!res || !Array.isArray(res.content)) return "";
  return res.content.map((c) => c.text || "").join("\n");
}

module.exports = { connectStdio, toolText, CLIENT_OPTIONS };
