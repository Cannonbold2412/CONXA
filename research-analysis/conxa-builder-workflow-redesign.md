# Conxa Builder — Workflow Redesign

**A first-principles redesign of the Build Studio user journey**

Status: Design proposal — revised
Author: Product / UX
Date: 2026-07-06 (revised 2026-07-07, twice)
Scope: Build Studio (Electron desktop app) user-facing workflow, plus the installer/deployment architecture that Build Installer produces. No changes to the compile pipeline internals, runtime, or cloud contracts — only to what the pipeline *exposes* and *when*, and to where the installer build step itself executes.

Revision note (2026-07-07): the original draft of this document recommended collapsing everything down to three moments — Record → Review → Publish — merging Human Edit and Test into a single "Review" screen. That recommendation was superseded by a five-stage flow that kept Human Edit and Test Skill separate.

Revision note (2026-07-07, second pass): the flow has been extended with a sixth stage, **Build Installer**, restored as an explicit final step rather than a rare action tucked into a settings page. Building the installer is real, user-facing work — today it runs locally inside Conxa Builder, and it is expected to move to Conxa Cloud once there are paying customers, so companies can generate and manage installers remotely. This document has also gained a full architecture section (§9) explaining exactly how the installer is built, installed, and kept up to date. **The adopted end-to-end flow is now:**

> **Record → Compile (Background) → Human Edit → Test Skill → Publish Skill Package → Build Installer**

This document has been rewritten throughout to reflect both decisions. The core critique — that the current app exposes compiler-pipeline internals as if they were user tasks — is unchanged.

---

## 1. Executive summary

Today a Conxa Builder user walks through **seven** named stages to ship one automation:

> **Record → Compile → Human Edit → Build Plugin → View Package → Test Skill → Build Installer**

Four of those seven are not user tasks at all — they are internal compiler-pipeline stages that have leaked onto the navigation surface. The app's sidebar is organized around *how the compiler works*, not around *what the user is trying to do*. A user teaching their product a single task has to re-select that same plugin on four different top-level pages to walk it down the pipeline, and along the way they are shown compile phase timelines, per-LLM-call timings, raw JSON file trees, skill IDs, and filesystem "bundle root" paths — none of which help them decide anything.

**This document proposes collapsing seven engineer-facing stages into six clear user-facing stages** — while also splitting one conflated stage (the original "Build Installer," which today silently does *both* a cloud publish *and* an NSIS build) into the two distinct actions it actually performs:

> **Record → Compile (Background) → Human Edit → Test Skill → Publish Skill Package → Build Installer**

- **Record** — the human demonstrates the task once in a real browser. Irreducible.
- **Compile** — an explicit, user-triggered, paid action. The user clicks "Compile" when they're ready; it then runs entirely in the background while the user is free to do anything else in the app.
- **Human Edit** — the human confirms and repairs what Conxa learned: steps, intent, selectors. This is where sign-off happens, which silently triggers package assembly behind the scenes.
- **Test Skill** — the human runs the built skill and watches it execute, debugging failures and checking recovery behavior. A dedicated page, separate from editing, because "does this look right?" and "does this actually work?" are different judgments.
- **Publish Skill Package** — the human ships an update to Conxa Cloud, versioned. This is the **routine, frequent** action — it's how every subsequent workflow addition or fix reaches customers who already have Conxa installed, with zero action required on their end.
- **Build Installer** — the human produces (or refreshes) the actual distributable `{Company}-Agent-Setup.exe` that a *new* customer downloads and runs to get their first working install. This is needed once per company, and only occasionally after that (see §9 for the full architecture). Today it runs locally inside Conxa Builder; it is expected to move to Conxa Cloud once there are paying customers, so companies can generate and manage installers remotely without needing the desktop app open.

Everything else — **Build Plugin** and **View Package** — runs automatically in the background. It is still fully inspectable on demand, but it is no longer a wall the user has to climb.

The second structural change: **reorganize the information architecture around the plugin (the "Automation") as the single project object**, the way Linear is organized around the issue and Vercel around the project. One workspace per automation, with each recorded workflow carrying a live status across the per-workflow stages, and the automation as a whole carrying a distribution status across the two shipping stages.

The result is benchmarked against the products the brief names — Vercel, Stripe, Linear, Figma, Cursor, GitHub — all of which hide a genuinely complex pipeline behind a small number of high-value user moments and expose the internals only when asked.

The powerful internal pipeline does not change. What changes is that it stops being the user's problem — the user, not a timer, decides when to spend a compile credit, and Build Installer is not confused with the everyday act of shipping an update.

---

## 2. Critical analysis of the current workflow

The seven stages are not equal. Some are genuinely human work; some are plumbing that happens to have a button. The table below is the core of the analysis — the verdict column drives the entire redesign.

| # | Stage | Who does the work | Auto or human-decision? | Delivers user value, or exposes internals? | Verdict |
|---|-------|-------------------|-------------------------|--------------------------------------------|---------|
| 1 | **Record** | Human drives a real browser | Human, interactive | **Value** — this *is* the product's magic ("show it once") | **KEEP**, make it the front door |
| 2 | **Compile** | Machine (LLM-bound, ~2N+ calls) | User explicitly triggers; runs unattended after that | **Internals** — shows a 7-phase timeline + per-LLM-call timings, none of which is actionable | **KEEP the trigger, HIDE the mechanism** — explicit "Compile" click, then run in background; surface only status + confidence |
| 3 | **Human Edit** | Human reviews/repairs steps | Human, decision-heavy | **Value** — the trust & repair surface; sign-off gates everything | **KEEP as its own stage** |
| 4 | **Build Plugin** | Machine (sub-second file assembly) | Automatic; no LLM, no browser | **Internals** — assembles a folder tree | **AUTOMATE** — run implicitly after sign-off |
| 5 | **View Package** | Human browses output files | Read-only display | **Internals** — a filesystem browser over `execution.json`/`recovery.json` | **REMOVE** from primary flow → demote to Inspector drawer |
| 6 | **Test Skill** | Machine runs, human watches | User-triggered run, human-judged pass/fail | **Value** — proof it works; a distinct judgment from editing | **KEEP as its own stage**, not folded into Human Edit |
| 7 | **Build Installer** | Machine (NSIS build, local today, run once triggered) | Explicitly triggered; needs sign-in + slot quota | **Mixed** — outward-facing, spends money, produces the one artifact a brand-new customer actually needs | **SPLIT & KEEP** — the routine, frequent half becomes **Publish Skill Package**; the rare, artifact-producing half stays **Build Installer**, as its own explicit final stage — see §9 |

### What the code confirms

This is not a matter of taste — the codebase already tells us which stages are human and which are plumbing:

