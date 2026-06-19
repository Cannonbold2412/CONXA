# Future Recovery Architecture (Phase 7)

**Design goal:** Turn Conxa's marketed "self-healing 5-tier cascade" — which today is a deterministic ladder plus *host-delegated manual resume with no write-back* (`conxa-current-state-assessment.md` §8) — into a real, autonomous, verified, fleet-learning recovery system that is **safe for unattended execution**.

**Hard constraint (invariant):** Tier 1/2 cost **zero LLM tokens**. The LLM enters at Tier 3+ only. The runtime never calls a paid LLM API directly; when an LLM is needed it is the **host model reached via MCP sampling** (the same model already attached to Claude Desktop) — preserving "runtime uses AI minimally" while enabling autonomy. `frame_enter`/`frame_exit` are never recovered.

**This is a design document. No implementation.**

---

## 1. What's wrong today (the design must fix)

1. **Not autonomous.** "Tier 3/4/5" = `server.js` returns screenshots + a 50-element DOM digest to Claude Desktop and asks a human/Claude to fix the selector and call `execute_skill` with `resume_from`. Unattended/scheduled runs have no one to delegate to → Tier 3+ is effectively *failure*.
2. **No write-back.** A fix Claude produces is used once; the skill package is unchanged; the next run re-breaks at the same step.
3. **No classification.** The deterministic ladder runs the same sequence regardless of failure cause; there is no confidence- or cause-driven ordering.
4. **No repair validation.** "Recovered" means "the resumed step didn't throw" — not "the intended outcome occurred."
5. **No fleet learning.** Recovery telemetry is emitted but never aggregated; every customer rediscovers the same drift.

---

## 2. The seven-stage recovery pipeline

A single, ordered pipeline replaces the ad-hoc split between `run.js` (ladder) and `server.js` (payload). Each stage has a defined input, output, and cost class.

```
Failure ─▶ (1) Detection ─▶ (2) Classification ─▶ (3) Orchestration ─▶ (4) Repair Validation
                                                          │                      │
                                                  (5) Confidence Scoring ◀───────┘
                                                          │
                                          pass? ─yes─▶ write-back (ephemeral local + telemetry→Cloud)
                                            │
                                            no ─▶ (6) Escalation ─▶ (7) Human Handoff
```

---

### Stage 1 — Failure Detection

