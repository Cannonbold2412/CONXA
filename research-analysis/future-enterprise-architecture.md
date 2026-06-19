# Future Enterprise Architecture (Phase 9)

**The enterprise wedge is governance, not features.** Conxa's thesis (top-25 #22, master-insights L3) is that determinism is valuable on *auditability* grounds — properties that do **not** decay as inference gets cheaper. Agents cannot offer a reproducible audit trail; Conxa can. This document designs the enterprise platform that turns that thesis into a procurement-passable, SLA-able, RPA-grade-governed product **without surrendering the local-execution / central-coordination / auth-never-leaves-the-machine model** that makes the thesis true.

**Design only. No code.** Grounding: current-state §12–13, gap-analysis G8/G14 (+G3 dependency), top-25 #1/#9/#20/#22, durability architecture (confidence bands), Impl-Plan Phase 3, Security.md (SG-01…14), TRD §15.

**The unifying claim of this document:** the cloud must become a **real control plane**, and the *same* control-plane infrastructure serves two demands that are usually built twice — the **durability flywheel** (G3, the moat) and **enterprise fleet management** (the High-severity gap). They share one substrate: a registry of runtimes, a tamper-evident event spine, a policy engine, and a signed-artifact distribution channel. Build it once.

---

## 0. North-star control-plane topology (conceptual)

```
   COMPANY (publisher)            CONXA CONTROL PLANE (cloud — coordinates, never executes)        CUSTOMER FLEET (executes locally)
 ┌──────────────────┐    ┌──────────────────────────────────────────────────────────────┐   ┌────────────────────────────┐
 │ Build Studio      │    │ ┌── Identity & Access ──┐  ┌── Governance Engine ──┐          │   │ Runtime (Claude Desktop MCP)│
 │  record/compile   │───▶│ │ Clerk + SAML/OIDC SSO │  │ approval workflows     │          │   │  per-USER runtime identity   │
 │  sign request     │    │ │ SCIM provisioning      │  │ change-mgmt / sign-off │          │   │  sync-token (read packs)     │
 └──────────────────┘    │ │ rbac.py → ALL routes   │  │ per-tenant deploy policy│          │   │  session key (AES-GCM, local)│
                          │ └───────────┬───────────┘  └───────────┬────────────┘          │   │  ── auth NEVER leaves ──     │
                          │             ▼                          ▼                       │   └──────────┬─────────────────┘
                          │ ┌── Tenant-Isolated Stores ──┐  ┌── Tamper-Evident Audit ──┐   │              │ telemetry / repair_events
                          │ │ per-tenant namespace/keys   │  │ hash-chained event spine │◀──┼──────────────┘ runtime-start / heartbeat
                          │ │ row-level + KMS envelope     │  │ SIEM export (CEF/OCSF)   │   │              ▼
                          │ └───────────┬─────────────────┘  └───────────┬──────────────┘   │   ┌── Fleet Registry ──┐
                          │             ▼                                ▼                  │◀──│ active runtimes,    │
                          │ ┌── Signed Artifact Distribution (CDN/blob) ──┐  ┌─ Fleet ─┐   │   │ versions, health,   │
                          │ │ signed pkg · version graph · staged rollout │  │ Flywheel │   │   │ device posture       │
                          │ └─────────────────────────────────────────────┘  │ (G3/G7) │   │   └─────────────────────┘
                          │   Postgres + Redis (shared state) + durable queue └─────────┘   │
                          └──────────────────────────────────────────────────────────────┘
```

Deployment-model agnostic: the *same* control plane runs as Conxa SaaS, as a customer-owned self-hosted instance (on-prem), or in an air-gapped fork (flywheel scoped to one tenant). The seams are identical; only the trust boundary moves.

---

## 1. RBAC — wire the scaffold to ALL routes (G8 · SG-01 · Impl-Plan 1.6/3.5)

