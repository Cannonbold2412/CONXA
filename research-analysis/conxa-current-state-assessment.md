# Conxa Current-State Assessment (Phase 1)

**Author:** CTO / Principal Systems Architect review
**Basis:** Actual code (`runtime/run.js`, `runtime/server.js`, `conxa_compile/`), `docs/TRD.md`, `docs/PRD.md`, `docs/Implementation-Plan.md`, and the research intelligence database (`research-analysis/`).
**Method:** Every subsystem assessed against what the *code* does, not what the docs *claim*. Where they diverge, the divergence is the finding.

---

## ⚠️ Cross-Cutting Finding (read this first)

The single most important fact about current Conxa: **the documented architecture is ahead of the implemented architecture in exactly the places that constitute the differentiator.**

Three claims in `docs/` are not true in the code:

1. **"Fingerprint-scored 5-tier recovery cascade with LLM at Tier 3+."** In `run.js`, recovery is a *fixed deterministic ladder* (compiled-selector alternates → a11y role/name → transient retry → fallback selectors → dialog-scoped → fuzzy text). There is **no runtime LLM call** and **no weighted fingerprint scoring** of live candidates. The "LLM/vision tiers" are not autonomous: when deterministic recovery is exhausted, `server.js` packages screenshots + a 50-element DOM digest + a reference image and **returns them to Claude Desktop as the MCP tool result**, asking the host to fix the selector and call `execute_skill` again with `resume_from`. Recovery above the deterministic floor is **host-delegated, not self-healing.**

2. **`verifyAssertions()` per step (TRD §9.1).** Not defined or called anywhere in the runtime. Outcome verification only happens if the compiler emitted explicit `assert`/`check` *step types* into the plan. There is **no independent post-condition check** after normal steps — the field-wide blind spot the research flagged as the #1 reliability move (`master-insights-v2.md` R1) is present in Conxa too.

3. **Selector scoring at runtime (TRD §10.2, "highest scorer is used").** `selector_score.py` is compile-side Python only. The runtime tries selectors in array order and takes the first that resolves. There is no live scoring.

**What *is* genuinely built and good:** the deterministic recovery ladder is real and richer than the docs suggest; the **auth-failure re-authentication self-heal** (detect login redirect → open headed re-auth window → rebuild context → resume) is production-grade and a real enterprise need; iframe-chain handling via `rootCandidates`/`frameLocator` is correct and matches the invariant; the integrity gate, retry budget, and atomic sync are solid.

This gap is the spine of the whole evolution program: **Conxa must build the differentiator it already markets.**

---

## Subsystem Reports

For each: Current Architecture · Strengths · Weaknesses · Risks · Technical Debt · Scalability Risks · Missing Capabilities · Enterprise Readiness · Competitive Position.

---

### 1. Recording

**Current Architecture.** `conxa_compile/recorder/` — Playwright Chromium with `bridge.js` injected into every frame via `addInitScript`. Captures ~25 event types (click, type, fill, select, set_checkbox, date_pick, drag_drop, keyboard_shortcut, upload, navigate, scroll, tab/frame/dialog markers). Each event carries action, url, frame (iframe chain with parent_chain), target signals, value, ts. `frame_extractor.py` accumulates page-level bbox offsets up the iframe chain. Streams to `events.jsonl`.

**Strengths.** Broad event coverage including the hard cases (frames, dialogs, drag, uploads). Iframe chain captured verbatim with accumulated offsets — directly serves the invariant and is ahead of most tools. Records inside authenticated sessions (storageState).

**Weaknesses.** Capture is **DOM-event-centric, not intent- or context-centric.** No multi-signal *snapshot* of the target's neighborhood at capture time beyond the recorded signals; the rich semantic/anchor context is *reconstructed later by LLM at compile*, not captured. No confidence at capture. WorkArena's highest-value interactions (autocomplete/typeahead where options appear after typing, dynamic tables) are not specially handled.

**Risks.** A recording is a single linear happy path. Stochastic page states (cookie banners ~30–50% of loads, interstitials, optional MFA) are captured if present that run and absent otherwise — producing brittle plans (research `research-audit.md` C.2).

**Technical Debt.** Event vocabulary is wide but flat; no explicit branch/optional semantics.

**Scalability Risks.** Low — recording is local and per-workflow.

**Missing Capabilities.** Intent capture, validation capture (what should be true after each step), confidence capture, conditional-state capture, semantic understanding at record time.

