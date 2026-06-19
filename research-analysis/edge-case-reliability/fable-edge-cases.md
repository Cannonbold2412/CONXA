# Fable / Host-Vision-Agent Edge-Case Analysis (Phase 2)

> **GROUNDING — NO "FABLE" REPO EXISTS.** There is no `Fable` repository in the research corpus.
> `/tmp/research-corpus/repos/` contains only: `playwright-main`, `playwright-mcp-main`, `stagehand-main`,
> `browser-use-main`, `SeleniumBase-master`, `UI-TARS-desktop-main`. This document does **not** analyze a repo.
> It analyzes a **CLASS**: the **frontier computer-use / host-vision-agent paradigm** — the Claude Computer Use
> style multimodal agent that **re-perceives the whole screen and reasons from pixels (+ optionally AX/DOM text)
> every step**. This is the class Conxa's recovery *already delegates to*: `server.js` returns screenshots + a
> DOM digest to the host model over MCP today, and the future Tier-3/4 reaches the host model via **MCP sampling**
> (`future-recovery-architecture.md`, `future-vision-architecture.md`). UI-TARS is the closest concrete instance
> in the corpus and is cross-referenced where useful — but the UI-TARS-specific analysis lives in
> `high-value-repo-review.md §6` and is **not duplicated here**.

---

## 0. The defining property — and why it is both the strength and the fatal weakness

The host-vision/CUA class handles edge cases by a single, uniform mechanism: **at every step it re-perceives the
entire screen and re-reasons from pixels.** It does not query a DOM tree, walk a frame chain, or pierce a shadow
root. It looks. Because pixels do not care about DOM structure, this gives the class **one universal handler for
every edge case at once** — iframes, nested iframes, cross-origin iframes, open *and closed* shadow DOM, canvas,
WebGL, captcha screens, dynamic UI, hover-revealed menus, virtualized rows — all collapse into "a thing visible on
the screen." There is no per-family code path; perception is the path.

That universality is the trap. The same property that makes it handle everything makes it:

- **Non-deterministic** — same input, different trajectory; no replay guarantee (disqualifying for enterprise SLA, `high-value-paper-review.md §4`).
- **Expensive** — every step pays full VLM cost; nothing transfers between runs (`high-value-repo-review.md §6`, "inference-only cannot scale").
- **Slow** — a screenshot + a model round-trip per step, where a compiled selector is sub-millisecond.
- **Unauditable** — "it clicked there because the model decided to" is not a reviewable artifact.
- **Brittle at DPI/scale** — coordinate output is fragile across `devicePixelRatio`, zoom, responsive breakpoints (`high-value-paper-review.md §4`, coordinate-only identity).
- **Hallucination-prone** — model-asserted completion produces confident-wrong "successes" (SeeAct: ~30% fabricated completions).

**This is the exact opposite of Conxa's philosophy** (record→compile→replay; zero-LLM hot path). The class must
**never be the hot path.** Its legitimate role in Conxa is the narrow recovery edge where the deterministic DOM
methods *genuinely cannot work* — and nowhere else.

---

## 1. Family 1 — Identity drift (EC-09/10/11/12/44, EC-04/04b)

**Detection.** The class doesn't "detect drift" as a discrete event; it re-grounds from scratch each step, so a
re-rendered/renamed/re-IDed element is simply re-perceived as whatever is now on screen.
**Representation.** Pixels + optional AX-text digest; no element identity, no fingerprint, no uniqueness margin.
**Resolution.** Visual match of the described target to the current screen, emitting a coordinate (or, in
describe-then-match variants, a described target resolved against AX text — see EC-28 below).
**Recovery.** Re-perceive and retry; no concept of "the recorded target" to heal *toward*.
**Reliability.** Poor as a primary strategy for ordinary DOM drift — it discards the strongest available signal
(the recorded multi-signal fingerprint) and substitutes a fresh guess that can confidently land on the wrong
twin element. No uniqueness gate, no scoring.

