# Fix Log

---

## Fixed: T3/T4 self-healing recovery now actually works — 2026-06-30

**What was broken.** When a step failed and the runtime handed control to Claude for self-healing (Tier 3 + Tier 4), Claude couldn't fix it. Three problems stacked up to make recovery useless:

1. The list of elements on the page sent to Claude was always empty for dropdown/menu steps. The runtime spent ~12 seconds trying its own fixes first, and by the time it took a snapshot of the page to send Claude, the dropdown had already auto-closed. Claude got "No interactive elements" and gave up.

2. The screenshot sent to Claude showed the page *after* the dropdown closed (useless), not *before* the step was attempted (when the dropdown was open and the element was visible). This was because the "before" screenshot was turned off by default.

3. The description of what element Claude was looking for came from compiled selector data that can become stale over time, instead of the human-readable labels ("blueprint", "connect button") stored separately in the skill pack — labels that don't change when the UI changes.

**What was fixed.** Three targeted changes to the runtime, touching only `run.js` and `server.js`:

- **Snapshot at the right moment.** The page's element list is now captured immediately when a step fails, before any retry attempts run. So if a dropdown was open, it's captured open. This snapshot is stored on the failure and sent to Claude — no more empty lists for menu steps.

- **Pre-step screenshot turned on by default.** The runtime now always takes a screenshot *before* attempting each interactive step. If the step fails, Claude gets a picture of the page in the correct state (dropdown visible, form filled, etc.). Anyone who wants to disable this can set `CONXA_CAPTURE_PRESTEP=0`. Screenshots are now JPEG at 70% quality instead of PNG — smaller, cheaper, equally useful.

- **Better element description for Claude.** The human-written anchor labels from the skill pack (e.g. "blueprint") are now included in the message to Claude, and used as the primary label for the element instead of the compiled selector text. These labels are stable even when the UI changes.

**Files changed:** `runtime/run.js`, `runtime/server.js` only. The recovery engine, resolver, and all other files are unchanged.

---

## Payment gateway switched from Razorpay to Cashfree — 2026-06-30

**What changed.** All billing code was migrated from Razorpay to Cashfree. Customers who want to upgrade to Starter (₹29,999/month) or Pro (₹79,999/month) are now redirected to Cashfree's mandate authorization page instead of seeing a Razorpay popup.

**Why it changed.** The team decided to switch payment providers to Cashfree.

**Files that changed:**
- `conxa-cloud/backend/app/api/cashfree_routes.py` — new file that handles plans, subscription creation, payment verification, and webhook events from Cashfree. Replaces `razorpay_routes.py`.
- `conxa-cloud/backend/app/main.py` — updated to import and register the Cashfree router, and updated the production startup check to require Cashfree credentials instead of Razorpay credentials.
- `packages/conxa-core/conxa_core/config.py` — the five Razorpay env vars (`RAZORPAY_KEY_ID` etc.) were swapped for six Cashfree env vars (`CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_STARTER_PLAN_ID`, `CASHFREE_PRO_PLAN_ID`, `CASHFREE_ENV`).
- `conxa-cloud/backend/requirements.txt` — removed `razorpay` package, added `httpx` (used for Cashfree REST API calls).
- `conxa-cloud/frontend/src/api/cashfreeApi.ts` — new frontend API client with updated response types (`auth_link` instead of `key_id`, `subscription_id` stays the same).
- `conxa-cloud/frontend/src/BillingPage.tsx` — removed Razorpay script-loading and popup code. The new flow redirects the user to Cashfree's `authLink` page for mandate registration, then verifies on return using sessionStorage to remember the pending subscription ID.
- `.env.example` — updated with Cashfree credential placeholders.

**How the new checkout works:**
1. User clicks "Choose Starter" → frontend calls `/subscriptions/create`.
2. Backend creates a Cashfree subscription and returns an `authLink` (a Cashfree-hosted page).
3. Frontend saves the `subscription_id` in `sessionStorage` and redirects to the `authLink`.
4. User completes mandate registration on Cashfree.
5. Cashfree redirects back to `/billing`. On page load, the pending `subscription_id` is read from `sessionStorage` and sent to `/subscriptions/verify`.
6. Backend calls Cashfree API to confirm status, then updates the workspace billing record.
7. Webhooks from Cashfree also update billing for recurring charges and cancellations.

**What you need to do manually before this goes live:** see the setup steps in `docs/Implementation-Plan.md` or the plan at `.claude/plans/you-see-now-we-composed-pelican.md`.

---

## Skill pack modified to force Tier 3 + Tier 4 recovery escalation — 2026-06-30

**What changed.** The "create-a-service-from-github" skill pack on this machine was intentionally broken at **step 2** (the click on the Blueprint menu option) so that every automatic recovery attempt the runtime tries before asking Claude for help will fail, forcing it to hand the problem to Claude with a full screenshot and DOM inventory.

