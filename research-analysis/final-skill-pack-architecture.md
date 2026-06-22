# Final Skill Pack Architecture (Phase 8)

**The skill pack is the unit of value.** It is the one thing no competitor in the corpus ships (insight #9): a deterministic, signed, versioned, entitlement-gated, delta-syncable artifact that is also the substrate of the fleet drift flywheel (insight #1). Get its structure right and determinism, auditability, licensing, durability, and the moat all follow.

**Design constraints (from invariants):** auth/credentials never enter the pack; the cloud hosts but never executes/compiles; all of the runtime's intelligence must be *inside* the pack (no lazy grounding); iframe chains preserved verbatim.

---

## 1. Structure

```
skillpack/
├── manifest.json            # identity, version, signature, compatibility, entitlement
├── steps.json               # ordered array of compiled steps (Phase-2 step model)
├── inputs.schema.json       # typed skill inputs (zod-derived) + validation
├── conditionals.json        # branch/optional/if_present graph (Family 3)
├── verification.json        # per-step post-condition fingerprints (Phase 5)
├── recovery.json            # per-step recovery policy + fingerprints + anchors
├── fingerprints.json        # element + frame + shadow fingerprints (live-scoring oracle)
└── provenance.json          # source event ids, compile pins, app-version fingerprint
```

(Split for delta-sync efficiency: a recovery-metadata update needn't re-ship `steps.json`. Logically one signed artifact.)

### manifest.json — the governable header
```jsonc
{
  "skill_id": "servicenow.create-incident",
  "version": "7.3.0",                       // semver; history retained for rollback
  "signature": "ed25519:…",                 // cryptographic signature over all files
  "content_hash": "sha256:…",               // integrity
  "app_version_fingerprint": "sha256:…",    // target-env fingerprint (staleness/drift)
  "compatibility": { "runtime_min": "1.4.0" },
  "entitlement": { "scope": "company", "feature": "create-incident" },
  "compiled_at": "2026-06-21T…",
  "compiler_pins": { "model": "…", "ruleset": "…" }   // reproducible compiles
}
```

---

## 2. What belongs inside

| Content | Why it must be in the pack |
|---|---|
| **Ordered steps** (Phase-2 model) | the deterministic plan |
| **Multi-signal identity + fingerprints** | runtime resolution must not ground lazily (insight #15) |
| **Per-step post-conditions** | verification is mandatory and compile-time only (insight #2) |
| **Conditional/branch graph** | survive stochastic states deterministically (insight #7) |
| **Recovery metadata** (anchors, frame/shadow fingerprints, hover chains, virtualization flags, max_tier, destructive flags) | zero-token recovery needs all hints precompiled |
| **Typed input schema** | validate-at-boundary; bind dynamic values |
| **Confidence/durability scores** | runtime budgets + drift ranking (G5) |
| **app_version_fingerprint** | detect drift vs compiled-against version (insight #19) |
| **Provenance** (source_event_ids, pins) | diff, rollback, repair suggestion, audit (G10) |
| **Signature + entitlement** | supply-chain integrity + licensing (insight #9/#20) |

---

## 3. What must NOT be inside

| Excluded | Reason |
|---|---|
| **Auth files / credentials / storageState** | hard invariant — `plugin_builder.py` enforces; local runtime state only |
| **Raw per-step screenshots** | heavy; fingerprint+bbox suffice; screenshots live in telemetry |
| **LLM prompts / cached model outputs** | no lazy grounding; compile is the only grounding |
| **Non-deterministic selectors** (GUID-like, positional-on-dynamic, shadow-XPath) | filtered at compile so they never reach runtime (Phase 3) |
| **PII captured during recording** | scrub at compile; bind dynamic values via input schema, never bake literals |
| **Customer-specific data** | the pack is fleet-distributable; per-customer data is injected at run via inputs |
| **Mutable runtime state** | the signed artifact is immutable; healed selectors are ephemeral until re-signed |

The exclusion list is what makes the pack **safely fleet-distributable**: the same signed `servicenow.create-incident@7.3.0` runs for 500 customers, each injecting their own inputs and auth locally.

---

## 4. Versioning

- **Semantic versioning** with full history retained (one-click rollback — G9).
- **Immutable + signed:** a pack version is never edited in place; a change produces a new signed version.
- **Delta-sync:** true per-file SHA-256 delta (G9) — a recovery-metadata or single-step change ships only the changed file, not the whole pack.
- **Compatibility gating:** `compatibility.runtime_min` + `app_version_fingerprint` prevent a stale pack from silently running against a drifted app (the audit B.2 trap: a content-hash *hit* on a stale selector guarantees failure).
- **Rollback:** any version can be re-pushed instantly if a new version regresses — the safety net that makes the flywheel's auto-republish safe.

---

## 5. How durability works (the flywheel substrate)

```
runtime verified repair_event ──▶ Cloud aggregation (per skill, across ALL customers)
   ──▶ drift detection (first occurrence) ──▶ change classification (text/DOM/layout/flow)
      ──▶ repair suggestion ──▶ regression test on version-pinned env ──▶ RE-SIGN new version
         ──▶ canary rollout ──▶ fleet delta-sync  (before other customers hit the drift)
```

- A heal on **one** runtime, once verified, becomes a re-signed pack version pushed to **all** customers of that skill — drift is fixed fleet-wide on first occurrence, not rediscovered N times (insight #1, the moat).
- **Write-back is telemetry-driven, never local mutation** (insight #11): the signed local pack is never silently rewritten; the durable fix is always a Cloud re-sign. This preserves determinism + signing while still self-improving — a combination competitors with mutable local caches (Stagehand) structurally cannot claim.
- `durability_score` per step ranks which steps are drift-prone, focusing flywheel attention.

This is detailed in `future-workflow-durability-architecture.md`; the pack structure above is what makes it possible.

---

## 6. How verification metadata works

`verification.json` carries, per consequential step: channel, post-condition fingerprint, strength, timeout, required-vs-advisory. The runtime cannot advance a consequential step without it, and the validation planner cannot compile a consequential step without deriving one (a compile error otherwise). This makes "every step is verified" a structural property of the artifact, not a runtime hope.

---

## 7. How recovery metadata works

`recovery.json` precompiles everything the zero-token cascade needs so recovery never has to think: alternate orthogonal signals, recorded anchors, FrameFingerprints, shadow host-paths, hover chains, virtualization flags, `max_tier`, `destructive`, `allow_forced_action`. Tier-3 host recovery additionally uses the recorded `intent` + fingerprint to anchor describe-then-match. Because all of this is in the pack, recovery Tiers 1–2 are pure deterministic lookups — no LLM, honoring the invariant.

---

## 8. Why this beats the field

| Property | Conxa pack | Playwright codegen | SeleniumBase | Stagehand | browser-use/Fable |
|---|---|---|---|---|---|
| Deterministic artifact | ✅ | script (brittle) | script | ❌ (lazy ground) | ❌ (live agent) |
| Multi-signal scored identity | ✅ | ❌ | ❌ | partial | ❌ |
| Per-step verification baked in | ✅ | ❌ | manual | ❌ | ❌ |
| Conditional/branch graph | ✅ | ❌ | partial | ❌ | n/a |
| Signed + versioned + rollback | ✅ | ❌ | ❌ | ❌ | ❌ |
| Entitlement-gated | ✅ | ❌ | ❌ | ❌ | ❌ |
| Fleet drift write-back | ✅ | ❌ | ❌ | ❌ (local mutate) | ❌ |
| Auth-excluded by construction | ✅ | n/a | n/a | n/a | n/a |

**Net:** the pack turns browser automation into a *supply-chained, governable, self-healing product* — auditable enough for regulated enterprises, distributable enough to amortize one compile across a fleet, and structured so that verification and recovery are properties of the artifact rather than runtime luck. No competitor ships anything in this category; it is hard to retrofit onto a live-agent architecture (insight #9), which is precisely why it is defensible.
