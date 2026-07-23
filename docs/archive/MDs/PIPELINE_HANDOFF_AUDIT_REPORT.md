# Pipeline Handoff Audit — Compile → Human Edit → Test Skill

**Date:** 2026-07-23
**Scope:** The two handoff boundaries only — (1) **Compile → Human Edit** (compiled skill document → editor read-model → saved edits) and (2) **Human Edit → Test Skill** (saved edits → packaged skill pack → local runtime execution). The focus is *artifact-transfer integrity*: does every compiled artifact reach the next stage intact, and does every human edit reach the runtime that "Test Skill" runs?
**Method:** Direct code tracing of the data flow across each boundary — the editor DTO builder, the patch/mutation gate, the saved-skill packager, the skill-pack output writer, the Test-Skill handler and sandbox stager, and the runtime's input gate and name-derivation. I followed specific artifacts (the intent field, the identity bundle, `{{variable}}` inputs, the `sensitive`/`default`/`options` flags, and the placeholder-derived element name) from where they are produced to where they are consumed. No fixes applied.

> **Scope honesty.** This is a handoff/seam audit, not a line-by-line review of each stage's internals. I went deep on what *crosses* the two boundaries and on the state that both sides must agree on. I did **not** re-audit recorder capture, the recovery cascade internals, auth staging, or visual-asset handling except where they ride across a boundary. A companion file, `PIPELINE_AUDIT_REPORT.md`, covers the broader Recording→Test chain; where a finding overlaps I say so and re-frame it as a handoff contract.

---

## Executive Summary

The two handoffs are **structurally sound in their happy path** — the compiled document is projected into a rich editor read-model with almost nothing hidden, and the packager faithfully carries the runtime-critical blocks (`identity_bundle`, `confidence`, `handler_hints`, `compiled_selectors`, `structural_fingerprint`) through to `execution.json`. The required-input gate and default-fill on the runtime side are correct. So this is not a "the seams are broken everywhere" report.

The problem is that **several edits a human makes do not reliably reach the runtime that Test Skill runs — and in the two most important cases, nothing tells the user.** The failures cluster at exactly the places where two subsystems must independently agree on a shared fact (the effective intent, the "has this been edited since it was built" timestamp, the rule for naming an element) and one side was updated without the other.

The most serious findings:

- **🔴 H-1 — Test Skill can silently run a stale, pre-edit copy of the workflow.** The "edited since last build — rebuild before testing" guard is driven by a timestamp (`edited_at`) that is only written when a workflow is *signed off*, never when a step is actually edited. Any edit made after the first build is invisible to the guard, so the runtime executes the last *built* pack, not what the user just changed — with no warning.
- **🔴 H-2 — Editing a step's intent doesn't change the intent the rest of the system uses.** The save path updates the top-level `intent` (which is what the editor shows back, so it *looks* saved) but never updates the `final_intent` inside the step's semantic block — and every downstream consumer (packaging, recovery naming, destructive-action detection) reads `final_intent`. The edit appears to take, and quietly doesn't.
- **🟠 H-3 — Placeholder-named elements lose their free self-healing at runtime.** The compiler now names label-less elements (e.g. a search box) from their placeholder text and bakes that into the element's identity, but the runtime's resolver and self-healing recovery were never taught that placeholder text can be a name — so recovery for exactly those elements comes up empty and gives up. (Same root as `PIPELINE_AUDIT_REPORT.md` H1; re-framed here as a cross-boundary contract drift.)
- **🟠 H-4 — Every step save quietly rewrites the runtime identity bundle,** even edits that don't touch selectors, folding recovery-only/legacy selectors into the runtime hot path and resetting the compiler's uniqueness/provenance markers.
- **🟡 H-5 — The "Sensitive (mask value)" flag is carried all the way into the shipped package and then never used by anything.**
- **🟡 H-6 — Optional inputs are advertised to the calling AI agent as required, and dropdown (`select`) choices are dropped from the runtime's tool schema.**
- **🟢 H-7 — A dropdown default that isn't one of its own options is only rejected by the form, not by the server** (the raw-JSON path bypasses the check).

