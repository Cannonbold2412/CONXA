# CLAUDE.md

This file is guidance for Claude Code when working in this repository.

---

## What This Is

Conxa is an AI-native automation platform. SaaS companies record browser workflows in the Build Studio (Electron + Python, Windows), compile them into structured skill packages with multi-signal element identity and self-healing recovery, publish them to the Conxa Cloud, and distribute them to end customers as `.exe` installers that run via Claude Desktop's MCP protocol. Execution is entirely local on the customer's machine — the cloud is coordination infrastructure, not an execution environment.

Three systems, three owners:

```
Company (SaaS vendor)        Conxa Cloud              Customer (end user)
─────────────────────        ───────────              ──────────────────
Build Studio (Windows)  →    Render + Vercel      →   Runtime (Claude Desktop)
Record + compile locally     Proxy / host / bill      Execute locally via MCP
```

---

## Documentation — Read First

The `docs/` folder is the authoritative source of truth for this codebase. Before making non-trivial changes, read the relevant doc rather than inferring from code alone.

| Doc | Read it when… |
|---|---|
| [`docs/TRD.md`](docs/TRD.md) | Touching the recorder, compiler, runtime, auth flows, API surface, or recovery cascade. This is the authoritative technical deep-dive: architecture, all auth flows with sequence diagrams, pipeline stages, data contracts, security model, known gaps. |
| [`docs/App-Flow.md`](docs/App-Flow.md) | Changing how a user flow works end-to-end — onboarding, record, compile, build, install, execute, update. |
| [`docs/Backend-Schema.md`](docs/Backend-Schema.md) | Changing data models, adding API endpoints, modifying KV namespaces, or changing telemetry event schemas. Contains ERD diagrams and full API contracts with request/response examples. |
| [`docs/UI-UX-Brief.md`](docs/UI-UX-Brief.md) | Changing any screen in the Build Studio or Cloud Dashboard. Documents every screen's purpose, inputs, outputs, and known UX issues. |
| [`docs/Implementation-Plan.md`](docs/Implementation-Plan.md) | Starting on a new engineering task. Contains the prioritised 4-phase roadmap with specific files to change and risk assessments per item. |
| [`docs/PRD.md`](docs/PRD.md) | Understanding product goals, personas, positioning, or long-term strategy. **Do not edit for individual features** — see doc maintenance rules below. |
| [`docs/cost_model.md`](docs/cost_model.md) | Making decisions that affect LLM usage at compile or execution time. |
| [`docs/agentic-discovery-strategy.md`](docs/agentic-discovery-strategy.md) | Understanding how multi-agent skill discovery and the durability flywheel are gated and governed. |

---

## Working Principles

1. **Think before coding.** State assumptions. If multiple interpretations exist, surface them — don't silently pick one. If a simpler approach exists, call it out. If something is unclear, stop and ask.
2. **Simplicity first.** Write the minimum code needed. No speculative abstractions, no configurability for single-use code, no handling for impossible scenarios. If 200 lines could be 50, rewrite it.
3. **Surgical changes.** Touch only what the task requires. Don't refactor unrelated code; mention issues rather than fixing them. Match existing style. Every changed line must trace to the task. If your changes leave unused code, remove only what *you* introduced.
4. **Goal-driven.** Define success → implement → verify. Bug → reproduce → fix → verify. Refactor → ensure no behavior change.

### Token and file constraints

- Don't read files larger than ~25 KB completely. Use `offset`/`limit`, or `grep`/`tail` to find the relevant chunk first.
- Session artifacts (`data/sessions/<id>/events.jsonl`, screenshots, compile reports) can be very large — always scope reads.

---

## Repository Layout

