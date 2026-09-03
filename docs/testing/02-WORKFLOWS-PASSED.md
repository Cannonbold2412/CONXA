# ✅ Workflows Successfully Tested Manually

This file is the **hall of fame**: every workflow that has actually been recorded, compiled, and
replayed end-to-end by hand (or validated against a real browser) moves here from
[`01-WORKFLOWS-TO-TEST.md`](01-WORKFLOWS-TO-TEST.md). Each entry says **what the new pass proves**
about what Conxa can do today.

When a workflow in `01-WORKFLOWS-TO-TEST.md` passes manually:

1. Move its section here (condensed, with date + evidence pointer).
2. Add a line under "What this proves Conxa can do now".
3. Update the dashboard below.

---

## 📊 Dashboard — what Conxa can do on the internet right now

> Hand-maintained estimate of how many real-world internet workflows Conxa can currently
> record → compile → replay reliably, based only on passes in this file.
> **Bumped 22%→23% (2026-09-03, same day):** WF-7's live-site self-heal suite (D.1–D.7) also
> passed in full, closing out the LAST unproven piece named in the prior bump note. D.6 is the
> first proof this session that relational/structural identity resolution — and resolver.js's
> ambiguous-candidates fall-through specifically — holds on a real live site under real position
> drift, not just a controlled fixture. 6 of 7 legs resolved at zero token cost (D.7 audit).
> **Why ~23%, not higher:** one flagship run proves *capability*, not *reliability* — SPA sites,
> bulk-file identity, cross-run re-run, and endurance are still unproven manually, and
> canvas/CAPTCHA/OTP/drag-drop are hard walls. Hover-reveal and native-dialog replay (`/hovers`,
> `/javascript_alerts`) are a separate, newly found *soft* gap (2026-09-03) — unlike the hard
> walls, both have working recorder and runtime support on paper, they just haven't been proven
> reliable end to end yet (`TODO.md` EXEC-29).
> **Bumped 20%→22% (2026-09-03):** WF-7's full recovery-cascade drill (R0–R5) passed end to end
> against real Chromium — the last individually-unproven piece named in the note above. This is
> the first live proof of the *agent-mediated* tier (Tier B: ranked candidate digest → verified
> override → resume), the Studio zero-token negative control, an honest decline with no
> plausible-match, and the retry-budget/stagnation guard — distinct from the Tier A dismiss-ladder
> (P-2) and Tier A drift-heal already proved. One honest caveat: R1 passed but not via the specific
> Tier 2 a11y path the drill originally intended to exercise — see `TODO.md` **EXEC-31**.
> **Bumped 18%→20% (2026-09-03):** the runbook follow-up run proved two things individually for
> the first time — a *live* Tier-A recovery pass (drift-healing a relabeled button, zero tokens,
> real Chromium, not just the dismissal-ladder P-2 already proved) and entity-specific cart
> binding (H-5/PROD-3, the sales-blocking safety test). A small step, not a re-rate — the harder
> gaps above are untouched.
> Cheapest upgrades: WF-5 bulk-file legs next, then WF-4 Leg A.

```
Internet workflow coverage:  ▓▓▓▓▓▓░░░░░░░░░░░░░░░░  ~23%

Last updated: 2026-09-03
Passed workflows:             4   (1 flagship, reconfirmed by a 2026-09-03 follow-up run
                                    + 1 full recovery-cascade drill + live self-heal suite (WF-7)
                                    + 2 precursors/supporting)
Longest verified workflow:    42 steps · 6 tabs · 6 hosts · 5 domains (2026-08-25 flagship;
                                    2026-09-03 follow-up run was shorter by design — see below)
Zero-token recovery proven:   yes (Tier A dismiss ladder + Tier A drift-heal, real Chromium)
Agent-mediated recovery proven: yes (Tier B override + resume, real Chromium — WF-7)
Auth exclusion verified:      yes (no secrets in published bundles)

Headroom note: the proven SHAPE (multi-tab + file handoff + authenticated chains + full recovery
cascade) suggests a ~30% ceiling is reachable once WF-4/WF-5 pass — the gap is unproven
reliability, not missing architecture.
```