**Overall reliability read:** the *format* of each handoff is faithful — fields don't get mangled in transit. The failures are about *consistency of shared state*: two copies of the same fact drifting apart (H-2, H-3), and a "did the edit make it across?" signal that watches the wrong event (H-1). These are the dangerous kind because the visible surface says success while the effective behavior is stale.

---

## Where Each Handoff Breaks — Map

```
COMPILE                         HUMAN EDIT                       TEST SKILL
skill.json (data/skills/)       reads + writes skill.json        runs data/skill-packs/<company>/
  identity_bundle  ──────┐      via patch/mutation gate            (the LAST BUILT pack)
  signals.semantic ──────┼──►   step_to_dto → editor      ──►     plugin_builder_saved_skill
  target selectors ──────┘        (read-model)                      → execution.json / inputs.json
                                    │                                → run.js (resolver, recovery,
                                    │  edits saved back                  input gate, interpolate)
                                    ▼
                              ┌─ H-2 intent edit not synced to final_intent (breaks here, surfaces at package/runtime)
                              ├─ H-4 identity bundle rewritten on every save
                              └─ H-1 edit doesn't bump edited_at ─► stale-guard blind ─► Test runs OLD pack
   H-3 placeholder name baked into identity ───────────────────────────► resolver/recovery can't read it
   H-5 sensitive flag ──────────────► carried into inputs.json ─────────► no runtime consumer
   H-6 options/default ─────────────► inputs.json enum/default ─────────► tool schema drops enum, marks all required
```

---

## Findings by Severity

### 🔴 Critical / High

#### H-1 — Test Skill silently runs the last *built* pack, and the staleness guard is blind to real edits

**Where it breaks:** Human Edit → Test Skill.

**The data path.** `cmd_test_workflow` (`handlers/plugins.py:248`) does **not** run the live edited `skill.json`. It requires `plugin.build is not None`, then stages and executes `data_dir/skill-packs/<company>/` — the output of the *last build* (`sync_skill_pack(company, source_dir, …)` where `source_dir = data_dir/skill-packs/<company>`). Editing a step (`cmd_patch_step`) writes `data/skills/<skill_id>/skill.json` and **never rebuilds that pack.** So the only way an edit reaches a test is a rebuild, and a rebuild is only auto-triggered by sign-off.

**The guard that's supposed to catch this.** The UI computes `isStaleTest = wf.edited_at != null && wf.edited_at > plugin.build.last_built_at` (`PluginWorkflowTests.tsx:220`) and disables the Run button when stale (`canRun = !stale && …`, line 371), showing "Edited since last build — rebuild before testing."

**Why the guard fails.** `wf.edited_at` is written in **exactly one place** — `cmd_sign_off_workflow` (`handlers/workflow_editor.py:444`). It is **not** written by `cmd_patch_step`, `cmd_retarget_apply`, `cmd_insert_step`, `cmd_delete_step`, `cmd_reorder_steps`, `cmd_update_workflow_inputs`, or `cmd_replace_literals`. So the timestamp tracks *sign-off*, not *editing*.

**Concrete failure sequence:**
1. Record → compile → edit → sign off (`edited_at = T1`) → auto-build (`last_built_at = T2 > T1`). Not stale. ✅ (build captured those edits.)
2. User re-opens Human Edit and changes a selector, an assertion, a value, or re-targets a step (`patch`/`retarget`). `skill.json` changes at `T3`, but `edited_at` **stays `T1`**.
3. `isStaleTest` = `T1 > T2`? **No.** UI shows *not stale*; Run button enabled.
4. User clicks **Run test**. The runtime stages the pack built at `T2` — the `T3` edits are not in it. **The test runs the pre-edit workflow, reports pass/fail on stale steps, and nothing warns the user.**

**Expected vs actual:**
- *Expected:* any edit that changes `skill.json` after the last build marks the workflow stale (or forces a rebuild) so Test Skill always runs what the user is looking at.
- *Actual:* only a *sign-off* marks it stale; all post-build editing is invisible to the guard, and Test Skill runs the last built pack.