**Conxa applicability — mostly WRONG TOOL.** For the high-frequency drift cases (EC-09 SPA re-render, EC-12
dynamic IDs, EC-10 text changes, EC-44 A/B variants), the deterministic repos are **strictly better**:
Playwright's late-bound locators + auto-wait and SeleniumBase's exception-classified retry resolve these at
**zero LLM cost, deterministically, auditably**. Conxa's own T1 (live multi-signal fingerprint scoring) and T2
(AX role+name re-resolution) cover this family. The host-vision class adds nothing here except cost and
non-determinism. The **one** legitimate sub-case is **EC-04b closed shadow roots** — handled under Family 4.

---

## 2. Family 2 — Timing & actionability (EC-05/06/07/08/31/32)

**Detection.** The class "sees" a spinner, an overlay, or a moving element as pixels and may *reason* that it
should wait — but it has no actionability primitive (no "element is stable for 2 frames," no "pointer-intercepted"
signal). It infers timing from appearance, which is exactly the wrong instrument.
**Representation.** Screen snapshots over time; no DOM event, no `networkidle`, no `aria-disabled`.
**Resolution.** Wait-and-look-again, gated by model judgment.
**Recovery.** Re-screenshot until the screen "looks ready."
**Reliability.** Weak and wasteful. A skeleton screen and a loaded screen can look similar; a disabled button and
an enabled one differ by a CSS attribute the model can't read from pixels. This is the SeleniumBase lesson
inverted: timing is the dominant real-world failure class and it is **a DOM-signal problem, not a perception problem**.

**Conxa applicability — WRONG TOOL, decisively.** Playwright's actionability checks (visible, stable, enabled,
receives-events) and SeleniumBase's wait ladder solve this family deterministically and are **strictly superior**.
There is no edge case in this family where re-perceiving pixels beats reading the DOM's own readiness signals.
The host-vision class should never be invoked for Family 2.

---

## 3. Family 3 — Stochastic interruption (EC-19/20/21/22/45/41/35)

This is the family where the class earns a **narrow, real** role — not for *resolving* the interruption, but for
**RECOGNIZING the state and escalating**.

### EC-35 Captcha, EC-21 MFA/2FA — detection + human handoff (CALL_USER)
**Detection.** The class is genuinely good at *recognizing* "this screen is a captcha" / "this is an MFA prompt"
from pixels + context, even when the DOM gives no clean signal (captcha widgets are often canvas/iframe/obfuscated).
**Representation.** Screenshot + semantic judgment ("this looks like a challenge I cannot/should not solve").
**Resolution.** **Do not solve — escalate.** The correct behavior is the UI-TARS `CALL_USER` pattern: a
first-class pause-and-hand-to-human state.
**Recovery.** Hand to the user with a SoM-annotated screenshot; resume on signal.
**Reliability.** Good for *recognition and escalation*; deliberately **not** an automated solver (solving captcha
is out of scope and an enterprise liability).

**Conxa applicability — RIGHT TOOL, narrowly, for recognition only.** This maps to `future-recovery-architecture.md`
Stage 7 (Human Handoff) and Stage 6's **rule-triggered escalation** (UI-TARS `CALL_USER` generalized). The host
model's value is *recognizing* the state to escalate cleanly rather than thrashing. Critically, escalation must be
**rule-triggered (deterministic) first** — a step compiled as "MFA-bearing" should *always* escalate regardless of
what the model perceives — with model-recognition as a backstop, not the primary trigger. Never let the VLM
*decide* to solve a captcha; let it *recognize* one to hand off.

### EC-19 consent banners, EC-20 modals, EC-45 idle interstitials, EC-41 permission prompts
**Conxa applicability — WRONG TOOL.** These are **DOM-present, dismissible** states. The right answer is a
**compiled conditional** (`if_present`/`try_dismiss`, `future-recovery-architecture.md §4`) — deterministic
detect-and-dismiss of known stochastic patterns, promoted into the compiled package. Re-perceiving pixels to
click "Accept" is non-deterministic overkill for a state that has a queryable DOM identity. The host-vision class
should **not** own banner/modal dismissal.

