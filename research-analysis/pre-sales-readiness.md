# Conxa Pre-Sales Readiness Audit

**Framing:** First **10 paying customers** trusting Conxa with *production* workflows — not enterprise scale, not 10,000 customers. White-glove is acceptable; silent wrong-actions and broken trust are not.
**Author stance:** CTO / VP Eng / Head of Product / Solutions Architect / first CSM, writing for the founder. Brutally honest, grounded in the actual code (`runtime/run.js`, `runtime/server.js`, `conxa_compile/`), not the docs.
**Companion deliverables:** `pre-sales-roadmap.md` (§9), `minimum-sellable-conxa.md` (§11).

---

## The one-paragraph truth

Conxa **demos beautifully and the architecture is right**, but three things that the product *markets* are *not what the code does*: (1) "self-healing" Tiers 3–5 are **not autonomous** — on failure the runtime hands screenshots + a DOM digest back to Claude Desktop and asks a human/Claude to fix the selector and resume, with **no write-back** (the same break recurs next run); (2) marketed **"assertions that validate correct execution" are not wired** (`verifyAssertions()` is dead code) — so a step can do the **wrong thing without erroring**; (3) marketed **conditional logic** isn't in the runtime. For the first 10 customers the **showstopper is not enterprise procurement (RBAC/audit/SSO) — it's silent incorrect execution and unattended non-recovery.** The existing `Sales-Blockers.md` is optimized for passing a security review and *assumes the product works*; that assumption is the actual risk. **Verdict: YES WITH LIMITATIONS** — sell tightly-scoped, supervised, reversible-workflow pilots to hand-held design partners, with honest "assisted recovery" positioning and ~3–4 weeks of reliability/safety/security work first (`minimum-sellable-conxa.md`).

---

## SECTION 1 — Current Reality

### What Conxa can reliably do today
- **Record** browser workflows with broad event coverage and **verbatim iframe-chain preservation** — genuinely strong, best-in-class capture.
- **Compile** a recording into a multi-signal skill package (fingerprints, ranked selectors, intent graph, anchors) — the real moat; it works.
- **Replay deterministically** on the happy path with zero LLM cost, frame-aware resolution, and human-like pacing.
- **Deterministic recovery** for common drift: compiled-selector alternates → a11y role/name → transient retry → fallback selectors → dialog-scope → fuzzy text. This is real and zero-token.
- **Auth-failure self-heal** — detect login redirect → open re-auth window → rebuild session → resume. Production-grade and genuinely useful.
- **Distribute** as a per-user NSIS `.exe` that installs runtime + Chromium and registers MCP; **sync** skill packs (atomically, SHA-256 verified); **self-update** the runtime.
- **Meter & bill** (compile credits, Razorpay, 4 entitlement meters); **audit log** and **device/runtime registration** exist (completed per Implementation-Plan).
- **Credential isolation**: auth files never ship in packages; per-machine AES-256-GCM session key separate from the sync token.

### What Conxa cannot reliably do today
- **Autonomously self-heal.** Tiers 3/4/5 = return context to the host and wait for a human/Claude to fix-and-resume. **Unattended/scheduled runs do not self-heal** — for them, Tier 3+ is effectively failure.
- **Verify it did the right thing.** No independent post-condition check is wired. A click that lands on the wrong element, or a fill into a renamed field, can **succeed silently** and corrupt the customer's data.
- **Persist a fix.** No write-back: a selector Claude repairs at runtime is used once; the package is unchanged; the next run breaks identically. → recurring support load.
- **Handle stochastic page states.** Linear replay only — a cookie banner / interstitial / optional MFA that appears *some* runs breaks the workflow. Marketed "conditional logic" is not in the runtime.
- **Survive aggressive timing.** Primary action timeout is **700ms** with no actionability "stable" gate → timing-class flakiness on slow/animated enterprise SPAs.
- **Run on macOS** in production (Windows-first; Mac is build-script-only).
- **Run vision recovery** — it's a passive screenshot payload, not an actionable tier.

### Marketing Claims vs Actual Capabilities — gap table

