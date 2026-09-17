"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { PATH, DEFAULT_BASE_URL, runTurn } = require("../../vendor/opencode/loop/run_turn");

describe("vendored OpenCode chat completions loop", () => {
  it("keeps OpenCode's /chat/completions path", () => {
    assert.equal(PATH, "/chat/completions");
    assert.equal(DEFAULT_BASE_URL, "https://api.openai.com/v1");
  });

  it("does not execute unknown tools (no bash/write)", async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    let toolPayload = "";
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: "assistant",
                    tool_calls: [{ id: "1", type: "function", function: { name: "bash", arguments: "{}" } }],
                  },
                },
              ],
            }),
        };
      }
      toolPayload = init.body;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { role: "assistant", content: "stopped" } }] }),
      };
    };
    try {
      const result = await runTurn({
        baseURL: "https://example.invalid/v1",
        apiKey: "k",
        model: "m",
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "execute_skill", inputSchema: { type: "object" } }],
        executeTool: async () => {
          throw new Error("must not run bash");
        },
      });
      assert.equal(result.ok, true);
      assert.equal(result.text, "stopped");
      assert.match(toolPayload, /Unknown tool: bash/);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("uses a pluggable chatCompletion transport instead of fetch when given one", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("must not call fetch when chatCompletion is supplied");
    };
    let callCount = 0;
    try {
      const result = await runTurn({
        model: "m",
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
        executeTool: async () => "",
        chatCompletion: async (body) => {
          callCount += 1;
          assert.equal(body.model, "m");
          return { ok: true, json: { choices: [{ message: { role: "assistant", content: "via proxy" } }] } };
        },
      });
      assert.equal(callCount, 1);
      assert.equal(result.ok, true);
      assert.equal(result.text, "via proxy");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("surfaces HTTP model errors without hanging", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: "invalid api key" } }),
    });
    try {
      const r = await runTurn({
        baseURL: "https://example.invalid/v1",
        apiKey: "bad",
        model: "m",
        system: "s",
        messages: [{ role: "user", content: "x" }],
        tools: [],
        executeTool: async () => "",
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /401/);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("sanitizes malformed tool-call arguments in history instead of poisoning every future turn", async () => {
    let step = 0;
    const result = await runTurn({
      model: "m",
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "x", inputSchema: { type: "object" } }],
      executeTool: async () => "",
      chatCompletion: async (body) => {
        step += 1;
        if (step === 1) {
          return {
            ok: true,
            json: {
              choices: [
                {
                  message: {
                    role: "assistant",
                    tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}garbage" } }],
                  },
                },
              ],
            },
          };
        }
        // Second call: the provider now receives the FULL history, including
        // the previously malformed assistant tool call. Assert it was fixed.
        const assistantMsg = body.messages.find((m) => m.role === "assistant" && m.tool_calls);
        assert.equal(assistantMsg.tool_calls[0].function.arguments, "{}");
        return { ok: true, json: { choices: [{ message: { role: "assistant", content: "done" } }] } };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "done");
    const toolResult = result.messages.find((m) => m.role === "tool");
    assert.match(toolResult.content, /Invalid tool call arguments/);
  });
});
