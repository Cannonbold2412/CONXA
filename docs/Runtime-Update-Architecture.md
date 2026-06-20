# Runtime Update Architecture

## Problem Statement

The current `runtime-win.exe` is ~89 MB, built as a monolithic pkg bundle. Every code release — even a one-line fix in `server.js` — forces the self-updater to download the full 89 MB binary. On a 10 Mbps connection that is 70+ seconds; on a 1 Mbps connection it is 12 minutes. The update experience must complete in under 15 seconds.

---

## Why the Binary Is So Large

`@yao-pkg/pkg` with target `node22-win-x64` bundles three categories of content into a single exe:

| Layer | Contents | Size | Changes how often |
|---|---|---|---|
| **Node.js host** | V8, OpenSSL, zlib, stdlib | ~42 MB | Rarely (Node LTS cycle, ~yearly) |
| **npm dependencies** | playwright-core, @modelcontextprotocol/sdk, zod, semver, keytar (JS side) | ~38 MB | Occasionally (library upgrades) |
| **Application JS** | server.js, sync.js, run.js, browser.js, auth_manager.js, tracker.js, skill_loader.js, install_identity.js | ~150 KB | Every release |

**The application JS — the only part we actually ship changes to — is 0.17% of the binary.**

Native addons that travel alongside the exe (not inside it):
- `keytar.node` (~691 KB) — recompiled per Node ABI; ships as a Release asset beside the exe

Browser binary (Chromium) is already external — downloaded once by `--install-playwright` to `~/.conxa/chromium/`, never bundled.

---

## Proposed New Architecture

Split the monolith into two independently-updateable layers.

```
~/.conxa/
  runtime-host.exe          ← Node.js + all npm deps + bootstrap loader
                              (~85 MB, updated quarterly at most)
  runtime-app/
    version.json            ← {"version": "1.2.0", "min_host": "1.0.0"}
    server.js               ← application entry point
    sync.js
    run.js
    browser.js
    auth_manager.js
    tracker.js
    skill_loader.js
    install_identity.js
    node_modules/           ← pure-JS deps NOT already in host
      (only if needed — see Module Resolution section)
```

### What goes in each layer

**`runtime-host.exe`** (the shell — infrequent updates)
- Node.js v22 host binary
- All native addons compiled against the host Node ABI (keytar.node embedded)
- All npm dependencies bundled via pkg (`playwright`, `@modelcontextprotocol/sdk`, `zod`, `semver`, etc.)
- A **tiny bootstrap** (`bootstrap.js`, <40 lines) that:
  1. Checks for `runtime-app/version.json` on disk
  2. Verifies `min_host` compatibility against `RUNTIME_HOST_VERSION`
  3. If valid: loads `runtime-app/server.js` from disk (the live, synced version)
  4. Fallback: loads the bundled `server.js` baked into the host (the version shipped at build time)

**`runtime-app/`** (the brain — updates every release)
- All eight application JS files
- Total uncompressed: ~150 KB
- Served as a zip archive for the initial install; individual files for subsequent updates

---

## Folder Structure & File Naming

### Customer Machine (Windows)

Two root directories, set by the NSIS installer and read by the runtime:

| Env var | Windows path | Purpose |
|---|---|---|
| `CONXA_DIR` | `C:\Users\<user>\.conxa\` | Install root — binary, app layer, skill packs, Chromium |
| `CONXA_DATA_DIR` | `C:\Users\<user>\AppData\Roaming\Conxa\` | User-writable state — cache, logs, pending markers |

```
C:\Users\<user>\.conxa\                           ← CONXA_DIR
│
│   runtime-host.exe                              ← pkg bundle: Node.js + all npm deps + bootstrap
│   runtime-host.exe.next                         ← downloaded next host (staging area)
│   runtime-host.exe.bak                          ← hot backup during update.bat; deleted on success
│   keytar.node                                   ← native addon, loaded via process.dlopen()
│   keytar.node.next                              ← updated keytar, applied alongside host update
│
├── runtime-app\                                  ← application JS layer (hot-synced, no restart)
│   │   version.json                              ← app layer metadata (plain JSON, see schema below)
│   │   server.jsc                                ← MCP server + tool handlers (V8 bytecode — not human-readable)
│   │   sync.jsc                                  ← skill-pack delta sync
│   │   run.jsc                                   ← step executor + 5-tier recovery
│   │   browser.jsc                               ← Playwright browser lifecycle
│   │   auth_manager.jsc                          ← per-company token + AES-256-GCM session
│   │   tracker.jsc                               ← telemetry batching
│   │   skill_loader.jsc                          ← skill pack loading + integrity check
│   └── install_identity.jsc                      ← installation UUID
│
├── skill-packs\                                  ← SKILL_PACKS_DIR (synced by sync.js)
│   └── <company-id>\
│       │   pack.json                             ← {sync_endpoint, sync_token, skill_pack_version}
│       └── <skill-slug>\
│               manifest.json
│               execution.json
│               recovery.json
│               inputs.json
│               validation.json
│
└── chromium\                                     ← Playwright-managed browser (external, unchanged)
    │   .revision                                 ← "chromium-1228" (revision marker)
    └── chromium-1228\
        └── chrome-win\
                chrome.exe