```
packages/conxa-core/        Shared Python foundation — pip package `conxa_core`
  conxa_core/               Installed by BOTH cloud backend and Build Studio
    config.py               Pydantic settings (env_prefix=SKILL_)
    db.py                   Dual store: Postgres (cloud) / filesystem (Studio) + healthcheck()
    models/                 Pydantic schemas: SkillPackage, RecordedEvent, Plugin
    storage/                JSON/SQLite stores, snapshots, plugin/installer templates
    llm/                    Router protocol + get/set_router singleton + HTTP client (call_llm)
    metrics/, progress.py, workspace.py, skill_pack_build_log.py
  pyproject.toml            Package-data: templates/bridge.js ships with pip install

conxa-builder/              Electron desktop studio — records + compiles + builds LOCALLY (Windows)
  electron/                 Electron main + React renderer (Vite + TypeScript)
  python/                   Python stdio backend (spawned by Electron; depends on conxa-core)
    backend.py              JSON-RPC dispatcher; wires cloud proxy via conxa_core.llm.set_router
    requirements.txt        playwright, Pillow, bs4, lxml  (conxa-core installed separately)
    services/               auth_service, bootstrap, llm_proxy_client, metadata_reporter
    conxa_compile/          Full local pipeline (no cloud involvement):
      recorder/             Playwright capture + injected bridge.js
      pipeline/             Normalize / dedupe / enrich recorded events
      compiler/             Events → SkillPackage (selectors, assertions, recovery, fingerprint)
        identity_bundle.py  IdentityBundle/IdentitySignal with durability scoring + orthogonality classes
        selector_grammar.py Deterministic Playwright grammar generator (internal:role/testid/text + relational)
        stable_hash.py      Dynamic-class-stripped SHA-256 hash for stable fingerprinting
        selector_filters.py Anchor quality gates: is_low_quality_anchor, ephemeral anchor filtering
        selector_score.py   Confidence scoring from IdentityBundle signal quality
        build.py            _build_intent_graph (was _llm_compile_selectors); IdentityBundle runs before _build_target
      editor/               Workflow editor service + DTOs + patch gate
      llm/                  Task clients (intent, relational vision anchor, recovery, workflow intent graph)
                            Note: LLM selector-writing passes removed — deterministic floor is sole generator
      anchors/, confidence/, policy/
      plugin_builder.py, installer_builder.py, conxa_runtime.py
  pyinstaller.spec          Bundles conxa_core + conxa_compile into dist/backend/

conxa-cloud/                Thin cloud SaaS — proxy / auth / billing / dashboard / hosting
  backend/                  FastAPI (depends on conxa-core; NO recorder/compiler/Playwright)
    app/
      main.py               Routers + fail-fast prod config validation + /healthz, /readyz
      worker.py             Render worker entrypoint (queue scaffold)
      api/                  llm_proxy, razorpay, product, publish, skillpack_update,
                            updates, tracking, run, job, plugins, security
      llm/router.py         Multi-provider pool: Groq, Google AI Studio, NVIDIA NIM
      services/             saas, rbac, llm_metering, jobs
    requirements.txt, build.sh, start.sh, Dockerfile, Aptfile, ROUTER_SETUP.md
  frontend/                 Next.js 16 dashboard (Dashboard, Plugins, Billing, Team, Settings)
    package.json            Clerk, TanStack Query, Tailwind 4, shadcn/ui, Framer Motion
  scripts/                  recompile_session.py, test_plugin.py
  tests/                    pytest suite (core + compile + cloud)
  pytest.ini                pythonpath = backend ../conxa-builder/python ../packages/conxa-core

runtime/                    Node.js MCP server — ships to ~/.conxa/ on customer machine
  bootstrap.js              Entry point loaded by host exe; enforces min_host compat; loads disk-resident app layer
  _pkg_stubs.js             Static dependency stubs bundled into host exe (makes node_modules available to app layer)
  server.js                 MCP stdio server (@modelcontextprotocol/sdk) — lives in conxa-app layer on disk
  run.js                    Step executor + GATE/VERIFY logic; delegates element resolution to resolve_adapter.js
  resolver.js               Pure, browser-independent element resolver — durability-walk + uniqueness/margin gate
  resolve_adapter.js        Browser-side adapter: pre-gathers candidate descriptors from live Playwright page for resolver.js
  recovery.js               L1 exception ladder + L2 re-hover / a11y cascade (Tier 1–2, zero LLM tokens)
  install_identity.js       Writes version.json and integrity metadata for the app layer on first install
  skill_loader.js           Skill pack loading + input validation
  browser.js                Playwright browser lifecycle
  auth_manager.js           Per-company token via keytar; AES-256-GCM session encryption
  sync.js                   Skill pack delta sync with SHA-256 atomic writes
  tracker.js                Telemetry batching → POST /tracking/{co}/events
  package.json              @yao-pkg/pkg bundles for win/mac; version = host exe version
  test/                     Unit + integration tests: test_resolver.js, test_resolve_adapter.js,
                            test_recovery.js, gate_replay.js (execution gate CI fixture)

data/                       Runtime state: sessions/, plugins/, skills/, saas/, cache/, chromium/

.github/workflows/
  build-runtime-host.yml    CI: builds host exe (--no-bytecode), tags host-vX.Y.Z releases
  build-runtime-app.yml     CI: obfuscates disk-resident app layer, tags app-vX.Y.Z releases;
                            runs gate_replay.js (real skill replay) as execution gate before publish
  build-studio.yml          CI: Electron + Python bundle

docs/
  TRD.md                    Authoritative technical deep-dive
  PRD.md                    Product strategy — vision, personas, positioning, roadmap
  App-Flow.md               End-to-end user flows with Mermaid diagrams
  Backend-Schema.md         Data models, API contracts, ERD diagrams, KV namespace map
  UI-UX-Brief.md            Every screen in Build Studio and Cloud Dashboard; UX issues
  Implementation-Plan.md    Prioritised engineering roadmap across 4 phases
  cost_model.md             Unit economics — LLM cost per compile, hosting, revenue model
  agentic-discovery-strategy.md  Durability flywheel governance — gated behind admin approval
```

