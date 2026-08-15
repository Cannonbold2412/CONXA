"""Skill package schema (Phase 3+). Compiler fills these at compile time.

ARCH-3 contract/executor boundary. Every field below is tagged:
  [contract]  executor-independent — what the skill does and how success is judged.
              Must survive a swap to a non-browser executor (API connector, computer-use
              agent) unchanged. This is the layer Conxa's durable position is built on.
  [executor]  browser-replay implementation detail — Playwright selector grammar, DOM/iframe/
              shadow-DOM structure, hover chains. Free to change per executor backend.
  [mixed]     the class/field holds both; sub-fields are tagged individually.
New fields (e.g. EXEC-1's branch primitives) must pick one on introduction — see
docs/Backend-Schema.md §3.0 and docs/TRD.md §7.3a for the full design note.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class SkillMeta(BaseModel):
    id: str                                                        # [contract]
    version: int = 1                                               # [contract]
    title: str = ""                                                # [contract]
    created_at: str = ""                                           # [contract]
    source_session_id: str | None = None                           # [contract]
    compiler_policy_version: str = ""                              # [contract]
    compiler_policy_hash: str = ""                                 # [contract]
    # [executor] Minimum runtime version required to execute this skill. Set by the compiler
    # when features are used that require a specific runtime capability. The packager
    # reads this and writes it into manifest.json / pack.json; the runtime enforces it
    # at execute time via semver.satisfies(RUNTIME_VERSION, required_runtime).
    required_runtime: str = ">=1.0.0"
    # [executor] Structural fingerprint of the first 3 steps' landmark selectors — used by
    # drift detection to detect site redesigns before execution begins. Browser-DOM specific.
    structural_fingerprint: dict[str, Any] = Field(default_factory=dict)


class SkillPolicies(BaseModel):
    failure_first: bool = True                                     # [contract]
    stop_on_low_confidence: bool = True                             # [contract]


class RecoveryBlock(BaseModel):
    intent: str = ""                                                # [contract]
    final_intent: str = ""                                          # [contract]
    anchors: list[dict[str, Any]] = Field(default_factory=list)     # [executor] visual/DOM anchor points
    strategies: list[str] = Field(                                  # [contract] named strategy policy
        default_factory=lambda: ["semantic match", "position match", "visual match"]
    )
    confidence_threshold: float = 0.85                              # [contract]
    max_attempts: int = 2                                           # [contract]
    require_diverse_attempts: bool = True                           # [contract]


class Assertion(BaseModel):
    """A verifiable post-action condition checked after each step. [contract] — the
    executor-independent definition of what "success" means for a step; every field here
    must be answerable by any executor backend, not just the browser one."""
    # url_changed | url_pattern | selector_present | selector_absent | text_present |
    # text_absent | value_equals | state_changed
    # (url_pattern is a regex-matching alias of url_changed; url_changed is canonical.)
    type: str
    target: str = ""
    # Expected value for value_equals (interpolated against runtime inputs). Compared
    # normalized (trim/collapse-whitespace/lowercase) with a "contains" fallback so masked/
    # formatted fields (phone, currency) still validate.
    expected: str = ""
    timeout_ms: int = 5000
    # If True, assertion failure halts execution. If False, records a warning only.
    required: bool = True


class ValidationBlock(BaseModel):
    """[mixed] — assertions are contract; wait_for/success_conditions are today's
    browser-executor wait-condition detail (legacy, largely superseded by Assertion)."""
    wait_for: dict[str, Any] = Field(default_factory=dict)          # [executor]
    success_conditions: dict[str, Any] = Field(default_factory=dict)  # [executor] legacy
    # [contract] Multi-assertion outcome verification — runtime checks all assertions after action.
    assertions: list[Assertion] = Field(default_factory=list)


class DecisionPolicy(BaseModel):
    ask_if_ambiguous: bool = True                                   # [contract]
    stop_if_low_confidence: bool = True                             # [contract]
    max_retries: int = 2                                            # [contract]


class IdentitySignal(BaseModel):
    """A single scored, classified selector signal within an IdentityBundle. [executor] —
    `selector` is Playwright grammar; the whole signal is how the browser executor locates
    an element, not part of the durable contract."""
    engine: str                      # testid | role | aria | text | relational | css-id | css-structural | xpath
    selector: str                    # selector string (Playwright grammar preferred)
    durability: float                # 0.0–1.0 from durability_score()
    orthogonality_class: str         # test-contract | semantic-aria | visible-text | spatial-anchor | structural
    unique_at_compile: bool = False  # matched exactly 1 node in recorded DOM
    source: str = "compiler"         # compiler | llm | input_bound | user (manually edited in editor)


class ElementFingerprint(BaseModel):
    """[contract] — stable, executor-independent element identity (what the element *is*,
    not how a browser finds it): role/text/label semantics any executor could reason about."""
    role: str = ""
    tag: str = ""
    inner_text: str = ""       # visible text, max 120 chars
    aria_label: str = ""
    name: str = ""
    placeholder: str = ""
    label_text: str = ""
    data_testid: str = ""      # data-testid attribute value — highest-stability signal
    input_type: str = ""       # for <input> elements
    css_class_tokens: list[str] = Field(default_factory=list)   # stable class tokens only
    anchor_phrases: list[str] = Field(default_factory=list)     # relational context phrases
    position_hint: dict[str, Any] = Field(default_factory=dict) # normalized x/y as 0.0–1.0


class ShadowHost(BaseModel):
    """[executor] A shadow DOM host in the element's containment path — DOM/browser structure."""
    host: str          # CSS selector of the shadow host element
    mode: str = "open"  # "open" | "closed"


