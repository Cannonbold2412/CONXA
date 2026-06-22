# Final Implementation Blueprint (Phase 10)

**The most important deliverable.** The architecture (Phases 1–9) is finalized. This phase decides **what to actually build**, as five releases R1–R5, each a coherent shippable increment. No code — scope, dependencies, validation, and expected gains only. Grounded in the ROI ranking (`conxa-gap-analysis.md`), the top-50 (`edge-case-reliability/top-50-reliability-improvements.md`), and the architecture decisions above.

**The organizing principle:** build the **verified deterministic floor first** (it is cheap, zero-token, and everything else depends on it), then **autonomous recovery**, then the **fleet flywheel**, then **durability**, then **enterprise plumbing**. The natural critical path from the gap analysis is `G4+G2 → G5 → G1 → G3 → G7`, with enterprise (G8/G9) sequenced against sales need.

**Gain scales:** Reliability/Recovery/Enterprise gain 1–10 (delta over today). Complexity/Risk Low/Med/High. ROI is the blended payoff per engineering-week.

---

## R1 — The Verified Deterministic Floor

**Objective:** make the existing deterministic replay *trustworthy* — every consequential step proves its outcome, and timing/identity flakiness is killed at zero token.

**Problem solved:** today `verifyAssertions()` is unwired (silent wrong-actions, EC-28), the runtime waits `visible`-only (mis-clicks moving elements, EC-05), uses a blunt 700ms fail-fast (slow-SPA flakiness), and tries selectors in array order with no scoring/uniqueness (wrong-element matches). This is the largest reliability gap and the cheapest to close.

**Dependencies:** none — pure runtime + compiler work on existing structures (`run.js`, `validation_planner.py`, `selector_score.py`, `confidence/layered.py`).

