# TODO — Conxa Project Backlog

This is the single prioritized backlog for Conxa, spanning documentation, architecture, and every
subsystem. It was assembled from a full 2026-07 documentation audit that cross-checked every doc in
`docs/` and `research-analysis/` (~85 files) against the actual codebase, then extended in a second
pass to pull in the business-strategy, go-to-market, ops, and edge-case-reliability documents that
the first pass had only summarized without mining for concrete action items.

**This file is organized by priority (P0 → P3), not by subsystem.** Each item still carries a
**Category:** field showing which part of the platform it belongs to (Product Strategy, Documentation,
Architecture, Builder, Runtime, Cloud, MCP, Execution & Recovery, Auto Updates, Testing & Cleanup,
Advanced) — use that to find everything in one subsystem, or just read top-to-bottom for "what's most
important." Within each priority tier, items are grouped by category in that same order, so related
items still sit near each other. Item IDs (`PROD-`, `DOC-`, `ARCH-`, `BUILD-`, `RT-`, `CLOUD-`, `MCP-`,
`EXEC-`, `UPD-`, `TEST-`, `ADV-`) are unchanged from earlier versions of this file, so cross-references
between items ("depends on EXEC-1") still resolve regardless of which priority section an item is in.
Enterprise-readiness work (RBAC/SSO/tenant isolation, the IT admin console, SOC 2/ISO 27001) doesn't
get its own category — it's tracked under **Cloud** (`CLOUD-1`) and **Product Strategy** (`PROD-9`,
`PROD-10`).

**How this relates to other planning docs:**
- [`docs/Implementation-Plan.md`](docs/Implementation-Plan.md) is the engineering-detail record of what's *already shipped* (Phase 1/2, with file-level "what was built" write-ups). This file is what's still *open*.
- [`docs/Sales-Blockers.md`](docs/Sales-Blockers.md) is the sales-framed subset of the near-term items here that block enterprise contracts.
- [`docs/Security.md`](docs/Security.md) is the numbered security-gap tracker (SG-01…); several items below are drawn from its still-open gaps.
- [`research-analysis/06-execution-plan/master-recommendations.md`](research-analysis/06-execution-plan/master-recommendations.md) is the deeper research backing (Source/Problem/Gains/ROI) for the architecture-level items in the Execution & Recovery, Builder, Cloud, and MCP categories below — read it for the *why*, this file for the *what's left and in what order*.
- [`research-analysis/conxa-critical-analysis.md`](research-analysis/conxa-critical-analysis.md) and its companion [`research-analysis/conxa-solutions-by-problem.md`](research-analysis/conxa-solutions-by-problem.md) are the deeper backing for the Product Strategy category below.
- [`research-analysis/05-reliability/top-50-improvements.md`](research-analysis/05-reliability/top-50-improvements.md) and [`research-analysis/06-execution-plan/build-order.md`](research-analysis/06-execution-plan/build-order.md) are the deeper backing for the added Execution & Recovery items.

**How to use this file:** when you complete an item, mark it done in place — strikethrough the title, add a resolution date and a one-line note — matching the pattern used in `docs/Sales-Blockers.md`/`docs/Security.md`. Don't delete completed items; a backlog with no history of what's been closed is less useful than one that shows velocity. When you discover new open work during a task, add it here rather than leaving it undocumented.

**Priority legend:** P0 = blocking or foundational, do first. P1 = high value, do soon. P2 = valuable, sequence around other work. P3 = low urgency, opportunistic.
**Complexity legend:** S = hours. M = ~1-3 days. L = ~1-2 weeks. XL = multi-week, likely needs its own sub-plan.
**`[DECISION]`** marks items that need a maintainer/founder answer before engineering work can be scoped — don't treat these as already-scoped tasks.
**`[UNVERIFIED]`** marks items sourced from the research corpus that were *not* individually confirmed against current code (unlike the rest of this file, where every "still open" claim was grep/read-verified) — do a quick check before starting in case it's already been shipped since the source doc was written.

---

## P0 — Blocking / Foundational (2 items)