**What was broken and why.** Normally, when a step fails, the runtime works through a four-tier rescue ladder before involving Claude:
- *Tier 1:* tries the compiled selectors (the ones recorded at build time)
- *Tier 2:* tries a11y-based lookup, re-hover tricks, loose text search, and fallback selectors
- *Tier 3:* hands Claude a list of every interactive element on the page ("semantic recovery")
- *Tier 4:* hands Claude a live screenshot ("vision recovery")

To test Tier 3 and 4, every path the runtime can try on its own must fail. So the step 2 entry in `execution.json` and `recovery.json` was given fake, non-existent selector strings and fake anchor words — things that will never match a real element on the Render dashboard. The runtime will burn through every Tier 1 and Tier 2 attempt, find nothing, and then produce the structured Tier 3/4 recovery response that tells Claude to look at the page and figure out the right element.

**What was not changed.** Only the step 2 data inside the skill pack files was changed. The recovery engine itself (`runtime/recovery.js`, `runtime/run.js`) was not touched. All other steps in the skill pack are unchanged. The manifest checksums were updated to match so the runtime's integrity check still passes.

**To restore the skill pack to working order.** Re-run the skill compile from Build Studio (or restore the original `execution.json` and `recovery.json` from git) and update the checksums in `manifest.json`.

---

## Updated: cost model no longer includes LLM selector generation — 2026-06-30

**What changed.** The `docs/cost_model.md` was updated to reflect that Conxa no longer uses LLM to write CSS/Playwright selector strings. That work is now done deterministically by `IdentityBundle` and `selector_grammar.py`, which always produce selectors from recorded DOM signals — no matter what the page looks like.

**Why it matters for cost.** Previously, every step that didn't have a perfect `data-testid` or `aria-label` triggered 5 extra LLM calls just to generate and cross-check selectors. That was the biggest variable in compilation cost. With the deterministic approach, every step now fires exactly 2 LLM calls: one for intent, one for the visual anchor screenshot. Always. The cost model now reflects this.

**Numbers that changed:**
- Per-step cost: was $0.014–$0.036 (2–7 LLM calls), now a flat $0.001–$0.014 (2 calls, provider-dependent)
- Fresh 15-step workflow: Starter/Pro dropped from ~$0.54 → ~$0.21; Enterprise from ~$1.93 → ~$0.81
- Blended compilation cost: Starter/Pro from ~$0.195 → ~$0.075; Enterprise from ~$0.695 → ~$0.292
- Build-heavy gross margin: Starter improved from ~56–67% → ~68–81%

**What didn't change.** The LLM still handles intent detection, visual anchors (screenshot-based), recovery at Tier 3+, and the workflow intent graph. Those costs are unchanged. Caching still applies the same way — same element hash, same screenshot hash = zero tokens.

---

## Fixed: skill execution "got stuck" forever in Claude Desktop (but worked in Build Studio) — 2026-06-30

**What you saw.** Running the Render "create a service from GitHub" skill through Claude
Desktop just hung. After about 4 minutes you got *"No result received from the Claude Desktop
app."* The exact same skill ran fine inside Build Studio. Very confusing.

**What was really happening.** I read the logs from both Claude Desktop and the Conxa runtime
and lined up the timestamps. The skill started, got through the first couple of steps, but then
one step took **4½ minutes** on its own. The web page never settled into the state the skill
expected, so the runtime kept patiently retrying. Meanwhile Claude Desktop only waits **4
minutes** for an answer — so it gave up and sent a "cancel" message. **The Conxa runtime
ignored that cancel.** It kept grinding for another 1½ minutes, then opened (and left open) a
browser waiting for help that could never come, and finally produced an answer that Claude
Desktop had already stopped listening for. From your side: a permanent hang.

Build Studio never hit this because it runs the page in the freshly-recorded state where every
step is found instantly — it never gets near the 4-minute limit.

**Two extra things that made it worse:**
- The test input was `SEARCH_ENGINE`, which isn't a real GitHub repository. Render's repo
  search found nothing, so the page never showed the next field — that's what made one step burn
  4½ minutes. **Retest with a real repo** (one that has a `render.yaml`).
- This PC's runtime auto-update is broken — it keeps downloading empty update files (a server is
  handing back 0-byte files), so the runtime is stuck on an old host and can't fix itself. That's
  a separate, cloud-side problem worth chasing, but it isn't what caused the hang.

**The fix (in the runtime/execution engine).** Two layers, because the first alone wasn't enough:

