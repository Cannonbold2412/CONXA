# Conxa — AI-Native Automation Platform

Record real browser workflows once. Compile them into durable, self-healing skills. Let Claude execute them reliably — forever.

---

## What This Is

Conxa is infrastructure that makes any software platform operable by AI. Three systems, three owners:

```
Company (SaaS vendor)        Conxa Cloud              Customer (end user)
─────────────────────        ───────────              ──────────────────
Build Studio (Windows)  →    Render + Vercel      →   Runtime (Claude Desktop)
Record + compile locally     Proxy / host / bill      Execute locally via MCP
```

- **Build Studio** — Windows Electron + Python desktop app. Records browser workflows via Playwright, compiles them into structured skill packages with multi-signal element identity, self-healing recovery blocks, and outcome assertions. Everything happens locally; the cloud is never involved in recording or compilation.
- **Conxa Cloud** — Thin SaaS layer. Proxies LLM calls (metered), hosts published skill packages, handles billing (Cashfree), manages team auth (Clerk), and streams telemetry from the runtime.
- **Runtime** — Node.js MCP server that ships to the customer's machine as a bundled `.exe`. Syncs skill packages from the cloud, executes them step-by-step with a 5-tier self-healing recovery cascade, and surfaces them to Claude via MCP tools.

---

## Repository Layout

```
packages/conxa-core/        Shared Python foundation — pip package `conxa_core`
                            Installed by BOTH the cloud backend and the Build Studio

conxa-builder/              Build Studio — Windows desktop app
  electron/                 Electron shell (main.js, preload.js, React + Vite renderer)
  python/                   Python stdio backend (spawned by Electron over JSON-RPC)
    conxa_compile/          Full local pipeline: recorder → pipeline → compiler → editor

conxa-cloud/                Cloud SaaS — coordination only, no recording or execution
  backend/                  FastAPI (Render) — LLM proxy, auth, billing, skill hosting
  frontend/                 Next.js 16 dashboard (Vercel) — Dashboard, Plugins, Billing, Team

runtime/                    Node.js MCP server — ships to ~/.conxa/runtime/ on customer machine

docs/                       Authoritative documentation — read before changing anything
data/                       Runtime state: sessions, plugins, skills, cache, chromium
```

---

## Documentation

Read the relevant doc before making non-trivial changes — the code is downstream of these.

| Document | When to read it |
|---|---|
| [`docs/TRD.md`](docs/TRD.md) | Recorder, compiler, runtime, auth flows, API surface, recovery cascade. Full technical deep-dive with sequence diagrams. |
| [`docs/App-Flow.md`](docs/App-Flow.md) | End-to-end user flows — onboarding, record, compile, build, install, execute, update. |
| [`docs/Backend-Schema.md`](docs/Backend-Schema.md) | Data models, API contracts, ERD diagrams, KV namespace map. |
| [`docs/UI-UX-Brief.md`](docs/UI-UX-Brief.md) | Every screen in Build Studio and Cloud Dashboard. |
| [`docs/Implementation-Plan.md`](docs/Implementation-Plan.md) | Prioritised 4-phase engineering roadmap. Start here for new tasks. |
| [`docs/PRD.md`](docs/PRD.md) | Product vision, personas, positioning, long-term roadmap. |
| [`docs/cost_model.md`](docs/cost_model.md) | LLM unit economics — cost per compile, hosting cost, revenue model. |
| [`docs/Security.md`](docs/Security.md) | Numbered security-gap tracker (SG-01…) with fix status. |
| [`docs/Sales-Blockers.md`](docs/Sales-Blockers.md) | What's still blocking an enterprise sale — sales-framed view of `Implementation-Plan.md`. |
| [`docs/Auth-and-Updater.md`](docs/Auth-and-Updater.md) | Build Studio + runtime auth flows and both auto-updaters. |
| [`SHIP-GUIDE.md`](SHIP-GUIDE.md) | Step-by-step runbook for shipping a release. |
| [`TODO.md`](TODO.md) | The single prioritized backlog spanning documentation, architecture, and every subsystem. |

