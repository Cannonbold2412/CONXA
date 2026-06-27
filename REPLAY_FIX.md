# Replay / Test Fix — Plain-English Writeup

**Date:** 2026-06-27
**Goal:** Make the Build Studio "Test workflow" (replay) stage actually work. Recording and compiling were already fine; replay kept failing with runtime errors.

---

## TL;DR (the short version)

- Replay was running an **old, stale copy** of the runtime instead of the current code.
- That old copy couldn't find buttons on the page, so it failed with "Element not found".
- I changed one rule: **in development, always run the real source code**, never the stale pre-built copy.
- After the fix, the full workflow replays end-to-end and finishes with `Done.` ✅

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

## Files changed

| File | What changed |
|---|---|
| `conxa-builder/python/conxa_compile/conxa_runtime.py` | `call_runtime_tool` now prefers the source-code runtime in dev instead of a stale staged `.exe`. |
| `conxa-cloud/tests/test_conxa_runtime.py` | Added a test that locks in the new behavior. |

---

## Result

- Replay runs the workflow end-to-end: `Done. URL: …` ✅
- All runtime tests pass: **24 passed**.

## Two things to know

1. **Restart needed:** The Python backend caches the old code while running. After this fix, **stop and restart `npm run dev`** so the new behavior loads.
2. **Real deployments were created:** The last step of this workflow is literally "Deploy Blueprint", so testing it created real blueprints in your Render account (`conxa-replay-test`, `conxa-replay-exe`). Delete them from the Render dashboard if you don't want them.

## Side notes (not bugs)

- The `401` / `ENOTFOUND apis.conxa.in` lines in `runtime.log` are harmless — that's just telemetry failing in test mode. Execution continues normally.
- Testing with a repo that has no `render.yaml` will always "fail" at the deploy step — that's Render refusing to deploy, not a Conxa bug. Use a repo with a valid `render.yaml`.
