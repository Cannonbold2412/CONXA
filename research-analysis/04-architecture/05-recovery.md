# Recovery Architecture (Phase 6)

**The complete recovery system.** Recovery is the only place (besides compile and repair-validation) where AI is permitted — and even there it is bounded, host-delegated via MCP sampling, and **every result re-enters verification** (Phase 5). The cascade is **zero-token-first**: 17 of 20 recovery patterns in the corpus are deterministic (`recovery-patterns.md`), and the LLM/vision/human tiers exist only for the genuine residual.

**The current gap (G1):** today recovery is a deterministic ladder followed by *host-delegated manual resume* — no autonomous re-grounding, no verified repair, no write-back. The marketed "5-tier AI self-healing cascade" does not exist in code. This phase specifies the real one.

**Universal rule:** a step descends a tier only when the tier above is **exhausted**, and **no tier's result is accepted until its post-condition passes.** Confidence can short-circuit *down* (ambiguous match on a destructive step → straight to human) but never *up* past verification.

---

## The five layers at a glance

```
 ZERO-TOKEN BAND ───────────────────────────────────────────────────────
 │ Layer 1  DETERMINISTIC   gates + exception-classified ladder + scored  │  Z
 │ Layer 2  FINGERPRINT     a11y/anchor/frame/shadow re-resolve, scroll,  │  Z
 │                          re-hover, dismiss-known, auth self-heal       │
 ────────────────────────────────────────────────────────────────────────
 │ Layer 3  CONTEXT (host)  describe-then-match via MCP sampling          │  H
 │ Layer 4  VISION          scaleFactor-normalized grounder → bbox        │  V
 │ Layer 5  HUMAN           structured CALL_USER handoff                  │  U
 ────────────────────────────────────────────────────────────────────────
        every layer's result ──▶ VERIFY ──▶ pass=RECOVERED / fail=descend
```

---

## Failure detection & classification (before the cascade)

Recovery does not begin by *acting* — it begins by *describing* the failure, then *classifying* it, so the cascade enters at the right layer instead of blindly running the full ladder.