---

## Common Commands

### Developer setup (first-time)

```powershell
# Windows — run once after cloning
.\scripts\setup.ps1
```

```bash
# macOS / Linux — run once after cloning
./scripts/setup.sh
```

Both scripts install: conxa-core, Build Studio Python deps, Playwright Chromium, Electron node_modules, runtime node_modules.

After setup, start the dev server:

```bash
cd conxa-builder/electron && npm run dev
```

### Cloud backend

```bash
# Install shared foundation first (editable for dev), then cloud deps
pip install -e packages/conxa-core
cd conxa-cloud/backend && pip install -r requirements.txt   # or ./build.sh (used by Render)

# Run the API server (no Playwright — cloud does not record or compile)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# start.sh runs the same without --reload, binding to $PORT

# Tests — run from conxa-cloud/
# pytest.ini puts backend, conxa-builder/python, and packages/conxa-core on the path
cd .. && pytest -q tests

# Compile tools require conxa_compile on PYTHONPATH
PYTHONPATH=../conxa-builder/python python scripts/recompile_session.py <session_id>
PYTHONPATH=../conxa-builder/python python scripts/test_plugin.py <plugin-slug> --skip-phase2 --skip-phase5
```

### Build Studio backend (local pipeline)

```bash
pip install -e packages/conxa-core
cd conxa-builder/python && pip install -r requirements.txt && python -m playwright install chromium
python backend.py   # stdio JSON-RPC backend — normally spawned by Electron, not run directly
```

### Cloud frontend

```bash
cd conxa-cloud/frontend
npm install
npm run dev       # local dev server
npm run lint      # eslint
npm run build     # production build (Vercel)
```

### Runtime (Node.js MCP)

```bash
cd runtime
npm install
npm start                     # node server.js — MCP stdio mode
npm run build:win             # @yao-pkg/pkg → dist/runtime-win.exe
npm run build:mac             # @yao-pkg/pkg → dist/runtime-mac
```

### Configuration

Copy `.env.example` → `.env`. All backend settings use the `SKILL_` env prefix — see `packages/conxa-core/conxa_core/config.py`. LLM provider keys feed the multi-provider router — see `conxa-cloud/backend/ROUTER_SETUP.md`. Groq, Google AI Studio, and NVIDIA NIM are enabled by default.

---

## Architecture

The full technical reference — pipeline stages, runtime filesystem layout, all auth flows, recovery cascade tiers, API surface, and known gaps — is in **[`docs/TRD.md`](docs/TRD.md)**. Read it before touching the recorder, compiler, or runtime.

Quick orientation:

- **Build Studio** (`conxa-builder/python/conxa_compile/`): `bridge.js` → `session.py` → `pipeline/run.py` → `compiler/build.py` → `plugin_builder.py`. All local. Cloud is not involved. Compiler now uses `IdentityBundle` as sole identity source — LLM no longer writes selector strings (only intent, vision anchors, recovery, and intent graph remain LLM-driven).
- **Cloud** (`conxa-cloud/`): coordination only — LLM proxy, skill pack hosting, telemetry ingest, billing. Does not record, compile, or execute.
- **Runtime** (`runtime/`): two-layer architecture on the customer's machine.
  - **Host exe** (`@yao-pkg/pkg`, built `--no-bytecode`): bundles `bootstrap.js` + `_pkg_stubs.js` only. Provides `__hostRequire` so disk-loaded app code can use Playwright etc. Built with `build-runtime-host.yml`, tagged `host-vX.Y.Z`.
  - **App layer** (`conxa-app/`, disk-resident at `~/.conxa/conxa-app/`): contains `server.js`, `run.js`, `resolver.js`, `resolve_adapter.js`, `recovery.js` and the rest. Obfuscated JS, independently updatable without reinstalling the host exe. `bootstrap.js` enforces `min_host` semver before loading. Built with `build-runtime-app.yml`, tagged `app-vX.Y.Z`. Atomic `.bak` rollback on failed update. Studio sandbox (`sandbox/.conxa/`) mirrors this layout for local workflow tests.

