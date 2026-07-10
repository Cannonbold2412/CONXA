# Human Edit vs. the Skill Package — Coverage Audit & Redesign Proposal

**Date:** 2026-07-10
**Scope:** `conxa-builder/electron/renderer/src/pages/HumanEditPage.tsx` and its component tree
(`InlineRetargetFlow`, `StepConfigForm`, `ValidationEditor`, `AssertionEditor`,
`StepIdentitySummary`, `ParameterizationDrawer`, `SuggestionsPanel`, `HowClaudeSeesThisPanel`,
`RecordingScreenshotsPanel`) versus the canonical `SkillPackage` schema
(`packages/conxa-core/conxa_core/models/skill_spec.py`) as mediated by the editor read model
(`conxa_compile/editor/dto.py`, `workflow_dto.py`) and write gate (`editor/patch_gate.py`).

---

## 1. How Human Edit sees the package today

The editor never touches the `SkillPackage` directly. Everything flows through two chokepoints:

- **Read:** `workflow_dto.py::step_to_dto()` projects each persisted step dict into
  `StepEditorDTO`. Whatever isn't copied there is invisible to the UI — no exceptions.
- **Write:** `patch_gate.py::validate_editor_patch()` allow-lists which keys each action kind may
  patch, enforces selector quality gates, intent slugs, and the destructive/consequential
  validation invariants.

This is a good architecture: the DTO is the visibility contract and the patch gate is the
editability contract. The audit below is therefore precise — a field is exposed iff it appears in
`StepEditorDTO`/`WorkflowResponse`, and editable iff the patch gate admits it.

---

## 2. Coverage matrix

### 2.1 Exposed and editable today

| Package field | Where in the UI | Notes |
|---|---|---|
| Step order / membership | Workflow list (drag-reorder, delete, insert-action) | Insert limited to `action_registry` kinds |
| `step.intent` (+ `signals.semantic.final_intent`) | Step config form "Intent" | Patch gate requires a valid ontology slug; writing intent also syncs `final_intent`/`llm_intent` |
| `action` payload (`url`, scroll `delta`/`selector`, wait ms, check_* fields) | Step config form, per-action fields | Allow-listed per action kind; scroll delta capped ±20 000 |
| `value` | "Value" field | Only where `action_spec.value` is true |
| `target.primary_selector` / `fallback_selectors` | Selector list + 3-phase re-target wizard | Merged with identity-bundle signals for display; every string must pass `selector_passes_filters` |
| `identity_bundle.signals` (indirectly) | Re-target wizard Phase 2 | Applying a re-target regenerates the bundle (`retarget.py` / `selector_regeneration.py`); users can't hand-edit a signal row but they replace the set |
| `signals.anchors` | "Anchors" card | Free-text anchor phrases; required non-empty on destructive steps |
| `frame` (iframe chain) | "Frame context" card | Patch gate validates chain shape and bans XPath frame selectors |
| `validation.wait_for` | `ValidationEditor` | Leaf types incl. `url_change`, `element_appear`, `dom_change`, `intent_outcome`, AND/OR groups; destructive steps must keep a non-none `wait_for` |
| `validation.assertions` | `AssertionEditor` (+ re-target Phase 3) | Full CRUD, `required` toggle; consequential steps must keep ≥1 required assertion |
| `SkillPackage.inputs` + `input_binding` / `{{var}}` bindings | "Input variables" dialog (`ParameterizationInlinePanel`) | Registry CRUD + binding into whitelisted fields |
| Step visual (`signals.visual`) | Screenshot pane + "Recording screenshots" dialog | Apply/clear one of 5 timeline frames; recomputes anchors |
| `meta.title`, `meta.version`, skill id | Page header | Read-only here (title editable elsewhere) |

### 2.2 Exposed read-only today

| Package field | Where | Why read-only |
|---|---|---|
| `identity_bundle` signal metadata (engine, durability %, orthogonality class, `unique_at_compile`, `source`) | `StepIdentitySummary` + wizard badges | Correct: these are compiler measurements, not opinions |
| `compile_confidence` rollup | Confidence read-out per step | Derived via `confidence_from_signal_rows` |
| `recovery.anchors` | `anchors_recovery` in DTO | Displayed alongside signal anchors |
| `parameter_bindings` | Variables panel hints | Derived by regex scan; recomputed each read |
| Step-quality `suggestions` | Suggestions dialog | Lint output (`collect_suggestions` + `audit_reference`) |
| Flags: destructive / scroll / generic-intent | Step badges | Derived from policy |
| Agent contract (name, synthesized description, inputs) | "How Claude sees this" | Honest approximation of the MCP tool card |
| Raw metrics JSON | Diagnostics collapsible | Debug aid only |

### 2.3 In the package but invisible — the gaps

Confirmed absent from both DTO and UI (grep across `renderer/src` and `editor/`):

