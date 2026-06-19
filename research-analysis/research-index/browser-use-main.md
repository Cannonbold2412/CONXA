# browser-use-main

## Repository Summary

- **Purpose**: Python-first AI agent framework for web automation. An LLM observes the page (via accessibility tree + screenshots), decides on an action, and the agent executes it — looping until task completion. Supports 7+ LLM providers. Emphasizes vision-first DOM extraction over selector-based automation.
- **Estimated size**: ~386 Python files
- **Main language**: Python 3.11+
- **Architectural style**: Single package (`browser_use/`) with submodules; async event-driven (asyncio); modular tools via `@tools.action()` decorator; agent loop pattern

---

## Entry Points

| Entry | File/Command | Purpose |
|-------|-------------|---------|
| CLI | `browser-use`, `browseruse`, `bu`, `browser` | `browser_use.skill_cli.main:main` |
| TUI | `browser-use-tui` | `browser_use.cli:main` |
| Python API | `from browser_use import Agent, Browser, BrowserProfile` | Main programmatic entry |
| MCP server | `browser_use/mcp/` | Claude Desktop / MCP client integration |
| Package init | `browser_use/__init__.py` | Exports: `Agent`, `Browser`, `BrowserProfile`, `BrowserSession`, `Controller` |

---

## Core Components

| Module | Path | Purpose |
|--------|------|---------|
| **Agent** | `browser_use/agent/service.py` | Core orchestration loop — `Agent.run()`: screenshot → LLM → action → repeat |
| **Agent views** | `browser_use/agent/views.py` | Data models: `AgentOutput`, `ActionResult`, `AgentHistory`, `AgentHistoryList`, `AgentState`, `AgentSettings` |
| **Message manager** | `browser_use/agent/message_manager/` | Builds LLM message history; manages compaction, context window |
| **System prompts** | `browser_use/agent/system_prompts/` | LLM prompt templates per task type |
| **DOM service** | `browser_use/dom/service.py` | `DomService` — builds AX tree + enhanced DOM snapshot via CDP |
| **DOM views** | `browser_use/dom/views.py` | `EnhancedAXNode`, `SerializedDOMState`, `DOMRect` — page state representation |
| **DOM serializer** | `browser_use/dom/serializer/` | Serializes DOM tree; `ClickableElementDetector` identifies interactive elements |
| **Browser session** | `browser_use/browser/session.py` | `BrowserSession` — wraps CDP connection; exposes `get_state()`, `execute_action()` |
| **Browser profile** | `browser_use/browser/` | Launch config, proxy, recording, cloud toggle |
| **Tools** | `browser_use/tools/service.py` | `Tools` class — action registry; `@tools.action()` decorator |
| **LLM** | `browser_use/llm/base.py` | `BaseChatModel` abstraction; adapters for Anthropic, OpenAI, Gemini, Groq, Ollama |
| **Actor** | `browser_use/actor/` | Translates `ActionModel` → CDP browser calls |
| **Controller** | `browser_use/controller/` | Coordinates agent + browser session lifecycle |
| **MCP** | `browser_use/mcp/` | MCP server exposing browser-use as tools |
| **Screenshots** | `browser_use/screenshots/` | Page capture; encodes for LLM vision input |
| **Sandbox** | `browser_use/sandbox/` | Multi-instance containerization |

---

## Important Files

### HIGH VALUE

| File | Why |
|------|-----|
| `browser_use/agent/service.py` | **The agent loop** — `Agent.run()`, `Agent.step()`, screenshot→LLM→action→state update. Central to understanding the execution model. |
| `browser_use/agent/views.py` | All key data structures: `AgentOutput` (LLM response), `ActionResult` (tool return), `AgentHistoryList` (full run record), `AgentState` |
| `browser_use/dom/service.py` | `DomService` — builds accessibility tree via CDP; core page state representation; note: re-opens WS connection per step (known limitation) |
| `browser_use/dom/views.py` | `EnhancedAXNode`, `SerializedDOMState` — what the agent actually sees |
| `browser_use/dom/serializer/clickable_elements.py` | `ClickableElementDetector` — identifies interactive elements for grounding |
| `browser_use/browser/session.py` | `BrowserSession` — CDP session manager; `get_state()` returns `BrowserStateSummary` |
| `browser_use/tools/service.py` | `Tools` + `@tools.action()` — how all browser actions are registered and dispatched |
| `browser_use/tools/registry/views.py` | `ActionModel` — Pydantic model representing a parsed tool call |
| `browser_use/llm/base.py` | `BaseChatModel` — unified interface for all LLM providers |
| `browser_use/agent/message_manager/service.py` | Message history construction; compaction logic to stay within context window |
| `browser_use/__init__.py` | Public API surface |
| `browser_use/config.py` | Global config (`CONFIG`) — timeouts, limits, vision settings |

