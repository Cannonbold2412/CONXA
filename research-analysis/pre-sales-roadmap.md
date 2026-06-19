# Pre-Sales Roadmap — Work Required Before the First 10 Paying Customers

**Scope rule:** customer-critical work ONLY. No future vision, no nice-to-have architecture, no long-term ideas. If an item doesn't change whether the first 10 customers succeed, trust Conxa, and renew — it's not here.
**Companion:** `pre-sales-readiness.md` (the audit), `minimum-sellable-conxa.md` (the 30-day cut).
**Calibration:** first 10 *supervised, reversible-workflow* design partners on Windows — not enterprise scale.

---

## Sequencing principle

Three gates, in order. Do not start a later gate before the earlier one is true.

```
GATE A — DON'T HARM / DON'T LIE        (before taking any money)
GATE B — DON'T EMBARRASS / DON'T BLOCK (before a customer installs in their environment)
GATE C — DON'T DROWN                   (before the 2nd–10th customer / before "go-live")
```

---

## GATE A — Before taking any money (trust & safety floor)

*Rationale: these are the items whose absence causes data corruption, broken trust, or a contract sold on fiction. Non-negotiable.*

| # | Work | Why customer-critical | Effort |
|---|---|---|---|
| **A1** | **Post-condition verification on consequential steps.** Wire the dead `verifyAssertions()` path: after each consequential step (and every recovered step), check the compiled assertion / a re-read of expected state; **fail loudly** if it doesn't hold. | Stops silent wrong-actions corrupting customer data — the single highest-severity risk. | 5–8 d |
| **A2** | **Honest repositioning.** Rewrite PRD §8/§10 + sales deck: "Deterministic replay + AI-assisted repair," drop autonomous-self-healing / wired-assertions / conditional-logic claims; add a written **supported-workflow profile** + scope language for the contract. | Selling the marketing-vs-code gap = guaranteed churn + reputational damage. Nearly free. | 2–3 d |
| **A3** | **Scope guardrails in product.** Require human-confirm (or block) on destructive/irreversible steps (`destructive_semantics` already classifies them); refuse to run flows outside the supported profile without an explicit override. | Bounds the blast radius until A1 is mature; lets you sell reversible workflows safely. | 2–3 d |
| **A4** | **RBAC on write routes.** `require_role` on publish / installer-upload / delete (owner/admin to write, member to read). | Any member can currently publish/delete anything; basic access control + security-review hygiene. | 3 d |

**Gate A exit:** a workflow cannot silently do the wrong thing; destructive actions are gated; the offer matches the code; writes are access-controlled. **~12–17 dev-days.**

---

## GATE B — Before a customer installs in their environment (deploy & security)

*Rationale: these block or embarrass the install/first-run in a real customer environment.*

| # | Work | Why customer-critical | Effort |
|---|---|---|---|
| **B1** | **Windows code signing** of Build Studio + runtime `.exe` (EV cert + `signtool` step in `installer_builder.py`). | Unsigned → SmartScreen "Unknown Publisher" / GPO block. Dead on arrival in many orgs. | 3 d + cert |
| **B2** | **Lock down installer download.** Replace fully-public slug URL with a tokenized/authenticated download (per-customer link). | Anyone guessing a slug downloads the installer today — security optics + exposure. | 1–2 d |
| **B3** | **Run-critical cloud endpoints always-on.** Move LLM-proxy + skill-sync off the free/ephemeral tier (or add warmers) so first run doesn't cold-start-stall. | A stalled first run = "it didn't work on day one." | 1–2 d |
| **B4** | **Enable telemetry HMAC** (`SKILL_TRACKING_HMAC_SECRET` required in prod). | Without it, any token is accepted on telemetry ingest. | 0.5 d |
| **B5** | **Error-code UX + recovery runbook.** Human-readable failure messages (no raw codes) + a documented "when a step fails, do X" runbook + a polished `resume_from` path + a "request a fix" channel to you. | Step 6 (troubleshooting) is non-self-serve today; this makes white-glove support tractable. | 3–4 d |

**Gate B exit:** the installer is signed and privately distributed, the first run won't stall, telemetry is authenticated, and a failing run is diagnosable + resumable. **~9–12 dev-days.**

---

## GATE C — Before the 2nd–10th customer / production go-live (don't drown)

*Rationale: these prevent the support load and flakiness that compound as you add customers and daily executions.*

| # | Work | Why customer-critical | Effort |
|---|---|---|---|
| **C1** | **Actionability gate + saner timeout.** Add attached→visible→**stable**→enabled before acting; replace the blunt 700ms with a small adaptive budget. | Kills timing-class flakiness on slow/animated SPAs — the #1 spurious-failure source. | 3–4 d |
| **C2** | **Live fingerprint scoring at runtime.** Use the compiled fingerprint to score live candidates + uniqueness gate (instead of array-order). | Reduces wrong-element matches (pairs with A1 to cut silent errors). | 4–5 d |
| **C3** | **Drift-warning signal.** From telemetry/recovery-tier escalation, flag "this skill is degrading — recompile" to the vendor dashboard. | Turns surprise breakage into a heads-up; cuts angry tickets. | 3 d |
| **C4** | **Cloud shared state (Redis): nonce + rate limit.** | Multi-instance correctness; auth/rate consistency under any scaling. | 2–3 d |
| **C5** | **Real per-file delta sync.** | Stop re-downloading whole packs on every update; bandwidth/UX on customer machines. | 3 d |

**Gate C exit:** executions are robust to timing, wrong-element risk is materially reduced, drift is surfaced proactively, and the cloud + sync behave correctly under load. **~15–18 dev-days.**

---

## What is explicitly OUT (not before first 10)

These are real and important — but they do **not** gate the first 10 supervised design partners, so they stay out of this roadmap:
- Autonomous recovery + healed-selector **write-back** (the flagship differentiator — post-launch).
- Conditional/branch steps in the runtime (scope around stochastic states for now).
- Vision Tier-4 (actionable).
- macOS runtime.
- SSO/SAML, compliance package, package cryptographic signing, full tenant isolation.
- The fleet drift-detection flywheel.
- Compiler IR / reproducible compiles.

(All of these live in the 24-month program: `master-recommendations.md`, `final-cto-report.md`.)

---

## Timeline & staffing

| Gate | Dev-days | With 1 eng | With 2 eng (parallel) |
|---|---|---|---|
| A (trust/safety) | 12–17 | ~3 wks | ~1.5 wks |
| B (deploy/security) | 9–12 | ~2 wks | ~1 wk (parallel with A) |
| C (don't drown) | 15–18 | ~3.5 wks | ~2 wks |
| **To first paid pilot (A+B)** | **~21–29** | **~5 wks** | **~3 wks** |
| **To comfortable 10-customer ops (A+B+C)** | **~36–47** | **~9 wks** | **~5 wks** |

**Critical path to first money: Gate A + Gate B (~3 weeks with two engineers).** Gate C can trail into the first pilots since white-glove + scoping covers the gap short-term — but it must land before you scale past 2–3 partners or before any go-live promise.

**The 30-day cut of this roadmap is in `minimum-sellable-conxa.md`.**
