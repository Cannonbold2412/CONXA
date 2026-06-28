# Fix Log

---

## "Deploy stops at search_repositories" — Element finding fix — 2026-06-29

**Problem:** Running "Conxa deploy SEARCH_ENGINE repo on Render" through Claude kept stopping
at the step where it searches for the repository ("Search repositories" box). Sometimes it
limped past that step but then died one or two steps later ("Element not found"). It was
flaky — occasionally a whole run got lucky and finished.

**What was actually wrong (the real root cause, not just that one step):**

The runtime finds each element on the page using a "scorecard". It looks at the element the
recorder saw (its test-id, its role, its text) and compares that to what's on the live page.
If the scorecard is confident enough, it acts. If not, it falls back to slower, flakier
recovery methods.

For **text boxes** (the repo search field, the blueprint-name field, and similar inputs) the
scorecard was always coming back as **zero confidence**, so the fast, reliable path was never
used. The runtime was limping through the *entire* workflow on the flaky backup method —
which is exactly why it failed at a different step each time, depending on which one happened
to load too slowly.

Two reasons the scorecard hit zero:

1. **"input" vs "textbox".** The recording stored the element's type as the raw HTML tag
   `input`, but the live browser reports a text box's role as `textbox`. The scorecard saw
   `input ≠ textbox` and counted it as a *disagreement* — even though they mean the same
   thing.
2. **Missing test-id on the recorded side.** The element's unique `data-testid` was stored in
   the "how to find it" list but left blank in the scorecard data, so the strongest possible
   match signal was ignored.

With the only available signal scored as a mismatch, the element — even when it was the one
and only exact test-id match on the page — got thrown away.

**The fix (in `runtime/resolver.js`):**

1. **Treat tag names and their real roles as the same thing.** `input` now matches `textbox`,
   `a` matches `link`, `select` matches `combobox`, etc. No more false disagreements.
2. **Trust a unique "contract" match.** When an element is found by a unique test-id or a DOM
   id and there's exactly one match on the page, the runtime now trusts it — unless something
   actively contradicts it (e.g. a *different* test-id). A blank/old scorecard can no longer
   veto the one obviously-correct element.

**Result (measured against the live Render dashboard):**

- Before: the search-repo step needed flaky recovery on *every* run and failed intermittently.
- After: **4 out of 4 runs** drove the whole workflow (New → Blueprint → search & connect repo
  → name it → Deploy Blueprint) with **zero recovery — every element found on the fast path**,
  ~5.6 s per run. Clicking "Deploy Blueprint" correctly lands on Render's blueprint-sync page,
  i.e. the deploy is submitted.

**Files changed:** `runtime/resolver.js` (the fix), `runtime/test/test_resolver.js` (3 new
regression tests). All 43 runtime tests pass. The fix was also dropped straight into the
installed brain at `~/.conxa/conxa-app/resolver.js` so this machine has it now.

**To ship to all customers:** tag a new `app-v*` release so the cloud rebuilds the obfuscated
app layer from the fixed `resolver.js`. (The host `.exe` doesn't carry this code, so it does
not need a rebuild.) The local copy intentionally keeps `app_version` unchanged so the
self-updater doesn't overwrite the hand-patched file before that release ships.

**Not a Conxa bug — why the deploy itself still shows red on Render:** the SEARCH_ENGINE
blueprint creates a *free* PostgreSQL database, and the Render account already has one
(`conxa-db`, ~24 days old, left over from earlier testing). Render allows only one free
database per workspace, so it refuses the new one and cancels the two web services that depend
on it. The automation did its job perfectly; this is a Render account-quota issue. A fully
green deploy needs that old free database (and the stale `conxa-api` / `conxa-web` test
services) deleted first.

## Chromium Install Fix — 2026-06-29

**Problem:** When a customer ran the installer, it showed:
> "Chromium installation failed (code 1). Automation may not work."

No explanation. Customers couldn't tell if it was their internet, antivirus, a network timeout, or something else.

**Two things were fixed:**

### 1. The installer now tells you *why* it failed

Previously, when Chromium download failed, the error message was swallowed and the installer just showed the exit code (1). Now:

- When the download fails, the runtime saves the real error message to a small file before exiting.
- The installer reads that file and shows the actual reason in the dialog — e.g. "net::ERR_CONNECTION_TIMED_OUT" or "playwright install timed out (10-minute limit exceeded)".
- If the error file isn't there for some reason, you still get a fallback message with the retry command.

