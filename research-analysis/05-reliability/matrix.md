# Master Edge-Case Matrix (Phase 9)

Cross-reference of how each system handles each edge case, with Conxa's current vs recommended state, a reliability score for the **recommended** approach, implementation complexity, and ROI.

**Cell legend:** ✅ deterministic & reliable · ⚠️ partial/conditional/manual · ❌ unhandled/fails · `DET` zero-token deterministic · `LLM` handled via per-step LLM (non-deterministic) · `VIS` via vision/coordinates · `INH` inherited from underlying engine · `—` n/a.
**Reliability Score (Recommended):** 1–5 (5 = production-grade deterministic). **Complexity:** L/M/H. **ROI:** ★1–5.
Sources: the six `*-edge-cases.md` + four deep-dives + `recovery-patterns.md` + `framework.md`.

---

## Family 1 — Identity Drift

| EC | Playwright | SeleniumBase | Stagehand | Browser Use | Fable/CUA | UI-TARS | Conxa Current | Conxa Recommended | Rel | Cx | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EC-09 Re-render/detachment | ✅ late-bound+retry | ✅ re-find on stale | ✅ INH | LLM re-perceive | VIS | VIS | ✅ late-bound (`withLocator`) | **Keep + stability gate + scored re-resolve** | 5 | L | ★★★★★ |
| EC-10 Text changes | ✅ role/text engine | ⚠️ single string | LLM | LLM | VIS | VIS | ⚠️ array-order | **Multi-signal, semantic-first, scored** | 5 | M | ★★★★★ |
| EC-11 Layout/position | ✅ identity≠position | ⚠️ | LLM | LLM | VIS | VIS | ⚠️ position_hint exists | **De-rank position; semantic id** | 4 | L | ★★★★☆ |
| EC-12 Dynamic IDs/GUID | ✅ `isGuidLike` penalty | ❌ if id-based | LLM | ephemeral index ❌ | VIS | VIS | ⚠️ no GUID penalty at runtime | **GUID-penalize; semantic id + scoring** | 5 | M | ★★★★★ |
| EC-44 A/B variants | ⚠️ | ❌ | LLM | LLM | VIS | VIS | ❌ linear | **Conditional `wait_for_one_of`** | 4 | M | ★★★☆☆ |

## Family 2 — Timing & Actionability

| EC | Playwright | SeleniumBase | Stagehand | Browser Use | Fable/CUA | UI-TARS | Conxa Current | Conxa Recommended | Rel | Cx | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EC-05 Not stable (anim) | ✅ RAF stable gate | ⚠️ poll | ✅ INH | ⚠️ | VIS | ⚠️ | ❌ no stable gate | **Adopt RAF stability gate** | 5 | M | ★★★★★ |
| EC-06 Intercepted/overlay | ✅ hit-target+retry | ✅ classified→JS/jQuery | ✅ INH | ⚠️ | VIS | ⚠️ | ⚠️ one-line `last()` | **Full classified ladder + hit-target** | 5 | M | ★★★★★ |
| EC-07 Off-screen | ✅ auto scroll | ✅ scroll-into-view | ✅ INH | ⚠️ | VIS | ✅ | ⚠️ `scrollIntoViewIfNeeded` | **Keep + scroll-until-found (EC-13)** | 5 | L | ★★★★☆ |
| EC-08 Disabled-until-ready | ✅ waits enabled | ✅ waits clickable | ✅ INH | ⚠️ | ⚠️ | ⚠️ | ⚠️ visible-only | **Wait enabled/aria-disabled** | 5 | L | ★★★★☆ |
| EC-31 Slow/spinner/never-idle | ✅ wait-on-element | ✅ ready-state | ✅ INH | ⚠️ | VIS | ⚠️ | ✅ domcontentloaded (no networkidle) | **Keep; wait on target, never networkidle** | 5 | L | ★★★★☆ |
| EC-32 Optimistic/live | ⚠️ | ⚠️ | LLM verify | ⚠️ | VIS | ⚠️ | ❌ | **Verify vs server state; re-resolve by id** | 4 | M | ★★★☆☆ |

## Family 3 — Stochastic Interruptions