**User impact:** High and insidious. A user fixes a broken step, clicks Test, sees the *old* behavior (still failing, or "passing" against the old steps), and cannot tell that their fix was never executed. This directly defeats the purpose of Test Skill as the verification step before publishing.

**Note:** the backend `cmd_test_workflow` has no staleness check at all — the guard is UI-only, so any caller (or a UI state race) bypasses it entirely.

---

#### H-2 — Editing a step's intent updates the visible field but not the effective intent

**Where it breaks:** Compile → Human Edit (persist), surfaces at packaging and runtime.

**The two copies of "intent."** A compiled step carries the intent in two places: top-level `step["intent"]`, and `step["signals"]["semantic"]["final_intent"]`. The canonical reader is `get_effective_intent()` (`compiler/intent_access.py:8`), which returns `semantic.final_intent` if set, else `llm_intent` — i.e. **the semantic block wins over the top-level field.**

**What the save actually persists.** The editor's Save builds a patch of `{intent, action, target, signals:{selectors, anchors}}` (`StepConfigForm.tsx:415`) — note `signals` contains only `selectors` and `anchors`, **never `semantic`.** `cmd_patch_step` persists via `_apply_step_patch` → `merged = _deep_merge(dict(step), patch)` (`handlers/workflow_editor.py:39`), a plain recursive merge. So `step["intent"]` becomes the new value, but `step["signals"]["semantic"]["final_intent"]` keeps its **old** value.

**Why it looks like it worked.** `patch_gate._merge_step_shell` *does* sync `semantic.final_intent` from a patched intent (`patch_gate.py:47–56`) — but that function runs only inside `validate_editor_patch`, on a throwaway copy used for validation checks. It is **not** the copy that gets written. The DTO then shows `intent = intent_top` (the new value), so the editor reflects the change back and the user believes it saved.

**What downstream actually reads.** The effective intent (`get_effective_intent`, i.e. the stale `final_intent`) is what flows to: the packaged recovery intent (`plugin_builder_saved_skill._saved_step_intents` / `_build_saved_skill_recovery`), the DTO's `final_intent`/generic-intent flag, and destructive/commit-intent detection. All of these keep using the pre-edit intent.

**Expected vs actual:**
- *Expected:* renaming a step's intent updates the intent every consumer sees, including the packaged recovery block.
- *Actual:* the top-level field updates (and the editor echoes it), but the effective intent — the one packaging and recovery use — stays at the old value.

**User impact:** Medium-High. Intent is used to name recovery targets and to classify destructive/consequential steps. A user who renames an intent to fix a mis-classified step (e.g. to stop a benign click being treated as destructive, or to correct a recovery label) will see the rename "stick" in the UI while the compiled/packaged behavior is unchanged. Silent no-op edits erode trust in the whole editor.

**Same-root sibling (Low):** the identical mechanism means `input_binding` is not re-synced on a `value` edit either — the sync logic exists in `_merge_step_shell` (labeled "audit finding L0") but sits on the validation-only path, so it never reaches the saved document. Lower impact than intent, because the runtime interpolates `step.value` directly and does not read `input_binding` at execution time; the staleness only affects editor/packaging input derivation.

---

#### H-3 — Placeholder-derived element names are baked into identity at compile but unreadable at runtime

**Where it breaks:** Compile (contract) → Test Skill (runtime).

**The drift.** The compiler's canonical accessible-name derivation now includes placeholder text: `aria_label || name || inner_text || placeholder || label_text` (`compiler/identity_bundle.py:60–66`, current working-tree change). So a label-less search box compiles to an identity signal like `internal:role=combobox[name="Search"]`, where "Search" came from the placeholder. The two runtime consumers that must mirror this rule do **not** include placeholder:
- `runtime/resolver.js:91` — `fpName = norm(fp.aria_label || fp.name || fp.inner_text)`
- `runtime/run.js:1096` — `a11yRecoveryName = aria_label || name || inner_text || label_text`

Both files carry a comment saying the precedence "must mirror the compiler's canonical derivation" — but the compiler moved and they didn't.