**Files changed:** `runtime/server.js` (writes the error file), `packages/conxa-core/.../setup.nsi.tmpl` (reads it and shows it).

### 2. The Chromium download itself was completely broken in the installed .exe

This was the bigger bug. After fixing the error message, we could finally see what was actually going wrong:

```
playwright install init failed: Cannot find module 'playwright-core/lib/cli/program'
```

**Why:** The installer runs `conxa-runtime.exe --install-playwright`. The `.exe` is a packed binary — it carries a copy of `playwright-core` inside its own built-in storage (the "snapshot"). But the actual JavaScript that handles `--install-playwright` loads from disk (`conxa-app/server.js`). When disk-loaded code does a plain `require("playwright-core/...")`, it looks in the wrong place — on disk — where playwright-core doesn't exist. It was always failing immediately with "module not found."

**Fix:** Changed the `require` call to use `global.__hostRequire`, which is a bridge that the packed exe sets up specifically so disk-loaded code can reach modules inside the snapshot. This is the same pattern already used for `semver` — it just wasn't applied to the playwright require.

After the fix: Chromium downloads completely (~180 MB Chrome for Testing + FFmpeg + headless shell), the revision marker is written, and the browser launches correctly.

**File changed:** `runtime/server.js` — one line change at the `--install-playwright` handler.

**To ship this fix:** Tag `app-v*` (rebuilds the obfuscated app layer from the fixed `server.js`). The host `.exe` itself doesn't need a rebuild.

---

## README Deployment Guide — 2026-06-29

Added a "When to push what" reference table to `README.md` so it's easy to know which GitHub tag to push for any given file change:

- `studio-v*` → Build Studio installer + anything in `conxa-core` used by the compiler/installer
- `host-v*` → The `conxa-runtime.exe` pkg binary (push rarely — only for `server.js` or Node/pkg version changes)
- `app-v*` → The obfuscated JS app layer (`run.js`, `sync.js`, `tracker.js`, etc.) — push for any runtime logic changes
- Cloud backend changes → push to Render; frontend → auto-deploys to Vercel on merge

---

# Replay / Test Fix — Plain-English Writeup

**Date:** 2026-06-27
**Goal:** Make the Build Studio "Test workflow" (replay) stage actually work. Recording and compiling were already fine; replay kept failing with runtime errors.

---

## TL;DR (the short version)

Replay was broken in **three** layers, each hidden behind the one above it:

1. **Dev was running an old, stale copy of the runtime** instead of the current code → it
   couldn't find elements ("Element not found"). Fixed: in development, always run the real
   source code, never the stale pre-built copy.
