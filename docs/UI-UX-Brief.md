# UI/UX Brief

**Status:** Current as of 2026-07-07 (Build Studio workflow-redesign Phase 1: stage-shaped sidebar, shared plugin selection, Inspector drawer)
**Scope:** Build Studio (Electron) + Cloud Dashboard (Next.js)

---

## Table of Contents

1. [UI Systems Overview](#1-ui-systems-overview)
2. [Build Studio Screens](#2-build-studio-screens)
3. [Cloud Dashboard Screens](#3-cloud-dashboard-screens)
4. [Navigation Structure](#4-navigation-structure)
5. [User Journeys](#5-user-journeys)
6. [UX Bottlenecks & Friction Points](#6-ux-bottlenecks--friction-points)
7. [Missing Experiences](#7-missing-experiences)
8. [Enterprise UX Considerations](#8-enterprise-ux-considerations)
9. [Recommended Improvements](#9-recommended-improvements)

---

## 1. UI Systems Overview

Conxa has two distinct UIs:

| UI | Technology | Audience | Deployment |
|---|---|---|---|
| **Build Studio** | Electron + React (Vite) + TypeScript | Company engineers who build and publish skills | Windows desktop app |
| **Cloud Dashboard** | Next.js 16 + Tailwind 4 + shadcn/ui | Companies monitoring execution + managing billing | web (app.conxa.in on Vercel) |

Both use:
- Tailwind CSS for styling
- shadcn/ui components (Radix UI primitives)
- Clerk for auth (different SDK: Electron uses custom PKCE; web uses `@clerk/nextjs`)
- TanStack Query (cloud dashboard) or direct IPC calls (Build Studio)

The production source of truth is:
- Build Studio: `conxa-builder/electron/renderer/src/`
- Cloud Dashboard: `conxa-cloud/frontend/`

(A `research/frontend/` prototype directory was referenced in earlier drafts of this doc — it does not exist in the repo; see `docs/Implementation-Plan.md` §1.8, marked MOOT.)

---

## 2. Build Studio Screens

### 2.1 Setup Wizard (`SetupWizard.tsx`)

**Purpose:** First-run onboarding when dependencies are not yet installed.  
**Inputs:** None (reads bootstrap state from backend).  
**Outputs:** Progress events from `cmd_bootstrap`.  
**User goal:** Get dependencies installed without manual intervention.

**UX issues:**
- No estimate of download time per dependency.
- Failures show a URL to whitelist but no retry button — user must re-launch.
- No "already installed, skip" fast path feedback.
- Progress is event-driven but the UI doesn't persist across restarts (progress resets if app is closed mid-bootstrap).

---

### 2.2 Login Overlay (`LoginOverlay.tsx`)

**Purpose:** Prompt sign-in before showing the main app.  
**Inputs:** User clicks "Sign In" button.  
**Outputs:** Auth state set in `AuthContext`.  
**User goal:** Authenticate once and be remembered.

**UX issues:**
- No visual feedback that the browser has opened and is waiting.
- No timeout indicator (5-minute wait; user may not know the window expired).
- Error messages from Clerk (e.g. `clerk_token_error`) are displayed raw without user-friendly translation.

---

### 2.3 Dashboard — merged into Record (2026-07)

`Dashboard.tsx` (the standalone plugin catalog: list/search/filter, create, delete) was
removed. The app had two competing "plugin home" surfaces — Dashboard for
management, Record for the actual recording workspace — which forced a re-selection
shuffle (pick a plugin on Dashboard, open its detail page, click through to Record,
pick the same plugin again on Record's own rail). Record already had the more
capable, enterprise-shaped layout (persistent master–detail rail, loading skeletons,
error/retry, `StagePath` progress), so Dashboard's plugin management was folded into
Record's left rail instead of keeping a second page. See **§2.5 Record** for the
merged screen. The sidebar no longer has a "Dashboard" entry; `/dashboard`, `/`, and
unknown routes all redirect to `/record`.

---

### 2.4 Plugin Overview (`PluginDetailPage.tsx`)

**Purpose:** Per-plugin summary: auth/workflow/credit stats, the workflow list with its unified stage badge, and an entry point into the Inspector.
**Inputs:** Plugin ID from route params (also updates the shared selection, so a deep link or manual nav here carries to every stage page).
**Outputs:** Workflow list with `stage` (see `handlers/status.py::derive_workflow_stage`), an "Inspector" button opening `InspectorDrawer.tsx`.
**User goal:** See what needs attention next, then jump to the matching stage page.

Revised 2026-07 (workflow redesign Phase 1): recording (auth + new workflow) moved out to the dedicated **Record** page; the four-stage `Recorded → Compiled → Tested → Installed` bar (whose "Installed" node was permanently `done: false`) was replaced by `StagePath`/`WorkflowStageBadge`, driven by one backend-derived stage instead of three separate, inconsistent status fields.

**UX issues:**
- No bulk action (e.g. compile all workflows at once).
- Per-automation distribution status (published/installer-built) isn't shown yet here — lands with Phase 4 (Publish/Installer split).

---

### 2.5 Record (`RecordPage.tsx`) — now the app home

**Purpose:** The single plugin home: browse/search/create/delete plugins, and record a
login session or a new workflow — the "show it once" step of the redesigned flow.
**Inputs:** Plugin selection via its own left rail (see layout note below), which also
writes to the shared `selectionStore` so other stage pages stay in sync.
**Outputs:** A created/deleted plugin, a captured auth session, or a new `PluginWorkflow`.
**User goal:** Get a task recorded, or manage which automations exist, without hunting
for the right page.

**Layout (revised 2026-07, merged with Dashboard):** left plugin rail (272px) with a
header (plugin count + **New Plugin** button opening the create dialog), a search box
and status-filter chips, then one row per matching plugin (status dot, workflow count,
auth status) + right workspace (plugin header with status badge and a **Delete**
button for the selected plugin, an action row with **Record Login**/**Re-record
Login** and **Create Workflow**, an amber notice when auth is still required, and a
scrollable "Recorded workflows" list below showing each workflow's `StagePath` and an
"Open" link to the plugin overview). Record keeps its own always-visible plugin list
(now the only one in the app) because picking which automation to work on is the
primary action on this page, not a secondary one; the old `PluginSwitcher`-style
dropdown used on other stage pages isn't a fit here.

**Components:** `AuthRecordDialog` and `NewWorkflowDialog` (moved here from
`PluginDetailPage.tsx` in the 2026-07 redesign — same guided-steps UI, same mutations,
now scoped to whichever plugin is selected in the rail). `CreatePluginDialog` and
`DeletePluginButton` (ported from the removed `Dashboard.tsx` — same mutations,
`create_plugin`/`delete_plugin`, unchanged).

**UX issues:**
- No "re-record workflow" action (only auth has a re-record path) — a stale workflow recording must be deleted and re-created.
- This page's plugin rail is independent of the `PluginSwitcher` dropdown used elsewhere — selecting a plugin here updates the shared selection, but the two pickers look and behave differently, which the rest of the stage pages don't do.
- No per-plugin run stats (`cmd_get_metrics` only counts skills and packs); no execution history in the studio (runs are in the Cloud Dashboard) — carried over from the removed Dashboard page.

---

### 2.6 Recording Feed (`RecordingFeed.tsx`)

**Purpose:** Live view of captured events during recording.  
**Inputs:** Active recording session.  
**Outputs:** Real-time event stream display.  
**User goal:** Confirm the recorder is capturing events correctly.

**UX issues:**
- Events are shown as raw JSON — not user-friendly (e.g. `{"action":"click","target":{"role":"button","inner_text":"Submit"}}`).
- No screenshot preview during recording (screenshots are captured but not shown live).
- No "pause recording" capability — only start/stop.
- No indication of iframe depth (user can't tell if the recorder is inside a frame).

---

### 2.7 Human Edit list (`HumanEditListPage.tsx`)

**Purpose:** Entry point for reviewing the selected automation's compiled workflows, needs-review-first.
**Inputs:** The shared plugin selection.
**Outputs:** A row per compiled workflow with its confidence summary (`compile_status`/`compile_min_confidence`, computed at compile time by `_build_compile_report` and persisted onto the workflow in `handlers/compile.py`) and a "Review" link into the per-skill editor below.
**User goal:** See which workflows most need a human look, in one glance, without opening each one.

New in the 2026-07 redesign (Phase 1) — previously the only way to reach a compiled workflow was via the plugin overview or a direct `/edit/:skillId` link.

---

### 2.8 Human Edit editor (`HumanEditPage.tsx`)

**Purpose:** Review and edit compiled workflow steps before signing off.  
**Inputs:** Compiled skill ID.  
**Outputs:** Patched skill document.  
**User goal:** Verify each step is correct and parameterize inputs.

**Components:**
- `WorkflowViewer.tsx` — step list with action/intent display; each row also renders a `BranchSummaryBadge` and safety badges (`allow_forced_action`/hover-chain — 2026-07-10) via `StepBadges`, and an indented collapsible `BranchSubList.tsx` under any `if_present` step, previewing its nested body (clicking a nested row selects the parent step and focuses that nested index — `editorStore.focusedBranchIndex`)
- `InlineRetargetFlow.tsx` — center pane: embeds the re-target wizard and `StepConfigForm.tsx` together (retired the standalone `StepEditorPanel.tsx`). Branch steps (`if_present`/`try_dismiss`/`wait_for_one_of`) skip the wizard entirely — their bbox-driven model doesn't fit a candidate list or option set — and render `StepConfigForm` plus, for `if_present` only, `components/branch/BranchBodyEditor.tsx` (2026-07-10)
- `StepConfigForm.tsx` — edit intent, selectors, assertions for a step. **Validation card (2026-07, post-condition validation):** a self-contained "Validation" card (read-only wait-for description + the editable assertion list, via the shared `components/validation/AssertionEditor.tsx` — the same row editor `RetargetPhaseValidation.tsx` uses) with its own "Save validation" action, independent of the rest of the step form's single "Save step" submit. Hidden for scroll/marker steps (`editable_fields.validation`). Backed by `StepEditorDTO.validation.assertions`, newly surfaced by `step_to_dto` (previously only `wait_for`/`success_conditions` reached the client). Saved edits are gated by `conxa_compile/editor/patch_gate.py::validate_editor_patch`, now wired into `cmd_patch_step` — a manual edit that would drop a consequential step's only required assertion is rejected before it's persisted, not just flagged after the fact. **Reliability collapsible (2026-07-10):** a "Show reliability details" section (hidden by default, hidden entirely during the wizard's Phase 2 / for marker steps) mounting `StepIdentitySummary.tsx` (closes the `BUILD-4` gap — was built but never rendered), `RecoveryBehaviorCard.tsx` (plain-language recovery ladder from `StepEditorDTO.recovery_view`), and `ElementFingerprintCard.tsx` (`StepEditorDTO.fingerprint` — role/text/labels/testid/position + frame/shadow depth).
- `branch/BranchBodyEditor.tsx` (2026-07-10) — add/remove/reorder + per-step inline editing for an `if_present` step's nested body. Deliberately not built on `StepConfigForm` (whose `patchStep` calls are hardcoded to the top-level `step_index`); a standalone, path-aware editor instead, visually consistent with `StepConfigForm`'s card idiom. Reorder is up/down buttons, not drag-and-drop.
- `ConfidenceBanner.tsx` — a suggestions-lint rollup (errors/warnings/"looks solid", from `wf.suggestions`) described in the redesign doc as spanning the pane grid, but **not currently mounted anywhere** (confirmed via repo-wide search, 2026-07-10) — this description is stale; the component exists but is dead code. Distinct from `CompileHealthBanner.tsx` below, which *is* mounted and reads a different signal (`compile_report`, not lint suggestions).
- `CompileHealthBanner.tsx` (2026-07-10, mounted under the page header) — workflow-level status pill (`compile_report.status`) + min-confidence + clickable "N steps below threshold" chips (jump to step) + required-runtime, with a "Details" button opening the new Diagnostics tool tab.
- `WorkflowPlanPanel.tsx` (2026-07-10, new "Workflow plan" Tools-rail tab) — read-only `intent_graph`: goal, per-step intent + verification anchor, decision points, expected end state.
- `DiagnosticsPanel.tsx` (2026-07-10, new "Diagnostics" Tools-rail tab) — compile report detail, LLM router stats, compiler policy version, required runtime, structural-fingerprint presence, and the selected step's `stable_hash`/`compat_fingerprint`. Distinct from the landing page's "Diagnostics" card (raw backend metrics JSON, unrelated concept, still only on the no-skill-selected state).
- `HowClaudeSeesThisPanel.tsx` — read-only agent-contract preview (Tools rail)
- `ParameterizationDrawer.tsx` — convert literal values to `{{variables}}`
- `RecordingScreenshotsPanel.tsx` — match steps to recording screenshots
- `SuggestionsPanel.tsx` — AI-suggested improvements
- `EntitlementMeters.tsx` — shows Human Edit pool for LLM-assisted edits

**Re-target wizard — STALE, superseded by inline embedding (flagged, not yet reconciled):** the three-separate-routes description below was accurate for an earlier iteration; the wizard has since been merged into `InlineRetargetFlow.tsx`, embedded directly in the center pane next to the step list (see the Layout paragraph above) rather than living on its own routes/pages. The phase-by-phase behavior (Pick element → Review selectors → Validation, the pruning rules, the `regenerate` LLM gating) is unchanged — only *where* it renders changed. This subsection needs a follow-up rewrite to describe `InlineRetargetFlow.tsx` instead of the retired `RetargetPickPage.tsx`/`RetargetSelectorsPage.tsx`/`RetargetConfirmPage.tsx` route trio; left as-is below to avoid rewriting under time pressure with unverified route-removal details. **Phase 3 note (2026-07, post-condition validation):** Phase 3 was renamed "Confirm & apply" → "Validation" and is no longer just a keep/replace diff — it now surfaces the step's enforced (`required=True`) assertion (the compiler's single deterministic post-condition for the action) plus any advisory checks, and lets the user edit the flat assertion list (type, target, expected value, timeout, required) via `RetargetPhaseValidation.tsx` before applying; a step with no enforced check is flagged rather than silently accepted. Edits round-trip through `cmd_retarget_apply`'s new `edited_assertions` payload field.
1. **Pick element** — `/edit/:skillId/retarget/:stepIndex` (`RetargetPickPage.tsx`) — the step's current target is preselected, so drawing a new region is optional. Continue runs `cmd_retarget_preview` with `regenerate` set to whether a new region was actually drawn, then navigates to the selectors route (`RetargetPhasePick.tsx`, reuses `ScreenshotViewer`'s draw mode via `autoActivateDraw`).
2. **Review selectors** — `/edit/:skillId/retarget/:stepIndex/selectors` (`RetargetSelectorsPage.tsx`) — shows each candidate's actual selector string (monospace, always visible — not hidden behind a toggle) alongside an engine badge, a verification badge, and a labelled durability bar; the collapsible now holds only the manual-selector override. On the review path the candidates are built from the step's `identity_bundle` signals, so the verification badge reflects the compiler's own `unique_at_compile` verdict (computed at compile time against the recorded DOM *and* accessibility tree) rather than a weaker offline CSS re-check — role=/text= selectors that the offline checker can't evaluate therefore read "Unique match" instead of an unverified state, and the engine/durability come from the compile. Badge states: **Unique match**, **Not unique** / **Matches N elements**, and **Checked at run time** (the offline-unverifiable case, e.g. an older skill with no identity_bundle). The review list is pruned (`_prune_review_candidates`) so it doesn't offer options that make bad targets — non-unique matches (could resolve to the wrong element) and any selector below a hard durability floor (`_MIN_OFFERED_DURABILITY`, 30%; e.g. an absolute XPath or a fragile structural selector) are dropped. The prune can empty the list — if nothing clears the bar, the wizard shows the "re-pick" prompt rather than offering a too-weak selector. Because apply rebuilds `fallback_selectors` from the shown candidates, applying after a review also drops the pruned selectors from the skill, keeping them out of the runtime. Ambiguous or zero-candidate results are flagged with a way back to Phase 1 (`RetargetPhaseSelectors.tsx`). Only when the user re-picked the element (`regenerate=true`) does `cmd_retarget_preview` re-run selector generation against the original recorded DOM snapshot (LLM-assisted, the sanctioned 1-click-fix exception — see `CLAUDE.md` Key Invariants); continuing on an **unchanged** element instead reads back the selectors already produced at compile time — no LLM call, no Human Edit pool consumed, and no dependency on the recording session still existing.
3. **Validation** (was "Confirm & apply") — `/edit/:skillId/retarget/:stepIndex/confirm` (`RetargetConfirmPage.tsx`) — shows the step's current vs. proposed wait-for/assertions in plain language with a "keep existing" checkbox, and the enforced post-condition plus advisory checks as an editable flat list (type, target, expected value, timeout, required); a strong, unambiguous pick with unchanged validation collapses this phase to a single confirm (`RetargetPhaseValidation.tsx`).

**Identity-signal transparency (2026-07-10):** Phase 2's candidate rows also carry an **orthogonality class** badge (test-contract / semantic-aria / visible-text / spatial-anchor / structural — the independent "axis of identity" a selector depends on, from `IdentitySignal.orthogonality_class`) and a **source** badge (compiler / AI-assisted / manual edit), plus a step-level **compile confidence** percentage in the Selectors card header — all previously computed and persisted in `identity_bundle` but not shown. Manually editing or adding a selector now marks it `source: user`. A read-only **"Current identity"** card (`StepIdentitySummary.tsx`) showing the same badge set for the step's already-compiled signals was built for Phase 1 (Pick element) but was not wired into `RetargetPhasePick.tsx` at the time — **mounted 2026-07-10**, though in `StepConfigForm.tsx`'s new "Reliability" collapsible rather than specifically in Phase 1 (see the Components list above); the literal Phase-1 wizard placement remains open if still wanted (`TODO.md` `BUILD-4`, now marked resolved-with-caveat).

Because each phase is a separate route that unmounts on navigation, the cross-phase state (drawn bbox, fetched preview, chosen selector, keep-validation) lives in a small Zustand store (`store/retargetStore.ts`); the shared page frame, phase stepper, and workflow-loading hook live in `components/retarget/retargetFlow.tsx`. The selectors and confirm routes redirect back to Pick if their preview state is missing (e.g. a hard reload or a pasted deep link), so a phase can't render without its prerequisites. Each page carries its own `PageHeader` (title, step description, "Back to editor") and the same phase stepper.

Nothing persists until Apply (on the confirm route), which calls `cmd_retarget_apply` once — bbox, target selectors, `identity_bundle`, and (optionally) validation land as a single undo entry, updates the same `['workflow', skillId]` react-query cache `HumanEditPage` reads, resets the wizard store, and navigates back to `/edit/:skillId`. If the original recording session is gone, Phase 1 offers an "apply position only" fallback that updates the bbox without touching selectors.

**Layout (3-zone editor):** the redesign doc's plan called for a confidence banner (`ConfidenceBanner.tsx`) spanning the full width above the pane grid — a headline rollup of `wf.suggestions` — but that component was never actually wired in (confirmed 2026-07-10; see the Components list above). What **is** mounted there today, as of the 2026-07-10 redesign, is `CompileHealthBanner.tsx` — a different signal (`compile_report.status`/`min_confidence`, not lint suggestions), also serving as the page's first-seen trust indicator. Below it: a top toolbar (skill title + id/copy, version, undo/redo, Back, and the brand-clay **Approve** CTA — a `BadgeCheck`-iconed `variant="brand"` button, renamed from "Finish editing" — with a live "N unsaved" indicator driven by the editor store's `dirtySteps`), a slim entitlement-meter strip, then a resizable three-pane body: left **Workflow** step list (`WorkflowViewer`, now also showing branch sub-lists — see above), center **step editor + re-target wizard** (`InlineRetargetFlow.tsx`, embedding `StepConfigForm.tsx` — see below), right **Tools** rail, opened as a shared modal dialog keyed off a single `openTool` state rather than separate always-visible panes. The Tools rail is a vertical segmented control — Suggestions / Input variables / Recording screenshots / How Claude sees this / **Workflow plan** / **Diagnostics** (the last two added 2026-07-10) — with a framer-motion active indicator and cross-faded panels; each tool sits beside its own info affordance. **How Claude sees this** (`HowClaudeSeesThisPanel.tsx`) is a read-only preview of the compiled skill's "agent contract" (§10.1) — name (`package_meta.title`), a synthesized plain-language description built client-side from the steps' `human_readable_description` (via `compactStepLabel`, honestly framed as a summary, not the verbatim generated text), and required inputs (`wf.inputs`, reusing `rowsFromServerInputs`) — all from data already fetched for this page, no new backend calls. The "no skill" state is a guided landing with a Record → Compile → Edit → **Approve** explainer, a primary **Resume a skill** card, and a **Diagnostics** card whose raw metrics JSON is collapsed by default — a distinct, older concept from the new per-skill "Diagnostics" Tools-rail tab (raw backend metrics vs. this workflow's compile telemetry).

All three pane columns (`WorkflowViewer`'s aside, `InlineRetargetFlow`'s panel, the Tools `<aside>`) share one gradient-fill depth treatment (`linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.95))` + `ring-1 ring-inset ring-white/[0.03]`) applied inline rather than via the reusable `components/ui/panel-chrome.tsx` `PanelChrome` component, because these are flush grid columns against the pane resizer, not floating/inset panels — `PanelChrome`'s rounded corners + outer shadow are reserved for panels with margin around them (e.g. `StepConfigForm.tsx`'s cards use `PanelChrome`-equivalent styling via a shared `PANEL_CARD_CLASS`). Status colors (`--status-ok/warn/error`, `globals.css`) replace what were previously hardcoded emerald/amber/red/sky classes in `BuildPipelineStepper.tsx`, `RetargetPhaseSelectors.tsx`'s uniqueness badges, and `SuggestionsPanel.tsx`'s severity badges — surfaced as `Badge`'s new `success`/`warning` variants (`destructive` already existed) and a new `Button` `brand` variant, both in `components/ui/`.

**Sign-off behavior (revised 2026-07):** **Approve** (renamed from "Finish editing," redesign doc §12 Phase 3) awaits `sign_off_workflow` and surfaces failure as a toast instead of silently swallowing it. If signing off completes the plugin's build gate — every workflow compiled and signed off — `cmd_sign_off_workflow` auto-builds the package (no separate Build Plugin page visit) and the editor navigates straight to Test Skill; otherwise it reports how many other workflows are still pending.

**Two-tier contextual help (`InfoHint` + `Tooltip`):** Every "i" affordance is a themed click-to-open popover (`components/ui/info-hint.tsx`) showing a plain-language **summary** for non-technical users plus an expandable **"Technical details"** section for power users. Help copy is centralized in `lib/editorHelp.tsx`. Short icon-button labels use a themed `Tooltip` (`components/ui/tooltip.tsx`) instead of native `title=`. Both build on Radix (`components/ui/popover.tsx`) and animate via the `.anim-pop` CSS layer in `globals.css`, degrading to instant under `prefers-reduced-motion`. The clay brand accent is the `--brand*` token set in `globals.css`.

**Resolved UX issues:**
- Tool affordances now carry first-class, themed help (summary + technical detail) rather than terse native tooltips.
- Validation/Suggestions/Variables/Screenshots/Selectors are switchable in a single animated rail; selected step uses the brand-clay highlight.
- Unsaved edits are now surfaced explicitly in the toolbar; the empty workflow shows an "Add first action" state.

**Remaining UX issues:**
- Saves are still per-step and implicit beyond the unsaved-count badge — no inline per-field "saved" confirmation.
- The screenshot panel still requires manual matching of recording screenshots to steps — should be auto-matched.
- No diff view when editing (can't see what changed from the compiled original).
- No guided sign-off checklist before Finish.

---

### 2.9 Compile (`CompilePage.tsx` + `CompileProgress.tsx`)

**Purpose:** Turn a recording into a skill — the user decides when to spend a compile credit.
**Inputs:** The shared plugin selection; per-workflow session ID.
**Outputs:** Compiled skill ID + step count + the compile-confidence summary (see §2.7).
**User goal:** Compile (or recompile) a specific workflow without hunting for it on a per-plugin build page.

Rewritten 2026-07 (Phase 1) as a real top-level page — previously "Compile Page" only described the drill-in (`CompileProgress.tsx`) and this section documented an aspirational `CompilePage.tsx` that didn't exist. `CompilePage.tsx` now lists every workflow of the selected automation with its stage badge and a Compile/Recompile action (Recompile keeps its original `AlertDialog` confirmation, including the "uses the Human Edit pool, not a compile credit" warning); triggering either still navigates to the existing `CompileProgress.tsx` drill-in, unchanged, which runs the synchronous `cmd_compile` RPC and shows the 7-phase progress.

**Meter behavior:**
- First compile consumes 1 compile credit.
- Recompile uses the Human Edit pool.

**UX issues (unchanged from before the redesign — Phase 2 of the redesign addresses these):**
- Compile still has no explicit background/concurrent job model — triggering it takes over `CompileProgress.tsx`'s full view, and navigating away abandons the in-flight RPC from the UI's perspective (the backend call keeps running).
- Progress steps (normalize → dedupe → enrich → selectors → assertions → recovery → package) are shown but LLM sub-steps are hidden.
- No persistent compile history (re-opening the page doesn't show previous compiles).

---

### 2.10 Build Installer Page (`BuildInstallerPage.tsx`)

**Purpose:** Advanced/secondary action — package an already-published skill pack release into a distributable NSIS installer. Most routine updates never need this at all; **Publish Skill Package** (§2.12) is the primary release action.
**Inputs:** Plugin ID, company slug, logo. Version and release notes are no longer collected here — they're read from the plugin's latest published skill-pack release (via `fetchSkillPackVersions`).
**Outputs:** Installer path, cloud download URL (when the optional cloud upload succeeds).
**User goal:** Produce a distributable `.exe` for a release that's already shipped via Publish Skill Package.

**Gating (redesigned 2026-07, Phase 4):** the Build button is disabled — with an inline banner linking to Publish Skill Package — until a skill-pack release exists for the selected plugin (`cmd_build_installer` raises `skill_pack_not_published` server-side if `pack.json` has no `sync_token`, i.e. nothing has ever been published). This replaced the old flow where clicking "Build Installer" silently published the skill pack as a side effect via `Backend._publish_skill_pack_for_installer`.

**Cloud upload is optional (2026-07 redesign):** `cmd_build_installer` now catches any installer-upload failure and returns it as a non-fatal `cloud_upload_error`/`cloud_upload_error_message` field on the result — the page renders it as an amber warning banner, not a build failure, since the local installer was already built successfully and installer hosting will eventually move to Conxa's own cloud build pipeline.

**Meter behavior (removed 2026-07):** the installer-slot meter pill was removed from this page — slot gating now happens entirely at skill-pack publish time (§2.12), since installer upload is unmetered.

**Pipeline stepper:** now 2 stages ("Build Installer" / "Upload to Cloud") — the old 3rd "Publish Release" stage was removed since publish no longer happens here.

**UX issues:**
- `cloud_upload_error: installer_upload_too_large` still shows via the page's local `humanizeError()` map rather than the shared `errorMessages.ts` — pre-existing duplication, not touched by the 2026-07 redesign.

---

### 2.11 Test Skill (`TestPluginPage.tsx`)

**Purpose:** Run a compiled workflow against the local runtime for validation.
**Inputs:** The shared plugin selection; test inputs.
**Outputs:** Pass/fail result, runtime output text.
**User goal:** Confirm the workflow works end-to-end before shipping to customers.

Revised 2026-07 (Phase 1): dropped its own local "Built Plugins" rail in favor of the shared `PluginSwitcher`/selection store, matching every other stage page — `PluginWorkflowTests.tsx` and `workflowTestSummary()` are reused unchanged.

**UX issues:**
- Runtime must be installed locally for testing — there's no inline message when it's not found (just `runtime_not_found` error code).
- No visual step-by-step progress during test execution.
- No "passed without AI recovery" caveat yet (Studio only exercises Tier 1/2 recovery, `CONXA_MAX_RECOVERY_TIER=2` — see `docs/App-Flow.md`); adding it is Phase 3 of the redesign.

---

### 2.12 Publish Skill Package (`PublishPage.tsx`)

**Purpose:** The primary, mandatory, version-controlled release-management action — ship a skill-pack update to customers who already have Conxa installed, via the runtime's delta-sync, with zero installer rebuild required.
**Inputs:** Version (semver), release notes, the shared plugin selection.
**Outputs:** Release history (version, release notes, publish timestamp, `is_latest`), sync endpoint, tracking URL, workspace ID.
**User goal:** Ship a skill-pack change to customers as fast as possible.

**Shipped 2026-07 (Phase 4)**, replacing the Phase-1 stub. `Backend._publish_skill_pack_for_installer` was renamed to `_publish_skill_pack` and extracted from Build Installer's call chain into the new mandatory `cmd_publish_skill_pack` RPC, which this page calls via `publishSkillPack()`. Skill-pack upload is **mandatory** — publish fails the whole action if the cloud upload fails (`_CommandError("cloud_publish_failed", ...)`), by design (per the versioned-installer-architecture requirement).

**Version history:** new `SkillPackVersionHistory`-style list (calling `fetchSkillPackVersions()` → `GET /api/v1/plugins/{installer_version}/{company_slug}/skill-packs/versions`) — the version/release-comment/publishing-limit surface that moved here from Build Installer, per the original design brief. Republishing an already-used version number is rejected with `skill_pack_version_exists` (409) rather than silently overwriting history.

**Meter behavior:** the skill-pack-slot meter pill lives here now (renamed from "installer slots" — see `docs/Backend-Schema.md` §5.3). A brand-new slug beyond the plan's slot limit is rejected with `installer_limit_exceeded` (error-code text unchanged for back-compat, meaning now "skill pack slots").

**Shared components:** the "Built Packages" sidebar list (`components/PluginListSidebar.tsx`) and the log/result-card UI (`components/BuildLogUi.tsx`) are shared with Build Installer (§2.10) to prevent the two pages' visual language drifting apart, per Recommended Improvement (closed) below.

---

### 2.13 Inspector (`InspectorDrawer.tsx`)

**Purpose:** On-demand package-file browser and internals viewer for the selected automation — the demoted home for what used to be the top-level Packages page.
**Inputs:** The plugin passed in from wherever it's opened (currently the Plugin Overview's "Inspector" button); matches it to a built package by intersecting workflow slugs (the only link `list_skill_packages`/`list_skill_package_files` expose between "plugin" and "package").
**Outputs:** Read-only file tree + preview; "Open in Explorer"; a "Rebuild package" action (calls `cmd_build_plugin` directly — the manual escape hatch now that Build Plugin has no page of its own, since sign-off auto-builds in the normal case).
**User goal:** Audit built package contents when something needs a closer look — not part of the everyday flow.

Replaces `SkillPackagesPage.tsx` (2026-07, Phase 1), reusing its `PanelChrome`/`StructureTrieRows` tree components and `lib/skillPackageTree` helpers unchanged. Deliberately scoped down from the original page: no rename/delete, no resizable panes, no cross-plugin package list — those were package-*management* features for engineers auditing the whole `data/skill-packages/` tree, not part of what an Inspector needs to do for a single automation. The bundle_root path and per-file paths now live only in this drawer, never on a default surface.

**UX issues (carried over):**
- Rebuild has no confirmation step (it's cheap and idempotent, but a stray click could surprise a user mid-review).
- No connection back to which workflow within the plugin produced which file — the tree is package-wide, not workflow-scoped.

---

### 2.14 Settings Page (`SettingsPage.tsx`)

**Purpose:** Configure Build Studio (cloud API URL, auth, proxy settings).  
**Inputs:** Form fields.  
**Outputs:** Updated environment config.  
**User goal:** Point Studio at a different cloud API (dev/staging).

**UX issues:**
- Settings are not persisted across restarts without env var changes.
- No schema validation for API URL.

---

## 3. Cloud Dashboard Screens

Source: `conxa-cloud/frontend/`

### 3.1 Marketing/Landing Page

**Path:** `app/(marketing)/page.tsx`  
**Purpose:** Public landing page for Conxa.  
**Components:** Hero, TrustedWorkflows, UseCases, ValueGrid, Pipeline, RecoveryLayers, ObservableRuntime, AnalyticsDashboard, InternalEnterprise, Reliability, Cta.

**Status:** Implemented with 3D Spline scene, Framer Motion animations, marketing sections.

---

### 3.1.1 Public Docs (`app/(marketing)/docs/...`)

**Paths:** `/docs`, `/docs/[slug]`, `/docs/claude-automation`
**Purpose:** Public documentation and customer-facing policy pages for product behavior, security, privacy, terms, cookies, billing, acceptable use, data processing, and support.
**Inputs:** Static typed content from `src/content/publicDocs.ts`.
**Outputs:** Docs index, sidebar navigation, mobile docs navigation, page table of contents, related docs, drafting-reference links for policy pages, and crawler-facing `/robots.txt`, `/sitemap.xml`, and `/llms.txt` endpoints.
**User goal:** Understand how Conxa works, what data moves where, what policies govern use, and how to contact support before signing in.

**Status:** Public marketing route group; does not require Clerk auth. Includes a Claude automation docs page for LLM/search discoverability around Claude Desktop, MCP, local execution, and browser workflow automation.

---

### 3.2 Dashboard (`app/(protected)/dashboard/page.tsx`)

**Purpose:** Enterprise operations overview after login.
**Inputs:** Clerk auth context.  
**Outputs:** Consolidated health status, execution trend, runtime footprint, risk queue, recovery intelligence, and assertion health using the tracking dashboard API.
**User goal:** Understand production automation health, adoption, failures, and recovery behavior without scanning duplicate metric panels.

**Status:** Implemented as a frontend-only observability dashboard. It preserves 7d/30d range controls, refresh behavior, and empty telemetry states while consolidating failed workflows/steps into one risk queue and recovery type/workflow drilldowns into one recovery intelligence panel.

**Assertion health card (2026-07, post-condition validation):** a new full-width section below Risk queue / Recovery intelligence, sourced from `assertion_health_by_step` (`app.services.tracking._assertion_health_by_step`, aggregating the runtime's `verify_result` telemetry event). Lists steps worst-pass-rate-first with a per-step pass-rate bar (green ≥95%, amber ≥80%, red below), check count, and advisory-failure count — the fleet-wide early-warning signal for a post-condition assertion decaying before it becomes a hard step failure.

---

### 3.3 Plugins Page (`app/(protected)/plugins/page.tsx`)

**Purpose:** List all published plugins.  
**Inputs:** Clerk auth.  
**Outputs:** Enterprise plugin cards with status, current version, workflow count, installer state, and navigation to release history.
**User goal:** Open a plugin's release/version history and manage installer downloads.

**Meter behavior:** Shows installer slots. Plugin cards with installers count toward this meter; same slug version history is an existing-slot update.

---

### 3.4 Plugin Detail Page (`app/(protected)/plugins/[id]/page.tsx`)

**Purpose:** Installer version history and workflow breakdown for one plugin.
**Inputs:** Plugin ID.  
**Outputs:** Previous installer versions, release comments, version-specific download buttons, plugin workflow count, and workflow coverage.
**User goal:** Audit release history and download the correct installer version.

**UX issues:**
- No filter by status (ok/fail).
- No drill-down from run summary to individual step events.
- No time range filter.

---

### 3.5 Compile Page (Cloud) (`app/(protected)/plugins/[id]/workflows/[workflowId]/compile/page.tsx`)

**Purpose:** Trigger re-compilation of a published workflow.  
**Status:** Listed in routes but functionality depends on cloud compilation — which is **not implemented** (cloud has no compiler). This is a future feature or a placeholder.

---

### 3.6 Billing Page (`app/(protected)/billing/page.tsx`)

**Purpose:** Subscription management via Cashfree.  
**Inputs:** Plan selection.  
**Outputs:** Checkout readiness, plan tier, and workspace usage meters.
**User goal:** Upgrade or manage subscription.

**Meter behavior:** Shows all four customer meters first: seats, installer slots, compile credits, and Human Edit pool. Account timing and checkout state live in the Billing Operations panel rather than top summary cards. The panel shows active plan and Usage reset only; Usage reset uses the Cashfree monthly payment/renewal timestamp, and the separate Billing period end row is not shown.

**UX issues:**
- No invoice history.

---

### 3.7 Team Page (`app/(protected)/team/page.tsx`)

**Purpose:** Manage workspace members, roles, and seats.
**Outputs:** Workspace/team summary, seat usage, current role, last team activity, role guide, billing/audit links, and organization member controls.
**Meter behavior:** Shows seat usage before member controls. Hard enforcement still requires Conxa-owned invites or Clerk webhook cleanup; raw `OrganizationProfile` alone is metered/audited, not a complete hard gate.
**Status:** Company-facing team UI is implemented. Member operations remain handled by Clerk organization controls.

---

### 3.8 Settings Page (`app/(protected)/settings/page.tsx`)

**Purpose:** Compact workspace settings and administration hub.
**Outputs:** Workspace identity, current user role, auth/session verification status, signed-in user context, and shortcuts to Team, Billing, and Audit.
**User goal:** Confirm they are in the right workspace and quickly reach the admin areas that change company state.
**Status:** Implemented as a read-oriented settings page backed by `/me`; real mutations remain in Team, Billing, and Audit instead of being implied by inactive settings controls.

---

### 3.9 Audit Page (`app/(protected)/audit/page.tsx`)

**Purpose:** Dedicated enterprise audit trail for workspace activity.
**Inputs:** Clerk auth context and `GET /api/v1/audit-events`.
**Outputs:** Summary counters, actor/resource coverage, latest event status, searchable and action-filtered audit table, metadata preview, and CSV export of the filtered result set.
**User goal:** Review who performed operational actions, when they happened, and which workspace resources were affected.
**Status:** Implemented as a protected route with a sidebar entry directly below Plugins.

---

### 3.10 Sign-In / Sign-Up

**Paths:** `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`  
**Purpose:** Clerk-hosted auth UI embedded in Next.js.  
**Status:** Standard Clerk Next.js integration.

---

## 4. Navigation Structure

### Build Studio

One button per stage of the Record -> Compile -> Human Edit -> Test Skill ->
Publish Skill Package -> Build Installer flow (2026-07 workflow redesign,
Phase 1), replacing the earlier compiler-stage-shaped sidebar
(Dashboard/Build Plugin/Packages/Test Plugin/Build Installer). Every stage
page reads one shared "current automation" selection (`store/selectionStore.ts`,
via `components/PluginSwitcher.tsx`) instead of keeping its own plugin rail —
picking a plugin once on any page carries it to every other stage page.
**Record is the exception and the app home** (2026-07, second pass): the
standalone Dashboard page was removed and its plugin create/delete/search
management was folded into Record's own left rail (see §2.3, §2.5), so Record
keeps its own always-visible plugin picker instead of the shared `PluginSwitcher`.

```
AppChrome (layout)
├── Sidebar
│   ├── Record (RecordPage.tsx — app home: plugin create/delete/search in the
│   │   left rail (merged in from the removed Dashboard.tsx), auth + workflow
│   │   recording in the right workspace)
│   │   └── [Plugin ID] (PluginDetailPage.tsx — per-plugin overview;
│   │       "Inspector" opens InspectorDrawer.tsx for package files)
│   │       └── /plugins/[id]/record/[workflowName] (RecordingFeed — live recording drill-in)
│   │       └── /plugins/[id]/compile/[sessionId] (CompileProgress — live compile drill-in)
│   ├── Compile (CompilePage.tsx — per-workflow Compile/Recompile, shared selection)
│   ├── Human Edit (HumanEditListPage.tsx — compiled workflows, needs-review-first,
│   │   → /edit/[skillId] HumanEditPage.tsx, the per-skill editor — see §2.8, incl. the
│   │   2026-07-10 three-tier Review/Reliability/Diagnostics redesign)
│   ├── Test Skill (TestPluginPage.tsx — shared selection, reuses PluginWorkflowTests)
│   ├── Publish Skill Package (PublishPage.tsx — primary release action, shipped Phase 4)
│   ├── Build Installer (BuildInstallerPage.tsx — secondary/advanced, requires a published release)
│   └── Settings
└── WindowTitleBar (custom Electron title bar)
```

`/dashboard`, `/`, `/plugins`, `/build` (Build Plugin), `/packages` (Skill Packages),
and unknown routes all redirect to `/record`: Dashboard was merged into Record (see
§2.3); Build Plugin is superseded by auto-build-on-sign-off (`cmd_sign_off_workflow`
now builds the package the moment every workflow is compiled + signed off; a
manual "Rebuild package" escape hatch lives in the Inspector drawer instead),
and Skill Packages' file browser moved into that same Inspector drawer.

### Cloud Dashboard

```
(marketing)/
├── / (landing page)
├── /docs
│   └── /docs/[slug]

(protected)/  [requires Clerk auth]
├── /dashboard
├── /plugins
│   └── /plugins/[id]
│       └── /plugins/[id]/workflows/[workflowId]/compile
├── /audit
├── /billing
├── /team
└── /settings

/sign-in
/sign-up
/onboarding
```

---

## 5. User Journeys

### Journey 1: First-time company engineer (Build Studio)

1. Downloads Build Studio. Runs setup wizard.
2. Signs in with Clerk (browser pop-up).
3. Creates first plugin (name + URL).
4. Records auth session (1–3 min).
5. Records first workflow (5–15 min).
6. Compiles (2–5 min — waits on LLM).
7. Reviews in HumanEdit — signs off.
8. Builds installer.
9. Distributes to first test customer.

**Time to value:** ~30 minutes from download to working installer.

**Current friction points:**
- Bootstrap progress is opaque (unclear if 2 or 20 minutes).
- Compile step has no time estimate.
- HumanEdit is the longest/hardest step — no guided review.

### Journey 2: Returning company engineer (update a workflow)

1. Opens Build Studio.
2. Navigates to existing plugin.
3. Re-records a workflow (auth is still valid).
4. Compiles new version.
5. Signs off.
6. Builds new installer version.
7. Publishes. Customers auto-update on next runtime start.

**Time to value:** ~15 minutes for a content update.

**Current friction:** No way to compare old vs. new compiled steps. Must rebuild installer even for content-only updates.

### Journey 3: Customer runs a skill

1. Installs the .exe.
2. Restarts Claude Desktop.
3. Asks Claude to run the skill.
4. Watches browser execute (headed mode default).
5. Claude confirms completion.

**Time to value:** Immediate after install.

**Current friction:** If the runtime token is not set (first-time), the skill sync silently skips. User may not know their skills need a token.

---

## 6. UX Bottlenecks & Friction Points

| Area | Friction | Impact |
|---|---|---|
| Compile step | No time estimate; LLM progress hidden | Users cancel thinking it's stuck |
| HumanEdit | No guided review checklist | Steps signed off incorrectly |
| Parameterization | Not discoverable | Workflows hardcoded; break on different users |
| ~~Runtime token~~ | ~~No in-app acquisition flow~~ | **Resolved** — installer-embedded sync token (`docs/Auth-and-Updater.md` §1.3, `docs/TRD.md` §5.4) needs no acquisition step at all |
| Error codes | Raw codes shown to user | Confusing (e.g. `cloud_unreachable` for quota exceeded) |
| Recording | No live screenshot preview | Can't confirm recorder is capturing correctly |
| Build → installer | Two steps not explained | Users confused about why two actions needed |
| Test workflow | Requires local runtime installed | No feedback when runtime missing |
| Compile quota | Quota exceeded shows as unreachable | Misleading error |
| ~~Workflow status~~ | ~~No pipeline visualization~~ | **Resolved 2026-07** — `handlers/status.py::derive_workflow_stage` + `StagePath`/`WorkflowStageBadge` replaced the three separate, inconsistent status fields with one derived stage rendered consistently across the plugin overview and every stage page |

---

## 7. Missing Experiences

### 7.1 Runtime Token Acquisition — Resolved

This section previously described a critical gap: no in-app flow for the end customer to acquire a runtime auth token, with skill sync silently failing on new installations. That design (a Clerk-token/`setup_company` challenge-URL flow via `getAuthChallengeUrl()`) was superseded before shipping by the installer-embedded sync-token model — the token is minted at publish time, written into `pack.json`, and used directly by the runtime with zero user interaction. See `docs/Auth-and-Updater.md` §1.3 and `docs/TRD.md` §5.4 for the current model. There is no first-sync gap to close here.

### 7.2 Execution Visibility in Build Studio

The Build Studio has no view of execution history from deployed customers. Engineers must open the Cloud Dashboard separately to see telemetry. There's no "how are my customers doing?" view within the tool where the engineer lives.

### 7.3 Drift Alerts — Resolved

This section previously described the `structural_fingerprint` comparison as designed but not implemented in the runtime. It's now implemented: `runtime/drift.js` runs an advisory pre-execution drift check (see `docs/TRD.md` §10.6) and emits a `drift_detected` telemetry event that surfaces on the vendor dashboard's `/drift` review queue (Implementation-Plan §2.2) when it fires. This never blocks execution — it's a signal, not a gate.

### 7.4 Workflow Diff / Version History

No way to see what changed between two compiled versions of a workflow. Engineers cannot review the diff before shipping an update.

### 7.5 Onboarding Progress State

The Setup Wizard has no persistent state. If the app is closed mid-bootstrap, it restarts from scratch. Should save progress and resume.

### 7.6 Installer Version History

**Partially resolved 2026-07:** Skill Pack Publishing (§2.12) now shows a full release history (version, release notes, publish timestamp, `is_latest`) — that's the primary changelog surface now, per the redesign making skill packs the version-controlled artifact. Pure installer-build history (the backend has always tracked `installer_versions__{slug}` and served it at `GET /api/v1/plugins/{slug}/installer/versions`) is still not surfaced as a UI list on the Build Installer page itself — see Recommended Improvement #10.

### 7.7 Multi-Plugin Build

Companies with 5+ plugins have no batch build/publish flow. Each plugin must be built and published individually.

### 7.8 Test Results Persistence

Test results (`last_test_status`, `last_test_error`) are saved to the plugin model but not surfaced prominently in the workflow list or dashboard.

### 7.9 Claude Dashboard Integration

No way to see runtime status from within Claude Desktop (other than calling `get_runtime_status`). A user-visible status summary would help diagnose issues.

---

## 8. Enterprise UX Considerations

### 8.1 Team Publishing (Missing)

Multi-engineer teams cannot currently:
- Share draft workflows before sign-off.
- Assign review tasks.
- See who compiled or built what.

### 8.2 Audit Trail

The Cloud Dashboard now has a dedicated `/audit` page with search, action filtering, summary counters, metadata preview, and CSV export over `GET /api/v1/audit-events`. Remaining enterprise hardening work is deeper event taxonomy, actor display names, and backend-level export pagination beyond the current loaded result set.

### 8.3 Offline Mode

The Build Studio can record and partially edit offline (events are local). Compilation requires the LLM proxy (cloud). There is no offline-first messaging to tell users what they can and cannot do offline.

### 8.4 Proxy / Corporate Network

Bootstrap surfaces download URLs for IT whitelisting, which is good. However, the Clerk auth flow opens a system browser and uses a fixed port range (52741–52750). Corporate proxy environments may block this. There's no proxy configuration UI.

### 8.5 Role-Based Access in Dashboard — Partially Resolved

`require_admin` is now enforced on publish, plugin create/delete, and bundle-release routes (`app/services/rbac.py`; Implementation-Plan §1.6). Fine-grained per-skill ACLs and a read-only analyst role for enterprise customers are still open — Phase 3, tracked in `TODO.md`.

---

## 9. Recommended Improvements

### Priority 1: Fix critical UX gaps (blockers for reliable use)

1. ~~**Translate error codes to human messages.**~~ **Resolved** (Implementation-Plan §2.8) — `errorMessages.ts` now maps `_CommandError` codes to user-friendly strings in the renderer.

2. ~~**Runtime token acquisition flow.**~~ **Resolved** — no acquisition flow is needed; see §7.1 above.

3. **Compile time estimate.** Before compilation starts, show an estimate based on event count: `~N steps → approximately M minutes`. Update the estimate as steps complete.

4. **Recording screenshots live preview.** During recording, show the most recently captured screenshot in a sidebar panel so engineers can confirm the recorder is working.

### Priority 2: Improve workflow quality (reduce errors in production)

5. **Guided HumanEdit checklist.** Add a checklist panel in HumanEdit: "Have you verified the selector for each step? Have you parameterized all user-specific values? Have you signed off?" Require checklist completion before sign-off.

6. **Parameterization auto-suggest.** During HumanEdit, analyze step values for user-specific patterns (email addresses, names, dates) and suggest parameterization. `{{email}}`, `{{date}}` pre-populated.

7. **Workflow pipeline visualization.** Replace the status text labels with a clear pipeline diagram: `Recorded → Compiled → Reviewed → Signed Off → Built → Deployed`.

8. **Test result persistence and surface.** Show `last_test_status` prominently per workflow. Add a "Test required before publish" gate.

### Priority 3: Operational improvements (efficiency for returning users)

9. **Bulk compile.** Allow selecting multiple recorded workflows and compiling them all in sequence with a progress bar for each.

10. **Installer version history.** Store installer builds with version, date, sha256 and show them in a list on the Build Installer page. (The backend has carried `GET /api/v1/plugins/{slug}/installer/versions` — now also `.../{installer_version}/{slug}/installer/versions` — since before this note was written; still not surfaced as a UI list on Build Installer. Still open.)

11. ~~**Publish without installer rebuild.**~~ **Resolved 2026-07.** Publish Skill Package (§2.12) publishes the updated skill pack directly via `cmd_publish_skill_pack`; Build Installer is now a fully separate, optional, secondary action gated on a release already existing. The runtime's delta sync handles delivery with zero installer rebuild.

12. **Execution dashboard widget in Build Studio.** Embed a mini execution dashboard in the Build Studio showing the last 10 runs across all deployed plugins, fetched from the Cloud API.