**Concrete failure:** for a placeholder-only element, when the primary selector fails and the runtime falls to accessibility recovery, `a11yRecoveryName` returns `""` and recovery bails immediately (`if (!name) return false;`, `run.js:1104`). In general scoring, `fpName` can't reproduce the placeholder-derived name, so a correct candidate loses its name-match bonus and can fall below the uniqueness margin.

**Expected vs actual:**
- *Expected:* recovery re-derives "Search" from the placeholder exactly as the compiler did, and heals the step for free.
- *Actual:* recovery sees an empty name and refuses to try; the step fails or escalates to paid LLM recovery.

**User impact:** High for the specific (common) element class — search boxes and minimalist inputs identified only by placeholder text silently lose the free, instant self-healing tier the rest of the system is built around. This is the exact element class the placeholder feature was added to support, so the feature's own target case is the one that regresses.

---

#### H-4 — Any step save rewrites the runtime identity bundle from the editor's display projection

**Where it breaks:** Compile → Human Edit (round-trip).

**The projection.** `step_to_dto` (`workflow_dto.py:507–544`) builds the editor's selector list by converting the compiled `identity_bundle.signals` to display strings and then **appending "recovery extras"** — any `target.primary_selector`/`fallback_selectors` not already represented by a signal (legacy/recovery-only selectors) — and rewrites `merged_target.primary_selector`/`fallback_selectors` from that merged list. `defaultsFromStep` (`StepConfigForm.tsx:85`) seeds the form from this merged target.

**The round-trip.** Every Save sends `target: {primary_selector, fallback_selectors}` built from the form's selector list **unconditionally** — even if the user only edited the intent or an assertion (`StepConfigForm.tsx:420`). Because `"target" in patch`, `_apply_step_patch` calls `rebuild_identity_signals_from_target(merged)` (`workflow_editor.py:53`; `selector_grammar.py:198`), regenerating `identity_bundle.signals` from the display list.

**The consequences:**
1. **Recovery-only/legacy selectors get promoted into the runtime hot path.** Those "recovery extras" were never bundle signals, so on rebuild they are created as fresh signals (`source="user"`, `unique_at_compile=False`) and become first-class inputs to the runtime resolver — changing what the resolver scores against.
2. **Compile-time provenance is reset when the display↔stored transform isn't byte-exact.** `rebuild_identity_signals_from_target` carries forward `unique_at_compile`/`source` only when `display_to_signal(display_str)` reproduces the *exact* stored selector string (`selector_grammar.py:230`). Any normalization drift (quoting, whitespace, role/text canonicalization) misses the carry-forward and downgrades a compiler-verified `unique_at_compile=True` signal to `False, source="user"`, weakening the resolver's uniqueness gate.
3. All of the above fires on edits that have nothing to do with selectors.

**Expected vs actual:**
- *Expected:* editing an unrelated field (intent, validation) leaves the compiled identity bundle untouched; only an actual selector edit rebuilds signals.
- *Actual:* every save rebuilds the identity bundle from the editor's display list, folding in recovery-only selectors and potentially resetting compile-time uniqueness/provenance.

**User impact:** Medium. No outright breakage (the selectors are still valid), but repeated saves gradually erode the compiler's carefully-scored, uniqueness-verified signal set toward an unverified, editor-derived one — degrading resolution confidence and recovery quality over the life of a workflow that gets edited a few times.

---

### 🟡 Medium

#### H-5 — "Sensitive (mask value)" is carried into the shipped package and consumed by nothing

**Where it breaks:** Human Edit → Test Skill (and beyond).

The Parameterization drawer collects `sensitive` (`skillInputVariables.ts:157`), `merge_skill_inputs` stores it in `skill.json`, and the packager round-trips it into `inputs.json` (`plugin_builder_saved_skill.py:481–482`). **No runtime code reads a `sensitive` field** — not the input gate, not `interpolate`, not telemetry, not error text. It is written at three stages and read at none.

- *Expected:* a value marked sensitive is masked/redacted wherever it could surface (logs, error strings, future telemetry).
- *Actual:* identical to an unmarked value in every respect except the stored flag.