- **The sidebar is organized around compiler stages.** `AppChrome.tsx` exposes exactly five top-level destinations: *Dashboard, Build Plugin, Packages, Test Plugin, Build Installer*. Record, Compile, and Human Edit are not in the nav at all — they are drill-in routes under a plugin (`App.tsx` routes `/plugins/:id/record/...`, `/plugins/:id/compile/...`, `/edit/:skillId`). So the navigation surface literally is the *back half of the compiler pipeline*, not the user's task list.
- **Compile takes no user input once started, but it does cost money to start.** `handlers/compile.py`'s `cmd_compile` reserves a compile credit via `/api/v1/usage/compile/reserve`, commits it via `/commit`, and releases it on error — and today it's **synchronous**: it blocks until done, streaming `compile_step` / `api_call` events, and only one compile can run at a time. `CompileProgress.tsx` gives that wait a full-screen three-panel view with a phase timeline and per-call timing list, none of which the user can act on mid-run.
- **Build Plugin is trivial, gated file assembly.** `plugin_builder.build_plugin` reads the already-compiled `skill.json` files and writes a folder. No LLM, no browser, sub-second. Its only meaningful behavior is a *gate*: it refuses to run unless every workflow is `signed_off`. A gate does not need its own page — it needs to be enforced at the moment of sign-off.
- **View Package has zero compute.** Every `cmd_list_skill_package*` handler is a read-only list/preview over what Build Plugin already wrote. It exists purely so an engineer can audit `execution.json` and `recovery.json`. That's an inspector, not a workflow step.
- **Test is already a good, distinct surface** — form inputs, pass/fail badges, humanized errors ("executable doesn't exist" → friendly message), a retry button. The documented "raw JSON inputs" complaint is already fixed in `PluginWorkflowTests.tsx`. Its problem isn't that it's separate from editing — it's that it lives on the wrong kind of page (a disconnected top-level destination requiring a fresh plugin re-selection) instead of one click away from the workflow it validates.
- **Publishing and building the installer are already two different code paths, but conflated in the UI.** `cmd_publish` (standalone skill-pack publish → `/api/v1/plugins/publish`) is separate from `cmd_build_installer` (which mints its own `sync_token` via `_publish_skill_pack_for_installer`, then runs NSIS build + upload). The cloud already delta-syncs skill packs independently of the installer (`runtime/sync.js` ↔ `GET /api/v1/skill-packs/{company}/delta`), and the installer already has a stable "latest" URL (`GET /api/v1/installers/{slug}`). The UI just hasn't caught up to treat these as the two genuinely different actions they already are at the code level.
- **Installer builds are 100% local today.** `installer_builder.py` shells out to a local `makensis` binary and reads from Build Studio's own dependency cache (`~/.conxa-build-studio/deps/conxa-runtime/<version>/`) — there is no cloud-side build service yet. The cloud's role in `cmd_build_installer` is limited to receiving the skill-pack publish and hosting the finished exe for download, not to performing the NSIS assembly itself. This is the concrete gap that §9.9 and a migration-plan phase (§12) close by moving the build step onto Conxa Cloud.

### Two hard gates must survive any redesign

Whatever the new flow looks like, two invariants in the code cannot be broken:

1. **Sign-off gates build.** `plugin_builder.py` raises if any workflow is uncompiled or not `signed_off`. → In the new flow, sign-off becomes the **Approve** action at the end of Human Edit, and it is what silently triggers the background Build Plugin step that Test Skill then runs against.
2. **Publish/Build Installer needs a prior build + cloud auth + entitlement.** `installer_builder.py` refuses a non-local pack without a `sync_token`, and the handler requires sign-in. → Both Publish Skill Package and Build Installer stay explicit and stay gated. This is correct and should be *more* visible, not less.

### One caveat the redesign must be honest about

Studio's **Test Skill only measures deterministic robustness.** The sandbox pins recovery to Tier 2 (`CONXA_MAX_RECOVERY_TIER=2`) — no LLM or vision recovery — because there is no live agent in a Studio run. The customer's Claude Desktop *does* have Tier 3/4 recovery. So a workflow that passes in Studio is a *floor*, not a ceiling. The Test Skill page should say this plainly ("Passed without AI recovery — your customers get additional self-healing") so users neither over-trust a pass nor panic at a marginal one. §9.6–§9.7 show exactly where that Tier 3/4 gap is picked up at runtime.

---

## 3. Problems with the existing UX

### 3.1 The navigation is pipeline-shaped, but not in a way the user can follow

Conceptually the flow is a pipeline, and the app even draws it twice — a per-workflow bar (Recorded → Compiled → Tested → Installed) on the plugin detail page and a plugin-level stepper (Compile → Edit → Build → Test → Installer) on the build page. But these two visualizations **disagree** (one includes Record, the other includes Package; neither is consistent), and neither matches the actual *navigation*, which is five flat sidebar entries.

### 3.2 The user re-selects the same plugin on four pages

To take one plugin from recorded to shipped, the user:
1. Drills into the plugin to Record and Compile and Edit, then
2. Goes to **Build Plugin** (a top-level page) and re-selects the plugin from a rail, then
3. Goes to **Test Plugin** (another top-level page) and re-selects the plugin again, then
4. Goes to **Build Installer** (a third top-level page) and re-selects the plugin a third time.

The plugin is the thing the user cares about, but the app makes the *stage* the primary object and the plugin a secondary selection repeated four times. This is exactly backwards from Linear (one issue, status moves through it) or Vercel (one project, deployments flow through it).

### 3.3 Implementation detail leaks onto every screen

- **Compile** shows a 7-phase timeline (normalize → dedupe → enrich → selectors → assertions → recovery → package) and a live list of individual LLM API calls with per-call durations. The user cannot act on any of it.
- **View Package** is a raw filesystem tree of `execution.json`, `recovery.json`, `inputs.json`, and screenshots, headed by a literal "bundle root" path badge that is only meaningful to an engineer with a terminal open.
- **Human Edit** surfaces skill IDs, version strings, selectors, anchors, assertions, and a raw-metrics diagnostics blob.
- **Build Installer** exposes the cloud download URL, workspace ID, and runtime path as copyable result fields.

None of these are *wrong* to have — they are wrong to have **by default, on the main path**. They belong in an inspector that an engineer opens deliberately.

### 3.4 There is no single status model

A workflow's state is spread across `PluginWorkflow.status` (recorded/compiled), `last_test_status`, and `signed_off` — and the UI renders these inconsistently (`last_test_status: "never"` renders as a blank cell; sign-off has no indicator at all). The user cannot look at an automation and know, in one glance, "what do I need to do next?" Six stages spanning two different levels (per-workflow vs. per-automation) means this problem gets *more* pressing, not less — see §5.2's proposed two-tier status model.

### 3.5 Small but compounding papercuts

- Installer/plugin **version is hardcoded to `0.1.0`** in the build page — the user cannot version their own release from the primary flow.
- **Sign-off is silent** — `postSignOff` is best-effort and fails quietly; there is no guided checklist, so users don't know they've crossed the gate that unlocks building.
- **Compile has no explicit trigger today** distinct from a plugin's compile route — there's no first-class "Compile" button with a visible cost, queue position, or cancel affordance.
- The **docs are drifting from the code** (`UI-UX-Brief.md` describes a `CompilePage.tsx` and a separate `DashboardPage.tsx` that don't exist, and a raw-JSON test input that's already been replaced with forms). A redesign is also a chance to re-baseline the docs against reality.

---

## 4. User mental model vs. Conxa's internal pipeline

### 4.1 What the user thinks they are doing

