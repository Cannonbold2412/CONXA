# browser-use — Architectural Intelligence (Conxa lens)

> **Conxa lens**: browser-use is the closest architectural analog to Conxa's runtime, but it is **LLM-in-the-loop on every step**. Conxa is deterministic: compiled selectors at Tier 1/2 (zero LLM tokens), LLM only at Tier 3+. Read this file as a study of *what an LLM-grounded recovery layer looks like* — to be adapted for Conxa's Tier 3+ path, **not** the deterministic Tier 1/2 path.

---

## Executive Summary

browser-use is a Python async agent framework that drives a Chromium browser over CDP. Each step it: (1) snapshots the page into an accessibility-tree-derived "serialized DOM" with numbered interactive elements, (2) sends that text (+ optional screenshot) to an LLM, (3) parses the LLM's structured `AgentOutput` into a list of actions, (4) executes them via a tool registry, (5) records results and loops. There is **no compiled artifact** — every page is re-perceived and re-reasoned from scratch by the LLM on every step. Element identity is an ephemeral integer `index` into a per-step `selector_map`, valid only for that step.

This is the opposite of Conxa's philosophy (record-once, compile, replay deterministically). Its value to Conxa is almost entirely in the **LLM-grounded recovery layer**: how it represents a page for an LLM, how it detects stalls/loops, how it bounds failure, and how it lets an LLM re-ground when deterministic identity is lost. Those are exactly the problems Conxa faces at Tier 3+.

---

## Architecture Overview

- **`Agent` (`agent/service.py`)** — orchestrator. `run()` is the outer loop (`while n_steps <= max_steps`); `step()` is one observe→think→act cycle, structured as phases: `_prepare_context` → `_get_next_action` (LLM) → `_execute_actions` → `_post_process` → `_finalize`, with one catch-all `_handle_step_error`.
- **`BrowserSession`** — wraps the CDP connection; `get_browser_state_summary()` returns the page snapshot (DOM state + screenshot + URL + tabs).
- **`DomService` (`dom/service.py`)** — builds the perception artifact: merges CDP DOM tree + accessibility tree + DOM snapshot (computed styles, bounds) into `EnhancedDOMTreeNode`s, then serializes to LLM text.
- **`ClickableElementDetector` (`dom/serializer/clickable_elements.py`)** — the heuristic that decides which nodes are "interactive" and therefore get a clickable index.
- **`Tools` / `Registry` (`tools/service.py`, `tools/registry/service.py`)** — action registry via `@registry.action(...)`; `act()`/`execute_action()` validate params into a Pydantic model and dispatch.
- **`MessageManager`** — builds the LLM prompt, manages history compaction to fit the context window.
- **Data models (`agent/views.py`)** — `AgentOutput`, `ActionResult`, `AgentHistory(List)`, `AgentState`, plus `ActionLoopDetector` / `PageFingerprint`.

---

## Core Abstractions

1. **`selector_map` + integer `index`** — per-step ephemeral element identity. The serialized DOM presents each interactive element with a number; the LLM returns `click(index=N)`; the agent maps `N` back to an `EnhancedDOMTreeNode` (which carries `backend_node_id`, `xpath`, computed bounds). Identity is re-minted every step — there is no stable cross-step element ID.
2. **`AgentOutput` (the "brain")** — the structured LLM contract: `thinking`, `evaluation_previous_goal`, `memory`, `next_goal`, `action: list[ActionModel]`. Reflection (evaluate previous goal) is baked into the same call that picks the next action.
3. **`ActionResult`** — uniform return of every tool: `error`, `is_done`, `success`, `extracted_content`, `long_term_memory`, `attachments`, `metadata`. `error` is the single recovery signal — non-None error feeds back into the next prompt and increments failure counters.

Supporting: `@registry.action` decorator (declarative tool registration with `param_model` + `terminates_sequence` flag); `ActionLoopDetector`/`PageFingerprint` (stall detection).

