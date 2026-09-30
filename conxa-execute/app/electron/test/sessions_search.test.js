"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.CONXA_EXECUTE_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-sessions-"));
const sessions = require("../sessions");

test("searchSessions matches titles and message text, skipping hidden run notes", async () => {
  const a = await sessions.createSession();
  await sessions.saveSessionMessages(a.id, [
    { role: "user", content: "Upload Fancy.gitignore to Drive" },
    { role: "tool", tool_call_id: "c1", content: "Done. secretword in tool output" },
    { role: "user", content: "[Conxa run update] hiddenword" },
    { role: "assistant", content: "Uploaded it to your receipts folder." },
  ]);
  const b = await sessions.createSession();
  await sessions.saveSessionMessages(b.id, [{ role: "user", content: "Something else" }]);

  assert.deepEqual((await sessions.searchSessions("fancy")).map((s) => s.id), [a.id]); // title
  const byText = await sessions.searchSessions("RECEIPTS");
  assert.equal(byText.length, 1);
  assert.match(byText[0].snippet, /receipts folder/);
  assert.equal((await sessions.searchSessions("secretword")).length, 0);
  assert.equal((await sessions.searchSessions("hiddenword")).length, 0);
  assert.equal((await sessions.searchSessions("  ")).length, 0);
});

test("renameSession trims and rejects empty names", async () => {
  const s = await sessions.createSession();
  assert.equal(await sessions.renameSession(s.id, "  Expense   run "), "Expense run");
  assert.equal((await sessions.loadSession(s.id)).title, "Expense run");
  await assert.rejects(sessions.renameSession(s.id, "   "));
});
