# Conxa Deterministic Edge-Case Framework (Phase 8)

**This is the reliability engineering handbook.** For every edge-case family it defines a deterministic strategy across seven dimensions: **Detection · Primary Resolution · Secondary Resolution · Recovery · Escalation · Confidence Model · Verification.**

**Governing invariant:** *No LLM in the hot path.* Detection, primary/secondary resolution, deterministic recovery, confidence scoring, and verification are **all zero-token**. The LLM (host model via MCP sampling) and vision appear only at the escalation edges, and **only after every zero-token path is exhausted** — and every escalated repair is still gated by the zero-token Verification step. Recovery patterns referenced as **RP-xx** (`recovery-patterns.md`); edge cases as **EC-xx** (`edge-case-inventory.md`).

---

## 0. The universal step lifecycle (applies to every edge case)

Every step runs this deterministic loop. Edge-case families specialize the resolution/recovery boxes.

```
                      ┌─────────────────────────────────────────────┐
 resolve identity ──▶ │ RESOLVE: late-bound, multi-signal, scored,   │
 (multi-signal,       │ frame/shadow/hover-chain aware, uniqueness   │
  semantic→struct)    └───────────────┬─────────────────────────────┘
                                      ▼
                      ┌─────────────────────────────────────────────┐
                      │ GATE: attached→visible→stable(RAF)→enabled   │  (RP-02, Z)
                      │       + hit-target check                     │
                      └───────────────┬─────────────────────────────┘
                                      ▼
                      ┌─────────────────────────────────────────────┐
                      │ ACT (deterministic handler)                  │
                      └───────────────┬─────────────────────────────┘
                                      ▼
                      ┌─────────────────────────────────────────────┐
   on failure ───────│ VERIFY: independent post-condition (RP-05,Z) │◀── ALWAYS, even on "success"
   classify & recover└───────────────┬─────────────────────────────┘
        (Z tiers)                     │ pass → next step
                                      │ fail (hard OR silent) ▼
                      ┌─────────────────────────────────────────────┐
                      │ RECOVER (zero-token cascade, RP-03/04/06...) │
                      │  → if exhausted: ESCALATE (H → V → U)        │
                      └─────────────────────────────────────────────┘
```

**Two non-obvious rules baked in:** (1) **Verify even on apparent success** — silent wrong-actions (EC-28) are caught only here. (2) **Every recovered/forced action re-enters VERIFY** — a repair isn't "done" until the post-condition passes.

---

## 1. Confidence Model (shared across all families)

A single deterministic confidence score drives gating decisions (no LLM). Per resolution attempt:

`confidence = f( signal_rank, uniqueness_margin, postcondition_strength, orthogonal_agreement, tier_used )`

- **signal_rank** — semantic (role+name/text) > structural (css/xpath); higher rank = higher confidence (Mind2Web durability).
- **uniqueness_margin** — 1 unique match = high; multiple matches resolved by tie-break = low (EC-28 risk).
- **postcondition_strength** — strong (DB/state re-read) > weak (selector-present).
- **orthogonal_agreement** — how many independent signals point to the same node.
- **tier_used** — Tier-1 zero-token > recovered > escalated.

**Bands:** **High** → proceed + (if recovered) propose write-back. **Medium** → proceed but flag; require human-confirm for destructive steps. **Low / ambiguous** → do not proceed on a guess → escalate. The compiler emits a per-step `confidence_threshold` (it already computes confidence at compile via `confidence/layered.py` — *the runtime must consume it*, which today it does not).

---

## 2. Family 1 — Identity Drift (EC-09/10/11/12/44, +boundary identity)

*The largest failure family; almost fully deterministic.*