C:\Users\<user>\AppData\Roaming\Conxa\            ← CONXA_DATA_DIR
│
├── cache\                                        ← CACHE_DIR
│   │   runtime-host-update-cache.json            ← cached host manifest (24 h TTL)
│   │   runtime-host-update-pending.json          ← {"ready": true, "version": "host-v1.1.0", "has_keytar": true}
│   │   runtime-app-update-cache.json             ← cached app manifest (1 h TTL)
│   │   <company-id>-skill-registry.json          ← skill index fast-load cache
│   └── sessions\                                 ← browser session data (temporary)
│
└── logs\
        runtime.log                               ← NDJSON runtime log
```

### `runtime-app/version.json` schema

Written by CI on every app release; read by bootstrap before loading external code.

```json
{
  "app_version":  "app-v1.5.0",
  "min_host":     "host-v1.0.0",
  "updated_at":   "2026-06-19T10:00:00Z",
  "file_hashes": {
    "server.js":         "a1b2c3d4...",
    "sync.js":           "e5f6a7b8...",
    "run.js":            "c9d0e1f2...",
    "browser.js":        "a3b4c5d6...",
    "auth_manager.js":   "e7f8a9b0...",
    "tracker.js":        "c1d2e3f4...",
    "skill_loader.js":   "a5b6c7d8...",
    "install_identity.js": "e9f0a1b2..."
  }
}
```

`min_host` is the minimum `HOST_VERSION` the bootstrap must have before loading this app layer. If the installed host is older, bootstrap falls back to its bundled `server.js` and triggers a background host update.

---

### GitHub Release Assets

Each release tag produces one or both sets of assets depending on what changed.

**App-layer release** (every code release — tag format `app-v*`):

| Asset filename | Contents | Size |
|---|---|---|
| `runtime-app-v{version}.zip` | All 8 `.jsc` files + `version.json` — the only asset needed | ~60 KB compressed |

The entire app layer ships as **one zip, one SHA-256**. The total uncompressed size is ~150 KB so downloading all files every release costs essentially nothing — per-file delta logic would save a few KB at the cost of significant complexity and 18 extra env vars on Render. Not worth it.

Zip URL pattern:
```
https://github.com/{repo}/releases/download/{tag}/runtime-app-v{version}.zip
```

**Host-layer release** (quarterly — tag format `host-v*`):

| Asset filename | Contents | Size |
|---|---|---|
| `runtime-host-win.exe` | Node.js + all npm deps + bootstrap (Windows x64) | ~85 MB |
| `runtime-host-mac` | macOS x64 host | ~80 MB |
| `keytar.node` | Native Windows credential addon (Node ABI–specific) | ~700 KB |

---

### Cloud API Endpoints

| Endpoint | Auth | Returns | Used by |
|---|---|---|---|
| `GET /api/v1/updates/runtime-app-manifest` | Public | App layer file list + SHA-256 hashes | runtime `_checkAppUpdate()` on every cold start |
| `GET /api/v1/updates/runtime-host-manifest` | Public | Host binary URL + SHA-256 | runtime `_checkHostUpdate()` on cold start |
| `POST /api/v1/updates/runtime-app-manifest` | Admin token | Accepts new manifest JSON, persists to env | CI pipeline after app-layer release |
| `POST /api/v1/updates/runtime-host-manifest` | Admin token | Accepts new manifest JSON, persists to env | CI pipeline after host-layer release |

**`GET /api/v1/updates/runtime-app-manifest` response shape:**
```json
{
  "app_version":  "app-v1.5.0",
  "min_host":     "host-v1.0.0",
  "bundle_url":   "https://github.com/.../releases/download/app-v1.5.0/runtime-app-v1.5.0.zip",
  "bundle_sha256": "a1b2c3d4e5f6..."
}
```

The runtime compares `app_version` against the local `version.json`. If they match, nothing is downloaded. If they differ, it downloads the zip (~60 KB), verifies the SHA-256, extracts atomically, and updates `version.json`.

**`GET /api/v1/updates/runtime-host-manifest` response shape** (same as today's `runtime-manifest`, renamed):
```json
{
  "host_version":     "host-v1.1.0",
  "url":              "https://github.com/.../releases/download/host-v1.1.0/runtime-host-win.exe",
  "sha256":           "a1b2...",
  "keytar_url":       "https://github.com/.../releases/download/host-v1.1.0/keytar.node",
  "keytar_sha256":    "c3d4...",
  "playwright_version": "1.61.0",
  "chromium_revision":  "1228"
}
```

---

### Environment Variables (Render / cloud backend)

**App-layer env vars** (updated by CI on every code release — only 4 vars total):

| Env var | Example value |
|---|---|
| `CONXA_APP_VERSION` | `app-v1.5.0` |
| `CONXA_APP_MIN_HOST` | `host-v1.0.0` |
| `CONXA_APP_BUNDLE_URL` | `https://github.com/.../runtime-app-v1.5.0.zip` |
| `CONXA_APP_BUNDLE_SHA256` | `a1b2c3d4e5f6...` |