| EC | Playwright | SeleniumBase | Stagehand | Browser Use | Fable/CUA | UI-TARS | Conxa Current | Conxa Recommended | Rel | Cx | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EC-19 Cookie/consent banner | ❌ none | ⚠️ `click_if_visible` | LLM | LLM | VIS | VIS | ❌ linear replay | **Conditional `if_present`+dismiss library** | 5 | M | ★★★★★ |
| EC-20 Modal (unexpected) | ❌ | ⚠️ | LLM | LLM | VIS | VIS | ⚠️ dialog-scope on click | **Conditional + dismiss-known + verify** | 4 | M | ★★★★☆ |
| EC-21 MFA/2FA | ❌ | ❌ | LLM/pause | LLM | ✅ recognize→escalate | ✅ CALL_USER | ❌ | **Tier-5 human handoff (rule-trigger)** | 4 | M | ★★★★☆ |
| EC-22 Session-expired | ❌ | ❌ | ⚠️ | ⚠️ | VIS | ⚠️ | ✅ auth re-auth self-heal | **Keep (already strong); generalize handoff** | 5 | — | ★★★★☆ |
| EC-35 Captcha | ❌ | ⚠️ stealth | LLM | LLM | ✅ recognize→stop | ✅ CALL_USER | ❌ | **Detect→Tier-5 handoff** | 3 | M | ★★★☆☆ |
| EC-45 "Still there?" idle | ❌ | ⚠️ | LLM | LLM | VIS | VIS | ❌ | **Conditional dismiss** | 4 | L | ★★★☆☆ |

## Family 4 — Boundary Traversal

| EC | Playwright | SeleniumBase | Stagehand | Browser Use | Fable/CUA | UI-TARS | Conxa Current | Conxa Recommended | Rel | Cx | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EC-01 Single iframe | ✅ frameLocator | ✅ switch_to_frame | ✅ INH | ✅ target-id | VIS flatten | VIS flatten | ✅ `rootCandidates` | **Keep (best-in-class)** | 5 | — | ★★★★★ |
| EC-02 Nested iframe | ✅ chain | ✅ sequential | ✅ INH | ✅ | VIS | VIS | ✅ chain walk | **Keep** | 5 | — | ★★★★☆ |
| EC-03 Cross-origin iframe | ✅ CDP | ✅ CDP | ✅ INH | ✅ CDP | VIS | VIS | ✅ via Playwright/CDP | **Keep; never use contentDocument** | 5 | — | ★★★★★ |
| EC-43 Hidden/detached iframe | ✅ re-resolve | ⚠️ | ✅ INH | ⚠️ | VIS | VIS | ⚠️ frame selector can drift | **Multi-signal FrameFingerprint + recovery** | 5 | M | ★★★★☆ |
| EC-04 Open shadow DOM | ✅ pierces default | ✅ `::shadow` | ✅ INH | ✅ AX | VIS | VIS | ✅ INH (via PW) | **Keep; compiler forbid XPath for shadow** | 5 | M | ★★★★★ |
| EC-04b Closed shadow | ⚠️ AX only | ⚠️ CDP | ⚠️ | ✅ CDP AX | VIS | VIS | ❌ | **AX role+name → CDP pierce → vision** | 4 | M | ★★★☆☆ |

## Family 5 — Outcome Ambiguity & Input Complexity

| EC | Playwright | SeleniumBase | Stagehand | Browser Use | Fable/CUA | UI-TARS | Conxa Current | Conxa Recommended | Rel | Cx | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EC-28 Silent wrong-element | ⚠️ strict-mode guard | ❌ (forced JS hides) | ✅ independent probe | ❌ | ❌ hallucinate | ❌ hallucinate | ❌ no verify | **Independent post-condition (RP-05)** | 5 | M | ★★★★★ |
| EC-25 Typeahead/autocomplete | ⚠️ manual wait | ⚠️ | LLM | LLM | VIS | VIS | ❌ generic fill | **fill→wait-options→select-exact+verify** | 4 | M | ★★★★★ |
| EC-26 Custom dropdown | ⚠️ open+click | ⚠️ | LLM | LLM | VIS | VIS | ⚠️ generic | **open→wait→click-by-text (vs native selectOption)** | 4 | M | ★★★★☆ |
| EC-27 Date picker | ⚠️ | ⚠️ | LLM | LLM | VIS | VIS | ⚠️ fill-or-click | **Typed strategy (type vs day-cell)+verify** | 3 | M | ★★★☆☆ |
| EC-29 Contenteditable/RTE | ⚠️ key events | ⚠️ | LLM | LLM | VIS | VIS | ❌ `fill` fails | **focus+key events; verify content** | 3 | M | ★★★☆☆ |
| EC-23 File upload | ✅ setInputFiles | ✅ | ✅ INH | ⚠️ | VIS | ⚠️ | ✅ setInputFiles | **Keep; verify upload succeeded** | 5 | L | ★★★☆☆ |
| EC-24 File download | ✅ download event | ✅ | ✅ INH | ⚠️ | VIS | ⚠️ | ✅ download queue | **Keep; verify file exists/size** | 4 | L | ★★★☆☆ |
| EC-30 Drag and drop | ✅ dragTo | ✅ | ✅ INH | ⚠️ | VIS | ⚠️ | ✅ `withLocatorPair` | **Keep; verify drop effect** | 4 | M | ★★☆☆☆ |