A SaaS vendor's operator has a simple four-beat mental model:

> **"I want to teach my product a task, confirm it, make sure it works, and give it to my customers."**

Four beats: *teach → confirm → verify → give* — where "give" itself splits into two different actions depending on whether the customer already has Conxa installed.

### 4.2 What Conxa currently asks them to think about

> record → **compile** → **human edit** → **build plugin** → **view package** → test skill → **build installer**

Four of those seven words (bold) are compiler/packaging vocabulary. "Compile," "build," and "package" are words a developer uses about their *toolchain*, not words an operator uses about their *work*. The user has to learn Conxa's pipeline in order to use Conxa — the tool's internal model has become the user's burden.

### 4.3 The mapping — and the vocabulary remap

| User's mental beat | Conxa internal stage(s) | What the user should see |
|--------------------|-------------------------|--------------------------|
| **Teach** | Record + Compile | "Record" → click **Compile** → "Compiling…" (a visible, user-owned step, not hidden — but the phase timeline behind it is) |
| **Confirm** | Human Edit + Build Plugin | "**Human Edit**" — confirm/repair steps; Build Plugin assembles the package silently on Approve |
| **Verify** | View Package + Test Skill | "**Test Skill**" — run it, watch it, fix what's flagged; package internals stay in the Inspector |
| **Give (an update)** | Publish + Upload | "**Publish Skill Package**" — the routine action, every time |
| **Give (the app itself)** | Build Installer | "**Build Installer**" — the first time you ship to a company, and rarely after |

Proposed vocabulary changes (user-facing labels only — internal code names can stay):

| Today (leaks internals) | Proposed (user language) |
|-------------------------|--------------------------|
| Plugin | **Automation** (or "Skill") |
| Compile (phase timeline) | **Compile** stays visible as a *status* ("Queued / Compiling / Completed / Failed"); the phase timeline moves to the Inspector |
| Human Edit | **Human Edit** (or "Review & Refine") |
| Build Plugin | *(hidden)* — automatic on Approve |
| View Package | **Inspect** (advanced drawer) |
| Test Skill | **Test Skill** (its own page) |
| Build Installer (old, conflated) | **Publish Skill Package** (routine) / **Build Installer** (first-time or rare) |
| "bundle root", skill ID, workspace ID | *(hidden in Inspector)* |

The principle, borrowed directly from the benchmark products: **name every user-facing thing after the user's goal, and name nothing after the machine's mechanism.** Vercel doesn't call it "run webpack"; it calls it "Deploy." Stripe doesn't call it "invoke the fraud-scoring pipeline"; it calls it "Charge." Conxa should not call it "Build Plugin" — but it also shouldn't hide the two buttons (Compile, Build Installer) that spend the user's money.

---

## 5. Recommended end-to-end workflow

### 5.1 The six stages

```
┌──────────┐   ┌────────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────────────────┐   ┌──────────────────┐
│ 1. RECORD │──►│ 2. COMPILE     │──►│ 3. HUMAN   │──►│ 4. TEST    │──►│ 5. PUBLISH SKILL       │──►│ 6. BUILD          │
│           │   │    (background)│   │    EDIT    │   │    SKILL   │   │    PACKAGE             │   │    INSTALLER      │
│ show it   │   │ user clicks    │   │ confirm •  │   │ run it •   │   │ ship the update to      │   │ first ship to a   │
│ once      │   │ Compile, then  │   │ repair •   │   │ debug •    │   │ already-installed        │   │ company (rare      │
│           │   │ works free     │   │ Approve    │   │ verify     │   │ customers (routine)     │   │ afterward)        │
└──────────┘   └────────────────┘   └────────────┘   └────────────┘   └───────────────────────┘   └──────────────────┘
```

Record is a real-time human act; Compile is an explicit, paid, backgrounded machine act; Human Edit and Test Skill are two distinct human judgments; Publish Skill Package is the frequent, outward-facing act that reaches existing customers; Build Installer is the rare, outward-facing act that reaches a company's *first* customers. Build Plugin and View Package are not on this diagram at all — they are invisible machinery that runs inside the Human Edit → Test Skill handoff and the Inspector, respectively.

Note the two different scopes: stages 1–4 run **per workflow** (each recorded task moves through Record → Compile → Human Edit → Test Skill independently). Stages 5–6 run **per automation** — Publish Skill Package ships whichever workflows are Ready, bundled together, and Build Installer packages the whole automation into one distributable for a company.

### 5.2 Two-tier status: per-workflow, and per-automation distribution

