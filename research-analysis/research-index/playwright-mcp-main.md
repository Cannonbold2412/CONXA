# playwright-mcp-main

## Repository Summary

- **Purpose**: Thin npm package that publishes `@playwright/mcp` — exposes Playwright as an MCP (Model Context Protocol) server so LLMs can automate browsers via 50+ structured tools. The actual implementation lives in `playwright-core/src/tools/mcp/`.
- **Estimated size**: ~10 meaningful source files at root; ~8 test files. Source code is in the playwright-main monorepo.
- **Main language**: JavaScript/TypeScript (index.js wrapper + TypeScript definitions)
- **Architectural style**: Thin facade — delegates everything to `playwright-core/lib/coreBundle`

---

## Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| Programmatic API | `index.js` | Exports `createConnection` from coreBundle |
| CLI | `cli.js` | `playwright-mcp` command; routes through `tools.decorateMCPCommand()` |
| MCP server manifest | `server.json` | MCP registry metadata (name, version, transport: stdio) |
| Type definitions | `index.d.ts` | `createConnection(config?, contextGetter?)` signature |

**`index.js`** (full content):
```js
const { tools } = require('playwright-core/lib/coreBundle');
module.exports = { createConnection: tools.createConnection };
```

**`cli.js`** flow:
1. If `install-browser` arg → remap to `install`, delegate to `libCli.decorateProgram()`
2. Otherwise → `tools.decorateMCPCommand(program, version)` → `program.parseAsync(process.argv)`

---

## Core Components

This repo has no independent core logic. The architecture is:

```
@playwright/mcp (this repo)
  └─ index.js → playwright-core/lib/coreBundle.tools.createConnection
        └─ src/tools/mcp/index.ts     [actual implementation]
              ├─ browserFactory.ts    [browser instantiation]
              ├─ browserModel.ts      [browser abstraction]
              ├─ program.ts           [CLI command definition]
              ├─ config.ts            [config resolution]
              └─ cdpRelay*.ts         [CDP↔extension bridge]
```

For deep study of MCP logic, go to **playwright-main** → `packages/playwright-core/src/tools/mcp/`.

---

## Important Files

### HIGH VALUE

| File | Why |
|------|-----|
| `index.js` | Shows how `createConnection` is re-exported — confirms the delegation pattern |
| `cli.js` | Shows CLI command registration flow and install-browser remap |
| `index.d.ts` | Public API surface: `createConnection(config?: Config, contextGetter?: () => Promise<BrowserContext>): Promise<Server>` |
| `server.json` | MCP registry manifest — defines transport (stdio), name, version |
| `package.json` | Version, peer deps, entry points, scripts |

### MEDIUM VALUE

| File | Why |
|------|-----|
| `config.d.ts` | Config shape — what options the MCP server accepts |
| `playwright.config.ts` | Test configuration — shows how MCP server is integration-tested |

### LOW VALUE

| File | Why |
|------|-----|
| `src/README.md` | Just says "source is in playwright monorepo" |
| `.devcontainer/` | Dev container setup — not architecture |
| `Dockerfile` | Runtime container — useful for deployment, not architecture |
| `.github/workflows/` | CI pipeline |
| `CONTRIBUTING.md`, `SECURITY.md` | Meta documentation |
| `tests/` | Integration test suite |

---

## Architecture-Relevant Areas

**MCP logic**
- `index.js` — `createConnection` facade
- `server.json` — stdio transport declaration; LLM clients connect via stdin/stdout
- `cli.js` — `decorateMCPCommand()` registers Playwright-specific CLI flags

**Execution logic**
- Entirely delegated to `playwright-core/src/tools/backend/browserBackend.ts`

**All other areas (locator, recording, vision, CDP relay)**
- Implemented in `playwright-main/packages/playwright-core/src/tools/mcp/`
- See `playwright-main.md` for those details

---

## Ignore Recommendations

| Area | Reason | Estimated % |
|------|--------|------------|
| `src/README.md` | Pointer only, no code | ~1% |
| `tests/` | Integration tests | ~30% |
| `.devcontainer/` | Dev environment setup | ~5% |
| `Dockerfile` | Container runtime | ~2% |
| `.github/` | CI/CD | ~5% |
| `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | Meta | ~3% |

**Estimated ignorable: ~46%**. The meaningful surface of this repo is 5 files: `index.js`, `cli.js`, `index.d.ts`, `server.json`, `package.json`.

> **Key architectural insight**: This repo is primarily a packaging artifact. All analytical value is in `playwright-main`. Study this repo only to understand the public API surface and MCP transport configuration.
