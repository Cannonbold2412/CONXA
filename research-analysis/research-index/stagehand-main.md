# stagehand-main

## Repository Summary

- **Purpose**: AI-native browser automation framework combining LLM-driven action with deterministic code. Three core primitives: `act()` (single action), `agent()` (multi-step loop), `extract()` (structured data). Key innovation: auto-caching of actions + self-healing when cached actions fail. Built on Playwright + CUA (Computer Use Agent) model clients.
- **Estimated size**: ~300 TypeScript source files across 5 packages; total repo ~500 files
- **Main language**: TypeScript (Turbo monorepo, pnpm workspaces, esbuild)
- **Architectural style**: Monorepo with a core library (`packages/core`), HTTP server wrapper (`packages/server-v3`), CLI (`packages/cli`), evaluation harness (`packages/evals`), and docs

---

## Entry Points

| Entry | Path | Purpose |
|-------|------|---------|
| npm package | `packages/core` (`@browserbasehq/stagehand`) | Main library import |
| HTTP API | `packages/server-v3` (Fastify) | REST wrapper for non-Node clients |
| CLI | `packages/cli` | `npx create-browser-app` + direct commands |
| MCP example | `packages/core/examples/mcp.ts` | Shows Stagehand as MCP tool provider |
| v3 API | `packages/core/lib/v3/index.ts` | Current API surface |

---

## Core Components

| Component | Path | Purpose |
|-----------|------|---------|
| **v3 Agent** | `lib/v3/agent/` | Multi-step agent loop — drives CUA model clients |
| **AgentClient (abstract)** | `lib/v3/agent/AgentClient.ts` | Base class for all model integrations; defines `execute()`, `captureScreenshot()`, `setActionHandler()` |
| **CUA Clients** | `lib/v3/agent/AnthropicCUAClient.ts`, `OpenAICUAClient.ts`, `GoogleCUAClient.ts`, `MicrosoftCUAClient.ts` | Adapters for each provider's Computer Use API |
| **Agent Tools** | `lib/v3/agent/tools/` | Discrete browser actions: act, click, type, scroll, extract, screenshot, goto, wait, think |
| **DOM layer** | `lib/v3/dom/` | Accessibility tree + ARIA snapshot extraction for grounding |
| **Cache** | `lib/v3/cache/` | Persists action sequences; replays without LLM on repeat runs |
| **Handlers** | `lib/v3/handlers/` | Event routing between tools and browser |
| **Verifier** | `lib/v3/verifier/` | Validates action outcomes; triggers self-heal if action fails |
| **LLM** | `lib/v3/llm/` | Model abstraction (non-CUA path for `act`/`extract`) |
| **Inference** | `lib/inference.ts` | Core LLM call logic for structured output |
| **Prompt** | `lib/prompt.ts` | System prompt templates |
| **MCP** | `lib/v3/mcp/` | Exposes Stagehand tools via MCP protocol |
| **External clients** | `lib/v3/external_clients/` | Browserbase + other remote browser integrations |

---

## Important Files

### HIGH VALUE

| File | Why |
|------|-----|
| `lib/v3/agent/AgentClient.ts` | Defines the abstract interface all CUA integrations implement: `execute()`, `captureScreenshot()`, `setActionHandler()`, `setViewport()`, `addContextNote()` |
| `lib/v3/agent/AnthropicCUAClient.ts` | Anthropic-specific Computer Use implementation — most relevant for Claude integration |
| `lib/v3/agent/tools/index.ts` | Tool registry — all discrete browser actions available to the agent |
| `lib/v3/agent/tools/act.ts` | `act()` — single action execution with LLM grounding |
| `lib/v3/agent/tools/extract.ts` | `extract()` — structured data extraction from page |
| `lib/v3/agent/utils/actionMapping.ts` | Maps CUA model action types to Playwright calls |
| `lib/v3/agent/utils/captureAriaTreeProbe.ts` | ARIA tree capture — page state representation sent to LLM |
| `lib/v3/cache/` | Caching system — action replay without LLM |
| `lib/v3/verifier/` | Self-healing — detects action failure, re-invokes LLM |
| `lib/v3/mcp/` | MCP integration — exposes Stagehand as tool provider |
| `lib/inference.ts` | Core inference call; handles structured output, retries |
| `lib/v3/index.ts` | v3 public API exports |

