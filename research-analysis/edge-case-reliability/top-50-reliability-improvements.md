# Top 50 Reliability Improvements (Phase 10)

The 50 highest-value edge-case reliability improvements Conxa can adopt, ranked highest ROI first. Every entry: **Source · Problem Solved · Reliability Gain (1–5) · Complexity (L/M/H) · Risk (L/M/H) · Implementation Difficulty (L/M/H) · Enterprise Impact (1–5) · ROI (★1–5)**.

**ROI** = (Reliability × Enterprise) discounted by Complexity×Risk×Difficulty. **All but 4 are zero-token (`Z`)** — `H`/`V`/`U` marked. Cross-refs: EC-xx (`edge-case-inventory.md`), RP-xx (`recovery-patterns.md`), framework families (`conxa-edge-case-framework.md`).

---

## Tier 1 — Critical (do these first; highest ROI, all zero-token)

| # | Improvement | Source | Problem solved | Rel | Cx | Risk | Diff | Ent | ROI |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Independent post-condition verification on every consequential step** (wire `verifyAssertions()`) | Stagehand probe; WebArena | EC-28 silent wrong-action corrupting data; gates every repair | 5 | M | L | M | 5 | ★★★★★ |
| 2 | **Actionability stability(RAF) gate** (attached→visible→stable→enabled) | Playwright `_checkElementIsStable` | EC-05/07/08 mis-click on moving/disabled elements | 5 | M | L | M | 4 | ★★★★★ |
| 3 | **Live multi-signal scoring + uniqueness gate at runtime** | Playwright scored gen; SeleniumBase wait_for_any | EC-10/12/28 wrong/array-order match; cashes the compiled fingerprint | 5 | M | M | M | 5 | ★★★★★ |
| 4 | **Full exception-classified click ladder** (stale→re-find, intercepted→JS-dispatch, OOB→re-scroll) | SeleniumBase `click` | EC-06/09 intercept & staleness at zero token | 5 | M | L | M | 4 | ★★★★★ |
| 5 | **Durability-ordered identity at compile** (role+name>text>testid>structural; XPath last) | Mind2Web; Playwright | Root cause of EC-09/10/11/12 drift; fixes cascade ordering (C.1) | 5 | M | L | M | 5 | ★★★★★ |
| 6 | **Conditional / optional / branch steps in skill format** | SeleniumBase `click_if_visible`; WorkArena | EC-19/20/44/45 stochastic states that break linear replay | 5 | M | M | M | 5 | ★★★★★ |
| 7 | **Hit-target check before click** | Playwright `expectHitTarget` | EC-06/28 click lands on occluding node | 4 | L | L | M | 4 | ★★★★★ |
| 8 | **Confidence-aware adaptive timeouts** (replace blunt 700ms) | SeleniumBase tiers; compile confidence | EC-31/05 fail-fast flakiness on slow SPAs | 4 | L | M | L | 4 | ★★★★★ |
| 9 | **Consume compile-time confidence at runtime** | Conxa `confidence/layered.py` (unused) | Per-step budgets, recovery aggressiveness, escalation gating | 4 | L | L | L | 4 | ★★★★★ |
| 10 | **Typeahead/autocomplete handler** (fill→wait-options→select-exact) | WorkArena; SeleniumBase | EC-25 selecting before/ wrong option — top enterprise failure | 5 | M | M | M | 5 | ★★★★★ |
| 11 | **Cookie/consent dismiss-known-pattern library** | SeleniumBase probes | EC-19 banners (~30–50% of loads) blocking the target | 4 | M | L | M | 5 | ★★★★★ |
| 12 | **Scroll-until-found for virtualized lists** (by stable id) | Playwright primitives + loop | EC-13 ag-grid/react-window rows not in DOM | 4 | M | M | M | 5 | ★★★★☆ |

## Tier 2 — High value (zero-token unless noted)