**Implementation scope:**
- **Wire independent post-condition verification** on every consequential step (G2 / top-50 #1) — the validation planner already computes assertions; the runtime must run them via an independent channel, frame/shadow-aware. *Highest single item.*
- **Actionability stability(RAF) gate** attached→visible→**stable**→enabled + hit-target (G4 / top-50 #2, #7).
- **Live multi-signal scoring + uniqueness gate** at resolution (G5 / top-50 #3) — consume the compiled fingerprint instead of array-order.
- **Durability-ordered identity** semantic-first at compile (top-50 #5) — fixes the C.1 contradiction.
- **Full exception-classified ladder** (stale→re-find, intercepted→JS-dispatch, OOB→re-scroll) (top-50 #4).
- **Confidence-aware adaptive timeouts** + **consume compile-time confidence** (top-50 #8, #9).

**Validation criteria:** on a version-pinned regression suite (insight #14), (1) zero silent wrong-actions — every wrong-element resolve is caught by verification; (2) measurable drop in timing-flake failures; (3) no LLM calls added to the hot path (invariant check); (4) ambiguous matches escalate instead of picking `[0]`.

**Expected gains:** Reliability **9** · Recovery **5** (better deterministic floor) · Enterprise **7** (verifiable correctness). **Complexity Med · Risk Low · ROI ★★★★★.** This release alone makes "deterministic replay" *true* and is the precondition for everything after it.

---

## R2 — Conditional Control Flow + Action-Correct Handlers

**Objective:** survive the stochastic states and complex inputs that break linear replay on real enterprise apps.

**Problem solved:** linear replay breaks on consent banners (~30–50% of loads, EC-19), modals (EC-20), idle interstitials (EC-45), and mishandles typeahead/custom-dropdown/contenteditable (EC-25/26/29) — the interactions WorkArena shows agents fail most and recorders most often miss.

**Dependencies:** R1 (verification gates the correctness of these new handlers; conditional dismissal must verify the blocker is gone).

**Implementation scope:**
- **Conditional/optional/branch steps** in the skill format: `if_present`, `try_dismiss`, `wait_for_one_of` (G6 / top-50 #6) — wire the intent graph's decision points to execution.
- **Curated dismiss-known-pattern library** for consent/modals (top-50 #11).
- **Action-type-correct handlers**: typeahead (fill→wait-options→select-exact), custom dropdown (open→wait→click-by-text), contenteditable (focus+keys), upload/download verification (top-50 #10, #15, #23, #31, #32).
- **Scroll-until-found** for virtualized lists + **re-hover** for hover menus + **post-nav stale-DOM guard** (top-50 #12, #13, #14).
- **Recorder upgrades** to capture these as composite interactions + flag virtualized containers + mark observed stochastic states (G12 / insight #24).

**Validation criteria:** regression suite covering banner/modal/typeahead/virtualized-grid/hover scenarios passes deterministically; conditional steps branch correctly present-or-absent; every handler's outcome verified.

**Expected gains:** Reliability **8** · Recovery **4** · Enterprise **8** (real Salesforce/ServiceNow/Workday flows). **Complexity Med · Risk Med · ROI ★★★★☆.**

---

## R3 — Autonomous Verified Recovery + Boundary Hardening

**Objective:** make the marketed "self-healing" real — replace host-delegated manual resume with an autonomous, bounded, verified Tier-3, and harden frame/shadow recovery.

**Problem solved:** today recovery is deterministic ladder → manual host resume; no autonomous re-grounding, no verified repair, no frame-level recovery (G1). Unattended runs cannot self-heal; the "5-tier AI cascade" is fiction.

**Dependencies:** R1 (verification is mandatory to validate any repair — you cannot trust an autonomous heal without a post-condition).

**Implementation scope:**
- **Autonomous Tier-3 describe-then-match** via MCP sampling against a target-anchored, rank-and-capped AX digest (G1 / top-50 #19, #45) — host emits a *description*, deterministic matcher resolves it; reflection-in-output paired with verification (top-50 #44).
- **Frame/shadow recovery sub-tier**: multi-signal FrameFingerprint, CDP frame-tree enumeration, closed-shadow AX/CDP path (top-50 #17, #18, #24).
- **Frame/shadow-aware verification** (top-50 #27).
- **Structured Tier-5 human handoff** + **rule-triggered escalation on destructive steps** (top-50 #28, #29).
- **Stall/loop fingerprint retry cap** (top-50 #22).
- **`repair_event` emission** (the write-back signal — used ephemerally locally) (top-50 #30).

**Validation criteria:** injected drift (renamed/moved/re-rendered targets) self-heals autonomously and the repair passes its post-condition; destructive ambiguity terminates to human; recovery is bounded (no thrash); no Tier-1/2 path ever invokes the LLM (invariant).

**Expected gains:** Reliability **7** · Recovery **9** · Enterprise **8**. **Complexity High · Risk Med · ROI ★★★★☆.** This is the release that makes Conxa's headline differentiator true.

---

## R4 — The Fleet Drift Flywheel + Durability

**Objective:** turn per-run repairs into a fleet-wide, compounding durability asset — the only structurally uncopyable moat.

**Problem solved:** site drift is rediscovered N times across customers; skills silently rot (G3/G7). No competitor can fix this (all single-tenant/local).

**Dependencies:** R3 (verified `repair_event`s are the input), R1 (verification ensures repairs are trustworthy before fleet-distribution — a poisoned repair would harm all customers), cloud ops hardening (G14: Redis, durable queue, blob storage).

**Implementation scope:**
- **Cloud recovery aggregation** across all customers of a skill; **drift detection on first occurrence** (G3).
- **Change classification** (text/DOM/layout/flow) + **repair suggestion** + **regression test on version-pinned env** before republish (G7).
- **Telemetry-driven write-back → Cloud re-sign** (insight #11) — never local mutation.
- **Signed packages + per-file delta + rollback + app-version compatibility fingerprint** (G9 / insight #19).
- **Canary rollout** of re-signed packs to the fleet.

**Validation criteria:** a drift healed on one runtime produces a re-signed version that a *second* runtime receives before hitting the same drift; rollback restores instantly; no unverified repair ever reaches a customer.

**Expected gains:** Reliability **8** (compounding) · Recovery **6** · Enterprise **9** · Strategic **10**. **Complexity High · Risk Med · ROI ★★★★☆.** The moat — defer until R1–R3 prove single-tenant reliability, but build it before scale makes drift-rediscovery the dominant cost.

---

## R5 — Enterprise Trust Plane

**Objective:** clear the non-reliability blockers that gate enterprise revenue.

**Problem solved:** RBAC scaffolded/unwired, no SSO, code signing absent, weak tenant isolation (G8, Sales-Blockers). These don't improve reliability but gate deals.

**Dependencies:** independent of R1–R4; sequence against actual sales need (some — code signing, RBAC — are needed before *any* paid pilot per `pre-sales-roadmap.md`).

**Implementation scope:**
- **RBAC enforced on all routes** + **SSO/SAML** + **hard tenant isolation** + per-user runtime identity (G8).
- **Code signing** of installers + **entitlement-filtered `list_skills`** (insight #20).
- **ServerBackend seam** (harness/registry/backend) + **MCP boundary hygiene** (one zod schema, in-band errors) (G11 / insight #5, #21).
- **Audit log, device registration, honest repositioning** of marketing claims (from `pre-sales-readiness.md`).
- **Cloud ops hardening** (G14) where not already done for R4.

**Validation criteria:** RBAC denies cross-tenant access in tests; signed installers verify; advertised skill surface matches entitlement; marketing claims match shipped behavior.

**Expected gains:** Reliability **3** · Recovery **2** · Enterprise **10**. **Complexity Med · Risk Med · ROI ★★★★☆** (revenue-gating, not reliability).

---

## Summary table

| Release | Theme | Gaps | Rel | Recov | Ent | Cx | Risk | ROI |
|---|---|---|---|---|---|---|---|---|
| **R1** | Verified deterministic floor | G2,G4,G5 | 9 | 5 | 7 | Med | Low | ★★★★★ |
| **R2** | Conditional flow + handlers | G6,G12 | 8 | 4 | 8 | Med | Med | ★★★★☆ |
| **R3** | Autonomous verified recovery | G1,boundary | 7 | 9 | 8 | High | Med | ★★★★☆ |
| **R4** | Fleet flywheel + durability | G3,G7,G9,G14 | 8 | 6 | 9 | High | Med | ★★★★☆ |
| **R5** | Enterprise trust plane | G8,G11 | 3 | 2 | 10 | Med | Med | ★★★★☆ |

**The dependency spine:** R1 is the keystone — verification (G2) is a prerequisite for trustworthy R3 (you cannot validate an autonomous repair without a post-condition) and for R4 (an unverified repair would poison the fleet). Build R1 first, completely, before anything else. R2 and R5's earliest items (code signing, RBAC) can proceed in parallel against sales need. R3 unlocks R4. This ordering is detailed in `build-order.md`.
