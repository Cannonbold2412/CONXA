# Production Readiness — Step-by-Step Manual Testing Guide

This guide walks you through testing Conxa **before calling it production-ready**.
It is written in simple language. Follow the steps in order. Tick each checkbox as you go.

> **Rule of thumb:** If any step fails, stop, note it down in the "Issues Found" section at the bottom, fix it, and restart from that step.

---

## What We Are Testing

Conxa has 3 parts. We will test each one:

| # | Part | Where It Lives | What It Does |
|---|------|----------------|--------------|
| 1 | **Cloud Backend** | Render (FastAPI) | Login, billing, hosting skill packs, LLM proxy, telemetry |
| 2 | **Cloud Frontend** | Vercel (Next.js) | Dashboard you see in the browser |
| 3 | **Build Studio** | Windows desktop app (Electron + Python) | Record → Compile → Build skill packages |
| 4 | **Runtime** | Customer machine (`~/.conxa/`) | Installs and runs skills via MCP |

---

## Before You Start — Prepare Your Test Setup

- [ ] A clean Windows machine or VM (to simulate a real customer)
- [ ] Access to the Render dashboard (backend logs)
- [ ] Access to the Vercel dashboard (frontend logs)
- [ ] Test accounts ready:
  - One **company owner** account (for billing/publishing)
  - One **team member** account
  - One **fresh customer** account (never used before)
- [ ] A simple website to practice on (e.g., `https://example.com` or any demo form site)
- [ ] Note down today's date and your name in the "Test Run Info" section at the bottom

---

## PHASE 1 — Cloud Backend Health Checks

**Goal:** Confirm the API server is alive and correctly configured.

### Step 1.1 — Liveness check

Open this URL in a browser (replace `<backend-url>` with your Render URL):

```
<backend-url>/healthz
```

- [ ] Returns a 200 OK response
- ✅ Pass = page loads with a healthy status message

### Step 1.2 — Readiness check

```
<backend-url>/readyz
```

- [ ] Returns 200 OK (this pings the database — if this fails, the DB is down or unreachable)
- ⚠️ If this returns 5xx, do NOT proceed. The deploy gate itself depends on this endpoint.

### Step 1.3 — Production config validation

The backend must **refuse to start** if required config is missing when `SKILL_AUTH_REQUIRED=true`.

- [ ] Check Render logs from the latest deploy — confirm the service started cleanly with no "missing config" errors
- [ ] Confirm these env vars are set on Render (visible in Render → Environment):
  - `SKILL_DATABASE_URL`
  - Clerk issuer / JWKS settings
  - `SKILL_CORS_ORIGINS`
  - Cashfree credentials
  - At least one LLM provider key (Groq / Google AI Studio / NVIDIA NIM)

### Step 1.4 — No silent fallback

- [ ] In Render logs, verify there is NO line saying it fell back to filesystem DB. Production must always use Postgres.

---

## PHASE 2 — Cloud Frontend Checks

**Goal:** Confirm the dashboard loads and login works.

### Step 2.1 — Load the site

- [ ] Open the Vercel dashboard URL in a browser
- [ ] Page loads within ~5 seconds with no console errors (press F12 → Console tab)

### Step 2.2 — Sign up / Log in

- [ ] Log in with the company owner account (Clerk login should appear and work)
- [ ] After login, you land on the Dashboard
- [ ] Log out, then log in with the team member account

### Step 2.3 — Visit every main screen

Click through each screen and confirm nothing crashes or shows blank data:

- [ ] Dashboard
- [ ] Skill Packages list
- [ ] Billing
- [ ] Team
- [ ] Settings

---

## PHASE 3 — Auth & Team Testing

**Goal:** Confirm roles and access control behave correctly.

### Step 3.1 — Owner permissions

Logged in as **owner**:

- [ ] Can invite a new team member by email
- [ ] Can change a member's role
- [ ] Can remove a member

### Step 3.2 — Member restrictions

Logged in as **member** (with limited role):

- [ ] Cannot see owner-only actions (billing changes, plan changes, member management)
- [ ] Directly opening an owner-only URL shows an error/redirect instead of data

### Step 3.3 — Invalid tokens are rejected