*Layer A — a hard time budget (the real cure).* The runtime now gives every run a wall-clock
budget (default 3.5 minutes) that is deliberately **shorter than Claude Desktop's 4-minute
patience**. If a run ever reaches that budget, it stops itself and returns a clear, useful message
— e.g. *"Execution stopped after exceeding the 210s time budget at step 3. The page never reached
the expected state — most often the inputs don't match what the site returned (e.g. a search with
no results)…"* — **while Claude Desktop is still listening.** So instead of a silent 4-minute hang
followed by "No result received," you now get a fast, plain-English explanation you can act on.
This works no matter *why* a step is slow.

*Layer B — honour the cancel signal.* The runtime also listens for Claude Desktop's cancel (sent
when it gives up, or when you cancel). The moment it arrives, execution stops within a second,
closes the browser cleanly, checks for the cancel between every recovery attempt, and skips the
wasteful screenshot/"park a browser for later" work that nobody is waiting for anymore.

**Why two layers?** The cancel-handling (Layer B) stops the runtime from leaving a zombie browser
behind — important, but invisible to you, because once Claude Desktop has given up it ignores
whatever the runtime says next. The time budget (Layer A) is what you actually *see*: it guarantees
the runtime answers **before** Claude Desktop loses patience, so the 4-minute "stuck forever" screen
can't happen again.

**Proof it works (both layers, against the real installed runtime on this PC).**
- *Time budget:* gave a run an 8-second budget and sent **no** cancel. The run that used to grind
  for ~5 minutes stopped itself at ~9 seconds and returned the "exceeded the time budget at step 3"
  message — no zombie browser. Scaled up, that's ~3.5 min vs Claude Desktop's 4 min: it always
  answers first.
- *Cancel handling:* started the skill, waited 8 seconds, sent the exact cancel message Claude
  Desktop sends on timeout — the runtime logged it instantly, stopped in half a second, parked
  nothing. (Pre-fix: kept running ~90s and parked a zombie.)
- Automated tests: cancellation-at-boundary, cancellation-mid-recovery, and wall-clock-deadline all
  pass, and every existing runtime suite still passes (recovery, resolver, agent-recovery,
  resolve-adapter — 30+ tests, zero failures).

**Will the fix stick?** Yes. The patched code is staged on this PC (old version safely backed up).
I checked whether the broken auto-update could overwrite it: it can't. The host-exe update file on
the server is empty (0 bytes), so the host stays on its current version; and the newer app bundle
refuses to install on an older host. That combination means the patched layer survives Claude
Desktop restarts. (Both are still cloud-side bugs worth fixing — the empty release files — but they
no longer threaten this fix.)

**What's left for you.** Two things, because I can't drive Claude Desktop's chat myself:
1. **Fully quit and reopen Claude Desktop** (quit from the tray — not just close the window).
   Claude Desktop loads the runtime from `C:\Users\Lenovo\.conxa\conxa-app`, and it only re-reads
   those files when it restarts. Your last restart happened a few minutes *before* the time-budget
   fix was staged, so it's still running the older code — one more restart picks up the latest.
2. **Run the skill with a real GitHub repo** that contains a `render.yaml` — not `SEARCH_ENGINE`.
   With a real repo every step finds what it needs and the workflow finishes fast, the way it does
   in Build Studio. If you *do* use a bad input again, you'll now get a clear "time budget" message
   in ~3.5 minutes instead of a 4-minute hang — but a real repo is what makes it actually succeed.

---

## Self-healing recovery made enterprise-ready: Tier 3/4 now actually work — 2026-06-30

**The problem.** Conxa's recovery system was documented as having four "tiers" of getting
unstuck when a button or field moves on a webpage, but only the first two actually did
anything. Tiers 1 and 2 are the smart, free, automatic fixes (re-find the element, wait for
it, scroll to it, look it up by its accessibility label). Tiers 3 and 4 — where Claude itself
looks at the page text and a screenshot to find the right element — were half-built: when a
step failed, the runtime would send Claude a screenshot and say *"fix the selector and try
again,"* but **there was no way for Claude to actually hand back the fix.** So Claude could see
the problem but couldn't apply the solution. The healing loop had a missing last step.

**What we fixed:**

- **Added the missing "hand the fix back" step.** When a step fails and Claude figures out the
  right element, it can now pass that answer back (`step_overrides`) and the workflow resumes
  using Claude's correction — instead of just re-running the same broken instructions. This is
  the change that finally makes Tier 3 and Tier 4 real.
