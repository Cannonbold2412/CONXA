# Authentication and Auto-Updater — How They Work

This document explains exactly how authentication and automatic updates flow across all three Conxa systems: **Build Studio**, **Conxa Cloud**, and **Runtime/MCP**.

---

## Part 1 — Authentication

There are two completely separate authentication systems in Conxa. They share no tokens and exist for different purposes.

| System | Who authenticates | Protocol | Token storage |
|---|---|---|---|
| Build Studio → Cloud | SaaS vendor (developer) | Clerk PKCE OAuth | OS keyring (`keyring` Python lib) |
| Runtime → Target website | End-user's browser session | Playwright `storageState` | Encrypted file on disk (AES-256-GCM) |

---

### 1.1 Build Studio Authentication (Clerk PKCE)

The Build Studio authenticates the SaaS vendor against Clerk so it can call the Conxa Cloud API for LLM proxying, publishing, and billing.

#### Login flow

```
Build Studio (renderer)          Build Studio (Python backend)       Clerk (clerk.conxa.in)
─────────────────────────        ──────────────────────────────      ──────────────────────
User clicks "Sign in"
  │
  └─→ cmd('login')
                                  1. Generate PKCE pair
                                     verifier = random 48 bytes
                                     challenge = SHA-256(verifier), base64url
                                  2. Generate random `state` token
                                  3. Bind HTTP server on 127.0.0.1:52741–52750
                                     (fixed port range so redirect_uri can be
                                      pre-registered in Clerk — random ports can't)
                                  4. Build authorize URL:
                                     GET /oauth/authorize
                                       ?response_type=code
                                       &client_id=Z7O8UdIVowd3Aegx
                                       &redirect_uri=http://127.0.0.1:{port}/cb
                                       &scope=profile email offline_access user:org:read
                                       &code_challenge={challenge}
                                       &code_challenge_method=S256
                                       &state={state}
                                  5. webbrowser.open(authorize_url)
                                                                      User logs in via browser
                                                                      Clerk redirects to:
                                                                      http://127.0.0.1:{port}/cb
                                                                        ?code=XYZ&state=ABC
                                  6. Local HTTP server catches redirect
                                     Verifies state matches
                                  7. POST /oauth/token
                                       grant_type=authorization_code
                                       code=XYZ
                                       code_verifier={verifier}
                                       client_id=...
                                       redirect_uri=...
                                     (no client_secret — this is a public PKCE client)
                                                                      Returns:
                                                                        access_token
                                                                        refresh_token
                                                                        expires_in
                                  8. GET /oauth/userinfo (Bearer access_token)
                                     Extracts: sub, email, org_id, name
                                  9. Saves JSON to OS keyring:
                                     service="conxa-studio" (or "conxa-studio-dev"
                                     when CONXA_ENV=dev — keeps dev-lane logins from
                                     being read back by a packaged/prod install),
                                     account="session"
                                     { access_token, refresh_token, exp, userinfo }
  ←─ identity { org_id, user_id, email, name }
```

**Key design decisions:**

- **No client secret.** Clerk is configured as a public OAuth app. The `CONXA_CLERK_CLIENT_SECRET` env var is optional; `auth_service.py` only sends it if present. Never commit a default value.
- **Fixed port range (52741–52750)** for the local callback server. Clerk requires exact redirect URI pre-registration; random ports cannot be registered.
- **Cloudflare workaround.** The token endpoint at `clerk.conxa.in` is behind Cloudflare, which blocks Python's default user-agent. The code sends a Chrome-style `User-Agent` header.
- **Userinfo size limit.** Windows Credential Manager has a ~2500-byte limit. Only 5 fields are kept from `/oauth/userinfo`: `sub`, `email`, `name`, `full_name`, `org_id`.

#### Dev-only auth bypass

Setting `CONXA_DEV_SKIP_AUTH=1` alongside `CONXA_ENV=dev` makes `login()` and `current_identity()` (`auth_service.py`) short-circuit to a fixed `dev-user`/`dev-org` identity instead of running the Clerk PKCE flow — no browser round-trip, no keyring read. It requires both vars (not just the dev lane) so `dev-studio.ps1` still exercises real Clerk login by default; set the flag only when iterating on Studio UI and you don't need a real identity. Never honored outside `CONXA_ENV=dev`.

