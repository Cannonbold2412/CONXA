# UI/UX Brief

**Status:** Current as of 2026-08-13 (Group Page absorbed the Workflow Detail page — every workflow's record/compile/review/test/ready-to-package lifecycle now runs from its group's page via `WorkflowStageRail`, and the standalone per-workflow route was removed; Plugin→Workflow/SkillPack refactor 2026-08-12: Record page removed, Cloud dashboard's Plugins screen renamed to Skill Packages at `/packages`; capability-ladder pricing restructure from 2026-08-08: new `/pricing` page, removed skill-pack-slot meter — see `docs/PRD.md` §11)
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

### 2.3 Workflow List Page (`/workflows`)

**Purpose:** Primary landing page: browse Workflow Groups (business-domain folders — "Sales", "Marketing"), create a new group. Workflow-level create/search/delete moved to each group's own page (§2.3a).
**Inputs:** Workspace context; no selection required to load this page.
**Outputs:** A created group, or navigation to a specific group's page.
**User goal:** See the business domains at a glance and how far along each one's app logins are.

**Layout:** Empty-state welcome card (if no groups yet) or a responsive card grid with one card per group — folder icon, name, workflow count, and a shape-plus-color auth readiness line ("● 5 of 5 apps connected" / "▲ 3 of 5 apps connected", per `DESIGN.md` §6's StatusDot convention). "+ New Group" button (top-right) opens `NewGroupDialog`. Clicking a card navigates to that group's page.

**Components:** `WorkflowListPage`, `NewGroupDialog`, `GroupCard`.

**UX issues:**
- None known at launch.

---

### 2.3a Group Page (`/groups/:groupId`) — absorbed the Workflow Detail page, 2026-08-13

**Purpose:** A group's home and the sole per-workflow surface: manage its apps and their auth state, and run every stage of each workflow's lifecycle (record, compile, review, test, ready-to-package) without leaving the page.
**Inputs:** Group ID from route params.
**Outputs:** Added/removed/renamed apps, connected sessions, created/deleted workflows, renamed/deleted group, new recordings, compiled skills, sign-offs, test runs.
**User goal:** Get every app in the group signed in once, then take a workflow through its whole lifecycle from one screen.

**Layout (2026-08-13 redesign):**
- Header: group name, live "N apps · N connected" subtitle, compile-credit and Human-Edit-pool meter pills, Rename, Delete (hidden for the `Default` group), "+ New Workflow" (scoped to this group)
- Two-column body: **Applications** column (left) and **Workflows** column (right, flexes to fill)
- Applications column: `GroupAuthWizard` in `editable` mode — one row per app (Connect/Retry/Skip walks unauthenticated apps in sequence, auto-closes each login window on success), plus a pencil (edit name/login URL/success URL) and trash (confirm-then-remove) icon pair per row; a "+" icon button opens `AddAppDialog`
- Workflows column: one row per workflow — name, stage badge, target URL, then `WorkflowStageRail` (see below), then Inspector and Delete icon buttons
- `WorkflowStageRail` — five icon buttons with a label underneath, replacing the old read-only `StagePath` dots: **Record → Compile → Review → Test → Ready to Package**. Each node *is* the action for that stage, enabled only once its prerequisite is met (disabled nodes carry a tooltip explaining what's missing):
  - **Record** — enabled once the group is fully authenticated and the workflow has no recording yet; opens `RecordWorkflowDialog` inline
  - **Compile** — enabled once a recording exists; navigates to `CompileProgress`. Once a skill already exists, the same node instead opens a "Recompile?" confirm (uses the Human Edit pool) before navigating with `?mode=recompile`
  - **Review** — enabled once a skill exists; navigates to `/edit/:skillId?from=/groups/:groupId`
  - **Test** — enabled once a skill exists, the shared skill package has been built, and the workflow isn't stale (edited since the last build); toggles an inline panel under the row that mounts `WorkflowTestRow` wholesale (same input dialog, group-auth gate, live log, and pass/fail badge as Test Skill's own list)
  - **Ready to Package** — enabled once the workflow's stage is `ready`; navigates to Publish Skill Package

**Components:** `GroupPage`, `GroupAuthWizard` (now with row-level edit/remove), `AddAppDialog`, `NewWorkflowDialog` (group-scoped), `WorkflowStageRail`, `RecordWorkflowDialog`, `DeleteWorkflowButton`, `WorkflowTestRow` (reused inline), `InspectorDrawer`, `MeterBadge`.

**UX issues:**
- None known at launch.

---

### 2.5 Recording Feed (`RecordingFeed.tsx`)

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

### 2.6 Human Edit list (`HumanEditListPage.tsx`)

**Purpose:** Entry point for reviewing the selected automation's compiled workflows, needs-review-first.
**Inputs:** The shared workflow selection.
**Outputs:** A row per compiled workflow with its confidence summary (`compile_status`/`compile_min_confidence`, computed at compile time by `_build_compile_report` and persisted onto the workflow in `handlers/compile.py`) and a "Review" link into the per-skill editor below.
**User goal:** See which workflows most need a human look, in one glance, without opening each one.

New in the 2026-07 redesign (Phase 1) — previously the only way to reach a compiled workflow was via the workflow page or a direct `/edit/:skillId` link.

---

### 2.7 Human Edit editor (`HumanEditPage.tsx`)

**Purpose:** Review and edit compiled workflow steps before signing off.  
**Inputs:** Compiled skill ID.  
**Outputs:** Patched skill document.  
**User goal:** Verify each step is correct and parameterize inputs.

**Components:**
- `WorkflowViewer.tsx` — step list with action/intent display; each row also renders a `BranchSummaryBadge` and safety badges (`allow_forced_action`/hover-chain — 2026-07-10) via `StepBadges`, and an indented collapsible `BranchSubList.tsx` under any `if_present` step, previewing its nested body (clicking a nested row selects the parent step and focuses that nested index — `editorStore.focusedBranchIndex`)
- `InlineRetargetFlow.tsx` — center pane: embeds the re-target wizard and `StepConfigForm.tsx` together (retired the standalone `StepEditorPanel.tsx`). Branch steps (`if_present`/`try_dismiss`/`wait_for_one_of`) skip the wizard entirely — their bbox-driven model doesn't fit a candidate list or option set — and render `StepConfigForm` plus, for `if_present` only, `components/branch/BranchBodyEditor.tsx` (2026-07-10).
- `StepConfigForm.tsx` — edit intent, selectors, assertions for a step. **Validation card (2026-07, post-condition validation):** a self-contained "Validation" card (read-only wait-for description + the editable assertion list, via the shared `components/validation/AssertionEditor.tsx` — the same row editor `RetargetPhaseValidation.tsx` uses) with its own "Save validation" action, independent of the rest of the step form's single "Save step" submit. Hidden for scroll/marker steps (`editable_fields.validation`). Backed by `StepEditorDTO.validation.assertions`, newly surfaced by `step_to_dto` (previously only `wait_for`/`success_conditions` reached the client). Saved edits are gated by `conxa_compile/editor/patch_gate.py::validate_editor_patch`, now wired into `cmd_patch_step` — a manual edit that would drop a consequential step's only required assertion is rejected before it's persisted, not just flagged after the fact. **Reliability collapsible (2026-07-10):** a "Show reliability details" section (hidden by default, hidden entirely during the wizard's Phase 2 / for marker steps) mounting `StepIdentitySummary.tsx` (closes the `BUILD-4` gap — was built but never rendered), `RecoveryBehaviorCard.tsx` (plain-language recovery ladder from `StepEditorDTO.recovery_view`), and `ElementFingerprintCard.tsx` (`StepEditorDTO.fingerprint` — role/text/labels/testid/position + frame/shadow depth).
- `branch/BranchBodyEditor.tsx` (2026-07-10) — add/remove/reorder + per-step inline editing for an `if_present` step's nested body. Deliberately not built on `StepConfigForm` (whose `patchStep` calls are hardcoded to the top-level `step_index`); a standalone, path-aware editor instead, visually consistent with `StepConfigForm`'s card idiom. Reorder is up/down buttons, not drag-and-drop.
- `ConfidenceBanner.tsx` — a suggestions-lint rollup (errors/warnings/"looks solid", from `wf.suggestions`) described in the redesign doc as spanning the pane grid, but **not currently mounted anywhere** (confirmed via repo-wide search, 2026-07-10) — this description is stale; the component exists but is dead code. Distinct from `CompileHealthBanner.tsx` below, which *is* mounted and reads a different signal (`compile_report`, not lint suggestions).
- `CompileHealthBanner.tsx` (2026-07-10, mounted under the page header) — workflow-level status pill (`compile_report.status`) + min-confidence + clickable "N steps below threshold" chips (jump to step) + required-runtime, with a "Details" button opening the new Diagnostics tool tab.
- `WorkflowPlanPanel.tsx` (2026-07-10, new "Workflow plan" Tools-rail tab) — read-only `intent_graph`: goal, per-step intent + verification anchor, decision points, expected end state.
- `DiagnosticsPanel.tsx` (2026-07-10, new "Diagnostics" Tools-rail tab) — compile report detail, LLM router stats, compiler policy version, required runtime, structural-fingerprint presence, and the selected step's `stable_hash`/`compat_fingerprint`. Distinct from the landing page's "Diagnostics" card (raw backend metrics JSON, unrelated concept, still only on the no-skill-selected state).
- `HowClaudeSeesThisPanel.tsx` — read-only agent-contract preview (Tools rail)
- `ParameterizationDrawer.tsx` (redesigned 2026-07-31) — exports only `ParameterizationInlinePanel` now; the unused side-`Sheet` export was deleted. Declared variables render as a single-line-per-row table (name/label/type/default/optional/sensitive) instead of a six-field card, with the `{{`/`}}` braces built into the name input's frame rather than shown as a helper line below it — the same field is reused in "Turn a recorded value into a variable" (renamed from "Find & replace") so its second input can no longer be mistaken for free text. The header-level "+ Add" button is gone; a full-width dashed "New variable" strip appends a row instead, leaving "Save variables" as the tool's only primary action. A new "Optional" checkbox (auto-checked and disabled once a Default is set) marks a variable as not required at execution — see `docs/Backend-Schema.md` §3.1's `SkillInputVariable.optional`. The footer sits below the panel's own bounded scroll region (not the shared dialog `ScrollArea`), so it stays in view instead of scrolling out of reach — see `HumanEditPage.tsx`'s per-tool branch around the `variables` case.
- `RecordingScreenshotsPanel.tsx` — match steps to recording screenshots
- `SuggestionsPanel.tsx` — AI-suggested improvements
- `EntitlementMeters.tsx` — shows Human Edit pool for LLM-assisted edits

**Re-target wizard — STALE, superseded by inline embedding (flagged, not yet reconciled):** the three-separate-routes description below was accurate for an earlier iteration; the wizard has since been merged into `InlineRetargetFlow.tsx`, embedded directly in the center pane next to the step list (see the Layout paragraph above) rather than living on its own routes/pages. The phase-by-phase behavior (Pick element → Review selectors → Validation, the pruning rules, the `regenerate` LLM gating) is unchanged — only *where* it renders changed. This subsection needs a follow-up rewrite to describe `InlineRetargetFlow.tsx` instead of the retired `RetargetPickPage.tsx`/`RetargetSelectorsPage.tsx`/`RetargetConfirmPage.tsx` route trio; left as-is below to avoid rewriting under time pressure with unverified route-removal details. **Phase 3 note (2026-07, post-condition validation):** Phase 3 was renamed "Confirm & apply" → "Validation" and is no longer just a keep/replace diff — it now surfaces the step's enforced (`required=True`) assertion (the compiler's single deterministic post-condition for the action) plus any advisory checks, and lets the user edit the flat assertion list (type, target, expected value, timeout, required) via `RetargetPhaseValidation.tsx` before applying; a step with no enforced check is flagged rather than silently accepted. Edits round-trip through `cmd_retarget_apply`'s new `edited_assertions` payload field.
1. **Pick element** — `/edit/:skillId/retarget/:stepIndex` (`RetargetPickPage.tsx`) — the step's current target is preselected, so drawing a new region is optional. Continue runs `cmd_retarget_preview` with `regenerate` set to whether a new region was actually drawn, then navigates to the selectors route (`RetargetPhasePick.tsx`, reuses `ScreenshotViewer`'s draw mode via `autoActivateDraw`).
2. **Review selectors** — `/edit/:skillId/retarget/:stepIndex/selectors` (`RetargetSelectorsPage.tsx`) — shows each candidate's actual selector string (monospace, always visible — not hidden behind a toggle) alongside an engine badge, a verification badge, and a labelled durability bar; the collapsible now holds only the manual-selector override. On the review path the candidates are built from the step's `identity_bundle` signals, so the verification badge reflects the compiler's own `unique_at_compile` verdict (computed at compile time against the recorded DOM *and* accessibility tree) rather than a weaker offline CSS re-check — role=/text= selectors that the offline checker can't evaluate therefore read "Unique match" instead of an unverified state, and the engine/durability come from the compile. Badge states: **Unique match**, **Not unique** / **Matches N elements**, and **Checked at run time** (the offline-unverifiable case, e.g. an older skill with no identity_bundle). The review list is pruned (`_prune_review_candidates`) so it doesn't offer options that make bad targets — non-unique matches (could resolve to the wrong element) and any selector below a hard durability floor (`_MIN_OFFERED_DURABILITY`, 30%; e.g. an absolute XPath or a fragile structural selector) are dropped. The prune can empty the list — if nothing clears the bar, the wizard shows the "re-pick" prompt rather than offering a too-weak selector. Because apply rebuilds `fallback_selectors` from the shown candidates, applying after a review also drops the pruned selectors from the skill, keeping them out of the runtime. Ambiguous or zero-candidate results are flagged with a way back to Phase 1 (`RetargetPhaseSelectors.tsx`). Only when the user re-picked the element (`regenerate=true`) does `cmd_retarget_preview` re-run selector generation against the original recorded DOM snapshot (LLM-assisted, the sanctioned 1-click-fix exception — see `CLAUDE.md` Key Invariants); continuing on an **unchanged** element instead reads back the selectors already produced at compile time — no LLM call, no Human Edit pool consumed, and no dependency on the recording session still existing.
3. **Validation** (was "Confirm & apply") — `/edit/:skillId/retarget/:stepIndex/confirm` (`RetargetConfirmPage.tsx`) — shows the step's current vs. proposed wait-for/assertions in plain language with a "keep existing" checkbox, and the enforced post-condition plus advisory checks as an editable flat list (type, target, expected value, timeout, required); a strong, unambiguous pick with unchanged validation collapses this phase to a single confirm (`RetargetPhaseValidation.tsx`). **Expected outcome recap (2026-07-12):** below the editable "Outcome checks" list and above the Back/Apply row, a read-only `ExpectedOutcomeSummary` card (`components/validation/AssertionEditor.tsx`) recaps the step's currently-compiled post-condition (wait-for description + each assertion, or an explicit "no check configured" warning) — separate from whatever's being proposed/edited above it in this same phase. Never writes anything, so it can't conflict with the editable list.