- [ ] Call a protected API endpoint with no token → expect 401
  ```
  curl <backend-url>/api/v1/workflows
  ```
- [ ] Call it with a garbage/fake token → expect 401

---

## PHASE 4 — Build Studio End-to-End Flow

**Goal:** Record a workflow, compile it, build a package. This is the core product flow.

### Step 4.1 — Launch Studio

- [ ] Start the app (`cd conxa-builder/electron && npm run dev` for dev, or launch the installed build)
- [ ] Python backend starts without errors (check dev tools / console output)

### Step 4.2 — Studio login

- [ ] Clerk PKCE login opens and succeeds
- [ ] Token is stored in OS keyring (login survives an app restart — close and reopen the app; you should still be logged in)

### Step 4.3 — Record a workflow

- [ ] Start recording on your test website
- [ ] Perform 4–6 actions: click a link, fill a text box, click a submit button
- [ ] Stop recording
- [ ] Review the recorded event list — every action you did appears in order, none missing

### Step 4.4 — Compile

- [ ] Click compile
- [ ] Compilation completes without errors
- [ ] Open the compile report — check:
  - Every step has selectors
  - No step is marked low-confidence unexpectedly
  - Assertions exist where expected (e.g., after submit)

### Step 4.5 — Edit & recompile (optional but recommended)

- [ ] Open the workflow editor
- [ ] Re-target one step's element to a different element
- [ ] Save — the patch gate accepts the change and re-compiles that selector

### Step 4.6 — Build the skill package / installer

- [ ] Build a `.exe` installer successfully
- [ ] Open the generated bundle folder and confirm:
  - **No `auth/auth.json` anywhere** ← critical security rule
  - **No Playwright storageState file**
  - No credentials of any kind inside the output

> 🚨 If ANY credential file appears in the build output, STOP. This is a hard blocker.

---

## PHASE 5 — Publish & Cloud Hosting

**Goal:** Skill pack reaches the cloud and can be served to customers.

### Step 5.1 — Publish

- [ ] From Studio (or dashboard), publish the compiled skill pack to the cloud
- [ ] Success confirmation shown
- [ ] Refresh the dashboard → the skill pack appears in the Skill Packages list

### Step 5.2 — Verify hosted content

- [ ] Download/open the pack details from the dashboard — content matches what was compiled
- [ ] Version number shown correctly

---

## PHASE 6 — Runtime Installation (Customer Simulation)

**Goal:** Act like a customer installing and running skills.

Do this on your clean Windows machine/VM.

### Step 6.1 — Install

- [ ] Download the `.exe` installer from the dashboard
- [ ] Run it — installation completes without admin issues
- [ ] Check `~/.conxa/` exists and contains the host exe and `conxa-app/` folder

### Step 6.2 — First-run integrity

- [ ] `~/.conxa/conxa-app/version.json` exists with correct version info
- [ ] Runtime auth asks for / uses per-company token (keytar prompt or stored token works)

### Step 6.3 — Sync skills

- [ ] Trigger a skill sync (first launch does this automatically)
- [ ] The published skill pack downloads to the machine
- [ ] Files written atomically (no partial/corrupt files — check SHA-256 match if visible in logs)

### Step 6.4 — Execute a skill via MCP

Connect Codex Desktop (or run `node server.js` in stdio mode manually):

- [ ] `list_skills` → shows the synced skill pack
- [ ] `get_skill_inputs` → shows required inputs correctly
- [ ] `execute_skill` with valid inputs → browser opens, steps run, skill completes successfully
- [ ] `get_execution_status` reports success
- [ ] `refresh_skills` picks up newly published packs

### Step 6.5 — Failure handling (recovery cascade)

Deliberately break things and watch recovery:

- [ ] Rename the button's text on your test page (or use a slightly different page) so one selector misses → runtime recovers via L1/L2 **without needing LLM** (Tier 1–2 cost zero tokens)
- [ ] Make an element truly disappear → execution fails gracefully with a clear error (not a silent hang)

### Step 6.6 — Telemetry

- [ ] After executions, check cloud backend logs / tracking storage — events arrived at the tracking endpoint
- [ ] Event payloads contain execution results (success/failure counts)

---

## PHASE 7 — Billing & Payments (Cashfree)