**Host-layer env vars** (updated by CI only on host releases):

| Env var | Example value | Replaces |
|---|---|---|
| `CONXA_HOST_VERSION` | `host-v1.1.0` | `CONXA_RUNTIME_VERSION` |
| `CONXA_HOST_WIN_URL` | `https://github.com/.../runtime-host-win.exe` | `CONXA_RUNTIME_WIN_URL` |
| `CONXA_HOST_WIN_SHA256` | `c3d4...` | `CONXA_RUNTIME_WIN_SHA256` |
| `CONXA_KEYTAR_WIN_URL` | `https://github.com/.../keytar.node` | *(same key, different asset name)* |
| `CONXA_KEYTAR_WIN_SHA256` | `a1b2...` | *(same)* |

---

### Version String Conventions

| String | Format | Example | Where used |
|---|---|---|---|
| `HOST_VERSION` | `host-v{semver}` | `host-v1.1.0` | `runtime-host.exe` build constant; host manifest; `update.bat` log |
| `APP_VERSION` | `app-v{semver}` | `app-v1.5.0` | `runtime-app/version.json`; app manifest; runtime logs |
| `min_host` | bare semver range | `>=host-v1.0.0` | Checked by bootstrap before loading app layer |
| GitHub tag (host) | `host-v{semver}` | `host-v1.1.0` | Triggers `build-runtime-host.yml` |
| GitHub tag (app) | `app-v{semver}` | `app-v1.5.0` | Triggers `build-runtime-app.yml` |

---

## How Updates Work

### Code release (most common — JS-only change)

1. CI obfuscates + compiles all 8 app JS files to `.jsc`, zips them with `version.json` → `runtime-app-v{version}.zip` (~60 KB)
2. CI uploads the zip to the GitHub Release, computes its SHA-256
3. CI POSTs 4 env vars to the cloud API: `CONXA_APP_VERSION`, `CONXA_APP_MIN_HOST`, `CONXA_APP_BUNDLE_URL`, `CONXA_APP_BUNDLE_SHA256`
4. On next cold start `_checkAppUpdate()` fetches `GET /api/v1/updates/runtime-app-manifest`
5. Compares `app_version` against local `runtime-app/version.json` — if they match, done (no download)
6. If different: download zip → verify SHA-256 → extract to temp dir → move atomically to `runtime-app/`
7. Signal Claude with `server.sendToolListChanged()` — no restart needed

**Download size: always ~60 KB regardless of what changed → completes in well under 1 second.**

### Host update (quarterly — Node.js/Playwright/dep bump)

Same mechanism as today (`_checkHostUpdate()`, formerly `_checkRuntimeUpdate()`):
- Manifest at `GET /api/v1/updates/runtime-host-manifest` (renamed for clarity)
- Downloads full new `runtime-host.exe` in background (~85 MB)
- Writes `runtime-host-update-pending.json` → applied via `update.bat` on next cold start

Users rarely hit this path. When they do, the existing 120-second download timeout and background behaviour still apply.

### Startup sync user experience

When the user opens Claude Desktop:
- **App layer sync (< 2 seconds)**: fetch manifest → download 1–3 changed files → done
- **Host layer update (background)**: if a host update exists, download silently in background; applied next time Claude restarts