---

## Execution Flow

**Init (`run`)**: register signal handlers, dispatch session/task events, `browser_session.start()`, run `_execute_initial_actions` (wrapped in `step_timeout` so a hung CDP socket can't deadlock startup).

**Planning**: optional. `AgentSettings.enable_planning` maintains a `plan: list[PlanItem]` with `pending/current/done/skipped` status. Replan/exploration nudges are injected as prompt text after N consecutive failures or N steps without a plan. Planning is *advisory text*, never a hard constraint.

**Execution (`step` phases)**:
- `_prepare_context`: get browser state (always screenshot), check captcha, build prompt via MessageManager, run compaction, inject budget/replan/exploration/loop-detection nudges, force-done on last step or after failure.
- `_get_next_action`: LLM call wrapped in `asyncio.wait_for(timeout=llm_timeout)` with retry; produces `AgentOutput`.
- `_execute_actions` → `multi_act`: execute the action list sequentially with **page-change guards** (see Recovery).
- `_post_process`: download tracking, plan update, loop-detector update, failure counting.
- `_finalize`: build `AgentHistory` item, emit events, persist file-system state.

**Validation**: optional LLM **judge** (`agent/judge.py`, `JudgementResult`) evaluates the whole trace at the end against optional `ground_truth`; flags `impossible_task`, `reached_captcha`. This is post-hoc trace validation, not per-step assertion.

**Recovery**: see dedicated section.

---

## Data Model

- **Action**: `ActionModel` (dynamically generated Pydantic union of all registered actions; the LLM emits e.g. `{"click": {"index": 12}}`). `AgentOutput.action` is a list (multi-action per step, capped by `max_actions_per_step`).
- **State (perception)**: `SerializedDOMState{ _root, selector_map }`; `selector_map: dict[int, EnhancedDOMTreeNode]`. `EnhancedDOMTreeNode` fuses DOM + AX + snapshot: `backend_node_id`, `xpath` (computed property), `attributes`, `is_visible`, `is_scrollable`, `absolute_position` (DOMRect), AX `role`/`properties`, frame/target IDs. `llm_representation()` flattens to indexed text.
- **Context (agent)**: `AgentState{ n_steps, consecutive_failures, last_result, last_model_output, plan, message_manager_state, loop_detector }` — fully serializable for checkpoint/resume.
- **Recovery**: `ActionResult.error: str | None`; `AgentError` (classifies validation / rate-limit / no-valid-action / parse errors into LLM-readable hints); `consecutive_failures` counter; `max_failures` + `final_response_after_failure` budget.
- **Execution metadata**: `StepMetadata` (timing), `AgentHistory{ model_output, result, state(BrowserStateHistory), state_message }`, `AgentHistoryList` (full replayable record, with sensitive-data redaction on dump, `load_from_file` for replay, commented-out Playwright-script export).

---

## Reliability Strategy

- **Bounded everything**: per-LLM-call timeout, per-step timeout, global per-action fallback timeout (`_ACTION_TIMEOUT_FALLBACK_S = 180s`) so a dead CDP websocket returns `ActionResult(error=...)` instead of hanging.
- **One catch-all error funnel** (`_handle_step_error`): every step exception becomes an `ActionResult(error=...)` fed back to the LLM, except connection-class errors which route to reconnect/terminate logic.
- **Connection resilience**: distinguishes transient connection errors (wait for reconnect, retry) from terminal browser-closed (stop). Explicit `is_reconnecting` handshake.
- **Stall/loop detection** (`ActionLoopDetector`): rolling window of normalized action hashes + `PageFingerprint` (url + element_count + DOM-text hash). Detects action repetition (escalating nudges at 5/8/12 repeats) and page stagnation (≥5 unchanged fingerprints). **Soft** — only injects awareness text, never blocks.
- **Failure budget**: `consecutive_failures >= max_failures (+1 final attempt)` stops the run. Notably, only *single-action* steps count toward consecutive failures; multi-action errors defer to loop/replan nudges.
- **Context-window management**: history compaction (`MessageCompactionSettings`) summarizes old steps to keep prompts bounded.

---

## Recovery Strategy

- **Detection**: an action "fails" when `ActionResult.error` is non-None or an exception is raised. There is no element-level "not found → try alternative selector" — if `index` doesn't resolve or the click fails, that's just an error string. Page-change between queued actions is detected two ways in `multi_act`: (1) **static** — actions flagged `terminates_sequence=True` (navigate/search/go_back/switch) abort the rest of the queue; (2) **runtime** — URL or focused-target change after any action aborts remaining queued actions (prevents acting on stale DOM).
- **Classification**: `AgentError.format_error` buckets errors into validation / rate-limit / parse / generic, and rewrites them into *LLM-actionable hints* ("Invalid model output format. Please follow the correct schema.").
- **Recovery action**: the recovery *is the next LLM step*. The error string + fresh page snapshot go into the next prompt; the LLM re-grounds (new `selector_map`, new indices) and decides what to do. No deterministic retry of the same selector — recovery is always "re-perceive and re-reason."
- **Escalation**: nudge text escalates (loop detection, replan after `planning_replan_on_stall` failures) → force-done after last step / after failure (`final_response_after_failure` gives one last LLM call to produce a result) → hard stop at `max_failures`. End-of-run **judge** gives a verdict (incl. `impossible_task`/`reached_captcha`).

**Key insight for Conxa**: browser-use's entire recovery model *is* what Conxa's Tier 3+ should look like — re-perceive the page into an LLM-readable, indexed, multi-signal representation, hand the LLM the failure context, and let it re-ground. The difference is Conxa already has a recorded "intended element" (multi-signal identity from compile time) to anchor that re-grounding, which browser-use lacks.

---

## Scalability Characteristics

- **Cost/latency scale linearly with steps** — every step is a full DOM serialization + LLM round-trip. There is no caching of "we've solved this page before." This is the core economic weakness vs Conxa's compiled replay.
- Known perf debt: `DomService` opens a **new CDP websocket per step** (acknowledged TODO).
- DOM serialization is capped (`max_clickable_elements_length = 40000` chars) — large pages get truncated, a real grounding risk.
- Horizontal scale via `sandbox/` containerization (one browser per instance). Stateless-ish: `AgentState` is serializable for checkpoint/resume.

---

## Strengths

- **Provider-agnostic, robust LLM grounding loop** — the observe→think→act structure with reflection-in-output is clean and battle-tested.
- **Multi-signal element representation** — every interactive node carries AX role/name, attributes, xpath, bounds, computed styles; the LLM gets rich grounding even without a screenshot.
- **Excellent interactive-element heuristics** (`ClickableElementDetector`) — covers JS click listeners (CDP-detected), ARIA roles, framework patterns (Vue/React/Angular handlers), label/span wrappers, search-icon detection, cursor:pointer fallback, icon-sized elements.
- **Soft, non-blocking stall/loop detection** with a cheap page fingerprint — high signal, zero risk of false-blocking.
- **Disciplined timeout/error funneling** — nothing hangs; every failure becomes structured feedback.
- **Replayable, redacted history** — full trace with sensitive-data filtering, checkpointable state.

## Weaknesses

- **Per-step LLM dependency** — slow, expensive, non-deterministic; unacceptable for Conxa's deterministic core.
- **Ephemeral element identity** — `index` is meaningless across steps; no durable element ID, so no self-healing against a *known* target.
- **No compiled artifact / no assertions per step** — validation is a post-hoc whole-trace judge, not step-level outcome checks.
- **DOM text truncation** on large pages risks dropping the target element.
- **New websocket per step** — latency/resource debt.
- **Recovery is undifferentiated** — every failure escalates the same way (re-prompt the LLM); no tiered cheap-first cascade.

---

## LEARN

- A page can be made fully LLM-groundable from the **accessibility tree + computed styles + bounds**, no screenshot strictly required — the AX tree is the backbone, screenshot is augmentation.
- **Reflection-in-the-action-call** (`evaluation_previous_goal` + `next_goal` in the same structured output) is a cheap, effective way to get self-correction without a separate critic call.
- A **cheap page fingerprint** (url + element_count + DOM-text-hash) is enough to detect "my actions are doing nothing."
- **Classifying errors into LLM-actionable hints** materially improves recovery vs dumping raw stack traces.

## ADAPT (for Conxa Tier 3+ recovery path)

- **Indexed, multi-signal serialized-DOM representation** → when Conxa's Tier 1/2 deterministic resolution fails and it escalates to the LLM, hand the LLM exactly this kind of compact indexed AX+DOM snapshot (not raw HTML). Conxa already builds richer multi-signal identity at compile time — at recovery, present *both* the recorded target's signals and the current page's indexed candidates so the LLM re-grounds against a *known* intent, not a blank task.
- **`AgentOutput` reflection structure** → Tier 3+ LLM recovery should emit `evaluation_of_failure` + `chosen_candidate_index` + `confidence`, mirroring the brain pattern.
- **`ActionLoopDetector` / `PageFingerprint`** → adopt as a runtime guard so a self-healing retry loop can't thrash on a stagnant page; cap LLM recovery attempts using the same window logic.
- **Page-change guards in `multi_act`** (`terminates_sequence` + runtime URL/focus diff) → directly applicable to Conxa's runtime sequence executor: abort queued steps when a step navigates, preventing execution against stale DOM. (Note Conxa already special-cases `frame_enter`/`frame_exit` with `no_recovery_block` — same family of idea.)
- **End-of-run judge** → a vision/LLM judge over the trace is a strong fit for Conxa's outcome validation / telemetry quality signal.

## IMPROVE (over browser-use, for Conxa)

- **Recording/compiler**: Conxa's compile-time multi-signal identity is strictly superior to browser-use's ephemeral index. Keep it — it gives the LLM recovery a *target to heal toward*, which browser-use can never have.
- **Runtime**: Conxa's deterministic Tier 1/2 eliminates browser-use's per-step LLM cost entirely. Only borrow the LLM machinery for the rare Tier 3+ case.
- **Recovery**: browser-use escalates uniformly; Conxa's 5-tier fingerprint-scored cascade (cheap deterministic → a11y → LLM text → LLM vision) is the right shape. Borrow only the *re-perception + indexed-candidate prompt* for the LLM tiers.
- **Vision**: browser-use's "always screenshot but use AX text primarily" is a good cost lever — at Tier 3 use text/a11y candidate matching before spending vision tokens at Tier 4.
- **MCP / skill packaging**: browser-use exposes the *live agent* over MCP (`execute_skill`-style live driving). Conxa ships *compiled skill packages* and executes locally — a fundamentally stronger distribution/enterprise story. Keep Conxa's model.

## AVOID

- Per-step LLM calls in the hot path. browser-use's biggest cost; antithetical to Conxa's determinism invariant.
- Ephemeral integer element identity as the *only* identity. Fine as a transient LLM-prompt convenience at recovery time; never as durable element identity.
- Truncating the element list silently (`max_clickable_elements_length`) — if Conxa builds an LLM candidate list at Tier 3+, rank-and-cap explicitly with the recorded target's signals, don't blindly truncate.
- Re-opening a CDP/browser connection per perception cycle.

## REJECT

- **LLM-in-the-loop-on-every-step as the execution model.** This is the defining browser-use choice and the defining thing Conxa rejects. Adopt browser-use's *perception and recovery vocabulary* for Tier 3+, but never its core loop.
- **Post-hoc-only validation** (whole-trace judge with no step-level assertions). Conxa's compiled per-step assertions are better; keep them.