**Today:** `rbac.py` exposes only `require_admin()`, called in exactly one route (razorpay). Every other route enforces membership + slug-ownership but not role. Any `member` can publish, upload, drain telemetry, burn LLM quota. **High debt.**

**Design.**
- **Single enforcement seam.** Replace `require_admin()` with `require_permission(principal, Permission.X)` as a FastAPI dependency applied to *every* mutating route and every read route that returns cross-user data. Default-deny: a route with no declared permission returns 403. CI lint asserts every `/api/v1` route declares a permission — closing the "forgot to wire it" class that created SG-01.
- **Role model.** `owner` ⊃ `admin` ⊃ `member` ⊃ `analyst` (read-only telemetry, no build/publish — Impl-Plan 3.5) plus **custom roles** = named sets of fine-grained permissions, per-tenant definable. Permissions are the atom, roles are sugar.
- **Permission catalog (least-privilege, action-typed):** `skill.publish`, `skill.install-token.mint`, `skill.recompile`, `skill.rollback`, `repair.approve`, `installer.upload`, `installer.delete`, `audit.read`, `audit.export`, `telemetry.read`, `member.invite`, `role.assign`, `policy.edit`, `apikey.mint`. **`repair.approve` is first-class** — durability auto-repairs (§4) are governed actions, not background events.
- **Per-skill ACLs (3.5):** publish/read scoped per-skill, not just per-workspace — a publisher team for skill A need not publish skill B.
- **Non-human principals:** scoped, role-bound, revocable **API keys** for CI/CD publishing (3.5) and a **proxy-identity HMAC** fix for SG-02 (per-request signed claims, not a static shared secret). Migration: ship RBAC in **audit-only mode first** (log would-be-403s), then enforce — per Impl-Plan risk note, avoids breaking existing admin flows.

→ *Impl-Plan: 1.6 (wire), 3.2 (multi-user publish gated by `skill.publish`), 3.5 (advanced/custom roles, per-skill ACL, API keys).*

---

## 2. Audit Logs — complete, exportable, tamper-evident (the moat — top-25 #22)

**Today:** audit log DONE for publish/installer/plugin events only. That is a *fraction* of the auditable surface.

**Design — the auditability moat made literal.** The differentiator vs agents is that *every consequential act in Conxa is a discrete, reproducible, attributable event* — there is no opaque "the model decided." Make the audit trail cover the **full lifecycle**, end to end:

| Event class | Sources | Why it matters |
|---|---|---|
| **Authoring** | record start, compile, sign request | who built this automation, from what recording |
| **Publish / change-mgmt** | publish, version bump, rollback, approval grant/deny, sign-off | the supply chain of the artifact |
| **Distribution** | installer build/sign, install-token mint, runtime registration | who can run it, on what machines |
| **Execution outcome** | skill run start/finish, **post-condition pass/fail (G2)**, recovery tier reached, **CALL_USER escalation** | the actual work performed, with verified outcomes — *this is what agents cannot produce* |
| **Repair / durability** | drift detected, repair proposed, auto-applied vs human-approved, canary promote/rollback | the self-healing lifecycle, fully attributable |
| **Config / governance** | RBAC change, policy edit, SSO/SCIM change, key rotation | the control-plane's own changes |

**Tamper-evidence.** Events form a **per-tenant hash chain** (each entry includes `prev_hash`; periodic Merkle checkpoints signed by a Conxa KMS key and optionally anchored externally). An auditor can verify no event was deleted or reordered without detection. This is the property that lets a regulated customer *trust* the log rather than the vendor — and it is cheap relative to its sales weight.

**Export.** `GET /api/v1/audit/export` (gated `audit.export`) streams **OCSF / CEF** for Splunk/Sentinel/Chronicle, plus signed JSONL bundles with the chain proof. Retention is per-tenant policy (e.g. 7y for finance). **Execution-outcome events are the killer feature** — they turn "we ran 14,000 automations last quarter" into an attestable, verified, reproducible record. An agent platform can log *attempts*; only a deterministic-replay platform can log **verified outcomes against a compiled post-condition**.