**Two triggers, not one:**
- **Hard failure:** the action threw (today's only trigger).
- **Soft failure (NEW):** the action *succeeded* but the **independent post-condition** failed (the verifier from `future-runtime-architecture.md` / gap G2). This catches the SeleniumBase blind spot — a forced JS click that "worked" but achieved nothing. Soft failures are the dominant *silent* enterprise failure and today are invisible.

Detection emits a `FailureContext`: step, intent, recorded `ElementFingerprint`, primary selector, frame chain, pre/post page fingerprint, exception (if any), post-condition delta (expected vs actual state), and a cheap page fingerprint (url + interactive-element count + DOM-text hash, from browser-use's stall detector).

---

### Stage 2 — Failure Classification

Classify *before* acting (SeleniumBase's "exception type is a free signal," generalized). The class selects the recovery strategy and its expected cost:

| Class | Signal | First remedy (cost) |
|---|---|---|
| **Transient** | stale handle, mid-animation, load race | re-find / wait-stable (zero) |
| **Intercepted** | overlay/modal/pointer-intercept | dialog-scope, JS-dispatch (zero) |
| **Drifted-identity** | element gone but page is the right one | multi-signal re-resolution + scoring (zero) |
| **Structural-change** | DOM restructured, signals partially survive | orthogonal-signal fallback + describe-then-match (Tier 3 if needed) |
| **Stochastic-state** | unexpected banner/interstitial/MFA present | conditional handler (zero) — see §4 |
| **Auth-failure** | login redirect / session expired | re-auth self-heal (zero) — already built, keep |
| **Page-wrong** | navigation/precondition failed | re-establish precondition or fail fast |
| **Infeasible** | target genuinely absent / task impossible | escalate, don't burn tokens |

Classification is deterministic and zero-cost. It prevents the current waste of running the full ladder for an auth failure or a stochastic banner.

---

### Stage 3 — Recovery Orchestration (the cascade, redefined)

The cascade is **cost-ordered within the zero-token band, then escalates**. Crucially, the zero-token band is ordered by **success probability / durability** (semantic before structural — fixing the `research-audit.md` C.1 contradiction), not by microseconds.

| Tier | Mechanism | Cost | Notes |
|---|---|---|---|
| **T1 — Deterministic identity** | Live multi-signal resolution scored against the recorded fingerprint, with a uniqueness gate; orthogonal signals tried semantic→structural; classified remedies (re-find / JS-dispatch / re-scroll / dialog-scope) | **Zero** | This is today's ladder *plus* the live fingerprint scoring the runtime currently lacks (G5). Most recoveries end here. |
| **T2 — Accessibility re-resolution** | AX-tree role+name match against recorded a11y subtree; pre-filtered to the target's neighborhood | **Zero** | Durable substrate; ordered ahead of structural CSS. |
| **T3 — Host semantic re-grounding (autonomous)** | Via **MCP sampling**, hand the host model: recorded intent + recorded fingerprint + a **pre-filtered AX digest (<500 nodes, WorkArena)** and ask it to **describe-then-match** (SeeAct: emit a target *description*, NOT a selector) → deterministic matcher resolves the description against the live AX tree | **Host LLM (text)** | Autonomous — no human needed. Conxa's edge over SeeAct: match against the *recorded target*, not a blank task. |
| **T4 — Vision re-grounding** | Screenshot + bbox anchor (from compile-time `visual_ref`) → host vision (or grounder) returns normalized coords → re-derive a DOM selector via hit-testing (scaleFactor-normalized) → never click raw pixels if a selector can be recovered | **Host vision** | See `future-vision-architecture.md`. Rare; DOM-hostile surfaces. |
| **T5 — Human handoff** | Structured pause-and-escalate (see Stage 7) | **Zero** | Last resort; rule- or exhaustion-triggered. |

**Autonomy is the key change:** T3/T4 are driven by the runtime via MCP sampling against the host model, not by returning a payload and hoping a human resumes. For *attended* runs the host is Claude Desktop; for *unattended/scheduled* runs the runtime is configured with a sampling endpoint (the host's model surface) so T3 still works headless — and if no sampling surface is available, the run escalates cleanly to T5 rather than silently failing.

---

### Stage 4 — Repair Validation (NEW — the trust gate)

A repaired identity is **never trusted on "didn't throw."** Before a repair is accepted:
1. Execute the repaired action.
2. Run the **independent post-condition** (Stage 1's verifier) — re-read intended state via a channel the action didn't use, compare to the compiled post-condition fingerprint.
3. Only a passing post-condition marks the repair valid.

This is the field-wide blind spot (`master-insights-v2.md` R1) applied to recovery: it's what separates Conxa's recovery (correct) from SeleniumBase's (merely successful) and from browser-use/UI-TARS (which trust the model's self-report).

---

### Stage 5 — Confidence Scoring

Each accepted repair carries a confidence derived from: which tier resolved it, the live fingerprint score / uniqueness margin, the post-condition strength, and agreement across orthogonal signals. Confidence drives three decisions:
- **Write-back gating:** only high-confidence repairs are proposed to the Cloud for re-signing; low-confidence repairs are used for *this run only* and flagged.
- **Escalation:** below-threshold → escalate rather than proceed on a shaky repair (especially for destructive/sensitive steps — see Stage 7 rule-trigger).
- **Fleet weighting:** confidence weights the fleet aggregation (Stage = write-back below).

---

### Stage 6 — Escalation

Deterministic policy, not vibes:
- **Exhaustion-triggered:** all viable tiers tried, no valid repair → escalate.
- **Rule-triggered (NEW, UI-TARS CALL_USER generalized):** certain step classes *always* escalate before acting regardless of recovery success — destructive actions (delete, pay, submit-irreversible), steps the compiler marked sensitive, or steps touching `destructive_semantics.py` categories. Rule-triggers are deterministic and auditable.
- **Budget-triggered:** retry budget (already `RETRY_BUDGET_MAX=3`) or a cost ceiling for host-LLM tiers.

Escalation produces a structured, replayable record — not a free-text dump.

---

### Stage 7 — Human Handoff

A **first-class MCP state**, not an error string (today it's a text payload). Design:
- A formal handoff response: intent, what was attempted per tier, the failure class, screenshots/AX digest, and a *specific* resumable action (`resume_from`, or "re-authenticate," or "confirm this destructive step").
- For **attended** runs: surfaced to the user via the host with the SoM-annotated screenshot.
- For **unattended** runs: enqueued to a Cloud **review queue** (the durability system consumes it; a human or the publishing company resolves it, and the resolution can become a package fix).
- The auth re-auth window (already built) is the canonical example of a clean, scoped handoff — generalize its pattern.

---

## 3. Write-back: healing the artifact without breaking determinism

This is the change that makes durability real (and resolves `research-audit.md` C.3 — Stagehand's in-place mutation is *incompatible* with Conxa's signed, central-compile model).

**Two-phase heal:**
1. **Ephemeral (local, this run):** the validated repaired identity is used for the current execution only. It does **not** mutate the signed package on disk. Determinism + signing preserved.
2. **Durable (Cloud, fleet):** the runtime emits a `repair_event` (recorded fingerprint → repaired signal, confidence, post-condition result, app-version fingerprint, anonymized) to the Cloud. The Cloud validates the repair across the fleet (Stage = durability), and if corroborated, **re-compiles/re-signs a new package version** and pushes it. The local runtime never silently rewrites the artifact.

Result: the *first* customer to hit drift heals autonomously *and* feeds a fix that protects *everyone* — the flywheel (`top-25-insights.md` #1), realized through recovery.

---

## 4. Stochastic states (closing the linear-replay gap)

Many "failures" are not failures — they're *optional states* the recording didn't include (cookie banner present this run, absent last run). These must be handled at recovery's Stage 2 (classified as **Stochastic-state**) AND, preferably, *compiled* as conditional steps (`if_present`/`try_dismiss`, gap G6, `future-compiler-architecture.md`). Recovery's role: when an unexpected interstitial blocks a step, deterministically detect-and-dismiss known stochastic patterns (consent frameworks, "session continue?" modals) before declaring failure, and emit a `stochastic_state_observed` event so the Cloud can promote it into a compiled conditional in the next package version. Recovery thus *teaches the compiler* about branches it missed.

---

## 5. Lessons mapped to sources

- **SeleniumBase:** exception-classified, invasiveness-escalating zero-token ladder (Stage 2/3 T1). Adopt wholesale; add the post-condition SeleniumBase lacks.
- **Stagehand:** recovery reuses the grounding path; independent probe as ground truth (Stage 4); self-heal-then-refresh — but **adapted** to telemetry→re-sign, not in-place local mutation (Stage write-back).
- **Browser Use:** AX-tree + computed-styles re-grounding, reflection-in-output, page-fingerprint stall cap (Stage 1 soft-fail fingerprint; T3 input; retry bound). Reject its per-step LLM loop.
- **Fable / host model (MCP sampling):** the LLM tiers run on the host model already present — autonomy without a paid runtime API and without violating "runtime uses AI minimally."
- **UI-TARS:** CALL_USER → Stage 7 handoff as a first-class state; rule-triggered escalation (Stage 6); SoM annotation for handoff/telemetry. Reject vision-as-primary.

---

## 6. Confidence & cost model

- T1/T2: zero tokens, milliseconds — must catch the large majority (the SeleniumBase thesis; instrument the hit-rate, `research-audit.md` §E).
- T3: bounded host-LLM text calls, capped per (skill, step) by retry budget and a token ceiling; pre-filtered context keeps it cheap.
- T4: rare; bounded; vision only when DOM grounding is impossible.
- Every tier above T2 must produce a *validated* repair (Stage 4) or it doesn't count — no "successful" unverified recoveries.

---

## 7. Migration path (no rewrite)

1. **Extract** recovery from `run.js`/`server.js` into a `recovery-orchestrator` module with the 7 stages (preserves current deterministic ladder as T1/T2).
2. **Add** the independent post-condition verifier (G2) — immediately upgrades detection (soft failures) and validation.
3. **Wire** live fingerprint scoring into T1 (G5) — the fingerprint already exists in the package.
4. **Replace** the host-delegated payload with **MCP-sampling-driven T3** (autonomous describe-then-match) while keeping the human-handoff payload as the T5 fallback.
5. **Add** the `repair_event` emission → Cloud write-back loop (depends on durability/cloud work).
6. **Generalize** the auth re-auth handoff into the Stage-7 handoff state and add rule-triggered escalation.

Each step is independently shippable and strictly improves reliability.

---

## 8. Philosophy compliance

✅ Tier 1/2 remain zero-LLM (invariant upheld). ✅ AI is used at recovery only, and via the host model through MCP sampling (runtime uses AI minimally; no paid runtime API). ✅ Deterministic hot path untouched. ✅ Iframe/no-recovery rules preserved. ✅ Not an agent — recovery heals a *recorded, compiled* workflow toward its *recorded intent*; it never free-roams. ✅ Write-back respects signed, central-compile (no silent local mutation). **No violations.** The one judgment call: T3/T4 autonomy for unattended runs requires a host-model sampling surface; where absent, the system escalates rather than degrading determinism — the safe default.
