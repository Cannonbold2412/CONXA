# Future Vision Architecture (Tier 4) — Phase 7

**Design goal:** Turn vision from today's **passive screenshot payload** (`conxa-current-state-assessment.md` §9 — `server.js` ships screenshots + a 50-element DOM digest labeled "Layer 4 vision / Layer 5 intent" to Claude Desktop and hopes a human re-grounds and resumes) into a **bounded, actionable, last-resort recovery tier** that produces a **DOM selector**, validates it with an independent post-condition, and feeds the fleet — *without* making Conxa a vision agent.

**This is the T4 detail of the 7-stage recovery pipeline** (`future-recovery-architecture.md` Stage 3). It slots in *after* deterministic identity (T1), accessibility re-resolution (T2), and host semantic re-grounding (T3) have all failed, and *before* human handoff (T5).

**This is a design document. No implementation.**

---

## 1. The principle — vision is the last resort, and that is rare by construction

Vision fires only when **DOM/AX grounding is structurally impossible**, not merely hard. T1–T3 already cover everything that has a queryable identity: compiled multi-signal selectors, the accessibility tree, and host describe-then-match against a pre-filtered AX digest. If an element has *any* role/name/text/test-id/structural signature, one of T1–T3 resolves it. T4 is reached only on surfaces where **no DOM node corresponds to the target**:

- **`<canvas>`-rendered UIs** (charting tools, design canvases, spreadsheet grids painted to canvas, some maps).
- **Custom-rendered widgets** that paint to pixels and expose no accessible name (legacy Flash-replacement shims, WebGL controls, video-overlay controls).
- **DOM-hostile / remote surfaces** (embedded RDP/VNC/Citrix panes, cross-origin opaque iframes where the AX tree is inaccessible).

**Why this is rare — quantify it.** The honest enterprise target distribution (ServiceNow / Workday / Salesforce) is iframe- and shadow-heavy but **DOM-native**: AX coverage is near-total. Vision-first is explicitly **hype for web automation** (`high-value-paper-review.md` §2; OS-ATLAS/UI-TARS are *cautionary*, not models), and the literature's bottleneck is **planning and error recovery, not perception**. T4 must therefore stay **< a few % of executions, ideally < 1%**; above that, the fix is T1–T3 (live fingerprint scoring G5, describe-then-match T3) or a recompile — **not** more vision. T4 is a long-tail completeness guarantee, ROI-ranked **lowest** (`conxa-gap-analysis.md` G13); its strategic value is the **walling-off**, not the capability (`top-25-insights.md` #23).

---

## 2. Compile-time vision — bbox anchors as SEARCH-NARROWING anchors

Today the compiler can emit a per-step reference image (`visuals/Image_{n}.jpg`) and vision-only relational anchors (`anchor_vision_llm.py`), but at runtime the image is only an *attachment* in the host payload. The future compiler emits a **`visual_ref` anchor** designed to **narrow the Tier-4 grounding search**, not to be looked at by a human:

```
visual_ref (compiled, per step, only where T4 is plausible):
  reference_image_ref   : path to the recorded crop/full screenshot
  bbox_css              : { x, y, w, h }   # CSS px at record time (already captured)
  viewport_css          : "WxH"            # record-time CSS viewport
  dpr_record            : devicePixelRatio at record time
  expected_region       : bbox_css expanded by ±N px (the search window)
  anchor_phrases        : primary + secondary relational anchors (already emitted)
  surface_class         : dom | canvas | custom | remote   # gates whether T4 is even allowed
```

**The bbox is a prior, not a target.** At T4 the grounder locates the element **within `expected_region` (±N px of the recorded bbox)**, not across the full screenshot — cutting cost and error massively: a full-screen ground is an open search with a long tail of confident-wrong matches; a region-narrowed ground is a near-pointwise verification. The recorded bbox + relational anchors give the grounder a *known target to heal toward* — Conxa's "recover against a recorded target" advantage (`master-insights-v2.md` C2), applied to pixels. `expected_region` absorbs reflow (responsive breakpoints, scroll); if the true target falls outside it, that is itself a **drift signal** (§5) and the tier escalates rather than widening to full-screen.

Compile-time vision is gated by `surface_class`: a `visual_ref` is only emitted where the recorder observed a DOM-hostile target. For ordinary DOM steps, **no `visual_ref` is compiled** — T4 is simply unreachable, which is correct.

---

## 3. The Tier-4 grounding flow

