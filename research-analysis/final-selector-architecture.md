# Final Selector Architecture (Phase 3)

**The question:** how should Conxa identify elements so that replay survives real-world DOM change while staying deterministic and zero-token?

**The answer, in one line:** generate **engine-orthogonal** signals at compile time, **rank them by durability** (semantic > structural, per Mind2Web + Playwright's own cost model), **filter out everything non-deterministic before it reaches runtime**, and **resolve at runtime by live scoring against a fingerprint with a uniqueness gate** — not by trying an array in order.

This phase fixes the corpus's single biggest internal contradiction (audit C.1: v1's cost-first CSS-then-ARIA ordering) and cashes in the multi-signal investment the runtime currently ignores (G5).

---

## 1. Generation strategy — orthogonality over count

Generate **N selectors that fail independently**. Two CSS paths that both depend on the same brittle class are not two signals — they are one. The five orthogonal engines:

| Engine | Example | Fails when | Durability |
|---|---|---|---|
| **role + accessible name** | `role=button[name="Save"]` | the control's semantics change (rare) | **highest** |
| **visible text** | `text="Save changes"` | copy/i18n edits (EC-10) | high |
| **stable test id** | `[data-testid="save-btn"]` | the team removes/renames the testid | high (when present) |
| **scoped CSS** | `header .actions > button.primary` | layout/class refactor (EC-11/12) | low |
| **xpath** | `//button[2]` | almost any DOM change | **lowest — last resort** |