Everything hangs off one object — the **Automation** (today's plugin). Inside it live one or more recorded **workflows**, each carrying its own status across the four per-workflow stages:

```
Recording…  →  Queued/Compiling  →  Needs review  →  Needs test  →  Ready
  (human)        (auto, after         (human:            (human:        (auto,
                 user clicks           Human Edit)        Test Skill)    built)
                 Compile)
```

- **Recording…** — the browser is open; the user is demonstrating.
- **Queued / Compiling** — the user clicked **Compile**; the credit is reserved and the job runs in the background. The user does not wait on a dedicated screen; they can go do something else, and — unlike today — more than one workflow can be in this state at once. (Vercel-style: you pushed, the build is running, you'll be told when it's ready.)
- **Needs review** — compile finished; the workflow is ready for Human Edit. A confidence score and any low-confidence steps are flagged here.
- **Needs test** — the human approved (signed off) in Human Edit, which silently triggered Build Plugin. The workflow now needs a Test Skill run before it can ship.
- **Ready** — Test Skill passed (or the user accepted a documented caveat). The workflow is now shippable.

Once at least one workflow is Ready, the **Automation** itself carries a second, separate distribution status — because Publish Skill Package and Build Installer act on the whole automation, not on a single workflow:

```
Nothing shipped  →  Skill Package Published  →  Installer Built  →  Skill Package Published (v+1, v+2, …)
                                                                       (all future updates land here — no
                                                                        new installer needed)
```

- **Skill Package Published** — the human clicked Publish; the pack is versioned and live in Conxa Cloud. Any already-installed runtime for this company can sync it automatically (§9.5).
- **Installer Built** — the human clicked Build Installer (typically once, for this company's first customers); a `{Company}-Agent-Setup.exe` now exists at a permanent download URL (§8.7, §9.9).
- After that first build, routine updates loop back through *only* Publish Skill Package — the installed base auto-syncs, and Build Installer is revisited only for a new company or a genuine platform-level change.

### 5.3 The auto-advance principle — everywhere except the three deliberate clicks

Today, after recording, the user manually clicks: Compile button → wait on compile page → "Review steps" → edit page → (navigate away) → Build page → re-select plugin → build → Test page → re-select plugin → test → Installer page → re-select plugin → build installer.

In the new flow, three stages are **deliberate, explicit clicks that never auto-advance into**, because each one spends something or reaches outward: **Compile** (spends a compile credit), **Publish Skill Package** (reaches existing customers), and **Build Installer** (spends an installer slot and produces the one artifact a brand-new customer relies on). Every other transition auto-advances: when compile finishes, the automation **lands the user directly in Human Edit** with a confidence banner already computed; when the user clicks **Approve**, Build Plugin runs silently and the automation **lands the user directly in Test Skill**, pre-flighted and ready to run. The user's next required action is always one click away and always framed as a decision, never as a machine operation.

### 5.4 The happy path, end to end

1. **New Automation** → enter name + target URL. (Once per product area; auth is recorded once and reused.)
2. **Record** → click "Record a task," a browser opens on the authed target URL, the user performs the task, closes the browser. Status → **Ready to compile**.
3. **Compile** → the user clicks **Compile** (cost disclosed inline). The button becomes a progress indicator; the user is free to navigate elsewhere. Status → **Compiling…** → **Needs review**, with a toast/activity item announcing "Ready to review."
4. **Human Edit** → the user opens the automation, sees the steps in plain language, sees a confidence banner, fixes anything flagged, clicks **Approve**. Status → *(auto build)* → **Needs test**.
5. **Test Skill** → the user lands directly on a pre-flighted Test Skill page, runs the workflow in a real browser, confirms pass/fail, reads the "no AI recovery" caveat. Status → **Ready**.
6. **Publish Skill Package** → the user clicks "Publish," sets a version + release notes, uploads once. Conxa publishes the pack to the cloud. Status → **Skill Package Published**.
7. **Build Installer** *(first time only for a new company)* → the user clicks "Build Installer." Conxa assembles `{Company}-Agent-Setup.exe` — locally via Conxa Builder today, via Conxa Cloud once the vendor has paying customers (§9.9) — and returns a permanent download URL plus install instructions to hand to the company's first customers. Status → **Installer Built**.

Every automation update after step 7 is just repeating steps 2–6: customers who already have the installer pick up new Skill Packages automatically, with no new installer download ever required.

Five clicks of real decision — Compile, Approve, confirm the Test Skill result, Publish, and (the first time) Build Installer — plus Record itself, with everything else automatic.

---

## 6. Justification for every visible step

The bar for a step being *visible* (its own moment, not buried): **it must require a human decision or a human action that no machine can make.** Everything else runs automatically and is available on demand.

| Visible step | Why it earns its place |
|--------------|------------------------|
| **Record** | Only a human can demonstrate the task. This is the irreducible input and the product's core value proposition ("show it once"). It cannot be automated away. |
| **Compile** | It costs money and is worth making a deliberate act — the user, not a timer or a browser-close event, decides when to spend a compile credit. This avoids paying to compile a low-quality or accidental recording. |
| **Human Edit** | Only a human can judge "did Conxa understand what I meant?" This is the trust-and-repair surface. Sign-off (Approve) is a genuine human commitment, so it deserves to be explicit and even a little ceremonial. |
| **Test Skill** | Only a human can judge "does this actually work, and is it safe to ship to my customers?" This is a *different* judgment from Human Edit — reviewing intent and selectors is not the same act as watching an execution pass or fail — so it earns its own page rather than being folded into editing. |
| **Publish Skill Package** | Only a human should decide to ship an update to customers and set a version. It's outward-facing — already-installed runtimes pick it up automatically — and costs cloud quota. Every reason to keep an action explicit applies here. |
| **Build Installer** | Only a human should decide to produce a brand-new distributable installer. It's the artifact that reaches a company's procurement/IT process, consumes an installer slot, and — once this moves to Conxa Cloud (§9.9) — will kick off real remote build infrastructure. It's needed once per company and only occasionally after, so it deserves a deliberate, separate click from the routine Publish action, never bundled into it. |

And the corollary — why the other two pipeline stages are **not** visible steps:

- **Build Plugin** requires no human decision and takes sub-second. Its only job is to enforce the sign-off gate — which the Approve action at the end of Human Edit already enforces. → automatic on approve.
- **View Package** requires no decision at all — it's read-only inspection of machine output. → on-demand Inspector.

---

## 7. What happens automatically behind the scenes

The pipeline stays powerful; it just stops leaking. Here's the full list of what runs without asking, and the two places that still deliberately do ask:

| Trigger | Runs automatically | Cost | User sees |
|---------|-------------------|------|-----------|
| User clicks **Compile** | Frame extraction + normalization pipeline + **Compile** itself (intent, vision anchors, IdentityBundle, validations, recovery, intent graph), as a background job | 1 compile credit (metered; reserved/committed via `handlers/compile.py`) | Button becomes a live progress indicator; global status **Queued → Compiling → Completed/Failed**; user free to navigate |
| User clicks **Approve** (sign-off) in Human Edit | **Build Plugin** — assemble data-only skill-pack folder (`execution.json`, `recovery.json`, `inputs.json`, `manifest.json`, `pack.json`) | Free (local, sub-second) | "Needs test" status; automatically lands the user in Test Skill, pre-flighted |
| User opens **Test Skill** | Pre-flight — sandbox staging, Chromium check | Free (local) | A ready "Run" button; first run may note "preparing sandbox" |
| User clicks **Run** in Test Skill | Execute the skill in the Studio sandbox (Tier-2 recovery only) | Free (local) | Pass/fail, with the honest "no AI recovery" caveat |
| User clicks **Publish Skill Package** | Publish the built skill pack to Conxa Cloud, versioned; customers' installed runtimes delta-sync it via the existing `sync.js` ↔ `skill-packs/{company}/delta` mechanism (§9.5) | Uses cloud auth; routine, low-cost | Version + publish confirmation; no installer involved |
| User clicks **Build Installer** | Stage the runtime host exe, app layer, and current skill packs; mint/embed a fresh `sync_token`; run the NSIS build (`makensis`) against `installer_templates/setup.nsi.tmpl`; sign (if configured); upload the finished `{Company}-Agent-Setup.exe` (§9.1) | Installer slot + cloud auth | Explicit dialog, reserved for a company's first ship or a genuine platform-level change; replaces the artifact behind that company's one permanent download URL — never a new URL |

### The one guardrail

**Anything that spends money, consumes quota, or reaches the outside world stays explicit and visible.** Compile spends a metered compile credit — so it is one of the two steps the user must deliberately trigger, with the cost disclosed on the button itself; once triggered, it runs invisibly in the background and the credit meter stays visible throughout. Publishing spends cloud quota and reaches existing customers — so it is never automatic. Building the installer additionally spends an installer slot, is reserved for a company's first ship (or a real platform change), and is deliberately *separated* from the routine publish action, so users don't reach for the more expensive, rarer lever by habit. This is the Stripe principle: hide the *mechanism*, never hide the *charge*.

---

## 9. Installer & Deployment Architecture

This section grounds stage 6 (§5, §8.7) in exactly what happens today, end to end, from clicking **Build Installer** to a customer's first successful automation — and explains the auto-update model that makes Publish Skill Package the frequent action and Build Installer the rare one.

### 9.1 How `{Company}-Agent-Setup.exe` is built

`installer_builder.py` (invoked by the `cmd_build_installer` RPC handler) produces one Windows installer per company, named `{CompanyName}-Agent-Setup.exe` (spaces stripped from the company name — e.g. `AcmeCorp-Agent-Setup.exe`). The build is a local, deterministic assembly step, not a compile: it does not touch the LLM pipeline or the recorder. Concretely, it:

1. Confirms the automation's skill pack is already built and every included workflow is signed off (the same sign-off gate from §2).
2. Calls `_publish_skill_pack_for_installer()` first — this publishes the skill pack to Conxa Cloud and mints a fresh `sync_token`, embedded into the pack's `pack.json` before the installer is assembled. An installer built without a valid `sync_token` is refused for any non-local cloud.
3. Stages the runtime host exe, its native `keytar` module, the obfuscated app layer (`conxa-app/`), and the current skill-pack files into a temporary build directory, mirroring the same versioned-directory layout the runtime uses on disk (§9.4).
4. Renders `installer_templates/setup.nsi.tmpl` with those staged paths and the company's branding (name, optional logo), and runs it through `makensis` (NSIS) to produce the single-file installer.
5. Optionally signs the binary (CI only) and uploads it to Conxa Cloud, which is what makes the permanent per-company download URL (`GET /api/v1/installers/{slug}`) resolve to this build.

Today every one of these steps runs **locally**, inside Conxa Builder, on the SaaS vendor's own machine — `makensis` and the runtime dependency cache both have to be present locally. §9.9 covers why that changes once there are paying customers.

### 9.2 What's embedded vs. what's downloaded later

| Embedded in the installer at build time | Downloaded after install |
|---|---|
| Runtime host exe (`conxa-runtime.exe`, built `--no-bytecode`) | Chromium — the exact revision that host build expects, fetched by a post-install step, not bundled, because it's large and version-pinned |
| `keytar.node` (native credential-store module) | All future app-layer updates (a small obfuscated-JS zip, delivered via the signed manifest) |
| The obfuscated app layer (`conxa-app/` — `server.js`, `run.js`, `resolver.js`, etc.) at the version current when the installer was built | All future skill-pack updates (new workflows, edited steps, republished versions — via delta sync) |
| `version.json` (host + app version metadata, used by `bootstrap.js`'s `min_host` gate) | Any future runtime host exe upgrade (requires a new installer download — the host binary never self-replaces; §9.8) |
| The **initial** skill pack(s) for that company, each with its own `pack.json` (`sync_endpoint` + freshly-minted `sync_token`) | — |
| An install identity (via `install_identity.js`, a random per-install ID used for telemetry and staged-rollout bucketing) | — |
| Optional company branding (icon) | — |

The rule of thumb: **anything needed to get a first automation running on day one is embedded; anything that changes independently afterward is fetched.** This is exactly why routine updates (stage 5) never need a new installer — only the embedded set above requires one.

### 9.3 What happens during installation

The NSIS installer, once run by the customer, works through a fixed sequence:

1. **Version check** — checks whether a newer runtime is already on disk (from a previous, newer installer) and skips staging if so, so installing an older company's package can never silently downgrade a shared machine's runtime.
2. **Stage the runtime host** — copies `conxa-runtime.exe` + `keytar.node` into a versioned directory (e.g. `conxa-runtime/<version>/`) under the install root (`~/.conxa/` on Windows), then points a `current` junction at it. Any already-running instance is stopped first.
3. **Stage the app layer** — copies the pre-extracted `conxa-app/` bundle into its own versioned directory, with the same versioned-dir-plus-`current`-junction pattern.
4. **Install Chromium** — runs the freshly-staged host exe with an install-time flag so it downloads the Chromium revision that build expects — the one real internet dependency at install time, beyond registering with the cloud.
5. **Stage the initial skill packs** — copies the embedded skill-pack directories into place, each with its own versioned dir and `current` junction, matching the versioning scheme the delta-sync mechanism (§9.5) uses for updates.
6. **Register the MCP server** — writes an entry into Claude Desktop's `claude_desktop_config.json` pointing at the installed `conxa-runtime.exe`, so Claude Desktop spawns it as an MCP stdio server on next launch.
7. **Write install identity** — `install_identity.js` generates and persists a random install ID, used purely for telemetry and for deterministically bucketing this install into staged rollout percentages (§9.8) — not a login credential.

Nothing in this sequence requires the end customer to sign in or configure anything; the only manual step left for them is (re)starting Claude Desktop so it picks up the newly-registered MCP server.

### 9.4 How the Runtime and App layer initialize

On every cold start, `bootstrap.js` (the thin entry point baked into the host exe) runs first:

1. Resolves the environment (company/channel) and exposes shared globals (`__hostRequire` for bundled Node modules like Playwright, the runtime's own version, a shared version-manager helper, and the Ed25519 public key used to verify update manifests).
2. Reads the app layer's `current` version directory and its `version.json`, and compares that version's declared `min_host` requirement against the actual host exe version.
3. If the app layer is missing, corrupt, or declares a `min_host` newer than this host exe, `bootstrap.js` does **not** load it — it rolls back to the previous versioned app-layer directory instead (the runtime keeps the last three versions on disk specifically for this). Only if every candidate fails does it exit with a fatal error.
4. Once a valid app layer is chosen, control passes into `server.js`, which brings up the MCP stdio transport immediately (so Claude Desktop's handshake isn't blocked), loads the skill index from an on-disk cache (falling back to a full rescan if stale or missing), and then kicks off startup work — skill-pack sync, an update-manifest check, and re-encryption of any session state left in plaintext — all in parallel, without blocking tool availability.

This two-layer split is why an app-layer update never requires touching the host exe: `bootstrap.js`'s `min_host` gate is the contract that makes it safe to ship a new `conxa-app` build independently.

### 9.5 How Skill Packages download from the cloud after install

Each company's `pack.json` carries a `sync_endpoint` and the `sync_token` minted at publish time. `sync.js` runs this cycle both at startup and lazily before the first execution of a skill in a session:

1. Skip if the pack was synced less than five minutes ago (a rate-limit shared with the cloud's own per-token limiter).
2. Build a `since` map from every skill's own on-disk `version.json` — "here's the version of each skill I already have."
3. POST that map to the cloud's per-skill delta endpoint, authenticated with the pack's `sync_token`.
4. The cloud responds with only the skills that actually changed, and only their changed files (`execution.json`, `recovery.json`, `inputs.json`, `manifest.json`, `validation.json`).
5. Download changed files in parallel, verify each against its declared SHA-256, and only then write them into a new versioned directory per skill.
6. Flip that skill's `current` junction to the new version, and prune old versions down to the last three (so a bad publish can be rolled back to a known-good version without a network round-trip).
7. Record the new `last_synced` timestamp back into `pack.json`.

Nothing here ever touches the runtime host exe or the app layer — this is purely a data sync, which is exactly why it can run this often without any of the compatibility risk a binary update would carry.

### 9.6 How the installed agent discovers, downloads, updates, and executes Skill Packages

**Discovery.** `skill_loader.js` scans every `skill-packs/{company}/{skill}/current/manifest.json` on disk into an in-memory registry keyed by company + slug, and separately verifies each skill's declared file checksums before it's considered usable. The MCP server exposes this registry to Claude Desktop via the `list_skills` tool (plus `get_skill_inputs` and `refresh_skills` per CLAUDE.md), and one generated tool per individual skill for direct invocation.

**Download / update.** Exactly the `sync.js` flow in §9.5 — discovery always reflects whatever is currently in the versioned `current` directories, and a sync simply flips those junctions to newer versions in place.

**Execution.** `execute_skill`/`execute_sequence` in `server.js`:
1. Wait for any in-flight startup sync to finish, so a skill never runs against a half-synced pack.
2. Re-verify the target skill's integrity and confirm the runtime meets that skill's minimum-version requirement.
3. Load `execution.json` + `recovery.json`, merge in any Tier 3/4 step overrides an agent has previously supplied for that step (the "closing edge" that lets agent-driven recovery actually heal a step going forward).
4. Hand the resulting step list to `run.js`'s plan executor, which walks each step, resolving elements via `resolver.js` (the pure, durability-scored matcher) and `resolve_adapter.js` (the Playwright-side candidate gatherer), escalating through `recovery.js`'s Tier 1/2 cascade — deterministic re-querying and accessibility-tree fallback — on any resolution failure, at zero LLM cost per the recovery-tier invariant.
5. If Tier 1/2 exhaust, the page is "parked" and control returns to Claude Desktop itself for Tier 3/4 (semantic/vision) recovery — the one place the customer's live agent, not the Studio sandbox, is the brain (exactly the gap §2's caveat about Studio-only Tier-2 testing warns about).
6. On success, any updated session state is re-encrypted and saved (AES-256-GCM via keytar, per company) so the next execution doesn't need to re-authenticate.

### 9.7 End-to-end: from installer download to the first successful automation

1. The vendor sends their customer the permanent installer URL (§8.3, §8.7); the customer downloads and runs `{Company}-Agent-Setup.exe`.
2. NSIS runs the sequence in §9.3: runtime host, app layer, Chromium, initial skill packs, and the Claude Desktop MCP registration all land on disk in one pass, with no customer configuration required.
3. The customer (re)starts Claude Desktop, which reads its config, spawns the registered `conxa-runtime.exe`, and completes the MCP stdio handshake.
4. `bootstrap.js` and `server.js` initialize per §9.4; the MCP tool list — including `list_skills` and a tool per installed skill — becomes available to Claude Desktop within that handshake.
5. The customer asks Claude to run one of their automations. Claude calls `execute_skill`.
6. `execute_skill` first waits on the startup sync (§9.5) — on a brand-new install this typically confirms the embedded skill packs are already current, since they were published moments before the installer was built.
7. `run.js` executes the plan (§9.6); if every step resolves cleanly through Tier 1/2, the automation completes and returns success (optionally with a screenshot) with **zero** LLM recovery cost.
8. If a step's selector has drifted since the workflow was recorded, Tier 1/2 absorbs small drift for free; anything beyond that surfaces to Claude Desktop itself as a Tier 3/4 recovery request — the customer's agent healing the automation live, exactly the capability a Studio Test Skill run (Tier 2 only) cannot exercise or promise.

That's the complete path: one installer download, zero manual setup beyond running it and restarting Claude Desktop, and the first automation succeeds using exactly the skill packs the vendor tested in Test Skill.

### 9.8 The auto-update strategy — and why only Skill Packages update frequently

Conxa Cloud serves a single, Ed25519-signed manifest (`GET /api/v1/manifest.json`, the current `manifest_version 3`) describing the latest available version of each of the three update-able components, superseding two older, unsigned per-component endpoints kept only for backward compatibility. Each runtime install verifies the manifest's signature against a public key baked into the host exe, caches it locally, and falls back to that cache if the network or the signature check fails. Updates roll out gradually: each install is deterministically bucketed (by its `install_identity.js`-generated ID) into a rollout percentage per component, so a bad release affects a small, reproducible slice of installs before going wide.

The three components update on deliberately different cadences, and the difference is architectural, not arbitrary:

| Component | How it updates | Typical cadence | Why |
|---|---|---|---|
| **Runtime host exe** | Never self-updates. A newer version only reaches an install via a fresh installer download and run. | Rare — the codebase's own comments describe this as roughly quarterly | It's a ~85 MB native binary built `--no-bytecode` specifically to keep the Playwright selector engine from segfaulting; replacing it while it's the process currently running is the one truly unsafe update in this whole system, so it's deliberately left to a full reinstall rather than a live swap. |
| **App layer** (`conxa-app/`) | Downloads a small zip, extracts to a new versioned directory, flips the `current` junction; picked up on the next cold start via `bootstrap.js`'s `min_host` gate. | Can ship with every release | It's pure JS (~60 KB zipped), the versioned-directory + `min_host` mechanism exists exactly to make this safe, and a failed activation rolls back automatically (§9.4) — there's no reason to gate it behind a full reinstall. |
| **Skill Packages** | Per-skill delta sync (§9.5), checked on every startup and before every execution. | Effectively continuous — every time a vendor clicks Publish Skill Package | They're pure data (JSON manifests + step definitions), carry no runtime/ABI risk at all, and the whole point of stage 5 in §5 is that this is the routine action vendors take often. |

This is the concrete reason the redesign in §5 treats **Publish Skill Package** as the frequent, low-friction action and **Build Installer** as the rare one: the architecture underneath genuinely only allows Skill Packages to move fast. Making installer rebuilds routine wouldn't just be bad UX — it would mean asking every customer to redownload and rerun a new ~85 MB installer every time a vendor tweaks a workflow, which the host exe's own update model is deliberately built to avoid.

### 9.9 Where Build Installer runs: local today, Conxa Cloud tomorrow

Right now, every step in §9.1 runs on the SaaS vendor's own machine, inside Conxa Builder: `installer_builder.py` shells out to a local `makensis` binary and reads from Build Studio's own dependency cache. The cloud's only role today is receiving the finished exe for hosting and serving it back out at the permanent per-company URL. This means building an installer today requires someone at the vendor to have Conxa Builder installed and running — it is not yet something a company can trigger from a browser.

Once there are paying customers, this stage should move onto Conxa Cloud as a first-class remote build service: a cloud worker performing the identical NSIS assembly (the same templates, the same staged-directory logic from §9.1 — just relocated off the vendor's desktop), triggered from a Cloud dashboard action instead of a Build Studio button. That unlocks generating and managing installers remotely — rotating versions, re-signing, reviewing download stats — without anyone needing the desktop app open, and without the vendor's own machine being a single point of failure for a company's very first installer. The download URL, the versioning scheme, and everything in §9.2–§9.8 stay identical either way; only *where* the NSIS build itself executes changes. This is why Build Installer is modeled as its own explicit stage in §5 rather than folded into Conxa Builder's other automatic steps — it's the one stage whose execution venue is expected to migrate.

---

## 10. AI-agent workflow

The brief asks for a workflow ideal for **both human users and AI agents**. There are two distinct agent audiences, and they sit on opposite sides of Conxa.

### 10.1 Consumption side — the agent that *runs* skills (exists today)

The customer's Claude Desktop already consumes compiled skills as MCP tools (`list_skills`, `get_skill_inputs`, `execute_skill`, `execute_sequence`, plus one generated tool per skill) and acts as the Tier 3/4 recovery brain over a parked live DOM (§9.6).

**The redesign's leverage point:** the human **Human Edit** stage is, in truth, the moment a human curates *what this downstream agent will see and how well it will run*. The steps' `intent`, `semantic_description`, `inputs.json` schema, and `intent_graph` are the agent's entire understanding of the skill. So Human Edit should **surface the agent's-eye view as a first-class panel** (§8.4, right column): the skill name, the natural-language description Claude will read, and the required inputs. When the human sharpens an intent line or renames an input, they are directly improving agent discovery and execution — the human review step *is* agent-experience design. **Test Skill** then independently verifies that the contract Human Edit approved actually executes — a second, distinct trust signal before either a human or an agent relies on it. Today this contract is generated and buried in `execution.json`; the redesign brings it to the surface as the thing the human is actually approving.

### 10.2 Build side — the agent that *authors* skills (proposed)

Today, building a skill is 100% GUI-and-human. But the entire pipeline is already RPC commands (`cmd_start_recording`, `cmd_compile`, `cmd_patch_step`, `cmd_build_plugin`, `cmd_build_installer`) over stdio. That means the pipeline can be exposed as a **headless CLI / API** so that agents or CI can author skills programmatically, mirroring the same six stages:

```
conxa record          --import trace.zip --automation acme-invoicing --workflow send-reminder
conxa compile         acme-invoicing/send-reminder            # explicit trigger, background, returns confidence
conxa edit            acme-invoicing/send-reminder --diff      # agent inspects generated steps as a diff, then approves
conxa test            acme-invoicing/send-reminder             # runs the built skill, returns pass/fail + recovery-tier caveat
conxa publish         acme-invoicing --version 1.3.0 --notes "..."   # publishes the Skill Package — the routine command
conxa build-installer acme-invoicing                            # rare — first ship to this company, or a platform-level change
```

This unlocks: recording from an imported Playwright trace instead of a live drive; regression-rebuilding all skills in CI when a target app changes; and a future where a build-side agent proposes skill edits and a human approves them as a **diff** (the Cursor model — the agent does the work, the human reviews the diff). The GUI's Human Edit page and this CLI's `--diff` are the same trust surface in two forms; the GUI's Test Skill page and the CLI's `conxa test` are likewise the same verification in two forms.

The seam is deliberate: both the human GUI and the agent CLI drive the *same* RPC commands and honor the *same* two hard gates (sign-off, publish/build-auth). We are not building a second pipeline — we're giving the existing one a second front door.

---

## 11. Alternative workflow options

### Option A — **Six stages, plugin-centric IA, background compile, explicit installer step** *(recommended, adopted)*

The full redesign described above: Record → Compile (background) → Human Edit → Test Skill → Publish Skill Package → Build Installer. Highest ceiling; requires reworking the IA and adding a background-job + status model, but keeps Human Edit and Test as the two separate human judgments they actually are, and keeps Build Installer visible rather than hidden.

- **Pros:** matches the user's mental model; removes the four-page shuffle; hides all incidental plumbing (Build Plugin, View Package) without losing it; makes both money-spending steps (Compile, Build Installer) deliberate user acts instead of automatic side effects; sets up the agent CLI; benchmarks cleanly against Vercel/Linear/Stripe; sets up the local→cloud installer-build migration (§9.9) as an explicit, named stage rather than a buried implementation detail.
- **Cons:** most work; introduces a background-job/notification system, a concurrent-compile model, and (eventually) a cloud-side installer build service.

### Option B — **Incremental: explicit-compile trigger + hide Package + keep pages separate** *(lower risk)*

Keep the existing pages, but: add an explicit Compile button with visible cost and status instead of an implicit compile-on-navigate; auto-run Build Plugin on sign-off; hide the Compile phase timeline behind a "details" toggle and show only a spinner + confidence by default; remove Packages from the sidebar (reachable only via a plugin's "Inspect" link); and add a "next action" affordance so the user isn't hunting for the right page.

- **Pros:** ships fast; low regression risk; delivers most of the value (kills the worst leakage and the Package page, and fixes the "compile shouldn't be automatic" problem) without an IA rewrite.
- **Cons:** the four-page-shuffle and pipeline-shaped nav largely remain; it's a patch, not a redesign; naming still leaks ("Build Plugin" stays); doesn't yet distinguish Publish Skill Package from Build Installer.

### Option C — **Radical / agentic: describe-the-task, agent builds it** *(future)*

The user types "record how I send an invoice reminder" in natural language; a build-side agent drives the recording (or guides the human), auto-compiles (still gated by an explicit "go ahead and spend the credit" confirmation), self-reviews low-confidence steps, and presents only the exceptions to the human. Record collapses toward zero human steps.

- **Pros:** the true "AI-native" endpoint; enormous UX ceiling; strongest differentiation.
- **Cons:** depends on reliable agentic browser driving; higher failure/uncanny-valley risk; best pursued *after* Option A establishes the status model and agent CLI that Option C would build on.

**Recommendation:** ship **A** via the phased plan in §12, using **B** as literally the first phase (it's a strict subset of A), and treat **C** as the north star that A's agent-CLI seam (§10.2) deliberately enables.

---

## 12. Migration plan

Phased so that value lands early and no phase requires the next to be useful. Each phase names the concrete files.

### Phase 1 — IA consolidation (a strict subset of the final design; low risk)

*Goal: kill the four-page shuffle and the worst leakage without touching the pipeline or merging any stages.*

- Collapse the sidebar to **Automations / Activity / Distribution / Settings / Developer Tools** (§8.1) — edit `AppChrome.tsx` `navGroups`.
- Fold **Build Plugin**, **Test Plugin**, **Build Installer** functions into the Automation workspace (an evolved `PluginDetailPage.tsx`) with status-driven rows; remove their top-level routes from `App.tsx`. Human Edit and Test Skill remain **two separate pages**, reached from the same workspace row.
- **Auto-run Build Plugin on sign-off:** have `cmd_sign_off_workflow` (or the Approve action) trigger `cmd_build_plugin` when all workflows are signed off. No new gate — it just moves the existing gate's satisfaction to the moment of approval.
- **Demote View Package** to an Inspector drawer: keep `SkillPackagesPage.tsx`'s tree component, remove `/packages` from the nav, mount it inside the Inspector.
- Fix the **hardcoded `0.1.0`** by moving version entry into the Publish Skill Package dialog.

### Phase 2 — Explicit, asynchronous, concurrent Compile + unified status model

- Introduce the two-tier status model from §5.2: a per-workflow status (Recording → Queued/Compiling → Needs review → Needs test → Ready) and a per-automation distribution status (Nothing shipped → Skill Package Published → Installer Built); render both consistently (kills the two-disagreeing-visualizations problem).
- Add a first-class **Compile** button with visible cost, replacing any implicit/automatic compile trigger. Make `cmd_compile` **non-blocking and concurrent** (today it's synchronous and one-at-a-time) so multiple workflows can compile simultaneously.
- Build an **Activity feed + completion toast** for compile jobs; replace the full-screen `CompileProgress.tsx` with a compact status chip + confidence, moving the phase timeline/API-call list into the Inspector.
- Keep the **compile-credit meter visible** throughout (money guardrail).

### Phase 3 — Human Edit and Test Skill polish (kept separate, each strengthened)

- Add the **"How Claude sees this skill"** panel to Human Edit (skill name, description, `inputs.json`) sourced from the compiled skill — the agent-contract preview from §10.1.
- Add the honest **"Passed (no AI recovery)"** caveat to Test Skill results, reusing `PluginWorkflowTests.tsx`'s existing form-input dialog and humanized-error handling — they're already good.
- Make **Approve** the explicit, ceremonial sign-off at the end of Human Edit that triggers Phase-1's auto-build and auto-advances the user into Test Skill.
- Add a one-click **"Back to Human Edit"** link from Test Skill, so the two pages stay tightly linked despite being separate.

### Phase 4 — Make Build Installer an explicit, deliberate stage (local execution, decoupled from Publish)

- Converge on **Publish Skill Package** as the routine action users take repeatedly — it publishes the built pack to the cloud so customers' runtimes pick it up via the existing delta-sync (§9.5); no installer involved.
- Add **Build Installer** as its own named dialog (§8.7) in the Automation workspace, reusing the existing `cmd_build_installer` handler exactly as it runs today (local NSIS build via `installer_builder.py`) — the only change here is UI: giving it a distinct, honestly-labeled action instead of conflating it with Publish. `sync_token` minting and the sign-in/entitlement checks in `installer_builder.py` remain a hard gate.
- Add the top-level **Distribution** page (§8.3) so every company's installer has a real home. Surface Build Installer prominently in the Automation workspace the first time (an automation with no installer yet), then move it to Distribution — labeled "Rebuild" — once one exists.

### Phase 5 — Move Build Installer to Conxa Cloud (§9.9)

- Once there are paying customers, build a cloud-side worker that performs the identical NSIS assembly described in §9.1 — same `installer_templates/setup.nsi.tmpl`, same staged-directory logic — triggered from a Conxa Cloud dashboard action rather than from Conxa Builder.
- Keep the local-in-Builder path (Phase 4) available as a fallback/dev option; the download URL, versioning, and update behavior (§9.2–§9.8) are unaffected by where the build itself executes.
- This phase is deliberately last among the installer-related work: it's real new infrastructure, and only worth building once Build Installer is genuinely a routine-enough action across enough companies to justify a dedicated remote build service.

### Phase 6 — Headless build API / CLI (agent front door)

- Wrap the existing RPC commands (`cmd_record`/import, `cmd_compile`, `cmd_patch_step`, `cmd_build_plugin`, `cmd_build_installer`) in a CLI/API surface (§10.2) mirroring the six stages, reusing the exact same handlers and honoring the same two gates.
- Add Playwright-trace import as a recording source.

Ship Phase 1 first; it is the pure IA win and delivers the biggest legibility improvement with zero pipeline risk.

---

## 13. Risks, trade-offs, and implementation considerations

| Risk / trade-off | Mitigation |
|------------------|------------|
| **Hiding Compile's phase timeline removes engineer trust signals** (they liked seeing phases/calls) | Nothing is deleted — it moves to the Inspector, one click away. Surface a **confidence score** prominently so trust has a first-class signal that's actually decision-relevant. |
| **Auto-building on approve could surprise users** | Build Plugin is free, local, and sub-second, with no outward effect — safe to automate. Approve is still an explicit human commit, so the *decision* is never automatic, only the plumbing after it. |
| **Making Compile concurrent introduces new failure/cost-overrun modes** | Each compile still reserves/commits/releases its own credit independently (existing `handlers/compile.py` logic); surface a clear per-workflow Queued/Compiling/Failed state and let users cancel a queued compile before it starts spending. |
| **Splitting Test back out from Edit could mean a user forgets to visit it** | Approve auto-navigates directly into a pre-flighted Test Skill page — the pages are separate, but never more than one click apart, and the status model always shows "Needs test" until it's run. |
| **Reintroducing Build Installer as a visible, named stage could tempt users to reach for it too often** | Deliberately separate surfaces (§8.6 vs §8.7): Publish is the routine, low-friction action, always available; Build Installer is surfaced prominently only until an installer exists, then moves to the top-level **Distribution** page (§8.3) — labeled "Rebuild," reached deliberately, with its slot cost and rarity stated up front. |
| **Moving Build Installer to Conxa Cloud (§9.9) is new infrastructure and a real migration** | Keep the exact same templates and staging logic from §9.1 — only relocate *where* they execute. Ship the local-in-Builder path first (Phase 4) and only build the cloud worker (Phase 5) once there's customer demand that justifies dedicated remote build infrastructure. |
| **The two hard gates could be broken by reordering** | Preserve them literally: sign-off still precedes build (now co-located with Approve); build/publish + auth still precede shipping. The redesign relabels and relocates these gates; it never removes them. |
| **The `auth.json`-never-in-build invariant** | Untouched. `plugin_builder.py`'s refusal-on-`auth.json` stays. The redesign changes UI, not build inputs. |
| **Background jobs + notifications are new infrastructure** | Phase 2 only. Phase 1 delivers most of the value synchronously without it, so this risk is deferred, not upfront. |
| **Docs will drift further if not re-baselined** | Per CLAUDE.md doc-maintenance rules, when this is implemented, update `UI-UX-Brief.md` (screen inventory), `App-Flow.md` (the six-stage flow + status model), `Backend-Schema.md`/`TRD.md` (if the installer build step moves to the cloud, per Phase 5), and `Implementation-Plan.md` (mark phases). This proposal document deliberately treats **code as source of truth** where the docs disagree. |
| **Studio test ≠ customer robustness (Tier 2 vs Tier 3/4)** | Don't paper over it — state it in the Test Skill result ("Passed without AI recovery; customers get more self-healing") so users calibrate correctly. §9.6–§9.7 document exactly where that gap is picked up at runtime. |

---

## 14. Final recommendation

**Adopt the six-stage flow** — collapse the seven engineer-facing stages into **Record → Compile (Background) → Human Edit → Test Skill → Publish Skill Package → Build Installer**, reorganize the app around the **Automation as the single project object** with a two-tier status model (per-workflow, per-automation), make **Compile an explicit, user-triggered, background, concurrent job** rather than an automatic side effect, run **Build Plugin and Package assembly invisibly in the background**, and treat **Publish Skill Package** (routine) and **Build Installer** (rare, explicit, and — per §9.9 — migrating from local to cloud execution over time) as two deliberately distinct, clearly-named actions.

**Start with Phase 1.** It is a strict subset of the final design, carries no pipeline risk, and immediately fixes the two worst problems — the four-page plugin re-selection shuffle and the raw filesystem "View Package" page — by consolidating the IA and auto-building on approve, while keeping Human Edit and Test Skill as the two separate pages they need to be. It buys most of the legibility improvement before any background-job infrastructure exists, and before Build Installer needs to move anywhere.

The guiding principle throughout, drawn straight from the benchmark products: **make every visible step a real human decision, name it after the user's goal, and hide the machine — but never hide the charge, and never break a gate.** The pipeline Conxa has built is genuinely powerful. This redesign doesn't weaken it; it stops making the user carry it, puts both buttons that spend money back under the user's explicit control, and gives Build Installer the same honest, named, "here's exactly what this does and why it's rare" treatment as everything else.
