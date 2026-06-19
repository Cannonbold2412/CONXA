# Conxa Future Recording Subsystem — Architecture Design

**Author:** Principal Systems Architect
**Horizon:** 24 months out. Design-only. No implementation.
**Grounded in:** current-state assessment §1–§2, gap-analysis G12/G6, master-insights-v2 (R1/R4, D1/D3, C1, L1), top-25 (#2/#3/#7/#19/#24), high-value paper/repo reviews, and the live recorder (`bridge.js::serializeTarget`, `events.py::RecordedEvent`, `run.js` step-type sets).

---

## Thesis

The recorder is Conxa's wedge and its most under-invested high-strategy subsystem (maturity 3 / strategic 5). The single governing principle of this redesign: **capture is the cheapest place to acquire signal, and the only place a human is present.** Every signal we fail to capture at record time must be *reconstructed by an LLM at compile* (cost, variance) or *guessed at runtime* (forbidden — hot path is deterministic). So the design rule is: **move signal acquisition left.** Capture N orthogonal locators, the AX neighborhood, intent hints, the post-condition, per-signal confidence, and stochastic-state candidates *at record time, deterministically in-page*, so the compiler enriches rather than invents and the runtime verifies rather than hopes.

The current recorder is already ahead of the field (frames verbatim, broad event vocabulary, before/after fingerprints, anchors). It is **DOM-event-centric**; this redesign makes it **identity-, outcome-, and state-centric** without a rewrite — `serializeTarget` is the single extension point.

What this design refuses (philosophy guardrails, enforced per §13): no LLM in the recorder hot loop (capture stays deterministic, in-page); the recorder produces *input to a deterministic compiled artifact*, never an executable agent trace; no autonomous exploration of branches (we *observe* stochastic states, we do not *probe* for them like a crawler/RPA tool would).

---

## 1. Multi-Locator Capture (orthogonal signals, at record time)

**What to capture.** For every interactive target, a *set* of engine-orthogonal locators generated deterministically in-page, not one collapsed selector and not an LLM reconstruction:
- `role_name` — ARIA role + accessible name (computed name, not just `aria-label`).
- `text` — normalized visible text / label association.
- `testid` — `data-testid|data-test|data-cy|data-qa` (and framework variants).
- `structural` — scoped CSS path, shortest-unique-from-nearest-id.
- `xpath` — absolute + a relative-from-stable-ancestor variant.
- `label/placeholder/name` — form-field identity signals.

**Why.** D1/#3: orthogonality means one DOM change cannot kill all signals; durability-ordered resolution (semantic > structural) is the replay guarantee. Today `Selectors` has exactly four flat strings (`css/xpath/text_based/aria`) with no orthogonality contract, no uniqueness verdict, and no per-signal quality — so the compiler's LLM selector generator re-derives identity it could have been *handed*. This is the C.1 ordering contradiction at its source.

**Deterministic floor.** Port Playwright's in-page `selectorGenerator` scoring algorithm (testid > role+name > label > text > CSS > xpath, GUID-ID penalized) as the **record-time floor**, run live against the page-as-recorded. This is a zero-LLM, published-constant generator. The LLM at compile becomes a *ranker/validator over captured candidates*, not the *sole source* — removing the "no deterministic floor if LLM unavailable" risk (assessment §3).

**Live uniqueness gate at capture.** For each generated locator, evaluate match count against the live DOM and stamp `unique: true|false|n`. A non-unique locator captured-and-flagged is worth more than a unique-looking one that was never tested. This is Playwright's uniqueness rule run *at generation* — its gap is that it isn't re-run at replay; Conxa re-runs it at runtime (out of scope here, but the capture must carry the verdict to make that possible).

**Schema add.** Replace flat `Selectors` with `locators: LocatorSignal[]`, each `{kind, value, scope_frame_idx, unique, match_count, generator}`.

**Flow into compiler.** Compiler ranks the *captured* candidate set by durability, drops non-orthogonal duplicates, and only invokes the LLM to (a) name the element semantically and (b) fill gaps where no high-confidence signal exists — cutting selector-gen LLM calls and making the artifact reproducible (G10 alignment).

---

## 2. Accessibility Capture (the durable substrate)

**What to capture.** A bounded **AX subtree snapshot of the target's neighborhood** at the moment of action: the target node plus ancestors up to the nearest landmark/dialog, and siblings/children within a radius — each as `{role, name, value, states, bounds}`. Not the whole-page AX tree; the *neighborhood*.

**Why.** The paper review's most durable finding: the numbered AX tree is the canonical machine representation of a page and *outlives any model* — it's a property of how the web encodes semantics, not a model-era artifact. It is the substrate Tier-2 resolution and Tier-3 re-grounding bet on. Today the recorder stores a `SnapshotRef` (dom_hash + a11y blob *pointer*) deduplicated at compile — a hash, not a *structured, target-anchored neighborhood*. We promote it from an opaque blob to a queryable, ranked, target-centered AX subtree.

**Schema add.** `ax_subtree: { target: AxNode, ancestors: AxNode[], neighbors: AxNode[], landmark_path: string }` alongside the existing `snapshot` ref (which keeps the full blob for compile-time vision/diff).

**Flow into compiler/runtime.** The compiler derives the post-condition fingerprint (§5) and the Tier-3 re-grounding context *from this subtree* — pre-ranked against the recorded target so the intended node is never the one truncated away (browser-use's fix, #13). At recovery, the runtime hands the host a *target-anchored, capped* AX representation (C2) instead of a blind 50-element digest. The AX subtree is the single most reusable record-time asset: it feeds identity, verification, and recovery.

---

## 3. Intent Capture (lightweight live, refined at compile)

**What to capture.** A structured `intent_hint` upgraded from today's single enum string to `{ verb, role_target, field_semantics, value_class, step_label_guess, ax_state_delta_expected }` — all derivable in-page (verb from action kind, `field_semantics` from label/placeholder/name/autocomplete attr, `value_class` from input type + redaction rules). Plus an optional **human-supplied micro-label** if the Studio offers an inline "what is this step?" affordance (still deterministic capture — the human types, we store).

**Why.** The intent graph (`intent_llm.py`) is Conxa's genuine differentiator but today reconstructs intent from raw DOM at compile in one high-token call. Feeding it *captured* intent hints anchors the graph to ground truth (cheaper, lower-variance) and gives the compiler a deterministic check: does the generated intent graph match the captured per-step hints? (assessment §4: "no deterministic validation that the graph matches recorded events" — this closes it.)

**Schema add.** Expand `SemanticFeatures.intent_hint: str` → `intent: IntentHint` (structured).

**Flow into compiler.** The existing intent graph consumes hints as priors and emits the refined `WorkflowIntentGraph`; the hint set becomes the validation oracle for the graph. Intent also becomes the durability anchor for recovery (re-ground toward recorded *intent*, not just selectors).

---

## 4. Context Capture (surroundings + environment fingerprint)

**What to capture.**
- **Surrounding context** (largely present): parent/siblings, `surrounding_text`, anchors, ancestors chain, form context. Keep; harden radius and add nearest heading/landmark.
- **Page/app-version fingerprint** *(new)*: `app_fingerprint = { url_pattern, app_build_id, framework_markers, route_signature, dom_structural_hash }`. Mine build IDs from `<meta>`, bundle hashes, `window.__APP_VERSION__`-style globals, ServiceNow/Salesforce version markers.
- **Viewport + scaleFactor** *(new)*: `devicePixelRatio`, full viewport, `scroll_position` (present). scaleFactor is demoted-but-required for any future Tier-4 coordinate normalization (#23) — captured once, costs nothing.

**Why.** #19: a content hash gives a *hit* on a stale selector → guaranteed failure. A captured app-version fingerprint is the seed of staleness detection and **feeds the fleet drift flywheel (L1/#1)** — drift is "the live app no longer matches the compiled-against fingerprint," detectable only if we stamped the fingerprint at record time. This is where recording quietly enables the only uncopyable moat.

**Schema add.** `app_fingerprint: AppFingerprint` (event-level, deduped to session-level), `visual.device_pixel_ratio: float`.

**Flow into compiler.** Stamped onto the `SkillPackage` as the compatibility fingerprint; Cloud compares live-runtime telemetry fingerprints against it to detect fleet drift and pre-emptively re-sign (G3/G7).

---

## 5. Validation Capture (the post-condition — what became true)

**What to capture.** Immediately after each action, the **delta that the action caused**, distilled into a *compilable post-condition candidate*, not just raw before/after strings:
- AX subtree delta (nodes/states appeared/disappeared/changed — e.g. `aria-expanded false→true`, option list populated, dialog opened, field value set, row count changed).
- URL/route delta, focus delta, value-readback of the just-edited field.
- The existing `dom_diff` (added/removed interactive signatures) — keep, but classify it.

**Why.** This is the #1 reliability move in the entire corpus (R1/#2) and the field-wide blind spot: five of six tools cannot distinguish "the action didn't throw" from "the intended state occurred." The runtime today has **no independent post-condition check** (`verifyAssertions()` is unwired). You cannot verify an outcome the recorder never observed. Today the recorder captures `state_change.before/after` fingerprints and a `dom_diff` but **does not distill them into a checkable post-condition** — so the compiler's `validation_planner.py` invents assertions from DOM rather than from *observed effect*. Capturing the observed delta makes assertions *grounded*, not generated.

**Schema add.** `post_condition: { ax_delta: AxDelta[], url_delta, focus_delta, value_readback, dom_diff, classified_effect: "navigation|expansion|value_set|row_change|dialog|none" }`.

**Flow into compiler → runtime.** `validation_planner.py` compiles the captured delta into an **independent post-condition fingerprint** asset (re-read via a path the action didn't use). The runtime checks it after *every* step (esp. recovered ones) before advancing — converting recovery success-rate into recovery *correctness* (R1). This is the recording-side enabler for G2, the second-highest-ROI gap.

---

## 6. Confidence Capture (per-signal, at record time)

**What to capture.** Per-signal confidence stamped *in-page at capture*: each locator gets `confidence ∈ [0,1]` from deterministic features (uniqueness verdict, testid presence, accessible-name quality, GUID/hash penalty in the value, structural depth). An aggregate `target_confidence` and a `capture_warnings[]` (e.g. `non_unique_role_name`, `text_only_identity`, `no_stable_ancestor`).

**Why.** Confidence computed at compile is "decorative if nothing consumes it" (assessment §5). Computed *at capture*, per signal, it (a) lets the compiler order resolution by durability with real inputs, (b) lets the runtime set confidence-aware timeout/recovery budgets (G4), and (c) **surfaces weak captures to the human while they are still recording** — the only moment a re-record is free. A low-confidence step can prompt "this element is hard to identify; add a label?" live.

**Schema add.** `confidence` on each `LocatorSignal`; `target_confidence: float` + `capture_warnings: string[]` on the event.

**Flow into compiler/runtime.** Compiler propagates per-signal confidence into the ordered fallback set and the package's `confidence_protocol`; runtime consumes it for budget and recovery aggressiveness. Closes the "confidence not consumed" gap at the source.

---

## 7. Conditional-State Capture (stochastic states as branch candidates)

**What to capture.** The recorder passively **observes and labels** states that are *sometimes present* and marks them as optional/branch candidates — it does **not** probe or explore for them:
- **Pre-action interstitials dismissed/handled:** cookie/consent banners (~30–50% of loads), session-expired overlays, optional MFA, A/B variants, "what's new" modals. Detected by: an interaction with an element inside a `[role=dialog]/[aria-modal]/known-banner` container that is *not on the goal path*, or an element that appears then is dismissed.
- **`wait_for_one_of` candidates:** when the post-action AX delta shows one of several mutually-exclusive states could follow.
- **Optionality signal:** mark a captured step `optionality: "stochastic"` when its target's container matches consent/interstitial heuristics, with the dismiss action recorded as `try_dismiss`-shaped.

**Why.** R4/#7: linear replay is *most* brittle exactly where enterprise flows are messiest. "Deterministic" breaks on the first stochastic banner. The recorder is the right place to *flag* these, because the human's single pass either hit the banner or didn't — and we know which. This is observation, not exploration (philosophy-safe: we are not a crawler).

**Schema add.** Event-level `optionality: "required" | "stochastic" | "branch_candidate"`, `branch_hint: { kind: "if_present|try_dismiss|wait_for_one_of", container_signal, alternatives[] }`.

**Flow into compiler.** The intent graph's `decision_points` (today not executable) are *seeded* by captured `branch_hint`s and compiled into first-class `if_present` / `try_dismiss` / `wait_for_one_of` package steps (G6). Recording flags the candidate; the compiler + human-in-Studio confirm the branch. The runtime stays linear-deterministic *within* each branch.

---

## 8. Semantic Understanding (how record-time signals cut LLM dependence)

The compile pipeline today fires 4–5 LLM calls per step (selector-gen, semantic, validation, recovery, confidence) and one big intent call. Every section above hands the compiler a **deterministic prior** it currently reconstructs:

| Compile LLM job today | Record-time signal that reduces/replaces it |
|---|---|
| Selector generation (`llm_selector_generator_v2`) | §1 captured orthogonal locators + uniqueness → LLM ranks/validates, not generates |
| Semantic description (`semantic_llm`) | §3 structured intent + §2 AX name → description is mostly assembled |
| Assertion synthesis (`validation_planner`) | §5 observed post-condition → assertions grounded in effect |
| Intent graph (`intent_llm`) | §3 per-step hints → priors + validation oracle |
| Confidence (`confidence/layered`) | §6 per-signal capture-time confidence → propagated, not recomputed blind |

**Net:** the LLM moves from *author* to *editor/ranker* over deterministic capture. This makes compiles cheaper, lower-variance, and more reproducible (G10), and is fully philosophy-compliant — heavy AI at compile/enrichment, fed by rich capture, deterministic at runtime.

---

## 9. WorkArena-Critical Interactions (explicit capture design)

These three (#24) are where Conxa wins or loses on ServiceNow/Workday/Salesforce, and where today's DOM-event capture is weakest.

**9a. Typeahead / autocomplete (options appear *after* typing).** The hard case: type → async option list renders → user picks. Naive capture records a `type` then a `click` on an option whose identity is ephemeral and whose existence depends on the typed value.
- **Capture:** a composite `typeahead` event linking the `type` action, the `aria-controls`/`aria-owns` listbox that appeared (the recorder already reads `aria-controls`/`aria-owns` at line ~1237 and has a hover/`captureHoverSnapshot` path — reuse), the **AX subtree of the option list at selection time**, the chosen option's signals, and the *committed value* read back from the input. Record the trigger value as a *parameter* (`{{input}}`), not a literal.
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

```
RecordedEvent:
  action            : { kind, timestamp, value, value_class, redacted }
  frame             : { chain[] }                         # unchanged invariant — verbatim
  target            : { tag, id, classes, inner_text, role, name, label_text, placeholder }
  locators[]        : LocatorSignal{ kind, value, scope_frame_idx,
                                     unique, match_count, generator, confidence }   # §1
  ax_subtree        : { target, ancestors[], neighbors[], landmark_path }           # §2
  intent            : { verb, role_target, field_semantics, value_class,
                        step_label, ax_state_delta_expected }                       # §3
  context           : { parent, siblings[], ancestors[], surrounding_text,
                        anchors[], form_context, nearest_landmark }                 # §4
  app_fingerprint   : { url_pattern, app_build_id, framework_markers,
                        route_signature, dom_structural_hash }                      # §4
  visual            : { bbox, viewport, scroll_position, device_pixel_ratio,
                        snapshot_ref, frames{} }                                    # §4 + existing
  post_condition    : { ax_delta[], url_delta, focus_delta, value_readback,
                        dom_diff, classified_effect }                              # §5
  confidence        : { target_confidence, capture_warnings[] }                     # §6 (per-signal in locators[])
  optionality       : "required" | "stochastic" | "branch_candidate"               # §7
  branch_hint       : { kind, container_signal, alternatives[] } | null            # §7
  composite         : { kind: typeahead|table_op|wizard, ... } | null              # §9
  timing            : { wait_for, timeout }                                         # existing
```

Backward-compatible superset of today's `RecordedEvent`. Every field is **deterministically derivable in-page** except optional human micro-labels. No field requires an LLM at capture.

---

## 11. What This Enables Downstream (recording → compiler → runtime/recovery/durability)

| Captured (record) | Compiler uses it for | Runtime / recovery / durability gains |
|---|---|---|
| Orthogonal locators + uniqueness + confidence (§1) | Durability-ordered fallback set; LLM as ranker | Runtime fingerprint scoring + live uniqueness gate (G5); det. floor |
| AX subtree (§2) | Post-condition asset; Tier-3 re-ground context | Target-anchored capped AX for host recovery (C2); fewer hallucinations |
| Structured intent (§3) | Intent-graph priors + validation oracle | Recovery re-grounds toward recorded *intent*, not just selectors |
| App fingerprint (§4) | Package compatibility stamp | **Fleet drift detection + flywheel (L1/#1)**; staleness invalidation (#19) |
| Post-condition (§5) | Independent post-condition fingerprint | Per-step outcome verification (G2/R1) — the correctness guarantee |
| Per-signal confidence (§6) | Resolution ordering; confidence_protocol | Confidence-aware timeout/recovery budgets (G4); live re-record prompts |
| Conditional-state (§7) | `if_present`/`try_dismiss`/`wait_for_one_of` steps | Linear replay survives stochastic banners/MFA (G6) |
| WorkArena composites (§9) | Parameterized sub-plans + per-screen gates | Reliable typeahead/table/wizard replay; wizard crash-resume (E4) |

The through-line: **what the recorder observes once, the compiler hardens, the runtime verifies, and the fleet learns from.** Recording is the top of the durability funnel.

---

## 12. Migration Note (evolve `bridge.js`, no rewrite)

The redesign is **additive on a single seam**: `serializeTarget()` already returns a structured payload and is the sole element-descriptor builder; `finalizeState()` already computes before/after + `dom_diff`. Extend, don't replace.

1. **Phase A — orthogonal locators + confidence (G5 enabler).** Add the Playwright `selectorGenerator` floor as an in-page helper; emit `locators[]` *alongside* the existing `selectors{}` (keep both; compiler reads new, falls back to old). Stamp uniqueness + deterministic confidence. No schema break — `Selectors` stays, `locators[]` is new-optional then promoted to required via the same "Phase 2 required" mechanism already used for `ancestors`/`surrounding_text`.
2. **Phase B — post-condition distillation (G2 enabler).** Upgrade `finalizeState`'s `dom_diff` into a classified `post_condition` using the AX delta of the already-captured neighborhood. Highest ROI/effort ratio.
3. **Phase C — AX subtree promotion.** Promote the existing `SnapshotRef` blob into a structured, target-anchored `ax_subtree` (the a11y data is already captured at compile; move the neighborhood extraction in-page).
4. **Phase D — intent + app fingerprint.** Structify `intent_hint`; add `app_fingerprint` from meta/globals. Both cheap, in-page.
5. **Phase E — conditional-state + composites.** Add container-heuristic flagging (`optionality`/`branch_hint`) and the `typeahead`/`table_op`/`wizard` composites, reusing the existing `aria-controls`/hover/`captureHoverSnapshot` plumbing.

Each phase ships independently, is consumed opportunistically by the compiler (read-new-fallback-old), and preserves every invariant: **iframe chain verbatim** (`frame.chain` untouched), **auth never captured** (redaction rules extended, not weakened), **NOOP/INTERACTIVE step-type sets in `run.js` unchanged** (composites compile *into* existing executable step types, not new runtime verbs beyond the planned `if_present`/`wait_for_one_of`). `events.py::RecordedEvent` evolves as a superset; the `model_validator` "must re-record without these" gate is the migration enforcement lever already in place.

---

## 13. Philosophy Compliance Check

| Principle | Verdict | Justification |
|---|---|---|
| Human performs workflow once | ✅ | Single pass; all signals captured from that one pass. Optional micro-labels are human-typed, not extra runs. |
| Conxa records *everything* | ✅ | This redesign maximizes capture (orthogonal locators, AX subtree, post-condition, intent, confidence, conditional states). That is its entire thesis. |
| AI heavy at record/understand/enrich/compile | ✅ | Capture stays deterministic/in-page; AI consumes the richer capture at compile as *ranker/editor*, reducing not increasing per-step LLM author calls (§8). |
| AI minimal at runtime | ✅ | Nothing here adds runtime AI. Post-conditions, locators, branches all compile to deterministic checks/steps. |
| AI allowed at recovery | ✅ | Captured AX subtree + intent + confidence make the *host-delegated/Tier-3* recovery better-grounded, not more frequent. |
| Deterministic compiled artifact | ✅ | Every captured field is a deterministic input to the existing compiler; richer priors make the artifact *more* reproducible (G10), not less. |
| NOT a browser agent / RPA / crawler / test framework | ✅ | Conditional-state capture **observes** stochastic states from the human's single pass; it does **not** probe, explore, or autonomously branch. No assertions are authored for testing — post-conditions exist to *verify replay*, not to test the app. |

**Rejected temptations (flagged):** (a) reconstructing identity at compile by LLM instead of capturing it — rejected, moved left (§1). (b) probing the page for hidden branches like an RPA discovery tool — rejected; we only label states the human actually encountered (§7). (c) capturing raw AX-on-every-step as structure — rejected per anti-pattern #8; we capture the *post-condition result*, target-anchored, not blind full-tree dumps (§2/§5).

---

**Critical path within this subsystem:** Phase A (orthogonal locators) + Phase B (post-condition) first — they unblock the two highest-ROI platform gaps (G5, G2) and are the smallest `serializeTarget`/`finalizeState` deltas. Conditional-state and WorkArena composites follow, unblocking G6 and the enterprise-interaction reliability the recorder exists to deliver.