A new `syncState = { startedAt, appComplete: false }` flag in bootstrap allows `execute_skill` to return a clear message if a workflow is called before app sync finishes (bounded to 10 seconds), rather than silently proceeding with stale files.

---

## Module Resolution: How `runtime-app/server.js` Finds Bundled Deps

This is the critical technical detail. When `runtime-app/server.js` (a **disk file**) calls `require('@modelcontextprotocol/sdk')`, it must find the version bundled inside `runtime-host.exe`'s virtual filesystem — not try to load from disk where no `node_modules` exists.

**Solution: bootstrap injects a host-side require bridge before loading external code.**

```js
// bootstrap.js (bundled inside runtime-host.exe)
const path = require('path');
const fs   = require('fs');

// Make all bundled modules available to disk-loaded code via a global
// require bridge. External code calls _hostRequire('semver') instead of
// require('semver') to resolve against the VFS.
global.__hostRequire = (id) => require(id);
global.__hostPkg     = !!process.pkg; // lets external code detect pkg context

const appEntry = path.join(process.env.CONXA_APP_DIR || path.join(path.dirname(process.execPath), '..', 'runtime-app'), 'server.js');
const fallback  = path.join(__dirname, 'server.js'); // bundled copy

if (fs.existsSync(appEntry)) {
  // Validate version compatibility before loading
  const versionFile = path.join(path.dirname(appEntry), 'version.json');
  const appVersion  = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
  const semver      = require('semver');
  if (semver.satisfies(HOST_VERSION, `>=${appVersion.min_host}`)) {
    require(appEntry);
  } else {
    require(fallback); // host too old for this app layer — use bundled fallback
  }
} else {
  require(fallback); // no external app layer yet — use bundled fallback
}
```

Each `runtime-app/*.js` file replaces bare `require('some-module')` calls for externally-bundled deps with `(global.__hostRequire || require)('some-module')`. Relative requires (`require('./sync')`) remain unchanged and resolve to the `runtime-app/` directory as expected.

**Modules that use the bridge (bundled in host):**
- `@modelcontextprotocol/sdk` — used in `server.js`
- `semver` — used in `server.js`
- `playwright` / `playwright-core` — used in `browser.js`
- `keytar` (native) — used in `auth_manager.js` (already handled via `process.dlopen`)

**Modules that stay on disk (relative requires, no bridge needed):**
- All intra-app requires: `./sync`, `./run`, `./browser`, etc.

---

## File Changes Required

### `runtime/bootstrap.js` (new file)
The new pkg entry point. ~40 lines. Handles host version check, bridge injection, app-layer loading, and fallback. Built into the pkg bundle instead of `server.js`.

### `runtime/package.json`
- Change `"main"` and `"scripts"` pkg entry from `server.js` → `bootstrap.js`
- Remove application JS files from `pkg.scripts` (they live on disk, not in VFS)
- Keep all npm deps in pkg (they remain bundled in host)
- Add `HOST_VERSION` constant (separate from `RUNTIME_VERSION` which becomes `APP_VERSION`)

```json
"scripts": {
  "build:win": "npx @yao-pkg/pkg bootstrap.js --targets node22-win-x64 --output dist/runtime-host-win.exe ...",
},
"pkg": {
  "scripts": [
    "bootstrap.js",
    "node_modules/playwright-core/lib/cli/program.js",
    "node_modules/playwright-core/lib/utilsBundle.js",
    "node_modules/playwright-core/lib/server/registry/oopDownloadBrowserMain.js"
  ]
}
```

### `runtime/server.js` (and all app JS)
- Replace `require('semver')` → `(global.__hostRequire || require)('semver')`
- Replace `require('@modelcontextprotocol/sdk/...')` → `(global.__hostRequire || require)('...')`
- Replace `require('playwright')` in `browser.js` → bridge
- Add `runtime-app/version.json` generation in CI

### `runtime/_checkAppUpdate()` (new function in `server.js`)
Mirrors the existing skill-pack sync pattern:
1. Fetch `GET /api/v1/updates/runtime-app-manifest`
2. For each file: compare SHA-256 against `~/.conxa/runtime-app/<file>`
3. Download changed files only → write atomically
4. Update `runtime-app/version.json`
5. Log and signal tool list changed

### `conxa-cloud/backend/app/api/updates_routes.py`
- Rename `runtime-manifest` → `runtime-host-manifest` (or keep for backwards compat)
- Add `GET /updates/runtime-app-manifest` endpoint:

