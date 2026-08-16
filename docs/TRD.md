# Technical Reference Document (TRD)

**Status:** Current as of 2026-07-04  
**Scope:** Conxa platform — Build Studio, Conxa Cloud, Runtime

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Conxa Build Studio](#2-conxa-build-studio)
3. [Conxa Cloud](#3-conxa-cloud)
4. [Conxa Runtime (MCP)](#4-conxa-runtime-mcp)
5. [Authentication & Platform Communication](#5-authentication--platform-communication)
6. [Recording Pipeline](#6-recording-pipeline)
7. [Compilation Pipeline](#7-compilation-pipeline)
8. [Skill Packaging Pipeline](#8-skill-packaging-pipeline)
9. [Execution Pipeline](#9-execution-pipeline)
10. [Recovery Architecture](#10-recovery-architecture)
11. [Skill Sync & Update Architecture](#11-skill-sync--update-architecture)
12. [Telemetry Architecture](#12-telemetry-architecture)
13. [LLM Router Architecture](#13-llm-router-architecture)
14. [Database & Storage Architecture](#14-database--storage-architecture)
15. [Security Model](#15-security-model)
16. [Deployment Architecture](#16-deployment-architecture)
17. [Known Gaps & Tech Debt](#17-known-gaps--tech-debt)

---

## 1. System Overview

Conxa is a three-tier platform:

```
┌─────────────────────────────────────────────────┐
│         Conxa Build Studio (Windows)            │
│  Electron app + Python stdio backend            │
│  All recording, compilation, packaging          │
│  happens 100% locally — nothing runs on cloud  │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS / Bearer JWT
                    │ (LLM proxy, publish, auth)
┌───────────────────▼─────────────────────────────┐
│           Conxa Cloud                           │
│  FastAPI (Render) + Next.js (Vercel)            │
│  LLM metering proxy, skill pack hosting,        │
│  telemetry ingestion, billing, dashboard        │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS at startup + async
                    │ (skill sync, telemetry out)
┌───────────────────▼─────────────────────────────┐
│           Conxa Runtime                         │
│  Node.js MCP server on end-user machine         │
│  Executes skills via Playwright                 │
│  Exposed to Claude Desktop as MCP tools         │
└─────────────────────────────────────────────────┘
```

**Key principle:** Execution is entirely on the end-user's machine. Conxa is
not in the execution hot path. The cloud is a coordination + telemetry layer.

---

## 2. Conxa Build Studio

### 2.1 Process Architecture

```
┌──────────────────────────────────────────────┐
│  Electron Main Process (electron/main.js)    │
│  • Window lifecycle                          │
│  • IPC bridge (electron/preload.js)          │
│  • Spawns Python backend as child process    │
│  • Deep-link auth callback handler           │
└────────────────┬─────────────────────────────┘
                 │ IPC (contextBridge)
┌────────────────▼─────────────────────────────┐
│  React Renderer (Vite + TypeScript)          │
│  electron/renderer/src/                      │
│  Pages: Dashboard, Workflows, HumanEdit,     │
│  Compile, Publish, BuildInstaller, Settings  │
│  State: Zustand (editorStore.ts)             │
└────────────────┬─────────────────────────────┘
                 │ lib/ipc.ts → window.conxa.send()
┌────────────────▼─────────────────────────────┐
│  Python Backend (python/backend.py)          │
│  stdio JSON-RPC: newline-delimited JSON      │
│  Protocol:                                   │
│    request  → {id, type, payload}            │
│    result   ← {id, type: "result", result}  │
│    error    ← {id, type: "error", code, msg}│
│    event    ← {type: "event", id, ...}       │
│  Threading: one thread per request           │
│  Async loop: background thread for Playwright│
└──────────────────────────────────────────────┘
```

Screenshots and step frames referenced by the workflow editor (`get_workflow`, and every editor mutation response) are **not** embedded in the JSON-RPC payload. `conxa_compile/editor/assets.py::asset_url()` returns a `conxa-asset://local/<relative-path>` URL (validated against `settings.data_dir`, no disk read); `electron/main.js` registers `conxa-asset` as a privileged scheme via `protocol.handle()` and streams the file from `<CONXA_STUDIO_HOME>/data` on demand when the renderer's `<img>` actually requests it. This keeps editor load/save round-trips independent of workflow size — previously every asset was read and base64-inlined synchronously on every response.

### 2.2 Python Backend Commands

The backend dispatches on `type` field. All commands are in `backend.py`:

| Command | Purpose |
|---|---|
| `ping` | Health check |
| `bootstrap` | First-run dep download (NSIS, runtime binary) |
| `login` / `logout` / `whoami` | Clerk PKCE auth |
| `start_recording` / `stop_recording` | Playwright session lifecycle |
| `get_recording_status` | Live event count |
| `run_pipeline` | Normalize raw events |
| `compile` | Full compile → SkillPackage |
| `create_workflow` / `list_workflows` / `get_workflow` / `update_workflow` / `delete_workflow` | Workflow CRUD (`update_workflow` also renames and re-groups) |
| `list_groups` / `get_group` / `create_group` / `rename_group` / `delete_group` | WorkflowGroup CRUD — see §5.2a |
| `add_group_app` / `update_group_app` / `remove_group_app` | Group's app list CRUD |
| `get_group_auth_status` / `check_group_app_auth` / `start_group_app_auth` / `finish_group_app_auth` / `cancel_group_app_auth` | Per-app auth capture and (`check_group_app_auth`) user-initiated bounded headless session-freshness recheck, one app or the whole group — see §5.2a |
| `get_skill_pack` | Get workspace's SkillPack + workflow list |
| `build_skill_package` | Build workspace-scoped skill package |
| `build_installer` | NSIS installer + cloud publish + upload |
| `test_workflow` | Local runtime test |
| `publish` | Push skill pack to cloud |
| `get_workflow` / `patch_step` / `reorder_steps` / `insert_step` / `delete_step` | Workflow editor |
| `validate_workflow` / `sign_off_workflow` | Quality gate |
| `list_skills` / `get_skill_document` / `delete_skill` / `rename_skill` | Skill library |
| `list_skill_packages` / `list_skill_package_files` | Skill pack browser |
| `list_runs` / `get_run` / `get_metrics` | Run history |
| `get_usage` | LLM proxy quota |

### 2.3 Data Directory Layout (Build Studio)

```
~/.conxa/              (or SKILL_DATA_DIR)
├── workflows/
│   └── {workflow_id}/
│       ├── workflow.json       (Workflow model)
│       └── auth/
│           └── auth.json       (Playwright storageState — NEVER in build output)
├── sessions/
│   └── {session_id}/
│       ├── events.jsonl       (raw RecordedEvent stream)
│       └── screenshots/
├── skills/
│   └── {skill_id}/
│       ├── skill.json         (SkillPackage JSON)
│       └── assets/            (screenshot thumbnails)
├── skill-packs/
│   └── {company_slug}/
│       ├── pack.json          (manifest with sync_endpoint, tracking, skill_groups — see §5.2a)
│       └── {group_id}/        (workflow's group_id, or "_default" — see §5.2a)
│           └── {skill_slug}/
│               ├── execution.json
│               ├── recovery.json
│               └── inputs.json
├── runs/
│   └── {workflow_id}.jsonl
├── cache/
│   └── sessions/              (staged auth for runtime test)
├── deps/
│   ├── nsis/makensis.exe
│   └── runtime/{ver}/conxa-runtime.exe + keytar.node + runtime-app/
└── kv/                        (filesystem fallback for DB)
```

### 2.4 Bootstrap Flow

On first launch, `services/bootstrap.py` runs `ensure_all()`:

1. Fetches `GET /api/v1/updates/deps-manifest` (public, no auth).
2. Runs `playwright install chromium` and, for every dep the manifest reports outdated (NSIS zip → `deps/nsis/`; `conxa-runtime.exe` + `keytar.node` → `deps/runtime/{ver}/`; app-layer zip → `deps/runtime/{ver}/runtime-app/`), downloads + SHA-256 verifies + extracts it — all on separate threads (`ThreadPoolExecutor`) concurrently, since each is an independent file on an independent URL. The installed-versions ledger write (`_record_installed`) is lock-protected so two concurrent installs finishing at once can't overwrite each other's ledger entry.

This is idempotent — already-present deps are skipped.

---

## 3. Conxa Cloud

### 3.1 Architecture

```
Vercel (frontend)                    Render (backend)
──────────────────                   ─────────────────────────
Next.js 16                           FastAPI + uvicorn
conxa-cloud/frontend/                conxa-cloud/backend/
                                     
/app/(marketing)/    ← public site   app/main.py
/app/(protected)/    ← dashboard     app/api/
/app/sign-in/        ← Clerk embed   app/llm/router.py
/app/api/v1/[...]/   ← proxy        app/services/
route.ts             ← proxy to      
                       API_ORIGIN    PostgreSQL (SKILL_DATABASE_URL)
```

### 3.2 API Routes

All under `/api/v1/` except health endpoints:

| Prefix | Description | Auth |
|---|---|---|
| `GET /healthz` | Liveness | Public |
| `GET /readyz` | Readiness (DB ping) | Public |
| `POST /api/v1/llm/proxy/{text,vision}` | Metered LLM proxy | Clerk JWT + X-Conxa-Client header |
| `GET /api/v1/llm/proxy/usage` | Token quota status | Clerk JWT |
| `GET /api/v1/entitlements/current` | Workspace plan, four numeric meters, and the capability ladder (distribution/white_label/ops_tier/compile_pool/byok), trial status | Clerk JWT |
| `GET /api/v1/entitlements/machines` | Registered build devices for the Settings device list | Clerk JWT, owner/admin |
| `POST /api/v1/entitlements/machines/revoke` | Revoke a device, freeing its slot | Clerk JWT, owner/admin |
| `POST /api/v1/usage/compile/reserve` | Reserve 1 fresh compile credit; also registers `X-Conxa-Machine` and checks trial expiry | Clerk JWT |
| `POST /api/v1/usage/compile/commit` | Commit a reserved compile credit | Clerk JWT |
| `POST /api/v1/usage/compile/release` | Release an uncommitted compile reservation | Clerk JWT |
| `GET \| PUT \| DELETE /api/v1/workspace/llm-key` | Enterprise BYOK (Azure OpenAI) key config — GET never returns the key | Clerk JWT, owner/admin |
| `GET /api/v1/subscriptions/plans` | Public price sheet — the four tiers, derived from `PLAN_LIMITS` so it can't drift; excludes the credit add-on | Public |
| `POST /api/v1/workflows/publish` | Skill pack publish (legacy, permanent) — **mandatory**, fails the whole publish on cloud error | Clerk JWT |
| `POST /api/v1/workflows/{installer_version}/{company_slug}/skill-packs/upload` | Skill pack publish (versioned equivalent, §17 row) — same contract/mandatory semantics | Clerk JWT |
| `GET /api/v1/workflows/{installer_version}/{company_slug}/skill-packs/versions` | Skill-pack release history (version, release notes, `is_latest`) — the Skill Pack Publishing page's changelog | Clerk JWT |
| `POST /api/v1/workflows/{slug}/installer/upload` | Upload .exe (legacy, permanent) — **optional**, failure never fails the build (only surfaced as a `cloud_upload_error` field) | Clerk JWT |
| `POST /api/v1/workflows/{installer_version}/{company_slug}/installer/upload` | Upload .exe (versioned equivalent) — same optional semantics | Clerk JWT |
| `GET /api/v1/workflows/generations` | `{current, supported, deprecated}` installer generations — Build Studio stamps `current` into new publishes/builds | Public |
| `POST /api/v1/admin/workflows/generations` | Flip the default generation stamped into new builds (never affects already-installed runtimes) | Bearer: `CONXA_ADMIN_TOKEN` |
| `GET /api/v1/installers/{slug}` | Installer download | Public if `SKILL_INSTALLER_SIGNING_KEY` unset (dev); otherwise requires `ts`+`sig` query params, HMAC-SHA256 signed, 10-min default window (SG-07) |
| `GET /api/v1/skill-packs/{co}/delta` | Runtime skill sync — per-skill delta (see below), legacy permanent route | Rate-limited; token optional |
| `GET /api/v1/workflows/{installer_version}/{company}/skill-packs/delta` | Runtime skill sync, versioned equivalent — identical contract | Rate-limited; token optional |
| `POST /api/tracking/{co}/events` | Telemetry ingest — permanent back-compat alias (also served at `/api/v1/tracking/...` and the versioned `/api/v1/workflows/{installer_version}/{co}/tracking/events`) | Package tracking token |
| `GET /api/v1/tracking/companies` | Company list — not ops_tier-gated (navigation lookup, not analytics content) | Clerk JWT |
| `GET /api/v1/tracking/{co}/runs` | Run summaries — `ops_tier` "basic"+ (§13.4) | Clerk JWT |
| `GET /api/v1/tracking/{co}/runs/{run_id}` | Run timeline — `ops_tier` "basic"+ | Clerk JWT |
| `GET /api/v1/tracking/{co}/drift` | Admin drift review queue (aggregated `repair_event`s; admin-gated, no auto-publish) — `ops_tier` "full" only | Clerk JWT |
| `GET /api/v1/tracking/dashboard?range=` | Full operations payload — adoption, reliability, health score, per-skill rollups, recovery cascade, heatmap, ROI, rule-derived insights. `range` accepts `24h`/`7d`/`30d`/`90d` — `ops_tier` "basic"+ | Clerk JWT |
| `GET /api/v1/tracking/activity` | Recent runs across every visible company for the live feed (polls independently of the dashboard aggregate) — `ops_tier` "basic"+ | Clerk JWT |
| `GET /api/v1/tracking/workflows/{co}/{slug}?range=` | Step-level drill-down for one skill — `ops_tier` "basic"+ | Clerk JWT |
| `GET \| PUT /api/v1/tracking/roi-assumptions` | Workspace ROI baseline (minutes per run, hourly rate). `PUT` is admin/owner only — `ops_tier` "basic"+ | Clerk JWT |
| `GET /api/v1/updates/deps-manifest` | Bootstrap manifest (Build Studio deps only) | Public |
| `GET /api/v1/manifest.json` | **Unified, Ed25519-signed** runtime update manifest — conxa_runtime, conxa_app, and per-skill versions, compatibility matrix, minimum versions, rollout percentages. Source of truth for `runtime/manifest_manager.js`. Served straight from `manifest` KV (signed once at publish time, not on the read path). | Public |
| `POST /api/v1/admin/component-versions/{component}` | CI (after host/app build) and `publish_routes.py` (after skill publish) write a component's version record here; recomposes + re-signs the full manifest immediately. `component` is `conxa_runtime`, `conxa_app`, or `skill_packs:{company}:{skill}`. | Bearer: `CONXA_ADMIN_TOKEN` |
| `GET /api/v1/updates/conxa-runtime-manifest` | **Deprecated** — thin shim reading the same `component_versions` KV data, kept only for runtimes that haven't picked up the manifest-driven self-updater. | Public |
| `GET /api/v1/updates/conxa-app-manifest` | **Deprecated** — same shim pattern as above. | Public |
| `GET /api/v1/updates/studio-manifest` | Studio download info | Public |
| `GET /api/v1/skill-packs/{company}/delta` | Skill-pack delta sync — `since` is a JSON map of `{skill_slug: last_known_version}`; response is `{skills: [{name, action: "update"|"no_change", group, version?, files?}]}`. Each skill is compared and shipped independently — republishing one skill never triggers a re-download of the others. `group` is the skill's `group_id` (or `"_default"`), telling the runtime which nested `skill-packs/{company}/{group}/{skill_slug}/` directory to sync into (§5.2a). Authenticated by installer-embedded sync_token. | Bearer: `pack.json.sync_token`; 401 if invalid |
| `POST /api/v1/telemetry/runtime-start` | Runtime phone-home — stores `runtime_registrations` KV entry per `(company, platform)` | Public (non-critical) |
| `GET /api/v1/telemetry/runtimes` | Runtime registration list for dashboard (active/stale, version distribution) | Clerk JWT |
| `GET /api/v1/audit-events` | Audit log for the authenticated workspace (publish, installer upload, workflow create/delete) — `ops_tier` "basic"+; export is a documented follow-up, not yet a separate endpoint | Clerk JWT |
| `POST /api/v1/subscriptions/create` | Create Cashfree subscription (`subscription_id`, `auth_link`, `plan_id`) | Clerk JWT |
| `POST /api/v1/subscriptions/webhooks/cashfree` | Cashfree webhook | Webhook secret HMAC over sorted `cf_`-prefixed fields |
| `GET /api/v1/dashboard` | Dashboard data | Clerk JWT |
| `GET /api/v1/workflows` | Workflow list + skill pack status | Clerk JWT |
| `GET /api/v1/workflows/skill-packs` | SkillPack list (dashboard) | Clerk JWT |
| `GET /api/v1/workflows/skill-packs/{company_slug}` | SkillPack detail (dashboard) | Clerk JWT |
| `GET /api/v1/jobs/{job_id}` | Job status | Clerk JWT |

### 3.3 Authentication Middleware

`app/api/security.py` — `ProductionRequestMiddleware`:

1. Attaches a request ID to every request.
2. Enforces body size limits (1MB general; 250MB for the `BUILD_ARTIFACT_UPLOAD_PATHS` set — `/api/v1/workflows/publish`, any `/installer/upload`, any `/skill-packs/upload`). A path missing from that set is silently held to the 1MB general limit, which is how versioned skill-pack publishes were being rejected until 2026-08-01.
3. When `SKILL_AUTH_REQUIRED=true`:
   - Extracts `Authorization: Bearer <token>`.
   - Verifies against Clerk JWKS (`SKILL_CLERK_JWKS_URL`).
   - Attaches `request.state.auth` with subject, org_id, claims.
4. Public paths bypass auth: health endpoints, installer downloads, update manifests (including the signed `/api/v1/manifest.json`, polled by every installed runtime before any Clerk session exists), telemetry ingest, skill-pack delta GETs.

   The **versioned** runtime endpoints nested under `/api/v1/workflows/{installer_version}/{company}/…` are exempted by *suffix*, not by prefix — `PUBLIC_VERSIONED_WORKFLOW_SUFFIXES_GET = ("/skill-packs/delta",)` and `PUBLIC_VERSIONED_WORKFLOW_SUFFIXES_POST = ("/tracking/events",)`. A blanket `/api/v1/workflows/` prefix exemption would also unauthenticate `workflow_routes.py`'s Clerk-protected dashboard endpoints (list/create/delete), which share that path segment. Both exempted sub-paths are package-token guarded in their own handlers.

### 3.4 Workspace / Principal Model

`app/services/saas.py` provides `Principal`:

```python
@dataclass(frozen=True)
class Principal:
    user_id: str
    workspace_id: str      # org_id from Clerk, or personal_<user_id>
    workspace_slug: str
    workspace_name: str
    role: str              # "owner" | "member" | "admin"
    email: str | None
    name: str | None
    auth_provider: str     # "clerk" | "local"
    identity_source: str
```

In local dev (`SKILL_AUTH_REQUIRED=false`), all requests are treated as a synthetic local principal.

**Role normalization** (`_normalize_org_role`) strips Clerk's `org:` prefix and lowercases. When a
principal has **no active Clerk org**, they are in their own personal workspace
(`personal_{user_id}`) — a workspace nobody else can reach, of which they are the sole member — so
the empty role normalizes to `"owner"`, not `"basic_member"`. Defaulting them to `basic_member`
locked every solo user out of all `require_admin` routes: publish, workflow create/delete, subscribe.
Both identity paths (trusted proxy and Clerk JWT) pass `personal_workspace=not org_id`. Tested in
`tests/test_llm_proxy_and_publish.py`.

### 3.5 Billing

Cashfree is the wired payment gateway (`app/api/cashfree_routes.py`, mounted at `/api/v1/subscriptions`; switched from Razorpay 2026-06-30). `POST /create` calls Cashfree's `POST /api/v2/subscriptions/nonSeamless/subscription` server-side and returns an `auth_link` for the frontend to redirect to; the workspace↔subscription↔tier mapping is stored server-side (`cashfree_sub_workspace` KV) since Cashfree webhooks only carry the subscription reference id. `POST /verify` fetches the subscription from Cashfree and resolves the tier from its `planId`. `POST /webhooks/cashfree` verifies the signature by sorting all `cf_`-prefixed payload fields and comparing against the shared webhook secret. Activation/charge webhooks persist `current_period_end` so paid usage windows reset on the monthly payment date. See `docs/Backend-Schema.md` §5.4 for the full request/response contracts. Stripe was previously present as orphaned unwired config fields and has since been fully removed (see §17).

---

## 4. Conxa Runtime (MCP)

### 4.1 Process Model

The runtime uses a **split architecture** — a large infrequent host binary and a small frequently-updated app layer:

```
Claude Desktop (host)
        │  MCP stdio transport
        ▼
conxa-runtime.exe  ← host layer (Node.js + all npm deps + bootstrap.js, ~85 MB, updated quarterly)
        │  loads from disk
        ▼
~/.conxa/conxa-app/server.js  ← app layer (obfuscated JS, ~60 KB zip, updated every release)
        │
        ├── @modelcontextprotocol/sdk  (bundled in host, accessed via global.__hostRequire bridge)
        ├── run.js                    (step executor)
        ├── skill_loader.js           (skill registry)
        ├── sync.js                   (skill pack sync)
        ├── auth_manager.js           (token + session management)
        ├── browser.js                (Playwright browser lifecycle)
        ├── page_scripts.js           (functions run inside the browser page — see below)
        └── tracker.js                (telemetry event emission)
```

`bootstrap.js` (bundled in host) first applies `env.js`, which normalizes the install, data, app, API, and update-channel paths for every subsequently loaded module. The `register-mcp` and `unregister-mcp` host-layer commands then exit before any app-layer work. For a normal MCP launch, bootstrap fetches and verifies the signed manifest and may activate a compatible app-layer update; it then resolves `conxa-app/current` (a directory junction — see §4.4) via `version_manager.resolveCurrent()`, checks that version's `version.json` for `min_host` compatibility, and loads its `server.js`. On failure, it calls `version_manager.rollback()` to flip `current` back to the previously-retained version and retries — no re-download needed, since old versions are never deleted until pruned by retention. App-layer files are obfuscated JS (self-defending, string-array rc4) — not human-readable on disk, but no V8 bytecode dependency on the host's exact Node build.

`page_scripts.js` is the one app-layer file obfuscated **without** `--self-defending`/`--string-array` (mangled identifiers only). Every function it exports is one Playwright ships into the browser page via `page.evaluate()`/`locator.evaluate()` (`Function.prototype.toString()`, re-parsed and run outside this Node process). Both of those transforms rewrite a function body to call back into a module-scope decoder/self-defending guard — invisible once the source is re-parsed in the browser realm, so a full-strength build throws `ReferenceError: <mangled-name> is not defined` at the first evaluate() call that runs (silent for evaluate() sites wrapped in try/catch, fatal for `run.js`'s scroll handler, which is not). `run.js`, `server.js`, `resolve_adapter.js`, and `drift.js` call into `page_scripts.js` rather than defining browser-context functions inline — keep it that way; a new inline arrow passed to `page.evaluate()`/`locator.evaluate()` anywhere else in the app layer will reproduce this bug.

> **Why not bytecode?** `@yao-pkg/pkg` embeds its own prebuilt Node24 base, whose V8 build differs from official nodejs.org Node 24.x. `bytenode`'s `fixBytecode` overwrites the header bytes that reveal the mismatch, so `cachedDataRejected` never fires — but the deserialization segfaults silently (0xC0000005, no stderr). Obfuscated plain JS eliminates this coupling permanently.

### 4.2 MCP Tools

Defined in `server.js` `_toolDefinitions()`:

| Tool | Description |
|---|---|
| `list_skills` | List installed skills, optionally filtered by company |
| `execute_skill` | Execute a single workflow skill |
| `execute_sequence` | Execute an ordered list of skills in one browser session |
| `get_skill_inputs` | Return input schema for a skill |
| `get_execution_status` | Status of current execution |
| `cancel_execution` | Stop the running execution |
| `refresh_skills` | Force immediate skill pack sync |
| `get_runtime_status` | Runtime diagnostics (non-mutating) |

### 4.2a MCP Registration (`register-mcp` / `unregister-mcp`)

`conxa-runtime.exe register-mcp` / `unregister-mcp` are **host-exe-layer subcommands**, dispatched in `bootstrap.js` immediately after `env.apply()` — before `version_manager.resolveCurrent()`/the app-layer load, so they work even when no app layer is staged yet (a thin installer ships one before the first app-layer download) and regardless of the app layer's `min_host` check. NSIS calls the subcommand directly (`ExecWait '... register-mcp'`); no config-editing logic lives in the installer template itself.

Files (all host-layer, bundled into the exe via `bootstrap.js`'s static `require()`s — no `pkg.scripts` entry needed for a statically-required path):

| File | Role |
|---|---|
| `mcp_hosts.js` | Data table of JSON-configured hosts (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Cline, Zed, Copilot CLI, Factory, KiloCode, Antigravity, OpenCode, OpenClaw, Crush, OpenHands, Augment, Kiro, Junie, Qwen). One row per host: `detect(ctx)`, `configPaths(ctx)` (plural — VS Code writes one file per profile, Cline writes two locations), `objectPath`, `shape`. |
| `mcp_hosts_toml.js` | Codex CLI, Mistral Vibe (TOML — `# >>> conxa:<label> >>>` managed marker blocks, no TOML parser dependency). |
| `mcp_hosts_yaml.js` | Goose, Hermes (YAML — `yaml` package's Document API, comment-preserving). |
| `config_edit.js` | JSON/JSONC writer (`jsonc-parser`, so comments/formatting survive on every host, not just the hand-edited ones). Atomic write (temp file, `fsync`, `rename`), ownership check (`isOwned()` — an existing entry is "ours" only if its `command` resolves inside our install root), and a read-immediately-before-write CAS check against a concurrent writer. |
| `config_edit_toml.js` | Marker-block editor for the two TOML hosts. A regular table (`[mcp_servers.conxa]`, Codex) can exist only once — TOML rejects a duplicate definition — so a second one outside our span is treated as foreign; an array-of-tables (`[[mcp_servers]]`, Vibe) legitimately repeats once per server, so the only real conflict is another entry whose own `name` already claims our key. |
| `config_edit_yaml.js` | Document-API editor for the two YAML hosts; no marker needed (YAML mappings hold sibling keys natively, same as the JSON hosts). |
| `mcp_register.js` | Orchestrator: `computeIdentity()` derives the entry key (`conxa` vs `conxa-dev`, from `env.js`'s `dev` flag — see §5.8-adjacent env resolution) and the stable `conxa-runtime/current/conxa-runtime.exe` command path; iterates all three host tables; never aborts the run because one host failed; writes a diagnostic status file (below); sets `process.exitCode` non-zero only if *every detected* host failed. |
| `durable_context.js` | Post-sync discoverability: writes a per-company skill/instructions file (`SKILL.md`, `AGENTS.md`, `global_rules.md`, …) into each *registered* host so the agent actually reaches for the tools. Called from `sync.js` right after `pack.skills` is written — **not** from `register-mcp`, because a thin installer ships `pack.skills` empty (§5.9); there is nothing real to name until the first successful delta-sync. Best-effort; never fails the sync. |

**Ownership is structural, not a hardcoded string.** Because `register-mcp` and `unregister-mcp` derive the entry key from the *same* `env.js` resolution every time, a dev-channel install and a stable-channel install on the same machine write to two distinct keys (`conxa-dev` / `conxa`) that can never drift apart — this replaces an earlier NSIS-generated-PowerShell design where the uninstaller's key was a separate hardcoded literal that fell out of sync with the installer's channel-derived key, leaving a dangling entry behind on dev-channel uninstalls.

`register-mcp --plan` performs every detection/ownership check and prints the machine-readable receipt (what would be written, where) without touching any file — no network, no mutation. `--dry-run` is the same without the JSON dump. `--only <id>[,<id>]` restricts the run to specific host ids.

Every run writes `<CONXA_DIR>\mcp-register-status.txt`: a one-line summary (`conxa register-mcp: 15 ok, 3 not installed, 1 left alone (not ours), 1 FAILED`) followed by per-host detail. NSIS reads the first line into its completion `MessageBox` — this is necessary, not cosmetic: the process exit code is only nonzero when *every* detected host fails, so a partial failure (14 hosts registered, 1 didn't) would otherwise show "Setup complete!" with no indication anything went wrong.

Tests: `runtime/test/test_config_edit.js`, `test_config_edit_toml.js`, `test_config_edit_yaml.js`, `test_mcp_hosts.js`, `test_mcp_register.js`, `test_mcp_register_toml.js`, `test_mcp_register_yaml.js`, `test_durable_context.js` — fixture-driven (`os.tmpdir()` + `USERPROFILE`/`HOME`/`APPDATA`/`LOCALAPPDATA` env overrides so `os.homedir()`-based host detection never touches the real machine running the test). Run via `npm test` (`node --test`, no path argument — an explicit `test/` path argument does not reliably resolve as a directory glob in every environment).

### 4.3 Startup Sequence

```mermaid
sequenceDiagram
    participant CD as Claude Desktop
    participant RT as bootstrap.js (host)
    participant App as conxa-app/server.js
    participant Cloud as Conxa Cloud

    CD->>RT: spawn conxa-runtime/current/conxa-runtime.exe (MCP stdio)
    RT->>RT: env.apply() → normalize CONXA_DIR, CONXA_DATA_DIR, CONXA_APP_DIR, API URL, channel
    alt register-mcp or unregister-mcp
        RT->>RT: run host-layer command and exit
    else normal MCP launch
    RT->>Cloud: GET /api/v1/manifest.json (no local TTL — every launch fetches; Ed25519-verified against baked-in public key)
    Cloud-->>RT: {conxa_runtime, conxa_app, skill_packs, minimum_versions, signature}
    RT->>RT: manifest_manager.checkForUpdates(components: ["conxa_app"]) — version, min_host, rollout %, min_versions
    RT->>RT: if conxa_app newer → download zip (tight retry budget), verify SHA-256, extract to conxa-app/<version>/, activate()
    Note over RT: pre-load — server.js is NOT require()'d yet, so this activation is live for THIS launch
    RT->>RT: version_manager.resolveCurrent(conxa-app) again → check min_host compatibility
    RT->>App: require conxa-app/current/server.js (or rollback to previous version)
    App->>App: read normalized paths; configure Playwright and handle app-layer CLI flags
    App->>App: load skill index from cache (SKILL_PACKS_DIR)
    App->>CD: MCP connect (StdioServerTransport)
    par Startup sync (parallel)
        App->>App: manifest_manager.checkForUpdates(components: ["conxa_runtime"]) — reuses the manifest bootstrap.js already fetched
        App->>Cloud: if conxa_runtime newer → download files, --selfcheck the new exe, activate() (never touches the running process's own file; effective next cold start)
        and
        App->>Cloud: GET /skill-packs/{co}/delta?since={per-skill version map} (skipped if synced <5min ago)
        Cloud-->>App: {skills: [{name, action, version?, files?}]}
        App->>App: per changed skill → parallel file downloads → write to <skill>/<version>/ → activate()
        and
        App->>App: re-encrypt plaintext session files (best effort)
    end
    App->>App: syncState.complete = true; reload skill index
    App->>CD: sendToolListChanged()
    App->>Cloud: POST /api/v1/telemetry/runtime-start (fire-and-forget)
    end
```

**Execution gate:** `execute_skill` awaits `startupSync` before running. Both skill-pack sync and the conxa_runtime manifest check must complete (or fail gracefully) before any workflow executes. On a normal connection this resolves in under 1 second. Failures fall through to cached data — the user is never permanently blocked. Manifest signature failures are treated identically to network failures: the last previously-verified cached manifest is used, or the check is skipped entirely on first run.

**Pre-load app update budget:** the `conxa_app` leg above runs before the MCP transport connects, so it's bounded tightly — 3s manifest fetch timeout, 2 retries × 5s for the ~60 KB app zip. Any failure (network, bad signature, download, decode) is caught and swallowed; bootstrap.js falls through to whatever `current` already points at, exactly as if the check never ran. Typical added latency: well under a second when no update is pending, a few seconds when one downloads.

### 4.4 Skill Pack Directory Layout (Runtime)

Every updateable component — the host exe, the app layer, and each individual skill —
is a **versioned directory** with a `current` directory junction pointing at the active
version (see `runtime/version_manager.js`). Old versions are retained (default: current +
2 previous) so rollback never needs a re-download; junctions are used (not JSON pointer
files) because Claude Desktop's MCP config stores a literal filesystem path to the host
exe, which only the OS itself can resolve transparently — a junction is the one mechanism
that works without requiring admin rights or Developer Mode.

```
~/.conxa/                       (CONXA_DIR)
├── conxa-runtime/
│   ├── v1.0.0/, v1.1.0/         (each: conxa-runtime.exe, keytar.node, version.json)
│   └── current                 (directory junction → the active version)
├── conxa-app/                  (app layer — checked and activated pre-load in bootstrap.js,
│                                 effective on the SAME cold start it downloads in)
│   ├── v1.0.0/, v1.1.0/         (each: server.js, sync.js, run.js, browser.js,
│   │                             auth_manager.js, tracker.js, skill_loader.js,
│   │                             install_identity.js, version_manager.js,
│   │                             manifest_manager.js, page_scripts.js, version.json)
│   └── current                 (directory junction → the active version)
├── manifest.json                (locally cached copy of the last Ed25519-verified signed manifest)
├── chromium/                   (Playwright browser — unversioned, external)
├── skill-packs/
│   └── {company}/
│       ├── pack.json           (company metadata: sync_endpoint, sync_token, groups[],
│       │                        skill_groups {slug: group_id} — see §5.2a)
│       └── {group_id}/         (workflow's group_id, or "_default" — see §5.2a)
│           └── {skill_slug}/
│               ├── v1.0.0/, v1.1.0/  (each: execution.json, recovery.json, inputs.json,
│               │                      manifest.json [carries group_id], validation.json, version.json)
│               └── current           (directory junction, independent per skill)
└── logs/
    ├── runtime.log             (JSONL, rotated at 10MB)
    └── recovery.log            (recovery event log, rotated at 10MB)

%APPDATA%/Conxa/               (CONXA_DATA_DIR)
├── cache/
│   ├── sessions/
│   │   ├── {co}_state.json             (AES-256-GCM encrypted storageState — legacy single-session pack)
│   │   ├── {co}_raw_state.json         (plaintext fallback — legacy single-session pack)
│   │   ├── {co}__{appId}_state.json    (per-app, for a pack.json with a `groups` block — see §5.2a)
│   │   ├── {co}__{appId}_raw_state.json
│   │   └── {co}_auth_meta.json
│   └── manifests.json                  (skill index fast-load cache)
└── data/
    ├── executions/{id}/
    │   ├── state.json
    │   └── checkpoint.json
    └── runs/{workflow_id}.jsonl
```

---

## 5. Authentication & Platform Communication

### 5.1 Authentication Systems Summary

| System | Auth Mechanism | Token Storage | Identity Provider |
|---|---|---|---|
| Build Studio | Clerk PKCE OAuth | OS keyring (`keyring` lib) | Clerk (clerk.conxa.in) |
| Cloud (API) | Clerk JWT verification | N/A (stateless) | Clerk JWKS |
| Cloud (Frontend) | Clerk Next.js SDK | Clerk session cookie | Clerk |
| Runtime | Per-company opaque token | OS keychain (`keytar`) | Conxa Cloud (POST /auth/refresh) |

### 5.2 Build Studio Login Flow

```mermaid
sequenceDiagram
    participant User
    participant Studio as Build Studio (Renderer)
    participant Backend as Python Backend
    participant Browser as System Browser
    participant Clerk as clerk.conxa.in
    participant Cloud as Conxa Cloud

    User->>Studio: Click "Sign In"
    Studio->>Backend: {type: "login"}
    Backend->>Backend: generate PKCE verifier + challenge
    Backend->>Backend: start localhost HTTP server on port 52741
    Backend->>Browser: open authorize URL (Clerk PKCE)
    Browser->>Clerk: GET /oauth/authorize?code_challenge=...
    User->>Clerk: complete login in browser
    Clerk->>Browser: redirect to http://127.0.0.1:52741/cb?code=...
    Browser->>Backend: GET /cb?code=...&state=...
    Backend->>Clerk: POST /oauth/token (code + verifier)
    Clerk-->>Backend: {access_token, refresh_token, expires_in}
    Backend->>Clerk: GET /oauth/userinfo (Bearer access_token)
    Clerk-->>Backend: {sub, email, name, org_id}
    Backend->>Backend: store tokens in OS keyring (service="conxa-studio")
    Backend-->>Studio: {type: "result", result: {org_id, user_id, name, email}}
    Studio->>Studio: update AuthContext, show dashboard
```

**Token lifecycle:** Tokens are refreshed transparently in `auth_service.get_token()` when within 60 seconds of expiry using the stored `refresh_token`. Stored in OS credential manager (Windows Credential Manager / macOS Keychain / Linux Secret Service via the `keyring` Python library).

### 5.2a Workflow Groups: Shared Multi-App Authentication

A **WorkflowGroup** (`conxa_core.models.workflow.WorkflowGroup`, `conxa_core/storage/group_store.py`) is a business-domain folder — "Sales", "Marketing" — that owns both a set of Workflows and the target-platform applications those workflows sign in to (`GroupApp`: name, `login_url`, `success_url`, captured session path). Every workflow belongs to exactly one group (`Workflow.group_id`); a workspace's `Default` group catches workflows that were never explicitly grouped, including ones migrated from before this model existed (`workflow_store._migrate_workspace` assigns `group_id` on read if missing). Auth is captured **once per app, at the group level** — the old per-workflow `Workflow.auth`/`WorkflowAuth` field and its Record Login dialog are gone.

**Setup (Build Studio):** `cmd_start_group_app_auth` launches the existing recorder in `auth_mode` at the app's `login_url`, passing `wait_for_url=app.success_url` — the recorder's `RecordingSession.wait_for_url`/`reached_wait_url` fields (previously unused by any caller) self-detect success and the renderer polls `get_recording_status` (1s) to auto-close and advance to the next app, mirroring the "authenticate once → organize by group → run seamlessly" flow. `cmd_finish_group_app_auth` persists the captured state to `data/groups/{group_id}/auth/{app_id}.json` and flips every workflow in the group to `status=ready` once all its apps are authenticated.

**Recording a workflow:** `cmd_start_recording` merges every authenticated app's storageState in the workflow's group (`conxa_core.storage.storage_state.merge_storage_states` — cookie union, per-origin localStorage merge, later wins on key conflicts) into one seeded Playwright context, so a recording that crosses N apps starts already signed in to all of them.

**Success-URL wildcard:** `success_url` may contain a literal `{}` as a wildcard for "anything after this point" (e.g. `vercel.com/{}` matches any path under `vercel.com/`); `conxa_compile.recorder.session.url_matches_pattern(url, pattern, exclude_prefix="")` is the single matcher shared by login self-detection (`RecordingSession._url_matches_wait_target`, which excludes variants of the login page itself via `exclude_prefix`) and the session-freshness probe below.

**Session freshness (2026-08-15, extended 2026-08-16):** `captured_at` alone only proves an app was *once* authenticated — it never expires or re-verifies. `check_app_session_sync(app)` (same module) does a short-lived **headless** probe: loads `app.storage_state_path` into a throwaway `headless=True` context, navigates to the success-URL prefix (or `login_url` if no `success_url` is set), and classifies the landed URL as `"ready"` (matches the success pattern), `"expired"` (bounced back to the login page, or the saved state file is missing/corrupt), or — on any navigation error/timeout — falls back to `"ready"` rather than falsely flagging a flaky probe as expired. Every call site that gets a verdict from this probe now stamps `GroupApp.checked_at` via `set_group_app_checked` (`group_store.py`) — distinct from `captured_at` ("a session file exists") — so `group_auth_status` can report a `verified` flag (`checked_at` set and within a 600s TTL) alongside the cheap `state` field, instead of letting a `ready` badge silently mean "never actually tested." `group_auth_status(group)` (`handlers/groups.py`) itself stays cheap and read-only, called on every normal page load (`cmd_get_group_auth_status`, `cmd_list_groups`, `cmd_get_group`); a real probe only ever runs from `cmd_start_recording` (right before a recording starts, not on group-page open — an earlier version that probed on every page open had no per-step timeout and could wedge the backend, see `FIX.md` 2026-08-15) or from the user-initiated `cmd_check_group_app_auth` ("Check now" per app, or the whole group at once, on the Group page). An app the probe finds expired gets `last_error` set via `set_group_app_checked`, which flips its row from the ready-green treatment to a red "expired" state with a Reconnect button in the same `group_auth_status` response the group page already polls.

**Per-workflow recording gate + session write-back (2026-08-16):** `cmd_start_recording` no longer requires every app in the group to be connected before a workflow can be recorded — it narrows the group's apps down to `apps_for_workflow(group.apps, workflow.target_url, workflow.protected_url)` (`conxa_core.storage.group_store`, hostname-matched against each app's `login_url`/`success_url`, shared with the build-time `required_apps` computation below so the two can't disagree) and only *requires* those before recording can start. It still *probes* every captured app in the group (skipping any checked within the last 600s, via `checked_at`) — not just the required subset — because recording seeds every captured app's session into the browser (below), so a sibling app being dead at record time is a real, silent risk even though it isn't gated on. An expired required app blocks recording with `auth_required`; an expired sibling only warns (surfaced in the `cmd_start_recording` response's `warnings` field) since the user is present in the recorder window and can sign back in inline if that app actually comes up. Recording also stops discarding the session it was seeded with: `storage_state_autosave_path` is now the same `merged_group_state.json` the recorder was seeded from (previously left unset). **Authentication is pre-flight-only (2026-08-17):** this save happens exactly once, at recording teardown (`force=True`) — never on a repeating timer during the recording. An earlier version of this feature autosaved on a throttled 6s timer during recording, which turned out to reproduce, for ordinary workflow recording, the same visible browser-window flicker already diagnosed and fixed for auth-mode recording (`context.storage_state()` is a heavy, all-at-once CDP call; see `_autosave_storage_state_sync`'s comment in `recorder/session.py`). Recording never re-checks a required app's session mid-recording either — the pre-flight gate above is the only auth check; if a site logs the user out partway through, its own login page simply appears in the recorder window like any other page, and the human signs back in inline, same as before this feature existed. When the recording stops or is cancelled, `_refresh_group_app_sessions(workflow_id)` (`handlers/session.py`) reads that merged file and, for each app in the group that already has a saved session, derives its refreshed slice via `conxa_core.storage.storage_state.refresh_app_state` — keeping only the cookie domains/localStorage origins that app already owned, so a sibling app's cookies from the same merged context never bleed across — and writes it back to that app's `storage_state_path` via `set_group_app_auth` (bumping `captured_at` and `checked_at` — a just-completed login is inherently verified — clearing `last_error`). This is what makes routine cookie rotation, refresh-token renewal, or a user manually re-authenticating mid-recording actually stick instead of being thrown away the moment the recorder closes. If `apps_for_workflow` matches none of the group's apps (a workflow whose login happens on a different host than its target, the common single-sign-on shape), recording is **not** blocked — it warns instead (`auth_scope_warning` in the `cmd_start_recording` response's `warnings` field), since forcing a confirmation here would also block every genuinely-no-login-needed workflow in the same group.

**Group summary (`cmd_list_groups`):** each row carries `{id, slug, name, workflow_count, stages, workflow_preview, apps_total, apps_authenticated, ready, created_at, updated_at}`. `stages` is a `{stage: count}` map over `derive_workflow_stage` (keys present only for non-empty stages) and `workflow_preview` is the first `WORKFLOW_PREVIEW_LIMIT` (3) workflows as `{id, name, stage}`. Both are derived from the workflow list the handler already loads — no extra I/O — and exist so the Workflows page can draw each group as a folder showing its contents and lifecycle mix (see `docs/UI-UX-Brief.md` §2.3).

**Compiled pack contract:** `pack.json` gains a `groups` array (`[{id, name, apps: [{id, name, login_url, success_url}]}]`); each skill's `manifest.json` gains `group_id` and `required_apps` (`[app_id, ...]`, see below). A pack with no `groups` key is untouched — it's the pre-Groups format and takes the legacy single-session path everywhere below.

**On-disk skill layout:** `pack.json` also gains a `skill_groups` field (`{skill_slug: group_id}`, distinct from `groups` above — `groups` is auth-app metadata, `skill_groups` is the path index) and each skill's directory nests under its `group_id` (or the sentinel `"_default"` when a workflow's `group_id` is empty) — `skill-packs/{company}/{group_id}/{skill_slug}/`, both in Build Studio's local build output and on the real runtime after sync. The delta-sync response's per-skill entries (§11.1) also carry a `"group"` field so `runtime/sync.js` knows which nested path to write into; its version-comparison lookup only ever consults the nested path, so a skill previously synced under the pre-nesting flat layout (`skill-packs/{company}/{skill_slug}/`) is treated as never-synced and freshly redownloaded into its nested location on the runtime's next sync — a one-time, self-healing migration with no separate migration pass. The cloud's `_build_delta` (`skillpack_update_routes.py`) mirrors this on its own storage: if a company's files still sit at the old flat cloud-storage path (published before this nested-path support existed), it serves from there while still reporting the resolved `group_id`, so already-published companies keep syncing without needing to republish.

**Per-workflow app scoping (`required_apps`, 2026-08-16):** a group's apps only *gate* the specific workflows that actually use them, computed from `target_url`/`protected_url` **and** every hostname the recording actually visited. `SkillMeta.visited_hosts` (`conxa_core.models.skill_spec`) is populated at compile time by `compiler/build.py::_extract_visited_hosts` from every recorded event's `page.url`/`tab.url` — so a workflow that *starts* in one app but clicks through to a sibling app mid-recording (a link-out, not a planned navigation) still gates on both apps at execution time, not just the one its start URL happens to resolve to. `skill_package_builder.py` calls the same `apps_for_workflow` helper the recording gate above uses (`conxa_core.storage.group_store`, which accepts bare hostnames as well as full URLs) against `target_url`, `protected_url`, and `visited_hosts` together, and writes the matching app ids into that skill's `manifest.json.required_apps`. A workflow that never navigates to any of its group's apps (e.g. a "Sales" group holding both a Salesforce workflow and an unrelated one-off scrape of a public site) gets `required_apps: []` and runs with no group auth gate at all. Skills compiled before `visited_hosts` existed have an empty list and fall back to today's start-URL-only matching; manifests built before `required_apps` existed have no key at all, which the runtime treats as "gate on every app in the group" — both fully backward compatible, no republish required to keep working.

**Runtime resolution (`runtime/browser.js`):** `getAuthContext(company, authManager, {groupId, requiredAppIds})` calls `_resolveGroup(company, groupId)` against `pack.json`; if the pack has a matching group, `getGroupAuthContext` validates **every** app in the group (not just the required ones), then narrows the *gate* to `requiredAppIds` (via `_filterRequiredApps`, unit-tested in `runtime/test/test_group_required_apps.js` — `undefined` means every app, matching a pre-`required_apps` manifest) but *seeds* the merged context from every app that validated, mirroring the recording gate's "seed all, require only what's needed" split above — a workflow that wanders into a sibling app it wasn't gated on still arrives signed in rather than hitting a login wall. Sessions are keyed `${company}__${appId}` (same encrypt/raw/keytar machinery as the single-session path in `auth_manager.js` — every function there already takes the session key as its first argument, so this is purely a call-site convention) and merged via `mergeStorageStates` (JS twin of the Python function above). `server.js` passes `requiredAppIds` — for `execute_sequence`, the **union** of every resolved skill's `required_apps` (2026-08-17; a sequence shares one browser/context for its whole run, so gating only on the first skill left skill 2..N's required apps undiscovered until they broke mid-sequence; `undefined` on any one skill's manifest still falls the whole union back to "gate on every app," the same safe legacy meaning) — into `getCachedBrowser`, which folds the (sorted) app-id set into its browser cache key so two skills in the same group that need different app subsets never share a cached context. `getCachedBrowser`'s reuse window is intentionally short (90s, not the 5 minutes it used to be) — a cache hit skips re-validating the underlying session entirely, so keeping it short bounds how long a session that expired while cached goes undetected. If the narrowed required list is empty, the skill runs immediately with a fresh, empty-state context — no login window, no gate (still seeded from every other valid app, in case it wanders into one anyway). Otherwise, **every** missing/expired required app opens its own non-blocking login window at once (2026-08-16 — previously one at a time, costing N interrupted runs for N expired apps), with one message naming all of them:

> This workflow belongs to the Sales group and requires authentication to 5 applications. Sign in to Salesforce, Billing, Reports in the windows that just opened, then run the skill again.

(The app count and names in that message reflect only the workflow's required apps, not the group's full app list.) A single re-run of `execute_skill` proceeds once every *required* app is authenticated — the same request/response shape MCP already uses for the single-app case, so this ships to Claude Desktop with no new interaction primitive.

**Authentication is pre-flight-only (2026-08-17) — mid-execution auth failures never open a window.** `run.js`'s `isAuthFailure` short-circuits straight to failure on a login redirect, before the normal recovery cascade even runs (a login redirect is an auth condition, not a selector/DOM problem — no retry, no wait). `captureReAuth` (`browser.js`) still resolves *which* app died — by the **failing page's own URL** (passed by `server.js`, ahead of `manifest.target_url`, since a group pack's `target_url` is the app the workflow *starts* in, the wrong app when a sibling's session is the one that actually died mid-run), falling back to `opts.fallbackUrl` (`manifest.target_url`) if the failing page's host matches no app in the group, then to `group.apps[0]` as a last resort, logging `reauth_app_resolved` with which of the three paths fired — but it only builds a clear, app-named failure message now; it no longer calls `beginInteractiveAuth`. The run fails immediately. Re-authentication happens on the user's **next** `execute_skill` call, via the same pre-flight gate described above, which re-validates this exact app and opens its login window then — not at the moment of the mid-run failure. (Earlier behavior opened a headed re-auth window automatically, right at the moment of failure, which the run had already ended by; that interrupted an already-dead run instead of waiting for a fresh attempt, the mid-run twin of the recording-side flicker bug above — both traced back to authentication being handled reactively mid-operation instead of purely pre-flight.) A dormant blocking mid-run re-login path, `auth_manager.js`'s old `refreshSession`, was removed in the same pass — it had no production callers and would have directly violated this model if anything had ever called it.

### 5.3 Cloud API Authentication

Every protected API call from the Build Studio:
1. Calls `auth_service.get_token()` — returns a valid Clerk `access_token`.
2. Sets `Authorization: Bearer <token>` header.
3. Cloud middleware (`ProductionRequestMiddleware`) verifies JWT via PyJWT + JWKS.
4. Attaches `request.state.auth` with `subject`, `org_id`, `claims`.
5. `principal_from_request()` in `saas.py` constructs a `Principal` object for RBAC.

### 5.4 Runtime Sync Token (per-company, installer-embedded)

The runtime uses an **installer-embedded sync token** for all Conxa Cloud communication (skill-pack delta fetches). End users never interact with Conxa auth — they only log into their own target platform.

#### 5.4.1 Token lifecycle

The sync token is a `secrets.token_urlsafe(32)` string minted **at publish time** and stored server-side in the `sync_tokens` KV namespace keyed by company slug. It is stable across republishes (reused if present) and can be rotated by deleting the KV entry.

**Publish → installer flow:**

```
Build Studio publishes skill pack (Publish Skill Package — mandatory, primary action)
  → POST /api/v1/workflows/publish (legacy) or /api/v1/workflows/{installer_version}/{slug}/skill-packs/upload (versioned)
  → cloud mints sync_token (publish_routes._sync_token())
  → sync_token + installer_version written into cloud-side pack.json
  → publish response returns sync_token
  → Build Studio writes sync_token into local pack.json (backend.py)
  → installer_builder stages pack.json verbatim into NSIS — no skill file trees
  → installer ships ONLY pack.json to $PROFILE\.conxa\skill-packs\{company}\
  → runtime's first delta-sync (sync.js) downloads every skill and creates each
    skill's `current` junction — exactly as it does for every later update
```

`installer_builder.py` guards that `pack.json` has `sync_token` before staging — build fails fast if the pack was never published. Build Installer (§UI-UX-Brief.md §2.10) is now a secondary, advanced action layered on top of this — it enforces the same guard (`skill_pack_not_published`) before packaging.

#### 5.4.2 Runtime sync

On every cold start, `sync.js:_doSync()` reads `pack.sync_token` directly from the on-disk `pack.json` and sends it as `Authorization: Bearer` to the delta endpoint. No keytar lookup, no user login.

```mermaid
sequenceDiagram
    participant RT as Runtime (server.js)
    participant S as sync.js
    participant Cloud as Conxa Cloud

    Note over RT: Cold start
    RT->>S: syncSkillPacks(SKILL_PACKS_DIR)
    S->>S: read pack.json → sync_token
    S->>Cloud: GET /api/v1/skill-packs/{company}/delta?since=... (Bearer: sync_token)
    Cloud->>Cloud: compare_digest(stored_sync_token, token)
    Cloud-->>S: delta files (or 200 up-to-date / 401 invalid token)
    S->>S: atomic write + SHA-256 verify updated files
```

`GET /api/v1/skill-packs/{company}/delta` is in `PUBLIC_SKILL_PACK_SYNC_PREFIXES` so middleware does not apply — the handler validates the sync token directly. In local dev (`SKILL_AUTH_REQUIRED=false`) validation is skipped.

#### 5.4.3 Session encryption (per-machine key)

When executing a skill the runtime loads the target-platform Playwright `storageState` (browser cookies/localStorage). It is encrypted at rest with AES-256-GCM using a **per-machine** key derived via HKDF (`auth_manager.js:_deriveKey()`). The key is a 32-byte random value generated on first use per company and stored in the OS keychain via keytar (service `conxa-session`).

This decouples session encryption from the sync token: a leaked installer exposes the sync token (granting read-only access to that company's skill packs) but **cannot decrypt any user's session file** since the encryption key is machine-specific.

### 5.5 Skill Publishing Flow

```mermaid
sequenceDiagram
    participant Studio as Build Studio
    participant Backend as Python Backend
    participant Cloud as Conxa Cloud

    Note over Studio: After build_installer command
    Backend->>Backend: read skill-packs/{slug}/pack.json
    Backend->>Backend: collect all files as base64
    Backend->>Cloud: POST /api/v1/workflows/publish
    Note over Backend,Cloud: Bearer Clerk JWT<br/>body: {company_slug, files[], skill_pack_version, skills[]}
    
    Cloud->>Cloud: _assert_owner(company_slug, workspace_id)
    Note over Cloud: First publish claims company_slug ownership.<br/>Subsequent publishes from same workspace only.
    Cloud->>Cloud: write files to data/skill-packs/{company_slug}/
    Cloud->>Cloud: generate tracking token (secrets.token_urlsafe(32))
    Cloud->>Cloud: store tracking_tokens[company_slug] in kv_store
    Cloud->>Cloud: upsert SkillPack record in kv_store
    Cloud-->>Backend: {tracking: {tracking_token, tracking_url}, sync_url}
    
    Backend->>Backend: rewrite pack.json with tracking + sync_endpoint
    Backend->>Cloud: POST /api/v1/workflows/{slug}/installer/upload
    Note over Backend,Cloud: Bearer Clerk JWT<br/>body: raw .exe bytes
    Cloud->>Cloud: store to data/installers/{slug}/installer.exe
    Cloud->>Cloud: store meta.json (sha256, filename, version)
    Cloud-->>Backend: {download_url, sha256}
    Backend-->>Studio: {cloud_download_url, cloud_tracking_url}
```

### 5.6 Skill Sync Flow (Runtime → Cloud)

```mermaid
sequenceDiagram
    participant RT as Runtime
    participant Cloud as Conxa Cloud

    Note over RT: On startup (async, after MCP connect)
    RT->>RT: read pack.json (sync_token, sync_endpoint) per company
    RT->>RT: build since={skill_slug: last_known_version} from local skill dirs
    RT->>Cloud: GET /api/v1/skill-packs/{co}/delta?since={json-map}
    Note over RT,Cloud: Bearer sync_token (installer-embedded, §5.4)<br/>Rate-limited: KV-backed, shared across instances
    Cloud->>Cloud: compare each skill's own version independently
    Cloud-->>RT: {skills: [{name, action: "no_change"} | {name, version, action: "update", files: [...]}]}
    loop for each skill with action "update"
        RT->>RT: backup existing skill dir
        RT->>RT: atomicWrite each file (SHA-256 verified)
        RT->>RT: update component_versions for that skill
        RT->>RT: clean up backup
    end
    RT->>RT: reload skill index from updated files
```

See §5.9 / §11.1 for the full endpoint contract. Sync is per-skill, not per-company — republishing one skill never triggers a re-download of the others. Within a single changed skill, all of that skill's files are still sent (no per-file checksum diffing inside one skill) — a much smaller gap than the old whole-company retransfer this replaced, since each skill is only a handful of small JSON files.

### 5.7 Telemetry Flow

```mermaid
sequenceDiagram
    participant RT as Runtime (tracker.js)
    participant Cloud as Conxa Cloud

    Note over RT: During/after skill execution
    RT->>RT: createTracker(pack.tracking)
    RT->>RT: emit events: wf_start, step_ok, step_fail, wf_ok, wf_fail
    RT->>Cloud: POST /api/tracking/{co}/events
    Note over RT,Cloud: Header: X-Tracking-Token: {token from pack.json}<br/>body: {rid, pid, pv, rv, uid, wid, evts[]}
    Cloud->>Cloud: _verify_token(company, token)
    Cloud->>Cloud: db_append("tracking/{co}", run_id, [enriched])
    Cloud-->>RT: 202 Accepted (fire-and-forget)
```

Telemetry is compact: short event codes (`wf_start`, `wf_ok`, `wf_fail`, `step_ok`, `step_fail`, `recovery_tier{1-5}`), timestamps, and step indices. The tracking token is embedded in `pack.json` at publish time and never requires the end-user to authenticate.

### 5.8 Runtime Self-Update Flow

The runtime is driven by **one Ed25519-signed manifest** (`GET /api/v1/manifest.json`) instead of separate unsigned per-layer endpoints. `runtime/manifest_manager.js` fetches it — no local TTL cache; every launch fetches fresh, falling back to the last verified copy only on failure — verifies the signature against a public key baked into the host exe at build time (same stamping mechanism as `HOST_VERSION`), and decides whether to update, using semver comparison, a `min_host` floor (a `conxa_app` entry never activates against a host exe too old to run it — see below), the `minimum_versions` floor (forces an update regardless of rollout), and a deterministic rollout bucket (`sha256(install_id + component_name) mod 100 < rollout.percentage`, stable across polls so a staged rollout doesn't reshuffle who's "in" every check). A manifest that fails signature verification is discarded outright — treated exactly like a network failure, never partially trusted.

Every component is a **versioned directory** managed by `runtime/version_manager.js` (see §4.4): `activate()` validates the new version, flips the `current` junction, and prunes old versions beyond retention (default: current + 2 previous) while protecting whichever version was live immediately before the activation, so a same-run rollback never needs a re-download. `rollback()` simply flips `current` back — no download.

`manifest_manager.checkForUpdates()` takes a `components` filter and runs from two different places for that reason:

**App layer — pre-load, in `bootstrap.js`, components: `["conxa_app"]`.** Downloads a zip, extracts to `conxa-app/<version>/`, validates `server.js` is present, `activate()`s — all *before* `server.js` is ever `require()`'d. Because nothing has loaded the old code into the process's module cache yet, this activation is live for the launch that downloaded it, not the next one. `manifest_manager.js`, `http_client.js`, `install_identity.js`, and `version_manager.js` are baked into the host exe alongside `bootstrap.js` for exactly this reason — they have to be runnable before any app layer exists on disk to load them from (this mirrors `version_manager.js`'s existing dual-shipped precedent: also present in the `conxa-app` zip, for `sync.js`'s use post-load). The download is on a tight budget (2 retries, 5s each) since it's launch-blocking; any failure — network, signature, download, decode — is caught and swallowed, leaving `current` exactly where it was, as if the check never ran.

**Host layer — post-load, in `server.js`'s `startupSync`, components: `["conxa_runtime"]`.** Reuses the manifest `bootstrap.js` already fetched (`global.__conxaManifest`) instead of fetching again. Downloads `conxa-runtime.exe` + `keytar.node` into their own `conxa-runtime/<version>/` directory (never touching whatever file the *currently running* process loaded from — a structural improvement over the old flat-file layout, which needed an `update.bat`/`--selfcheck`/rename-over-running-exe dance specifically because the new and old files used to share one path). Before activating, the new exe is spawned once with `--selfcheck` (own environment, own `CONXA_DIR`) — if it doesn't exit 0, activation is aborted and `current` is left untouched, regardless of whether the SHA-256 checksum matched (a checksum only proves the download wasn't corrupted, not that the binary actually boots). This leg can't take effect until the *next* cold start no matter what — a running process can't replace its own executing binary — so it keeps the generous, non-blocking download budget (retry w/ backoff, up to 2 minutes per attempt).

```mermaid
sequenceDiagram
    participant Boot as bootstrap.js (host, pre-load)
    participant RT as server.js (app, post-load)
    participant Cloud as Conxa Cloud
    participant FS as Filesystem (version_manager.js)

    Boot->>Cloud: GET /api/v1/manifest.json (no TTL — always fetched)
    Cloud-->>Boot: {conxa_runtime, conxa_app, skill_packs, minimum_versions, signature}
    Boot->>Boot: verify Ed25519 signature against baked-in public key
    alt signature invalid
        Boot->>FS: discard — fall back to last verified cache (or skip entirely)
    else signature valid
        Boot->>FS: write manifest.json cache
    end

    Boot->>FS: version_manager.currentVersion(conxa-app)
    Boot->>Boot: decideUpdate() — semver, min_host floor, minimum_versions floor, rollout bucket

    opt conxa_app update decided
        Boot->>Cloud: download app zip (tight retry budget — launch-blocking)
        Boot->>FS: extract to conxa-app/<version>/, validate server.js present
        Boot->>FS: version_manager.activate() — flip conxa-app/current junction, prune
        Note over Boot: live THIS launch — server.js not require()'d yet
    end

    Boot->>RT: require conxa-app/current/server.js

    RT->>FS: version_manager.currentVersion(conxa-runtime)
    RT->>RT: decideUpdate() — reuses Boot's already-fetched manifest

    opt conxa_runtime update decided
        RT->>Cloud: download conxa-runtime.exe + keytar.node (retry w/ backoff, SHA-256 verify each)
        RT->>RT: spawn new exe --selfcheck (own CONXA_DIR)
        alt selfcheck fails
            RT->>RT: abort — current untouched, old host keeps running
        else selfcheck passes
            RT->>FS: version_manager.activate() — flip conxa-runtime/current junction, prune
        end
        Note over RT: effective on next cold start — this process can't replace its own running binary
    end
```

**`--install-playwright` behaviour:** Uses `playwright-core/cli` bundled inside `conxa-runtime.exe` (no system npm/npx dependency). Idempotent — exits immediately if the correct Chromium revision is already on disk. Runs through `conxa-runtime/current/conxa-runtime.exe` so it always exercises whatever version is actually active.

### 5.9 Data Ownership Summary

| Data | Owner | Storage Location |
|---|---|---|
| Workflow metadata (local) | Build Studio | `data/workflows/{id}/workflow.json` |
| Auth session (Playwright state) | Build Studio (LOCAL ONLY) | `data/workflows/{id}/auth/auth.json` |
| Raw recorded events | Build Studio | `data/sessions/{id}/events.jsonl` |
| Compiled skills | Build Studio | `data/skills/{id}/skill.json` |
| Built skill packs | Build Studio | `data/skill-packs/{co}/` |
| Published skill packs | Conxa Cloud | `data/skill-packs/{co}/` on Render (fast-path cache) + `kv_store` (`skillpack_files__{co}` namespace, durable) |
| Installer binaries + version history | Conxa Cloud | `data/installers/{co}/` on Render (fast-path cache) + `kv_store` (`installer_versions__{co}` namespace, durable) |
| Tracking tokens | Conxa Cloud | `kv_store` table (tracking_tokens namespace) |
| Slug ownership | Conxa Cloud | `kv_store` table (publish_owners namespace) |
| Telemetry / run events | Conxa Cloud | `kv_store` table (tracking/{co} namespace) |
| Runtime skill packs | End-user machine | `~/.conxa/skill-packs/` |
| Runtime auth tokens | End-user machine | OS keychain (keytar) |
| Runtime browser sessions | End-user machine | `~/.conxa/cache/sessions/` |

**Render disk durability:** the `conxa-api` web service runs on Render's free plan (`render.yaml`), which has no persistent disk and wipes the container filesystem on idle-timeout or redeploy. Local disk under `data/skill-packs/` and `data/installers/` is therefore a fast-path cache only — `publish_routes.py` and `skillpack_update_routes.py` write every published skill-pack file and every installer version (including binary content, base64-encoded) to the existing Postgres-backed KV store (`installer_versions__{slug}`, `skillpack_files__{slug}` namespaces) as the durable source of truth, and rehydrate local disk from there on cache miss (e.g. `_load_installer_from_db`, `_ensure_skill_pack_on_disk`). This closes the gap where a disk wipe between two installer uploads made the older version unrecoverable.

---

## 6. Recording Pipeline

**Location:** `conxa-builder/python/conxa_compile/recorder/`

### 6.1 Capture

`session.py` — `RecorderSession` wraps a Playwright browser context:

1. Playwright launches Chromium with stored auth (`storageState`).
2. `bridge.js` is injected into every frame (including iframes) via `page.addInitScript`.
3. Bridge captures: `click`, `dblclick`, `right_click`, `type`, `fill`, `focus`, `select`, `select_option`, `set_checkbox`, `set_radio`, `date_pick`, `drag_drop`, `keyboard_shortcut`, `upload`, `navigate`, `scroll`, `tab_open`, `tab_switch`, `popup`, `frame_enter`, `frame_exit`, `dialog_appeared`, `dialog_accept`, `dialog_dismiss`.
4. Each event carries: `action`, `url`, `frame` (iframe chain), `target` (element signals), `value`, `ts`.
5. `frame_utils.py`'s `_frame_context_and_offset_sync` walks the iframe parent chain to accumulate page-level bounding box offsets; `session.py` calls it per event.
5a. **A `filechooser` listener is attached** (`session.py::_attach_page_listeners` → `_on_file_chooser`), suppressing the native OS picker so the Studio can show its own dialog pre-pointed at the download folder instead. `FileChooser.set_files()` still dispatches the input's `change` event via CDP, so `bridge.js`'s `upload_intent` capture is unaffected. See §7.1.
6. Events stream to `session_events.py` which appends to `events.jsonl`.
7. On stop, `session.py` closes the Playwright context and renames each tab's raw `.webm` to a stable name (§6.3). It does **not** extract video frames — that moved to compile time (§7.1) so a failed frame can be repaired by recompiling instead of being lost for the life of the session.

### 6.2 Iframe Chain Preservation

Every recorded event carries a `frame` object with:
- `src` — iframe src URL
- `frame_id` — Playwright frame ID
- `parent_chain` — ordered list of parent frame IDs

This chain is preserved verbatim through compile and execution. Bounding boxes are page-level (offsets accumulated up the chain during recording).

### 6.3 Multi-Tab Recording

The recorder instruments every page in the browser context (`_context.on("page", ...)`), so a
workflow that opens a new tab — whether the site opens it (a `target="_blank"` link, `window.open`)
or the user does (Ctrl+T) — is captured on both tabs, not just the first. `session.py` assigns each
page a stable identity as soon as the pump loop notices it (`_register_new_pages_sync`, one loop
tick, ~0.2s):

- `id` — `tab_0`, `tab_1`, … in discovery order.
- `opened_by` — `"initial"` (the recording's starting tab), `"site"` (`page.opener()` resolves —
  a link/`window.open`), or `"user"` (no opener at all — Ctrl+T or similar). This is the field the
  runtime uses at replay time to decide whether to *wait for* the tab (`"site"`) or *create* it
  itself (`"user"`) — see §9.1a.
- `opener_tab` — which tab's action opened this one, when `opened_by` is `"site"`.

Every event (`RecordedEvent.tab`, `packages/conxa-core/conxa_core/models/events.py::TabContext`)
carries which tab produced it. This is what lets the compiler know a workflow crossed tabs at all
(§7.1) and what the runtime resolves per step at replay time (§9.1a).

**Video is per-tab.** Playwright records one video file per page in a video-enabled context; a
two-tab recording produces two `.webm` files. `tab_0`'s keeps the pre-existing name
(`recording.webm`) so single-tab recordings and every reader of that name are unaffected; every
other tab is written as `recording-<tab_id>.webm`, with a `videos.json` alongside mapping
`{tab_id: {file, start_wall_ms}}`. Each tab's `start_wall_ms` is its own page-creation time, not the
session's — an event's `visual.timestamp_ms` offset (used to cut its 5 anchor frames, §7.1) is
computed relative to *its own tab's* video start, not always tab_0's, since a second tab's video
starts recording from zero at whatever moment that tab opened, seconds or minutes into the session.
`frame_extractor.py` reads `videos.json` to pick the right video per event; a session recorded
before multi-tab support (no `videos.json`) falls back to `recording.webm` for every event,
unchanged.

A manually opened tab (Ctrl+T) has nothing that opened it on the recorded page, so `popup` — which
fires only for a real `window.open`/`target="_blank"` — never fires for it; the tab is still
discovered and instrumented via the same context-level "page" listener, just classified
`opened_by: "user"` instead of getting a `popup` synthetic event.

**`download`/`dialog`/`popup` are stamped with the tab whose listener fired them, not whatever
tab is "active."** `_attach_page_listeners(page)` binds `page` into each handler
(`page.on("popup", lambda popup: self._on_popup(popup, page))`), and `_enqueue_synthetic` threads
that page through the pending-payload queue as `src_page` instead of always falling back to
`_active_page_sync()`. Without this, a popup opened by a click on a background tab (e.g. tab_1)
gets stamped with whatever tab happened to be `_active_page_sync()` when the pump loop drained the
event — usually `tab_0` — and `_insert_tab_markers` (§7.1) then inserts a spurious `tab_switch`
back to `tab_0` before the real `tab_open` for the new tab. At replay, `runtime/tabs.js` follows
that marker and execution bounces to the wrong tab.

---

## 7. Compilation Pipeline

**Location:** `conxa-builder/python/conxa_compile/`

### 7.1 Pipeline Stages

```
recording.webm
        │
        ▼  recorder/frame_extractor.py:extract_frames_for_session()
        │  • 5 ffmpeg frame captures per event (before_far/near, at, after_near/far)
        │  • idempotent — frames already on disk from a prior attempt are not re-cut
        │  • per-event isolated — one event's ffmpeg failure doesn't cost any other
        │    event its frames; failures are logged and that step falls back to
        │    deterministic anchors (see anchor_vision_llm.py below)
        │  • writes visual.frames / visual.full_screenshot back into events.jsonl
        │
        ▼
events.jsonl (raw RecordedEvents)
        │
        ▼  pipeline/normalize.py
        │  • Canonicalize action types
        │  • Filter noise events
        │  • Resolve frame references
        │
        ▼  pipeline/dedupe.py
        │  • Remove duplicate consecutive events
        │  • Collapse rapid-fire clicks
        │
        ▼  pipeline/enrich.py
        │  • Add DOM snapshot refs
        │  • Augment with surrounding text context
        │  • Compute visibility signals
        │
        ▼  pipeline/selectors.py
        │  • Extract raw selector candidates from recorded DOM
        │
        ▼  compiler/build.py:compile_skill_package()
           │
           ├── LLM: intent_llm.py → WorkflowIntentGraph (one call per workflow)
           │
           ├── For each step:
           │   ├── identity_bundle.py → IdentityBundle (deterministic, zero-LLM)
           │   │   generate_deterministic_signals() produces Playwright-native signals
           │   │   ranked by durability. LLM is never asked to write a selector string.
           │   ├── anchor_vision_llm.py → relational anchor phrases (optional)
           │   ├── validation_planner.py → wait_for + success_conditions (deterministic)
           │   ├── build.py:_build_assertions() → Assertion[] (one required per consequential
           │   │   action, rest advisory — see §10.2a VERIFY)
           │   ├── recovery_policy.py → RecoveryBlock
           │   └── confidence/layered.py → confidence score
           │
           └── → SkillPackage (models/skill_spec.py)
```

**Frame extraction runs at compile time** (`handlers/compile.py:cmd_compile`), not at recorder shutdown. It used to run once in the recorder thread's `finally` block, all-or-nothing across every event in the session — a single ffmpeg timeout on one event discarded frames for every other event too, permanently, since extraction never ran again. Moving it into `cmd_compile` makes it idempotent and per-event isolated (see diagram above), so a recompile repairs only the events still missing frames.

**Tab markers are inserted at `compile_skill_package()`**, right after `clean_steps`/`fix_step_order`
(`build.py:_insert_tab_markers`), so the synthetic marker events never have to satisfy those
functions' assumptions about real recorded event shape. Whenever consecutive events' `tab.id`
differs, a `tab_open` (first visit to that tab) or `tab_switch` (returning to one already seen —
including back to `tab_0`) marker event is inserted immediately before the first event on the new
tab. Every step also carries its own `tab` context (`SkillStep.tab`, mirroring `SkillStep.frame`) —
`build.py:_build_tab_context`. Both markers and step-level `tab` are empty/`tab_0` for a
single-tab recording, so nothing about a workflow that never leaves its first tab changes: no
markers are inserted, and every step's `tab` field is the same empty dict it always was. `tab_open`
and `tab_switch` compile through the pre-existing `MARKER_ACTIONS` path (`no_recovery_block`,
same as `frame_enter`/`frame_exit`) — see §10.4.

**A downloaded file can bind to a later upload in the same compiled skill** (EXEC-10/W-2). When a
recorded `upload` step's filename (browsers only ever expose `File.name`, never a path) matches an
earlier `download_observed` event's `suggested_filename`, `skill_package_builder_saved_skill.py
:_bind_downloads_to_uploads` rewrites that upload step's value from the generic `{{file_path}}`
runtime-input placeholder to `{{downloaded_file}}` (the workflow's only download) or
`{{downloaded_file_N}}` (Nth download, FIFO-matched per filename, when several downloads share a
name) — bound only to a download that already happened earlier in the step sequence, since a real
upload can never precede the download that produced its file. These two placeholders are excluded
from `_merge_saved_inputs_with_execution_placeholders`'s auto-declared-input scan (they are
populated automatically at replay time by `run.js`'s `download_observed` handler, never something a
user/agent supplies) — see §9.1a. An upload with no matching download is left completely
untouched, still falling back to `{{file_path}}` as before.

**A bulk (multi-select) upload can bind to the whole run's download folder, not just one file**
(resolved 2026-08-16). When an upload step's recorded `File[]` metadata lists more than one
filename (one `<input multiple>` picked several files in a single recording action — the natural
shape of "upload all N files"), `_bind_downloads_to_uploads` only rewrites its value when *every*
recorded filename matches an earlier, not-yet-consumed `download_observed` entry; on a full match
it consumes all of them and sets the step's value to `{{downloaded_files_dir}}` instead of chaining
several `{{downloaded_file_N}}` scalars. `server.js` sets `inputs.downloaded_files_dir` to the
current run's own isolated `{CONXA_DATA_DIR}/runs/{runId}/` folder before `runPlan` starts, and
`run.js::resolveUploadPaths` already expands a folder into every file inside it, so no runtime
upload-handler change was needed. A partial match (even one recorded filename with no matching
earlier download) leaves the step completely untouched, same fallback guarantee as the single-file
case — this is what keeps the binding from ever handing an upload control a folder that also
contains a file it was never meant to see. `downloaded_files_dir` is excluded from the
auto-declared-input scan the same way `downloaded_file`/`downloaded_file_N` are.

**Downloads live in an isolated, self-cleaning per-run workspace, not the OS Downloads folder**
(EXEC-10/W-7, resolved 2026-08-17). `server.js` saves every download under
`{CONXA_DATA_DIR}/runs/{runId}/` — `CONXA_DATA_DIR`, not the read-only install dir `CONXA_DIR` —
so a run's files are fully isolated from both the customer's own Downloads/Documents folders and
from any other run's workspace. `run.js::sweepOldRuns` runs once at the start of every
`execute_skill`/`execute_sequence` call, before the new run's directory is created, and deletes any
*other* run directory under `runs/` whose mtime is older than `CONXA_RUN_RETENTION_DAYS` (default
7). Running the sweep at run start rather than on the previous run's success/failure/cancel path
means cleanup fires regardless of how that prior run ended — the retry-budget bug in §10 (cleared
only on success) is deliberately not repeated here.

**A downloaded zip is always extracted immediately, and an upload replays exactly what was
recorded** (EXEC-20, resolved 2026-08-16, superseding EXEC-17's replay-time inference below).
Both `session.py::_on_download` (recording) and `server.js`'s download listener (replay) extract
a `.zip` download into a sibling folder — `extractZipOnce` (`run.js`, stdlib `zipfile` on the
Python side) the instant the file is saved, unconditionally, never waiting to see what an upload
step later needs. Extraction is idempotent and unwraps one single top-level wrapping folder the
same way it always has; needs no separate cleanup, since the extracted folder lives inside
`runs/{runId}/` (replay) or `sessions/{session_id}/downloads/` (recording) and is swept the same
way the rest of that workspace is. `_bind_downloads_to_uploads` (`skill_package_builder_saved_skill.py`)
now reads a zip download's member filenames (recorded on `download_observed` as `zip_members`) and
binds an upload step to *exactly what was picked while recording*: the zip's own filename still
binds to `{{downloaded_file}}` and uploads the zip verbatim; a single file matching one member binds
to that exact extracted file (`{{downloaded_file_N_dir}}/name.pdf`); a multi-select matching a
zip's *entire* remaining member set binds to the whole extracted folder (`{{downloaded_file_N_dir}}`)
— a partial subset is left untouched, since there is no syntax today for "these files but not the
rest of the folder." `run.js::resolveUploadPaths` no longer special-cases `.zip` at all — a zip
target now just uploads verbatim, the same as any other single file.

*Superseded design (EXEC-17, resolved 2026-08-17, kept for history):* `resolveUploadPaths` used to
detect a `.zip` upload target and silently extract it before upload, inferring "this must want the
contents" — because at record time nothing but the zip existed on disk to pick, so the person
recording had no way to express wanting the contents specifically. Once extraction moved to record
time too (giving the person recording an actual choice), that inference became a liability rather
than a convenience — it made "I genuinely want to upload the zip" unrepresentable — so it was
replaced by the literal record→replay fidelity described above. A skill compiled under the old
behavior needs re-recording (or hand-pointing its `file_path` input at the already-extracted folder)
to keep working.

**Recording has its own workspace too** (EXEC-18), one phase earlier than the replay-time story
above. `session.py`'s recording browser saves each download to `data/sessions/{session_id}/downloads/`
— mirroring the runtime's `runs/{runId}/` — via `_on_download` calling `download.save_as(...)` with a
collision-safe name (`RecordingSession._unique_download_name`, a Python port of
`uniqueDownloadName`), and (per EXEC-20 above) extracts it immediately if it's a zip. `cmd_start_recording`
returns the resulting `downloads_dir` so the UI can surface it.

**The recording-time "Choose File" dialog is Studio-owned, not Chromium's** (resolved 2026-08-17,
after three earlier attempts to steer Chromium's own picker — via a dedicated persistent profile
seeded with a `selectfile.last_directory` preference — failed to reliably land on the right folder;
that machinery has been removed). `session.py` attaches a `page.on("filechooser", ...)` listener
(`_on_file_chooser`) that suppresses the native OS picker and instead invokes
`on_file_picker_request(request_id, default_dir, multiple)` — wired in `handlers/session.py` to emit a
`file_picker_request` event over the same JSON-RPC event stream every other backend progress event
uses (`id: null`, since it isn't a reply to any in-flight command). The renderer
(`RecordWorkflowDialog.tsx`) shows Electron's own `dialog.showOpenDialog`, pre-pointed at
`default_dir` — the most recent download's folder (or its zip-extract folder; see `_last_download_dir`)
— and posts the result back via `cmd_resolve_file_picker`. `RecordingSession.resolve_file_pick()`
queues the answer; the pump loop (the only thread allowed to touch Playwright's sync API) drains it
and calls `chooser.set_files(...)`, which still dispatches the input's `change` event via CDP, so
`bridge.js`'s `upload_intent` capture is unaffected. A canceled pick is a no-op; the page sees a
normal dialog cancel.

### 7.2 LLM Calls Per Step

All LLM calls route through `conxa_core.llm.get_router()`. In Build Studio, the router singleton is replaced with `LLMProxyClient` which forwards to the cloud's metered proxy. The cloud proxy itself has the multi-provider pool (Groq, Google AI Studio, NVIDIA NIM, etc.).

| LLM Client | Call | Token cost (approx) |
|---|---|---|
| `intent_llm.py` | Per-step intent string + per-workflow intent graph | Low–High |
| `anchor_vision_llm.py` | Per-step relational anchor phrases (if enabled) | Medium (screenshot) |
| `recovery_llm.py` | Per-step recovery block | Medium |

`anchor_vision_llm.py` always downscales the recorder's screenshot to JPEG bounded at 1024px
on the longest side (`_downscale_and_encode`) before sending it to a vision provider — every
return path, including a missing/degenerate bbox that skips the target-highlight overlay,
goes through the same re-encode. A raw full-resolution PNG video frame is never sent. When a
step's vision call fails for a recoverable reason (see `_RECOVERABLE_VISION_ANCHOR_REASONS`),
`compile_skill_package` emits one aggregate `vision_anchor_fallback_summary` compile-log event
after all steps compile — count of steps that fell back, out of the total, plus the first
distinct reason/hint — in addition to each step's own `vision_anchor_fallback` compile warning,
so a provider outage degrading many steps in one compile is visible at a glance rather than
buried per-step.

Selector generation is **fully deterministic** on the primary compile path, with two narrow,
user-initiated re-compile exceptions: the 1-click-fix API's `selector_regeneration.py` (task
`selector_generation`, text-only) and the Human Edit re-target wizard's "draw a new region" path,
`region_selector_vision.py` (task `region_selector`, vision — screenshot + drawn region highlight
+ DOM snippet, since no recording stores per-element geometry a text prompt could resolve a drawn
region against). Neither runs during normal compile.

On the primary compile path itself, `identity_bundle.py:generate_deterministic_signals()` reads the recorded DOM at compile time and emits Playwright-native-grammar signals ranked by durability. No LLM call is made to produce or score selector strings (SeeAct Finding 3: ~30% hallucination rate for LLM-written selectors). `llm_selector_generator_v2.to_playwright_grammar()` is still used as a pure string-formatting utility by `identity_bundle.py`.

### 7.3 SkillPackage Output Schema

```python
SkillPackage:
  meta: SkillMeta                      # id, version, title, source_session_id
  inputs: list[dict]                   # parameterizable inputs schema
  skills: list[SkillBlock]             # one block per workflow
    └── steps: list[SkillStep]
          action: str | dict            # action type + params
          intent: str                   # human-readable intent
          tab: dict                     # {id, index, opened_by, opener_tab} — empty = tab_0 (§9.1a)
          element_fingerprint: ElementFingerprint
            role, tag, inner_text, aria_label, name,
            placeholder, label_text, data_testid,
            input_type, css_class_tokens, anchor_phrases,
            position_hint
          compiled_selectors: list[str] # ranked CSS/XPath selectors
          validation: ValidationBlock
            assertions: list[Assertion] # url_changed, url_pattern, selector_present/absent,
                                         # text_present/absent, value_equals, state_changed
          recovery: RecoveryBlock
            intent, anchors, strategies, confidence_threshold
          semantic_description: str
          snapshot_ref: str             # DOM snapshot blob ref
  intent_graph: WorkflowIntentGraph    # goal, steps, decision_points
  compile_report: dict                  # status, steps_total, min_confidence
```

### 7.3a Contract vs. Executor Boundary (ARCH-3 design note)

Browser replay is the first pluggable executor backend, not the permanent one — the plan is
to graduate individual skills onto a native API connector where one exists (PROD-7) and,
longer-term, to support a computer-use-style agent executor. Conxa's defensible position is
the layer *above* the executor: per-step intent, verification, entity bindings, and audit
requirements. That position only survives if the skill schema keeps those two concerns
separated as it evolves, rather than letting Playwright/DOM assumptions bleed into fields that
are supposed to describe intent and success criteria.

`skill_spec.py` now tags every field `[contract]` (executor-independent — must hold for any
future executor) or `[executor]` (browser-replay implementation detail — free to change per
backend). The full per-class breakdown lives in `docs/Backend-Schema.md` §3.0; that table is
the source of truth and must be kept in sync with the code. Two consequences for future schema
work:

- **EXEC-1's branch primitives** (`if_present`/`try_dismiss`/`wait_for_one_of`) must define
  their condition in contract terms (an identity/state check) with browser-specific evaluation
  kept on the executor side — see the `branch` row in Backend-Schema.md §3.0.
- **Any new `SkillStep`/`SkillPackage` field** must be tagged at introduction and the
  Backend-Schema.md §3.0 table updated in the same change; an untagged field is a review
  omission.

This is a documentation-and-review-discipline item, not a refactor — no runtime behavior
changed. See `TODO.md` ARCH-3.

---

## 8. Skill Packaging Pipeline

**Location:** `conxa-builder/python/conxa_compile/skill_package_builder.py`

After compilation, `build_skill_package(workspace_id)` gathers all workflows in the workspace and produces a data-only skill package folder:

```
output/skill_package/{company_slug}-skill-package/
├── skill_package.json   (manifest: company_slug, company_name, skills[])
├── CLAUDE.md            (rendered from skill_package_templates/skill_package/Claude.md.tmpl)
├── index.md             (rendered from skill_package_templates/skill_package/index.md.tmpl)
├── pack.json            (version manifest)
└── skills/
    └── {skill_slug}/
        ├── execution.json   (compiled steps + selectors)
        ├── recovery.json    (recovery blocks + anchors)
        └── inputs.json      (input schema)
```

**Invariant:** Auth files (`auth.json`) are NEVER placed in the build output. The `build_installer` command explicitly checks and refuses if `auth.json` is found under the skill pack dir.

The installer (`installer_builder.py`) wraps this with NSIS to produce a per-user `.exe` (no UAC) that:
1. Installs the skill pack to `$PROFILE\.conxa\skill-packs\{company}\`.
2. Installs `conxa-runtime.exe` + `keytar.node` + `conxa-app\` (pre-extracted app layer) to `$PROFILE\.conxa\`.
3. Installs Chromium to `$PROFILE\.conxa\chromium\` (via `conxa-runtime.exe --install-playwright`, run with `CONXA_DIR` set explicitly to `$PROFILE\.conxa` so it lands in the same place the runtime reads from later).
4. Registers the MCP server by invoking `conxa-runtime.exe register-mcp` (see §4.2a) — every detected agent host (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, and 20+ more), not just the two Claude surfaces, ownership-checked and atomically written.

---

## 9. Execution Pipeline

**Location:** `runtime/run.js`

### 9.1 Step Execution Loop

For each step in `execution.json`:

```
1. Poll pause signal (control file: allow pause/resume via API)
2. waitForPageLoad() — waits for domcontentloaded (+ networkidle if CONXA_WAIT_NETWORKIDLE=1) after a navigation-triggering step
3. waitForUrlState() — pre-step URL gate (if step.url defined)
4. executeStep() — primary action
   ├── interpolate input variables ({{variable}} substitution)
   ├── resolveStep() — IdentityBundle resolution over the live DOM
   │   ├── Tier 1: deterministic exception ladder over all bundle signals (in-process, zero-token)
   │   ├── Tier 2: a11y re-probe / re-hover / fallback / dialog-scope / fuzzy (in-process, zero-token)
   │   ├── Tier 3: LLM semantic recovery — intent + DOM inventory → Claude (agent-mediated; ceiling ≥ 3)
   │   └── Tier 4: Vision recovery — screenshot → Claude (agent-mediated; ceiling ≥ 3)
   └── withLocator() — perform the action
5. verifyStep() — check Assertion[] (§10.2a) independently of the action's own success
   ├── required (enforced) assertion → verify-fail descends into recovery, re-verified on
   │   every re-run; unrecovered → step (and run) fails, never silently continues
   └── advisory assertions → log warning only
6. writeCheckpoint() — step-level recovery point
7. tracker.emit() — telemetry event
```

### 9.1a Multi-Tab Step Resolution

**Location:** `runtime/tabs.js`

Each compiled step's optional `tab` block (`SkillStep.tab` — id/index/opened_by/opener_tab, empty
means the initial page) is resolved to a live Playwright `Page` fresh on every step, the same
declarative-per-step pattern `frame_chain` uses for iframes (§10.2a) rather than stateful enter/exit
handling. `runPlan()` creates one `tabs.js::createTabRegistry(startPage)` per run, binding `tab_0` to
the run's initial page and registering the browser context's `"page"` listener immediately — before
any step executes — so a tab opened by an early step is queued even if a later step is the first one
to ask for it (this is the race a lazily-registered listener would otherwise have).

`resolveStepPage(registry, step)`:
1. No `tab` (or `tab.id === "tab_0"`) → the initial page. Every skill compiled before multi-tab
   support has no `tab` on any step, so it takes this path unchanged for every step.
2. Already bound and still open → that page, reused.
3. `opened_by === "site"` → drain the queue first, else `context.waitForEvent("page")`
   (`CONXA_TAB_OPEN_TIMEOUT_MS`, default 30s).
4. `opened_by === "user"` → nothing on the recorded page ever opens this tab (it was a Ctrl+T at
   record time), so the runtime creates it itself via `context.newPage()`. The recorded first action
   on that tab is a `navigate`, which then runs normally against the fresh page.
5. Unresolvable → throws with `.tabNotFound = true`. **Never falls back to the current page** — the
   same rule `rootCandidates()`/`isFrameNotFound()` (§10.2a) apply to a missing frame: a
   same-looking element on the wrong tab is worse than a clean, diagnosable failure.

**The registry never hands out a page it has already bound to a tab.** `createTabRegistry` tracks
a `bound` set alongside `pendingPages` — seeded with the initial page, and added to every time a
page is bound to a tab id (drained from the queue, returned by `waitForEvent`, or created via
`context.newPage()` for an `opened_by: "user"` tab). The step-3 drain and the step-4 `newPage()`
call both add their result to `bound` before returning. This matters because Playwright fires the
context's `"page"` event for *every* new page, including ones the registry creates itself — so
without `bound`, a blank page created for a user-opened tab (step 4) would sit in `pendingPages`
and could be handed straight back out as a *different*, later, site-opened tab (step 3), pointing
two different `tab.id`s at the same page. This was the actual defect behind a workflow that opens
a tab manually (Ctrl+T) and later gets a real popup: the popup step drained the manually-opened
tab's own blank page instead of waiting for the real popup, and every subsequent step ran against
the wrong page.

Resolving a named tab also settles it before returning (`_settle`): waits for `domcontentloaded`
up to `opts.loadTimeoutMs` (the caller, `run.js`, passes `PAGE_LOAD_TIMEOUT_MS` —
`CONXA_PAGE_LOAD_TIMEOUT_MS`, default 60s), and, **only for a site-opened tab**
(`opened_by !== "user"`), first waits for the page to leave `about:blank` if it's still there — a
`target="_blank"` popup is created blank and navigates a beat later, so without this a step could
fire before the tab has actually loaded anything. This wait is gated on `opened_by` rather than
running unconditionally: a **user-opened** (Ctrl+T) tab is created blank by this registry itself
(step 3 above) and stays blank until the compiler's own synthesized `navigate` step runs against
it — nothing external is ever going to navigate it — so waiting for it to leave `about:blank`
would just burn the full `loadTimeoutMs` twice for no reason: once resolving the `tab_open` marker
step, again resolving the `navigate` step that immediately follows it on the same tab. Both waits
are best-effort; a tab that never leaves `about:blank` still proceeds rather than hard-failing. The
`navigate` step handler's own `page.goto()` and the runtime's `url_changed`/`url_exact`/
`url_pattern`/`url` assertion timeouts share this same 60s default — a slow site (e.g. a cold
Vercel deployment) gets one consistent page-load budget everywhere it matters, not the 15s/8s
patchwork of hardcoded values this replaced. This does eat into `run.js`'s whole-run wall-clock cap
(`EXECUTION_DEADLINE_MS` in `server.js`, 210s default, sized to return an actionable failure inside
Claude Desktop's ~240s MCP client timeout) faster than before on a workflow with several genuinely
slow navigations; `CONXA_EXECUTION_DEADLINE_MS` remains the escape hatch for Build Studio-only
testing.

`tab_open`/`tab_switch`/`popup` steps have empty handlers in `run.js` — the tab switch they mark
already happened via `resolveStepPage()` before `executeStep()` runs for any step, including these
markers themselves. They are declared explicitly rather than folded into `NOOP_STEP_TYPES`, so "no-op
step type" isn't read as "nothing happens around this step" for the one category where something very
much does.

**A tab marker with no `tab` block at all inherits the current page instead of resolving `tab_0`.**
`tabs.js::stepInheritsPage(step)` is true only for a `tab_open`/`tab_switch`/`popup` step whose
`tab` field is absent — the shape a mis-stamped recorder event produces (§6.3's `download`/`dialog`/
`popup` src-page fix addresses the recorder side; this is the runtime-side guard for packs compiled
before that fix, and any other case the recorder mis-stamp handles miss). `run.js`'s step loop
checks this before calling `resolveStepPage` and, when true, keeps executing on the page the run
was already on rather than resolving through the normal (tab_0) path — a genuine step recorded on
tab_0 is unaffected, since it always carries an explicit path back to tab_0 via the *next* real
step's own `tab` field, not via the marker.

`server.js` attaches its per-page diagnostics (console errors, failed requests, downloads) to every
tab opened during a run (`_context.on("page", _attachPageListeners)`), not just the initial one —
previously a download triggered from a second tab was never captured at all. On a step failure, the
Tier 3/4 park (§10.1) and the failure response use the tab the failing step actually ran on
(`runErr.failedPage`), not always the initial page, so the recovery request's DOM fingerprint
describes the page that failed.

**Extra tabs are closed on every exit path** (`tabs.js::closeExtraTabs`, EXEC-14). A second
`_context.on("page", ...)` listener feeds a per-call `_openedTabs` set; every exit path — success,
cancelled, session-expired, non-parkable failure, and the parkable-failure branch (which keeps only
the tab being parked) — closes everything in that set it isn't keeping. Without this, a tab opened
mid-run was closed only when `watch: true` closed the whole browser context; in the default headless
path, whose browser is cached and reused per-company (`browser.js`), an unclosed extra tab would
otherwise leak for the life of that cache.

### 9.2 Page-Load Waiting

There is no artificial per-action pacing — steps execute back-to-back as fast as resolution and
the target page allow. The only wait between steps is `waitForPageLoad()`, and only when the
*previous* step's type is in `NAVIGATION_STEP_TYPES` (i.e. could have triggered navigation): it
waits for `domcontentloaded` (and `networkidle` too, if `CONXA_WAIT_NETWORKIDLE=1`) before the
next step resolves against the new page. Non-navigation steps have no inter-step wait at all.

(Earlier revisions added randomized human-like delays per action type and a minimum
"observer pause" after navigation, gated by `CONXA_HUMAN_PACING` and a per-company
`pack.pacing.observer_ms` — both were removed to make execution as fast as the page allows.)

### 9.3 File Upload Steps

A browser never exposes a picked file's full path — only `File.name` — so **nothing captured
while recording can ever be a valid upload target on the machine that replays the skill**. Upload
steps are therefore always parameterised, end to end:

| Stage | Behaviour | Where |
|---|---|---|
| Record | Native OS picker is suppressed and replaced by the Studio's own dialog (§6.1, §7.1); the resulting `set_files()` call still fires the input's `change` event via CDP, and `bridge.js` emits `upload_intent` off it, carrying `JSON.stringify(files)` metadata (`[{name, size, type}]`) for **every** file selected — a multi-select is captured in full — never a path | `recorder/session.py`, `bridge.js` |
| Clean | An `upload`/`upload_intent` on a file input **supersedes the preceding click/focus on the same target**, exactly the way `type` supersedes a text field's prep click. Replay must never see that click — clicking a file input reopens an OS dialog nothing can drive unattended | `compiler/step_anchors.py::clean_steps` |
| Compile | A file input is **not** an "editable target", so the click→focus rewrite never fires on it (the runtime's `focus` handler clicks before it focuses, which would reopen the dialog) | `compiler/action_semantics.py::is_editable_target` |
| Bind | Uploads always bind to the input name `file_path`, never a label-derived name — otherwise "File Uploader" / "Attach document" / "Upload CSV" would each yield a differently named input for the same concept | `compiler/input_binding.py::derive_input_binding` |
| Package | Recorded file *metadata* is recognised explicitly (it is truthy JSON, so an `or` fallback would pass it through as if it were a path) and replaced with `{{file_path}}`; a literal path or custom placeholder typed by hand in Human Edit is preserved as authored. The auto-declared input's description is enriched with the recorded example filename and states that **a folder path may be given** when the page's control accepts more than one file. It deliberately does **not** claim how many files the control takes — that is a property of the live page (`multiple`), not of how many files happened to be picked while recording, and a single-file recording against a multi-select control is normal | `skill_package_builder_saved_skill.py::_upload_input_descriptions` |
| Execute | `interpolate()` → `trim()` → strip one matching pair of surrounding double quotes (Windows Explorer's "Copy as path" quotes any path containing spaces, and Node only treats a bare drive letter as absolute — a quoted path would be silently joined onto the runtime's CWD) → **if the result is a directory, expand it to every file directly inside** (non-recursive, subdirectories excluded, naturally sorted so `invoice-2` precedes `invoice-10`) → `locator.setInputFiles(paths)`. An empty resolved path, or a folder containing no files, **throws** rather than skipping: silently not uploading a document while reporting success is this action's worst failure mode. `server.js`'s required-input gate should already have rejected the empty case; this is defence in depth | `runtime/run.js::resolveUploadPaths`, `HANDLERS.upload` |
| Gate | When more than one file resolved, the handler asks the **live element** whether it accepts multiple (`locator.evaluate(el => el.multiple)`) before acting. An explicit `false` throws a `badInput` error naming the file count and what to pass instead; an unreadable probe stays permissive and lets `setInputFiles` have its say. `badInput` surfaces immediately from `withLocator`'s retry loop and **skips the recovery cascade entirely** in `runPlan` — re-finding the element cannot fix wrong input, and letting it reach Tier 3+ would spend LLM tokens on a caller mistake the message already explains. Same short-circuit shape as the `isAuthFailure` check beside it | `runtime/run.js::HANDLERS.upload`, `withLocator`, `runPlan` |

Tests: `runtime/test/test_upload.js`, `conxa-cloud/tests/test_skill_package_builder.py`, `test_phases.py`,
`test_recorder_session.py`.

---

## 10. Recovery Architecture

### 10.1 Four-Tier Recovery Cascade + Ceiling

> This table is the canonical, authoritative recovery-tier reference — `README.md`, `AGENTS.md`, `docs/PRD.md`, `docs/App-Flow.md`, and `docs/cost_model.md` all link here rather than repeating it. Some of those docs describe this as a "5-tier" cascade, counting human review/escalation after T4 is exhausted as an informal fifth tier — that's a framing difference, not a contradiction; the automated cascade itself has exactly four tiers.

**Auth failures short-circuit the cascade.** A login redirect is not a selector/DOM problem T1/T2 can fix — before entering the cascade, `run.js` checks `isAuthFailure(page)` (URL/title heuristic) and, if true, fails the step immediately rather than spending T1/T2's ~10s budget against a login page. `server.js` then routes it through the non-blocking interactive-login flow (`docs/Auth-and-Updater.md` §1.3) instead of the T3/T4 agent-recovery payload — no screenshot, no DOM inventory, just an instruction to sign in and resume.

When step resolution fails to find the target (and it isn't an auth failure):

| Tier | Mechanism | LLM Cost | Trigger | Where |
|---|---|---|---|---|
| **T1** | Deterministic exception ladder (re-resolve / scroll / dismiss-overlay / wait-stable/enabled) over all bundle signals | Zero | Always first | `run.js` (in-process) |
| **T2** | a11y re-probe (role+name through the matcher), re-hover, fallback selectors, dialog-scope, fuzzy text | Zero | T1 fails | `run.js` (in-process) |
| **T3** | LLM **semantic** recovery — failed-step intent + live DOM inventory → Claude | Yes (text) | T2 fails | Agent-mediated handoff |
| **T4** | **Vision** recovery — failure screenshot + reference image → Claude | Yes (vision) | T3 insufficient | Agent-mediated handoff |

**Tiers 1–2 are in-process and zero-token** (`run.js:recoverStep`). **Tiers 3–4 are agent-mediated:** when the in-process cascade is exhausted the runtime returns a *structured recovery request* to the MCP client (Claude) — a Tier 3 semantic block (step intent, expected post-condition, executed-steps trace, and the live post-cascade interactive-element inventory) and a Tier 4 vision block (screenshots) — and the agent resumes by calling `execute_skill` again with a corrected selector. This is the **closing edge** of the cascade.

**Recovery ceiling (`CONXA_MAX_RECOVERY_TIER`, 1–4, default 4).** The zero-token cascade always runs; the env var caps whether the agent-mediated handoff (T3/T4) is offered:
- **Claude / MCP execution → ceiling 4** (default): full cascade; on T2 exhaustion the runtime emits the structured recovery request.
- **Build Studio sandbox → ceiling 2** (`conxa_runtime.py` sets `CONXA_MAX_RECOVERY_TIER=2`): no agent handoff. A step surviving T1/T2 fails deterministically so the compiled pack is judged on its own merits — there is no agent in a headless Studio run to act on a recovery request.

**Recovery request payload — current-state grounding.** `server.js:_buildFailureResponse` always captures the interactive-element inventory *live, after* the T1/T2 cascade has run — this is the state the agent's corrected selector will actually act on, since in-process remedies (dismiss-overlay, scroll, re-hover) can themselves change the page. The pre-cascade inventory (`run.js:captureEarlyDomSnapshot`, taken at the exact moment of failure) is included as a clearly-labeled secondary block only when it differs from the current one — e.g. a dropdown that was open at failure time but has since closed. The payload also carries: the step's expected post-condition (compiled assertions plus, when the failure was a verify-fail rather than a resolution miss, which assertion actually failed), a compact trace of already-executed steps, and explicit grounding instructions telling the agent that the current screenshot/inventory are ground truth and the recording-time reference image may be outdated.

**Closing edge — `step_overrides`.** `execute_skill` accepts `step_overrides: { "<0-based step index>": { "selector": "<Playwright selector>" } }` (keyed by the same index as `resume_from`). On resume the chosen selector is injected via the step's `_explicit_selector` channel (`run.js:applyStepOverrides`) and validated (`run.js:validateOverrideSelector`) against the step's recorded fingerprint before it is allowed to act — extending the "resolver never blindly picks candidate[0]" invariant (§10.2a) to the agent-override path. A unique match is accepted outright; a multi-match is scored the same way `resolver.js` scores compiled signals (reusing `scoreCandidate`) and only accepted when the winner clears the uniqueness margin. A no-match or ambiguous (tied) selector is rejected — the runtime does **not** fall through to `.first()` — and the resume instead returns a fresh recovery request that reports what the selector actually matched, so the agent iterates instead of silently acting on the wrong element. Overrides are honoured only when the ceiling ≥ 3, so a stray override can never silently rewrite a pack under deterministic Studio test.

**Cross-call page parking (the state-preservation half of the closing edge).** Agent recovery is inherently cross-call (runtime fails → Claude reasons → runtime resumes). If the failed page were torn down, the resume would begin on a blank page and `resume_from` would skip the navigation that established state — so the agent's *correct* selector would act on the wrong page and fail again. On a parkable failure (single run, ceiling ≥ 3, a selector/verify failure that is not auth/cancel), the runtime **parks the live page+context+browser** keyed by skill+company instead of closing it (`server.js:_parkedRecovery`), together with a cheap page-state token (`capturePageFingerprint`: url + interactive-element count + a hash of visible body text), with a TTL (`CONXA_RECOVERY_PARK_TTL_MS`, default 180s) that closes it if the agent never resumes. When the matching resume-with-override arrives, the runtime recomputes the fingerprint and compares it to the one captured at park time — a page that has since navigated or whose interactive-element count shifted materially (a live SPA re-render, a timer, a websocket push) is treated as **diverged**: the park is discarded and the override is refused rather than silently applied to state the agent never actually reasoned about. If no live, state-matching park exists at all (TTL expired, page crashed, or diverged), the runtime refuses the resume outright — it does not fall back to silently opening a fresh page mid-plan — and asks the agent to restart the skill from the beginning. When the park does match, the runtime adopts it and applies the override to the exact DOM the recovery request described. An unrelated/new run discards any stale park first. Headless browsers are reclaimed by `browser.js`'s per-company idle cache; a visible (`watch`) browser is closed on discard. Events: `recovery_park_created` / `recovery_park_resumed` / `recovery_park_discarded` / `recovery_park_state_mismatch` / `recovery_resume_refused`.

Retry budget: `RETRY_BUDGET_MAX = 3` per (skill, step_index). On exhaustion → `retry_budget_exhausted` event logged, escalate. The counters live in a module-level map for the life of the MCP server process, so `runPlan` clears the running skill's slice of it at the **start of every invocation** (in addition to the success-path clear in `server.js`). Without that, a failed run left its counts behind and the next run of the same skill in the same session began already exhausted, silently disabling self-healing until Claude Desktop restarted.

Recovery observability: `mcp_connected`, `execute_start`, and `get_runtime_status` all report `max_recovery_tier`; the recovery log records `recovery_ceiling_reached`, `agent_recovery_requested`, `agent_override_applied`, `agent_override_rejected` (the override validation gate refused a no-match/ambiguous selector), `recovery_park_state_mismatch`, and `recovery_resume_refused` events.

### 10.2 Selector Scoring

The resolver's scoring oracle is `IdentityBundle.fingerprint` (an `ElementFingerprint`) — a stable
identity to score DOM candidates against:
- `data_testid` — highest stability signal
- `aria_label`, `role`, `name` — a11y tree signals
- `inner_text` — visible text (max 120 chars)
- `anchor_phrases` — relational context phrases
- `position_hint` — normalized x/y (0.0–1.0)

Each candidate gets a weighted score; the uniqueness/margin gate (below) decides the winner.

### 10.2a IdentityBundle Resolution (primary runtime path)

`IdentityBundle` is the **single source of truth** for element identity: a durability-ranked,
orthogonality-deduplicated set of `IdentitySignal`s plus the scoring `fingerprint`, `stable_hash`,
`frame_chain`, `shadow_path`, and `guid_like_attrs`. The runtime resolves every step's primary
target through it — there is **no legacy `compiled_selectors` / single-selector primary path**, and
frame roots are driven solely by `identity_bundle.frame_chain`. Packs without an `identity_bundle`
fail fast (recompile required).

- **Compile (`conxa_compile/compiler/identity_bundle.py`, `selector_score.py`,
  `selector_filters.py`):** signals are generated in Playwright native grammar
  (`internal:testid=`, `internal:role=…[name=…]`, `internal:text=`, relational
  `>> right-of=`), scored by `durability = base_durability(engine) × survival_prior ×
  stability_adjustments`, deduplicated to one signal per orthogonality class (test-contract,
  semantic-aria, visible-text, spatial-anchor, structural), and gated by uniqueness-at-compile,
  PII-binding, and an xpath/shadow guard. `stable_hash` (`stable_hash.py`) is
  SHA-256 over tag-path + sorted static attrs + AX name, with dynamic
  (focus/hover/active/animation/`is-*`) classes stripped.
- **Replay (`runtime/resolver.js` + `runtime/resolve_adapter.js`):** the **primary** resolution
  path. `resolve_adapter.js` maps each `IdentitySignal` to a Playwright locator
  (`signalToLocator`: engine → `getByTestId`/`getByRole`/`getByText`/`locator`), pre-gathers
  candidate descriptors per signal (`gatherCandidates`), then hands the pure `resolve()`
  (`resolver.js`) a synchronous map view. `resolve()` walks signals in durability order with a
  strict uniqueness gate — it never blindly takes candidate `[0]`. On multi-match it scores each
  candidate against `fingerprint` and accepts a winner only when its margin over the runner-up
  clears the threshold; otherwise it falls through to the next signal. `stable_hash` is the
  tie-breaker. `run.js` `withLocator(…, PRIMARY, …)` calls `resolveStep()`; a miss/ambiguous throw
  engages the recovery cascade. (Recovery still uses an explicit-selector mode via
  `stepWithSelector`.)
- **GATE (`run.js` `gateLocator`):** before every action — attached → visible → RAF-stable
  (bounding box unchanged across two frames) → enabled (`disabled`/`aria-disabled`). Budget is
  confidence-adaptive. Zero LLM.
- **VERIFY (`run.js` `verifyStep`):** after every action — independent post-condition check of
  the step's compiled assertions (`url_changed`/`url_pattern`, `selector_present/absent`,
  `text_present/absent`, `value_equals`, `state_changed`). Every consequential action (submit
  click, destructive confirm, text entry/select) compiles with exactly one **required**
  (enforced) assertion — the compiler's deterministic "primary signal picker" in
  `build.py:_build_assertions`; everything else stays advisory. `value_equals` compares the
  field's actual value to the expected one (normalized, with a contains fallback for
  masked/formatted fields). `state_changed` is synthesized for commit/destructive clicks with no
  recorded URL/DOM evidence — it confirms the page shows *some* observable effect (URL,
  interactive-element count, or body-text delta beyond a small noise tolerance), catching a
  button that silently no-ops. A failed *required* assertion descends into recovery; advisory
  failures are recorded only.
  - **Web-first polling, not a single sample:** positive checks (`url_*`, `text_present`,
    `value_equals`, `state_changed`) retry their predicate every `VERIFY_POLL_INTERVAL_MS` (250ms)
    until it holds or the assertion's `timeout_ms` elapses — a slow render or an optimistic-UI
    update landing after the action no longer reads as a false failure. `selector_present` rides
    Playwright's own `waitFor`, which already polls. Negative checks (`selector_absent`,
    `text_absent`) additionally require the absence to still hold after a `NEGATIVE_STABILIZE_MS`
    (500ms) recheck, so a flicker (gone → back → gone) can't false-pass a check taken mid-load.
  - **Full assertion audit:** `verifyStep` evaluates every assertion on the step — not just up to
    the first required failure — and returns `results: [{type, target, required, ok,
    elapsed_ms}]` alongside `{pass, channel, evidence}`. On the primary execution path (not
    recovery re-verification), the runner emits one `verify_result` telemetry event per step that
    carries assertions (`{si, ok, n, advFail}`), giving the fleet dashboard visibility into
    advisory-assertion decay before it becomes a hard failure. A required verify-fail also attaches
    the full `results` array to the thrown error as `verifyResults`, alongside the existing
    `earlyDomSnapshot` (interactive-element inventory at the moment of failure).
  - **Post-condition distillation (recording-next-steps.md Priority 1, 2026-07-10):** the recorder
    (`bridge.js::finalizeStateWithAfter` → `buildPostCondition`) classifies the same before/after
    evidence it already captures into a small structured `post_condition` on the event —
    `classified_effect` (`navigation`/`dialog_opened`/`dialog_closed`/`expansion`/`value_set`/
    `content_change`/`none`), a redaction-safe `value_readback` (never populated for password/
    sensitive fields — same `isSensitiveEditable` rule bridge.js applies elsewhere), and a
    `dialog_signal` selector for the opened container. `build.py::_build_assertions` prefers this
    live evidence over the generic wait_for/success_conditions inference when present: a
    `dialog_opened` classification claims the enforced slot as a `selector_present` on
    `dialog_signal`; a `value_set` classification's `value_readback` (if non-redacted) becomes the
    `value_equals` assertion's `expected`, catching framework normalization/combobox commits the
    recorded intent value wouldn't show. `StateChange.dom_diff` — computed by bridge.js on every
    action but previously dropped by the model — is now carried through as the `content_change`
    fallback signal. `RecordedEvent.post_condition` and `StateChange.dom_diff` are both optional;
    old recordings validate unchanged. No runtime change — `run.js`'s `evaluateAssertion` already
    handles every assertion type this preference pass can produce.
  - **Click-family "after" capture waits for the DOM to settle (2026-07-13):** `bridge.js`'s
    click/dblclick/right_click listeners run in the event's **capture phase** — before the page's
    own bubble-phase handler (e.g. a React `onClick`) has even fired. Calling `finalizeState()`
    synchronously there (the historical behavior) always diffed the page against itself: the
    "after" snapshot was taken before the click's own effect — a revealed dropdown, panel, or
    dialog — had a chance to render, so `state_change.dom_diff` came back empty on effectively
    every click. This was the root cause of validation-less/"click new button"-style vague
    checks: `merge_dom_diff_evidence` had nothing to fold in, so intent-derived-token grounding
    (see `decision_layer.py::intent_tokens_grounded_in_context` below) correctly rejected
    ungrounded guesses but left the step with zero real evidence to fall back on. Fix:
    `finalizeStateAfterSettle()` defers the "after" capture behind a short mutation-quiet window
    (`click_settle_quiet_ms`, default 20ms) capped at a hard ceiling (`click_settle_max_ms`,
    default 250ms), queued so two fast clicks in a row still finalize in submission order. Covered
    by `test_recorder_bridge_js.py::test_click_that_synchronously_reveals_element_is_captured_in_dom_diff`,
    which fails against the old synchronous capture and passes with the settle wait.
  - **Ephemeral filtering at compile time:** `validation_planner.py::infer_success_conditions`
    runs `required_elements` candidates through `selector_filters.py::is_ephemeral_anchor` before
    handing them to `build.py::_build_assertions`'s primary-signal picker — a cookie-banner/toast/
    notification-shaped element can never land in the REQUIRED promotion slot; it's demoted to an
    advisory `text_present` token instead of dropped.
  - **Fleet dashboard:** `app.services.tracking._assertion_health_by_step` aggregates
    `verify_result` events per (company, workflow, step) into a pass-rate view, exposed on
    `GET /api/v1/tracking/dashboard` as `assertion_health_by_step` and rendered on the Cloud
    Dashboard's Self-healing page, `/dashboard/healing` (§3.2 `docs/UI-UX-Brief.md`) —
    worst-pass-rate steps surface first. It is also one of the five weighted inputs to the
    platform health score.
  - **Human Edit UI + patch gate:** `StepConfigForm.tsx` carries a self-contained Validation card
    (shared `components/validation/AssertionEditor.tsx`, also used by the re-target wizard's
    Validation phase) that saves independently via `patch_step`'s `validation.assertions`.
    `conxa_compile/editor/patch_gate.py::validate_editor_patch` is now called from
    `cmd_patch_step` before any patch is merged/persisted — a manual edit that would drop a
    consequential step's only required assertion is rejected outright, not just flagged.

### 10.2b Layer 1 / Layer 2 zero-token recovery

`runtime/recovery.js` adds an exception-classified ladder ahead of the existing cascade:

- **Layer 1 (`classifyException` → `layer1Ladder`):** maps the thrown error to a single
  deterministic remedy — stale → re-resolve, intercepted → dismiss-overlay (Escape),
  out-of-bounds → scroll-into-view, not-stable → wait-stable, not-enabled → wait-enabled — then
  retries the primary selector once.
- **Layer 2:** a11y re-probe, transient retry, **re-hover-then-retry** (walks the precompiled
  `handler_hints.hover_chain` for menu reveals), fallback selectors, dialog scope, fuzzy text.
- **Re-verify on recovery:** every Layer 1/2 remedy that re-runs the action funnels through
  `recoverWithSelector`, which — when the step carries a required assertion — re-invokes
  `verifyStep` after the re-run and only reports the remedy successful if the post-condition
  re-holds. A recovered action that doesn't re-establish its post-condition still fails the step.
  A verify-fail (`classifyException` → `CLASS.VERIFY_FAIL` → `remedyFor` → `"descend-layer2"`)
  skips the Layer 1 single-remedy retry entirely — retrying the same action against the same,
  already-checked DOM can't fix a failed post-condition — and falls straight through to Layer 2's
  resolution-changing mechanisms.

On any recovery success the runner emits a structured **`repair_event`** (step id, tier, method,
score/margin, `stable_hash`, app-version fingerprint, drift hint). This is **ephemeral per-run
telemetry** — the signed local pack is never mutated; a durable fix is only ever an
admin-reviewed, manually published re-sign (see §10.5).

### 10.5 Drift Flywheel (admin-gated)

`repair_event`s ingest via `POST /tracking/{company}/events` and aggregate into an admin review
queue at **`GET /api/v1/tracking/{company}/drift`** (`_drift_review_queue`), keyed by
(workflow, version, step). **Detection is automatic and fleet-wide; publishing is always
admin-approved, never automatic** — the endpoint surfaces evidence only and marks entries
`needs_review`. No re-sign or fleet push happens without an explicit admin action.

### 10.6 Pre-Execution Drift Gate (advisory)

Each pack carries a compiled `structural_fingerprint` (the first ~3 interactive "landmarks" — see
compiler `_build_structural_fingerprint`), plumbed through `skill_package_builder.py` into the runtime
`manifest.json`. Before executing step 0, `runPlan` calls `runtime/drift.js` `detectPreExecDrift`,
which locates each landmark on the live page (testid → aria-label → primary selector → text) and
scores it with the **pure resolver** (`scoreCandidate`, zero LLM). If a majority of landmarks are
missing (default: ≥50% below a 0.5 agreement threshold) it emits a **`drift_detected`** event.
This is **warn-not-block** — execution always proceeds and per-step recovery still applies (consistent
with the zero-token Tier 1/2 rule). The cloud aggregates these per (workflow, version) via
`_pre_exec_drift_queue` and returns them under `pre_exec` in the `/drift` response.

### 10.3 Dialog-Scoped Recovery

If the element is expected inside a dialog, recovery first restricts the search to `[role="dialog"]`, `[role="alertdialog"]`, `[aria-modal="true"]`, `.modal`. Fuzzy fallback expands to the full page if no match.

### 10.4 No-Recovery Steps

`frame_enter` and `frame_exit` actions carry `no_recovery_block`. These are structural markers, not interactive steps, and are never retried. `tab_open`, `tab_switch`, and `popup` carry `no_recovery_block` for the same reason — the tab switch they mark already happened via `resolveStepPage()` (§9.1a) before the step's own handler runs, so there is nothing on the marker step itself to retry. `if_present`, `try_dismiss`, and `wait_for_one_of` (§10.7) carry `no_recovery_block` for the same reason — they are best-effort by design, not because they lack a target.

### 10.7 Conditional / Branch Steps (EXEC-1)

Optional interstitials — cookie/consent banners, session-expired screens, optional MFA, A/B-tested
variants — used to be indistinguishable from a genuine selector failure: every such case escalated
through the full recovery cascade, including paid Tier 3/4 LLM recovery billed to the customer's
own Claude usage. Three step types give the compiled skill a way to express "this element sometimes
appears" directly, so the runtime handles it without ever touching recovery:

| Type | Shape | Behavior |
|---|---|---|
| `if_present` | `{ type, selector\|identity_bundle, timeout_ms, steps: [...] }` | Probes for the target up to `timeout_ms`; if present, runs the nested `steps` body. |
| `try_dismiss` | `{ type, candidates: [...], timeout_ms, fallback_escape? }` | Probes each candidate selector in order; clicks the first present one (best-effort). Falls back to `Escape` unless `fallback_escape: false`. |
| `wait_for_one_of` | `{ type, options: [{selector\|identity_bundle, steps?}], timeout_ms, required? }` | Polls all options up to `timeout_ms`; the first to appear wins and its `steps` (if any) run. On timeout: no-op unless `required: true`, in which case the step fails normally (and *can* enter recovery, since a `required` miss is a real failure). |

**Runtime** (`runtime/run.js`): `probePresent(page, spec, inputs, timeoutMs)` is a non-throwing
presence probe (selector-count or `identity_bundle.signals` resolution, polled via the existing
`pollPositive`). `runBranchBody` executes each nested step through the same `executeStep`/`HANDLERS`
dispatch as top-level steps, wrapping each in try/catch so a failed nested action (e.g. the accept
button moved) is swallowed rather than propagated — the branch body never escalates to Tier 1-4
recovery, since `recoverStep` only fires on a throw escaping `runPlan`'s per-step try. Nested steps
that carry only a plain `selector` (no `identity_bundle`) are normalized via `resolvableBranchStep`
into string mode (`_explicit_selector`, the same mechanism recovery uses) — interactive handlers
like `click` otherwise resolve exclusively through `identity_bundle.signals` and throw immediately
if none exist.

**Version gate**: an older runtime silently no-ops an unrecognized step `type` (see `executeStep`),
which for a branch step means skipping its entire nested body — for `wait_for_one_of` gating an
MFA step, that's a correctness bug, not a graceful degrade. `SkillMeta.required_runtime` (enforced
at execute time via `semver.satisfies`) is the existing guard; `skill_package_builder_output.py`'s
`CONXA_REQUIRED_RUNTIME` floor (default `>=1.0.3`, applied pack-wide — see the `NOTE(branch-steps)`
comment there) must be bumped to the app-layer version that first ships these handlers once that
version is tagged (same manual-coordination pattern as `MIN_HOST` in `build-runtime-app.yml`).
**Confirmed 2026-07-10 still not tagged**: `git merge-base --is-ancestor 45896e7 app-v1.3.4` fails
(the branch-executor commit is on `main` but not in any tagged app-layer release) — do not bump
the floor until it lands in one, or every pack (branch steps or not) would refuse to run.

**Compiler / schema** (`packages/conxa-core/conxa_core/models/skill_spec.py`): `SkillStep.branch`
(`dict`) holds `steps` (`if_present`), `candidates` (`try_dismiss`), `options` (`wait_for_one_of`),
`timeout_ms`, `required`. Nested step entries are raw dicts in the same shape as a saved `SkillStep`
(`action`/`target`/`identity_bundle`/`branch`/...) — `skill_package_builder_saved_skill.py`'s
`_saved_step_to_execution_step` recursively serializes each one (and each `wait_for_one_of` option's
`steps`) into the flat runtime step shape above. `action_policy.NO_RECOVERY_ACTION_TYPES` and
`action_registry.SELECTOR_ACTIONS` register the three kinds; they are **not** in `MARKER_ACTIONS`
(they carry a real probe target, unlike `frame_enter`/`tab_open`) and, as of 2026-07-10, **are**
in `INSERTABLE_ACTIONS` (see Editor authoring below).

**Foundation scope**: schema, runtime executor, and build-serializer passthrough — shipped
2026-07-09. A conditional branch could initially only be authored directly as
`execution.json`/saved-skill JSON (see `runtime/test/gate-skill/` for a worked example — an
`if_present` step dismisses a fixture cookie banner before the gate click). A curated
dismiss-pattern library is tracked separately in `TODO.md` (EXEC-5).

**Recorder observation + human-gated confirmation (recording-next-steps.md Priority 2,
2026-07-10)**: the recorder itself still never emits `if_present`/`try_dismiss`/`wait_for_one_of`
directly from a live recording — it only *observes* and flags. `bridge.js::detectOptionalContainer`
walks up from each action's target (bounded, 10 levels) looking for `[role=dialog]`/
`[aria-modal="true"]`, or an id/class token match against a small consent/banner heuristic list
(`cookie`, `consent`, `gdpr`, `onetrust`, `truste`, `banner`). A `role=dialog`/`aria-modal` match is
stamped unconditionally; a banner-token match is checked against a small ring buffer of recent
`dom_diff.added` signatures (`_containerAppearedRecently`, fed by Priority 1's `dom_diff` — a
second consumer of the same signal) to distinguish "this banner just appeared" from "this banner
was always on the page," but an unconfirmable check (empty buffer, e.g. first action of the
session) still stamps — false positives are harmless. A match sets
`RecordedEvent.optionality = "stochastic"` and `branch_hint = {kind: "try_dismiss",
container_signal}`. `build.py` carries this onto `SkillStep.optional_hint` **verbatim, advisory
only** — it does not change compiled behavior; the step still compiles as a normal required linear
step, honoring the invariant that branch steps compile only from observed states + human
confirmation. `StepEditorDTO.optional_hint` surfaces it read-only; Human Edit
(`WorkflowStepItem.tsx`'s `StepBadges`) renders a "treat as optional?" affordance that calls
`cmd_confirm_optional_interstitial` →
`workflow_mutations.confirm_optional_interstitial`, which rewrites the step's `action` to
`try_dismiss` and scaffolds `branch.candidates` from the step's own recorded selector plus the
observed `container_signal`, then clears `optional_hint`. This is a structural mutation (same shape
as `insert_branch_step`/`delete_branch_step`) — it bypasses `patch_gate.py` entirely rather than
going through `cmd_patch_step`.

**Editor authoring (2026-07-10, closes the remaining EXEC-1 gap)**: `if_present`/`try_dismiss`/
`wait_for_one_of` are now insertable from Human Edit's Add-action menu. `if_present`'s nested
`steps` body is fully editable: `insert_branch_step`/`delete_branch_step`/`reorder_branch_steps`
(`conxa_compile/editor/workflow_mutations.py`) handle structural add/remove/reorder via matching
`cmd_*` RPCs (`handlers/workflow_editor.py`); per-field edits on a nested step reuse
`cmd_patch_step` with a new optional `path` parameter (`"branch.steps[N]"`) that resolves the
nested dict inside `steps[step_index]["branch"]["steps"]` instead of a top-level step, then
routes through the same `_apply_step_patch` helper (selector-quality gates + `identity_bundle`
rebuild) the top-level flow uses. `patch_gate.py::validate_editor_patch` gained an
`in_branch_body` flag: when true, `recovery`/`validation` patch keys are rejected outright, since
branch bodies are best-effort and never enter Tier 1-4 recovery (this section, above) — a nested
step's recovery/validation blocks would be dead configuration if editable. `try_dismiss`'s
`candidates` and `wait_for_one_of`'s `options` accept a normal `branch` key patch (each selector
quality-gated the same way as `target.primary_selector`) but have no dedicated authoring UI yet —
`BranchBodyEditor.tsx` only covers `if_present`; see `TODO.md` BUILD-6. Human Edit's DTO
(`StepEditorDTO.branch_summary`/`.branch_steps`) surfaces the same data read-only for review — see
`research-analysis/Human-Edit-vs-Skill-Package.md` and `docs/Implementation-Plan.md` §1.11.

---

## 11. Skill Sync & Update Architecture

### 11.1 Skill Pack Delta Sync

**Endpoint:** `GET /api/v1/skill-packs/{company}/delta?since={json-map}`

**Current state:** `since` is a JSON-encoded map of `{skill_slug: last_known_version}` (see §5.9 for the full contract and §5.6 for the sequence). Each skill is compared against its own version independently — `_build_delta()` in `skillpack_update_routes.py` returns `{"name": slug, "action": "no_change", "group": group_id}` for unchanged skills and `{"name": slug, "version", "action": "update", "group": group_id, "files": [...]}` for changed ones, where `group_id` comes from `pack.json`'s `skill_groups` map (falling back to `"_default"`). Republishing one skill never triggers a re-download of the others. Within a changed skill, all of that skill's files (`execution.json`, `recovery.json`, `inputs.json`, `manifest.json`, `validation.json`) are still sent — there is no per-file checksum comparison *within* a single skill, which remains a real but low-impact gap (a handful of small JSON files, not a whole company pack). Rate-limiting is KV-backed (`rate_limits` namespace in `conxa_core.db`), persisted across restarts and shared across instances — not the in-memory dict this section used to describe, and Redis was deliberately not introduced (see `docs/Security.md` SG-04).

`group` in the response is what lets `runtime/sync.js` write each skill's files into its nested `skill-packs/{company}/{group_id}/{skill_slug}/` directory (§5.2a) instead of the pre-Groups flat layout — the client's own version-comparison lookup only ever checks the nested path, so upgrading to this changes nothing observable except that every skill gets freshly redownloaded into its nested location exactly once, the next time each runtime syncs.

### 11.2 Atomic File Updates

`sync.js` uses transactional file writes:
1. Backup existing skill dir (`skill_dir.bak`).
2. Write each file to `.tmp` suffix.
3. SHA-256 verify content matches delta entry.
4. Atomic rename `.tmp` → target.
5. On any failure → restore from backup.
6. On full success → delete backups.

### 11.3 Runtime Self-Update

One signed manifest, two components decided independently from two different call sites; see §5.8 for the full sequence diagram.

**App layer** — checked pre-load, in `bootstrap.js`, via `GET /api/v1/manifest.json` (no local TTL — every launch fetches, Ed25519-verified). A zip is downloaded, extracted to `conxa-app/<version>/`, and `version_manager.activate()` flips the `current` junction — all before `server.js` is `require()`'d, so it's effective on the *same* cold start that downloaded it. A `min_host` floor on the manifest entry refuses the update outright (rather than activate-then-rollback on every launch) if the host exe is too old to run it.

**Host layer** — checked post-load, in `server.js`'s `startupSync`, reusing the manifest `bootstrap.js` already fetched this launch rather than fetching again. Downloads `conxa-runtime.exe` + `keytar.node` into their own `conxa-runtime/<version>/` directory:

| File | Staged into | Activated by |
|---|---|---|
| `conxa-runtime.exe` | `conxa-runtime/<version>/conxa-runtime.exe` | `--selfcheck` must exit 0, then `version_manager.activate()` flips `conxa-runtime/current` |
| `keytar.node` | `conxa-runtime/<version>/keytar.node` | same activation, no separate step |
| Chromium | N/A (downloaded by Playwright) | `--install-playwright` run through `conxa-runtime/current/conxa-runtime.exe` |

Because the new version lands in its own directory rather than overwriting the currently-running exe's file, activation can happen immediately rather than being deferred to "the next safe restart" — there is nothing to defer. If `--selfcheck` fails, activation is aborted regardless of a matching SHA-256 (a checksum only proves the download wasn't corrupted, not that it boots), and `current` is left pointing at the previous, still-good version.

---

## 12. Telemetry Architecture

### 12.1 Event Schema (compact)

Emitted by `runtime/tracker.js`:

| Event code | When | Fields |
|---|---|---|
| `wf_start` | Workflow begins | `ts`, `tot` (total steps) |
| `step_ok` | Step succeeds | `ts`, `si` (step index), `tier` (recovery tier used) |
| `step_fail` | Step fails | `ts`, `si`, `code` (error code) |
| `recovery_tier{N}` | Recovery attempted | `ts`, `si`, `tier` |
| `wf_ok` | Workflow succeeds | `ts`, `dur`, `tot`, `rec` (recovered steps) |
| `wf_fail` | Workflow fails | `ts`, `dur`, `fsi` (failed step index), `fc` (failure code) |

### 12.2 Batch Payload

```json
{
  "rid": "run_id",
  "wfid": "workflow_id",
  "wfv": "workflow_version",
  "rv": "runtime_version",
  "uid": "user_id_hash",
  "wid": "workspace_id",
  "sv": 1,
  "evts": [{"e": "wf_start", "ts": 1717000000, "tot": 5}, ...]
}
```

Header: `X-Tracking-Token: <token from pack.json>`

### 12.3 Storage & Query

- Stored in `kv_store` table under namespace `tracking/{company}`, key = `run_id`.
- `db_append()` appends batches to a JSON array.
- Queried by `tracking_routes.py` — Clerk-authenticated dashboard endpoints.
- Workspace scoping: `_batches_for_principal()` filters by `workspace_id` in batch.

---

## 13. LLM Router Architecture

**Location:** `conxa-cloud/backend/app/llm/router.py`

### 13.1 Provider Pool

The cloud maintains a flat pool of `(provider, endpoint, api_key, text_model, vision_model, pool, auth_style)`
tuples. Multiple keys per provider expand to multiple entries. `PoolEntry.pool` (`"free"` | `"premium"`)
and `auth_style` (`"bearer"` | `"api_key_header"`) were added 2026-08-08 for the tiered compile pool
and BYOK (§13.1a, §13.5) — every pooled provider keeps `auth_style="bearer"`, only BYOK entries use
`"api_key_header"`.

Enabled providers (current defaults):
- **Groq** — `llama-3.3-70b-versatile` (text), `llama-4-scout-17b` (vision)
- **Google AI Studio** — `gemini-2.5-flash` (both)
- **NVIDIA NIM** — `llama-4-maverick-17b` (text), `llama-3.2-90b-vision` (vision)

Disabled by default (toggle via env): Cerebras, Together, OpenRouter, Mistral.

### 13.1a Tiered Compile Pool

`Settings.llm_premium_providers` (env `LLM_PREMIUM_PROVIDERS`, comma-separated provider names, e.g.
`google_ai_studio,nvidia_nim`) tags matching providers `pool="premium"` in `enabled_llm_providers()`;
everything else defaults to `pool="free"`. `llm_proxy_routes._meter_and_call` reads the calling
workspace's `compile_pool` capability (`entitlements.compile_pool_for`) and passes it to
`route_text`/`route_vision` as the `pool` kwarg. `LLMRouter._next_available_entry` filters on it.

If the requested pool has no available entry (e.g. no premium provider configured), the router falls
back to any pool rather than failing a paying customer's compile over an ops misconfiguration — logged
via `_debug_log`, not surfaced as an error. At least one premium provider must be enabled for Starter/Pro
compile quality to actually differ from Free; see `ROUTER_SETUP.md`.

### 13.2 Router Behavior

- Round-robin with cooldown: entries that return 429 are cooled. `LLMRouter` honours the
  provider's own `Retry-After` header (numeric seconds, capped at 3600) when present;
  otherwise it falls back to the flat `llm_router_cooldown_secs` (60s default). A provider
  asking for a 2s backoff no longer costs the pool a full 60s.
- Bounded wait for a cooled pool: if every entry matching the request (respecting the
  `for_vision`/`pool` filters) is cooled — not merely absent — `route_text`/`route_vision`
  sleeps once, capped at `LLMRouter.wait_ceiling_secs` (8s), for the soonest entry to clear,
  then retries selection. This is what stops a single transient 429 from silently degrading
  every step compiled in the next minute (vision anchors fall back to keyword anchors per
  step — see `compiler/build.py::_RECOVERABLE_VISION_ANCHOR_REASONS` — and that fallback used
  to be effectively guaranteed for the whole cooldown window). If the wait would exceed the
  ceiling, or no entry matches the request at all (a config gap, e.g. no provider has a
  `vision_model`), it fails fast as before.
- Failover: on error, moves to next entry.
- Max retries: `llm_router_max_retries` (3 default).
- Fast text preference: when `llm_router_prefer_fast_for_text=true`, text calls prefer low-latency providers.
- `LLMRouter.call_entry_directly` bypasses pool selection and cross-provider failover for a
  caller-supplied `PoolEntry` — used only for BYOK (§13.5), where there's exactly one deployment to
  call and the shared pool's rotate/cool-down/drop-on-401 machinery (built for many interchangeable
  keys) doesn't apply.
- `error_detail` (an optional `list[str]` every call site can pass) collects a human-readable
  line per failed attempt — e.g. `HTTPError 429 rate_limited (cooled 2s): <provider body>`.
  `llm_proxy_routes.py` returns this list (capped at 8 entries) in a 502's
  `{"message": "llm_all_providers_failed", "error_detail": [...]}` body when every provider
  fails, and `services/llm_proxy_client.py` (Build Studio's proxy client) unpacks that dict
  shape into its own `error_detail` list instead of collapsing it to a bare `"proxy HTTP 502"`
  — so a `VisionAnchorGenerationError`'s `hint` (and the resulting `vision_anchor_fallback`
  compile warning) names the actual provider failure, not just the HTTP status.

### 13.3 Build Studio → Cloud Proxy

Build Studio's LLM calls go through `services/llm_proxy_client.py`:
- Target: `POST /api/v1/llm/proxy/text` or `/api/v1/llm/proxy/vision`
- Header: `Authorization: Bearer <Clerk access_token>`
- Header: `X-Conxa-Client: build-studio`
- Header: `X-Conxa-Machine: <sha256 of Windows MachineGuid>` — omitted if unreadable; see §13.4a
- Body includes `usage_class`: `compile` or `human_edit`. Missing values default to `compile` for rollout compatibility.
- Compile LLM calls record compile input/output tokens; Human Edit LLM calls draw from the workspace's monthly Human Edit pool.
- `CloudUnreachable`, `QuotaExceeded`, and stable entitlement errors propagate up to the compiler, which surfaces them as `compile_error` events to the renderer.

### 13.4 Entitlements And Visible Meters

**Rewritten 2026-08-08** for the capability ladder (docs/PRD.md §11): the per-slug `skill_pack_slots`
meter was removed entirely — a workspace may publish under unlimited product slugs on every tier —
and reach is now gated by *capability* keys (distribution, white-label, ops tier, BYOK) rather than a
count. `machines` replaced it as the numeric meter, enforcing the trial-abuse/seat-integrity control.

The cloud exposes four customer-visible numeric meters, all defined in `PLAN_LIMITS`
(`conxa-cloud/backend/app/services/entitlements.py`):
- `seats`
- `machines` — distinct build-side devices a workspace has registered (§13.4a)
- `compile_credits`
- `human_edit_tokens`

...and five capability keys that shape what a plan can *do*, not just how much:
- `distribution` — `"internal"` (Free only) or `"external"` (Starter, Pro, Enterprise). Starter's
  distribution volume isn't machine-capped — it's naturally bounded by its 200 compile-credit ceiling,
  since every meaningful update requires a fresh compile before it can be republished. Free is the only
  tier with a hard machine restriction — see the machine lock and delta-sync gate under §13.4a.
- `white_label` — bool; Enterprise only
- `ops_tier` — `"none"` (Free), `"basic"` (Starter), `"full"` (Pro, Enterprise)
- `compile_pool` — `"free"` or `"premium"`; which router pool compiles route to (§13.1a)
- `byok` — bool; Enterprise only (§13.5)

Plan defaults:
- `free`: 1 seat, 1 machine, 25 compile credits/mo, 500K Human Edit tokens/mo, 30-day `trial_days`,
  internal distribution, no white-label, `ops_tier="none"`, free compile pool, no BYOK.
- `starter`: 3 seats, 3 machines (Build Studio dev-side seats only — its distributed installer output
  reaches unlimited customer machines), 200 compile credits/mo, 2.5M Human Edit tokens/mo, external
  distribution, no white-label, `ops_tier="basic"`, premium compile pool, no BYOK.
- `pro`: 10 seats, 10 machines, 500 compile credits/mo, 10M Human Edit tokens/mo, external
  distribution, Conxa-branded (no white-label), `ops_tier="full"`, premium compile pool, no BYOK.
- `enterprise`: explicit workspace overrides for the numeric limits; capability floor is external
  distribution, white-label, `ops_tier="full"`, premium pool, BYOK.
- `development`: unlimited numerics, full capabilities.

Legacy `basic` billing records normalize to `starter`. Paid (Cashfree-subscribed) workspaces use `billing:<current_period_end_unix>` as the usage period and reset at the next monthly payment timestamp stored on the billing record. Workspaces without a subscription timestamp fall back to the UTC calendar month (`YYYY-MM`) and reset at the first day of the next UTC month.

Compile flow (first compile and recompile alike):
1. Build Studio calls `POST /api/v1/usage/compile/reserve`, sending `X-Conxa-Machine` (§13.4a) alongside the existing `X-Conxa-Client` header — whether the workflow already has a `skill_id` (a recompile) or not (a first compile) makes no difference here.
2. If reservation fails — quota, machine limit, or trial expired — local compile is blocked before pipeline work starts.
3. Build Studio commits the reservation before the first LLM-bearing compiler stage.
4. If failure occurs before commit, Build Studio calls release. If failure occurs after commit, the credit remains consumed.
5. Proxied LLM calls during the compile run use `usage_class="compile"`.

LLM-assisted Human Edit:
- The Human Edit token pool is spent only by editor-triggered LLM paths, never by `cmd_compile`: the visual editor (`handlers/visual.py`), the workflow editor (`handlers/workflow_editor.py`), the 1-click fix selector-regeneration API (`compiler/patch.py::_regenerate_compiled_selectors`), and the Human Edit "draw a new region" retarget wizard (`region_selector_vision.py`).
- Those calls use `usage_class="human_edit"`. Deterministic editor actions stay available when the Human Edit pool is exhausted.
- The LLM proxy also enforces trial expiry and machine registration on every call (`app/api/llm_proxy_routes.py::_meter_and_call`), and routes to the workspace's `compile_pool` (or a BYOK entry — §13.5 — when configured).

Persistent workflow-slot ledger (added 2026-08-09) — closes the one gap the reservation flow above doesn't cover: `compile_credits` resets every billing period, so it never reclaims access to workflows a workspace already published while on a higher tier. `record_published_workflow` (`entitlements.py`) writes one never-resetting entry per distinct `(workspace_id, company_slug, workflow_id)` to the `entitlement_workflows` KV namespace on first publish (`publish_routes.py::_publish_skill_pack_impl`). `_reconcile_workflow_locks`, re-run on every read of `GET /api/v1/entitlements/current` (exposed as the `workflow_lock` field) and on every publish, reuses the plan's current `compile_credits` number as a standing cap on how many published workflows may stay **active**, keeping the most-recently-published `limit` unlocked and locking the rest oldest-first — self-healing, no separate downgrade migration step. `ensure_workflow_publishable` enforces the same cap at publish time: republishing an already-active workflow (new version) is always allowed, republishing a **locked** one 402s `workflow_locked`, and publishing a brand-new workflow once already at the cap 402s `workflow_limit_exceeded`. Scope is company-side only by design — it never touches `skillpack_update_routes.py`'s delta-sync, so an end customer who already has a workflow installed keeps syncing and running it regardless of the SaaS company's current plan.

Distribution (replaces installer slots, removed 2026-08-08):
- No limit on how many product slugs a workspace publishes under, or on skill-pack publish.
- Installer upload (`publish_routes.py::_upload_installer_impl`) accepts `distribution` (`internal`
  default | `external`) and `white_label` query params from Build Studio, and stores them in the
  installer version's KV metadata (`installer_versions__{slug}`) alongside the existing
  filename/version/release-notes fields. This is server-side gating on what the Studio *tells* the
  cloud it's uploading, not an inspection of the binary's own `pack.json` — `installer_builder.py`
  itself was not changed; it does not yet stamp `distribution` into the built artifact.
- `ensure_distribution_allowed` rejects an `external` upload from a workspace whose plan carries
  `distribution="internal"` (402 `distribution_not_permitted`). `ensure_white_label_allowed` rejects
  custom branding without the `white_label` capability (402 `white_label_not_permitted`).
- **Free's 1-install cap from docs/PRD.md §11 is not enforced.** The obvious enforcement point,
  `skillpack_update_routes.py::post_telemetry_runtime_start`, is deliberately public and
  unauthenticated (its own docstring: "spoofing inflates counts but leaks nothing") — hard-blocking
  installs there on a spoofable `install_id` would be a false security control. Free's real boundary is
  the machine-binding limit on the *build* side (§13.4a); the running-side cap needs an authenticated
  install-provisioning step that doesn't exist yet — tracked in `TODO.md`.
- Starter is *not* count-capped on installs — the sheet promises unlimited installs. Starter's actual
  boundary is the `internal` distribution stamp and Conxa branding on the uploaded installer, visible
  in the dashboard and telemetry — a contract violation the workspace can be *seen* committing, not one
  blocked mid-run.

Ops tier gating (`ensure_ops_tier`, `app/api/tracking_routes.py`, `app/api/product_routes.py`):
- Free (`ops_tier="none"`): the ops dashboard, activity feed, workflow detail, ROI assumptions, run
  lists, run timelines, and the audit log all 403 with `ops_tier_required`.
- Starter (`"basic"`): all of the above are visible; drift detection (`GET /tracking/drift`) still 403s.
- Pro/Enterprise (`"full"`): everything, including drift detection.
- `GET /tracking/companies` and `GET /tracking/diagnostics` are **not** gated — lightweight
  workspace-scoped lookups used by navigation, not analytics content.

Analytics retention:
- `analytics_retention_days` per plan (Free 0, Starter 90, Pro 365, Enterprise custom) filters
  `_visible_run_records` and `_visible_runtime_registrations` on read
  (`app/services/tracking.py`, via `entitlements.analytics_retention_cutoff_ms`).
- Read-side filtering only — there is no write-side prune yet; tracked in `TODO.md`.

Seat usage:
- Clerk organization membership is the intended source of truth when an organization is present and `CLERK_SECRET_KEY` is configured for the cloud backend.
- Local/dev falls back to SaaS membership state.
- Hard seat enforcement requires a Conxa-owned invite API or Clerk webhook cleanup.

Trial expiry (Free only):
- `trial_started_at` is stamped once, on first sight of a workspace (`saas.ensure_principal`), with a
  backstop in `billing_for` for pre-existing records that predate the field.
- `entitlements.trial_expired(billing)` is true only for `plan == "free"` past `trial_days` (30).
- Enforced at every building chokepoint — LLM proxy, compile reserve, skill-pack publish, installer
  upload — via `ensure_trial_active`, 402 `trial_expired`. Never enforced on skill sync or telemetry
  ingest: execution is local and the cloud isn't in that path, so an already-installed machine keeps
  working after the trial that built it expires.

Credit add-on:
- `addon_compile_packs` (int, on the billing record) adds `25 * n` to `compile_credits` in
  `_limits_from_billing` — stacks on Starter or Pro, purchased/cancelled via a `credits_addon_25`
  Cashfree plan (`cashfree_routes._bump_addon_packs`), independent of the base subscription.

Stable entitlement error codes:
- `compile_credit_limit_exceeded`
- `human_edit_pool_exceeded`
- `seat_limit_exceeded`
- `machine_limit_exceeded`
- `trial_expired`
- `distribution_not_permitted`
- `white_label_not_permitted`
- `ops_tier_required`
- `entitlements_unavailable`
- `invalid_usage_class`

### 13.4a Machine Binding

The control that stops a single-machine free trial from quietly becoming a free Pro seat, and the
general seat-integrity mechanism across all paid tiers.

- Build Studio derives a stable machine id from Windows' `MachineGuid`
  (`HKLM\SOFTWARE\Microsoft\Cryptography`), SHA-256 hashes it (`conxa-builder/python/services/machine_id.py`),
  and sends it as `X-Conxa-Machine` on every call through `backend.py::_cloud_json` (compile reserve,
  entitlements checks) and `services/llm_proxy_client.py` (the LLM proxy). Only the hash ever leaves the
  machine.
- `app/api/machine_binding.py::register_request_machine` reads the header and calls
  `entitlements.ensure_machine_slot`, enforced at both `llm_proxy_routes._meter_and_call` and
  `entitlement_routes.post_compile_reserve` — a Studio that can neither proxy an LLM call nor reserve a
  compile credit cannot compile.
- A known hash is touched (last_seen/last_ip updated) and never counted twice. A new hash within the
  `machines` limit is registered and allowed. A new hash at the limit is rejected
  (402 `machine_limit_exceeded`).
- A revoked machine (`POST /entitlements/machines/revoke`, Settings device list) is treated as brand
  new on its next registration attempt — it re-enters through the limit check rather than being
  silently un-revoked.
- One `machines` limit governs both device slots and distinct active IPs (the pricing sheet pairs them
  1:1, 3:3, 10:10 on every tier) — a deliberate simplification (`ponytail:` in code); split only if a
  tier ever needs different counts.
- Older Studio builds that predate this header send no `X-Conxa-Machine` — enforcement is a no-op for
  them, not a hard failure; `settings.entitlements_enforce_machines` is the real on/off switch.
- **Caveat on install-side enforcement**: `skillpack_update_routes.py::post_telemetry_runtime_start`
  (the endpoint that would need to hard-cap Free's 1-install limit on the *running* side, not the
  build side) is deliberately public and unauthenticated — installed runtimes have no Clerk session,
  and its own docstring notes "spoofing inflates counts but leaks nothing." Hard-blocking installs
  there on a spoofable `install_id` would be a false security control, not a real one. A 2026-08-09
  attempt at real install-side enforcement (a machine-hash lock stamped into `pack.json`, checked by
  the runtime and by the delta-sync endpoint) was reverted the same day — it blocked legitimate
  Free-tier reinstalls and machine swaps. No install-side enforcement exists today; see `TODO.md`
  CLOUD-3 (reopened).

**Plan-aware installer naming and icon, added 2026-08-09:** `publish_routes._upload_installer_impl`
picks the served installer's filename by plan when the caller doesn't pass an explicit `?filename=`:
Free gets a random 10-letter name (`_random_installer_name()`, no branding signal); paid plans
(Starter/Pro/Enterprise) use the workspace's stored, *unverified* "installer domain"
(`entitlements.get_installer_domain`/`set_installer_domain`, `GET`/`POST /entitlements/installer-domain`,
admin-only) if one is set, falling back to the previous `{slug}-Setup.exe` otherwise. There is no
proof the workspace actually owns that domain yet — see `TODO.md` PROD-6, which this field is meant to
be gated on once domain-ownership verification ships. Separately, the installer's `.exe` icon (embedded
locally by `conxa_compile.installer_builder._stage_logo_icon` at build time, before anything is
uploaded) is plan-gated in Build Studio itself: `handlers/workflows.py::cmd_build_installer` calls
`GET /entitlements/current` and drops any supplied `logo_path` when the plan is Free (or the call
fails — fail-safe defaults to no icon). This is distinct from `ensure_white_label_allowed`
(`white_label`), which stays Enterprise-only for whatever else custom branding covers — see
`docs/PRD.md` §11.

### 13.5 Enterprise BYOK (Azure OpenAI)

The compliance argument, not a cost play: vision anchor generation sends screenshots of a customer's
internal screens to third-party LLM providers, which is a dead stop in a bank's security review.
Compiling against the customer's own Azure OpenAI deployment means no screenshot of their systems ever
leaves their tenancy. Gated on the `byok` plan capability — Enterprise only. Bedrock and Vertex are
tracked in `TODO.md`; Azure OpenAI was chosen first because it's OpenAI-compatible and reuses the
existing router call path with minimal changes.

**Storage** (`app/services/byok.py`): KV namespace `workspace_llm_keys`, one record per workspace —
`{provider: "azure_openai", endpoint, deployment, api_version, nonce_b64, ciphertext_b64}`. The API key
is AES-256-GCM encrypted at rest under `SKILL_BYOK_ENCRYPTION_KEY` (32 raw bytes, base64-encoded) via
`cryptography.hazmat.primitives.ciphers.aead.AESGCM` — no new dependency, already present transitively.
An unconfigured key (`byok_not_configured`, 500) refuses to encrypt or decrypt rather than falling back
to plaintext.

**Routes** (`app/api/byok_routes.py`, `PUT/GET/DELETE /api/v1/workspace/llm-key`, owner/admin only via
`require_admin`): `GET` returns metadata only (`configured`, `provider`, `endpoint`, `deployment`,
`api_version`) — the key itself is never returned once stored.

**Router integration**: `byok_pool_entry_for(principal)` (`app/services/byok.py`) returns `None` unless
the plan carries `byok` *and* a key is configured, in which case it builds a one-off `PoolEntry`:
`endpoint` is the full Azure chat-completions URL
(`{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}`),
`auth_style="api_key_header"` (Azure's REST API wants an `api-key` header, not `Authorization: Bearer`
— the two required a small `_call_provider` change alongside `_is_openai_compatible_endpoint`, which
now also accepts a pre-built `.../chat/completions` URL, not just the `/v1` convention the pooled
providers use). `llm_proxy_routes._meter_and_call` checks `byok_pool_entry_for` first, before the
pooled-provider path, and routes through `LLMRouter.call_entry_directly` when it returns an entry.

Compile credits still apply on BYOK — credits meter reach against the plan, not Conxa's token cost.

---

## 14. Database & Storage Architecture

### 14.1 KV Store (Primary Abstraction)

`conxa_core/db.py` provides a dual-mode key-value store:

```
Mode 1: PostgreSQL (SKILL_DATABASE_URL set)
  Table: kv_store
    namespace  TEXT        PRIMARY KEY part 1
    key        TEXT        PRIMARY KEY part 2
    data       JSONB
    created_at TIMESTAMPTZ
    updated_at TIMESTAMPTZ

Mode 2: Filesystem (no SKILL_DATABASE_URL)
  data/kv/{namespace}/{sha256(key)}.json
```

Key namespaces in use:
- `workflows` — Workflow model JSON
- `skill_packs_meta` — SkillPack model JSON, keyed by company_slug
- `entitlement_usage` — monthly usage row keyed by `workspace_id:YYYY-MM`
- `compile_reservations` — compile-credit reservations keyed by reservation id
- `publish_owners` — company_slug → workspace_id ownership
- `tracking_tokens` — company_slug → {token, workspace_id, ...}
- `tracking/{company}` — run_id → [event batches]
- `runs` — workflow_id → [run records]
- `selector_cache` — DOM hash → selector candidates

### 14.2 Additional File Storage

Beyond the KV store:
- `data/sessions/{id}/events.jsonl` — raw event stream (append-only)
- `data/sessions/{id}/screenshots/` — PNG screenshots per step
- `data/skills/{id}/skill.json` — compiled SkillPackage
- `data/skill-packs/{co}/` — built skill package folder
- `data/installers/{co}/installer.exe` — uploaded installer binary

### 14.3 Production Database Requirements

In production (`SKILL_AUTH_REQUIRED=true`), the app refuses to start without `SKILL_DATABASE_URL`. The filesystem fallback is **blocked** in production.

---

## 15. Security Model

### 15.1 Current Security Boundaries

| Boundary | Mechanism |
|---|---|
| Cloud API auth | Clerk JWT (RS256, verified via JWKS) |
| Build Studio auth | Clerk PKCE (no implicit flow) |
| Runtime session encryption | AES-256-GCM, key = HKDF(company_token) |
| Telemetry ingest | Package tracking token (secrets.token_urlsafe(32)) |
| Installer download | HMAC-SHA256 signed, time-limited `ts`+`sig` query params when `SKILL_INSTALLER_SIGNING_KEY` is set (SG-07); public (slug is the only "credential") in dev when unset |
| Skill pack sync | Rate-limited; token optional in local dev |
| Auth file exclusion | Compiler refuses if auth.json found in build input |
| Request body limits | 1MB general; 250MB publish/upload |
| Slug ownership | First publisher claims; workspace-scoped |
| CORS | Explicit allowlist (`SKILL_CORS_ORIGINS`) + Vercel preview regex |

### 15.2 Security Gaps (Current State)

- Sync token is a shared secret across all of a company's end users — a leaked installer grants read-only access to that company's data-only skill packs. Session encryption uses a separate per-machine key so individual users' sessions remain protected.
- Skill pack delta rate limit is in-memory — not persisted across restarts.
- No device registration or runtime instance tracking.
- Installer download requires a signed, time-limited link once `SKILL_INSTALLER_SIGNING_KEY` is configured in production (SG-07); still fully public — anyone with the slug URL can download — when that key is left unset (dev).
- `SKILL_TRACKING_HMAC_SECRET` (or `SKILL_AUTH_REQUIRED`) now gates the fallback: telemetry from a company with no stored token is rejected in production, and only still accepted in dev when neither is set (SG-05).

---

## 16. Deployment Architecture

### 16.0 Dev/Prod Environment Isolation

A single switch, **`CONXA_ENV`** (`dev` | `prod`), selects one of two fully isolated
stacks so Development and Production coexist on one machine with zero interference and
Production only ever receives releases promoted from Dev.

**The switch resolves everywhere from one variable:**
- **Python (cloud + Studio backend):** `conxa_core.config.active_environment()` reads
  `CONXA_ENV` and loads `.env.{dev,prod}` (`env_files()`), sets the first-class
  `settings.environment`, and a model-validator refuses to boot a `prod`-labeled
  process with auth off. `state_base_dir()` honors `CONXA_STUDIO_HOME` so Studio state
  splits into `~/.conxa-build-studio-dev` vs `~/.conxa-build-studio`.
- **Runtime (`runtime/env.js`, applied once at the top of `bootstrap.js`):** normalizes
  `process.env` with the per-env `CONXA_DIR` / `CONXA_DATA_DIR` / `CONXA_APP_DIR` /
  `CONXA_UPDATE_CHANNEL` / `CONXA_API_URL`. **Safety default = prod** (a shipped install
  with no `CONXA_ENV` must keep its `~/.conxa` tree and the `stable` channel); dev is
  opt-in. The cloud/Studio side defaults the *other* way (dev), because the danger on a
  developer workstation is accidentally touching prod.
- **Studio (`conxa-builder/electron/env.js`):** injects the dev/prod cloud, Clerk, and
  `CONXA_STUDIO_HOME` into the spawned Python backend. Shipped default = prod.

**Isolation matrix**

| Concern | Dev | Prod | Lever |
|---|---|---|---|
| Env file | `.env.dev` | `.env.prod` | `CONXA_ENV` → `env_files()` |
| Runtime install/data | `~/.conxa-dev` / `Conxa-Dev` | `~/.conxa` / `Conxa` | `CONXA_DIR`, `CONXA_DATA_DIR` |
| Studio state | `~/.conxa-build-studio-dev` | `~/.conxa-build-studio` | `CONXA_STUDIO_HOME` |
| Cloud API | `127.0.0.1:8000` / `dev-apis` | `apis.conxa.in` | `CONXA_CLOUD_API`, `CONXA_API_URL` |
| Update channel | `dev` | `stable` | `CONXA_UPDATE_CHANNEL` → `?channel=` |
| MCP server entry | `conxa-dev` | `conxa` | NSIS `MCP_SERVER` (build-time) |
| Billing | Cashfree `TEST` | Cashfree `PROD` | `CASHFREE_ENV` |

**Operator switch:** `scripts/conxa.sh <dev|prod> <backend|frontend|studio|runtime>`
(`conxa.ps1` on Windows; `make dev-*` / `make prod-*` shortcuts). It exports `CONXA_ENV`
plus the isolated path roots, then launches the target.

**pack.json invariant:** `sync_endpoint` and `tracking_url` are frozen into each pack at
publish time from the cloud's `SKILL_API_BASE_URL` (`skill_package_builder.py`). Because Dev
publishes against the dev cloud, dev-built installers embed dev URLs — a dev installer
never phones home to prod. Both sync and tracking now derive from one env-consistent base.

**Release flow (promotion, never rebuild):** dev prerelease tags (`app-v1.3.0-dev.1`,
`host-…-dev.N`, `studio-…-dev.N`) build in CI and publish to the **dev** update channel on
the dev cloud (`CLOUD_API_URL_DEV`). Once validated, `promote-release.yml` fetches the
*exact signed artifact* from the dev channel, verifies its SHA-256 byte-for-byte,
republishes the identical bytes under the clean stable tag, and posts the **stable**
manifest record on the prod cloud. Signing is unchanged — the same server-side Ed25519 key
signs both channels; the runtime's baked-in public key verifies both. Prod runtimes poll
`?channel=stable` only, so un-promoted dev builds are invisible to them.

### 16.1 Cloud Backend (Render)

```
Build root:        conxa-cloud/backend/
Build command:     ./build.sh
  pip install ../../packages/conxa-core
  pip install -r requirements.txt
Start command:     ./start.sh
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check:      GET /healthz (liveness)
Deploy gate:       GET /readyz (DB ping)
Environment:       SKILL_AUTH_REQUIRED=true requires (app refuses to boot otherwise —
                   app/main.py::_validate_production_config):
  SKILL_DATABASE_URL, SKILL_CLERK_ISSUER, SKILL_CLERK_JWKS_URL,
  SKILL_CORS_ORIGINS, CASHFREE_APP_ID, CASHFREE_SECRET_KEY,
  CASHFREE_WEBHOOK_SECRET, CASHFREE_STARTER_PLAN_ID,
  CASHFREE_PRO_PLAN_ID, SKILL_API_BASE_URL,
  SKILL_TRACKING_HMAC_SECRET, SKILL_INSTALLER_SIGNING_KEY,
  CONXA_MANIFEST_SIGNING_KEY, + at least one *_API_KEYS
```

`CONXA_MANIFEST_SIGNING_KEY` is in that list as of 2026-08-04: without it `manifest_signer.py`
silently serves an **unsigned** `/api/v1/manifest.json`, which every runtime then discards as
unverifiable — self-updates stop platform-wide with no error on either side. Failing the boot
makes that misconfiguration loud instead of silent.

**Optional, not boot-required (2026-08-08)** — each fails gracefully (not down) when unset, so they're
deliberately absent from the required list above:
- `LLM_PREMIUM_PROVIDERS` — comma-separated provider names routed to the `"premium"` compile pool
  (§13.1a). Unset means every provider is `"free"`-pool, so Starter/Pro compiles get no quality lift
  over Free until this is configured.
- `SKILL_BYOK_ENCRYPTION_KEY` — 32 raw bytes, base64-encoded, for Enterprise BYOK key-at-rest
  encryption (§13.5). Unset means BYOK storage refuses every write/read (`byok_not_configured`, 500)
  rather than silently storing plaintext.
- `CASHFREE_ADDON_PLAN_ID` — the compile-credit add-on's Cashfree plan ID. Unset behaves like the
  starter/pro plan IDs do when unset in non-prod: the plan is auto-created on first use in dev,
  and 500s in prod (`auth_required=true`) via the same `_ensure_plan` path.

### 16.2 Cloud Frontend (Vercel)

```
Project root:      conxa-cloud/frontend/
Build command:     npm run build
Deploy:            next start
Environment:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  CLERK_SECRET_KEY
  API_ORIGIN  (points to Render backend)
```

### 16.3 Build Studio (Windows)

Distributed as a `.exe` installer built via `electron-builder` + NSIS. Ships:
- Electron app (Node.js bundled)
- PyInstaller backend bundle (`dist/backend/`)
- Does NOT ship: Chromium, NSIS, conxa-runtime.exe (fetched on first launch via bootstrap)

### 16.4 Runtime (End-User Machine)

Ships inside the company-specific installer produced by Build Studio. Per-user install (no UAC). Installs to:
- Windows: `$PROFILE\.conxa\conxa-runtime.exe` (i.e. `C:\Users\<user>\.conxa\`) plus `conxa-app\` for the pre-extracted app layer
- Mac: `~/.conxa/runtime/runtime` (planned; Mac support is in build scripts but Windows is the primary target)

MCP registration is done by `conxa-runtime.exe register-mcp` itself (see §4.2a) — NSIS just invokes the subcommand, no config-editing logic lives in the installer template. Auto-detects the Microsoft Store/MSIX config path (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`) and falls back to `%APPDATA%\Claude\` otherwise for Claude Desktop, which avoids MSIX filesystem virtualization issues affecting per-user config paths on Windows (see claude-code issue #26073) — and does the equivalent for every other detected host. An earlier design used a `.mcpb` Desktop Extension instead — that mechanism has been removed and no longer exists in the installer. A design before that generated a throwaway PowerShell script per host from the NSIS template — replaced because it reserialized the whole config file (losing comments/key order), wrote non-atomically, and its uninstaller hardcoded the registration key separately from the installer's channel-derived one, so a dev-channel uninstall could leave a dangling entry behind.

---

## 17. Known Gaps & Tech Debt

| Gap | Location | Severity | Notes |
|---|---|---|---|
| Delta sync ships all files **within a changed skill** | `skillpack_update_routes.py::_build_delta()` | Low | Per-skill granularity is real (§5.9/§11.1) — republishing one skill never re-downloads others. What remains is per-*file* diffing inside a single changed skill (a handful of small JSON files each), a much smaller gap than the whole-company retransfer this replaced. |
| ~~Selector cache GC unscheduled~~ **RESOLVED** | `selector_cache.cleanup_expired_entries()` + `main.py` lifespan | — | Background loop (default 6h + startup) sweeps expired selector-cache entries and old snapshot blobs |
| ~~Billing quotas not enforced~~ **RESOLVED** | `entitlements.py`, `publish_routes.py`, `llm_proxy_routes.py` | — | Plan limits enforced (publish slot, compile credits, Human-Edit pool); enforce flags on by default; provider is Cashfree |
| Sync token is a shared installer secret | `sync_tokens` KV + pack.json | Low | Read-only, single-company scope; per-machine session encryption key mitigates session-file risk |
| ~~Rate limit cache in-memory~~ **RESOLVED** | `rate_limits` KV namespace | — | Persisted in `conxa_core.db`; survives restarts, shared across instances (in-memory fallback in local dev) |
| ~~Stripe fields in config~~ **RESOLVED** | removed | — | Stripe fully removed (config, endpoints, dep, frontend flag); Cashfree is the wired gateway (switched from Razorpay 2026-06-30) |
| ~~No device/runtime registration~~ **RESOLVED** | `telemetry_routes.py` `/runtime-start`, `runtime/drift.js` | — | Runtime-start telemetry + pre-execution structural-fingerprint drift gate give visibility into active runtimes and redesign detection (Implementation-Plan §2.1/§2.2) |
| ~~No enterprise RBAC enforcement~~ **PARTIAL** | `app/services/rbac.py` | Medium | `require_admin` enforced on publish, workflow create/delete, bundle release; fine-grained per-skill/analyst roles still Phase 3 |
| Runtime auth per-company only | `auth_manager.js` | Medium | No per-user identity at runtime |
| ~~Installer download fully public~~ **RESOLVED** | `publish_routes.py:get_installer` | — | Requires signed, time-limited `ts`+`sig` when `SKILL_INSTALLER_SIGNING_KEY` is set; public download preserved only in dev (SG-07) |
| ~~`research/frontend/` is a dead prototype~~ **N/A** | — | — | Directory does not exist in the repo |
| ~~Aptfile has Playwright deps~~ **N/A** | — | — | `conxa-cloud/backend/Aptfile` does not exist in the current repo — removed at some point after this gap was first logged, not merely unused |
| ~~`worker.py` scaffold~~ **N/A** | — | — | `app/worker.py` does not exist in the current repo — the job-queue scaffold described here was never committed (or was removed); see `TODO.md` for the actual durable-queue gap |
| ~~`tracking_routes.py` public ingest endpoint bypasses `/api/v1`~~ **RESOLVED (reframed) 2026-07-09** | `app/api/tracking_routes.py`, `main.py` | — | The public telemetry-ingest route at `/api/tracking/{company}/events` is now a documented, **permanent** back-compat alias (installer-baked `pack.json.tracking.tracking_url` for already-deployed runtimes points at it and can never be migrated remotely — see the versioned-installer-architecture's `{installer_version}`-frozen-at-build-time rule). `/api/v1/tracking/...` and the new versioned `/api/v1/workflows/{installer_version}/{company}/tracking/events` both exist alongside it, all three calling the same `_ingest_events_impl()`. See `TODO.md` ARCH-1 and `CLAUDE.md` Key Invariants. |
| No CDN/multi-region blob storage | `blob_read_write_token` config | Low | Config field still unwired, but durability gap is closed: installer versions and skill-pack files now persist to Postgres (`installer_versions__{slug}`, `skillpack_files__{slug}` KV namespaces), surviving Render disk wipes. Base64-in-Postgres doesn't scale indefinitely — revisit if installers approach `build_artifact_upload_max_bytes` (250 MB) regularly or DB storage cost/limits become an issue. |
| ~~`selector_cache_ttl_days` has no GC scheduler~~ **RESOLVED** | Config | — | Duplicate of the "Selector cache GC unscheduled" row above, which was resolved — the background loop honours this TTL. Kept only so the stale claim isn't re-derived from an older copy of this table. |
| ~~CI execution gate disabled~~ **RESOLVED 2026-08-04** | `.github/workflows/build-runtime-app.yml`, `runtime/test/gate_replay.js` | — | Real-skill replay against the declared `MIN_HOST` exe runs before zip/release/publish and blocks the build on failure. Its first run caught a stale `MIN_HOST` (`host-v1.1.2` → `host-v2.0.0`): every app layer published since 2026-07-30 had been claiming a `min_host` it could not actually run under. A red app-layer gate usually means `MIN_HOST` is stale, not that the gate is wrong. |
| Cancelled file-picker click can hang a run | `compiler/step_anchors.py::clean_steps`, `runtime/browser.js` | Medium | The 2026-08-06 fix drops a recorded click on a file input **only when a following `upload`/`upload_intent` proves it was superseded** (§9.3). If the user opens the native picker while recording and cancels it, no `change` event fires, no upload step is emitted, and the lone click survives compilation — at run time it opens an OS dialog nothing can drive. Tracked as TODO.md BUILD-13, with both a compiler-side and a runtime-side `filechooser`-guard option scoped. |