| Capability | Status | Proven by |
|---|---|---|
| Cross-domain download → upload handoff (`{{downloaded_file}}` binding) | ✅ proven | Mega-workflow 2026-08-25 |
| Multi-tab execution incl. `tab_switch` back to an earlier tab | ✅ proven | Mega-workflow + precursor 2026-08-23 |
| Site-opened popups + user-opened tabs in one run | ✅ proven | Mega-workflow 2026-08-25 |
| Authenticated chains on real SaaS (Render dashboard, Vercel) | ✅ proven | Mega-workflow 2026-08-25 |
| Zero-token overlay dismissal (Tier-1 known-pattern ladder + learning) | ✅ proven (real Chromium) | AV-5a walkthrough 2026-08-25 |
| Bulk ZIP download observed mid-run | ✅ download side only | Mega-workflow 2026-08-25 |
| Entity-specific cart action (right row removed, not first row — H-5/PROD-3 sales-blocker) | ✅ proven | Runbook follow-up 2026-09-03 |
| Slow-network headroom + honest mid-run session-death failure (no hang, no zombie process) | ✅ proven | Runbook follow-up 2026-09-03 (R3/R4) |
| Hover-reveal + native-dialog replay (`/hovers`, `/javascript_alerts`) | ❌ not reliable yet — soft gap, not a hard wall | Runbook follow-up 2026-09-03; `TODO.md` EXEC-29 |
| Agent-mediated (Tier B) recovery: ranked candidate digest → verified override → resume, no wrong-decoy click | ✅ proven | WF-7 drill R3, 2026-09-03 |
| Studio deterministic ceiling: zero-token negative control (no agent tokens spent even when recovery is theoretically possible) | ✅ proven | WF-7 drill R2, 2026-09-03 |
| Honest decline when no plausible match exists (no wrong-guess click) | ✅ proven | WF-7 drill R4, 2026-09-03 |
| Retry-budget / stagnation guard stops runaway recovery spend, cost drops on repeat failure | ✅ proven | WF-7 drill R5, 2026-09-03 |
| Identity survives real DOM drift (rename, restructure, delayed render, stale recorded position) | ✅ proven | WF-7 Suite D.1–D.3/D.5, 2026-09-03 |
| Never assumes stale/leftover page state is current — always verifies or self-navigates | ✅ proven | WF-7 Suite D.4, 2026-09-03 |
| Relational/anchor-based identity resolves correctly on a real live site under real position drift, including resolver.js's ambiguous-candidates fall-through with no per-item testid | ✅ proven | WF-7 Suite D.6, 2026-09-03 |
| 30+ step single-domain chain · dynamic/self-heal elements · 20-file bulk identity · branch steps live replay | ⏳ pending | see `01-WORKFLOWS-TO-TEST.md` |

---

## Passed Workflow P-1 — EXEC-10 mega-workflow: long-chain, multi-tab, cross-domain, file transfer

**Date passed:** 2026-08-25 05:33 local (Build Studio Run Test)
**Shape:** one recorded skill — **42 steps, 6 tabs** (initial + 4 user-opened + 1 site-opened popup),
**6 hosts**, compiled clean (`compile_status: ok`), replayed successfully end to end.

### Segments (all passed in one run)

| Segment | Site(s) | What it exercised |
|---|---|---|
| Download files from bin A → ZIP download observed | `filebin.net` | Bulk-download side (Shape B download) |
| New tab → upload of that downloaded file | `demoqa.com/upload-download` | The core handoff — compiled to `{{downloaded_file_2}}` (W-2 binding), no `file_path` input supplied at all |
| Real `tab_switch` back to tab A (+ browser Back), second download | `filebin.net` | Tab-context landing on return to the initial tab |
| Third-domain tab → upload #2 | `the-internet.herokuapp.com/upload` | Second cross-domain upload, bound to `{{downloaded_file_3}}` |
| ~10-step authenticated deploy chain | `dashboard.render.com` | Length stress on a real authenticated SaaS |
| User-opened tab → site-opened popup → sign-in there | `vercel.com` → deployed app | User-opened-tab + site-opened-popup handling |