| # | Improvement | Source | Problem solved | Rel | Cx | Risk | Diff | Ent | ROI |
|---|---|---|---|---|---|---|---|---|---|
| 13 | **Hover-gated action group + re-hover recovery** | SeleniumBase hover_and_click | EC-15/16 menu closed → false hard failure | 4 | M | L | M | 4 | ★★★★☆ |
| 14 | **Post-navigation stale-DOM guard** (URL/focus diff abort) | browser-use `multi_act` | EC-09/34 acting on transitioning DOM | 4 | M | L | M | 4 | ★★★★☆ |
| 15 | **Custom-dropdown handler** (open→wait→click-by-text vs native selectOption) | Playwright | EC-26 div-based dropdowns mis-handled as fill/click | 4 | M | L | M | 5 | ★★★★☆ |
| 16 | **Strict/uniqueness wrong-element guard** | Playwright strict mode | EC-28 ambiguous match silently picks wrong node | 4 | L | L | M | 4 | ★★★★☆ |
| 17 | **Compiler: forbid XPath for shadow targets + record shadow host-path** | shadow deep-dive | EC-04 open-shadow (LWC/Salesforce) reliability | 5 | M | L | M | 5 | ★★★★☆ |
| 18 | **Multi-signal FrameFingerprint + frame-level recovery sub-tier** | iframe deep-dive; Playwright | EC-43 frame id drift breaks the chain | 4 | M | M | M | 4 | ★★★★☆ |
| 19 | **Autonomous Tier-3 host describe-then-match** (replace manual host-delegation) `H` | SeeAct; browser-use | EC-09/10/28 residual; unattended self-heal | 4 | H | M | H | 5 | ★★★★☆ |
| 20 | **SPA route readiness: wait on target/view-anchor, not load/networkidle** | Playwright | EC-34 acting too early/never on route change | 4 | L | L | L | 4 | ★★★★☆ |
| 21 | **Wait-enabled / aria-disabled gate** | SeleniumBase clickable | EC-08 acting on disabled-until-ready controls | 4 | L | L | L | 4 | ★★★★☆ |
| 22 | **Stall/loop fingerprint hard cap on recovery** | browser-use PageFingerprint | recovery thrash on stagnant page | 3 | L | L | L | 3 | ★★★★☆ |
| 23 | **Contenteditable / rich-text handler** (focus+key events) | Playwright | EC-29 `fill` silently fails on Quill/Slate/TinyMCE | 4 | M | M | M | 4 | ★★★★☆ |
| 24 | **Closed-shadow escape hatch** (AX role+name→CDP pierce→vision) | shadow deep-dive; CDP | EC-04b closed roots hard-fail today | 4 | M | M | M | 3 | ★★★☆☆ |
| 25 | **Lazy-load bounded scroll-to-load loop** | dynamic-ui deep-dive | EC-14 content loads only on scroll | 4 | M | L | M | 4 | ★★★☆☆ |
| 26 | **Re-resolve moving rows by stable id (not position)** | dynamic-ui deep-dive | EC-32 live/optimistic reorder targets wrong row | 4 | L | L | M | 4 | ★★★☆☆ |
| 27 | **Frame/shadow-aware verification** (read inside chain) | framework §5/§4 | false pass/fail when verifying across boundary | 4 | M | M | M | 4 | ★★★☆☆ |
| 28 | **Tier-5 structured human handoff** (MFA/captcha/destructive) `U` | UI-TARS CALL_USER; Conxa re-auth | EC-21/35 designed stops vs silent failure | 4 | M | L | M | 5 | ★★★★☆ |
| 29 | **Rule-triggered escalation on destructive steps** | Conxa `destructive_semantics` | EC-28 on irreversible actions (pay/delete/submit) | 4 | L | L | L | 5 | ★★★★☆ |
| 30 | **repair_event → Cloud write-back loop** `Z`/coordination | Stagehand (adapted) | drift recurs every run; feeds fleet durability | 4 | H | M | H | 5 | ★★★★☆ |

## Tier 3 — Valuable (complete the coverage)

