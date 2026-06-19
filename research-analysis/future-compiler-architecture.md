# The Conxa Future Compiler — Architecture Design (24-Month Target)

**Author:** Principal Compiler/Systems Architect
**Scope:** The Build-Studio-local compiler that turns a recording into a signed, deterministic SkillPackage. Design only — no code.
**Grounding:** Current-state assessment §3–6, gap analysis G5/G6/G10, master-insights-v2 (#2/#3/#6/C.1, #15, #19), high-value-repo-review (Playwright scored generator + unique-match rule), and the actual `compiler/build.py`, `selector_score.py`, `recovery_policy.py`, `validation_planner.py`, TRD §7.

---

## 0. Thesis & the one structural defect we are fixing

Today `compile_skill_package()` (build.py:925) goes **events → per-step LLM (4–5 calls) → `SkillPackage`** in a single pass, with *no stable artifact in between*. `selector_score.py` ranks selectors at compile time but the runtime tries `compiled_selectors[]` in array order and never scores live candidates. `ElementFingerprint` is emitted and then ignored at runtime. Versioning is an `int` plus a `structural_fingerprint` string. There is no reproducibility, no rollback, no partial recompile, no workflow-level validation.

The defect underneath all of these is the **missing IR**. Every capability the gap analysis asks for — reproducible compiles (G10), durable identity that pays off at runtime (G5), conditional branches (G6), rollback (G9), the fleet flywheel (L1) — requires a *diffable, model-agnostic, content-addressed representation* between normalized events and the SkillPackage. The future compiler is organized entirely around introducing that layer (the **CIR**, Conxa Intermediate Representation) and around moving every job a deterministic algorithm can do *out of the LLM*, keeping the LLM for what only it can do: understanding intent and enriching identity.

**Design law applied throughout:** *Deterministic floor first; LLM for understanding/enrichment only; nothing the LLM produces is load-bearing without a deterministic verifier.* This both cuts the 4–5 LLM calls/step and makes compiles reproducible.

---

## 1. Intent Graphs — decision points as first-class executable branches

**Today.** `intent_llm.py` emits one `WorkflowIntentGraph{goal, steps, decision_points}` per workflow (build.py:959, `_llm_compile_selectors`). `decision_points` is advisory metadata; the runtime is linear (`run.js` has no conditional control flow). Intent is used to enrich selectors/anchors, never to drive execution or anchor recovery.

**Future design.** Promote the intent graph to the compiler's **control-flow spine**, lowered into the IR as executable nodes.

- **Node taxonomy.** `Goal → Phase → Step | Decision | Probe`. A `Decision` node is `{predicate, branches[], default, durability_anchor}`, where `predicate` is one of a *closed, deterministic verb set* — `if_present(identity)`, `wait_for_one_of(identity[])`, `try_dismiss(identity)`, `url_is(pattern)`, `value_equals(field, expr)` (G6, insight #7). The LLM *proposes* decision points from the recording plus a synthesized "what varies" hypothesis (cookie banners, MFA, A/B); the compiler *lowers* each into a deterministic predicate. No predicate is an LLM call.
- **Intent as the durability anchor.** Every Step carries `intent_id` referencing a graph node. Recovery and post-conditions re-ground toward the *intent* ("dismiss consent dialog"), not merely the selector — so when the DOM drifts, the runtime knows *what the step was for*, satisfying the assessment §4 "intent as durability anchor" gap and feeding describe-then-ground (insight #6).
- **Graph validation.** A deterministic pass asserts every recorded event maps to exactly one reachable graph node and every branch terminates — closing the current "no validation that the graph matches recorded events" gap (assessment §4).

**Artifact change.** New `intent_graph.cir` node block with typed `Decision`/`Probe` nodes; each SkillStep gains `intent_id` and `branch_id`.

**Enables downstream.** Conditional replay on stochastic states (the #1 brittleness of linear replay); intent-anchored recovery and post-conditions; the runtime can finally execute `decision_points` instead of ignoring them.

---

## 2. The Conxa Intermediate Representation (CIR) — the key missing layer

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

**Today (the contradiction).** `llm_selector_generator_v2.py` is the *only* generator of identity; if the LLM is unavailable the step degrades. `selector_score.py` ranks but `_KIND_PRIORITY` and the runtime ordering let CSS sit ahead of semantic in practice, and the runtime ignores scoring entirely (assessment §3, audit C.1). One DOM change can break all signals because they are not guaranteed orthogonal.

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

**Today.** `validation_planner.py` derives `wait_for`/assertions from `FINAL_INTENT + action + state_diff`, but the runtime has **no `verifyAssertions()`** (assessment §1.2, gap G2): only explicit `assert`-type steps run. There is no check that the *compiled plan achieves the intent*.

**Future design — two tiers, both deterministic at runtime:**

1. **Per-step post-condition fingerprint (insight #2, the field-wide blind spot).** The validation pass emits, for every step (not just recovered ones), an **independent post-condition** — verified by a channel the action did not use (re-read AX state / target value / url / DOM-skeleton delta) against a compiled expected-state fingerprint derived from the record-time `state_diff` already captured in `v3.capture_state_snapshot/compare_state`. This converts "the click didn't throw" into "the intended state occurred." Post-conditions are pure data; the runtime evaluates them with zero LLM.
2. **Plan-level intent-achievement check (new).** A compile-time pass walks the intent graph and asserts each `Goal`/`Phase` has at least one terminal post-condition that *observably* establishes the goal state (a DB-visible field, a confirmation surface, a route). If a goal has no observable terminal condition, the compiler emits a `compile_warning` ("goal not independently verifiable") rather than shipping a plan that can succeed-without-achieving. This is the outcome-based success criterion (insight #14/E3) lifted into compile.

**Artifact change.** `ValidationBlock` gains `post_condition: {channel, expected_fingerprint, intent_id, severity}`; package gains `goal_verifiers[]`. Soft (deferred) post-conditions batch into the run report (insight #25) for fleet telemetry.

**Enables downstream.** Trustworthy recovery (a heal is only "successful" if its post-condition passes — the precondition for autonomous self-healing G1); SLA-grade correctness; richer drift telemetry.

---

## 5. Workflow Optimization — deterministic-floor-first, cutting 4–5 LLM calls/step

**Today.** Each step independently fires intent-adjacent, selector, semantic, recovery, and (optional) vision-anchor LLM calls (TRD §7.2). No global optimization pass; redundant work is not deduped; the LLM does jobs deterministic code could do (e.g., re-describing a step whose identity the floor already pins).

**Future design — a CIR rewrite pipeline (classic compiler optimization passes), all deterministic:**

- **Deterministic-first gating.** Run the §3 deterministic floor *before* any LLM call. **The LLM is invoked for a step only when the floor leaves residual uncertainty** — ambiguous identity (no ≥2 orthogonal admissible signals), unclear intent, or a destructive action needing more anchors. Confident steps skip LLM enrichment entirely. This alone removes the LLM from the majority of steps, cutting the 4–5 calls/step toward <1 amortized.
- **Call coalescing.** Where the LLM *is* needed, batch intent + identity-enrichment + semantic-description for a step (and across adjacent similar steps) into **one structured call**, not three. Provenance still tags each field.
- **Dedup / merge / prune passes.** Merge `clean_steps`/`fix_step_order`/`optimize_scroll` (today scattered in v3.py) into named CIR passes: dedupe redundant navigations, merge type+blur sequences, prune no-op scrolls, fold consecutive same-target waits, hoist common frame-enters.
- **Cost-bounded pass.** Compute a per-step LLM budget from the policy `max_calls_per_step` and *spend it only where the floor's confidence is low* — turning the flat per-step cost into a steep, justified distribution.

**Artifact change.** CIR carries `optimization_log[]` (each pass, inputs, outputs, hashes) — itself diffable and reproducible.

**Enables downstream.** Cheaper compiles; reproducibility (fewer non-deterministic calls = smaller pinning surface); keeps "AI deeply understands" because the LLM still *enriches* — it just stops doing what mining + scoring already do deterministically.

---

## 6. Skill Generation — CIR → execution.json / recovery.json / inputs.json

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

**Today.** `meta.version: int` + `structural_fingerprint` string + `pack.json skill_pack_version`. No history, no semantics, no per-file granularity.

**Future design.** Replace the scalar with a **version graph** persisted in the CIR store:

- **Nodes = compiles**, each `{version_id, cir_root_hash, parent_version_id, compat_fingerprint, model_pins, created_at, reason}`. Edges record lineage (recompile, partial-recompile, heal-republish).
- **Semantic classification** of every new version vs its parent, computed by *diffing the CIR* (not the package): `IDENTITY_ONLY` (selectors changed, plan identical) / `PLAN_CHANGE` (steps/branches changed) / `INTENT_CHANGE` (goal changed). This classification drives runtime compatibility (a runtime can accept an `IDENTITY_ONLY` bump silently; a `PLAN_CHANGE` may require re-entitlement).
- **Per-file content hashes** (§6) embedded in `pack.json` so sync diffs at file granularity.

**Artifact change.** `pack.json` carries `version_graph_ref`, `parent_version_id`, `change_class`, `file_hashes{}`.

**Enables downstream.** True per-file delta (G9); rollback (§8); the fleet flywheel can reason about *which* class of change to push (a heal is `IDENTITY_ONLY` → safe auto-push; insight C.1/L1).

---

## 8. Rollbacks — CIR + version history → one-click rollback & safe republish

**Today.** None. A bad publish is hard to revert; a heal cannot be safely re-signed.

**Future design.** Because every version is an immutable, content-addressed CIR node with a parent edge, rollback is *selecting a prior `cir_root_hash` and re-emitting* — deterministic and total (the emission backend is pure). Concretely:

- **One-click rollback** = republish version *N-k*'s already-stored CIR; no recompile, identical bytes (reproducibility guarantees byte-identity).
- **Safe republish of a heal (C1 / G1).** A runtime-discovered healed signal arrives as telemetry. Cloud applies it as a **CIR patch** (only the affected `IdentityBundle` node changes → `IDENTITY_ONLY` class), re-runs the deterministic validators + post-conditions against a version-pinned regression environment (insight #14), and emits a new child version. If the patch fails validation, it is rejected without touching the signed artifact — never an in-place mutation (anti-pattern #6).
- **Diff-driven review.** Because CIR is diffable, a human reviewer sees exactly which nodes a heal/recompile touched.

**Enables downstream.** Republish safety, instant revert, and the *write-back loop that keeps signed determinism* — the thing competitors with mutable local caches cannot claim.

---

## 9. Reproducibility — pinned, deterministic compiles (same recording → same package)

**Today.** Same recording → potentially different package across runs (4–5 unpinned LLM calls, no canonicalization). This blocks rollback-to-identical-bytes, regression testing, and audit.

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

1. **Introduce CIR as a shadow artifact (no behavior change).** After `compile_skill_package()` builds the `SkillPackage`, *also* lower it into CIR and write `*.cir`. Validate the SkillPackage is reconstructable from CIR. Zero runtime impact. (Closes the structural gap behind G10.)
2. **Invert emission.** Make `plugin_builder` emit from CIR instead of from the `SkillPackage` objects; the `SkillPackage` becomes a CIR view. Add per-file content hashes + Merkle manifest (enables G9 delta/rollback).
3. **Land the deterministic identity floor.** Add the Playwright-generator + unique-match pass *before* `_llm_compile_selectors` (build.py:959). Re-derive `selector_score._KIND_PRIORITY` from the durability order (fix C.1). Now the LLM call becomes conditional (PASS B gate) — immediate cost cut.
4. **Lower the intent graph to executable nodes.** Promote `decision_layer`/`WorkflowIntentGraph` `decision_points` into typed `Decision`/`Probe` CIR nodes; wire `intent_id` through steps (enables G6 + intent-anchored recovery).
5. **Add validation pass.** Have `validation_planner` emit per-step `post_condition` fingerprints and plan-level `goal_verifiers` into CIR (enables G2 at runtime; precondition for G1).
6. **Pin + canonicalize.** Add `model_pins`, canonical serialization, and LLM-output memoization; add the "compile twice → identical hash" CI gate (G10 reproducibility).
7. **Version graph + rollback.** Persist compiles as version-graph nodes; implement republish-from-CIR and the heal-as-CIR-patch flow (G9 rollback + C1 write-back).

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
