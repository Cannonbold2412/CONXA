# Recording Subsystem — What To Build Next, How, and Why

**Author:** Claude (engineering recommendation, written 2026-07-10 immediately after the
design-vs-code review in [`recording.md`](recording.md))
**Nature:** Opinion + concrete plan. Where this disagrees with the original design's ordering, it
says so and says why.

---

## The one-paragraph position

The review found something unusual and worth exploiting: **the expensive, risky halves of the
recording redesign are already built.** The runtime verifies outcomes (`verifyStep`), enforces a
strict uniqueness gate (`resolver.js`), scales budgets by confidence, and executes branch steps
(`if_present`/`try_dismiss`/`wait_for_one_of`). The deterministic selector floor exists
(`IdentityBundle`). All of that machinery is running on **starvation rations** — the recorder
feeds it the same capture it always did. So the correct strategy is not "start the redesign"; it
is **feed the machines that already exist, in the order of how hungry they are.** Every item below
is judged by one question: *which already-shipped consumer gets immediately better if the recorder
captures this?*

That also means I recommend **against** the original design's critical path (Phase A first). The
compile-side selector floor turned out good enough that in-page locator capture is now a
refinement, not an unblocker. The two genuinely starving consumers are the runtime verifier and
the branch executor.

---

## Priority 1 — Post-condition distillation in `finalizeState` (design §5 / Phase B)

**Status: done (2026-07-10).** `bridge.js::finalizeStateWithAfter` calls `buildPostCondition`,
attaching `classified_effect`/`value_readback`/`url_delta`/`dialog_signal` to every event;
`RecordedEvent.post_condition` and `StateChange.dom_diff` are now carried through
(`packages/conxa-core/conxa_core/models/events.py`); `build.py::_build_assertions` prefers this
live evidence over the generic wait_for/success_conditions inference. No runtime change — see
`docs/TRD.md` §10.2 and `docs/Backend-Schema.md` §3.6.

**What.** After each action, classify the already-captured delta in-page and attach it to the
event as a small structured `post_condition`:

- `classified_effect`: one of `navigation | dialog_opened | dialog_closed | expansion |
  value_set | content_change | none` — decided by cheap in-page checks (URL changed? a
  `[role=dialog]`/`[aria-modal]` appeared in the dom_diff? `aria-expanded` flipped on the target?
  the target was an input?).
- `value_readback`: for `type`/`fill`/`select`/`set_checkbox`, re-read the field's committed value
  ~100ms after the action and store it (redaction rules apply — never for password fields).
- `url_delta` and `focus_delta`: two string comparisons, nearly free.
- Keep `dom_diff` — and finally give it a consumer (see below), or delete the computation. Today
  it is computed on every action and dropped by the `StateChange` pydantic model. Dead code that
  runs on every recorded action is the worst kind.

**How.**
1. `bridge.js::finalizeStateWithAfter` is the single seam — it already has before/after
   fingerprints and the dom_diff in hand at exactly the right moment. Add the classifier there
   (~80–120 lines of plain DOM checks, no new capture passes).
2. Add `post_condition: PostCondition | None = None` to `RecordedEvent` in `events.py` —
   **optional**, so old recordings keep validating (same read-new-fallback-old pattern the
   codebase already uses).
3. In the compiler, let `compare_state`/`validation_planner.py` prefer the captured
   `post_condition` when present: `classified_effect == "dialog_opened"` compiles to an
   `element_appear` assertion on the dialog; `value_set` + `value_readback` compiles to the
   `element_value` assertion `run.js` **already knows how to check** (`evaluateAssertion` has an
   inputValue path today). No runtime changes needed at all.

**Why first.** Highest leverage-to-effort ratio in the whole design, and the ratio *improved*
since the design was written: the verifier shipped, so every unit of assertion precision now flows
straight to execution correctness — especially for recovered steps, where "the click landed
somewhere" vs. "the intended thing happened" is the entire safety story. It touches no invariants,
adds zero LLM calls, and needs no new UI. This is also the item that converts the advisory-
assertion drift telemetry (already emitting) from "something changed" into "the dialog stopped
opening," which is what a fleet dashboard can actually act on.

**Effort guess.** Small. One bridge function, one optional pydantic model, one preference branch
in the planner. Test by re-recording the existing gate-skill fixture and asserting the compiled
package carries value/dialog assertions instead of generic ones.

---

## Priority 2 — Conditional-state observation (design §7 / Phase E capture half)