### Why this new pass matters — what it proves Conxa can do now

Before this pass, multi-tab replay and download→upload binding existed only as unit tests. This
single run proves Conxa can take **one human recording that spans five websites and six tabs** and
replay it faithfully with **zero agent tokens at runtime**:

- **Real file plumbing:** a file downloaded on one website is uploaded on another without anyone
  supplying a path — the runtime binds it automatically.
- **Correct tab memory:** actions land in the tab they were recorded in, even after switching back
  to a tab used minutes earlier.
- **Popups don't derail runs:** both tabs the *user* opened and a popup opened *by the site* are
  followed correctly, including signing in inside the popup.
- **Authenticated SaaS is drivable:** a ~10-step logged-in deploy chain on Render completed — this
  is the realistic enterprise shape, not just demo sites.
- **Scale:** 42 steps compiled clean and replayed clean — compile did not truncate and nothing
  degraded over the length of the run.

**Precursors (2026-08-23):** two published skills proved the halves separately first — a 9-step
filebin-only download→tab-switch→upload skill, and a 22-step Render→Vercel cross-domain multi-tab
skill with both a user-opened tab and a site-opened popup. Session log:
`docs/archive/sessions/session-ses_fd4e.md`.

**Reconfirmed + extended (2026-09-03):** a second, shorter recording against the same EXEC-10
shape re-ran the mutator/dynamic-identity/tab/upload mechanics clean and proved two capabilities
this flagship run never isolated on its own — entity-specific cart binding and live Tier-A
recovery — while also surfacing a real gap (hover/dialog replay). Not filed as its own numbered
pass since it didn't fully clear its own runbook; see the follow-up section below for the honest
pass/fail breakdown.

---

## Passed Workflow P-3 — WF-7: full recovery-cascade drill + live self-heal suite (Tier A + Tier B, real Chromium)

**Date passed:** 2026-09-03, in full — fixture replay matrix (R0–R5) and the live-site self-heal
suite (D.1–D.7). Driven directly against the real dev runtime (`~/.conxa-dev`) over the same stdio
MCP protocol Claude Desktop uses, with `recovery.log`/`runtime.log` evidence for every row.

### Rows (all six passed)

| # | Variant | What it proved |
|---|---|---|
| R0 | `clean` | Baseline: zero recovery events, correct click — compiled identity is not artificially weak |
| R1 | `?v=t2` (id survives, everything else drifts) | Correct click via primary durability-ranked signal resolution — see caveat below |
| R2 | `?v=t3`, Studio ceiling 2 | Deterministic `recovery_ceiling_reached` failure, **zero** agent tokens spent — the negative control |
| R3 | `?v=t3`, real MCP ceiling 4, 2 decoys present | `agent_recovery_requested` → ranked `candidate_index` digest → `agent_override_applied` → resumed and completed, exact target clicked, decoys never touched |
| R4 | `?v=gone`, no plausible match | Clean typed failure — no wrong-guess click when nothing on the page matches |
| R5 | `?v=gone` repeated, same session | `recovery_stagnant_stop` fired on the 3rd identical-fingerprint round; that response was plain text — cheaper than the armed rounds before it |

**Caveat (honest, not a failure):** R1 passed by resolving through `resolver.js`'s primary
durability-ranked signal walk (a surviving `css-id` signal), not through the Tier 2 a11y recovery
cascade the row was originally designed to exercise — under the current architecture, no drift that
preserves even one compiled signal ever reaches the cascade. Filed as `TODO.md` **EXEC-31**; the
drill still proves what matters (drift healed with zero tokens), just via a different mechanism
than R1's row description names.

