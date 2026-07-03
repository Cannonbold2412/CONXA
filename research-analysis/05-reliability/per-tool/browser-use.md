# browser-use — Edge-Case Handling (Reliability Lens)

> **Framing.** browser-use runs an LLM **on every step**: re-perceive the page → serialize to an indexed AX+DOM text representation → let the LLM re-ground and emit actions → execute → loop. Its edge-case "handling" is almost entirely *re-perception + LLM re-grounding* — the **opposite** of Conxa's deterministic record→compile→replay hot path. That core loop is **not adoptable** for Conxa.
>
> But buried in the loop are four genuinely deterministic, Conxa-compatible mechanisms that earn their place in Conxa's **recovery tier and runtime guards**:
> 1. **multi_act page-change guards** (`terminates_sequence` + runtime URL/focus diff) — a deterministic stale-DOM guard. *(EC-09/34, cover deeply.)*
> 2. **PageFingerprint** (url + element_count + DOM-text hash) — a cheap deterministic stall signal to hard-cap recovery retries.
> 3. **ClickableElementDetector heuristics** — a *checklist* of what counts as interactive (recording-coverage value), not an identity mechanism.
> 4. **AX-tree + computed-styles serialization** — the text-first re-grounding representation for Conxa Tier-3 (cheaper than vision).
>
> Everything else — `selector_map` integer index identity, `max_clickable_elements_length` blind truncation — is studied as an **anti-pattern** to contrast against Conxa's compiled identity.
>
> Corpus root: `/tmp/research-corpus/repos/browser-use-main/browser_use/`. Organized by the five edge-case families.

---

## How browser-use perceives a page (shared substrate for every EC below)

`DomService.get_serialized_dom_tree` (`dom/service.py`) builds one perception artifact per step by **fusing three CDP sources** into `EnhancedDOMTreeNode`s:
- **CDP DOM tree** — structure, tag, attributes, `backend_node_id`, computed `xpath`.
- **Accessibility tree** — `_get_ax_tree_for_all_frames` (`service.py:339`) calls `Accessibility.getFullAXTree` per frame and **merges nodes across all frames into one array** (`service.py:376-383`); supplies `role` + AX `properties` (`focusable`, `checked`, `expanded`, `disabled`, `hidden`...).
- **DOM snapshot** (`enhanced_snapshot.build_snapshot_lookup`) — computed styles (`display`, `visibility`, `opacity`, `cursor`), bounds (`DOMRect`), client/scroll rects.

`Serializer.serialize_accessible_elements` (`dom/serializer/serializer.py:100`) walks the fused tree, keeps visible/scrollable/shadow-host nodes, runs `ClickableElementDetector.is_interactive` on each, assigns a **per-step integer index** to interactive+visible nodes, and flattens to indexed text via `llm_representation()`. The result is `SerializedDOMState{ _root, selector_map: dict[int, EnhancedDOMTreeNode] }`.

**Two structural costs (acknowledged):** (a) a **new CDP websocket is opened per step** (`service.py:41` TODO) — latency/resource debt; (b) the serialized element text is **blindly char-truncated** at `max_clickable_elements_length` (default 40000) before reaching the LLM — see EC-13.

**The identity anti-pattern.** The integer `index` is *ephemeral* — re-minted every step. `selector_map[12]` this step is a different element next step. There is **no durable cross-step element ID**. This is the precise inverse of Conxa's compile-time multi-signal identity. browser-use can afford it only because the LLM re-grounds from scratch each step; Conxa cannot and must not.

---

## Family 1 — Identity drift (EC-09/10/11/12/44; EC-04/04b boundaries)

### EC-12 / EC-28 — Element identity & "what counts as interactive"

