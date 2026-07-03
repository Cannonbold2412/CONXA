# Build Order (Phase 11)

**Objective:** the optimal implementation sequence, optimizing for **maximum reliability gain per engineering-week** — not architectural perfection. Where the blueprint (Phase 10) defines *what* to build as releases R1–R5, this defines the *order within and across them*, what is a hard prerequisite, and what must never be built before its dependencies exist.

**The single most important sentence:** *Ship the verified deterministic floor (R1) completely before anything else, because verification (G2) is the prerequisite for trustworthy recovery (R3) and a non-poisoning flywheel (R4).* Everything else is sequencing around that keystone.

---

## 1. The dependency DAG (what blocks what)

```
            ┌──────────────────────────────────────────────┐
            │ R1  VERIFIED DETERMINISTIC FLOOR (keystone)   │
            │  verification ▸ stability gate ▸ live scoring │
            │  ▸ classified ladder ▸ durability ordering    │
            └───────┬───────────────────────┬───────────────┘
                    │                       │
        ┌───────────▼─────────┐   ┌─────────▼───────────────┐
        │ R2 conditional flow │   │ R3 autonomous recovery  │
        │  + action handlers  │   │  (needs verification to │
        │  (needs verify on   │   │   validate any repair)  │
        │   dismissal)        │   └─────────┬───────────────┘
        └─────────────────────┘             │
                                  ┌──────────▼──────────────┐
                                  │ R4 fleet flywheel        │
                                  │  (needs verified         │
                                  │   repair_events; unverif-│
                                  │   ied repairs poison fleet)│
                                  │  + cloud ops hardening   │
                                  └─────────────────────────┘

  R5 ENTERPRISE TRUST PLANE — parallel track, gated by sales need
     (code signing + RBAC are needed before ANY paid pilot)
```

**Hard prerequisites (never violate):**
- **Verification before autonomous recovery.** Building Tier-3 self-heal before verification means healing toward an unverifiable target — you'd ship confident wrong-actions at scale. *R1 before R3, always.*
- **Verification before the flywheel.** A `repair_event` that wasn't gated by a post-condition could push a *wrong* selector to 500 customers. *R1 before R4, always.*
- **Cloud ops hardening before fleet aggregation at scale.** Redis/durable-queue/blob storage (G14) before R4 carries real fleet traffic.
- **Single-tenant reliability proven before the flywheel.** Don't build cross-customer drift propagation until R1–R3 make a single customer reliable — otherwise you propagate noise.

---

## 2. The sequence, week-optimized

### Build first (highest reliability-gain per week — all zero-token, low risk)
The R1 spine, in this internal order (each unblocks the next's trustworthiness):

1. **Independent post-condition verification** (G2/top-50 #1). *Cheapest high-impact item in the whole program; unblocks everything downstream.* Wire the already-computed assertions through an independent channel.
2. **Actionability stability(RAF) gate + hit-target** (G4/#2,#7). Kills a whole timing-flake class; Low complexity.
3. **Live multi-signal scoring + uniqueness gate** (G5/#3). Cashes in the existing compiled fingerprint; closes EC-28 from the resolution side.
4. **Durability-ordered identity at compile** (#5). Fixes the C.1 contradiction; one compiler change.
5. **Exception-classified ladder + adaptive timeouts + consume confidence** (#4,#8,#9).

> These five are the "five highest-ROI items if nothing else ships" from the top-50, and they address all five failure families. They require **no research** — they are ports of proven Playwright/SeleniumBase/Stagehand mechanisms. Ship them and Conxa already beats codegen and SeleniumBase replay on reliability.

### Build second (real-world coverage — depends on the verified floor)
6. **Conditional/branch steps + dismiss-known library** (R2: G6/#6,#11). The linear-replay killer fix.
7. **Action-correct handlers** (typeahead, custom dropdown, contenteditable, upload/download verify) (#10,#15,#23,#31,#32).
8. **Scroll-until-found, re-hover, stale-DOM guard** (#12,#13,#14).
9. **Recorder upgrades** to capture the above as composites (G12).

### Build third (the headline differentiator — depends on verification)
10. **Autonomous Tier-3 describe-then-match** (R3: G1/#19,#45) + reflection (#44).
11. **Frame/shadow recovery hardening + frame-aware verification** (#17,#18,#24,#27).
12. **Structured human handoff + rule-triggered destructive escalation** (#28,#29).
13. **`repair_event` emission + retry cap** (#22,#30).

### Build fourth (the moat — depends on verified repairs + ops)
14. **Cloud ops hardening** (G14) — prerequisite.
15. **Fleet aggregation + drift detection + change classification + repair suggestion + regression env** (R4: G3/G7/#46).
16. **Signing + per-file delta + rollback + app-version fingerprint + canary** (G9/#19).

### Build on a parallel track (revenue-gated, not reliability-gated)
- **Code signing + RBAC** — *earliest items, needed before any paid pilot* (`pre-sales-roadmap.md`).
- **SSO/SAML, tenant isolation, audit log, ServerBackend seam, entitlement filter** (R5: G8/G11) — sequence against deal pipeline.

---

## 3. What to NOT build until prerequisites exist

| Do not build | Until | Why |
|---|---|---|
| Autonomous Tier-3 recovery | verification (R1) is wired | healing toward an unverifiable target ships confident wrong-actions |
| Fleet flywheel propagation | verified `repair_event`s exist (R3) + ops hardening (G14) | unverified repairs poison the fleet; ephemeral infra loses telemetry |
| Vision Tier-4 (G13) | Tier-3 + CDP-AX recovery exhausted in practice | most "DOM-opaque" cases are reachable via CDP AX; vision is rare (ROI 4) |
| Compiler IR refactor (G10) | durability/rollback actually need it (R4) | large refactor, deferred payoff; don't block reliability work on it |
| Drag-and-drop, date-picker, canvas handlers | the high-frequency handlers (R2) ship | long-tail edge cases; lower frequency/impact |
| Self-hosted regression at scale | R1 mechanisms exist to test | nothing to regression-test until the floor is built |

**The anti-pattern to avoid:** building the impressive AI recovery and flywheel *first* (they demo well) before the boring verified floor. That inverts the dependency DAG and produces a system that heals impressively toward wrong answers and propagates them fleet-wide. The corpus is unambiguous: **reliability is overwhelmingly a deterministic engineering problem (47 of 50 improvements are zero-token)** — build the deterministic floor first.

---

## 4. Reliability gain per engineering-week (the ranking that matters)

| Order | Work | ~Effort | Rel gain | Gain/week |
|---|---|---|---|---|
| 1 | Post-condition verification | low | very high | **highest** |
| 2 | Stability gate + hit-target | low | high | very high |
| 3 | Live scoring + uniqueness | med | high | high |
| 4–5 | Durability order + classified ladder + adaptive timeouts | low–med | high | high |
| 6–9 | Conditional flow + handlers + recorder | med | high (enterprise sites) | high |
| 10–13 | Autonomous recovery + boundary | high | medium–high | medium |
| 14–16 | Flywheel + durability + signing | high | compounding (long-term) | medium (front), high (cumulative) |
| ∥ | Code signing + RBAC | med | n/a (revenue) | gating |

**Conclusion:** the optimal order front-loads the cheap zero-token deterministic floor (items 1–5), which delivers the steepest reliability gain per week and is the prerequisite for everything that follows; then real-world coverage (6–9); then the autonomous recovery and the moat (10–16); with enterprise plumbing on a parallel, sales-gated track. Follow this order and reliability rises fastest while no release is ever built on a missing prerequisite.
