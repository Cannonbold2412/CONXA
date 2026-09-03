"use strict";

// Unit tests for the Tier 1 known-pattern overlay dismissal ladder (EXEC-5 slice):
// dismiss_patterns.js's static CMP accept/close list, learned_dismissals.js's host-scoped
// runtime-local memory, and cascade.js::layer1Ladder wiring for INTERCEPTED failures.
// Env vars are set BEFORE any app require so the learned store and the recovery log land
// in a throwaway directory (same pattern as test_branch.js's env-var-before-require note).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.CONXA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-dismiss-test-"));
process.env.CONXA_DIR = process.env.CONXA_DATA_DIR;

const test = require("node:test");
const assert = require("node:assert");

const {
  KNOWN_DISMISS_SELECTORS, dismissKnownOverlay,
  DISMISS_ALLOW_RE, DISMISS_DENY_RE, isSafeDismissLabel, dismissAgentNominated,
} = require("../../app/dismiss_patterns");
const learned = require("../../app/learned_dismissals");
const { layer1Ladder } = require("../../app/run");
const { applyStepOverrides } = require("../../app/handlers");

// Mock page: `present` maps selector -> count; `failClicks` lists selectors whose click throws.
// `labels` (EXEC-30) maps selector -> { label, inDialogChrome } for the agent-nominated path's
// evaluate() call.
function mockPage({ present = {}, failClicks = [], labels = {}, url = "https://shop.test/page" } = {}) {
  const clicks = [];
  const escapes = [];
  return {
    url: () => url,
    locator: (sel) => ({
      count: async () => (present[sel] ? 1 : 0),
      first: () => ({
        evaluate: async () => labels[sel] || { label: "", inDialogChrome: false },
        click: async () => {
          if (failClicks.includes(sel)) throw new Error("intercepts pointer events");
          clicks.push(sel);
        },
      }),
    }),
    keyboard: { press: async () => { escapes.push(1); } },
    waitForTimeout: async () => {},
    _clicks: clicks,
    _escapes: escapes,
  };
}

// ─── List hygiene (the safety rules, machine-checked) ──────────────────────────

test("every known dismissal selector is bounded and specific", () => {
  assert.ok(KNOWN_DISMISS_SELECTORS.length > 0 && KNOWN_DISMISS_SELECTORS.length <= 25);
  assert.strictEqual(new Set(KNOWN_DISMISS_SELECTORS).size, KNOWN_DISMISS_SELECTORS.length);
  for (const sel of KNOWN_DISMISS_SELECTORS) {
    assert.strictEqual(typeof sel, "string");
    assert.ok(sel.length > 0 && sel.length <= 200);
    // Never decline — that is a legal choice the customer must make themselves.
    assert.ok(!/decline|reject/i.test(sel), `decline-style selector leaked in: ${sel}`);
  }
});

test("close affordances are always scoped to dialog/modal containers", () => {
  for (const sel of KNOWN_DISMISS_SELECTORS) {
    if (/aria-label\*='close'/i.test(sel)) {
      assert.ok(
        /\[role='dialog'\]|\[role='alertdialog'\]|\[aria-modal='true'\]|\.modal/i.test(sel),
        `unscoped close selector would match unrelated page chrome: ${sel}`,
      );
    }
  }
});

test("no bare generic button selectors that could confirm a load-bearing dialog", () => {
  for (const sel of KNOWN_DISMISS_SELECTORS) {
    assert.ok(!/^button$/i.test(sel.trim()), sel);
    assert.ok(!/\.modal-footer\s+button$/i.test(sel), sel);
  }
});

// ─── dismissKnownOverlay ───────────────────────────────────────────────────────

test("clicks every present candidate in order (consent stacks / dead-end candidates)", async () => {
  const page = mockPage({
    present: { "#truste-consent-button": true, ".cmplz-accept": true },
  });
  const hit = await dismissKnownOverlay(page);
  assert.deepStrictEqual(hit, {
    selectors: ["#truste-consent-button", ".cmplz-accept"],
    source: "known",
  });
  // Both were clicked — the ladder does not stop at the first successful click, because
  // an earlier-list candidate may click without actually dismissing anything.
  assert.deepStrictEqual(page._clicks, ["#truste-consent-button", ".cmplz-accept"]);
});

test("single candidate hit reports it as known", async () => {
  const page = mockPage({ present: { "#onetrust-accept-btn-handler": true } });
  const hit = await dismissKnownOverlay(page);
  assert.deepStrictEqual(hit, { selectors: ["#onetrust-accept-btn-handler"], source: "known" });
  assert.deepStrictEqual(page._clicks, ["#onetrust-accept-btn-handler"]);
});