```python
_APP_VERSION    = os.environ.get("CONXA_APP_VERSION", "app-v1.0.0")
_APP_MIN_HOST   = os.environ.get("CONXA_APP_MIN_HOST", "host-v1.0.0")
_APP_BUNDLE_URL = os.environ.get("CONXA_APP_BUNDLE_URL", "")
_APP_BUNDLE_SHA = os.environ.get("CONXA_APP_BUNDLE_SHA256", "")

@router.get("/updates/runtime-app-manifest", include_in_schema=False)
def runtime_app_manifest() -> dict:
    return {
        "app_version":   _APP_VERSION,
        "min_host":      _APP_MIN_HOST,
        "bundle_url":    _APP_BUNDLE_URL,
        "bundle_sha256": _APP_BUNDLE_SHA,
    }
```

Four env vars total. CI updates all four on every app release via `POST /updates/runtime-app-manifest` (admin-token protected).

### `.github/workflows/build-runtime.yml`
Split into two separate workflow files triggered by different tag prefixes:

**`build-runtime-app.yml`** (triggers on `app-v*` tags — every code release):
1. Obfuscate all 8 JS files with `javascript-obfuscator`
2. Compile each to `.jsc` with `bytenode`
3. Generate `version.json` with `app_version`, `min_host`, and per-file SHA-256 hashes
4. Zip everything → `runtime-app-v{version}.zip`
5. Compute zip SHA-256
6. Upload zip to GitHub Release
7. POST 4 env vars to `CLOUD_API_URL/api/v1/updates/runtime-app-manifest`

**`build-runtime-host.yml`** (triggers on `host-v*` tags — quarterly):
- Existing full pkg build, renamed output to `runtime-host-win.exe`

### NSIS installer (`conxa-builder`)
- Installer ships `runtime-host.exe` + initial `runtime-app/` directory
- On first install the app layer is pre-populated from the installer (no network needed at first run)

---

## Backwards Compatibility

| Runtime version | Behaviour |
|---|---|
| Old runtime (pre-split) | Continues to self-update as today — downloads full 89 MB host on next cold start, gains split architecture at that point |
| New host + no app dir | Loads bundled fallback `server.js` transparently — works immediately after host install |
| New host + app dir | Loads external `server.js` — picks up all code updates without host restart |

---

## Execution Gate

### Design

`execute_skill` (and `execute_sequence`) **must not run until both syncs are fully complete** — skill packs and app layer. Running against stale skill files or stale app code defeats the point of having fast updates. The current 2-second race-and-proceed approach is replaced with a hard wait.

```
Claude opens
    │
    ├── MCP connected immediately (Claude can talk to runtime)
    │
    └── startupSync begins (parallel):
            ├── skill-pack sync       ~0–800ms
            └── app layer update      ~0–500ms
                    │
                    └── both complete → syncState.complete = true
                                              │
                                              └── execute_skill now allowed
```

If the user asks Claude to run a workflow before `syncState.complete` is `true`, the runtime returns a holding message rather than executing against potentially stale data.

---

### `syncState` Object

A module-level object in `server.js` tracks both sync jobs:

```js
const syncState = {
  startedAt:    Date.now(),
  complete:     false,   // true only when BOTH syncs finish
  skillsDone:   false,
  appDone:      false,
};
```

Inside `startupSync`, both jobs run in parallel:

```js
const startupSync = (async () => {
  await Promise.all([
    // Skill-pack sync
    sync.syncSkillPacks(SKILL_PACKS_DIR, { timeoutMs: 4000, log })
      .then(() => { syncState.skillsDone = true; })
      .catch(() => { syncState.skillsDone = true; }), // failure = treated as done, use cached

    // App layer update
    _checkAppUpdate()
      .then(() => { syncState.appDone = true; })
      .catch(() => { syncState.appDone = true; }),
  ]);

  syncState.complete = true;
  skillIndex = skillLoader.loadSkillRegistry(SKILL_PACKS_DIR, CACHE_DIR);
  server.sendToolListChanged().catch(() => {});
  _phonehome().catch(() => {});
  _checkHostUpdate().catch(() => {}); // background only, never blocks gate
})();
```

A sync failure (network down, timeout) marks the job as done and lets the gate open using cached data — the user is not blocked forever by a bad network.

---

### Gate Logic in `execute_skill`

Replace the current `Promise.race([startupSync, 2000ms])` with a full await plus a user-facing message while waiting:

