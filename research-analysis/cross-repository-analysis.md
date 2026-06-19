# Cross-Repository Analysis — Best-in-Class Patterns for Conxa

---

## 1. Recording

**Best-in-class:** Playwright (`packages/playwright-core/src/injected/selectorGenerator.ts`)

Playwright's codegen records element interactions via injected JavaScript and generates selectors using a numeric cost model:

```
role+name (cost=0) < label (cost=1) < text (cost=2) < testid (cost=3) < css-id (cost=4) < css-path (cost=5)
```

The generator scores ALL valid selectors for an element, picks the lowest cost, and falls back up the ladder if the winner is ambiguous (matches >1 element). This produces semantically stable selectors that survive minor DOM changes.

**What Conxa should adopt:** The cost model and fallback ladder verbatim. At record time, Conxa's Build Studio should run `selectorGenerator.generateSelector()` (or equivalent) and store ALL candidate selectors with their scores — not just the winning one. This pre-populates the multi-signal identity for Tier 1/2 without any LLM involvement.

**Runner-up:** SeleniumBase `recorder_helper.py` — JS event injection approach is similar; less sophisticated selector scoring.

---

## 2. Locators / Element Identity

**Best-in-class:** Playwright (client/locator.ts) + Mind2Web paper (dataset findings)

Playwright Locators are lazy, re-evaluated on every action — the stored string is a selector template, not a DOM reference. This makes them naturally robust to React re-renders.

Mind2Web dataset confirms empirically: text content and ARIA role are the most stable signals across site updates; structural XPath/CSS degrades fastest.

**What Conxa should adopt:**
- Store 4 signals per element in compiled skill packages: (1) ARIA role+name, (2) visible text, (3) test ID if present, (4) structural CSS path
- Weight signals in that order for Tier 1 resolution
- Re-evaluate on each execution attempt, don't cache DOM node references

**Anti-pattern (browser-use):** Per-step integer indices (`selector_map[42]`) are ephemeral — they change on every page load and across re-renders. Zero persistence value across executions.

---

## 3. Accessibility / ARIA Tree Usage

**Best-in-class:** Playwright MCP (`page_snapshot` tool) + Stagehand (`captureAriaTreeProbe.ts`)

Playwright MCP returns the full ARIA tree as structured text after every mutating action — this gives the LLM a reliable, DOM-independent view of current page state. Stagehand's independent probe captures ARIA state separately from the LLM's perception channel, enabling post-hoc trajectory verification.

**What Conxa should adopt:**
- Auto-snapshot pattern: after every Tier 1/2 action, capture ARIA state as post-condition evidence
- Independent probe: Tier 3 recovery should capture ARIA state BEFORE sending to LLM (prevents LLM from confabulating about page state)
- Format: numbered element list `42[button:Submit]` — consistent with WebArena/browser-use; LLM has seen this format in training data

**Key implementation note:** Playwright's `ariaSnapshot.ts` runs in-page via `page.evaluate()` — it doesn't require CDP. Conxa can use this directly without a CDP relay.

---

## 4. Reliability — Auto-Wait

**Best-in-class:** Playwright (injected/injectedScript.ts actionability gates)

Playwright waits for: attached → visible → stable (no motion) → enabled before dispatching any action. This 4-state gate eliminates an entire class of timing failures (animated elements, lazy-loaded content, disabled submit buttons).

**What Conxa should adopt:** Exactly this gate sequence in Tier 1/2 execution. The specific states matter:
- `attached` — element exists in DOM
- `visible` — not `display:none` and has non-zero bounding box
- `stable` — bounding box hasn't moved for 2 consecutive frames
- `enabled` — not `disabled` attribute; not `aria-disabled`

SeleniumBase's 100ms poll loop approximates this but without the `stable` check — Conxa should use Playwright's version.

---

## 5. Recovery / Self-Healing

**Best-in-class:** Stagehand (`lib/v3/cache/`) — cache-first with inline drift recovery

The recovery flow:
1. Check cache by `sha256(instruction + normalizedUrl + sortedVariableKeys)`
2. Cache hit → attempt `waitForCachedSelector` → if selector exists, execute deterministically
3. Selector drift detected → immediately re-ground via LLM → update cache in place (no new entry)
4. Cache miss → ground via LLM → write to cache

This means warm cache hits cost ZERO LLM tokens, and drift recovery pays LLM cost only once (then becomes warm again).

**What Conxa should adopt:** This exact flow, with two extensions:
- Tier 2 check (ARIA role+name) before going to LLM on drift — many drifted selectors can be re-resolved without LLM
- configSignature field to prevent cross-environment cache pollution (Stagehand already does this)

**Runner-up:** SeleniumBase's exception-classified fallback ladder — the exception → fallback mapping is directly adoptable for Conxa's Tier 1 error handling (before escalating to Tier 2/3).

---

## 6. Vision / Visual Grounding

**Best-in-class:** UI-TARS (coordinate-based with scaleFactor normalization) + SeeAct paper (two-stage grounding)

UI-TARS handles HiDPI correctly: VLM outputs logical coordinates, operator.execute multiplies by `screenshotContext.scaleFactor` to get physical pixels. This is the correct implementation — most vision agents get this wrong.

