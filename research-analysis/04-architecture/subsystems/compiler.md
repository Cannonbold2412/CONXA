# Compiler Subsystem — Architecture Design (24-Month Target)

**Author:** Principal Compiler/Systems Architect
**Scope:** The Build-Studio-local compiler that turns a recording into a signed, deterministic SkillPackage. Design only — no code.
**Grounding:** Current-state assessment §3–6, gap analysis G5/G6/G10, master-insights-v2 (#2/#3/#6/C.1, #15, #19), high-value-repo-review (Playwright scored generator + unique-match rule), and the actual `compiler/build.py`, `selector_score.py`, `recovery_policy.py`, `validation_planner.py`, TRD §7.

> **Reality-check pass — 2026-07-11.** This file was written as a forward-looking design and, read on its own, now reads as if none of it exists yet. That's no longer true: a large chunk of §3 (deterministic identity) and part of §1 (branch execution) already shipped, on a different path than this doc originally sketched. Every section below now opens with a **Status** line in plain language, followed by the original design text (kept, since it's still the target for what's left). The one-paragraph version: **the deterministic selector floor and durability-ranked identity are built and running in production; the CIR layer, versioning graph, rollback, and reproducibility (§2, §7, §8, §9) are not started.** See `TODO.md` items `BUILD-1` (CIR — confirmed unbuilt) and `EXEC-1` (branch steps — shipped 2026-07-09/10) for the tracked, dated record this summary is based on.

### At a glance

| § | Idea (plain language) | Status |
|---|---|---|
| 1 | Compiler auto-detects "sometimes this happens" states (cookie banners, MFA) and builds a branch for them | **Runtime can run branches; auto-detection can't.** A person has to add the branch by hand today (`EXEC-1` shipped the executor + editor UI; the recorder still can't produce one from a live recording — `RT-2`, open). |
| 2 | A stable "master recipe" format between the recording and the final skill, so changes are diffable and recompiles can be partial | **Not started.** Confirmed zero `.cir`/`cir_root_hash` in the codebase (`BUILD-1`). |
| 3 | Never let the AI be the only way to identify a button/field; rank identification methods by how sturdy they are | **Done — and further than planned.** The AI isn't involved in element identification at all anymore; a deterministic algorithm does it, and the running skill uses the same sturdiness ranking to double-check itself live. Only the "does this look like a new app version" fingerprint is still an empty stub. |
| 4 | After every step, independently check it actually worked; after the whole workflow, check the overall goal was reached | **Per-step check: done and running.** Whole-workflow goal check: **not started.** |
| 5 | Only bother the AI when the deterministic method is unsure, to cut cost | **Cost was cut, but by removing the AI from element-identification entirely, not by adding a per-step "am I sure enough" gate.** |
| 6 | Build the final skill files from the master recipe (§2), so each file has its own verifiable hash | **Not started** — blocked on §2. |
| 7 | Track skill versions as a family tree with meaning ("this only changed how we find a button" vs. "this changed what the workflow does"), not just a number | **Not started** — still just a number that goes up by one. |
| 8 | One-click revert to a previous version; safely merge in a runtime-discovered fix without touching the trusted, signed package directly | **Not started.** |
| 9 | Compiling the same recording twice always produces the identical result | **Not started, but less far off** — fewer AI calls remain to pin down than when this was written. |

---

## 0. Thesis & the one structural defect we are fixing

