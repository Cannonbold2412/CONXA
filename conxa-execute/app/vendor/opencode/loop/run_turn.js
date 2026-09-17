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
 * @param {(body: object) => Promise<{ok: true, json: object} | {ok: false, error: string}>} [opts.chatCompletion]
 *   Pluggable transport, for a caller whose provider isn't a real OpenAI-
 *   compatible /chat/completions endpoint (e.g. Conxa Execute's cloud proxy,
 *   which needs its own request/response shape and auth). Receives the exact
 *   {model, messages, tools?, tool_choice?} body this loop would otherwise
 *   POST itself, and must resolve to a normalized OpenAI-shaped response
 *   ({choices: [{message: {...}}]}) or a {ok:false, error} pair. Omit for the
 *   default behavior below (a real OpenAI-compatible baseURL/apiKey).
 */
async function runTurn(opts) {
  const baseURL = opts.baseURL || DEFAULT_BASE_URL;
  const messages = [{ role: "system", content: opts.system || "" }, ...(opts.messages || [])];
  const tools = toOpenAITools(opts.tools);

  for (let step = 0; step < MAX_STEPS; step++) {
    const body = {
      model: opts.model,
      messages,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    };
    let json;
    if (typeof opts.chatCompletion === "function") {
      const result = await opts.chatCompletion(body);
      if (!result.ok) return { ok: false, error: result.error };
      json = result.json;
    } else {
      const res = await fetch(joinUrl(baseURL, PATH), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      try {
        json = JSON.parse(raw);
      } catch {
        // Not JSON at all — usually an HTML error page from a wrong baseURL, a
        // proxy, or an outage. The raw body is genuinely useful for debugging
        // but is never something a user should read verbatim; log it, don't
        // return it.
        console.error(`run_turn: non-JSON reply (HTTP ${res.status}):`, raw.slice(0, 2000));
        return { ok: false, error: `Model returned an unreadable reply (HTTP ${res.status}).` };
      }
      if (!res.ok) {
        const providerMsg = json && json.error && typeof json.error.message === "string" ? json.error.message : "";
        console.error(`run_turn: model HTTP error ${res.status}:`, raw.slice(0, 2000));
        const detail = providerMsg && providerMsg.length <= 300 ? `: ${providerMsg}` : "";
        return { ok: false, error: `Model error (HTTP ${res.status})${detail}` };
      }
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
      let args;
      let argsError = null;
      try {
        args = call.function && call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (e) {
        // Malformed tool-call JSON from the model — silently substituting {}
        // would run the tool with the wrong arguments instead of no run at
        // all. Feed the parse error back as the tool result so the model can
        // see what went wrong and retry with valid JSON.
        argsError = `Invalid tool call arguments (not valid JSON): ${e.message}`;
      }
      let result;
      const known = (opts.tools || []).some((t) => t.name === name);
      if (argsError) {
        result = argsError;
      } else if (!known || typeof opts.executeTool !== "function") {
        // tool-runtime.ts: unknown tool → error value, do not invent a handler
        result = `Unknown tool: ${name}`;
      } else {
        try {
          result = await opts.executeTool(name, args);
        } catch (e) {
          result = `Tool error: ${e.message || e}`;
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: String(result ?? ""),
      });
    }
  }
  return { ok: false, error: "Stopped after too many tool steps" };
}

module.exports = { runTurn, PATH, DEFAULT_BASE_URL };
