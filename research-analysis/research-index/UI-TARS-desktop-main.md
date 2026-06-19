# UI-TARS-desktop-main

## Repository Summary

- **Purpose**: Electron desktop application powered by a vision-language model (VLM) that automates computer and browser tasks via natural language commands. The agent observes the screen via screenshots, reasons about what to do, and executes mouse/keyboard actions. Supports local privacy-preserving execution. Built by Bytedance.
- **Estimated size**: ~500 TypeScript/React files across 4 packages + 1 Electron app
- **Main language**: TypeScript (Electron + React renderer; Node.js main process)
- **Architectural style**: Electron monorepo (Turbo + pnpm); main/renderer/preload process split; agent-infra packages for reusable agent components; VLM-first (coordinate-based, not DOM-selector-based)

---

## Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| Electron app | `apps/ui-tars/src/main/main.ts` | App initialization, window creation, IPC setup |
| IPC routes | `apps/ui-tars/src/main/ipcRoutes/index.ts` | All IPC channel definitions between main and renderer |
| Agent runner | `apps/ui-tars/src/main/services/runAgent.ts` | Starts the VLM agent loop |
| Renderer UI | `apps/ui-tars/src/renderer/` | React-based user interface |
| Agent-infra browser-use | `packages/agent-infra/browser-use/src/index.ts` | Browser automation layer used by agents |
| MCP servers | `packages/agent-infra/mcp-servers/` | MCP tool server for browser, filesystem, search |

---

## Core Components

| Component | Path | Purpose |
|-----------|------|---------|
| **Electron main** | `apps/ui-tars/src/main/main.ts` | App lifecycle, accessibility permissions, window mgmt, IPC registration |
| **Agent runner** | `apps/ui-tars/src/main/services/runAgent.ts` | Executes the VLM agent loop; calls VLM → parses action → executes |
| **UTIO service** | `apps/ui-tars/src/main/services/utio.ts` | UI-TARS Input/Output — system-level mouse/keyboard control |
| **Window manager** | `apps/ui-tars/src/main/services/windowManager.ts` | Manages multiple Electron windows |
| **IPC routes** | `apps/ui-tars/src/main/ipcRoutes/` | Typed IPC channels: agent control, settings, screenshots |
| **Store** | `apps/ui-tars/src/main/store/` | Electron-store backed state (settings, agent history) |
| **Browser operator** | `packages/agent-infra/browser-use/src/operator.ts` | `Operator` class — translates agent actions to browser commands |
| **Agent (browser-use)** | `packages/agent-infra/browser-use/src/agent/` | Browser-specific agent loop |
| **DOM (browser-use)** | `packages/agent-infra/browser-use/src/dom/` | DOM extraction for browser agent |
| **MCP servers** | `packages/agent-infra/mcp-servers/` | browser, commands, filesystem, search tool servers |
| **MCP client** | `packages/agent-infra/mcp-client/` | MCP client connecting to tool servers |
| **UI-TARS package** | `packages/ui-tars/src/` | Shared VLM interaction types and utilities |
| **Common** | `packages/common/` | Cross-package utilities |

---

## Important Files

### HIGH VALUE

| File | Why |
|------|-----|
| `apps/ui-tars/src/main/services/runAgent.ts` | **Core agent loop** — screenshots the screen, calls VLM API, parses action (click/type/scroll/key), dispatches via UTIO |
| `apps/ui-tars/src/main/services/utio.ts` | **System input** — mouse movement, click, keyboard injection at OS level (not browser) |
| `packages/agent-infra/browser-use/src/operator.ts` | `Operator` — maps VLM action types to Playwright/CDP browser calls; coordinate normalization |
| `packages/agent-infra/browser-use/src/agent/` | Browser-specific agent loop; interfaces with VLM for browser tasks |
| `packages/agent-infra/browser-use/src/dom/` | DOM state extraction for browser agent grounding |
| `apps/ui-tars/src/main/ipcRoutes/` | All IPC channel definitions — how renderer triggers agent actions |
| `packages/agent-infra/mcp-servers/browser/` | MCP tool server for browser control |
| `packages/agent-infra/mcp-client/` | MCP client implementation |
| `apps/ui-tars/src/main/store/` | Settings and agent state persistence |

### MEDIUM VALUE