**Identity-signal transparency (2026-07-10):** Phase 2's candidate rows also carry an **orthogonality class** badge (test-contract / semantic-aria / visible-text / spatial-anchor / structural — the independent "axis of identity" a selector depends on, from `IdentitySignal.orthogonality_class`) and a **source** badge (compiler / AI-assisted / manual edit), plus a step-level **compile confidence** percentage in the Selectors card header — all previously computed and persisted in `identity_bundle` but not shown. Manually editing or adding a selector now marks it `source: user`. A read-only **"Current identity"** card (`StepIdentitySummary.tsx`) showing the same badge set for the step's already-compiled signals was built for Phase 1 (Pick element) but was not wired into `RetargetPhasePick.tsx` at the time — **mounted 2026-07-10**, though in `StepConfigForm.tsx`'s new "Reliability" collapsible rather than specifically in Phase 1 (see the Components list above); the literal Phase-1 wizard placement remains open if still wanted (`TODO.md` `BUILD-4`, now marked resolved-with-caveat).

Because each phase is a separate route that unmounts on navigation, the cross-phase state (drawn bbox, fetched preview, chosen selector, keep-validation) lives in a small Zustand store (`store/retargetStore.ts`); the shared page frame, phase stepper, and workflow-loading hook live in `components/retarget/retargetFlow.tsx`. The selectors and confirm routes redirect back to Pick if their preview state is missing (e.g. a hard reload or a pasted deep link), so a phase can't render without its prerequisites. Each page carries its own `PageHeader` (title, step description, "Back to editor") and the same phase stepper.