T4 receives the `FailureContext` from Stage 1 (intent, recorded fingerprint, frame chain, pre/post page fingerprint) plus the step's `visual_ref`. The flow is **ground → normalize → re-derive selector → validate**, and it **never clicks raw pixels if a selector can be recovered.**

```
                         TIER 4 — VISION RE-GROUNDING  (reached only if T1,T2,T3 failed)
                         ────────────────────────────────────────────────────────────
   FailureContext + visual_ref
            │
            ▼
   (a) Capture live screenshot ── crop to expected_region (±N px of recorded bbox)
            │
            ▼
   (b) GROUND  ── host vision via MCP sampling  (or OS-ATLAS-style grounder)
                  inputs : cropped screenshot + recorded intent + anchor_phrases + bbox prior
                  output : NORMALIZED coords (0..1) within the crop   ◀── normalized, never absolute px
            │
            ▼
   (c) NORMALIZE ── map normalized→crop px→full-image px→CSS px
                    apply scaleFactor = devicePixelRatio (UI-TARS); account for scrollY + crop offset
            │
            ▼
   (d) RE-DERIVE SELECTOR ── hit-test the live DOM at the resolved CSS point
                             document.elementFromPoint(x,y) (frame-scoped, shadow-piercing)
                             walk to nearest actionable ancestor → synthesize a multi-signal
                             ElementFingerprint → score it (G5) → emit a real selector
            │
       selector recovered? ──no──▶ surface_class==canvas/remote ONLY:
            │ yes                    fall back to a SoM-annotated raw-coordinate action
            │                       (last resort; always outcome-checked; flagged low-confidence)
            ▼
   (e) PREFER THE SELECTOR ── execute the recovered selector, not the pixel click
            │
            ▼
   (f) VALIDATE ── independent post-condition (Stage 4 verifier, G2)
                   pass? ─yes─▶ repair_event (recovered selector, confidence)  ──▶ §5 write-back
                     │ no
                     └──▶ escalate to T5 handoff (do NOT retry pixels blindly)
```

**Key decisions:**

