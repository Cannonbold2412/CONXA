# Master Insights — Conxa Architecture Intelligence

This is the canonical distilled insight set from the whole research corpus (six competitor repos +
seven papers). It exists in two complementary views:

- **Part 1 — By strategic priority** (below): the insights grouped and argued under the priority
  order **Reliability → Determinism → Enterprise readiness → Competitive advantage → Long-term
  defensibility**, with full rationale and Conxa placement for each.
- **Part 2 — Ranked 1–25 with scores** (appendix): the same insights flattened into a single
  highest-value-first list with Impact / Complexity / Risk scores, for prioritization.

> **Provenance.** This document is the corrected, re-ranked successor to an earlier draft. The
> correction pass — which removed generic/over-ranked items, fixed internal contradictions, and
> named the missing moat — is documented in [`research-audit.md`](research-audit.md). Key fixes it
> applied: dropped scaleFactor normalization from the top tier (→ Tier-4 footnote); replaced the
> invented signal-weight vector `[0.4,0.3,0.2,0.1]` with an ordered fallback model; replaced
> "update cache in place" with telemetry write-back; corrected cascade ordering (CSS-first →
> **durability-first**); replaced auto-ARIA-after-every-action with a **post-condition assertion**
> for the closed-world case; and added the independent post-condition probe, conditional/branching
> steps, the freshness-liability heal loop, and the fleet-level drift-detection flywheel.

---

# Part 1 — Insights by Strategic Priority

## RANK 1 — RELIABILITY

### R1. Pair every recovered or forced action with an independent post-condition assertion
**Sources:** Stagehand (independent AX probe) + WebArena/WorkArena (functional success) + the shared blind spot of SeleniumBase/browser-use/UI-TARS.
**Insight:** Five of six tools cannot tell "the action didn't throw" from "the intended state occurred." SeleniumBase's forced JS clicks can fire on nothing; browser-use reflection and UI-TARS SoM record *belief*, not *outcome*. The fix is a live, independent probe (re-read the AX tree / target state by a path the action didn't use) checked against a **compiled post-condition fingerprint**.
**Why #1:** It is the single change that converts a high recovery *success rate* into a trustworthy recovery *correctness* guarantee. Without it, every higher recovery tier risks confident false success — the worst enterprise failure mode.
**Conxa placement:** Runtime emits a post-condition check after every step (not just recovered ones); Compiler emits the expected-state fingerprint as a first-class asset alongside element identity.

### R2. Deterministic-first recovery ladder, classified by failure type, escalating by invasiveness
**Source:** SeleniumBase.
**Insight:** Typed exception → typed remedy: `StaleElement`→re-find, `Intercepted`→JS-dispatch, `OutOfBounds`→re-scroll, benign driver noise→swallow; escalate re-find < native < JS < protocol, each gated on the prior throwing. Recovers the majority of real flakiness at zero tokens.
**Why high:** Most "selector" failures are timing/overlay/staleness failures and are deterministically recoverable *before* identity or models matter. This is the content of Tier 1.
**Correction:** every forced rung must be paired with R1 (outcome check) — SeleniumBase's own gap.

### R3. Actionability gates before every action: attached → visible → **stable(RAF)** → enabled
**Source:** Playwright.
**Insight:** Re-query and poll the readiness stack before acting; the `stable` (bounding-box unchanged across animation frames) check is the differentiator most frameworks omit.
**Why high:** Eliminates a whole class of failures (animated/lazy/disabled targets) that would otherwise escalate to expensive tiers. Pure zero-token reliability.