**Status: done (2026-07-10), human-gated variant.** `bridge.js::detectOptionalContainer` flags
dialog/consent-banner interstitials (`optionality: "stochastic"` + `branch_hint`), confirmed
against a small ring buffer of Priority 1's `dom_diff` where possible. The compiler carries the
hint onto `SkillStep.optional_hint` **without** auto-creating a branch — a human confirms via
Human Edit's "treat as optional?" affordance (`WorkflowStepItem.tsx` →
`cmd_confirm_optional_interstitial` → `workflow_mutations.confirm_optional_interstitial`), which
converts the step to a real `try_dismiss` branch. This is stricter than the "still stamp, harmless
false positive, unconfirmed hint compiles to required" framing below implied for the *compiled
step*'s own behavior — that part holds exactly as written — but conversion into an actual branch
is human-initiated only, per CLAUDE.md's "branch steps compile only from observed states + human
confirmation" invariant. See `docs/TRD.md` §10.7 and `docs/App-Flow.md` §7.

**What.** Make the recorder notice interstitials during the human's single pass and flag them:

- When an interaction's target sits inside `[role=dialog]`, `[aria-modal=true]`, or a container
  matching a small consent/banner heuristic list (id/class tokens like `cookie`, `consent`,
  `gdpr`, `onetrust`, `truste`), and that container *appeared during the recording* (it's in a
  recent dom_diff — a second consumer for Priority 1's work), stamp the event
  `optionality: "stochastic"` with a `branch_hint: { kind: "try_dismiss", container_signal }`.
- Nothing else. No probing, no exploration, no `wait_for_one_of` inference yet — the mutually-
  exclusive-states detection is genuinely harder and can wait for real-world failure data.

Then close the loop in two cheap places:
- **Compiler:** when an event carries `optionality: "stochastic"`, compile it as an `if_present`/
  `try_dismiss` branch step instead of a required linear step. The step types, schema
  (`SkillStep.branch`), serializer passthrough, runtime handlers, and CI fixture **all already
  exist** (EXEC-1) — the compiler emission is the only missing wire.
- **Studio:** in Human Edit, render the flagged step with a one-line confirm affordance ("this
  looked like an optional pop-up — treat as optional?"). This doubles as the branch-authoring UI
  that EXEC-1 explicitly left out, in its cheapest possible form: confirm-a-suggestion instead of
  build-from-scratch.

**Why second.** This is the largest *reliability-per-line* gap in production behavior today: a
cookie banner that appeared during recording but not at runtime (or vice versa) breaks linear
replay at step 1, and the fix currently requires a human to hand-edit step JSON — realistically,
nobody will. The recorder is the only component that knows the banner appeared, the knowledge is
free at capture, and the entire downstream path shipped a day ago and is sitting unused. TODO.md
already marks this "now unblocked."

**Why not more.** Resist building the full `wait_for_one_of` candidate detection and A/B-variant
heuristics now. The banner/dialog case covers the overwhelming majority of real interstitials, the
heuristics are legible, and false positives are harmless (a human confirms in the editor; an
unconfirmed flag compiles to a *required* step exactly as today).

**Effort guess.** Small-medium. Container heuristics in `bridge.js`, two optional event fields,
one compiler branch, one editor affordance.

---

## Priority 3 — Capture-time locator emission + live warnings (design §1 + §6 / Phase A)

**What.** Emit `locators[]` from `serializeTarget` — the same signal kinds `IdentityBundle`
derives today (testid, role+name, text, label/placeholder/name, scoped CSS, XPath), each with a
**live match count** (`document.querySelectorAll(...).length` / role+name walk at the moment of
action) — plus `capture_warnings[]` (`non_unique_role_name`, `text_only_identity`,
`no_stable_ancestor`) and surface a low-key warning chip in the Studio recording UI when a step
captures weak.

**How, and one strong opinion.** Do **not** move `IdentityBundle` in-page. Keep the compiler as
the single selector authority (that separation is now a tested invariant — "IdentityBundle is the
sole identity source"). The bridge's job is to hand it *better evidence*: locators verified
against the live, running page instead of reconstructed from serialized HTML. Concretely:
`identity_bundle.py` grows a preference pass — if the event has `locators[]`, seed candidates from
them and trust their live `match_count` over the snapshot-based `uniqueness_gate`; otherwise fall
back to today's derivation. Old recordings compile unchanged.

**Why third, not first.** The original design made this the top of the critical path because the
compiler was LLM-generating selectors. That problem no longer exists. What remains is a *fidelity*
gap (live page vs. stored snapshot — dynamic states, computed accessible names, mutation between
action and snapshot) and the *human* gap (§6c: the only moment a re-record is free is while the
person is still recording). Both are real, neither is bleeding. The warning chip may honestly be
the most valuable part — ship it in the same change since the confidence features are computed
anyway.

**Effort guess.** Medium. The in-page generator is mostly a port of scoring logic that already
exists in `selector_score.py`; the risk is payload size and per-action latency, so cap the
locator set (≤6 signals) and skip match-count for XPath.

---

## Priority 4 — App fingerprint + devicePixelRatio (design §4 / Phase D)

**What.** One in-page function, run once per page (not per event): mine `<meta>` generator/build
tags, well-known globals (`window.__APP_VERSION__`, ServiceNow/Salesforce markers), bundle-hash
patterns in script srcs, and the route shape. Store as a session-level `app_fingerprint`, stamp it
onto the `SkillPackage`, and include it in runtime telemetry.

**Why.** It's an afternoon of work that plants a seed nothing else can plant retroactively: fleet
drift detection is only possible against a compiled-against fingerprint, and TODO's EXEC-2
(durability-signal telemetry, the flywheel) explicitly lists `compat_fingerprint` as a field it
needs. Every skill compiled before this ships is a skill the flywheel can never reason about.
Capture `devicePixelRatio` in the same change (one property read).

**Why not higher.** It creates no user-visible improvement until the cloud comparison side exists.
Plant the seed now precisely *because* it's cheap; build the drift comparison when EXEC-2 lands.

---

## Priority 5 — Deliberately deferred, and why

- **AX subtree (§2 / Phase C).** Defer until either (a) Priority 1's `classified_effect` proves
  too coarse in practice, or (b) Tier-3 recovery quality becomes the bottleneck. It's the most
  architecturally elegant item and the least *urgent*: its three consumers are all satisfied at
  lower fidelity today (uniqueness via the snapshot blob, Tier-2 via the recorded accessible name,
  Tier-3/4 via host-agent delegation). Building it first would be optimizing the substrate before
  the demand exists.
- **Structured `IntentHint` (§3).** Defer. The string hint already feeds the intent graph as a
  prior; the structured upgrade mostly improves an LLM call that works. The one piece worth
  pulling forward cheaply: `field_semantics`/`value_class` from label/placeholder/autocomplete —
  but capture it as part of Priority 3's locator work (same attributes, same pass), not as its own
  project.
- **WorkArena composites (§9).** Defer as a package, with one exception path: if/when a design
  partner's real workflow breaks on typeahead capture, build **9a (typeahead) alone** — it reuses
  Priority 1's `value_readback` and the existing `aria-controls` plumbing, and it's the composite
  with the clearest capture signature. Tables and wizards are bigger bets that deserve real
  failing workflows to design against, not benchmark-driven speculation.
- **Full `RecordedEvent` schema migration (§10).** Never do this as a project. Each priority above
  adds its own optional field; the schema converges on §10 as a side effect. A big-bang schema
  change is risk with no independent payoff.

---

## Sequencing, invariants, and the guardrails

Ship order: **P1 → P2 → P3 → P4**, each independently releasable, each following the codebase's
established migration pattern (new field optional → compiler reads-new-falls-back-old → promote to
required later via the existing `model_validator` gate if ever justified).

Non-negotiables that every item above respects (and that reviews should check):
- No LLM anywhere in the recorder hot loop — everything proposed is plain DOM reads.
- Iframe chain verbatim; `frame.chain` untouched by all four priorities.
- Auth/redaction rules extended, never weakened — `value_readback` must go through the same
  password/redaction check `bridge.js` already applies (`inputTypeOf(el) === "password"` path).
- Tier 1/2 recovery stays zero-token; nothing here touches the recovery ladder.
- Branch steps compile only from *observed* states + human confirmation — the recorder observes,
  it never probes (the §13 philosophy line, which P2's narrow heuristic design deliberately
  preserves).

**The metric that says we're right:** percentage of compiled steps carrying a *specific* assertion
(value/dialog/navigation rather than generic state-change), and percentage of recordings
containing an interstitial that compile to a branch step without hand-editing. Both are measurable
from existing compile reports and telemetry within a week of P1/P2 shipping.
