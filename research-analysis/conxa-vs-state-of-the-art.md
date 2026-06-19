# Conxa vs State of the Art (Phase 2)

Comparison of *current implemented* Conxa against the best ideas in the research database (Playwright, SeleniumBase, Stagehand, Browser Use, Playwright MCP, UI-TARS, Fable, and the papers). For each capability: **Ahead / Behind / Different**, why, and the next move. "Fable" here = the frontier-model class (host LLM via MCP) — Conxa's recovery delegates to it.

Grounding: see `conxa-current-state-assessment.md`. The recurring theme — Conxa is *Different by architecture* and *Ahead in concept* but *Behind in execution robustness* — holds across nearly every row.

---

### Recording

- **Ahead?** Yes, vs everyone. Conxa is the only system with a real workflow recorder that preserves the iframe chain verbatim and captures ~25 event types inside authenticated sessions. Playwright codegen is the only comparable recorder and handles frames worse.
- **Behind?** Slightly, on *interaction coverage* of the messy enterprise cases (typeahead-where-options-appear-after-typing, dynamic grids) that WorkArena shows dominate enterprise work.
- **Different?** Fundamentally. Competitors don't record; they perceive live. Conxa's record-once philosophy is the divergence.
- **Next:** Add intent/validation/confidence/conditional capture and harden the WorkArena interaction types (`future-recording-architecture.md`).

### Locator Generation

