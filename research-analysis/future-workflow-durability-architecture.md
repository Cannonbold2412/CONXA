# Future Workflow Durability Architecture (Phase 8)

**The most important document in the program.** Goal: **Conxa workflows survive for years** — across UI changes, DOM changes, text changes, layout changes, and platform evolution — while preserving determinism, signing, auditability, and **explicit admin control over every published change**.

**Thesis.** Durability is not a property of a single skill package; it is a property of the **fleet**. A static compiled package is, by itself, *less* durable run-to-run than Stagehand's self-refreshing cache (`conxa-vs-state-of-the-art.md`, Durability row). Conxa wins durability only by exploiting the one thing no competitor has: **the same compiled artifact distributed to many customers with centralized telemetry** — so drift is **detected** on *first* occurrence anywhere and **surfaced to the conxa-cloud admin**, who reviews and publishes a fix that then reaches *everyone*. This is the fleet flywheel (`top-25-insights.md` #1), and durability is its primary application. **Detection is automatic and fleet-wide; the fix is built and published manually by an admin — nothing reaches customers without explicit admin approval.**

**This is a design document. No implementation.**

---

## 1. Why today's design is not durable

- A package is **static**. When the target app changes, the package is stale until recompiled.
- Recovery (today) is **host-delegated, no write-back** (`conxa-current-state-assessment.md` §8): even a successful manual fix doesn't heal the artifact — the next run re-breaks.
- There is **no breakage detection**: telemetry records recovery tiers but nothing concludes "skill X is drifting on app Y."
- There is **no change classification, no repair suggestion, no repair validation, no regression prevention.**
- Result: durability today = "the deterministic ladder happens to still match." That decays monotonically as the target evolves.

The durability system makes drift a **managed, observable, admin-governed lifecycle**: the fleet detects and surfaces it automatically; an admin builds and publishes every fix manually.

---

## 2. The durability lifecycle (detect automatically, fix manually)

```
        ┌──────────────────────────────────────────────────────────────┐
        │                      FLEET (Cloud)                            │
        │                                                              │
 runtime telemetry ─▶ (1) Breakage Detection ─▶ (2) Change Classification
        ▲                                              │   (advisory diagnosis)
        │                                              ▼
        │                          (3) Surface DriftEvent to conxa-cloud admin
        │                                   (review queue, with full evidence)
        │                                              │
        │                                              ▼
        │                          (4) Admin builds the fix  (re-record /
        │                              re-compile / edit in Build Studio)
        │                                              │
        │                                              ▼
        │                          (5) Admin publishes new signed version
        │                              (regression check at publish — §6)
        │                                              │
        └──────────────────────────────────────────────┴─▶ fleet delta-sync
```

Detection and classification are automatic; **everything from "surface" onward is
manual and admin-gated.** No version is generated, validated, or shipped to
customers without an admin building and publishing it. Each stage below is a
designed component.

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

### Stage 2 — Change Classification (advisory diagnosis)

Classify *what changed* to give the admin context for the fix — this is **diagnostic, not an auto-repair trigger**:

| Class | Example | Suggested fix (for the admin) | Risk to get wrong |
|---|---|---|---|
| **Text change** | button label "Save" → "Save changes" | Update text/aria signal; semantic signals survive | Low |
| **DOM change** | wrapper div added, class renamed | Re-resolve via orthogonal signals; structural signal updated | Low-Med |
| **Layout change** | element moved, position_hint stale | Position hint refreshed; identity unchanged | Low |
| **Attribute change** | data-testid removed/renamed | Demote testid, promote semantic; flag | Med |
| **Flow change** | new step inserted (consent, MFA, confirm) | Promote a *conditional* step (G6) into the package | Med-High |
| **Semantic change** | the action's meaning changed (field repurposed) | Re-record / re-author the step | High |