### EC-22 session-expired / auth-redirect
**Conxa applicability — WRONG TOOL.** Conxa already has a deterministic **re-auth self-heal** (`future-recovery-architecture.md`
Stage 2, "Auth-failure"). Keep it. No perception needed.

---

## 4. Family 4 — Boundary traversal (EC-01/02/03/04/04b/43, EC-36)

This family contains the **two cases where the host-vision class is the ONLY option** — and a majority where it is
strictly worse.

### EC-01/02/03 iframes, EC-04 open shadow DOM, EC-43 hidden iframe — WRONG TOOL
These have **real, queryable DOM identity across a boundary.** Playwright `frameLocator`, CDP frame traversal, and
shadow-piercing resolution handle them deterministically (`iframe-architecture.md`, `shadow-dom-architecture.md`).
Conxa preserves the **iframe chain verbatim** as an invariant — the host-vision class, which flattens everything to
one screen, would *destroy* that invariant (it cannot tell you *which frame* it acted in, only *where on the screen*).
For everything with a frame/shadow identity, deterministic traversal is **strictly better**.

### EC-04b Closed shadow roots — RIGHT TOOL (legitimate Tier-4)
**Detection.** `attachShadow({mode:'closed'})` is **opaque to JS entirely** — `querySelector` cannot enter, no
handle exists. The element is *visible* but has **no DOM identity reachable from script.**
**Representation.** Pixels (+ whatever the AX tree exposes, which may be partial) are the *only* available surface.
**Resolution.** Vision/coordinate grounding within the recorded `expected_region`, then — per
`future-vision-architecture.md §3d` — **`elementFromPoint` hit-testing is shadow-piercing**, so even a closed root
can often yield an actionable node *at the resolved coordinate* and be re-derived into a selector.
**Recovery.** If hit-testing yields a node → re-derive a selector (durable); if truly opaque → SoM-annotated
coordinate action, flagged low-confidence, **always** outcome-checked.
**Reliability.** Acceptable as a **last resort** because there is no deterministic alternative — but bounded,
region-narrowed, and outcome-gated.

