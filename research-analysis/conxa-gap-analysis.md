# Conxa Gap Analysis (Phase 3)

Per-subsystem gap from *current implemented state* to *target state*, with Difficulty / Risk / Complexity / Expected Benefit and three benefit axes (Reliability / Enterprise / Strategic), then a single ROI ranking across all gaps.

**Scales.** Difficulty/Risk/Complexity: Low / Med / High. Benefit axes: 1–10. **ROI** = (Reliability+Enterprise+Strategic)/3 weighted down by Difficulty×Complexity — expressed as a final 1–10 with the ranking below.

Grounding: `conxa-current-state-assessment.md`, `conxa-vs-state-of-the-art.md`, `master-insights-v2.md`. Philosophy constraints from the program brief are enforced (no recommendation puts the LLM in the deterministic hot path).

---

## Gap Table

### G1 — Recovery: autonomous self-healing + write-back
- **Current:** Deterministic ladder, then host-delegated manual resume; no write-back; unattended-unsafe.
- **Target:** Autonomous re-grounding via host MCP sampling at Tier 3, describe-then-match against recorded intent, repair validated by independent post-condition, healed selector used ephemerally + emitted to Cloud for re-sign. Unattended runs self-heal or escalate cleanly.
- **Difficulty:** High · **Risk:** Med · **Complexity:** High
- **Reliability:** 10 · **Enterprise:** 9 · **Strategic:** 9
- **ROI:** **9** — closes the single biggest story-vs-code gap; makes "self-healing" true.

### G2 — Runtime: post-condition verification (independent outcome check)
- **Current:** `verifyAssertions()` not wired; only explicit `assert` step types run.
- **Target:** Every step (esp. recovered ones) verified against a compiled post-condition fingerprint via an independent channel before advancing.
- **Difficulty:** Med · **Risk:** Low · **Complexity:** Med
- **Reliability:** 10 · **Enterprise:** 8 · **Strategic:** 8
- **ROI:** **9** — converts recovery success-rate into correctness; field-wide blind spot; cheap relative to impact.

### G3 — Cloud: fleet drift detection + recovery aggregation (the flywheel)
- **Current:** Telemetry ingested; no fleet intelligence; drift detection planned (Impl-Plan 2.2), not built.
- **Target:** Aggregate recovery/breakage telemetry across all customers of a skill; detect drift on first occurrence; push re-signed packages pre-emptively.
- **Difficulty:** High · **Risk:** Med · **Complexity:** High
- **Reliability:** 8 · **Enterprise:** 8 · **Strategic:** 10
- **ROI:** **9** — the only structurally uncopyable moat; compounds with scale.

### G4 — Runtime: actionability gates + exception-classified ladder
- **Current:** `visible`-then-act, 700ms fail-fast; one-line intercept fallback.
- **Target:** attached→visible→**stable(RAF)**→enabled gate; classified ladder (stale→re-find, intercepted→JS-dispatch, OOB→re-scroll) before escalation; confidence-aware timeouts.
- **Difficulty:** Med · **Risk:** Low · **Complexity:** Med
- **Reliability:** 9 · **Enterprise:** 6 · **Strategic:** 6
- **ROI:** **8** — kills a whole flakiness class at zero token cost; well-understood, copyable from Playwright/SeleniumBase.

### G5 — Compiler/Runtime: wire fingerprint scoring + deterministic floor
- **Current:** Compile-time `ElementFingerprint` + `selector_score.py`, but runtime tries selectors in order; no live scoring; LLM-only generation.
- **Target:** Runtime scores live candidates against the fingerprint with a live uniqueness gate; emit *orthogonal* signals ordered by durability (semantic>structural); add a deterministic Playwright-style generator floor.
- **Difficulty:** Med · **Risk:** Low · **Complexity:** Med
- **Reliability:** 9 · **Enterprise:** 6 · **Strategic:** 7
- **ROI:** **8** — makes the multi-signal investment actually pay off at runtime; fixes the C.1 ordering contradiction.

### G6 — Skill format: conditional / optional / branch steps
- **Current:** Linear replay only; stochastic states (banners, interstitials, MFA) break plans. (Impl-Plan 4.1 planned.)
- **Target:** First-class `if_present`, `try_dismiss`, `wait_for_one_of` in the package; intent graph's decision_points wired to execution.
- **Difficulty:** Med · **Risk:** Med · **Complexity:** Med
- **Reliability:** 9 · **Enterprise:** 8 · **Strategic:** 7
- **ROI:** **8** — deterministic replay is brittle exactly where enterprise flows are messy; unblocks reliability on real sites.

### G7 — Durability: breakage detection + change classification + repair suggestion
- **Current:** None. (Depends on G3 telemetry.)
- **Target:** Detect package drift; classify change (text/DOM/layout/flow); generate + validate repair suggestions; regression-test before republish.
- **Difficulty:** High · **Risk:** Med · **Complexity:** High
- **Reliability:** 9 · **Enterprise:** 9 · **Strategic:** 10
- **ROI:** **8** — "workflows survive for years" is the durability promise; depends on G2/G3 primitives.

### G8 — Enterprise: wire RBAC + SSO/SAML + tenant isolation
- **Current:** RBAC scaffolded/unwired (High debt); no SSO; workspace-id filtering only.
- **Target:** RBAC enforced on all routes; SSO/SAML; hard tenant isolation; per-user runtime identity.
- **Difficulty:** Med · **Risk:** Med · **Complexity:** Med
- **Reliability:** 4 · **Enterprise:** 10 · **Strategic:** 7
- **ROI:** **7** — gates enterprise deals (Sales-Blockers); not reliability but revenue-critical.

