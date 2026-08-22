"use strict";
/**
 * failure_response.js — assembly of the MCP failure response payload, extracted
 * verbatim from server.js so the LLM prompt-engineering text (the Tier 3/4
 * recovery request) is unit-testable without loading the whole server.
 *
 * Two shapes, decided by the recovery-tier ceiling (CONXA_MAX_RECOVERY_TIER):
 *   • ceiling ≥ 3 (Claude/MCP): a structured Tier 3 (semantic) + Tier 4 (vision) recovery
 *     request with an explicit `step_overrides` protocol so the agent can apply a fix and
 *     resume — the closing edge of the four-tier cascade.
 *   • ceiling 2 (Build Studio): a concise, deterministic failure. No agent handoff, no
 *     screenshots — the compiled pack is judged on its T1/T2 merits alone.
 *
 * Everything that used to be a server.js module-level binding arrives via `deps`,
 * evaluated at call time (server.js binds some of them late inside its SDK try block).
 */
const fs   = require("fs");
const path = require("path");
const pageScripts = require("./page_scripts");

// Compact, recovery-relevant description of the step the cascade could not resolve.
// Drives Tier 3 (semantic) matching: the agent matches THIS intent against the live DOM.
function stepRecoveryContext(err) {
  const step = err && err.failedStep ? err.failedStep : null;
  if (!step) return null;
  const fp = (step.identity_bundle && step.identity_bundle.fingerprint) || {};

  // Anchors from recovery.json are human-readable descriptions written at compile time and
  // stable across UI drift — unlike compiled fingerprint fields (inner_text, data_testid) which
  // may be stale. Prefer the highest-priority anchor as the element label; fall back to the
  // fingerprint when anchors are absent.
  const anchors = Array.isArray(step.anchors)
    ? step.anchors
        .filter(a => a && typeof a.text === "string" && a.text.trim())
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map(a => a.text.trim())
    : [];

  const ctx = {
    action: step.type || "",
    intent: step._intent || step.label || "",
    target: {
      role:        fp.role || undefined,
      name:        fp.aria_label || fp.name || undefined,
      text:        anchors[0] || fp.inner_text || undefined,
      data_testid: fp.data_testid || undefined,
    },
  };
  if (anchors.length) ctx.anchors = anchors;
  if (step.value && typeof step.value === "string" && step.value.length < 80) ctx.value = step.value;
  // Tell the agent explicitly when the target lives inside a nested iframe — otherwise it has no
  // way to know the "Interactive elements NOW" list (top-level only, unless a frame-scoped
  // inventory was also gathered) might not be the whole picture.
  const frameChain = Array.isArray(step.identity_bundle && step.identity_bundle.frame_chain)
    ? step.identity_bundle.frame_chain
    : [];
  if (frameChain.length) ctx.frame = { depth: frameChain.length };
  // Strip empty target fields so the agent sees only positive identity signals.
  ctx.target = Object.fromEntries(Object.entries(ctx.target).filter(([, v]) => v));
  if (!Object.keys(ctx.target).length) delete ctx.target;
  return ctx;
}

// The compiled expected-post-condition for the failed step — lets the agent tell "element not
// found" apart from "action ran but produced the wrong outcome", and know what success looks
// like once its recovery attempt resumes. `stepAssertions` and `evaluateAssertion` iterate the
// same array in the same order (run.js `verifyStep`), so `results[i]` pairs with `defs[i]`.
function expectedStateBlock(err, stepAssertions) {
  if (!err.failedStep) return null;
  const defs = stepAssertions(err.failedStep);
  if (!defs.length) return null;
  const results = Array.isArray(err.verifyResults) ? err.verifyResults : null;
  const lines = defs.map((a, i) => {
    const r = results && results[i];
    const parts = [
      a.type || "?",
      a.target ? `target=${a.target}` : null,
      a.expected !== undefined ? `expected=${JSON.stringify(a.expected)}` : null,
      a.required === false ? "advisory" : "required",
      r ? (r.ok ? "held" : "FAILED") : null,
    ];
    return "  - " + parts.filter(Boolean).join(", ");
  });
  const verdict = err.verifyFail
    ? "The action ran without throwing, but its expected post-condition did not hold:"
    : "This step's expected post-condition (what should hold once recovery succeeds):";
  return `${verdict}\n${lines.join("\n")}`;
}

