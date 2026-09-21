"use strict";
// The auth gate waits for sign-in instead of bouncing the caller into a re-run loop. This pins the
// pieces it (and the `authenticate` tool) are built from: awaiting an in-flight login's outcome,
// telling "already open" apart from "just opened", honest wording per outcome, and authOnly (check
// sign-in without ever building a run context).
const test   = require("node:test");
const assert = require("node:assert");

const {
  awaitInteractiveAuth, awaitAuthPending, describeAuthWait, beginInteractiveAuth,
  getGroupAuthContext, authAppStatus, _pendingAuth,
} = require("../../app/browser");

test("awaitInteractiveAuth: no handle -> none; finished handle -> its outcome, immediately", async () => {
  assert.deepStrictEqual(await awaitInteractiveAuth("ws_none", { timeoutMs: 50 }), { outcome: "none" });
  _pendingAuth.set("ws_done", { status: "done", outcome: "captured" });
  assert.strictEqual((await awaitInteractiveAuth("ws_done", { timeoutMs: 50 })).outcome, "captured");
});

test("awaitInteractiveAuth: resolves with the outcome once the login settles", async () => {
  const h = { status: "pending", outcome: null };
  h.settled = new Promise((r) => setTimeout(() => { h.status = "done"; h.outcome = "captured"; r(); }, 20));
  _pendingAuth.set("ws_settles", h);
  assert.strictEqual((await awaitInteractiveAuth("ws_settles", { timeoutMs: 2000 })).outcome, "captured");
});

test("awaitInteractiveAuth: a caller giving up reports timeout and leaves the login pending", async () => {
  const h = { status: "pending", outcome: null, settled: new Promise(() => {}) };
  _pendingAuth.set("ws_hangs", h);
  assert.strictEqual((await awaitInteractiveAuth("ws_hangs", { timeoutMs: 30 })).outcome, "timeout");
  assert.strictEqual(h.status, "pending", "waiting must never close or abandon the user's window");
});

test("beginInteractiveAuth: a window already open is reported as already_open, not 'just opened'", async () => {
  _pendingAuth.set("ws_open", { status: "pending", outcome: null, settled: new Promise(() => {}) });
  const r = await beginInteractiveAuth("ws_open", "about:blank", { label: "GitHub" });
  assert.strictEqual(r.authPending, true);
  assert.strictEqual(r.reason, "already_open");
  assert.strictEqual(r.key, "ws_open");
  assert.match(r.message, /already open/);
});

test("awaitAuthPending: waits per group app, and never waits on one whose window failed to launch", async () => {
  _pendingAuth.set("g__a", { status: "done", outcome: "captured" });
  _pendingAuth.set("g__b", { status: "done", outcome: "abandoned" });
  const waited = await awaitAuthPending({ authPending: true, apps: [
    { key: "g__a", id: "a", name: "A", reason: "opened" },
    { key: "g__b", id: "b", name: "B", reason: "opened" },
    { key: "g__c", id: "c", name: "C", reason: "launch_failed", message: "Executable doesn't exist" },
  ] }, { timeoutMs: 50 });
  assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured", "abandoned", "launch_failed"]);
  // A single-session result is its own entry.
  const single = await awaitAuthPending({ authPending: true, key: "g__a" }, { timeoutMs: 50 });
  assert.strictEqual(single[0].outcome, "captured");
});

test("describeAuthWait: names the real state instead of claiming a window just opened", () => {
  assert.strictEqual(describeAuthWait([{ name: "A", outcome: "captured" }]), "");
  assert.strictEqual(describeAuthWait([{ name: "A", outcome: "launch_failed", message: "no chromium" }, { name: "B", outcome: "timeout" }]), "no chromium");
  assert.match(describeAuthWait([{ name: "GitHub", outcome: "timeout" }]), /Still waiting for sign-in to GitHub.*still open/);
  assert.match(describeAuthWait([{ name: "GitHub", outcome: "abandoned" }, { name: "Drive", outcome: "none" }]), /GitHub, Drive was closed/);
  assert.match(describeAuthWait([{ name: "A", outcome: "captured" }, { name: "B", outcome: "timeout" }]), /waiting for sign-in to B\b/);
});

test("authOnly: a group with nothing to gate reports authenticated without building a browser", async () => {
  const group = { name: "G", apps: [{ id: "a", name: "A", login_url: "https://a.test/login" }] };
  assert.deepStrictEqual(await getGroupAuthContext("ws_g", group, null, { authOnly: true, requiredAppIds: [] }), { authenticated: true });
  assert.deepStrictEqual(await getGroupAuthContext("ws_g", { name: "G", apps: [] }, null, { authOnly: true }), { authenticated: true });
});

test("authAppStatus: an in-flight or finished login as one plain word, for get_execution_status", () => {
  _pendingAuth.set("s_pending", { status: "pending", outcome: null });
  _pendingAuth.set("s_done", { status: "done", outcome: "captured" });
  _pendingAuth.set("s_closed", { status: "done", outcome: "abandoned" });
  assert.strictEqual(authAppStatus("s_pending"), "waiting");
  assert.strictEqual(authAppStatus("s_done"), "signed_in");
  assert.strictEqual(authAppStatus("s_closed"), "closed");
  assert.strictEqual(authAppStatus("s_never_opened"), "failed", "no login handle at all means it never got a window");
});
