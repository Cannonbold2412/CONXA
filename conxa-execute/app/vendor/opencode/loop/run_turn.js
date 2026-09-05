"use strict";
/**
 * One chat turn with tool dispatch — edited copy of anomalyco/opencode
 * packages/llm/src/protocols/openai-chat.ts (PATH `/chat/completions`) and
 * packages/llm/src/tool-runtime.ts (`dispatch`: unknown tool → error, else execute).
 * Provider configure shape from packages/llm/src/providers/openai-compatible.ts.
 *
 * Copyright (c) 2025 opencode — MIT, see ../LICENSE
 *
 * Extra tools (bash/write/edit) are never registered here. The caller passes
 * only Conxa MCP tool definitions.
 */

const PATH = "/chat/completions";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const MAX_STEPS = 12;

function joinUrl(baseURL, path) {
  return String(baseURL || DEFAULT_BASE_URL).replace(/\/+$/, "") + path;
}

function toOpenAITools(tools) {
  return (tools || []).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
  }));
}

/**
 * @param {object} opts
 * @param {string} opts.baseURL
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {{role:string, content?:string, tool_calls?:any[], tool_call_id?:string}[]} opts.messages
 * @param {{name:string, description?:string, inputSchema?:object}[]} opts.tools
 * @param {(name: string, args: object) => Promise<string>} opts.executeTool
 * @param {(ev: object) => void} [opts.onEvent]
 */
async function runTurn(opts) {
  const baseURL = opts.baseURL || DEFAULT_BASE_URL;
  const messages = [{ role: "system", content: opts.system || "" }, ...(opts.messages || [])];
  const tools = toOpenAITools(opts.tools);
  const onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

  for (let step = 0; step < MAX_STEPS; step++) {
    const body = {
      model: opts.model,
      messages,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    };
    const res = await fetch(joinUrl(baseURL, PATH), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, error: `Model returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 400)}` };
    }
    if (!res.ok) {
      const msg = (json && (json.error && json.error.message)) || raw.slice(0, 400);
      return { ok: false, error: `Model/tool error (HTTP ${res.status}): ${msg}` };
    }
    const choice = json.choices && json.choices[0];
    const assistant = choice && choice.message;
    if (!assistant) return { ok: false, error: "Model returned no message" };

    messages.push(assistant);
    const calls = assistant.tool_calls || [];
    if (!calls.length) {
      return { ok: true, text: String(assistant.content || "").trim(), messages };
    }

    for (const call of calls) {
      const name = call.function && call.function.name;
      let args = {};
      try {
        args = call.function && call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      onEvent({ type: "tool", name, args });
      let result;
      const known = (opts.tools || []).some((t) => t.name === name);
      if (!known || typeof opts.executeTool !== "function") {
        // tool-runtime.ts: unknown tool → error value, do not invent a handler
        result = `Unknown tool: ${name}`;
      } else {
        try {
          result = await opts.executeTool(name, args);
        } catch (e) {
          result = `Tool error: ${e.message || e}`;
        }
      }
      onEvent({ type: "tool_result", name, result: String(result).slice(0, 4000) });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: String(result ?? ""),
      });
    }
  }
  return { ok: false, error: "Stopped after too many tool steps" };
}

module.exports = { runTurn, PATH, DEFAULT_BASE_URL, MAX_STEPS };
