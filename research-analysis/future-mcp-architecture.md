# Conxa Future MCP Architecture (24-Month Target)

**Scope:** the MCP boundary of the local Node runtime — the protocol seam, the tool surface advertised to the host model, entitlement-gated discovery, the structured human-handoff response, and the security properties of the closed-world surface. Design-only; no code.
**Grounding:** current-state §10 (MCP) + cross-cutting finding; gap-analysis **G11** (ServerBackend seam + entitlement filtering + handoff tool); master-insights-v2 / top-25 **#5** (closed-world skill server; adopt playwright-mcp's harness, INVERT the tool philosophy), **#20** (entitlement filtering), **#17** (CALL_USER/handoff first-class), **#21** (one-schema-three-consumers, in-band errors); high-value-repo-review (Playwright MCP — architecture MODEL, tool-philosophy ANTI-MODEL); actual `runtime/server.js`.
**Seam discipline:** how a *step* runs is owned by `future-runtime-architecture.md`; how *recovery* heals is owned by `future-recovery-architecture.md` (Stage 7 produces the handoff this doc renders). This document owns only the **protocol boundary** and hands off at two clean seams: `backend.callTool → StepEngine` and `Recovery.Stage7 → handoff response`.

## 0. Thesis the MCP layer must finally deliver

Conxa's MCP design is **philosophically correct and ahead of the field** (current-state §10): it exposes a small **closed-world verb set** (`execute_skill`, …) instead of playwright-mcp's ~50 open-world atomic primitives, so the host model never decides what to click — determinism, auditability, and licensing all flow from that one choice. But the *engineering* trails the concept: `server.js` is a **1043-line monolith** that mixes protocol plumbing, browser lifecycle, self-update, recovery-payload construction, and telemetry in one file (`_handleTool` dispatch at L655, `execute_skill` handler L740–1002, ad-hoc L4/L5 recovery payload builder L575–652, dynamic per-skill tools L424/L530). There is **no `ServerBackend` seam**, **no entitlement filtering** (`list_skills` L660 returns every installed skill regardless of license), and the recovery escalation is an **untyped text+image dump** ("Layer 4 — vision recovery" / "Layer 5 — intent recovery" string labels) rather than a structured handoff state. The mandate is narrow and total: **keep the closed-world philosophy exactly as-is, adopt playwright-mcp's harness architecture wholesale, and add the three things it lacks — entitlement filtering, machine-readable safety annotations, and a first-class handoff response.**

**Hard invariants carried forward (reject any violation):** closed-world verbs only — never expose atomic browser tools to the host model; runtime deterministic, zero-LLM hot path; the cloud never executes; **stdio-only** transport (Claude Desktop) — HTTP/SSE multi-session transport is rejected as a runtime concern; auth/session state never crosses the MCP boundary to the host; auth files never enter packages; Conxa is **not an agent**.

## 1. The closed-world inversion (the non-negotiable)

playwright-mcp is an **anti-model for tool philosophy and a model for architecture** — the entire design rests on holding those two facts apart.

| | playwright-mcp | Conxa (keep) |
|---|---|---|
| Unit of execution exposed to LLM | ~50 **atomic** primitives (`browser_click`, `browser_type`, …) | a **closed-world verb** (`execute_skill`) |
| Who decides what to click | the **model** (`openWorldHint: true`) | the **compiled skill** — resolution stays *inside* the package |
| Determinism | surrendered to the model | structural property of the runtime |
| Licensing / audit | impossible (open surface) | natural (a skill is a licensed, signed unit) |

**Skill packs, not atomic tools, are the unit of execution.** Element resolution — late-bound identity, live fingerprint scoring, frame-chain resolution, the deterministic recovery ladder — lives **entirely inside the compiled skill and its runtime engine**, never on the wire. The host model's only verb-level decision is *which skill to run with which inputs*; everything after `callTool` is deterministic. This is insight #5's inversion: **adopt the harness, drop `openWorldHint`, keep resolution inside the skill.** Any proposal to expose a `browser_click`-style tool to the host model is a philosophy violation and is rejected on sight — it would push non-determinism onto the model, the exact mistake Conxa was built to avoid.