2. **The real production binary (`conxa-runtime.exe`) had a completely dead element finder.**
   This is the big one — every click failed in production. Caused by the way the `.exe` was
   packed (V8 bytecode corrupted Playwright's selector engine). Fixed: build with
   `--no-bytecode`.
3. **Nothing in CI would have caught #2** — the build checks only confirmed the program
   *starts*, not that it can *click anything*. Fixed: added a real "click a button" test to
   the build pipeline that fails the build if the element finder is broken.

After all three: the full workflow replays end-to-end and finishes with `Done.` ✅ — in dev
*and* (once a new binary is released) in production, with a CI safety net so it can't
silently regress again.

---

## How replay actually works (so the rest makes sense)

When you click **Test** on a workflow, this chain runs:

```
Build Studio (Python)  →  spawns the Node "runtime"  →  opens Chromium  →  runs each step  →  checks result
```

1. The Python backend (`backend.py`) takes your built skill pack and your saved login session.
2. It launches the **runtime** (a Node.js program) and tells it: "execute this skill."
3. The runtime opens a browser, logs in using your saved session, and performs each recorded step (click, type, scroll…).
4. If every step works, it returns `Done.` If a step can't find its element, it returns `Element not found (resolve miss)`.

There are **two versions of the runtime** on disk:

- **The source code** — the editable files in the `runtime/` folder (currently version **1.1.0**, with all the recent fixes).
- **A pre-built `.exe`** — a frozen snapshot bundled into a single file (`conxa-runtime.exe`), which was an **older** build (version **1.0.3**).

This difference is the whole story.

---

## Step-by-step: what I did

### 1. Traced the replay path
Read the code to map exactly how Test works: `backend.cmd_test_workflow` → `call_runtime_tool` → Node runtime's `execute_skill`. Confirmed the runtime reads each skill's `execution.json` and runs the steps.

### 2. Read the existing error logs
Looked at `runtime.log`. The repeating real error (ignoring harmless network noise) was:

```
Step 4 (click) failed: Element not found (resolve miss)
```

### 3. Reproduced it for real
Wrote a small script that runs replay exactly like the Test button does — same skill pack, same saved login, headless browser. This gave me the *current* failure instead of guessing from old logs.

### 4. Found the failure had moved forward
With the **current** runtime source, replay no longer died at step 4 — it now got all the way to **step 9** (the final "Deploy Blueprint" click). That's progress: the old step-4 problem was already gone (it was caused by an outdated compiled pack that has since been recompiled).

### 5. Looked at the actual page when step 9 failed
The runtime gives back a screenshot + a list of buttons on the page at the moment of failure. The page said:

> **"Blueprint file render.yaml not found on main branch"** — with a **Retry** button.

So "Deploy Blueprint" genuinely wasn't on the page. **This was not a bug** — I had tested with a repo (`conxa-cosmos`) that has no `render.yaml`, so Render correctly refused to deploy. The replay engine was behaving correctly.

### 6. Re-tested with a valid repo
Using the `SEARCH_ENGINE` repo (which has a `render.yaml`), replay ran **all the way to the end**:

```
Done. URL: https://dashboard.render.com/blueprint/exs-…/sync/exe-…
```

### 7. Checked the *real* product path — and it failed
My test above ran the **source code** runtime. But the actual Test button can end up running the **pre-built `.exe`**. So I re-ran using that staged `.exe`. It **failed at step 1** — couldn't even find the first button — even though the source-code runtime passed the exact same workflow.

That mismatch exposed the real bug.

### 8. Fixed the bug (see below), then re-verified
After the fix, the staged-exe path now correctly runs the source code and replay passes end-to-end again. Added a test so this can't silently break again.

---

## The actual bug (in easy language)

There are two helpers in the Python backend:

- One that **decides which runtime folder to use**. In development it correctly says: *"use the source code, so the developer's latest edits are tested."*
- One that **actually launches the runtime** (`call_runtime_tool`). This one had a different rule: *"if there's a pre-built `.exe` lying around in the sandbox, run that first."*

These two disagreed. The launcher always grabbed the old pre-built `.exe` if it existed — **even in development** — quietly ignoring the source code. So:

> You edit and improve `runtime/` (now version 1.1.0), hit Test… and it silently runs the **old 1.0.3 `.exe`** instead. Your fixes never run. The old runtime can't find some elements → "Element not found."

That's why replay kept failing with runtime errors that didn't match the current code.

### The fix

One change in `conxa-builder/python/conxa_compile/conxa_runtime.py` (`call_runtime_tool`):

> **If the runtime folder is real source code (it has `server.js` + `package.json`), always run it with `node` — never fall back to a stale pre-built `.exe`.**

- **Development** → runtime folder is source → runs `node server.js` (your latest code). ✅
- **Customer / packaged build** → runtime folder is just the `.exe` (no `server.js`) → still uses the `.exe`, exactly as before. ✅ (unchanged)

I also added a regression test (`test_dev_source_tree_runs_node_not_stale_sandbox_exe`) that fails if anyone reintroduces the old "prefer stale exe" behavior.

---

### Files changed for the dev fix

| File | What changed |
|---|---|
| `conxa-builder/python/conxa_compile/conxa_runtime.py` | `call_runtime_tool` now prefers the source-code runtime in dev instead of a stale staged `.exe`. |
| `conxa-cloud/tests/test_conxa_runtime.py` | Added a test that locks in the new behavior. |

> This was only the *first* layer. The dev fix made replay pass when run via `node`, which
> then exposed the bigger production bug below. The full list of everything changed is in
> **"Everything I changed"** near the end.

## Two things to know

1. **Restart needed:** The Python backend caches the old code while running. After this fix, **stop and restart `npm run dev`** so the new behavior loads.
2. **Real deployments were created:** The last step of this workflow is literally "Deploy Blueprint", so testing it created real blueprints in your Render account (`conxa-replay-test`, `conxa-replay-exe`). Delete them from the Render dashboard if you don't want them.

## Follow-up: the bigger production bug (host exe Playwright was dead)

After the dev fix, we asked "does this work in production?" It did **not** — for a deeper
reason. Production customers run the packed **host exe** (`conxa-runtime.exe`), not `node`.
A production-faithful test (real host exe + freshly built app layer) showed:

- Same page, same Chromium: `node` found 13 buttons via Playwright; the **host exe found 0**
  (`page.locator(...).count() === 0`), even though `page.evaluate(...)` saw all 13.
- Meaning: **the packed exe's Playwright selector engine was completely dead** — every
  click/type step fails to find its element. Production replay never worked through the exe.

**Root cause:** the exe is built with `@yao-pkg/pkg`, which compiles bundled JS to V8
bytecode. Playwright ships its selector engine as a ~300 KB string inside
`injectedScriptSource.js`; pkg's bytecode step silently corrupts that giant-string module,
so the selector engine loads but sees an empty DOM. (`page.evaluate` runs in the page's
main world and is unaffected, which is why it kept working — a confusing symptom.)

**Fix:** build the host with `--no-bytecode --public-packages "*"` (in
`runtime/package.json` build scripts) so Playwright ships as plain source. Verified: the
rebuilt exe replays the full workflow to `Done.` (The app layer already abandoned bytecode
earlier for the same class of issue, so this is consistent.)

**How it was proven:** built the app layer exactly like CI does (obfuscated JS), ran the
**real host `.exe`** against it, and watched every locator return 0 — then rebuilt the host
with `--no-bytecode` and watched the same workflow run to `Done.`.

## A small regression I caught and fixed

While fixing the above I'd tightened a "test id" pattern and accidentally stopped it from
matching the most common spelling `data-testid` (no hyphen) — only `data-test` and
`data-test-id`. A unit test caught it. Fixed the pattern in both the compiler
(`identity_bundle.py`) and the runtime (`resolve_adapter.js`) so all three spellings work.

## How this can't silently break again (CI safety net)

The build pipeline previously only checked that the runtime **starts** (an "MCP initialize"
ping). That is exactly why a binary that couldn't click anything still shipped. I added a
**real replay test** to the build:

- A tiny self-contained fixture: a local HTML page with one button + a 2-step skill that
  navigates to it and clicks it. No internet, no login, no secrets.
- A runner (`runtime/test/gate_replay.js`) that drives the packed `.exe` through that skill
  and **fails the build unless it reaches `Done.`**.
- Wired into both build workflows — the host build (`build-runtime-host.yml`) and the app
  build (`build-runtime-app.yml`).

Verified it actually catches the bug: the test **passes** on the fixed `.exe` and **fails**
on the old broken one.

## Everything I changed (branch `fix/replay-dev-prod-parity`)

| Commit | What |
|---|---|
| `48517f1` | Dev runs real source (not stale `.exe`) + resolution/compiler quality fixes + version hygiene + regression test |
| `145acb9` | **The big one:** build the host `.exe` with `--no-bytecode` so Playwright's element finder works in production |
| `a8c60b8` | Fix the `data-testid` spelling regression |
| `76fd7b8` | Add the real "click a button" CI gate (fixture + runner, wired into both workflows) |
| `a0a8005` | Point the app build's required host at the fixed `host-v1.1.2` |

Tests: **376 passed**; the 6 remaining failures are pre-existing on `main` and unrelated.

## What's left for you (ships to customers — needs a release)

These steps actually push the fix to production; they affect paying customers, so I didn't
trigger them:

1. **Release `host-v1.1.2`** (push that git tag). CI rebuilds the fixed `.exe` and now runs
   the click test on it. *This is the step that unblocks production replay.*
2. **Then release `app-v1.2.2`** (push that tag). Its build downloads `host-v1.1.2`, replays
   the fixture against it, and ships the latest element-finding improvements.
3. New Build Studio build + recompile/republish your skills (so packs use the latest compiler).

(Order matters: the host must be released **before** the app tag, because the app build now
tests against it.)

## Side notes (not bugs)

- The `401` / `ENOTFOUND apis.conxa.in` lines in `runtime.log` are harmless — that's just telemetry failing in test mode. Execution continues normally.
- Testing with a repo that has no `render.yaml` will always "fail" at the deploy step — that's Render refusing to deploy, not a Conxa bug. Use a repo with a valid `render.yaml`.
- My replay tests deployed real blueprints to your Render account (`conxa-db`, `conxa-api`, `conxa-web`, plus blueprint instances). Delete them from the Render dashboard if unwanted.
