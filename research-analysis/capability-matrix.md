# Capability Matrix — Browser Automation Frameworks

Scoring: 5 = best-in-class | 3 = competent | 1 = minimal/absent | — = not applicable

| Capability | Playwright | Playwright MCP | Stagehand | browser-use | SeleniumBase | UI-TARS |
|------------|-----------|----------------|-----------|-------------|--------------|---------|
| **Recording** | 5 — codegen with scored selectors | 1 — no recording | 2 — no built-in recorder | 1 — no recorder | 4 — recorder_helper JS injection | 3 — trajectory replay only |
| **Locators (compiled)** | 5 — selectorGenerator cost model; role+name < label < text < testid < css | 4 — delegates to Playwright | 3 — LLM-derived selectors; no cost model | 2 — per-step ephemeral integer indices | 4 — sb_driver with smart waits | 1 — coordinate-only; no DOM selectors |
| **Accessibility / ARIA** | 5 — ariaSnapshot.ts; full ARIA tree; role+name is top-priority signal | 5 — page_snapshot returns full ARIA tree; auto-snapshot after every action | 4 — independent ARIA probe (captureAriaTreeProbe) for verifier | 4 — CDP AXTree + ClickableElementDetector + DOMTreeSerializer | 3 — ARIA used implicitly via WebDriver; no first-class ARIA API | 2 — ARIA tree used in SoM annotation but not for element identity |
| **Reliability (built-in waits)** | 5 — actionability gates: attached→visible→stable→enabled; auto-retry | 5 — inherits Playwright actionability | 4 — cache-first replay + self-heal on selector drift | 2 — per-step retry; no persistent cache | 5 — poll loop 100ms; exception-classified fallback ladder; deferred asserts | 3 — operator retries screenshot on error; no selector-level retry |
| **Recovery / Fallback** | 3 — auto-retry + strict mode errors; no tiered cascade | 3 — inherits Playwright; no custom cascade | 4 — cache hit → replay; miss/drift → LLM re-ground → refresh cache | 2 — agent re-tries via new LLM call (expensive); no tiered approach | 4 — 4-tier fallback: native→re-find→JS click→jQuery click + CDP swap | 2 — VLM retry on screenshot; no structured cascade |
| **Vision / Multimodal** | 2 — screenshot tool in MCP only; no visual grounding | 3 — screenshot tool exposed via MCP | 3 — screenshot tool in agent loop; no dedicated visual grounder | 4 — screenshot passed to LLM each step; optional vision mode | 2 — CDP screenshots available; no visual grounding | 5 — primary modality; SoM annotation; coordinate normalization; scaleFactor |
| **LLM Grounding** | 1 — no built-in LLM integration | 2 — delegates to connected LLM client via MCP protocol | 5 — CUA model integration (Anthropic/OpenAI/Google); 3-method API | 5 — LLM-in-the-loop every step; 7+ provider adapters; AgentOutput with reflection | 1 — no LLM integration | 5 — VLM as primary; CALL_USER for clarification |
| **Caching / Replay** | 1 — no caching | 1 — no caching | 5 — sha256 cache key; cache-first zero-LLM replay; version-aware; self-healing | 1 — no caching; all steps re-ground via LLM | 1 — no trajectory caching | 2 — trajectory logging; no replay optimization |
| **MCP Integration** | 4 — full MCP server via playwright-core; 30+ tools; ServerBackend interface | 5 — purpose-built MCP wrapper; filteredTools; lazy browser init | 2 — REST server (packages/server-v3); no native MCP | 4 — browser_use/mcp/ module; Claude Desktop integration | 1 — no MCP support | 3 — MCP tools in agent-infra; not the primary interface |
| **Enterprise Readiness** | 4 — mature, Apache 2.0, CI/CD integrations, trace viewer | 3 — production MCP server but thin wrapper | 3 — TypeScript, monorepo, verifier/rubric system | 2 — Python, newer project, no enterprise auth support | 5 — pytest integration, UC stealth mode, proxy support, deferred asserts | 2 — Electron desktop app; limited enterprise deployment options |
| **Cross-Platform** | 4 — Chromium/Firefox/WebKit | 3 — Chromium focus via CDP relay | 3 — Playwright-backed; cross-browser in theory | 3 — Playwright-backed | 4 — Chrome/Firefox/Edge/Safari/IE11 | 5 — web + desktop + mobile via operator abstraction |
| **Stealth / Bot Bypass** | 2 — basic stealth; detectable | 2 — same as Playwright | 1 — no stealth features | 2 — basic | 5 — UC mode (undetected-chromedriver); CDP mode; fingerprint evasion | 3 — native OS events via nutjs (harder to detect than WebDriver) |

---

## Key Takeaways

**Best for Conxa's compilation pipeline:**
- Recording: Playwright's selectorGenerator.generateSelector() with numeric cost model — mine this directly
- Locator strategy: Playwright's priority order (role+name > label > text > testid > css) → adopt as Conxa's multi-signal weight ordering

**Best for Conxa's reliability cascade:**
- Tier 1/2 deterministic: Playwright's actionability gates (auto-wait) + SeleniumBase's exception-classified fallback ladder
- Tier 3 re-grounding: Stagehand's cache-first + self-heal pattern; browser-use's ARIA tree format
- Tier 4 vision: UI-TARS's scaleFactor normalization + SoM annotation approach

**Best for Conxa's MCP runtime:**
- Architecture: Playwright MCP's ServerBackend interface + tool registry pattern
- Auto-snapshot after each action: Playwright MCP's pattern of returning ARIA state after every mutating tool call

**Gaps in all frameworks (Conxa opportunities):**
1. No framework combines recording + caching + tiered recovery — Conxa is unique
2. No framework has iframe chain preservation through compile + execute
3. No framework supports cross-site skill composition (WorkArena multi-site tasks)
4. No framework has explicit human escalation with context continuity (UI-TARS CALL_USER is closest)
