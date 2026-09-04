"use strict";
// EXEC-29 — native dialog handling. Two things under test:
//   1. answerDialog (handlers.js) — the shared accept/dismiss logic, safe to call twice.
//   2. runPlan (run.js) — pre-arms the answer BEFORE dispatching the step that opens the
//      dialog, instead of waiting for the following dialog_accept/dialog_dismiss step to drain
//      ctx.dialogQueue. That old order deadlocks for real: Playwright's click()/fill()/etc.
//      does not resolve while a native dialog is open, so the step that would answer it can
//      never run. These tests fake that exact blocking behavior on a mock page/locator so a
//      regression here hangs the test (and CI) rather than silently passing.
const test = require("node:test");
const assert = require("node:assert");

const { answerDialog } = require("../../app/handlers");
const { runPlan } = require("../../app/run");

function fakeDialog(type, message) {
  const d = {
    handled: false,
    type: () => type,
    message: () => message,
    accept: async (text) => {
      if (d.handled) throw new Error("Dialog has been already handled!");
      d.handled = true;
      return text;
    },
    dismiss: async () => {
      if (d.handled) throw new Error("Dialog has been already handled!");
      d.handled = true;
    },
  };
  return d;
}

test("answerDialog accepts an alert with no text", async () => {
  const dialog = fakeDialog("alert", "hi");
  let accepted = null;
  dialog.accept = async (text) => { accepted = text; };
  await answerDialog(dialog, { type: "dialog_accept", value: JSON.stringify({ type: "alert", message: "hi", value: "" }) }, {});
  assert.strictEqual(accepted, "");
});

test("answerDialog interpolates the prompt's bound input", async () => {
  const dialog = fakeDialog("prompt", "say something");
  let accepted = null;
  dialog.accept = async (text) => { accepted = text; };
  const step = { type: "dialog_accept", value: JSON.stringify({ type: "prompt", message: "say something", value: "{{dialog_answer}}" }) };
  await answerDialog(dialog, step, { dialog_answer: "CONXA" });
  assert.strictEqual(accepted, "CONXA");
});

test("answerDialog dismisses on a dialog_dismiss step", async () => {
  const dialog = fakeDialog("confirm", "sure?");
  let dismissed = false;
  dialog.dismiss = async () => { dismissed = true; };
  await answerDialog(dialog, { type: "dialog_dismiss" }, {});
  assert.strictEqual(dismissed, true);
});

test("answerDialog is safe to call twice on the same dialog (pre-arm racing the marker step's own drain)", async () => {
  const dialog = fakeDialog("alert", "hi");
  const step = { type: "dialog_accept", value: JSON.stringify({ type: "alert", message: "hi", value: "" }) };
  await answerDialog(dialog, step, {});
  await assert.doesNotReject(answerDialog(dialog, step, {})); // second call must not throw out
});

// Mock page: a "click" step's action() call blocks — exactly like Playwright's real click()
// does when it triggers a native dialog — until something calls the registered dialog
// listener. If runPlan doesn't pre-arm the answer before dispatching the click, this test
// hangs (and node --test's own timeout fails it) instead of completing.
// dialogQueue mirrors server.js's real, permanent `pg.on("dialog", d => _dialogQueue.push(d))`
// listener (handlers.js's HANDLERS["dialog_accept"] drains it for a pack compiled before this
// fix). A real page fires every registered "dialog" listener for one dialog — both that
// permanent one AND run.js's one-shot pre-arm — so the mock must too, or it isn't exercising
// the real interaction between the two paths.
function mockDialogBlockingPage(dialogType, dialogMessage, dialogQueue) {
  const listeners = { dialog: [(d) => dialogQueue.push(d)] };
  const page = {
    url: () => "https://example.test/",
    waitForLoadState: async () => {},
    screenshot: async () => null,
    context: () => ({ on: () => {}, off: () => {} }),
    once: (event, fn) => { if (event === "dialog") listeners.dialog.push(fn); },
    off: (event, fn) => {
      if (event !== "dialog") return;
      const idx = listeners.dialog.indexOf(fn);
      if (idx >= 0) listeners.dialog.splice(idx, 1);
    },
    locator: () => ({
      first: () => ({
        click: async () => {
          const dialog = fakeDialog(dialogType, dialogMessage);
          const fired = listeners.dialog.slice();
          // Real Chromium raises the dialog synchronously as part of dispatching the click,
          // and click() does not resolve until it's answered — reproduce exactly that: don't
          // return from this click() call until fired listeners have answered the dialog.
          for (const fn of fired) fn(dialog);
          for (let i = 0; i < 200 && !dialog.handled; i++) await new Promise(r => setTimeout(r, 1));
          if (!dialog.handled) throw new Error("dialog never answered — click() would hang here for real");
          return null;
        },
        waitFor: async () => {},
      }),
    }),
  };
  return page;
}

test("runPlan answers a dialog opened by a click BEFORE the following dialog_accept step runs (no deadlock)", async () => {
  const dialogQueue = [];
  const page = mockDialogBlockingPage("alert", "I am a JS Alert", dialogQueue);
  const steps = [
    {
      type: "click",
      _explicit_selector: "text=Click for JS Alert",
      recovery: { no_recovery_block: true },
    },
    { type: "dialog_accept", value: JSON.stringify({ type: "alert", message: "I am a JS Alert", value: "" }), recovery: { no_recovery_block: true } },
  ];
  const result = await Promise.race([
    runPlan(page, steps, {}, 0, "test-dialog-skill", { dialogQueue }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("runPlan hung — dialog deadlock regressed")), 5000)),
  ]);
  assert.ok(result);
});