| PRD claim (§8) | Reality in code | Gap severity |
|---|---|---|
| "Self-Healing Execution — 5-Tier Recovery … Tier 3 semantic, Tier 4 vision" | T1/T2 deterministic ✅; T3/T4 are **host-delegated payloads**, not autonomous; **no write-back** | **Critical (trust)** |
| "Assertions — expected post-step UI state to validate correct execution" | `verifyAssertions()` **not wired**; only explicit `assert` steps run | **Critical (safety)** |
| "Workflow Editing … add conditional logic" | No conditional/branch execution in runtime | **High** |
| "Multi-signal compilation … selectors ranked by resilience" | True at compile; **runtime ignores the ranking/fingerprint** (tries selectors in array order, no live scoring) | **High** |
| "Skills degrade gracefully rather than breaking hard" | Partly — deterministic ladder helps; but no scoring, no post-condition, silent-wrong-action possible | **High** |
| "Visual fingerprints — screenshot crops for vision-based recovery" | Captured; used only as an image attachment to the host, not an actionable tier | Medium |
| Recording, compile, deterministic replay, sync, telemetry, billing, auth isolation | **Accurate** ✅ | None |

---

## SECTION 2 — Non-Negotiable Requirements (before taking money)

Only requirements that *materially* affect first-10 customer success.

1. **Loud failure / no silent wrong-actions.** A workflow must never quietly do the wrong thing. At minimum, post-condition verification on consequential steps; fail loudly otherwise. *This is the single non-negotiable.*
2. **Honest positioning.** Stop marketing autonomous self-healing, wired assertions, and conditional logic as shipped. Reposition to "assisted recovery." Selling the gap = guaranteed churn + reputational damage.
3. **A supported-workflow profile.** A documented, tested envelope (target apps, action types, reversible/non-destructive, attended vs scheduled) that Conxa is *known* to handle — and a contract that scopes to it.
4. **Supportable failure path.** When a step breaks, the customer (or you) must be able to diagnose and resume without reverse-engineering `run.js`. Error-code UX + a recovery runbook + the resume flow polished.
5. **Installer trust.** Windows code signing (SmartScreen) **and** lock down the currently-public installer download. An unsigned, world-downloadable `.exe` is both a deploy blocker and a security embarrassment.
6. **Baseline access control.** Wire RBAC on publish/upload/delete (any workspace member can currently publish/delete anything).
7. **Cloud availability for the run path.** The LLM proxy + skill sync sit behind the cloud; on Render's free tier, cold starts/ephemerality can stall a customer's first run. Move the *run-critical* endpoints to always-on.
8. **Credential handling proof.** The isolation model is good — but it must be *documented and demonstrable* for a customer's security person (one-pager + the guarantee that auth never leaves the machine).

---

## SECTION 3 — First 10 Customer Checklist

For each: why it matters · risk if missing · customer impact · priority.

### MUST HAVE (no money without these)
| Item | Why | Risk if missing | Customer impact | Priority |
|---|---|---|---|---|
| **Post-condition verification on consequential steps** | Prevents silent wrong-actions | Corrupted CRM/finance data, undetected | Catastrophic; legal/financial harm | P0 |
| **Honest "assisted recovery" repositioning** | Don't sell what isn't built | Discovery = broken trust, churn, refund demands | Loss of the relationship | P0 |
| **Windows code signing + lock public installer download** | Deployability + security | SmartScreen blocks; anyone downloads any installer | Can't install; data-exposure optics | P0 |
| **Supported-workflow profile + scoped contract** | Bound the promise | Customer runs an unsupported flow, blames Conxa | Failed pilot | P0 |
| **Error-code UX + recovery runbook** | Customer can act on failure | Every failure → founder ticket | Support-bound, unscalable | P0 |
| **RBAC on write routes** | Basic access control | Any member publishes/deletes anything | Security-review fail; accidental deletes | P0 |
| **Run-critical cloud endpoints always-on** | First run must work | Cold-start stall on proxy/sync | "It didn't work on day one" | P0 |

