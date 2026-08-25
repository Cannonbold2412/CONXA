# Recovery-Attempt Side Effects — the state the cascade leaves behind

**The question this answers:** the cascade has four tiers, but after Tier 1 has already
*clicked something*, Tier 2 starts from a page Tier 1 changed. Tier 3 and Tier 4 inherit the
same problem, compounded. Nothing in the runtime accounts for this.

**Companion docs.** [`04-architecture/05-recovery.md`](../04-architecture/05-recovery.md)
specifies the cascade's *tiers* — what each one tries and in what order. It never addresses
the *state* each tier leaves behind for the next one.
[`04-architecture/08-failure-model.md`](../04-architecture/08-failure-model.md) §2–3 names the
right rule ("no guess on irreversible actions", "fail closed on danger") but that rule was never
implemented in the runtime. This document is the reliability-side analysis of the gap between
those two and the code, and the recommended architecture for closing it.

**Status:** analysis only. No code changed. Tracked as **EXEC-24** in [`TODO.md`](../../TODO.md).

---

## 1. The problem, stated from code

`runtime/app/cascade.js::recoverStep` (L230) runs a fixed sequence of stages against a failed
step. For a `click`, the stages are, in order:

| # | Stage | `cascade.js` | Dispatches an action? |
|---|---|---|---|
| 1 | L1 ladder — one classified remedy, then retry the primary selector | L171 | **Yes** (the retry). `dismiss-overlay` also clicks overlay buttons first |
| 2 | L2 a11y re-probe — synthetic role/text bundle through the matcher | L70 | **Yes** |
| 3 | L2 transient — 250 ms wait, retry primary | L249 | **Yes** |
| 4 | L2 re-hover — walk the recorded hover chain, retry primary | L255 | **Yes** (plus mouse moves) |
| 5 | L2 fallback selectors — loop over **every** `fallbackSelectors(step)` entry | L105 | **Yes, once per selector** |
| 6 | L2 dialog scope — 4 container-prefixed variants of the primary selector | L118 | **Yes, up to 4×** |
| 7 | L2 fuzzy text — `tag >> nth=N` from a substring match | L133 | **Yes** |

`fallbackSelectors` (`locators.js`) unions `candidates`, `fallback_selectors`,
`fallback_text_variants`, text selectors derived from `value`/`label`/`aria_label`, and every
anchor's text. On a normal compiled step that is commonly 3–6 entries. So **one failed click can
dispatch roughly ten real input events**, against seven different resolution strategies, with
**no check between any two of them** for whether the page still resembles what the previous
stage found.

Two more dispatch sites sit outside `withLocator` entirely and are therefore invisible to any
element-level accounting: `handlers.js::keyboard_shortcut` (L232, `page.keyboard.press`) and
`handlers.js::try_dismiss` (L322, whose per-candidate `.first().click()` at L332 bypasses the seam). And
`dismiss_patterns.js::dismissKnownOverlay` (L60) clicks **every** matching candidate by design,
not just the first — deliberate and correct for consent stacks, but it is still N unaccounted
clicks before the L1 retry even begins.

### The only existing guard, and why it is not enough

`recoverWithSelector` (L38) re-runs the post-condition after a recovery action and refuses to
report success if it fails. Two limits:

- It fires **only when `hasRequiredAssertion(step)`** is true. A step with advisory-only
  assertions, or none at all — which is most steps — gets no check.
- It is **detection after the action, not prevention before it**. When it returns `false`, the
  action has already happened. The cascade then proceeds to the next stage and does it again.

### Three concrete failure modes

**A. Double-execution.** A `click Submit` succeeds mechanically; its post-condition is merely
slow to appear. `verifyStep` fails, `recoverWithSelector` returns `false`, stage 3 (transient)
waits 250 ms and clicks the same selector again. Two submissions. The polling in `assertions.js`
(`pollPositive`, 3 s default) narrows this window but does not close it — any post-condition
slower than its own timeout lands here.

**B. Compounding wrong-target.** Stage 7's matcher accepts a *bidirectional* substring hit
(`text === needle || text.includes(needle) || needle.includes(text)`, L153) and then acts on
`tag >> nth=N` — a positional index, not an identity. A short recorded label makes
`needle.includes(text)` match almost anything. The click lands on a different control; the page
opens a dialog; the run either fails leaving the app in a state no later step or `resume_from`
expects, or a subsequent stage acts *inside* that dialog.