### R4. Conditional / optional / branch steps in the skill format
**Sources:** SeleniumBase conditional verbs (`click_if_visible`, `goto_if_not_url`, boolean probes) + WorkArena compositional reality.
**Insight:** Linear replay cannot model states that are *sometimes present* — cookie/consent banners (~30–50% of loads), session-expired interstitials, optional MFA, A/B variants. The SkillPackage needs first-class `if_present(selector)→steps`, `try_dismiss`, and `wait_for_one_of` branch points (SeleniumBase's `wait_for_any_of_elements` generalized).
**Why high:** This is where deterministic replay is *most* brittle and where enterprise flows are *messiest*. Without it, "deterministic" breaks on the first stochastic banner. A reliability item, not a feature.

---

## RANK 2 — DETERMINISM

### D1. Compile to orthogonal multi-signal identity — and order resolution by durability, not cost
**Sources:** Playwright (scored generator) + Mind2Web (semantic > structural, empirically).
**Insight:** (a) At compile time, force generation of N *engine-orthogonal* selectors (role+name / text / testid / structural CSS / XPath), not one collapsed selector — orthogonality, so one DOM change can't kill all signals. (b) At runtime, resolve as an **ordered fallback with a live uniqueness gate** (Playwright's unique-match rule re-run on the live DOM), **ordered by stability: semantic first, structural last** — because both Tier 1 and Tier 2 are zero-token, so the tie-break is success probability, not microseconds.
**Corrections applied:** dropped the invented weight vector (resolution is a fallback sequence, not a weighted average); corrected the CSS-before-ARIA ordering.
**Why #1 of determinism:** This is the identity model the whole replay guarantee rests on.

### D2. Element identity is a late-bound serializable description, re-resolved every attempt
**Source:** Playwright.
**Insight:** Store `(frame-chain, signal-set)`, never a node handle. Re-query is free; stale handles are impossible by construction.
**Why high:** The foundational invariant that makes compiled replay robust to re-renders.

### D3. Frame/shadow traversal encoded *in* the identity, not in imperative code
**Source:** Playwright (`internal:control=enter-frame`, shadow-piercing as a flag).
**Insight:** The iframe chain and shadow path travel *with* the element through compile and replay (serving the "iframe chain preserved verbatim" invariant), keeping recovery correctly frame-scoped.
**Why elevated:** The hardest part of enterprise automation (Salesforce/ServiceNow are iframe+shadow heavy). A determinism *and* enterprise-moat item.

### D4. Compile ahead of time, never lazily at runtime
**Source:** Stagehand (as a cautionary contrast — its cold/miss path is unbounded).
**Insight:** Stagehand proves the *value* of a compiled action but its lazy grounding leaves the cold path expensive and non-deterministic on the customer's machine. Conxa compiles in Build Studio so the customer never pays grounding cost or non-determinism.
**Why high:** Defends the core architectural choice against the tempting "just cache it lazily" path.

---

## RANK 3 — ENTERPRISE READINESS

### E1. Describe-then-ground for the LLM recovery tier (never emit a selector directly)
**Source:** SeeAct (30% hallucination if skipped).
**Insight:** Tier 3 = LLM emits `{action, target_description, argument}`; a deterministic matcher resolves the description against the live AX tree — and, uniquely for Conxa, against the **recorded target's original signals** jointly (an advantage SeeAct lacks). Pre-filter the AX tree to <500 nodes (WorkArena) before the call.
**Why enterprise:** Makes the one non-deterministic tier *trustworthy and bounded* — the precondition for SLAs.

### E2. The MCP runtime is a closed-world skill server, not an open-world tool server
**Source:** Playwright MCP (as an anti-model).
**Insight:** Adopt the three-layer `ServerBackend` harness; **invert** the tool philosophy — expose a tiny verb set (`execute_skill`, `list_skills`, …), keep all element resolution *inside* the compiled skill, and drop the `openWorldHint` framing. Extend capability filtering into **entitlement filtering** (advertise only licensed skills).
**Why enterprise:** Determinism, auditability, and licensing are all enterprise gates; open-world atomic tools surrender all three to the model.

### E3. Outcome-based success criteria + version-pinned regression environments
**Sources:** WebArena + WorkArena.
**Insight:** Define success as intended *state* (DB row, file, field value), verified programmatically; build Conxa's own regression suite on *self-hosted, version-pinned* apps (not live sites) so results are reproducible.
**Why enterprise:** Customers and auditors buy outcomes, not clicks; reproducible regression is a release-engineering requirement.

### E4. Skill-execution checkpointing + crash-survival lifecycle
**Sources:** Playwright MCP (lazy re-init) + browser-use (serializable `AgentState`).
**Insight:** Per-execution backend with disconnect-driven disposal *and* step-level checkpointing, so a mid-skill browser crash resumes from the last completed step rather than restarting. Pair with CALL_USER-style human escalation (UI-TARS) as Tier 5, with *rule-initiated* (sensitive step types) and *recovery-exhausted* triggers.
**Why enterprise:** Long compositional flows must survive transient failures and escalate gracefully, with an audit trail.

