# Future Workflow Durability Architecture (Phase 8)

**The most important document in the program.** Goal: **Conxa workflows survive for years** — across UI changes, DOM changes, text changes, layout changes, and platform evolution — with minimal human intervention, while preserving determinism, signing, and auditability.

**Thesis.** Durability is not a property of a single skill package; it is a property of the **fleet**. A static compiled package is, by itself, *less* durable run-to-run than Stagehand's self-refreshing cache (`conxa-vs-state-of-the-art.md`, Durability row). Conxa wins durability only by exploiting the one thing no competitor has: **the same compiled artifact distributed to many customers with centralized telemetry** — so drift is detected on *first* occurrence anywhere and fixed for *everyone* before they hit it. This is the fleet flywheel (`top-25-insights.md` #1), and durability is its primary application.

**This is a design document. No implementation.**

---

## 1. Why today's design is not durable

- A package is **static**. When the target app changes, the package is stale until recompiled.
- Recovery (today) is **host-delegated, no write-back** (`conxa-current-state-assessment.md` §8): even a successful manual fix doesn't heal the artifact — the next run re-breaks.
- There is **no breakage detection**: telemetry records recovery tiers but nothing concludes "skill X is drifting on app Y."
- There is **no change classification, no repair suggestion, no repair validation, no regression prevention.**
- Result: durability today = "the deterministic ladder happens to still match." That decays monotonically as the target evolves.

The durability system makes drift a **managed, observable, self-correcting lifecycle**.

---

## 2. The durability lifecycle (closed loop)

```
        ┌──────────────────────────────────────────────────────────────┐
        │                      FLEET (Cloud)                            │
        │                                                              │
 runtime telemetry ─▶ (1) Breakage Detection ─▶ (2) Change Classification
        ▲                                              │
        │                                              ▼
        │                                   (3) Repair Suggestion (CIR-level)
        │                                              │
        │                                              ▼
        │                                   (4) Repair Validation (replay vs golden)
        │                                              │
        │                          ┌──── confident ────┤──── uncertain ────┐
        │                          ▼                                       ▼
        │              (5) Re-sign + push new version            (7) Review queue (human)
        │                          │                                       │
        └──────────────────────────┴─────────── (6) Regression Prevention ─┘
```

Each stage below is a designed component.

---

### Stage 1 — Breakage Detection

**Inputs (from the runtime, already partly emitted):** recovery-tier usage per step, soft-failure (post-condition) signals, repair_events, page-fingerprint deltas, app-version fingerprint (NEW — emitted by the compiler into the package and echoed by the runtime).

**Detection logic (fleet-level, not per-instance):**
- **Drift signal:** a step's recovery-tier distribution shifts upward across the fleet (more runs needing T1-alt / T2 / T3) — the earliest sign identity is degrading *before* hard failures appear.
- **Breakage signal:** hard-failure or soft-failure rate for a (skill, step, app-version) crosses a threshold across multiple installs.
- **App-version change:** the observed app-version fingerprint diverges from the package's compiled-against fingerprint (a deterministic, leading indicator — `top-25-insights.md` #19).

**Why fleet-level matters:** one install hitting a failure is noise; ten installs of the same skill hitting the same step at the same app-version is a *confirmed drift event* — detected on first occurrence anywhere, not rediscovered N times. This is the structural advantage competitors (single-tenant/local) cannot replicate.

Output: a `DriftEvent {skill, step, app_version_from→to, signal_type, confidence, affected_installs}`.

---

### Stage 2 — Change Classification

Classify *what changed* (drives the repair strategy and how risky the auto-repair is):

| Class | Example | Repair strategy | Auto-repair risk |
|---|---|---|---|
| **Text change** | button label "Save" → "Save changes" | Update text/aria signal; semantic signals survive | Low |
| **DOM change** | wrapper div added, class renamed | Re-resolve via orthogonal signals; structural signal updated | Low-Med |
| **Layout change** | element moved, position_hint stale | Position hint refreshed; identity unchanged | Low |
| **Attribute change** | data-testid removed/renamed | Demote testid, promote semantic; flag | Med |
| **Flow change** | new step inserted (consent, MFA, confirm) | Promote a *conditional* step (G6) into the package | Med-High |
| **Semantic change** | the action's meaning changed (field repurposed) | Cannot auto-repair — escalate | High |

