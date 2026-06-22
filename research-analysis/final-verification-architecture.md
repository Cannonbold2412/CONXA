# Final Verification Architecture (Phase 5)

**This is the critical document.** Verification is the difference between "the action didn't throw" and "the intended result occurred." Five of six tools in the corpus cannot tell those apart (top-25 #2); the result is *confident false success* — the most dangerous failure mode, because it corrupts enterprise data silently (EC-28). Conxa's `verifyAssertions()` exists but is **unwired** today (G2) — this is the #1 reliability gap in the codebase.

**The principle:** *Evidence beats claim.* After every consequential step, prove the intended state change occurred via a channel the action did not use, against a post-condition fingerprint compiled in Build Studio. This is zero-token, deterministic, and it gates every repair.

---

## 1. What verification proves

For each consequential step, the compiler records an `expected_outcome` and a machine-checkable `post_condition`. Verification proves the outcome category occurred:

| Outcome category | What "proof" looks like | Channel |
|---|---|---|
| **Modal opened** | `role=dialog[name=…]` now visible inside the right frame | `dom_state` |
| **Row created** | row count increased / a row matching the entered key exists | `count` / `dom_state` |
| **URL changed** | URL matches the expected pattern (route or full nav) | `url` |
| **Form submitted** | success toast / confirmation view / record id present | `dom_state` |
| **Field set** | re-read the input/value and confirm it equals the intended value | `value_read` |
| **State changed** | aria-expanded/checked/selected flips to the expected state | `aria` |
| **File downloaded** | download event fired AND file exists with non-zero size/expected type | `download` |
| **Item selected (typeahead/dropdown)** | the chosen option is now the committed value, not just highlighted | `value_read` |

**Independence rule (non-negotiable):** the verification channel must differ from the action's own success signal. Clicking a button and then checking that the button exists proves nothing. Clicking "Submit" and then checking the confirmation view / new URL / created row proves the outcome. This is the Stagehand independent-AX-probe lesson generalized.

---

## 2. Architecture

```
        COMPILE (Studio, validation_planner.py)         RUNTIME (zero-token VERIFY)
 ┌───────────────────────────────────────────┐   ┌────────────────────────────────────────┐
 │ For each step, derive an INDEPENDENT       │   │ VERIFY(step):                           │
 │ post-condition from the recorded outcome:  │   │   read actual state via post_condition  │
 │  • channel (dom/url/aria/value/count/dl)   │   │     .channel, in step's frame/shadow    │
 │  • target fingerprint (what to look for)   │──▶│   compare to expected fingerprint        │
 │  • strength (strong/weak)                  │   │   within timeout_ms (poll)               │
 │  • timeout                                 │   │   → PASS | SOFT_FAIL | HARD_FAIL         │
 │  • required? (false only for nav markers)  │   │   emit confidence + evidence to telemetry│
 └───────────────────────────────────────────┘   └────────────────────────────────────────┘
```

- **Frame/shadow-aware:** verification reads state *inside the same chain* as the target, never the top document — else a correct action reports false-fail, or a wrong-frame action reports false-pass (top-50 #27).
- **Polled, bounded:** post-conditions are checked with a short adaptive poll (state changes aren't instant), capped by `timeout_ms`; no `networkidle` dependence.
- **Always runs on apparent success** too — that is the only way EC-28 silent wrong-actions are caught.
- **Always runs after any recovered/forced action** — a repair isn't "done" until its post-condition passes.

---

## 3. Verification strength and the confidence model

Not all post-conditions are equally strong; the model encodes this so confidence reflects reality:

| Strength | Example | Confidence contribution |
|---|---|---|
| **Strong** | URL change, created DB-backed row, re-read committed value, downloaded file on disk | high — near-proof |
| **Medium** | confirmation toast/text, aria-state flip | moderate |
| **Weak** | "the target selector is still present" | low — barely better than nothing |

`postcondition_strength` is one input to the per-step confidence score (`framework §1`): `confidence = f(signal_rank, uniqueness_margin, postcondition_strength, orthogonal_agreement, tier_used)`. A step whose only available post-condition is weak is **capped at Medium confidence** — and a Medium-confidence *destructive* step requires human confirmation rather than proceeding on a guess.

**Compile-time obligation:** the validation planner must try to derive a *strong* post-condition for every consequential step; where only a weak one exists, it flags the step's durability/confidence down so the flywheel and the author know this step is under-verified.

---

## 4. Failure conditions

VERIFY returns one of three results, each with a defined consequence:

| Result | Meaning | Consequence |
|---|---|---|
| **PASS** | actual state matches expected within timeout | advance (or mark RECOVERED if reached via recovery) |
| **SOFT_FAIL** | action completed but outcome not observed (possible silent wrong-action, EC-28) | **enter recovery** — re-resolve and retry the *correct* action; this is the primary EC-28 catch |
| **HARD_FAIL** | outcome contradicts expectation (e.g., error banner present, wrong URL) | enter recovery; if the contradiction implies an irreversible wrong action on a destructive step → **stop immediately**, escalate to human (Phase 9) |

**Deferred/soft assertions** (insight #25): non-fatal advisory post-conditions are collected across the run and reported at the end rather than halting — richer diagnostics, better flywheel signal. Required post-conditions halt-and-recover; advisory ones annotate.

**The rule that makes recovery trustworthy:** a recovered step is only PASS if its post-condition passes. Recovery success-rate without verification is meaningless — verification converts it into recovery *correctness* (top-25 #2). This is why verification is a prerequisite for autonomous recovery (G1 depends on G2).

---

## 5. Why verification is the trust spine

- **It closes the field-wide blind spot.** No competitor verifies outcomes independently on every step; it is the precondition for any reliability SLA (insight #2, #14).
- **It is the detector AND the gate.** Detector: turns silent failures loud (EC-28, EC-32 optimistic-UI false-pass). Gate: validates every Tier-1–5 repair before advancing.
- **It feeds the flywheel with ground truth.** A verified repair is a trustworthy `repair_event`; an unverified one would poison the fleet (insight #1 depends on #2).
- **It is zero-token.** Verification is deterministic state-reading — no LLM, fully inside the hot-path philosophy.

**Net:** independent post-condition verification on every consequential step is the cheapest high-impact change in the entire blueprint (Med complexity, Low risk, Reliability 10 — G2/top-50 #1). It is what lets Conxa truthfully say "the workflow did what the human intended," which no tool in the corpus can say. Build it first (Phase 11).