Classification uses the recorded fingerprint + the new live AX/DOM digest (from repair_events) + the intent graph. **Mind2Web's finding is the backbone:** semantic signals (role+name+text) survive most changes; structural signals fail first — so most classes are *easy for the admin to fix* by re-grounding semantic identity. The diagnosis and a suggested fix are presented to the admin; the admin decides and publishes — the system never applies the change itself.

---

### Stage 3 — Surface to Admin (the review queue is the only path)

Every DriftEvent is routed to a **conxa-cloud admin review queue** — there is no automatic-repair branch. The queue item carries the full evidence so the admin can decide quickly:
- The drift evidence: recovered tier history, affected installs, app-version delta, the recorded identity, and the runtime `repair_event`(s) that healed it at execution time.
- An **advisory suggested fix** at the compiler-IR (CIR) level: e.g. "for step N, replace identity signal set S with S′ (the signals multiple installs healed to)," or "insert conditional `if_present(banner)→dismiss` before step N." This is a *suggestion the admin can accept, edit, or reject* — never an auto-applied delta.
- Items are ranked by classification + corroboration so the admin triages the highest-impact drift first.

---

### Stage 4 — Admin builds the fix

The admin resolves the drift in Build Studio — the system assists but does not act on its own:
- Accept the suggested CIR delta, edit it, re-record the affected step(s), or LLM-assisted-edit them — the same authoring tools used for the original recording.
- Repairs are expressed as **CIR deltas** (`future-compiler-architecture.md`'s CIR), not raw `execution.json` patches, so the change stays *safe and diffable*.
- The **intent graph is the fixed point**: the admin changes *how* a step is achieved, never *what* it intends; an edit that alters intent is a deliberate re-authoring, surfaced as such.

---

### Stage 5 — Admin publishes a new signed version (with a regression gate)

When the admin is satisfied, they **publish** — producing a **new signed package version** (signing + version graph from `future-skill-pack-architecture.md`) that then delta-syncs to the fleet. Publishing is a deliberate admin action, never automatic, and it is gated by:
1. **Replay-against-golden:** the affected step(s) re-run against the golden DOM corpus (the recording's snapshot + accumulated fleet snapshots) and the **independent post-condition** must pass (the verifier from runtime/recovery — gap G2). The admin cannot publish a fix that fails its own post-condition.
2. **Golden-corpus regression:** the full per-skill corpus must still pass, not just the changed step (WebArena/WorkArena's version-pinned, functional-outcome philosophy — `high-value-paper-review.md`) — a fix must not *introduce* breakage.
3. **Rollback-ready:** every version is a CIR snapshot; rollback is a one-click version-graph operation (`future-compiler-architecture.md`) if a published fix regresses in the field.

This converts "a workflow broke" from a silent support ticket into an **observable, admin-governed, reversible** publish event. The discipline browser-use/UI-TARS lack (they trust model self-report) and that Stagehand only does offline lives here — as a gate the admin clears before shipping, not an automated push.

---

## 3. Governance model (the spine: detect automatically, publish manually)

There is exactly one rule and no auto-apply band: **the fleet detects and diagnoses drift automatically; an admin builds and publishes every fix manually.** Nothing reaches a customer without an explicit publish action in conxa-cloud.

- **Automatic, no approval needed:** breakage detection, change classification, evidence aggregation, ranking the review queue, and producing an *advisory* suggested fix.
- **Always admin-gated:** building the fix, clearing the regression gate, and **publishing** the new signed version.

Classification and corroboration no longer decide *whether* something ships — they only **rank the admin's queue** so the highest-impact, highest-confidence drift is triaged first. A regulated customer gets exactly what they need by construction: full detection and suggestion, but every applied change is human-approved. Auditability follows directly — each published version traces to a named admin, the evidence they saw, and the regression result at publish.

---

## 4. Workflow evolution (beyond repair)

Durability also means *graceful evolution*, not just patching. Each of these is surfaced to the admin as a **proposal** in the review queue, never auto-applied:
- **Conditional promotion:** stochastic states observed at runtime/recovery (banners, MFA) are proposed as compiled conditional steps (G6) — the admin can accept them so the workflow *learns* the branches the original recording missed.
- **Step deprecation:** if the fleet consistently skips/auto-recovers a step that no longer exists in the app, the durability system proposes removing it for the admin to confirm.
- **Input drift:** if input fields change shape, an updated inputs schema (with validation) is proposed for the admin to publish.
- **Intent stability:** through all of this, the **intent graph is the fixed point** — evolution changes *how* the goal is achieved, never *what* the goal is. Any change that would alter intent is a deliberate, admin-driven re-authoring, never an automatic one.

---

## 5. Lessons mapped to sources

- **Stagehand:** self-heal-then-refresh and the independent probe — but moved from *local in-place* to *fleet-detected drift + an admin-published re-sign* (the only model compatible with Conxa's signing + central compile; `research-audit.md` C.3).
- **Browser Use:** AX-tree re-grounding and page-fingerprint drift signals feed Stage 1/2; reject its per-step LLM loop.
- **Playwright:** semantic-over-structural identity (Mind2Web-confirmed) is why most change classes are easy for the admin to fix; the scored generator floor makes re-grounding deterministic.
- **Fable / host model:** used (via the recovery subsystem) to *propose* re-groundings to the admin, never to *ship* them unvalidated.
- **WebArena/WorkArena papers:** version-pinned, functional-outcome regression corpus (the Stage 5 publish gate) — the only durable validation philosophy.

---

## 6. Dependency graph (what must exist for durability to work)

```
G2 post-condition verifier ──┐
G5 runtime fingerprint score ─┤
G1 autonomous recovery + ─────┼─▶ repair_events (validated, fleet) ─▶ Stage 1-2 detect/classify
   write-back                 │
app-version fingerprint ──────┘                                   ─▶ Stage 3-4 surface + admin fix (CIR)
G10 compiler CIR + versioning ────────────────────────────────────▶ Stage 4-5 admin edit / publish
G9 package signing + rollback ────────────────────────────────────▶ Stage 5 admin publish + rollback
G3 fleet telemetry aggregation ───────────────────────────────────▶ the whole loop
```

Durability is the **integration layer** over recovery (G1), runtime verification (G2), compiler IR (G10), packaging (G9), and fleet telemetry (G3). It cannot be built first — but it is the *reason* to build those, and it should be designed now so those pieces expose the right seams.

---

## 7. The durability promise, quantified as targets

- **Detection latency:** drift detected within the first N fleet occurrences (target: single-digit) of an app-version change.
- **Time-to-admin-surface:** a confirmed DriftEvent reaches the admin's conxa-cloud review queue within minutes of first detection, with full evidence and a suggested fix.
- **Suggestion quality:** for ≥80% of drift events (text/DOM/layout/attribute classes), the surfaced suggested fix is accept-as-is — minimizing admin effort, even though the publish stays manual.
- **Regression rate:** ~0 — every published fix passes the golden corpus at the publish gate.
- **Mean workflow lifespan:** years, with the *artifact* evolving through admin-published versions while the *intent* stays fixed.

---

## 8. Philosophy compliance

✅ Determinism preserved — fixes are admin-published CIR deltas producing signed deterministic packages; the runtime hot path stays zero-LLM. ✅ AI used at recovery/repair-suggestion (heavy), never in the runtime hot path. ✅ Central compile + signing respected — no local mutation; fixes are re-signed centrally and published by an admin (the cloud coordinates; it still does not *execute*). ✅ Not an agent — the system heals *recorded, compiled* workflows toward their *recorded intent*; it never improvises new behavior. ✅ Human governance is **mandatory, not optional** — every change to a fielded pack is built and published by an admin; no trust is shifted to fleet-validated automation. **No violations.** The system detects and diagnoses automatically and applies nothing on its own; the golden-corpus regression gate at publish keeps each admin-approved change safe and auditable.
