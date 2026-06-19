# The Conxa Future Skill-Pack Architecture — Packaging & Distribution (24-Month Target)

**Author:** Principal Systems Architect
**Scope:** How a compiled skill becomes a *signed, versioned, distributable, self-healing artifact* — packaging, distribution, delta sync, versioning, signing, validation, rollback. Design only — no code.
**Grounding:** current-state §11 (skill packaging) + §12 (cloud), gap analysis G9/G10, top-25 #9/#11/#19/L2/#1, `future-compiler-architecture.md` (CIR, version graph, rollback — packages are *emitted from CIR*), `future-workflow-durability-architecture.md` (Stage 5 re-sign + canary), and actual code: `plugin_builder.py` (data-only + auth guard), `sync.js` (atomic SHA-256 writes), `installer_builder.py` (Authenticode `signtool` already wired for the `.exe`), TRD §5.4–5.8 / §8 / §11.

---

## 0. Thesis & the four defects we are fixing

The packaging layer already *is* the moat in concept (L2, #9): no competitor ships a compiled, distributable, fleet-deployable automation artifact. But four implemented gaps make it enterprise-indefensible today:

1. **No publisher signature.** `sync_token` is a per-company **bearer secret** (`secrets.token_urlsafe(32)`), and the integrity gate checks a **manifest content hash**, not a publisher signature. A bearer token proves *who may fetch*; it cannot prove *who authored* or *that bytes are untampered*. A leaked installer (the public-download gap) hands an attacker read access; a compromised cloud row could serve substituted package bytes that still pass the content-hash gate.
2. **Full-file delta.** The delta endpoint ships **ALL files** on any version change (TRD §5.6/§11.1, "Simplified implementation"). Bandwidth scales with pack size × fleet × publish frequency — and the durability flywheel *wants* frequent, tiny (`IDENTITY_ONLY`) republishes, which this design makes prohibitively expensive.
3. **base64-in-Postgres durability.** Package bytes live as base64 in a KV row, disk as cache (§12). This will not scale to a CDN-fronted fleet and couples package size to DB row limits.
4. **No version graph, no rollback.** Version is a `skill_pack_version` string; there is no history, no parent lineage, no one-click revert. A bad publish or a bad auto-heal cannot be cleanly reverted.

**Design law applied throughout:** *The package is data-only and inert; the cloud hosts and coordinates but never executes; the runtime executes locally and deterministically; the signature is the trust root verified before execution.* Every mechanism below is emitted from the compiler's CIR (per `future-compiler-architecture.md`) and consumed by the durability loop (per `future-workflow-durability-architecture.md`) — this document owns the *artifact contract* between them.

---

## 1. Distribution — NSIS bootstrap + signed packages over a CDN

**Two distinct distribution channels, decoupled (today they are conflated in one `.exe`):**

- **Bootstrap channel (the installer).** The NSIS per-user `.exe` shrinks to a *bootstrap*: it installs `runtime.exe` + `keytar.node` + Chromium, registers the MCP server, and writes a **signed enrollment manifest** (company id, package ids, sync endpoint, **publisher public-key id**, and an enrollment credential). It no longer needs to embed the full pack — first sync pulls it. The `.exe` itself stays Authenticode-signed via the already-wired `signtool` path in `installer_builder.py` (keep). This addresses the **public-installer-download gap**: the installer carries only an *enrollment* credential scoped to read + register; package *authenticity* no longer depends on installer secrecy because every package is independently publisher-signed (§4).
- **Content channel (the packages).** Package files move to **blob storage + CDN** (replacing base64-in-Postgres). Postgres holds only metadata: the **version graph**, per-file content-addressed hashes, signatures, and compat fingerprints. Delta responses return **`content_url` (CDN, content-addressed by SHA-256) + `sha256` + `signature ref`**, never inline base64. `sync.js` already supports `content_url` *and* `content_base64` (lines 131–138) — the future path makes `content_url` the default and base64 a tiny-file fallback. Content-addressed CDN keys (`/blobs/{sha256}`) give free dedup across versions and immutable, cacheable bytes.

**Why this is philosophy-compliant:** the CDN serves inert data files (`execution.json`, `recovery.json`, `inputs.json`, `intent_graph.json`, `compat.json`, `verifiers.json` — no code surface). The cloud *hosts*; it does not execute. The auth-exclusion invariant is untouched — auth files were never in the pack and are not blobs (§6).

---

## 2. Updates — TRUE per-file SHA-256 delta against a version manifest

**Today.** `since=version`; if changed, ship everything. **Future.** The delta endpoint diffs **per-file content hashes** against the version manifest the runtime already holds.

- The runtime sends its current `version_id` (and may send its known `file_hashes{}` map, or the cloud derives the diff from version-graph lineage). The cloud computes `changed = files(target) − files(current, by hash)` and returns **only changed entries**, each `{path, sha256, content_url, signature_ref}`. Unchanged files (the common case for an `IDENTITY_ONLY` heal: one selector bundle changed) transfer **zero bytes**.
- **Atomicity preserved and strengthened.** `sync.js`'s backup → `.tmp` write → SHA-256 verify → atomic rename → restore-on-failure loop (lines 44–164) is the right transaction model — keep it verbatim. Add one gate *before* the rename commits: **verify the package signature over the post-write manifest** (§4). A delta that fails signature or hash verification triggers `restoreSkillBackup` exactly as a checksum mismatch does today — refuse + leave the prior signed version intact.
- **Bandwidth math.** A text-change heal across a 30-file pack drops from ~30 files to 1; a fleet of N installs × frequent durability republishes becomes affordable, which is the precondition for Stage 5 canary rollouts being a *background* event rather than a bandwidth event.

**Runtime self-update coordination (keep as-is).** `runtime.exe` + `keytar.node` + Chromium must stay ABI-consistent; TRD §5.8/§11.3 already stages the three together (`.next` files, detached bat, `keytar_sha256` ABI pin, idempotent `--install-playwright`). This is correct and orthogonal to package delta — **do not merge the two channels.** One addition: the runtime-update manifest should itself be publisher-signed with the same key infrastructure as packages (§4), closing the gap that today the runtime binary update trusts TLS + sha256 but not a signature.

---

## 3. Versioning — semantic version graph driven by the CIR, not a string

The package version is **not authored here** — it is *projected from the compiler's CIR version graph* (`future-compiler-architecture.md` §7). Packaging consumes that graph and stamps the artifact:

- **`version_id` = the CIR `cir_root_hash`'s version node**, with `parent_version_id`, `change_class ∈ {IDENTITY_ONLY, PLAN_CHANGE, INTENT_CHANGE}`, and `model_pins`. The `change_class` drives rollout policy: `IDENTITY_ONLY` (a heal) is canary-safe and runtime-silent-acceptable; `PLAN_CHANGE`/`INTENT_CHANGE` may require re-entitlement or customer approval.
- **Per-file content hashes** in the manifest are the delta unit (§2) and the rollback unit (§5). The manifest is a **Merkle list**; `manifest_root` is what the signature covers (§4).
- **App-version COMPATIBILITY fingerprint** (`#19`, the staleness leading indicator). Each package carries `compat_fingerprint = {app_build_id?, dom_skeleton_hash, route_signature, framework_hints, recorded_at}`, captured at record time and pinned in the CIR. It travels in `compat.json`. Two consumers:
  - **Runtime, pre-execution:** compare the package's `compat_fingerprint` against the live app's observed fingerprint. Divergence ⇒ the package is **stale vs the live target** ⇒ refuse-or-warn + emit a drift telemetry event *before* a stale selector silently fails (this is the validation gate of §5 of durability, the earliest leading indicator).
  - **Cloud, fleet-level:** divergence across ≥K installs is a confirmed `DriftEvent` feeding the flywheel (durability Stage 1). The compat fingerprint is the **single most valuable field this package adds** for durability — it converts "a selector broke" into "the app moved, predicted."

---

## 4. Security — cryptographic publisher signing (not a bearer token + content hash)

**The core upgrade.** Replace "integrity = manifest content hash" with "**integrity = publisher signature over the Merkle manifest root**." The two coexist; signing subsumes and strengthens the hash gate.

**Signing model.**
- **What is signed:** the **manifest root** (`H(sorted per-file sha256 ∥ version_id ∥ change_class ∥ compat_fingerprint ∥ cir_root_hash)`). Signing the manifest root transitively authenticates every file (each file's hash is in the manifest) and the version lineage — without re-signing on every delta. Algorithm: Ed25519 (small signatures, fast verify on the runtime hot-adjacent path).
- **Who signs:** the **Conxa publishing service** signs on behalf of the publishing company at publish time *and* on every durability re-sign (Stage 5). Signing is a cloud governance function — it is *not* compilation and *not* execution, so it does not violate the cloud-coordinates-only invariant. (A future enterprise tier can support **customer-held co-signing keys** for publishers who require their own root of trust; the artifact supports a signature *list*, enabling Conxa-sign + customer-co-sign.)
- **Key management.** Publisher signing keys live in a cloud KMS/HSM, never on disk in the clear, rotated on a schedule. The runtime ships a **pinned set of Conxa root public keys** (in the signed installer bootstrap, §1) plus a key-id → public-key map refreshed via a signed `keyset.json` (key rotation without reinstall; old keys remain valid for verifying already-installed versions until their packages are re-signed). `key_id` is carried in the signature block so the runtime selects the right public key.
- **`sync_token`'s role shrinks, correctly.** It remains a *fetch authorization* bearer credential (entitlement: "this install may pull this company's packages"), which is what it is good at. It stops being mistaken for an integrity/authenticity mechanism. Authenticity is the signature; authorization is the token; the per-machine AES-256-GCM session key (§5.4.3) stays fully decoupled (a leaked installer still cannot decrypt sessions, and now also cannot forge a package).

**Verification at runtime, before execution (extend the existing integrity gate).** The runtime's existing integrity gate (manifest-hash check) becomes a **three-clause gate**, evaluated at load and before each `execute_skill`:
1. **Signature valid** — Ed25519 verify of `signature` over `manifest_root` using the pinned key for `key_id`.
2. **Integrity intact** — every on-disk file's SHA-256 matches its manifest entry (today's check, retained, now *under* the signature).
3. **Compatibility fresh** — `compat_fingerprint` not diverged past threshold from the live target (§3).

**How signing coexists with data-only + auth-exclusion.** Signing operates over the *manifest of inert data files*; it adds no executable surface. The auth-exclusion guard (`plugin_builder.zip_plugin` / `_write_skill_packs_format` — **keep the `auth/auth.json` + `credentials*` exclusion**) runs *before* manifest computation, so auth files are never hashed, never signed, never blob-stored, never CDN-served. Signing makes the auth-exclusion invariant *auditable*: the signed manifest is a positive attestation of exactly which files the package contains.

---

## 5. Validation & Rollback — gates on mismatch; version-graph revert tied to the canary

**Validation (on mismatch ⇒ refuse + trigger re-sync, as today, made stronger).**
- **Signature mismatch** ⇒ refuse to load the package; do **not** execute; restore prior signed version (`restoreSkillBackup`); emit a tamper/`sig_fail` telemetry event (a security signal, escalated, not just a sync retry).
- **Integrity (file-hash) mismatch** ⇒ exactly today's behavior: discard `.tmp`, restore backup, re-trigger delta sync (the bytes were corrupted/incomplete).
- **Compatibility mismatch** ⇒ refuse-or-warn per policy + emit `DriftEvent`; the fleet's response (auto-repair → re-sign → canary) is the durability loop. The package is the *trigger*, not the fixer.

**Rollback (version-graph, one-click, byte-identical).** Because every version is an immutable, content-addressed node with a `parent_version_id` and a stored manifest+signature, rollback is **"re-point the install's target `version_id` to N−k and delta-sync."** Reproducible compiles (compiler §9) guarantee byte-identity, so rollback ships only the files that differ between current and N−k — fast and exact. Three rollback surfaces:
- **Publisher one-click revert** (dashboard): a bad `PLAN_CHANGE` publish reverts the fleet to the last good signed version; the prior signature is reused (no re-sign needed — the bytes and manifest are unchanged).
- **Durability canary auto-rollback** (durability Stage 5): a re-signed heal is canaried to a fraction of installs; if their post-condition/recovery telemetry regresses, the cloud **auto-reverts the canary cohort to the parent version** and routes the heal to the human review queue. Rollback is a version-graph edge traversal, not a recompile.
- **Safe republish of a heal** (top-25 #11, no in-place mutation). A runtime-discovered healed signal is *ephemeral for the current run* and emitted as telemetry; the cloud applies it as a **CIR patch → new child version → re-sign → canary**. The signed local artifact is **never silently rewritten** — this is the property competitors with mutable local caches structurally cannot offer.

---

## 6. Conceptual future pack manifest / schema (not code)

```
pack.json  (company root — coordination metadata, signed-by-reference)
 ├─ company, company_display
 ├─ sync_endpoint                 # CDN-fronted delta service
 ├─ sync_token                    # FETCH AUTHORIZATION ONLY (bearer; not integrity)
 ├─ publisher_key_id              # which pinned public key verifies this company's packages
 ├─ current_version_id            # head of the version graph for this install
 ├─ version_graph_ref             # → cloud version-graph for this company's packs
 └─ tracking { ... }              # unchanged

manifest.json  (per package/version — THE SIGNED OBJECT)
 ├─ version_id, parent_version_id, change_class            # from CIR version graph
 ├─ cir_root_hash                                          # provenance to the compile
 ├─ compat_fingerprint { app_build_id?, dom_skeleton_hash,
 │                       route_signature, framework_hints, recorded_at }
 ├─ files[] : { path, sha256, size, content_url }          # per-file content hashes → delta unit
 ├─ manifest_root : H(sorted file sha256 ∥ version_id ∥
 │                    change_class ∥ compat_fingerprint ∥ cir_root_hash)
 └─ signatures[] : { key_id, alg: "ed25519", sig(manifest_root), signed_at, signer:"conxa"|"customer" }

Per-skill files (inert data, hashed + covered by manifest signature; NO code surface)
 execution.json · recovery.json · inputs.json ·
 intent_graph.json · compat.json · verifiers.json · visuals/*

NEVER in manifest/blobs/CDN:  auth/auth.json, auth/credentials*   (guard kept in plugin_builder)
```

## 7. sign → publish → delta-sync → verify → execute (flow)

```
BUILD STUDIO (local)                CONXA CLOUD (coordinate, host — never execute)        RUNTIME (local, deterministic)
────────────────────                ──────────────────────────────────────────────       ──────────────────────────────
compile → CIR → emit pack files
   │  (auth-exclusion guard runs here — auth never enters output)
   ▼
compute per-file sha256 →
build Merkle manifest_root
   │  POST /publish {files, manifest, version_id, parent, change_class, compat_fp}
   ▼
                                    (1) store file blobs → BLOB/CDN (content-addressed /blobs/{sha256})
                                    (2) write version-graph node {version_id, parent, change_class}
                                    (3) SIGN manifest_root with publisher key (KMS/HSM) → signatures[]
                                    (4) mint/reuse sync_token (fetch authz); return signed manifest
   │  (installer bootstrap signed via signtool; ships enrollment + publisher_key_id)
   ▼
                                                                                          cold start → syncSkillPacks()
                                    GET /delta?since=version_id  (Bearer sync_token)  ◀──── read pack.json → sync_token
                                    diff per-file hashes → return ONLY changed:
                                      [{path, sha256, content_url, signature_ref}]   ────▶ download changed blobs from CDN
                                                                                          backup → .tmp write → SHA-256 verify
                                                                                          ┌─ VERIFY GATE (pre-commit, pre-execute) ─┐
                                                                                          │ 1 signature: ed25519(manifest_root,key)  │
                                                                                          │ 2 integrity: each file sha256 == manifest│
                                                                                          │ 3 compat:    compat_fp ≈ live app        │
                                                                                          └──────────────────────────────────────────┘
                                                                                          pass → atomic rename → bump version_id
                                                                                          fail → restoreSkillBackup + refuse + emit
                                                                                                 (sig_fail | hash_fail | drift)
                                                                                          ▼
                                                                                          execute_skill — deterministic, ZERO LLM
                                    ◀──── telemetry (recovery tiers, post-cond, compat drift) ──────┘
                                    DriftEvent → repair → CIR patch → re-SIGN child version → CANARY ↺ (auto-rollback on regress)
```

---

## 8. The package as the moat — why this is uncopyable by agent/local tools

- **Signed + versioned + distributable** makes automation a *supply-chained product* (L2, #9): auditable (a regulator verifies the signature and the manifest of exactly-which-inert-files), licensable (entitlement-gated fetch), and governable (publisher revert, customer co-sign). An agent that re-decides each run has **no artifact to sign** — there is nothing stable to attest to.
- **Self-healing via the fleet** (not via the local cache) is the compounding asset (#1). One install detecting drift → cloud validates → re-signs an `IDENTITY_ONLY` child → canaries → fleet is fixed *before* others hit it. This requires **the same signed artifact distributed to many tenants with central telemetry** — structurally impossible for single-tenant/local tools and for live agents (each run is bespoke; nothing to aggregate, nothing to push). The per-file delta (§2) is what makes these frequent tiny republishes affordable; the version graph (§3) is what makes them safe; the signature (§4) is what makes them trustworthy. The three combine into a property no competitor can retrofit onto a live-agent architecture: **determinism that improves over time without ever surrendering its signature.**

---

## 9. Migration path from today's `sync_token` + full-file delta

Additive and reversible; each step ships independently.

1. **Per-file delta first (no signing yet).** Implement the per-file SHA-256 diff in `skillpack_update_routes.py` against a stored `file_hashes{}` manifest; `sync.js` already verifies per-file SHA-256 and supports `content_url` — wire the manifest, keep base64 as fallback. Immediate bandwidth win; zero security change. (Closes the "ships all files" gap.)
2. **Blob/CDN backing.** Move package bytes from base64-in-Postgres to content-addressed blob storage; delta returns `content_url`. Postgres keeps metadata only. (Scalability prerequisite for the fleet.)
3. **Version graph.** Persist publishes as version-graph nodes `{version_id, parent, change_class, file_hashes}` projected from the CIR (compiler §7). Add publisher one-click rollback (re-point + delta). No crypto yet.
4. **Manifest signing (shadow).** Cloud signs `manifest_root`; runtime *verifies but does not yet enforce* (log-only), proving the pipeline end-to-end. Pin Conxa root keys into the signed installer bootstrap; ship `keyset.json` rotation.
5. **Enforce the three-clause gate.** Flip signature + integrity + compat to *blocking* at load/execute. `sig_fail` ⇒ refuse + restore + escalate. `sync_token` is now documented and used as fetch-authorization only.
6. **Durability re-sign + canary.** Wire Stage 5: CIR-patch heal → re-sign child → canary cohort → auto-rollback on regression. Now signing, delta, version graph, and rollback are one closed loop.

`sync_token` is never removed — it is *demoted* from "the security model" to "the fetch credential," which is what it always was.

---

## 10. Philosophy-compliance check

| Principle | Compliance |
|---|---|
| **Packages are DATA-ONLY (no executable surface)** | ✅ Every signed/delta'd/CDN-served file is inert JSON/asset; the signature covers a manifest of data files. No code is added, shipped, or signed. |
| **Auth files NEVER in packages (hard invariant)** | ✅ `plugin_builder` auth-exclusion guard runs *before* manifest hashing — auth files are never hashed, signed, blob-stored, or served. Signing makes the exclusion *positively auditable*. Per-machine AES session key stays fully decoupled. |
| **Cloud hosts/coordinates, does NOT execute** | ✅ Cloud stores blobs, computes deltas, holds the version graph, and *signs* (governance). Signing/hosting/diffing are coordination, not execution. No compilation moves to cloud either. |
| **Runtime executes locally & deterministically; zero LLM in hot path** | ✅ Signature/integrity/compat verification are pure deterministic checks (Ed25519 + SHA-256 + fingerprint compare). No LLM is introduced at sync or execute. |
| **Not an agent / RPA** | ✅ The unit distributed is a closed, compiled, signed artifact replayed deterministically. Self-healing is fleet-validated re-signing toward *recorded intent* — never improvised local behavior. |
| **Anti-patterns rejected** | ✅ No in-place mutation of a signed package — heal = telemetry → CIR patch → re-sign child (#11). No bearer-token-as-integrity — authenticity = publisher signature; the token is authorization only. No content-hash-as-trust — the hash is now *under* the signature and *beside* the compat fingerprint. |

---

**Summary.** This design turns Conxa's already-differentiated skill pack into an enterprise-defensible artifact by adding three things the code lacks — publisher Ed25519 signatures over a Merkle manifest root (replacing bearer-token-plus-content-hash as the trust model), true per-file SHA-256 delta over CDN-backed content-addressed blobs (replacing full-file delta and base64-in-Postgres), and a CIR-driven semantic version graph with one-click rollback (replacing a version string) — all stamped with an app-version compatibility fingerprint that is the leading staleness signal feeding the durability flywheel. The runtime's existing atomic-sync + integrity gate is extended, not replaced, into a three-clause pre-execution gate (signature → integrity → compatibility) that refuses-and-restores on any mismatch, while the cloud's role grows only to *governance* (host, diff, sign, version, canary-rollback) and never to compilation or execution. The result is the one property no agent or local tool can copy: deterministic automation that is signed, versioned, distributable, and self-healing across a fleet — a supply-chained product, not a live-improvised run.
```
