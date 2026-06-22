# Final Replay System Architecture (Phase 1)

**Status:** Final engineering blueprint. Synthesis only — no new research. Grounded in the full `research-analysis/` corpus (top-25-insights, conxa-gap-analysis, edge-case-reliability/*, future-*-architecture). This document is the master map; Phases 2–12 specify each layer.

**Governing thesis (unchanged, now load-bearing):** *Human performs the workflow once → Conxa records everything → AI understands, enriches, and compiles → a deterministic signed skill pack replays with zero LLM in the hot path → recovery and repair-validation are the only places AI is permitted, and even they are gated by a zero-token verification step.*

The architecture's job is to make that one sentence true in production. Today it is half-true: the deterministic replay exists, but **verification is unwired, recovery is host-delegated not autonomous, and the compiled multi-signal identity is not scored at runtime** (see `conxa-gap-analysis.md` G1/G2/G5). This blueprint closes those gaps without violating a single invariant in `CLAUDE.md`.

---

## 0. The nine layers and where they run

```
 ┌─────────────── BUILD STUDIO (local, Windows) ──────────────┐   AI ALLOWED (compile only)
 │  1 RECORDING   →  2 UNDERSTANDING  →  3 ENRICHMENT  →       │
 │                                       4 COMPILER  →  5 SKILL PACK (signed)
 └──────────────────────────────┬─────────────────────────────┘
                                │ publish (signed artifact)
                  ┌─────────────▼──────────────┐
                  │   CONXA CLOUD (coordination)│   AI ALLOWED (repair-validation, re-sign)
                  │  host · proxy · bill ·      │   NEVER executes, NEVER compiles
                  │  FLEET DRIFT FLYWHEEL       │
                  └─────────────┬──────────────┘
                                │ delta-sync (signed)
 ┌──────────────────────────────▼─────────────────────────────┐   ZERO LLM IN HOT PATH
 │  CUSTOMER RUNTIME (local, via Claude Desktop MCP)           │
 │  6 REPLAY  →  7 VERIFICATION  →  8 RECOVERY  →  9 FAILURE    │   AI ALLOWED (Tier-3 recovery,
 │                  ▲────────── verify gates every result ─────│    via host MCP sampling) + repair-
 └────────────────────────────────────────────────────────────┘    validation feeds telemetry → Cloud
```

The split is non-negotiable (`CLAUDE.md`: "the cloud does not compile or execute"). All intelligence is **front-loaded into compile** (Studio) or **walled into recovery** (runtime Tier 3+). The replay path itself is a pure deterministic interpreter of the skill pack.

---

## 1. Recording Layer (Studio, local)

**Purpose:** capture a complete, replayable, *intent-bearing* trace of one human execution.

**Inputs:** live browser session via injected `bridge.js` (Playwright capture).
**Outputs:** `events.jsonl` — ordered raw events with, per event: action, target DOM snapshot, full **frame chain**, **shadow host-path**, accessibility attributes, bounding box (page-level, offsets accumulated up the parent chain), surrounding anchors, page URL/title, and a screenshot.

**What recording must capture that today it under-captures** (from insight #24 / G12 / EC inventory):
- **Typeahead/autocomplete** (type → options-appear → select) as a *composite* interaction, not three loose events (EC-25, top enterprise failure).
- **Dynamic tables** (sort/filter/paginate) and **virtualized containers** — flag the container as virtualized at record time so replay uses scroll-until-found, not `scrollIntoViewIfNeeded` (EC-13).
- **Custom dropdowns vs native `<select>`** distinguished at capture (EC-26).
- **Stochastic states observed during recording** (consent banners, modals) marked as *candidate conditionals* (EC-19/20).
- **Boundary metadata verbatim:** the iframe chain and shadow path are recorded exactly and never reconstructed later (`CLAUDE.md` invariant).

**Principle:** recording is the wedge. Every signal not captured here must be re-derived by the LLM later (more cost, less fidelity) or is lost forever. Capture richly; discard in compile.

---

## 2. Understanding Layer (Studio, AI-allowed)

**Purpose:** turn a raw event trace into a *semantic workflow graph* — what the human was trying to accomplish, step by step.

**Inputs:** `events.jsonl`.
**Outputs:** an intermediate representation (IR — see G10) carrying, per step: **intent** (semantic description of the goal), **expected outcome** (what state should change), **decision points** (where the flow could branch), and the **action type** normalized to a known handler class.

**AI role:** this is a legitimate compile-time use of the LLM (intent extraction, semantic labeling, outcome inference). It runs in Studio, never on the customer machine, and its output is *frozen into the pack* — the customer never pays this cost or its non-determinism (insight #15).

**Why a distinct layer:** separating "understand" from "enrich" and "compile" gives a diffable IR (G10) — the precondition for durability, rollback, reproducible compiles, and repair suggestion.

---

## 3. Enrichment Layer (Studio, AI-allowed)

**Purpose:** attach everything the deterministic runtime will need so it never has to think.

For each step the enrichment layer produces:
- **Multi-signal identity** — N *engine-orthogonal* selectors (role+name / text / testid / scoped-CSS / xpath-last), each with a **durability score** (semantic > structural, per Mind2Web), generated by a deterministic Playwright-style generator floor *plus* LLM semantic naming (insight #3, G5).
- **Element fingerprint** — the orthogonal signal set + frame/shadow chain + bounding box + anchors, used at runtime for live scoring (not just ordered fallback).
- **Post-condition fingerprint** — the independent verification target for this step (modal opened / row created / URL changed / field value present) (insight #2, the trust spine).
- **Recovery hints** — recorded anchors, alternates, frame fingerprint, hover-chain, virtualization flag.
- **Conditional structure** — `if_present` / `try_dismiss` / `wait_for_one_of` branches for observed-or-likely stochastic states (insight #7, G6).
- **Confidence + durability scores** — per-step, computed at compile (`confidence/layered.py`), *to be consumed at runtime* (today computed but ignored — G5/top-50 #9).

---

## 4. Compiler Layer (Studio, local)

**Purpose:** lower the enriched IR into a **deterministic, signed, versioned skill pack** with no residual ambiguity.

**Key compiler responsibilities:**
- **Selector filtering** (Phase 3): drop non-deterministic selectors (nth-of-type on dynamic content, GUID-like ids, position hints for dynamic DOM) so they *never reach runtime*.
- **Durability ordering**: emit the orthogonal signal set ordered semantic-first within the zero-token band (fixes the C.1 cost-first contradiction).
- **Boundary discipline**: forbid XPath for shadow targets (XPath doesn't pierce — top-50 #17); preserve iframe chain verbatim; tag `frame_enter`/`frame_exit` with `no_recovery_block`.
- **Verification planning**: compile a post-condition for every consequential step (`validation_planner.py`).
- **Reproducible, pinned compiles** (G10): same input → same pack.
- **Auth exclusion**: `plugin_builder.py` enforces that auth/credentials never enter build output (invariant).
- **Sign**: cryptographically sign the pack; stamp an **app-version compatibility fingerprint** (insight #19) for staleness detection.

---

## 5. Skill Pack Layer (the artifact — Phase 8)

The unit of value: a **signed, versioned, entitlement-gated, delta-syncable** package of steps + identity + post-conditions + recovery metadata + conditionals. It is the thing competitors structurally lack (insight #9) and the substrate of the fleet flywheel (insight #1). Full structure in `final-skill-pack-architecture.md`.

---

## 6. Replay Layer (Runtime, deterministic — Phase 4)

**Purpose:** execute the pack step-by-step with **zero LLM**.

Per step, the universal lifecycle (from `conxa-edge-case-framework.md` §0):

```
RESOLVE (late-bound, multi-signal, scored, frame/shadow/hover-aware, uniqueness-gated)
   → GATE (attached→visible→stable(RAF)→enabled + hit-target)
      → ACT (action-type-correct handler)
         → VERIFY (independent post-condition — ALWAYS, even on apparent success)
            → pass: next step · fail (hard OR silent): RECOVER
```

The replay layer never holds a node handle (insight #10), always re-queries, scores live candidates against the fingerprint with a uniqueness gate (G5), and uses **confidence-aware adaptive timeouts** instead of the blunt 700ms fail-fast (top-50 #8). Conditional steps make replay branch deterministically on stochastic states (G6).

---

## 7. Verification Layer (Runtime, zero-token — Phase 5)

**The most important addition.** After every consequential step — and *every recovered/forced action* — verify the **intended state** via a channel the action did not use, against the compiled post-condition fingerprint. This converts "didn't throw" into "achieved the goal," catching silent wrong-element actions (EC-28) and gating every repair. Without it, all recovery can "succeed" incorrectly. Detailed in `final-verification-architecture.md`.

---

## 8. Recovery Layer (Runtime — Phase 6)

A five-tier cascade, zero-token first, AI only at the residual edge:

| Tier | Mechanism | Cost | When |
|---|---|---|---|
| 1 Deterministic | actionability gate + exception-classified ladder + scored re-resolution | `Z` | always first |
| 2 Fingerprint | a11y role+name, anchor/relational re-find, frame/shadow re-resolution, scroll-until-found, re-hover | `Z` | Tier-1 miss |
| 3 Context (host) | describe-then-match via MCP sampling against live AX + recorded fingerprint | `H` | all `Z` exhausted |
| 4 Vision | scaleFactor-normalized grounder → bbox → re-derive selector | `V` | DOM-opaque |
| 5 Human | structured CALL_USER handoff | `U` | MFA/captcha/destructive/exhaustion |

**Every tier's result re-enters Verification.** Successful repairs above Tier-1 emit a `repair_event` to Cloud for fleet write-back (insight #11) — used ephemerally locally, re-signed centrally. Detailed in `final-recovery-architecture.md`.

---

## 9. Failure Layer (Runtime — Phase 9)

When recovery is exhausted or a non-recoverable failure is classified, the runtime **fails honestly**: a typed failure (selector / frame / shadow / verification / recovery / permanent), a checkpoint of last-completed step (insight #16) for resumable long flows, telemetry to the flywheel, and — for destructive/sensitive steps — an immediate stop rather than a guess. No silent success, ever. Detailed in `final-failure-model.md`.

---

## Information flow (end to end)

```
human action
  → bridge.js raw event (+ frame/shadow chain, a11y, bbox, anchors, screenshot)
    → IR step (intent, action-type, expected-outcome, decision-points)        [Understand]
      → enriched step (orthogonal identity+scores, fingerprint, post-condition,
                       recovery hints, conditionals, confidence)              [Enrich]
        → compiled step (filtered, durability-ordered, boundary-safe, verified) [Compile]
          → SIGNED PACK  ──publish──▶ Cloud ──delta-sync──▶ Runtime
            → RESOLVE→GATE→ACT→VERIFY  (deterministic)                         [Replay+Verify]
              → on fail: RECOVER (Z→H→V→U), re-VERIFY each tier               [Recover]
                → repair_event ──telemetry──▶ Cloud FLYWHEEL ──re-sign──▶ fleet
                → on exhaustion: typed FAILURE + checkpoint + honest stop      [Fail]
```

**The two feedback loops that make the system compound:**
1. **Verification → Recovery** (local, per-run): verification is the detector that triggers recovery and the gate that validates it.
2. **Recovery → Flywheel → Fleet** (global, cross-run): a heal on one runtime becomes a re-signed pack for all runtimes before they hit the same drift (insight #1 — the moat).

---

## Where AI is and is not

| Layer | AI? | Justification |
|---|---|---|
| Recording | No | mechanical capture |
| Understanding | **Yes (Studio)** | intent extraction — frozen into pack |
| Enrichment | **Yes (Studio)** | semantic naming — frozen into pack |
| Compiler | Mostly no | deterministic lowering; LLM only for residual semantic labels |
| Skill Pack | No | static artifact |
| Replay | **Never** | hot path is pure deterministic interpretation |
| Verification | **Never** | deterministic post-condition checks |
| Recovery Tier 1–2 | **Never** | zero-token deterministic |
| Recovery Tier 3 | **Yes (host)** | describe-then-match, bounded, verified |
| Recovery Tier 4 | **Yes (vision)** | walled-off last resort, verified |
| Repair-validation | **Yes (Cloud)** | re-sign; never executes |

This table *is* the philosophy. Every later phase must conform to it.

---

## Success criterion (answered in full by Phase 10)

If built exactly as specified, replay reliability exceeds Playwright codegen (single brittle selector, no verification), SeleniumBase replay (no compiled identity, no fleet learning), Stagehand (lazy runtime grounding, non-deterministic, no signing), browser-use (LLM in hot path), and Fable-class CUA (vision-first, no determinism) — **while preserving** deterministic execution, enterprise trust, the signed skill-pack architecture, the fleet drift flywheel, and independent outcome verification. The proof is mechanism-by-mechanism in `final-implementation-blueprint.md`.