**Goal:** Money flow works. Test in sandbox mode first.

### Step 7.1 — Plan purchase

- [ ] As owner, buy/subscribe to a plan using Cashfree sandbox test card
- [ ] Payment completes and webhook fires
- [ ] Dashboard Billing screen reflects the new plan

### Step 7.2 — Entitlements enforced

- [ ] On a free plan: hitting a paid-feature limit gives a clear "upgrade needed" message
- [ ] After upgrade: the limit lifts immediately

### Step 7.3 — Failed payment

- [ ] Use a failing test card → clear error shown, plan NOT upgraded, no partial state left behind

---

## PHASE 8 — Auto-Updates

**Goal:** Both updaters work safely.

### Step 8.1 — Runtime self-update (app layer)

- [ ] Publish a newer `app-vX.Y.Z` manifest to the cloud
- [ ] Runtime polls `/api/v1/updates/runtime-manifest`, detects the update, downloads it
- [ ] New version loads correctly; `min_host` check passes
- [ ] Simulate a bad update (if possible) → `version_manager.js` rolls back to previous versioned directory

### Step 8.2 — Host update

- [ ] Bump host version, tag `host-vX.Y.Z`, verify manifest serves it and installer contains it

### Step 8.3 — Channel promotion

- [ ] Promote dev → stable using the promote-release workflow
- [ ] Confirm Ed25519 signatures validate and customers on stable receive it

---

## PHASE 9 — Security Spot Checks

**Goal:** Quick pass over the most dangerous failure modes.

- [ ] All API routes respond under `/api/v1` (except the known tracking exception documented in TODO.md)
- [ ] Protected endpoints reject expired Clerk JWTs (wait for a token to expire or craft one)
- [ ] Runtime session files are AES-256-GCM encrypted (open one — it's ciphertext, not readable JSON)
- [ ] Company A cannot download Company B's skill packs (try swapping tokens/companies)
- [ ] LLM proxy rejects requests from unauthenticated callers
- [ ] No secrets in any client-side code: search built frontend JS for API keys (should find none)

---

## PHASE 10 — Performance & Stability Smoke Test

**Goal:** Basic confidence it holds up under normal use.

- [ ] Execute the same skill 10 times in a row — all succeed, no memory leaks visible (watch RAM in Task Manager)
- [ ] Execute 3 different skills back-to-back — no cross-execution state leaking between them
- [ ] Backend responds under load: hit `/healthz` 50 times quickly — all fast and 200
- [ ] Record a LONG workflow (~20+ steps), compile, execute — full chain works
- [ ] Kill the browser mid-execution → runtime handles it with a clear error, doesn't crash

---

## PHASE 11 — Final Go / No-Go

Review everything above:

- [ ] All Phase 1–10 checkboxes ticked (or failures fixed and re-tested)
- [ ] Zero open items from the "Hard Blockers" list below
- [ ] Issues Found section has resolutions noted for each entry
- [ ] Telemetry shows your whole test session's activity as expected
- [ ] You have tested on a CLEAN machine, not just your dev machine

### Hard Blockers (any ONE of these = NO-GO)

1. ❌ Credentials/auth files in any build output (Phase 4.6)
2. ❌ `/readyz` failing or DB unreachable (Phase 1.2)
3. ❌ Filesystem-DB fallback active in production (Phase 1.4)
4. ❌ Cross-company data leakage (Phase 9)
5. ❌ Recovery silently burning LLM tokens on Tier 1/2 (Phase 6.5)
6. ❌ Update rollback broken — bad update bricks the runtime (Phase 8.1)

---

## Test Run Info

| Field | Value |
|---|---|
| Date | ____________ |
| Tester name | ____________ |
| Backend version/deploy | ____________ |
| Frontend version/deploy | ____________ |
| Studio version | ____________ |
| Runtime host version | ____________ |
| Runtime app version | ____________ |

## Issues Found

| # | Phase | Description | Severity | Fixed? (Y/N) | Notes |
|---|-------|-------------|----------|--------------|-------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

## Final Verdict

- [ ] ✅ **GO** — Production ready
- [ ] ⛔ **NO-GO** — Blocked because: ______________________________

Signed: ____________ Date: ____________
