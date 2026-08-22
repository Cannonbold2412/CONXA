# The 4-Tier Recovery Cascade — Explained Simply

> This is a plain-language companion to `docs/TRD.md` §10.1 (the authoritative tier table).
> If this doc and the TRD ever disagree, the TRD wins.

---

## What is "recovery"?

When the Conxa runtime runs a skill (a recorded workflow), every step has to **find its target
element** on a live web page — a button, an input, a link. But websites change: buttons move,
popups appear, pages load slowly, elements get renamed.

**Recovery** is what the runtime does when it *can't find* or *can't act on* an element the
normal way. Instead of failing immediately, it climbs a ladder of increasingly smart rescue
attempts — called **tiers**.

The golden rule of the ladder:

> **Try the cheapest fix first. Only spend money (LLM tokens) when free fixes are exhausted.**

Tiers 1 and 2 are **free and instant** (plain code running locally). Tiers 3 and 4 involve
**Claude itself** (the AI agent driving the runtime) and cost real tokens + time.

---

## Quick comparison table

| | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| **What it is** | Exception ladder | Smart re-derivation | Semantic (text) recovery | Vision (screenshot) recovery |
| **How it works** | Reads the error message, applies one targeted fix | Tries alternative ways to find/act on the element | Sends intent + list of live page elements → Claude figures out the right one | Sends screenshots → Claude visually finds the element |
| **Runs where** | In-process (`run.js`) | In-process (`run.js` + `recovery.js`) | Agent-mediated (Claude) | Agent-mediated (Claude) |
| **LLM tokens** | Zero | Zero | Yes (~1,400–1,850) | Yes (~1,450–1,700) |
| **Time cost** | Milliseconds–seconds | ~seconds | ~5–8s agent reasoning | Bundled with T3 |
| **Triggered when** | Always first | T1 failed | T2 failed | T3 insufficient |

> **Note:** In today's code, T3 and T4 are not separate escalations from each other — they fire
> as **one combined payload**: Claude receives the semantic block (T3) *and* the screenshot
> block (T4) in a single structured recovery request. They're conceptually two signals, but
> priced and timed together (~2,500–3,500 tokens combined).

---

## Tier 1 — The Exception Ladder ("read the error, apply the obvious fix")

### Easy version

When a step fails, Playwright throws an error. That error message is surprisingly honest — it
usually says exactly *why* it failed. Tier 1 reads that message and applies **one targeted fix**:

