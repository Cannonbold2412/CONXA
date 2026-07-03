# Research Audit — Conxa Intelligence Database

**Role:** Research Auditor / CTO Reviewer
**Method:** Every major conclusion in the existing artifacts classified as **Strong / Reasonable / Weak / Unsupported**, with the reasoning, the missing evidence, and the correction. The goal is not coverage — it is to find where the first-pass research was *confidently wrong*, *internally contradictory*, or *blind*.

---

## A. Headline Verdict

The first-pass research is well above average: it correctly identified the asset to mine in each repo (Playwright's scored generator, Stagehand's cache-refresh, SeleniumBase's exception-classified ladder, the AX tree as the universal page representation) and it consistently applied the Conxa lens. **However, it has four systemic weaknesses:**

1. **It optimized for "cheap" over "durable" and never noticed the contradiction.** The recovery cascade is ordered CSS (Tier 1) → ARIA (Tier 2), justified by compute cost — but the corpus's own strongest empirical finding (Mind2Web) is that ARIA/text *outlives* CSS. Two zero-token tiers should be ordered by **success probability**, not by microseconds of lookup. This is an internal contradiction across documents that no artifact caught. **(See §C.1 — the single most important audit finding.)**

2. **It assumed linear replay.** Every artifact models a skill as an ordered list of steps replayed start to finish. Real enterprise pages have *conditional* states (cookie banners that sometimes appear, "session expired" interstitials, A/B variants, optional 2FA). None of the existing recommendations grapple with the fact that deterministic linear replay **cannot** handle "the element that is sometimes there." This is the biggest gap between the research and enterprise reality. **(§C.2)**

3. **It treated central compilation as pure upside and never priced the freshness liability.** "The cloud coordinates, compiles centrally, never executes" is repeated as an unqualified strength. But it means a healed selector cannot be written back locally without violating the model — drift recovery requires a Cloud round-trip, and a stale package stays stale until recompiled. Stagehand's in-place self-heal is *architecturally incompatible* with Conxa's central-compile model, yet the research recommends adopting it without flagging the conflict. **(§C.3)**

4. **It missed the only compounding moat in the corpus.** Every one of the six tools is single-tenant/local and therefore *structurally incapable* of cross-customer drift detection. Conxa's Cloud, by aggregating recovery telemetry across every customer running the same skill against the same site, can detect drift centrally and ship a fixed package *before most customers hit the failure*. This fleet-level flywheel is the one defensibility story no competitor can copy — and it appears nowhere in the first-pass insights. **(§C.4)**

---

## B. Conclusion-by-Conclusion Classification

### B.1 — "Mine Playwright's `selectorGenerator` cost model" (master-insights #1)

**Classification: STRONG — but conflated.**

The cost model (`role+name=100, label=140, text=180, testid=1, css-id=500, css-path=1e7` + "lowest score that uniquely matches") is real, battle-tested, deterministic, and zero-token. Recommending it is correct.

**The conflation:** The artifacts repeatedly equate "adopt the cost model" with "store all 5 signals for multi-signal identity." These are *different things*. Playwright's generator produces **one** selector by combining tokens and collapsing the candidate list; it does not emit five orthogonal, independently-resolvable selectors. To get true multi-signal identity you must either (a) run generation five times under different engine constraints (role-only, text-only, testid-only, css-only, xpath-only), or (b) intercept `selectors[]` *before* `combineScores` collapses it. The repo report (`repos/playwright-main.md` §ADAPT) gets this right ("preserve the candidate list, don't collapse it"); `master-insights.md` #1 blurs it. 

**Missing evidence:** No measurement of how often the top-1 generated selector *and* its alternatives all point to the same element after a realistic DOM mutation. Without that, "5 signals = resilience" is asserted, not shown.

**Correction:** Split into two recommendations — (1) adopt the cost model for *ranking*; (2) separately, force generation of N *engine-orthogonal* selectors so that a single DOM change can't invalidate all of them at once. Orthogonality is the property that matters, not count.

### B.2 — "Stagehand sha256 cache key + in-place drift refresh" (master-insights #2)

**Classification: REASONABLE, with a buried architectural conflict.**

The cache-key hygiene (URL normalization, sorted variable keys, secret values never hashed) is genuinely worth copying and was correctly identified. Strong.

**The conflict the research missed:** Stagehand self-heals by **rewriting the local cache entry in place**. Conxa's invariant is "the cloud compiles; the runtime only executes." A `.exe` runtime that rewrites its own compiled selector locally is *either* violating the central-compile model *or* maintaining a local mutable overlay that diverges from the signed package — a real design fork the research never surfaces. `repos/stagehand-main.md` §ADAPT actually spotted this ("feed the recovered signal back via Cloud rather than mutating local state") — but `master-insights.md` #2 then recommends "update cache in place" verbatim, contradicting its own repo report.

**Correction:** Conxa cannot adopt in-place self-heal as written. It needs a **two-phase heal**: (1) local runtime uses the recovered selector for the *current* execution only (ephemeral), (2) emits a telemetry event; (3) Cloud validates across the fleet and issues a *new signed package version*. Determinism + signing forbids silent local mutation.

### B.3 — "ServerBackend interface as the MCP seam" (master-insights #3)

**Classification: STRONG.**

Correct, low-risk, and architecturally clean. The three-layer separation (transport-agnostic harness / declarative tool registry / per-connection backend) is the right structure and `repos/playwright-mcp-main.md` documents it thoroughly. No correction.

**Minor missing analysis:** The research recommends stdio-only and rejects HTTP/SSE — correct for Claude Desktop — but doesn't address the consequence: a stdio-only local runtime has **no remote control plane for the cancellation/status tools** that the same report praises (`get_execution_status`, `cancel_execution`). Those are fine over stdio, but the audit notes the research never reconciled "reject HTTP transport" with "long-running cancellable executions" — over stdio, status polling is the only option, which is fine but should be stated.

### B.4 — "Auto-ARIA snapshot after every mutating action" (master-insights #4)

**Classification: REASONABLE — but possibly an anti-pattern at Conxa's layer.**

For an *open-world* MCP server (playwright-mcp), returning the AX tree after every action is correct: the LLM is driving and needs current state. **But Conxa is closed-world** — the LLM calls `execute_skill` and the skill replays deterministically. The LLM does *not* choose the next click, so dumping a full AX tree after every internal step (a) wastes tokens the architecture exists to save, and (b) leaks page structure the deterministic runtime doesn't need to expose. 

**Correction:** Conxa should return a **post-condition assertion result** (did the expected state occur: boolean + which assertion), not a raw AX snapshot, per skill step. The AX snapshot belongs only in the *recovery* path (Tier 3) and in telemetry, not in the happy-path tool result. The research imported an open-world pattern into a closed-world runtime without re-checking its fit.

### B.5 — "SeeAct describe-then-match for Tier 3" (master-insights #5)

**Classification: STRONG.**

The 30%-hallucination evidence is real and the describe-then-match protocol is the correct mitigation. This is one of the best insights in the set and survives scrutiny. No correction — only an addition: Conxa has something SeeAct lacks, the **recorded target's original signals**. Tier 3 should match the LLM's description *and* the recorded role/name/text against the live AX tree jointly, which should beat SeeAct's accuracy. The research notes this in `repos/browser-use-main.md` but underweights it in master-insights.

### B.6 — "SeleniumBase exception-classified fallback ladder" (master-insights #6)

**Classification: STRONG.**

Best-supported insight in the corpus (concrete code, typed exceptions → typed recovery, all zero-token). The mapping to Conxa Tier 1 is exact. No correction.

**Missing comparison:** The research never quantifies what fraction of real failures this ladder actually catches. SeleniumBase's years of accumulated fixes *imply* it's high, but "an enormous fraction of flakiness is deterministically recoverable" (stated in `repos/SeleniumBase-master.md` §LEARN) is an **unsupported quantitative claim**. It is almost certainly directionally true, but the entire "zero-token Tier 1/2" economic story rests on it and it has no number. **(See §C.1.)**

### B.7 — "Actionability gates (attached→visible→stable→enabled)" (master-insights #7)

**Classification: STRONG.**

Correct and essential. The `stable` (RAF-frame) check is the genuinely differentiating detail and the research correctly singled it out. No correction.

### B.8 — "scaleFactor coordinate normalization" (master-insights #8)

**Classification: REASONABLE but over-ranked.**

Technically correct and a real bug-class preventer. But it is a *Tier 4-only* concern (vision fallback), and the research itself argues vision should be rare. Ranking a one-line fix for the least-used tier as a top-8 master insight inflates its strategic weight. **Correction:** Keep the fact, demote the priority. It's a correctness footnote on the vision tier, not a headline architectural insight.

### B.9 — "Store 4 signals per element, weighted by stability" (master-insights #10)

**Classification: REASONABLE — and the weights are asserted, not derived.**

The Mind2Web-backed claim that semantic signals outlive structural ones is **Strong**. But the specific weights in master-insights (`[0.4, 0.3, 0.2, 0.1]`) are **Unsupported** — invented numbers with no derivation. Worse, weighting implies a *blended score*, but element resolution is not a weighted average — it's a **fallback sequence** (try signal A; if it fails or is non-unique, try signal B). The data model should be an *ordered list with uniqueness gates*, not a weight vector. The research borrowed Playwright's scoring intuition but mis-modeled it as ML-style weights.

**Correction:** Replace weights with an ordered resolution sequence + per-signal uniqueness check (Playwright's actual algorithm), and order it by the Mind2Web stability finding (semantic before structural), not by compute cost.

### B.10 — "browser-use reflection (`evaluation_previous_goal`)" (master-insights #9)

**Classification: STRONG as a Tier-3 prompt pattern. Weakly justified by the cited evidence.**

The pattern (force the model to assess the prior step before planning the next) is sound. But the research justifies it with "WebArena's 23.8% vs 14% gap (reflective vs non-reflective)" — that gap is SeeAct-vs-GPT-4, which is **grounding strategy, not reflection**. The citation is wrong. The reflection benefit is real (browser-use ships it in production) but the specific number attached to it is a misattribution.

**Correction:** Keep the recommendation, drop the false WebArena citation, label it as "validated by production usage, not by a controlled benchmark in this corpus."

### B.11 — Capability Matrix scores

**Classification: REASONABLE, with three challengeable cells.**

- **UI-TARS "Cross-Platform = 5"** — true on paper, but irrelevant to Conxa (web-only). A capability Conxa will never use shouldn't score as a strength *in a Conxa-lens matrix*. The matrix silently mixes "objectively impressive" with "relevant to Conxa."
- **SeleniumBase "Recovery = 4" vs Stagehand "Recovery = 4"** — these are *different kinds* of recovery (deterministic ladder vs LLM re-ground) and collapsing them to the same scalar hides the most important distinction in the whole corpus. A single 1–5 scalar is the wrong instrument for "recovery."
- **browser-use "Accessibility = 4"** is generous given the acknowledged DOM-text truncation at 40k chars, which silently drops target elements on large enterprise pages — a reliability defect, not a 4/5 feature.

**Correction:** Split "Recovery" into "Deterministic recovery" and "Semantic/LLM recovery" as separate columns; mark Conxa-irrelevant strengths explicitly.

---

## C. The Four Deep Findings (what the first pass was blind to)

### C.1 — The recovery cascade is ordered by cost; it should be ordered by durability *(internal contradiction)*

**The claim across artifacts:** Tier 1 = compiled CSS/XPath, Tier 2 = ARIA. Justification: CSS lookup is the cheapest deterministic operation.

**The contradicting evidence, from the same corpus:** Mind2Web (`papers/Mind2Web-2306.06070.md`, Finding 1) and Playwright's own generator (which *penalizes* CSS-id at score 500 and css-path at 1e7 while *rewarding* role+name at 100) both say semantic signals are **more stable** than structural ones. Playwright literally ranks ARIA *above* CSS. Conxa's cascade ranks CSS *above* ARIA.

**Why this matters:** Tier 1 and Tier 2 are *both zero-token*. The compute difference between a CSS query and an AX-tree query is negligible (microseconds) relative to the cost of a Tier 1 *miss* that forces the whole cascade to advance. If ARIA resolves correctly more often, putting CSS first means you pay the Tier-1-miss penalty more often for no economic benefit. **The cascade is optimizing the wrong variable.**

**Correction:** Within the zero-token band, order by empirical success probability (semantic role+name first, then text, then testid, then structural CSS/XPath last). Reserve "cheapest first" only for tie-breaks where success rates are equal. This is the single highest-value correction in the audit because it changes the *core* runtime algorithm.

### C.2 — Linear replay cannot model conditional page states *(missing analysis)*

**The blind spot:** Every artifact models a skill as `step[0..n]` replayed in order. SeleniumBase's report even lists the conditional verbs (`click_if_visible`, `goto_if_not_url`, `is_element_visible` boolean probes) but the synthesis docs never elevate them.

**The enterprise reality:** Cookie/consent banners appear ~30–50% of the time. "Session expired" interstitials, optional MFA prompts, "are you still there?" modals, and A/B-test variants are all *non-deterministically present*. A linear replay that always tries to dismiss a banner fails on the runs where it's absent; one that never dismisses it fails on the runs where it's present. **This is not a recovery-tier problem — it's a control-flow problem the skill-package format must represent.**

**Correction:** The SkillPackage schema needs first-class **conditional steps** (`if_present(selector) → steps`), **optional steps** (`try_dismiss`), and **wait-for-one-of** branch points — exactly SeleniumBase's `wait_for_any_of_elements` generalized. Without this, "deterministic replay" is brittle precisely where enterprise flows are messiest. This belongs in v2 of master-insights as a top-5 item; it is currently absent entirely.

### C.3 — Central compilation has an unpriced freshness liability *(incorrect assumption)*

**The assumption:** "The cloud does not compile or execute" + "cloud coordinates centrally" is presented as unalloyed advantage across every document.

**The unpriced cost:** It creates a **drift-to-fix latency** that local self-healers (Stagehand) don't have. When a site changes, a Stagehand user's *next run* re-grounds and self-heals locally and immediately. A Conxa user's next run hits a stale package and must either (a) fall to Tier 3 LLM every time until Cloud reships, or (b) wait for a recompile. The research recommends adopting Stagehand's in-place heal *and* central-compile-only — these are in tension (see B.2).

**Correction:** Make the freshness path explicit as an architecture requirement, not an afterthought: define the **heal → telemetry → re-sign → push** loop, its target latency (how fast must Cloud reship after detecting drift?), and the *interim* behavior (ephemeral local heal that does NOT mutate the signed package). The central model is still net-correct for audit/security/distribution — but its freshness cost must be designed for, not assumed away.

### C.4 — The fleet-level drift-detection flywheel is the missing moat *(underestimated opportunity)*

**What every competitor structurally cannot do:** Playwright, SeleniumBase, Stagehand, browser-use, UI-TARS are all single-tenant and/or local. None of them sees *another customer's* recovery events. Each instance rediscovers the same site drift independently.

**What Conxa's architecture uniquely enables:** Because Conxa *distributes* the same compiled skill to many customers and *centralizes* telemetry, when Customer A's runtime heals a drifted selector on site X at 9:00am, Conxa Cloud can validate that heal and push an updated package to Customers B–Z **before they run the skill at all**. Drift becomes a fleet-wide event detected on first occurrence, not an N-times-rediscovered local failure.

**Why this is the defensibility story:** It compounds. More customers → faster drift detection → fresher packages → higher reliability → more customers. None of the six tools can enter this loop because none of them aggregate cross-tenant execution telemetry against shared compiled artifacts. The first-pass research mentions "feed the recovered signal back to Cloud" (browser-use and Stagehand reports) but frames it as *single-skill refinement*, never as the *cross-customer compounding asset*. **This should be the #1 long-term-defensibility insight and is currently nowhere.**

---

## D. Conclusions Classified — Summary Table

| Conclusion | Class | Core issue |
|---|---|---|
| Playwright cost model (#1) | Strong | Conflates ranking with orthogonal multi-signal; fix the conflation |
| Stagehand cache key (#2) | Reasonable | In-place heal conflicts with central-compile invariant |
| ServerBackend seam (#3) | Strong | Solid; reconcile stdio-only with long-run cancellation |
| Auto-ARIA after every action (#4) | Reasonable | Open-world pattern misapplied to closed-world runtime |
| SeeAct describe-then-match (#5) | Strong | Best insight; add recorded-signal joint matching |
| SeleniumBase ladder (#6) | Strong | Unquantified hit-rate underpins the whole economic story |
| Actionability gates (#7) | Strong | No correction |
| scaleFactor normalization (#8) | Reasonable | Correct fact, over-ranked (Tier-4-only footnote) |
| Reflection (#9) | Strong / mis-cited | Drop the false WebArena citation |
| 4-signal weights (#10) | Reasonable | Weights invented; model as ordered fallback not weighted avg |
| **Cascade order CSS→ARIA** | **Weak (contradicts own evidence)** | **Order zero-token tiers by durability, not cost (C.1)** |
| **Linear replay assumption** | **Unsupported for enterprise** | **Needs conditional/optional/branch steps (C.2)** |
| **Central-compile = pure upside** | **Incorrect assumption** | **Price the freshness liability (C.3)** |
| **Cross-customer flywheel** | **Missing entirely** | **The actual moat (C.4)** |

---

## E. What Evidence the Database Still Lacks

1. **A hit-rate number for deterministic recovery.** The entire zero-token thesis rests on "most flakiness is deterministically recoverable" with no measurement. *Action: instrument a sample of enterprise flows and measure Tier-1/2 resolution rate vs Tier-3 escalation rate.*
2. **DOM-mutation resilience of orthogonal signals.** No data on how many independent signals survive a typical site update. *Action: diff real before/after site snapshots; measure per-signal survival.*
3. **Conditional-state frequency.** No data on how often cookie banners / interstitials / MFA appear. *Action: needed to justify the conditional-step schema (C.2).*
4. **Drift-to-fix latency target.** No SLA defined for how fast Cloud must reship after drift (C.3).
5. **No competitive teardown of the agent-driver trend.** The corpus analyzes six tools but never asks "what happens to Conxa's thesis if frontier models get 10× cheaper and the per-step-LLM cost objection evaporates?" *Action: stress-test the determinism thesis against a cheap-inference future (it survives on auditability/SLA grounds, but the argument must be made explicitly — see ecosystem-synthesis).*
