"use strict";
// Unexpected-overlay identity capture (BUILD-26 stage f). Persists what cascade.js's
// dismiss-overlay remedy actually saw — on a run that recovered and PASSED, not just a failed
// one — so the Human Review Copilot can later propose an if_present/try_dismiss branch built
// from an overlay the runtime actually observed, never a model-invented selector. Same
// never-throws, fs-only (no network) contract as recovery_log.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function overlaysPath(dataDir, runId) {
  return path.join(dataDir, "runs", runId, "_evidence", "overlays.jsonl");
}

// A short stable id the copilot references by — hashed off the container signal (the thing that
// actually identifies "the same overlay"), not the run id, so two captures of the same popup in
// one run collapse to one id.
function overlayId(containerSignal, runId) {
  return crypto.createHash("sha256").update(`${runId}|${containerSignal || ""}`).digest("hex").slice(0, 12);
}

// `_writeStudioEvidence` (failure_response.js) is the only thing that creates
// runs/{run_id}/_evidence/ today, and it only runs on a failure — so this must create the
// directory itself: a passing run, the case this module exists to capture, never touches that
// path otherwise.
function recordOverlayObservation({ dataDir, runId, slug, stepIndex, probe, dismissed }) {
  try {
    if (!dataDir || !runId || !probe || !probe.container) return;
    const signal = probe.container.signal || null;
    const id = overlayId(signal, runId);

    // Dedupe within a run: the same popup can intercept several steps in a row (a sticky
    // cookie banner blocking three clicks before it's finally dismissed) — one capture per
    // distinct overlay per run is what the copilot needs, not a line per intercepted step.
    const file = overlaysPath(dataDir, runId);
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          if (JSON.parse(line).overlay_id === id) return;
        } catch (_) { /* skip a malformed line, don't let it block a new capture */ }
      }
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });
    const record = {
      overlay_id: id,
      run_id: runId,
      slug,
      step_index: stepIndex,
      ts: new Date().toISOString(),
      dismissed: !!dismissed,
      container: probe.container,
      controls: probe.controls || [],
    };
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  } catch (_) {
    // Same contract as recovery_log.js / _writeStudioEvidence: a capture failure must never
    // break the recovery it's observing.
  }
}

function readOverlayObservations(dataDir, runId) {
  try {
    const file = overlaysPath(dataDir, runId);
    if (!fs.existsSync(file)) return [];
    const out = [];
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch (_) { continue; }
    }
    return out;
  } catch (_) {
    return [];
  }
}

module.exports = { overlaysPath, overlayId, recordOverlayObservation, readOverlayObservations };