→ *Impl-Plan: 2.3 (extend), 3.6 (SOC2 evidence export feeds from this).*

---

## 3. Tenant Isolation — beyond `workspace_id` filtering (G8 · SG-05/06)

**Today:** isolation = `workspace_id` string filter inside *shared* KV namespaces. One missed filter (the SG-01/SG-05 pattern) = cross-tenant leak. This is the weakest enterprise primitive.

**Threat model.** (a) *Logic-bug cross-tenant read* — a route forgets the filter; (b) *noisy neighbor* — one tenant's telemetry/compile load degrades another (SG-06 unbounded ingest is exactly this); (c) *blast radius on key compromise* — one leaked key exposes all tenants; (d) *insider/regulatory* — a regulated tenant needs provable data separation and residency.

**Design — defense in depth, three tiers selectable by plan:**
1. **Row-level isolation (baseline, all tenants).** Postgres **RLS** with a session-scoped `tenant_id` set from the verified principal — isolation enforced by the database, not by every developer remembering a `WHERE`. Eliminates the SG-01-class leak structurally. KV namespaces become `tenant:{id}:...` prefixed with a guard that rejects cross-prefix access.
2. **Per-tenant envelope encryption (mid / regulated).** Each tenant's data at rest encrypted under a **per-tenant data key** wrapped by a KMS root (BYOK option for enterprise). Compromise of one tenant key ≠ fleet compromise; deletion of the tenant key = cryptographic erasure (GDPR right-to-delete, §5).
3. **Dedicated store / region (enterprise, residency).** Separate database/schema (and EU region for data residency — Impl-Plan 3.6) for tenants who require physical separation. Same control-plane code, different connection target.

**Noisy-neighbor.** Per-tenant quotas on telemetry ingest (caps the SG-06 unbounded payload), compile credits (already metered), and queue concurrency (the durable queue, §7, is fair-scheduled per tenant). Redis-backed shared rate limits (fixes SG-04) so limits hold across cloud instances.

→ *Impl-Plan: 3.6 (data residency), supports 3.1 (org-scoped everything).*

---

## 4. Governance — change management & sign-off for skills AND repairs

This is where Conxa **matches RPA-grade governance** while keeping the deterministic edge. Two governed flows:

**(a) Publish governance.** A `skill.publish` is a *proposal* until approved when the tenant's policy requires it. Configurable per-tenant: `auto` (publish on push), `single-approver`, `dual-control` (segregation of duties — publisher ≠ approver, a SOC2 favorite). Approval, diff, and approver identity are audit events (§2). Maps to **multi-user publishing** (Impl-Plan 3.2) — approval is the governance layer on top of "any admin can publish."

**(b) Durability-repair governance — the novel piece.** The durability flywheel (§6) proposes auto-repairs. **These are governed by the confidence bands from `future-workflow-durability-architecture.md` §3, surfaced as per-customer policy:**

| Confidence band | Default behavior | Regulated-tenant override |
|---|---|---|
| **High** (text/DOM/layout, fleet-corroborated, post-condition-validated) | auto-repair → canary → auto-promote | require `repair.approve` |
| **Medium** (attribute change, fewer corroborations) | auto-propose, customer approval required | always manual |
| **Low / semantic / flow** | review queue (human, Build Studio recompile) | review queue |

A regulated customer can set the auto-band threshold to **"never"** — getting detection + suggestion + validated diff, but *every* application gated by a human with `repair.approve`. The point: **a workflow that heals itself is still fully governed and fully audited.** That is the governance story RPA cannot tell (RPA breaks silently; agents change behavior unpredictably) and the philosophy compliance is exact — AI proposes, deterministic validation gates, human governs application, the signed artifact only ever changes through this lane.

---

## 5. Compliance — SOC2/ISO posture; determinism *simplifies* the audit (Impl-Plan 3.6)