test("returns null without clicking anything when no candidate exists", async () => {
  const page = mockPage({});
  assert.strictEqual(await dismissKnownOverlay(page), null);
  assert.deepStrictEqual(page._clicks, []);
});

test("a present-but-unclickable candidate falls through to the next one", async () => {
  const page = mockPage({
    present: { "#onetrust-accept-btn-handler": true, ".cmplz-accept": true },
    failClicks: ["#onetrust-accept-btn-handler"],
  });
  const hit = await dismissKnownOverlay(page);
  assert.strictEqual(hit.selectors[0], ".cmplz-accept");
});

test("learned candidates are tried before the static list", async () => {
  const page = mockPage({ present: { "#my-banner-x": true, "#onetrust-accept-btn-handler": true } });
  const hit = await dismissKnownOverlay(page, { learned: ["#my-banner-x"] });
  assert.strictEqual(hit.selectors[0], "#my-banner-x");
  assert.strictEqual(hit.source, "mixed");
  assert.deepStrictEqual(page._clicks, ["#my-banner-x", "#onetrust-accept-btn-handler"]);
});

// ─── learned_dismissals store ──────────────────────────────────────────────────

test("record + selectorsFor round-trip, refresh bumps hits, host isolation holds", () => {
  const file = path.join(process.env.CONXA_DATA_DIR, "store-a.json");
  assert.strictEqual(learned.record("https://shop.test/a", "#x1", file), true);
  assert.strictEqual(learned.record("https://shop.test/b?page=2", "#x1", file), true); // same host
  assert.strictEqual(learned.record("https://other.test/", "#y1", file), true);

  assert.deepStrictEqual(learned.selectorsFor("https://shop.test/c", file), ["#x1"]);
  assert.deepStrictEqual(learned.selectorsFor("https://other.test/", file), ["#y1"]);
  assert.deepStrictEqual(learned.selectorsFor("https://third.test/", file), []);

  // Recording an already-known selector refreshes it instead of duplicating it
  // (three records of #x1 on shop.test above → one entry, three hits).
  learned.record("https://shop.test/a", "#x1", file);
  const store = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(store["shop.test"].length, 1);
  assert.strictEqual(store["shop.test"][0].hits, 3);
});

test("expired entries are pruned on read (30-day TTL)", () => {
  const file = path.join(process.env.CONXA_DATA_DIR, "store-ttl.json");
  learned.save(
    { "old.test": [{ selector: "#stale", ts: Date.now() - learned.ENTRY_TTL_MS - 1000, hits: 3 }] },
    file,
  );
  assert.deepStrictEqual(learned.selectorsFor("https://old.test/x", file), []);
});

test("per-host and global caps are enforced", () => {
  const file = path.join(process.env.CONXA_DATA_DIR, "store-caps.json");
  for (let i = 0; i < learned.MAX_ENTRIES_PER_HOST + 5; i++) {
    learned.record("https://cap.test/p", `#sel-${i}`, file);
  }
  const store = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(store["cap.test"].length, learned.MAX_ENTRIES_PER_HOST);

  const hostsFile = path.join(process.env.CONXA_DATA_DIR, "store-hosts.json");
  for (let h = 0; h < learned.MAX_HOSTS + 5; h++) {
    learned.record(`https://host${h}.test/`, "#z", hostsFile);
  }
  const pruned = learned.load(hostsFile);
  assert.strictEqual(Object.keys(pruned).length, learned.MAX_HOSTS);
});

// ─── layer1Ladder wiring (INTERCEPTED → escape → patterns → retry) ─────────────

test("INTERCEPTED failure runs escape, then the pattern ladder, then the step retry", async () => {
  const page = mockPage({ present: { "#onetrust-accept-btn-handler": true } });
  const err = new Error("#buy intercepts pointer events");
  const result = await layer1Ladder(
    page,
    { type: "wait", ms: 1 }, // trivial handler isolates the ladder from element resolution
    {}, "slug", 3, "#buy", err,
  );
  assert.strictEqual(result, "dismiss-overlay");
  assert.strictEqual(page._escapes.length, 1);
  assert.deepStrictEqual(page._clicks, ["#onetrust-accept-btn-handler"]);

  // The success was recorded into the host-scoped store…
  assert.deepStrictEqual(learned.selectorsFor("https://shop.test/page"), ["#onetrust-accept-btn-handler"]);
  // …and into the recovery audit log (alongside the generic layer1_ladder event that
  // recoverWithSelector's onSuccess appends after it — scan, don't assume last line).
  const log = fs.readFileSync(path.join(process.env.CONXA_DIR, "logs", "recovery.log"), "utf8").trim().split("\n");
  const event = log.map(l => JSON.parse(l)).reverse().find(e => e.event === "tier1_dismiss_pattern");
  assert.ok(event, "tier1_dismiss_pattern event missing from recovery log");
  assert.strictEqual(event.pattern, "#onetrust-accept-btn-handler");
  assert.strictEqual(event.source, "known");
  assert.strictEqual(event.step_index, 3);
});

