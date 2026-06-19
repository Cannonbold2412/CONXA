# Conxa Future Runtime Architecture (24-Month Target)

**Scope:** the local Node MCP runtime only — the deterministic record→compile→**distribute→execute** loop's last mile. Design-only.
**Grounding:** current-state §7 (Runtime) / §8 (Recovery) + cross-cutting finding; gap-analysis G2/G4/G5; master-insights R1/R2/R3 + D1/D2/D3; top-25 #2/#3/#4/#8/#10; high-value-repo-review (Playwright gates, SeleniumBase classified ladder, Stagehand independent probe).
**Recovery (Tier 3+) is specified conceptually here and owned in detail by `future-recovery-architecture.md`.** This document hands off to it at one clean seam and does nothing more.

## 0. The thesis the runtime must finally deliver

Today's runtime markets a differentiator it does not implement (current-state, cross-cutting finding). The compile-time `ElementFingerprint`, `selector_score.py`, and layered `confidence` are emitted and then **ignored** by `run.js`, which tries `compiled_selectors` in array order, waits for `visible` and acts (no stable/RAF gate), fires on a blunt `ACTION_TIMEOUT_MS=700`, and never verifies a post-condition (`verifyAssertions()` is documented in TRD §9.1 but undefined in code). The future runtime's mandate is narrow and total: **cash in the compile-time assets the runtime currently discards, and make every action trustworthy — without ever putting an LLM in the deterministic hot path.**

**Hard invariants carried forward (reject any violation):** zero LLM tokens in Tier 1/2; AI allowed only at Tier 3+ and handed off, never inlined; iframe chain preserved verbatim; `frame_enter`/`frame_exit` carry `no_recovery_block` and are never retried; execution is entirely local — the cloud never executes; Conxa is not an agent/RPA/test tool — it replays compiled skills.

## 1. Clean internal architecture (decompose the monolith)

`run.js` (executor+ladder, 774 lines) and `server.js` (protocol+lifecycle+recovery-payload+telemetry, 1043 lines) are monoliths. Split into five single-responsibility modules behind narrow contracts, so each is independently testable, replayable, and replaceable.

| Module | Owns | Hard boundary |
|---|---|---|
| **Resolver** | late-bound identity → live candidate set → fingerprint score + uniqueness gate → one `Locator` | pure; no actions, no LLM, no I/O |
| **Gate** | actionability stack attached→visible→stable(RAF)→enabled with confidence-aware budget | pure; returns ready/not-ready + reason class |
| **Executor** | dispatch the action verb on a gated locator; human pacing; iframe roots | never resolves identity itself — asks Resolver |
| **Verifier** | independent post-condition probe vs compiled fingerprint | uses a **channel the action did not use** |
| **Recovery-Orchestrator** | classified deterministic ladder (Tier 1/2); then **hands off** to recovery subsystem (Tier 3+) | zero-LLM up to the handoff line; never calls a model itself |
| **Telemetry** | structured per-step record; batch → tracker.js | append-only; signable; feeds the fleet flywheel |

`server.js` shrinks to a `ServerBackend` seam (transport/registry/lifecycle/lock) per top-25 #5; it constructs a `StepEngine` from the six modules and owns nothing about how a step runs. The **Recovery-Orchestrator is the only module permitted to cross the zero-LLM boundary**, and it does so by delegation, not invocation — this is the architectural enforcement point for the invariant.

**Invariant preserved:** zero-LLM is a *structural* property — only one module touches the boundary, and it cannot inline a model by construction.

## 2. Deterministic execution — late-bound identity + live fingerprint scoring