#### Token refresh

On every `get_token()` call (which happens before every LLM proxy request), the service checks if the access token expires within 60 seconds. If so, it silently calls `POST /oauth/token` with `grant_type=refresh_token` and saves the new token set to the keyring. The app never shows a re-login prompt unless the refresh token itself has expired.

#### How the token is used

Every LLM compile call in Build Studio goes through `LLMProxyClient`:

```
Build Studio (Python compiler)          Conxa Cloud API
──────────────────────────────          ───────────────
POST /api/v1/llm/proxy/text
  Authorization: Bearer {access_token}
  X-Conxa-Client: build-studio
  Body: { task, payload, timeout_ms }
                                         Middleware verifies Clerk JWT (RS256)
                                         Extracts org_id → applies quota
                                         Forwards to LLM provider pool
                                         Returns LLM response
```

On HTTP 401, `LLMProxyClient` retries once after triggering token refresh. On HTTP 429, it raises `QuotaExceeded`.

---

### 1.2 Cloud API Authentication (Clerk JWT verification)

All Conxa Cloud API endpoints except a small public allowlist require a valid Clerk JWT.

**Public (no auth required):**
- `GET /healthz`, `GET /readyz`
- `GET /api/v1/updates/*` — manifest endpoints (fetched before login)
- `GET /api/v1/installers/*` — installer downloads (no Clerk account needed)
- `GET /api/v1/skill-packs/*` — skill pack delta sync (runtime has its own token)
- `POST /api/v1/tracking/{co}/events` — telemetry ingestion (package token, not Clerk)

**Protected (Clerk JWT required):**
Everything else — LLM proxy, skill pack publishing, billing, dashboard.

Verification (`app/api/security.py`):
1. Extract `Authorization: Bearer {token}` header
2. Fetch Clerk JWKS from `settings.clerk_jwks_url` (cached by PyJWKClient)
3. Verify RS256 signature, issuer, and optionally audience
4. Optionally check `azp` (authorized party) against an allowlist
5. Attach `request.state.auth = { subject, org_id, claims }` for downstream handlers

---

### 1.3 Runtime Authentication (Installer-Embedded Sync Token + Session Encryption)

The Runtime is a different system entirely. It authenticates against the Conxa Cloud on behalf of the end customer using the **installer-embedded sync token** described in `docs/TRD.md` §5.4 (a `secrets.token_urlsafe(32)` string minted at publish time, written into `pack.json`, sent as `Authorization: Bearer` on every skill-pack delta request — no keytar lookup, no user login, no refresh flow). It separately manages Playwright browser sessions on the customer's target websites, encrypted at rest with a per-company key described below.

#### Per-company session-encryption key (keytar)

`runtime/auth_manager.js`'s `getSessionKey()` stores one **random, per-machine, per-company session-encryption key** in the OS credential manager via `keytar` (native Node.js module) — this is deliberately **not** a Conxa cloud-auth token and has no expiry or refresh flow:

```
keytar service = "conxa-session"
keytar account = "{company_id}"
value = 32-byte random key, hex-encoded (generated on first use if absent)
```