Nothing persists until Apply (on the confirm route), which calls `cmd_retarget_apply` once — bbox, target selectors, `identity_bundle`, and (optionally) validation land as a single undo entry, updates the same `['workflow', skillId]` react-query cache `HumanEditPage` reads, resets the wizard store, and navigates back to `/edit/:skillId`. If the original recording session is gone, Phase 1 offers an "apply position only" fallback that updates the bbox without touching selectors.

**Layout (3-zone editor):** the redesign doc's plan called for a confidence banner (`ConfidenceBanner.tsx`) spanning the full width above the pane grid — a headline rollup of `wf.suggestions` — but that component was never actually wired in (confirmed 2026-07-10; see the Components list above). What **is** mounted there today, as of the 2026-07-10 redesign, is `CompileHealthBanner.tsx` — a different signal (`compile_report.status`/`min_confidence`, not lint suggestions), also serving as the page's first-seen trust indicator. Below it: a top toolbar (skill title + id/copy, version, undo/redo, Back, and the brand-clay **Approve** CTA — a `BadgeCheck`-iconed `variant="brand"` button, renamed from "Finish editing" — with a live "N unsaved" indicator driven by the editor store's `dirtySteps`), a slim entitlement-meter strip, then a resizable three-pane body: left **Workflow** step list (`WorkflowViewer`, now also showing branch sub-lists — see above), center **step editor + re-target wizard** (`InlineRetargetFlow.tsx`, embedding `StepConfigForm.tsx` — see below), right **Tools** rail, opened as a shared modal dialog keyed off a single `openTool` state rather than separate always-visible panes. The Tools rail is a vertical segmented control — Suggestions / Input variables / Recording screenshots / How Claude sees this / **Workflow plan** / **Diagnostics** (the last two added 2026-07-10) — with a framer-motion active indicator and cross-faded panels; each tool sits beside its own info affordance. **How Claude sees this** (`HowClaudeSeesThisPanel.tsx`) is a read-only preview of the compiled skill's "agent contract" (§10.1) — name (`package_meta.title`), a synthesized plain-language description built client-side from the steps' `human_readable_description` (via `compactStepLabel`, honestly framed as a summary, not the verbatim generated text), and required inputs (`wf.inputs`, reusing `rowsFromServerInputs`) — all from data already fetched for this page, no new backend calls. The "no skill" state is a guided landing with a Record → Compile → Edit → **Approve** explainer, a primary **Resume a skill** card, and a **Diagnostics** card whose raw metrics JSON is collapsed by default — a distinct, older concept from the new per-skill "Diagnostics" Tools-rail tab (raw backend metrics vs. this workflow's compile telemetry).