- **Detection.** None, deterministically. There is no "the element moved / was replaced" detector. If `index` fails to resolve or a click throws, that surfaces only as an `ActionResult.error` string fed to the next LLM prompt.
- **Representation.** Identity = integer index into the per-step `selector_map`. The backing `EnhancedDOMTreeNode` carries `backend_node_id`, `xpath`, attributes, AX role/name, bounds, frame/target IDs — but **none of this is used as a stable identity**; it is re-derived every step.
- **Resolution.** `index → EnhancedDOMTreeNode → backend_node_id`, then CDP acts on the node. Single-step only.
- **Recovery.** Re-perceive + re-prompt. No "try an alternate selector for the same intended element," because there *is* no recorded intended element.
- **Reliability.** Robust against DOM churn **because** identity is thrown away each step — re-grounding sidesteps staleness at the cost of an LLM call every step. Zero durability.
- **Conxa applicability — ANTI-PATTERN for identity; CHECKLIST for coverage.** The ephemeral index is exactly what Conxa rejects (Key Invariant: compiled multi-signal identity, zero-LLM Tier 1/2). **However**, `ClickableElementDetector.is_interactive` (`dom/serializer/clickable_elements.py`, full file read) is a high-value **recording-coverage checklist** — what Conxa's recorder must recognize as an interactable so it never silently fails to capture a target:
  - **JS click listeners via CDP** (`has_js_click_listener`, line 41) — catches `@click`/`onClick`/`(click)` framework handlers with no DOM signal. *(The single most valuable heuristic; covers EC-37 icon-only / div-button cases.)*
  - **`label`/`span` wrappers** containing form controls ≤2 levels deep (`has_form_control_descendant`, lines 59-72) — Ant-Design-style radio/checkbox wrappers; skips `label[for]` to avoid double-activation.
  - **Search-affordance detection** by class/id/`data-*` tokens (`search`, `magnify`, `glass`, `lookup`...) lines 76-103.
  - **AX properties** (`focusable`/`editable`/`settable`/`checked`/`expanded`/`pressed`/`selected`/`keyshortcuts`) lines 106-132 — and `disabled`/`hidden` as *negative* signals (directly relevant to **EC-08 disabled-until-ready**).
  - **Interactive tags** (`button,input,select,textarea,a,details,summary,option,optgroup`) line 139; **event-handler attrs** (`onclick`,`tabindex`...) + **ARIA roles** (incl. `row`/`cell`/`gridcell` — grid interactivity) lines 174-226.
  - **Icon-sized fallback** (10–50px box with `class`/`role`/`aria-label`/`onclick`) lines 229-240 — EC-37.
  - **`cursor:pointer` final fallback** line 243 — catches what Chrome's listener detection missed.
  Conxa should mine this set as a **recording completeness assertion** ("did we capture an interactable the user clicked that has only a JS listener / only cursor:pointer?"), *not* import its scoring as resolution logic.

### EC-09 / EC-34 — SPA re-render / detachment / route-change-without-navigation **(deep — top adoptable guard)**

This is browser-use's most directly Conxa-adoptable, fully **deterministic** mechanism: the **`multi_act` page-change guards** (`agent/service.py:2718-2837`). When the LLM emits a multi-action batch (`[click X, type Y, click Z]`), the danger is that action 1 navigates / re-renders, invalidating the `selector_map` that actions 2-3 were grounded against — i.e. **acting on stale DOM**. Two deterministic layers prevent this:

- **Layer 1 — static `terminates_sequence` flag** (`service.py:2804-2809`). Actions declared page-changing at registration (`@registry.action(..., terminates_sequence=True)` — navigate, search, go_back, switch_tab) **abort all remaining queued actions** the moment they execute. No runtime check needed; the action *type* is known to invalidate the snapshot.
- **Layer 2 — runtime URL/focus diff** (`service.py:2767-2817`). For every action, capture `pre_action_url = get_current_page_url()` and `pre_action_focus = agent_focus_target_id` **before**, and the same **after**. If `post != pre` on **either** (`service.py:2815`), log "Page changed after X — skipping N remaining action(s)" and **break the batch**. This catches page changes that *aren't* statically declared — a click that triggers a client-side route change (EC-34) or a re-render that swaps the focused target.
- Also: `done` is only honored as a single action (line 2751); a per-action exception preserves partial results and returns early (lines 2819-2835), so the agent knows exactly which queued actions ran before the break.