New to the codebase? Start with `docs/TRD.md`.

---

## Getting Started

### Prerequisites

- Python 3.10+, pip
- Node.js 18+, npm
- Windows 10/11 x64 (Build Studio only; cloud backend and runtime run cross-platform)

### Cloud backend

```bash
# Install shared foundation first (editable for dev), then cloud deps
pip install -e packages/conxa-core
cd conxa-cloud/backend && pip install -r requirements.txt

# Run the API server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Tests — run from conxa-cloud/
cd .. && pytest -q tests
```

### Cloud frontend

```bash
cd conxa-cloud/frontend
npm install
npm run dev       # local dev server
npm run lint
npm run build     # production build (Vercel)
```

### Build Studio (Windows)

```bash
# 1. Install shared foundation and pipeline deps
pip install -e packages/conxa-core
cd conxa-builder/python && pip install -r requirements.txt && python -m playwright install chromium

# 2. Install Electron shell deps
cd ../electron && npm install

# 3. Run in development (starts Vite renderer + Electron; Electron spawns the Python backend)
npm run dev
```

### Runtime (MCP server)

```bash
cd runtime
npm install
npm start                  # MCP stdio mode — connect from Claude Desktop
npm run build:win          # → dist/runtime-win.exe
npm run build:mac          # → dist/runtime-mac
```

### Configuration

All backend settings use the `SKILL_` prefix — see `packages/conxa-core/conxa_core/config.py`. LLM provider keys feed the multi-provider pool (Groq, Google AI Studio, NVIDIA NIM by default) — see `conxa-cloud/backend/ROUTER_SETUP.md`.

### Dev / Prod environment isolation

A single switch, **`CONXA_ENV`** (`dev` | `prod`), selects one of two fully isolated
stacks so Development and Production coexist on one machine with zero interference:

| | Dev lane | Prod lane |
|---|---|---|
| Env file | `.env.dev` (copy from `.env.dev.example`) | `.env.prod` |
| Runtime tree | `~/.conxa-dev` | `~/.conxa` |
| Studio state | `~/.conxa-build-studio-dev` | `~/.conxa-build-studio` |
| Cloud | `127.0.0.1:8000` (or `dev-apis.conxa.in`) | `apis.conxa.in` |
| Update channel | `dev` (prerelease tags) | `stable` (promoted) |
| Billing | Cashfree `TEST` | Cashfree `PROD` |

Use the launcher (the one switch a human touches):

```bash
./scripts/conxa.sh dev studio      # or: make dev-studio
./scripts/conxa.sh dev backend     #     make dev-backend
./scripts/conxa.sh prod backend    #     make prod-backend
```

```powershell
.\scripts\conxa.ps1 dev studio      # Windows
```

Releases flow Dev → Prod by **promotion, never rebuild**: dev prerelease tags
(`app-v1.3.0-dev.1`) publish to the `dev` update channel; once validated, the
`promote-release.yml` workflow re-publishes the *exact signed artifact* to `stable`.
Full design: `docs/TRD.md` → "Dev/Prod Environment Isolation".

### Local Runtime workflow for Build Studio's "Test Skill" (Dev vs Prod)