### EC-36 Canvas / WebGL — RIGHT TOOL (legitimate Tier-4)
**Detection.** `<canvas>`/WebGL paint to pixels; **there is no DOM inside.** Charts, signature pads, design tools,
spreadsheet grids painted to canvas. No DOM node corresponds to the visual target.
**Representation.** Pixels are the *only* representation; the AX digest of the region is near-empty by definition
(WebVoyager's SoM+AX-text dual-rep gives the grounder whatever weak hint exists).
**Resolution.** Region-narrowed vision grounding → **normalized** coordinates `(0..1)` → DPI-normalized
(`scaleFactor`) → coordinate action. Hit-testing usually yields only the `<canvas>` element itself, so a
**raw-coordinate action is genuinely necessary here** — the one place it is legitimate.
**Recovery.** SoM-annotated coordinate action, low-confidence, outcome-checked; on failure, escalate (never widen
to full-screen guessing).
**Reliability.** The honest floor of the system. Coordinate-on-canvas is brittle across DPI/scale (EC-39 is *live*
here) — which is exactly why it is walled off to <1% of executions and why the promoted fix is a refreshed
`bbox_css` + relational anchor, not a frozen pixel.

**Conxa applicability — RIGHT TOOL for EC-04b + EC-36 ONLY, as bounded Tier-4.** These are the cases where
"no DOM identity exists" is *literally true*, so vision/coordinate is not a shortcut — it is the only key that fits
the lock. This is precisely `future-vision-architecture.md §1` ("vision fires only when DOM/AX grounding is
**structurally impossible**, not merely hard"). Everything else in Family 4 has a DOM identity and belongs to
deterministic traversal.

---

## 5. Family 5 — Outcome ambiguity / hard re-grounding (EC-25/26/27/28/29/23/24)

**EC-28 (silent wrong-element match)** and the broader "deterministic identity is exhausted, but the page is
semantically right" situation are where the host model contributes a **Tier-3 semantic re-grounding** role.

**Detection.** Reached when T1 (fingerprint scoring) and T2 (AX role+name) have failed to resolve a unique target —
the DOM restructured enough that no signal survived, yet the *intent* ("click the row for invoice #4471") is still
satisfiable on screen.
**Representation.** Recorded intent + recorded fingerprint + a **pre-filtered AX digest (<500 nodes, WorkArena)** —
text-first, not pixels (`future-recovery-architecture.md` T3).
**Resolution.** **Describe-then-match (SeeAct):** the host model emits a *target description*, **NOT a selector** —
then a **deterministic matcher** resolves that description against the live AX tree. This is the correctness
decomposition that survives model improvement: generating a selector blind hallucinates (~30%); emitting a
description and resolving it deterministically does not (`high-value-paper-review.md §1`, §4).
**Recovery.** The matched node is re-derived into a multi-signal fingerprint, scored, and — crucially — its action
is **validated by an independent post-condition** (`future-recovery-architecture.md` Stage 4). Conxa's edge over
plain SeeAct: it matches against the **recorded target**, not a blank task.
**Reliability.** Good *as a bounded Tier-3*, **only because of the verification gate.** Without the independent
post-condition, this is just another hallucinated success — the field-wide blind spot
(`master-insights-v2.md` R1; shared by browser-use reflection and UI-TARS SoM, both of which record *belief*, not
*outcome*).

**The rest of Family 5 — WRONG TOOL.** EC-25 autocomplete, EC-26 custom dropdown, EC-27 date picker, EC-29
contenteditable, EC-23/24 file upload/download are **DOM-native interaction-protocol problems.** They are solved by
deterministic sequences (type→wait-for-options→select; open→wait→click-option) plus an **independent post-condition
verifier** — not by re-perceiving pixels. The host-vision class does not improve them; the *verifier* does. The
durable Family-5 lesson is **outcome verification, not vision** (`high-value-paper-review.md §1`, functional success
criteria).

---

## 6. Decision table — when the host-vision/CUA class is the RIGHT tool vs the WRONG tool

| Edge case | DOM identity reachable? | Deterministic method exists & is better? | Host-vision/CUA verdict | Tier |
|---|---|---|---|---|
| EC-09/10/11/12/44 identity drift | Yes (multi-signal fingerprint) | Yes — Playwright/SeleniumBase + T1/T2 | **WRONG** — strictly worse | T1/T2 |
| EC-05/06/07/08/31/32 timing | Yes (DOM readiness signals) | Yes — actionability gates | **WRONG** — perception is wrong instrument | T1 |
| EC-19/20/45/41 banners/modals | Yes (dismissible DOM) | Yes — compiled conditional | **WRONG** — overkill | compile-time |
| EC-22 session/auth | Yes (redirect signal) | Yes — re-auth self-heal | **WRONG** — already solved | T1 (Auth) |
| EC-35 captcha (RECOGNIZE) | No clean DOM signal | No — recognition is semantic | **RIGHT (recognize→escalate only)** | T5 / rule-trigger |
| EC-21 MFA (RECOGNIZE) | Partial | Rule-trigger first; model backstop | **RIGHT (recognize→escalate only)** | T5 / rule-trigger |
| EC-01/02/03/43 iframes | Yes (frame chain) | Yes — frameLocator/CDP | **WRONG** — would break iframe invariant | T1 |
| EC-04 open shadow DOM | Yes (pierceable) | Yes — shadow-piercing resolution | **WRONG** | T1 |
| **EC-04b closed shadow root** | **No (opaque to JS)** | **No** | **RIGHT — only option** | **T4** |
| **EC-36 canvas / WebGL** | **No (no DOM inside)** | **No** | **RIGHT — only option (raw coord legit here)** | **T4** |
| EC-28 hard re-grounding | Exhausted, page semantically right | T1/T2 first; then describe-then-match | **RIGHT (Tier-3 describe-then-match, verified)** | **T3** |
| EC-25/26/27/29/23/24 outcome | Yes (interaction protocol) | Yes — det. sequence + verifier | **WRONG** — verifier is the fix, not vision | T1 + verify |

**Reading of the table:** the host-vision/CUA class is the right tool in **exactly four narrow situations** —
recognize-captcha/MFA-to-escalate (T5), closed shadow roots (T4), canvas/WebGL (T4), and hard semantic re-grounding
when deterministic identity is exhausted (T3). In the **vast majority** of the inventory — all of Family 1's
high-frequency cases, all of Family 2, most of Family 3, most of Family 4, and most of Family 5 — the deterministic
repos (Playwright, SeleniumBase) and Conxa's own T1/T2 are **strictly better** on every axis that matters:
determinism, cost, speed, auditability. The class is a **recovery-edge instrument, never a hot-path one.**

---

## 7. Why "handles everything uniformly" is a liability, not a feature (for Conxa)

The pitch for the class is "one mechanism for all edge cases." For a research agent improvising on an unknown site,
that generality is attractive. For Conxa — which distributes a **signed, compiled, replayable** skill to a fleet —
it is a defect, because:

- **It can't tell you which frame/shadow/widget it acted in** — only where on screen. Conxa's iframe-chain and
  multi-signal identity invariants are *destroyed* by flattening to pixels.
- **It produces a coordinate, not a re-resolvable selector** — a one-shot, unauditable, DPI-fragile locator. Conxa's
  Tier-4 explicitly **re-derives a selector via hit-testing** and *prefers it*, precisely to avoid this
  (`future-vision-architecture.md §3`). A coordinate is not promotable to a package fix; a selector is.
- **It hallucinates success** — model-asserted completion (EC-28 amplified). Conxa's answer is the **independent
  post-condition** gating *every* recovered action, so "the model believes it worked" never counts as "it worked."
- **It learns nothing across runs** — every firing pays full cost with no transfer. Conxa's flywheel
  (`repair_event` → fleet corroboration → re-sign) is the structural advantage the entire single-trajectory
  literature misses (`high-value-paper-review.md §7`).

The class is therefore correctly positioned as a **walled-off last resort whose strategic value is the walling-off**,
not the capability (`future-vision-architecture.md §1`).

---

## 8. What Conxa should ADOPT from the host-vision/CUA class (and what to REJECT)

1. **ADOPT — recognize-to-escalate (CALL_USER) for captcha/MFA (EC-35/EC-21).** Use the host model's strength at
   *recognizing* unsolvable/sensitive states to drive a clean **Tier-5 handoff**, with **rule-triggered escalation
   first** (deterministic) and model-recognition as a backstop. **REJECT** letting the model *decide to solve* a
   captcha or *self-initiate* escalation as the primary trigger.

2. **ADOPT — vision/coordinate grounding for genuinely DOM-hostile surfaces (EC-04b closed shadow, EC-36
   canvas/WebGL).** This is the **only** legitimate Tier-4: where no DOM identity exists, region-narrowed grounding
   → normalize → hit-test → prefer re-derived selector → outcome-check. **REJECT** vision as a primary or hot-path
   locator; **REJECT** raw-pixel clicking anywhere a selector can be re-derived.

3. **ADOPT — describe-then-match (SeeAct) for hard re-grounding (EC-28).** Host model emits a *description*, a
   deterministic matcher resolves it against the AX tree, against the **recorded target**. **REJECT** asking the
   model to emit a selector directly (the ~30% hallucination path).

4. **ADOPT — Set-of-Marks as telemetry/drift signal only.** SoM-annotated captures for audit and for the
   `Δ(resolved_coord, compiled_bbox_anchor)` layout-drift sensor. **REJECT** SoM (or model reflection) as success
   evidence — it records intent, never outcome; outcome is owned by the independent post-condition.

5. **REJECT outright — per-step re-perception as the execution model.** Non-deterministic, unauditable, unbounded
   cost, no SLA, hallucinated completion, brittle at DPI/scale, no cross-run learning. This is the enterprise
   anti-pattern Conxa exists to replace. The class belongs at the recovery edges (T3 text, T4 vision, T5 handoff),
   gated, budgeted, fleet-alarmed to **< a few % of executions** — and **never** on the hot path.