---

## RANK 4 — COMPETITIVE ADVANTAGE

### C1. Recovery-as-grounding write-back via telemetry, not in-place local mutation
**Source:** Stagehand (adapted around Conxa's central-compile invariant).
**Insight:** When a Tier-3 heal succeeds, use the recovered signal **ephemerally for the current run only**, emit a telemetry event, and let Cloud validate and re-sign a new package version. Never silently rewrite the signed local artifact.
**Why advantage:** Preserves determinism + signing (which competitors with mutable local caches can't claim) *while* still self-improving.

### C2. Target-anchored, rank-and-capped AX representation for Tier-3 input
**Source:** browser-use (fixed: never blind-truncate).
**Insight:** Hand the LLM a compact indexed AX+styles+bounds snapshot, ranked against the recorded target so the intended element is never the one truncated away. Text-first defers pixel spend to Tier 4.
**Why advantage:** Cheaper, more reliable recovery than any agent that re-perceives from a blank task — Conxa always has a *known target to heal toward*.

### C3. Reflection-in-output + soft loop/stall fingerprint as a hard retry bound
**Source:** browser-use (reflection; `PageFingerprint`).
**Insight:** In the LLM tiers, force in-line self-assessment (paired with R1's independent probe, since reflection is belief not truth); use a cheap (url + element_count + DOM-text hash) fingerprint to **hard-cap** recovery retries so the cascade can't thrash on a stagnant page.
**Why advantage:** Bounds the worst-case cost of the non-deterministic tier — an economic and reliability win competitors' unbounded loops lack.

---

## RANK 5 — LONG-TERM DEFENSIBILITY

### L1. The fleet-level drift-detection flywheel *(the moat)*
**Source:** none of the six tools — structurally impossible for them (all single-tenant/local).
**Insight:** Conxa distributes the *same* compiled skill to many customers and centralizes recovery telemetry. When one customer's runtime heals a drifted selector on site X, the drift is detected fleet-wide on first occurrence and **surfaced to the conxa-cloud admin**, who reviews and **manually publishes** an updated signed package that then delta-syncs to all customers **before they hit the failure**. Detection is automatic and fleet-wide; **publishing is always admin-approved, never automatic.**
**Why #1 defensibility:** It compounds — more customers → faster drift detection → fresher packages → higher reliability → more customers. No competitor can enter this loop without cross-tenant telemetry over shared compiled artifacts. **This is the durable moat; everything above is table stakes or a head start.**

### L2. The compiled skill package as a signed, versioned, distributable enterprise artifact
**Sources:** contrast against all six (none ship a signed versioned artifact).
**Insight:** Determinism + signing + versioning + entitlement = an artifact that is auditable, licensable, fleet-deployable, and self-updating (delta sync). This is the unit of value none of the six tools has.
**Why defensible:** It turns "automation" into a *distributable product* with a supply chain competitors built around live agents can't easily retrofit.

### L3. Determinism survives a cheap-inference future on auditability grounds *(strategic stance)*
**Insight:** The strongest objection to Conxa's thesis is "when frontier inference gets 10× cheaper, the per-step-LLM cost objection evaporates and agent-drivers win." Rebuttal: cost was never the *only* reason for determinism — **auditability, reproducibility, and SLA-guaranteeability** are intrinsic to enterprise/regulated work and do not improve with cheaper models. A regulator cannot accept "the model usually does the same thing." Conxa should explicitly position on the *non-cost* pillars so the thesis is robust to model economics.
**Why defensible:** Future-proofs the strategy against the most likely market shift.

---

## Anti-Patterns to Reject

1. **LLM/VLM in the hot path** (browser-use, UI-TARS, Stagehand-cold) — non-deterministic, unauditable, unbounded cost.
2. **Coordinate-only identity** (UI-TARS, OS-ATLAS output) — Tier-4 last resort only, always outcome-checked.
3. **Model-asserted completion** (UI-TARS, WebVoyager) — replace with programmatic post-conditions (R1).
4. **Blind AX-tree truncation** (browser-use) — rank against the recorded target instead.
5. **Open-world atomic tools to the LLM** (playwright-mcp) — closed-world `execute_skill` only.
6. **In-place mutation of a signed package** (Stagehand pattern) — telemetry write-back instead (C1).
7. **Cost-ordered zero-token tiers** — order by durability (D1).
8. **Auto AX-snapshot on every happy-path step** — emit a post-condition result, not raw structure.

---

## One-paragraph synthesis for the architecture kickoff

Conxa's reliability comes from doing the boring deterministic things exhaustively (R2/R3) before any model fires, *and verifying outcomes independently* (R1) so recovery can't lie. Its determinism comes from compiling orthogonal, semantically-ordered, frame-aware identity ahead of time (D1–D4). Its enterprise fitness comes from a closed-world MCP skill server (E2) with bounded, trustworthy LLM recovery (E1), outcome-based verification (E3), and crash-survivable execution (E4). Its competitive edge is healing without sacrificing signed determinism (C1) and recovering against a known target (C2/C3). And its *durable* moat — the only thing no competitor can copy — is the fleet flywheel (L1) on top of a signed, versioned skill artifact (L2), defended on auditability rather than cost (L3). The first-pass research found most of the head-start ideas; the correction pass fixed the contradictions and named the moat.

---

# Part 2 — Appendix: Ranked 1–25 with Scores

The same insights flattened into a single highest-value-first list. Ranking blends the strategic
priority order above with implementation ROI.

**Legend:** Impact scores 1–10. Complexity / Risk: Low / Med / High. "Risk" = risk of the insight
being wrong, hard, or backfiring — not the risk it addresses.

### 1. Fleet-level drift-detection flywheel
- **Source:** Synthesis (no competitor can do this — all are single-tenant/local) · **maps to L1**
- **Description:** Distribute one compiled skill to many tenants; centralize recovery telemetry; when one runtime heals a drifted selector on a site, the drift is detected fleet-wide on first occurrence and **surfaced to the conxa-cloud admin**, who reviews and **manually publishes** an updated signed package that then delta-syncs to all customers. Detection is automatic and fleet-wide; **publishing is always admin-approved, never automatic.**
- **Reliability:** 9 · **Enterprise:** 8 · **Complexity:** High · **Risk:** Med · **Strategic value:** 10 — the only compounding asset in the corpus. **The moat.**

### 2. Independent post-condition assertion on every step
- **Source:** Stagehand + WebArena/WorkArena · **maps to R1**
- **Description:** After each step (and especially each recovered/forced action), verify the *intended state* via a channel the action didn't use, against a compiled post-condition fingerprint.
- **Reliability:** 10 · **Enterprise:** 9 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 10 — converts recovery success-rate into recovery *correctness*.

### 3. Compile orthogonal multi-signal identity, resolve by durability
- **Source:** Playwright + Mind2Web · **maps to D1**
- **Description:** Generate N engine-orthogonal selectors at compile time; resolve at runtime as an ordered fallback with a live uniqueness gate, ordered semantic-first (not cost-first).
- **Reliability:** 9 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 9 — the identity model the whole replay guarantee rests on.

### 4. Deterministic exception-classified recovery ladder
- **Source:** SeleniumBase · **maps to R2**
- **Description:** Typed failure → typed remedy (stale→re-find, intercepted→JS-dispatch, OOB→re-scroll), escalating by invasiveness, each rung gated on the prior throwing. Pair every forced rung with #2.
- **Reliability:** 9 · **Enterprise:** 7 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 8 — the content of Tier 1; protects the zero-token invariant.

### 5. Closed-world skill MCP server (ServerBackend harness, inverted philosophy)
- **Source:** Playwright MCP · **maps to E2**
- **Description:** Adopt the three-layer transport-agnostic harness / declarative registry / per-connection backend; expose a tiny verb set (`execute_skill`), keep all resolution inside the compiled skill, drop `openWorldHint`.
- **Reliability:** 7 · **Enterprise:** 9 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 9 — determinism + auditability + licensing all flow from the closed-world choice.

### 6. Describe-then-ground for the LLM recovery tier
- **Source:** SeeAct (30% hallucination if skipped) · **maps to E1**
- **Description:** Tier 3 LLM emits `{action, target_description, argument}`; a deterministic matcher resolves it against the live AX tree *and* the recorded target's signals jointly. Pre-filter AX to <500 nodes (WorkArena).
- **Reliability:** 8 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 9 — makes the one non-deterministic tier trustworthy and bounded.

### 7. Conditional / optional / branch steps in the skill format
- **Source:** SeleniumBase conditional verbs + WorkArena · **maps to R4**
- **Description:** First-class `if_present(selector)→steps`, `try_dismiss`, `wait_for_one_of` branch points in the SkillPackage (generalizing `wait_for_any_of_elements`).
- **Reliability:** 9 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 8 — without it "deterministic replay" fails where enterprise flows are messiest.

### 8. Actionability gates before every action (incl. stable/RAF)
- **Source:** Playwright · **maps to R3**
- **Description:** Re-query and poll attached→visible→stable(2 RAF frames)→enabled before acting.
- **Reliability:** 9 · **Enterprise:** 6 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 7 — cheap, high-yield Tier-1 primitive.

### 9. Compiled skill package as a signed, versioned, distributable artifact
- **Source:** Contrast vs all six · **maps to L2**
- **Description:** Determinism + signing + versioning + entitlement + delta-sync self-update = an auditable, licensable, fleet-deployable unit of value.
- **Reliability:** 6 · **Enterprise:** 10 · **Complexity:** High · **Risk:** Med · **Strategic value:** 10 — turns automation into a supply-chained product.

### 10. Late-bound serializable element identity
- **Source:** Playwright · **maps to D2**
- **Description:** Store `(frame-chain, signal-set)`, never a node handle; re-query every attempt.
- **Reliability:** 8 · **Enterprise:** 6 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 8 — foundational invariant for robust replay.

### 11. Recovery write-back via telemetry, never in-place local mutation
- **Source:** Stagehand (adapted) · **maps to C1**
- **Description:** A successful heal is used *ephemerally* for the current run; a telemetry event surfaces the drift to the conxa-cloud admin, who reviews and publishes a new signed version. The signed local artifact is never silently rewritten, and no version is published without admin approval.
- **Reliability:** 7 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 8 — self-improvement *without* surrendering determinism/signing.

### 12. Frame/shadow traversal encoded in the identity string
- **Source:** Playwright · **maps to D3**
- **Description:** The iframe chain + shadow path travel with the element through compile and replay; recovery stays frame-scoped.
- **Reliability:** 7 · **Enterprise:** 9 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 8 — serves "iframe chain preserved verbatim" invariant; an enterprise moat.

### 13. Target-anchored, rank-and-capped AX representation for Tier 3
- **Source:** browser-use (fixed: never blind-truncate) · **maps to C2**
- **Description:** Hand the LLM a compact indexed AX+styles+bounds snapshot, ranked against the recorded target so the intended element is never truncated away; text-first defers vision.
- **Reliability:** 8 · **Enterprise:** 7 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 7 — cheaper, more reliable Tier-3 than re-perceiving from blank.

### 14. Outcome-based success criteria + version-pinned regression environments
- **Source:** WebArena + WorkArena · **maps to E3**
- **Description:** Define success as intended state (DB row, file, field), verified programmatically; build Conxa's regression suite on self-hosted, version-pinned apps.
- **Reliability:** 7 · **Enterprise:** 9 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 8 — release-engineering and audit requirement.

### 15. Compile ahead of time, never lazily at runtime
- **Source:** Stagehand (cautionary) · **maps to D4**
- **Description:** Grounding happens in Build Studio; the customer never pays grounding cost or non-determinism on their machine.
- **Reliability:** 8 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Low · **Strategic value:** 8 — defends the core architectural choice.

### 16. Skill-execution checkpointing + crash-survival lifecycle
- **Source:** Playwright MCP + browser-use · **maps to E4**
- **Description:** Per-execution backend with disconnect-driven disposal *and* step-level checkpointing; a mid-skill crash resumes from the last completed step.
- **Reliability:** 7 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 7 — long compositional flows must survive transient failure.

### 17. CALL_USER as a first-class Tier-5 escalation (rule- and recovery-initiated)
- **Source:** UI-TARS · **maps to E4**
- **Description:** A designed pause-and-hand-to-human state for CAPTCHA/2FA/ambiguous/sensitive steps, triggered both by *rules* (sensitive step types) and by *recovery exhaustion*.
- **Reliability:** 7 · **Enterprise:** 8 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 7 — honest, auditable human handoff.

### 18. Reflection-in-output + page-fingerprint hard retry cap
- **Source:** browser-use · **maps to C3**
- **Description:** Force in-line self-assessment in LLM tiers (paired with #2, since reflection is belief not truth); use a cheap (url+element_count+DOM-hash) fingerprint to hard-cap recovery retries.
- **Reliability:** 6 · **Enterprise:** 6 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 6 — bounds worst-case cost of the non-deterministic tier.

### 19. Page/app-version fingerprint for package staleness detection
- **Source:** Stagehand `configSignature` (generalized)
- **Description:** Stamp each package with a target-environment fingerprint; detect when the live app has drifted from the compiled-against version and proactively flag/recompile.
- **Reliability:** 7 · **Enterprise:** 7 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 7 — invalidation, the real problem behind "caching." Feeds the fleet flywheel (#1).

### 20. Entitlement filtering of the advertised skill surface
- **Source:** Playwright MCP capability filtering (extended)
- **Description:** `list_skills` advertises only skills the customer is licensed for, gated by company token.
- **Reliability:** 3 · **Enterprise:** 8 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 6 — commercial/governance enabler.

### 21. One schema (zod) → wire + validation + types, with in-band errors
- **Source:** Playwright MCP
- **Description:** Single schema source for JSON Schema, runtime parse-at-boundary, and TS types; errors returned in-band as readable results, never as transport exceptions.
- **Reliability:** 6 · **Enterprise:** 6 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 5 — robust MCP boundary hygiene.

### 22. Position determinism on auditability, not cost
- **Source:** Strategic synthesis · **maps to L3**
- **Description:** Anchor the thesis on reproducibility / auditability / SLA-guaranteeability — properties that *don't* improve as inference gets cheaper — so the strategy survives a 10×-cheaper-model world.
- **Reliability:** 5 · **Enterprise:** 9 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 9 — future-proofs positioning.

### 23. Vision Tier-4: normalized grounder + scaleFactor + SoM-as-telemetry
- **Source:** OS-ATLAS (grounder) + UI-TARS (scaleFactor, SoM)
- **Description:** A walled-off last-resort tier: `(screenshot, description)→normalized bbox`, scaled by devicePixelRatio at execution, with SoM annotation shipped to telemetry as drift signal — never as success evidence.
- **Reliability:** 5 · **Enterprise:** 4 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 5 — necessary completeness, deliberately rare.

### 24. Capture the interactions enterprise flows actually depend on
- **Source:** WorkArena
- **Description:** Prioritize the recorder for autocomplete/typeahead, dynamic tables (sort/filter/paginate), and multi-step wizards — the interactions agents fail most and recorders most often miss.
- **Reliability:** 6 · **Enterprise:** 8 · **Complexity:** Med · **Risk:** Med · **Strategic value:** 7 — directs recorder investment by real task distribution.

### 25. Deferred/soft assertions batched into a run report
- **Source:** SeleniumBase
- **Description:** Collect non-fatal assertion failures across a skill run and report them all at the end rather than failing on first.
- **Reliability:** 5 · **Enterprise:** 6 · **Complexity:** Low · **Risk:** Low · **Strategic value:** 5 — richer run diagnostics; feeds the flywheel (#1).

---

## Ranking rationale

- **#1–#7** are the *structural* moves — the moat (#1), the trust guarantee (#2), the identity model (#3), the deterministic floor (#4), the runtime philosophy (#5), the trustworthy LLM tier (#6), and the control-flow realism (#7). Get these wrong and nothing above table-stakes follows.
- **#8–#16** are *core engineering* — high-yield, well-understood, mostly copyable, the substance of a reliable runtime and a distributable artifact.
- **#17–#25** are *completeness and positioning* — necessary for an enterprise-grade, defensible, well-observed product, but individually lower-leverage.

**The three to never compromise** (each closes a field-wide blind spot or is structurally uncopyable): **#1 (fleet flywheel), #2 (independent outcome verification), #5 (closed-world determinism).** They are, respectively, Conxa's long-term defensibility, its reliability guarantee, and its core philosophical bet — and no incumbent in the corpus has any of the three.
