# Runtime Architecture Feedback

**Date:** 2026-07-09  
**Focus:** Element resolution, recovery cascade, and operational improvements

---

## Overview

The Conxa runtime architecture is well-engineered with strong disciplinary constraints (zero-token Tiers 1–2, mandatory uniqueness gates, verify-after-recovery closure). The suggestions below are not critiques of the design but practical paths to harden it further. All seven suggestions follow the same theme: **make the evidence the system generates actually do work**, rather than relying on hand-tuned numbers and manual intervention.

---

## Priority 1: Turn the CI Execution Gate Back On (Urgent)

**The problem:**  
`runtime/test/gate_replay.js` exists to replay real skills end-to-end before a runtime build ships. It's currently disabled in `build-runtime-app.yml`. This means a broken runtime can ship to a customer's machine undetected.

**Why this matters:**  
Everything else on this list is an improvement. This one is a safety net that already exists but isn't plugged in. It's the cheapest win with the biggest protection.

**Action items:**
1. Open `.github/workflows/build-runtime-app.yml`
2. Find the comment above the "Zip app layer" step explaining why it was disabled
3. Identify the root cause (usually CI flakiness or a missing fixture)
4. Fix that root cause, not the gate itself
5. Re-enable it
6. If the gate proves flaky in CI, that flakiness is a bug report about the runtime itself—investigate it rather than silencing it

---

## Priority 2: Stop Hand-Tuning Scoring Weights — Let Data Decide

**The problem:**  
`runtime/resolver.js::scoreCandidate` uses weights someone chose intuitively: testid 0.30, name 0.25, role 0.20, text 0.15, anchors 0.10. The confidence threshold is 0.5; the uniqueness margin is 0.15. These numbers have already been patched three times:
- Role aliases (input → textbox)
- The trusted-contract rule (testid overrides score)
- Label-text precedence fix (inner_text > surrounding context)

Every new SaaS app stresses these numbers differently. Without data-driven weights, this is whack-a-mole forever.

**Action items (staged approach):**

### Stage 1: Build a "Resolver Zoo" (now)
Create a systematic test-case folder:
- Each case: recorded fingerprint + live DOM snapshot + correct answer
- Every time the resolver picks wrong in production, that case enters the zoo
- Turn production bugs into permanent regression tests
- Current unit tests do this ad-hoc; make it systematic and owned

**Path:** `runtime/test/resolver-zoo/` with structure like:
```
resolver-zoo/
  case_001_duplicate_submit_buttons/
    fingerprint.json
    candidates.json
    expected_index.json
  case_002_form_input_weak_testid/
    fingerprint.json
    candidates.json
    expected_index.json
```

### Stage 2: Use Real Fleet Data (later, after 1000s of repair_events)
You're already collecting perfect training data. Each `repair_event` emits:
- `score`, `margin`, `signal_used`
- Whether recovery was needed
- Whether the element was ultimately correct

Once you have statistical volume from real customers:
- Query: "when score was 0.6, how often was the pick right?"
- Build a confusion matrix: score → actual accuracy
- Compute optimal weights via logistic regression or similar
- Ship new weights, monitor, iterate

**Success metric:** Resolver picks are validated against reality, not intuition. Weights change only when evidence demands it.

---

## ~~Priority 3: Fix Fingerprints at the Source (Strategic)~~ — Done (2026-07-09)

Fixed at the actual root cause: `serializeTarget()` in `conxa_compile/recorder/bridge.js`
never called the existing `implicitAriaRole(el)` helper — it only used the explicit
`role` attribute (plus a special case for `<a>`), so `semantic.role` fell back to the
raw HTML tag for every form control. Now reuses `implicitAriaRole(el)`, matching what
`buildAriaSelector()` already did. `data_testid` extraction turned out to have its own
real bug too (found while verifying this fix): the regex `data-test(?:-id)?=` only
matched the hyphenated `data-test-id` convention and silently missed the far more common
unhyphenated `data-testid` (React/testing-library) attribute — fixed to `data-test(?:-?id)?=`
in both places it's duplicated in `compiler/build.py`. Also added a compile-time
`weak_fingerprint` warning (`_fingerprint_is_weak` in `build.py`) surfaced through the
existing `compile_warnings` mechanism when a step's fingerprint carries none of the
three fields the runtime resolver weights most heavily (testid, aria_label/name,
inner_text).

## Priority 3 (original write-up, kept for context): Fix Fingerprints at the Source (Strategic)

**The problem:**  
The runtime has a workaround: the `contradicts()` / trusted-contract rule. It exists because the **compiler** records weak fingerprints—saving the HTML tag (`input`) instead of the computed ARIA role (`textbox`), omitting test ids even when they exist.

Compensating downstream for weak upstream data is how architectures rot. Each workaround weakens the safety checks a little. Three more like this and the fingerprint scorer means nothing.