**Two detection triggers (not one):**
- **Hard failure** — the action threw (today's only trigger).
- **Soft failure** — the action *succeeded* but the **independent post-condition** (Phase 5) failed. This catches the SeleniumBase blind spot: a forced JS click that "worked" but achieved nothing. Soft failures are the dominant *silent* enterprise failure and are invisible today.

**The `FailureContext`** emitted at detection carries everything the later stages need: step, intent, recorded `ElementFingerprint`, primary selector, frame chain, pre/post page fingerprint, exception (if any), post-condition delta (expected vs actual state), and a cheap page fingerprint (`url + interactive-element count + DOM-text hash`, from browser-use's stall detector — also the retry-cap key).

**Classification (deterministic, zero-cost)** selects the strategy and its expected cost before any remedy runs — SeleniumBase's "exception type is a free signal," generalized:

| Class | Signal | First remedy (layer) |
|---|---|---|
| **Transient** | stale handle, mid-animation, load race | re-find / wait-stable (L1) |
| **Intercepted** | overlay/modal/pointer-intercept | dialog-scope, JS-dispatch (L1) |
| **Drifted-identity** | element gone but page is the right one | multi-signal re-resolution + scoring (L1→L2) |
| **Structural-change** | DOM restructured, signals partially survive | orthogonal-signal fallback → describe-then-match (L2→L3) |
| **Stochastic-state** | unexpected banner/interstitial/MFA present | dismiss-known handler (L2); promote to compiled conditional |
| **Auth-failure** | login redirect / session expired | re-auth self-heal (L2) — already built |
| **Page-wrong** | navigation/precondition failed | re-establish precondition or fail fast |
| **Infeasible** | target genuinely absent / task impossible | escalate, don't burn tokens (L5) |

This prevents the current waste of running the full ladder for an auth failure or a stochastic banner.

---

## Layer 1 — Deterministic Recovery (`Z`)

**Entry:** gate failure, resolution miss, intercept/stale error, or verification SOFT_FAIL.
**Mechanisms** (exception-classified ladder, SeleniumBase-derived — RP-02/03/04/06):
- `stale` / detached → **re-find** (late-bound re-resolution, next durability signal).
- `intercepted` / occluded → **dismiss overlay** → **dialog-scope** → **JS-dispatch** (escalating invasiveness).
- `out-of-bounds` → **re-scroll** into view.
- not stable → **wait stable (RAF)**; not enabled → **wait enabled**.
- benign driver noise → **swallow and retry**.
**Scored re-resolution:** retry resolution walking the orthogonal signal set with the live uniqueness gate (Phase 3).
**Exit:** a candidate uniquely resolves and acts → VERIFY.
**Verification requirement:** mandatory after any **forced/JS-dispatch** action (a forced click can hit nothing — EC-28). Gate-passed native actions still verify, but forced ones *cannot* be trusted without it.
**Failure → descend** to Layer 2.

---

## Layer 2 — Fingerprint / Context-Deterministic Recovery (`Z`)

**Entry:** Layer 1 exhausted (no signal resolves, or verification still fails after deterministic retry).
**Mechanisms** (all zero-token, fingerprint-driven — RP-07/08/09/10/13/16):
- **Accessibility re-probe** — resolve by role+name against the live AX tree (pierces shadow; reaches icon-only EC-37).
- **Anchor / relational re-find** — locate via recorded stable neighbors when text/structure drifted (EC-10).
- **Frame/shadow re-resolution sub-tier** — alternate FrameFingerprint signal → `src_pattern` → title → **CDP frame-tree enumeration** (reaches cross-origin EC-03); shadow: AX role+name → **CDP `pierce:true`** for closed roots (EC-04b). `frame_enter/frame_exit` are never retried (invariant).
- **Scroll-until-found** — for virtualized containers, re-query by stable id while scrolling (EC-13).
- **Re-hover-then-retry** — re-establish a hover precondition that closed (EC-15/16).
- **Dismiss-known-pattern** — curated consent/modal dismissers for unexpected blockers (EC-19/20); promote observed states to compiled conditionals via telemetry.
- **Auth self-heal** — `isAuthFailure` → re-auth window → rebuild context → resume (EC-22; already built — keep, generalize).
**Exit:** target uniquely resolves via a fingerprint signal and acts → VERIFY.
**Verification requirement:** same as Layer 1 — verify before marking RECOVERED; frame/shadow-aware.
**Failure → descend** to Layer 3.

**Bounding:** a page-fingerprint (url + element_count + DOM-hash) retry cap (insight #18) stops thrash on a stagnant page across Layers 1–2.

---

## Layer 3 — Context Recovery (host LLM, `H`) — the autonomous self-heal

**Entry:** all zero-token tiers exhausted; `step.recovery.max_tier >= 3`; not a destructive step pending confirmation.
**Mechanism (describe-then-ground, SeeAct — RP-17/20, fixes the 30%-hallucination risk):**
1. Build a **target-anchored, rank-and-capped** AX+styles+bounds digest of the live page — ranked against the recorded fingerprint so the intended element is **never truncated away** (the browser-use anti-pattern fix, insight #13); pre-filtered to <500 nodes (WorkArena).
2. Via **MCP sampling**, the host model emits a **description** `{action, target_description, argument}` — **never a raw selector**.
3. A **deterministic matcher** resolves that description against the live AX tree *jointly with* the recorded fingerprint + anchors. The LLM proposes; deterministic code disposes.
4. Reflection-in-output (assess-previous-before-next) reduces cascading error — but it is *belief, not truth*, so it is paired with verification.

**This replaces today's host-DELEGATED manual resume with an autonomous, bounded, verified Tier 3** (G1) — the change that makes "self-healing" true and unattended runs safe.
**Exit:** matched node acts and **VERIFY passes**.
**Verification requirement:** strong post-condition required; a Tier-3 repair with only a weak post-condition is capped Medium confidence and, if destructive, escalates to human instead of proceeding.
**Write-back:** on verified success, emit `repair_event` (recorded signal → repaired signal, confidence, post-condition result, app-version fingerprint). Used **ephemerally for this run only**; the durable fix is a **Cloud re-sign** — never local mutation of the signed pack (insight #11). This is the seam to the fleet flywheel.
**Failure → descend** to Layer 4.

---

## Layer 4 — Vision Recovery (`V`) — walled-off last resort

**Entry:** Layer 3 exhausted AND the DOM is genuinely unavailable (closed shadow with no AX, canvas/WebGL, EC-04b/36/39); `max_tier >= 4`.
**Mechanism (OS-ATLAS grounder + UI-TARS normalization — RP-18):**
- `(screenshot, target_description) → normalized bbox`, scaled by `devicePixelRatio` at execution (HiDPI correctness — EC-39).
- Prefer to **re-derive a DOM selector** from the grounded location and hand back to the deterministic path; raw-coordinate action only if no DOM exists.
- **SoM annotation shipped as telemetry/drift signal, never as success evidence** (insight #23).
**Exit:** coordinate/derived-selector action and **VERIFY passes**.
**Verification requirement:** mandatory — vision is the least trustworthy tier; an unverified vision "success" is worthless.
**Failure → descend** to Layer 5. Vision is deliberately rare (ROI 4, G13) — most "DOM-opaque" cases are actually reachable via CDP AX in Layer 2.

---

## Layer 5 — Human Escalation (`U`) — first-class, not a fallback crash

**Entry (two triggers):**
1. **Rule-triggered** (deterministic, can short-circuit from any layer): the step is **destructive/sensitive** (pay/delete/submit — `recovery.destructive`), or is MFA/captcha (EC-21/35) — these are *designed stops*, not failures.
2. **Exhaustion-triggered**: Layers 1–4 exhausted, or a Low-confidence ambiguous match on a consequential step.
**Mechanism (UI-TARS CALL_USER, made structured — RP-19):** a designed pause-and-hand-to-human state with full context (intent, what was attempted per tier, screenshot, the ambiguity). The customer's human completes the step (or the login/MFA); the runtime resumes from the checkpoint.
**Verification requirement:** after human action, run the post-condition before resuming — the human can err too.
**Exit:** human completes → VERIFY → resume; or human aborts → typed PERMANENT failure (Phase 9).

**Why rule-triggered escalation matters:** it is *deterministic* and stronger than UI-TARS's model-initiated handoff — Conxa stops *before* a risky action on a guess, not after.

---

## Entry/exit/verify/failure matrix

| Layer | Entry | Exit (success) | Verify | On failure |
|---|---|---|---|---|
| 1 Deterministic | gate/resolve/intercept/SOFT_FAIL | unique resolve + act | mandatory after forced | → 2 |
| 2 Fingerprint | L1 exhausted | fingerprint signal resolves + act | mandatory, frame/shadow-aware | → 3 |
| 3 Context (host) | all `Z` exhausted, max_tier≥3 | described target matched + act | **strong post-condition required** | → 4 |
| 4 Vision | DOM-opaque, max_tier≥4 | grounded action | mandatory (vision least trusted) | → 5 |
| 5 Human | destructive/MFA OR exhaustion | human completes | post-condition after human | → PERMANENT |

---

## Bounding, safety, and the write-back loop

- **Bounded:** per-page-fingerprint retry cap + `max_tier` per step + adaptive budgets ⇒ finite worst-case cost (insight #18). A self-heal loop cannot thrash.
- **Safe:** no tier's result is accepted without verification; destructive steps never auto-proceed on a guess; forced actions always verify.
- **Compounding:** every verified above-Tier-1 repair → `repair_event` → Cloud aggregation → drift classification → re-signed pack pushed to the fleet *before others hit it* (insight #1, the moat). Recovery stops being per-run firefighting and becomes a fleet-wide durability asset (`07-skill-pack.md`, `founder-execution-plan.md`).

**Net vs the corpus:** SeleniumBase has Layer 1; Stagehand has a lazy re-ground (no verification, mutates local cache); browser-use and host-vision/CUA agents re-perceive in the hot path. None has a *verified, bounded, zero-token-first cascade that writes verified repairs back to a fleet.* That combination — deterministic floor + autonomous verified host tier + fleet write-back — is the recovery architecture no competitor can match while staying deterministic.

---

## Migration path (no rewrite)

Each step is independently shippable and strictly improves reliability — the cascade above is reached incrementally from today's `run.js` ladder + `server.js` payload, not in one rewrite:

1. **Extract** recovery from `run.js`/`server.js` into a `recovery-orchestrator` module (preserves the current deterministic ladder as Layers 1–2).
2. **Add** the independent post-condition verifier (Phase 5 / gap G2) — immediately upgrades detection (soft failures) and repair validation.
3. **Wire** live fingerprint scoring into Layer 1 (gap G5) — the fingerprint already ships in the package.
4. **Replace** the host-delegated resume payload with **MCP-sampling-driven Layer 3** (autonomous describe-then-match), keeping the human-handoff payload as the Layer 5 fallback.
5. **Add** the `repair_event` emission → Cloud write-back loop (depends on durability/cloud work — see [`subsystems/workflow-durability.md`](subsystems/workflow-durability.md)).
6. **Generalize** the auth re-auth handoff into the structured Layer-5 state and add rule-triggered escalation for destructive/sensitive steps.