**Enterprise Readiness.** Medium. Good frame/auth handling; weak on the messy enterprise interactions (typeahead, dynamic grids, wizards).

**Competitive Position.** Ahead of Stagehand/browser-use/UI-TARS (none have a real recorder); comparable to Playwright codegen on capture breadth but Conxa captures frames better. The recorder is Conxa's wedge — and it is under-invested relative to its strategic weight.

---

### 2. Workflow Capture (events → normalized stream)

**Current Architecture.** `pipeline/normalize.py → dedupe.py → enrich.py → selectors.py`. Canonicalizes actions, filters noise, collapses rapid-fire, adds DOM snapshot refs + surrounding text, extracts raw selector candidates.

**Strengths.** Clean staged pipeline; deterministic; separates capture from compilation.

**Weaknesses.** Enrichment leans on LLM downstream rather than maximizing deterministic signal extraction here. No explicit representation of "this step is optional" or "one-of these states."

**Risks / Debt.** Dedupe heuristics can drop legitimately repeated actions; no schema-versioned event contract guarantee across recorder/pipeline changes.

**Scalability.** Fine (local, bounded by workflow length).

**Missing.** Branch/optional detection; capture-time validation hints.

**Enterprise Readiness.** Medium. **Competitive Position.** No real competitor at this layer; Conxa is differentiated simply by *having* a compile pipeline.

---

### 3. Browser Intelligence (selector/element identity generation)

**Current Architecture.** `compiler/llm_selector_generator_v2.py`, `selector_score.py`, `selector_filters.py`. LLM generates `ElementFingerprint` (role, tag, inner_text, aria_label, name, placeholder, label_text, data_testid, input_type, css_class_tokens, anchor_phrases, position_hint) + ranked `compiled_selectors[]`. `selector_score.py` (85 lines) scores at compile time.

**Strengths.** Multi-signal fingerprint is conceptually aligned with the research's #3 insight (orthogonal multi-signal identity). data-testid prioritized. Anchor phrases + position hint give relational context.

