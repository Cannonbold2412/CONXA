# Edge Cases That Can Break Conxa

A running log of every edge case found while auditing the codebase, written in plain language.
Each entry says **what can go wrong**, **where it lives** (file references), **severity** (how bad), and **likelihood** (how often).

Produced by parallel subagent audits of: runtime/, conxa-builder (recorder, pipeline, compiler, installers, Electron studio, Python backend), conxa-cloud backend, packages/conxa-core, .github/workflows.

---

## Table of Contents

1. [Runtime (customer machine)](#1-runtime-customer-machine)
2. [Compiler (Build Studio)](#2-compiler-build-studio)
3. [Recorder + Pipeline](#3-recorder--pipeline)
4. [Cloud Backend](#4-cloud-backend)
5. [conxa-core (shared foundation)](#5-conxa-core-shared-foundation)
6. [Electron Studio + CI/CD](#6-electron-studio--cicd)
7. [Cross-cutting themes & top priorities](#7-cross-cutting-themes--top-priorities)

---

## 1. Runtime (customer machine)

### Element resolution

**R1. Shadow DOM elements can never be resolved** — `resolver.js` walks light-DOM parents only. Any button/input inside a shadow root (web components, modern widget libraries) has no resolvable candidate chain → every skill touching it fails silently after retries. Severity: HIGH. Likelihood: grows every year as web components spread.

**R2. Relational signals die when the page layout shifts** — relational anchors ("the input right after this label") are computed against recorded geometry. A responsive breakpoint change breaks them; resolver falls through signals until nothing matches. Severity: MEDIUM. Ref: `resolver.js` durability-walk.

**R3. Uniqueness margin gate can reject the only correct element** — if two near-identical candidates exist (e.g., "Save" appears in a modal and behind it), the winner's margin may never clear `uniqueMargin` (0.15), so even a visually obvious target falls through all signals. Severity: MEDIUM. Likelihood: common on dense admin UIs.

**R4. Zero-candidate sets produce confusing errors** — when pre-gathering descriptors returns an empty list (element inside closed details/tab, removed by JS between gather and click), the error says resolution failed without saying *why*, sending users (and LLM agents) in circles. Severity: LOW-MEDIUM.

### Timing / concurrency

**R5. Non-atomic execution lock lets two runs interleave** — the single-execution lock is check-then-set without atomicity; a duplicated `execute_skill` call (LLM agents retry fast) can start two runs that corrupt each other's downloads folder and telemetry. Severity: HIGH (latent). Ref: `server.js` lock acquisition vs `run.js`.

**R6. Recovery park TTL race** — Tier 3/4 parks a page for recovery; if TTL expires exactly while recovery acts on it, the parked browser is torn down under recovery's feet → crash inside recovery instead of graceful failure. Severity: MEDIUM.

**R7. Cancel during step leaves half-completed actions** — cancel checks happen between steps; a cancelled run mid-`fill()` can leave a form half-typed and mark VERIFY assertions of the *next* run against a dirty state. Severity: MEDIUM.

**R8. Browser crash mid-step loses the failure context** — `page.url()` called unguarded in `isAuthFailure` throws on an already-closed page, masking the real error and losing `failedAt` snapshot data. Severity: MEDIUM. Ref: `run.js:1752-1763`.

**R9. Auth-failure URL heuristic false-positives** — any SPA route containing `/auth/` (e.g., `/settings/authentication`) makes the runtime skip the whole T1/T2 recovery cascade and declare session expiry. Severity: MEDIUM-HIGH. Likelihood: uncommon but silent quality killer.

**R10. `sweepOldRuns` can delete a concurrent run's folder** — only the current `_runId` is excluded; combined with R5 or a Studio sandbox sharing CONXA_DATA_DIR, one run's sweep deletes another's active downloads. Severity: MEDIUM (latent).

### Filesystem / sync / update

**R11. Windows locked-file rename fails atomically-written syncs** — antivirus/indexer holding a target file makes rename fail mid-sync; skill pack left partially updated. Severity: MEDIUM-HIGH on Windows (all customers).

**R12. Junction/current-link swap window** — swapping `current` to a new versioned dir has a window where readers see missing files; a sync starting in that window caches the broken state. Severity: MEDIUM.

**R13. Rollback loop on repeated bad app versions** — version_manager rolls back, but if two consecutive releases are both bad, rollback ping-pongs and the customer ends up on neither. Severity: MEDIUM. Ref: `version_manager.js`.

**R14. Bootstrap async IIFE has no top-level error boundary** — any unexpected throw before server.js loads becomes an unhandled rejection; process dies with no FATAL banner, MCP client sees bare spawn failure. Severity: MEDIUM. Ref: `bootstrap.js:146-168`.

**R15. `--selfcheck` exits 0 unconditionally** — the updater uses selfcheck to validate freshly downloaded runtimes; it checks nothing, so broken builds pass validation vacuously. Severity: HIGH. Ref: `server.js:130-133`, `bootstrap.js:87-93`.

**R16. Chromium wholly absent = no self-heal** — revision-mismatch heal requires `chromium/.revision` to exist; a wiped chromium dir produces "Executable doesn't exist" on first run with no remediation path. Top support-ticket generator. Severity: HIGH. Ref: `server.js:142-159`.

**R17. Background Chromium install races first execution** — detached installer child runs concurrently; first skill run can hit half-extracted Chromium → transient launch failures that look like broken installs. Severity: LOW-MEDIUM.

**R18. `.revision` marker records wrong directory** — takes whichever revision dir readdir lists first; preflight believes the wrong revision is expected. Severity: LOW.

**R19. Fixed `.tmp` name collides across overlapping syncs** — deterministic temp names mean install-time sync racing launch-time sync interleaves writes → corrupted file or EPERM. Severity: LOW-MEDIUM. Ref: `sync.js:51-54`.

**R20. Sync delta request URL unbounded** — sinceMap JSON in query string; hundreds of skills → multi-KB URLs rejected with 414; sync permanently fails for the biggest customers. Severity: MEDIUM. Ref: `sync.js:117-124`.

**R21. Stale cached registry points at dead absolute paths** — manifests.json caches absolute skillDir paths; reinstall to new location serves stale cache until startupSync completes, failing integrity checks pointlessly. Severity: LOW-MEDIUM. Ref: `skill_loader.js:56-64`.

**R22. Integrity check only covers manifest-listed checksums** — if `execution.json` isn't in manifest.checksum map, a truncated/tampered execution plan passes the gate and fails mid-run confusingly. Severity: MEDIUM. Ref: `skill_loader.js:68-81`.

**R23. Deep nesting hits Windows MAX_PATH** — long workspace ids + slugs + version dirs approach 260 chars; AV scanners/Explorer produce spurious "file not found" on valid installs. Severity: LOW-MEDIUM.

**R24. Download filename used unsanitized in path.join** — `download.suggestedFilename()` containing `..` or separators (crafted Content-Disposition) writes outside the run folder. Severity: MEDIUM (security). Ref: `server.js:1250-1254`.

### Auth / keytar

**R25. Plaintext fallback credential store** — when keytar is unavailable (policy-blocked Credential Manager), tokens fall back to plaintext disk storage. Severity: MEDIUM-HIGH (security).

**R26. getSessionKey race on first run** — two concurrent executions both generate session AES keys; second write wins, first run's encrypted sessions unreadable. Severity: MEDIUM.

**R27. Token expiry mid-execution** — long skills outlive token validity; steps fail partway with auth errors the recovery cascade treats as element failures. Severity: MEDIUM.

### Network / telemetry

**R28. Telemetry batch dropped on flush failure** — failed POST batches are discarded, not requeued; flaky networks silently lose business usage data (billing/companies see less than reality). Severity: MEDIUM-HIGH.

**R29. UTF-8 chunk split corrupts telemetry payloads** — batching splits buffers on byte boundaries; a multi-byte character split across chunks produces invalid JSON occasionally. Severity: LOW-MEDIUM.

### MCP protocol

**R30. Corrupted inputs.json crashes list/get inputs** — no try/except around parse; one bad byte kills the tool until manual cleanup. Severity: MEDIUM. Ref: `skill_loader.js`.

**R31. No size/unicode validation on skill inputs** — 10MB string inputs, lone surrogates, emoji in required fields flow straight into Playwright calls; some crash CDP serialization. Severity: LOW-MEDIUM.

**R32. `cancel_execution` response double-encoded** — returns a JSON string as text content unlike other tools; agents parsing strictly misread it. Severity: LOW.

### Downloads / misc

**R33. Invalid `required_runtime` range throws raw RangeError** — semver.satisfies on malformed manifest range reports "Internal error" instead of "this pack is malformed". Severity: LOW.

**R34. Graceful shutdown leaks the parked recovery browser** — shutdown closes cached browsers only; a headed Tier-3 park browser survives MCP process exit, visible Chromium left on customer desktop. Severity: LOW-MEDIUM. Ref: `browser.js:641-648` vs `server.js:1481-1483`.

**R35. stdin close tears down running execution abruptly** — Windows clients kill via stdin close; active run's tracker queue dies unflushed — last telemetry batch lost. Severity: MEDIUM. Ref: `server.js:402`.

---

## 2. Compiler (Build Studio)

### Selector generation

**C1. Quotes/newlines in text anchors break generated selectors** — grammar construction uses raw f-strings with no escaping; `Playwright's "Save"` in an aria-label produces a syntactically invalid selector. Severity: HIGH. Ref: `selector_grammar.py`.

**C2. Bare-tag primary anchors (`div`, `span`) match everywhere** — when a target has no distinguishing attributes, the primary selector degrades to tag name + nth, which breaks on any dynamic content. Severity: HIGH.

**C3. Identical stable hashes for genuinely different elements** — dynamic-class stripping can erase the only difference between two elements; fingerprint collisions make cache/recovery match the wrong node. Severity: MEDIUM. Ref: `stable_hash.py`.

**C4. Frame-chain dropped on transient eval failure violates invariant** — if reading a frame level throws mid-churn, its level silently vanishes from the preserved chain — breaking the "iframe chain verbatim" invariant with no error marker. Severity: MEDIUM. Ref: recorder/frame_utils.py:170-191 feeding compile.

**C5. Huge DOM snapshots: O(selectors × page-size) CPU** — `_count_css` re-parses the full HTML with BeautifulSoup for every selector checked; multi-MB snapshots × dozens of selectors = minutes of compile time and memory spikes. No cap anywhere. Severity: MEDIUM. Ref: `compiler/build.py:946-959`, `selector_filters.py:184-192`.

### LLM calls

**C6. Uncaught router raise aborts compile with no partial report** — when the router raises (not returns None), pipeline dies without writing compile report; user sees generic failure. Severity: MEDIUM.

**C7. Index drift between LLM output and step list** — LLM returns intents indexed positionally; synthetic step insertion shifts indices so intent lands on the wrong step. Severity: MEDIUM. Ref: `llm/` task clients.

**C8. Fallback/degraded LLM results get cached permanently** — intent graph, semantic, recovery caches persist degraded outputs with no TTL or source-aware invalidation; a transient provider outage degrades that workflow forever until manual cache clear. Severity: HIGH (silent quality decay).

**C9. Malformed JSON from model discarded silently** — brace-counting extraction desyncs on braces inside strings; valid-looking model output thrown away, pipeline proceeds without enrichment. Severity: LOW-MEDIUM.

### Pipeline / build

**C10. Events not sorted by timestamp anywhere** — pipeline trusts arrival order; clock skew between event sources reorders steps and compiles a wrong workflow. Severity: MEDIUM. Ref: `pipeline/run.py`.

**C11. Unbalanced frame_enter/frame_exit compiled as-is** — recording interrupted inside an iframe leaves dangling frame markers; runtime enters a frame it never exits (or vice versa), executing remaining steps in the wrong context. Severity: HIGH. Ref: `pipeline/` + `build.py`.

**C12. Hover-desync positional pairing** — hover events inserted synthetically shift positional zips between steps/events/intents in three separate places; passing pairs together would eliminate the class. Severity: MEDIUM.

**C13. Exact-URL assertions too strict for SPAs** — post-condition asserts exact URL equality; query-param ordering or a trailing slash added by the site makes every replay "fail verification". Severity: MEDIUM-HIGH.

**C14. Dead login-strip safety net** — the auth-scrub code paths are dead code or value-passthrough: values recorded in protected fields flow verbatim into `execution.json`, screenshots ship in bundles. The "auth never enters builds" invariant rests entirely on recorder-side redaction. Severity: HIGH (security). Ref: `skill_package_builder.py` value handling.

**C15. Screenshots included in shipped packages** — evidence screenshots (which may contain user data visible at record time) are copied into distributed artifacts. Severity: MEDIUM-HIGH (privacy).

**C16. Slug collision overwrites prior skill** — slug derivation isn't uniqueness-checked; two workflows named similarly overwrite each other via rmtree. Severity: MEDIUM. Ref: `skill_package_builder_saved_skill.py:41-45`.

**C17. All non-Latin names collapse to slug `p_`** — Chinese/Japanese/etc. names normalize to empty → identical `p_` slug for every such workflow; mutual overwrite guaranteed once non-English users arrive. Severity: MEDIUM (certain eventually).

**C18. Package-level target_url frozen on first build forever** — scoped rebuilds preserve existing config without reconciling per-workflow; retired primary workflow keeps advertising stale entry URLs in every future installer. Severity: LOW.

**C19. Vacuous "ok" status for marker-only recordings** — min_confidence starts at 1.0; recordings compiling to only navigate/scroll/markers show green with meaningless confidence. Severity: LOW.

### Installer generation

**C20. NSIS script injection via display name/domain** — company name substituted by raw `.replace()` into NSIS template; a quote or `$"` sequence breaks out of defines and can inject into generated PowerShell executed with `-ExecutionPolicy Bypass` at install time. Severity: HIGH (very rare, but sink executes PowerShell). Ref: `installer_builder.py:448-460`, `setup.nsi.tmpl:33-85`.

**C21. Installer filename path traversal** — `safe_name` only strips spaces; `..\..\evil` domain flows into OutFile and copy destination. Severity: MEDIUM (very rare).

**C22. Dev-channel installer reads prod version file** — DetectRuntime hardcodes the production `.conxa` path regardless of dev subdir; dev installs skip/layer based on prod's version. Severity: LOW.

**C23. Blanket `taskkill /F /IM conxa-runtime.exe`** — upgrade kills every runtime on the machine including other companies' installs or active dev runs. Severity: LOW.

**C24. Offline machine: install "succeeds" with zero skills** — Chromium download failure shows a MessageBox then continues; install-time skill sync "never fails the install", so flaky-network customers get empty installs where `list_skills` returns nothing. Severity: MEDIUM. Ref: `setup.nsi.tmpl:158-206`.

---

## 3. Recorder + Pipeline

### Silent event loss at capture (bridge.js)

**P1. Clicks on plain styled divs are silently dropped** — the bridge only records clicks that resolve to an "interactive ancestor" (button/link/input/role/tabindex/onclick). React/Vue apps attaching onClick via delegation to unadorned divs produce **no event at all** — whole steps vanish from recordings with no warning. Severity: HIGH, common. Ref: `recorder/bridge.js:1177-1192`.

**P2. Double-click records three steps (click + click + dblclick)** — no click/dblclick correlation exists in dedupe; replay toggles something twice before double-clicking. Severity: HIGH, common. Ref: `bridge.js:1307-1318`, `pipeline/dedupe.py`.

**P3. Inner-container scrolling never recorded** — only `window` scroll is listened to; scroll events on modals/virtualized lists don't bubble → replay fails to bring targets into view. Severity: HIGH, common. Ref: `bridge.js:1291-1305`.

**P4. Mouse-based dragging not captured at all** — only HTML5 DnD handled; sliders, sortable lists, canvas signatures (Pointer/Mouse events) produce stray clicks or nothing. A drag ending outside a valid drop target is silently lost. Severity: HIGH for slider/sort-heavy apps. Ref: `bridge.js:1803-1830`.

**P5. Hover capture off by default** — hover-revealed menus aren't recorded unless enabled; replay clicks an item inside a menu that was never opened. Severity: MEDIUM, common. Ref: `bridge.js:159`, `session.py:211`.

**P6. Keyboard shortcuts recorded literally and noisily** — Ctrl+C/V/X inside inputs become replayable keyboard_shortcut steps; Shift+Tab missed entirely; global shortcuts target `<body>` (unusable selector). Severity: MEDIUM. Ref: `bridge.js:1832-1850`.

**P7. SPA navigation loses last keystroke** — typed input flushes on 350ms debounce; "type email → hit Enter" within 350ms on an SPA login loses the final value (pushState fires no unload). Severity: MEDIUM-HIGH, common. Ref: `bridge.js:1146-1157`.

**P8. IME/composition input (CJK) records intermediate values** — pausing >350ms mid-composition flushes pinyin/kana buffer as its own type step, then the committed value again — two fills where one belongs. Severity: MEDIUM, common for CJK users.

**P9. Native date-picker popups degrade to opaque clicks** — JS calendar grids usually lack roles/tabindex; picking a date vanishes (P1) or records `div:nth-of-type(N)` that breaks when month layout differs. Severity: MEDIUM.

**P10. Virtualized-list recycling invalidates positional selectors** — nth-of-type indices snapshotted at event time point at whatever row now occupies the slot after recycling; nothing detects it. Severity: MEDIUM, common in virtualized apps.

**P11. Shadow-DOM CSS paths truncate at shadow boundary** — buildCssPath walks parentElement only, losing host chain; recorded css selector unresolvable from document root. Severity: MEDIUM. Ref: `bridge.js:368-402`.

### Privacy / security

**P12. Password masking heuristic misses most secrets** — only `type=password` and a name regex (pass/otp/secret) are redacted; fields named `token`, `api_key`, `card_number`, `ssn`, `cvv` are recorded **plaintext** into events.jsonl and evidence. Redaction also leaks secret length (`sensitive:<len>`). Severity: HIGH (privacy), common. Ref: `bridge.js:311-328`.

**P13. Relay channel accepts forged messages from any origin** — postMessage listener checks only a magic field, never origin; a hostile iframe can inject fabricated events into any recording. Severity: MEDIUM (integrity), rare. Ref: `bridge.js:124-149`.

### Geometry

**P14. Fixed 1280×720 video vs real viewport breaks every crop** — bounding boxes are CSS px of the actual viewport but mapped 1:1 onto fixed-size video pixels; any other window size or browser zoom shifts/scales every element snapshot, corrupting LLM visual anchoring. Severity: MEDIUM-HIGH, common. Ref: `session.py:1313-1314`, `visual.py`, `frame_extractor.py`.

**P15. Frame offsets measured at drain time, not event time** — offsets read up to seconds after the click (pump drains 1 payload per 0.2s tick); if the click scrolled/moved the iframe, stored bbox is wrong. Severity: MEDIUM.

**P16. Relayed bbox offsets double-counted or missing** — relay adds ancestor iframe rects AND session.py adds frame offsets again depending on how Playwright delivers OOPIF bindings; conversely removed iframes silently skip offsets. Hard-to-diagnose wrong crops. Severity: MEDIUM, rare. Ref: `bridge.js:124-140`, `session.py:842-846`.

**P17. Popup video start sampled late** — early popup events clamp to t=0 with frames cut from the wrong moment. Severity: LOW.

### Session lifecycle

**P18. Crash mid-write corrupts events.jsonl permanently** — file rewritten in-place with mode `"w"` per event; power loss between truncate and finish leaves a torn line, and frame extraction raises on invalid JSON aborting visuals for the whole session. Severity: HIGH, rare. Ref: `session.py:821-825`, `frame_extractor.py:187-193`.

**P19. Disk full silently drops events** — write failures swallowed into an in-memory error list; recording continues, user discovers missing steps at compile time. No free-space check or alert. Severity: MEDIUM-HIGH, rare. Ref: `session.py:708-717`.

**P20. Click storms outrun the pump loop** — ~5 events/sec drain rate vs bursts of dozens; backlog delays DOM-snapshot capture so snapshots reflect a *later* page state, and each drained event rewrites the whole events.jsonl (O(n²) I/O). Severity: MEDIUM, common for fast typists/bulk-select. Ref: `session.py:1454-1459`.

**P21. stop() abandons drain thread on timeout** — reader/writer race: compile can start reading events.jsonl while daemon thread still rewrites it. Severity: MEDIUM, rare. Ref: `session.py:1536-1564`.

**P22. Hung tab stalls recording indefinitely** — crashed pages are tolerated but a *hung* evaluate has no timeout; single pump thread blocks until browser disconnects. Genuine close also takes ~20s grace to register. Severity: MEDIUM, rare.

**P23. Events enqueued during shutdown drain tail are lost** — payloads arriving after the 5s drain window never reach disk. Severity: LOW.

**P24. Dynamic iframes created+destroyed within 2.5s are never instrumented** — bridge install deliberately waits `_BRIDGE_INSTALL_SETTLE_S`; quick ads/modals inside fresh iframes are invisible despite frame-lifecycle logging. Severity: MEDIUM, rare-but-certain-loss. Ref: `session.py:561-596`.

**P25. Two Studio instances recording concurrently share unlocked blob stores** — DOM-snapshot content-hash store sees interleaved writes with no locking. Severity: LOW.

**P26. File chooser cancel wedges future uploads** — pending chooser state never cleared on cancel; later upload intents attach stale pick logic. Severity: MEDIUM, rare. Ref: `session.py:1198-1212`.

### Pipeline processing

**P27. One invalid event kills the entire pipeline run** — inline model_validate in a list comprehension; a single schema-violating event from an older session format aborts everything, no per-event quarantine. Severity: MEDIUM. Ref: `pipeline/run.py:152-154`.

**P28. content_fp ignores action value** — every type event on the same field shares one fingerprint regardless of what was typed; consumers collapse legitimately different inputs (same search box used twice). Severity: MEDIUM. Ref: `pipeline/enrich.py:10-31`.

**P29. Scroll deltas computed across page boundaries** — running `last_y` survives navigations; first scroll on a new page reports garbage amounts. Severity: LOW.

**P30. Selector whitespace normalization alters attribute semantics** — `[aria-label="foo  bar"]` (significant double space) silently becomes a different selector. Severity: LOW, very rare.

**P31. Class heuristics drop legitimate tokens** — long BEM/Tailwind arbitrary classes (>48 chars) discarded before compile ever sees them. Severity: LOW.

**P32. Hover-drop rule deletes thin legit hovers** — bbox clamped tiny (<2px) hairline menu items that open submenus vanish pre-compile. Severity: LOW.

---

## 4. Cloud Backend

### Auth / JWT

**B1. Missing webhook signature accepted (forged webhooks processed)** — verification runs only when signature *present* (`if received_sig and not compare_digest(...)`); omitting it skips HMAC checking entirely. Knowing/guessing a subReferenceId lets anyone activate a paid plan without paying. Severity: CRITICAL, rare. Ref: `cashfree_routes.py:606`.

**B2. Per-request JWKS client — Clerk outage = total auth outage disguised as 401 storm** — fresh PyJWKClient per request defeats caching; Clerk CDN hiccup makes every request 401. Also latency + rate-limit burn always. Severity: HIGH. Ref: `security.py:124`.

**B3. Admin token becomes universal principal on every route** — bearer == CONXA_ADMIN_TOKEN yields role "owner" + own workspace on ALL tenant routes, not just admin ones; one leaked env var compromises everything. Severity: MEDIUM. Ref: `security.py:165-166`, `saas.py:320-324`.

**B4. Legacy trusted-proxy path: unsigned role headers, replayable forever** — static secret path lets holder claim any user_id/org_id/role=owner; even the HMAC path signs only ts:user_id while org_role stays editable. If secret ships in Electron app, every customer mints identities. Severity: HIGH. Ref: `saas.py:259-279`.

**B5. Synchronous uncached Clerk role lookup on hot path** — every OAuth-token request blocks up to 5s on api.clerk.com; Clerk slowness = +5s across dashboard; outage = silent downgrade to basic_member (publish/billing start 403-ing). Severity: MEDIUM, common whenever org_role absent. Ref: `saas.py:176-194`.

**B6. Empty workspace_id legacy tracking rows visible to everyone** — `_batches_for_principal` treats empty-workspace records as globally visible; old runs leak across tenants. Severity: MEDIUM for legacy data. Ref: `services/tracking.py:96`.

**B7. Non-constant-time admin token comparison in updates route** — timing oracle vs the same token that unlocks manifest publishing. Severity: LOW, very rare. Ref: `updates_routes.py:316`.

### Billing / Cashfree

**B8. `/subscriptions/verify` activates plan regardless of status or ownership** — computed status never checked (PENDING/CANCELLED still activates); no check subscription belongs to caller's workspace — any admin can light up another customer's tier on their own workspace. Severity: HIGH, rare. Ref: `cashfree_routes.py:375-415`.

**B9. Out-of-order webhooks resurrect cancelled subscriptions** — delayed NEW_PAYMENT/ACTIVE redelivery flips workspace back to paid with no reconciliation against current state. Severity: MEDIUM, rare. Ref: `cashfree_routes.py:619-640`.

**B10. Upstream Cashfree error text leaked to browsers** — raw resp.text (sometimes containing PII/IDs) embedded in HTTPException details. Severity: LOW, common whenever Cashfree errors.

### LLM proxy / router / metering

**B11. Deterministic client errors cool down healthy providers (pool poisoning)** — any 4xx except 401/403 (e.g., context-window-exceeded) cools a shared pool entry for everyone; one Studio sending giant prompts can sequentially cool the entire pool → global 502s. Severity: HIGH, common. Ref: `router.py:511-518`.

**B12. 401/403 permanently deletes provider keys until restart** — transient auth glitch silently shrinks pool with no re-admission; eventually RuntimeError → 502. Severity: MEDIUM, rare. Ref: `router.py:500-509`.

**B13. Blocking sleeps exhaust FastAPI threadpool** — time.sleep waits + sync urlopen in def endpoints; under provider 429 storms all def-route traffic (incl. health/readiness) stalls. Severity: MEDIUM. Ref: `router.py:253`.

**B14. Metering failure after successful LLM call = free usage + misleading 503 retry loop (double spend)** — record_usage unguarded before entitlement mapping; client retries a call already paid for. Multi-worker metering uses process-local lock → races under-count usage, quota overshoots. Severity: MEDIUM, common at concurrency. Ref: `llm_proxy_routes.py:106-116`, `llm_metering.py`.

**B15. Quota check not atomic with recording** — N concurrent requests all pass check then all record → monthly overshoot. Severity: LOW.

**B16. Vision endpoint accepts any base64** — non-image blobs forwarded, costing money until provider 400s (which then triggers B11 cooldown). Severity: LOW.

**B17. Prompt injection via skill content passes through untouched** — recorded workflow text steers compile-time models; architectural risk worth stating. Severity: MEDIUM product risk.

### Updates / manifests

**B18. Manifest published before artifact exists → fleet-wide signed 404s** — KV write + manifest signing happen before CI artifact upload completes; runtimes polling in the window get validly-signed manifests pointing at dead URLs. Severity: MEDIUM, common during releases. Ref: `updates_routes.py:397-432`.

**B19. No monotonic version guard (downgrade possible)** — admin POST persists whatever version received; leaked token/wrong channel param serves older version to whole stable channel. Severity: MEDIUM, rare. Ref: `updates_routes.py:421`.

**B20. Empty SHA-256 defaults served publicly pre-first-publish** — clients treating empty checksum as "skip verify" install unverified binaries. Severity: MEDIUM, rare. Ref: `updates_routes.py:74-170`.

**B21. Single Ed25519 key, no key version/rotation story** — rotated-unannounced key makes every runtime reject every manifest; lost key bricks updater. Severity: MEDIUM, very rare.

**B22. Unauthenticated GET triggers sign-on-miss write amplification** — cache eviction + traffic spike turns read endpoint into concurrent hot writer. Severity: LOW.

### Sync / storage / platform

**B23. Metadata-only change → permanent empty delta (stale skills served forever)** — delta compares only version strings; a release crashing between mirror-write and component_versions-write (non-atomic multi-step sequence) answers `no_change` while serving stale logic indefinitely. Severity: HIGH, rare but silent+persistent. Ref: `skillpack_update_routes.py:160-205`, `release_routes.py:385-394`.

**B24. Rate limiter charges client before doing work** — 500 during delta-build burns the once-per-5-min budget → customer locked out on transient errors; limiter also non-atomic across instances. Severity: MEDIUM. Ref: `skillpack_update_routes.py:77-87`.

**B25. Entire pack base64'd into one JSON response** — up to 250MB × 1.33 in memory, no streaming/chunking; Render proxy timeouts, OOM. Severity: MEDIUM, rare.

**B26. Public telemetry ingest is an unauthenticated KV write flood** — arbitrary companies arrays upsert attacker-controlled keys with spoofed hostname/username persisted verbatim; cheap storage DoS + dashboard pollution. Severity: MEDIUM. Ref: `skillpack_update_routes.py:282-342`.

**B27. Job routes have NO workspace scoping — cross-tenant view and cancel** — list/get/cancel/SSE work over the global job store; any authenticated user enumerates other tenants' jobs (results, errors, resource ids) and cancels them. SSE generator loops forever on stuck jobs leaking connections. Severity: HIGH, common (any curious customer). Ref: `job_routes.py:22-69`.

**B28. Cross-tenant installer clobber via legacy upload route** — legacy POST takes slug from path without ownership check; any authenticated admin overwrites another company's public installer.exe → complete supply-chain compromise of the victim using a free account. Severity: CRITICAL, rare (needs malicious actor). Ref: `publish_routes.py:642-646` vs v2 route :649-656.

**B29. Chunked uploads skip size pre-check and buffer fully in RAM** — middleware checks Content-Length only; chunked transfer streams entire body into memory; base64 publish files land wholly in RAM twice → memory-death lever on small instances. Severity: MEDIUM. Ref: `publish_routes.py:521`, `security.py:148-159`.

**B30. Non-atomic multi-step release transaction** — five sequential KV writes, no lock; concurrent releases do unsynchronized read-merge-writes on pack.json → lost skills[] entries. Feeds B23. Severity: MEDIUM. Ref: `release_routes.py:367-417`.

**B31. KV namespace collisions by construction** — `__` separators + underscore-permitting slugs mean contrived slug pairs alias each other's history keys. Severity: LOW, very rare.

**B32. Unbounded db_append growth on repeated run_ids** — rogue runtime holding a valid tracking token grows one JSONB row forever. Severity: MEDIUM, rare.

**B33. Malformed JSON ingest returns 500 instead of 400** — unguarded request.json(). Severity: LOW, common.

**B34. Whole saas-state blob read-modify-write under process-local lock only** — two workers lose updates (memberships vanish, billing reverts). Severity: MEDIUM, common with >1 worker. Ref: `saas.py:115-139`.

**B35. Connection pool exhaustion** — default pool_size=5 with chatty per-row KV loops; modest concurrency surfaces QueuePool timeouts as 500s everywhere. Severity: MEDIUM at scale.

**B36. Multi-worker init_db race** — concurrent CREATE TABLE IF NOT EXISTS can kill one worker at boot ("tuple concurrently updated"). Severity: LOW, deploy-time.

**B37. CORS admits credentialed access from any *.vercel.app preview** — allow_origin_regex matches attacker-deployed sites; latent-high once cookies/sessions appear. Severity: LOW today / latent HIGH. Ref: `main.py:124-131`.

---

## 5. conxa-core (shared foundation)

### Dual store (Postgres vs filesystem)

**K1. healthcheck passes while kv_store table is missing** — only runs `SELECT 1`; if init_db failed, /readyz green but every db_get raises UndefinedTable — and callers like get_workflow swallow it (`except Exception: return None`) so data *looks deleted*. Severity: HIGH. Ref: `db.py:81-93`, `workflow_store.py:170-171`.

**K2. Filesystem fallback silently activates when SKILL_DATABASE_URL unset** — conxa-core itself has no prod guard for database_url (only cloud main.py does); scripts/workers importing storage directly write tenant data to container disk. Severity: HIGH, common misconfiguration class. Ref: `db.py:101-108`, `config.py:544`.

**K3. Mixed-mode split brain** — DB mode never falls back to files and listers skip file scan once DB returns any row; dev data written to data/kv vanishes when pointing at Postgres. No migration tool. Severity: HIGH, common on dev→prod.

**K4. Non-atomic writes + unguarded JSON parse = permanent corruption loop** — write_text in place, no tmp+rename; one crash mid-write makes that entity fail forever with no recovery. Severity: HIGH, rare. Ref: `db.py:106-122`.

**K5. Lost updates everywhere: read-modify-write with zero locking** — Electron studio + spawned backend + sandbox share data/; concurrent writes silently lose updates. No file locking anywhere including Windows. Severity: MEDIUM, common. Ref: `db.py:203-210` and every higher store.

**K6. Backend-dependent list ordering** — fs sorts by mtime (changes on update), Postgres by created_at; same namespace different order per backend. Severity: LOW.

**K7. Namespace sanitization collisions** — `"a:b"` and `"a_b"` map to the same directory. Severity: LOW.

**K8. Write failures reported as success** — write_skill catches OSError and returns path; full disk → caller believes save succeeded, data gone. Same pattern in 3 other stores. Severity: HIGH, rare. Ref: `json_store.py:24-28`.

**K9. Raw IDs used as filenames — path traversal** — mirror stores interpolate ids directly into paths (`skills_dir() / f"{skill_id}.json"`, auth/{app_id}.json); `..\..\foo` escapes directory; in multi-tenant use these can be attacker-influenced. Windows reserved names (con, nul) also unhandled. Severity: HIGH (security), rare. Ref: `json_store.py`, `workflow_store.py`, `group_store.py`.

**K10. Schema drift silently erases fields** — unknown fields dropped by pydantic + re-serialization of known-only fields = cross-version round-trips quietly delete new fields; combined with blanket except→None, one bad field makes workflows vanish from UI with zero diagnostics. Severity: MEDIUM. Ref: `workflow_store.py:45-52,160-171`.

**K11. Unvalidated test status poisons workflows permanently** — arbitrary string assigned to Literal field with type: ignore; next model_validate fails → workflow unreadable forever. Severity: MEDIUM. Ref: `workflow_store.py:283`.

**K12. Workspace slug collisions merge distinct workspaces** — team-a/team_a/team.a share one slug → shared pack meta. Safe only while workspace_ids stay UUID-shaped. Severity: MEDIUM, rare.

**K13. Reads mutate storage** — list/get triggers _migrate_workspace which *writes* a default group during reads; racy check-then-create duplicates groups under concurrency. Severity: LOW.

### Config

**K14. Two opposite invalid-env philosophies** — some garbage env values boot-crash with cryptic ValidationError; others (validated fields) silently substitute defaults masking typos. Severity: MEDIUM, common confusion.

**K15. Unclamped numeric settings allow nonsense** — timeout_ms=0 reaches urlopen(timeout=0) → instant-fail every request → all providers look down; gc_interval_secs=0 disables GC unintentionally. Severity: MEDIUM. Ref: `config.py:391,158`.

**K16. Secrets keep trailing whitespace/newlines** — only provider API keys are stripped; a newline pasted into clerk_secret_key/tracking_hmac_secret/database_url breaks JWKS/HMAC/DB with confusing errors. Severity: MEDIUM, common. Ref: `config.py:179-229`.

**K17. Bare-name env collisions** — accepts unprefixed GROQ_API_KEYS alongside SKILL_GROQ_API_KEYS; exports meant for other tools silently feed this app's pool. Severity: MEDIUM, common.

**K18. Boolean env quirks** — "true"/"yes" do nothing where only "1" is accepted; empty values for *_ENABLED kill the boot via validation error. Severity: LOW, common friction.

**K19. Default data_dir lands inside site-packages on pip installs** — non-editable install puts generated state under site-packages/conxa-core/data; destroyed on reinstall. Severity: MEDIUM, rare.

**K20. Settings singleton frozen at import** — monkeypatching os.environ after any conxa_core import has no effect; classic "works in test, not prod". Severity: LOW, common dev pain.

### Snapshots / GC

**K21. Dedup "skip if exists" permanently preserves corrupt blobs** — truncated .html.gz from an interrupted write never overwritten; reads return None so compiles silently degrade with no self-heal. Severity: MEDIUM. Ref: `snapshots.py:43-64`.

**K22. GC deletes DOM blobs still needed by editor recompile** — cleanup is pure directory-mtime, no reference check against compiled skills' snapshot refs; after retention window, 1-click selector regeneration silently loses its input. Severity: MEDIUM-HIGH, guaranteed eventually. Ref: `snapshots_gc.py:34-54`.

**K23. Retention days = 0 wipes everything immediately** — unvalidated config value makes cutoff=now. Severity: MEDIUM, rare.

### LLM engine

**K24. Parallel fan-out fires one HTTP POST per API key simultaneously** — dozens of free-tier keys = self-inflicted retry storm worsening 429 cooldowns; losing futures billed server-side for answers nobody reads. Severity: MEDIUM, common with many keys. Ref: `llm/client.py:492-516`.

**K25. Naive brace matching mangles JSON extraction** — braces inside JSON strings desync depth counting → valid model output discarded as plain text. Severity: LOW-MEDIUM, common with verbose models.

**K26. Non-dict model output wrapped instead of rejected** — downstream gets structurally-valid-but-empty results; failure surfaces far from cause. Severity: LOW.

**K27. Cookie merge first-wins loses rotated sessions** — refreshed session cookie discarded in favor of stale one while localStorage is last-wins; subdomain cookies dropped entirely on refresh — genuine auth-expiry generator for multi-app groups. Severity: MEDIUM, common. Ref: `storage_state.py:26-64`.

### Models / misc

**K28. One bad JSONL line breaks whole session read** — read_session_events parses every line uncaught; torn final line from crashed recording aborts compilation of the entire session. Also slurps huge files fully into memory. Severity: MEDIUM, common for crashed sessions. Ref: `session_events.py:21-25`.

**K29. VisualFeatures.frames strict validator is a forward-compat breaker** — newer recorder frame keys make older cores reject entire events. Severity: MEDIUM, rare.

**K30. Assertion.type is unvalidated str** — typo'd assertion types validate cleanly, fail silently at execution. Severity: LOW, common-ish.

**K31. Progress sink exceptions kill the pipeline** — throwing job-store append propagates into compile paths. Severity: MEDIUM, rare.

**K32. Selector cache: bbox quantization + incomplete invalidation** — int()-truncated floats make elements <1px apart share entries; invalidate purges file cache only, KV entries survive until TTL; gc_interval=0 means lazy expiry → unbounded growth. Severity: LOW, common creep.

**K33. delete crashes on Windows-locked files** — unlink without try/except raises PermissionError instead of "in use". Severity: LOW.

**K34. Timestamp sentinels inconsistent** — Workflow uses 0.0 epoch, GroupApp uses None; sorting mixes conventions across backends. Severity: LOW.

---

## 6. Electron Studio + CI/CD

### Python backend lifecycle

**S1. Spawn failure unhandled** — python exe missing/blocked by AV → bridge never ready, renderer hangs with spinner, no error surfaced. Severity: HIGH. Ref: electron bridge spawn path.

**S2. EPIPE kills main process** — writing to dead child stdout throws uncaught in main process on some paths. Severity: HIGH, rare.

**S3. Restart counter never resets** — repeated transient failures exhaust restart budget permanently even if cause cleared. Severity: LOW.

**S4. Backend restart wipes in-memory state silently** — sessions/recordings in flight lost with no UI notice. Severity: MEDIUM.

**S5. Zombie Chromium after quit** — app quit doesn't reap spawned Playwright browsers; headed browsers linger consuming RAM. Severity: MEDIUM, common.

**S6. No timeouts anywhere in RPC chain** — a hung backend handler leaves renderer promises pending forever; threads leak per hung call. Severity: MEDIUM-HIGH. Ref: bridge.js pending map.

**S7. Giant base64 payloads freeze UI** — screenshots crossing IPC bridge block main process. Severity: LOW-MEDIUM.

**S8. bad_json error has no id → renderer awaits forever** — parse-error responses lack matching id; JS bridge also swallows non-JSON lines silently. Severity: LOW-MEDIUM. Ref: `backend.py:640-642`, `bridge.js:33-47`.

**S9. Unpaired surrogates break newline-delimited framing** — lone surrogate in event text corrupts UTF-8 framing. Severity: LOW, very rare.

### Auth (Studio)

**S10. Raw keyring exceptions surface as internal errors** — Credential Manager blocked by policy produces cryptic failure instead of "sign-in unavailable". Severity: MEDIUM.

**S11. Credential blob >2500 bytes fails** — large Clerk tokens exceed Windows credential size limit. Severity: MEDIUM, rare.

**S12. Fixed-port OAuth callback squatting** — predictable localhost port lets another local process intercept PKCE redirect or cause mismatch errors. Severity: MEDIUM-HIGH, rare.

**S13. Cross-instance token refresh rotation race** — two Studio instances refresh simultaneously; second write invalidates first's refresh token. Severity: MEDIUM.

**S14. Login timeout leaves half-state** — 300s browser-login timeout abandons flow mid-PKCE; next attempt confused by stale verifier. Severity: LOW.

### Updater

**S15. Update installs during active recording session** — auto-update relaunches mid-session destroying work in progress. Severity: HIGH, medium likelihood. 

**S16. semverGt prerelease blindness** — version comparison misorders prerelease tags → wrong update decisions. Severity: MEDIUM.

**S17. No NSIS rollback path on failed install** — interrupted update leaves Studio broken with no recovery. Severity: HIGH, very rare.

**S18. checkForUpdates has no timeout** — network hang blocks update checks indefinitely. Severity: MEDIUM.

### CI/CD

**S19. workflow_dispatch tag input shadowed by ref_name** — manually dispatched builds stamp the checkout ref instead of the input version → garbage releases published from one misclick. Severity: HIGH, medium. Ref: build workflows version extraction.

**S20. Missing secrets silently skip publish steps** — forked PRs or rotated secrets make publish steps skip without failing the run; release looks green but nothing shipped. Severity: HIGH, rare.

**S21. Host built without manifest pubkey baked in** — pubkey env missing at build → runtime can't verify any manifest post-deploy. Severity: HIGH, very rare.

**S22. Unpinned obfuscator/choco tool versions** — tool update changes obfuscation output nondeterministically; re-tagging same commit produces different artifact hashes, breaking integrity assumptions. Severity: MEDIUM.

**S23. MIN_HOST gate false-reds / creeps** — gate fails because MIN_HOST is stale rather than code being broken; teams learn to ignore it, defeating the gate. Documented risk now confirmed as structural. Ref: build-runtime-app.yml.

**S24. Promote-release races stable publish** — promotion re-signing while stable publish writes manifests → interleaved channel state. Severity: MEDIUM, rare.

**S25. Permanently ignored tests in workflows** — skipped suites rot silently. Severity: LOW-MEDIUM.

**S26. Unsigned installer ships on signing failure** — signing step warns but doesn't block; unsigned exe delivered to enterprise customers who then hit SmartScreen far from the cause. Severity: MEDIUM, certain eventually. Ref: installer_builder.py:288-303.

**S27. rollback_dep deletes dependency before restoring** — window where neither old nor new dep exists; failure mid-way strands install. Severity: HIGH, rare.

**S28. Corrupt installed.json causes update churn loop** — unparseable state file → updater re-downloads/reinstalls repeatedly. Severity: LOW-MEDIUM.

### LLM proxy client (studio side)

**S29. Double-401 degrades compiles silently** — proxy auth failure falls back to degraded/no-LLM path with minimal user signal; skills compile worse and nobody knows why. Severity: MEDIUM-HIGH, rare. Ref: `services/llm_proxy_client.py`.

**S30. Provider 502s quietly degrade quality** — router exhaustion mapped to fallback behavior instead of surfacing. Severity: MEDIUM.

**S31. Quota abort strands reserved credits** — entitlement abort mid-pipeline leaves reserved usage counted but unused. Severity: MEDIUM.

**S32. Token-provider exceptions bypass error taxonomy** — keyring failure inside _token_provider() propagates raw instead of mapping to CloudUnreachable/"please sign in". Severity: MEDIUM. Ref: `llm_proxy_client.py:103`.

---

## 7. Cross-cutting themes & top priorities

### Systemic themes (each causes many of the findings above)

1. **Swallowed errors everywhere.** `except Exception: pass` / `return None` patterns (conxa-core stores, recorder, telemetry) convert corruption and config mistakes into *silent data disappearance*. The user finds out weeks later.
2. **No escaping discipline at output boundaries.** Selector grammar (f-strings), NSIS templating (raw .replace), slug derivation — one shared escape+validate layer per output format would close ~10 findings (C1, C16-C21).
3. **Non-atomic writes with no locking, everywhere.** events.jsonl rewrite, JSON stores, sync tmp files, release KV sequences, saas-state blob. Every concurrent-writer scenario is a corruption or lost-update scenario.
4. **Cache semantics: degraded results persist forever.** Intent/semantic/recovery/selector caches (compiler) plus stale registry cache (runtime) all lack TTLs or source-aware invalidation.
5. **Positional-index pairing fragility.** Steps/events/intents paired by list position in 3 places; synthetic insertions shift indices silently. Pass tuples instead of parallel lists.
6. **Auth-leak backstop is dead code.** The "auth never enters builds" invariant rests entirely on recorder redaction; compiler-side scrubbers are dead or value-passthrough; screenshots ship. Needs a final pre-write scrub of execution.json.
7. **Fail-open security checks.** Missing webhook signature accepted (B1), seat limits skipped on Clerk outage, subscription verify ignores status/ownership, job routes unscoped, legacy installer upload unscoped. Each is a small check away from safe.

### If you fix only ten things, fix these

| # | Fix | Why first |
|---|-----|-----------|
| 1 | Shadow DOM resolution gap (R1) | Silent universal failure mode growing yearly |
| 2 | Require webhook signature presence (B1) | One-line fix; closes paid-tier forgery |
| 3 | Scope legacy installer upload by principal (B28) | One-line parity fix; closes cross-tenant supply-chain takeover |
| 4 | Scope job routes by workspace (B27) | Cross-tenant data leak + cancel abuse |
| 5 | Make `--selfcheck` actually check (R15) | Currently launders broken updates past the updater |
| 6 | Stop cooling pool on deterministic 4xx + re-admit dropped keys (B11/B12) | Global 502 storms from one bad client |
| 7 | Atomic writes + file locking for JSON stores and sync (K4/K5/R19) | Whole class of corruption |
| 8 | Chromium-missing-without-revision self-heal (R16) | Most common "first run fails" ticket |
| 9 | Recorder: capture div-clicks, inner scroll, drag; dedupe double-click (P1-P4) | Steps silently vanish from every recording today |
| 10 | Secret-masking regex overhaul + pre-write scrub of execution.json (P12/C14/C15) | Plaintext secrets and user-visible screenshots leaving customer machines |

### Probability tiers

- **Will happen to most users eventually:** P1, P3, P14, P20, B2-latency, K22, S26, C8-quality-decay, R28
- **Will happen to some users:** R16, R9, P2, P7, B11, B18, K16, K27, S15
- **Rare but catastrophic:** B1, B28, C20, K9, F-class installer issues, S19, B23