SeeAct proves: describe-then-match outperforms direct coordinate output. The pipeline should be:
1. LLM describes target element in natural language
2. Grounding module matches description against ARIA tree → returns selector
3. Only if ARIA match fails: fall back to coordinate-based click

**What Conxa should adopt for Tier 4:**
- scaleFactor normalization (copy UI-TARS logic exactly)
- Attempt ARIA re-match on the grounded coordinate region before committing to pixel click
- OS-ATLAS as the grounding model: `(screenshot, description) → {x, y, w, h}` normalized

---

## 7. LLM Integration

**Best-in-class:** browser-use (agent loop with reflection) + Stagehand (CUA clients with structured output)

browser-use's `AgentOutput.evaluation_previous_goal` forces the LLM to explicitly reflect on whether the previous step succeeded before planning the next. This reflection is baked into every prompt — not added as a separate call.

Stagehand's CUA clients (Anthropic/OpenAI/Google) provide a clean abstract interface over LLM providers, with unified tool schemas. The `convertToolUseToAction` function in `actionMapping.ts` translates LLM tool calls to Playwright actions.

**What Conxa should adopt for Tier 3:**
- Reflection field in re-grounding prompt: "The previous selector [X] failed. Describe what you see on screen and identify the correct element."
- Abstract provider interface (not hardcoded to one LLM) — Conxa's Tier 3 should support Anthropic/OpenAI/Gemini via a single adapter
- Structured output (JSON schema) for all LLM calls — never parse freeform text for action parameters

---

## 8. MCP Integration

**Best-in-class:** Playwright MCP (`playwright-core/src/tools/mcp/`)

The ServerBackend interface is the critical abstraction: it separates the MCP protocol harness from the browser implementation. This enables:
- Multiple backend types (BrowserBackend, SSHBackend, CDPRelayBackend)
- Stateless tool listing (no browser launched until first tool call)
- Modal state gating (tools that shouldn't run during navigation/dialog are blocked)

**What Conxa should adopt:**
- `ServerBackend` interface as the seam between Conxa's MCP server and execution engine
- Lazy browser init: `ensureBrowser()` only on first tool call — reduces startup latency
- Auto-ARIA snapshot after every action as part of the tool result — gives Claude Desktop current page state without requiring an explicit `page_snapshot` call
- FilteredTools pattern: expose different tool subsets based on config (e.g., record-mode vs replay-mode tools)

---

## 9. Caching

**Best-in-class:** Stagehand (only framework with caching)

No other framework has trajectory caching. This is a significant competitive gap that Stagehand has uniquely solved.

**Key Stagehand cache design decisions Conxa should adopt:**
- Hash key: `sha256(instruction + normalizedUrl + sortedVariableKeys)` — URL normalization removes query-param noise; sorted variable keys ensure order-independence
- Secret hygiene: only variable KEY names in the hash; values substituted at runtime — credentials never enter cache
- Version field in cache entry: enables cache invalidation when action format changes
- In-place update on drift: don't create a new entry; update the existing one — prevents cache bloat

---

## 10. Enterprise Features

**Best-in-class:** SeleniumBase (stealth + pytest integration) + WorkArena paper (task taxonomy)

SeleniumBase's UC mode (undetected-chromedriver) and CDP mode provide the best bot-detection bypass in any open-source framework. For enterprise targets with strict bot detection (Workday, Salesforce, etc.), this is essential.

**What Conxa should adopt:**
- CDP mode as a fallback execution layer — when standard WebDriver actions fail due to bot detection, route via CDP
- The deferred assert pattern: collect failures throughout a skill execution, report all at the end — enables full-run diagnostics rather than fail-on-first-error
- WorkArena's task taxonomy as the enterprise skill library roadmap: form fill → table nav → wizard flow → export

---

## Summary Table — Patterns to Adopt

| Pattern | Source | Conxa Component |
|---------|--------|-----------------|
| Selector cost model (role→label→text→testid→css) | Playwright selectorGenerator | Build Studio compile step |
| 4-signal multi-identity storage | Mind2Web + Playwright | SkillPackage element entry format |
| Actionability gates (attached→visible→stable→enabled) | Playwright injectedScript | Tier 1/2 execution engine |
| Exception-classified fallback ladder | SeleniumBase sb_driver | Tier 1 error handler |
| sha256 cache key + in-place drift refresh | Stagehand ActCache | Conxa replay cache |
| Secret hygiene (keys only in hash) | Stagehand | Replay cache + skill package |
| Auto-ARIA snapshot after each action | Playwright MCP | MCP tool result format |
| Numbered ARIA tree format `42[button:Submit]` | browser-use / WebArena | Tier 3 re-grounding prompt |
| Describe-then-match (not direct selector output) | SeeAct | Tier 3 LLM protocol |
| scaleFactor coordinate normalization | UI-TARS | Tier 4 vision executor |
| SoM + DOM text dual representation | WebVoyager / SeeAct | Tier 3/4 LLM prompt |
| Reflection on previous step | browser-use AgentOutput | Tier 3 re-grounding prompt |
| ServerBackend interface | Playwright MCP | MCP server architecture |
| Lazy browser init (ensureBrowser) | Playwright MCP | MCP server startup |
| CALL_USER as first-class action | UI-TARS | Tier 5 human escalation |
| Functional evaluators for task success | WebArena / WorkArena | Skill package verifier |