**Action items:**

### In the recorder/compiler (conxa-builder/python/conxa_compile/compiler/):

1. **Record the computed ARIA role, not just the tag**
   - Change `identity_bundle.py::_extract_fingerprint` to read `element.getAttribute("role")` OR compute the implicit ARIA role
   - Store in fingerprint as `aria_role` (distinct from the selector's use of tag names)

2. **Always capture test id into the fingerprint**
   - When an element has `data-testid` or `data-test`, always include it in the fingerprint, not just in the selector
   - Update `identity_bundle.py::_fingerprint` to include `data_testid`

3. **Add a compile-time warning for weak fingerprints**
   - After compilation, check each step's fingerprint
   - If it has no testid, no name, and no inner_text, emit a warning: "Step N has no identity signals—expect recovery."
   - Show this in the Build Studio editor before publish so the recorder knows

**Payoff:** Once fingerprints are rich at source, retire the `contradicts()` escape hatch instead of maintaining it forever. The runtime's safety checks remain sharp.

---

## Priority 4: Measure Assertion Coverage Per Skill Pack

**The problem:**  
`run.js::verifyStep` is excellent—but only for steps *with* assertions. A step with no assertions returns `pass` automatically (`no-assertions`). If the validation planner omits assertions, that step can silently do nothing and the run still succeeds.

**Action items:**

1. **In the compiler** (conxa_compile/compiler/):
   - After building the skill package, count:
     - Total interactive steps (type in [click, type, select, submit, etc.])
     - Steps with ≥1 required assertion
   - Compute: `coverage = (steps_with_assertions / interactive_steps) * 100`
   - Store in the package metadata

2. **In the Build Studio UI:**
   - Before "Publish," show the coverage number like a test-coverage score
   - No gate—a pack with 40% coverage is publishable
   - But the author sees the number and knows what it means: "4 out of 10 clicks are independently verified"

**Success metric:** Skill pack publishers make an informed choice about assertion investment. Low-coverage packs are transparent about their risk.

---

## ~~Priority 5: Close the Telemetry Loop~~ — Partially done (2026-07-09)

Turned out the aggregation ("build the aggregation view first") already existed —
`_drift_review_queue()` in `conxa-cloud/backend/app/services/tracking.py`, exposed at
`GET /tracking/drift` — but had **no frontend consumer anywhere**. That was the actual
gap: data flowing up with nothing showing it to a human. Closed it by (1) enriching the
backend aggregation with `occurrence_rate_pct` (distinct runs needing repair ÷ distinct
runs of that plugin version — not raw event counts, since one run can emit multiple
`repair_event`s across escalating tiers), `dominant_tier`, and `dominant_method`, and
sorting by rate instead of raw occurrences; (2) adding a `DriftReviewQueue` card to the
Cloud Dashboard (`DashboardPage.tsx`) that renders it. Deliberately not built: alerting
and auto-suggested-fix generation (items 2–3 of the original write-up below) — those
stay open, scoped smaller than a first pass warranted.

## Priority 5 (original write-up, kept for context): Close the Telemetry Loop

**The problem:**  
The runtime emits rich drift signals (`repair_event`, `verify_result`, `drift_detected`). But per the docs, the fix path is fully manual: admin notices, re-records, re-publishes. Data flows up; nothing flows back down automatically.

**Action items (keep the human in the loop):**

1. **Build the aggregation view first** (conxa-cloud backend):
   - Dashboard page: "Skill X, step 4 has needed Tier 2 recovery in 80% of runs this week"
   - Show the winning remedy: "always healed by a11y name 'Save changes'"
   - Compute: mean recovery tier, most-common remedy, trend (improving/worsening)

2. **Generate actionable alerts:**
   - "Step 4 flipped from L1 to L2 recovery starting yesterday—check if the app redesigned"
   - "Assertion 'text_present' on step 6 is now advisory (never required)—consider removing it"

3. **Offer suggested fixes without auto-patching:**
   - "To fix step 4: re-record and re-publish, or manually inject selector `button.save-btn` via 1-click fix"
   - Per your security model, don't auto-patch signed packs
   - But auto-detect and auto-describe the drift with the suggested fix attached

**Success metric:** A week of slow assertion decay becomes visible in a same-day alert, actionable in five minutes.

---

## Priority 6: Add Chaos Testing for the Recovery Cascade

**The problem:**  
The recovery ladder (overlay dismiss, animation wait, re-hover, fallback selectors, etc.) is built reactively—each remedy was presumably added after a real failure. There's no proactive testing of which real-world changes the cascade genuinely survives.

**Action items:**

1. **Build a chaos harness** (runtime/test/chaos/):
   - Takes a working skill replay and recording
   - Deliberately mutates the page:
     - Inject a cookie banner overlay
     - Delay an element's render by 2 seconds
     - Rename a CSS class the selector depends on
     - Wrap the target element in a new parent div
     - Swap or remove a data-testid
     - Hide an element but keep it in the DOM (display: none)
   - Run the replay against each mutation
   - Assert: the cascade heals it at the expected tier (L1 for stable issues, L2 for detection issues)

2. **Expand coverage over time:**
   - Add mutations discovered in production failures
   - Track: "X of Y mutation classes are survived at expected tier"

3. **Use as a marketing number:**
   - "Conxa recovers from X common UI changes automatically—see the chaos report"
   - Differentiator: "survives intentional redesigns; competitors don't"

**Success metric:** You know *before* a customer encounters a failure whether your recovery handles it.

---

## ~~Priority 7: Two Code-Level Fixes~~ — Done (2026-07-09)

Both fixed as described, with one refinement to 7b: rather than a substring heuristic
(`msg.includes("navigation")`), added a real `CLASS.TIMEOUT_NAVIGATION` /
`CLASS.TIMEOUT_ELEMENT` split in `recovery.js` with a dedicated `wait-navigation` remedy
branch in `run.js::layer1Ladder` (`page.waitForLoadState("domcontentloaded", ...)`).
7a reuses the same stale/detach regex `classifyException` already uses (exported as
`STALE_RE`) rather than a second copy.

## Priority 7 (original write-up, kept for context): Two Code-Level Fixes

### 7a: Gate's Disabled-Check Silently Swallows Errors

**Location:** `run.js::gateLocator` (lines 252–258)

**The problem:**
```javascript
try {
  const disabled = await loc.evaluate(el => 
    el.disabled === true || el.getAttribute("aria-disabled") === "true");
  if (disabled) throw new Error("Element is disabled");
} catch (err) {
  if (err && /disabled/i.test(String(err.message))) throw err;
  // silence all other errors
}
```

If the element detaches at that exact moment, the `evaluate` throws a detach error. The catch filters on message text and silently eats it. The action then proceeds against a stale element—the exact thing the gate exists to prevent.

**Fix:**
```javascript
catch (err) {
  if (err && /disabled/i.test(String(err.message))) throw err;
  if (err && /detach|not attach|stale/.test(String(err.message))) throw err; // let detaches escape
}
```

### 7b: Timeout Classification Is Guesswork

**Location:** `recovery.js::classifyException` (lines 22–35)

**The problem:**
```javascript
if (/timeout.*exceeded|waiting for/.test(msg)) return CLASS.STALE; // most timeouts → re-resolve
```

Every timeout maps to "stale element → re-resolve". Timeouts are the most common failure and the most varied:
- Slow network or server (action → wait longer)
- Element never appeared (action → fall through to Tier 2)
- Page hung (action → fail hard)

Re-resolving against a page that's still loading is often wasted effort. Distinguish:

**Fix:** Split the timeout class:
```javascript
const CLASS = {
  STALE: "stale",
  TIMEOUT_PAGE_LOADING: "timeout-loading",  // page still loading → wait
  TIMEOUT_ELEMENT: "timeout-element",        // element never appeared → tier 2
  // ... rest unchanged
};

function classifyException(err) {
  // ... existing checks ...
  if (/timeout.*exceeded|waiting for/.test(msg)) {
    // Heuristic: if the page is still loading, it's a page-load timeout
    // Otherwise assume the element never appeared
    return msg.includes("navigation") || msg.includes("loading") 
      ? CLASS.TIMEOUT_PAGE_LOADING 
      : CLASS.TIMEOUT_ELEMENT;
  }
  return CLASS.UNKNOWN;
}

function remedyFor(klass) {
  switch (klass) {
    // ... existing ...
    case CLASS.TIMEOUT_PAGE_LOADING: return "wait-loading";
    case CLASS.TIMEOUT_ELEMENT: return "descend-layer2"; // skip re-resolve, go to L2
  }
}
```

Then in `run.js::layer1Ladder`, handle `wait-loading` with a longer wait, and `timeout-element` by skipping to L2. This avoids burning a re-resolve cycle on an element that will never exist.

---

## One-Line Summary

Your architecture's skeleton is right and I wouldn't change it. All seven suggestions are the same idea in different clothes: **you built a system that generates rich evidence about itself—now make that evidence do work** instead of relying on hand-tuned numbers and manual attention.

**Priority order:**
1. **Urgent:** Re-enable the CI execution gate
2. **Strategic:** Build the resolver zoo (#2), fix fingerprints at source (#3)
3. **Operational:** Close the telemetry loop (#5)
4. **Quality:** Chaos testing (#6), the two code fixes (#7)
5. **Low-hanging fruit:** Assertion coverage metric (#4)