**User impact:** Low active-leak risk today (telemetry currently sends only step indices/tier names), but the checkbox actively *promises* protection that isn't there — a trust gap that becomes a real leak the moment any future code path echoes an interpolated value without knowing this flag exists. (Same as `PIPELINE_AUDIT_REPORT.md` M1; included here because the flag physically crosses both handoffs and is dropped at the last one.)

#### H-6 — Optional inputs are advertised as required, and `select` options are dropped, at the runtime tool boundary

**Where it breaks:** Human Edit → Test Skill (schema contract to the calling agent).

Two mismatches between what Human Edit captures and what the runtime advertises:

1. **All declared inputs become "required."** `_write_skill_packs_format` sets `manifest.inputs_required = [every declared input name]` (`plugin_builder_output.py:131–132`), and `_skillToolDefinitions` marks **every** declared input `required` in the MCP tool schema (`server.js:411–414`) — regardless of whether Human Edit gave it a `default`. The runtime *execute* gate does honor defaults (`server.js:959–963` fills `effectiveInputs` from `f.default` before checking), so execution isn't wrongly blocked — but the agent-facing schema still tells the calling model that a default-satisfied, effectively-optional field is mandatory.
2. **`select` choices are dropped.** Human Edit stores `options`, the packager maps them to `enum` in `inputs.json`, but the tool schema builder emits only `{type, description}` (`server.js:412`) — no `enum` — and no runtime code validates a provided value against the options. The dropdown constraint set in Human Edit never reaches the agent or the runtime.

- *Expected:* an input with a default is optional to the agent; a `select` input's allowed values reach the tool schema and are validated.
- *Actual:* everything is required to the agent, and `select` degrades to a free-text string with the option list dropped.

**User impact:** Medium. The AI agent driving execution is told to collect values it doesn't need and is given no hint of the valid choices for a dropdown, so it can pass an out-of-range value that nothing rejects until (or unless) the step fails deep in execution.

---

### 🟢 Low

#### H-7 — `select` default-not-in-options is only enforced client-side

The "default must be one of options" check lives in the renderer (`skillInputVariables.ts:147`). The server validator `_validate_skill_inputs` (`workflow_mutations.py:345`) checks only that each input id is present, non-duplicate, and well-formed — it does **not** re-check that a `select` default is among its options. The drawer's Advanced/raw-JSON path bypasses the form, so a mismatched default flows straight into the compiled skill.

**User impact:** Low — requires the raw-JSON path plus a typo; the result is a default that was never a valid choice, not a crash.

---

## What Holds (verified, so it isn't mistaken for unchecked)

These parts of the two handoffs transfer faithfully and are working:

- **Runtime-critical blocks survive packaging.** `_copy_saved_common` carries `identity_bundle`, `confidence`, `handler_hints`, and `compiled_selectors` into `execution.json` (`plugin_builder_saved_skill.py:259`), and `run.js` reads them — so the primary resolution path is fed correctly.
- **`input.json` → `inputs.json` rename is handled,** and the runtime reads `inputs.json` with a legacy `input.json` fallback (`server.js:388–398`), so inputs are not lost across the file-name change.
- **Required-input gate + default fill are correct** on the runtime side (`server.js:952–972`) — a default-satisfied required field is not reported missing, and a genuinely missing required field fails fast with a clear message instead of silently interpolating `""`.
- **`structural_fingerprint` is carried through** to the pack for the runtime's pre-execution drift check (`plugin_builder_saved_skill.py:866–873`).
- **The placeholder `{{variable}}` grammar is centralized** (`placeholder_grammar.py`) and mirrored, by explicit contract, across the Python scanners, the renderer (`skillInputVariables.ts:6`), and `run.js` `interpolate` — three scanners, one grammar.
- **`replace_literals` only rewrites `value` fields,** never selectors/URLs/identity signals (`workflow_mutations._replace_in_step`) — the earlier corruption risk is contained.
- **Undo/redo and version bumping** are consistent across the mutation handlers (each bumps `meta.version` and pushes an undo snapshot).

---

## Root-Cause Themes