### MEDIUM VALUE

| File | Why |
|------|-----|
| `browser_use/actor/` | Action executor — maps `ActionModel` to low-level CDP/Playwright calls |
| `browser_use/dom/enhanced_snapshot.py` | Enhanced AX snapshot with computed styles; `REQUIRED_COMPUTED_STYLES` list |
| `browser_use/dom/serializer/serializer.py` | `DOMTreeSerializer` — converts AX tree to LLM-readable text format |
| `browser_use/agent/prompts.py` | `SystemPrompt` class — prompt construction |
| `browser_use/agent/system_prompts/` | Prompt templates per task type |
| `browser_use/agent/judge.py` | Judgment step — evaluates task completion |
| `browser_use/mcp/` | MCP server — relevant for Claude Desktop integration |
| `browser_use/llm/` | Provider adapters (Anthropic, OpenAI, Gemini, etc.) |
| `browser_use/controller/` | Session lifecycle coordination |
| `browser_use/agent/message_manager/utils.py` | `save_conversation()` — conversation persistence |
| `browser_use/browser/events.py` | Browser event types + timeout config |
| `browser_use/observability.py` | `@observe` decorator for tracing |

### LOW VALUE

| File | Why |
|------|-----|
| `browser_use/examples/` | Example scripts |
| `browser_use/beta/` | Experimental features — unstable |
| `browser_use/sandbox/` | Container scaling — deployment concern |
| `browser_use/skills/` | Domain-specific skill packs |
| `browser_use/skill_cli/` | CLI entry point only |
| `browser_use/telemetry/` | Usage telemetry |
| `browser_use/filesystem/` | File I/O utilities |
| `browser_use/sync/` | Sync wrapper around async API |
| `browser_use/tokens/` | Token counting utilities |
| `browser_use/integrations/` | Third-party integrations |
| `tests/` | Test suite |
| `docker/`, `Dockerfile` | Container runtime |

---

## Architecture-Relevant Areas

**Execution logic**
- `agent/service.py` → `Agent.run()` → `Agent.step()`: the full loop
- `actor/` → translates `ActionModel` to browser calls
- `tools/service.py` → `@tools.action()` registry pattern

**Locator logic**
- `dom/service.py` → `DomService.get_dom_state()` → builds accessibility tree via CDP
- `dom/serializer/clickable_elements.py` → `ClickableElementDetector` → identifies `<button>`, `<a>`, `<input>` etc.
- `dom/views.py` → `EnhancedAXNode` with bounding rects — grounding data

**Vision logic**
- `screenshots/` → captures viewport; encodes as base64 for LLM
- `dom/enhanced_snapshot.py` → computed styles overlay on AX tree
- LLM receives: serialized DOM text + optional screenshot

**Recovery logic**
- `agent/service.py` → error handling in step loop; `ActionResult.error` field
- `agent/views.py` → `AgentError` type; step retry via `AgentSettings.max_failures`
- `agent/judge.py` → post-step judgment; can trigger loop continuation or termination

**MCP logic**
- `browser_use/mcp/` → exposes agent as MCP tools; enables Claude Desktop usage

---

## Ignore Recommendations

| Area | Reason | Estimated % |
|------|--------|------------|
| `browser_use/examples/` | Example scripts | ~5% |
| `browser_use/beta/` | Experimental / unstable | ~5% |
| `browser_use/sandbox/` | Deployment/scaling | ~5% |
| `browser_use/telemetry/` | Usage analytics | ~3% |
| `browser_use/sync/` | Thin async→sync wrapper | ~2% |
| `browser_use/tokens/` | Token counting only | ~2% |
| `tests/` | Test suite | ~15% |
| `docker/` | Container config | ~2% |
| `bin/`, `media/`, `.github/` | Build/brand/CI | ~3% |

**Estimated ignorable: ~42%**. Focus on `browser_use/agent/`, `browser_use/dom/`, `browser_use/browser/session.py`, and `browser_use/tools/`.