MCP tools exposed by `runtime/server.js`: `execute_skill`, `execute_sequence`, `list_skills`, `get_skill_inputs`, `get_execution_status`, `cancel_execution`, `refresh_skills`, `get_runtime_status`.

---

## Where to Look First

| Concern | Code path |
|---|---|
| Recorder event types | `conxa_compile/recorder/bridge.js` → `pipeline/` → `compiler/build.py` → `runtime/run.js` |
| IdentityBundle / signal compilation | `conxa_compile/compiler/identity_bundle.py`, `selector_grammar.py`, `stable_hash.py` |
| Selector scoring / anchor quality | `conxa_compile/compiler/selector_score.py`, `selector_filters.py` (anchor quality gates) |
| Runtime element resolution | `runtime/resolver.js` (pure, unit-testable) + `runtime/resolve_adapter.js` (Playwright adapter) |
| Runtime recovery cascade | `runtime/recovery.js` — L1 exception ladder + L2 re-hover/a11y (Tier 1–2, zero tokens) |
| Assertions / outcome validation | `conxa_compile/compiler/validation_planner.py`; runtime `verifyAssertions()` in `run.js` |
| Plugin packaging | `conxa_compile/plugin_builder.py` (data-only output, auth excluded) |
| LLM calls (compile side) | task clients in `conxa_compile/llm/` → `conxa_core.llm.get_router()` → cloud proxy |
| LLM provider pool (cloud) | `conxa-cloud/backend/app/llm/router.py` behind `POST /api/v1/llm/proxy/{text,vision}` |
| Frame / iframe handling | `docs/TRD.md` § "Iframe Pipeline"; `bridge.js`, `session.py`, `build.py`, `run.js` |
| Shared data models | `packages/conxa-core/conxa_core/models/` — SkillPackage, RecordedEvent, Plugin |
| Auth (Build Studio) | `conxa-builder/python/services/auth_service.py` — Clerk PKCE → OS keyring |
| Auth (Runtime) | `runtime/auth_manager.js` — per-company token in keytar; AES-256-GCM session |
| Auth (Cloud API) | `conxa-cloud/backend/app/api/security.py` — Clerk JWT via PyJWT + JWKS |
| Telemetry | `runtime/tracker.js` → `conxa-cloud/backend/app/api/tracking_routes.py` |
| Skill pack sync | `runtime/sync.js` ↔ `app/api/skillpack_update_routes.py` |
| Runtime two-layer bootstrap | `runtime/bootstrap.js` — min_host check, app-layer load, `.bak` fallback |
| Host / app update manifests | `conxa-cloud/backend/app/api/updates_routes.py` (manifest_version 2; deps: `conxa-runtime`, `conxa-app`) |
| Studio sandbox for workflow tests | `conxa-builder/python/conxa_compile/conxa_runtime.py` — stages host exe + app layer under `sandbox/.conxa/` |
| CI execution gate | `runtime/test/gate_replay.js` + `runtime/test/gate-skill/` — real skill replay run in `build-runtime-app.yml` |
| Frontend screens | `conxa-cloud/frontend/src/` — Dashboard, Plugins, Billing, Team, Settings |

---

## Deployment

**Cloud backend** runs on Render. Root directory: `conxa-cloud/backend`. `build.sh` installs `packages/conxa-core` then `requirements.txt`. `start.sh` runs `uvicorn app.main:app` (`init_db()` creates schema on startup). A `Dockerfile` exists (build context = repo root). `GET /readyz` gates deploys (DB ping); `GET /healthz` is liveness. With `SKILL_AUTH_REQUIRED=true` the app **refuses to start** unless `SKILL_DATABASE_URL`, Clerk issuer/JWKS, `CORS_ORIGINS`, Razorpay credentials, and at least one LLM provider key are set. No silent fallback to filesystem DB in production.

**Cloud frontend** runs on Vercel. Project root: `conxa-cloud/frontend`. Build: `npm run build`. The Next.js route handler `/api/v1/*` proxies to `API_ORIGIN`. Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

**Runtime** ships as two artifacts embedded in the NSIS installer:
- **Host exe** (`dist/runtime-win.exe`): built with `--no-bytecode` so the Playwright selector engine works. Contains only `bootstrap.js` + `_pkg_stubs.js`. Tagged `host-vX.Y.Z`. Installed to `~/.conxa/` on Windows.
- **App layer** (`conxa-app/`): obfuscated JS bundle (`server.js`, `run.js`, `resolver.js`, etc.). Tagged `app-vX.Y.Z`. Staged beside the host exe at `~/.conxa/conxa-app/`. Independently updatable via cloud; `bootstrap.js` enforces `min_host` semver before loading it, and rolls back to `.bak` on failure.