### G9 — Skill packaging: signing + per-file delta + rollback
- **Current:** Bearer sync_token (not a signature); full-file delta; no rollback.
- **Target:** Cryptographically signed packages; true per-file SHA-256 delta; version history + one-click rollback; app-version compatibility fingerprint.
- **Difficulty:** Med · **Risk:** Low · **Complexity:** Med
- **Reliability:** 6 · **Enterprise:** 9 · **Strategic:** 7
- **ROI:** **7** — supply-chain integrity + bandwidth + safe publish; enterprise-defensibility.

### G10 — Compiler: model-agnostic IR + reproducible/pinned compiles
- **Current:** events → LLM → SkillPackage; no IR; not reproducible; 4–5 LLM calls/step.
- **Target:** Diffable IR between events and package; reproducible compiles (pinned); deterministic floors reduce LLM calls; optimization pass.
- **Difficulty:** High · **Risk:** Med · **Complexity:** High
- **Reliability:** 6 · **Enterprise:** 7 · **Strategic:** 8
- **ROI:** **6** — foundational for durability/rollback/optimization, but a large refactor with deferred payoff.

### G11 — MCP: ServerBackend seam + entitlement filtering + handoff tool
- **Current:** 1043-line monolith; no entitlement filter; ad-hoc recovery payloads.
- **Target:** Clean harness/registry/backend separation; license-gated `list_skills`; first-class escalation/handoff tool.
- **Difficulty:** Med · **Risk:** Low · **Complexity:** Med
- **Reliability:** 5 · **Enterprise:** 8 · **Strategic:** 6
- **ROI:** **6** — engineering hygiene + licensing; enables faster, safer evolution of the runtime.

### G12 — Recording: intent/validation/confidence/conditional capture + WorkArena interactions
- **Current:** DOM-event capture; context reconstructed by LLM later; weak typeahead/grid handling.
- **Target:** Capture intent hints, post-conditions, confidence, conditional states, and the WorkArena-critical interactions at record time.
- **Difficulty:** Med · **Risk:** Med · **Complexity:** Med
- **Reliability:** 7 · **Enterprise:** 8 · **Strategic:** 7
- **ROI:** **6** — improves everything downstream and reduces compile LLM dependence; the wedge deserves investment.

### G13 — Vision: minimal actionable Tier-4
- **Current:** Passive screenshot payload to host.
- **Target:** Grounder→bbox→re-derive selector→outcome-check, scaleFactor, SoM-as-telemetry; bbox anchors to narrow search.
- **Difficulty:** Med · **Risk:** Med · **Complexity:** Med
- **Reliability:** 5 · **Enterprise:** 4 · **Strategic:** 5
- **ROI:** **4** — necessary completeness for DOM-hostile surfaces; deliberately low priority (rare tier).

### G14 — Cloud: production hosting + Redis + durable queue + per-file delta service
- **Current:** Render free tier (ephemeral); in-memory rate/nonce; scaffold worker; base64-in-Postgres.
- **Target:** Production hosting; Redis-backed shared state; durable job queue; blob/CDN storage.
- **Difficulty:** Med · **Risk:** Low · **Complexity:** Med
- **Reliability:** 5 · **Enterprise:** 7 · **Strategic:** 5
- **ROI:** **5** — table-stakes ops hardening; prerequisite for G3/G7 at scale.

---

## ROI Ranking (highest first)

| Rank | Gap | ROI | Why it ranks here |
|---|---|---|---|
| 1 | **G1 — Autonomous recovery + write-back** | 9 | Makes the marketed differentiator real; unattended reliability |
| 2 | **G2 — Post-condition verification** | 9 | Correctness guarantee; cheap; field-wide blind spot |
| 3 | **G3 — Fleet drift flywheel** | 9 | Only uncopyable moat; compounds |
| 4 | **G4 — Actionability gates + classified ladder** | 8 | Kills flakiness class; zero-token; easy win |
| 5 | **G5 — Runtime fingerprint scoring + det. floor** | 8 | Cashes in the multi-signal investment |
| 6 | **G6 — Conditional/branch steps** | 8 | Reliability where enterprise flows are messy |
| 7 | **G7 — Breakage detection + repair** | 8 | "Survive for years"; depends on G2/G3 |
| 8 | **G8 — RBAC/SSO/tenant isolation** | 7 | Gates enterprise revenue |
| 9 | **G9 — Signing + delta + rollback** | 7 | Supply-chain + safe publish |
| 10 | **G10 — Compiler IR + reproducibility** | 6 | Foundational; large refactor |
| 11 | **G11 — ServerBackend seam + entitlement** | 6 | Hygiene + licensing |
| 12 | **G12 — Richer recording capture** | 6 | Improves all downstream; the wedge |
| 13 | **G13 — Actionable vision Tier-4** | 4 | Completeness; rare tier |
| 14 | **G14 — Cloud ops hardening** | 5 | Table-stakes; prereq for scale |

**Dependency notes.** G2 is a prerequisite for trustworthy G1 and G7 (you can't validate a repair without a post-condition). G3 is a prerequisite for G7 (fleet telemetry feeds breakage detection). G14 underpins G3/G7 at scale. G5 and G4 are independent quick wins. The natural critical path: **G4+G2 (robust, verified deterministic floor) → G1 (autonomous verified recovery) → G3 (fleet aggregation) → G7 (durability) → G6/G12 (adaptive capture+replay)**, with enterprise plumbing (G8/G9/G11/G14) sequenced against sales need.