## 2. Decompose the monolith — the ServerBackend seam (G11, #5)

Replace hand-wired SDK request handlers with playwright-mcp's three-layer separation. **Protocol plumbing must never import domain logic** — the harness must not be able to `require` a browser.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HOST: Claude Desktop (the model)        ── MCP stdio (JSON-RPC, 1 session) │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  ListTools / CallTool / (sampling ↑)
┌────────────────────────────────▼─────────────────────────────────────────┐
│ (A) HARNESS  — transport + lifecycle + lock + heartbeat                    │
│     stdio ONLY. Domain-agnostic. Owns ListTools/CallTool routing, the     │
│     single execution lock, in-band error wrapping, lazy backend create.   │
├──────────────────────────────────────────────────────────────────────────┤
│ (B) REGISTRY — declarative tool records (DATA, not code)                   │
│     {name,title,description,inputSchema(zod),type,capability,annotations}  │
│     entitlement-filtered into the advertised surface; per-skill tools.    │
├──────────────────────────────────────────────────────────────────────────┤
│ (C) BACKEND  — per-connection execution state (ConxaBackend)              │
│     {initialize, callTool, dispose}. Holds skill index, auth manager,     │
│     browser handle, tracker. The ONLY layer that knows skills exist.      │
├───────────────┬──────────────────────────────────┬───────────────────────┘
                │ constructs                         │ on escalation