### Why this pass matters — what it proves Conxa can do now

Before this pass, the *agent-mediated* recovery tier (Tier B — the paid, LLM-reasoning path)
had never been proven end to end against a real running skill; only the zero-token Tier A ladder
(P-2) and a live Tier A drift-heal (2026-09-03 follow-up) had real-browser evidence. This drill
closes that gap directly:

- **The armed-agent round-trip actually works:** a failed step returns a ranked, indexed candidate
  list plus screenshots; a verified `candidate_index`/selector pick resumes the exact parked page
  and completes — never a blind guess, never `.first()`.
- **Decoys don't fool the ranking:** R3's fixture placed two decoy buttons alongside the real
  target; the correct one was clicked every time.
- **Zero-token discipline holds under real drift, not just in Studio's forced ceiling:** R2 proves
  Studio spends nothing even when recovery is theoretically possible; R4 proves the agent itself
  declines rather than guessing when nothing matches.
- **Cost discipline is real, not theoretical:** R5's stagnation guard measurably cut the cost of a
  repeated identical failure instead of re-sending the full payload forever.

One real bug found and fixed in the course of this drill (not a workflow gap): `resume_from`
without a matching `step_overrides` entry used to silently replay from a blank page with a
misleading error — fixed same-day, `TODO.md` **EXEC-32** (resolved).

### Suite D — live-site self-heal legs (D.1–D.7), same day

Run directly against the real dev runtime, same evidence standard as R0–R5 (`recovery.log` +
`runtime.log` for every row).

| # | What changed | Result |
|---|---|---|
| D.1 rename | Label changed, testid/id/aria-label untouched | ✅ zero recovery events — primary contract signal (testid) resolved it directly |
| D.2 move | Wrapped one level deeper in a new `<div>`, identity untouched | ✅ zero recovery events — a stale `recorded_context` (parent/index) didn't mislead the still-valid testid signal |
| D.3 past healing | Label + structure changed, testid **and** id dropped | ✅ full Tier B escalation: ranked digest → verified `candidate_index` → resumed and completed on the single non-decoy candidate |
| D.4 wrong page | Browser left mid-failure on an unrelated page from a prior run | ✅ the next fresh call self-navigated to the correct URL and completed cleanly — never assumed the leftover page was current |
| D.5 slow render | Element rendered 5s late (default action timeout is 2.5s) | ✅ genuinely hit `tier2_a11y` (zero tokens) — waited past the default timeout instead of failing prematurely; the first real Tier-2 a11y firing all session |
| D.6 live-site position shift | See below | ✅ (see below) |
| D.7 cost audit | See below | ✅ (see below) |

**D.6, adapted:** the spec's live target (`demo.owasp-juice.shop`) has since dropped its sort
control entirely (checked the DOM directly — no sort UI of any kind), and separately turned out to
crash specifically for a fresh/cookie-less automated session (confirmed via 4 reproducible attempts
through the runtime vs. a normal browser tab loading it fine) — both site-side, not a Conxa gap.
Substituted **`automationexercise.com/products`**, a stable, purpose-built automation-testing site
with the same real shape the leg needs: all 34 "Add to cart" links share identical role/text/class
with no per-item testid, so a specific product is only identifiable via its own name anchored to a
container (`.productinfo:has-text("Winter Top") a.add-to-cart`). Ran the compiled step against two
real states of the live site — the default listing (target at index 4) and a search-filtered view
(`?search=Top`, target shifted to index 1, verified via direct DOM inspection both times — both
states independently confirmed reachable and correctly cart-verified via a manual click in a
separate browser tab). **Both passed with zero recovery events** — role/text signals were
non-unique across 34 identical buttons (the first live, non-fixture exercise of resolver.js's
ambiguous-candidates fall-through this session) and correctly fell through to the name-anchored
structural signal, which resolved to the one correct product regardless of position.