**C. Stale reasoning at the agent tiers.** Every stage after the first uses the pre-cascade
`primarySelector` and the `earlyDomSnapshot` captured at L248 of `run.js` — taken at the moment
of the *original* failure. By the time the Tier 3 digest is built, seven stages have mutated the
page, but the failure reason handed to the agent is still the original exception. The agent
reasons about a page that no longer exists, or about a page whose current state has an
explanation nobody told it.

**This is orthogonal to selector quality.** A cascade whose every selector resolves perfectly
still has all three problems, because the problem is not *which* element each stage finds — it
is that each stage assumes a page the previous stage already changed.

---

## 2. Why "undo" is the wrong frame

There is no transaction boundary on the web. A dispatched click may have written to a database,
sent an email, charged a card, or done nothing at all, and the local runtime cannot tell which.
Compensating actions exist for *some* flows (cancel a draft invoice) but they are per-workflow
authoring, not a runtime primitive — that is PROD-3's "compensation flows" layer, and it is a
product feature, not a fix for this.

Every system that handles this well handles it the same way: **it does not create the ambiguity
in the first place.** The design question is therefore not "how do we reverse an attempt" but
"how do we know, cheaply and locally, whether an attempt already took effect — before we make
another one."

---

## 3. How the field handles it

Three genuinely distinct strategies. Each has a cost, and the cost is what decides which parts
Conxa can adopt.

### Playwright / SeleniumBase — retries are *pre-action*

`locator.click()` auto-waits for the element to be attached, visible, stable, enabled, and
hit-testable, and then dispatches **once**. "Retry" in this model means *keep waiting for the
preconditions*, never *click again*. The retry loop is entirely upstream of the side effect, so
a retry cannot double-execute by construction. SeleniumBase adds exception-classified remedies
on top (see [`per-tool/seleniumbase.md`](per-tool/seleniumbase.md),
[`per-tool/playwright.md`](per-tool/playwright.md)) but keeps the same discipline.

Conxa's L1 ladder already has this shape — apply one remedy, retry once — and `withLocator`'s
PRIMARY loop (L28–44 of `locators.js`) is a genuine pre-action retry: it re-resolves and
re-gates inside the action budget without ever acting twice. **The discipline breaks at L2 and
below**, where each stage is a fresh post-action attempt.

### browser-use — no cascade; re-perceive every time

browser-use has no recovery ladder at all. Every step is: re-perceive the page → serialize to an
indexed AX+DOM representation → LLM re-grounds and emits one action → execute → observe again
(see [`per-tool/browser-use.md`](per-tool/browser-use.md)). A page mutated by the last attempt is
not a problem, because nothing carries an assumption across attempts — the mutated page is simply
the next observation. Its page-fingerprint stall detector (`url` + interactive-element count +
DOM-text hash) exists to break loops when the page *stops* moving.

Cost: an LLM call per attempt. **Not adoptable as a general mechanism** — the zero-token
deterministic band is the entire product differentiator. But the *evidence* it uses is free: the
page fingerprint is cheap DOM arithmetic, and Conxa already ships exactly that computation in
`recovery_park.js::capturePageFingerprint` and `assertions.js::capturePreStepSignature`.

### Claude computer use / Claude in Chrome — observe-then-act, visually

The same observe→act→observe loop, screenshot-based rather than DOM-based. The model literally
*sees* what its previous attempt did before choosing the next one, which is why a CUA loop rarely
double-submits: the second screenshot shows the confirmation page. Same cost profile as
browser-use — a model call per attempt, and a more expensive one. See
[`per-tool/vision-cua.md`](per-tool/vision-cua.md).

### The synthesis

Conxa cannot buy safety with per-attempt re-perception without giving up the thing that makes it
sellable. What it needs is the **deterministic equivalent of re-perception**: evidence that the
page did or did not move between attempts, gathered without tokens, and used to decide whether a
second dispatch is allowed. That evidence already exists in the codebase. It is simply never
consulted between cascade stages.