| Package field | Impact of being hidden |
|---|---|
| **`step.branch`** (`if_present` / `try_dismiss` / `wait_for_one_of` + nested step bodies) | **Largest gap.** A compiled conditional carries whole nested step lists the reviewer cannot see, reorder, or even know exist. An approver is signing off on steps they were never shown. |
| **`intent_graph`** (goal, per-step intents, verification anchors, decision points, expected end state) | The single best "does this workflow do what I meant?" review artifact is never rendered. |
| `recovery` tunables (`strategies`, `confidence_threshold`, `max_attempts`, `require_diverse_attempts`) | DTO ships the dict but the UI renders only anchors; `editable_fields.recovery_strategies` is hard-`False`. Reviewer can't see what the runtime will try when the step breaks. |
| `identity_bundle.fingerprint` (`ElementFingerprint` — role, text, labels, testid, position hint…) | The resolver's scoring oracle. When a skill misfires in the field, this is the first thing an engineer needs, and it's invisible. |
| `identity_bundle.frame_chain` / `shadow_path` / `destructive` / `guid_like_attrs` | Frame *fingerprints* (multi-signal) and shadow hosts differ from the editable `frame` dict; nothing shows them. |
| `handler_hints` (hover chain, virtualized container, `allow_forced_action`) | A step that only works because of a precompiled hover chain looks identical to a plain click. `allow_forced_action` is a safety-relevant flag no human ever confirms. |
| `compile_report` (status, `min_confidence`, per-step confidence, LLM router stats) | Only the derived per-step confidence is surfaced. No workflow-level "this compiled at 0.62 minimum" banner. |
| `meta.required_runtime`, `compiler_policy_version`, `structural_fingerprint` | Compatibility and drift-detection facts an enterprise admin would ask about at publish time. |
| `policies` (`failure_first`, `stop_on_low_confidence`) & `decision_policy` / `confidence_protocol` | Runtime behavior contracts; `confidence_protocol.compile_warnings` leaks out only via suggestion lint codes. |
| `validation.success_conditions` | Typed in `workflow.ts` but no editor; only `StepConfigForm` sets a URL into it on one path. Either expose or deprecate. |
| `snapshot_ref` / `snapshot_dom_hash` | Explains *which* recorded DOM a step was compiled against — useful in diagnostics only. |

---

## 3. What should never be user-facing (as editable)

These are integrity artifacts. Showing them in a diagnostics view is fine; letting a human write
them would corrupt the compiler's contract with the runtime:

- `identity_bundle.stable_hash`, `compat_fingerprint`, `guid_like_attrs` — computed hashes/heuristics; a hand edit silently breaks drift detection.
- `meta.compiler_policy_version` / `compiler_policy_hash`, `structural_fingerprint` — provenance stamps.
- `snapshot_ref` / `snapshot_dom_hash` — cache keys into session artifacts.
- `compile_report` / `llm` router stats — telemetry, not configuration.
- Raw `signals.*` recording evidence (DOM captures, timing, state_after) — source data; edits belong on the compiled layer, with recompile/retarget as the mutation path.
- `identity_bundle.signals` rows *directly* — durability and orthogonality must stay measured, not asserted. The existing pattern (user supplies selector strings; compiler re-scores them, tagging `source: "user"`) is the right one — keep it.

The current design already respects all of these. No regressions to fix — the risk is only in
*future* exposure work accidentally making them writable.

---

## 4. What should additionally be exposed, and how

Priority-ordered for an enterprise reviewer whose job is "can I trust this automation with a
customer's account?":

1. **Branch steps — visible and editable (P0).** Render `branch` bodies as an indented,
   collapsible sub-list in the workflow viewer with the probe condition as the group header
   ("If *cookie banner* is present → 2 steps"). Nested steps get the same `StepEditorDTO`
   projection with a `path` (e.g. `4.branch.steps[1]`) instead of a flat index. Until then, at
   minimum a read-only badge "contains N hidden conditional steps" — approving unseen steps is
   an enterprise trust problem today.
2. **Intent graph — read-only review panel (P0).** A fifth tool-pane ("Workflow plan"): goal,
   expected end state, per-step intent + verification anchor, decision points. This is the
   natural top of the Approve flow: the human confirms the *plan*, not just the steps. Editable
   later, read-only now.