- **Ahead?** In concept — Conxa compiles a multi-signal `ElementFingerprint`, which is richer than Playwright's single collapsed selector and far richer than browser-use's ephemeral index.
- **Behind?** In realized value. Playwright's `selectorGenerator` is a deterministic, scored, zero-LLM generator with a unique-match gate; Conxa's generation is **LLM-dependent with no deterministic floor**, and the **runtime never scores live candidates** against the fingerprint. So Playwright's *runtime* selector resolution is more principled than Conxa's today.
- **Different?** Yes — Conxa generates *durable, distributable* identity; Playwright generates *one* selector for immediate use.
- **Next:** Add a deterministic Playwright-style generator as a floor; emit *orthogonal* signals; **wire runtime fingerprint scoring + live uniqueness gate** (research #3, C.1). 

### Workflow Understanding

- **Ahead?** Decisively. Conxa is the only system that builds an explicit `WorkflowIntentGraph` at compile time. No competitor and no paper does this for a recorded workflow.
- **Behind?** No peer to be behind.
- **Different?** This is a core differentiator — "AI deeply understands the workflow" is real and built.
- **Next:** Wire the intent graph into *adaptive* execution (conditional branches) and into recovery (re-ground toward recorded intent). Today it enriches but doesn't *drive*.

### Intent Extraction

- **Ahead?** Yes — intent is a first-class compiled object with decision points.
- **Behind?** SeeAct's describe-then-ground discipline isn't yet used in Conxa's recovery (recovery delegates raw context to the host rather than asking it to *describe-then-match*).
- **Different?** Conxa extracts intent *ahead of time and persists it*; SeeAct extracts it *live per step*.
- **Next:** Use compiled intent as the anchor for host-delegated re-grounding; adopt describe-then-match in the recovery prompt (research #6).

### Compilation

- **Ahead?** Uniquely. The ahead-of-time compiler from recording → deterministic skill package is the single biggest thing no competitor has. Stagehand's "compile" is lazy runtime caching; Conxa's is real AoT compilation.
- **Behind?** On engineering maturity: no model-agnostic IR, not reproducible, no rollback, 4–5 LLM calls/step.
- **Different?** Yes — this *is* the philosophy made real.
- **Next:** Introduce a diffable IR, deterministic floors, reproducible/pinned compiles, version+rollback (`future-compiler-architecture.md`).

### Runtime

- **Ahead?** In philosophy — deterministic zero-LLM hot path is the convergence point the ecosystem is moving toward (`ecosystem-synthesis.md`), and Conxa is already there.
- **Behind?** In robustness — no actionability `stable` gate (Playwright has it), no exception-classified deterministic ladder (SeleniumBase has it), 700ms fail-fast timeout, no live scoring, no post-condition verification. Playwright and SeleniumBase execute individual actions more reliably than Conxa today.
- **Different?** Conxa replays a *compiled multi-step plan*; the others execute author-written scripts or live-agent steps.
- **Next:** Adopt Playwright actionability gates + SeleniumBase classified ladder into Tier 1/2; add independent post-conditions (R1).

### Recovery

- **Ahead?** The deterministic floor (compiled alternates → a11y → fallback → dialog → fuzzy) is ahead of Stagehand/browser-use, which jump straight to the LLM.
- **Behind?** Critically. Stagehand **self-heals autonomously and refreshes its cache**; Conxa's "Tier 3+" is **host-delegated manual resume with no write-back** — it halts and is unsafe for unattended runs. browser-use re-grounds autonomously every step. UI-TARS self-corrects via vision. **Conxa's marketed self-healing is, in code, assisted recovery.**
- **Different?** Conxa is the only one with a *compiled recorded target* to heal *toward* (browser-use heals from a blank task) — a latent advantage it doesn't yet exploit.
- **Next:** Make recovery autonomous via host MCP sampling, add **healed-selector write-back** (ephemeral local + telemetry → Cloud re-sign), confidence/cause classification, and repair validation (`future-recovery-architecture.md`).

### Vision

- **Ahead?** No.
- **Behind?** Yes — UI-TARS has a working (if expensive) vision execution loop with scaleFactor + SoM; OS-ATLAS is a real grounder. Conxa's vision is a passive screenshot payload handed to the host, not an actionable tier.
- **Different?** Correctly subordinated (vision is recovery-only by philosophy) — but currently *non-functional* as a tier rather than *deliberately minimal*.
- **Next:** Build a minimal actionable Tier-4 (grounder → bbox → re-derive selector → outcome-check) with scaleFactor + SoM-as-telemetry (`future-vision-architecture.md`).

### Grounding

- **Ahead?** Conxa grounds at compile time and persists it — no competitor persists grounding.
- **Behind?** At *re-grounding* time, browser-use/Stagehand/SeeAct have more mature live grounding; Conxa hands raw context to the host without the describe-then-match discipline or AX-tree pre-filtering (<500 nodes, WorkArena).
- **Different?** Persisted vs live.
- **Next:** Pre-filter the recovery DOM digest (already capped at 50 — good direction), add describe-then-match, anchor to recorded fingerprint.

### MCP

- **Ahead?** Philosophically ahead of playwright-mcp: closed-world skill verbs vs open-world atomic tools. Determinism, audit, licensing all follow.
- **Behind?** Engineering hygiene — playwright-mcp's clean ServerBackend seam vs Conxa's 1043-line monolith. No entitlement filtering.
- **Different?** Conxa exposes *compiled workflows*; playwright-mcp exposes *browser primitives*.
- **Next:** Refactor to ServerBackend seam; add entitlement-filtered `list_skills`; add an escalation/handoff tool (`future-mcp-architecture.md`).

### Workflow Durability

- **Ahead?** Conceptually — the compiled multi-signal package *should* be the most durable representation in the field.
- **Behind?** In practice — durability today depends on the deterministic ladder catching drift, and there's **no breakage detection, no change classification, no autonomous repair, no write-back, no regression prevention.** Stagehand's in-place self-heal makes its *individual* cached actions more durable run-to-run than Conxa's static package (which re-breaks until recompiled).
- **Different?** Conxa is the only one positioned to make durability a *fleet* property, not a per-instance one — but that's unbuilt.
- **Next:** This is the most important build — `future-workflow-durability-architecture.md` + the fleet flywheel.

### Breakage Detection

- **Ahead?** No.
- **Behind?** Yes — nothing detects that a package has drifted from the live app. Telemetry records recovery tiers but nothing classifies "this skill is breaking across the fleet." (Implementation-Plan 2.2 "Drift Detection" is planned, not built.)
- **Different?** Conxa *can* detect breakage centrally (fleet telemetry over a shared artifact) — uniquely. Unbuilt.
- **Next:** Build breakage detection from telemetry as the first stage of the durability system.

### Repair Validation

- **Ahead?** No.
- **Behind?** Yes — when the host fixes a selector and resumes, there's no validation that the repair was *correct* (only that the step didn't throw), and no independent post-condition. Stagehand validates via its independent probe (offline). 
- **Different?** N/A — this is simply missing.
- **Next:** Pair every repair with an independent post-condition assertion (R1); validate before write-back.

### Enterprise Readiness

- **Ahead?** The *posture* (deterministic, auditable, signed artifact, local execution, auth isolation) is a stronger enterprise story than any agent tool — agents can't offer reproducibility or SLAs.
- **Behind?** The *plumbing* — RBAC unwired, no SSO/SAML, no tenant isolation guarantees, no compliance package, no runtime fleet management, weak hosting.
- **Different?** Conxa sells *governed determinism*; competitors sell *capability*.
- **Next:** Wire RBAC, add SSO, tenant isolation, compliance export, fleet registry (`future-enterprise-architecture.md`).

---

## Summary Matrix

| Capability | Position vs SOTA | One-line reason |
|---|---|---|
| Recording | **Ahead** | Only real recorder; verbatim iframe chain |
| Locator Generation | **Different / mixed** | Richer identity, but runtime ignores it; no deterministic floor |
| Workflow Understanding | **Ahead** | Only system with a compiled intent graph |
| Intent Extraction | **Ahead** | Persisted, first-class intent |
| Compilation | **Ahead** | Only AoT recording→package compiler |
| Runtime | **Behind (robustness) / Ahead (philosophy)** | Deterministic but missing gates/scoring/post-conditions |
| Recovery | **Behind** | Not autonomous; no write-back; unattended-unsafe |
| Vision | **Behind** | Passive payload, not an actionable tier |
| Grounding | **Different** | Persisted vs live; re-grounding immature |
| MCP | **Ahead (philosophy) / Behind (hygiene)** | Closed-world correct; monolith |
| Workflow Durability | **Behind (today) / uniquely positioned (future)** | No detection/repair/write-back yet |
| Breakage Detection | **Behind** | Nothing detects drift; fleet capability untapped |
| Repair Validation | **Behind** | No independent outcome check on repairs |
| Enterprise Readiness | **Ahead (posture) / Behind (plumbing)** | Governed determinism vs unwired RBAC/SSO |

**The strategic read:** Conxa has *already won the architecture argument* — the ecosystem is converging on compiled-deterministic-replay (`ecosystem-synthesis.md`), and Conxa is the only one there with a recorder, compiler, intent graph, and distributable artifact. The risk is **not** that the thesis is wrong; it's that the *execution-robustness* and *autonomous-durability* layers — the parts that make the thesis actually deliver reliability — are the least-built parts of the system. Win condition: convert conceptual lead into shipped reliability before the incumbents reach the convergence point from their ends.