```js
// Hard wait — do not proceed until both syncs are done.
// With optimised sync this resolves in < 1s on normal connections.
if (!syncState.complete) {
  await startupSync; // already resolves fast; this is just catching the rare slow case
}

// If still not complete after await (shouldn't happen but defensive):
if (!syncState.complete) {
  const elapsed = Math.ceil((Date.now() - syncState.startedAt) / 1000);
  return {
    content: [{
      type: "text",
      text: `Conxa is syncing your workflows (${elapsed}s). ` +
            `This usually takes under 2 seconds — please try again in a moment.`
    }]
  };
}
```

Because `startupSync` always resolves (never rejects — failures are caught internally), `await startupSync` never hangs. On a normal connection it resolves in under 1 second. On a very slow connection the 4-second skill-pack timeout and 8-second app download timeout are the floor.

---

### What the User Sees

| Timing | Scenario | What happens |
|---|---|---|
| User runs workflow after sync completes | Normal case | Executes immediately, no message |
| User runs workflow during sync (< 1s window) | Claude opened and user typed instantly | Claude holds the call until sync finishes, then executes — user sees a brief pause, not an error |
| Sync fails (network down) | Offline or timeout | Gate opens with cached data; user gets current skills, no error message about sync |
| Sync takes > 10s (very slow network) | Corporate proxy, throttled connection | User sees "syncing (Xs)" message if they try to run a workflow during the wait |

The key behaviour: **Claude waits for sync, then executes** — it never silently runs against stale data, and it never permanently blocks (failures fall through to cached state).

---

## Size and Speed Summary

| Scenario | Current | New Architecture |
|---|---|---|
| Code-only release download | 89 MB | ~60 KB (zip) |
| Code-only release time (@10 Mbps) | ~70 seconds | < 1 second |
| Skill-pack sync (re-open within 5 min) | ~6s (429 + retry) | 0ms (skipped) |
| Skill-pack sync (up to date) | ~200ms | ~150ms |
| Skill-pack sync (updates available) | up to 15s | ~800ms (parallel) |
| Execution gate wait (normal connection) | 2s (race timeout) | < 1s (real sync completes) |
| Dep/Node.js bump download | 89 MB | ~85 MB (host only, background, rare) |
| Update applies without restart? | No | Yes (app layer hot-loads) |

---

## Version Numbering

Introduce two version strings:

- `HOST_VERSION` — e.g. `host-v1.0.0` — bumped only when Node.js, Playwright, or a native dep changes
- `APP_VERSION` — e.g. `app-v1.5.0` — bumped on every code release

The existing `RUNTIME_VERSION` string in `server.js` becomes `APP_VERSION`. The `runtime-host-manifest` endpoint serves `HOST_VERSION`; the `runtime-app-manifest` endpoint serves `APP_VERSION`.

---

## Code Protection

### The Problem

In the current monolithic pkg binary the application JS is embedded inside the virtual filesystem. Extracting it requires using a pkg-extractor tool — not trivial, but possible. In the new split architecture `runtime-app/*.js` files sit as plain text on disk. Any customer can open File Explorer, navigate to `C:\Users\<user>\.conxa\runtime-app\`, and read the full source in Notepad. That exposes business logic, proprietary recovery algorithms, and selector-compilation strategies to competitors.

### Solution: Obfuscation → V8 Bytecode Compilation

Ship `.jsc` files (V8 compiled bytecode) instead of `.js` source. The pipeline is:

```
CI source files  →  javascript-obfuscator  →  bytenode compile  →  .jsc on disk
   server.js             (mangled JS)            (V8 bytecode)       server.jsc
```

**Step 1 — JavaScript obfuscation** (`javascript-obfuscator`)

Transforms readable source into semantically equivalent but unreadable JS before compilation:
- Identifier mangling (variables become `_0x1a2b`, `_0xc3d4`)
- String encryption (literal strings replaced with decoder calls)
- Control-flow flattening (switch-based dispatch replacing clear if/else trees)
- Dead-code injection

The obfuscated JS is still valid JS — it is the input to Step 2.

**Step 2 — V8 bytecode compilation** (`bytenode`)

Compiles the obfuscated JS into V8 bytecode (`.jsc`). The resulting file:
- Is not human-readable (binary V8 internal format)
- Cannot be trivially decompiled back to JS (no reliable decompiler exists for V8 bytecode)
- Is tied to the exact V8 version shipped with the host Node.js build — `.jsc` compiled for Node 22.x will not load on Node 20.x or Node 23.x

The last point is a **security feature, not a limitation**: `min_host` in `version.json` already enforces that the app layer only loads on a compatible host version. An attacker who extracts a `.jsc` file from one machine cannot run it on a different Node version without the matching host binary.

**CI build steps** (added to `build-runtime-app.yml`):

```yaml
- name: Install protection tools
  run: npm install -g javascript-obfuscator bytenode

