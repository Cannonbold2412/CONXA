# Recording Subsystem — Architecture Design

**Author:** Principal Systems Architect
**Horizon:** 24 months out. Design-only at authoring time; implementation status reviewed against the codebase on **2026-07-10** (see status blocks per section).
**Grounded in:** current-state assessment §1–§2, gap-analysis G12/G6, master-insights-v2 (R1/R4, D1/D3, C1, L1), top-25 (#2/#3/#7/#19/#24), high-value paper/repo reviews, and the live recorder (`bridge.js::serializeTarget`, `events.py::RecordedEvent`, `run.js` step-type sets).

---

## Implementation Status — 2026-07-10 Review

Each design section below carries a status block verified against the current code. Legend: ✅ Implemented · 🟡 Partially Implemented · ❌ Not Implemented.

| Section | Design item | Status |
|---|---|---|
| §1 | Multi-locator capture (orthogonal signals at record time) | 🟡 — deterministic floor + uniqueness gate built, but in the **compiler**, not the recorder |
| §2 | AX neighborhood capture (`ax_subtree`) | ❌ — snapshot is still an opaque blob |
| §3 | Structured intent capture | 🟡 — legacy string hint now feeds the intent graph; no structured `IntentHint` |
| §4 | Context + app-version fingerprint | 🟡 — surrounding context shipped; `app_fingerprint` / `device_pixel_ratio` not captured |
| §5 | Post-condition capture + verification | 🟡 — compiler grounds assertions in the observed diff and the runtime **verifies every step** (`verifyStep`), but record-time capture is still coarse |
| §6 | Per-signal confidence | 🟡 — per-signal durability/uniqueness + runtime confidence-aware budgets exist, computed at **compile**, not capture; no live warnings while recording |
| §7 | Conditional-state capture | 🟡 — branch step types are fully executable end-to-end (EXEC-1, shipped 2026-07-09); the recorder does not observe/flag them (RT-2) |
| §9 | WorkArena composites (typeahead / table / wizard) | ❌ — none built (tracked as RT-2) |
| §10 | Target `RecordedEvent` schema | ❌ — unchanged except the three branch `ActionKind`s |
| §12 | Migration phases A–E | A 🟡 · B 🟡 · C ❌ · D ❌ · E 🟡 |

The one-line summary: **the downstream half of this design landed first.** The deterministic selector floor, the runtime uniqueness gate, per-step outcome verification, confidence-aware budgets, and branch primitives all exist today — but they are fed by the *same recorder capture the design set out to enrich*. The "move signal acquisition left" thesis is still the open work, tracked in `TODO.md` as **RT-2** (recording-depth: composites, capture-time confidence, conditional-state observation — confirmed unbuilt).

---

## Thesis

The recorder is Conxa's wedge and its most under-invested high-strategy subsystem (maturity 3 / strategic 5). The single governing principle of this redesign: **capture is the cheapest place to acquire signal, and the only place a human is present.** Every signal we fail to capture at record time must be *reconstructed by an LLM at compile* (cost, variance) or *guessed at runtime* (forbidden — hot path is deterministic). So the design rule is: **move signal acquisition left.** Capture N orthogonal locators, the AX neighborhood, intent hints, the post-condition, per-signal confidence, and stochastic-state candidates *at record time, deterministically in-page*, so the compiler enriches rather than invents and the runtime verifies rather than hopes.

The current recorder is already ahead of the field (frames verbatim, broad event vocabulary, before/after fingerprints, anchors). It is **DOM-event-centric**; this redesign makes it **identity-, outcome-, and state-centric** without a rewrite — `serializeTarget` is the single extension point.

What this design refuses (philosophy guardrails, enforced per §13): no LLM in the recorder hot loop (capture stays deterministic, in-page); the recorder produces *input to a deterministic compiled artifact*, never an executable agent trace; no autonomous exploration of branches (we *observe* stochastic states, we do not *probe* for them like a crawler/RPA tool would).

---

## 1. Multi-Locator Capture (orthogonal signals, at record time)

> **Status: 🟡 Partially Implemented** *(2026-07-10)*
>
> **What exists.** The deterministic selector floor this section demands is built — and it went *further* than designed: on a normal compile the LLM was removed as selector author entirely, not just demoted to ranker. `compiler/identity_bundle.py::generate_deterministic_signals` produces the durability-ranked signal set (testid → role+name → text → relational-anchor → CSS → XPath) in Playwright's native `internal:` grammar (`selector_grammar.py`), deduplicates by orthogonality class, penalizes GUID-ish values, and runs a **uniqueness gate against the recorded DOM + a11y snapshot**, stamping `unique_at_compile` per signal (`IdentitySignal` in `conxa_core/models/skill_spec.py`). The runtime re-runs uniqueness live: `resolver.js` walks signals in durability order and only accepts a winner whose score clears `confidenceThreshold` with a `uniqueMargin` over the runner-up.
>
> **What's missing, in plain terms.** None of this happens *in the recorder*. `bridge.js` still emits the same four flat selector strings (`css/xpath/text_based/aria`), and `RecordedEvent.selectors` is still the flat `Selectors` model — there is no `locators[]` field, no per-locator live match-count taken against the page while it was actually open. The compiler derives the signal set after the fact from whatever `serializeTarget` happened to store.
>
> **Why it matters.** The compiler can only rank what the bridge kept. A signal visible on the live page but absent from the serialized snapshot (a framework-specific testid variant, a computed accessible name that differs from the stored HTML, a match-count that changed as the page mutated) is lost forever. The design's point stands: generation at capture is strictly richer than reconstruction at compile.
>
> **Left to build.** Emit `locators[]` from `serializeTarget` with live uniqueness verdicts (Phase A of §12; the compile-side consumer already exists and would need only to prefer captured locators over derived ones). Tracked under `TODO.md` RT-2.

**What to capture.** For every interactive target, a *set* of engine-orthogonal locators generated deterministically in-page, not one collapsed selector and not an LLM reconstruction:
- `role_name` — ARIA role + accessible name (computed name, not just `aria-label`).
- `text` — normalized visible text / label association.
- `testid` — `data-testid|data-test|data-cy|data-qa` (and framework variants).
- `structural` — scoped CSS path, shortest-unique-from-nearest-id.
- `xpath` — absolute + a relative-from-stable-ancestor variant.
- `label/placeholder/name` — form-field identity signals.

**Why.** D1/#3: orthogonality means one DOM change cannot kill all signals; durability-ordered resolution (semantic > structural) is the replay guarantee. `Selectors` has exactly four flat strings (`css/xpath/text_based/aria`) with no orthogonality contract at capture. *(2026-07 correction to the original text: the downstream half of this complaint is fixed — the compiler no longer uses an LLM selector generator on the primary path; `IdentityBundle` is the sole selector source and carries the orthogonality contract, uniqueness verdict, and per-signal durability. The C.1 ordering contradiction is resolved at compile. What remains true: the *capture* still has no orthogonality contract, so the compiler reconstructs from stored attributes rather than being handed live-verified locators.)*

**Deterministic floor.** Port Playwright's in-page `selectorGenerator` scoring algorithm (testid > role+name > label > text > CSS > xpath, GUID-ID penalized) as the **record-time floor**, run live against the page-as-recorded. This is a zero-LLM, published-constant generator. *(Status: the scoring/floor exists — `rank_by_durability` in `selector_score.py` — but runs at compile against the snapshot, not in-page at record.)*

**Live uniqueness gate at capture.** For each generated locator, evaluate match count against the live DOM and stamp `unique: true|false|n`. A non-unique locator captured-and-flagged is worth more than a unique-looking one that was never tested. *(Status: `uniqueness_gate` runs at compile against the recorded snapshot (`unique_at_compile`), and the runtime re-runs uniqueness live at resolve time. The capture-moment gate against the live, possibly-mutating page is the missing piece.)*

**Schema add.** Replace flat `Selectors` with `locators: LocatorSignal[]`, each `{kind, value, scope_frame_idx, unique, match_count, generator}`. *(Status: ❌ — `Selectors` unchanged in `events.py`.)*

**Flow into compiler.** Compiler ranks the *captured* candidate set by durability, drops non-orthogonal duplicates, and only invokes the LLM to fill gaps where no high-confidence signal exists. *(Status: this flow exists today, ranked/deduped exactly as described — just fed from stored event attributes instead of captured locators.)*

---

## 2. Accessibility Capture (the durable substrate)

> **Status: ❌ Not Implemented** *(2026-07-10)*
>
> **What exists.** The recorder still stores a `SnapshotRef` — a hash plus pointers to deduplicated DOM/a11y blobs (`events.py::SnapshotRef`, unchanged). One real improvement since the design was written: that blob is no longer purely opaque — `identity_bundle.py` reads it at compile to verify each signal's uniqueness (`unique_at_compile`), and the Tier-2 runtime recovery derives the accessible name from the recorded fingerprint (`run.js::a11yRecoveryName`) through the strict resolver gate.
>
> **What's missing, in plain terms.** There is no structured, target-anchored AX neighborhood — no `ax_subtree` field, no in-page extraction of the target's ancestors-to-landmark and nearby siblings with roles/names/states. The a11y data exists only as a whole-page blob.
>
> **Why it matters.** Three downstream consumers are starved: post-condition compilation can't express "the dialog opened / the option list populated" (see §5); Tier-3 recovery can't hand the host a capped, target-centered AX context (today Tier 3/4 delegates to the host agent with no pre-ranked AX asset, so the intended node can be exactly the one a naive digest truncates away); and identity verification is limited to what the flat target attributes carry.
>
> **Left to build.** In-page neighborhood extraction in `bridge.js` (the a11y machinery already exists at snapshot time — the work is scoping and anchoring it to the target), the `ax_subtree` schema field, and the compiler/recovery consumers. Phase C of §12.

**What to capture.** A bounded **AX subtree snapshot of the target's neighborhood** at the moment of action: the target node plus ancestors up to the nearest landmark/dialog, and siblings/children within a radius — each as `{role, name, value, states, bounds}`. Not the whole-page AX tree; the *neighborhood*.

**Why.** The paper review's most durable finding: the numbered AX tree is the canonical machine representation of a page and *outlives any model* — it's a property of how the web encodes semantics, not a model-era artifact. It is the substrate Tier-2 resolution and Tier-3 re-grounding bet on. Today the recorder stores a `SnapshotRef` (dom_hash + a11y blob *pointer*) deduplicated at compile — a hash, not a *structured, target-anchored neighborhood*. We promote it from an opaque blob to a queryable, ranked, target-centered AX subtree.

**Schema add.** `ax_subtree: { target: AxNode, ancestors: AxNode[], neighbors: AxNode[], landmark_path: string }` alongside the existing `snapshot` ref (which keeps the full blob for compile-time vision/diff).

**Flow into compiler/runtime.** The compiler derives the post-condition fingerprint (§5) and the Tier-3 re-grounding context *from this subtree* — pre-ranked against the recorded target so the intended node is never the one truncated away (browser-use's fix, #13). At recovery, the runtime hands the host a *target-anchored, capped* AX representation (C2) instead of a blind 50-element digest. The AX subtree is the single most reusable record-time asset: it feeds identity, verification, and recovery.

---

## 3. Intent Capture (lightweight live, refined at compile)

> **Status: 🟡 Partially Implemented** *(2026-07-10)*
>
> **What exists.** The single-string `intent_hint` (heuristic, computed in-page by `bridge.js::intentHint`) is no longer dead weight: it is fed per-step into the workflow intent graph LLM call as `semantic_intent` (`compiler/build.py`), consumed by the intent ontology (`policy/intent_ontology.py`), and used in the layered confidence cross-checks (`confidence/layered.py`). Human step labels also exist now — but in the Human Edit workflow editor, applied *after* recording, not as an inline micro-label affordance during capture.
>
> **What's missing, in plain terms.** The upgrade this section actually specifies — a structured `IntentHint` `{verb, role_target, field_semantics, value_class, step_label_guess, ax_state_delta_expected}` derived in-page — was not built. `SemanticFeatures.intent_hint` is still one string. There is also no deterministic validation that the generated intent graph matches the recorded per-step hints (the "validation oracle").
>
> **Why it matters.** The intent graph is Conxa's differentiator, and it still reconstructs intent mostly from raw DOM in one high-token LLM call. Structured hints would make that call cheaper and lower-variance, and — more importantly — give the compiler a deterministic way to *check* the graph instead of trusting it.
>
> **Left to build.** Structify the hint in `serializeTarget` (verb from action kind, field semantics from label/placeholder/autocomplete, value class from input type + redaction rules — all already readable in-page), widen the schema field, wire the graph validator. Phase D of §12.

**What to capture.** A structured `intent_hint` upgraded from today's single enum string to `{ verb, role_target, field_semantics, value_class, step_label_guess, ax_state_delta_expected }` — all derivable in-page. Plus an optional **human-supplied micro-label** if the Studio offers an inline "what is this step?" affordance (still deterministic capture — the human types, we store).

**Why.** The intent graph (`workflow_intent.py`) is Conxa's genuine differentiator but today reconstructs intent from raw DOM at compile in one high-token call. Feeding it *captured* intent hints anchors the graph to ground truth (cheaper, lower-variance) and gives the compiler a deterministic check: does the generated intent graph match the captured per-step hints? *(2026-07 note: the current string hint is already passed to the graph as a per-step prior, so the "priors" half of this section is live in a weak form; the structured form and the validation oracle are not.)*

**Schema add.** Expand `SemanticFeatures.intent_hint: str` → `intent: IntentHint` (structured). *(Status: ❌ — still a string.)*

**Flow into compiler.** The existing intent graph consumes hints as priors and emits the refined `WorkflowIntentGraph`; the hint set becomes the validation oracle for the graph. Intent also becomes the durability anchor for recovery (re-ground toward recorded *intent*, not just selectors).

---

## 4. Context Capture (surroundings + environment fingerprint)

> **Status: 🟡 Partially Implemented** *(2026-07-10)*
>
> **What exists.** The "largely present" half is confirmed present and now *required*: `ancestors`, `surrounding_text`, and the snapshot ref are mandatory `RecordedEvent` fields (the model rejects recordings without them), alongside parent/siblings, anchors, and form context.
>
> **What's missing, in plain terms.** The two *new* captures this section proposed: `app_fingerprint` (build IDs, framework markers, route signature — nothing in `bridge.js` or the schema mines or stores these) and `visual.device_pixel_ratio` (not captured; only viewport and scroll position are).
>
> **Why it matters.** Without a record-time app-version fingerprint, drift detection cannot distinguish "the app shipped a new version" from "one selector rotted" — and the fleet-drift flywheel (`TODO.md` EXEC-2) explicitly lists the app `compat_fingerprint` as a field the telemetry *should* carry but doesn't yet. This is cheap to capture and is the seed of the staleness/pre-emptive-recompile story.
>
> **Left to build.** In-page fingerprint mining (meta tags, bundle hashes, well-known globals), one schema field each, and stamping onto the `SkillPackage`. Phase D of §12.

**What to capture.**
- **Surrounding context** (present and enforced): parent/siblings, `surrounding_text`, anchors, ancestors chain, form context. Keep; harden radius and add nearest heading/landmark.
- **Page/app-version fingerprint** *(new, ❌)*: `app_fingerprint = { url_pattern, app_build_id, framework_markers, route_signature, dom_structural_hash }`. Mine build IDs from `<meta>`, bundle hashes, `window.__APP_VERSION__`-style globals, ServiceNow/Salesforce version markers.
- **Viewport + scaleFactor** *(new, ❌)*: `devicePixelRatio`, full viewport, `scroll_position` (present). scaleFactor is demoted-but-required for any future Tier-4 coordinate normalization (#23) — captured once, costs nothing.

**Why.** #19: a content hash gives a *hit* on a stale selector → guaranteed failure. A captured app-version fingerprint is the seed of staleness detection and **feeds the fleet drift flywheel (L1/#1)** — drift is "the live app no longer matches the compiled-against fingerprint," detectable only if we stamped the fingerprint at record time. This is where recording quietly enables the only uncopyable moat.

**Schema add.** `app_fingerprint: AppFingerprint` (event-level, deduped to session-level), `visual.device_pixel_ratio: float`. *(Status: ❌.)*

**Flow into compiler.** Stamped onto the `SkillPackage` as the compatibility fingerprint; Cloud compares live-runtime telemetry fingerprints against it to detect fleet drift and pre-emptively re-sign (G3/G7).

---

## 5. Validation Capture (the post-condition — what became true)

> **Status: 🟡 Partially Implemented** *(2026-07-10)* — the section where reality moved furthest since this was written.
>
> **What exists.** The compile and runtime halves of this section are substantially built:
> - The recorder captures before/after page fingerprints and a `dom_diff` of added/removed interactive elements (`bridge.js::finalizeStateWithAfter`).
> - The compiler **grounds assertions in the observed effect**: `state_validation.py::compare_state` diffs the recorded before/after into `url_changed / dom_changed / new_elements / removed_elements / text_change / evidence_strength`, and `validation_planner.py` picks assertion channels from that diff with deterministic weighting — assertions come from what *actually happened*, not invented from static DOM.
> - The runtime **independently verifies every step that carries assertions**: the original text's claim that "`verifyAssertions()` is unwired" is no longer true. `run.js::verifyStep` (Phase 8) evaluates compiled post-conditions after each step with a pre-action baseline for `state_changed`, web-first polling, required-vs-advisory semantics, re-verification after recovery remedies, and per-assertion telemetry so advisory decay is fleet-visible before it becomes a hard failure. This closes the runtime half of G2/R1.
>
> **What's missing, in plain terms.** The record-time *distillation* is still coarse. There is no `post_condition` schema field, no AX-subtree delta (blocked on §2), no focus delta, no value read-back of the just-edited field, no `classified_effect` label ("navigation / expansion / value_set / dialog…"). One concrete loose end: the `dom_diff` the bridge computes is currently consumed by nothing — the `StateChange` pydantic model only keeps `before`/`after`, so the diff is dropped on parse.
>
> **Why it matters.** Assertion quality is capped by the coarse page fingerprint. Today's compiled post-condition can say "something changed on the page" or "the URL changed"; it cannot say "the dialog opened," "the option list populated," or "the field now reads X" — which is exactly the precision recovered steps need before the runtime advances.
>
> **Left to build.** Classify the already-captured delta in-page (`finalizeState` is the seam), add the `post_condition` field, wire the AX delta once §2 lands, and either consume or stop computing `dom_diff`. Phase B of §12 — still the highest ROI/effort item on the capture side.

**What to capture.** Immediately after each action, the **delta that the action caused**, distilled into a *compilable post-condition candidate*, not just raw before/after strings:
- AX subtree delta (nodes/states appeared/disappeared/changed — e.g. `aria-expanded false→true`, option list populated, dialog opened, field value set, row count changed).
- URL/route delta, focus delta, value-readback of the just-edited field.
- The existing `dom_diff` (added/removed interactive signatures) — keep, but classify it *(and give it a consumer — today it is computed and then dropped)*.

**Why.** This is the #1 reliability move in the entire corpus (R1/#2) and the field-wide blind spot: five of six tools cannot distinguish "the action didn't throw" from "the intended state occurred." *(2026-07 correction: Conxa's runtime now does make this distinction — `verifyStep` checks compiled post-conditions independently of the action's own success, including after recovery. What remains is making the recorded post-condition rich enough to be worth checking: the recorder captures the raw before/after but still does not distill it into a classified, checkable effect at capture time.)*

**Schema add.** `post_condition: { ax_delta: AxDelta[], url_delta, focus_delta, value_readback, dom_diff, classified_effect: "navigation|expansion|value_set|row_change|dialog|none" }`. *(Status: ❌.)*

**Flow into compiler → runtime.** `validation_planner.py` compiles the captured delta into an **independent post-condition fingerprint** asset (re-read via a path the action didn't use). The runtime checks it after *every* step (esp. recovered ones) before advancing — converting recovery success-rate into recovery *correctness* (R1). *(Status: ✅ for the flow itself — planner and runtime check both exist; the input is the coarse fingerprint diff rather than the rich captured delta.)*

---

## 6. Confidence Capture (per-signal, at record time)

> **Status: 🟡 Partially Implemented** *(2026-07-10)*
>
> **What exists.** Per-signal quality is real and consumed end-to-end — just computed at **compile**, not capture. Each `IdentitySignal` carries `durability` (0–1), an `orthogonality_class`, and `unique_at_compile`; the layered confidence system (`confidence/layered.py`, deterministic Layers 1–3 with LLM assist only on ambiguous cases) produces a **required** per-step `confidence_report` on every `SkillPackage`, plus a `confidence_protocol`. The runtime consumption this section asked for shipped: `run.js` scales step wait/recovery budgets by `step.confidence` (high confidence → shorter budget), and `resolver.js` enforces `confidenceThreshold` + `uniqueMargin` per signal. The "confidence is decorative" gap is closed.
>
> **What's missing, in plain terms.** Nothing is stamped *in-page at capture*: no per-locator confidence at record time, no `capture_warnings[]` (e.g. `non_unique_role_name`, `text_only_identity`), and — the human-facing half — no live "this element is hard to identify" prompt while the person is still recording.
>
> **Why it matters.** The one moment a re-record is free is while the human is still there. Today a weak capture is only discovered at compile (in the confidence report), when redoing it costs a whole session. A related unbuilt idea — the record-time "automatability score" — is tracked separately in `TODO.md`.
>
> **Left to build.** The in-page deterministic scoring (the features already exist: uniqueness verdict, testid presence, name quality, GUID penalty), the two schema fields, and a Studio recording-UI surface for warnings. Part of RT-2.

**What to capture.** Per-signal confidence stamped *in-page at capture*: each locator gets `confidence ∈ [0,1]` from deterministic features (uniqueness verdict, testid presence, accessible-name quality, GUID/hash penalty in the value, structural depth). An aggregate `target_confidence` and a `capture_warnings[]` (e.g. `non_unique_role_name`, `text_only_identity`, `no_stable_ancestor`).

**Why.** Confidence computed at compile is "decorative if nothing consumes it" (assessment §5). *(2026-07 correction: compile-time confidence is no longer decorative — it drives resolution ordering, runtime budgets, and the package confidence report. The remaining argument for capture-time computation is (c) below: surfacing weak captures to the human while re-recording is still free.)* Computed *at capture*, per signal, it (a) lets the compiler order resolution by durability with real inputs, (b) lets the runtime set confidence-aware timeout/recovery budgets (G4), and (c) **surfaces weak captures to the human while they are still recording**. A low-confidence step can prompt "this element is hard to identify; add a label?" live.

**Schema add.** `confidence` on each `LocatorSignal`; `target_confidence: float` + `capture_warnings: string[]` on the event. *(Status: ❌ on the event; ✅ on the compiled `IdentitySignal`/package side.)*

**Flow into compiler/runtime.** Compiler propagates per-signal confidence into the ordered fallback set and the package's `confidence_protocol`; runtime consumes it for budget and recovery aggressiveness. *(Status: ✅ — this flow exists today.)*

---

## 7. Conditional-State Capture (stochastic states as branch candidates)

> **Status: 🟡 Partially Implemented** *(2026-07-10)*
>
> **What exists.** The downstream machinery shipped first (EXEC-1, 2026-07-09): `if_present`, `try_dismiss`, and `wait_for_one_of` are first-class `ActionKind`s in `events.py`, `SkillStep.branch` exists in the schema, the runtime executes them (`run.js`: `probePresent`, `runBranchBody`, the three handlers — probe + nested body, never escalating to recovery), the build serializer passes them through recursively, and there are unit tests plus a CI gate fixture where an `if_present` dismisses a real cookie banner.
>
> **What's missing, in plain terms.** The *capture* side — the actual subject of this section — is not built. The recorder does not observe or label stochastic states: no `optionality` field, no `branch_hint`, no consent-banner/interstitial container heuristics, no `wait_for_one_of` candidate detection from the post-action delta. There is also no Studio editor UI to author a branch step (explicitly out of EXEC-1's scope), so today branch steps can only enter a workflow by hand-editing the step data.
>
> **Why it matters.** The whole premise is that the recorder *knows* whether the banner appeared during the human's single pass — that knowledge is free at record time and unrecoverable later. Until the recorder flags candidates, every stochastic interstitial requires a human to notice the problem after a failed run and wire the branch manually.
>
> **Left to build.** The passive container heuristics + `optionality`/`branch_hint` schema fields in the recorder, compiler seeding of branch steps from those hints, and the editor confirmation UI. `TODO.md` RT-2 tracks this and marks it "now unblocked" by EXEC-1.

**What to capture.** The recorder passively **observes and labels** states that are *sometimes present* and marks them as optional/branch candidates — it does **not** probe or explore for them:
- **Pre-action interstitials dismissed/handled:** cookie/consent banners (~30–50% of loads), session-expired overlays, optional MFA, A/B variants, "what's new" modals. Detected by: an interaction with an element inside a `[role=dialog]/[aria-modal]/known-banner` container that is *not on the goal path*, or an element that appears then is dismissed.
- **`wait_for_one_of` candidates:** when the post-action AX delta shows one of several mutually-exclusive states could follow.
- **Optionality signal:** mark a captured step `optionality: "stochastic"` when its target's container matches consent/interstitial heuristics, with the dismiss action recorded as `try_dismiss`-shaped.

**Why.** R4/#7: linear replay is *most* brittle exactly where enterprise flows are messiest. "Deterministic" breaks on the first stochastic banner. The recorder is the right place to *flag* these, because the human's single pass either hit the banner or didn't — and we know which. This is observation, not exploration (philosophy-safe: we are not a crawler).

**Schema add.** Event-level `optionality: "required" | "stochastic" | "branch_candidate"`, `branch_hint: { kind: "if_present|try_dismiss|wait_for_one_of", container_signal, alternatives[] }`. *(Status: ❌ — the three action kinds exist, the observation fields do not.)*

**Flow into compiler.** The intent graph's `decision_points` are *seeded* by captured `branch_hint`s and compiled into first-class `if_present` / `try_dismiss` / `wait_for_one_of` package steps (G6). Recording flags the candidate; the compiler + human-in-Studio confirm the branch. The runtime stays linear-deterministic *within* each branch. *(Status: the target step types are fully executable (✅); the seeding pipeline from capture is ❌.)*

---

## 8. Semantic Understanding (how record-time signals cut LLM dependence)

> **Status: 🟡 Partially Implemented** *(2026-07-10)* — one row exceeded the design, the rest await their record-time inputs.

Every section above hands the compiler a **deterministic prior** it currently reconstructs. Status per row:

| Compile LLM job | Record-time signal that reduces/replaces it | Status (2026-07-10) |
|---|---|---|
| Selector generation | §1 captured orthogonal locators + uniqueness → LLM ranks/validates, not generates | ✅ **exceeded** — LLM removed as selector author entirely on the primary path; `IdentityBundle` is the sole source (LLM selector writing survives only in the two user-initiated re-compile paths: 1-click fix and drawn-region re-target) |
| Semantic description (`semantic_llm`) | §3 structured intent + §2 AX name → description is mostly assembled | ❌ — still per-step LLM enrichment; the record-time inputs (§2/§3) don't exist yet |
| Assertion synthesis (`validation_planner`) | §5 observed post-condition → assertions grounded in effect | 🟡 — planner is deterministic and grounded in the *observed* before/after diff (`compare_state`); the richer captured post-condition would raise precision, not change the approach |
| Intent graph (`workflow_intent`) | §3 per-step hints → priors + validation oracle | 🟡 — the legacy string hint is passed as a per-step prior; structured hints and the deterministic validation oracle are unbuilt |
| Confidence (`confidence/layered`) | §6 per-signal capture-time confidence → propagated, not recomputed blind | 🟡 — no longer "recomputed blind": Layers 1–3 are deterministic over signal quality, with LLM assist only on ambiguity; capture-time stamping remains unbuilt |

**Net:** the LLM has already moved from *author* to *editor/ranker* for element identity — the largest single line item — and assertion planning went deterministic. The remaining LLM authorship (semantic description, intent graph) is exactly the part waiting on the §2/§3 record-time signals. This direction is fully philosophy-compliant — heavy AI at compile/enrichment, fed by rich capture, deterministic at runtime.

---

## 9. WorkArena-Critical Interactions (explicit capture design)

> **Status: ❌ Not Implemented** *(2026-07-10)*
>
> **What exists.** Nothing composite. The raw ingredients are present in `bridge.js` (it reads `aria-controls`/`aria-owns`, has the hover/`captureHoverSnapshot` plumbing, and captures `date_pick`/`select`/`drag_drop` as discrete events), but there is no `composite` event, no `typeahead`/`table_op`/`wizard` kind anywhere in the recorder, pipeline, or compiler. (`TODO.md` RT-2 confirms this "unbuilt via grep across `conxa_compile/recorder/`"; the only "wizard" in the codebase is the unrelated Human Edit re-target wizard.)
>
> **Why it matters.** These three interaction classes — typeahead pickers, dynamic tables, multi-step wizards — are the bread and butter of ServiceNow/Workday/Salesforce flows, and today each records as a fragile sequence of independent clicks: the typeahead option's identity is ephemeral, the table row is targeted by position instead of business key, and a wizard crash restarts from step one.
>
> **Left to build.** All three composites as designed below (capture classification in `bridge.js`, `composite` schema field, compiler sub-plan emission). Tracked as RT-2; `TODO.md` sequences it after EXEC-1 (shipped), so it is unblocked.

These three (#24) are where Conxa wins or loses on ServiceNow/Workday/Salesforce, and where today's DOM-event capture is weakest.

**9a. Typeahead / autocomplete (options appear *after* typing).** The hard case: type → async option list renders → user picks. Naive capture records a `type` then a `click` on an option whose identity is ephemeral and whose existence depends on the typed value.
- **Capture:** a composite `typeahead` event linking the `type` action, the `aria-controls`/`aria-owns` listbox that appeared (the recorder already reads these attributes and has the hover-snapshot path — reuse), the **AX subtree of the option list at selection time**, the chosen option's signals, and the *committed value* read back from the input. Record the trigger value as a *parameter* (`{{input}}`), not a literal.
- **Schema:** `composite: { kind: "typeahead", trigger_value_class, listbox_signal, option_target, committed_value_readback }`.
- **Compiler:** emits a deterministic "type → wait_for listbox → select option by orthogonal signal → verify committed value" sub-plan, parameterized.

**9b. Dynamic tables (sort / filter / paginate).** Row identity is unstable; the *operation* is stable.
- **Capture:** classify the interaction as a table operation — record the column/sort/filter control identity, the **filter/sort state** (not row positions), the target cell's identity *relative to its row's stable key* (a business key in the row, not nth-child), and the post-condition as a **row-set delta** (count/visible-keys change), not a pixel diff.
- **Schema:** `composite: { kind: "table_op", op: "sort|filter|paginate|row_select", control_signal, row_key_signal, result_set_delta }`.
- **Compiler:** compiles row targeting as "locate row by business key, then cell," and the post-condition as a result-set assertion (#14 outcome-based).

**9c. Multi-step wizards.** Linear-looking but stateful; steps gate on prior completion.
- **Capture:** stamp each step with `wizard: { wizard_id, step_index, step_label, advance_control, completion_signal }` — the per-screen post-condition that proves the step advanced (the AX state that the next screen rendered).
- **Compiler:** chains steps with **per-screen post-conditions as gates** (feeds checkpoint/resume, E4) so a crash mid-wizard resumes at the last *verified* screen, not from scratch.

All three are captured as deterministic composites; none introduces runtime AI.

---

## 10. Target Future `RecordedEvent` Schema (conceptual)

> **Status: ❌ Not Implemented** *(2026-07-10)*. The only movement since the design: `ActionKind` gained `if_present` / `try_dismiss` / `wait_for_one_of` (EXEC-1). None of the new fields below exist — `selectors` is still the flat four-string model, `intent_hint` a string, `snapshot` a blob ref; `locators[]`, `ax_subtree`, `app_fingerprint`, `post_condition`, `confidence`, `optionality`, `branch_hint`, and `composite` are all absent from `events.py`.

```
RecordedEvent:
  action            : { kind, timestamp, value, value_class, redacted }
  frame             : { chain[] }                         # unchanged invariant — verbatim
  target            : { tag, id, classes, inner_text, role, name, label_text, placeholder }
  locators[]        : LocatorSignal{ kind, value, scope_frame_idx,
                                     unique, match_count, generator, confidence }   # §1  ❌
  ax_subtree        : { target, ancestors[], neighbors[], landmark_path }           # §2  ❌
  intent            : { verb, role_target, field_semantics, value_class,
                        step_label, ax_state_delta_expected }                       # §3  ❌
  context           : { parent, siblings[], ancestors[], surrounding_text,
                        anchors[], form_context, nearest_landmark }                 # §4  ✅ (except nearest_landmark)
  app_fingerprint   : { url_pattern, app_build_id, framework_markers,
                        route_signature, dom_structural_hash }                      # §4  ❌
  visual            : { bbox, viewport, scroll_position, device_pixel_ratio,        # §4  🟡 (no DPR)
                        snapshot_ref, frames{} }
  post_condition    : { ax_delta[], url_delta, focus_delta, value_readback,
                        dom_diff, classified_effect }                              # §5  ❌
  confidence        : { target_confidence, capture_warnings[] }                     # §6  ❌ (exists on compiled signals instead)
  optionality       : "required" | "stochastic" | "branch_candidate"               # §7  ❌
  branch_hint       : { kind, container_signal, alternatives[] } | null            # §7  ❌
  composite         : { kind: typeahead|table_op|wizard, ... } | null              # §9  ❌
  timing            : { wait_for, timeout }                                         # existing ✅
```

Backward-compatible superset of today's `RecordedEvent`. Every field is **deterministically derivable in-page** except optional human micro-labels. No field requires an LLM at capture.

---

## 11. What This Enables Downstream (recording → compiler → runtime/recovery/durability)

A striking amount of the *right-hand column* below already exists — built on compile-time derivation instead of the record-time capture the left column proposes. Status per row:

| Captured (record) | Compiler uses it for | Runtime / recovery / durability gains | Status (2026-07-10) |
|---|---|---|---|
| Orthogonal locators + uniqueness + confidence (§1) | Durability-ordered fallback set; LLM as ranker | Runtime fingerprint scoring + live uniqueness gate (G5); det. floor | 🟡 — fallback set, deterministic floor, and the runtime resolver gate (`uniqueMargin`, `stable_hash` match) all exist; fed from compile-derived signals, not captured locators |
| AX subtree (§2) | Post-condition asset; Tier-3 re-ground context | Target-anchored capped AX for host recovery (C2); fewer hallucinations | ❌ — Tier 3/4 delegates to the host agent (via `step_overrides`) with no pre-ranked AX asset |
| Structured intent (§3) | Intent-graph priors + validation oracle | Recovery re-grounds toward recorded *intent*, not just selectors | 🟡 — string hint feeds the graph; Tier-2 recovery re-grounds via the recorded accessible name, not intent |
| App fingerprint (§4) | Package compatibility stamp | **Fleet drift detection + flywheel (L1/#1)**; staleness invalidation (#19) | ❌ — a drift queue exists on the telemetry side, but with no record-time fingerprint to compare against |
| Post-condition (§5) | Independent post-condition fingerprint | Per-step outcome verification (G2/R1) — the correctness guarantee | ✅ runtime / 🟡 capture — `verifyStep` checks compiled assertions after every step incl. recovered ones; assertions are grounded in the observed (coarse) diff |
| Per-signal confidence (§6) | Resolution ordering; confidence_protocol | Confidence-aware timeout/recovery budgets (G4); live re-record prompts | 🟡 — ordering, protocol, and confidence-adaptive runtime budgets all shipped; live re-record prompts did not |
| Conditional-state (§7) | `if_present`/`try_dismiss`/`wait_for_one_of` steps | Linear replay survives stochastic banners/MFA (G6) | 🟡 — step types fully executable with tests + CI fixture; no recorder flagging, no editor authoring UI |
| WorkArena composites (§9) | Parameterized sub-plans + per-screen gates | Reliable typeahead/table/wizard replay; wizard crash-resume (E4) | ❌ |

The through-line: **what the recorder observes once, the compiler hardens, the runtime verifies, and the fleet learns from.** Recording is the top of the durability funnel — and the funnel's lower stages are now built and waiting on richer input from the top.

---

## 12. Migration Note (evolve `bridge.js`, no rewrite)

The redesign is **additive on a single seam**: `serializeTarget()` already returns a structured payload and is the sole element-descriptor builder; `finalizeState()` already computes before/after + `dom_diff`. Extend, don't replace.

1. **Phase A — orthogonal locators + confidence (G5 enabler).** 🟡 — The deterministic `selectorGenerator`-style floor, uniqueness gate, durability ranking, and orthogonality dedup were all built, but as **compiler** modules (`identity_bundle.py` + `selector_grammar.py` + `selector_score.py` + `selector_filters.py`) consuming the existing flat capture, rather than as an in-page helper emitting `locators[]`. Remaining: move/duplicate the floor in-page, emit `locators[]` alongside `selectors{}` with live uniqueness + capture-time confidence, and have the compiler prefer captured locators (read-new-fallback-old). No schema break needed — same "Phase 2 required" promotion mechanism as `ancestors`/`surrounding_text`.
2. **Phase B — post-condition distillation (G2 enabler).** 🟡 — The downstream consumers landed: `compare_state` grounds the validation planner in the observed diff, and the runtime's `verifyStep` enforces compiled assertions per step. Remaining: the actual distillation in `finalizeState` — classify the delta (`classified_effect`), add the AX delta / focus delta / value read-back, add the `post_condition` field, and give the currently-unconsumed `dom_diff` a consumer. Still the highest ROI/effort ratio on the capture side.
3. **Phase C — AX subtree promotion.** ❌ — `SnapshotRef` is still an opaque blob (now at least read by the compile-time uniqueness gate). The neighborhood extraction has not moved in-page.
4. **Phase D — intent + app fingerprint.** ❌ — `intent_hint` is still a single string (though now consumed as an intent-graph prior); no `app_fingerprint`, no `device_pixel_ratio`. Both remain cheap, in-page additions.
5. **Phase E — conditional-state + composites.** 🟡 — The runtime/schema half of conditional steps shipped (EXEC-1: action kinds, `SkillStep.branch`, handlers, tests, CI fixture). The capture half — container-heuristic flagging (`optionality`/`branch_hint`) — and all three `typeahead`/`table_op`/`wizard` composites are unbuilt (RT-2).

Each phase ships independently, is consumed opportunistically by the compiler (read-new-fallback-old), and preserves every invariant: **iframe chain verbatim** (`frame.chain` untouched), **auth never captured** (redaction rules extended, not weakened), **NOOP/INTERACTIVE step-type sets in `run.js` unchanged** (composites compile *into* existing executable step types — note the `if_present`/`try_dismiss`/`wait_for_one_of` verbs planned here now exist). `events.py::RecordedEvent` evolves as a superset; the `model_validator` "must re-record without these" gate is the migration enforcement lever already in place.

---

## 13. Philosophy Compliance Check

*(The verdicts below describe the design; the parts that have since been built comply as predicted — the deterministic floor, branch primitives, and per-step verification all shipped with zero record-time or hot-path LLM involvement.)*

| Principle | Verdict | Justification |
|---|---|---|
| Human performs workflow once | ✅ | Single pass; all signals captured from that one pass. Optional micro-labels are human-typed, not extra runs. |
| Conxa records *everything* | ✅ | This redesign maximizes capture (orthogonal locators, AX subtree, post-condition, intent, confidence, conditional states). That is its entire thesis. |
| AI heavy at record/understand/enrich/compile | ✅ | Capture stays deterministic/in-page; AI consumes the richer capture at compile as *ranker/editor*, reducing not increasing per-step LLM author calls (§8). |
| AI minimal at runtime | ✅ | Nothing here adds runtime AI. Post-conditions, locators, branches all compile to deterministic checks/steps. |
| AI allowed at recovery | ✅ | Captured AX subtree + intent + confidence make the *host-delegated/Tier-3* recovery better-grounded, not more frequent. |
| Deterministic compiled artifact | ✅ | Every captured field is a deterministic input to the existing compiler; richer priors make the artifact *more* reproducible (G10), not less. |
| NOT a browser agent / RPA / crawler / test framework | ✅ | Conditional-state capture **observes** stochastic states from the human's single pass; it does **not** probe, explore, or autonomously branch. No assertions are authored for testing — post-conditions exist to *verify replay*, not to test the app. |

**Rejected temptations (flagged):** (a) reconstructing identity at compile by LLM instead of capturing it — rejected, moved left (§1). *(In practice the codebase took a middle road: identity is reconstructed at compile, but deterministically, not by LLM — which removed the cost/variance objection while leaving the capture-fidelity objection open.)* (b) probing the page for hidden branches like an RPA discovery tool — rejected; we only label states the human actually encountered (§7). (c) capturing raw AX-on-every-step as structure — rejected per anti-pattern #8; we capture the *post-condition result*, target-anchored, not blind full-tree dumps (§2/§5).

---

**Critical path within this subsystem (updated 2026-07-10):** the original critical path — Phase A + Phase B — is *half done from the wrong end*: their downstream consumers (deterministic selector floor + runtime uniqueness gate for G5; grounded validation planner + per-step `verifyStep` for G2) shipped, while the capture-side deltas to `serializeTarget`/`finalizeState` remain untouched. The remaining recorder work, in order of leverage: **(1)** Phase B's in-page post-condition classification (smallest delta, immediately raises assertion precision for the already-wired verifier), **(2)** Phase A's `locators[]` emission with live uniqueness (feeds the already-built `IdentityBundle` richer input), **(3)** Phase E's conditional-state flagging (EXEC-1 made the target step types real; the recorder just can't produce them yet), then the WorkArena composites. All tracked as `TODO.md` RT-2.