1. **Shared facts implemented as independent copies, updated one side at a time.** H-2 (top-level `intent` vs `semantic.final_intent`), H-3 (name-derivation in Python vs two JS files), and H-4 (compiled signals vs editor display projection) are all the same shape: two representations of one truth that must agree, kept in sync by hand, and drifting when only one is touched. The code even *knows* this (the "must mirror the compiler" comments in the runtime, the semantic-sync logic in `_merge_step_shell`) — the sync intent exists but is either on the wrong execution path (H-2) or in the wrong language with no enforcement (H-3).

2. **The "did the edit cross the boundary?" signal watches the wrong event.** H-1 is the most consequential: the staleness detector keys off *sign-off* time, not *edit* time, so it answers a different question than the one the user needs answered ("is what I'm about to test what I just edited?"). A correctness signal that watches an adjacent-but-different event is worse than none, because it reads as reassurance.

3. **UI captures ship ahead of their consumers.** H-5 (`sensitive`) and H-6 (`enum`/optional) are features whose *storage* is fully wired end-to-end while their *effect* is wired nowhere. Reasonable mid-development, but each is a control that visibly promises behavior the pipeline doesn't deliver.

---

## Recommended Architectural Improvements (no fixes applied)

1. **Make one save path the only save path.** H-2 and the `input_binding` sibling both come from the persist merge (`_deep_merge`) bypassing the sync logic in `patch_gate._merge_step_shell`. Persist through the *same* merge that validation uses (or move the intent/`input_binding` sync into the persisted merge), so the copy that gets validated is the copy that gets written. A single "apply patch" function used by both validation and persistence eliminates the class.

2. **Drive the staleness signal off actual edits, not sign-off.** H-1: bump a per-workflow `edited_at` (or a content hash of `skill.json`) on *every* mutation handler, or compare a hash of the live `skill.json` against a hash stored in the built pack at Test time. Additionally enforce the staleness check in `cmd_test_workflow` itself (backend), so the guard cannot be bypassed by a UI state race or a non-UI caller — refuse to test a pack older than the live document, or rebuild first.

3. **One executable contract for element-name precedence.** H-3: put the ordered name-field list in one place and generate or test the others from it. Even a cross-language fixture test — same recorded element, assert the Python compiler and the JS `fpName`/`a11yRecoveryName` derive the *same* name — would fail CI on drift instead of shipping it. This is the same pattern already applied successfully to the placeholder grammar; extend it to accessible-name derivation.

4. **Don't rebuild the identity bundle on non-selector edits.** H-4: only regenerate `identity_bundle.signals` when the patch's `target` actually differs from the stored target, and don't inject the editor's display projection back as the source of truth unless the user changed selectors. Alternatively, keep the "recovery extras" out of the editable selector list (show them read-only) so a save can't silently promote them into the hot path.

5. **A boundary-consumer checklist / lint for per-input flags.** H-5/H-6: any new per-input flag (`sensitive`, `enum`, `default`, `type`) should have a documented consumer on the runtime side before it ships in the drawer. A PR-template item ("if you added a per-input flag, name every stage that reads it") or a test that asserts each declared flag is honored somewhere would have caught all three.

6. **Move input validation server-side.** H-7: fold the `select` default-in-options check (and value-against-`enum` at runtime) into `_validate_skill_inputs` and the runtime input gate, so validation is independent of which UI path saved the inputs.

---

## Overall Assessment

The *shape* of both handoffs is right — artifacts don't get structurally mangled in transit, and the runtime-critical payload reaches the runtime intact. The risk lives in **state consistency across the seam, not data format.** Two edits a human can make in Human Edit — renaming an intent (H-2) and any edit after the first build (H-1) — do not reliably reach Test Skill, and in both cases the surface says "saved" / "ready to test" while the effective behavior is stale. Those two, plus the placeholder-name contract drift (H-3), are what I'd fix before this pipeline is trusted as a verification loop. H-4 is a slow-degradation concern worth addressing before workflows accumulate many edit cycles. H-5, H-6, and H-7 are correctness/trust gaps in features whose storage shipped ahead of their consumers — important to close before the parameterization feature reaches customers, but not execution-blocking today.
