# Final Replay Algorithm (Phase 4)

**Scope:** the complete deterministic algorithm the runtime executes for each step. Zero LLM in this path (`CLAUDE.md` invariant). This is the executable form of the universal step lifecycle (`conxa-edge-case-framework.md` §0), specified precisely enough to implement against `runtime/run.js` without returning to the research repos.

**Inputs:** a signed, validated skill pack (Phase 8), live Playwright browser context, bound skill inputs.
**Per-step contract:** advance only when the step's **independent post-condition** passes (Phase 5). Never advance on "didn't throw."

---

## 1. Top-level loop

```
for step in pack.steps:
    if step.precondition and not present(step.precondition):   # conditional (Family 3)
        if step.optional: continue
        else: resolve branch / skip per compiled control flow
    result = EXECUTE_STEP(step)
    if result == PASS:          checkpoint(step); continue
    if result == RECOVERED:     checkpoint(step); continue       # recovery already re-verified
    if result == FAIL:          return classify_failure(step)    # Phase 9
```

Checkpointing after each completed step (insight #16) makes long compositional flows resumable after a transient crash.

---

## 2. EXECUTE_STEP — the five deterministic stages

```
EXECUTE_STEP(step):
   loc   = RESOLVE(step)            # §3  identity → live, unique candidate
   if loc is AMBIGUOUS or MISS: return RECOVER(step, reason)     # §6 / Phase 6
   GATE(loc, step)                  # §4  actionability — may wait/scroll/settle
   if GATE failed: return RECOVER(step, gate_reason)
   ACT(loc, step)                   # §5  action-type-correct handler
   v = VERIFY(step)                 # Phase 5  independent post-condition
   if v.pass: return PASS
   else:      return RECOVER(step, "verification_failed")        # silent wrong-action path
```

Note the two places recovery is entered: **resolution ambiguity/miss** (identity drift) and **verification failure** (outcome ambiguity — including a forced action that silently hit the wrong node). Gate failures route through recovery's deterministic ladder.

---

## 3. RESOLVE — how the runtime resolves selectors (uses fingerprints + context)

```
RESOLVE(step):
   root = ENTER_CONTEXT(step.target.frame_chain, step.target.shadow_path)   # §3.1
   for signal in step.target.signals:          # DURABILITY order (semantic→structural)
       candidates = root.query(signal.value)    # LATE-BOUND: re-query every attempt
       candidates = pierce_open_shadow(candidates, step.target.shadow_path)
       if candidates.count == 0: continue       # miss → next signal
       if candidates.count == 1:
           if score(candidates[0], step.target.fingerprint) >= step.confidence_threshold:
               return candidates[0]
           else: record_low_confidence(); continue
       # candidates.count > 1  → UNIQUENESS GATE (the EC-28 guard)
       best = tie_break(candidates, step.target.fingerprint, anchors)   # §3.2
       if best.margin >= UNIQUE_MARGIN: return best.node
       else: continue                           # still ambiguous → never pick [0]; try next signal
   return MISS                                  # all signals miss/ambiguous → recovery
```

### 3.1 Context entry (frame/shadow — Family 4)
- `frame_chain` is re-entered **every attempt** via `rootCandidates`/`frameLocator` (never a cached frame handle — frames go stale, EC-43). Cross-origin frames are reached via CDP, never in-page `contentDocument` (EC-03).
- `shadow_path` hosts are pierced via Playwright's default open-shadow piercing; closed roots route to recovery's CDP/AX path (EC-04b).
- Context lives **in the step's identity**, never in ambient runtime state — so a frame drift is recoverable per-step.

### 3.2 How fingerprints are used (live scoring + uniqueness)
The `fingerprint` (role, name, tag, attributes, text, anchors, bbox) is the **scoring oracle**, not just a fallback list:
- `score(node, fp)` = weighted agreement across orthogonal attributes (role match, name match, text similarity, anchor-neighbor presence). Higher agreement = higher confidence.
- `tie_break` resolves multi-match by fingerprint score + anchor agreement; `margin` is the gap between the best and second-best. A small margin = genuine ambiguity = **do not guess**.
- `guid_like` attributes are penalized; `bbox` contributes only a weak position prior (never decisive — it's for drift detection and vision Tier-4).

This is the mechanism that "cashes in" the compiled multi-signal identity that the current runtime ignores (G5).

---

## 4. GATE — actionability before acting (Family 2, prevention)

```
GATE(loc, step):
   wait_until(loc, attached, budget)
   wait_until(loc, visible, budget)
   wait_until(loc, stable, budget)        # RAF: bounding box unchanged across 2 frames
   wait_until(loc, enabled, budget)        # incl. aria-disabled (EC-08)
   if step.action interacts at a point: assert hit_target(loc)   # occlusion check (EC-06)
   # budget = confidence-aware adaptive timeout (NOT a blunt 700ms)
```

- **Stable(RAF)** is the gate most tools omit and the fix for mid-animation mis-clicks (EC-05). The current runtime waits `visible` only — this is the highest-yield cheap addition (G4, top-50 #2).
- **Hit-target** check prevents clicking an occluding sticky header/toast/overlay (EC-06/28) — pairs with the forced-click recovery rung to make it safe.
- **Budget** is derived from `step.confidence` and `handler_hints` (slow-SPA steps get more), replacing the 700ms fail-fast that breaks on slow re-renders (top-50 #8).
- **Settle for SPAs:** wait on the *target element's* readiness, **never `networkidle`** (it never fires on polling/websocket SPAs — EC-31/34).

A gate failure is not yet a step failure — it routes to the classified ladder (re-scroll for off-screen, re-find for stale, dismiss-overlay for intercept) before any escalation.

---

## 5. ACT — action-type-correct handlers (Family 5 correctness)

Dispatch by `handler_hints.control_kind`, because "it clicked" ≠ "it worked":

| control_kind | Handler |
|---|---|
| native_button / link | click (after gate) |
| native_select | `selectOption` |
| **custom_dropdown** | open → wait options render → click option **by text/value** (EC-26) |
| **typeahead** | focus → type → **wait async options** → select **exact** match (never select before render) (EC-25) |
| **contenteditable** | focus → key events (not `fill` — `fill` silently no-ops on Quill/Slate/TinyMCE) (EC-29) |
| file_input | `setInputFiles` on the real `<input type=file>` (EC-23) |
| date_picker | typed value or day-cell + month-nav per compiled strategy (EC-27) |
| virtualized target | scroll-until-found by stable id, then act (EC-13) |
| hover-gated | walk `hover_chain` → re-hover precondition → act (EC-15/16) |

Forced/JS-dispatch actions are permitted (`recovery.allow_forced_action`) but **always** route through VERIFY afterward — a forced click can land on nothing or a hidden duplicate (EC-28).

---

## 6. On failure → RECOVER (deterministic-first; Phase 6)

`RECOVER(step, reason)` runs the zero-token cascade first (re-resolve next signal → a11y/anchor → frame/shadow re-resolution → scroll-until-found → re-hover → dismiss-known-pattern → auth self-heal), and only on exhaustion escalates to host (Tier 3) → vision (Tier 4) → human (Tier 5). **Every tier's result re-enters VERIFY** before the step is marked RECOVERED. Recovery is bounded by a page-fingerprint retry cap (insight #18) and by `step.recovery.max_tier`. Full specification in `final-recovery-architecture.md`.

---

## 7. How the runtime verifies success (Phase 5 hook)

`VERIFY(step)` reads the **independent post-condition** — a channel the action did not use (DOM state / URL / aria / value re-read / download / count) — against the compiled `verification.post_condition`, frame/shadow-aware, within `verification.timeout_ms`. Pass advances the loop; fail enters recovery. A consequential step with no post-condition is a compile error, so the runtime never advances blind. Detailed in `final-verification-architecture.md`.

---

## 8. Determinism guarantees of this algorithm

1. **No LLM is consulted** in RESOLVE/GATE/ACT/VERIFY or in recovery Tiers 1–2.
2. **No held handles** — every stage re-queries; SPA re-renders cannot create staleness (EC-09).
3. **No silent wrong-element** — uniqueness gate + mandatory verification close EC-28 from both ends.
4. **No lazy grounding** — every signal, score, post-condition, and handler choice was decided at compile.
5. **Bounded** — adaptive budgets, retry caps, and `max_tier` make worst-case cost finite.
6. **Reproducible** — same pack + same app version → same execution path (the basis for version-pinned regression environments, insight #14).

This algorithm, executed against the Phase-2 step model with the Phase-3 selectors, is the deterministic replay core. It is strictly more robust than codegen replay (no verification, single selector), SeleniumBase replay (no compiled identity/verification), and any LLM/vision-in-the-loop approach (non-deterministic), while never spending a token until the deterministic world is exhausted.
