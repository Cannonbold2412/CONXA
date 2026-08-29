# Audit & Control

**Audience:** Security reviewers, procurement, SOC2/finance/HR buyers, internal engineering.

This document maps Conxa's shipped audit and governance machinery to the questions a
regulated buyer actually asks, and states plainly where the answer is "enforced" versus
"detected." It is a description of what ships today (PROD-18), not a roadmap — items not
yet built are marked **Not built** rather than implied.

---

## 1. "Can the executor delete its own evidence?"

**Short answer: local evidence, yes. Server-side evidence of that run having occurred, no.**

Execution happens entirely on the customer's own machine (see `docs/TRD.md`'s
architecture overview) — Conxa never runs an automation from the cloud. That means local
artifacts (`{CONXA_DIR}/logs/recovery.log`, the run's own memory) are, by construction, on
a machine the customer controls and can delete. What is **not** deletable from that
machine is the record the cloud already has:

- **A run's start is confirmed before any browser action happens.** `runtime/app/server.js`
  fires the `wf_start` telemetry flush immediately after minting a run, and awaits it
  (bounded 2 seconds) at the one seam every surviving code path crosses before opening a
  page. A run that is killed a second later still has a `wf_start` record on the server.
- **A batch that fails to deliver is not lost.** `runtime/app/tracker.js` spills an
  undelivered batch to `{CONXA_DATA_DIR}/logs/telemetry-spill.jsonl` and retries it at the
  next process startup. This is local disk, so it does not survive a customer who deletes
  it deliberately — but an ordinary crash, network blip, or process kill no longer loses
  evidence the way it did before this change.
- **Every batch is cryptographically linked to the one before it.** Each telemetry batch
  carries `seq` (a monotonic counter), `prev` (the previous batch's hash), and `h` — an
  HMAC-SHA256 over the batch, keyed on the workspace's own tracking token. The cloud
  recomputes and verifies `h` on receipt, **before** any per-field truncation, so a hash
  computed over truncated data can never be mistaken for a match. A dropped, reordered, or
  edited batch produces a detectable gap or mismatch, not a silent hole.
- **The server can now be asked "what's missing."** `GET /api/v1/tracking/{workspace_id}/reconcile`
  reports runs started vs. completed vs. abandoned (started, no terminal event, and no
  fresh activity for 10+ minutes) vs. still in flight, plus every run whose chain shows a
  gap or a broken link. This is the direct answer to "did any run's evidence not arrive."

**What this does not do:** it does not stop a customer from never running Conxa at all, or
from disabling their own network before a run and never reconnecting (see §3). What it
does is make every run that *did* execute either fully accounted for, or visibly flagged
as missing — "we ran 14,000 automations" becomes a number the customer's own dashboard can
be asked to reconcile, not just an assertion.

---

## 2. "What stops a run mid-flight, before it acts?"

**Short answer: a signed, cloud-issued policy the runtime checks before opening a browser,
today covering execution-time windows and platform deny-lists.**

A workspace admin sets policy via `PUT /api/v1/tracking/{workspace_id}/policy`:

- **Time windows** — restrict specific skills (by name or glob, e.g. `payroll-*`) to
  specific days and a time-of-day range in an explicit IANA timezone (e.g. "Mon–Fri,
  09:00–17:00, Asia/Kolkata"). A skill matched by no window is unrestricted by this
  policy's window rules — windows are restrictions layered on top of an otherwise-open
  default, not an allow-list, so writing a policy never silently blocks every skill in the
  workspace the moment it's created.
- **Platform deny-list** — a list of hostnames a governed workspace's skills may never
  interact with, checked against every host the run's resolved skill(s) actually target.

The policy document is Ed25519-signed by the cloud using the **same signing key and
verification path** that already signs the runtime's self-update manifest
(`conxa-cloud/backend/app/api/manifest_signer.py`; verified on the runtime side by
`runtime/app/manifest_manager.js::verifyManifestSignature`). This is deliberate: it adds
no new trust anchor. `runtime/app/policy_gate.js` fetches, verifies, and caches the policy
per workspace, then evaluates it in `server.js` **before** the host lock is acquired and
before any browser is opened — a refusal never touches the target application at all.

A refused run gets a specific, actionable message, for example:

> Refused by workspace policy: "payroll-export" may only run on day(s) 1,2,3,4,5 (1=Mon..7=Sun)
> between 09:00-17:00 Asia/Kolkata. It is currently outside every allowed window for this
> skill (policy version 7).

**Rollout is audit-only by default.** A new policy ships with `enforce: false`: the
runtime records what it *would* have blocked (a `policy_block` telemetry event) without
actually blocking anything, so a misconfigured window is caught by the dashboard before it
stops a real run. An admin flips `enforce: true` once satisfied.

**Not built:** require-approval-before-step (a step type that pauses for a human decision
before acting). This needs a human answerer at the pause point — EXEC-13's `ai_review`
step exists and uses this exact pause/resume mechanism, but its answerer is the MCP agent
itself, which would make "approval" self-approval and is not evidence an auditor accepts.
This is deferred until EXEC-21 (human review points, tracked separately in `TODO.md`)
ships a genuine human-in-the-loop answerer.

---

## 3. The honest limit: what local enforcement actually stops

The runtime executes on a machine the customer administers. **Any local file — including
the cached policy — can be deleted, and any environment variable can be set, by someone
with sufficient access to that machine.** No client-side control changes that fact, and
this document does not claim otherwise.

What is genuinely enforceable locally, and why:

| Control | Locally enforceable? | Why |
|---|---|---|
| A policy's own `expires_at` | **Yes** | It's inside the signed document. A customer cannot extend it without the private key — so "delete the cache and keep running" does not work past the policy's own expiry; the run refuses with `policy_expired` instead. |
| The window/deny-list rules themselves, while the cache is present | **Yes**, until it's deleted | The signature stops the rules from being edited; nothing stops the cache file from being removed. |
| "This workspace has a policy at all" | **No**, if the cache is deleted and the network is blocked before the next fetch | A workspace with no reachable cache and no network reports `status: "absent"` and runs unrestricted, identically to an ungoverned workspace. |

**The posture is enforce locally, prove centrally.** Every `wf_start` telemetry event
carries the policy version (and whether it came from a fresh fetch, a cache, or was
absent) the run believed it was operating under. `GET /reconcile`'s policy section is
built specifically to make the undetectable-locally case *visible centrally*: a workspace
the cloud has issued a policy to, whose runs keep reporting no policy, is a workspace whose
machine stopped checking in — and a machine that has stopped phoning home at all shows up
in the existing stale-runtime count on the operations dashboard regardless.

This is the same model regulated software vendors use for endpoint policy generally: a
local agent that a sufficiently privileged administrator can tamper with, paired with a
central system that can tell when it has been. Conxa does not claim the local gate is
tamper-proof; it claims that tampering with it is detectable rather than invisible.

---

## 4. Retention

Per-plan analytics retention (Free: 0 days, Starter: 90, Pro: 365, Enterprise: custom) is
enforced **on read only**, at exactly two call sites in
`conxa-cloud/backend/app/services/tracking.py` (`_visible_run_records`,
`_visible_runtime_registrations`). **Nothing currently deletes telemetry from storage** —
raw event batches for a workspace past its retention window remain in the
`tracking/{workspace_id}` KV namespace; they are simply no longer returned by the queries
the dashboard and this document's own `/reconcile` endpoint use. This is
correctness-complete for the customer-facing promise ("you cannot see data older than N
days") but is not a deletion guarantee. Tracked as `docs/Security.md` SG-16 and `TODO.md`
CLOUD-4 (a write-side prune job); deliberately not built as part of this change, since
adding a delete path to the same change that made evidence more durable is exactly the
combination most likely to destroy evidence by accident.

---

## 5. Who can see what

- **Skill packs are data-only.** Auth files, Playwright storage state, and credentials
  never enter a compiled skill package (`skill_package_builder.py` enforces this) and
  never leave the customer's machine.
- **Telemetry is pseudonymous.** `X-Tracking-Token`-authenticated batches carry a run ID,
  workflow ID/version, runtime version, and an install-ID hash — never target-application
  credentials or page content beyond what a step's own assertion needs.
- **Policy gating requires telemetry.** A workspace with telemetry disabled cannot receive
  a governance policy either, by design — the policy fetch rides the same authenticated
  tracking-token channel as ingest. You cannot govern what you cannot audit.
- **Dashboard and `/reconcile` access is Clerk-authenticated and workspace-scoped**, gated
  at the `ops_tier=full` capability level (Pro/Enterprise) for the reconciliation and
  policy-write routes — the same tier `/drift` already requires.

---

## 6. What an unanswered situation does

| Situation | Behavior |
|---|---|
| A policy fetch fails (network down, cloud unreachable) and no cache exists | Run proceeds unrestricted (`status: "absent"`) — an outage never blocks an ungoverned or newly-governed workspace's ordinary work. |
| A policy fetch fails but a verified, unexpired cache exists | The cached policy is enforced as-is. |
| A policy's signature fails verification | Discarded outright, treated exactly like a network failure — never trusted, never partially applied. |
| A cached policy's own `expires_at` has passed and refresh fails | Every skill in that workspace refuses with `policy_expired` until the policy can be re-verified. |
| A run is refused by policy | The refusal is itself a telemetry event (`policy_block`, `wf_fail` with `fc` set to the refusal code) — a policy block is audited exactly like an executed run. |

---

## 7. Summary for a compliance questionnaire

- **Who ran what:** every run carries a `run_id`, workflow ID + version, and runtime
  version on its telemetry envelope; `GET /api/v1/tracking/{workspace_id}/runs/{run_id}`
  returns the full event timeline.
- **What evidence exists:** a start receipt confirmed before execution begins, a
  cryptographically chained batch stream, and a reconciliation report of what's missing.
- **Who can delete it:** nobody, once it reaches the cloud, short of a direct database
  operation outside normal API access. Locally, the customer — see §3 for exactly what
  that limits and doesn't limit.
- **What happens on an unanswered require-approval step:** not applicable today — this
  step type is not yet built (§2).
- **Data residency / retention:** see §4; write-side deletion is not yet enforced.