Classification uses the recorded fingerprint + the new live AX/DOM digest (from repair_events) + the intent graph. **Mind2Web's finding is the backbone:** semantic signals (role+name+text) survive most changes; structural signals fail first — so most classes are auto-repairable by re-grounding semantic identity. The dangerous class (semantic/flow) is the one that must escalate.

---

### Stage 3 — Repair Suggestion (at the IR/CIR level)

Repairs are proposed **against the compiler IR** (`future-compiler-architecture.md`'s CIR), not by patching `execution.json` strings. This is what makes repair *safe and diffable*:
- A repair is a CIR delta: "for step N, replace identity signal set S with S′ (corroborated repaired signals from the fleet)," or "insert conditional `if_present(banner)→dismiss` before step N."
- Repairs aggregate fleet evidence: the repaired identity proposed is the one that multiple installs *validated* (passed post-conditions), weighted by confidence — not a single guess.
- Text/DOM/layout/attribute classes → automatic CIR delta. Flow class → CIR delta proposing a conditional branch. Semantic class → no auto-delta; route to review.

---

### Stage 4 — Repair Validation (before anything ships)

A proposed CIR delta is **never published unvalidated**:
1. **Replay-against-golden:** re-run the affected step(s) against a captured golden DOM snapshot (the recording's snapshot + the latest fleet-observed snapshot) and confirm the **independent post-condition** passes (the verifier from runtime/recovery — gap G2). This is the same trust gate recovery uses, applied at fleet scale.
2. **Cross-install corroboration:** confirm the repair worked on ≥K independent installs (the repair_events that fed it).
3. **Confidence threshold:** only repairs above threshold proceed to auto-publish; the rest go to the review queue.

This is the discipline browser-use/UI-TARS lack (they trust model self-report) and that Stagehand only does offline — here it is the *gate on shipping a fix to the fleet*.

---

### Stage 5 — Re-sign + Push (controlled rollout)

A validated repair becomes a **new signed package version** (signing + version graph from `future-skill-pack-architecture.md`). Rollout is **staged, not all-at-once**:
- Canary to a small fraction of installs → watch their post-condition/recovery telemetry → promote to the fleet on success, auto-rollback on regression.
- The customer (publishing company) sees the repair in their dashboard with a diff and can require manual approval (governance) or allow auto-apply (convenience) per their policy.

This converts "a workflow broke" from a support ticket into a background, observable, reversible fleet event.

---

### Stage 6 — Regression Prevention

Durability must not *introduce* breakage:
- **Golden corpus per skill:** the original recording's snapshots + accumulated fleet snapshots form a regression suite (WebArena/WorkArena's version-pinned, functional-outcome philosophy — `high-value-paper-review.md`). Every CIR delta must pass the full corpus's post-conditions, not just the changed step.
- **Semantic-diff guard:** a repair that would change the *intent* of a step (vs just its identity) is blocked — intent is the invariant; identity is mutable.
- **Rollback-ready:** every version is a CIR snapshot; rollback is a version-graph operation (`future-compiler-architecture.md`).

---

### Stage 7 — Review Queue (human-in-the-loop for the hard cases)

Semantic/flow changes and low-confidence repairs route to a Cloud review queue consumed by the publishing company:
- Presented as: the drift evidence, the proposed change, the affected installs, and a one-click "recompile this step" (re-record or LLM-assisted edit in Build Studio).
- The human resolution becomes a validated CIR delta → re-enters Stage 5.
- This is the controlled escape valve: the system auto-handles the ~80% (text/DOM/layout/attribute) and routes the ~20% (semantic/flow) to a human with full context — instead of today's "every break is a manual resume with no memory."

---

## 3. Confidence model (the spine of auto- vs human-repair)

A repair's confidence is a function of: change class (text < semantic risk), number of corroborating installs, post-condition strength, orthogonal-signal agreement, and app-version-fingerprint certainty. Three bands:
- **High → auto-repair + canary + auto-promote.**
- **Medium → auto-repair proposed, customer approval required.**
- **Low / semantic / flow → review queue (human).**

Confidence is auditable and tunable per customer (a regulated customer can set the auto-band threshold to "never," getting detection + suggestion but always human-approved application).

---

## 4. Workflow evolution (beyond repair)

Durability also means *graceful evolution*, not just patching:
- **Conditional promotion:** stochastic states observed at runtime/recovery (banners, MFA) are promoted into compiled conditional steps (G6) — the workflow *learns* the branches the original recording missed.
- **Step deprecation:** if the fleet consistently skips/auto-recovers a step that no longer exists in the app, the durability system proposes removing it.
- **Input drift:** if input fields change shape, the inputs schema evolves with validation.
- **Intent stability:** through all of this, the **intent graph is the fixed point** — evolution changes *how* the goal is achieved, never *what* the goal is. Any proposed change that alters intent is escalated, never auto-applied.

---

## 5. Lessons mapped to sources

- **Stagehand:** self-heal-then-refresh and the independent probe — but moved from *local in-place* to *fleet-validated re-sign* (the only model compatible with Conxa's signing + central compile; `research-audit.md` C.3).
- **Browser Use:** AX-tree re-grounding and page-fingerprint drift signals feed Stage 1/2; reject its per-step LLM loop.
- **Playwright:** semantic-over-structural identity (Mind2Web-confirmed) is why most change classes are auto-repairable; the scored generator floor makes re-grounding deterministic.
- **Fable / host model:** used (via the recovery subsystem) to *propose* re-groundings, never to *ship* them unvalidated.
- **WebArena/WorkArena papers:** version-pinned, functional-outcome regression corpus (Stage 6) — the only durable validation philosophy.

---

## 6. Dependency graph (what must exist for durability to work)

```
G2 post-condition verifier ──┐
G5 runtime fingerprint score ─┤
G1 autonomous recovery + ─────┼─▶ repair_events (validated, fleet) ─▶ Stage 1-2 detect/classify
   write-back                 │
app-version fingerprint ──────┘                                   ─▶ Stage 3-4 suggest/validate (CIR)
G10 compiler CIR + versioning ────────────────────────────────────▶ Stage 5-6 re-sign/regress
G9 package signing + rollback ────────────────────────────────────▶ Stage 5 controlled rollout
G3 fleet telemetry aggregation ───────────────────────────────────▶ the whole loop
```

Durability is the **integration layer** over recovery (G1), runtime verification (G2), compiler IR (G10), packaging (G9), and fleet telemetry (G3). It cannot be built first — but it is the *reason* to build those, and it should be designed now so those pieces expose the right seams.

---

## 7. The durability promise, quantified as targets

- **Detection latency:** drift detected within the first N fleet occurrences (target: single-digit) of an app-version change.
- **Auto-repair coverage:** ≥80% of drift events (text/DOM/layout/attribute classes) auto-repaired without human action.
- **Time-to-fleet-fix:** validated fix pushed to the fleet within hours of first detection, not days/weeks of support tickets.
- **Regression rate:** ~0 — every fix passes the golden corpus before rollout.
- **Mean workflow lifespan:** years, with the *artifact* continuously evolving while the *intent* stays fixed.

---

## 8. Philosophy compliance

✅ Determinism preserved — repairs are validated CIR deltas producing signed deterministic packages; the runtime hot path stays zero-LLM. ✅ AI used at recovery/repair-suggestion (heavy), never in the runtime hot path. ✅ Central compile + signing respected — no local mutation; fixes are re-signed centrally (the cloud coordinates; it still does not *execute*). ✅ Not an agent — the system heals *recorded, compiled* workflows toward their *recorded intent*; it never improvises new behavior. ✅ Human governance preserved — regulated customers can gate every auto-repair. **No violations.** The judgment call: auto-repair shifts some trust to fleet-validated automation; the confidence bands + golden-corpus regression gate + per-customer approval policy keep it safe and auditable.