| Error says... | Meaning | Tier 1 remedy |
|---|---|---|
| "element is detached" / "stale" | The element was removed from the page between finding it and clicking it (the page re-rendered) | **Re-resolve** — find it again fresh |
| "...intercepts pointer events" | A cookie banner / popup / overlay is sitting on top of the button | **Dismiss-overlay** — press Escape, then retry |
| "outside of the viewport" | The element exists but is off-screen | **Scroll-into-view**, then retry |
| "not stable" / "still animating" | The button is mid-animation (sliding/fading) | **Wait-stable** until it stops moving |
| "disabled" / "not enabled" | The button is disabled (e.g. form still validating) | **Wait-enabled** until it becomes clickable |
| "timeout while navigating" | Page was still loading | **Wait-navigation**, retry |
| Plain timeout, element never appeared | The element genuinely isn't there | Don't waste time re-waiting — skip straight down to Tier 2 |
| Verification failed (action ran, but the expected outcome didn't happen) | Re-clicking won't help — the DOM already proved wrong | Skip straight down to Tier 2 |

### Technical bits

- Lives in `runtime/recovery.js` (`classifyException` → `remedyFor`) with the ladder executed by `run.js`.
- Each error message is matched against regex patterns (e.g. `STALE_RE = /detached|not attached|stale/`) to classify it.
- After the remedy, the primary selector is retried **once**.
- Every successful repair emits a `repair_event` telemetry record (tier, method, score, stable_hash, drift hint) so the cloud dashboard can see which steps are fragile fleet-wide.

### Example

You recorded "click Submit", but at execution time a cookie banner appeared first. Playwright
throws *"…<div class="cookie-banner"> intercepts pointer events…"*. Tier 1 sees "intercepts",
presses Escape to dismiss the banner, retries the click — done in under a second, zero cost.

---

## Tier 2 — Smart Re-Derivation ("try finding it a different way")

### Easy version

Tier 1 fixes *mechanical* problems. Tier 2 handles the case where **finding the element the
recorded way just doesn't work anymore** — so it tries *other ways to find it*, using backup
identity information saved at compile time:

1. **A11y re-probe** — search by accessibility role + name instead of the primary selector
   (e.g. `getByRole("button", { name: "Submit order" })`).
2. **Re-hover** — if the element lives inside a menu that only appears on hover (dropdowns,
   flyouts), hover the parent chain again to reveal it, then retry.
3. **Fallback selectors** — try the alternative selectors stored in the skill's `recovery.json`
   (`selector_context.alternatives`).
4. **Dialog scope** — if the step expects a dialog/modal, first search *only inside*
   `[role="dialog"]`, `[role="alertdialog"]`, `.modal`, etc. — so it doesn't grab a
   same-looking element elsewhere on the page. If nothing matches there, expand to the full page.
5. **Fuzzy text** — looser text matching as a last in-process resort.

Like Tier 1, all of this is deterministic local code — **no LLM, no tokens**.

### Important safety rule

If the step has a **required assertion** (a compiled check like "URL must change" or "this text
must appear"), any Tier 1/2 remedy that re-runs the action must **re-verify** the assertion
afterwards. A "recovered" action that doesn't actually produce the expected outcome still fails
the step. Recovery never silently pretends success.

### Example

The site renamed its button from "Buy Now" to "Purchase". The primary text selector fails.
Tier 2's a11y re-probe finds it via `role=button` + aria-label, or a fallback selector from
`recovery.json`. Step completes — still free, still fast.

---

## Tier 3 — Semantic Recovery ("here's my goal — you pick the right element")

### Easy version

Both free tiers failed. Now the runtime gives up trying to figure it out alone and asks for
help — from **Claude, which is already driving the runtime via MCP**. It sends:

- **The step's intent** — a human-language description of what this step is supposed to do
  (e.g. "enter the customer's email address").
- **The expected post-condition** — what should be true afterwards (compiled assertions; if the
  failure was a verify-fail, *which* assertion failed).
- **A trace of already-executed steps** — context about where we are in the workflow.
- **A live inventory of every interactive element currently on the page** — buttons, links,
  inputs, with their roles/names/texts.

Claude reasons over this: *"This step wants to fill an email field. Looking at the live page
inventory, the matching element is `<input name='cust_email'>`"* — and calls `execute_skill`
again with a corrected selector via `step_overrides`.

### Technical bits

- The inventory is captured **live, after** T1/T2 have run — because those remedies (dismissing
  overlays, scrolling) can themselves change the page. An older pre-cascade snapshot is included
  only if it differs, clearly labeled as secondary.
- Cost: ~800–2,000 tokens for the DOM inventory + ~150–300 for Claude's fix response
  ≈ **~1,625 tokens typical** (if it ever fired alone).
- The corrected selector is **validated before use** (`run.js:validateOverrideSelector`): unique
  match → accepted; multi-match → scored like normal resolution and only accepted if a clear
  winner clears the uniqueness margin; no match or ambiguous tie → rejected, and Claude gets a
  fresh report of what actually matched so it can iterate. The runtime **never** falls back to
  blindly taking `.first()`.

---

## Tier 4 — Vision Recovery ("just look at the picture")

### Easy version

Text descriptions aren't enough — maybe the page uses canvas, unusual widgets, or the semantic
inventory can't disambiguate. Tier 4 adds **screenshots**: a capture of the failed page right
now, plus the recording-time reference image, and lets Claude **look** at them and identify the
element visually — the way a human would.

### Technical bits

- Cost: ~1,300–1,400 tokens for the screenshot (Claude's image-token formula) + fix response
  ≈ **~1,575 tokens typical** (if it ever fired alone).
- In practice T3+T4 ship together in **one combined request** (~3,000 tokens combined), so
  Claude gets both the element list *and* the pictures in one shot, and produces one fix.
- The payload explicitly tells Claude: *"the current screenshot/inventory are ground truth;
  the recording-time reference image may be outdated"* — so it trusts the live page over stale
  visuals.
- While waiting for Claude to reason, the runtime **parks the live browser page** (with a
  fingerprint of URL + element count + body-text hash, and a ~180s TTL). When Claude's fix comes
  back, the fingerprint is re-checked — if the page navigated away or changed materially, the
  park is discarded and the override refused rather than acting on state nobody reasoned about.

### Example

The site replaced a native `<select>` dropdown with a custom-styled widget built from divs.
No selector, role, or text signal matches cleanly. The combined T3/T4 payload goes out:
Claude sees the intent ("choose shipping country"), scans the interactive-element list, looks at
the screenshot, identifies the custom widget, and replies with a working selector. Runtime
validates it, resumes from the parked page, and continues the workflow.

---

## The full flow, end to end

```
Step fails
   │
   ├─ Is it a login redirect? ──► YES: short-circuit! No cascade.
   │                                    Ask the user to sign in, then resume.
   │
   ▼
TIER 1 — exception ladder (free, instant)
   │  re-resolve / dismiss-overlay / scroll / wait-stable / wait-enabled
   │  fixed? ► continue ✅
   ▼
TIER 2 — a11y probe / re-hover / fallbacks / dialog-scope / fuzzy (free)
   │  fixed? ► continue ✅
   ▼
Ceiling check (CONXA_MAX_RECOVERY_TIER, default 4)
   │  ceiling = 2? (Build Studio sandbox test mode)
   │    ► fail deterministically — a Studio test must judge the pack on its own merits
   ▼
TIER 3 + TIER 4 combined — one structured request to Claude (~3,000 tokens, +10–15s)
   │  intent + post-condition + live DOM inventory + screenshots
   │  Claude replies with step_overrides → validated → resume from parked page
   │  fixed? ► continue ✅
   ▼
Retry budget exhausted (3 attempts per step)?
   ► Step fails. Run reports failure with full diagnostics.
```

### Two extra rules worth knowing

- **Auth failures never enter the cascade.** A login redirect isn't something T1/T2 can fix, and
  burning their budget against a login page would be pointless — the runtime detects it and asks
  the user to sign in instead.
- **Some steps never get recovered at all.** `frame_enter`/`frame_exit`, tab markers
  (`tab_open`, `tab_switch`, `popup`), and best-effort types (`if_present`, `try_dismiss`,
  `wait_for_one_of`) carry `no_recovery_block` — they're structural markers or optional probes,
  not interactable elements, so retrying them makes no sense.

---

## Why tiers 1–2 being free matters

Per the invariant: **Tier 1/2 recovery costs zero LLM tokens. LLM fires only at Tier 3+.**

- Most healthy steps resolve (or self-heal) within T1/T2 — invisible to the user's token budget.
- Each T3/T4 occurrence costs the **customer's own Claude usage** ~3,000 tokens plus ~10–15
  seconds. It also consumes one of their Claude session messages.
- This is why compile-time quality (strong IdentityBundle signals, good anchors, rich
  `recovery.json` alternatives) is the main lever: better compile = fewer steps ever reaching
  Tier 3+.

---

## One-page cheat sheet

- **Tier 1:** "Something mechanical got in the way — read the error, do the obvious fix."
  Free. Always tried first.
- **Tier 2:** "The element can't be found the recorded way — try the backups."
  Free. a11y, hover-reveal, fallback selectors, dialog scoping, fuzzy text.
- **Tier 3:** "I give up guessing — Claude, here's my goal and everything on the page; pick the
  right element." Costs tokens. Agent-mediated.
- **Tier 4:** "And here are screenshots — look at the page like a human would."
  Costs vision tokens. Ships bundled with Tier 3 as one combined request.

There is no automatic Tier 5: after T4, remaining failures go back to whoever is watching
(human review), and any *durable* fix requires an admin-reviewed, manually published re-sign of
the skill pack — recovery telemetry never mutates the signed pack on disk.