**D.7 cost audit:** 6 of 7 legs resolved at **zero token cost** — either directly via a durable
primary signal (D.1, D.2, D.6) or via genuine zero-token Tier 2 a11y recovery (D.5). Only D.3, the
one leg deliberately engineered to strip every deterministic signal, needed the paid Tier B agent
round — exactly once, resolved in a single round-trip. This is real, live-browser evidence for the
"most real-world breakage heals at zero marginal cost" claim, not a theoretical one.

**Full pass — what it proves:** Tier A is a real free self-heal path under actual DOM drift, not
just the fixture's synthetic variants; the ceiling contract holds in both directions; Tier B ranks
honestly under decoy-free ambiguity; a stale recorded position never misleads a still-valid
contract signal; the runtime never assumes stale page state is current; and identity genuinely
survives a live site's own real reordering, not just a controlled fixture's.

---

## Follow-up run (not a hall-of-fame pass) — `03-ONE-WORKFLOW-RUNBOOK.md`, 2026-09-03

**Not filed as "Passed Workflow P-#"** — per this file's own maintenance rule, that title is
reserved for a *successful end-to-end run*, and this one wasn't (hover + native dialogs failed).
Logged here anyway because it re-confirms most of P-1's shape on a fresh recording and surfaces
two capabilities — entity-specific cart targeting and timeout/mid-run-death resilience — that
were never individually proven before, alongside a newly-found soft gap. Both new capability rows
and the gap are already reflected in the dashboard above.

**Date run:** 2026-09-03 (Build Studio, manual recording + replay against the runbook in
[`03-ONE-WORKFLOW-RUNBOOK.md`](03-ONE-WORKFLOW-RUNBOOK.md)).

**What passed:** Segments A–D (Wikipedia baseline, mutator drift-heal, dynamic identity,
the-internet marathon) minus hover and native dialogs, Segment E (demoqa forms + upload
handoff), and Segment F (saucedemo entity-specific cart removal). Replay resilience checks R3
(slow network, `CONXA_ACTION_TIMEOUT_MS=1200`) and R4 (mid-run session death) both came back
clean per the recovery/server logs — matching what §PHASE 3 of the runbook expects.

**What did not pass or was not exercised in this take:**
- Segment D's `/hovers` and `/javascript_alerts` steps did not replay reliably, despite the
  recorder and runtime both having real support for hover reveals and native dialogs (see
  `TODO.md` **EXEC-29**, new 2026-09-03).
- Segment D's `/drag_and_drop` step — reconfirmed as a hard limitation, unchanged from the
  dashboard note below (skipped with a warning at build time per `FIX.md` 2026-08-26).
- Segment D's iframe/nested-frames sub-steps and Segment G (SPA journey, `demo.owasp-juice.shop`)
  were not captured in this particular recording — both were validated working in an earlier,
  separate manual pass, so this is scope-of-this-take, not a regression.
- Segment H (chaining source, `computer-database.gatling.io`) — the site itself failed to load
  during this run; read as external-site availability, not a reproduced Conxa-side bug.

**Why this matters:** confirms the runbook's core mechanics (drift-healing, dynamic identity,
multi-tab forms/upload, entity-specific cart binding) hold up in a real manual run, and that the
runtime's slow-network and mid-run-death resilience (H-2/H-3 shapes) are solid. It also drew a
sharper line around two remaining real gaps — hover and native-dialog replay — that looked closed
on paper (recorder support landed 2026-08-26, runtime handlers already exist) but aren't proven
end to end yet. Full detail: `TODO.md` **TEST-12**'s 2026-09-03 update.

---

## Passed Workflow P-2 — Tier-1 known-pattern dismissal ladder + learning store (AV-5a)

**Date passed:** 2026-08-25 (executed programmatically against real headless Chromium using
[`fixtures/dismiss-fixture.html`](fixtures/dismiss-fixture.html) and the same ladder code path).
Unit tests cover the mechanics offline; this pass proved them against a live page end-to-end.

### What was confirmed