| Dimension | Strategy (zero-token unless noted) |
|---|---|
| **Detection** | Resolve returns 0 matches, >1 ambiguous matches (uniqueness fail), or a detachment error on act. Also: a soft signal — confidence below threshold. |
| **Primary Resolution** | Late-bound re-resolution (RP-01) of the **highest-rank orthogonal signal** (role+name) with a **uniqueness gate** (RP-04). Re-query every attempt — never a held handle. |
| **Secondary Resolution** | Walk the ranked orthogonal signal set **semantic→structural** (text → testid → scoped-CSS → xpath-last), taking the first signal that *uniquely* resolves and **scoring** it (RP-04). |
| **Recovery** | (1) next compiled signal; (2) a11y role+name (RP-09); (3) anchor/relational re-find (recorded anchors); (4) stable-text fuzzy match (existing `recoverWithFuzzyText`). All `Z`. |
| **Escalation** | All `Z` signals miss → **host describe-then-match** (RP-17, `H`): host emits a *description*, deterministic matcher resolves it against live AX + recorded fingerprint. Never ask the host for a selector. |
| **Confidence** | Uniqueness margin + signal rank dominate. Multiple ambiguous matches → Low → do not pick by position; escalate. |
| **Verification** | Post-condition re-read (RP-05): did the intended state change occur? Catches "resolved the wrong identical node" (EC-28). |

**Conxa gaps:** live scoring + uniqueness (today array-order, no scoring); consume compile-time confidence; durability-ordering (today not enforced); autonomous Tier-3 (today manual).

---

## 3. Family 2 — Timing & Actionability (EC-05/06/07/08/31/32)

*Mostly **prevented** by gates, not recovered.*

| Dimension | Strategy |
|---|---|
| **Detection** | Gate failure (not stable / not visible / not enabled / hit-target occluded) within bounded budget; intercept error on act. |
| **Primary Resolution** | **Actionability gate** (RP-02): attached→visible→**stable(RAF, 2 frames)**→enabled + **hit-target check** before acting. This *prevents* EC-05/06/07/08. `Z`. |
| **Secondary Resolution** | Scroll-into-view (EC-07); wait for `enabled`/`aria-enabled` (EC-08); framework settle (RP-12) for EC-31 — but **wait on the target element, never `networkidle`** (SPA trap). |
| **Recovery** | **Exception-classified ladder** (RP-03): `stale`→re-find (RP-01); `intercepted`→dismiss-overlay / dialog-scope / **JS-dispatch** (RP-06); `out-of-bounds`→re-scroll; benign driver noise→swallow. Escalate by invasiveness. `Z`. |
| **Escalation** | Persistent occlusion after the ladder → treat the occluder as a **stochastic interruption** (Family 3, dismiss-known-pattern) before declaring failure. Only then `H`. |
| **Confidence** | Tier-used (gate-passed = High; forced JS-dispatch = Medium → must verify). |
| **Verification** | **Mandatory after any forced/JS-dispatch action** (RP-05) — a forced click can hit nothing (EC-28). This is the gate that makes RP-06 safe. |

**Conxa gaps:** no stability gate (today `visible` only); 700ms fail-fast (replace with confidence-aware adaptive budget); one-line intercept fallback (adopt full ladder); no verification after forced actions.

---

## 4. Family 3 — Stochastic Interruptions (EC-19/20/21/22/45/41/35/44)

*Not a recovery problem — a **representation** problem. Needs conditional steps (compile-time), not runtime intelligence.*

| Dimension | Strategy |
|---|---|
| **Detection** | Before/around each step, deterministically check for **known interruption patterns**: consent frameworks (OneTrust/Cookiebot/TCF selectors), generic modal/`[role=dialog]` blocking the target, login-redirect (URL/title heuristics, EC-22), "still there?" idle modals (EC-45). Also: an unexpected element intercepts the target. |
| **Primary Resolution** | **Compiled conditional steps** (`if_present(selector)→dismiss`, `try_dismiss`, `wait_for_one_of`) — the recording/compile captures known-optional states as branches so replay handles present-or-absent deterministically. `Z`. |
| **Secondary Resolution** | Runtime **dismiss-known-pattern** library (RP-13): a curated, deterministic set of consent/modal dismissers tried when an unexpected blocker is detected. `Z`. |
| **Recovery** | EC-22 session-expired → **auth re-auth self-heal** (RP-16, already built): detect→re-auth window→rebuild context→resume. EC-19/20/45 → dismiss + retry the blocked step. `Z` (+`U` for the actual login). |
| **Escalation** | EC-21 MFA / EC-35 captcha → **human handoff** (RP-19, `U`) — these are *designed* stops, not failures. Unknown blocker that no deterministic dismisser clears → `H` to identify, then dismiss. Emit `stochastic_state_observed` so the Cloud can promote it to a compiled conditional. |
| **Confidence** | N/A for dismissal (deterministic match); high for known patterns, low/escalate for unknown blockers. |
| **Verification** | After dismiss, confirm the blocker is gone AND the original target is now actionable (RP-05) before proceeding. |