### SHOULD HAVE (before go-live / strongly recommended)
| Item | Why | Risk if missing | Customer impact | Priority |
|---|---|---|---|---|
| **Actionability gate + less-aggressive timeout** | Kills timing flakiness | Spurious failures on slow SPAs | Erodes trust run-by-run | P1 |
| **Runtime fingerprint scoring (live)** | Cash in the multi-signal moat | Wrong-element matches | Silent errors (pairs with P0 verification) | P1 |
| **Real per-file delta sync** | Bandwidth/UX | Full-pack re-download each update | Slow updates on customer machines | P1 |
| **Cloud shared state (Redis nonce/rate)** | Multi-instance correctness | Login/rate inconsistencies | Intermittent friction | P1 |
| **Drift detection warning** | Pre-warn on app changes | Silent skill rot | Surprise breakage | P1 |

### NICE TO HAVE (later / upsell)
| Item | Why | Priority |
|---|---|---|
| macOS runtime | Mac teams | P2 |
| Conditional/branch steps in runtime | Handle stochastic states properly | P2 (big later, not first-10 blocker if scoped) |
| Autonomous recovery + write-back | The real differentiator | P2 (post-launch flagship) |
| Vision Tier-4 (actionable) | DOM-hostile surfaces | P3 |
| SSO/SAML, full compliance pack | Enterprise | P3 |

---

## SECTION 4 — Reliability Readiness

| Subsystem | Trust in production? | What must complete first (for first-10) |
|---|---|---|
| **Recording** | **Yes, with scoping** | Document supported interaction types; flag weak ones (typeahead/dynamic grids) as out-of-profile. |
| **Compilation** | **Yes** | Works; just don't promise it's reproducible. Keep compile-credit metering honest. |
| **Runtime** | **Conditional** | Add actionability gate + saner timeout (P1); without it, flaky on slow apps. Otherwise solid on happy path. |
| **Recovery** | **No (as marketed)** | Two gaps: (a) **silent-wrong-action** → must add post-condition verification (P0); (b) **not autonomous/no write-back** → reposition as assisted, and provide a clean resume/runbook. Don't sell unattended self-healing. |
| **Vision** | **No** | It's a passive payload. Don't market it as a working tier. Out of scope for first-10. |
| **MCP** | **Yes** | Closed-world skill server is sound. Add RBAC upstream; formalize the handoff message for support. |