class FrameFingerprint(BaseModel):
    """[executor] Multi-signal frame identity for one level in an iframe chain — browser
    document/frame structure with no non-browser equivalent."""
    signals: list[IdentitySignal] = Field(default_factory=list)  # durability-ranked
    url: str = ""
    url_pattern: str = ""


class IdentityBundle(BaseModel):
    """[mixed] Compiled, signed element identity: durability-ordered signals + stable fingerprint.

    `fingerprint` (ElementFingerprint) is [contract] — the resolver's scoring oracle, stated in
    executor-independent terms. `signals`/`frame_chain`/`shadow_path` are [executor] — the
    Playwright-grammar candidates and DOM structure a browser executor resolves against.
    `stable_hash`/`destructive` are [contract]: semantic identity and consequence flags any
    executor needs. `compat_fingerprint`/`guid_like_attrs` are [executor]: DOM-attribute detail.
    """
    signals: list[IdentitySignal] = Field(default_factory=list)               # [executor]
    fingerprint: ElementFingerprint = Field(default_factory=ElementFingerprint)  # [contract]
    stable_hash: str = ""                  # [contract] SHA256 of (tag_path + static_attrs + AX_name)
    frame_chain: list[FrameFingerprint] = Field(default_factory=list)         # [executor]
    shadow_path: list[ShadowHost] = Field(default_factory=list)               # [executor]
    compat_fingerprint: str = ""           # [executor] SHA256 of app-version indicators
    guid_like_attrs: list[str] = Field(default_factory=list)                  # [executor]
    destructive: bool = False              # [contract]


class HandlerHints(BaseModel):
    """[executor] Precompiled runtime hints for a *browser* action handler (hover
    preconditions, virtualized-list scrolling) — has no meaning outside a browser executor."""
    hover_chain: list[IdentitySignal] = Field(default_factory=list)  # elements to hover before acting
    virtualized_container: str = ""   # selector of a scroll container that virtualizes rows
    allow_forced_action: bool = False