- **(b) returns normalized coordinates** `(0..1)`, never device pixels — the only DPI-robust contract (`master-insights-v2.md` anti-pattern #2; coordinate-only identity is brittle across DPI/zoom/responsive). Normalization is resolution-, zoom-, and breakpoint-independent at the grounder boundary.
- **(c) scaleFactor normalization** is the UI-TARS lesson, correctly demoted to *a step in the pipeline, not the headline* (`high-value-repo-review.md` §6 "most misunderstood"; `master-insights-v2.md`). `CSS_px = normalized × crop_dim / dpr`, offset by the crop origin and `scrollY`. Getting this wrong is the classic HiDPI off-by-2× click miss.
- **(d) re-derive a DOM selector via hit-testing** is the move that keeps Conxa deterministic. A coordinate is a one-shot, unauditable, drift-fragile locator; a selector synthesized from the element *at* that coordinate is durable, re-resolvable, scoreable, and **promotable to a package fix**. `elementFromPoint` runs frame-scoped (preserving the iframe invariant) and shadow-piercing.
- **(e) prefer the recovered selector.** Raw-pixel clicking is permitted **only** when hit-testing yields no actionable DOM node — i.e., genuinely on `canvas`/`remote` surfaces — and even then the action is SoM-annotated, flagged low-confidence, and **always** outcome-checked. **Never click raw pixels if a selector can be recovered.**
- **(f) validation is non-negotiable.** A T4 "success" that wasn't outcome-checked is a *belief*, not a fact (the field-wide blind spot, `master-insights-v2.md` R1). No unverified T4 recovery counts.

---

## 4. Vision for VALIDATION / VERIFICATION — SoM as telemetry, never as evidence

Set-of-Marks (drawing a marker at the resolved coordinate) is adopted **only as a telemetry/audit signal**, never as success evidence (`high-value-repo-review.md` UI-TARS Idea 2; `top-25-insights.md` #23). SoM records *where the system thought it acted* — **intent, not outcome.** Outcome is owned exclusively by the independent post-condition (§3f).

What SoM produces, per T4 firing:

- A SoM-annotated screenshot (resolved point marked over the live capture) attached to the `repair_event` and, for attended runs, to the T5 handoff surface for human trust.
- A **coordinate-drift measurement**: `Δ = resolved_coord − compiled_bbox_anchor` (the center of `bbox_css`, scaleFactor-normalized). This is a clean, quantitative **fleet drift signal**: when the resolved point systematically migrates away from the compiled anchor across installs, the visual layout of the app changed — detectable *before* hard failures appear.

This Δ feeds `future-workflow-durability-architecture.md` Stage 1 (Breakage Detection) and Stage 2 (Change Classification) as a **layout-drift** class, alongside the recovery-tier-distribution and app-version-fingerprint signals already defined there. SoM is thus a *sensor*, not an actuator — it never decides whether a step succeeded.

---

## 5. How T4 results feed back — a recovered selector is a repair_event

T4 is a peer of the other recovery tiers in the write-back loop (`future-recovery-architecture.md` §3; `future-workflow-durability-architecture.md`). A **validated** T4 recovery (selector re-derived at (d), post-condition passed at (f)) emits the **same `repair_event` shape** as a T1–T3 heal:

```
repair_event {
  skill, step, app_version_fingerprint,
  recovered_signal : ElementFingerprint  (re-derived via hit-testing, NOT a raw coordinate),
  tier             : "T4",
  confidence       : f(post-condition strength, fingerprint score, region-prior agreement),
  som_drift        : Δ(resolved_coord, compiled_bbox_anchor),   # telemetry only
  post_condition   : pass
}
```

Two-phase heal, identical to other tiers: **(1) ephemeral** — the re-derived selector is used for *this run only*; the signed package is never mutated locally (determinism + signing preserved). **(2) durable** — Cloud aggregates `repair_event`s across the fleet, corroborates on ≥K independent installs, replays against the golden corpus's post-condition, and only then re-compiles/re-signs a new package version. The first customer to hit a canvas-widget shift heals autonomously *and* protects everyone else. Because the unit promoted is a **selector** (or, for true canvas surfaces, a refreshed `bbox_css` + relational anchor), the fix is durable — not a brittle pixel.

---

## 6. Integration of UI-TARS concepts — adopt the seam, reject the agent

| UI-TARS concept | Verdict | How Conxa uses it |
|---|---|---|
| **Operator seam** (`screenshot()`/`execute(action)`/`getScreenSize()`, pluggable backends) | **Adopt the seam, redesign the contract** | One executor interface across tiers, but **action-centric with *either* a selector *or* a coordinate** — not coordinate-as-universal-payload (`high-value-repo-review.md` Idea 1). DOM tiers (T1–T3) pass a selector; T4 passes a selector when re-derived, a coordinate only on canvas/remote. No impedance mismatch. |
| **scaleFactor / devicePixelRatio** | **Adopt as a pipeline step (§3c)** | DPI normalization of resolved coordinates. A footnote, not the thesis. |
| **Set-of-Marks (SoM)** | **Adopt for telemetry only (§4)** | Drift sensor + audit trail; **never** success evidence. |
| **CALL_USER handoff** | **Adopt as T5, generalized (§3f escalation)** | Pause-and-hand-to-human, with **rule-initiated** (sensitive/destructive steps) *and* recovery-exhausted triggers — deterministic, stronger than UI-TARS's model-initiated version (`top-25-insights.md` #17). |
| **Vision-per-step as primary execution** | **REJECT** | Non-deterministic, unauditable, unbounded cost, no SLA — the exact enterprise anti-pattern Conxa exists to avoid (`high-value-paper-review.md` §4). |

**OS-ATLAS** contributes only a *component*: a normalized `(screenshot, description) → bbox` grounder as an *alternative backend* to host vision at step (b) — useful for unattended runs without a host vision surface, or for tighter cost control. It is **not a reliability solution** (`high-value-paper-review.md` §2; `top-25-insights.md` #23). **WebVoyager** contributes the SoM+AX-text dual-representation idea for the grounding context — the crop is paired with the (near-empty, by definition) AX digest of the region so the grounder has whatever weak structural hints exist.

---

## 7. Cost & rarity controls

- **Surface gate:** T4 is *unreachable* unless the step's `surface_class ∈ {canvas, custom, remote}` and a `visual_ref` was compiled. Ordinary DOM steps can never enter T4.
- **Region-narrowed grounding:** the ±N px `expected_region` crop is the single biggest cost/error reducer (§2) — the grounder verifies a region, it doesn't search a screen.
- **Budget caps:** T4 is bounded by the existing `RETRY_BUDGET_MAX` and a per-(skill, step) **host-vision token ceiling**; one ground attempt per step, no thrash (page-fingerprint hard cap, `top-25-insights.md` #18).
- **Fleet alarm:** T4 firing rate is itself telemetry. If a (skill, step) crosses a small threshold of T4 firings across the fleet, the durability system flags it for **recompile**, not for more vision. **T4 must stay < a few % of executions**; a rising rate is a defect to fix upstream, not a load to serve.
- **No host vision surface → escalate, don't degrade:** unattended runs without a sampling vision endpoint (and without an OS-ATLAS backend configured) skip T4 and escalate cleanly to T5 — never a silent raw-pixel guess.

---

## 8. What vision must NEVER do — the philosophy guardrails

1. **Never run in the hot path.** Vision fires at recovery only, at T4 only, after T1–T3 fail. Zero LLM/VLM on the happy path. (Invariant.)
2. **Never be the primary locator.** Conxa is not a vision agent. Reject UI-TARS-style vision-per-step as primary execution.
3. **Never click raw pixels when a selector can be re-derived.** Hit-test first; prefer the recovered DOM selector always.
4. **Never trust a coordinate as success.** SoM is intent, not outcome. Every T4 action is gated by the independent post-condition; no unverified T4 recovery counts.
5. **Never use a paid runtime vision API.** Grounding goes through the **host model via MCP sampling** (or a configured local grounder). Runtime uses AI minimally.
6. **Never mutate the signed package locally.** A T4 heal is ephemeral-for-this-run + a telemetry `repair_event`; only Cloud re-signs.
7. **Never widen the search blindly.** If the target isn't in `expected_region`, that's a drift signal → escalate; don't fall back to full-screen guessing.
8. **Never cross the frame boundary.** `elementFromPoint` hit-testing is frame-scoped; the iframe chain is preserved verbatim. `frame_enter`/`frame_exit` are never vision-recovered.
9. **Never let T4 rate grow unchecked.** Above a few %, fix T1–T3 or recompile — do not absorb the load with more vision.

---

## 9. Migration path — from passive payload to actionable tier

No rewrite; each step is independently shippable and strictly additive.

1. **Keep today's payload as the T5 handoff surface.** The `server.js` screenshot + DOM-digest payload (lines ~590–652) becomes the *attended human-handoff* response, not a misnamed "Layer 4." Rename "Layer 4/5" to the canonical T1–T5 tiering.
2. **Promote `visual_ref` to a search-narrowing anchor.** Extend the compiler's `anchor_vision_llm.py` output to emit `bbox_css`, `expected_region`, `dpr_record`, and `surface_class` into the package. The bbox is already captured (`anchor_vision_llm._apply_bbox_highlight` already computes dpr from viewport) — this is plumbing, not new capture.
3. **Add the grounding step via MCP sampling.** Replace "return image, hope for resume" with an autonomous **ground → normalize → hit-test → re-derive selector** sequence reachable only on `surface_class`-gated steps. Reuse the runtime's frame-scoped resolution and the G5 fingerprint scorer for (d).
4. **Wire the independent post-condition (G2) as the T4 trust gate.** Shared with T1–T3 — no T4-specific verifier.
5. **Emit T4 `repair_event` + SoM drift** into the existing telemetry/write-back loop (shared with G1/G3). T4 becomes a peer tier in the flywheel.
6. **Retire the passive interpretation.** Once T4 is autonomous, the host payload exists *only* as the T5 escalation, with a SoM-annotated screenshot and a specific resumable action.

---

## 10. Philosophy-compliance check

✅ **Vision is recovery/validation/verification only** — never execution; T4-only, after T1–T3. ✅ **Zero-LLM hot path** preserved; happy path untouched. ✅ **AI at recovery only, via the host model (MCP sampling)** or a configured local grounder — no paid runtime vision API. ✅ **Not a vision agent** — vision-as-primary rejected; UI-TARS adopted only for the seam, scaleFactor, SoM-as-telemetry, and CALL_USER. ✅ **Determinism preserved** — T4 outputs a *re-derived selector* (durable, scoreable, signable), not a raw pixel; raw coordinates only on genuinely DOM-hostile surfaces, always outcome-checked. ✅ **Signed central-compile respected** — ephemeral local heal + telemetry write-back; no local package mutation. ✅ **Iframe/no-recovery invariants** upheld — frame-scoped hit-testing; `frame_enter/exit` never recovered. ✅ **Deliberately rare** — surface-gated, budget-capped, fleet-alarmed to stay < a few % of executions. **No violations.** The single judgment call: unattended runs lacking any vision surface skip T4 and escalate to T5 rather than degrading determinism — the safe default, consistent with `future-recovery-architecture.md` §8.