---

## 4. Recommended architecture

Five parts, in dependency order. Each names the code it builds on; none requires new machinery.

### P1 — Dispatch tracking (the foundation)

`withLocator` (`locators.js:22`) and `withLocatorPair` (L87) have a clean seam: everything before
`fn(locator)` is resolve → gate → wait, and `fn` *is* the action. An error thrown from inside
`fn` means the page was touched; an error thrown before it means it was not. Flagging that on the
error separates **"nothing happened"** from **"something happened and we don't know what"** —
the distinction the whole cascade currently lacks.

Two caveats to handle explicitly, both found in code:

- `keyboard_shortcut` (`handlers.js:232`) and `try_dismiss` (L322) dispatch **outside**
  `withLocator` and need their own flag; `dismissKnownOverlay` clicks N candidates by design.
- `clickFirst` (`locators.js`) already retries internally on pointer-intercept by clicking
  `locator.last()`. Both attempts are inside `fn`, so they are correctly counted as "dispatched",
  but it is a second real click that today nothing records.

### P2 — Re-verify *before* re-acting

When the previous attempt dispatched, run the step's post-condition **before** dispatching again.
If it now passes, the step already succeeded — report RECOVERED and do not act. This inverts
`recoverWithSelector`'s current order (act, then check) into (check, then act) for any attempt
that follows a dispatched one, and it closes failure mode **A** outright.

### P3 — Evidence when the step has no assertion

**Decision: page-signature delta.** Reuse `capturePreStepSignature`
(`assertions.js`, `{url, textLen, interactiveCount}`) — already captured on steps carrying a
`state_changed` assertion, and cheap enough to capture on every interactive step. After a
dispatched attempt, if the signature moved, treat the step as *may have already taken effect* and
refuse to blind re-dispatch.

Stated honestly, this heuristic fails both ways:

- **False positive** — an unrelated background change (a live counter, a lazy-loaded image
  shifting `interactiveCount`) reads as "the action worked", so a step that genuinely failed
  escalates instead of recovering locally. Cost: tokens, not damage.
- **False negative** — the action mutated only server state with no visible page change, so the
  runtime re-dispatches. Cost: real. See §6.

The tolerances already used elsewhere are the right starting point:
`STATE_CHANGED_TEXT_LEN_TOLERANCE` (20 chars, `assertions.js`) and
`PARK_DIVERGENCE_TOLERANCE` (3, `recovery_park.js`).

**Step-type refinement — the cheap way to bound the blast radius.** Only non-idempotent step
types need this guard at all:

| Guard needed | Step types |
|---|---|
| **Yes** — re-dispatch can duplicate an effect | `click`, `dblclick`, `right_click`, `keyboard_shortcut`, `upload`, `drag_drop`, `set_checkbox`/`set_radio` (toggles) |
| **No** — re-dispatch is idempotent | `fill`, `type`, `select`, `select_option`, `focus`, `hover`, `scroll`, `date_pick` |

Applying the guard only to the first group keeps today's aggressive recovery for the majority of
steps, where it is free, and spends the caution where it matters.

### P4 — State-change gate between stages

Capture a page fingerprint before the cascade starts (`recovery_park.js::capturePageFingerprint`
— already written, already used to detect a parked page drifting under the agent) and re-check it
at each existing `bail()` point in `recoverStep` (L245, L248, L256, L263, L265, L267). Once the
page has moved beyond tolerance, **stop the deterministic ladder**. Every remaining stage was
built on assumptions — the primary selector, the early DOM snapshot, the recorded anchors — that
the page has now invalidated.

Note the reuse: this is the same divergence check EXEC-13's AI Review step is specified to use for
"the page changed while Claude was reasoning". One mechanism, three consumers.

### P5 — Consequential-step policy

`step.destructive` is **compiled, shipped in every pack, and read by nothing in the runtime**:
declared at `packages/conxa-core/conxa_core/models/skill_spec.py:155` (marked `[contract]`), set
at `conxa_compile/compiler/build.py:641` from the recorder's destructive-intent detection
(`compiler/destructive_semantics.py`), and there are **zero** matches for `destructive` anywhere
under `runtime/` outside vendored SDK code.

