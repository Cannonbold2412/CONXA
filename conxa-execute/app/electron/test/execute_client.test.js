"use strict";
const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

// execute_client.js requires ./auth_service, which requires "electron" (not
// available under plain `node --test`) — stub both via the module cache
// before requiring the module under test, same trick loop.test.js avoids
// needing by not touching auth at all.
const authServicePath = require.resolve("../auth_service");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "./auth_service" || path.resolve(path.dirname(parent.filename), request) === authServicePath) {
    return { getToken: async () => "fake-token" };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { makeChatCompletion } = require("../execute_client");
Module._load = originalLoad;

function sseResponse(events) {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const bytes = new TextEncoder().encode(lines);
  let sent = false;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
        };
      },
    },
  };
}

describe("execute_client chatCompletion (Conxa Execute's cloud proxy transport)", () => {
  it("accumulates tool_call fragments by index into complete calls", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mock.fn(async () =>
      sseResponse([
        { type: "text", text: "Sure, " },
        { type: "tool_call", index: 0, id: "call_1", name: "execute_skill", arguments_delta: '{"skill":' },
        { type: "tool_call", index: 0, arguments_delta: '"create_lead"}' },
        { type: "text", text: "running it now." },
        { done: true, text: "Sure, running it now." },
      ]),
    );
    try {
      const chatCompletion = makeChatCompletion({ targetWorkspaceId: "org_abc" });
      const result = await chatCompletion({ model: "conxa-execute", messages: [{ role: "user", content: "run it" }] });
      assert.equal(result.ok, true);
      const message = result.json.choices[0].message;
      assert.equal(message.content, "Sure, running it now.");
      assert.deepEqual(message.tool_calls, [
        { id: "call_1", type: "function", function: { name: "execute_skill", arguments: '{"skill":"create_lead"}' } },
      ]);
      const [, init] = globalThis.fetch.mock.calls[0].arguments;
      const body = JSON.parse(init.body);
      assert.equal(body.target_workspace_id, "org_abc");
      assert.equal(body.usage_class, "execute_chat");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("surfaces a stream error when nothing else came through", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => sseResponse([{ error: "llm_all_providers_failed" }]);
    try {
      const chatCompletion = makeChatCompletion({});
      const result = await chatCompletion({ model: "m", messages: [] });
      assert.equal(result.ok, false);
      assert.match(result.error, /llm_all_providers_failed/);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
