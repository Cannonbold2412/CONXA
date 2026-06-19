# playwright-main

## Repository Summary

- **Purpose**: Microsoft's browser automation framework — controls Chromium, Firefox, and WebKit with a unified high-level API. Covers web testing, accessibility snapshots, MCP server integration, and CDP relay for browser extension bridging.
- **Estimated size**: ~1,449 TypeScript/JS files across 27 packages; full repo ~8,000+ files including docs, browser binaries, and test fixtures
- **Main language**: TypeScript (compiled to CJS/ESM)
- **Architectural style**: Monorepo (npm workspaces); layered client/server architecture where a Node.js client communicates over a JSON message channel to a browser-side server process

---

## Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| In-process API | `index.js` → `packages/playwright-core/index.js` | Default Node.js import |
| ES module | `packages/playwright-core/index.mjs` | ESM import |
| CLI | `packages/playwright-core/cli.js` | `npx playwright` commands |
| Test runner | `packages/playwright-test/index.js` | `playwright test` |
| MCP server | `packages/playwright-core/src/entry/mcp.ts` | `createConnection()` startup |

The MCP entry (`src/entry/mcp.ts`) calls `createConnection(config, contextGetter?)` in `src/tools/mcp/index.ts`, resolves config, filters tools, instantiates a `BrowserBackend`, and returns an MCP `Server`.

---

## Core Components

| Module | Path | Purpose |
|--------|------|---------|
| **playwright-core** | `packages/playwright-core/` | Foundation — no bundled browsers |
| **playwright** | `packages/playwright/` | Public API combining all browser types |
| **playwright-test** | `packages/playwright-test/` | Full test runner + assertions + reporters |
| **client layer** | `src/client/` | User-facing API objects (Page, Locator, Frame…) |
| **server layer** | `src/server/` | Browser process side — launches, intercepts network |
| **protocol layer** | `src/protocol/` | Serialization and validation of JSON messages |
| **tools/mcp** | `src/tools/mcp/` | MCP server + CDP relay bridge |
| **recorder** | `packages/recorder/` | React-based recording UI |
| **trace-viewer** | `packages/trace-viewer/` | Trace replay and visualization |

---

## Important Files

### HIGH VALUE

| File | Why |
|------|-----|
| `src/tools/mcp/index.ts` | MCP entry — wires config → tools → BrowserBackend → MCP Server |
| `src/tools/mcp/cdpRelay.ts` | CDPRelayServer: bridges `/cdp/{guid}` (Playwright) ↔ `/extension/{guid}` (Chrome extension) over WebSocket |
| `src/tools/mcp/cdpRelayV2.ts` | Default multi-tab protocol handler (v2); relay manages debugger attachment via `chrome.*` APIs |
| `src/tools/mcp/browserModel.ts` | Browser abstraction used by the MCP layer |
| `src/tools/mcp/program.ts` | CLI program definition for the MCP server |
| `src/client/locator.ts` | Core element selection API — CSS, accessibility, text, role-based queries; chainable filters |
| `src/client/page.ts` | Page object — navigation, interaction, waitFor, screenshot |
| `src/client/frame.ts` | Frame/iframe handling; core execution context |
| `src/client/browserContext.ts` | Cookie, storage, network interception context |
| `src/client/connection.ts` | Client-server channel — bidirectional JSON message dispatch |
| `src/client/channelOwner.ts` | Base class for all remote objects; owns a channel and dispatches events |
| `src/tools/backend/tools.ts` | `filteredTools()` — registry of all MCP tool schemas |
| `src/tools/backend/browserBackend.ts` | `BrowserBackend` — MCP tool execution against a live browser context |

### MEDIUM VALUE

| File | Why |
|------|-----|
| `src/tools/mcp/cdpRelayV1.ts` | Legacy single-tab protocol (v1) — kept for compatibility |
| `src/tools/mcp/config.ts` | Config resolution for MCP server |
| `src/tools/mcp/cdpRelayHandler.ts` | Message routing between CDP and extension sockets |
| `src/tools/mcp/protocol.ts` | Extension command/event type definitions |
| `src/client/elementHandle.ts` | Low-level DOM handle (mostly superseded by Locator) |
| `src/client/input.ts` | Keyboard and mouse raw input |
| `src/client/network.ts` | Request/response interception |
| `src/protocol/serializers.ts` | Wire format encoding/decoding |
| `src/protocol/validator.ts` | Message schema validation |
| `src/client/tracing.ts` | Trace recording API |
| `packages/playwright-test/src/` | Test runner internals — relevant if studying assertion/fixture patterns |

### LOW VALUE

| File | Why |
|------|-----|
| `src/client/android.ts` | Android WebDriver — not relevant to web browser automation |
| `src/client/clock.ts` | Time mocking — test utility |
| `src/client/coverage.ts` | Code coverage — test tooling |
| `packages/trace-viewer/` | Visualization app — not architecture |
| `packages/html-reporter/` | Report generation — not architecture |
| `packages/dashboard/` | Web UI — not architecture |
| `packages/extension/` | Browser extension binary — platform-specific |
| `packages/recorder/` | Recording UI (React app) — useful only for studying recording UX |
| `src/cli/` | CLI parsing — not core logic |

---

## Architecture-Relevant Areas

**Locator logic**
- `src/client/locator.ts` — selector-based element location with `hasText`, `hasNot`, `has`, visibility, role, label filters
- `src/client/elementHandle.ts` — lower-level DOM reference (legacy path)

**Execution logic**
- `src/client/page.ts`, `frame.ts`, `input.ts` — user actions (click, fill, navigate, keypress)
- `src/client/connection.ts` + `channelOwner.ts` — dispatches calls to server process

**Recording logic**
- `packages/recorder/src/` — React UI capturing user interactions
- `src/server/recorder/` — server-side recording event capture

**MCP logic**
- `src/tools/mcp/index.ts` — `createConnection()` — primary API
- `src/tools/mcp/program.ts` — CLI surface
- `src/tools/backend/tools.ts` — tool registry (50+ tools)
- `src/tools/backend/browserBackend.ts` — tool execution

**CDP relay / extension bridge**
- `src/tools/mcp/cdpRelay.ts` — `CDPRelayServer` with two WS endpoints
- `src/tools/mcp/cdpRelayV2.ts` — multi-tab handler (default)
- Controlled by `PLAYWRIGHT_EXTENSION_PROTOCOL` env var (1 = single-tab, 2 = multi-tab)

**Reliability logic**
- `src/client/locator.ts` — built-in auto-wait; locators re-query on each action
- `src/client/frame.ts` — `waitForSelector`, `waitForFunction` primitives

---

## Ignore Recommendations

| Area | Reason | Estimated % of repo |
|------|--------|-------------------|
| `tests/` | End-to-end + unit test suites | ~25% |
| `browser_patches/` | Browser binary patches — Chromium/FF/WebKit source modifications | ~15% |
| `docs/src/` | Documentation MDX source | ~5% |
| `packages/trace-viewer/` | Standalone trace visualization React app | ~3% |
| `packages/html-reporter/` | HTML report generator | ~2% |
| `packages/dashboard/` | Web dashboard UI | ~2% |
| `packages/extension/` | Browser extension (not MCP path) | ~2% |
| `packages/recorder/` | Recording UI (React) — secondary concern | ~2% |
| Browser binary packages | `packages/playwright-{chromium,firefox,webkit}/` — just download scripts | ~3% |
| `packages/playwright-ct-*` | Component testing adapters (React, Vue) | ~3% |

**Estimated ignorable: ~62%**. Focus on `packages/playwright-core/src/{client,tools/mcp,protocol}/`.