| File | Why |
|------|-----|
| `apps/ui-tars/src/main/main.ts` | Electron startup — accessibility permissions, squirrel setup, window creation |
| `apps/ui-tars/src/main/services/browserCheck.ts` | Checks browser availability before agent runs |
| `apps/ui-tars/src/main/services/settings.ts` | VLM endpoint configuration, API key management |
| `apps/ui-tars/src/main/services/windowManager.ts` | Multi-window management for agent + UI |
| `apps/ui-tars/src/preload/` | Secure IPC bridge between main and renderer |
| `apps/ui-tars/src/renderer/` | React UI — task input, agent status, history display |
| `packages/agent-infra/browser-use/src/context.ts` | Browser context lifecycle |
| `packages/agent-infra/mcp-servers/commands/` | Shell command execution MCP tool |
| `packages/agent-infra/mcp-servers/search/` | Web search MCP tool |
| `packages/agent-infra/browser-use/src/prompts.ts` | System prompts for browser agent |

### LOW VALUE

| File | Why |
|------|-----|
| `docs/` | Documentation |
| `rfcs/` | Design proposals (historical) |
| `infra/` | Infrastructure / deployment |
| `patches/` | Dependency patches |
| `.changeset/` | Version management |
| `scripts/` | Build scripts |
| `.github/` | CI/CD |
| `apps/ui-tars/src/main/menu.ts` | Electron menu bar |
| `apps/ui-tars/src/main/tray.ts` | System tray icon |
| `apps/ui-tars/src/main/electron-updater/` | Auto-update mechanism |
| `packages/agent-infra/mcp-benchmark/` | Benchmarking harness |

---

## Architecture-Relevant Areas

**Vision logic**
- `services/runAgent.ts` — captures screenshot at each step; encodes and sends to VLM
- VLM (Seed-1.5-VL / 1.6 series) processes screenshot → returns action with coordinates
- No DOM-selector-based locating — entirely coordinate-based from VLM output

**Execution logic**
- `services/utio.ts` — OS-level mouse/keyboard execution (desktop tasks)
- `packages/agent-infra/browser-use/src/operator.ts` — browser-specific action execution
- Action types: `click(x,y)`, `type(text)`, `scroll(x,y,direction)`, `key(combo)`, `screenshot`

**Locator logic**
- No traditional CSS/XPath locators — VLM outputs pixel coordinates
- `packages/agent-infra/browser-use/src/dom/` — supplementary DOM extraction for browser agent grounding when coordinates aren't sufficient

**MCP logic**
- `packages/agent-infra/mcp-servers/` — browser, commands, filesystem, search tool servers
- `packages/agent-infra/mcp-client/` — connects agent to tool servers
- Agent can invoke MCP tools mid-task for web search, file access, shell commands

**Reliability logic**
- `services/runAgent.ts` — step loop with max iterations; error capture per step
- VLM action verification via next screenshot comparison (implicit)

---

## Ignore Recommendations

| Area | Reason | Estimated % |
|------|--------|------------|
| `docs/` | Documentation | ~5% |
| `rfcs/` | Historical design docs | ~3% |
| `infra/` | Cloud deployment | ~5% |
| `patches/` | npm package patches | ~2% |
| `.changeset/`, `scripts/` | Build tooling | ~3% |
| `.github/` | CI/CD | ~3% |
| `apps/ui-tars/src/main/menu.ts`, `tray.ts` | UI chrome | ~1% |
| `apps/ui-tars/src/main/electron-updater/` | Auto-update | ~2% |
| `packages/agent-infra/mcp-benchmark/` | Benchmarking | ~3% |
| `packages/agent-infra/logger/` | Logging utilities | ~2% |
| `packages/agent-infra/shared/` | Minor shared types | ~2% |

**Estimated ignorable: ~31%**. Focus on `apps/ui-tars/src/main/services/`, `apps/ui-tars/src/main/ipcRoutes/`, `packages/agent-infra/browser-use/src/`, and `packages/agent-infra/mcp-servers/`.

> **Key architectural insight**: UI-TARS operates at the OS level (pixel coordinates + system input) rather than DOM level. This is the only repo in the corpus that takes a pure VLM/vision-first approach with zero DOM dependency for the desktop agent path.