test("a repeat interception on the same host goes straight to the learned candidate", async () => {
  // Store already carries #onetrust-accept-btn-handler for shop.test (previous test).
  const page = mockPage({ present: { "#onetrust-accept-btn-handler": true } });
  const err = new Error("#buy2 intercepts pointer events");
  const result = await layer1Ladder(page, { type: "wait", ms: 1 }, {}, "slug2", 4, "#buy2", err);
  assert.strictEqual(result, "dismiss-overlay");
  assert.deepStrictEqual(page._clicks, ["#onetrust-accept-btn-handler"]);
});

test("decoy scenario end-to-end: dead-end candidate clicked once, then never again", async () => {
  // Run 1 on decoy.test: static list order clicks #truste-consent-button (dead end), keeps
  // going, clears via .cmplz-accept. Both are recorded; the winner sorts ahead by recency.
  const p1 = mockPage({
    url: "https://decoy.test/run1",
    present: { "#truste-consent-button": true, ".cmplz-accept": true },
  });
  const r1 = await layer1Ladder(p1, { type: "wait", ms: 1 }, {}, "slug-d", 0, "#buy", new Error("intercepts pointer events"));
  assert.strictEqual(r1, "dismiss-overlay");
  assert.deepStrictEqual(p1._clicks, ["#truste-consent-button", ".cmplz-accept"]);
  assert.strictEqual(learned.selectorsFor("https://decoy.test/run2")[0], ".cmplz-accept");

  // Run 2: the learned entry is tried before the static list, so the decoy is never touched.
  const p2 = mockPage({
    url: "https://decoy.test/run2",
    present: { "#truste-consent-button": true, ".cmplz-accept": true },
  });
  await layer1Ladder(p2, { type: "wait", ms: 1 }, {}, "slug-d2", 0, "#buy", new Error("intercepts pointer events"));
  assert.strictEqual(p2._clicks[0], ".cmplz-accept");
});

test("nothing matches anywhere → ladder still just returns after Escape, no false success", async () => {
  const page = mockPage({});
  // The retried step's action must genuinely fail again (the overlay is still there) —
  // otherwise the trivial wait handler would "recover" and mask the ladder's outcome.
  page.waitForTimeout = async () => { throw new Error("#buy intercepts pointer events"); };
  const err = new Error("#buy intercepts pointer events");
  const result = await layer1Ladder(page, { type: "wait", ms: 1 }, {}, "slug3", 0, "#buy", err);
  assert.strictEqual(result, false);
  assert.strictEqual(page._escapes.length, 1);
  assert.deepStrictEqual(page._clicks, []);
  // EXEC-30: an INTERCEPTED failure with no known-pattern match must flag the error so the
  // agent-tier failure payload can say "unrecognized overlay" instead of a bare not-found.
  assert.strictEqual(err.unknownOverlay, true);
});

test("a known-pattern SUCCESS must not also set unknownOverlay", async () => {
  const page = mockPage({ present: { "#onetrust-accept-btn-handler": true } });
  const err = new Error("#buy3 intercepts pointer events");
  await layer1Ladder(page, { type: "wait", ms: 1 }, {}, "slug-known-ok", 9, "#buy3", err);
  assert.strictEqual(err.unknownOverlay, undefined);
});

// ─── isSafeDismissLabel (EXEC-30 gate) ──────────────────────────────────────────

test("isSafeDismissLabel: allow-list phrasing passes", () => {
  for (const label of ["Close", "×", "✕", "No thanks", "Not now", "Skip", "Maybe later", "Dismiss", "Cancel"]) {
    assert.strictEqual(isSafeDismissLabel(label), true, label);
  }
});

test("isSafeDismissLabel: deny-list phrasing fails, even with allow-ish words nearby", () => {
  for (const label of ["Confirm", "Accept all", "Delete", "Pay now", "Decline", "Submit", "Agree and close", "Confirm and dismiss"]) {
    assert.strictEqual(isSafeDismissLabel(label), false, label);
  }
});

test("isSafeDismissLabel: empty label only trusted inside dialog/modal chrome", () => {
  assert.strictEqual(isSafeDismissLabel("", { inDialogChrome: true }), true);
  assert.strictEqual(isSafeDismissLabel("", { inDialogChrome: false }), false);
  assert.strictEqual(isSafeDismissLabel(""), false, "default is untrusted");
});

