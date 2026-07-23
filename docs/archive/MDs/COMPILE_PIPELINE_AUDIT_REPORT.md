# Compile Pipeline Audit Report

**Scope:** From the moment a recording enters the compiler (`pipeline/run.py` → `compiler/build.py`) through storage (`json_store`) to consumption by **Human Edit** (`editor/` DTOs, patch gate, mutations, retarget, and the renderer's variable/step forms).

**Method:** Static trace of every data-flow seam — recording → normalize/dedupe/enrich → compile → serialize → persist → load-as-DTO → edit → re-persist → recompile. No fixes applied. Findings below are evidenced by file/line references.

**Date:** 2026-07-23

---

## Executive Summary

The core compile path (normalize → identity-bundle selector generation → assertions/recovery → report) is deterministic, well-guarded, and internally consistent. The `{{variable}}` grammar is now genuinely unified across all four scanners (Python patch gate, DTO scanner, saved-skill exporter, and `runtime/run.js`), which closes the recently-tracked replace-variable audit findings.

The reliability problems are **not in the compiler itself — they are at the compile↔edit boundary.** Two independent "apply a step change" code paths exist, and the one the live editor actually uses is a **plain dictionary deep-merge** that skips every derived-field synchronization the other (now test-only) path performs. This produces two serious data-integrity defects:

1. **Recompiling a session silently destroys all Human Edit work** (variables, parameterized values, intent renames, retargets, inserted steps). The recompile handler overwrites the whole document and carries over nothing but the version number.
2. **Renaming a step's intent in the editor does not change the step's *effective* intent.** The edit lands on a cosmetic top-level field while the field that actually wins (`signals.semantic.final_intent`) and the recovery block keep the pre-edit value — so the step's own description, quality suggestions, destructive-safety checks, and compiled recovery block all keep using the old intent.

A cluster of medium/low issues follows the same root cause: derived fields (`input_binding`, recovery strategies) go stale because the persisting merge doesn't recompute them, and the `assist_llm` machinery meant to recompute them is dead code that the handler never invokes.

**Readiness:** The compiler is production-grade. The **edit/recompile lifecycle is not** — it loses user data on recompile and silently no-ops one of its headline edit operations. These are ship-blockers for anyone who relies on Human Edit.

---

## Severity Legend

| Severity | Meaning |
|---|---|
| **Critical** | Silent data loss or shipped skill behaves contrary to what the editor shows. |
| **High** | User-visible edit does not take effect where it matters. |
| **Medium** | Derived data goes stale; wrong metadata can ship; recoverable. |
| **Low** | Cosmetic, edge-case, or advisory-only inconsistency. |

---

## Findings

### C-1 (Critical) — Recompile silently discards every Human Edit

**Where:** `conxa-builder/python/handlers/compile.py:140-168`

**Root cause:** On compile, the handler derives a deterministic `skill_id = f"skill_{session_id}"`, reads the existing document **only to compute the next version number**, then unconditionally overwrites:

```python
existing = read_skill(skill_id)
version = int((existing.get("meta") or {}).get("version") or 0) + 1 if existing else 1
...
write_skill(skill_id, package.model_dump(mode="json"))
```

A freshly compiled `SkillPackage` always has `inputs=[]` (`compiler/build.py:1313`) and none of the editor's mutations (declared variables, `{{var}}` parameterization, renamed intents, retargeted selectors, inserted `check`/branch steps, confirmed optional interstitials). There is **no merge of the prior document** — confirmed by grep: `existing` is referenced only for the version number.

**Steps to reproduce:**
1. Record and compile a workflow (session `S`).
2. In Human Edit: add variables, parameterize a few values as `{{var}}`, rename an intent, retarget a step.
3. Trigger compile again for the same session/workflow (recompile — happens automatically whenever `workflow.skill_id` is already set, `compile.py:52`).

**Expected:** Recompile refreshes selectors/assertions from the recording while preserving (or explicitly reconciling) human edits, or at minimum warns before discarding them.

**Actual:** The document is replaced wholesale. `inputs` is back to empty; all parameterization, renames, retargets, and inserted steps are gone. No warning, no undo entry (`cmd_compile` never calls `_push_undo`).

**User impact:** A user who spends 20 minutes parameterizing a workflow and then recompiles to pick up a small re-recording loses everything with no prompt and no recovery path. This is the single highest-impact defect in the pipeline.

---

### C-2 / H-1 (Critical→High) — Editing a step's intent does not change its effective intent

**Where:**
- Live apply path: `handlers/workflow_editor.py:39` (`merged = _deep_merge(dict(step), patch)`)
- Effective-intent precedence: `compiler/intent_access.py:8-28`
- Compiler writes the winning field: `compiler/build.py:814, 973` (`semantic["final_intent"] = ...`)
- Consumers of the stale value: `editor/describe.py:109`, `editor/workflow_dto.py:498/504`, `editor/workflow_dto.py:231` (`collect_suggestions`), `editor/patch_gate.py:280` (destructive/intent gate)

**Root cause:** There are **two** patch-apply implementations:

- `compiler/patch.py::apply_step_patch` → `_apply_top_level_step_fields` **correctly** mirrors an intent edit into `signals.semantic.final_intent` + `llm_intent` (patch.py:181-192). **This function is only referenced by tests** (`conxa-cloud/tests/test_phases.py`); the live editor does not call it.
- `handlers/workflow_editor.py::_apply_step_patch` (the RPC path `cmd_patch_step` actually uses) applies the patch with a plain recursive `_deep_merge`. A `{"intent": "new"}` patch sets only the top-level `step["intent"]`.

`get_effective_intent` prefers `semantic.final_intent` over the top-level `intent` (`intent_access.py:13-15`), and the compiler always populates `final_intent`. So after an editor intent rename:

- `step["intent"] = "new"` ✅
- `step["signals"]["semantic"]["final_intent"] = "old"` ❌ (unchanged)
- `step["recovery"]["intent"] / ["final_intent"] = "old"` ❌ (unchanged)

**Steps to reproduce:**
1. Compile a workflow. Pick any interactable step; note its intent (`old_slug`).
2. In the step editor, change the intent to `new_slug`, save (`patchStep(..., assist_llm=false)`).
3. Re-fetch the workflow.

**Expected:** The step's effective intent, its human-readable description, its recovery block, and quality suggestions all reflect `new_slug`.

**Actual:**
- The editable intent field shows `new_slug` (the form reads top-level `step.intent`, `StepConfigForm.tsx:91`).
- `describe_step` still renders `(old_slug)` (`describe.py:109` reads effective intent).
- `collect_suggestions`, the destructive-safety gate, and the compiled `recovery` block all keep `old_slug`.
- The shipped skill's recovery/semantic-matching layer runs against `old_slug`.

**User impact:** The rename appears to work (the field updates) but is a no-op everywhere it matters. The editor shows two different intents for the same step simultaneously (field vs. description). Any recovery behavior keyed on intent uses the stale value. Because it *looks* applied, users won't know to work around it. Rated Critical for "shipped skill contradicts the editor," High for practical blast radius.

---

### M-1 (Medium) — `input_binding` sync on value edits is dead in the live path

**Where:** `editor/patch_gate.py:57-67` vs. `handlers/workflow_editor.py:39`

**Root cause:** `patch_gate._merge_step_shell` recomputes `input_binding` from the edited value (the fix annotated "audit finding L0"). But `_merge_step_shell` runs **only inside `validate_editor_patch` for validation and its result is discarded** (`patch_gate.py:201`). The value that actually persists comes from `handlers/workflow_editor.py:39`'s `_deep_merge`, which copies `value` verbatim and never touches `input_binding`.

**Steps to reproduce:**
1. A step has `value = "{{old_name}}"`, `input_binding = "old_name"`.
2. Edit the value to `"{{new_name}}"` (or to a plain literal) and save.

**Expected:** `input_binding` becomes `"new_name"` (or `null` for a literal).

**Actual:** `input_binding` stays `"old_name"`.

**User impact:** `input_binding` is copied into the exported plugin step (`plugin_builder_saved_skill.py:177`). Runtime substitution uses the value's `{{...}}` (via `interpolate`), so execution isn't broken, but the exported binding metadata is wrong and inconsistent with the value. The intended fix is silently ineffective in production — a maintenance trap: the next engineer will read the patch-gate comment and assume it works.

---

### M-2 (Medium) — `assist_llm` is a dead parameter; editor never re-syncs recovery deterministically

**Where:** renderer sends `patchStep(..., assist_llm=false)` (`workflowApi.ts:273`, `StepConfigForm.tsx:264…`); `cmd_patch_step` (`handlers/workflow_editor.py:66-123`) **never reads `assist_llm`**.

**Root cause:** The `apply_step_patch(assist_llm=...)` design in `compiler/patch.py` has two arms — LLM-assist (True) and deterministic recovery re-sync via `_sync_recovery_deterministic` (False). The editor's own `_apply_step_patch` implements neither; it only rebuilds `identity_bundle.signals` when `target` changes (workflow_editor.py:51-62).

**Consequence:** Editing a step's `validation.wait_for` never realigns `recovery.strategies` to the new wait shape (which `_sync_recovery_deterministic` → `merge_recovery_strategies_for_wait_shape` would do). Recovery strategies drift from the step's validation after edits. Combined with C-2, the entire `compiler.patch.apply_step_patch` module is orphaned from production and covered only by tests — the tests pass while the real path diverges.

**User impact:** Recovery behavior can silently mismatch a step's edited validation. Also a correctness-of-tests problem: green tests give false confidence in the edit path.

---

### M-3 (Medium) — Value `{{var}}` edits are not reconciled with the declared inputs list

**Where:** `editor/patch_gate.py` (value edits) vs. `editor/workflow_mutations.py::merge_skill_inputs` (inputs managed independently)

**Root cause:** The declared `inputs` list (what the runtime prompts for, via `manifest.inputs` in `runtime/server.js:386-395`) and the `{{var}}` tokens inside step values are maintained by two separate operations with no enforced reconciliation. Editing `{{old}}`→`{{new}}` in a value does not add `new` to `inputs` or remove now-unused `old`.

**Expected:** Renaming a variable in a value keeps the inputs list consistent, or the save is blocked/warned until they agree.

**Actual:** The value references `{{new}}`; the inputs list still declares `old`. At runtime `{{new}}` resolves to `""` (empty) because `new` was never declared, and the agent is still prompted for the dead `old`.

**Mitigation present (partial):** The renderer surfaces `missingSpottedIds` ("N new") and `unusedRowIds` ("Not used in any step") hints (`skillInputVariables.ts`, `ParameterizationDrawer.tsx:219-220,442`). These are advisory only — nothing enforces consistency at save.

**User impact:** Silent empty substitutions at execution time and a dead prompt, unless the user notices and acts on the advisory hints.

---

### L-1 (Low) — `intent_graph` step indices go stale after reorder/insert/delete

**Where:** `editor/workflow_mutations.py::reorder_steps` (43-60), `delete_step_at` (63-79), `insert_step_after`; `intent_graph.steps[].index` is never renumbered.

**Assessment:** `WorkflowIntentGraph.steps[].index` still points at pre-mutation positions after a structural edit. Confirmed **not consumed by the runtime** (grep of `runtime/*.js` for `intent_graph`/`verification_anchor` is empty), and the DTO surfaces it raw for display. So this is an advisory/display inconsistency only, not an execution bug.

---

### L-2 (Low) — `_deduplicate_input_bindings` can desync value vs. binding for mixed values

**Where:** `compiler/build.py:1219-1237`

**Root cause:** When two steps derive the same binding, the second is renamed to `name_2`, but the value is rewritten **only if it exactly equals `{{name}}`** (`build.py:1236`). A mixed value (e.g. `"prefix {{name}}"`) keeps `{{name}}` while `input_binding` becomes `name_2`.

**Assessment:** Compile-time edge case (two fields resolving to the same derived name with non-pure values). Produces a binding/value mismatch analogous to M-1. Low frequency.

---

### L-3 (Low) — Find & replace can nest braces inside a mixed placeholder value

**Where:** `editor/workflow_mutations.py::_replace_in_step` (guarded by `FULL_PLACEHOLDER_RE`)

**Root cause:** The M3-audit guard (`not FULL_PLACEHOLDER_RE.match(val)`) only protects values that are **exactly** one placeholder. A mixed value like `"{{db}}/extra"` is unprotected: a find of `"db"` → `"{{db_name}}"` yields `"{{{{db_name}}}}/extra"` (nested braces), which no scanner interpolates.

**Assessment:** Requires the find-string to coincide with a substring of an existing variable id inside a mixed value. Narrow, but a real corruption path that bypasses the placeholder-syntax gate (that gate runs on step *value patches*, not on the replace path).

---

### L-4 (Low) — Case-sensitivity mismatch in the variable "linked" badge

**Where:** `ParameterizationDrawer.tsx:336` (`rows.some((r) => r.id.trim() === id)`, case-sensitive) vs. `skillInputVariables.ts` `missingSpottedIds`/`rowsToServerPayload` (now case-insensitive).

**Assessment:** A spotted `email` with a declared row `Email` shows as "not linked" on the per-chip badge while the header count treats it as covered. Cosmetic inconsistency introduced when dedup went case-insensitive but the chip badge didn't.

---

### L-5 (Low) — Backend input validation doesn't enforce `default ∈ options`

**Where:** `editor/workflow_mutations.py::_validate_skill_inputs` (only id format/uniqueness) vs. frontend `rowsToServerPayload` (validates select default membership).

**Assessment:** A `select` input whose `default` is not among its `options` is rejected by the form but accepted via the Advanced JSON editor / direct RPC. The backend is the trust boundary and should not rely on the form for this. Low impact (runtime tolerates it), but it's the trust-boundary gap.

---

### Observation O-1 — Dual-store write with swallowed file error

**Where:** `conxa_core/storage/json_store.py::write_skill` writes `db_set(...)` then a best-effort file write inside `try/except OSError: pass`. `read_skill` prefers the DB. In Build Studio the DB is filesystem-backed, so reads stay consistent, but a failed file write leaves a stale `skills/<id>.json` that any out-of-band file consumer (or the file-fallback in `list_skill_summaries`) would read as old. Not a live bug given read-prefers-DB; noted for durability.

### Observation O-2 — `list_skill_summaries` ordering differs by backend

**Where:** `json_store.py::list_skill_summaries` returns `modified_at: 0.0` and reversed-insertion order from the DB path, but mtime-sorted order from the file path. Cross-environment ordering inconsistency; out of the core compile path but adjacent.

---

## Root-Cause Analysis (consolidated)

Almost every High/Medium finding traces to **one architectural fork**: two "apply a change to a step/document" paths that were allowed to diverge.

```
                        ┌─ compiler/patch.py::apply_step_patch  ← syncs semantic.final_intent,
                        │     (+ _sync_recovery_deterministic)      input_binding, recovery, url→context
   a step edit ────────►┤     *** referenced only by tests ***
                        │
                        └─ handlers/workflow_editor.py::_apply_step_patch  ← plain _deep_merge
                              *** the live editor path ***             (no derived-field sync)
```

- The **rich** path knows that `intent`, `value`, and `url` have *derived shadows* (`semantic.final_intent`, `input_binding`, `context.page_url`, recovery intent/strategies) and keeps them coherent.
- The **live** path treats the step as a flat bag of keys and merges verbatim, so every derived shadow rots on edit.
- `patch_gate._merge_step_shell` re-implements *some* of that sync — but only for throwaway validation, so it's write-only-to-nowhere (M-1).
- The `assist_llm` flag that was supposed to select behavior is never read (M-2).

The **recompile data-loss** defect (C-1) is a second, orthogonal root cause: compile treats the persisted document as disposable output rather than as a document that has accrued human state, and there is no merge/reconcile step between "fresh compiler output" and "what the user edited."

The **variable/inputs consistency** issues (M-3, L-2, L-3) share a third theme: `{{var}}` tokens live in step values while their declarations live in a separate `inputs` list, and nothing enforces the invariant that the two agree.

---

## Recommended Architectural Improvements

*(Recommendations only — no fixes were applied.)*

1. **Collapse the two apply paths into one.** Make `cmd_patch_step` delegate to a single canonical `apply_step_patch` (the one in `compiler/patch.py`, or a shared helper) so derived-field synchronization happens in exactly one place. Delete the divergent `handlers/workflow_editor.py::_apply_step_patch` merge, or reduce it to a thin wrapper. This closes C-2, M-1, and M-2 together and makes the existing tests actually cover the live path.

2. **Make recompile edit-preserving (C-1).** Before overwriting, load the existing document and reconcile: carry forward `inputs`, per-step `intent`/parameterized `value`/`input_binding`, retarget results, inserted `check`/branch steps, and `optional_hint` confirmations — matched by a stable per-step key (the step already carries `snapshot_dom_hash`/`source` identity that can anchor a diff), not by positional index. Where a recorded step no longer exists, surface a reconcile summary. At absolute minimum, push an undo snapshot and warn before discarding edits.

3. **Establish "derived fields" as a first-class concept.** `semantic.final_intent`, `input_binding`, `context.page_url`, and recovery `intent/final_intent/strategies` are all functions of a small set of source fields. Centralize their recomputation in one `normalize_step(step)` function called after every mutation (edit, retarget, insert), so no future edit path can forget one.

4. **Enforce the value↔inputs invariant at save (M-3).** On any save that changes values or inputs, reconcile declared `inputs` against the union of `{{var}}` tokens found in step values: block or auto-add missing declarations and flag orphaned ones. Move the existing advisory hints from "nice to notice" to "enforced at the boundary."

5. **Harden the placeholder boundary (L-3, L-5).** Run the placeholder-syntax validation over the find-&-replace output as well as direct value patches, and validate `select` default membership server-side in `_validate_skill_inputs`, not only in the form.

6. **Renumber/rekey structural metadata on structural edits (L-1).** When steps are reordered/inserted/deleted, renumber `intent_graph.steps[].index` (or key intent-graph entries by something position-independent) so advisory data doesn't drift.

7. **Add a compile↔edit round-trip regression test.** Compile → edit (intent rename, value parameterize, retarget) → assert effective intent/description/recovery reflect the edit → recompile → assert edits survive (post-fix). This is the test the current suite is missing, and its absence is why C-1/C-2 shipped.

---

## Overall Assessment

| Sub-system | Reliability | Notes |
|---|---|---|
| Normalize / dedupe / enrich (`pipeline/`) | **Strong** | Deterministic, conservative dedupe, scroll annotation correct. |
| Selector / identity compilation (`compiler/`) | **Strong** | IdentityBundle-driven, LLM excluded from primary selector generation, scoring gated. `label_text` last-resort ordering is consistent with a11y precedence. |
| Compile report / packaging | **Strong** | Fails loud on missing LLM providers; sensible confidence thresholds. |
| Serialization / storage round-trip | **Adequate** | Model-dump drops undeclared fields as intended; post-compile documents are raw dicts never re-validated (acceptable but undocumented). Minor dual-store/order quirks (O-1, O-2). |
| **Compile ↔ Human Edit boundary** | **Weak** | Divergent apply paths cause stale derived fields (C-2, M-1, M-2) and unenforced value/inputs consistency (M-3). |
| **Recompile lifecycle** | **Unsafe** | Silent, unrecoverable loss of all human edits (C-1). |
| Retarget wizard (`retarget.py`) | **Good** | Correctly re-syncs recovery on validation change; iframe `frame_nested` handling for `match_count` is sound. |

**Bottom line:** The compiler is ready. The **edit-and-recompile lifecycle around it is not.** Two defects — recompile wiping edits (C-1) and intent renames not taking effect (C-2) — are ship-blockers for any workflow that goes through Human Edit more than once. Both stem from treating a step/document as a flat value bag instead of a structure with derived fields and accrued human state. Unifying the apply paths and making recompile edit-preserving would move this sub-system from "unsafe" to "strong" without touching the compiler core.