> **Status: partially overtaken by events.** The "4–5 LLM calls/step" and "runtime never scores live candidates" claims below are **no longer accurate** — both were fixed, just not via the CIR route this doc proposes. What's still true: there is no CIR, no reproducibility, no rollback, no partial recompile, and no plan-level (whole-workflow) validation. Read on for what changed and what didn't.
>
> **In plain language:** this section originally said "the compiler asks the AI 4-5 questions per step, and the runtime doesn't even use the smart ranking the compiler produces — it just tries selectors in a fixed list order." Both halves of that complaint have since been fixed by other work: the AI is no longer asked to invent selectors at all (a deterministic algorithm does it, borrowed from Playwright's own selector engine), and the runtime now actually uses the compiler's ranking, with a safety check that refuses to guess when two candidates are too close to call. What's still missing is the bigger structural idea this doc is really about — a stable, diffable "recipe" format sitting between the recording and the final package, which would unlock reproducible compiles, one-click rollback, and cheap partial recompiles. None of that exists yet.

Today `compile_skill_package()` (build.py:925) goes **events → per-step LLM (4–5 calls) → `SkillPackage`** in a single pass, with *no stable artifact in between*. `selector_score.py` ranks selectors at compile time but the runtime tries `compiled_selectors[]` in array order and never scores live candidates. `ElementFingerprint` is emitted and then ignored at runtime. Versioning is an `int` plus a `structural_fingerprint` string. There is no reproducibility, no rollback, no partial recompile, no workflow-level validation.

**What actually changed (as of 2026-07-11):**
- Selector generation is no longer an LLM job at all. `conxa_compile/compiler/identity_bundle.py::generate_deterministic_signals()` mines `testid` / `role+name` / `text` / `relational` / `css` / `xpath` candidates straight from the recorded DOM snapshot — zero LLM calls — and every step's identity comes from here on the primary compile path. `build.py`'s own comment on `_build_intent_graph` now reads: *"Selector generation is fully deterministic and already complete — no LLM selector passes run here."* This alone removed roughly one whole LLM call category per step, not through call-coalescing (as originally proposed in §5) but by deleting the call.
- The runtime **does** score live candidates now. `runtime/resolver.js` walks `IdentityBundle` signals in durability order and only accepts a candidate when its score clears `uniqueMargin` over the runner-up (see `CLAUDE.md`'s "Resolver never blindly picks `candidate[0]`" invariant) — the multi-signal investment this doc worried was "dormant" is now the thing keeping replays from clicking the wrong element.
- `ElementFingerprint` was replaced by `IdentityBundle` (see §3) and it is read, not ignored.
- Versioning is genuinely unchanged: still `meta.version: int` + `structural_fingerprint: dict` (see §7).

The defect underneath all of these is the **missing IR**. Every capability the gap analysis asks for — reproducible compiles (G10), durable identity that pays off at runtime (G5), conditional branches (G6), rollback (G9), the fleet flywheel (L1) — requires a *diffable, model-agnostic, content-addressed representation* between normalized events and the SkillPackage. The future compiler is organized entirely around introducing that layer (the **CIR**, Conxa Intermediate Representation) and around moving every job a deterministic algorithm can do *out of the LLM*, keeping the LLM for what only it can do: understanding intent and enriching identity. **This part is still 100% true** — `TODO.md`'s `BUILD-1` confirms via grep that no `.cir`, `cir_root_hash`, or model-pinning exists anywhere in `conxa_compile/`.

**Design law applied throughout:** *Deterministic floor first; LLM for understanding/enrichment only; nothing the LLM produces is load-bearing without a deterministic verifier.* This both cuts the 4–5 LLM calls/step and makes compiles reproducible. **The "deterministic floor first" half of this law is now real for identity (§3); the "makes compiles reproducible" half still isn't, because reproducibility needs the CIR's pinning/canonicalization machinery (§9), which doesn't exist.**

---

## 1. Intent Graphs — decision points as first-class executable branches

> **Status: partially built — but on a different path than proposed here.** The runtime can now execute real branches (`if_present`, `try_dismiss`, `wait_for_one_of`) — shipped 2026-07-09 (executor) and 2026-07-10 (editor authoring UI), tracked as `TODO.md`'s `EXEC-1`. That is exactly the predicate verb set this section proposed. What's **not** built is the specific mechanism this doc describes: these branches are **hand-authored directly as a step type** (`SkillStep.branch`) in the editor, not *derived by lowering the LLM-proposed `WorkflowIntentGraph.decision_points`* into typed graph nodes. `decision_points` itself is still exactly what this doc calls it below — an untyped, advisory `list[dict]` that nothing executes. So: the *destination* (executable conditional branches) is reached; the *road* (intent-graph-as-control-flow-spine) described in the rest of this section is not, and the recorder still can't produce a branch step from a live recording (that's `TODO.md`'s `RT-2`, still open) — a human has to add one in Human Edit today.
>
> **In plain language:** imagine the compiler is supposed to notice "oh, a cookie banner sometimes shows up here" by watching the recording, and automatically build a decision into the skill for it. That automatic noticing doesn't exist. What does exist is the *ability to handle it* — a person can now open the workflow editor and manually add a step that says "if this cookie banner is present, dismiss it, otherwise skip," and the runtime will correctly execute that branch during playback. So the runtime got smarter about handling "sometimes this happens" states; the compiler didn't get smarter about detecting them on its own yet.

**Today.** `intent_llm.py` emits one `WorkflowIntentGraph{goal, steps, decision_points}` per workflow (build.py:959, `_llm_compile_selectors`). `decision_points` is advisory metadata; the runtime is linear (`run.js` has no conditional control flow). Intent is used to enrich selectors/anchors, never to drive execution or anchor recovery. **Correction: the "runtime is linear" half of this sentence is no longer accurate — see the Status note above. The `decision_points` half is still accurate.**

**Future design.** Promote the intent graph to the compiler's **control-flow spine**, lowered into the IR as executable nodes.

- **Node taxonomy.** `Goal → Phase → Step | Decision | Probe`. A `Decision` node is `{predicate, branches[], default, durability_anchor}`, where `predicate` is one of a *closed, deterministic verb set* — `if_present(identity)`, `wait_for_one_of(identity[])`, `try_dismiss(identity)`, `url_is(pattern)`, `value_equals(field, expr)` (G6, insight #7). The LLM *proposes* decision points from the recording plus a synthesized "what varies" hypothesis (cookie banners, MFA, A/B); the compiler *lowers* each into a deterministic predicate. No predicate is an LLM call.
- **Intent as the durability anchor.** Every Step carries `intent_id` referencing a graph node. Recovery and post-conditions re-ground toward the *intent* ("dismiss consent dialog"), not merely the selector — so when the DOM drifts, the runtime knows *what the step was for*, satisfying the assessment §4 "intent as durability anchor" gap and feeding describe-then-ground (insight #6).
- **Graph validation.** A deterministic pass asserts every recorded event maps to exactly one reachable graph node and every branch terminates — closing the current "no validation that the graph matches recorded events" gap (assessment §4).

**Artifact change.** New `intent_graph.cir` node block with typed `Decision`/`Probe` nodes; each SkillStep gains `intent_id` and `branch_id`.

**Enables downstream.** Conditional replay on stochastic states (the #1 brittleness of linear replay); intent-anchored recovery and post-conditions; the runtime can finally execute `decision_points` instead of ignoring them.

---

## 2. The Conxa Intermediate Representation (CIR) — the key missing layer

> **Status: not started.** Confirmed by grep across `conxa_compile/` — no `.cir` file, no `cir_root_hash`, no model-pinning anywhere in the codebase. Tracked as `TODO.md`'s `BUILD-1`, complexity XL, explicitly called out as "the substrate multiple other items depend on" (most notably `EXEC-2`, the automated-drift-repair pipeline). Everything in this section is still an accurate description of future work, not current behavior.
>
> **In plain language:** this section proposes a new "master recipe" format that would sit between the raw recording and the final packaged skill. Right now the compiler goes straight from recording to final package in one pass, with nothing reusable saved in between — so if you want to know exactly what changed between two versions of a skill, or roll back one version, or only re-compile the one step that broke, there's no clean way to do it. This master-recipe layer is what would make all of that possible. It hasn't been built yet.

**Design.** A model-agnostic, content-addressed, diffable IR sitting **between normalized events and the SkillPackage**. The compiler becomes a classic multi-pass lowering: `events → CIR(raw) → CIR(enriched) → CIR(validated) → CIR(optimized) → SkillPackage`. The SkillPackage becomes a *backend emission* of the CIR, not the primary product.

Properties (each maps to a downstream capability):

| CIR property | Mechanism | Enables |
|---|---|---|
| **Content-addressed** | Every node carries `node_hash = H(canonical_payload)`; package id = Merkle root | Reproducibility, per-file delta, rollback |
| **Diffable** | Stable node identity across recompiles via `origin_event_id` | Partial recompile, drift classification, review UX |
| **Model-agnostic** | LLM outputs normalized into typed fields, not prose blobs | Swap models without changing the artifact; deterministic verification |
| **Provenance-tagged** | Each field tags `{source: deterministic|llm, model_id, prompt_hash, confidence}` | Audit, reproducibility pinning, "what did the LLM decide" review |
| **Verifiable** | Each LLM field has a paired deterministic validator | Cut LLM dependence safely; reject hallucinations at compile |

**What the IR is *not*:** it is not the LLM transcript and not the SkillPackage. It is the normalized, lowered semantic form both of those project from.

**Artifact change.** New on-disk `*.cir` (canonical JSON, sorted keys, normalized numbers) emitted alongside `skill.json`. The SkillPackage gains `meta.cir_root_hash`.

**Enables downstream.** *Validation* (pass over CIR, §4); *optimization* (rewrite passes on CIR, §5); *reproducibility* (re-run from CIR with pinned models, §9); *rollback* (CIR history, §8); *partial recompile* (only re-lower nodes whose `origin_event_id` payload changed). This is the foundation gap G10 and the precondition for the fleet flywheel.

---

## 3. Element Identity Compilation — N orthogonal signals, durability-ordered, with a deterministic floor

> **Status: largely built.** This is the section where the codebase moved furthest past the design doc. Point by point:
> - **Deterministic floor (zero-LLM): built.** `conxa_compile/compiler/identity_bundle.py::generate_deterministic_signals()` mines `testid` / `role+name` / `text_based` / `relational` (spatial-anchor) / `css` / `xpath` candidates from the recorded DOM/AX snapshot using Playwright's own `internal:` selector grammar (`selector_grammar.py::to_playwright_grammar`), with zero LLM involvement. `llm_selector_generator_v2.py` — named in the "Today" paragraph below as the sole identity source — **no longer exists**; there are zero LLM selector-generation calls left on the primary compile path. This is a stronger outcome than the doc asked for: it doesn't just add a floor underneath the LLM, it removed the LLM from this job entirely.
> - **Durability ordering: built.** `selector_score.py::durability_score()` implements the exact ordering this doc specifies — `testid`/`role`/`aria` (0.95–0.99) > `text` (0.85) > `relational` (0.75) > `css-id`/`css` (0.30–0.45) > `xpath` (0.10) — with penalties for dynamic IDs and positional selectors (`:nth-child`, etc). `rank_by_durability()` sorts candidates by this score. The doc's worry that `_KIND_PRIORITY` lets CSS outrank semantic signals is now addressed by a **separate, newer priority table** (`durability_score`/`rank_by_durability`) that supersedes the older `_KIND_PRIORITY` table for this purpose — both tables still exist in the file for different callers (`_KIND_PRIORITY` still backs the older `rank_selectors_scored` path), which is worth a follow-up cleanup but isn't a functional gap.
> - **Orthogonality classes: built.** `_ENGINE_ORTHOGONALITY` tags every engine into one of `test-contract` / `semantic-aria` / `visible-text` / `spatial-anchor` / `structural` — exactly the "text-change vs attribute-change vs structure-change vs a11y-change" independence this doc calls for. `dedup_by_orthogonality()` (in `selector_filters.py`) removes redundant signals within the same class.
> - **Uniqueness gate at compile time: built.** `uniqueness_gate()` marks each signal `unique_at_compile` against the recorded DOM snapshot, matching the "admissible only if it matches exactly one node" rule.
> - **Live uniqueness gate at runtime: built.** `runtime/resolver.js` walks signals in durability order and requires the winner's score to clear `uniqueMargin` over the runner-up before accepting it — this is the "cashing in" of the multi-signal investment the original doc worried was dormant. It is no longer dormant.
> - **Hard compile-time gate "≥2 orthogonal signals or fail": not built as a hard failure.** `confidence_from_signal_rows()` *discounts* confidence (×0.7) when fewer than 2 orthogonality classes are present and (×0.6) when nothing is unique at compile — but a step with only one orthogonal signal still compiles, just with a lower confidence score surfaced in the compile report, rather than the package being rejected outright. Whether that's the right trade-off (softer signal vs. hard gate) is a product call, not a bug — flagging the gap between "doc says fail" and "code says discount" for whoever picks this back up.
> - **App-version / compatibility fingerprint: schema exists, not populated.** `IdentityBundle.compat_fingerprint: str` is a real field (`packages/conxa-core/conxa_core/models/skill_spec.py:125`) and the runtime already reads it (`runtime/recovery.js` tags recovery telemetry with `app_version_fingerprint`). But at compile time `build.py` always sets it to `compat_fingerprint=""` (build.py:438) — the actual `dom_skeleton_hash`/`route_signature`/`framework_hints` computation this doc proposes was never written. So the wire is laid, nothing runs through it yet.
>
> **In plain language:** this section asked for two things — (1) never let the AI be the only thing that can identify a button or field on a page, and (2) rank the different ways of identifying an element (a stable ID beats a shaky position-based guess) so both the compiler and the running skill pick the sturdiest option first. Both of those are done, and done more thoroughly than asked: the AI isn't involved in identifying elements at all anymore during normal compiling — a deterministic algorithm (borrowed from Playwright's own engine) does it, the same way every time. The one part that's still a stub: a planned "does this look like the same version of the app" fingerprint has a labeled slot in the data but nothing fills it in yet.

**Today (the contradiction).** `llm_selector_generator_v2.py` is the *only* generator of identity; if the LLM is unavailable the step degrades. `selector_score.py` ranks but `_KIND_PRIORITY` and the runtime ordering let CSS sit ahead of semantic in practice, and the runtime ignores scoring entirely (assessment §3, audit C.1). One DOM change can break all signals because they are not guaranteed orthogonal. **(Superseded — see Status note above: this paragraph describes the pre-`identity_bundle.py` state and is kept for historical contrast only.)**

**Future design — three layers, deterministic-first (G5, insight #3, Playwright generator):**

1. **Deterministic floor (zero-LLM, always present).** Port Playwright's in-page `selectorGenerator` + **unique-match rule** as a compile pass run against the recorded DOM snapshot. It mines orthogonal signals straight from captured attributes — `role+name`, visible-text, `data-testid`, scoped CSS, structural XPath — and applies the *uniqueness gate* (a candidate is admissible only if it matches exactly one node in the recorded DOM). This is the new identity baseline; the compiler **never** ships a step whose identity rests solely on the LLM.
2. **LLM enrichment (additive, verified).** The LLM contributes only what mining cannot: `aria/label synthesis`, `anchor_phrases`, `position_hint`, `semantic role disambiguation`. Every enriched signal is re-run through the deterministic uniqueness gate against the recorded DOM; signals that fail the gate are dropped, not trusted. The LLM *enriches the floor*; it does not replace it.
3. **Orthogonality guarantee.** The compiler emits **N engine-orthogonal signals** and asserts that no two share a failure mode (text-change vs attribute-change vs structure-change vs a11y-change). A package fails compile if it cannot produce ≥2 orthogonal admissible signals for a non-marker step — so *one DOM change cannot break all signals* by construction.

**Durability ordering (fixes C.1).** Signals are emitted in an explicit `durability_rank`: **semantic (role+name, label, testid) > textual > structural (CSS) > positional (XPath)**. Both Tier-1 and Tier-2 are zero-token at runtime, so the tie-break is *success probability, not microseconds*. `selector_score.py`'s `_KIND_PRIORITY` is re-derived from this order and the runtime consumes the rank to drive a **live uniqueness gate** (re-running Playwright's unique-match rule against the live DOM at replay) — finally cashing in the multi-signal investment the assessment says is dormant.

**App-version / compatibility fingerprint (insight #19).** Each package emits `compat_fingerprint = {app_build_id?, dom_skeleton_hash, route_signature, framework_hints, recorded_at}` captured at record time and pinned in the CIR. The runtime/cloud compares it against the live app to detect drift *before* a stale selector silently hits — and it is the drift signal that feeds the fleet flywheel.

**Artifact change.** `ElementFingerprint` → `IdentityBundle{ signals: [{kind, value, durability_rank, source, unique_at_compile, orthogonality_class}], frame_chain, shadow_path, compat_fingerprint }`. Frame/shadow traversal travels *in* the identity (insight #12), preserving the iframe-verbatim invariant.

**Enables downstream.** Live fingerprint scoring + uniqueness gate at runtime (G5); recovery that re-grounds against orthogonal signals; drift detection; the floor means compiles still succeed if the LLM is down (reproducibility + cost).

---

## 4. Workflow Validation — independent post-conditions per step, plan-level intent achievement

> **Status: per-step half is built; plan-level half is not.** The doc's central complaint — "the runtime has no `verifyAssertions()`" — is **no longer true**. `runtime/run.js` has a Phase 8 "post-action VERIFY" block (`stepAssertions()`, `evaluateAssertion()`, `hasRequiredAssertion()`) that independently re-checks a compiled post-condition after every step that carries one, separately from whether the action itself threw — every assertion is evaluated (not just up to the first failure), so a fleet dashboard can see one decaying before it becomes a hard failure. `validation_planner.py::infer_success_conditions()` already populates these per-step conditions from `FINAL_INTENT + action + state_diff`, deterministically, for every compiled step (not just steps with an explicit hand-authored `assert`). So §4.1 ("per-step post-condition fingerprint") is essentially done, just not literally in the `{channel, expected_fingerprint, intent_id, severity}` shape this doc specifies — today's shape is `validation.assertions[]` / `validation.success_conditions`. **§4.2 (plan-level goal verifiers — "does the whole workflow achieve its goal, not just each step") is not built** — there is no `goal_verifiers[]` concept anywhere in the schema or compiler, and no compile-time pass walking the intent graph to check every `Goal`/`Phase` has an observable terminal condition.
>
> One live piece of related debt: `TODO.md`'s `BUILD-7` flags `validation.success_conditions` as a "half-exposed" field — it's read by one editor code path but has no dedicated editor UI next to `validation.assertions`, and a decision is still pending on whether to give it a real editor or fold it into `assertions` and delete it.
>
> **In plain language:** this section asked for two checks. Check #1: after every single step, independently confirm the step actually did what it was supposed to (not just "the click didn't error out") — **this exists and runs today**. Check #2: after the whole recipe finishes, confirm the overall goal was actually reached (e.g., "the invoice really did get created," not just "every individual click succeeded") — **this does not exist**. So today's skills catch a wrong click on step 3; they don't yet catch "every step succeeded individually but the workflow as a whole didn't accomplish anything."

**Today.** `validation_planner.py` derives `wait_for`/assertions from `FINAL_INTENT + action + state_diff`, but the runtime has **no `verifyAssertions()`** (assessment §1.2, gap G2): only explicit `assert`-type steps run. There is no check that the *compiled plan achieves the intent*. **(Superseded on the first half — see Status note above. The "no plan-level intent-achievement check" half is still accurate.)**

**Future design — two tiers, both deterministic at runtime:**

1. **Per-step post-condition fingerprint (insight #2, the field-wide blind spot).** The validation pass emits, for every step (not just recovered ones), an **independent post-condition** — verified by a channel the action did not use (re-read AX state / target value / url / DOM-skeleton delta) against a compiled expected-state fingerprint derived from the record-time `state_diff` already captured in `v3.capture_state_snapshot/compare_state`. This converts "the click didn't throw" into "the intended state occurred." Post-conditions are pure data; the runtime evaluates them with zero LLM.
2. **Plan-level intent-achievement check (new).** A compile-time pass walks the intent graph and asserts each `Goal`/`Phase` has at least one terminal post-condition that *observably* establishes the goal state (a DB-visible field, a confirmation surface, a route). If a goal has no observable terminal condition, the compiler emits a `compile_warning` ("goal not independently verifiable") rather than shipping a plan that can succeed-without-achieving. This is the outcome-based success criterion (insight #14/E3) lifted into compile.

**Artifact change.** `ValidationBlock` gains `post_condition: {channel, expected_fingerprint, intent_id, severity}`; package gains `goal_verifiers[]`. Soft (deferred) post-conditions batch into the run report (insight #25) for fleet telemetry.

**Enables downstream.** Trustworthy recovery (a heal is only "successful" if its post-condition passes — the precondition for autonomous self-healing G1); SLA-grade correctness; richer drift telemetry.

---

## 5. Workflow Optimization — deterministic-floor-first, cutting 4–5 LLM calls/step

> **Status: the outcome (fewer LLM calls) was reached, but not through the mechanism this section proposes.** The doc asks for a **conditional gate** — "run the LLM only when the deterministic floor leaves residual uncertainty" — implying the LLM *could* still be called for identity when needed. What actually happened is blunter and, per `CLAUDE.md`'s "LLM does not write selector strings on the primary compile path" invariant, deliberate: selector-identity LLM calls were removed **unconditionally**, not gated on confidence. There is no per-step "is the floor confident enough to skip the LLM" decision for identity — it's simply never called there anymore (two narrow, user-initiated exceptions exist: the 1-click fix API's re-target flow and the Human Edit "draw a new region" vision flow, neither part of the primary compile). The remaining LLM calls per step — per-step intent, semantic description, and (for recovery) Tier 3+ describe-then-match — are still separate calls, not the "single coalesced structured call" §5 proposes; no call-coalescing pass exists. What **does** already exist: `clean_steps()` / `fix_step_order()` (wired into `compile_skill_package()` at build.py:1225) are real dedup/reordering passes, matching part of the "Dedup / merge / prune passes" bullet below — they just aren't organized as named CIR passes (there is no CIR to organize them under). A per-step LLM call cap (`settings.llm_max_calls_per_step`, surfaced in the package as `llm.max_calls_per_step`) already exists as a policy ceiling, but it's a flat cap, not the adaptive "spend the budget only where confidence is low" mechanism this section proposes.
>
> **In plain language:** the doc wanted the compiler to ask itself "do I actually need to ask the AI about this step, or am I already confident?" on a step-by-step basis. Instead, for identifying elements, the answer became a permanent "no, never ask the AI" — which gets the same cost win (way fewer AI calls) through a simpler, blunter rule rather than a smart per-step judgment call. The AI is still asked about a step's *intent* (what is this step trying to do) and, when things go wrong during a live run, how to *recover* — just not about what selector to use.

**Today.** Each step independently fires intent-adjacent, selector, semantic, recovery, and (optional) vision-anchor LLM calls (TRD §7.2). No global optimization pass; redundant work is not deduped; the LLM does jobs deterministic code could do (e.g., re-describing a step whose identity the floor already pins). **(Partially superseded — the selector LLM call is gone entirely, not just deduped; `clean_steps`/`fix_step_order` dedup passes do run today. Intent/semantic/recovery LLM calls remain as described.)**

**Future design — a CIR rewrite pipeline (classic compiler optimization passes), all deterministic:**

- **Deterministic-first gating.** Run the §3 deterministic floor *before* any LLM call. **The LLM is invoked for a step only when the floor leaves residual uncertainty** — ambiguous identity (no ≥2 orthogonal admissible signals), unclear intent, or a destructive action needing more anchors. Confident steps skip LLM enrichment entirely. This alone removes the LLM from the majority of steps, cutting the 4–5 calls/step toward <1 amortized.
- **Call coalescing.** Where the LLM *is* needed, batch intent + identity-enrichment + semantic-description for a step (and across adjacent similar steps) into **one structured call**, not three. Provenance still tags each field.
- **Dedup / merge / prune passes.** Merge `clean_steps`/`fix_step_order`/`optimize_scroll` (today scattered in v3.py) into named CIR passes: dedupe redundant navigations, merge type+blur sequences, prune no-op scrolls, fold consecutive same-target waits, hoist common frame-enters.
- **Cost-bounded pass.** Compute a per-step LLM budget from the policy `max_calls_per_step` and *spend it only where the floor's confidence is low* — turning the flat per-step cost into a steep, justified distribution.

**Artifact change.** CIR carries `optimization_log[]` (each pass, inputs, outputs, hashes) — itself diffable and reproducible.

**Enables downstream.** Cheaper compiles; reproducibility (fewer non-deterministic calls = smaller pinning surface); keeps "AI deeply understands" because the LLM still *enriches* — it just stops doing what mining + scoring already do deterministically.

---

## 6. Skill Generation — CIR → execution.json / recovery.json / inputs.json

> **Status: not started — still exactly the "Today" state described below.** `execution.json` / `recovery.json` remain a direct projection of the `SkillPackage` Pydantic objects, written by `conxa_compile/storage/skill_package_formatters.py` / `skill_packages_build.py`. There is no CIR to emit from, so there's no pure-projection backend, no per-file content hash, no Merkle manifest, and none of the new files this section proposes (`intent_graph.json`, `compat.json`, `verifiers.json`) exist as separate emitted files. This section is entirely blocked on §2 (CIR) landing first.
>
> **In plain language:** unchanged from the original design's "today" state — nothing here has moved since this doc was written.

**Today.** `plugin_builder.py` emits `execution.json` / `recovery.json` / `inputs.json` directly from the `SkillPackage` Pydantic objects.

**Future design.** Emission becomes a **backend over the validated+optimized CIR** — a pure projection, deterministic and total:

- `execution.json` ← Step nodes + `IdentityBundle` (durability-ranked signals) + Decision/Probe nodes (executable branches) + per-step `post_condition`.
- `recovery.json` ← recovery blocks keyed by `intent_id`, ordered by the same durability rank, carrying the orthogonal signal set + describe-then-ground hints (insight #6) — recovery re-grounds toward *intent*, not a dead selector.
- `inputs.json` ← input bindings (today `input_binding_v2.derive_input_binding_v2`), now with provenance and validation rules.
- **New emitted files:** `intent_graph.json` (executable graph), `compat.json` (app-version fingerprint), `verifiers.json` (goal-level post-conditions).

Each emitted file carries its own **content hash**; the manifest is a Merkle list (basis for §7 delta + §8 rollback).

**Enables downstream.** Per-file delta sync (only changed files ship — fixes the "ships all files" gap, assessment §11); the runtime gets executable branches + post-conditions + live-scorable identity it can actually use.

---

## 7. Versioning — a semantic version graph, not a string

> **Scope note.** This section covers the *compile-side authorship* of the version graph in the CIR store. The *artifact-side projection* — how `pack.json`/`manifest.json` carry the version graph, and how signing, delta-sync, and rollback consume it — is specified in [`../07-skill-pack.md`](../07-skill-pack.md) Part 2 §3 and §5. The two are two sides of one mechanism: the compiler authors it, the pack projects and distributes it.

> **Status: not started.** Confirmed against `packages/conxa-core/conxa_core/models/skill_spec.py`: `SkillMeta.version` is still a plain `int`, and `structural_fingerprint` is now a `dict` (a set of "landmark" elements used for the pre-execution drift check in `runtime/drift.js`) rather than a single hash string, but it is still not a version graph — no `parent_version_id`, no semantic change classification, no per-file hashes. This entire section remains future work, blocked on the CIR (§2) existing to diff against.
>
> **In plain language:** every time a skill is recompiled, the only record of "what changed and why" is a bare number that goes up by one. There's no way today to ask "did this new version only change how an element gets identified, or did it change what the workflow actually does" — a question that matters a lot for deciding whether a customer's runtime can silently accept an update or should be more careful about it.

**Today.** `meta.version: int` + `structural_fingerprint` string + `pack.json skill_pack_version`. No history, no semantics, no per-file granularity. **(Minor correction: `structural_fingerprint` is a `dict` of landmark elements today, not a bare string — it now feeds `runtime/drift.js`'s pre-execution drift check. Everything else in this line still holds.)**

**Future design.** Replace the scalar with a **version graph** persisted in the CIR store:

- **Nodes = compiles**, each `{version_id, cir_root_hash, parent_version_id, compat_fingerprint, model_pins, created_at, reason}`. Edges record lineage (recompile, partial-recompile, heal-republish).
- **Semantic classification** of every new version vs its parent, computed by *diffing the CIR* (not the package): `IDENTITY_ONLY` (selectors changed, plan identical) / `PLAN_CHANGE` (steps/branches changed) / `INTENT_CHANGE` (goal changed). This classification drives runtime compatibility (a runtime can accept an `IDENTITY_ONLY` bump silently; a `PLAN_CHANGE` may require re-entitlement).
- **Per-file content hashes** (§6) embedded in `pack.json` so sync diffs at file granularity.

**Artifact change.** `pack.json` carries `version_graph_ref`, `parent_version_id`, `change_class`, `file_hashes{}`.

**Enables downstream.** True per-file delta (G9); rollback (§8); the fleet flywheel can reason about *which* class of change to push (a heal is `IDENTITY_ONLY` → safe auto-push; insight C.1/L1).

---

## 8. Rollbacks — CIR + version history → one-click rollback & safe republish

> **Scope note.** This section covers the *CIR mechanism* that makes rollback deterministic (re-emit a prior `cir_root_hash`). The *artifact/distribution surfaces* of rollback (publisher one-click revert, durability canary auto-rollback, safe heal republish) are specified in [`../07-skill-pack.md`](../07-skill-pack.md) Part 2 §5.

> **Status: not started.** No CIR history, no republish-from-prior-hash mechanism, and no CIR-patch flow for heals exists. `research-analysis/04-architecture/07-skill-pack.md` Part 2 §5 covers the artifact/distribution side of rollback (publisher one-click revert, canary auto-rollback) — worth checking that file too, since it's plausible the *distribution* half has moved even though the *compile-side* half covered here hasn't; that cross-check wasn't done as part of this pass.
>
> **In plain language:** if a published skill turns out to be broken, there's no "undo" button today — reverting means recompiling an older version by hand, and there's no safe way to take a runtime-discovered fix and merge it back in without touching the signed, trusted package directly.

**Today.** None. A bad publish is hard to revert; a heal cannot be safely re-signed.

**Future design.** Because every version is an immutable, content-addressed CIR node with a parent edge, rollback is *selecting a prior `cir_root_hash` and re-emitting* — deterministic and total (the emission backend is pure). Concretely:

- **One-click rollback** = republish version *N-k*'s already-stored CIR; no recompile, identical bytes (reproducibility guarantees byte-identity).
- **Safe republish of a heal (C1 / G1).** A runtime-discovered healed signal arrives as telemetry. Cloud applies it as a **CIR patch** (only the affected `IdentityBundle` node changes → `IDENTITY_ONLY` class), re-runs the deterministic validators + post-conditions against a version-pinned regression environment (insight #14), and emits a new child version. If the patch fails validation, it is rejected without touching the signed artifact — never an in-place mutation (anti-pattern #6).
- **Diff-driven review.** Because CIR is diffable, a human reviewer sees exactly which nodes a heal/recompile touched.

**Enables downstream.** Republish safety, instant revert, and the *write-back loop that keeps signed determinism* — the thing competitors with mutable local caches cannot claim.

---

## 9. Reproducibility — pinned, deterministic compiles (same recording → same package)

> **Status: not started, but the gap is smaller than it used to be.** No `model_pins`, no canonical serialization, no LLM-output memoization, no "compile twice → identical hash" CI gate exists. But the non-deterministic surface has already shrunk on its own: with selector generation now fully deterministic (§3), the only remaining non-deterministic calls per step are intent/semantic description and (on failure) recovery — the LLM calls this section is worried about pinning are fewer than when this doc was written. `compiler_policy_hash` (`bundle.content_hash`, referenced correctly in this section already) does exist and is genuinely a pinning building block. Full reproducibility (byte-identical recompiles) is still not achievable today.
>
> **In plain language:** compiling the same recording twice can still produce two slightly different skills, because the AI's wording isn't pinned down and nothing records exactly which AI model/settings were used. That said, there's less room for this to happen than before, since the AI is no longer involved in the part of compiling (finding elements on the page) that used to vary the most.

**Today.** Same recording → potentially different package across runs (4–5 unpinned LLM calls, no canonicalization). This blocks rollback-to-identical-bytes, regression testing, and audit. **(The "4-5 unpinned LLM calls" figure is now smaller — see Status note above — but the conclusion, no reproducibility, still holds.)**

**Future design — make the compile a pure function of pinned inputs:**

- **Pin everything non-deterministic.** CIR records `model_pins{model_id, version, temperature=0, prompt_hash, decoding_params}` and `compiler_policy_hash` (already present as `bundle.content_hash`, build.py:989). A compile is reproducible *given the same pins*.
- **Canonicalization.** All CIR payloads serialize canonically (sorted keys, normalized whitespace/numbers, stable node ordering by `origin_event_id`) so `cir_root_hash` is stable.
- **LLM-output memoization.** Keyed by `(prompt_hash, model_pin)`, so a re-compile reuses recorded LLM outputs unless an input node changed — making recompiles deterministic *and* cheap. The deterministic floor (§3) means most identity needs no LLM at all, shrinking the non-deterministic surface to near-zero.
- **Reproducibility test in CI.** Compile twice, assert identical `cir_root_hash` (insight #14: version-pinned regression).

**Enables downstream.** Byte-identical rollback (§8); auditable "same input → same artifact" (the determinism positioning, insight #22/L3); deterministic partial recompile.

---

## Future Compile Pipeline (conceptual)

```
events.jsonl
   │  normalize → dedupe → enrich → extract candidates   (deterministic, today's pipeline/)
   ▼
CIR(raw)            nodes: Step | Decision | Probe | Goal/Phase
   │  PASS A: deterministic identity floor (Playwright generator + unique-match gate)
   │  PASS B: deterministic-first GATE → LLM only where residual uncertainty
   │          (single coalesced structured call: intent + identity-enrichment + semantic)
   │          every LLM field re-verified by a deterministic validator + provenance-tagged
   ▼
CIR(enriched)       IdentityBundle (N orthogonal, durability-ranked) + intent graph lowered
   │  PASS C: validation — per-step post-conditions + plan-level goal verifiers
   ▼
CIR(validated)      every step independently verifiable; goals observably terminal
   │  PASS D: optimization — dedupe / merge / prune / coalesce / cost-bound
   ▼
CIR(optimized)      minimal, canonical, content-addressed (cir_root_hash)
   │  EMIT (pure projection backend)
   ▼
SkillPackage  →  execution.json · recovery.json · inputs.json · intent_graph.json
                 compat.json · verifiers.json   (+ per-file hashes, Merkle manifest)
   │
   ▼
Version graph node {version_id, cir_root_hash, parent, change_class, model_pins}
```

## Future SkillPackage / CIR Schema (conceptual, not code)

```
CIR
 ├─ meta: { cir_root_hash, compiler_policy_hash, model_pins[], created_at, source_session_id }
 ├─ intent_graph:
 │    nodes[]: Goal | Phase | Step | Decision | Probe
 │      Decision: { predicate(closed verb set), branches[], default, durability_anchor:intent_id }
 │      Probe:    { channel, expected_fingerprint }            # post-condition node
 ├─ steps[]:
 │    { id, origin_event_id, node_hash, intent_id, branch_id,
 │      action,
 │      identity: IdentityBundle {
 │          signals[]: { kind, value, durability_rank, source:det|llm,
 │                       unique_at_compile, orthogonality_class },
 │          frame_chain, shadow_path, compat_fingerprint },
 │      post_condition: { channel, expected_fingerprint, severity },
 │      recovery: { intent_id, ordered_signals[], describe_then_ground_hints },
 │      provenance: { source, model_id, prompt_hash, confidence },
 │      semantic_description }
 ├─ inputs[]: { name, binding, validation, provenance }
 ├─ goal_verifiers[]: { goal_id, channel, expected_fingerprint }
 ├─ compat_fingerprint: { app_build_id?, dom_skeleton_hash, route_signature, framework_hints }
 └─ optimization_log[]: { pass, in_hashes[], out_hashes[] }

SkillPackage (emission/backend view)
 ├─ meta: { id, version_id, cir_root_hash, parent_version_id, change_class,
 │          compat_fingerprint, file_hashes{} }
 ├─ files: execution.json · recovery.json · inputs.json ·
 │         intent_graph.json · compat.json · verifiers.json
 └─ manifest: Merkle(file_hashes)   # signing + per-file delta basis
```

---

## Migration Path from today's `build.py`

> **Status update on the migration path itself.** Step 3 below shipped — just not sequenced as "step 3 after CIR exists." It landed *first*, directly against `build.py`, with no CIR underneath it, proving the deterministic floor doesn't actually need the CIR as a prerequisite the way this ordering implied. Step 4 (intent graph → executable nodes) shipped a **different** way too: rather than lowering `decision_points` into typed CIR nodes, the branch primitives (`if_present`/`try_dismiss`/`wait_for_one_of`) were added directly to the skill-step schema and runtime executor, bypassing the intent graph entirely (`TODO.md` `EXEC-1`). Steps 1, 2, 5 (the plan-level half), 6, and 7 have not been started.

1. **Introduce CIR as a shadow artifact (no behavior change).** After `compile_skill_package()` builds the `SkillPackage`, *also* lower it into CIR and write `*.cir`. Validate the SkillPackage is reconstructable from CIR. Zero runtime impact. (Closes the structural gap behind G10.) — **Not started.**
2. **Invert emission.** Make `plugin_builder` emit from CIR instead of from the `SkillPackage` objects; the `SkillPackage` becomes a CIR view. Add per-file content hashes + Merkle manifest (enables G9 delta/rollback). — **Not started (blocked on step 1).**
3. **Land the deterministic identity floor.** Add the Playwright-generator + unique-match pass *before* `_llm_compile_selectors` (build.py:959). Re-derive `selector_score._KIND_PRIORITY` from the durability order (fix C.1). Now the LLM call becomes conditional (PASS B gate) — immediate cost cut. — **Done, but as an unconditional removal rather than a conditional gate** (see §5's Status note): `identity_bundle.py` replaced selector generation outright; there is no `_llm_compile_selectors` left to gate. `selector_score.py` gained a *new* durability-ranking function (`durability_score`/`rank_by_durability`) alongside the older `_KIND_PRIORITY`, rather than re-deriving `_KIND_PRIORITY` itself.
4. **Lower the intent graph to executable nodes.** Promote `decision_layer`/`WorkflowIntentGraph` `decision_points` into typed `Decision`/`Probe` CIR nodes; wire `intent_id` through steps (enables G6 + intent-anchored recovery). — **Partially done, different mechanism:** executable branches exist and run in production (`TODO.md` `EXEC-1`), but as a directly-authored step type, not as a lowering of `decision_points` (which remains untyped and unused).
5. **Add validation pass.** Have `validation_planner` emit per-step `post_condition` fingerprints and plan-level `goal_verifiers` into CIR (enables G2 at runtime; precondition for G1). — **Per-step half done** (see §4's Status note: `validation_planner.py` + `run.js`'s Phase 8 VERIFY already do this, without a CIR). **Plan-level `goal_verifiers` half not started.**
6. **Pin + canonicalize.** Add `model_pins`, canonical serialization, and LLM-output memoization; add the "compile twice → identical hash" CI gate (G10 reproducibility). — **Not started.**
7. **Version graph + rollback.** Persist compiles as version-graph nodes; implement republish-from-CIR and the heal-as-CIR-patch flow (G9 rollback + C1 write-back). — **Not started.**

Each step ships independently and is reversible; CIR is additive until step 2 inverts the dependency.

---

## Philosophy Compliance Check

| Principle | Compliance |
|---|---|
| **AI used heavily at compile** | ✅ LLM still does intent understanding + identity enrichment + semantic description — but only where the deterministic floor leaves residual uncertainty (PASS B), and its outputs are verified and provenance-tagged, not blindly trusted. "Deeply understands/enriches" preserved; "does what deterministic code can do" removed. |
| **Runtime deterministic & cheap; zero LLM in hot path** | ✅ Every CIR field the runtime consumes (identity signals, branches, post-conditions, recovery order) is pure data evaluated deterministically. No design element introduces an LLM into normal execution. |
| **Cloud does NOT compile or execute** | ✅ All passes run in Build-Studio-local. Cloud's only new role is *validating + re-signing a CIR patch* from heal telemetry (republish), which is artifact governance, not compilation or execution. |
| **Not an agent / RPA / testing tool** | ✅ Closed-world, compiled, signed artifact; decision points are a *closed deterministic predicate set*, not open-world model-driven control flow. |
| **Compiled package executes deterministically, zero LLM** | ✅ Reproducibility (pinning + canonicalization), orthogonal durable identity, and post-condition verification make execution deterministic *and verifiable*; the package is a pure projection of a content-addressed CIR. |
| **Anti-patterns rejected** | ✅ No LLM in hot path (#1); no in-place mutation of signed package — heal = telemetry → CIR patch → re-sign (#6); durability-ordered not cost-ordered tiers (#7, fixes C.1); post-conditions not model-asserted completion (#3). |
```