**Weaknesses.** **Scoring is compile-time only; the runtime ignores it** (tries selectors in order). The fingerprint is emitted but the runtime never *scores live DOM candidates against it* — so the "stable identity to score against" (TRD §10.2) is aspirational. Selector generation is **LLM-dependent**; there is no deterministic Playwright-style generator (research insight #3: mine `selectorGenerator`) as a floor/fallback. Ordering is by generator preference, not by the empirically-correct durability order (semantic > structural; research `research-audit.md` C.1).

**Risks.** LLM variance in selector quality; cost; no deterministic fallback if the LLM is unavailable mid-compile.

**Technical Debt.** Two generators present (`llm_selector_generator.py` and `_v2.py`) — versioned drift.

**Scalability.** Compile cost scales with steps × LLM latency.

**Missing.** Runtime fingerprint scoring; deterministic selector generation; orthogonality guarantee (so one DOM change can't break all signals); live uniqueness gate.

**Enterprise Readiness.** Medium. **Competitive Position.** Conceptually ahead of everyone (no one else compiles durable multi-signal identity), but the *runtime* doesn't yet exploit it, so the realized advantage is smaller than claimed.

---

### 4. Workflow Understanding (intent graph)

**Current Architecture.** `llm/intent_llm.py` → `WorkflowIntentGraph` (goal, steps, decision_points), one high-token call per workflow with full DOM context. `intent_access.py`, `intent_validation_rules.py`, `decision_layer.py`.

**Strengths.** Conxa is the *only* system in the corpus that builds an explicit intent representation of a workflow at compile time. `decision_points` hints at branch awareness. This is a genuine differentiator and aligns with the "deep understanding at compile" philosophy.

**Weaknesses.** The intent graph's `decision_points` are not yet first-class *executable* branches in the runtime (no conditional steps in `run.js`). Understanding is used to enrich selectors/anchors, not to make the plan *adaptive*. Single large LLM call = cost + variance.

**Risks.** Intent graph quality gates the whole compile; no deterministic validation that the graph matches the recorded events.

**Technical Debt.** `intent_validation_rules.py` exists but coverage unknown.

**Missing.** Intent → conditional execution wiring; intent-driven assertion generation; intent as the durability anchor (re-grounding should match recorded intent, not just selectors).

**Enterprise Readiness.** Medium. **Competitive Position.** Strongly ahead conceptually; under-exploited at runtime.

---

### 5. Enrichment

**Current Architecture.** `pipeline/enrich.py` + `llm/semantic_llm.py` (per-step semantic_description) + `anchors/` + `confidence/layered.py`.

**Strengths.** Per-step semantic description + relational anchors + layered confidence is a rich compiled artifact. Confidence scoring exists at compile time.

**Weaknesses.** Enrichment is LLM-heavy (semantic call per step). Confidence is computed but **not used at runtime** to set per-step timeout budgets or recovery aggressiveness (research: confidence-aware budgets). Anchors are emitted but used only as fuzzy-text fallbacks in `run.js`, not as a primary durable signal.

**Risks / Debt.** Cost per step; confidence may be decorative if nothing consumes it downstream.

**Missing.** Runtime consumption of confidence; anchor-based primary resolution; capture-time enrichment to reduce LLM dependence.

**Enterprise Readiness.** Medium. **Competitive Position.** Ahead — no competitor enriches like this — but the runtime leaves value on the table.

---

### 6. Compiler

**Current Architecture.** `compiler/build.py::compile_skill_package()` orchestrates: intent graph (1 LLM call) → per-step [selector gen LLM, semantic LLM, validation_planner, recovery_policy, confidence] → `SkillPackage`. ~11k lines across `conxa_compile/`. Outputs execution.json / recovery.json / inputs.json.

**Strengths.** This is Conxa's crown jewel and the real moat: an **ahead-of-time compiler from recording to a deterministic, multi-signal, self-describing skill package.** No competitor has this. `validation_planner.py` (319 lines) generates assertions. `recovery_policy.py` emits intent-driven recovery strategies/anchors. Clean separation of concerns.

**Weaknesses.** Heavy LLM dependency (4–5 calls/step) → compile cost + non-determinism in the artifact. No intermediate representation (IR) that is model-agnostic and diffable — the pipeline goes events → LLM → SkillPackage with no stable IR in between, making optimization, validation, and versioning harder. No compile-time *workflow* validation (does the plan actually achieve the intent?) beyond per-step assertions. Versioning is by `skill_pack_version` string; no semantic version graph, no rollback IR.

**Risks.** Compile reproducibility (same recording → different package across runs); cost scaling; the artifact's quality is only as good as the LLM calls and there's no deterministic floor.

**Technical Debt.** Dual selector generators; `stub.py`; v3.py vs build.py layering.

**Scalability.** Compile credits metered (good), but per-step LLM count is the cost driver.

**Missing.** Model-agnostic IR; workflow-level validation/optimization; deterministic selector floor; assertion-from-intent automation; reproducible/pinned compiles.

**Enterprise Readiness.** Medium-High (it works and is metered). **Competitive Position.** **The strongest moat in the whole system** — but it's a single point of brittleness (the artifact is static; drift requires recompile) and it's LLM-bound.

---

### 7. Runtime

**Current Architecture.** `runtime/run.js` (774 lines) — step executor with handlers per action type; `runPlan` loops steps with human-like pacing, executes the primary action, and on failure invokes the deterministic `recoverStep` ladder. `server.js` (1043 lines) is the MCP server orchestrating browser lifecycle, execution lock, auth re-auth loop, telemetry, and host-delegated recovery payloads. Aggressive timeouts (`ACTION_TIMEOUT_MS=700`).

**Strengths.** Genuinely deterministic hot path — zero LLM in normal execution (invariant upheld). Frame-aware locator resolution. Human-like pacing for watchability/anti-bot. Auth-failure self-heal is excellent. Integrity gate + retry budget + execution lock + cancellation. Download handling.

**Weaknesses.** **No actionability "stable" gate** (research #8) — `withLocator` waits for `visible` then acts; the 700ms timeout makes it fail-fast and potentially flaky on slow/animated UIs. **No fingerprint scoring** of live candidates. **No independent post-condition verification.** Recovery ladder is fixed (no confidence-driven ordering). `clickFirst`'s intercept handling is a one-line `last()` retry vs SeleniumBase's classified ladder. No execution checkpointing/resume beyond `resume_from` index (state.json/checkpoint.json dirs exist in TRD but `run.js` doesn't write step-level checkpoints in the read path).

**Risks.** 700ms timeout + no stable gate = timing-class flakiness escalating to host-delegated recovery (which halts the run and requires Claude/human). On enterprise SPAs this could be frequent.

**Technical Debt.** Timeout constants are aggressive and env-tuned rather than adaptive; recovery ladder is hand-rolled in one file.

**Scalability.** Local, single execution lock per runtime — fine per machine; no concurrency model (acceptable for the design).

**Missing.** Stable actionability gate; exception-classified deterministic ladder (SeleniumBase); confidence-aware timeouts; independent outcome verification; checkpoint/resume on crash.

**Enterprise Readiness.** Medium. Works, but reliability rests on the deterministic ladder catching everything — and the timing weaknesses make that less certain than the marketing implies.

**Competitive Position.** The *deterministic replay* concept is ahead of the field (the convergence point — `ecosystem-synthesis.md`). The *execution robustness* (timing, post-conditions) is behind Playwright/SeleniumBase today.

---

### 8. Recovery

**Current Architecture.** Two layers. **(a) Deterministic, in `run.js` `recoverStep`:** compiled-selector alternates → a11y (role+name / text) → 250ms transient retry → fallback selectors (candidates, text variants, anchor text) → dialog-scoped → fuzzy text-match by tag. **(b) Host-delegated, in `server.js`:** on full deterministic failure, build a payload (failure message, resume hint, pre-step screenshot, reference image, current-page JPEG, viewport+scrollY, 50-element interactive DOM digest, "Layer 4 vision / Layer 5 intent" labels) and **return it to Claude Desktop**, which is expected to fix the selector and re-invoke with `resume_from`. Plus the **auth re-auth** self-heal.

**Strengths.** The deterministic ladder is richer than documented and genuinely zero-token (invariant upheld). Dialog-scoping and fuzzy text are pragmatic. Host-delegation is *cost-clever* — it reuses the LLM already present (Claude Desktop) instead of calling a paid API, preserving "runtime doesn't call LLM." Auth re-auth is best-in-class for session expiry.

**Weaknesses.** **It is not autonomous self-healing.** Tiers "3/4/5" require a human/Claude round-trip; the workflow halts. **No write-back:** when Claude fixes a selector and resumes, the corrected identity is *not persisted to the skill package* — the next run hits the same failure (confirmed in code; matches research `research-audit.md` C.3). **No fingerprint scoring**, no confidence threshold consumption, no classified-by-cause escalation. **No repair validation** beyond "did the resumed step throw." Recovery telemetry exists (`tier_ok`, `rec_ok`, `rec_start l:5`) but is not aggregated for fleet learning.

**Risks.** The marketed "self-healing" is, in practice, "assisted manual resume." For unattended/scheduled enterprise runs (no human watching), Tier 3+ effectively means *failure*, because there's no autonomous re-grounding and no human to delegate to. This is the biggest reliability risk in the platform.

**Technical Debt.** Recovery logic split across run.js (ladder) and server.js (payload) with overlapping "layer" numbering that doesn't match the doc's tier numbering.

**Scalability.** Deterministic ladder is cheap; host-delegation doesn't scale to unattended fleets.

**Missing.** Autonomous in-runtime (host-sampled) re-grounding; healed-selector write-back; confidence/cause-classified escalation; repair validation; fleet-level recovery aggregation; conditional handling of stochastic states.

**Enterprise Readiness.** Low-Medium. Attended runs degrade gracefully; **unattended runs do not self-heal.**

**Competitive Position.** Deterministic floor is ahead of Stagehand/browser-use (which jump straight to LLM). Autonomous self-healing is *behind* Stagehand (which re-grounds and refreshes its cache automatically). **This is the gap between Conxa's story and Conxa's code.**

---

### 9. Vision

**Current Architecture.** Compile-time: `anchor_vision_llm.py` / `vision_llm.py` can emit visual anchors / reference images per step (optional). Runtime: vision is **not executed** — `server.js` includes screenshots + reference image in the host-delegated recovery payload ("Layer 4 — vision recovery") for Claude Desktop to interpret. No coordinate grounding, no scaleFactor handling, no OS-ATLAS-style grounder.

**Strengths.** Reference images captured at compile give the host a ground-truth visual at recovery. Vision is correctly *not* the primary path (philosophy upheld). Host-delegation keeps vision cost off Conxa's books.

**Weaknesses.** Vision is entirely passive (a payload), not an actionable recovery tier. No coordinate→DOM re-anchoring, no scaleFactor normalization (research #23), no SoM annotation/telemetry. The compile-time `visual_ref` is used only as an image attachment.

**Risks.** On DOM-hostile surfaces (canvas, custom widgets), there is no working vision fallback — only "show Claude a picture."

**Missing.** A real Tier-4 vision recovery (grounder → bbox → re-derive selector → outcome-check); scaleFactor; SoM-as-telemetry; bbox anchors to narrow search.

**Enterprise Readiness.** Low. **Competitive Position.** Behind UI-TARS on vision execution (intentionally), but lacks even a minimal actionable vision fallback.

---

### 10. MCP

**Current Architecture.** `server.js` — `@modelcontextprotocol/sdk` stdio server exposing 9 tools (`list_skills`, `execute_skill`, `execute_sequence`, `get_skill_inputs`, `get_execution_status`, `cancel_execution`, `refresh_skills`, `get_runtime_status`, `read_skill_files`) plus dynamic per-skill tools (`skill_{company}_{slug}`). Closed-world: the LLM calls `execute_skill`, the skill replays deterministically.

**Strengths.** **This is architecturally correct and ahead of playwright-mcp's philosophy** (`high-value-repo-review.md`): closed-world skill verbs, not open-world atomic browser tools — determinism, auditability, and licensing all flow from this. Integrity gate, runtime-compat (semver) gate, in-band errors, execution lock, cancellation, status. Stdio-only (correct for Claude Desktop). Dynamic per-skill tools reduce discovery round-trips.

**Weaknesses.** Not refactored to a clean `ServerBackend` seam (research #5) — server.js is a 1043-line monolith mixing protocol, browser lifecycle, recovery, and telemetry. No entitlement filtering of advertised skills (license-gated `list_skills`). No first-class "human handoff / pause" tool for recovery escalation. Recovery payload semantics ("Layer 4/5") are ad hoc.

**Risks / Debt.** Monolith coupling makes the runtime hard to evolve and test.

**Missing.** ServerBackend seam; entitlement filtering; formal escalation/handoff tool; per-skill capability annotations.

**Enterprise Readiness.** Medium-High. **Competitive Position.** Philosophically ahead of the entire field; engineering hygiene (separation) is behind playwright-mcp.

---

### 11. Skill Packaging

**Current Architecture.** `plugin_builder.py` → data-only folder (plugin.json, CLAUDE.md, index.md, pack.json, skills/*/{execution,recovery,inputs}.json). `installer_builder.py` → NSIS per-user `.exe` that installs pack + runtime + Chromium and registers MCP. Auth-exclusion guard enforced. `sync.js` delta sync with SHA-256 atomic writes; sync_token embedded.

**Strengths.** **Signed-ish, versioned, distributable artifact** — the unit of value no competitor has (`top-25-insights.md` #9). Data-only (no code execution surface). Auth never shipped (invariant). Atomic, verified sync. Self-updating runtime. This is a genuine moat.

**Weaknesses.** Delta sync ships **all files** on any version change (TRD §5.6, "simplified") — no per-file diff. No cryptographic *signing* of packages (sync_token is a bearer secret, not a signature; integrity gate checks a manifest hash, not a publisher signature). No rollback IR / version history at the pack level. No package-level compatibility fingerprint against the target app version (research #19).

**Risks.** Unsigned packages → supply-chain/tamper risk at enterprise scale; full-file delta → bandwidth; no rollback → a bad publish is hard to revert cleanly.

**Technical Debt.** "Simplified" delta; in-memory rate limit; public installer download (slug = only credential).

**Missing.** True per-file delta; package signing; version history + rollback; app-version compatibility fingerprint; CDN/blob storage (base64-in-Postgres won't scale).

**Enterprise Readiness.** Medium. The artifact model is enterprise-grade in concept; signing, rollback, and delta efficiency are not there yet.

**Competitive Position.** Ahead of everyone (no competitor distributes compiled skills). Hardening needed to be enterprise-defensible.

---

### 12. Cloud Runtime (coordination layer)

**Current Architecture.** FastAPI on Render (free plan, ephemeral disk) + Next.js on Vercel. LLM proxy/metering, skill-pack hosting (durable in Postgres KV, disk as cache), telemetry ingest, billing (Razorpay), entitlements (4 meters), publish/installer upload. Multi-provider LLM router (Groq, Google AI Studio, NVIDIA NIM) with round-robin + cooldown + failover. Does NOT compile or execute (invariant upheld).

**Strengths.** Clean coordination-only design. Durability gap closed (KV-in-Postgres). Multi-provider router with failover is pragmatic and cost-aware. Entitlement metering (compile credits, human-edit tokens, seats, installer slots) is real and wired. Telemetry pipeline exists end-to-end.

**Weaknesses.** Render free plan (ephemeral, cold starts) — not production-grade for an enterprise control plane. Rate limiting in-memory (not shared). No Redis (nonce/rate/queue all need it). `worker.py` queue is scaffold-only. **Telemetry is ingested but not turned into fleet intelligence** — no drift detection, no cross-customer recovery aggregation (the flywheel, `top-25-insights.md` #1, is *not* built). RBAC scaffolded but not wired to routes (TRD §17, High severity).

**Risks.** Single-region, free-tier host for a system that wants to be enterprise control plane; base64-in-Postgres for installers won't scale; no fleet-learning means the strongest potential moat is dormant.

**Technical Debt.** Stripe orphan fields; Aptfile leftovers; in-memory caches; scaffolded worker/RBAC.

**Scalability.** Medium-Low as currently hosted; the *design* scales, the *deployment* doesn't.

**Missing.** Fleet drift detection + recovery aggregation (the flywheel); Redis-backed shared state; durable queue; production hosting; per-file delta service.

**Enterprise Readiness.** Low-Medium (hosting + RBAC + fleet intelligence all gaps).

**Competitive Position.** The coordination-only model is correct and differentiated. The fleet-intelligence opportunity — the one structurally uncopyable moat — is **completely untapped.**

---

### 13. Enterprise Infrastructure

**Current Architecture.** Clerk auth (Studio PKCE, Cloud JWT). Per-company sync token + per-machine AES-256-GCM session key. Audit log for publish/installer/plugin events (DONE). Workspace/Principal model with roles. Razorpay billing + 4-meter entitlements. RBAC scaffold (`rbac.py`, not wired).

**Strengths.** Sound auth separation (sync token ≠ session key — leaked installer can't decrypt sessions). Audit log exists. Workspace scoping in telemetry. Entitlement model is real.

**Weaknesses.** **RBAC not enforced on routes** (High). No SSO/SAML (Phase 3 item). No device/runtime registration enforcement (phone-home exists, but no fleet visibility/management). No tenant isolation beyond workspace_id filtering (shared KV namespaces). No compliance package (SOC2/audit-export). No on-prem option. Installer download fully public.

**Risks.** Enterprise deals will require SSO, RBAC enforcement, tenant isolation, compliance attestation, and runtime fleet management — most are scaffold or absent. `Sales-Blockers.md` likely enumerates these.

**Missing.** Wired RBAC; SSO/SAML; runtime fleet registry + management; tenant isolation guarantees; compliance/audit export; on-prem/air-gapped deployment; per-user runtime identity.

**Enterprise Readiness.** Low-Medium. The platform can sell to SMB/mid-market; true enterprise (regulated) needs a meaningful build-out.

**Competitive Position.** The *deterministic + auditable + signed-artifact* posture is the right enterprise story (better than agent tools), but the enterprise *plumbing* (RBAC, SSO, isolation, compliance) is immature.

---

## Subsystem Scorecard

Build maturity (how much of the intended design is *implemented* and robust) vs Strategic strength (how differentiated the *concept* is). 1–5.

| Subsystem | Build Maturity | Strategic Strength | Headline gap |
|---|---|---|---|
| Recording | 3 | 5 | Intent/validation/conditional capture missing |
| Workflow Capture | 3 | 3 | No branch/optional semantics |
| Browser Intelligence | 3 | 5 | Runtime ignores the fingerprint; no deterministic floor |
| Workflow Understanding | 3 | 5 | Intent graph not wired to adaptive execution |
| Enrichment | 3 | 4 | Confidence/anchors not consumed at runtime |
| Compiler | 4 | 5 | No IR; LLM-bound; not reproducible; no rollback |
| Runtime | 3 | 5 | No stable gate, no scoring, no post-conditions |
| Recovery | 2 | 5 | Not autonomous; no write-back; not unattended-safe |
| Vision | 1 | 3 | Passive payload, not an actionable tier |
| MCP | 4 | 5 | Monolith; no ServerBackend seam; no entitlement filter |
| Skill Packaging | 3 | 5 | No signing/rollback; full-file delta |
| Cloud Runtime | 3 | 4 | Fleet intelligence untapped; hosting weak |
| Enterprise Infra | 2 | 4 | RBAC/SSO/isolation/compliance immature |

**The pattern is unmistakable:** strategic strength is consistently 4–5 (the *ideas* are differentiated and correct), build maturity is consistently 2–3 (the *implementation* trails the concept), and the worst maturity gaps (Recovery, Vision, Enterprise Infra) are precisely where the marketed differentiation lives. **Conxa's job for the next 24 months is to close the maturity gap on the concepts it has already chosen correctly — not to find new ideas.**
