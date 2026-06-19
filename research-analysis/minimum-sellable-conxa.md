# The Minimum Sellable Conxa — 30 Days of Engineering

**Question:** If only **30 days of engineering effort** were available, what is the *smallest* set of improvements required before taking money from the first paying customers?

**Assumptions:** ~30 dev-days = **1 engineer for ~6 weeks** *or* **2 engineers for ~3 weeks** (the realistic reading). Calibrated to ~10 supervised, reversible-workflow design partners on Windows — not enterprise, not unattended, not at scale.

**Decision rule:** include an item only if its absence would cause **data harm, broken trust, a blocked install, or unmanageable support** for the first 10 customers. Everything else waits.

**Source basis:** `pre-sales-readiness.md`, `pre-sales-roadmap.md` (Gates A/B).

---

## The 30-day budget, allocated

| Tier | Items | Dev-days | Running total |
|---|---|---|---|
| **1 — Critical** | MS1–MS5 | ~20 | 20 |
| **2 — Important** | MS6–MS8 | ~8 | 28 |
| **3 — Optional (if time)** | MS9–MS10 | ~2+ | 30+ |

If forced to cut: **Tier 1 alone (≈20 days) is the true floor** — below it, do not take money. Tier 2 makes the pilots survivable; Tier 3 is polish.

---

## Tier 1 — CRITICAL (do not take money without these) — ~20 days

### MS1 · Post-condition verification on consequential steps — *the one non-negotiable*
- **What:** Wire the dead `verifyAssertions()` path. After each consequential/recovered step, verify the compiled assertion (or re-read expected state via a channel the action didn't use) and **fail loudly** on mismatch. Scope to consequential steps to fit the budget.
- **Customer impact:** ★★★★★ — prevents silently entering wrong data into a customer's CRM/finance/HR system. The difference between "a failed run" (recoverable) and "a wrong run that corrupts data" (trust-ending).
- **Reliability gain:** ★★★★★ — converts silent-incorrect into loud-failure.
- **Effort:** 5–8 d.

### MS2 · Honest repositioning + supported-workflow profile
- **What:** Rewrite PRD §8/§10 and the sales deck to "Deterministic replay + AI-assisted repair." Remove/qualify autonomous-self-healing, wired-assertions, and conditional-logic claims. Write the supported-app/interaction profile and the scoping language for the pilot contract.
- **Customer impact:** ★★★★★ — selling the marketing-vs-code gap is the fastest route to churn + reputational damage. The cheapest trust win available.
- **Reliability gain:** ☆ (positioning, not code) — but the highest *trust* gain on the list.
- **Effort:** 2–3 d.

### MS3 · Destructive-step guardrail + profile enforcement
- **What:** Use the existing `destructive_semantics` classification to require human-confirm (or block) on irreversible steps; refuse out-of-profile flows without explicit override. Bounds blast radius while MS1 matures.
- **Customer impact:** ★★★★☆ — lets you safely sell *reversible* workflows now; prevents a recovered-but-wrong destructive action.
- **Reliability gain:** ★★★☆ (containment).
- **Effort:** 2–3 d.

### MS4 · Windows code signing + lock the public installer download
- **What:** EV cert + `signtool` step in `installer_builder.py`; replace the public slug download with a per-customer tokenized link.
- **Customer impact:** ★★★★☆ — unsigned = SmartScreen/GPO block (can't install); public download = security embarrassment. Both surface in the very first install.
- **Reliability gain:** ☆ (deploy/security, not runtime).
- **Effort:** 3 d + cert procurement (start cert day 1; it has lead time).

### MS5 · Error-code UX + recovery runbook + resume path
- **What:** Human-readable failure messages (map raw codes), a documented "step failed → do X" runbook, a polished `resume_from` flow, and a "request a fix" channel to you.
- **Customer impact:** ★★★★☆ — troubleshooting is non-self-serve today; this makes white-glove support actually tractable instead of every failure being a founder fire-drill.
- **Reliability gain:** ★★☆ (recoverability, not prevention).
- **Effort:** 3–4 d.

---

## Tier 2 — IMPORTANT (makes the pilots survivable) — ~8 days

### MS6 · Actionability gate + saner timeout
- **What:** attached→visible→**stable**→enabled before acting; replace blunt 700ms with a small adaptive budget.
- **Customer impact:** ★★★★☆ — removes the #1 source of *spurious* failures on slow/animated SPAs; every flaky failure erodes trust.
- **Reliability gain:** ★★★★☆.
- **Effort:** 3–4 d.

### MS7 · RBAC on write routes
- **What:** `require_role` on publish/upload/delete (owner/admin write, member read).
- **Customer impact:** ★★★☆ — basic access control; prevents accidental member deletes; clears the most basic security question.
- **Reliability gain:** ☆ (security).
- **Effort:** 3 d.

### MS8 · Run-critical cloud always-on + telemetry HMAC
- **What:** Keep LLM-proxy + skill-sync warm/always-on (off free-tier ephemerality); require `SKILL_TRACKING_HMAC_SECRET` in prod.
- **Customer impact:** ★★★☆ — prevents cold-start first-run stalls; closes the open telemetry-auth hole.
- **Reliability gain:** ★★☆.
- **Effort:** 1.5–2 d.

---

## Tier 3 — OPTIONAL (only if days remain) — ~2+ days

### MS9 · Live fingerprint scoring at runtime
- Use the compiled fingerprint to score live candidates + uniqueness gate (vs array-order). Reduces wrong-element matches; strong complement to MS1. **Impact ★★★★ / Effort 4–5 d** — likely spills past 30 days; pull in if MS-items came in under estimate, else first item post-launch.

### MS10 · Drift-warning signal
- Surface "skill degrading — recompile" from recovery-tier telemetry. **Impact ★★★ / Effort 3 d** — reduces surprise breakage; nice for pilot CSM, not a blocker.

---

## What 30 days deliberately does NOT buy

To set expectations honestly — these remain *unbuilt* after the 30 days and the offer must be scoped around them:
- **Autonomous recovery / write-back** → recovery stays assisted; sell *attended* only.
- **Conditional/branch steps** → linear replay; scope around stochastic states (or pre-dismiss known banners manually in the recording).
- **Vision recovery, macOS, SSO/compliance, package signing, fleet flywheel** → all post-launch.

These are not omissions — they are the **boundary of the honest offer**. The contract and positioning (MS2) must match this boundary exactly.

---

## The 30-day verdict

**With 2 engineers for 3 weeks, Tier 1 + Tier 2 (MS1–MS8, ~28 days) is achievable — and that is a genuinely, honestly sellable Conxa** for ~10 supervised, reversible-workflow design partners. It will:
- never silently corrupt a customer's data (MS1/MS3),
- be sold for exactly what it is (MS2),
- install cleanly in a real environment (MS4),
- be supportable when it breaks (MS5),
- fail less spuriously (MS6),
- and clear the baseline security/availability bar (MS7/MS8).

**The single most important day-1 action:** start MS1 (post-condition verification) and MS2 (repositioning) immediately, and order the code-signing cert (MS4) the same day, because the cert has external lead time. If you do nothing else from this list, do **not** sell without MS1 and MS2 — they are the line between "early but honest" and "negligent."

> **Floor, stated plainly:** ~20 dev-days (Tier 1) is the minimum below which taking money is irresponsible. ~28 dev-days (Tier 1+2) is the minimum below which the pilots won't survive contact. Either fits inside 30 days with two engineers.