**Conxa gaps:** **no conditional/branch steps** (the big one — linear replay only); partial dialog-scope; no curated dismiss-pattern library; auth self-heal exists (keep).

---

## 5. Family 4 — Boundary Traversal (EC-01/02/03/04/04b/43)

*Conxa's quiet strength (iframes); shadow inherited from Playwright. Detail in `iframe-architecture.md` / `shadow-dom-architecture.md`.*

| Dimension | Strategy |
|---|---|
| **Detection** | Target not in the expected document; frame/shadow host missing; cross-origin (parent JS can't reach). |
| **Primary Resolution** | **Chain-as-data, late-bound**: re-enter the frame chain (`rootCandidates`/`frameLocator`) and pierce open shadow roots (Playwright default) on every attempt. Frame/shadow context lives in **identity, never ambient state**. `Z`, cross-origin-safe (CDP). |
| **Secondary Resolution** | Multi-signal **FrameFingerprint** / **shadow host-path** (src/name/title/role, ranked semantic→structural) when the primary frame/host selector drifts (EC-43/12). `Z`. |
| **Recovery** | Frame-level sub-tier: alternate frame signal → match by `src_pattern` → by title → **CDP frame-tree enumeration** (reaches cross-origin) ; shadow: AX role+name (pierces) → **CDP `pierce:true`** for closed roots (EC-04b). `Z`. |
| **Escalation** | Closed shadow / canvas inside boundary with no AX → **vision Tier-4** (RP-18, `V`): coordinate at rendered location, re-derive selector if possible. |
| **Confidence** | Frame/host uniqueness; cross-origin resolved via CDP = high. |
| **Verification** | **Frame/shadow-aware post-condition** — read outcome state *inside the same chain*, never the top document (else false pass/fail). |

**Conxa gaps:** no multi-signal frame identity (single frame selector + fallbacks only); no frame-level recovery sub-tier; compiler may emit XPath for shadow targets (forbid — XPath doesn't pierce); no closed-root path; verification not yet chain-aware.

**Hard rule:** never traverse frames via in-page `contentDocument` (dies on cross-origin EC-03); never use XPath for shadow targets (doesn't pierce EC-04). All boundary work stays on Playwright/CDP APIs.

---

## 6. Family 5 — Outcome Ambiguity (EC-25/26/27/28/29/23/24)

*"It 'worked' — but did it do the right thing?" Solved by **verification**, not recovery.*

| Dimension | Strategy |
|---|---|
| **Detection** | The **independent post-condition** (RP-05) is the detector: compare expected state (compiled fingerprint) to a re-read of actual state via a channel the action didn't use. Mismatch = soft failure (EC-28). |
| **Primary Resolution** | Action-type-correct handlers: native `<select>`→`selectOption`; **custom dropdown (EC-26)**→open→wait-options→click-by-text; **typeahead (EC-25)**→fill→wait-async-options→select-exact (never select before options render); **contenteditable/rich-text (EC-29)**→focus+key events (not `fill`); **upload (EC-23)**→`setInputFiles` to the real `<input type=file>`; **download (EC-24)**→trigger→await download event→verify file. `Z`. |
| **Secondary Resolution** | For typeahead/date-pickers: poll for the option/day-cell to appear (bounded) before selecting; match the *intended value* exactly. |
| **Recovery** | If post-condition fails: re-resolve (maybe wrong element) and retry the *correct* action; for typeahead, re-open and reselect. `Z`. |
| **Escalation** | Persistent post-condition failure → `H` describe-then-match to find the right control; sensitive/irreversible (EC-28 on a destructive step) → `U` confirm. |
| **Confidence** | postcondition_strength dominates here; weak/no post-condition → Medium at best. |
| **Verification** | **This family IS verification.** Every consequential step (esp. data entry, selection, upload) must carry a compiled post-condition and check it. **The single most important missing capability in Conxa today.** |

**Conxa gaps:** `verifyAssertions()` unwired (the #1 gap); typeahead/custom-dropdown handled as generic fill/click (no wait-for-options); contenteditable not special-cased; no download verification.

---

## 7. The escalation ordering (where the zero-token boundary sits)

```
   ZERO-TOKEN BAND (must exhaust before spending a token)
   ┌──────────────────────────────────────────────────────────────┐
   │ GATES (RP-02,12) → RESOLVE+SCORE (RP-01,04,09,10) →           │
   │ CLASSIFIED LADDER (RP-03,06) → CHAIN/HOVER/SCROLL (RP-07,08,  │
   │ 10,11) → DISMISS-KNOWN (RP-13) → AUTH SELF-HEAL (RP-16) →     │
   │ VERIFY (RP-05) ── all deterministic, frame/shadow/hover aware │
   └───────────────────────────┬──────────────────────────────────┘
                               │ exhausted
   ┌───────────────────────────▼──────────────────────────────────┐
   │ Tier 3  HOST describe-then-match (RP-17,20) ── H, autonomous  │  verify→
   ├───────────────────────────────────────────────────────────────┤
   │ Tier 4  VISION coordinate re-ground (RP-18) ── V, DOM-opaque  │  verify→
   ├───────────────────────────────────────────────────────────────┤
   │ Tier 5  HUMAN handoff (RP-19) ── U, MFA/captcha/destructive   │
   └───────────────────────────────────────────────────────────────┘
```

**Rule:** a step only descends a tier when the tier above is *exhausted*, and **every tier's result re-enters VERIFY**. Confidence gates can short-circuit *down* to escalation early (e.g., ambiguous-match Low confidence on a destructive step → straight to Tier 5), but never *up* past verification.

---

## 8. Write-back (healing the artifact, deterministically safe)

Any repair that resolves above Tier-1 and **passes verification** emits a `repair_event` (recorded signal → repaired signal, confidence, post-condition result, app-version fingerprint). Used **ephemerally for the current run only**; the durable fix is a **Cloud re-sign** (never local mutation of the signed package). This is how edge-case recovery compounds into fleet durability (`future-workflow-durability-architecture.md`) — and it preserves determinism + signing.

---

## 9. Coverage summary — what the framework buys

| Family | Primary fix | Cost | Conxa status |
|---|---|---|---|
| 1 Identity drift | Late-bound + scored multi-signal + uniqueness | `Z` | Foundation ✅; scoring/uniqueness ❌ |
| 2 Timing | Actionability gate + classified ladder | `Z` | Gate ❌; ladder partial |
| 3 Stochastic | Conditional steps + dismiss-known + auth self-heal | `Z` | Conditional ❌; auth ✅ |
| 4 Boundary | Chain-as-data + multi-signal frame/shadow id + CDP | `Z` | iframe ✅; shadow inherited; recovery ❌ |
| 5 Outcome | Independent post-condition + action-correct handlers | `Z` | Verification ❌ (top gap) |

**The framework's central claim, now fully specified:** **all five families are addressed primarily with zero-token deterministic mechanisms.** The LLM/vision/human tiers exist only for the genuine residual — DOM truly unavailable, semantics truly changed, or a human truly required — and even then the zero-token VERIFY step gates the result. This is the deterministic Conxa equivalent of how world-class systems survive real-world edge cases: **prevent with gates, resolve with scored multi-signal identity, recover with a classified zero-token ladder, represent stochastic states as conditionals, traverse boundaries as data, and verify every outcome independently — spending a token only when the deterministic world has genuinely run out.**

**Build priority (the gaps, ranked):** (1) Verification/RP-05 — unblocks safety and trustworthy recovery; (2) Actionability gate/RP-02; (3) Scored multi-signal + uniqueness/RP-04; (4) Full classified ladder/RP-03; (5) Conditional steps/RP-13 for Family 3; (6) Scroll-until-found + re-hover/RP-08,07; (7) Frame/shadow recovery hardening/RP-10; (8) Autonomous Tier-3/RP-17. These feed the matrix (Phase 9) and the ranked top-50 (Phase 10).
