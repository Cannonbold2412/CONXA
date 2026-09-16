"use strict";
// EXEC-41 Stage 2: the interactive-login window gets the exact same host-branch/fallback
// contract as a skill run's own context (see test_host_browser.js for the parallel _buildExecContext
// tests) — this pins _openInteractiveAuthWindow specifically. The full round trip (a real
// Electron panel actually receiving the login view, the user "logging in", the session getting
// persisted, and Execute tearing the view back down) was verified once by hand against the real
// conxa-execute files during development — see FIX.md/TODO.md EXEC-41 — and isn't re-run here
// because it needs a real Electron process, which this fast unit suite deliberately doesn't spawn.
const test   = require("node:test");
const assert = require("node:assert");

const { _openInteractiveAuthWindow } = require("../../app/browser");

async function closeOpened(opened) {
  try { await opened.loginCtx.close(); } catch (_) {}
  try { await opened.loginBrowser.close(); } catch (_) {}
}

test("with CONXA_HOST_BROWSER_CDP unset, the login window takes the launch path", async () => {
  delete process.env.CONXA_HOST_BROWSER_CDP;
  const opened = await _openInteractiveAuthWindow("ws_unit", "about:blank", { runId: "r_login_1" });
  try {
    assert.ok(!opened.hostOwned);
    assert.ok(opened.loginPage);
  } finally {
    await closeOpened(opened);
  }
});

test("with the endpoint set but unreachable, the login window logs the fallback and still opens", async () => {
  process.env.CONXA_HOST_BROWSER_CDP = "http://127.0.0.1:1";
  const logs = [];
  try {
    const opened = await _openInteractiveAuthWindow("ws_unit", "about:blank", {
      runId: "r_login_2",
      logFn: (level, event, meta) => logs.push({ level, event, meta }),
    });
    try {
      assert.ok(!opened.hostOwned);
      assert.ok(opened.loginPage);
      const entry = logs.find((l) => l.event === "host_browser_fallback");
      assert.ok(entry, "the fallback must be logged");
      assert.strictEqual(entry.meta.phase, "login", "the login path's fallback must be tagged 'login', not confused with a skill run's");
    } finally {
      await closeOpened(opened);
    }
  } finally {
    delete process.env.CONXA_HOST_BROWSER_CDP;
  }
});

test("without a runId, the login window never attempts the host branch even with the endpoint set", async () => {
  process.env.CONXA_HOST_BROWSER_CDP = "http://127.0.0.1:1";
  const logs = [];
  try {
    const opened = await _openInteractiveAuthWindow("ws_unit", "about:blank", {
      logFn: (level, event, meta) => logs.push({ level, event, meta }),
    });
    try {
      assert.ok(!opened.hostOwned);
      assert.ok(!logs.some((l) => l.event === "host_browser_fallback"));
    } finally {
      await closeOpened(opened);
    }
  } finally {
    delete process.env.CONXA_HOST_BROWSER_CDP;
  }
});