**In the packaged exe:** `keytar.node` is placed as a sibling file next to `runtime-win.exe`. The runtime uses `process.dlopen()` to load it directly (pkg bundles can't include native modules inline).

**Fallback (dev/testing only):** If keytar is unavailable, the key is stored in a plaintext JSON file at `~/.conxa/cache/.keytar.json`. This is never used in production.

Keeping this key separate from the installer-embedded sync token is intentional (see the comment in `auth_manager.js`): a leaked installer exposes the sync token (read-only skill-pack access) but cannot decrypt any individual user's session file, since the encryption key is machine-specific and never leaves the OS keychain.

#### Playwright session encryption (AES-256-GCM)

When a skill executes in Playwright, the browser's session state (cookies, localStorage) is saved encrypted to disk:

```
Key derivation: HKDF-SHA-256(per-company session key, salt=32-byte zero, info="conxa-session-v1") → 32-byte key
Encryption: AES-256-GCM, random 12-byte IV per save
File: ~/.conxa/data/sessions/{company}_state.json
     { iv, tag, data } — all base64
```

The session is only decryptable with the same per-company session key used to encrypt it. If that key is ever rotated or lost, the old session file is unreadable and a fresh session starts — this is intentional.

#### Target website login — first run and mid-execution re-login

`runtime/browser.js`'s `getAuthContext()` resolves a company's browser session on every `execute_skill` call, in order: (1) the encrypted session, decrypted and probed against `pack.json`'s `protected_url` in a throwaway headless browser (`_validateSession`); (2) an unencrypted `_raw_state.json` fallback (installer-included initial session); (3) an interactive login window if neither validates. Mid-execution, `run.js`'s `isAuthFailure()` (URL/title heuristic) detects a login redirect after a step fails, and `server.js` routes it through the same interactive-login path via `captureReAuth()`.

**The interactive login window is non-blocking.** `beginInteractiveAuth()` opens a headed Chromium window (seeded with whatever session is already on disk, even if expired — a partially-stale session often skips straight past steps the site would otherwise re-prompt for) and returns immediately with `{ authPending: true, loginUrl, message }`. Capture and persistence happen in the background:
1. `_captureInteractiveAuth()` navigates to the login URL and watches for the page to land on `protected_url`'s **own hostname**, off any login path — scoped to that host so an OAuth leg through a different host (e.g. `accounts.google.com`, whose URLs contain `auth`/`oauth`/`signin`) is never mistaken for "still on the login page". This auto-closes the window ~1.5s after landing.
2. The captured `storageState` is persisted the same way as (1)/(2) above — encrypted via the per-company keytar key, falling back to plaintext `_raw_state.json` only if encryption itself fails (SG-11).
3. If the window is closed before a session is captured, it reopens once automatically; a second failure marks the attempt abandoned and the next `execute_skill` call starts over.

Because the tool call returns immediately rather than blocking, a slow human login never risks losing the MCP client's response — the caller (Claude) is told a login window is open and to re-run the skill (or resume with `resume_from` for a mid-execution failure) once signed in; the next call picks up whatever session the background capture saved. There is no fixed timeout on the login window itself, and no attempt cap across separate `execute_skill` calls — each retry is a deliberate new tool call, not an in-process loop.

`runtime/auth_manager.js`'s `refreshSession()` — a blocking, in-process version of the same idea — is dead code, superseded by the flow above; only `runtime/test/test_auth_recovery.js` still calls it.

---

## Part 2 — Auto-Updater

There are two independent auto-update mechanisms: one for **Build Studio** (the Electron app itself) and one for **Runtime** (the MCP server on the customer machine).

---

### 2.1 Build Studio Auto-Updater (Cloud manifest + differential download)

The Build Studio uses a **Cloud `studio-manifest`** for app-level updates. Updates are **mandatory and blocking** — the app does not start until the user applies any available update.

**Installer:** per-user NSIS (`oneClick: true`, `perMachine: false`). No wizard, no UAC prompt on update. Installs under `%LOCALAPPDATA%`. electron-builder publishes three artifacts per release: the `.exe`, a `.blockmap`, and `latest.yml` — all required for differential downloads.

**Version discovery + download:** `GET /api/v1/updates/studio-manifest` (public endpoint, no auth). The Render env var `CONXA_STUDIO_WIN_URL` controls where the installer lives. `main.js` derives the release directory from that URL (strips the filename), then points **electron-updater's generic provider** at that base URL. electron-updater reads `latest.yml` from the same directory and performs a **differential (blockmap) download** — only blocks that changed from the previously-cached installer are fetched, not the full ~179 MB. Integrity is automatically verified against the `sha512` field in `latest.yml` (stronger than SHA-256; no manual checksum env var needed). `CONXA_STUDIO_VERSION` / `CONXA_STUDIO_WIN_SHA256` are still published in the manifest for other consumers but are no longer used by the Studio updater itself.

```
App.tsx (renderer gate)              main.js (IPC)                          Cloud + GitHub CDN
───────────────────────              ─────────────                          ──────────────────
On cold start (packaged only):
  update:check IPC call
                                       GET /api/v1/updates/studio-manifest
                                       (8 s timeout; fail-open on error)
                                       Derive baseUrl from manifest.win_url
                                       (strip filename)
                                       autoUpdater.setFeedURL({
                                         provider:"generic", url:baseUrl })
                                       autoUpdater.checkForUpdates()
                                         → GET baseUrl/latest.yml
                                       stripVersion(updateInfo.version)
                                       vs. app.getVersion() (semver)
  available=true → block app
  show UpdateRequiredScreen
  user clicks "Update now"
  update:start IPC call
                                       autoUpdater.downloadUpdate()
                                       Differential download via .blockmap:
                                         fetch only changed blocks from CDN
                                         (Range requests; CDN honors 206)
                                         → "update:status" download-progress
  live progress bar in UI              sha512 auto-verified vs. latest.yml
                                         → "update:status" downloaded
  update:install IPC call
                                       autoUpdater.quitAndInstall(
                                         true /*silent*/, true /*force-run*/)
                                       (NsisUpdater builds --updated /S --force-run)
  (app relaunches as new version)

  available=false (or check error)
  → proceed to identity check
```

**Fail-open:** if the manifest fetch or `checkForUpdates()` fails (offline, timeout, HTTP error), `update:check` returns `{ available: false, error: <message> }`. The startup gate treats any `error` result the same as "no update" and lets the user through. The Settings "Check for Updates" button surfaces the error message instead of silently reporting "up to date."

**In dev (`IS_DEV = !app.isPackaged`):** `update:check` returns `{ available: false }` immediately — the cloud is not contacted, so dev loops are never blocked. Override with `CONXA_FORCE_UPDATE_SCREEN=1` to preview the mandatory-update UI without a packaged build.

**Differential download caveats:**
- The *first* update from a machine with no electron-updater cache will download the full installer (~179 MB). Incremental savings begin from the second update onward, once a cached baseline exists.
- Actual savings depend on how many installer blocks are byte-identical between builds. The 179 MB is dominated by the bundled PyInstaller backend. If PyInstaller builds are non-reproducible, savings may be limited. Measure real block reuse on representative build pairs and consider splitting the backend into a separately-versioned dep (like `runtime-win.exe` via `deps-manifest`) if overlap is consistently poor.

**Migration-proof:** `CONXA_STUDIO_WIN_URL` is the single control point. When artifacts move from GitHub Releases to Conxa-hosted storage, updating this env var on Render is the only required change — no code touches a GitHub tag or API.

**NSIS install args** (NsisUpdater.quitAndInstall builds these internally):
- `--updated` — tells the NSIS script this is an update install
- `/S` — silent mode (no wizard)
- `--force-run` — relaunch the app after installation

**Settings — manual update:** the Settings page includes a "Software Update" card showing the current version and a "Check for Updates" button. On finding a new version it shows "Update now" which drives the same download→install flow. On error it shows the error message.

**Key code locations:**
- `main.js` — `update:check / update:start / update:install / app:version` IPC handlers; `semverGt()`, `stripVersion()`, `sendUpdateStatus()`, `ensureUpdateListeners()`
- `renderer/src/pages/UpdateRequiredScreen.tsx` — mandatory blocking gate (early-return from App)
- `renderer/src/hooks/useUpdater.ts` — shared download state hook used by both the gate and Settings
- `renderer/src/App.tsx` — gate ordering: deps → update check → identity
- `renderer/src/pages/SettingsPage.tsx` — `SoftwareUpdateCard` component

---

### 2.2 Runtime Self-Updater (bootstrap.js + server.js + manifest_signer.py)

> The flat-file `update.bat` / `runtime.exe.next` / `runtime-update-pending.json` mechanism described
> in earlier revisions of this doc **no longer exists**. It was replaced by versioned directories +
> one signed manifest. `docs/TRD.md` §5.8 has the full sequence diagrams; this section is the
> operational summary.

The runtime ships as two independently-updatable layers (see `docs/TRD.md` §4.4): the **host exe**
(`conxa-runtime/`, the pkg bundle + `keytar.node`) and the **app layer** (`conxa-app/`, the
JavaScript that actually implements the MCP server). Each lands in its own versioned directory and
`current` is a junction pointed at the active one, so an update never overwrites the file the
running process was loaded from — and a rollback is just flipping the junction back, with no
re-download.

**One signed manifest drives both.** `GET /api/v1/manifest.json` (public, no auth) returns every
component's version, download URL, SHA-256, rollout percentage, `minimum_versions` floor, and — for
`conxa_app` — a `min_host` floor. It is Ed25519-signed server-side with `CONXA_MANIFEST_SIGNING_KEY`
(never in CI); the runtime verifies it against a public key baked into the host exe at build time.
**A manifest that fails verification is discarded outright**, treated exactly like a network failure
— the last verified cache is used, or the check is skipped entirely on a first run. There is no
local TTL: every launch fetches fresh, falling back to cache only on failure.

**Two call sites, two different timings:**

| Layer | Checked by | When | Effective |
|---|---|---|---|
| `conxa_app` | `bootstrap.js` (baked into the host exe) | **Pre-load** — before `server.js` is ever `require()`'d | **This launch.** Nothing has the old code in the module cache yet |
| `conxa_runtime` | `server.js`'s `startupSync`, reusing the manifest `bootstrap.js` already fetched (`global.__conxaManifest`) | Post-load, in parallel with skill sync | Next cold start — a process cannot replace its own running binary |

```
bootstrap.js (host exe)                     Cloud
───────────────────────                     ─────
GET /api/v1/manifest.json (3s timeout) ───► signed manifest
verify Ed25519 vs baked-in public key
decideUpdate("conxa_app"):
  semver > current?
  min_host <= HOST_VERSION?
  minimum_versions floor / rollout bucket?
  └─ yes → download zip (2 retries × 5s)
           SHA-256 verify → extract to conxa-app/<version>/
           validate server.js present
           version_manager.activate() → flip `current` junction, prune
  any failure → swallowed; `current` left exactly where it was
re-check min_host on whatever `current` now points at
require(conxa-app/current/server.js)   ← runs the version just activated

server.js startupSync (app layer)
─────────────────────────────────
decideUpdate("conxa_runtime")  ← reuses bootstrap's manifest, no second fetch
  └─ yes → download conxa-runtime.exe + keytar.node into conxa-runtime/<version>/
           SHA-256 verify each → spawn new exe with --selfcheck (own CONXA_DIR)
           exit 0 → version_manager.activate();  non-zero → abort, `current` untouched
```

Two properties worth keeping straight:

- **The app-layer leg is launch-blocking, so its budget is deliberately tight** (3s manifest fetch,
  2 retries × 5s for the ~60 KB zip) and every failure path — network, signature, download, decode —
  is caught and swallowed. Typical added latency: well under a second with no update pending.
- **The host leg is not launch-blocking** and keeps a generous retry-with-backoff budget, because it
  cannot take effect until the next cold start regardless.
- **`min_host` is enforced twice** — once when deciding whether to download an app-layer update at
  all (so a too-new app layer is never installed on an old host), and once at load time against
  whatever `current` points at. `runtime/test/gate_replay.js` runs in `build-runtime-app.yml` before
  the release step, replaying a real skill against the declared `MIN_HOST` exe — a red gate there
  usually means `MIN_HOST` is stale, not that the gate is wrong.

`--selfcheck` exists because a matching SHA-256 only proves the download wasn't corrupted, not that
the binary boots. `--install-playwright` (bundled `playwright-core/cli`, no system npm needed)
remains idempotent: it exits immediately when the Chromium revision from `browsers.json` is already
on disk, and only downloads (~120 MB) when the Playwright version actually bumped.

**Deprecated shims:** `GET /api/v1/updates/conxa-runtime-manifest` and
`GET /api/v1/updates/conxa-app-manifest` still serve, deriving from the same `component_versions` KV
data, purely for runtimes that predate the manifest-driven updater. The older single
`updates/runtime-manifest` endpoint is gone.

#### Skill pack delta sync

Skill packs are versioned per skill, not per pack — republishing one skill never re-downloads the
others. On every cold start (skipped if synced under 5 minutes ago):

```
runtime/sync.js                           Conxa Cloud API
───────────────                           ────────────────
For each company in ~/.conxa/data/skill-packs/:
  Read pack.json → sync_endpoint
  Read each skill's OWN version from skills/<slug>/current/version.json
  GET {sync_endpoint}?since={JSON map of slug:version}
    Authorization: Bearer {company_token}
                                           Returns per-skill delta:
                                           { skills: [{name, action, version?,
                                               files: [{path, sha256,
                                                        content_base64|content_url}]}] }
  Download every changed skill's files in parallel first, then per skill:
    Write into skills/<slug>/<version>/ via atomicWrite (SHA-256 verified)
    version_manager.activate(requiredFiles: ["manifest.json"], keep: 3)
      → flip that skill's `current` junction, prune old versions
    Activation failure → discard the partial version dir; that skill's `current` is untouched
  Update pack.json.last_synced → reload the skill index
```

**Integrity guarantee:** every file write goes through `atomicWrite()` — write to `.tmp`, verify
SHA-256, then `rename()`. A failed verification deletes the temp file and leaves the previous
version directory live. The runtime never runs from a partially-written skill pack, and a bad
publish for one skill can never take down the others.

---

### 2.3 Build Studio Dependency Bootstrap (first launch)

The Build Studio installer is small (Electron + PyInstaller backend only). On first launch it downloads three large dependencies that are not bundled:

| Dep | Location | How versioned |
|---|---|---|
| Chromium | `~/.conxa/deps/chromium/` | Playwright `install chromium` |
| NSIS (makensis.exe) | `~/.conxa/deps/nsis/` | `CONXA_NSIS_URL` on Render |
| runtime-win.exe + keytar.node | `~/.conxa/deps/runtime/{version}/` | `CONXA_RUNTIME_VERSION` on Render |

The manifest is fetched from `GET /api/v1/updates/deps-manifest` (public — called before user logs in).

**Download flow:**
1. App checks `check_status()` — fast offline check of canonical paths
2. If `all_ready = true`: skip bootstrap entirely, go straight to login
3. If any dep missing: show `BootstrapScreen` UI with per-dep progress bars
4. `cmd('bootstrap')` → Python `ensure_all()` → Chromium and every outdated manifest dep download concurrently on separate threads (independent files/URLs, no reason to serialize); the installed-versions ledger write is lock-protected so concurrent installs can't drop each other's entry
5. Each `ensure_*` is idempotent — safe to re-run if interrupted

**SHA-256 verification:** Both NSIS zip and `runtime-win.exe` are SHA-256 verified against the manifest after download. Mismatch → file deleted, error surfaced with the download URL so IT teams can whitelist on corporate networks.

**Dev mode:** The bootstrap gate is skipped entirely when `window.conxa.isPackaged === false` (i.e. `process.defaultApp` is truthy in Electron dev). Developers manage deps via `scripts/setup.ps1`.

---

## Summary: Which token goes where

```
Token                     Lives in                  Used for
───────────────────────   ──────────────────────    ────────────────────────────────────────
Clerk access token        OS keyring (Python)       Cloud LLM proxy, skill pack publish, billing
Clerk refresh token       OS keyring (Python)       Refreshing the access token silently
Sync token                pack.json (per company)    Skill-pack delta sync (TRD.md §5.4) — no keychain, no refresh
Per-company session key   OS keyring (Node/keytar)  Encrypting Playwright storageState at rest
Playwright storageState   AES-GCM file on disk      Target website session (cookies/localStorage)
```

No token ever leaves the machine it was issued for. The cloud does not hold Playwright sessions. The runtime does not hold Clerk tokens. Telemetry ingestion is authenticated separately — see `docs/TRD.md` §5.9 / `docs/Backend-Schema.md` for the tracking-endpoint contract.