Self-updates poll `/api/v1/updates/runtime-manifest` (manifest_version 2; deps keyed `conxa-runtime` + `conxa-app`). SHA-256 integrity required for both artifacts.

---

## Key Invariants

These are non-negotiable. Do not work around them.

- **Auth files never enter build output.** `auth/auth.json`, Playwright storageState, and credentials are local runtime state only. `plugin_builder.py` enforces this — the check must remain.
- **Tier 1/2 recovery costs zero LLM tokens.** LLM fires at Tier 3+ only. Do not introduce silent LLM fallbacks into compiled-selector or a11y resolution paths. `recovery.js` implements L1/L2; `run.js` escalates to Tier 3+ only after both are exhausted.
- **Iframe chain is preserved verbatim** from recording through compile and execution. Bounding boxes are page-level (offsets accumulated up the parent chain in `session.py`).
- **`frame_enter` / `frame_exit` steps get `no_recovery_block`.** These are navigation markers, not interactable elements. They are never retried.
- **All API routes live under `/api/v1`.** The frontend and runtime both depend on this prefix. Do not route anything else there.
- **The cloud does not compile or execute.** Recording, compilation, plugin building, and skill execution are local-only. Keep them that way.
- **Host exe built `--no-bytecode`.** V8 bytecode (.jsc) masks the Node version and causes the Playwright selector engine to segfault in pkg-bundled binaries. Never re-enable bytecode for the host exe.
- **Resolver never blindly picks `candidate[0]`.** `resolver.js` requires the winning candidate's margin over the runner-up to clear `uniqueMargin` (default 0.15); otherwise it falls through to the next signal. Do not add shortcut paths that skip this gate.
- **LLM does not write selector strings.** `IdentityBundle` + `selector_grammar.py` are the sole selector generators. LLM is retained only for: per-step intent, relational vision anchors, recovery describe-then-match (Tier 3+), and the workflow intent graph.
- **App-layer min_host is enforced at load time.** `bootstrap.js` reads `version.json` from `conxa-app/` and refuses to load if `min_host` > current host semver. Do not bypass this check when bumping the app layer.

---

## Maintaining the Docs

The `docs/` files are living documentation. After making significant changes to the codebase, update the relevant doc so it stays accurate. A doc that drifts from the code is worse than no doc.

### Which doc to update after which changes

| Change type | Update |
|---|---|
| Architecture change — new system, new component, new communication path | `docs/TRD.md` |
| Auth flow change — new token type, new validation step, new storage | `docs/TRD.md` |
| New or changed API endpoint | `docs/TRD.md`, `docs/Backend-Schema.md` |
| Data model change — new field, new model, new KV namespace | `docs/Backend-Schema.md` |
| New telemetry event code | `docs/Backend-Schema.md` |
| Recovery cascade change — new tier, changed tier order or cost | `docs/TRD.md`, `docs/App-Flow.md` |
| User flow change — new screen, new step in an existing flow | `docs/App-Flow.md` |
| New screen or significant screen redesign | `docs/UI-UX-Brief.md` |
| Engineering task completed from the roadmap | `docs/Implementation-Plan.md` (mark done or update status) |
| New gap or tech debt identified | `docs/Implementation-Plan.md` |

### What does NOT require a doc update

- Bug fixes that do not change observable behavior or data contracts.
- Internal refactors that keep the same API surface and data models.
- Configuration changes, dependency version bumps.
- Test additions.

When in doubt, update the doc. A stale sentence in the TRD costs future engineers hours.

### PRD update policy

**Do not edit `docs/PRD.md` for individual features, bug fixes, or incremental improvements.**

`docs/PRD.md` is a strategic document. It reflects the company's vision, product positioning, competitive analysis, and multi-year roadmap. It should only change when something fundamentally shifts at the company level:

- A new target market or customer segment is adopted.
- The business model changes (e.g., from per-plugin to platform licensing).
- The distribution model changes significantly (e.g., moving beyond MCP).
- The core value proposition shifts (e.g., adding a cloud execution tier).
- A new phase is added to the roadmap after completing a major milestone.

For everything else — adding a feature, fixing a flow, shipping a phase — update the technical docs (`TRD.md`, `Backend-Schema.md`, `App-Flow.md`, `Implementation-Plan.md`) and leave the PRD alone.

After every prompt update the FIX.md file with a summary of the changes made, including any new features, bug fixes, or improvements. This will help keep track of the evolution of the codebase and provide context for future developers. But it should be in easy language, not technical. The goal is to make it easy for anyone to understand what has changed and why.