**Reliability.** Deterministic, zero-LLM, zero false-block risk: it only ever *stops early and re-perceives* — it never forces an action through. The cost of a false "page changed" is one wasted re-perception, never a wrong action on stale DOM.

**Conxa applicability — DIRECTLY ADOPTABLE as a runtime guard.** Conxa's runtime sequence executor (`runtime/run.js`) replays *compiled* steps, but the same staleness risk exists: if a compiled step navigates or triggers an SPA re-render, the *next* compiled step's resolution must run against the **new** DOM, not a cached handle/snapshot. Adopt both layers deterministically:
  - **Static layer** maps cleanly onto Conxa's existing `frame_enter`/`frame_exit` `no_recovery_block` markers (CLAUDE.md invariant) — *same family of idea, generalized*: tag compiled steps known to change the page (navigation, submit, route-changing clicks) so the executor invalidates any cached resolution state and forces a fresh perceive before the next step. (browser-use's `terminates_sequence` is the prior art for "this action type ends the safe-to-batch window.")
  - **Runtime layer** is the stronger borrow: after every step, deterministically diff **URL + focused-frame/target + a cheap DOM signal**; if any changed, **invalidate cached element handles/snapshots** so the next step re-resolves against fresh DOM rather than a detached node. This is a precise EC-09 defense (React detachment between find-and-act) that costs *nothing* and needs *no LLM*. Conxa should treat "URL or focus changed since I last perceived" as a hard "re-resolve, do not reuse" gate in the hot path.

### EC-10 / EC-11 / EC-44 — text/label/layout/A-B variance

No deterministic handling; absorbed by per-step re-perception (the LLM re-reads current labels/positions). **Conxa applicability:** none directly — these are exactly the cases Conxa's compiled multi-signal identity + Tier-3 LLM re-grounding (against a *recorded* target) handle better. browser-use contributes only the *representation* for that re-grounding (next section).

### EC-04 / EC-04b — Shadow DOM

The serializer keeps shadow hosts and walks `children_and_shadow_roots` (clickable detector line 14); open shadow content is folded into the merged AX tree. Closed roots remain opaque (AX/coordinate only). **Conxa applicability:** confirms the AX-tree path pierces open shadow DOM "for free" — useful for Conxa's Tier-3 a11y digest; not a deterministic Tier-1/2 solution.

---

## Family 2 — Timing & actionability (EC-05/06/07/08/31/32)

- **Detection / Resolution.** browser-use does **not** implement deterministic actionability gates (no 2-stable-frames stability check, no pointer-interception probe, no scroll-into-view-then-verify ladder). Timing failures surface as click errors → `ActionResult.error` → next LLM step. EC-08 disabled-state is *perceived* (AX `disabled` property excludes the node from interactivity, clickable detector lines 109-115) but not *waited on*.
- **EC-31 never-idle.** Handled by **bounded timeouts**, not idle-waiting: per-LLM-call timeout, per-step timeout, and `_ACTION_TIMEOUT_FALLBACK_S = 180s` so a dead socket returns an error instead of hanging. browser-use never relies on `networkidle`.
- **EC-32 optimistic UI / live shifts.** Indirectly surfaced by PageFingerprint (a churning page yields changing fingerprints → no stagnation nudge; a frozen one does) — but no targeted handling.
- **Reliability.** Survives timing issues only via re-perception + LLM patience; the loop nudges (Family 3 infra) discourage infinite retry on a frozen page.
- **Conxa applicability.** Low for resolution — Conxa's deterministic actionability ladder (stability gate, pointer-interception, scroll-into-view) is strictly better and is the right place for this family. The one borrow is **bounded-everything discipline**: every recovery/perception op in Conxa should carry a hard timeout so a hung CDP/Playwright call degrades to a structured error, never a deadlock.

---

## Family 3 — Stochastic interruption (EC-19/20/21/22/45/35/41) + stall/loop control

### Interruptions themselves (banners, modals, MFA, auth-redirect, captcha)