3. **Recovery behavior — read-only card per step (P1).** "If this step fails: retry ≤2× →
   re-hover/a11y (no AI) → describe-and-match (AI), needs ≥85 % confidence; anchors: …". Keep
   tunables non-editable (they're policy-derived), but stop hiding what the runtime will do.
   Surface `identity_bundle.destructive` and `handler_hints.allow_forced_action` here as explicit
   safety badges.
4. **Element fingerprint — read-only "What was recorded" popover (P1).** Role, visible text,
   label, testid, position hint, frame chain, shadow path. This turns "the selector looks weird"
   support tickets into self-service. Pairs naturally with `StepIdentitySummary`.
5. **Compile health banner — workflow level (P1).** `compile_report.status`, `min_confidence`,
   steps below threshold (link to each), plus `meta.required_runtime` and policy version. One
   line under the page header; expands into the existing Diagnostics dialog.
6. **Handler hints — read-only (P2).** Hover-chain and virtualization notes on the step card.
7. **`success_conditions` — decide (P2).** Either give it a real editor next to assertions or
   fold its one remaining use into assertions and delete the field. Half-exposed is the worst
   state.

---

## 5. Proposed redesign

### 5.1 Information architecture — three visibility tiers

| Tier | Audience | Contents | Mutability |
|---|---|---|---|
| **Review** (default) | Business reviewer / approver | Step list incl. branch bodies, screenshots, intent, plain-language descriptions, workflow plan (intent graph), inputs, destructive/safety badges, compile-health banner | Edit via guided flows only (re-target wizard, validation editor, variables) |
| **Reliability** (per-step expander, current "selectors/anchors/validation" material) | Skill engineer | Selector list + identity badges, anchors, frame context, wait_for, assertions, recovery behavior card, fingerprint popover | Editable within patch-gate rules |
| **Diagnostics** (existing dialog, enriched) | Support / Conxa engineer | stable_hash, compat/structural fingerprints, snapshot refs, compile_report incl. router stats, policy version, raw metrics | Strictly read-only |

The page already *behaves* like this informally; the redesign makes the tiers explicit so future
fields land in the right layer instead of ad-hoc.

### 5.2 Data-model changes (surgical)

`StepEditorDTO` additions — all read-only projections, no new write paths:

```python
# conxa_compile/editor/dto.py
branch_summary: dict[str, Any] | None = None   # {kind, probe, step_count} or None
branch_steps: list["StepEditorDTO"] = []        # nested projection (P0); path-based ids
recovery_view: dict[str, Any] = {}              # {strategies, max_attempts, confidence_threshold,
                                                #  tier_ladder: [...], anchors: [...]} — display shape
fingerprint: dict[str, Any] = {}                # ElementFingerprint subset (role/text/labels/testid/
                                                #  position_hint) + frame_chain/shadow_path summaries
safety: dict[str, bool] = {}                    # {destructive, allow_forced_action, has_hover_chain}
```

`WorkflowResponse` additions:

```python
intent_graph: dict[str, Any] = {}               # verbatim WorkflowIntentGraph
compile_health: dict[str, Any] = {}             # {status, min_confidence, steps_below_threshold,
                                                #  required_runtime, compiler_policy_version}
```

Patch-gate change for branch editing (P0 second half): accept a `path` addressing nested steps
and re-run the *same* `validate_editor_patch` per nested step — no new rule set, just addressing.
Marker/branch-body invariants (best-effort, no Tier 1–4 recovery — see CLAUDE.md) stay enforced
by refusing `recovery`/`validation` patches inside branch bodies.

### 5.3 What deliberately does not change

- The patch gate remains the single write chokepoint; every new field above enters as read-only.
- Identity signals stay machine-scored; user-typed selectors keep flowing through
  `selector_passes_filters` + rescoring with `source: "user"`.
- The re-target wizard remains the only way to regenerate an identity bundle (vision-LLM region
  path included) — consistent with the "LLM writes selectors only on user-initiated re-compile"
  invariant.
- Recovery tunables stay policy-owned. Enterprises want *predictable* recovery; per-step knobs
  invite un-auditable drift. If a customer needs different behavior, that's a policy-bundle
  conversation, not a step edit.

### 5.4 Why this shape is right for an enterprise product

- **Approval must equal informed consent.** Today "Approve" builds a package containing branch
  steps, forced-action allowances, and recovery behavior the approver never saw. Closing that gap
  (items 1–3) is a compliance requirement, not a UX nicety.
- **Read-only ≠ hidden.** The current design conflates "user must not edit" with "user need not
  see". Hashes and router stats deserve hiding; recovery ladders and fingerprints deserve
  showing. The tier model separates the two decisions.
- **Every exposure is a projection, not a new mutation.** All P0–P2 items reuse the existing
  DTO/patch-gate chokepoints, so the audit story ("what can a human change in a compiled skill?")
  stays one file long: `patch_gate.py`.

---

## 6. Gap summary (one line each)

- Branch/conditional steps: **invisible — P0 fix.**
- Intent graph: computed, stored, never shown — P0 read-only panel.
- Recovery behavior: shipped in DTO, dropped by UI — P1 read-only card.
- Element fingerprint / frame fingerprints / shadow path: hidden — P1 popover.
- Compile report & runtime compatibility metadata: hidden — P1 banner.
- Handler hints incl. `allow_forced_action`: hidden safety flag — P2 badge.
- `success_conditions`: half-alive — P2 decide (editor or deletion).
- Integrity artifacts (hashes, policy stamps, snapshots, router stats): correctly hidden/read-only — keep; move visibility into Diagnostics tier only.