// A compact trace of what already executed, so the agent can reason about how the current page
// state was reached instead of guessing from a single frame.
function executedStepsBreadcrumb(steps, failedAt) {
  if (!Array.isArray(steps) || typeof failedAt !== "number" || failedAt <= 0) return null;
  const lines = [];
  for (let i = 0; i < failedAt && i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    const intent = String(s._intent || s.label || s.type || "").slice(0, 80);
    lines.push(`  ${i}: ${s.type || "?"} — ${intent}`);
  }
  return lines.length ? `Executed steps (leading context):\n${lines.join("\n")}` : null;
}

async function buildFailureResponse(page, err, resolvedEntry, runTracker, steps, deps) {
  const {
    agentRecoveryEnabled,
    maxRecoveryTier,
    sentVisualRefs,
    appendRecoveryEvent,
    stepAssertions,
    frameScopedInventory,
  } = deps;

  const url      = page.url();
  const failedAt = typeof err.failedAt === "number" ? err.failedAt : null;
  const stepNo   = failedAt !== null ? failedAt + 1 : "?";

  // Session expiry is handled by the caller (see the `session_expired` branch in the outer
  // catch, above the call site) before buildFailureResponse is ever reached — it isn't a
  // selector/DOM failure and needs no screenshot or recovery payload.

  // Build Studio (T1/T2 ceiling): deterministic terminal failure, no agent recovery payload.
  if (!agentRecoveryEnabled) {
    appendRecoveryEvent({ event: "recovery_ceiling_reached", tier: maxRecoveryTier,
      slug: resolvedEntry && resolvedEntry.slug, step_index: failedAt });
    const intent = stepRecoveryContext(err);
    const detail = intent ? `\nStep intent: ${JSON.stringify(intent)}` : "";
    return { content: [{ type: "text", text:
      `Execution failed at step ${stepNo}: ${err.message}\nPage URL: ${url}\n` +
      `Recovery ceiling Tier ${maxRecoveryTier} (deterministic cascade only — no agent recovery).${detail}` }] };
  }

  // P7: capture as JPEG (lossless PNG is 3-8× larger; Claude token cost is dimension-based either way)
  const failShot = await page.screenshot({ type: "jpeg", quality: 80 }).catch(() => null);

  // P5: skip visual reference if already sent for this (slug, step) in this execution
  const visualRefKey = resolvedEntry && failedAt !== null ? `${resolvedEntry.slug}:${failedAt}` : null;
  const alreadySentRef = sentVisualRefs && visualRefKey ? sentVisualRefs.has(visualRefKey) : false;

  let visualRefData = null, visualRefMime = null;
  if (resolvedEntry && failedAt !== null && !alreadySentRef) {
    const visualDir = path.join(resolvedEntry.skillDir, "visuals");
    const stepNum   = failedAt + 1;
    for (const ext of [".jpg", ".jpeg", ".png"]) {
      const candidate = path.join(visualDir, `Image_${stepNum}${ext}`);
      if (fs.existsSync(candidate)) {
        visualRefData = fs.readFileSync(candidate).toString("base64");
        visualRefMime = ext === ".png" ? "image/png" : "image/jpeg";
        if (sentVisualRefs && visualRefKey) sentVisualRefs.add(visualRefKey);
        break;
      }
    }
  }

  let viewport = null;
  try { viewport = page.viewportSize(); } catch (_) {}
  let scrollY = null;
  try { scrollY = await page.evaluate(pageScripts.getScrollY); } catch (_) {}

  // Ground truth: the live, post-cascade inventory — the state the agent's corrected selector
  // will actually act on. T1/T2 remedies (dismiss-overlay, scroll, re-hover, ...) may already
  // have changed the page since the moment of failure, so this is always captured fresh rather
  // than only as a fallback. Cap at 50 elements — dominant text payload; nearby elements suffice.
  let currentInventory = null;
  try {
    currentInventory = await page.evaluate(pageScripts.domInventory);
  } catch (_) {}

  // If the failed step's target lives inside an iframe, document.querySelectorAll above cannot
  // see into it at all — merge in a frame-scoped inventory so the agent isn't shown a "ground
  // truth" that silently omits the entire frame. `inputs` isn't threaded this deep (frame_chain
  // selectors are structural iframe selectors, not input-templated, so this is a safe gap) —
  // pass {} rather than plumb it through every layer for this diagnostic-only gather.
  const failedStep = err && err.failedStep;
  if (failedStep) {
    try {
      const frameEntries = await frameScopedInventory(page, failedStep, {});
      if (Array.isArray(frameEntries) && frameEntries.length) {
        currentInventory = [
          ...(Array.isArray(currentInventory) ? currentInventory : []),
          ...frameEntries.map(e => ({ ...e, in_frame: true })),
        ];
      }
    } catch (_) {}
  }

  // Secondary, and only when it actually differs from the current one: the inventory at the
  // exact moment of failure, before the T1/T2 cascade ran. A dropdown or dialog listed here may
  // have since closed — it must never be mistaken for the state to act on now.
  const earlyInventory = Array.isArray(err.earlyDomSnapshot) ? err.earlyDomSnapshot : null;
  const earlyDiffers = earlyInventory
    && JSON.stringify(earlyInventory) !== JSON.stringify(currentInventory);

  appendRecoveryEvent({ event: "agent_recovery_requested", tier: maxRecoveryTier,
    slug: resolvedEntry && resolvedEntry.slug, step_index: failedAt });
  if (runTracker) runTracker.emit("tier_escalated", { si: failedAt, l: maxRecoveryTier });

  if (err.overrideValidationFailed) {
    appendRecoveryEvent({ event: "agent_override_rejected", slug: resolvedEntry && resolvedEntry.slug,
      step_index: failedAt, reason: err.overrideReason });
    if (runTracker) runTracker.emit("override_rejected", { si: failedAt, reason: err.overrideReason });
  }

  const intent = stepRecoveryContext(err);
  const resumeKey = failedAt !== null ? String(failedAt) : "0";

  // When the previous resume's override selector failed our uniqueness gate (run.js
  // validateOverrideSelector), tell the agent exactly why and what it actually matched, instead
  // of just re-describing the original failure as if nothing had been tried.
  const overrideNote = err.overrideValidationFailed
    ? err.overrideReason === "frame-not-found"
      ? `\n\nYour previous recovery selector could not even be tried: the frame/iframe this ` +
        `element is supposed to live inside could not be located on the current page (it may not ` +
        `have opened, or its identity changed). Picking a different element selector will not ` +
        `help — first confirm whether the panel/dialog that should contain it is actually open.`
      : `\n\nYour previous recovery selector ${err.overrideReason === "no-match"
          ? "matched no element on the current page"
          : "matched multiple elements with no clear winner"}.` +
        (Array.isArray(err.overrideCandidates) && err.overrideCandidates.length
          ? ` Candidates it matched: ${JSON.stringify(err.overrideCandidates)}.`
          : "") +
        ` Pick a more specific selector using the current-state inventory below.`
    : "";

  // Distinct from a plain element-not-found: the step's target lives inside a frame/iframe, and
  // that frame itself could not be located this time (not just the element inside it) — e.g. the
  // panel never opened, or the iframe's identifying attribute changed on reattach. Proposing a
  // new element selector cannot fix this; the agent needs to know the failure is one level up.
  const frameNotFoundNote = err.frameNotFound
    ? `\n\nNote: this step's target lives inside a frame/iframe, and that containing frame could ` +
      `not be located on the current page at all (not just the element inside it) — it may not ` +
      `have opened yet, may have closed, or its identifying attributes may have changed. The ` +
      `"Interactive elements NOW" list below is top-level only and will not show anything from ` +
      `inside that frame. Check the screenshot for whether the expected panel/dialog is visible; ` +
      `if it never opened, the fix is likely earlier in the sequence (the step that should have ` +
      `opened it), not a new selector for this step.`
    : "";

  // Header + the exact closing-edge protocol so the agent can apply its finding and resume.
  const header =
    `Execution failed at step ${stepNo} (Tier 1–2 cascade exhausted): ${err.message}\n` +
    `Page URL: ${url}\n\n` +
    `Self-healing recovery (Tier 3 semantic + Tier 4 vision). Identify the element the failed ` +
    `step was meant to act on, then resume by calling execute_skill again with:\n` +
    `  resume_from: ${failedAt ?? 0}\n` +
    `  step_overrides: { "${resumeKey}": { "selector": "<your selector>" } }\n` +
    `Selector preference: [data-testid="…"] > #id > internal:role=<role>[name="…"] > text="…". ` +
    `The "Interactive elements NOW" list and the "Current page at failure" screenshot below are ` +
    `ground truth — trust them over the recording-time reference image, which only shows how the ` +
    `target used to look and may be outdated. The screenshot is viewport-only; the target may be ` +
    `off-screen (see scrollY), so check the DOM inventory for existence even if it isn't visible ` +
    `in the image. Do not guess — if no element matches the intent, tell the user the page has ` +
    `changed and ask how to proceed.${frameNotFoundNote}${overrideNote}`;

  // Tier 3 — semantic: the recorded intent, expected post-condition, execution trace, and the
  // live (ground-truth) inventory of interactive elements.
  const t3 = ["── Tier 3 (semantic) ──"];
  if (intent) t3.push(`Failed step intent: ${JSON.stringify(intent)}`);
  const expected = expectedStateBlock(err, stepAssertions);
  if (expected) t3.push(expected);
  const breadcrumb = executedStepsBreadcrumb(steps, failedAt);
  if (breadcrumb) t3.push(breadcrumb);
  if (viewport) t3.push(`viewport: ${JSON.stringify(viewport)}, scrollY: ${scrollY}`);
  if (currentInventory && currentInventory.length) {
    t3.push(`Interactive elements NOW — ground truth (${currentInventory.length}):\n${JSON.stringify(currentInventory)}`);
  } else {
    t3.push("No interactive elements were enumerable now — rely on the Tier 4 screenshot.");
  }
  if (earlyDiffers) {
    t3.push(`Elements at the moment of failure, before Tier 1–2 remedies ran (may include ` +
      `since-closed transient UI — do not treat as current):\n${JSON.stringify(earlyInventory)}`);
  }

  const content = [
    { type: "text", text: header },
    { type: "text", text: t3.join("\n") },
    { type: "text", text: "── Tier 4 (vision) ──" },
  ];

  if (err.preShot)    content.push({ type: "text", text: "Pre-step screenshot (before the action):" }, { type: "image", data: err.preShot.toString("base64"), mimeType: "image/jpeg" });
  if (visualRefData)  content.push({ type: "text", text: `Reference image of the target from recording (step ${stepNo}) — recording-time appearance, may be outdated:` }, { type: "image", data: visualRefData, mimeType: visualRefMime });
  if (failShot)       content.push({ type: "text", text: "Current page at failure — ground truth:" }, { type: "image", data: failShot.toString("base64"), mimeType: "image/jpeg" });

  return { content };
}

module.exports = { buildFailureResponse, stepRecoveryContext, expectedStateBlock, executedStepsBreadcrumb };