| # | Improvement | Source | Problem solved | Rel | Cx | Risk | Diff | Ent | ROI |
|---|---|---|---|---|---|---|---|---|---|
| 31 | **Download verification** (file exists/size/type) | SeleniumBase; Playwright | EC-24 "downloaded" but file missing/partial | 4 | L | L | L | 3 | ★★★☆☆ |
| 32 | **Upload verification** (input populated / preview shown) | Playwright | EC-23 upload silently no-op | 4 | L | L | L | 3 | ★★★☆☆ |
| 33 | **Date-picker typed strategy** (type vs day-cell + month nav) | SeleniumBase | EC-27 custom calendars | 3 | M | M | M | 3 | ★★★☆☆ |
| 34 | **A/B variant `wait_for_one_of`** | SeleniumBase | EC-44 divergent DOM per session | 4 | M | L | M | 3 | ★★★☆☆ |
| 35 | **Idle "still there?" conditional dismiss** | conditional steps | EC-45 timeout modal mid-slow-step | 3 | L | L | L | 3 | ★★★☆☆ |
| 36 | **GUID-like id penalty at runtime** | Playwright `isGuidLike` | EC-12 volatile ids chosen over stable signals | 4 | L | L | L | 4 | ★★★☆☆ |
| 37 | **De-rank position_hint for dynamic content** | dynamic-ui deep-dive | EC-11 position breaks on reflow | 3 | L | L | L | 3 | ★★★☆☆ |
| 38 | **Anchor/relational re-find tier** (recorded anchors) | Conxa anchors; Mind2Web | EC-10 text-drifted target found via neighbor | 4 | M | M | M | 4 | ★★★☆☆ |
| 39 | **Wait-for-frame-attached gate** | iframe deep-dive | EC-43 dynamic iframe injection race | 3 | L | L | L | 3 | ★★★☆☆ |
| 40 | **Wait-for-shadow-upgrade gate** | shadow deep-dive | EC-04 component not yet upgraded | 3 | L | L | L | 3 | ★★★☆☆ |
| 41 | **Vision Tier-4 with scaleFactor normalization** `V` | UI-TARS; OS-ATLAS | EC-39/36/04b DOM-opaque targets; HiDPI coord | 3 | M | M | M | 2 | ★★★☆☆ |
| 42 | **SoM annotation as telemetry/drift signal** (not success) | UI-TARS | coordinate drift vs compiled bbox detection | 3 | L | L | M | 3 | ★★☆☆☆ |
| 43 | **New-tab landed-context verification** | Playwright context events | EC-33 acting in wrong window | 4 | L | L | M | 3 | ★★★☆☆ |
| 44 | **Reflection-in-output for Tier-3 prompt** `H` | browser-use AgentOutput | cascading error in LLM tier (pair w/ verify) | 3 | L | L | M | 3 | ★★★☆☆ |
| 45 | **AX-tree rank-and-cap digest for Tier-3** (no blind truncation) | browser-use anti-pattern | target dropped from recovery context on big pages | 4 | M | L | M | 4 | ★★★☆☆ |
| 46 | **Drift detection from recovery-tier telemetry** | Stagehand; durability doc | EC-09 silent skill rot; pre-warn recompile | 4 | M | M | M | 4 | ★★★☆☆ |
| 47 | **Recording-coverage checklist (interactive-element heuristics)** | browser-use ClickableElementDetector | missed event types at capture → unreplayable | 3 | M | L | M | 4 | ★★★☆☆ |
| 48 | **CDP engine option for bot-detection-heavy targets** | SeleniumBase UC/CDP | EC-42 anti-automation blocks | 3 | M | M | H | 3 | ★★☆☆☆ |
| 49 | **Context-menu role/text identity** | Playwright role engine | EC-18 body-root-rendered menu items | 3 | L | L | L | 2 | ★★☆☆☆ |
| 50 | **Deferred/soft post-condition batch reporting** | SeleniumBase deferred asserts | richer run diagnostics; advisory-vs-required asserts | 3 | L | L | L | 3 | ★★☆☆☆ |

---

## The shape of the list

- **47 of 50 are zero-token** (`Z`). Only #19 (autonomous Tier-3, `H`), #28 (handoff, `U`), #41 (vision, `V`) — plus #30/#44/#45 which touch the LLM tier — leave the deterministic band. **Reliability is overwhelmingly a deterministic engineering problem**, exactly as the repo evidence predicted.
- **Tier 1 (#1–12) is the spine** and clusters on Conxa's actual ❌ holes: verification, stability gate, scoring/uniqueness, classified ladder, identity ordering, conditional steps, typeahead, consent banners, virtualization. **All Medium-or-lower complexity, Low-or-Medium risk.** None requires research — they are ports of proven mechanisms from Playwright + SeleniumBase, plus Stagehand's verification idea.
- **The five highest-ROI single items**, if nothing else ships: **#1 verification** (turns silent failures loud — the safety floor), **#3 live scoring + uniqueness** (makes the compiled identity pay off), **#2 stability gate** (kills timing flakiness), **#6 conditional steps** (survives stochastic states), **#5 durability-ordered identity** (the root-cause fix). These five address all five failure families and are the deterministic core of "how Conxa survives real-world browser edge cases."

## The closing answer (the program's two questions)

**"How do world-class automation systems survive real-world browser edge cases?"** — They *prevent* with actionability gates, *identify* with scored multi-signal late-bound locators, *recover* with exception-classified zero-token ladders, *traverse* frame/shadow boundaries as data, *represent* stochastic states as conditionals, and (the best ones) *verify outcomes independently* — escalating to an LLM/vision/human only for the genuine residual.

**"What is the deterministic Conxa equivalent?"** — Exactly the framework in Phase 8, built from these 50 improvements: a zero-token cascade (gates → scored resolution → classified ladder → chain/hover/scroll recovery → dismiss-known → verify) that catches the overwhelming majority of edge cases before any token is spent, with autonomous host re-grounding, bounded vision, and structured human handoff reserved for the edges — and every result, deterministic or escalated, gated by an independent post-condition. Conxa already owns the hardest pieces (late-bound identity, frame chains, compiled multi-signal identity, auth self-heal); this handbook is the map from those strengths to production reliability.