**Bottom line:** Recording/Compilation/MCP are production-trustable. Runtime is trustable *with* the actionability fix. **Recovery is the one that fails the trust test** — not because the deterministic floor is weak (it's good), but because (a) failures can be *silent-incorrect* and (b) recovery beyond the floor needs a human and doesn't persist. Fix the silence, scope the rest, position honestly.

---

## SECTION 5 — Customer Onboarding Readiness

Can a new customer self-serve, without founder involvement?

| Step | Self-serve today? | Gap |
|---|---|---|
| 1. Install Conxa (Build Studio + bootstrap deps) | **Partly** | Works, but unsigned Build Studio/runtime → SmartScreen friction; Windows-only. |
| 2. Connect their platform (auth/record session) | **Mostly** | Clerk PKCE + storageState works; needs a guided "connect your app" walkthrough. |
| 3. Record workflows | **Yes** | Strong — the wedge. |
| 4. Compile workflows | **Yes** | Works; credit reservation flow is wired. |
| 5. Run workflows | **Mostly** | Works on happy path; cold-start cloud + 700ms timing can cause a bad first impression. |
| 6. **Troubleshoot failures** | **No** | This is the hole. On failure the user gets a recovery payload + "resume_from"; non-technical users can't act on it. No runbook, raw-ish errors, no write-back so it recurs. |

**Verdict: not yet fully self-serve. Step 6 requires founder/CSM today.** For first-10 that's *acceptable as white-glove* — but it must be a *deliberate, staffed* model, not a surprise. Minimum fixes: error-code UX mapping, a troubleshooting runbook, a polished resume UX, and a "request a fix" path to you.

---

## SECTION 6 — Support Readiness

Assume **10 customers · 50 workflows · 100 executions/day**.

| Issue | Likelihood | Impact | Risk | Mitigation |
|---|---|---|---|---|
| **Silent wrong-action corrupts customer data** | Medium | Catastrophic | **HIGH** | Post-condition verification (P0); scope to reversible/non-destructive workflows initially; require human-confirm on destructive steps |
| **Workflow breaks on target UI change, recurs every run (no write-back)** | High | High | **HIGH** | Drift warning + fast recompile SLA; you absorb fixes (white-glove); set expectation in contract |
| **Timing flakiness (700ms, no stable gate)** | High | Medium | **HIGH** | Actionability gate + adaptive timeout (P1) |
| **Unattended/scheduled run fails with no one to resume** | High (if sold for unattended) | High | **HIGH** | Don't sell unattended yet; scope to attended runs |
| **Unsigned installer blocked / scares user** | High | Medium | **MEDIUM** | Code signing (P0) |
| **Cloud cold-start stalls first run** | Medium | Medium | **MEDIUM** | Always-on run-critical endpoints |
| **Customer can't interpret a failure** | High | Medium | **MEDIUM** | Error UX + runbook |
| **Skill update re-downloads whole pack / slow** | Medium | Low | **LOW** | Per-file delta (P1) |
| **Login breaks on cloud redeploy (in-mem nonce)** | Low | Low | **LOW** | Redis nonce |

**Support reality:** at 100 exec/day across 50 workflows, **drift + flakiness + silent-error triage will be the daily load**, and with no write-back you'll be **manually re-fixing the same selectors repeatedly**. Staff for hands-on support from day one; cap the number of design partners to what one person can hold (10 is right).

---

## SECTION 7 — Security Readiness

| Area | Finding | Severity |
|---|---|---|
| **Credential storage** | OS keyring (Studio), keytar (runtime); AES-256-GCM session at rest, per-machine HKDF key | OK ✅ |
| **Credential isolation** | Sync token ≠ session key; leaked installer can't decrypt sessions; auth never in packages (enforced) | **Strong ✅** |
| **Local execution** | Runs locally; cloud never executes | OK ✅ |
| **Cloud execution** | N/A (coordination only) — correct | OK ✅ |
| **Installer download fully public** | Anyone with/ guessing the slug downloads the `.exe` | **Critical** |
| **Installer not code-signed** | SmartScreen "Unknown Publisher"; GPO blocks; tamper optics | **Critical** |
| **RBAC unwired** | Any workspace member can publish/delete/upload | **Important** |
| **Telemetry HMAC optional** | Without `SKILL_TRACKING_HMAC_SECRET`, any token accepted | **Important** |
| **Sync token shared across a company's installs** | Read-only pack access if leaked (sessions still safe) | **Minor (documented)** |
| **Rate limit in-memory** | Bypassable across instances | **Minor** |
| **No package signing (bearer token + manifest hash only)** | No publisher signature; tamper integrity weak | Important (defer past first-10 if distribution is controlled) |

**Critical before money:** code signing + lock down installer download. **Important:** wire RBAC + enable telemetry HMAC. The credential-isolation core is genuinely good and is a *selling point* — document it.

---

## SECTION 8 — Product Honesty Audit (brutal)

### Marketed but NOT fully implemented (must stop or qualify)
1. **"Self-Healing Execution — 5-Tier Recovery" with autonomous Tier 3 (semantic) and Tier 4 (vision).** Reality: T3/T4 are **host-delegated context payloads**; recovery is **assisted, not autonomous**, and **doesn't persist**. → Reposition to **"Deterministic recovery + AI-assisted repair."**
2. **"Assertions — validate correct execution."** Reality: **not wired.** This is the most dangerous claim because it implies a safety net that doesn't exist. → Do not claim outcome validation until post-conditions ship.
3. **"Add conditional logic" (Workflow Editing).** Reality: no conditional execution in the runtime. → Remove or mark "coming soon."
4. **"Skills degrade gracefully rather than breaking hard."** Half-true. With no live scoring and no post-condition, they can also **fail silently-incorrect**. → Qualify.
5. **"Visual fingerprints for vision-based recovery."** Captured but not an actionable tier. → Don't imply working vision recovery.

### Implemented but NOT marketed (under-sold; lean in)
1. **Auth-failure self-heal** (re-auth window + resume) — genuinely valuable, barely mentioned.
2. **Credential isolation model** (per-machine key vs sync token; auth never leaves machine) — a real security selling point.
3. **Verbatim iframe-chain preservation** — a hard technical differentiator vs every competitor.
4. **Compile-time intent graph** — "the AI understands the workflow" is real and unique; sell it.
5. **Atomic, SHA-256-verified sync + self-updating runtime** — solid reliability story.

### Should NOT be marketed yet
- Autonomous self-healing / unattended reliability.
- Outcome validation / assertions.
- Conditional logic / branching.
- Vision recovery.
- macOS, enterprise SSO/compliance.

**The honesty fix is mostly free** (rewrite §8/§10 of the PRD and the sales deck) and is the **highest-ROI trust move** available.

---

## SECTION 10 — Launch Decision

### **YES — WITH LIMITATIONS.**

Conxa can take money from a small number of hand-held design partners **if** the launch is scoped to what the code actually does and the safety hole is closed. It **cannot** be sold as "autonomous self-healing, validated, unattended enterprise automation" — that would be selling fiction.

**Exact limitations of a launch-today offer:**
1. **Reversible / non-destructive workflows only** until post-condition verification ships (no irreversible deletes/payments/submissions without human confirm).
2. **Attended / supervised execution only** — not unattended/scheduled (recovery isn't autonomous).
3. **Windows only.**
4. **A defined supported-app + interaction profile**; out-of-profile flows are best-effort, not contracted.
5. **White-glove support included and staffed** — you absorb drift fixes; no self-serve troubleshooting promised.
6. **Positioned as "deterministic replay + AI-assisted repair,"** never "autonomous self-healing" or "validated outcomes."
7. **Design-partner / pilot pricing**, month-to-month, explicit "early access" framing — not annual enterprise SLAs.
8. **Capped at ~10 partners** (support capacity).

**Hard pre-conditions even for this limited launch (the P0 list):** post-condition verification on consequential steps · honest repositioning · code signing + lock installer download · RBAC on writes · error UX + runbook · run-critical cloud always-on. (~3–4 weeks — see `minimum-sellable-conxa.md`.)

---

## SECTION 12 — Founder Recommendation (brutally honest)

**Would I let my own company become a paying Conxa customer today — as-is, unmodified?**

**No — not today, not as currently marketed.** I would not put Conxa on my company's CRM or finance system today because **a step can do the wrong thing and not tell me** (no wired post-condition), and because what was sold to me as "self-healing" would turn out to be "it pauses and asks a human." The first time I discovered either, I'd churn and warn peers. Those two facts — silent-incorrect execution and the marketing-vs-code gap — are renewal-killers and reputation-killers, in that order.

**Would I become a paying *design partner* after ~3–4 weeks of focused work?** **Yes** — and enthusiastically, because the *foundation is genuinely differentiated* (recorder, compiler, intent graph, credential isolation, deterministic replay) and the gaps are *closable, not architectural*. What would need to change before I'd sign:
1. **Make failure loud** — post-condition verification so it never silently corrupts my data. *(The one I'd refuse to sign without.)*
2. **Tell me the truth** — sell me "deterministic replay + AI-assisted repair," scoped to reversible, attended workflows. I'll happily pilot that; I'll never forgive being sold autonomous magic that isn't there.
3. **Sign the installer + lock the download** — so my IT doesn't flag you and I don't worry who else has the binary.
4. **Give me a support path** — a runbook and a human, because I know drift will happen and I want to know you'll fix it fast.

**The honest summary for the founder:** You are **~3–4 weeks of disciplined, mostly-non-glamorous work** away from a *defensible, honest, limited paid launch* — not 6 months. The temptation is to chase the enterprise procurement checklist (SSO, full audit, compliance) the way `Sales-Blockers.md` frames it. **Resist it.** Your first 10 customers won't churn over a missing SSO; they'll churn over a workflow that silently entered the wrong number into their billing system, or over discovering the headline feature is a human in a trench coat. **Fix the silence, tell the truth, sign the binary, staff the support — then take the money.**
