# Conxa Relevance Review

**The forcing question:** *If Conxa could adopt only ONE concept from this source, what would it be?* — then: why, what problem it solves, and how much it improves each Conxa subsystem on a **1–10** scale.

Scoring is **marginal improvement to Conxa's architecture**, not the idea's general quality. A 10 means "materially changes how this subsystem works." A 1–2 means "essentially no effect on this subsystem." Subsystems: **Recording · Compilation · Runtime · Recovery · Vision · MCP**.

---

## Repositories

### Playwright — *one concept: the scored generator with a unique-match gate*
- **Why:** It's the only deterministic, published, battle-tested answer to "which selector is best, and is it unambiguous right now?" — and it runs in-page at zero token cost.
- **Problem solved:** Removes the LLM from selector *ranking* at compile time and gives the runtime a uniqueness test it can re-run live.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 7 | **10** | 8 | 6 | 1 | 1 |

Compilation is transformed (this *is* the compiler's core). Runtime gains the live uniqueness re-check. Recording benefits because capture defaults to semantic identity. Vision/MCP untouched.

---

### SeleniumBase — *one concept: exception-classified, invasiveness-escalating fallback ladder*
- **Why:** It defines the entire zero-token recovery floor — typed failure → typed remedy, escalating re-find < native < JS < protocol.
- **Problem solved:** Recovers the *majority* of real-world flakiness (timing, overlays, staleness) before any model is involved, protecting the "Tier 1/2 = zero tokens" invariant.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 3 | 4 | **9** | **9** | 1 | 2 |

Runtime and Recovery are the payload (this is Tier 1). Compilation gains the validation/assertion-verb taxonomy. Recording gets a checklist of event types. **Caveat:** must be paired with an outcome check (SeleniumBase's own blind spot).

---

### Stagehand — *one concept: the independent ground-truth probe + recovery-reuses-grounding-path*
- **Why:** Of everything in Stagehand, the *independent AX probe* (evidence beats the agent's claim) is the most underused and the most Conxa-relevant — it's the missing post-condition check the rest of the corpus lacks. (The cache-key hygiene is nice but secondary; the in-place self-heal is partly incompatible — see audit C.3.)
- **Problem solved:** Distinguishes "the action didn't throw" from "the intended state occurred" — the anti-hallucination, anti-false-success guarantee enterprise needs.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 5 | 7 | 8 | **9** | 3 | 4 |

Recovery and Runtime gain a live verification gate; Compilation gains the post-condition fingerprint as a compiled asset. **If instead you forced the cache concept:** Compilation 8 / Runtime 9 / Recovery 6 — but it imports the freshness/in-place-mutation conflict, so the probe is the better single pick.

---

### Browser Use — *one concept: rank-and-cap multi-signal AX representation for LLM re-grounding*
- **Why:** It's the proven shape of the Tier-3 input — a compact, indexed, multi-signal page representation the LLM can ground against — *fixed* by ranking against the recorded target so the intended element is never truncated away.
- **Problem solved:** Makes Tier-3 re-grounding cheap (text, not pixels) and reliable (target-anchored, not blindly truncated).
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 2 | 3 | 4 | **9** | 6 | 2 |

Almost entirely a Recovery (Tier 3) improvement, with a Vision assist (text-first defers pixel spend). Negligible elsewhere — correctly, since browser-use's core loop is the thing Conxa rejects.

---

### Playwright MCP — *one concept: the three-layer ServerBackend architecture*
- **Why:** It's the correct, reusable skeleton for an MCP runtime — transport-agnostic harness / declarative registry / per-connection backend, joined by a `{initialize, callTool, dispose}` seam.
- **Problem solved:** Decouples Conxa's `server.js` from skill-execution internals; enables stateless listing, lazy init, crash-survival, in-band errors, and entitlement filtering.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 1 | 2 | 6 | 3 | 1 | **10** |

Pure MCP-layer transformation, with a Runtime assist (lifecycle resilience). **Invert the tool philosophy:** copy the harness, expose a closed-world verb set, keep resolution inside the skill.

---

### UI-TARS — *one concept: CALL_USER as a first-class escalation state*
- **Why:** It's the cleanest model for Tier 5 — a *designed* pause-and-hand-to-human state, honest about system limits, auditable. (The operator seam and SoM are useful but secondary; vision-as-primary is rejected.)
- **Problem solved:** Converts "silent failure / hallucinated success" at the end of the cascade into an explicit, logged human handoff for CAPTCHA/2FA/ambiguous/sensitive steps.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 2 | 3 | 4 | **8** | 5 | 4 |

Recovery (Tier 5) is the payload; Vision benefits from scaleFactor/SoM if/when Tier 4 fires; Compilation should mark which step-types are *always* escalation-worthy (rule-initiated, not just model-initiated).

---

## Papers

### Mind2Web — *one concept: semantic signals outlive structural signals (empirical)*
- **Problem solved:** Tells Conxa the *correct ordering* of its zero-token tiers and the *correct weighting* of compiled signals — and exposes the audit's C.1 contradiction (CSS-first is wrong).
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 6 | **9** | 8 | 7 | 1 | 1 |

Reorders the cascade and re-weights the identity model — a core Compilation+Runtime change disguised as a footnote.

---

### WebArena — *one concept: functional/outcome success criteria*
- **Problem solved:** Defines what "success" must mean for Conxa — intended *state*, not clicks — anchoring the verifier and the regression suite.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 4 | 7 | 6 | **8** | 1 | 3 |

Drives the post-condition assertion design (Compilation emits checkers; Runtime/Recovery enforce them).

---

### WorkArena — *one concept: the enterprise task taxonomy + compositional-failure evidence*
- **Problem solved:** Gives Conxa its skill-library roadmap (form-fill → table-nav → wizard → export) *and* the strongest external proof that LLM agents fail compositional enterprise tasks (<5%), validating determinism as the wedge.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| **8** | 6 | 7 | 7 | 1 | 2 |

Highest *Recording* relevance of any source: it tells Conxa *which interactions must be capturable first* (autocomplete/typeahead, dynamic tables, multi-step wizards) — the exact things the recorder most often misses.

---

### SeeAct — *one concept: describe-then-ground (never emit a selector directly)*
- **Problem solved:** Cuts Tier-3 hallucination ~30%; makes LLM recovery trustworthy.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 1 | 2 | 3 | **10** | 5 | 2 |

The single highest-impact Recovery concept in the paper set; Vision assist via dual-representation grounding.

---

### OS-ATLAS — *one concept: normalized grounding output as a Tier-4 component*
- **Problem solved:** A drop-in visual grounder (`screenshot + description → normalized bbox`) for the rare Tier-4 case, with correct coordinate-space hygiene.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 1 | 1 | 2 | 5 | **8** | 1 |

Purely a Vision-tier component. Deliberately low everywhere else — correct, since Conxa walls vision off.

---

### UI-TARS (paper) — *one concept: reflective trajectory training → reflection-in-output*
- **Problem solved:** Reduces cascading error in the LLM tiers via in-line self-assessment.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 1 | 1 | 2 | **7** | 4 | 1 |

Recovery-only; must be paired with the independent probe (reflection = belief, probe = truth).

---

### WebVoyager — *one concept: SoM + AX-text dual representation beats either alone*
- **Problem solved:** Tells Conxa exactly how to build the Tier-3/4 prompt (numbered AX text *and* SoM-annotated screenshot, aligned by index).
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 1 | 1 | 2 | **7** | 7 | 1 |

Joint Recovery/Vision improvement at the upper tiers.

---

## Aggregate: where each subsystem's biggest wins come from

| Subsystem | Top source (single best concept) | 2nd | 3rd |
|---|---|---|---|
| **Recording** | WorkArena (which interactions to capture) | Playwright (semantic-default capture) | Mind2Web (multi-signal at capture) |
| **Compilation** | Playwright (scored generator) | Mind2Web (signal ordering) | WebArena (compiled outcome checkers) |
| **Runtime** | SeleniumBase (Tier-1 ladder) | Playwright (live uniqueness gate) | Stagehand (live probe gate) |
| **Recovery** | SeeAct (describe-then-ground) | SeleniumBase + Stagehand (ladder + probe) | browser-use (target-anchored AX re-ground) |
| **Vision** | OS-ATLAS (Tier-4 grounder) | WebVoyager (dual representation) | UI-TARS (scaleFactor/SoM) |
| **MCP** | Playwright MCP (ServerBackend seam) | Playwright MCP (entitlement filtering) | UI-TARS (CALL_USER as a tool state) |

**Reading:** Recording's biggest lever is a *paper* (WorkArena), not a repo — the research over-indexed on repos for recording and missed that the highest-value recording guidance is "capture the interaction types enterprise flows actually depend on." Recovery is the most *contested* subsystem — its wins are spread across four sources and require *combination* (ladder + probe + describe-then-ground + target-anchoring), which is exactly why a single "Recovery" capability-matrix score is misleading (audit B.11).