- name: Obfuscate application JS
  working-directory: runtime
  run: |
    for file in server sync run browser auth_manager tracker skill_loader install_identity; do
      javascript-obfuscator ${file}.js \
        --output obfuscated/${file}.js \
        --compact true \
        --identifier-names-generator mangled \
        --string-array true \
        --string-array-encoding rc4 \
        --control-flow-flattening true \
        --dead-code-injection true
    done

- name: Compile to V8 bytecode
  working-directory: runtime
  run: |
    for file in obfuscated/*.js; do
      node -e "require('bytenode').compileFile('$file', 'dist-app/$(basename $file .js).jsc')"
    done
```

**Bootstrap change** — `bytenode` must be bundled in the host and registered before loading `.jsc` files:

```js
// bootstrap.js (inside pkg VFS)
require('bytenode');          // registers .jsc extension with Node module loader
// ... then load external app layer normally:
require(path.join(appDir, 'server.jsc'));
```

`bytenode` is added to `runtime/package.json` dependencies and included in `pkg.scripts` so it is available in the host VFS.

---

### What This Changes in the Folder Structure

`runtime-app/` holds `.jsc` files instead of `.js`:

```
~/.conxa/runtime-app/
    version.json          ← still plain JSON (no secrets inside)
    server.jsc            ← V8 bytecode — binary, not human-readable
    sync.jsc
    run.jsc
    browser.jsc
    auth_manager.jsc
    tracker.jsc
    skill_loader.jsc
    install_identity.jsc
```

`version.json` itself stays plain JSON — it contains only version strings and SHA-256 hashes, no business logic.

---

### What This Changes in GitHub Release Assets

| Asset | Was | Now |
|---|---|---|
| App release artifact | Individual `.js` files (one URL each) | Single `runtime-app-v{version}.zip` containing `.jsc` files |
| Manifest fields | `files[]` array with 8 entries | `bundle_url` + `bundle_sha256` — 2 fields total |
| Render env vars for app layer | ~18 (URL + SHA per file) | 4 (`VERSION`, `MIN_HOST`, `BUNDLE_URL`, `BUNDLE_SHA256`) |

---

### Protection Level Summary

| Threat | Protection | Notes |
|---|---|---|
| Customer opens file in text editor | Blocked — binary `.jsc` file | First line of defence |
| Customer uses a JS decompiler | Blocked — no practical V8 bytecode decompiler | V8 bytecode format is internal and version-specific |
| Customer decompiles `.jsc` to obfuscated JS | Hard — obfuscation makes the output nearly unreadable | Identifier mangling + string encryption + CF flattening |
| Customer extracts and runs `.jsc` on another machine | Blocked — Node ABI mismatch unless they have matching host | Tied to exact Node 22.x minor version |
| Determined attacker with weeks of time | Possible — no JS protection is absolute | Acceptable for a commercial SaaS product |

### What is NOT Protected

- `version.json` — intentionally plain (no secrets, just hashes)
- `pack.json` per company skill pack — customer-facing, they should be able to read their own config
- Log output in `runtime.log` — structured JSON for troubleshooting

---

## Skill-Pack Sync Optimisation

### Why Sync Currently Takes Up to 15 Seconds

The 15-second ceiling in `runtime/sync.js` exists because of four compounding problems in `_doSync()`:

| Problem | Where | Worst-case cost |
|---|---|---|
| Companies synced sequentially | `for` loop line 79 | 2 companies × 7s each = 14s |
| Files downloaded sequentially per company | `for` loop line 127 | 5 files × 3s each = 15s |
| Retry backoff: 0ms → 2000ms → 4000ms | line 101 | 6s of sleeping before giving up |
| No client-side recency check | — | Full HTTP round-trip even if synced 30 seconds ago; server returns 429, retry burns 6s |

The server already rate-limits to **1 sync per 5 minutes per token** (`skillpack_update_routes.py`). When Claude is opened twice within 5 minutes the client hits 429, the retry waits 6 seconds, and sync fails anyway. The 15-second timeout was set *to accommodate* this behaviour rather than fixing it.

---

### Four Fixes

#### Fix 1 — Skip sync if recently synced (client-side cache check)

Before making any HTTP call, check `pack.last_synced` from `pack.json`. If it was written less than 5 minutes ago, skip the company entirely. This matches the server rate-limit window exactly, so the client never fires a request that will return 429.

**Impact:** Most Claude opens (multiple opens in a session, dev re-launches) complete sync in **0ms** — no network call at all.

```
pack.last_synced exists AND age < 5 minutes  →  skip, log "synced Ns ago"
otherwise  →  proceed with HTTP fetch
```

`last_synced` is already written to `pack.json` on every successful sync (line 152 of current `sync.js`) — nothing new needs to be stored.

---

#### Fix 2 — Parallel company sync

Replace the sequential `for` loop over companies with `Promise.allSettled()`. Each company has its own independent `sync_endpoint` and `sync_token`, so they have zero shared state and can run fully concurrently.

```
Before:  company A (3s) → company B (2s) = 5s total
After:   company A (3s)
         company B (2s)  ← parallel
         = 3s total (slowest company wins)
```

A failed company is logged and skipped; `allSettled` ensures one failure never blocks others.

---

#### Fix 3 — Parallel file downloads per company

Replace the sequential `for` loop over `delta.files` with `Promise.all()`. All file buffers are fetched concurrently, held in memory, then written atomically in one pass.

```
Before:  file1 (800ms) → file2 (600ms) → file3 (700ms) = 2100ms
After:   file1 (800ms)
         file2 (600ms)  ← parallel
         file3 (700ms)
         = 800ms total (slowest file wins)
```

Write order: download ALL → verify ALL → write ALL → rollback if any write fails. This is cleaner than the current break-on-first-failure approach because all buffers are in memory before any file is touched on disk.

---

#### Fix 4 — Shorter retry delays and reduced timeouts

| Setting | Current | New | Reason |
|---|---|---|---|
| Retry delays | 0ms, 2000ms, 4000ms | 0ms, 300ms | 6s of sleeping replaced with 300ms; if network is truly down, fast failure is better |
| Delta fetch timeout | 10000ms | 3000ms | With parallelism and no rate-limit 429s, 3s is generous for a small JSON response |
| File download timeout | 15000ms | 8000ms | Skill files are KB-sized JSON; 8s is still conservative |
| Outer `syncSkillPacks` timeout | 15000ms | **4000ms** | Parallelism makes 4s the realistic ceiling for any number of companies |

The outer timeout in `server.js` (`syncSkillPacks(SKILL_PACKS_DIR, { timeoutMs: 15000 })`, line 401) is updated to `4000` in the same change.

---

### Expected Performance After Fixes

| Scenario | Current | After fixes |
|---|---|---|
| Claude re-opened within 5 minutes | ~6s (429 + retry) | **0ms** (skipped client-side) |
| 1 company, already up to date (304) | ~200ms | **~150ms** (one HTTP round-trip) |
| 1 company, 5 files to download | up to 15s sequential | **~800ms** parallel |
| 2 companies, both have updates | up to 15s sequential | **~1s** both in parallel |
| Flaky network, one timeout | up to 15s (6s retry sleep + 10s timeout) | **~3.6s** (300ms retry + 3s timeout) |

The `execute_skill` 2-second race in `server.js` (line 753) means sync must complete within 2 seconds to guarantee the user gets fresh skills on the first run. After these fixes the common cases (skip, 304) resolve well inside 2 seconds. The rare case (actual file downloads) may exceed 2 seconds but completes in background before any subsequent run.

---

### Files to Change

| File | Change |
|---|---|
| `runtime/sync.js` | Full rewrite of `_doSync()`: add recency check, `Promise.allSettled` for companies, `Promise.all` for file downloads, reduce retry delays and timeouts |
| `runtime/server.js` line 401 | `timeoutMs: 15000` → `timeoutMs: 4000` |
| `runtime/server.js` line 769 | Same timeout reduction for the integrity-failure re-sync trigger |

---

## Risk and Fallbacks

| Risk | Mitigation |
|---|---|
| `runtime-app/` corrupted mid-write | Atomic writes (temp → SHA-256 verify → rename). Fallback to bundled `.jsc` copy if integrity fails. |
| `min_host` incompatible (app newer than host) | Bootstrap detects mismatch, loads bundled fallback, triggers host update in background |
| Network unavailable on cold start | App update skipped silently; bundled fallback runs; retried on next cold start |
| Bug in new `server.jsc` | Rollback: ship a new `runtime-app` release with fixed `.jsc`. No 89 MB download needed. |
| Host VFS module not found by external code | Bridge require logs the missing module; falls back to bundled copy if present |
| `.jsc` compiled for wrong Node version | `min_host` prevents loading — bootstrap falls back to bundled `.jsc`, triggers host update |