class SkillStep(BaseModel):
    """[mixed] — see field tags below. `action`/`intent`/`url`/`value`/`input_binding`/
    `validation`/`recovery`/`decision_policy`/`optional_hint` are [contract]: what this step
    means and how its success is judged, independent of executor. `frame`/`tab`/`target`/
    `identity_bundle`/`handler_hints`/`signals`/`state`/`compiled_selectors`/`snapshot_ref`/
    `snapshot_dom_hash` are [executor]: browser-DOM/Playwright implementation detail. `branch`
    is [mixed] today (holds executor probe detail) and is EXEC-1's next target for a clean
    contract-terms definition (a condition + nested steps, no browser assumptions)."""
    action: str | dict[str, Any]                                              # [contract]
    intent: str = ""                                                          # [contract]
    url: str = ""                                                             # [contract]
    frame: dict[str, Any] = Field(default_factory=dict)                       # [executor] iframe chain marker
    # [executor] Which tab/page this step runs on ({id, index, opened_by, opener_tab}). Empty
    # means "tab_0" (the initial page) — the same page every step already ran on before
    # multi-tab support existed, so old compiled skills are unaffected. Runtime resolution:
    # runtime/tabs.js::resolveStepPage.
    tab: dict[str, Any] = Field(default_factory=dict)                         # [executor]
    target: dict[str, Any] = Field(default_factory=dict)                      # [executor] raw recorded DOM target
    # [executor] Durability-ranked, orthogonality-deduplicated identity bundle — the single
    # source of truth for element identity (signals + scoring fingerprint). Runtime resolves
    # against it. (`identity_bundle.fingerprint` alone is [contract]; see IdentityBundle.)
    identity_bundle: IdentityBundle = Field(default_factory=IdentityBundle)
    # [executor] Phase 7: precompiled handler hints (hover chain, virtualization) — browser only.
    handler_hints: HandlerHints = Field(default_factory=HandlerHints)
    signals: dict[str, Any] = Field(default_factory=dict)                     # [executor] additional DOM signals
    state: dict[str, Any] = Field(default_factory=dict)                       # [executor] page state at recording
    value: Any = None                                                         # [contract]
    input_binding: str | None = None                                         # [contract]
    validation: ValidationBlock = Field(default_factory=ValidationBlock)     # [contract] (see ValidationBlock)
    recovery: RecoveryBlock = Field(default_factory=RecoveryBlock)           # [contract] (see RecoveryBlock)
    confidence_protocol: dict[str, Any] = Field(default_factory=dict)        # [contract]
    decision_policy: DecisionPolicy = Field(default_factory=DecisionPolicy)  # [contract]

    # [executor] Phase 3: LLM-compiled selector candidates (ranked, validated against snapshot).
    # Runtime Tier 1 tries these in order; runtime never calls LLM unless all fail.
    compiled_selectors: list[str] = Field(default_factory=list)
    semantic_description: str = ""        # [contract] "First Name input in Add Person dialog"
    snapshot_ref: str = ""                # [executor] which recorded DOM blob this step compiled against
    snapshot_dom_hash: str = ""           # [executor] for cross-compilation cache lookup

    # [mixed — EXEC-1 target] Conditional/branch primitives (if_present, try_dismiss,
    # wait_for_one_of): probe(s) + nested step bodies for optional interstitials (cookie
    # banners, session-expired screens, optional MFA, A/B variants). Empty for ordinary linear
    # steps. Holds `steps` (if_present), `candidates` (try_dismiss), `options`
    # (wait_for_one_of, each {selector, steps}), `timeout_ms`, `required`. Nested step entries
    # are raw dicts in the same shape as a saved SkillStep (action/target/identity_bundle/
    # branch/...); skill_package_builder_saved_skill.py recursively serializes each one into the flat
    # runtime step shape run.js consumes. Branch bodies run best-effort and never enter Tier
    # 1-4 recovery — CLAUDE.md Key Invariants. ARCH-3: today's probe/candidate shape leaks
    # executor detail (raw selector strings); new branch primitives must define the condition
    # itself in contract terms (e.g. "an interstitial matching this identity is present") and
    # keep browser-specific evaluation on the executor side.
    branch: dict[str, Any] = Field(default_factory=dict)

    # [contract] Conditional-state observation (recording-next-steps.md Priority 2): carried
    # verbatim from the recorded event's optionality/branch_hint (see
    # conxa_core.models.events.RecordedEvent) when the step's target sat inside an optional
    # interstitial. Advisory only — this step still compiles and executes as a normal required
    # linear step; it exists so the editor can surface a "treat as optional?" suggestion. Never
    # read by the compiler's own assertion/branch logic and never populates `branch` on its own
    # — only editor/workflow_mutations.py's confirm_optional_interstitial (human-initiated)
    # does that. None for ordinary steps.
    optional_hint: dict[str, Any] | None = None


class WorkflowIntentStep(BaseModel):
    index: int                                                      # [contract]
    intent: str = ""                                                # [contract]
    verification_anchor: str = ""                                   # [contract]


class WorkflowIntentGraph(BaseModel):
    """[contract] Compile-time semantic understanding of the workflow (Claude Browser-style) —
    stated entirely in goal/decision-point terms, no executor detail."""

    goal: str = ""
    steps: list[WorkflowIntentStep] = Field(default_factory=list)
    decision_points: list[dict[str, Any]] = Field(default_factory=list)
    expected_end_state: dict[str, Any] = Field(default_factory=dict)


class SkillBlock(BaseModel):
    name: str = "default"                                           # [contract]
    steps: list[SkillStep] = Field(default_factory=list)             # [mixed] (see SkillStep)


class SkillPackage(BaseModel):
    meta: SkillMeta                                                 # [contract] (see SkillMeta)
    inputs: list[dict[str, Any]] = Field(default_factory=list)      # [contract] parameterizable inputs
    skills: list[SkillBlock] = Field(default_factory=list)          # [mixed] (see SkillBlock)
    policies: SkillPolicies = Field(default_factory=SkillPolicies)  # [contract]
    llm: dict[str, Any] = Field(default_factory=dict)                # [contract] LLM router config hints

    # [contract] Phase 3: workflow-level semantic understanding (one LLM call per workflow).
    intent_graph: WorkflowIntentGraph = Field(default_factory=WorkflowIntentGraph)

    # [contract] Per-step confidence report + LLM router statistics from compile — build-time
    # metadata, not tied to any executor.
    # Required: must contain status, steps_total, min_confidence, llm_router_stats, steps.
    compile_report: dict[str, Any]

    @model_validator(mode="after")
    def _validate_compile_report(self) -> "SkillPackage":
        required = {"status", "steps_total", "min_confidence", "llm_router_stats", "steps"}
        missing = required - set(self.compile_report.keys())
        if missing:
            raise ValueError(
                f"SkillPackage.compile_report missing required keys: {sorted(missing)}"
            )
        return self
