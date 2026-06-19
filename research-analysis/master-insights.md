# Master Insights — Conxa Research Synthesis

**Single best idea per source, ranked by ROI for Conxa's deterministic, local-first, MCP-native architecture.**

---

## Tier A — Implement Now (Direct, High-ROI)

### 1. Playwright: Mine `selectorGenerator.generateSelector()` as the Build Studio compiler
**Source:** `playwright-main/packages/playwright-core/src/injected/selectorGenerator.ts`
**The idea:** Playwright's codegen already solves the "best selector" problem with a numeric cost model. The function runs IN PAGE via `page.evaluate()` and returns the single lowest-cost selector for any element. The cost ordering is: `role+name (0) < label (1) < text (2) < testid (3) < css-id (4) < css-path (5)`. Call it for ALL 5 signal types per recorded element, not just the winner — store all 5 in the SkillPackage. This eliminates a major engineering problem from Conxa's roadmap.
**ROI:** Eliminates the need to build a selector scoring engine from scratch. The algorithm is battle-tested on millions of pages. Implementation = inject the function into the Build Studio recording session and call it on each recorded click target.
**Invariant preserved:** Tier 1/2 costs zero LLM tokens — this is pure in-page JS.

### 2. Stagehand: sha256 cache key + in-place drift refresh = zero-token warm replay
**Source:** `stagehand-main/packages/core/src/lib/v3/cache/`
**The idea:** Cache key = `sha256(instruction + normalizedUrl + sortedVariableKeys)`. On cache hit, attempt selector. If selector fails (drift), re-ground via LLM then UPDATE THE EXISTING CACHE ENTRY in place — don't create a new one, don't leave a stale entry. Secret hygiene: only key NAMES in the hash, values substituted at runtime. This means credentials never enter the cache file.
**ROI:** Zero LLM tokens on warm cache hit. After one successful run of a skill, all subsequent runs cost nothing at Tier 1/2. The in-place update means drift self-heals without human intervention. The secret hygiene pattern is a security baseline that must exist from day one.
**Invariant preserved:** Tier 1/2 zero-token constraint is the entire point of this pattern.

### 3. Playwright MCP: `ServerBackend` interface as Conxa's MCP architecture seam
**Source:** `playwright-core/src/tools/mcp/backend/browserBackend.ts` + `tools.ts`
**The idea:** The `ServerBackend` interface separates the MCP protocol harness from the execution engine. This enables: (a) multiple backend implementations without changing the protocol layer, (b) stateless tool listing — no browser is launched until the first action call (`ensureBrowser()` lazy init), (c) modal state gating — tools blocked during navigation or dialog. The `filteredTools` registry enables exposing different tool subsets by config (record vs replay mode).
**ROI:** Architectural correctness. Without this seam, the MCP server becomes tightly coupled to a single execution path. With it, Conxa can swap the execution backend (Playwright → CDP direct → remote browser) without touching the Claude Desktop integration.
**Invariant preserved:** Cloud does not compile or execute — the ServerBackend runs locally.

### 4. Playwright MCP: Auto-ARIA snapshot after every mutating action
**Source:** `playwright-core/src/tools/mcp/` (post-action snapshot pattern)
**The idea:** After every tool call that mutates page state (click, fill, navigate), automatically append the current ARIA tree to the tool result. Claude Desktop always receives current page state in the same response as the action confirmation — no need for the LLM to issue a separate `page_snapshot` call.
**ROI:** Cuts round-trips in half for multi-step interactions. More importantly, it closes the perception gap: LLM never acts on stale state because it always sees the result of what it just did. Implementation = wrap every mutating handler with `result.push(await captureAriaSnapshot())`.
**Invariant preserved:** This is part of the MCP runtime, not the compiled skill path — doesn't affect Tier 1/2.

---

## Tier B — Implement in Recovery Cascade

### 5. SeeAct: Describe-then-match, never ask LLM to write selectors directly
**Source:** SeeAct paper (2401.01614) — Finding 1
**The idea:** Two-stage Tier 3 protocol: (1) LLM receives ARIA tree + screenshot and outputs `{action_type, target_description: "the blue Submit button below the email field", argument}` — a natural language description of the target element, NOT a selector. (2) A grounding module matches `target_description` against the current ARIA tree using embedding similarity or BM25. Only if ARIA match fails does Conxa escalate to coordinate-based Tier 4.
**ROI:** Eliminates 30% of Tier 3 failures that come from hallucinated selectors. LLMs are far more reliable at describing elements in natural language than writing CSS/XPath. The grounding module is deterministic and fast — a simple text matching step.
**Invariant preserved:** LLM still fires at Tier 3; the describe-then-match protocol just makes Tier 3 significantly more reliable.