browser-use has **no conditional/optional-step representation** and no deterministic dismissal of known patterns. A consent banner (EC-19) or unexpected modal (EC-20) is simply *re-perceived*; the LLM decides to dismiss it. Captcha (EC-35) is detected (`_prepare_context` captcha check; end-of-run judge flags `reached_captcha`) but delegated/halted, not solved. Auth-redirect (EC-22) is not self-healed — the LLM just sees a login page. **Conxa applicability:** none adoptable here — this family needs Conxa's *compile-time conditional representation* (optional/dismiss-known-pattern steps) + its genuine re-auth self-heal, which browser-use lacks. browser-use is a **negative example**: per-step LLM is how you "handle" stochastic interruptions *without* conditional structure, and it is exactly the cost Conxa avoids.

### Stall / loop detection — **the adoptable deterministic guard** (`agent/views.py:95-248`)

This is the second directly-adoptable mechanism, and it is **fully deterministic**:
- **`PageFingerprint`** (`views.py:95-107`) = `url` + `element_count` + **first-16-chars of SHA-256 of the DOM-text representation**. A frozen, immutable, three-signal page identity computed in microseconds.
- **`ActionLoopDetector`** (`views.py:157-248`):
  - **Page stagnation** — `record_page_state` (line 187) compares the new fingerprint to the previous; equal ⇒ `consecutive_stagnant_pages += 1`, else reset. ≥5 unchanged ⇒ "page hasn't changed across N actions; your actions may not be having effect" (lines 239-244).
  - **Action repetition** — `record_action` hashes a **normalized** action (`_normalize_action_for_hash`, lines 110-148: clicks hashed by `index` only, inputs by `index`+normalized text, navigate by URL, search by sorted query tokens) into a rolling window of 20; escalating nudges at **5 / 8 / 12** repeats (lines 216-236).
- **Soft by design** (line 160): it only **injects awareness text** into the next prompt (`service.py:1492` `get_nudge_message`); it **never blocks**. Wired via `_update_loop_detector_page_state` (service.py:1519) and `_update_loop_detector_actions` (service.py:1500).