**Posture.** Target SOC2 Type II + ISO 27001. The control plane *produces its own evidence*: access control (§1 RBAC), audit trail (§2 tamper-evident), change management (§4), encryption (§3), data lifecycle (below). The **compliance package** (3.6) is a one-click evidence export: access-control matrix, audit-chain proof, change-mgmt records, sub-processor list, residency attestation.

**Data lifecycle / privacy (3.6).** GDPR deletion API (`workspace`/`run_id` granularity), telemetry opt-out flag in `pack.json`, EU residency tier (§3 tier-3), data-classification map (skill packs = data-only no-PII; telemetry = pseudonymous; **sessions/credentials = never in the cloud at all**).

**The selling point — why deterministic + auditable + local-execution makes compliance *cheaper*:**
- **No credential data in scope.** Auth never leaves the machine (§6) → the cloud's compliance scope **excludes the customer's target-app credentials entirely**. An agent platform that drives the app from the cloud holds those credentials and inherits their entire regulatory burden. Conxa's invariant is a *compliance asset*, not just a security feature.
- **Reproducible audit trails.** A deterministic skill produces the *same* steps every run, each with a verified post-condition (G2). An auditor can replay and confirm. **"The model usually does the same thing" fails a regulator (top-25 #22).** Conxa's "the compiled artifact does exactly the same thing, here is the signed version and the verified outcome log" passes.
- **Bounded, attributable change.** Behavior changes only through the signed-publish or governed-repair lane (§4), every change in the audit chain. Agents have no equivalent of a diff-able, approvable behavior change.

---

## 6. Credential Isolation — preserve the separation, add per-USER identity (SG-13)

**Today (good, keep it):** per-company **sync token** (reads data-only packs) is cryptographically separate from the per-machine **AES-256-GCM session key** (HKDF, OS keychain). A leaked installer (SG-07/08) gives pack read access but **cannot decrypt any session** — the separation is sound and is the spine of the credential-isolation story. **Strengthen, don't replace.**

**Strengthen.**
- **Per-USER runtime identity (the Impl-Plan gap, SG-13).** Today identity is per-company only; `uid` is a spoofable local UUID. Introduce a per-user runtime credential minted at install via the company's IdP (SSO/SCIM, §8/§1): the runtime exchanges an SSO-issued token for a **short-lived, per-user, per-device runtime credential**. This makes execution-outcome audit events (§2) *attributable to a human*, enables per-user entitlement/seat enforcement, and per-user revocation — without ever putting Conxa identity where it can be copied (bound to device, short-lived).
- **Sync-token hardening (SG-08):** runtime exchanges the long-lived installer sync token for a **short-lived scoped token** at startup — leaked-installer blast radius drops from "forever" to "minutes."
- **Secrets handling, restated as guarantee:** target-app credentials live only in the local OS keychain as encrypted `storageState`; `plugin_builder.py`'s auth-exclusion guard stays a hard invariant (CI-enforced); **fix the silent plaintext fallback (SG-11)** — never write `*_raw_state.json`, fail loud. The **never-leaves-machine guarantee is the load-bearing compliance asset** (§5) and must be provable, not just asserted: ship it as an attestation in the compliance package.

→ *Impl-Plan: 3.1 (SSO is the trust root for per-user identity).*

---

## 7. Change Management & Deployment — version history, staged rollout, per-tenant policy

**Version history + rollback (Impl-Plan 3.4 · G9).** Store *every* SkillPackage version (not just latest) as a node in a **version graph** (ideally compiler-CIR snapshots — G10 — for diff-ability). Dashboard timeline; one-click rollback = a version-graph pointer move; delta sync serves the tenant-selected version. **Cryptographically sign every version** (G9 — replaces the bearer sync_token as integrity proof; fixes SG-09's missing artifact signature) and stamp an **app-version compatibility fingerprint** (top-25 #19) so staleness is detectable.

**Staged rollout / deployment policy per tenant.** A new (or repaired) version rolls out **canary → fleet** with auto-rollback on post-condition regression (durability §5). Each tenant sets a **deployment policy**: `auto-apply`, `staged`, or `manual-approval`; pinned-version (regulated tenants freeze on a validated version and accept only governed updates); maintenance windows. This is the RPA-grade release control the enterprise expects, expressed on the signed-artifact model.

**Production hosting & ops (G14 · Impl-Plan 1.3/1.4/1.5).** Off Render free tier → autoscaled multi-instance with **Redis** (shared nonce/rate/session state — fixes SG-04, the in-memory loss class), a **durable job queue** (replaces scaffold `worker.py`; fair-scheduled per tenant) for compile/repair/rollout jobs, and **blob storage + CDN** for installers and packages (replaces base64-in-Postgres; enables true per-file delta sync, signed time-limited download URLs — fixes SG-07). This is table-stakes ops, and it is the **prerequisite substrate for the fleet flywheel at scale.**

---

## 8. Deployment Models — SaaS, on-prem/air-gapped, fleet management

**SaaS (today, hardened per §7).** Multi-tenant control plane, the default.

**On-prem / air-gapped (Impl-Plan 3.3).** The control plane is **coordination-only by design**, which is exactly what makes self-hosting tractable: there is no execution to relocate (it was always local) and no compile to relocate (it was always in Build Studio). Self-hosting moves only the *coordinator*. Ship a **Docker-Compose / Helm self-hosted control plane** (FastAPI + Postgres + Redis + blob + queue), Build Studio points at the customer's endpoint, runtimes sync from it. **Air-gapped:** the only loss is the *cross-tenant* flywheel — so scope it to **single-tenant durability** (the tenant's own fleet still detects/classifies/validates/heals its own drift; it just doesn't learn from other companies). Per-tenant signing keys, customer-held. SSO via the customer's own IdP. This is the "auth/data never leaves our perimeter" deal-closer for the most regulated buyers.

**Runtime fleet management (the High-severity gap · Impl-Plan 2.1 · SG-13).** Runtimes today phone home but the cloud "returns ok and forgets." Build the **Fleet Registry**: `POST /telemetry/runtime-start` + periodic heartbeat with `{runtime_version, companies[], platform, user_id, device_posture}` → durable `runtime_registrations`. Dashboard answers the questions that gate every enterprise POC: *how many installs, which versions, which are stale (>30d), which are unhealthy, who is running what.* Add **device/runtime registration enforcement** (a runtime must be registered + entitled to sync), version-distribution view, and remote **disable/revoke** of a compromised or offboarded device. This is enterprise fleet visibility — *and it is literally the same registry the flywheel needs.*

---

## 9. The Fleet Control Plane — one substrate, two payoffs (the explicit connection)

The central architectural claim: **enterprise fleet management and the durability flywheel (G3) are not two systems — they are two reads of one control plane.** Both require precisely:

| Shared primitive | Enterprise fleet mgmt needs it for… | Durability flywheel (G3/G7) needs it for… |
|---|---|---|
| **Runtime registry + heartbeat** | install count, version distribution, stale/health (2.1) | knowing which installs run which package version, to detect drift across them |
| **Tamper-evident event spine** | audit/compliance (§2) | drift signal = recovery-tier + post-condition telemetry aggregated across installs |
| **Per-tenant isolated stores** | tenant security (§3) | per-skill, per-app-version fleet aggregation without cross-tenant bleed |
| **Signed-artifact distribution + version graph** | governed rollout, rollback (§7) | re-sign + staged push of a validated repair (durability Stage 5) |
| **Policy / governance engine** | deploy & publish policy (§4/§7) | per-customer auto-repair confidence-band policy (§4b) |

So the durability moat (top-25 #1, the only structurally uncopyable asset) and the enterprise-readiness checklist are **funded by the same build**. Sequence the control plane (G14 hosting → registry → event spine → policy engine → signed distribution) and you get fleet management *now* and the flywheel *as telemetry accrues*. This is why G3 was blocked: it needs the control plane the enterprise build produces anyway. **Build the control plane for the enterprise sale; harvest the moat for free.**

---

## 10. Enterprise readiness checklist (prioritized, mapped to blockers & Phase 3)

Priority = (deal-blocking) → (go-live) → (defensibility). "Blocker" from Sales-Blockers.md.

| # | Capability | Maps to | Blocker? | Sales-Blocker / Impl-Plan |
|---|---|---|---|---|
| P0 | **RBAC enforced on ALL routes** (default-deny, audit-only→enforce) | §1 | **Contract** | SB 1.6 · 3.2/3.5 · SG-01 |
| P0 | **Audit log = full lifecycle, tamper-evident, SIEM export** | §2 | **Contract** | SB 2.3 · 3.6 |
| P0 | **Fleet/device registration + visibility** | §8 | **Contract** | SB 2.1 · SG-13 |
| P0 | **Installer + runtime + package code signing** | §7 | **Contract** | SB 2.5 · SG-09 |
| P1 | **Redis shared state (nonce/rate/session)** | §7 | Go-live | SB 1.3/1.5 · SG-04 |
| P1 | **Per-file delta sync + blob/CDN + signed download URLs** | §7 | Go-live | SB 1.4 · SG-07 |
| P1 | **Tenant isolation: Postgres RLS + per-tenant envelope keys** | §3 | Security review | SG-01/05/06 |
| P1 | **Per-USER runtime identity via SSO; short-lived sync token** | §6 | Enterprise | 3.1 · SG-08/SG-13 |
| P1 | **SSO/SAML + SCIM provisioning, group→role mapping** | §1/§8 | Enterprise | 3.1 |
| P2 | **Version history + one-click rollback** | §7 | Go-live | 3.4 · G9 |
| P2 | **Publish governance (dual-control approval)** | §4a | Regulated | 3.2 |
| P2 | **Durability-repair governance (confidence-band policy)** | §4b | Regulated | durability §3 · G7 |
| P2 | **Compliance package (SOC2 evidence, GDPR delete, EU residency)** | §5 | Regulated | 3.6 |
| P2 | **On-prem / air-gapped self-hosted control plane** | §8 | Top-regulated | 3.3 |
| P3 | **Fleet flywheel (drift detect → validated repair → staged push)** | §9 | Defensibility | G3/G7 (the moat) |

Critical path to first enterprise signature is the four **P0** rows (RBAC, audit, fleet registration, signing) — exactly Sales-Blockers' MVSP — but each is now designed as a *control-plane component* rather than a point fix, so the P1–P3 rows and the flywheel reuse the same substrate instead of re-building it.

---

## 11. Philosophy compliance check

✅ **Governed determinism, not autonomy** — every capability governs *recorded, compiled, signed* workflows; nothing here makes Conxa improvise. Auto-repair heals toward *recorded intent*, validated and governed.
✅ **Execution local, cloud coordinates only** — the control plane registers, governs, signs, distributes, and aggregates; it never executes or compiles. On-prem proves the model: only the coordinator relocates.
✅ **Auth/credential isolation is sacred** — sync-token vs session-key separation preserved and strengthened; per-user identity is device-bound/short-lived, never copyable; auth never enters packages or the cloud. The never-leaves-machine guarantee is reframed as a *compliance asset* that shrinks audit scope.
✅ **RPA-grade governance, deterministic edge intact** — approval workflows, dual-control, version rollback, staged rollout, tamper-evident audit, SIEM export all match RPA governance, while determinism + verified outcomes + reproducible audit trails *exceed* what RPA and agents can attest.
✅ **The moat compounds without compromise** — the flywheel ships validated, re-signed, governed packages; the hot path stays zero-LLM; cross-tenant learning is opt-out and absent in air-gapped mode.
**The one deliberate judgment call:** fleet-validated auto-repair shifts some trust to automation — bounded by confidence bands, golden-corpus regression, per-customer "never-auto" override, and full audit. **No violations.**