**Late-bound identity, re-resolved every attempt (D2/#10).** A step's identity is the serializable `(frame_chain, signal_set)` — never a node handle. `frame_chain` is the verbatim iframe chain already in `step.frame.chain` (resolved through `frameLocator`, invariant intact). `signal_set` is the compiled `ElementFingerprint` (role, testid, aria_label/name, label_text, inner_text, input_type, css_class_tokens, anchor_phrases, position_hint) **plus** the `compiled_selectors[]`. The Resolver re-derives a fresh `Locator` on every attempt and every recovery rung; stale handles are impossible by construction.

**Ordered-by-durability multi-signal resolution with a LIVE fingerprint score + uniqueness gate (G5, D1, #3).** This is the central change. The Resolver does **not** take the first selector that resolves. It:
1. enumerates candidate locators from the signal set **ordered by durability** — semantic (role+name, testid, anchored text) before structural (CSS) before positional (XPath/nth). Both Tier 1 and Tier 2 are zero-token, so the tie-break is success-probability, not microseconds (fixes the current array-order behavior and the audit C.1 ordering contradiction).
2. for each, applies the **live uniqueness gate** (Playwright's rule, moved to *replay*): a candidate is eligible only if it matches **exactly one** element in the live DOM right now. A cheap selector that has become ambiguous (a second "Submit" appeared) is rejected, not guessed.
3. **scores surviving candidates against the live DOM** by re-running the compile-side scoring logic (`selector_score.py`, ported to a pure JS `scoreCandidate(fingerprint, liveElement)`) — testid/role/name agreement reward, GUID-ish id penalty, anchor-phrase proximity, position_hint distance. The highest unique scorer wins. This is the live scoring TRD §10.2 promises and the runtime never did.

**Data/contract change:** the package's `ElementFingerprint` becomes a **runtime-consumed** asset, not a decorative one; the runtime ships a deterministic `scoreCandidate()` mirroring the compiler's weights (versioned together so compile and replay agree). Add a **deterministic Playwright-style generator floor** at compile so identity never depends solely on an LLM (G5); the runtime treats it as one more orthogonal signal.

**Invariant preserved:** zero-LLM, fully deterministic — scoring is arithmetic over live DOM, no inference.

## 3. Reliability

### 3a. Actionability gates replace naive visible-then-act (R3, #8, G4)

`withLocator` currently does `waitFor({state:"visible"})` then acts. Replace with a re-querying **gate stack** run before *every* interactive action: **attached → visible → stable(RAF) → enabled**, where `stable` polls `boundingBox()` unchanged across ≥2 animation frames (the check most frameworks omit; kills the animated/lazy/just-rendered flake class). The gate re-queries through the Resolver each poll (late-bound), returns a typed not-ready reason on timeout, and **never blind-acts**. `frame_enter`/`frame_exit`/noop steps skip the gate (they are markers).

### 3b. SeleniumBase-style exception-classified deterministic ladder as Tier 1/2 (R2, #4, G4)

Replace the fixed ladder and the one-line `clickFirst` `last()` intercept hack with a **typed-failure → typed-remedy** table, escalating by invasiveness, each rung gated on the prior throwing — all zero-token:

| Failure class (from gate reason / error) | Tier-1 remedy |
|---|---|
| `stale` / detached | re-resolve via Resolver (free; late-bound) |
| `intercepted` ("intercepts pointer events") | dismiss known overlays → JS `dispatchEvent` click |
| `out_of_bounds` / not stable | re-scroll into view, re-gate |
| `not_unique` | re-run uniqueness gate → next durable signal |
| `not_visible/attached` (transient) | bounded re-poll within budget |
| benign driver noise | swallow, continue |

Only when the classified ladder (Tier 1) and the a11y/fingerprint re-resolution (Tier 2) are exhausted does control leave the zero-LLM region. **Every forced rung (esp. JS-dispatch) is mandatorily paired with §4 post-condition verification** — SeleniumBase's own blind spot, and the thing Conxa must beat, not copy.

### 3c. Confidence-aware per-step timeout budgets (replace the blunt 700ms)

Consume the compiled `confidence/layered.py` score the runtime ignores today. Each step carries a `timeout_budget` derived from confidence (high-confidence durable identity → tight budget; low-confidence/complex step → generous budget), bounded `[floor, ceiling]`. The gate and action share this budget instead of the global `ACTION_TIMEOUT_MS=700`. Adaptive, not aggressive-fixed.

**Human-pacing / anti-bot preserved verbatim:** `HUMAN_DELAYS`, `observer_ms`, and post-navigation pacing are untouched — they sit *outside* the gate/timeout budget so watchability and anti-bot characteristics are unchanged.

**Data/contract change:** steps gain `timeout_budget` (compiled from confidence) and a `gate_policy` (which gates apply). **Invariant preserved:** zero-token; pacing intact.

## 4. Independent post-condition verification after EVERY step (R1, #2, G2 — the missing `verifyAssertions`)

This is the single highest-leverage addition and the thing that makes a *recovered or forced* action trustworthy. After every interactive step, the Verifier re-reads the target state **through a channel the action did not use** and compares it to a **compiled post-condition fingerprint**:
- action filled a value via the DOM `Locator` → verify by reading the live **AX tree** value / `aria` state, not the same node it just wrote.
- action clicked to reveal a panel → verify the expected post-state element/URL/role appeared (independent probe), not "click didn't throw."

The compiler emits a first-class `post_condition` per step (expected role/name, value, URL pattern, or appearance/disappearance of an anchor) — generated from the intent graph + `validation_planner.py`, promoted from "explicit `assert` step type only" to **every step**. Verification outcome is `{satisfied, channel, observed, expected}`; an unsatisfied required post-condition fails the step (and triggers recovery on the *outcome*, not the selector); advisory ones are batched into the run report (#25). This converts recovery *success-rate* into recovery *correctness* and closes the field-wide blind spot — a forced JS click that fires on nothing is now caught.

**Data/contract change:** new `post_condition` asset per step in the package; Verifier module; the probe is read-only and zero-token. **Invariant preserved:** deterministic, local, zero-LLM (an AX-tree read, not a model call).

## 5. Auditability — structured, replayable, signable execution record

Every step emits one immutable `StepRecord`:

```
{ run_id, skill, step_index, action,
  identity_used:   { signal_kind, selector, score, unique:bool },
  tier:            "t1_direct" | "t1_classified:<class>" | "t2_a11y" | "t3_handoff",
  gates:           { attached, visible, stable, enabled, budget_ms },
  post_condition:  { satisfied, channel, observed, expected },
  timings_ms:      { resolve, gate, act, verify, total },
  attempts, recovered:bool, ts }
```

Records are append-only, ordered, and **deterministically reproducible** given the same package + inputs + DOM — making a run **replayable and signable** (a run digest can be signed for audit/SLA evidence). This is the runtime-side substrate for positioning determinism on *auditability*, not cost (top-25 #22) — a regulator gets "what was resolved, why, and whether the outcome occurred," not "the model usually does this."

**Invariant preserved:** the record proves zero-LLM in Tier 1/2 (tier field is explicit); local-only.

## 6. Observability — telemetry that feeds the fleet flywheel

The current `tier_ok`/`rec_ok`/`step_fail` events are too coarse to drive fleet learning. Telemetry emits, per step: resolved signal kind + score, gate failures by class, **drift hints** (a durable signal stopped being unique; position_hint distance grew; a fingerprint field no longer matches), recovery tier reached, and post-condition mismatches. These are the raw signal for **G3 fleet drift detection** and **G7 breakage classification** (cross-ref durability/cloud docs): when one runtime's Resolver detects a signal degrading on site X, Cloud aggregates across the fleet and can re-sign a package *before* other customers hit the failure. A Tier-3 heal emits its recovered signal as **telemetry write-back only** (C1/#11) — used ephemerally for the current run, never silently rewritten into the signed local artifact; Cloud validates and re-signs. The runtime's job is to *emit clean drift signal*, not to learn locally.

**Data/contract change:** richer telemetry event schema (new codes for gate-class, drift-hint, post-condition-miss). **Invariant preserved:** signed-package immutability (no in-place local mutation); local execution.

## 7. Performance — adaptive timing + checkpoint/resume

**Adaptive timing** replaces fixed aggressive timeouts: confidence-derived per-step budgets (§3c), RAF-stability instead of fixed waits, and post-navigation pacing only when the prior step could navigate (already correct in `waitForPageLoadAndPace`). Fast where the page is fast; patient where confidence is low — without the global 700ms cliff that today escalates timing flake straight to host-delegated recovery.

**Checkpoint/resume on crash (E4/#16, gap).** `state.json`/`checkpoint.json` dirs exist (TRD §8 filesystem layout) but `run.js` writes no step checkpoints — `resume_from` is an LLM-passed integer only. Design: after each **verified** step, the engine writes `checkpoint.json = { run_id, skill, last_verified_index, inputs_digest, package_version, ts }` (atomic temp-rename). On a mid-skill browser/process crash, the engine resumes from `last_verified_index + 1` **only if** `package_version` and `inputs_digest` match — otherwise restart clean. Resume is gated by the existing `RETRY_BUDGET_MAX` so a poison step can't loop. Checkpointing on the *verified* boundary (not the *attempted* one) means resume never re-does a step whose outcome already occurred.

**Data/contract change:** `checkpoint.json` step-level schema; engine writes it. **Invariant preserved:** deterministic, local.

## 8. Scalability — single-execution-lock; attended vs unattended; the recovery handoff

The single-execution-lock per runtime (`activeExecution`) is correct and kept — one browser, one skill at a time, local. The real scalability question is **attended vs unattended**, because today's "self-healing" above the deterministic floor is **host-delegated** (`server.js` packages screenshots + 50-element DOM digest + reference image and returns them to Claude Desktop). That works only when a human/host is watching; **unattended/scheduled runs cannot self-heal** (current-state §8 — the platform's biggest reliability risk).

Design a **clean handoff at the zero-LLM boundary** rather than a forked recovery path:

- The Recovery-Orchestrator exhausts Tier 1/2 deterministically (identical attended/unattended).
- On exhaustion it constructs a transport-agnostic **`RecoveryRequest`** — `{ step_identity, recorded_signals, ranked_capped_AX_snapshot, frame_chain, post_condition, failure_class, page_fingerprint }` (target-anchored, rank-and-capped per #13, never blind-truncated) — and **hands it to the recovery subsystem** (`future-recovery-architecture.md`). The runtime does not know or care whether Tier 3 is satisfied by host MCP sampling (attended) or an autonomous host-sampled re-grounding (unattended) — that is the recovery subsystem's mode decision.
- **Attended mode:** handoff resolves via host MCP sampling; the runtime receives a `{action, target_description}` (describe-then-ground, #6 — never a raw selector), the Resolver grounds the description against the live AX tree *jointly with the recorded signals*, the action runs, and **§4 verifies the outcome** before advancing.
- **Unattended mode:** the recovery subsystem returns either a grounded description (auto-applied + verified) or a clean **escalation outcome** (Tier-5 CALL_USER-style honest failure with full `StepRecord` context, #17) — never a silent hang, never a fabricated success.

The runtime's contribution is the **boundary and the request contract**; the modes live in the recovery subsystem. This keeps the LLM out of the hot path *and* out of the runtime entirely — Tier 3+ is delegated across a process/protocol seam.

**Invariant preserved:** zero LLM in runtime; AI only beyond the handoff line; iframe chain travels in `RecoveryRequest`.

## 9. The future step-execution loop (conceptual)

```
for step in plan[resume_from:]:
  if step.type in NOOP/frame_marker:        execute marker; continue   # no_recovery_block honored
  identity   ← (frame_chain, signal_set)                               # late-bound, re-resolved
  ── RESOLVE ──  candidates ← order_by_durability(signal_set)          # zero-LLM
                 candidates ← uniqueness_gate(candidates, liveDOM)
                 locator    ← argmax score(scoreCandidate(fp, c))      # live fingerprint scoring
  ── GATE ────  attached→visible→stable(RAF)→enabled  within confidence_budget
  ── ACT ────   executor.dispatch(action, locator)   # human pacing preserved
                on typed failure → CLASSIFIED LADDER (stale/intercepted/OOB/...)  # Tier 1, zero-LLM
                still failing    → a11y/fingerprint re-resolve          # Tier 2, zero-LLM
  ── VERIFY ──  Verifier.probe(post_condition, channel ≠ action's)      # independent, zero-LLM
                if forced/recovered: verification is MANDATORY
  ── CHECKPOINT ──  if satisfied: write checkpoint.json(last_verified=i) # atomic
  ── TELEMETRY ──   emit StepRecord (identity, tier, gates, post_cond, timings, drift hints)
  ── RECOVER-IF-NEEDED ──
       if not satisfied AND Tier1/2 exhausted:
           ╎══════════ ZERO-LLM BOUNDARY ══════════╎   ← LLM never crosses left of here
           build RecoveryRequest(target-anchored, capped AX, frame_chain, post_condition)
           HAND OFF → recovery subsystem (future-recovery-architecture.md)
              attended:   describe-then-ground via host sampling → re-resolve → ACT → VERIFY
              unattended: autonomous re-ground+verify  OR  honest Tier-5 escalation
           heal success → use ephemerally + telemetry write-back (Cloud re-signs); never mutate local pkg
```

**Where the zero-LLM boundary sits:** everything left of the marked line — resolve, gate, act, classified ladder, a11y/fingerprint re-resolve, verify, checkpoint, telemetry — is deterministic and token-free. The boundary is crossed *only* by handing a request object to a separate subsystem. No module left of the line can call a model; the Recovery-Orchestrator is the sole gatekeeper and it delegates rather than invokes.

## 10. Migration path from today's run.js / server.js

1. **Carve seams without behavior change.** Extract `Resolver`/`Gate`/`Executor`/`Verifier`/`Recovery-Orchestrator`/`Telemetry` from `run.js`; reduce `server.js` to the `ServerBackend` lock/lifecycle. Pure refactor, existing behavior, full test coverage first.
2. **Land the cheap zero-token wins (G4).** Replace `withLocator`'s visible-then-act with the actionability gate stack; replace `clickFirst` + fixed ladder with the classified ladder. Highest reliability-per-line; no contract change.
3. **Wire the fingerprint (G5).** Port `selector_score.py` → pure `scoreCandidate()`; add uniqueness gate + durability ordering in Resolver. Runtime begins consuming the asset it ignored.
4. **Add the Verifier (G2).** Compiler emits `post_condition` per step; runtime verifies every step via an independent channel. Unlocks trustworthy recovery — prerequisite for G1/G7.
5. **Confidence budgets + checkpointing.** Consume `confidence` for `timeout_budget`; write `checkpoint.json` on verified boundaries; resume gated by package_version + budget.
6. **Recovery handoff seam.** Replace ad-hoc `server.js` recovery-payload builder with the `RecoveryRequest` contract and a clean delegation to the recovery subsystem; attended mode first (host sampling), unattended mode owned by `future-recovery-architecture.md`.
7. **Telemetry enrichment** for drift/breakage signal → feeds Cloud flywheel (G3/G7).

Each step is independently shippable and reliability-positive; the order respects the dependency `G4+G2 → trustworthy floor → G1 recovery → G3 flywheel`.

## 11. Philosophy compliance check

| Principle | Compliance |
|---|---|
| Zero LLM in deterministic hot path | **Upheld** — resolve/gate/act/classified-ladder/a11y/verify/checkpoint/telemetry are arithmetic + DOM/AX reads; one module owns the boundary and *delegates* rather than invokes. |
| Tier 1/2 cost zero LLM tokens | **Upheld** — classified ladder and fingerprint re-resolution are token-free; live scoring is arithmetic. |
| AI allowed only at Tier 3+ | **Upheld** — and pushed *out of the runtime entirely* across a handoff seam; runtime never calls a model. |
| Iframe chain preserved verbatim | **Upheld** — identity carries `frame_chain` through resolve, recovery, and `RecoveryRequest`. |
| `frame_enter`/`frame_exit` → `no_recovery_block` | **Upheld** — markers skip gate/recovery; never retried. |
| Execution entirely local; cloud never executes | **Upheld** — all modules local; Cloud only receives telemetry and re-signs packages. |
| Not an agent/RPA/test tool | **Upheld** — replays compiled skills with verified outcomes; no open-world tools, no autonomous goal-seeking in the runtime. |
| No in-place mutation of signed package | **Upheld** — heals are ephemeral + telemetry write-back; Cloud re-signs. |

---

**Summary.** This document specifies a runtime that finally consumes the compile-time assets `run.js` discards — re-resolving late-bound identity each attempt, scoring live DOM candidates against the `ElementFingerprint` behind a uniqueness gate, gating actions through attached→visible→stable(RAF)→enabled on confidence-derived budgets, and running a SeleniumBase-style exception-classified zero-token ladder before any model — then makes every action trustworthy by verifying an independent compiled post-condition after each step. It decomposes the two monoliths into Resolver/Gate/Executor/Verifier/Recovery-Orchestrator/Telemetry, adds step-level checkpoint/resume and a structured signable execution record, and places the zero-LLM boundary at a single delegation seam where Tier 3+ is handed to the recovery subsystem (`future-recovery-architecture.md`) — attended via host sampling, unattended via autonomous re-grounding or honest escalation — so AI never enters the runtime's hot path. Every section names its data-contract change and the invariant it preserves, and the philosophy-compliance check confirms zero-LLM determinism, verbatim iframe handling, local-only execution, and signed-package immutability all hold.