- **A clear on/off switch for where the smart recovery runs.** During internal Build Studio
  testing, only the free automatic Tiers 1–2 run, so a recorded workflow is judged honestly on
  its own quality (if it can't recover on its own, the test fails — as it should). During real
  use through Claude, all four tiers turn on automatically, including Claude's visual recovery.
  Controlled by a single setting (`CONXA_MAX_RECOVERY_TIER`).
- **A much clearer help message when a step fails.** Instead of a vague dump, the runtime now
  sends Claude a tidy package: what the step was trying to do, a list of the clickable things
  currently on the page (for "by description" recovery), and screenshots (for "by sight"
  recovery), plus exact instructions on how to send the fix back.
- **Better logging.** The runtime now records which recovery ceiling is active and every time a
  recovery is requested or a Claude-supplied fix is applied, so issues are traceable.
- **Caught and fixed a load-time crash** during end-to-end testing (a missing variable
  declaration that would have stopped the runtime from starting) before it could ship.

- **Fixed the bug that would have made Claude's fixes useless in practice.** Self-healing
  happens across a round-trip: the workflow fails, Claude looks at the page and decides on a
  fix, then asks to continue. The old code threw away the browser page the moment a step
  failed — so when Claude said "click *this* button," the workflow had already snapped back to a
  blank page and Claude's correct answer landed on nothing, failing again. Now the runtime
  **keeps the failed page open and waiting** (for a few minutes) so Claude's correction is
  applied to the exact same screen Claude was looking at. The page is automatically cleaned up
  if Claude never comes back, so no browser is left hanging around.

**How we proved it:** new automated tests, plus a real-browser end-to-end test showing a
deliberately-broken step fail cleanly through Tiers 1–2 and then heal when Claude's correction
is supplied. Most importantly, a **full-loop test through the real installed runtime** — fail →
recovery request → Claude picks the right element → resume → **"Done."** — which initially
exposed the "blank page" bug above and now passes start to finish. The packed-runtime replay and
tier-ceiling tests also pass.

---

## CLAUDE.md updated to reflect major codebase changes — 2026-06-30

Updated the project guide (CLAUDE.md) to match all the big changes that happened over the last several weeks. The old guide was missing a lot of important new files and incorrectly described how the runtime works.

**What changed in the guide:**

- **Runtime is now two pieces, not one.** There's a small "host" program (the .exe) and a separate "app layer" (the actual skill-running code on disk). The host just boots things up and provides shared tools. The app layer lives at `~/.conxa/conxa-app/` and can be updated by the cloud without reinstalling the whole app. This is a big deal — customers get fixes without needing to reinstall.
- **New runtime files documented.** `resolver.js`, `resolve_adapter.js`, `recovery.js`, `bootstrap.js` — these all existed but weren't in the guide. Each has a clear job: resolver finds elements, resolve_adapter connects it to the browser, recovery handles when things go wrong, bootstrap starts the whole thing and checks compatibility.
- **The selector/element-finding system was rewritten.** The compiler no longer uses AI to write CSS/XPath selectors (it had a ~30% error rate). Instead it uses a new system called IdentityBundle that generates reliable, deterministic selectors. The guide now points to the right files for this.
- **CI/CD workflows added.** Two separate GitHub Actions pipelines now exist — one builds the host exe, one builds the app layer. The app layer pipeline runs a real skill replay test before publishing (the "execution gate"). This wasn't documented at all before.
- **New docs file added** (`agentic-discovery-strategy.md`) — covers how the system learns and improves over time, with admin approval gates.
- **Key rules updated.** Added new non-negotiable rules: host exe must never use V8 bytecode (it breaks Playwright), the resolver must never blindly pick the first match, AI must not write selector strings, and the app layer's version compatibility check must never be bypassed.
- **Install location corrected.** The runtime installs to `~/.conxa/` not `%LOCALAPPDATA%\conxa\runtime\` — the guide was wrong.
- **"Where to look" table expanded** with all the new files and concerns.

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

---

## Fixed: runtime version numbers were hardcoded in package.json instead of being set automatically — 2026-06-30

**What you saw.** `runtime/package.json` had `"version": "1.1.5"` and `"host_version": "host-v1.1.5"` written by hand. Every time a new release was cut, someone had to remember to bump both fields manually before pushing the tag.

**What was really happening.** The CI build for the host exe already stamped `host_version` from the git tag at build time — so that field was fine in practice. But `version` (the npm version, exposed to the rest of the runtime as `__runtimeVersion`) was never touched by CI. It only changed if a developer remembered to edit the file before tagging.

**The fix.** The "stamp" CI step in `build-runtime-host.yml` now also updates `version` by stripping the `host-v` prefix from the release tag. Tag `host-v1.2.0` → both `version: "1.2.0"` and `host_version: "host-v1.2.0"` are baked into the exe automatically. The values in `package.json` are just dev-time placeholders now — you never need to edit them for a release.

---

## Side notes (not bugs)

- The `401` / `ENOTFOUND apis.conxa.in` lines in `runtime.log` are harmless — that's just telemetry failing in test mode. Execution continues normally.
- Testing with a repo that has no `render.yaml` will always "fail" at the deploy step — that's Render refusing to deploy, not a Conxa bug. Use a repo with a valid `render.yaml`.
- My replay tests deployed real blueprints to your Render account (`conxa-db`, `conxa-api`, `conxa-web`, plus blueprint instances). Delete them from the Render dashboard if unwanted.