### PROD-3 — Safe-action system (Strict Mode, entity binding, dry-run, compensation flows)
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** A five-layer safety system for the "a wrong click can succeed silently, and there's no undo" risk: (1) label every step by danger class (read-only / reversible / irreversible) at recording time; (2) **entity binding** — tie the actual click target to the specific record it should act on (e.g., "the Delete button in the row containing Invoice #12345"), not just "a" Delete button, so recovery can never substitute the wrong row; (3) on irreversible steps, disable "find something close" recovery entirely — refuse to guess, optionally confirm before acting; (4) order recorded workflows so the one irreversible action is the last step, and offer a true dry-run (everything except the final click); (5) offer compensating-action "cleanup" workflows (e.g., "cancel the draft invoice") as Conxa's answer to "there's no real undo." Also productize the existing recovery-ceiling switch as a named, customer-facing "Strict Mode," and publish a measured per-skill safety score ("0 wrong actions in 12,400 runs") rather than an unmeasured claim.
- **Why required:** this is described in the source material as the single hardest safety question in the whole business-risk review, explicitly delegated by the founders to Fable to design because of that. Without entity binding specifically, a recovery mechanism that finds "a close-enough" element on the wrong row is a real, previously-identified failure mode (this is the same failure class the research corpus's gap-analysis G5/top-50-improvements #3 already partially addresses via live uniqueness scoring — entity binding is a further, data-aware refinement on top of that).
- **Business value:** this is what makes the "deterministic, auditable, provably safer than a human operator" pitch to finance/HR/payroll teams actually true rather than aspirational — described as unlocking those verticals specifically.
- **Technical value:** builds on already-shipped machinery (the recovery-ceiling env var, `IdentityBundle` scoring) rather than starting from nothing; the dry-run capability is also a prerequisite for making PROD-1's first-run calibration completely side-effect-free.
- **Dependencies:** benefits from EXEC-1 (conditional steps, since dry-run needs a way to skip the final committing action cleanly).
- **Suggested order:** high priority, in parallel with EXEC-1 — this is a P0 in the source ranking specifically because it's what makes selling into destructive-action workflows (finance, HR, payroll) safe at all.
- **Complexity:** L — the individual mechanisms (danger labeling, entity binding, dry-run, compensation workflows) are each moderate, but the combination touches the compiler, the recorder, and the runtime.
- **Success criteria:** a skill with a destructive final step cannot act on the wrong record even when recovery is invoked; a per-skill safety score is tracked and shown; a dry-run mode exists that never performs the final irreversible action.

### EXEC-1 — Conditional / branch steps in the skill format
- **Category:** Execution & Recovery
- **Description:** Add `if_present(selector)→steps`, `try_dismiss`, and `wait_for_one_of` branch primitives to the skill-spec schema and the runtime executor, so a compiled skill can handle "this element sometimes appears" states — cookie/consent banners, session-expired interstitials, optional MFA, A/B-tested variants — instead of treating every such case as a hard failure that escalates to Tier 3/4 recovery. Confirmed unbuilt via zero grep hits for these concepts in `run.js` or `skill_spec.py`.
- **Why required:** this is the single largest confirmed-unbuilt gap identified across the entire research corpus (flagged independently in `research-analysis/02-conxa-assessment/gap-analysis.md` G6, `research-analysis/03-insights/master-insights.md` #7/R4, `research-analysis/06-execution-plan/master-recommendations.md` R6, and top-50-improvements.md #6). Per the WorkArena research this corpus cites, this class of interstitial affects an estimated 30–50% of real-world page loads — meaning a meaningful fraction of current Tier 3/4 recovery escalations are likely a missing core primitive being misdiagnosed as selector drift, not genuine site redesign.
- **Business value:** directly reduces false escalations to paid Tier 3/4 LLM recovery (a customer-visible cost, since recovery tokens are billed to the customer's own Claude usage) and reduces skill flakiness — flakiness is a stated sales/reliability concern, not a cosmetic one.
- **Technical value:** this is a schema-and-executor-level primitive that other items depend on — RT-2's conditional-state capture and (per the research corpus) the intent graph's `decision_points` both need this to exist as a target representation before they're worth building.
- **Dependencies:** none upstream — this should be the first item tackled among execution/recovery work. RT-2, EXEC-5's dismiss-known-pattern library, and PROD-3's dry-run capability all depend on it.
- **Suggested order:** first item to tackle among all execution & recovery items (EXEC-2 through EXEC-8) and ahead of RT-2.
- **Complexity:** XL — touches `packages/conxa-core/conxa_core/models/skill_spec.py` (new step-type schema), `conxa_compile` (recorder/compiler emission of the new step types, likely requiring new recording-time signal capture — see RT-2), and `runtime/run.js` (new branch-evaluation logic in the execution loop), plus new `gate_replay.js`-style CI fixtures exercising the three primitives.
- **Success criteria:** a recorded workflow containing a cookie-banner dismissal replays correctly whether or not the banner appears on a given run; `runtime/test/` gains passing tests for `if_present`, `try_dismiss`, and `wait_for_one_of`; the CI execution gate (see ARCH-2) includes at least one fixture exercising a conditional branch.

---

## P1 — High Value, Do Soon (12 items)

### PROD-1 — Per-tenant reliability: first-run calibration + persistent repair memory
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** Two combined mechanisms for the "a skill recorded on one account may not work on another customer's account" risk. (1) **First-run calibration:** before a skill's first real run on a new customer's account, quietly walk through it in a safe, no-changes way — confirm each target actually exists, learn local-language labels, take fresh screenshots, and flag likely plan/permission differences *before* the customer hits a failure. (2) **Persistent repair memory:** after a validated repair, remember it in a local, per-account adjustment layer (the signed pack itself is never modified) instead of re-paying the same LLM repair cost on every subsequent run.
- **Why required:** a skill compiled against the vendor's own demo account routinely meets different labels, permissions, and available screens at each customer — described as "genuinely works but needs the real-world proof" in the source doc, and flagged there as the #1 priority test in the whole business-risk review.
- **Business value:** first-run success rate is described in the source doc as "the number the thesis lives on" — this is what makes that number controllable rather than a roll of the dice per customer.
- **Technical value:** the repair-memory half directly attacks recovery cost: the source doc estimates a workflow with 2 weak steps drops from ~7,200 tokens *every run* to ~1,200 after the first repair, meaningfully increasing how many runs fit in a customer's Claude usage session.
- **Dependencies:** benefits from EXEC-1 (conditional steps, for handling permission-gated UI differences) and the resolver/scoring machinery already shipped (`resolver.js`, `selector_score.py`), which the source doc notes "already exists" for most of this.
- **Suggested order:** high priority — the source doc calls the real-world cross-account test "the #1 priority in the main report."
- **Complexity:** M — mostly wiring existing scoring/resolution machinery into a new pre-flight pass and a small local overlay store, not new core algorithms.
- **Success criteria:** a skill's first run on a new customer's account either succeeds cleanly or surfaces a specific, actionable pre-flight warning (not a mid-run failure); by the Nth run on that account, repair costs measurably drop toward zero.

### PROD-6 — Domain ownership verification at publish
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** Vendors can only publish skills for domains they've proven they own (a DNS TXT record or Search-Console-style verification), plus a signed "automation lane" identifier sent with every request so a vendor's own security team can recognize, rate-limit, and audit Conxa's traffic as their own labeled automation channel rather than unidentified bot traffic.
- **Why required:** addresses the "automating other companies' sites can violate ToS and trigger bot-blockers" risk. The source doc explicitly recommends shipping this *early*, before vendor sign-ups scale, since it's also what makes the "we only automate what the vendor owns" claim enforceable rather than just a policy statement — and it protects Conxa's own platform from being used against sites nobody in the transaction owns.
- **Business value:** removes the bot-blocker cat-and-mouse problem almost entirely by construction, and is a defensible answer to any legal/ToS question a prospect raises.
- **Technical value:** small, self-contained addition to the publish flow — a DNS-verification step plus a signed request header.
- **Dependencies:** none.
- **Suggested order:** early — small effort, and the source doc flags it as something that should gate publishing "before vendor sign-ups scale," implying urgency independent of its small size.
- **Complexity:** S.
- **Success criteria:** publishing a skill for a domain requires proof of ownership; every runtime request carries a signed automation-identification header a vendor's security team can recognize.

### PROD-11 — Skill health dashboard + fast re-record + "skill CI"
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** A live per-skill health score with drift alerts and a fast diff-based re-record/republish flow (target: under 15 vendor-minutes per republish), plus "skill CI" — since the vendor owns the target app, let them add a `conxa test` step to their own release pipeline that dry-runs all published skills against their staging environment on every deploy, so a redesign that would break a skill fails the *vendor's* build before it ever reaches customers.
- **Why required:** answers "teach once, run forever quietly becomes re-record after every redesign" — the maintenance cost that "less hassle than a connector" depends on actually being small. Skill CI specifically is described as something no traditional automation vendor can offer, since their customers don't own the target app and Conxa's do — it's called out as possibly Conxa's single most differentiated feature, "falling out of the vendor-automates-their-own-product model almost for free."
- **Business value:** makes the "maintenance is genuinely small" claim provably true rather than asserted, which is central to the whole "cheaper than building/maintaining a connector" pitch; skill CI in particular could make most redesign-breaks invisible to customers entirely.
- **Technical value:** the health-dashboard half overlaps with the already-shipped drift-detection queue (`GET /api/v1/tracking/{company}/drift`, Implementation-Plan §2.2) and with EXEC-2's fleet-flywheel work — this item is the vendor-facing UX and CI-integration layer on top of that existing detection mechanism, not a duplicate of it. Also overlaps `docs/UI-UX-Brief.md`'s existing "fast re-record" UI backlog item (see BUILD-2).
- **Dependencies:** builds on the existing drift-detection queue; benefits from EXEC-2's automation work for the "fast re-record" half to eventually become semi-automatic.
- **Suggested order:** high value — sequence alongside EXEC-2, since both work from the same underlying drift-detection signal.
- **Complexity:** L — the dashboard/re-record UX is moderate; the "skill CI" integration (a CLI tool the vendor's own CI calls) is a new, self-contained deliverable.
- **Success criteria:** a vendor can see per-skill health and drift status in the dashboard; a `conxa test` CLI step exists that a vendor can wire into their own build pipeline and that fails the build when a staging-environment change would break a published skill.

### DOC-1 — Keep the 2026-07 documentation audit's fixes from re-drifting
- **Category:** Documentation & Process
- **Description:** This audit fixed a large number of stale claims across `docs/`, root-level files, and `research-analysis/` (Razorpay→Cashfree references, contradictory delta-sync contracts, a broken `docs/agentic-discovery-strategy.md` path, a rewritten `Auth-and-Updater.md` §1.3 that no longer describes a nonexistent keytar-token-refresh mechanism, and more). None of this is self-enforcing — it can drift again exactly as it did before.
- **Why required:** the audit found docs that were stale for a month or more without anyone noticing, including internal self-contradictions within single files (`docs/TRD.md` said a gap was both open and resolved in two different sections).
- **Business value:** stale docs cost engineer-hours and erode trust in the doc set as a source of truth — several docs were found to describe removed files (`worker.py`, `Aptfile`) or reverted designs (V8 bytecode app layer) as if current.
- **Technical value:** a documentation set that's actually trustworthy is a precondition for AI coding agents (which read `CLAUDE.md`/`AGENTS.md` before every task) to make correct decisions without re-deriving context from code archaeology.
- **Dependencies:** none — this is a process item, not a code change.
- **Suggested order:** ongoing discipline, not a one-time task. Revisit at the next major milestone (e.g., after DOC-4 below ships, or at the next audit boundary).
- **Complexity:** S per touch-point, ongoing.
- **Success criteria:** `CLAUDE.md`'s "Maintaining the Docs" table continues to be consulted after significant changes (already-existing policy, now with FIX.md rotation and TODO.md maintenance rules added to it).

### ARCH-1 — Fix the `/api/v1` prefix violation in `tracking_routes.py`
- **Category:** Architecture
- **Description:** `conxa-cloud/backend/app/api/tracking_routes.py:35` defines `public_router = APIRouter(prefix="/api/tracking", ...)` and `main.py:133` mounts it with no additional prefix — so the runtime-facing telemetry ingest endpoint actually lives at `/api/tracking/{company}/events`, not `/api/v1/tracking/...`, silently violating the documented "all API routes live under `/api/v1`" Key Invariant. A code comment ("package-token ingest endpoint for runtimes") suggests this may have been an intentional stable-URL choice, but per a 2026-07-04 review this is being tracked as a genuine bug to fix, not accepted as a permanent exception.
- **Why required:** it's the one Key Invariant confirmed violated in code across the entire audit; any future infra change that assumes the invariant holds everywhere (a reverse-proxy rule, a WAF rule, a new API gateway) could silently break telemetry for every deployed runtime with no obvious symptom beyond missing analytics.
- **Business value:** protects a currently-invisible failure mode — telemetry loss wouldn't page anyone, it would just quietly stop showing up on the dashboard.
- **Technical value:** removes a documented-vs-actual inconsistency that will otherwise confuse the next engineer who greps for `/api/v1` expecting it to be exhaustive.
- **Dependencies:** none technically, but the fix must account for already-deployed runtime installers that may be hardcoded to POST at the current (wrong) path — this is a compat problem, not a one-line rename.
- **Suggested order:** early — low complexity, and several docs (`CLAUDE.md`, `docs/TRD.md` §17) now carry a note about this pending its resolution; resolving it lets those notes be cleaned up.
- **Complexity:** S for the code change itself (dual-mount old path with deprecation logging, or a 308 redirect); the actual work is the compat-risk assessment, not the diff.
- **Success criteria:** the canonical route lives under `/api/v1/tracking/...`; the old path either 308-redirects or is dual-mounted with a deprecation log line; `CLAUDE.md`'s Key Invariant note and `docs/TRD.md` §17's row are updated to reflect the fix.

### ARCH-2 — Re-enable the `gate_replay.js` CI execution gate
- **Category:** Architecture
- **Description:** `.github/workflows/build-runtime-app.yml` has the real-skill-replay execution gate (`runtime/test/gate_replay.js`) commented out with a note: "Execution gate (real replay against host exe) is temporarily disabled. Re-enable before shipping customer builds." This was discovered during this documentation audit — `CLAUDE.md`/`AGENTS.md` both previously (incorrectly) described this gate as actively running before every app-layer publish. `SHIP-GUIDE.md` already correctly flags it as disabled and recommends a manual pass in the meantime.
- **Why required:** this gate exists specifically because of a prior incident (documented at length in the FIX.md archive, `docs/archive/fix-log/FIX-2026-06.md`) where a packaged runtime shipped with a completely dead element finder — the build succeeded, started, and connected to MCP, but every click silently failed in production. `gate_replay.js` was built to make that class of failure impossible to ship un-caught again; right now it's not running, so that protection is currently just aspirational.
- **Business value:** prevents a repeat of exactly the kind of production incident that motivated building this gate in the first place — a silent, fleet-wide execution failure that ships successfully through every other check.
- **Technical value:** closes the gap between "CI is green" and "the runtime can actually click things," which is the whole point of an execution gate as opposed to a unit-test suite.
- **Dependencies:** none.
- **Suggested order:** do before the next customer-facing `app-v*` release; treat as a release blocker in the interim, matching `SHIP-GUIDE.md`'s current guidance to run it manually.
- **Complexity:** S–M — likely just uncommenting the step and confirming `runtime/test/gate-skill/` still passes against the current build output; could be M if the fixture needs updating for since-changed behavior.
- **Success criteria:** `build-runtime-app.yml` runs `gate_replay.js` on every push and fails the build on a broken element finder; `CLAUDE.md`/`AGENTS.md`/`SHIP-GUIDE.md` are updated to say it's active again.

### BUILD-1 — Compiler IR (CIR) + reproducible, pinned compiles
- **Category:** Builder
- **Description:** Introduce a diffable intermediate representation between recorded events and the final `SkillPackage` — a `.cir` artifact with a `cir_root_hash`, produced by a compile pinned to a specific model/prompt version so the same recording reliably produces the same package. Confirmed unbuilt via grep across `conxa_compile/` (no `.cir`, no `cir_root_hash`, no model-pinning anywhere).
- **Why required:** without a diffable IR, there's no way to do true rollback-to-identical-bytes, partial recompilation of just the changed steps, or a diff-driven repair-suggestion UX when a skill needs a targeted fix rather than a full recompile.
- **Business value:** unlocks safer, faster iteration on published skills — a customer-visible reliability and turnaround-time improvement once the durability flywheel (EXEC-2) can act on it.
- **Technical value:** this is the substrate multiple other items depend on — most notably EXEC-2 (fleet durability automation), which needs a diffable representation to generate targeted CIR patches rather than full recompiles.
- **Dependencies:** none upstream, but EXEC-2 depends on this.
- **Suggested order:** sequence before EXEC-2; it's foundational infrastructure, not a user-facing feature, so it can proceed in parallel with other execution/recovery items that don't depend on it (EXEC-1, EXEC-3).
- **Complexity:** XL — touches the compiler's core event→package pipeline, requires a new artifact format, versioning strategy, and model-pinning across the LLM router.
- **Success criteria:** compiling the same recording twice (same model/prompt version) produces byte-identical `.cir` output; a `cir_root_hash` mismatch is detectable and drives a defined resolution path (recompile vs. flag).

### CLOUD-1 — RBAC / SSO / tenant isolation (enterprise plumbing)
- **Category:** Cloud
- **Description:** Extend the current partial RBAC (`require_admin` enforced only on publish, plugin create/delete, and bundle-release routes) to per-skill ACLs and a read-only analyst role; add SSO/SAML (currently unbuilt — Clerk JWT only); replace `workspace_id` string-filtering in shared KV namespaces with real tenant isolation (Postgres row-level security or equivalent). This is the item that carries Conxa's enterprise-readiness work more broadly, alongside PROD-9/PROD-10.
- **Why required:** this is explicitly Phase 3 "Enterprise Readiness" scope per `docs/Implementation-Plan.md`, and enterprise buyers routinely require SSO and demonstrable tenant isolation as contractual/compliance gates, not nice-to-haves.
- **Business value:** gates enterprise revenue directly — this is named as a revenue-gating item in the research corpus's `master-recommendations.md` (R8) and in `docs/UI-UX-Brief.md`'s own UX audit (§8.5).
- **Technical value:** closes the gap between "RBAC exists" and "RBAC is actually granular and enforced everywhere it needs to be," and moves tenant isolation from a convention (string-filtering) to an enforced guarantee.
- **Dependencies:** none blocking, but MCP-1 (entitlement-filtered `list_skills`) depends on a more complete entitlements/RBAC model than exists today. Also related to PROD-9's IT admin console and PROD-10's SOC 2 work.
- **Suggested order:** can run in parallel with execution/recovery work — it's revenue-gated, not reliability-gated, per the research corpus's own sequencing recommendation.
- **Complexity:** XL — SSO/SAML integration, per-skill ACL model, and a real tenant-isolation migration are each substantial on their own.
- **Success criteria:** a read-only analyst role exists and is enforced; SSO/SAML login works end-to-end for at least one major IdP; tenant data isolation is enforced at the data layer, not just by application-level filtering convention.

### EXEC-2 — Fleet durability flywheel automation
- **Category:** Execution & Recovery
- **Description:** Complete the durability pipeline beyond its current detection-only state: automatic classification of a detected drift, a CIR-based patch suggestion (depends on BUILD-1), regression-gating the patch against a golden-corpus test suite, and canary rollout with auto-rollback on regression. Today, only the detection + admin-review half exists (`GET /api/v1/tracking/{company}/drift`, an admin-gated queue) — an admin still manually reviews and republishes every drift.
- **Why required:** the fleet-level drift-detection flywheel is identified across the research corpus (`research-analysis/03-insights/master-insights.md` L1/#1, `research-analysis/06-execution-plan/master-recommendations.md` R3, `research-analysis/06-execution-plan/cto-report.md`) as Conxa's single durable, structurally-uncopyable competitive moat — no single-tenant/local automation tool can replicate cross-customer drift intelligence. Right now that moat is only half-built: detection compounds with scale, but manual republishing doesn't.
- **Business value:** this is the mechanism that would let "workflows survive for years with no manual maintenance" become a real, delivered promise rather than a partially-automated one — directly load-bearing for retention and for differentiating against both legacy RPA (which requires manual maintenance) and agent-based competitors (which can't do fleet learning at all). Directly overlaps PROD-11's "fleet durability dataset" framing of the same mechanism from a business-value angle.
- **Technical value:** this is the compounding asset — more customers → faster drift detection → fresher packages → higher reliability → more customers — that the rest of the architecture is, per the research corpus, built in service of.
- **Dependencies:** depends on BUILD-1 (Compiler IR) for diffable, targeted patches rather than full recompiles; the admin-approval step (publishing is never automatic, per the existing design) should remain even once the rest is automated.
- **Suggested order:** after BUILD-1 lands; this is a large, multi-stage effort likely worth its own dedicated sub-plan once BUILD-1 is in place.
- **Complexity:** XL — classification logic, a CIR-patch-generation step, a golden-corpus regression suite, and canary-rollout infrastructure are each substantial; combined, this is likely Conxa's largest single remaining engineering investment.
- **Success criteria:** a drift detected on one customer's runtime is automatically classified, a patch is generated and regression-tested against a golden corpus, and — pending the existing admin approval gate — pushed fleet-wide, measurably faster than today's fully-manual review-and-republish cycle.

### EXEC-4 — `[DECISION]` Autonomous Tier-3 recovery design
- **Category:** Execution & Recovery
- **Description:** The originally-specced design for Tier 3 recovery was an invisible round trip: the runtime asks the host model directly via MCP sampling, the model describes-then-matches against the recorded intent, and the fix is applied with no human-visible interruption. What actually shipped is different and, in some ways, more elaborate: a host-delegated handoff with page-parking (`server.js:_parkedRecovery`) and `step_overrides` — the browser session survives the round trip to Claude Desktop and back, and the agent still reasons at the top level, but this is a visible resume-with-a-corrected-selector flow, not an invisible one.
- **Why required:** this is real, meaningful progress over the "screenshot and hope" model the original research corpus describes as the pre-existing state — but it's a materially different shape than the target design, and nobody has explicitly decided whether the current design is the accepted long-term approach or an interim step toward the original spec.
- **Business value:** affects how "self-healing" gets described to customers and prospects — the current mechanism is real and working, but oversells as "autonomous" if the shipped mechanism is actually agent-visible-and-resumable rather than invisible.
- **Technical value:** the answer changes how much further engineering investment (if any) goes into building the original invisible-sampling design versus polishing and formalizing the current page-parking approach.
- **Dependencies:** none technically; this is a scoping decision that should happen before further investment in either direction.
- **Suggested order:** early — resolving the decision avoids wasted effort in either direction.
- **Complexity:** M for the decision itself; XL if a full redesign toward the original invisible-sampling spec is chosen.
- **Success criteria:** a written decision exists (in `docs/TRD.md` §10 or a dedicated design note) stating which design is the accepted target, and any customer/marketing-facing description of "self-healing" is checked against that decision for accuracy.

### EXEC-5 — `[UNVERIFIED]` Action-correct interaction handler library
- **Category:** Execution & Recovery
- **Description:** A cohesive batch of specific-interaction handlers identified in `research-analysis/05-reliability/top-50-improvements.md` (Tier 1–2) and grouped together in `build-order.md`'s own build sequence: a typeahead/autocomplete handler (fill→wait-for-options→select-exact, #10); a custom-dropdown handler (open→wait→click-by-text, distinct from native `selectOption`, #15); a contenteditable/rich-text handler (focus+key events, since `fill()` silently no-ops on Quill/Slate/TinyMCE, #23); scroll-until-found for virtualized lists addressed by stable id, not position (#12, ag-grid/react-window rows that aren't in the DOM until scrolled to); a hover-gated action group with re-hover recovery for menus that close on blur (#13); a post-navigation stale-DOM guard that aborts if URL/focus changed mid-action (#14); a lazy-load bounded scroll-to-load loop (#25); re-resolving moving/reordering rows by stable id rather than position (#26); download verification (file exists/size/type, #31) and upload verification (input populated/preview shown, #32); a date-picker handler (typed input vs. day-cell navigation, #33); and new-tab/new-window landed-context verification so an action can't silently execute in the wrong window (#43).
- **Why required:** these are exactly the "the recorder captured it as a generic click/fill, but the real interaction needs specific handling" cases that WorkArena-style enterprise SaaS workflows are full of — build-order.md groups these as the second wave of work (right after conditional steps land), since they're each individually well-understood, mostly zero-token, ports of proven mechanisms rather than open research questions.
- **Business value:** each handler individually closes a specific, previously-identified failure mode that would otherwise either silently no-op (contenteditable, downloads, uploads) or escalate unnecessarily to paid LLM recovery.
- **Technical value:** these are the kind of "boring, deterministic engineering" fixes the research corpus repeatedly emphasizes as higher-leverage than any AI-based recovery improvement — 11 of these 12 items are zero-token.
- **Dependencies:** should follow EXEC-1 (some handlers, e.g. dismissing an interstitial before typeahead search, compose naturally with conditional steps); benefits from RT-2's recording-depth work to capture which handler a given step needs at compile time rather than inferring it at runtime.
- **Suggested order:** immediately after EXEC-1, per `build-order.md`'s own sequencing ("build second — depends on the verified floor").
- **Complexity:** L — each handler is individually small-to-medium, but there are 12 of them; treat as a batch of related PRs rather than one large one.
- **Success criteria:** each handler has a passing `runtime/test/` fixture demonstrating the specific failure mode it fixes (e.g., a Quill editor step that would previously no-op now succeeds); none of these require an LLM call.

### UPD-1 — True skill-pack cryptographic signing
- **Category:** Auto Updates
- **Description:** Today, only the runtime/app *update manifest* is Ed25519-signed (`manifest_signer.py`, verified by `runtime/manifest_manager.js`). Individual skill packs still rely on the bearer `sync_token` model (per-company, minted at publish time, embedded in `pack.json`) rather than a publisher signature over a per-pack Merkle manifest, as originally specced in the research corpus's `04-architecture/07-skill-pack.md` Part 2.
- **Why required:** the sync token is a read-only, single-company-scoped bearer secret — reasonable as a low-severity accepted tradeoff (see `docs/Security.md` SG-08, `docs/TRD.md` §17), but it's not a cryptographic signature, meaning skill-pack authenticity/integrity relies on transport auth rather than a verifiable publisher signature the way the update manifest now does.
- **Business value:** strengthens the supply-chain story for the distributable skill-pack artifact, which the research corpus identifies as a real differentiator (a signed, versioned, licensable artifact competitors built around live agents don't have an equivalent to).
- **Technical value:** brings skill-pack integrity guarantees up to the same standard already established for the runtime/app update manifest, closing an inconsistency between the two.
- **Dependencies:** benefits from BUILD-1 (Compiler IR) for a natural per-pack content hash to sign over, though it isn't strictly blocked by it.
- **Suggested order:** can proceed independently of BUILD-1, but is more natural once a CIR-based content hash exists.
- **Complexity:** L — signing key management, a per-pack Merkle manifest format, and updating both the publish flow and the runtime's verification path.
- **Success criteria:** a published skill pack carries a publisher signature the runtime verifies before installing, independent of (in addition to) the existing bearer sync-token auth.

---

## P2 — Valuable, Sequence Around Other Work (17 items)

### PROD-2 — Recordability pre-check (green/yellow/red compile-time score)
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** A score shown during/after recording indicating how automatable the target product actually is, based on how dynamic/generalizable its screens are across accounts.
- **Why required:** turns "products that are too dynamic per-customer are out of scope" from an informal policy into a measurable, shown-to-the-vendor gate — the source doc frames this as preventing "the worst early-company event: a paying customer whose product was never going to work."
- **Business value:** avoids selling into accounts that will produce bad first impressions no matter how good the runtime is — protects both revenue (churn) and reputation.
- **Technical value:** small, self-contained addition on top of existing compile-time signal quality checks (`selector_filters.py`'s anchor-quality gates already compute something adjacent).
- **Dependencies:** none blocking.
- **Suggested order:** early, alongside PROD-1 — cheap and directly protects the same risk.
- **Complexity:** S.
- **Success criteria:** recording a workflow against a known-dynamic product surfaces a visible yellow/red warning before the vendor invests further in it.

### PROD-4 — Session keeper + vendor-controlled long-lived sessions
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** Detect a dead login *before* a skill's first step runs (not mid-run), and prompt for re-login up front rather than failing partway through. Separately, since Conxa's customers own the software being automated, let a vendor configure longer-lived, device-locked sessions specifically for their own automation traffic — no MFA circumvention, just the app owner setting a sensible policy for their own runtime.
- **Why required:** expired logins and MFA are named as the biggest practical interruption to scheduled/overnight runs; the source doc frames this as "an accepted design, not a gap to engineer around" for attended use, but a real gap for unattended runs specifically.
- **Business value:** directly extends how "hands-off" the overnight/unattended pitch can honestly be — today it's capped by session lifetime.
- **Technical value:** the session-keeper half is a small, self-contained pre-flight check; the vendor-controlled-session half requires the vendor's own cooperation (a config choice on their end), not new Conxa infrastructure.
- **Dependencies:** none blocking.
- **Suggested order:** moderate priority — meaningfully improves the unattended/overnight-run story without being a blocker to any current sale.
- **Complexity:** M.
- **Success criteria:** a dead session is caught and surfaced before a scheduled run begins, not mid-run; at least one design-partner vendor has configured a longer-lived session for their own automation traffic.

### PROD-5 — Standalone launcher/scheduler + parallel execution + runner-machine profile
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** A small Conxa tray app / CLI tool with a built-in scheduler, so Conxa can run skills entirely on its own — every chat app (Claude, ChatGPT, Cursor) becomes an optional front door rather than a dependency. Combine with running several isolated browser sessions per machine (3–5 in parallel) and a documented "runner machine" profile (always-on VMs, never sleep, stay logged in) so a customer can reach thousands of runs/day on their own hardware — this is explicitly the same model established automation vendors (e.g., UiPath) use, so enterprises already trust it. Add one scheduling rule: never run two skills against the *same* target application at once (to avoid them tripping over each other), while freely running different apps in parallel.
- **Why required:** addresses two risks at once — "everything depends on Claude Desktop being open" and "execution is slow and one-at-a-time per computer." Both are described as largely solvable with straightforward engineering, not research.
- **Business value:** unlocks the "thousands of runs a day" and "runs while you sleep, no chat window open" pitches that current single-session, chat-app-dependent execution can't support — while keeping the "cloud never touches customer data" property intact, since runner machines belong to the customer.
- **Technical value:** removes a real architectural dependency (needing a chat app running) and turns Conxa into something that can be pointed at by *any* MCP-capable agent as one optional entry point among several (see MCP-2/MCP-3, which build on the same "Conxa doesn't need Claude specifically" thesis).
- **Dependencies:** the same-app-serial/different-app-parallel scheduling rule should land alongside this, not after.
- **Suggested order:** moderate priority — valuable expansion, not gating any current sale.
- **Complexity:** L — a new standalone process, a scheduler, parallel session management, and the conflict-avoidance rule are each real engineering, though none individually large.
- **Success criteria:** a workflow runs on a schedule with no chat application open at all; a documented runner-machine setup demonstrably reaches several hundred to thousands of runs/day without customer data leaving their own machines.

### PROD-9 — Trust & GTM: open-source safety-critical runtime code + security whitepaper + IT admin console
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** Publish a short security whitepaper making explicit that customer data never touches Conxa's cloud during execution; open-source the safety-critical parts of the runtime (element-finding, recovery, session encryption) so a security team can read the actual code instead of trusting a claim; and give enterprise IT an admin console showing what's installed where, with a remote kill switch and a proper enterprise install package.
- **Why required:** answers "company IT departments will distrust the installer" beyond what code signing alone fixes (signing answers "who made this," not "what does it do," and security teams judge both).
- **Business value:** flips the IT security conversation from "prove you're not malware" to "here's the source code and here's your off-switch" — described as a much stronger position for enterprise deals specifically.
- **Technical value:** Conxa's actual differentiated value lives in the compiler, the fleet data, and distribution — not in the runtime's element-finding/recovery code — so open-sourcing that part is framed as low-cost from a competitive-moat perspective.
- **Dependencies:** the admin console/kill switch overlaps with CLOUD-1's enterprise plumbing (RBAC/tenant management) — sequence together if convenient.
- **Suggested order:** alongside CLOUD-1 and UPD-2/UPD-3 (the broader enterprise-trust cluster).
- **Complexity:** L — open-sourcing requires care about what's actually safe to publish; the admin console with a kill switch is a real new feature.
- **Success criteria:** the safety-critical runtime modules are published as open source with a whitepaper explaining the security architecture; an IT admin can see installed machines and remotely disable one.

### PROD-10 — SOC 2 / ISO 27001 + enterprise packaging
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** SOC 2 Type I then Type II (or ISO 27001 for non-US buyers, ~80% overlap with SOC 2, same compliance platforms), plus MSI/Intune-style enterprise install packaging, SSO/per-device identity with remote revocation, and replacing the shared per-company sync token with per-device identity (today, one leaked installer is a company-wide token leak — flagged as the first finding any serious security review will surface).
- **Why required:** gates the enterprise segment specifically; the source material notes Conxa has a real scoping advantage here since the cloud is deliberately thin (customer execution/data never touch it), making the audit boundary — and cost — smaller than a typical SaaS company's.
- **Business value:** directly opens the enterprise segment; a known, bounded cost and timeline (~$15–40k first year, SOC 2 Type II ~6–12 months) rather than an open-ended unknown.
- **Technical value:** the per-device-identity replacement for the shared sync token is a real security improvement independent of the compliance certification itself, and relates to CLOUD-1's tenant-isolation work.
- **Dependencies:** benefits from CLOUD-1 (RBAC/tenant isolation) landing first, since SOC 2 audits typically examine exactly that kind of access control.
- **Suggested order:** start now in parallel with engineering work — the source material's explicit warning is "everything lands in about a year, and the only way to lose is to start late."
- **Complexity:** L — mostly compliance process and per-device identity engineering, not deep architecture work, but with an unavoidable multi-month observation window for Type II.
- **Success criteria:** SOC 2 Type I (or ISO 27001) report in hand; per-device identity replaces the shared installer-wide sync token as the primary trust anchor.

### PROD-12 — Customer onboarding & support: guided walkthrough, troubleshooting runbook, "request a fix" path
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** A guided "connect your app" walkthrough for the auth/record-session step, a troubleshooting runbook a non-technical user can act on when a run fails (today they just get a raw recovery payload and a `resume_from` token), and an explicit "request a fix" escalation path to the vendor/Conxa team.
- **Why required:** identified in the go-to-market readiness research as the one non-self-serve step in an otherwise-strong onboarding flow (install, connect, record, and compile all work well; troubleshooting a failure is "the hole"). For an initial small cohort of customers this is acceptable as a deliberately-staffed white-glove model, but it should be a planned staffing decision, not a surprise support load.
- **Business value:** reduces support burden per customer and improves the credibility of the "self-serve" pitch as the customer base grows beyond a hand-held first cohort.
- **Technical value:** builds on the already-shipped error-code UX mapping (Implementation-Plan §2.8) — this item is the next layer up (a runbook and an escalation path), not a duplicate of that work.
- **Dependencies:** benefits from PROD-11's health dashboard and drift alerts, which feed directly into what a troubleshooting runbook would need to explain.
- **Suggested order:** moderate priority — relevant as soon as the customer base grows past a small, founder-supported cohort.
- **Complexity:** M.
- **Success criteria:** a non-technical user who hits a failed run can follow a runbook to a resolution, or has a clear "request a fix" path, without needing to interpret a raw recovery payload themselves.

### DOC-2 — `[DECISION]` `conxa-cloud/scripts/PLUGIN_TEST_README.md` legacy-format call
- **Category:** Documentation & Process
- **Description:** This doc and the `test_plugin.py` tool it documents describe a bundle schema (`manifest.json`, `orchestration/`, `SKILL.md`, a 4-layer recovery model) that doesn't match the current authoritative schema (`pack.json`, `skills/{slug}/{execution,recovery,inputs}.json`, `CLAUDE.md`+`index.md`, the 4-tier T1–T4 cascade). It also references `app/services/skill_pack_builder.py`, which doesn't exist anywhere in the current backend. A flag note was added to the file during this audit (see `docs/archive`-style annotation at its top) but no decision was made about what to do with it.
- **Why required:** a contributor following this README today will hit an immediate dead end at a nonexistent file. It's unclear whether this is a legacy/parallel test harness that predates the current schema (safe to archive) or an accidentally-orphaned tool that should be updated to match reality.
- **Business value:** low direct value, but prevents future engineer time loss and a second, contradictory source of truth for the bundle schema.
- **Technical value:** removes a second description of the skill-pack format, consistent with the "one canonical description" principle applied to the recovery-tier table elsewhere in this audit.
- **Dependencies:** none.
- **Suggested order:** quick — this is a single question to whoever built `test_plugin.py`, not an engineering task.
- **Complexity:** S if the answer is "archive"; M if the answer is "rewrite to match the current schema" (requires actually updating the test harness, not just the doc).
- **Success criteria:** either the file + its scripts move to an archive location with a "superseded" note, or both are rewritten to reference real files and the current schema.

### DOC-4 — Build the CLAUDE.md/AGENTS.md/README.md sync mechanism
- **Category:** Documentation & Process
- **Description:** These three root-level files triplicate the shared "Repository Layout," "Architecture," "Key Invariants," "Where to Look First," and "Deployment" sections for three different audiences (Claude Code, Codex, human/GitHub visitors). This audit found `AGENTS.md` had already drifted behind `CLAUDE.md` (missing 3 of its newest invariants, plus a stale single-layer runtime description) before being manually re-synced as part of this pass. Build `scripts/sync-docs.py` to extract the shared sections from `CLAUDE.md` and write them into `AGENTS.md`/`README.md` between marker comments, plus a CI check (new lightweight workflow or a step in an existing one) that fails if they've drifted.
- **Why required:** the manual-sync approach was implicitly already relied on and already failed within about a month — this is a proven, recurring failure mode, not a hypothetical one.
- **Business value:** low direct value, but prevents an AI coding agent from making a wrong decision because it read the stale copy of an invariant in `AGENTS.md` instead of the current one in `CLAUDE.md`.
- **Technical value:** converts a manual-discipline problem into a structurally-enforced one (CI fails instead of "someone forgot").
- **Dependencies:** none.
- **Suggested order:** do once the three files have been re-synced by hand (done as part of this audit) so the script has a clean starting point to codify, not a gap to first close.
- **Complexity:** M — a small extraction/injection script plus one CI step.
- **Success criteria:** editing a shared section in `CLAUDE.md` and running the sync script updates `AGENTS.md`/`README.md` identically; a CI run against an intentionally-desynced `AGENTS.md` fails.

### RT-1 — macOS runtime support
- **Category:** Runtime
- **Description:** `.github/workflows/build-runtime-host.yml` already has a full `build-conxa-runtime-macos` job scaffolded and gated `if: false`, with an explicit `TODO(2.4)` comment listing the exact remaining work: stage arm64/x64 `keytar.node`, codesign + notarize via `notarytool`, compute SHA-256, upload the release asset, and POST the mac entry into the signed runtime manifest. `installer_builder.py` has no macOS installer generation (PKG/DMG) yet.
- **Why required:** currently Windows-only; this is the only remaining Phase 2 item besides code signing per `docs/Sales-Blockers.md`, and it's explicitly framed there as an upsell (expands addressable market to Mac-based teams) rather than a blocker.
- **Business value:** opens the Mac-team segment of the market; not required for the current Windows-first enterprise sales motion.
- **Technical value:** the runtime code itself is already platform-aware (`CONXA_DIR` resolves correctly on non-Windows); this is packaging/signing/distribution work, not core logic.
- **Dependencies:** none.
- **Suggested order:** after the first Windows enterprise sale closes, per `docs/Sales-Blockers.md`'s recommended sequence.
- **Complexity:** L — CI scaffolding exists, but macOS installer generation, codesigning/notarization, and a tested distribution path are all genuinely unbuilt.
- **Success criteria:** a signed, notarized `.pkg`/`.dmg` installs and runs the full record→compile→execute loop on macOS; the `build-conxa-runtime-macos` CI job is un-gated and green.

### RT-2 — Recording capture depth
- **Category:** Runtime
- **Description:** Add first-class recorder support for typeahead/autocomplete, dynamic-table operations (sort/filter/paginate), and multi-step wizard composites — the interaction classes WorkArena research identifies as most commonly mis-captured. Also add per-signal confidence scoring at capture time (rather than reconstructing it later at compile time) and conditional-state observation (recording whether an element was present/absent when the recording happened, feeding EXEC-1's conditional steps). Confirmed unbuilt via grep across `conxa_compile/recorder/`.
- **Why required:** these interaction types are exactly the ones enterprise SaaS workflows lean on heavily and where linear, naive event capture is weakest — under-capturing them pushes more of the burden onto compile-time LLM reconstruction and runtime recovery, both more expensive and less reliable than capturing the right signal in the first place.
- **Business value:** directly improves out-of-the-box reliability for the enterprise-SaaS workflows Conxa targets, without needing a customer to hit a failure first.
- **Technical value:** reduces compile-time LLM dependence (cheaper, more deterministic compiles) and gives EXEC-1's conditional steps something concrete to be compiled from. Also a prerequisite for PROD-7's connector-graduation idea, which needs the recorder to observe network calls behind each step.
- **Dependencies:** should follow EXEC-1 (conditional/branch steps) — capturing "this element was sometimes present" is only useful once the compiler/runtime have a conditional-step representation to compile it into.
- **Suggested order:** after EXEC-1 lands.
- **Complexity:** L — new recorder event types, new `bridge.js` capture logic, compiler-side handling for the new signal types.
- **Success criteria:** a recorded workflow with an autocomplete field, a sortable table, and a multi-step wizard compiles into steps that replay correctly without falling back to LLM reconstruction for basic structure; capture-time confidence scores are present in the compiled `IdentityBundle`.

### MCP-1 — `ServerBackend` seam + entitlement-filtered `list_skills`
- **Category:** MCP
- **Description:** Refactor `runtime/server.js` (currently a large single file) into the harness/registry/backend-seam architecture described in the research corpus (`04-architecture/subsystems/mcp.md`), and extend the existing capability-filtering pattern into true entitlement filtering — `list_skills` should advertise only skills the calling company is actually licensed for.
- **Why required:** confirmed unbuilt via grep (no `ServerBackend` references anywhere in `runtime/`). As the runtime's MCP surface grows (more tools, more skill types), an undifferentiated single file becomes harder to evolve safely, and licensing-by-convention (rather than by enforced filtering) is a governance gap for a paid product.
- **Business value:** entitlement filtering is a direct commercial/governance enabler — customers should not be able to see (even if not execute) skills outside their license tier.
- **Technical value:** a cleaner separation of transport/registry/backend concerns makes the runtime safer and faster to evolve; this is explicitly hygiene work, not a reliability fix. This refactor is also the natural place to add MCP-2/MCP-3's multi-agent HTTP surface without further bloating `server.js`.
- **Dependencies:** benefits from CLOUD-1's more complete entitlements model landing first, though a first pass of entitlement filtering could use the current partial RBAC.
- **Suggested order:** after CLOUD-1, or in parallel if entitlement data is already sufficient for a first cut.
- **Complexity:** L — a real refactor of `server.js`'s architecture, plus new entitlement-checking logic in the `list_skills` path.
- **Success criteria:** `server.js` is decomposed into harness/registry/backend layers; `list_skills` for a company only returns skills that company's plan/license actually entitles them to.

### EXEC-3 — Vision Tier-4 as an actionable recovery tier
- **Category:** Execution & Recovery
- **Description:** Build out Tier 4 (vision recovery) into a real, bounded recovery mechanism: a grounder that maps `(screenshot, description) → normalized bounding box`, scaled by device pixel ratio at execution time, with Set-of-Marks-style annotation shipped to telemetry as a drift signal (never as success evidence — top-50-improvements.md #42). Today, per `docs/TRD.md` §10.1, Tier 4 is still a passive screenshot-to-host payload — the agent receives an image but there's no grounder, bbox re-derivation, or scale normalization on the runtime side.
- **Why required:** without a real grounder, Tier 4 is more of a "give the model a picture and hope" fallback than a working recovery tier — it's the last-resort tier by design, but should still function as one. Note per `build-order.md`: don't build this until Tier-3 + CDP-AX recovery (EXEC-4/EXEC-6) are exhausted in practice, since most "DOM-opaque" cases are reachable via CDP accessibility-tree access first — vision is deliberately the rarest, lowest-ROI tier (ROI 4 of 14 in `master-recommendations.md`).
- **Business value:** improves recovery success on DOM-hostile surfaces (canvas-based UIs, custom widgets that don't expose a normal accessibility tree) that no other tier can handle at all today.
- **Technical value:** completeness for a deliberately rare, bounded tier — this is explicitly not meant to become a primary execution path (vision-as-primary is a rejected anti-pattern per the research corpus).
- **Dependencies:** benefits from EXEC-4's resolution (the shape of the agent-mediated recovery handoff affects how a vision grounder's output flows back into the runtime); should follow EXEC-6's closed-shadow CDP escape hatch, per `build-order.md`'s explicit sequencing.
- **Suggested order:** after EXEC-1/EXEC-2/EXEC-6, since it's lower strategic priority per the research corpus's own ranking.
- **Complexity:** L — a real grounder model/pipeline, bbox normalization logic, and telemetry wiring for SoM annotations.
- **Success criteria:** a Tier 4 recovery on a canvas-based or custom-widget UI produces a normalized, scale-correct bounding box that the runtime can act on, not just a screenshot handed to the agent with no structured extraction.

### EXEC-6 — `[UNVERIFIED]` Frame/shadow recovery hardening
- **Category:** Execution & Recovery
- **Description:** A second batch from the same top-50 list, specifically about iframe and shadow-DOM edge cases: forbid XPath for shadow targets at compile time and record the shadow host-path instead (#17); a multi-signal `FrameFingerprint` plus a frame-level recovery sub-tier for when a frame's id drifts (#18); a closed-shadow escape hatch (AX role+name → CDP pierce → vision, for closed shadow roots that hard-fail today, #24); frame/shadow-aware verification so post-condition checks read *inside* the correct frame/shadow boundary instead of false-passing or false-failing across it (#27); a wait-for-frame-attached gate for dynamically-injected iframes (#39); and a wait-for-shadow-upgrade gate for web components not yet upgraded when first queried (#40).
- **Why required:** iframe- and shadow-DOM-heavy enterprise products (Salesforce, ServiceNow, and similar) are explicitly called out in the research corpus as the hardest part of enterprise automation and a determinism-*and*-enterprise-moat item (`research-analysis/03-insights/master-insights.md` D3) — but today only the basic "iframe chain preserved verbatim" invariant is enforced; these finer-grained edge cases aren't yet handled.
- **Business value:** directly improves reliability on exactly the enterprise SaaS products (heavy iframe/shadow use) that are Conxa's target market.
- **Technical value:** builds on the already-enforced "iframe chain preserved verbatim" invariant (`session.py`) rather than replacing it — this is the next layer of edge-case hardening on top of an already-solid foundation.
- **Dependencies:** benefits from EXEC-1 landing first (the same conditional-step machinery is useful for "wait for frame attached"-style gating).
- **Suggested order:** per `build-order.md`'s sequencing, this is "build third" — after the verified floor and the action-correct handlers (EXEC-5), alongside the autonomous-recovery work (EXEC-4).
- **Complexity:** L — six related but individually-scoped fixes across the compiler (shadow host-path recording), the resolver (`FrameFingerprint`), and the recovery cascade (CDP pierce escape hatch).
- **Success criteria:** a recorded workflow targeting an open-shadow-DOM component (e.g., a Salesforce Lightning Web Component) survives a shadow-host id change without falling back to XPath; a closed-shadow target that hard-fails today is recoverable via the CDP escape hatch.

### EXEC-8 — Structured Tier-5 human handoff + rule-triggered destructive escalation
- **Category:** Execution & Recovery
- **Description:** A first-class, designed "pause and hand to a human" state (top-50-improvements.md #28, matching the research corpus's UI-TARS-inspired `CALL_USER` pattern) for CAPTCHA/2FA/ambiguous/sensitive steps, triggered both by rules (a step tagged as sensitive/destructive) and by recovery exhaustion — plus rule-triggered escalation specifically for destructive actions (pay/delete/submit, #29) so an irreversible step never falls through to a "confident guess" recovery path.
- **Why required:** this is the same underlying need as PROD-3's safe-action system (danger-classified steps, refuse-to-guess on irreversible actions) approached from the reliability-engineering side of the research corpus rather than the business-risk side — **treat PROD-3 as the primary tracked item for this work and this entry as confirmation that the reliability research independently arrived at the same requirement**, not a second thing to build.
- **Business value:** see PROD-3.
- **Technical value:** see PROD-3; the "CALL_USER" framing here specifically emphasizes making the human-handoff state a first-class, designed state (not just falling through to a generic failure) with a clear audit trail of why it triggered.
- **Dependencies:** should be scoped and built together with PROD-3, not separately.
- **Suggested order:** alongside PROD-3.
- **Complexity:** see PROD-3.
- **Success criteria:** see PROD-3's success criteria — this entry exists to prevent someone independently re-scoping the same feature twice from two different source documents.

### UPD-3 — Authenticode-sign the runtime self-update binary
- **Category:** Auto Updates
- **Description:** Distinct from UPD-2 (which covers the Build Studio installer `.exe`), the runtime's self-update binary (`conxa-runtime.exe`, downloaded via the signed manifest) is itself still not Authenticode-signed — only its SHA-256 (sourced from the now-signed manifest) is verified. Per `docs/Security.md` SG-09, if the manifest-signing key were ever compromised, an attacker could still ship an arbitrary signed manifest entry pointing at a malicious binary, since there's no second, independent trust check on the binary itself.
- **Why required:** the manifest-signing half of this gap was already fixed (2026-07-01, Enterprise-Grade Auto-Update Architecture) — this is explicitly the "still open" half of a partially-fixed High-severity security gap, not a new finding.
- **Business value:** closes a real (if currently unexploited) supply-chain risk on the auto-update path that customers' security teams may ask about during enterprise due diligence.
- **Technical value:** adds a second, independent trust check beyond the manifest's own signature, so a compromised manifest-signing key alone is insufficient to install a malicious binary.
- **Dependencies:** none; independent of UPD-1/UPD-2 (different binary, different signing mechanism).
- **Suggested order:** can proceed in parallel with UPD-1; lower urgency than UPD-2 since it requires a compromised signing key to actually be exploitable.
- **Complexity:** M — add a `signtool` step for `conxa-runtime.exe` in `build-runtime-host.yml` (parallel to the Studio installer's signing step) and a verification check in `manifest_manager.js` before `--selfcheck`/activation.
- **Success criteria:** `conxa-runtime.exe` is Authenticode-signed as part of the build; `manifest_manager.js` verifies this signature independently of the manifest's own Ed25519 signature before activating a downloaded binary.

### UPD-4 — Move release-artifact hosting off GitHub Releases before the source repo goes private
- **Category:** Auto Updates
- **Description:** Per `research-analysis/ops/private-repo-migration.md`: the source repo can be made private, but release-artifact downloads (host exe, `keytar.node`, app-layer zip, Build Studio installer) currently default to public GitHub Release URLs consumed by unauthenticated customer clients — `bootstrap.py`'s deps-manifest fetch, the runtime's Ed25519-signed `manifest.json` self-updater, and the Cloud frontend's Studio-installer/electron-updater feed all resolve to `github.com/.../releases/download/...` URLs built from `CONXA_GITHUB_REPO`. Making the repo private without changing this breaks every one of those unauthenticated download paths. The `promote-release.yml` workflow is the trickiest spot — it constructs the GitHub Release URL for the stable manifest inline in the workflow, not from a shared env default, so it's the piece most likely to be missed.
- **Why required:** this is a real, actionable, already-fully-scoped migration plan sitting unimplemented in the research corpus — not a hypothetical concern. If the repo visibility is ever changed without this work landing first, every currently-installed runtime's self-update and every fresh Build Studio bootstrap breaks simultaneously.
- **Business value:** removes a blocker to making the source repo private (a reasonable IP-protection step for a company with paying customers) without breaking any existing customer installation's ability to update.
- **Technical value:** the source doc already specifies the target shape precisely: CI keeps building the same artifacts, but uploads them to Conxa-owned public artifact storage in addition to (or instead of) a GitHub Release, and `updates_routes.py`'s `_release_url()` plus `promote-release.yml`'s inline URL construction both point at the new base instead of GitHub. Signing/verification logic is unaffected — only the URL host changes.
- **Dependencies:** none blocking; can proceed independently of the actual repo-visibility change (do this first, then flip visibility once validated). Loosely related to CLOUD-2's blob/CDN storage work — both are "stop relying on ad-hoc storage for distributed artifacts" efforts and could share infrastructure decisions.
- **Suggested order:** before any decision to make the repo private, not after — do this whenever that decision is made, not urgently otherwise.
- **Complexity:** M — the source doc's own validation checklist (logged-out downloads of every manifest-referenced URL, a full `promote-release.yml` dry run) is the acceptance test; the actual code change is concentrated in `updates_routes.py` and one workflow file.
- **Success criteria:** every item in `research-analysis/ops/private-repo-migration.md`'s own validation checklist passes from a logged-out machine, including a full `promote-release.yml` run that posts a stable manifest pointing at Conxa-owned artifact URLs, not GitHub Release URLs.

### TEST-1 — Remove or fix orphaned `conxa-builder/python` test files
- **Category:** Testing & Cleanup
- **Description:** `conxa-builder/python/test_installer_builder.py` and `test_bootstrap.py` are written as standalone `unittest`-style scripts with manual `sys.path` insertion. They're on `pythonpath` (per `conxa-cloud/pytest.ini`) but outside `testpaths` (which only points at `conxa-cloud/tests`), so they're importable but never actually collected/run by CI. They also diverge in content from same-named files that do run under `conxa-cloud/tests/` (e.g., differing line counts), suggesting they're stale duplicates rather than intentionally-separate coverage.
- **Why required:** dead, unrun test files create false confidence — someone reading the file tree might assume these provide coverage that CI is not actually exercising.
- **Business value:** none directly; this is test-hygiene housekeeping.
- **Technical value:** removes a source of confusion for future engineers and prevents dead code from silently accumulating further drift from the tests that do run.
- **Dependencies:** none.
- **Suggested order:** opportunistic — low complexity, do whenever convenient, e.g. bundled with other `conxa-builder/python` work.
- **Complexity:** S.
- **Success criteria:** either the two files are deleted (if `conxa-cloud/tests/`'s versions are confirmed to be strict supersets), or they're moved into `testpaths` and reconciled with the versions that do run.

---

## P3 — Low Urgency, Opportunistic (12 items)

### PROD-7 — Connector graduation path
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** When a mature skill has run enough times to prove its value, offer to generate a draft *official* API connector from the recording plus the network calls Conxa's recorder observed behind each step, and keep running the same governed skill on top of the faster backend once it exists.
- **Why required:** answers the "market squeezed from both sides" risk on the "vendors eventually build their own connector" side — turning what would otherwise be lost business (a vendor graduating away from browser automation) into a paid upsell instead of churn.
- **Business value:** converts Conxa's biggest long-term structural threat (vendors building official connectors) into expansion revenue rather than attrition.
- **Technical value:** depends on the recorder already capturing network-call context per step (a capability that would need to be added — see RT-2) and is described in the source material as strategic/large, not a quick win.
- **Dependencies:** benefits from RT-2's recording-depth work and, conceptually, from BUILD-1's compiler IR (a clean intermediate representation makes "generate a connector from this" a more tractable transform).
- **Suggested order:** later — explicitly framed as the "endgame" item in the source doc's own build-plan ordering, not a near-term priority.
- **Complexity:** XL — this is closer to a new product surface than a feature.
- **Success criteria:** at least one mature, high-volume skill has a generated draft connector that a vendor can inspect and choose to adopt as a paid upgrade.

### PROD-8 — Trust & GTM: self-serve AI-operability scanner + "Works with Claude" badge
- **Category:** Product Strategy & Business-Risk Mitigation
- **Description:** A free, self-serve tool where a vendor pastes their product's URL, and in minutes gets an "AI-operability score" plus a "Works with Claude" badge they can display on their own site.
- **Why required:** answers "big software companies don't need Conxa" for the *small/mid-market* segment Conxa actually targets — the source material frames this as a low-cost way to generate warm, pre-qualified leads (every vendor who runs the scanner has already seen their own good score) instead of paying salespeople to argue the case cold.
- **Business value:** a marketing/lead-gen mechanism, not core product — small vendors are described as buying "marketing wins" faster than they buy tools, and the badge is exactly that.
- **Technical value:** low — this is closer to a lightweight product-marketing tool than core infrastructure, though it does quietly generate data on which kinds of products fit Conxa best.
- **Dependencies:** none.
- **Suggested order:** opportunistic — a marketing investment, not a reliability or architecture item; sequence whenever GTM capacity allows.
- **Complexity:** M.
- **Success criteria:** the scanner is live and self-serve; at least one vendor converts from "ran the scanner" to "became a customer" without a sales call in between.

### DOC-3 — Verify the 3 flagged papers in `unverified-papers.md`
- **Category:** Documentation & Process
- **Description:** `research-analysis/01-external-research/papers/unverified-papers.md` flags three arXiv IDs (`2402.10157v1`, `2501.09903v3`, `2501.12988v1`) whose metadata suggests they're outside the web-automation domain (control theory, quantum computing, semantic communications respectively). This was re-confirmed via metadata lookup during this audit (2026-07-04 stamp added) but the underlying PDFs were never actually opened.
- **Why required:** if these are genuinely mislabeled/irrelevant, they're dead weight in the research corpus; if they're actually relevant (unlikely given the metadata signal), the corpus is missing their analysis.
- **Business value:** minimal — this is research-corpus hygiene, not a product concern.
- **Technical value:** keeps the `01-external-research/` corpus internally consistent with its own priority-ranking claims.
- **Dependencies:** none.
- **Suggested order:** opportunistic — whenever someone has the PDFs handy (see the `pdftotext` snippet already in the file).
- **Complexity:** S.
- **Success criteria:** each of the 3 papers gets either a full dossier (if relevant) or a one-line "confirmed off-topic, removed from corpus" resolution in the same file.

### BUILD-2 — Build Studio UX backlog (from `docs/UI-UX-Brief.md` §9)
- **Category:** Builder
- **Description:** A set of smaller Build Studio UI improvements identified in the UI/UX audit that were never carried into an engineering backlog: a guided HumanEdit review checklist before sign-off; parameterization auto-suggest (detect email/name/date-shaped values during HumanEdit and suggest `{{variable}}` templating); a workflow pipeline visualization (`Recorded → Compiled → Reviewed → Signed Off → Built → Deployed`) replacing plain status text; persisted, prominently-shown test results with a "test required before publish" gate; bulk compile (select multiple recordings, compile in sequence with per-item progress); installer version history (version/date/sha256 list on the Build Installer page); publish-without-installer-rebuild for content-only updates (the delta sync already supports this — this is a UI path to trigger it directly); and an execution-dashboard widget embedded in Build Studio showing the last 10 runs across deployed plugins.
- **Why required:** these are all still-open items from the UX audit's own "Priority 2/3" improvement lists that were never converted into tracked engineering work.
- **Business value:** each is a small usability improvement rather than a blocker; collectively they reduce friction for the people actually using Build Studio day-to-day (the "guided checklist" and "test-required gate" items also reduce the risk of a badly-reviewed skill reaching customers).
- **Technical value:** low-to-moderate individually; "publish without installer rebuild" in particular is mostly UI work since the underlying delta-sync capability already exists.
- **Dependencies:** none blocking; overlaps PROD-11's "fast re-record" dashboard item — sequence together if convenient.
- **Suggested order:** opportunistic, low urgency — pick off individually as Build Studio UI work comes up.
- **Complexity:** S–M per item; M overall if batched.
- **Success criteria:** each listed item ships as a discrete, independently-shippable UI change; track completion per sub-item rather than requiring the whole list to land at once.

### CLOUD-2 — Blob/CDN storage + durable job queue
- **Category:** Cloud
- **Description:** Installer versions and skill-pack files currently persist as base64 blobs in Postgres KV namespaces (`installer_versions__{slug}`, `skillpack_files__{slug}`) — durable, but not built for scale, and `blob_read_write_token` config exists but is unwired. Separately, `worker.py` (a queue scaffold referenced by older docs) doesn't exist anywhere in the current repo — the durable job queue it implied was never actually built.
- **Why required:** base64-in-Postgres doesn't scale indefinitely; this becomes a real problem if installers approach the `build_artifact_upload_max_bytes` (250 MB) limit regularly, or if DB storage cost/limits become an issue at higher customer volume.
- **Business value:** avoids a future scaling wall, but isn't blocking anything today — flagged as a scalability concern to watch, not an active fire.
- **Technical value:** moves large-blob storage to infrastructure built for it (CDN/object storage) and gives the platform a real durable queue for anything that needs one (e.g., the fleet-flywheel automation in EXEC-2, if it ends up needing asynchronous job processing).
- **Dependencies:** none blocking; EXEC-2 may want a durable queue depending on how its automation pipeline is built. Overlaps UPD-4's release-artifact hosting move — both are "get off ad-hoc storage" items and could share infrastructure decisions.
- **Suggested order:** revisit when installer sizes or DB storage costs actually approach a limit, or when EXEC-2's design calls for asynchronous job processing — not urgent before either trigger.
- **Complexity:** M/L — wiring `blob_read_write_token` to a real object-storage backend is more contained than standing up a full durable queue from scratch.
- **Success criteria:** installer/skill-pack blobs above a defined size threshold are served from object storage/CDN rather than Postgres; a real job queue exists if/when something in the platform needs asynchronous processing.

### MCP-2 — Skill discovery manifests + Cloud discovery endpoint
- **Category:** MCP
- **Description:** Per `research-analysis/07-go-to-market/agentic-discovery-strategy.md`'s roadmap: add `skill.json` manifest generation to every published skill pack (`plugin_builder.py`), a `GET /api/v1/discover/skills` Cloud endpoint plus a per-skill `GET /api/v1/discover/skills/:id`, with the manifest response including the full `execution` block (endpoint + `runtime_bootstrap`), and a Cloud dashboard surface showing the "ARD Discovery URL" per published skill pack. Confirmed unbuilt — the only `skill.json` references in the current codebase are in an `OBSOLETE_WORKFLOW_FILENAMES` list (an old, unrelated schema artifact), not this manifest.
- **Why required:** positions Conxa's skill packages to be discoverable by any agentic-resource-discovery-compliant AI agent, not just Claude Desktop — the source doc frames MCP-native execution as Conxa's moat regardless of which agent discovers/calls it, so a standard discovery manifest is a distribution-channel expansion, not an architecture change.
- **Business value:** the source doc's own framing: "record once in Build Studio → every AI agent your customer uses discovers and runs it reliably" — an emerging distribution channel, positioned early rather than reactively once a discovery standard consolidates.
- **Technical value:** low-risk, additive — a new manifest format and two new read-only discovery endpoints, no changes to existing execution paths.
- **Dependencies:** none blocking; naturally sequenced with MCP-1's `ServerBackend` refactor and MCP-3's local HTTP surface, since all three touch the same "what can external callers see and call" boundary.
- **Suggested order:** speculative/early-market-positioning — lower urgency than the reliability-phase items, but cheap enough to fit in alongside MCP-1.
- **Complexity:** M.
- **Success criteria:** every published skill pack has a `skill.json` manifest; `GET /api/v1/discover/skills` returns discoverable metadata for a company's published skills.

### MCP-3 — `[UNVERIFIED]` Local HTTP server for multi-agent runtime access
- **Category:** MCP
- **Description:** Per the same roadmap, add a local HTTP server to `runtime/server.js` (bound to `127.0.0.1`, e.g. port 7823) exposing `/health`, `/skills`, `/skills/:id`, `/execute`, `/status/:exec_id`, authenticated with the existing per-company token from `auth_manager.js` as a Bearer header — so any agent framework that can make an HTTP call (OpenAI Agents SDK, etc.), not just MCP-speaking clients, can discover and execute Conxa skills.
- **Why required:** this is the mechanism that makes PROD-5's "Conxa doesn't need Claude specifically" thesis concretely true for non-MCP agent frameworks, not just other MCP hosts (which already work via the existing MCP stdio server).
- **Business value:** removes the last architectural tie to MCP-speaking clients specifically, widening the addressable set of "AI agents that can call a Conxa skill" beyond Claude Desktop, ChatGPT desktop, and Cursor.
- **Technical value:** additive to the existing `server.js` — a new transport alongside the existing MCP stdio interface, reusing the same skill-execution machinery and auth model.
- **Dependencies:** natural to build alongside MCP-1's `ServerBackend` refactor, since a second transport is exactly the kind of thing that seam is meant to make cheap to add.
- **Suggested order:** after MCP-1, or bundled with it.
- **Complexity:** M — mostly wiring an existing execution path behind a new local HTTP listener with the same auth model already in place.
- **Success criteria:** a non-MCP agent framework can call `POST http://127.0.0.1:7823/execute` directly and get the same result as calling `execute_skill` over MCP.

### EXEC-7 — Selector-scoring & misc reliability refinements
- **Category:** Execution & Recovery
- **Description:** A smaller set of standalone refinements from the same top-50 list that don't need their own dedicated epic: penalize GUID-like/volatile ids in live scoring so a stable signal is preferred over a volatile one even when the volatile one currently matches (#36); de-rank `position_hint` specifically for content confirmed to be dynamic, since position breaks first on reflow (#37); an anchor/relational re-find tier that locates a text-drifted target via its recorded neighboring elements (#38, builds on the existing `anchors/` module); a content-based stall/loop fingerprint (URL + element-count + DOM-text hash) that hard-caps recovery retries when the page genuinely hasn't changed between attempts — distinct from and complementary to the existing simple attempt-count cap (`RETRY_BUDGET_MAX = 3` in `run.js`, which is already shipped and doesn't inspect page content, #22); reflection-in-output for the Tier-3 prompt, paired with the already-shipped independent post-condition check since reflection is the model's belief, not verified truth (#44); an AX-tree rank-and-cap digest for Tier-3 recovery input so the intended element is never the one silently truncated away on a large page (#45); an optional CDP-based engine for bot-detection-heavy targets (#48); and role/text-based identity for context-menu items that render at the document body root rather than near their trigger (#49); plus deferred/soft post-condition batch reporting — collecting non-fatal assertion failures across a run and reporting them all at the end instead of failing on the first one (#50).
- **Why required:** each closes a specific, narrower edge case than the Tier-1 items already shipped; individually lower-impact than EXEC-5/EXEC-6 but still concrete, previously-identified gaps.
- **Business value:** incremental reliability improvement across a long tail of specific failure modes rather than one headline fix.
- **Technical value:** several of these (GUID penalty, position_hint de-rank, stall fingerprint) are refinements to selector scoring and recovery-retry logic that's already shipped and working, not net-new subsystems.
- **Dependencies:** none blocking each other; can be picked off independently.
- **Suggested order:** opportunistic, after the higher-priority items in this category (EXEC-1 through EXEC-6) — this is explicitly the "Tier 3: valuable, complete the coverage" tier of the source list, not the critical path.
- **Complexity:** S–M per item.
- **Success criteria:** each item ships as an independent, individually-testable refinement; no single success criterion covers the whole set.

### UPD-2 — `[DECISION]` Installer code-signing certificate procurement
- **Category:** Auto Updates
- **Description:** The Windows EV code-signing integration for the Build Studio installer is fully implemented in code — `installer_builder.py` runs a conditional `signtool.exe sign /sha1 ... /fd SHA256 /tr http://timestamp.digicert.com` step after the NSIS build, gated on the `CONXA_SIGN_CERT_SHA1` env var (a certificate thumbprint) and `CONXA_SIGNTOOL_PATH`. As of this audit (2026-07-04), no certificate has been procured, so builds still ship unsigned and trigger Windows SmartScreen's "Unknown Publisher" warning.
- **Why required:** per `docs/Sales-Blockers.md`, this is the one remaining hard blocker for enterprise contract signature — many enterprises block unsigned executables via GPO policy, making this a fleet-deployability blocker, not a cosmetic one.
- **Business value:** directly gates the ability to close the first enterprise Windows customer.
- **Technical value:** none remaining — the engineering work is done; this is purely a procurement/ops action.
- **Dependencies:** none.
- **Suggested order:** immediate — per `docs/Sales-Blockers.md`'s "Now" recommendation, this is the last thing between the current build and a fleet-deployable, GPO-safe installer. (Its listing under P3 here reflects that no *engineering* work remains, not that it's unimportant — see `docs/Sales-Blockers.md` for the business-priority framing.)
- **Complexity:** S — procure a Windows EV code-signing certificate (~$200/yr), install it in the build machine's certificate store, and set the env var. No code changes needed.
- **Success criteria:** a build produced with the certificate installed passes Windows SmartScreen without an "Unknown Publisher" warning.

### TEST-2 — Add dedicated test coverage for `packages/conxa-core`
- **Category:** Testing & Cleanup
- **Description:** `packages/conxa-core` has no test directory of its own — it's only covered indirectly, through `conxa-cloud/tests/` via the shared `pythonpath` set in `pytest.ini`. This works today because `conxa-core` is always installed alongside the cloud backend and Build Studio in the current monorepo layout.
- **Why required:** if `conxa-core` is ever versioned or published independently (a natural evolution for a shared foundation package installed by two separate systems), indirect-only coverage becomes a real gap — there'd be no way to verify the package works correctly in isolation.
- **Business value:** none today; this is forward-looking technical debt, not an active problem.
- **Technical value:** protects against a future refactor (splitting `conxa-core` out for independent versioning) silently losing test coverage in the process.
- **Dependencies:** none.
- **Suggested order:** low urgency — revisit if/when `conxa-core` independent versioning is ever seriously considered.
- **Complexity:** S/M depending on how much of the existing indirect coverage needs to be duplicated versus how much can just be relocated.
- **Success criteria:** `packages/conxa-core` has its own `tests/` directory with meaningful direct coverage of its public API, independent of the cloud test suite's `pythonpath` trick.

### TEST-3 — Residual low-severity security hardening (SG-08, SG-12, SG-13)
- **Category:** Testing & Cleanup
- **Description:** Three low-severity, currently-accepted gaps remain open in `docs/Security.md`: SG-08 (sync token is a shared installer-scoped secret, not rotatable per-installer — see also PROD-10's per-device-identity replacement plan), SG-12 (company name used in file paths without re-validation in `auth_manager.js`/`sync.js`), and SG-13 (no per-user identity at runtime — `uid` is spoofable, only per-company auth exists). All three are already documented as accepted low-severity tradeoffs, not urgent fixes.
- **Why required:** listed for completeness so they don't fall off the radar entirely — each is individually low-impact, but worth a look if runtime auth is ever revisited for other reasons (e.g., alongside CLOUD-1's RBAC work, since "no per-user identity at runtime" (SG-13) is conceptually related to enterprise RBAC granularity).
- **Business value:** low — these are defense-in-depth items, not known-exploitable gaps.
- **Technical value:** closes out the security-gap tracker's remaining open items, keeping `docs/Security.md` accurately reflecting "everything genuinely resolved vs. still open" rather than a slow accumulation of low-priority items.
- **Dependencies:** SG-13 (per-user runtime identity) is naturally related to CLOUD-1's RBAC work — consider bundling if CLOUD-1 is ever scoped in detail. SG-08 is directly superseded if PROD-10's per-device identity work ships.
- **Suggested order:** opportunistic; bundle with CLOUD-1 or PROD-10 if convenient.
- **Complexity:** S each.
- **Success criteria:** each gap either gets a real fix (e.g., path re-validation for SG-12) or an explicit, documented "accepted risk, will not fix" decision in `docs/Security.md` rather than sitting in an ambiguous "Low, not urgent" state indefinitely.

### ADV-1 — TwelveLabs video-understanding integration
- **Category:** Advanced / Research Integrations
- **Description:** Per `research-analysis/07-go-to-market/twelvelabs-video-strategy.md`: Conxa already captures a `recording.webm` for every recorded workflow but doesn't currently use video-understanding models on it. Four integration points are laid out in detail: (1) compile-time intent enrichment (Pegasus model — richer per-step intent descriptions than can be inferred from screenshots/DOM alone); (2) semantic skill discovery and dedup (Marengo model — detect that two separately-recorded workflows are actually the same underlying task); (3) auto-generated assertions (Pegasus — infer expected post-conditions from what visibly changed in the recording); (4) recovery describe-then-match using Marengo at Tier 3+ only, consistent with the zero-token-hot-path invariant.
- **Why required:** this is a genuinely unbuilt, well-specified opportunity to extract more value from data Conxa already collects (the recording itself) without changing what customers do — but it's speculative product investment, not a response to an identified gap or risk the way most of the rest of this file is.
- **Business value:** each integration point could meaningfully improve compile quality or discovery, but none is validated yet — this is an R&D bet, not a committed roadmap item.
- **Technical value:** the source doc includes a specific cost model (cost per compile) and explicitly checks the integration against existing invariants (e.g., recovery describe-then-match is scoped to Tier 3+ only, preserving the zero-token hot-path guarantee) — the design work is largely done; what's missing is the build and a validation pass on real recordings.
- **Dependencies:** none blocking; independent of the rest of the roadmap.
- **Suggested order:** last — explicitly speculative and not gating anything else in this file.
- **Complexity:** L per integration point; the source doc scopes each of the four independently, so they don't need to land together.
- **Success criteria:** at least one integration point (most likely compile-time intent enrichment, the simplest of the four) is validated against a sample of real recordings and shown to measurably improve compiled-skill quality before investing in the remaining three.

---

## Final Review Notes (from the audits that produced this file)

- Every row in `docs/Security.md`'s security-gaps table (SG-01 through SG-13) has a corresponding item above or is confirmed already fully resolved with no residual work.
- Every "done" claim corrected during the first audit pass (installer code signing, the `/api/v1` gap, the gate_replay.js CI gate status) was verified directly against code, not assumed from prior docs.
- **Second pass:** the first pass under-mined the research corpus — it built this file almost entirely from the engineering-gap documents (`gap-analysis.md`, `master-insights.md`, `master-recommendations.md`, `Sales-Blockers.md`) and direct code checks, while only *summarizing* (not extracting action items from) `conxa-critical-analysis.md`, `conxa-solutions-by-problem.md`, `top-50-improvements.md`, `build-order.md`, `agentic-discovery-strategy.md`, the go-to-market folder, `ops/private-repo-migration.md`, the `twelvelabs-video-strategy.md`, and `docs/UI-UX-Brief.md`'s own Priority 2/3 backlog. That pass added the Product Strategy items, BUILD-2, MCP-2/MCP-3, EXEC-5 through EXEC-8, UPD-4, and ADV-1 to close that gap. Items marked `[UNVERIFIED]` above were sourced from the research corpus without an individual code-level check (unlike the rest of this file) — a couple of candidate items from the same source list (top-50 #9 "consume compile-time confidence at runtime" and #21 "wait-enabled/aria-disabled gate") were spot-checked and found to already be shipped, so they were deliberately excluded rather than re-listed as open.
- **Third pass (this update):** re-sorted the whole file by priority tier (P0–P3) instead of by subsystem category, per user request. No item content changed — each item gained a **Category:** field so the previous category grouping isn't lost, just no longer the primary sort key. The old "Phase 10 — Enterprise Features" section (a pointer-only section with no items of its own) was folded into the file's intro instead of kept as a structural element.
- `CLAUDE.md`'s documentation table was checked against `ls docs/` post-archival and is current as of the first pass — recheck this after any future archival/rename to avoid the exact drift that pass found and fixed.
- `docs/Sales-Blockers.md`, `docs/Implementation-Plan.md`, and this file agree on wording for the installer-code-signing item (UPD-2) — all three were updated together in the first pass.
- New-file discovery: `SHIP-GUIDE.md` was found during the first audit's verification pass despite not appearing in the original per-file research — it was confirmed accurate and just needed one broken cross-reference fixed and a doc-table listing added. Any `.md` file created after this audit began should get the same treatment (read, verify, cross-reference) before being assumed current.
- **Still not individually mined for action items:** the `research-analysis/04-architecture/00-master-architecture.md` through `09-implementation-blueprint.md` series and its `subsystems/*.md` files (used only as cited backing for existing R-numbered items, not read cover-to-cover for finer-grained specifics), and `research-analysis/05-reliability/framework.md`, `inventory.md`, `matrix.md`, `recovery-patterns.md` (the deeper EC-xx/RP-xx reference material behind `top-50-improvements.md`, sampled lightly rather than fully mined). If a future pass has time, these are the next places to check for anything still missing.
