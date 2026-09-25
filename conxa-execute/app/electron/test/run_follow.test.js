"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { waitForRunEnd } = require("../run_follow");

test("waitForRunEnd polls past awaiting_auth, running and bad replies until the run ends", async () => {
  const replies = [
    JSON.stringify({ state: "awaiting_auth" }),
    "not json",
    JSON.stringify({ state: "running" }),
    JSON.stringify({ state: "completed", summary: "Done. ok" }),
  ];
  let calls = 0;
  const callTool = async (name, args) => {
    assert.equal(name, "get_execution_status");
    assert.deepEqual(args, { run_id: "r_1" });
    return replies[calls++];
  };
  const st = await waitForRunEnd("r_1", callTool, { intervalMs: 1 });
  assert.equal(st.state, "completed");
  assert.equal(calls, 4);
});

test("waitForRunEnd treats unknown as ended", async () => {
  const st = await waitForRunEnd("r_2", async () => JSON.stringify({ state: "unknown" }), { intervalMs: 1 });
  assert.equal(st.state, "unknown");
});