### 6. SeleniumBase: Exception-classified fallback ladder within Tier 1
**Source:** `SeleniumBase-master/seleniumbase/core/sb_driver.py`
**The idea:** Not all Tier 1 failures are equal. Classify the exception type before escalating:
- `StaleElementReferenceException` → re-find the element (DOM changed mid-action; don't change selector)
- `ElementClickInterceptedException` → try `execute_script("arguments[0].click()")` (overlay blocking)
- JS click also fails → try jQuery click (extreme fallback)
- `WebDriverException: disconnected` → swap to CDP mode (browser disconnected from WebDriver)
Only after all four fail should Conxa escalate to Tier 2. This keeps the vast majority of transient failures within Tier 1 (zero LLM tokens).
**ROI:** Quantitative from SeleniumBase: the JS click fallback alone recovers ~15% of "click intercepted" failures without escalation. CDP swap recovers browser-disconnect scenarios that would otherwise require full skill restart.
**Invariant preserved:** All four sub-tiers are DOM-based, no LLM involvement.

### 7. Playwright: Actionability gates before every Tier 1/2 action
**Source:** `playwright-main/packages/playwright-core/src/injected/injectedScript.ts`
**The idea:** Before dispatching any action, wait for: `attached → visible → stable → enabled`. The `stable` check (bounding box hasn't moved for 2 frames) is the critical one that most frameworks miss — it prevents clicking animated elements mid-transition. Poll every 100ms with a configurable timeout.
**ROI:** Eliminates an entire class of timing failures that manifest as "element not found" or "stale element" errors. These currently require re-grounding at Tier 3; with actionability gates they never escalate past Tier 1.
**Implementation note:** `stable` check requires two consecutive bounding box readings — add a 100ms sleep between checks. Total max wait: 30s default (configurable per skill package step).
**Invariant preserved:** Pure Playwright execution, zero LLM tokens.

### 8. UI-TARS: scaleFactor coordinate normalization for Tier 4
**Source:** `UI-TARS-desktop-main/apps/ui-tars/src/main/services/runAgent.ts`
**The idea:** VLM outputs coordinates in logical pixels (or normalized [0,1]). The operator multiplies by `screenshotContext.scaleFactor` at execution time to get physical pixels. This is the correct HiDPI implementation. Without this, Tier 4 vision clicks land at the wrong position on Retina/4K displays (2x offset).
**ROI:** Tier 4 is useless on HiDPI displays without this. Most enterprise users have high-DPI monitors. One line of multiplication code prevents a systematic 2× coordinate error.
**Implementation:** At the start of every Tier 4 invocation, capture `screenshotContext = {width, height, scaleFactor}` from the browser's `devicePixelRatio`. Apply before every click coordinate.

---

## Tier C — Architecture Validation (Confirms Conxa Decisions)

### 9. browser-use: `evaluation_previous_goal` reflection baked into every Tier 3 call
**Source:** `browser-use-main/browser_use/agent/views.py` — `AgentOutput.evaluation_previous_goal`
**The idea:** Every LLM step includes a reflection field: "Did the previous action succeed? What changed on screen?" This is NOT a separate call — it's part of the structured output schema. The model must explicitly commit to an assessment of the previous step before planning the next.
**Conxa application:** Tier 3 re-grounding prompt should include: `"Previous action: {action_taken}. Current ARIA state: {aria_tree}. Did the previous action succeed? If not, what is the most likely current state of the element?"` as a structured output field BEFORE the model outputs the recovery action.
**ROI:** Reduces cascading failures (step 3 fails because model misread step 2 outcome). Validated by browser-use's production usage and WebArena's 23.8% vs 14% gap (reflective vs non-reflective agents).

### 10. Mind2Web: Store 4 signals per element at compile time
**Source:** Mind2Web paper (2306.06070) — empirical finding on signal stability
**The idea:** At record time, store for every element: (1) ARIA role + accessible name, (2) visible text content, (3) `data-testid` / `data-cy` / similar if present, (4) structural CSS path. Weight them in decreasing stability order. The paper's dataset of 2,350 real-world tasks proves that structural selectors degrade fastest across site updates; semantic signals (role+text) survive longest.
**Conxa SkillPackage element schema:**
```json
{
  "signals": {
    "aria": {"role": "button", "name": "Submit order"},
    "text": "Submit order",
    "testid": "checkout-submit-btn",
    "css": "#checkout-form > button.primary"
  },
  "signal_weights": [0.4, 0.3, 0.2, 0.1]
}
```
**ROI:** This is the multi-signal identity compilation step. Without all 4 signals, Tier 1 has no fallback within itself when the primary selector drifts. With all 4, most site updates are handled within Tier 1 by trying signal 2, 3, or 4.

### 11. Stagehand: Independent ARIA probe for post-execution verification
**Source:** `stagehand-main/packages/core/src/lib/v3/dom/captureAriaTreeProbe.ts`
**The idea:** After each step, capture the ARIA tree using an INDEPENDENT mechanism — not the same signal path the LLM used for grounding. This creates a verifiable ground truth: what did the page actually look like AFTER the action, independent of what the LLM thought it saw?
**Conxa application:** Build Studio should capture a post-step ARIA snapshot after each recorded action and store it in the SkillPackage as a "postcondition fingerprint". At replay time, compare the post-action ARIA state against the stored fingerprint. Deviation = alert.
**ROI:** Enables deterministic postcondition verification at Tier 1/2 (zero LLM tokens). This is the foundation of Conxa's verifier — "did the action produce the expected state?" answered without LLM.

### 12. WorkArena: Pre-filter ARIA tree to <500 nodes before Tier 3 LLM call
**Source:** WorkArena paper (2403.07718) — enterprise ARIA tree size finding
**The idea:** Enterprise pages (ServiceNow, Salesforce, etc.) have 5,000–20,000 accessible nodes. Sending the full ARIA tree to an LLM exceeds context limits and degrades accuracy. Pre-filter to: (a) the subtree containing the previously-recorded element's bounding region, (b) interactive elements only (`button`, `input`, `[role=...]`), (c) top-K by text similarity to the original element description.
**Target:** <500 nodes in Tier 3 prompt. Maximum context budget: 2,000 tokens for ARIA tree, 1,000 for screenshot description, 1,000 for prompt + structured output schema.
**ROI:** Without this, Tier 3 fails systematically on enterprise targets. With it, the LLM receives a focused, relevant context rather than 20k nodes of noise.

---

## Tier D — Reject (Explicit Anti-Patterns for Conxa)

### Do NOT: Use per-step ephemeral integer indices for element identity
**Source:** browser-use `selector_map`
**Why rejected:** Integer indices like `selector_map[42]` are generated fresh on every page load. They have no persistence across skill executions. They cannot be stored in a SkillPackage. Any compiled skill using integer indices becomes unusable on the next page render.

### Do NOT: Use coordinate-based clicking as a primary or secondary strategy
**Source:** UI-TARS primary locator approach
**Why rejected:** Violates the zero-LLM-token Tier 1/2 constraint. Coordinates change whenever the page layout changes (viewport resize, content change, A/B test). Coordinate-based clicking belongs only at Tier 4 — after ARIA (Tier 2) and LLM re-grounding (Tier 3) have both failed.

### Do NOT: Send LLM the full DOM or ARIA tree at Tier 3
**Source:** WebArena / WorkArena finding
**Why rejected:** Enterprise pages exceed LLM context limits. Even within limits, 20k-node ARIA trees degrade grounding accuracy. Always pre-filter to the relevant subtree first.

### Do NOT: Ask LLM to output selector strings directly
**Source:** SeeAct paper (30% hallucination rate)
**Why rejected:** LLMs hallucinate selector strings that look plausible but don't match any element. The describe-then-match protocol (Insight #5 above) produces significantly better outcomes. LLMs are good at describing elements; they are not good at writing CSS selectors for elements they can't directly inspect.

---

## Synthesis: How These Insights Map to Conxa's Architecture

```
Build Studio (Record)
  └── Insight #1: selectorGenerator for all 5 signal types
  └── Insight #10: Store 4-signal element identity in SkillPackage
  └── Insight #11: Capture postcondition ARIA fingerprint per step

conxa_compile (Compile)
  └── Insight #10: Weight signals (aria > text > testid > css)
  └── Insight #2: Generate cache key (sha256 + secret hygiene)

MCP Runtime (Execute — Tier 1)
  └── Insight #7: Actionability gates before every action
  └── Insight #6: Exception-classified fallback ladder (stale→re-find→JS→jQuery)
  └── Insight #11: Post-action ARIA fingerprint comparison

MCP Runtime (Execute — Tier 2)
  └── (ARIA role+name resolution from stored 4-signal identity)
  └── Insight #4: Auto-ARIA snapshot appended to tool result

MCP Runtime (Execute — Tier 3)
  └── Insight #5: Describe-then-match protocol (no direct selector output)
  └── Insight #9: Reflection on previous step before recovery action
  └── Insight #12: Pre-filter ARIA tree to <500 nodes
  └── Insight #2: On success, update cache in place (drift self-heal)

MCP Runtime (Execute — Tier 4)
  └── Insight #8: scaleFactor normalization
  └── SoM + ARIA text dual representation (WebVoyager/SeeAct)

MCP Runtime (Execute — Tier 5)
  └── CALL_USER pattern (UI-TARS) — explicit human escalation with context

MCP Architecture
  └── Insight #3: ServerBackend interface as the seam
  └── Lazy ensureBrowser() on first call
  └── FilteredTools by mode (record vs replay)
```