All three pane columns (`WorkflowViewer`'s aside, `InlineRetargetFlow`'s panel, the Tools `<aside>`) share one gradient-fill depth treatment (`linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.95))` + `ring-1 ring-inset ring-white/[0.03]`) applied inline rather than via the reusable `components/ui/panel-chrome.tsx` `PanelChrome` component, because these are flush grid columns against the pane resizer, not floating/inset panels — `PanelChrome`'s rounded corners + outer shadow are reserved for panels with margin around them (e.g. `StepConfigForm.tsx`'s cards use `PanelChrome`-equivalent styling via a shared `PANEL_CARD_CLASS`). Status colors (`--status-ok/warn/error`, `globals.css`) replace what were previously hardcoded emerald/amber/red/sky classes in `BuildPipelineStepper.tsx`, `RetargetPhaseSelectors.tsx`'s uniqueness badges, and `SuggestionsPanel.tsx`'s severity badges — surfaced as `Badge`'s new `success`/`warning` variants (`destructive` already existed) and a new `Button` `brand` variant, both in `components/ui/`.

**Sign-off behavior (revised 2026-07):** **Approve** (renamed from "Finish editing," redesign doc §12 Phase 3) awaits `sign_off_workflow` and surfaces failure as a toast instead of silently swallowing it. If signing off completes the workspace's build gate — every workflow compiled and signed off — `cmd_sign_off_workflow` auto-builds the shared skill package (no separate Build Skill Package page visit) and the editor navigates straight to Test Skill; otherwise it reports how many other workflows are still pending.

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

### 2.8 Compile (`CompileProgress.tsx`) — no standalone page, removed 2026-08-12

**Purpose:** Turn a recording into a skill — the user decides when to spend a compile credit.
**Inputs:** The Group Page's own Compile/Recompile rail node (`WorkflowStageRail` — see §2.3a); per-workflow session ID.
**Outputs:** Compiled skill ID + step count + the compile-confidence summary (see §2.7).
**User goal:** Compile (or recompile) a specific workflow without hunting for it.

`CompilePage.tsx` and its sidebar entry were removed as part of the Workflow Groups redesign — it only ever duplicated the Compile/Recompile buttons that already lived on the per-workflow page. Those buttons themselves were folded into the Group Page's `WorkflowStageRail` on 2026-08-13 when the standalone Workflow Detail page was removed. Triggering Compile or Recompile navigates to the unchanged `CompileProgress.tsx` drill-in, which runs the synchronous `cmd_compile` RPC and shows the 7-phase progress; its "← Back" returns via a `/workflows/:workflowId` redirect that resolves the workflow's group and forwards there.

**Meter behavior:**
- First compile consumes 1 compile credit.
- Recompile uses the Human Edit pool.

**UX issues (unchanged from before the redesign — Phase 2 of the redesign addresses these):**
- Compile still has no explicit background/concurrent job model — triggering it takes over `CompileProgress.tsx`'s full view, and navigating away abandons the in-flight RPC from the UI's perspective (the backend call keeps running).
- Progress steps (normalize → dedupe → enrich → selectors → assertions → recovery → package) are shown but LLM sub-steps are hidden.
- No persistent compile history (re-opening the page doesn't show previous compiles).

---

### 2.9 Build Installer Page (`BuildInstallerPage.tsx`)

**Purpose:** Advanced/secondary action — package an already-published skill pack release into a distributable NSIS installer. Most routine updates never need this at all; **Publish Skill Package** (§2.12) is the primary release action.
**Inputs:** Company slug, logo — no per-workflow selector; the page acts on the workspace's one shared skill pack, fetched via `fetchSkillPack()`. Version and release notes are no longer collected here — they're read from the workspace's latest published skill-pack release (via `fetchSkillPackVersions`).
**Outputs:** Installer path, cloud download URL (when the optional cloud upload succeeds).
**User goal:** Produce a distributable `.exe` for a release that's already shipped via Publish Skill Package.

**Gating (redesigned 2026-07, Phase 4):** the Build button is disabled — with an inline banner linking to Publish Skill Package — until a skill-pack release exists for the workspace (`cmd_build_installer` raises `skill_pack_not_published` server-side if `pack.json` has no `sync_token`, i.e. nothing has ever been published). This replaced the old flow where clicking "Build Installer" silently published the skill pack as a side effect via `Backend._publish_skill_pack_for_installer`.

**Cloud upload is optional (2026-07 redesign):** `cmd_build_installer` now catches any installer-upload failure and returns it as a non-fatal `cloud_upload_error`/`cloud_upload_error_message` field on the result — the page renders it as an amber warning banner, not a build failure, since the local installer was already built successfully and installer hosting will eventually move to Conxa's own cloud build pipeline.

**Meter behavior (removed 2026-07):** the installer-slot meter pill was removed from this page — slot gating now happens entirely at skill-pack publish time (§2.12), since installer upload is unmetered.

**Pipeline stepper:** now 2 stages ("Build Installer" / "Upload to Cloud") — the old 3rd "Publish Release" stage was removed since publish no longer happens here.

**UX issues:**
- `cloud_upload_error: installer_upload_too_large` still shows via the page's local `humanizeError()` map rather than the shared `errorMessages.ts` — pre-existing duplication, not touched by the 2026-07 redesign.

---

### 2.10 Test Skill (`TestSkillPage.tsx`)

**Purpose:** Run a compiled workflow against the local runtime for validation.
**Inputs:** No selector — the page is workspace-scoped, fetching every workflow (`fetchWorkflows()`) and the shared skill pack (`fetchSkillPack()`) in parallel; test inputs per workflow row.
**Outputs:** Pass/fail result, runtime output text.
**User goal:** Confirm the workflow works end-to-end before shipping to customers.

Renamed from `TestPluginPage.tsx` in the 2026-08-12 Plugin→Workflow/SkillPack refactor, dropping the per-automation selector entirely in favor of listing every workflow in the workspace at once via `WorkflowTestList` (renamed from `PluginWorkflowTests.tsx`); `workflowTestSummary()` now takes the full `Workflow[]` list directly instead of a single automation's nested workflows.

**UX issues:**
- Runtime must be installed locally for testing — there's no inline message when it's not found (just `runtime_not_found` error code).
- No visual step-by-step progress during test execution.
- No "passed without AI recovery" caveat yet (Studio only exercises Tier 1/2 recovery, `CONXA_MAX_RECOVERY_TIER=2` — see `docs/App-Flow.md`); adding it is Phase 3 of the redesign.

---

### 2.11 Publish Skill Package (`PublishPage.tsx`)

**Purpose:** The primary, mandatory, version-controlled release-management action — ship a skill-pack update to customers who already have Conxa installed, via the runtime's delta-sync, with zero installer rebuild required.
**Inputs:** Version (semver), release notes — no per-workflow selector; the page acts on the workspace's one shared skill pack, fetched via `fetchSkillPack()`.
**Outputs:** Release history (version, release notes, publish timestamp, `is_latest`), sync endpoint, tracking URL, workspace ID.
**User goal:** Ship a skill-pack change to customers as fast as possible.

**Shipped 2026-07 (Phase 4)**, replacing the Phase-1 stub. `Backend._publish_skill_pack_for_installer` was renamed to `_publish_skill_pack` and extracted from Build Installer's call chain into the new mandatory `cmd_publish_skill_pack` RPC, which this page calls via `publishSkillPack()`. Skill-pack upload is **mandatory** — publish fails the whole action if the cloud upload fails (`_CommandError("cloud_publish_failed", ...)`), by design (per the versioned-installer-architecture requirement).

**Version history:** new `SkillPackVersionHistory`-style list (calling `fetchSkillPackVersions()` → `GET /api/v1/workflows/{installer_version}/{company_slug}/skill-packs/versions`) — the version/release-comment/publishing-limit surface that moved here from Build Installer, per the original design brief. Republishing an already-used version number is rejected with `skill_pack_version_exists` (409) rather than silently overwriting history.

**Meter behavior:** the header pill was repurposed 2026-08-08 from the now-removed skill-pack-slot meter
to compile credits remaining — there is no longer any limit on how many distinct product slugs a
workspace may publish under (`docs/PRD.md` §11). Trial-expired, machine-limit, and distribution/
white-label errors from a publish or installer-upload attempt surface through the same error-message
map as every other entitlement code (`lib/errorMessages.ts`) — no dedicated UI state per code yet.

**Shared components:** the log/result-card UI (`components/BuildLogUi.tsx`) is shared with Build Installer (§2.9) to prevent the two pages' visual language drifting apart. The "Built Packages" sidebar list (`components/PluginListSidebar.tsx`) this section used to reference was removed in the 2026-08-12 refactor — both pages became workspace-scoped with no per-automation selector, so there's nothing left to switch between.

---

### 2.12 Inspector (`InspectorDrawer.tsx`)

**Purpose:** On-demand package-file browser and internals viewer for the selected automation — the demoted home for what used to be the top-level Packages page.
**Inputs:** The workflow passed in from wherever it's opened (currently the Group Page's per-row "Inspector" icon button — see §2.3a); matches it to the built skill package by comparing the workflow's own slug against each packaged skill's `workflow_slug` (the link `list_skill_packages`/`list_skill_package_files` expose between a workflow and the shared package).
**Outputs:** Read-only file tree + preview; "Open in Explorer"; a "Rebuild package" action (calls `buildSkillPackage()`, workspace-scoped — the manual escape hatch now that building has no page of its own, since sign-off auto-builds in the normal case).
**User goal:** Audit built package contents when something needs a closer look — not part of the everyday flow.