- R1–R4 click sequences exactly as predicted; R5 (bespoke modal) failed cleanly with no free pass.
- The learned store (`learned_overlays.json`) gained only `localhost` entries.
- **R2→R3 learning transition:** run 1 clicked a dead-end decoy candidate then continued to the
  real accept button; run 2 skipped straight to the learned winner — the decoy was never clicked.

### Why this new pass matters — what it proves Conxa can do now

- **Cookie banners and famous consent popups are dismissed for free.** Escape plus a bounded
  known-pattern list resolves overlays at **zero LLM tokens**, and the runtime *remembers* which
  button worked per site, getting faster on every repeat visit.
- Two implementation facts validated that mocks would have missed: the ladder clicks **every
  present candidate in order** (a dead-end candidate must not stop it), and per-candidate probe
  budget needs ~1.2 s headroom on a cold page.

---

## Passed Workflow P-4 — WF-2 Segment B (remainder): moved element, role/text-only identity (C.4)

**Date passed:** 2026-09-03 (Build Studio Run Test, against
[`fixtures/recovery-fixture.html`](fixtures/recovery-fixture.html)'s new `moved` variant).

Recorded a single click on the fixture's "Buy Now" button in its default top-left position (full
identity: `id`/`data-testid`/`aria-label`/text all present), compiled, then replayed with
`?v=moved` — every attribute signal (`id`, `data-testid`, `aria-label`, `class`) stripped, only
role (`button`) + visible text (`Buy Now`) left, and the element relocated into an unrelated
`nav.sidebar` container (36px collapsed strip, pinned bottom-right) instead of its recorded
top-left parent.

### What was confirmed

- `run_success`, 2/2 steps executed, correct element clicked (`server.log`:
  `GET /__log?moved:target`) — not a miss, not a wrong click.
- **Zero recovery-cascade events** in `recovery.log` for this run. The compiled `identity_bundle`
  already carried `role` and `text_based` as durability-ranked signals (from the clean recording),
  so `resolver.js`'s primary signal walk found the moved element directly — `cascade.js` never
  engaged. Same shape as **EXEC-31** (`TODO.md`): a fixture variant that preserves even one
  compiled signal resolves before the recovery cascade gets a chance to fire, so this proves
  role/text durability at primary resolution, not tier-based healing specifically.

### Why this passes matters

Confirms role + visible text alone — with every attribute and structural-position signal gone —
still correctly re-locate a recorded element after a real, drastic DOM move (not just one level of
nesting, as D.2 already covered). Closes the last open piece of WF-2 Segment B named in
`01-WORKFLOWS-TO-TEST.md`.

---

## Passed support checks folded into P-1/P-2 (resolved en route)

These were tracked as break predictions / gaps and are now resolved — their regression fixtures
live in unit tests; re-confirm via the corresponding workflows in `01-WORKFLOWS-TO-TEST.md`:

| Old weakness | Status | Proof |
|---|---|---|
| W-1 tab steps were no-ops | ✅ resolved 2026-08-15 | `runtime/test/test_tabs.js`; proven live in P-1 |
| W-2 no download→upload binding | ✅ resolved 2026-08-15 | `test_download_upload_binding.py`; proven live in P-1 |
| W-5 download listener missed popups | ✅ resolved 2026-08-15 | Listeners attach to every opened page |
| W-7 downloads accumulated forever | ✅ resolved 2026-08-17 | `sweepOldRuns` retention sweep (7-day default) |
| W-8 multi-file upload unrepresentable | ✅ fixed 2026-08-16 (EXEC-20 zip extraction) | Unit-tested; live Shape-B replay still owed — see WF-5 |

---

## Maintenance rules

- A workflow moves here **only after a successful manual/real-browser end-to-end run** — never on
  unit-test strength alone.
- Keep the dashboard's coverage % honest: bump it only when the newly passed workflow unlocks a
  class of sites/mechanics not previously covered.
- If a later re-run of anything in this file fails, move it back to `01-WORKFLOWS-TO-TEST.md`
  with a dated regression note and lower the dashboard accordingly.