- **Reliability.** Extremely cheap, zero false-block (it can't block), high signal. The fingerprint is the right *primitive*; browser-use just chooses to use it softly.
- **Conxa applicability — ADOPTABLE, but flipped from soft to HARD.** browser-use uses the fingerprint to *nudge an LLM*; Conxa should use the **same primitive as a deterministic HARD-CAP on recovery retries** so a self-healing loop cannot thrash:
  - Compute a `PageFingerprint`-equivalent (url + interactable-count + DOM-text hash) before/after each recovery attempt. If the fingerprint is **unchanged across N recovery attempts**, the page is stagnant → **stop escalating, fail the step with a clean signal** rather than burning the full Tier-3/Tier-4 budget against a frozen page. This caps cost and prevents the "self-healing loop thrashes on an unrecoverable page" failure.
  - The **normalized action hash** is a good model for "am I retrying the *same* resolution and getting the *same* nothing?" — a deterministic stop condition for Conxa's recovery cascade.
  - Net: adopt PageFingerprint as a **runtime guard / retry hard-cap**, not as an advisory nudge.

---

## Family 4 — Boundary traversal (EC-01/02/03/04/04b/43)

- **Detection / Representation.** Frames are **first-class in perception**: `_get_ax_tree_for_all_frames` (`service.py:339`) recurses every frame and **merges all frames' AX nodes into one tree**; the snapshot pass reads per-iframe scroll positions (`service.py:399-435`); each `EnhancedDOMTreeNode` carries **frame/target IDs**, so an element "knows" which frame it lives in. **Cross-origin iframes (EC-03)** are reachable because traversal is **protocol-level (CDP per-target sessions, `get_or_create_cdp_session(target_id=...)`)**, not `document.querySelector` from the parent — the only approach that works cross-origin. Bounds are accumulated up the iframe parent chain into page coordinates (`service.py:283-336`), matching Conxa's "page-level bounding boxes" invariant. Iframe budget: `max_iframes=100`, `max_iframe_depth=5`; child-frame detach mid-request is tolerated (`return_exceptions=True`, line 366) — an EC-43 (detached iframe) defense.
- **Resolution / Recovery.** Once an interactive node in any frame has an index, the LLM addresses it like any other; CDP routes the action to the right target via the node's session. No explicit frame-chain *replay* (browser-use re-derives frames every step); recovery is re-perception.
- **Reliability.** Strong cross-origin/nested coverage **because** it's CDP-per-target + merged AX, but no durable frame-chain artifact.
- **Conxa applicability.** Conxa already preserves the iframe chain verbatim from record→compile→replay (CLAUDE.md invariant) — strictly more durable. The adoptable lesson: **merged-AX-across-frames is the right representation for the Tier-3 re-grounding digest** (so the LLM sees cross-origin/shadow content the parent JS can't reach), and **CDP-per-target traversal** is the correct mechanism for cross-origin (EC-03), validating Conxa's protocol-level frame approach over JS-from-parent.

---

## Family 5 — Outcome ambiguity (EC-25/26/27/28/29/23/24)

- **Detection.** browser-use has **no per-step post-condition assertion**. "It clicked" is taken as success unless the action itself errored. EC-28 (silent wrong-element) is the explicit blind spot — a forced action on the wrong node returns no error. Outcome is judged only **post-hoc, whole-trace**, by the optional LLM **judge** (`agent/judge.py`, `JudgementResult` with `verdict`/`failure_reason`/`impossible_task`/`reached_captcha`).
- **EC-25 autocomplete / EC-26 custom dropdown / EC-27 date picker / EC-29 contenteditable.** No specialized deterministic handling; the LLM re-perceives the options/widget that appeared and clicks. Correct option selection depends entirely on LLM grounding — exactly the WorkArena failure surface, with no independent verification.
- **EC-23/24 file upload/download.** Handled as registered tools with download tracking in `_post_process`, but no deep edge-case treatment in the perception/recovery path studied here.
- **Reliability.** Weakest family for browser-use: no step-level verification means silent-wrong-action can pass into a post-hoc judge that may also miss it.
- **Conxa applicability — NEGATIVE example, reinforces Conxa's design.** This family *cannot* be solved by re-perception; it needs **independent post-condition verification**, which Conxa already compiles per-step (`validation_planner.py` → runtime `verifyAssertions()`). browser-use's post-hoc-only judge is precisely what Conxa's per-step assertions improve on. The only adoptable piece is the **judge as an end-of-run telemetry/quality signal** layered *on top of* (never instead of) Conxa's per-step assertions.

---

## AX-tree + computed-styles as the Tier-3 re-grounding representation (cross-cutting)

The most broadly reusable idea: a page can be made **fully LLM-groundable from the accessibility tree + computed styles + bounds, no screenshot required**. The AX tree is the backbone (role, name, state, cross-frame, pierces open shadow DOM); computed styles + bounds + `cursor`/listener signals supply the interactivity layer; the screenshot is *augmentation*, not the substrate. `llm_representation()` flattens this to compact **indexed text**.

**Conxa applicability — ADOPT for Tier-3.** When deterministic Tier-1/2 resolution fails and Conxa escalates, build exactly this kind of compact **indexed AX+computed-style digest** (text-first, cheaper than vision Tier-4) and hand it to the LLM — but with Conxa's decisive advantage: present **both** the *recorded target's* multi-signal identity **and** the current page's ranked indexed candidates, so the LLM re-grounds against a **known intent**, not a blank task. Mirror the reflection structure (`AgentOutput.evaluation_previous_goal` + `next_goal`, `views.py:388-406`) by having the recovery LLM emit `evaluation_of_failure` + `chosen_candidate_index` + `confidence`. Critically: when building that candidate list, **rank-and-cap against the recorded target — never blind-truncate** (EC-13).

---

## EC-13 — Large / virtualized DOM: the truncation anti-pattern

`PromptMessage` (`agent/prompts.py:244-250`) computes `elements_text = llm_representation(...)` then, if `len > max_clickable_elements_length` (default 40000, `agent/views.py:92`), does **`elements_text[: max]`** and appends "(truncated to N characters)". This is a **blind positional char-cut**: elements past the 40k boundary are **silently dropped regardless of relevance** — on a large or virtualized page (react-window/ag-grid, EC-13) the actual target can fall off the end and become ungroundable, with no ranking toward what's needed. (Virtualization itself — rows not in DOM until scrolled — is otherwise unhandled; the LLM must choose to scroll.)

**Conxa applicability — explicit ANTI-PATTERN.** Conxa's Tier-3 AX candidate digest must **rank-and-cap against the recorded target's signals** (role/name/text/attributes/position similarity), keeping the top-K most-likely candidates — **never** a positional `[:N]` truncation. The recorded target gives Conxa a ranking key browser-use structurally lacks; use it.

---

## What Conxa should adopt from browser-use (5 bullets)

1. **multi_act page-change guards → deterministic runtime stale-DOM guard.** Adopt both layers from `multi_act` (`service.py:2718-2837`): (a) statically tag page-changing compiled steps so cached resolution is invalidated before the next step (generalizing the existing `frame_enter/exit` `no_recovery_block` idea), and (b) after every step, diff **URL + focused frame/target + cheap DOM signal** and force re-resolution on any change — so the hot path never acts on a detached/stale node (EC-09/34). Zero LLM, zero false-block risk.
2. **PageFingerprint as a hard retry-cap on recovery.** Reuse `url + interactable-count + DOM-text-hash` (`views.py:95-107`) deterministically: if the fingerprint is unchanged across N recovery attempts, **stop escalating and fail clean** — preventing a self-healing loop from thrashing the Tier-3/4 budget on a frozen page. (Flip browser-use's *soft nudge* to a *hard cap*.)
3. **ClickableElementDetector as a recording-coverage checklist.** Mine `is_interactive` (`clickable_elements.py`) — especially **CDP JS-click-listener detection**, `label/span` form-control wrappers, AX state properties, icon-sized fallback, and `cursor:pointer` — as recorder completeness assertions, so Conxa never silently fails to capture div-buttons / icon-only / listener-only interactables (EC-37/12). Use as a *checklist*, never as identity.
4. **AX-tree + computed-styles digest for Tier-3 re-grounding.** When deterministic resolution fails, escalate to a compact **indexed AX+style text digest** (text-first, pre-vision), presenting the *recorded target's* signals alongside ranked current-page candidates, with an `AgentOutput`-style reflective recovery contract (`evaluation_of_failure` + `chosen_candidate_index` + `confidence`).
5. **Reject the anti-patterns, keep Conxa's strengths.** Never adopt: (a) **per-step LLM in the hot path** (the defining browser-use choice Conxa rejects); (b) **ephemeral integer index as durable identity** — Conxa's compiled multi-signal identity gives the LLM a *target to heal toward* that browser-use can never have; (c) **blind `[:N]` element truncation** (EC-13) — Conxa must rank-and-cap against the recorded target; (d) **post-hoc-only validation** — keep Conxa's per-step compiled assertions (EC-28); the end-of-run judge is at most an additive telemetry signal.

---

**Summary.** browser-use "handles" edge cases mainly by re-perceiving each page into an indexed AX+DOM representation and letting an LLM re-ground every step — a model that is the opposite of Conxa's deterministic hot path and is not adoptable as a core loop. But four of its mechanisms are genuinely deterministic and Conxa-compatible for the recovery tier and runtime guards: the `multi_act` page-change guards (a stale-DOM defense directly adoptable into `run.js`), the `PageFingerprint` stall signal (adopt as a hard recovery retry-cap), the `ClickableElementDetector` heuristics (adopt as a recording-coverage checklist), and the AX-tree+computed-styles text digest (adopt as the Tier-3 re-grounding representation). Its ephemeral integer-index identity and blind element-list truncation are studied as anti-patterns that Conxa's compiled multi-signal identity and rank-and-cap recovery digest are explicitly designed to beat.