Replaces `SkillPackagesPage.tsx` (2026-07, Phase 1), reusing its `PanelChrome`/`StructureTrieRows` tree components and `lib/skillPackageTree` helpers unchanged. Deliberately scoped down from the original page: no rename/delete, no resizable panes, no cross-workflow package list — those were package-*management* features for engineers auditing the whole `data/skill-packages/` tree, not part of what an Inspector needs to do for a single workflow. The bundle_root path and per-file paths now live only in this drawer, never on a default surface.

**UX issues (carried over):**
- Rebuild has no confirmation step (it's cheap and idempotent, but a stray click could surprise a user mid-review).
- No connection back to which workflow in the workspace produced which file — the tree is package-wide (shared across every workflow that compiles into it), not workflow-scoped.

---

### 2.13 Settings Page (`SettingsPage.tsx`)

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
**Purpose:** Public landing page for Conxa. Rebuilt 2026-08-06 as a **communication-first scroll story** for enterprise buyers (CEO/CTO/CIO/VP Eng/Ops) — the prior version was feature-led and never explained the problem before listing capabilities. Each section lands one idea and answers the question the previous one raised, at plain-language reading level.

**Rebuilt again 2026-08-12** around the pricing ladder (TODO.md CLOUD-10). The 2026-08-09 ladder rewrite
(`e7939b2`) had updated `/pricing`, the nav, the FAQ and the docs, but left this page carrying the old
positioning and no price at all. Two changes: the hero now leads with the business outcome and names the
four rungs, and `PricingTable` is mounted on the page itself. Twelve sections became ten — `Problem` +
`WhyAiNeedsIt` were one argument told twice, as were `OldVsNew` + `Outcomes`.

**Section order (`src/components/marketing/sections/`, plus `hero/Hero.tsx`):**

| # | id | Answers | Component |
|---|----|---------|-----------|
| 1 | — | What outcome do I get? | `hero/Hero.tsx` (live chat + browser simulation, plus the four-rung ladder strip) |
| 2 | `demo` | What does using it look like? | `DemoStory.tsx` (click-to-play YouTube embed) |
| 3 | `the-gap` | Why is this hard, and why does AI need it? | `TheGap.tsx` + `diagrams/PathVsGuesswork.tsx` (merges the former `Problem` and `WhyAiNeedsIt`) |
| 4 | `how-it-works` | How does it work? | `HowItWorks.tsx` (sticky scroll-scrub ≥1024px, stacked below / reduced motion) |
| 5 | `examples` | Does it work on my software, and what is it worth? | `Examples.tsx` (six named processes with the department that buys each, plus the dashboard's ROI arithmetic) |
| 6 | `reliability` | Will it still work in six months? | `Reliability.tsx` (merges the former `OldVsNew` and `Outcomes`) |
| 7 | `comparison` | Why not use X instead? | `Comparison.tsx` (competitor matrix, mirrors `docs/PRD.md` §10) |
| 8 | `security` | Where does it run, and can I trust it? | `Trust.tsx` (merges the former `Architecture` and `Security`; keeps the `security` id the nav and footer link to) |
| 9 | `pricing` | What does it cost? | `PricingTable.tsx` with `compact` |
| 10 | `faq` | Everything else pre-demo | `Faq.tsx` (native `<details>`) |
| 11 | `cta` | What now? | `FinalCta.tsx` |

**Competitor matrix (`comparison`, added 2026-08-12 by request).** `DESIGN.md` §6 lists dense
feature-matrix tables as a Don't — the legacy-RPA anti-reference. This section is a deliberate,
requested exception, kept narrow to avoid what that rule guards against: six capability columns, not
twenty, and every row carries a **"Beats us at:" concession** taken from `docs/PRD.md` §10. Keep both
properties. A matrix where one column wins every row reads as marketing and gets discounted wholesale;
the concessions are what make the rest of the table credible to a technical buyer, and they are also
what the sales material is built on ("a salesperson who can name a competitor's strength is trusted on
everything else they say"). Cells accept `Partly` / `n/a` / prose — do not force every cell into a tick
or a cross, because that overstates the claim. The PRD's separate rows for live-UI agents and browser
assistants are collapsed into one; that distinction matters in a sales conversation, not here. It
replaced the three "what breaks" cards that used to close `Reliability.tsx`, which made the same
argument in weaker form.

Two layout constraints on that table, both load-bearing: the scroll container must stay
`relative`, because the `sr-only` cells are `position: absolute` and would otherwise resolve their
containing block to the `relative` `<section>`, escape the scroller at their static position, and widen
the entire page on mobile; and the first column narrows below `sm` so a phone shows more than one data
column. A visible "scroll sideways" hint appears below `lg`.

**Telemetry visuals (`reliability`):** this section reuses the **real dashboard viz components** rather
than drawing marketing approximations of them — `viz/ExecutionFlow.tsx` for a run whose certificate-upload
step self-heals at Tier 2, and `viz/TierLadder.tsx` for where recovery finishes. It replaces three
hand-drawn static SVGs (`MaintenanceChart` / `LockMark` / `CostChart`) that used to live in `Outcomes.tsx`.
Two rules apply and must not regress: (1) the figures are **explicitly labelled illustrative** in visible
body text — there is no customer proof yet (`PRODUCT.md`; `docs/PRD.md` §8, "this is a diagram, not a
moat"), so they may never be captioned as measured results; (2) the dashboard components are used
**as-is**, wrapped for scale, never edited for marketing — the one change made was an additive
`showFootnote` prop on `TierLadder`, because its built-in footnote is `text-zinc-600` on Panel Black,
which is below the 4.5:1 body-text floor for this surface.

**Copy constraints (do not regress):** no SOC 2 / HIPAA / GDPR / ITAR / certification claims; recovery Tiers 3–5 are described as *assisted*, never "fully autonomous" or "never breaks"; no invented metrics, customer logos, or testimonials; Windows-only runtime, macOS as roadmap. Allowed claims are the shipped ones — local execution, AES-256-GCM sessions in the OS keychain, credentials never in published skills, Ed25519-signed updates, admin-only publishing plus audit log, telemetry limited to event codes, unlimited free executions.

**Assets:** `DemoStory.tsx` embeds the product demo video (YouTube, click-to-play — the iframe is only injected on click, so it costs nothing at page load). Real product screenshots live in `public/marketing/screenshots/`, wired through `primitives/ShotFrame.tsx`: the four `shot_*.png` files are **cropped derivatives** of the originals — cropped both to stay legible at column width and, in the case of `shot_execution.png`, to remove the personal chat-history rail from the Claude Desktop capture. Keep the originals; re-crop rather than swapping in a raw full-window capture. `public/marketing/examples-stack.png` is an AI-generated illustration (Codex `image_gen`) whose background is exactly `#06080b`, so it composites seamlessly on the Void Black canvas — match that background on any replacement.

**Deliberately not used:** the dashboard capture (`dashboard.png`) shows a red "Attention needed" state, a 36% success rate, and single-digit workspace counts from a dev workspace. It is not on the page; the Reliability section renders the live viz components with illustrative data instead. Only put a dashboard screenshot on the homepage once its numbers represent real, healthy usage.

**Status:** Implemented with Framer Motion + Lenis. The Three.js `OrchestrationScene` was removed from the page (decorative only, no communication value); `3d/SplineScene.tsx` remains unused.

---

### 3.1.1 Public Docs (`app/(marketing)/docs/...`)

**Paths:** `/docs`, `/docs/[slug]`, `/docs/claude-automation`
**Purpose:** Public documentation and customer-facing policy pages for product behavior, security, privacy, terms, cookies, billing, acceptable use, data processing, and support.
**Inputs:** Static typed content from `src/content/publicDocs.ts`.
**Outputs:** Docs index, sidebar navigation, mobile docs navigation, page table of contents, related docs, drafting-reference links for policy pages, and crawler-facing `/robots.txt`, `/sitemap.xml`, and `/llms.txt` endpoints.
**User goal:** Understand how Conxa works, what data moves where, what policies govern use, and how to contact support before signing in.

**Status:** Public marketing route group; does not require Clerk auth. Includes a Claude automation docs page for LLM/search discoverability around Claude Desktop, MCP, local execution, and browser workflow automation.

---

### 3.1.2 Pricing Page (`app/(marketing)/pricing/page.tsx`)

**Path:** `/pricing`  
**Purpose:** Added 2026-08-08 for the capability-ladder repositioning (`docs/PRD.md` §11). Public,
unauthenticated. Renders `PricingTable.tsx`, which fetches `GET /api/v1/subscriptions/plans` client-side
(TanStack Query) and shows the four tiers as cards — Pro carries a "Distribution channel" ribbon,
matching the pricing sheet the restructuring was based on. Feature lists come straight from the API
response, itself derived from `PLAN_LIMITS`, so the page cannot show a number that isn't actually
enforced.

**One component, two hosts (2026-08-12).** `PricingTable` takes a `compact` flag. `/pricing` renders it
without: full cards plus the four explainer columns (compile credit, unlimited runs, model access by tier,
Human Edit credit). The homepage renders it with `compact`: the same four live tiers, but the explainer
columns are replaced by a "Compare every tier in full" link back here, so the homepage doesn't carry the
whole billing FAQ. **Do not fork the component** — the prices and feature strings are server-generated,
and a second copy drifts from the backend the day either changes. Both hosts share the TanStack query key
`['public-plans']`, so a visitor moving from `/` to `/pricing` costs no extra request.

**Two bugs fixed 2026-08-12** while verifying the homepage rebuild, both of which had shipped with the
original pricing page:

- `/pricing` was never added to `proxy.ts`'s `isPublic` route matcher, so Clerk middleware redirected
  every anonymous visitor to `/sign-in` — from the nav link, the footer, and the `sitemap.xml` entry the
  same commit added. The page was public in intent and in its static build output, but not in routing.
- `_plan_features` rendered Enterprise's numeric limits literally. Enterprise carries `0` in `PLAN_LIMITS`
  as a sentinel meaning "agreed per contract" (the real values live in billing metadata as contractual
  overrides), so the public card advertised "0 seats", "0 machines" and "0K Human Edit tokens". `0` now
  renders as contract language. Anything that formats a plan limit for display must handle this sentinel.

Also 2026-08-12: a feature the tier *withholds* ("No ops dashboard", "No analytics retention") now renders
with a muted dash instead of a cyan tick — a tick beside a negative statement read as "included".

**Status:** Implemented and linked from the marketing nav and the homepage. Loading/error states covered
(skeleton cards, inline error banner). Not yet built: a dedicated Enterprise "contact us" form (routes to
`/docs/support` instead) and inline plan-comparison tooltips explaining each capability row.

---

### 3.2 Operations Dashboard (`app/(protected)/dashboard/`)

**Purpose:** The enterprise AI-operations control center — the landing surface after login.
**Inputs:** Clerk auth context; `?range=` in the URL (`24h` / `7d` / `30d` / `90d`).
**User goal:** Answer, in order — is the platform healthy, what needs attention, what is running now, which workflows are slipping, is self-healing keeping up, and what is this worth.

**Structure (2026-08 redesign).** One sidebar entry, five routes behind a sub-navigation tab row. The range picker and refresh live in the shared shell (`src/dashboard/DashboardShell.tsx`) and the selected range is held in the URL so a link shows the recipient the same window.

| Route | Answers |
|---|---|
| `/dashboard` | Health score + factors, KPI strip, execution trend, live activity, insights, risk queue, ROI summary |
| `/dashboard/workflows` | Per-skill volume, success rate + period delta, p50/p95, version comparison, fleet topology, failure codes |
| `/dashboard/workflows/[company]/[slug]` | Step-level reliability, version breakdown, recovery cascade, recent runs |
| `/dashboard/healing` | Recovery cascade Sankey, tier ladder, reliability heatmap, drift queue, assertion health |
| `/dashboard/impact` | Hours saved, value returned, measured reliability counts, editable ROI assumptions |
| `/dashboard/runs/[company]/[runId]` | One execution step by step, with the recovery tier that resolved each step |

**Prior state.** The dashboard was a single 631-line page (`src/DashboardPage.tsx`, now removed) with six metric tiles, a hand-drawn bar chart, and four ranked lists. It answered "what broke" but not whether the platform was healthy, which workflows were degrading, or what any of it was worth. Its sections were re-homed: risk queue → Overview, recovery/assertion/drift panels → Self-healing, trend → the shared `TrendChart`.

**Design decisions worth keeping.**
- **KPIs are one divided strip, not a tile grid.** Five boxed hero-metric cards is the marketing reflex; a strip with hairline dividers reads as one instrument panel. Each cell carries value, sparkline, and a delta against the prior equal period, with per-KPI `direction` so a rising failure count is never painted green.
- **Health score is decomposed on screen.** The arc is the headline; the five weighted factors (success rate, assertion pass rate, drift resistance, zero-token healing, runtime freshness) are listed beside it with their own values and contributions. A score nobody can decompose is a score nobody acts on. No telemetry yields `score: null` / grade "No telemetry" — never a red zero for a workspace that has done nothing wrong.
- **Section headings are questions.** "Where does recovery spend its budget?" rather than "Recovery" — each panel states the job it does.
- **Estimates are visibly separated from measurements.** Hours saved depends on an admin-supplied minutes-per-run baseline (telemetry has no such signal); it renders beside the assumption that produced it, with an inline editor, and is tagged "Estimate". Counts derived purely from telemetry are tagged "Measured".
- **Insights are rule-derived, never model-generated.** Each carries the metric behind it and links to the evidence.
- **Chart palette is separate from the status palette** (`--chart-1..4` plus an "Other" slot, `--tier-1..4`, `--heat-0..4` in `src/index.css`). A series painted emerald would read as "healthy" when it only means "workflow 4". Four categorical hues, not six — six do not survive the all-pairs colour-vision check on this surface.

**Visualizations** live in `src/components/viz/`: `Sparkline`, `TrendChart` (stacked outcome bars), `HealthArc`, `TierLadder`, `RecoverySankey` (d3-sankey), `Heatmap`, `FleetTopology` (deterministic radial layout — never force-directed, so nodes stay where the operator left them), `ExecutionFlow`. d3 supplies layout maths only; all markup is local so theming stays in the design system.

**Assertion health (2026-07, post-condition validation):** sourced from `assertion_health_by_step` (`app.services.tracking._assertion_health_by_step`, aggregating the runtime's `verify_result` event). Steps worst-pass-rate-first with a pass-rate bar (green ≥95%, amber ≥80%, red below), check count, and advisory-failure count — the fleet-wide early warning for an assertion decaying before it becomes a hard step failure. Now lives on `/dashboard/healing`.

---

### 3.3 Skill Packages Page (`app/(protected)/packages/page.tsx`)

**Purpose:** List all published skill packages per company.
**Inputs:** Clerk auth.  
**Outputs:** Skill Package cards (one per company_slug) with status (idle/building/error), latest published version, installer version, build/update timestamp, and navigation to version history.
**User goal:** Find a published skill package and review its version history or installer downloads.

**Note:** A skill package is workspace-scoped and company-scoped — one per workspace/company pair. All workflows targeting that company/slug compile together into this single package, not individual packages per workflow.

---

### 3.4 Skill Package Versions Page (`app/(protected)/packages/[slug]/page.tsx`)

**Purpose:** Version history and installer release management for one skill package.
**Inputs:** Company slug (not workspace ID — derived from the authenticated workspace context).
**Outputs:** Skill package versions (release notes, publish timestamp, skill list, file count), installer versions (if any) with download buttons, and version-specific metadata.
**User goal:** Audit release history, download previous versions, compare versions.

**UX issues:**
- No filter by status (ok/fail).
- No drill-down from run summary to individual step events.
- No time range filter.

---

### 3.5 Compile Page (Cloud) — removed

**Purpose (historical):** Trigger re-compilation of a published workflow. This route (`app/(protected)/plugins/[id]/workflows/[workflowId]/compile/page.tsx`) never had working functionality behind it — cloud compilation is **not implemented** (cloud has no compiler, see CLAUDE.md's "cloud does not compile or execute" invariant) — and the placeholder file itself no longer exists on disk after the 2026-08-12 `/plugins` → `/packages` rename. Recompiling a workflow remains a Build Studio–only action (§2.8).

---

### 3.6 Billing Page (`app/(protected)/billing/page.tsx`)

**Purpose:** Subscription management via Cashfree.  
**Inputs:** Plan selection.  
**Outputs:** Checkout readiness, plan tier, and workspace usage meters.
**User goal:** Upgrade or manage subscription.

**Meter behavior:** Shows all four customer meters first: seats, machines, compile credits, and Human Edit pool (`installer slots` renamed/removed 2026-08-08 — see `docs/PRD.md` §11). Account timing and checkout state live in the Billing Operations panel rather than top summary cards. The panel shows active plan and Usage reset only; Usage reset uses the Cashfree monthly payment/renewal timestamp, and the separate Billing period end row is not shown.

**UX issues:**
- No invoice history.
- **Not yet built (2026-08-08):** a trial countdown banner (backend already exposes `trial_ends_at`/`trial_expired` on `GET /entitlements/current` — nothing in this page consumes them yet), a purchase/cancel control for the compile-credit add-on (`credits_addon_25`, backend supports it end-to-end via `/subscriptions/create`), and a device list + revoke control for the `machines` meter (backend: `GET/POST /entitlements/machines[/revoke]`). Tracked in `TODO.md`.

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

**Not yet built (2026-08-08):** an Enterprise BYOK panel for configuring the workspace's own Azure
OpenAI deployment. The backend is complete and independently usable
(`PUT/GET/DELETE /api/v1/workspace/llm-key`, `docs/TRD.md` §13.5) — this page just doesn't surface it
yet. Tracked in `TODO.md`.

---

### 3.9 Audit Page (`app/(protected)/audit/page.tsx`)

**Purpose:** Dedicated enterprise audit trail for workspace activity.
**Inputs:** Clerk auth context and `GET /api/v1/audit-events`.
**Outputs:** Summary counters, actor/resource coverage, latest event status, searchable and action-filtered audit table, metadata preview, and CSV export of the filtered result set.
**User goal:** Review who performed operational actions, when they happened, and which workspace resources were affected.
**Status:** Implemented as a protected route with a sidebar entry directly below Skill Packages.

---

### 3.10 Sign-In / Sign-Up

**Paths:** `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`  
**Purpose:** Clerk-hosted auth UI embedded in Next.js.  
**Status:** Standard Clerk Next.js integration.

---

## 4. Navigation Structure

### Build Studio

One button per stage of the Workflows -> Human Edit -> Test Skill -> Publish
Skill Package -> Build Installer flow (2026-08 Workflow Groups redesign),
replacing the earlier Record-centric sidebar (Record/Dashboard/Plugins/etc).
The Workflows page (a grid of Workflow Groups) is the primary landing page
and entry point for all recording/editing. **Compile has no sidebar entry or
standalone page** — it lives only on the `WorkflowStageRail` on each workflow's
row on its group's page. **There is no per-workflow detail page** (removed
2026-08-13) — every action a workflow needs lives on its group's page.

```
AppChrome (layout)
├── Sidebar
│   ├── Workflows (WorkflowListPage.tsx — app home and default route: browse/
│   │   create groups; §2.3)
│   │   └── [Group ID] (GroupPage.tsx — group's apps + auth, and every workflow's
│   │       full lifecycle rail (record/compile/review/test/ready-to-package)
│   │       inline per row; create/search/delete workflows here; §2.3a)
│   │       └── /compile/[sessionId] (CompileProgress — live compile drill-in,
│   │           reached from a workflow row's Compile/Recompile rail node)
│   ├── Human Edit (HumanEditListPage.tsx — compiled workflows, needs-review-first,
│   │   → /edit/[skillId] HumanEditPage.tsx, the per-skill editor — see §2.7)
│   ├── Test Skill (TestSkillPage.tsx — test workflows, gated by RunGateDialog)
│   ├── Publish Skill Package (PublishPage.tsx — primary release action: workspace-scoped)
│   ├── Build Installer (BuildInstallerPage.tsx — secondary/optional, requires a published release)
│   └── Settings
└── WindowTitleBar (custom Electron title bar)
```

`/`, `/record`, `/plugins`, `/build`, and unknown routes all redirect to `/workflows`:
the Record page was removed (2026-08); all its controls are inline on the Group Page's
workflow rows. `/workflows/:workflowId` (the old per-workflow detail route) now redirects
to the workflow's owning group — kept only so existing deep links, the compile page's
"← Back", and Human Edit's `?from=` still resolve. The Workflow List page is the home for
group management. Build Installer is secondary and only offered after a skill package is
published.

### Cloud Dashboard

```
(marketing)/
├── / (landing page)
├── /docs
│   └── /docs/[slug]

(protected)/  [requires Clerk auth]
├── /dashboard
├── /packages
│   └── /packages/[slug]
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
3. Creates first workflow (name + URL).
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
2. Navigates to existing workflow.
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
| ~~Workflow status~~ | ~~No pipeline visualization~~ | **Resolved 2026-07** — `handlers/status.py::derive_workflow_stage` + `StagePath`/`WorkflowStageBadge` replaced the three separate, inconsistent status fields with one derived stage rendered consistently across the workflow page and every stage page |

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

**Partially resolved 2026-07:** Skill Pack Publishing (§2.11) now shows a full release history (version, release notes, publish timestamp, `is_latest`) — that's the primary changelog surface now, per the redesign making skill packs the version-controlled artifact. Pure installer-build history (the backend has always tracked `installer_versions__{slug}` and served it at `GET /api/v1/workflows/{slug}/installer/versions`) is still not surfaced as a UI list on the Build Installer page itself — see Recommended Improvement #10.

### 7.7 Multi-SkillPack Build

A workspace can publish under many distinct company slugs (e.g. an agency running several clients), each with its own skill pack — there is no batch build/publish flow across them. Each company's skill pack must still be built and published individually.

### 7.8 Test Results Persistence

Test results (`last_test_status`, `last_test_error`) are saved to the workflow model but not surfaced prominently in the workflow list or dashboard.

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

`require_admin` is now enforced on publish, workflow create/delete, and bundle-release routes (`app/services/rbac.py`; Implementation-Plan §1.6). Fine-grained per-skill ACLs and a read-only analyst role for enterprise customers are still open — Phase 3, tracked in `TODO.md`.

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

10. **Installer version history.** Store installer builds with version, date, sha256 and show them in a list on the Build Installer page. (The backend has carried `GET /api/v1/workflows/{slug}/installer/versions` — now also `.../{installer_version}/{slug}/installer/versions` — since before this note was written; still not surfaced as a UI list on Build Installer. Still open.)

11. ~~**Publish without installer rebuild.**~~ **Resolved 2026-07.** Publish Skill Package (§2.11) publishes the updated skill pack directly via `cmd_publish_skill_pack`; Build Installer is now a fully separate, optional, secondary action gated on a release already existing. The runtime's delta sync handles delivery with zero installer rebuild.

12. **Execution dashboard widget in Build Studio.** Embed a mini execution dashboard in the Build Studio showing the last 10 runs across every workflow in the workspace, fetched from the Cloud API.