Wiring it in gives the failure model's own asymmetry rule
([`08-failure-model.md`](../04-architecture/08-failure-model.md) §2) its first implementation: a
destructive step gets **at most one dispatched action** in the whole cascade — the L1 ladder's
non-acting remedies (scroll, wait, overlay dismissal) plus one verified retry — and never reaches
the fallback-selector loop, the dialog-scope sweep, or fuzzy text. "Find something close" is
exactly the wrong behaviour on a Delete button.

This is the **runtime half** of [`TODO.md`](../../TODO.md) **PROD-3**, which owns the
product-level system around it (danger labelling at record time, entity binding so recovery cannot
substitute the wrong row, dry-run, Strict Mode, compensation flows). P5 is not a competing
proposal — it is the smallest piece of PROD-3 that can ship independently, and PROD-3's
entity-binding layer is what eventually makes even the *one* permitted retry safe.

---

## 5. What happens when the guard blocks a dispatch

**Decision: escalate to the agent tier.** Stop the deterministic cascade and build the Tier 3
failure response against the **current, mutated page**, with a failure reason that says an earlier
recovery attempt may have already taken effect. The agent then reasons about real state instead of
the runtime guessing further, and — critically — it is told *why* the page looks unexpected, which
is information the runtime has and currently throws away.

Two interactions to preserve:

- **`recovery_stage.js` stagnation cap.** It refuses further paid rounds when the page fingerprint
  is unchanged across consecutive rounds. A page that *did* move is precisely the case it lets
  through, so the two mechanisms compose: P4 escalates on movement, the stagnation cap stops
  escalation on stillness. Neither fires where the other does.
- **Destructive steps fail closed instead.** Under P5, a blocked dispatch on a destructive step
  should not escalate to an agent that might act — it should fail with the ambiguity described,
  per the failure model's F-PERM/irreversible rule.

---

## 6. What this does not fix

- **Invisible server-state mutation.** An action that writes server-side with no observable page
  change is undetectable by any local signal — DOM, screenshot, or fingerprint. This is the
  irreducible residual, and the honest answer to it is P5 (do not retry consequential steps) plus
  PROD-3's compensation flows, not better detection.
- **Cross-tab and cross-window effects.** The fingerprint is per-page. An action that opens or
  mutates another tab is not captured.
- **Effects committed before the failure was observed.** If the original action succeeded
  server-side and the *page* then failed, the run's first observation is already after the fact.
- **The recorder side.** None of this makes a badly-recorded destructive step safe; it only stops
  the runtime from compounding it.

---

## 7. Sizing and suggested order

| Part | Touches | Complexity | Ships independently? |
|---|---|---|---|
| **P1** dispatch tracking | `locators.js`, `handlers.js` (2 direct-dispatch handlers) | **S** | Yes — inert until a consumer exists |
| **P2** re-verify before re-act | `cascade.js::recoverWithSelector`, `layer1Ladder` | **S** | Yes, needs P1 |
| **P3** page-signature evidence | `cascade.js`, `assertions.js` (widen capture), step-type table | **M** | Yes, needs P1 |
| **P4** state-change gate | `cascade.js::recoverStep` bail points | **S** | Yes, needs P1 |
| **P5** destructive policy | `cascade.js`, `failure_response.js`; reads existing pack field | **M** | Yes — but coordinate with PROD-3 |

**P1 + P2 are the whole double-execution fix** and are a small, self-contained diff in two files
with no change to step semantics or the pack contract. P3 and P4 add the evidence layer that makes
the guard apply to unasserted steps. P5 changes what recovery is *allowed* to attempt and should be
designed alongside PROD-3 rather than ahead of it.

Every part is zero-token and stays inside the deterministic band — none of them introduces an LLM
call into the hot path, and P4/P5 *reduce* paid escalations in the cases where the ladder was
previously thrashing against a page it had already broken.

---

## 8. Net

The cascade was designed as a sequence of *resolution strategies* and is correct as one. It was
never designed as a sequence of *actions*, which is what it actually is. The fix is not to make
the strategies smarter — it is to make the runtime notice, between them, that it has already
touched the page. The evidence needed is cheap, already computed elsewhere in this codebase, and
never consulted.