test("DISMISS_ALLOW_RE / DISMISS_DENY_RE stay disjoint on the canonical word lists", () => {
  const allowWords = ["close", "dismiss", "cancel", "skip", "not now", "no thanks", "maybe later", "later"];
  for (const w of allowWords) assert.ok(!DISMISS_DENY_RE.test(w), `${w} must not also match deny`);
});

// ─── dismissAgentNominated (EXEC-30) ────────────────────────────────────────────

test("dismissAgentNominated: no element on the live page → no-match, nothing clicked", async () => {
  const page = mockPage({});
  const result = await dismissAgentNominated(page, "#ghost");
  assert.deepStrictEqual(result, { ok: false, reason: "no-match" });
  assert.deepStrictEqual(page._clicks, []);
});

test("dismissAgentNominated: present but labelled as a commit action → unsafe-label, nothing clicked", async () => {
  const page = mockPage({
    present: { "#delete-btn": true },
    labels: { "#delete-btn": { label: "Delete this account", inDialogChrome: true } },
  });
  const result = await dismissAgentNominated(page, "#delete-btn");
  assert.deepStrictEqual(result, { ok: false, reason: "unsafe-label", label: "Delete this account" });
  assert.deepStrictEqual(page._clicks, []);
});

test("dismissAgentNominated: present and labelled as a close/cancel affordance → clicked", async () => {
  const page = mockPage({
    present: { "#promo-close": true },
    labels: { "#promo-close": { label: "Close", inDialogChrome: false } },
  });
  const result = await dismissAgentNominated(page, "#promo-close");
  assert.deepStrictEqual(result, { ok: true, selector: "#promo-close", label: "Close" });
  assert.deepStrictEqual(page._clicks, ["#promo-close"]);
});

test("dismissAgentNominated: unlabeled icon button inside dialog chrome is trusted", async () => {
  const page = mockPage({
    present: { "#icon-x": true },
    labels: { "#icon-x": { label: "", inDialogChrome: true } },
  });
  const result = await dismissAgentNominated(page, "#icon-x");
  assert.strictEqual(result.ok, true);
});

test("dismissAgentNominated: unlabeled icon button OUTSIDE dialog chrome is refused", async () => {
  const page = mockPage({
    present: { "#icon-x": true },
    labels: { "#icon-x": { label: "", inDialogChrome: false } },
  });
  const result = await dismissAgentNominated(page, "#icon-x");
  assert.deepStrictEqual(result, { ok: false, reason: "unsafe-label", label: "" });
});

// ─── applyStepOverrides — dismiss field (EXEC-30) ───────────────────────────────

test("applyStepOverrides: dismiss.candidate_index resolves to _dismiss_selector via the map fn", () => {
  const steps = [{ type: "click" }];
  const resolveCandidateIndex = (stepIdx, candIdx) => (stepIdx === 0 && candIdx === 2 ? "#promo-close" : null);
  const out = applyStepOverrides(steps, { "0": { dismiss: { candidate_index: 2 } } }, { resolveCandidateIndex });
  assert.strictEqual(out[0]._dismiss_selector, "#promo-close");
  assert.strictEqual(out[0]._agent_override, true, "dismiss-only override must still flag _agent_override so server.js adopts the parked page");
});

test("applyStepOverrides: dismiss.selector is used directly", () => {
  const steps = [{ type: "click" }];
  const out = applyStepOverrides([...steps], { "0": { dismiss: { selector: "#x" } } });
  assert.strictEqual(out[0]._dismiss_selector, "#x");
  assert.strictEqual(out[0]._agent_override, true);
});

test("applyStepOverrides: dismiss.escape sets _dismiss_escape, no selector needed", () => {
  const steps = [{ type: "click" }];
  const out = applyStepOverrides([...steps], { "0": { dismiss: { escape: true } } });
  assert.strictEqual(out[0]._dismiss_escape, true);
  assert.strictEqual(out[0]._dismiss_selector, undefined);
  assert.strictEqual(out[0]._agent_override, true);
});

test("applyStepOverrides: dismiss + target override compose on the same step", () => {
  const steps = [{ type: "click" }];
  const out = applyStepOverrides([...steps], {
    "0": { selector: "#target", dismiss: { selector: "#promo-close" } },
  });
  assert.strictEqual(out[0]._explicit_selector, "#target");
  assert.strictEqual(out[0]._dismiss_selector, "#promo-close");
  assert.strictEqual(out[0]._agent_override, true);
});

test("applyStepOverrides: an unresolvable dismiss.candidate_index (no map fn) is silently skipped", () => {
  const steps = [{ type: "click" }];
  const out = applyStepOverrides([...steps], { "0": { dismiss: { candidate_index: 2 } } });
  assert.strictEqual(out[0]._dismiss_selector, undefined);
  assert.strictEqual(out[0]._agent_override, undefined, "no patch applied → no override flag either");
});