┌───────────────▼───────────────┐   ┌───────────────▼───────────────────────┐
│ (D) STEP ENGINE (runtime doc) │   │ (E) RECOVERY ORCHESTRATOR (recov. doc) │
│ Resolver·Gate·Executor·       │──▶│ T1/T2 zero-LLM ▸ T3/T4 host-sampling   │
│ Verifier·Telemetry            │   │ ▸ Stage 7 → structured handoff response│
└───────────────────────────────┘   └────────────────────────────────────────┘
```

**(A) Harness** — generic `Server`; owns transport (stdio only), `ListTools`/`CallTool` dispatch, the **single execution lock** (today's `activeExecution`, L181/L756 — keep, one execution per machine), **lazy backend create** (browser context built once on first `callTool`, not at boot), **in-band error wrapping** (every throw becomes `{ isError, content:[text] }` — never a transport exception; #21), and **backend reset on close** (if a result carries `isClose`, dispose and re-create on next call — survives a browser crash). Imports no browser, no skill loader.

**(B) Registry** — each tool is a **data record** `{ name, title, description, inputSchema, type, capability, annotations }`. `inputSchema` is a single zod-equivalent definition that is the **one source of truth → three consumers**: JSON Schema on the wire, parse-at-boundary validation inside the backend, and types in the handler (#21). The static closed-world verbs and the dynamic per-skill tools (today `_skillToolDefinitions` L424) are both registry entries; listing is a **pure function of the entitlement set** and needs no backend.

**(C) Backend** (`ConxaBackend`, per-connection) — `initialize(clientInfo)` reads host capabilities (esp. whether **sampling** is available — gates autonomous T3), resolves `CONXA_DIR`/skill index, prepares the auth manager. `callTool(name,args,signal)` parses args at the boundary, enforces the integrity + semver gates (L765/L776, keep), constructs the `StepEngine`, runs it, and renders the result or the handoff response. `dispose()` tears down the browser. **Cancellation maps to the MCP request `signal`** — `cancel_execution` (L690) and the `AbortSignal` are unified, so host-initiated cancel and tool-initiated cancel are one path.

This is a **refactor, not a rewrite**: the existing `_handleTool` branches become backend methods; the recovery payload builder becomes the handoff renderer; the harness is new but thin.

## 3. The future tool surface

A **stable, small, closed-world** verb set plus entitlement-filtered per-skill tools. `type` drives MCP annotations; `capability` drives entitlement filtering.

| Tool | Status | `type` / annotation | Notes |
|---|---|---|---|
| `list_skills` | keep, **entitlement-gate** | readOnly | advertises ONLY licensed skills (§4) |
| `get_skill_inputs` | keep | readOnly | input schema for one skill |
| `execute_skill` | keep | action (annotated per-skill, §5) | the core verb; `watch`, `inputs`, `resume_from` |
| `execute_sequence` | keep | action | ordered skills, one browser session |
| `cancel_execution` | keep | action, idempotent | unified with request `AbortSignal` |
| `get_execution_status` | keep (first-class) | readOnly | step/total/elapsed; non-blocking |
| `get_runtime_status` | keep | readOnly | versions, chromium rev, pending update |
| `refresh_skills` | keep | action | force re-sync + re-list |
| `skill_{company}_{slug}` | keep (dynamic) | action, per-skill annotation | direct intent routing, no discovery round-trip; entitlement-filtered |
| **`resolve_handoff`** | **NEW** | action | host's reply to a `pause/handoff` response (§6): `re-authenticated` \| `confirmed` \| `cancelled` \| `corrected{resume_from}` |
**Rejected (philosophy violations, never added):** any atomic browser verb (`click`, `type`, `navigate`, `screenshot-and-act`); any tool that returns a live page handle or session to the host; any HTTP/SSE transport tool. Conxa's surface is **stable** precisely because it is closed-world: skills churn behind `list_skills`; the verb set does not.

## 4. Entitlement filtering — capability filtering becomes licensing (#20, G20)

playwright-mcp filters tools by *capability* via config (`tool.capability.startsWith('core') || config.capabilities.includes(...)`). Conxa **generalizes capability filtering into entitlement filtering**: the advertised surface is a pure function of **what the customer is licensed for**, gated by the **per-company sync token** already embedded in `pack.json` (TRD §5.4).

- `list_skills` and the dynamic `skill_*` tools advertise **only entitled (company, skill) pairs**. A skill present on disk but whose license has lapsed is **not advertised and not callable** — the host model cannot even name it.
- Entitlement is evaluated at **list time and re-checked at call time** (a license can expire between discovery and execution). Cloud is the source of truth; the runtime caches an entitlement set keyed by company, refreshed on the cold-start sync (L398) and on `refresh_skills`. **Offline default = last-known entitlement** (fail-closed on expiry, not fail-open).
- This is a **genuine improvement over playwright-mcp**, which has no licensing model in its tool surface. It is also the enforcement point that makes *signed packs + audit* an enterprise story rather than a slogan: the only skills a runtime will run are the ones the company token authorizes.

`server.sendToolListChanged()` (already wired, L405) fires whenever the entitlement set changes (sync, license update, revocation) so the host re-lists — revocation propagates without a restart.

## 5. Machine-readable safety annotations from compile-time `destructive_semantics`

Today every tool is undifferentiated; the host cannot reason about blast radius. The future surface attaches **per-skill MCP annotations derived at compile time** from `destructive_semantics.py`:

- `readOnlyHint` — skill only reads (reports, lookups) → host may run without confirmation.
- `destructiveHint` — skill performs irreversible writes (delete, pay, submit-irreversible) → host SHOULD confirm with the user first; runtime ALSO rule-escalates (recovery Stage 6).
- `idempotentHint` — safe to retry/resume.
- `requiresConfirmation` — Conxa-specific: the compiler flagged a sensitive step; pairs with the rule-triggered handoff (§6).

These are **compiled, not inferred at runtime** — the compiler already classifies destructive semantics, so the annotation is a deterministic projection of an existing artifact onto each registry record (and onto the per-skill `skill_*` tool). Note the deliberate inversion of playwright-mcp: its annotations carry `openWorldHint: true` (the model drives); Conxa **drops `openWorldHint`** entirely (the skill drives) and uses only the read/destructive/idempotent hints. Annotations advise the host; they never replace the runtime's own deterministic rule-escalation — defense in depth.

## 6. The recovery / escalation seam — a first-class handoff response (#17, G1)

Today escalation is an **ad-hoc payload** (`_buildFailureResponse`, L575–652): a screenshot, a reference image, a 50-element DOM digest, and the string labels "Layer 4 — vision recovery" / "Layer 5 — intent recovery", returned as plain text+image and *hoping a human resumes*. There is no structure, no typed action, no unattended path. Replace it with a **first-class, structured handoff state** that the recovery subsystem's **Stage 7** produces (`future-recovery-architecture.md` §Stage 7).

**Structured handoff response** (rendered by the backend, in-band, `isError`-free — a handoff is a *valid* terminal state, not a crash):
```
handoff {
  reason:        auth_required | confirm_destructive | ambiguous | recovery_exhausted | captcha_2fa
  trigger:       rule_initiated | recovery_exhausted        // deterministic & auditable
  skill, company, intent, failure_class, failed_step
  attempted:     [ {tier, mechanism, outcome} ... ]         // per-tier audit trail
  evidence:      { som_screenshot, ax_digest, viewport }    // structured, not prose
  resumable_action: resume_from:N | re-authenticate | confirm | abort
}
```
The host replies via **`resolve_handoff`**, closing the loop deterministically instead of relying on the model to re-invoke `execute_skill` with the right `resume_from` guessed from prose.

**Two trigger classes (deterministic, not model-initiated — the enterprise distinction vs UI-TARS's model-initiated CALL_USER):**
- **Rule-initiated** — a `destructiveHint`/`requiresConfirmation` skill pauses *before* acting, every time, regardless of recovery success. Auditable policy, not vibes.
- **Recovery-exhausted** — all viable tiers tried, no validated repair (recovery Stage 6).

**The MCP-sampling channel (zero paid runtime API).** Autonomous Tier-3 recovery reaches an LLM **without Conxa paying for inference**: the runtime issues an **MCP `sampling/createMessage`** request *up* to the host model (the same Claude already attached to Claude Desktop), asking it to **describe-then-match** a target (emit a *description*, not a selector; a deterministic matcher resolves it against the live AX tree — recovery doc T3). This preserves "runtime uses AI minimally / never calls a paid API" while making unattended recovery autonomous. **Capability-gated:** the backend records at `initialize` whether the host advertises `sampling`. If present → T3/T4 run autonomously and only truly-stuck states emit a handoff. If absent → the system **escalates cleanly to the handoff response** rather than degrading determinism. The handoff is the safe default; sampling is the autonomous upgrade.

## 7. Security boundaries — the closed-world surface as a security property

The closed-world surface is not just a determinism choice; it is the **primary security boundary**. What the host model **can** do: enumerate entitled skills, read their input schemas, request execution with inputs, cancel, confirm/resolve a handoff. What it **cannot** do: drive the browser atomically, read or receive a session/cookie/storageState, see auth files, run an unlicensed or unsigned skill, or reach the filesystem outside the data-only skill introspection that `read_skill_files` permits (auth-excluded, audited). **The attack surface is the verb set, and the verb set is small and closed** — a host model (or a prompt-injected one) cannot escalate beyond "run a skill it was already licensed to run."

**Credential isolation at the MCP boundary** (preserves the already-designed separation):
- **Sessions never cross to the host.** `getCachedBrowser` (L846) builds the authenticated context *inside* the backend from the per-machine **AES-256-GCM** encrypted session; on success the raw session is re-saved locally (L945) and **never serialized into any MCP result**. No tool returns cookies, tokens, or storageState. The handoff evidence is a *screenshot + AX digest*, never credential material.
- **Sync token ≠ session key.** The installer-embedded **sync token** (bearer, authorizes *pack delta + entitlement*) is structurally separate from the **per-machine session key** (decrypts *sessions*). A leaked installer/sync token can fetch packs it is entitled to but **cannot decrypt any session** (TRD §5.4.3). The MCP boundary preserves this because **neither secret is ever a tool input or output** — sync token lives in `pack.json` and is used only by `sync.js`; the session key is derived per-machine and used only by `auth_manager`. The host model sees neither.
- **Auth files never in packages.** `plugin_builder.py`'s exclusion guard is upstream of the runtime; the MCP layer adds the reciprocal runtime guarantee: **no code path serializes auth state into a `callTool` result.** Data-only packs in, screenshots/AX-digests out.

## 8. Enterprise deployment

- **One runtime per Claude Desktop, stdio per machine.** No multi-session HTTP transport — rejected as a runtime concern. The single execution lock (one skill at a time per machine) is the correct concurrency model; enterprise scale is *many machines*, not many sessions per machine.
- **Multi-tenant note:** one runtime serves **one machine's installed companies**. A machine may have skills from several SaaS vendors installed; each is isolated by company (separate sync token, separate session namespace, separate entitlement set). There is no cross-company session or credential sharing — tenancy is along the *company* axis, enforced at the entitlement filter and the per-company browser context.
- **Entitlement + signed packs + audit compose into the enterprise control story.** Entitlement filtering decides *what may run*; signed/integrity-gated packs (L765) decide *that what runs is authentic*; the structured handoff + per-tier audit trail + telemetry decide *that what ran is accountable*. An admin can answer "what can this machine do, is it authentic, and what did it do" — the three questions agent tools cannot answer.
- **Revocation is live:** lapse a license in the Cloud → next sync drops the skill from the entitlement set → `sendToolListChanged` → the host can no longer name or call it. No reinstall, no restart.

## 9. Migration path from the monolith (no rewrite, each step shippable)

1. **Carve the harness.** Extract transport/lifecycle/lock/in-band-error-wrapping from `server.js` into a domain-agnostic harness; leave `_handleTool` callable behind it. Pure plumbing move, behavior-identical.
2. **Declarative registry.** Convert `_toolDefinitions` (L456) + `_skillToolDefinitions` (L424) into data records with a single schema source (zod-equivalent) → wire/validation/types (#21). Listing becomes pure.
3. **ConxaBackend.** Move `execute_skill`/`execute_sequence`/status/cancel branches into a per-connection backend with `{initialize,callTool,dispose}`; lazy browser create; cancellation unified with the request signal.
4. **Entitlement filter.** Insert the company-token-gated filter in front of `list_skills` and the `skill_*` advertisement; cache the entitlement set on cold-start sync; fail-closed offline.
5. **Safety annotations.** Project compile-time `destructive_semantics` onto registry records (read/destructive/idempotent/requiresConfirmation); drop `openWorldHint`.
6. **Structured handoff.** Replace `_buildFailureResponse`'s L4/L5 text labels with the typed handoff response + `resolve_handoff`; generalize the auth re-auth window (L904–937, already a clean scoped handoff) as its canonical instance.
7. **Sampling channel.** Wire MCP `sampling/createMessage` for autonomous T3 when the host advertises `sampling`; keep the handoff as the no-sampling fallback.

Steps 1–3 are pure hygiene (G11 engineering debt). 4–5 unlock licensing + host safety reasoning. 6–7 make recovery enterprise-grade. Each lands independently and strictly improves the boundary.

## 10. Philosophy-compliance check

✅ **Closed-world verbs only** — no atomic browser tool is ever advertised; `openWorldHint` is dropped; resolution stays inside the compiled skill (#5 inversion intact).
✅ **Deterministic, zero-LLM hot path** — the MCP layer adds no model call to execution; the only LLM contact is recovery T3+ via **host sampling**, never a paid runtime API.
✅ **Cloud never executes** — entitlement is *checked* against the Cloud; execution is wholly local.
✅ **stdio-only** — HTTP/SSE multi-session transport explicitly rejected; one runtime per machine.
✅ **Credential isolation** — sessions/keys/auth files never cross the boundary; sync-token vs session-key separation preserved because neither is ever a tool I/O.
✅ **Not an agent** — the host chooses *which licensed skill*; the skill (not the model) drives the browser deterministically.
**One judgment call:** autonomous T3/T4 requires the host to advertise `sampling`; where absent, the system escalates via the structured handoff rather than degrading determinism — the safe, fail-closed default. **No violations.**
