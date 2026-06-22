# Final Step Model (Phase 2)

**Purpose:** the exact, final schema for a single compiled workflow step. This is the data contract between the compiler and the deterministic runtime. Every field exists because a specific failure family (`edge-case-inventory.md`) or insight (`top-25-insights.md`) demands it; anything that earns no reliability, verification, recovery, or audit value is removed.

**Design rules:**
1. **Late-bound only** — a step stores *how to find* an element (signals), never a node handle (insight #10).
2. **Self-contained** — replay needs nothing but the step and the live page; no ambient runtime state, no lazy grounding.
3. **Orthogonal, scored identity** — multiple engine-orthogonal signals, durability-ranked (insight #3, G5).
4. **Verification is mandatory on consequential steps** — a step without a post-condition cannot prove it worked (insight #2).
5. **Boundary context travels in identity** — frame/shadow chain is part of the element's identity, not a side channel (insight #12).

---

## 1. The schema

```jsonc
{
  // ─── A. Identity of the step ───────────────────────────────
  "step_id": "s14",                      // stable id; survives recompiles for diff/rollback
  "sequence": 14,                        // ordinal in the linear plan
  "action": "click",                     // enum: click|fill|select|type|upload|download|
                                         //       hover|press|navigate|frame_enter|frame_exit|
                                         //       wait|assert|scroll  (action-type-correct handlers)
  "intent": "Open the 'New Incident' form",   // human-readable goal (from Understanding layer)

  // ─── B. Element identity (multi-signal, orthogonal, scored) ─
  "target": {
    "signals": [                         // ORDERED semantic→structural (durability-first)
      { "engine": "role",   "value": "button[name='New Incident']", "durability": 0.95 },
      { "engine": "text",   "value": "New Incident",                "durability": 0.80 },
      { "engine": "testid", "value": "btn-new-incident",            "durability": 0.85 },
      { "engine": "css",    "value": "header .actions > button.primary", "durability": 0.40 }
      // xpath, if present, is always LAST and never for shadow targets
    ],
    "fingerprint": {                     // for LIVE scoring + uniqueness (not just fallback)
      "role": "button", "name": "New Incident",
      "tag": "button", "attributes": { "data-testid": "btn-new-incident" },
      "text": "New Incident",
      "anchors": [                       // relational re-find (recorded neighbors)
        { "relation": "preceding-sibling", "role": "heading", "name": "Incidents" }
      ],
      "bbox": { "x": 1180, "y": 96, "w": 132, "h": 32 },   // page-level; vision/drift only
      "guid_like": false                 // flags volatile ids to de-rank at runtime
    },

    // ─── C. Boundary context (travels WITH identity) ──────────
    "frame_chain": [                     // verbatim from recording; preserved through compile
      { "signals": [{ "engine": "src",  "value": "/incident/form", "durability": 0.6 },
                    { "engine": "name", "value": "gsft_main",       "durability": 0.8 }] }
    ],
    "shadow_path": [                     // open-shadow host chain; XPath FORBIDDEN here
      { "host": "x-incident-form", "mode": "open" }
    ]
  },

  // ─── D. Action payload ─────────────────────────────────────
  "value": null,                         // for fill/type/select; templated input ref if dynamic
  "input_ref": null,                     // binds to skill input (e.g. "$.short_description")
  "handler_hints": {                     // action-type specifics (Family 5 correctness)
    "control_kind": "native_button",     // native_select|custom_dropdown|typeahead|
                                         //   contenteditable|file_input|date_picker|...
    "virtualized_container": null,        // selector of scroll container if target virtualized
    "hover_chain": []                    // ordered hover preconditions (EC-15/16)
  },

  // ─── E. Expected outcome + verification (mandatory if consequential) ─
  "expected_outcome": "An incident form modal becomes visible",
  "verification": {
    "required": true,                    // false only for pure navigation markers
    "channel": "dom_state",              // dom_state|url|aria|value_read|download|count
    "post_condition": {                  // independent of the action's own signal
      "type": "element_visible",
      "signals": [{ "engine": "role", "value": "dialog[name='New Incident']" }],
      "frame_chain": [],                 // verification is frame/shadow-aware
      "timeout_ms": 5000
    },
    "strength": "strong"                 // strong (state/db/url) > weak (selector-present)
  },

  // ─── F. Conditional / control flow (Family 3) ──────────────
  "precondition": null,                  // if_present(selector) → run; else skip
  "branch": null,                        // wait_for_one_of: [ {when, goto} ... ]
  "optional": false,                     // a missing optional step is not a failure

  // ─── G. Recovery policy ────────────────────────────────────
  "recovery": {
    "block": "default",                  // "no_recovery_block" for frame_enter/frame_exit
    "max_tier": 5,                       // cap escalation (e.g. 2 = deterministic-only)
    "destructive": false,               // pay/delete/submit → rule-triggered Tier-5 confirm
    "allow_forced_action": true          // JS-dispatch permitted (still must VERIFY)
  },

  // ─── H. Scores (compiled; CONSUMED at runtime) ─────────────
  "confidence": 0.91,                    // compile-time confidence (layered.py) — drives budgets
  "durability_score": 0.88,              // identity robustness; feeds drift detection
  "confidence_threshold": 0.6,           // below → don't guess, escalate

  // ─── I. Provenance (audit + flywheel) ──────────────────────
  "source_event_ids": ["e41", "e42"],   // back-trace to recording for diff/repair
  "app_version_fingerprint": "sha256:…"  // staleness/drift detection (insight #19)
}
```

---

## 2. Why every field exists (and what was cut)

| Field | Failure it prevents / value | Source |
|---|---|---|
| `action` (typed) | wrong handler on typeahead/dropdown/contenteditable (EC-25/26/29) — "it clicked ≠ it worked" | Family 5 |
| `intent` | seeds Tier-3 describe-then-match; audit readability | SeeAct #6 |
| `target.signals` (orthogonal, scored) | single-selector identity fails on any DOM change (EC-09/10/11/12) | insight #3 |
| `durability` per signal | resolve semantic-first; fixes cost-first C.1 contradiction | Mind2Web |
| `fingerprint` | **live scoring + uniqueness gate** — the multi-signal investment only pays off here (G5) | Playwright |
| `anchors` | relational re-find when text/structure drifts (EC-10) | Mind2Web/Conxa |
| `guid_like` | de-rank volatile ids at runtime (EC-12, top-50 #36) | Playwright `isGuidLike` |
| `bbox` | vision Tier-4 search-narrowing + drift signal — **never** primary identity | UI-TARS/OS-ATLAS |
| `frame_chain` / `shadow_path` | boundary traversal as data; cross-origin-safe via CDP (EC-01/02/03/04) | insight #12 |
| `handler_hints.control_kind` | dispatch the correct action handler (Family 5) | WorkArena |
| `virtualized_container` | scroll-until-found instead of failing on absent row (EC-13) | dynamic-ui |
| `hover_chain` | hover-gated action group + re-hover recovery (EC-15/16) | SeleniumBase |
| `expected_outcome` + `verification` | **the trust spine** — turns silent failure loud, gates every repair (EC-28) | insight #2 |
| `verification.channel` (independent) | must not reuse the action's own signal, or it proves nothing | Stagehand probe |
| `verification.strength` | strong vs weak post-condition drives confidence band | framework §1 |
| `precondition` / `branch` / `optional` | survive stochastic states without linear-replay breakage (EC-19/20/45) | insight #7 |
| `recovery.block` | `frame_enter/exit` never retried (invariant) | CLAUDE.md |
| `recovery.max_tier` / `destructive` | rule-triggered human handoff on irreversible steps (EC-28 on pay/delete) | UI-TARS #17 |
| `confidence` + `threshold` | per-step budgets, recovery aggressiveness, escalation gating — **compiled today, ignored at runtime** (G5/#9) | confidence/layered.py |
| `durability_score` | feeds breakage detection + flywheel ranking | G7 |
| `app_version_fingerprint` | a content-hash hit on a stale selector = guaranteed failure (audit B.2); detect drift | insight #19 |
| `source_event_ids` | diffable IR → rollback, repair suggestion, audit | G10 |

**Removed / rejected fields (kept the model lean):**
- **Stored node handle / element reference** — violates late-binding; stale within ms (insight #10). *Removed.*
- **Single "best selector" string** — the v1 brittleness root cause; replaced by the orthogonal signal set. *Removed.*
- **Raw screenshot per step in the pack** — heavy; the fingerprint + bbox carry what vision Tier-4 needs; screenshots live in telemetry, not the artifact. *Removed.*
- **Cost-ordered tier index** — replaced by `durability`-ordered signals (semantic-first). *Removed.*
- **Inline LLM prompt / cached LLM output** — no lazy runtime grounding; compile is the only grounding (insight #15). *Removed.*
- **Free-form "notes"** — non-actionable; intent + provenance cover audit. *Removed.*

---

## 3. Invariants enforced by the model

- **Identity is a function `(frame_chain, shadow_path, orthogonal_signals)` re-evaluated every attempt** — never a handle.
- **Every consequential step carries an independent post-condition.** A consequential step compiled without one is a compile error (verification-planner responsibility).
- **`frame_enter`/`frame_exit` carry `recovery.block = no_recovery_block`** and no verification (they are markers).
- **Shadow targets carry `shadow_path` and never an XPath signal** (XPath doesn't pierce — top-50 #17).
- **The runtime consumes `confidence`, `confidence_threshold`, and per-signal `durability`** — the model is useless if the runtime ignores its own scores (the current G5 gap).

This step model is the single source of truth for Phases 3 (how `signals` are generated/filtered), 4 (how the runtime executes the model), 5 (how `verification` runs), 6 (how `recovery` escalates), and 8 (how steps assemble into a pack).