### MEDIUM VALUE

| File | Why |
|------|-----|
| `lib/v3/agent/OpenAICUAClient.ts` | OpenAI Computer Use adapter — comparison point |
| `lib/v3/agent/tools/fillform.ts`, `fillFormVision.ts` | Form filling — both DOM and vision paths |
| `lib/v3/agent/tools/think.ts` | LLM reasoning step within action loop |
| `lib/v3/agent/utils/coordinateNormalization.ts` | Vision-based coordinate normalization for click accuracy |
| `lib/v3/dom/` | DOM/ARIA extraction for text-based grounding |
| `lib/v3/launch/` | Browser launch and session lifecycle |
| `lib/v3/handlers/` | Action event dispatch |
| `lib/v3/understudy/` | Secondary/fallback agent path |
| `lib/prompt.ts` | Prompt design — system prompts for act/extract |
| `packages/server-v3/src/` | HTTP wrapper for multi-language clients |
| `lib/v3/agent/utils/captchaSolver.ts` | CAPTCHA handling in agent loop |

### LOW VALUE

| File | Why |
|------|-----|
| `packages/evals/` | Evaluation harness — testing only |
| `packages/docs/` | Documentation source |
| `packages/core/examples/` | Example scripts |
| `packages/core/scripts/` | Build scripts |
| `lib/v3/flowlogger/` | Telemetry/logging |
| `lib/v3/shutdown/` | Graceful shutdown |
| `lib/logger.ts`, `lib/inferenceLogUtils.ts` | Logging utilities |
| `media/` | Brand assets |
| `.github/` | CI/CD |
| `.changeset/` | Version management |

---

## Architecture-Relevant Areas

**Execution logic**
- `lib/v3/agent/` — full agent loop: screenshot → CUA model → action → verify → repeat
- `lib/v3/agent/tools/act.ts` — single action with grounding via ARIA/DOM

**Locator logic**
- `lib/v3/agent/utils/captureAriaTreeProbe.ts` — ARIA tree as page representation
- `lib/v3/agent/tools/ariaTree.ts` — ARIA tree tool exposed to LLM
- `lib/v3/dom/` — DOM serialization for text-mode grounding (non-vision path)

**Recovery / reliability logic**
- `lib/v3/verifier/` — post-action validation; detects when page state doesn't match expected outcome
- `lib/v3/cache/` — replays cached action sequences; self-heal when cache misses or actions fail

**Vision logic**
- `lib/v3/agent/tools/screenshot.ts` — screenshot capture at each step
- `lib/v3/agent/utils/coordinateNormalization.ts` — normalize model-output coordinates to viewport
- `lib/v3/agent/tools/fillFormVision.ts` — vision-based form filling (vs. DOM-based)

**MCP logic**
- `lib/v3/mcp/` — wraps Stagehand actions as MCP tools
- `packages/core/examples/mcp.ts` — reference implementation

---

## Ignore Recommendations

| Area | Reason | Estimated % |
|------|--------|------------|
| `packages/evals/` | Benchmark/eval harness | ~15% |
| `packages/docs/` | Documentation | ~10% |
| `packages/core/examples/` | Example scripts | ~5% |
| `packages/core/scripts/` | Build tooling | ~3% |
| `media/` | Images and brand assets | ~2% |
| `.github/`, `.husky/`, `.changeset/` | CI, git hooks, changelogs | ~3% |
| `lib/v3/flowlogger/`, `lib/v3/shutdown/` | Telemetry and lifecycle | ~3% |
| Legacy evaluator files (`v3Evaluator.ts`, `v3LegacyEvaluator.ts`) | Testing only | ~2% |

**Estimated ignorable: ~43%**. Focus on `packages/core/lib/v3/agent/` and `lib/v3/{cache,verifier,mcp}/`.