Dev uses the **exact same code path** as Production for resolving and staging the runtime
(`resolve_runtime_dir()` + `ensure_test_sandbox()` in
`conxa-builder/python/conxa_compile/conxa_runtime.py` don't branch on Dev vs Prod at all) — the
only difference is where the bits under `deps/conxa-runtime/` and `deps/conxa-app/` came from: a
real download in Production, or a local build in Dev. One-time setup, then a rebuild after every
Runtime/App edit:

```powershell
.\scripts\conxa.ps1 dev env               # or any `dev` target — sets up path roots (see above)
.\scripts\build-runtime-local.ps1          # builds the host exe (mirrors build-runtime-host.yml)
.\scripts\build-app-local.ps1              # builds the obfuscated app layer (mirrors build-runtime-app.yml)
.\scripts\dev-studio.ps1                   # launch Build Studio Dev — Test Skill uses both immediately
```

Both scripts write straight into `<CONXA_STUDIO_HOME>\deps\conxa-runtime\<version>\` and
`...\deps\conxa-app\<version>\` — the identical location and shape a real download lands in. Test
Skill then stages that into `sandbox\.conxa\` exactly as it would for a customer, same code,
same `current` junction. Dev/Prod isolation comes entirely from `CONXA_STUDIO_HOME` pointing at
separate trees (`~/.conxa-build-studio-dev` vs `~/.conxa-build-studio`), not from any special-casing.
Each build script deletes any other version already in its `deps/` folder first, so there's always
exactly one — deterministic, and it won't quietly compete with a real download that also lands
there (e.g. from clicking "Build Installer" in the same session).

- Edited `bootstrap.js`, `version_manager.js`, `env.js` (statically bundled into the exe)? Run
  `build-runtime-local.ps1`.
- Edited `server.js`, `run.js`, `resolver.js`, `recovery.js`, or any other file loaded from disk
  at runtime? Run `build-app-local.ps1`. (It also ships an obfuscated copy of `bootstrap.js`,
  matching `build-runtime-app.yml`'s file list exactly, but that copy is never actually loaded —
  the pkg-baked one inside the exe is what runs.)

Either script alone is enough — Test Skill immediately uses the newly built piece, with the other
piece unchanged, no full rebuild needed. **Prod is completely separate**: a packaged Build Studio
install never runs these scripts — its `deps/` folders are only ever populated by real downloads.

### Dev convenience scripts

| Script | Does |
|---|---|
| `.\scripts\dev-studio.ps1` | Launch Build Studio in Dev mode (thin wrapper for `conxa.ps1 dev studio`). |
| `.\scripts\build-runtime-local.ps1` | Build the host exe locally (mirrors `build-runtime-host.yml`) and write it to `dev-runtime\`. Run after editing `bootstrap.js` or anything else statically bundled into the exe. |
| `.\scripts\build-app-local.ps1` | Build the obfuscated app layer locally (mirrors `build-runtime-app.yml`) and write it to `dev-runtime\conxa-app\<version>\` + flip `current`. Run after editing `server.js`, `run.js`, or any other disk-loaded file. |

---

## Architecture

### Record → Compile → Package

```
bridge.js (injected into every frame)
  ↓
recorder/session.py          Playwright sink; accumulates iframe offsets
  ↓  events.jsonl + screenshots + DOM snapshots
pipeline/run.py              normalise / dedupe / enrich
  ↓
compiler/build.py            compile_skill_package():
    • ElementFingerprint     role / tag / text / aria / data-testid / anchors
    • Assertion[]            url_pattern, selector_present, text_match, …
    • RecoveryBlock          anchor signals + fallback selectors
    • structural_fingerprint drift baseline for version detection
  ↓
plugin_builder.py            data-only skill package (auth files never included)
```

### Runtime — Self-Healing Recovery Cascade

For every step, tiers run in order and LLM fires only at Tier 3+ — see `docs/TRD.md` §10.1 for the authoritative tier table.

### MCP Tools (exposed to Claude)

| Tool | Description |
|------|-------------|
| `execute_skill` | Execute a workflow skill. Returns result on success, or failure data for recovery. |
| `execute_sequence` | Execute an ordered list of skills in one shared browser session. |
| `list_skills` | List all installed company workflow skills. Call once before planning. |
| `get_skill_inputs` | Return the input schema for a skill. Call before `execute_skill`. |
| `get_execution_status` | Return the status of any currently running execution. |
| `cancel_execution` | Cancel the currently running execution. Safe to call at any time. |
| `refresh_skills` | Force an immediate skill pack sync from Conxa servers. |
| `get_runtime_status` | Return runtime diagnostics: loaded packs, sync URLs, log paths. |

---

## Deployment

### Cloud backend (Render)

Root directory: `conxa-cloud/backend`. `build.sh` installs `packages/conxa-core` then `requirements.txt`; `start.sh` runs `uvicorn app.main:app`. `GET /readyz` gates deploys (DB ping); `GET /healthz` is liveness.

With `SKILL_AUTH_REQUIRED=true` the backend **refuses to start** unless `SKILL_DATABASE_URL`, Clerk issuer/JWKS, `CORS_ORIGINS`, Cashfree credentials, and at least one LLM provider key are set. No silent fallback to filesystem DB in production.

### Cloud frontend (Vercel)

Project root: `conxa-cloud/frontend`. Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `API_ORIGIN`, and `CONXA_API_PROXY_SECRET` (must match backend `SKILL_API_PROXY_SHARED_SECRET`).

### Build Studio (`.exe`) — tag `studio-v*`

Tagged `studio-v*` push triggers `build-studio.yml`: builds `conxa-core` as a wheel → PyInstaller bundles the Python backend → electron-builder wraps into NSIS installer → uploaded to GitHub Releases.

### Runtime host (`.exe`) — tag `host-v*`

Tagged `host-v*` push triggers `build-runtime-host.yml`: `@yao-pkg/pkg` bundles `runtime/server.js` into `conxa-runtime.exe` and compiles `keytar.node` against the exact Node ABI. The `host_version` is baked into `package.json` at build time. Push this tag **rarely** — only when `server.js` itself changes, the Node/pkg version bumps, or `keytar` needs a recompile.

### Runtime app layer (`.zip`) — tag `app-v*`

Tagged `app-v*` push triggers `build-runtime-app.yml`: obfuscates the business-logic JS files (`run.js`, `sync.js`, `tracker.js`, `auth_manager.js`, etc.) and zips them as `conxa-app/`. This zip ships separately from the host exe and is installed to `~/.conxa/conxa-app/` — the exe loads it from disk at runtime, so you can update logic without rebuilding the binary. Push this tag **frequently** — any time you change runtime behaviour that isn't in `server.js`.

### When to push what

| Changed files | What to ship |
|---|---|
| `conxa-cloud/backend/` | Push to Render (cloud host) |
| `conxa-cloud/frontend/` | Push to Vercel (auto-deploys on merge to `main`) |
| `runtime/server.js` | Tag `host-v*` (rebuilds the pkg binary + keytar) |
| `runtime/run.js`, `sync.js`, `tracker.js`, `auth_manager.js`, etc. | Tag `app-v*` (rebuilds obfuscated app layer only) |
| `conxa-builder/` (Electron shell, Python backend, compiler) | Tag `studio-v*` |
| `packages/conxa-core/` — models, config, db, llm | Push to Render **and** tag `studio-v*` |
| `packages/conxa-core/` — NSIS template, plugin/installer builder | Tag `studio-v*` only (cloud never builds installers) |

> **Rule of thumb:** code that runs on the *customer's machine* → runtime tags (`host-v*` or `app-v*`). Code the *SaaS vendor* uses in the desktop app → `studio-v*`. Code the *Render API* executes → push to Render. `conxa-core` is shared — check which consumers you actually changed.

---

## Key Invariants

These are non-negotiable.

- **Auth files never enter build output.** `auth/auth.json`, Playwright storageState, and credentials are local runtime state only. `plugin_builder.py` enforces this.
- **Tier 1/2 recovery costs zero LLM tokens.** LLM fires at Tier 3+ only. No silent LLM fallbacks in compiled-selector or a11y paths.
- **Iframe chain is preserved verbatim** from recording through compile through execution. Bounding boxes are page-level (offsets accumulated up the parent chain).
- **`frame_enter` / `frame_exit` steps get `no_recovery_block`.** Never retried.
- **All API routes live under `/api/v1`.** The frontend and runtime both depend on this prefix. One known exception is tracked in `TODO.md` — see `CLAUDE.md`'s Key Invariants for detail.
- **The cloud does not compile or execute.** Recording, compilation, and skill execution are local-only.

Full invariant list (10 total, including resolver/selector/host-build rules): `CLAUDE.md` → "Key Invariants".
