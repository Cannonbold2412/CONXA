# Final Failure Model (Phase 9)

**Purpose:** classify every way a step can fail, decide which are recoverable vs terminal, and guarantee the system **never reports false success**. Honest, typed failure is an enterprise-trust feature, not a defect — it is the precondition for SLAs (insight #22) and the fuel for the flywheel (insight #1).

**Two governing rules:**
1. **No silent success.** A step is PASS only if its independent post-condition passes (Phase 5). "Didn't throw" is never success.
2. **No guess on irreversible actions.** A Low-confidence or ambiguous resolution on a destructive step terminates to human handoff rather than acting.

---

## 1. Failure taxonomy

Failures are typed by **where** identity/execution broke, which determines the recovery path and whether the failure is terminal.

| Code | Failure | Typical cause | Recoverable? | First recovery tier |
|---|---|---|---|---|
| **F-SEL** | Selector / identity failure | drift, re-render, ambiguous match (EC-09/10/11/12/28) | **Yes** | Tier 1–2 (re-resolve, a11y, anchor) |
| **F-GATE** | Actionability failure | not stable/visible/enabled, occluded (EC-05/06/07/08) | **Yes** | Tier 1 (gate retry, classified ladder) |
| **F-FRAME** | Frame failure | frame drift/detach, cross-origin (EC-01/02/03/43) | **Yes** | Tier 2 (FrameFingerprint, CDP tree) |
| **F-SHADOW** | Shadow failure | host missing, closed root (EC-04/04b) | **Partial** | Tier 2 (AX/CDP pierce) → Tier 4 if no AX |
| **F-STOCH** | Stochastic interruption | banner/modal/idle/session (EC-19/20/22/45) | **Yes** | Tier 2 (dismiss-known / auth self-heal) |
| **F-INPUT** | Input handler failure | wrong handler for typeahead/contenteditable (EC-25/29) | **Yes** | Tier 1 (correct handler) |
| **F-VERIFY** | Verification failure | action completed, outcome not observed / contradicted (EC-28/32) | **Conditional** | Tier 1 (retry correct action) — see §3 |
| **F-RECOV** | Recovery failure | all tiers (1–4) exhausted | **No** (→ human or terminal) | Tier 5 (human) |
| **F-HUMAN** | Human declined/unavailable | MFA/captcha/destructive not completed (EC-21/35) | **No** | — terminate |
| **F-PERM** | Permanent failure | app removed the feature; pack incompatible with app version; irreversible wrong-state detected | **No** | — terminate + flag recompile |

---

## 2. Recoverable vs terminal — the decision

**Recoverable** (enter the cascade, bounded by retry cap + `max_tier`):
- F-SEL, F-GATE, F-FRAME, F-STOCH, F-INPUT — all have zero-token recovery paths; these are the *expected* failures of a live web app and the whole point of the recovery architecture.
- F-SHADOW and F-VERIFY are *conditionally* recoverable (see §3).

**Terminal — stop immediately, do not keep trying:**
- **F-PERM:** the feature is gone, the pack is incompatible (`app_version_fingerprint` mismatch beyond tolerance), or an **irreversible wrong-state** was detected (a destructive action verified as having hit the wrong target). Retrying could compound damage. → typed failure + flag for recompile/flywheel.
- **F-HUMAN:** a designed human stop the human did not complete. → terminate cleanly with context.
- **F-RECOV:** cascade genuinely exhausted. → human handoff if `max_tier==5`, else terminal.

**The asymmetry that protects customers:** non-destructive steps recover aggressively (try every tier); **destructive/irreversible steps fail closed** — a single ambiguity or a verification contradiction terminates to human rather than risking a wrong pay/delete/submit (EC-28 on irreversible actions). This rule-triggered termination is deterministic and stronger than any model-initiated stop in the corpus.

---

## 3. F-VERIFY — the subtle one

Verification failure is the most important and most nuanced case, because it is how silent wrong-actions surface:

- **SOFT_FAIL** (action completed, outcome not observed): likely a wrong-element resolve or a not-yet-settled state. → re-resolve (maybe wrong node) and retry the **correct** action once via the cascade; if the post-condition then passes, RECOVERED.
- **HARD_FAIL** (outcome *contradicts* expectation — error banner, wrong URL, optimistic-UI revert): the action did something wrong. → if the step is **non-destructive**, recover; if **destructive**, treat as **F-PERM/irreversible** and terminate to human (do not retry a possibly-already-committed wrong action).

This is why verification (G2) is a hard prerequisite for autonomous recovery (G1): without a post-condition, the runtime cannot distinguish "needs retry" from "already did harm."

---

## 4. What every failure produces (honest output)

Regardless of type, a failure emits:
1. **A typed failure result** (code + step_id + intent + human-readable reason) returned through MCP — never a transport crash, never a fake success (insight #21: in-band errors).
2. **A checkpoint** of the last completed step (insight #16) so a resumable long flow can continue after the cause is fixed (e.g., after human MFA).
3. **Telemetry to the flywheel** — failure type, tier reached, fingerprints, screenshot, `app_version_fingerprint` — so the Cloud can detect drift, classify the change, and (for recoverable drift) re-sign a fix for the fleet (insight #1).
4. **For F-PERM/incompatibility:** a proactive **recompile flag** so the skill is rebuilt against the drifted app version before more customers hit it.

---

## 5. State machine

```
        ┌──────────────────────────── PASS ──────────────────────────┐
RESOLVE→GATE→ACT→VERIFY ──fail──▶ classify(F-*)                        │
                                    │                                  ▼
                       recoverable? ─yes─▶ CASCADE (T1→T2→T3→T4) ──VERIFY──▶ RECOVERED → next
                                    │            │ exhausted                  │ fail
                                    │            ▼                            ▼
                                    no    destructive & ambiguous?      (loop bounded by cap/max_tier)
                                    │       │yes
                                    ▼       ▼
                              TERMINATE   Tier-5 HUMAN ──complete+VERIFY──▶ resume
                              (F-PERM/    │decline
                               F-HUMAN)   ▼
                                       TERMINATE (typed, checkpointed, telemetered)
```

---

## 6. Why this model is correct

- **It never lies.** Every terminal state is typed and honest; there is no path to reported success without a passed post-condition. This is what makes Conxa SLA-able where agent-drivers ("the model usually does the same thing") are not (insight #22).
- **It fails closed on danger.** Destructive ambiguity terminates rather than guesses — the single most important safety property for enterprise adoption.
- **It is bounded.** Retry caps + `max_tier` + terminal classification prevent infinite recovery loops (insight #18).
- **It compounds.** Every failure feeds the flywheel; recurring drift becomes a re-signed fleet fix, so the *same* failure should occur at most once across the fleet.

**Net:** the failure model turns failures from embarrassing flakiness into either (a) an automatic verified recovery, (b) an honest typed stop with a resumable checkpoint, or (c) a fleet-wide durability improvement — never a silent wrong-action. That guarantee, more than any single recovery mechanism, is what an enterprise buyer is actually purchasing.