**Generators:** a **deterministic Playwright-style generator floor** (scored, role/text/testid-preferring, `isGuidLike` penalty) produces the structural and semantic-structural signals; the **LLM (compile-time only)** supplies the human-meaningful accessible name and disambiguates intent. The deterministic floor guarantees a baseline even if the LLM is unavailable; the LLM raises semantic quality. Generation happens **only in Build Studio** — the customer never grounds at runtime (insight #15).

**Orthogonality rule:** keep at most one signal per engine; prefer signals whose failure modes are uncorrelated. The goal is that *no single site change invalidates more than one signal*.

---

## 2. Ranking strategy — durability-first (the C.1 fix)

Rank signals by **durability**, not by resolution cost. The evidence is unambiguous:
- **Mind2Web:** semantic signals (role/name/text) survive site change far better than structural ones.
- **Playwright's own selector cost model:** role+name ≈ 100, css-path ≈ 1e7 — i.e. Playwright *already* treats semantic as vastly preferable.

So the runtime fallback order is **role+name → text → testid → scoped-CSS → xpath**, semantic-first. v1's CSS-first ordering paid the Tier-1-miss penalty on every drift and was internally contradictory with the a11y tier; this is corrected at the source (compile emits durability-ordered signals; runtime honors the order).

**Durability score** is computed per signal at compile (engine base score × stability adjustments: `guid_like` penalty, dynamic-content position penalty, testid-present bonus). It drives both runtime ordering and drift ranking (G7).

---

## 3. Durability strategy — make identity outlive the DOM

Three mechanisms make a signal durable across re-renders and releases:

1. **Late-bound re-resolution** — every signal is a string re-queried on every attempt; no handle is ever stored (insight #10). This alone fixes the #1 SPA failure (EC-09) for free.
2. **Relational anchoring** — record stable neighbors ("the button after the 'Incidents' heading") so a text-drifted target is still found via its anchor (EC-10, top-50 #38).
3. **App-version fingerprint** — stamp the compiled-against environment so drift is detectable, not silently mis-resolved (insight #19); feeds the flywheel.

Durability is also a *compile-time editorial act*: when the recorder captures a target whose only signals are structural/volatile, the compiler flags low durability so the author (or a future enrichment pass) can add a better anchor.

---

## 4. Filtering strategy — what must never reach runtime

Filtering is where determinism is won. The compiler **discards** selectors that are non-deterministic or actively dangerous, so the runtime never even attempts them:

**Never generate / always drop:**
- **GUID-like ids and hashed classes** — `#ember1234`, `.css-1a2b3c` (EC-12). Non-deterministic across loads.
- **`nth-of-type` / positional selectors on dynamic content** — break on reflow/virtualization (EC-11/13).
- **Absolute XPath** — brittle to any structural change.
- **XPath for shadow-DOM targets** — XPath does not pierce shadow roots; emitting it guarantees failure on LWC/Salesforce (top-50 #17). **Hard rule.**
- **Selectors that depend on text known to be templated/dynamic** (timestamps, counts, user names) unless bound to a skill input.
- **In-page `contentDocument` frame traversal** — dies on cross-origin iframes (EC-03). Frames are traversed via Playwright/CDP `frameLocator`, encoded in `frame_chain`.

**Never reach runtime (filtered even if generated):**
- Any signal that did **not uniquely resolve the recorded target at compile time** — if it was ambiguous in Studio, it will be ambiguous (and dangerous) in production (EC-28).
- Redundant same-engine signals (keep the best per engine — orthogonality rule).

---

## 5. The tiered selector architecture

```
        COMPILE (Studio)                          RUNTIME (deterministic resolve)
 ┌──────────────────────────────┐        ┌────────────────────────────────────────┐
 │ GENERATE orthogonal signals  │        │ For each signal in DURABILITY order:    │
 │  (det. floor + LLM naming)   │        │   1. re-query live (late-bound)         │
 │            │                 │        │   2. score candidates vs fingerprint    │
 │ SCORE durability per signal  │        │   3. UNIQUENESS gate:                    │
 │            │                 │  ───▶  │        1 unique strong match → USE      │
 │ FILTER non-deterministic /   │        │        >1 match → tie-break by          │
 │  ambiguous / shadow-xpath    │        │           fingerprint+anchors; if still │
 │            │                 │        │           ambiguous → DO NOT GUESS       │
 │ RANK semantic→structural     │        │   4. miss → next signal                 │
 └──────────────────────────────┘        │ all signals miss/ambiguous → RECOVERY   │
                                         └────────────────────────────────────────┘
```

**Tiering of the runtime resolution itself** (all zero-token, all inside Tier-1/2 of recovery):

| Resolve tier | Signal | Gate |
|---|---|---|
| R-1 | role + name | uniqueness + fingerprint score |
| R-2 | visible text | uniqueness + anchor agreement |
| R-3 | test id | uniqueness |
| R-4 | scoped CSS | uniqueness + `guid_like` penalty |
| R-5 | xpath (non-shadow only) | uniqueness; lowest confidence |
| → | a11y role+name re-probe / anchor relational / scroll-until-found / re-hover | recovery Tier-2 |

The **uniqueness gate** is the safety mechanism that distinguishes Conxa from every tool that "takes the first match": a signal that resolves *multiple* nodes is never used by silently picking `[0]` (the EC-28 trap) — it tie-breaks by fingerprint+anchors, and if still ambiguous, escalates rather than guesses.

---

## 6. What this beats

- **Playwright codegen:** emits *one* selector (often CSS); no fallback, no scoring, no uniqueness re-check at replay. Conxa carries an orthogonal scored set.
- **SeleniumBase:** robust re-find on stale, but a single user-written selector; no compiled durability ranking.
- **Stagehand:** grounds lazily at runtime (cost + non-determinism); Conxa grounds once at compile and ships a deterministic set.
- **browser-use / Fable:** re-perceive every step via LLM/vision — non-deterministic, in the hot path. Conxa keeps the hot path zero-token and only re-grounds at the recovery edge.

**Net:** identity that is multi-signal, orthogonal, durability-ranked, non-deterministic-filtered, and uniqueness-gated — generated once at compile, resolved deterministically at runtime — is strictly more robust than any single-selector or lazy-grounding approach in the corpus, while preserving the zero-LLM hot path. This is the identity foundation the replay guarantee (Phase 4) and verification (Phase 5) rest on.
