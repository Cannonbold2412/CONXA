# Founder Execution Plan (Phase 12)

**Audience:** a small team with limited engineering resources. **Tone:** brutally honest. This is the "what would I actually do with 2–4 engineers and a runway" plan, derived from the blueprint (Phase 10), the build order (Phase 11), the pre-sales audit (`pre-sales-readiness.md`, `pre-sales-roadmap.md`, `minimum-sellable-conxa.md`), and the gap analysis.

**The one thing to internalize:** Conxa's marketed differentiator — the "5-tier AI self-healing cascade" — **does not exist in the code today**, and `verifyAssertions()` is unwired so the runtime cannot even tell whether a step did the right thing. You are closer to a reliable deterministic replayer than to the product on the website. The fastest path to revenue is **make the deterministic floor honest and verified**, not build more AI. Resist the temptation to demo the flywheel before single-customer replay is trustworthy.

---

## Next 30 days — make replay *honest*

**Goal:** every step proves its outcome; no silent wrong-actions; kill timing flakiness. This is R1 items 1–5 from `build-order.md`.

1. **Wire independent post-condition verification** (G2). This is the single highest-leverage change in the whole company. It is mostly wiring — the assertions are already computed. Until this ships, you cannot honestly claim reliability, and you must not build autonomous recovery (you'd be healing toward an unverifiable target).
2. **Stability(RAF) gate + hit-target check** (G4). Cheap, kills a whole flake class.
3. **Live multi-signal scoring + uniqueness gate** (G5). Cash in the fingerprint you already compile.
4. **Durability-ordered identity + classified ladder + adaptive timeouts** (#4,#5,#8,#9).
5. **Honest repositioning** — change the marketing to describe *deterministic verified replay with deterministic recovery*, not a fictional 5-tier AI cascade. Shipping claims you don't have is the fastest way to lose your first enterprise reference (`pre-sales-readiness.md` A2).

**Brutal truth:** none of this is glamorous and none of it is AI. It is also the only work that moves reliability the most per week. Do it first and completely.

---

## Next 60 days — survive real enterprise apps + clear the paid-pilot gate

**Goal:** the replayer works on actual Salesforce/ServiceNow/Workday flows, and you can legally/safely take money.

6. **Conditional/branch steps + dismiss-known library** (G6) — without this, ~30–50% of real loads break on consent banners/modals. This is the difference between "works in the demo" and "works at the customer."
7. **Action-correct handlers** — typeahead, custom dropdown, contenteditable, upload/download verification. These are the WorkArena-proven top enterprise failures.
8. **Pre-pilot security minimum** (run in parallel, `pre-sales-roadmap.md` Gate A+B): **code signing** of the installer, **RBAC enforced**, destructive-step guard, basic audit log, error UX. ~3 weeks of focused work; it gates *every* paid pilot regardless of reliability.

**Brutal truth:** items 6–7 are where most browser-automation startups quietly fail — they nail the happy path and never make typeahead/virtualized-grids/consent-banners reliable. That is exactly the surface enterprise buyers test first. Budget for it.

---

## Next 90 days — make "self-healing" real

**Goal:** unattended runs actually heal, and you can say so truthfully.

9. **Autonomous Tier-3 describe-then-match** via MCP sampling (G1) — replace host-delegated manual resume with a bounded, verified autonomous tier. *Only now is this safe, because verification (day-30) gates every repair.*
10. **Frame/shadow recovery hardening + frame-aware verification** — the enterprise moat (Salesforce/ServiceNow iframes).
11. **Structured human handoff + rule-triggered destructive escalation** — fail closed on pay/delete/submit.
12. **`repair_event` emission** — start collecting verified repairs now, even before the flywheel consumes them; the data is the seed of the moat.

**Brutal truth:** this is the headline feature, but it is *third* in priority, not first. A demo of AI self-healing on top of an unverified floor is a liability — it will confidently do the wrong thing in front of a customer. Earn the right to build it by shipping verification first.

---

## Before your first 10 customers

- R1 (verified floor) **complete and proven on a version-pinned regression suite** (insight #14) — reproducible outcomes, not live-site luck.
- R2 (conditional flow + handlers) covering the specific apps those 10 customers use.
- Gate A+B security (code signing, RBAC, audit log, honest error UX) **done**.
- Marketing claims match shipped behavior.
- A manual runbook for the things you haven't automated yet (drift recompile, edge handlers) — honesty beats a broken auto-feature.

**You do NOT need:** the flywheel, SSO/SAML, vision Tier-4, or the compiler IR refactor. Do not build them yet.

---

## Before your first 100 customers

- R3 (autonomous verified recovery) shipped — unattended reliability is now a real selling point.
- **Cloud ops hardening** (G14: Redis, durable queue, blob storage) — your free-tier ephemeral infra will lose telemetry and drop the data the flywheel needs.
- R4 **begun**: fleet drift detection + signed packages + delta + rollback. At 100 customers, the same site drift is being rediscovered repeatedly — the flywheel's ROI turns positive exactly here.
- SSO/SAML and tenant isolation as the first enterprise logos demand them.

**Brutal truth:** the flywheel is the moat, but it is worthless before ~dozens of customers share skills — you need fleet density for cross-customer drift propagation to matter. Build the *plumbing* for it at this stage (signed packs, repair_events, aggregation), and let it compound as density grows. Don't over-invest in flywheel sophistication before you have a fleet.

---

## Before enterprise customers

- R4 (flywheel + durability) **complete** — "workflows survive for years," demonstrated with rollback and canary.
- R5 (enterprise trust plane) **complete** — RBAC/SSO/SAML, hard tenant isolation, audit log, signed supply chain, entitlement-gated skill surface.
- **Outcome-grade SLAs** backed by reproducible regression environments and the honest failure model (Phase 9) — you can promise verified outcomes because you fail closed and never report false success (insight #22).
- Position determinism on **auditability and reproducibility**, not cost — that argument survives a 10×-cheaper-inference world; "the model usually does the same thing" does not pass enterprise/regulatory review.

---

## The brutally honest summary

| Stage | Build | Do NOT build |
|---|---|---|
| 30d | Verified deterministic floor (R1) + honest marketing | AI recovery, flywheel |
| 60d | Conditional flow + handlers (R2) + code signing + RBAC | SSO, vision, IR refactor |
| 90d | Autonomous verified recovery (R3) + repair_events | full flywheel |
| ≤10 cust | R1 done + R2 for their apps + Gate A/B security | flywheel, SSO |
| ≤100 cust | R3 done + ops hardening + flywheel *plumbing* | flywheel sophistication |
| enterprise | R4 + R5 complete + outcome SLAs | — |

**The three non-negotiables, in order:** (1) **verification first** — it is cheap, it is the prerequisite for everything trustworthy, and without it you ship confident wrong-actions; (2) **deterministic coverage of real enterprise interactions** — typeahead, consent banners, virtualized grids, iframes — before any AI flourish; (3) **the flywheel last among the big bets**, because it only compounds with fleet density. Build in this order and you reach trustworthy revenue fastest; invert it and you build an impressive demo that fails in production.

**Final honest verdict:** the architecture in Phases 1–11 is correct and достаточно detailed to implement without returning to the research. The gap between today and a product that out-reliability's every tool in the corpus is **mostly deterministic engineering you already have the pieces for** (late-bound identity, compiled fingerprints, frame chains, auth self-heal) — the work is wiring them together, verifying outcomes, and resisting the urge to lead with AI. The moat (the flywheel) is real and uncopyable, but it is earned by first being boringly, verifiably reliable for one customer at a time.