## Cross-cutting (hover, scroll, nav, vision)

| EC | Playwright | SeleniumBase | Stagehand | Browser Use | Fable/CUA | UI-TARS | Conxa Current | Conxa Recommended | Rel | Cx | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EC-15 Hover menus | ✅ real hover+autowait | ✅ hover_and_click | ✅ INH | LLM | VIS | VIS | ⚠️ hover+separate click | **Hover-gated group + re-hover recovery** | 4 | M | ★★★★☆ |
| EC-16 Chained hover | ✅ | ⚠️ manual | ✅ INH | LLM | VIS | VIS | ❌ | **Per-level appear-gate** | 4 | M | ★★★☆☆ |
| EC-13 Virtualized list | ⚠️ needs loop | ⚠️ | LLM | ⚠️ truncates | VIS | VIS | ❌ no scroll-until-found | **Scroll-until-found by stable id** | 4 | M | ★★★★☆ |
| EC-14 Infinite/lazy load | ⚠️ needs loop | ⚠️ | LLM | ⚠️ | VIS | VIS | ❌ | **Bounded scroll-to-load loop** | 4 | M | ★★★☆☆ |
| EC-33 New tab/popup | ✅ context events | ✅ window switch | ✅ INH | ✅ | VIS | ⚠️ | ✅ noop markers + handlers | **Keep; verify landed context** | 4 | M | ★★★☆☆ |
| EC-34 SPA route change | ✅ wait-on-element | ⚠️ | ✅ INH | ✅ guard | VIS | VIS | ⚠️ URL gate | **Stale-DOM guard + target-readiness** | 4 | M | ★★★★☆ |
| EC-36 Canvas/WebGL | ❌ coords | ❌ | VIS | VIS | ✅ VIS | ✅ VIS | ❌ | **Vision Tier-4 (coord)+verify** | 3 | M | ★★☆☆☆ |
| EC-39 DPI/scaleFactor | — | — | — | — | VIS | ✅ scaleFactor | ❌ | **Adopt scaleFactor in Tier-4** | 3 | L | ★★☆☆☆ |
| EC-37 Icon-only/a11y-only | ✅ role/aria | ⚠️ | ✅ AX | ✅ AX | VIS | VIS | ⚠️ aria in fingerprint | **Prefer role+aria identity** | 4 | L | ★★★☆☆ |
| EC-42 Bot detection | ⚠️ | ✅ UC/CDP stealth | ⚠️ | ⚠️ | VIS | ⚠️ | ✅ human-pacing | **Keep human-pacing; CDP option** | 3 | M | ★★☆☆☆ |

---

## How to read the matrix — the three takeaways

1. **The deterministic repos (Playwright, SeleniumBase) win Families 1, 2, 4 outright; the LLM/vision systems are `LLM`/`VIS` across the board** — universal but non-deterministic. Conxa's "Recommended" column is overwhelmingly `DET`, sourced from Playwright/SeleniumBase, confirming the deterministic-first thesis: Conxa should mine the deterministic repos for ~85% of edge cases and reserve `LLM`/`VIS` for the genuine residual (EC-04b, EC-36, EC-21/35, hard EC-28 re-grounding).

2. **Conxa's "Current" column has three colors:** **✅ genuine strengths** (frames EC-01/02/03, late-bound EC-09, auth self-heal EC-22, open shadow EC-04 inherited, uploads/downloads/dnd), **⚠️ partial** (intercept, identity ordering, hover, URL gate), and **❌ real holes** — and the ❌ holes cluster exactly on the **highest-ROI rows**: EC-28 (verification), EC-05 (stability gate), EC-19/20 (stochastic conditionals), EC-25 (typeahead), EC-13 (virtualization). The gaps are not random — they are the unbuilt deterministic mechanisms.

3. **The highest-ROI improvements (★★★★★) are all zero-token and mostly Medium complexity:** verification (EC-28), stability gate (EC-05), classified ladder (EC-06), multi-signal scoring (EC-10/12), conditional steps (EC-19), typeahead (EC-25), open-shadow compiler discipline (EC-04), and keeping the frame strengths (EC-01/03). None requires an LLM in the hot path. These flow directly into the ranked list in `top-50-improvements.md`.
