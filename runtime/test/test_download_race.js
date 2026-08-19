"use strict";

// Regression: server.js's page.on("download", ...) listener only pushes an entry onto
// ctx.downloadQueue once Playwright's download event actually fires — which can trail the
// triggering click by real wall-clock time (server round-trip, header negotiation). The
// download_observed handler used to check the queue exactly once and bail silently if it was
// still empty, so a download that simply hadn't started yet looked identical to "no download
// happened at all": downloaded_file/downloaded_file_dir never got bound, and a later upload step
// bound to {{downloaded_file_dir}} failed with a "no file path" error that had nothing to do with
// a missing input. The handler must wait for an entry to arrive, not just glance at the queue.
process.env.CONXA_GATE = "0";
process.env.CONXA_DOWNLOAD_WAIT_MS = "500";

const test = require("node:test");
const assert = require("node:assert");

const { executeStep } = require("../run");

test("download_observed waits for a download that hasn't been queued yet", async () => {
  const inputs = {};
  const queue = [];
  // Simulates the real race: the queue is empty when the step starts, and the download event
  // fires a little later — well inside the wait budget, comfortably past one poll interval.
  setTimeout(() => {
    queue.push(Promise.resolve({ filename: "archive.zip", path: "/runs/r1/archive.zip", extractedDir: "/runs/r1/archive" }));
  }, 50);

  await executeStep(null, { type: "download_observed" }, inputs, { downloadQueue: queue });

  assert.strictEqual(inputs.downloaded_file, "/runs/r1/archive.zip");
  assert.strictEqual(inputs.downloaded_file_dir, "/runs/r1/archive");
});

test("download_observed still leaves inputs unset if nothing is ever queued", async () => {
  const inputs = {};
  const queue = [];
  await executeStep(null, { type: "download_observed" }, inputs, { downloadQueue: queue });
  assert.strictEqual(inputs.downloaded_file, undefined);
  assert.strictEqual(inputs.downloaded_file_dir, undefined);
});
