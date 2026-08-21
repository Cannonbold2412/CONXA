# Conxa Cost & Revenue Model

**Last Updated:** August 9, 2026
**Status:** Living document — iterate as assumptions change

---

## What Conxa Actually Does

A company records their browser workflows in the Build Studio. Conxa compiles those recordings into a signed `.exe` installer. The company distributes that installer to their customers however they want (download page, onboarding email, their own app store).

When a customer installs it, their Claude Desktop gains the ability to run those workflows as MCP tools. Execution happens entirely on the customer's machine — Conxa is not in the execution path at all.

What does flow back to Conxa is telemetry: every run, every recovery attempt, every success or failure. Companies see this in the Conxa dashboard.

```
Company builds once               Customer runs forever
─────────────────                 ─────────────────────
Build Studio                      Customer machine
  └─ Record workflows               └─ .exe installed
  └─ Compile to plugin              └─ Claude Desktop
  └─ Generate .exe ──── distribute ──► └─ MCP runtime
  └─ Push update                          └─ executes workflow
                                          └─ telemetry ──► Conxa Dashboard
                                                            └─ Company sees it
```

**What Conxa pays for:**
- Compilation LLM (one-time per workflow compilation, plus Human Edit repair calls)
- Dashboard hosting (companies checking analytics)
- Telemetry ingestion (from customer machines worldwide)
- Signing, release management, and update-channel infrastructure
- Plugin update sync (when company ships an update, customers pull it)
- Conxa runtime and healing updates that keep installed plugins working

**What Conxa does NOT pay for:**
- Execution (runs on customer's machine)
- LLM recovery during execution (customer's Claude Desktop subscription)
- Customer infrastructure of any kind

---

## Cost Structure

### 1. Plugin Compilation (One-Time Per Workflow Compilation)

Every time a company records workflows and compiles them into a new plugin version, Conxa runs LLM calls per step to generate selectors, anchors, and intent.

#### LLM Calls Per Step

| Call | Prompt size | When | Count/step |
|------|-------------|------|------------|
| **Intent detection** (`generate_intent_with_llm`) | ~200 input + ~50 output tokens | Every step — but **cached** by element hash | 1 typical, up to 3 on a generic/malformed answer (0 on cache hit) |
| **Vision anchor generation** (`generate_anchors_for_step_or_raise`) | ~15K input + ~500 output tokens (screenshot JPEG as base64 + prompt) | Every step — but **cached** by screenshot hash | 1 (0 on cache hit) |

**All steps, all DOM conditions:** 2 LLM calls/step (intent + vision anchor) typical; a step whose element is genuinely hard to describe can cost up to 4 (3 intent retries + 1 vision anchor).
**Recompilation (same DOM, cached):** 0–2 calls/step — caching absorbs most of the cost. Note: intent generation has **no template fallback** — a step that never resolves to a specific, non-generic intent is left with a blank `intent` (flagged in Human Edit) rather than a synthesized one, and an unresolved attempt is **not cached**, so it retries in full on every subsequent compile until it succeeds or the underlying page/LLM issue is fixed.

Selector strings are generated deterministically by `IdentityBundle` + `selector_grammar.py`. No LLM calls are made for selector generation regardless of DOM quality or `data-testid` coverage.

#### Corrected Cost Per Workflow Compilation

#### LLM Provider Strategy — Two Separate Pools

**Free plan and paid plans use different LLM provider pools.**

| Plan | Provider Pool | Rationale |
|------|--------------|-----------|
| **Free** | Groq + Google AI Studio + NVIDIA NIM (free-tier key rotation) | Zero LLM cost; rate limits acceptable at low volume |
| **Starter / Pro** | **GPT-5.4-mini + Gemma 4 31B** | Fast, low-cost paid compilation with enough burst capacity for active teams |
| **Enterprise** | **GPT-5.4 + Claude Sonnet 4.6 Vision** | Highest-quality compilation and vision handling for complex customer workflows |

**Why separate paid pools:**
Companies compile in bursts — not a constant drip all day. When someone hits compile, the job should finish in seconds. Free-tier providers have tight rate limits that cause queuing under burst load:

| Free-tier provider | Confirmed limits (Aug 2026) | Note |
|---|---|---|
| Groq | 30 req/min, 6,000 TPM, 14,400 req/day (org-level — extra API keys don't add capacity) | No per-token charge on the free tier, just rate gates; a card-verified "Developer Tier" (no spend required) lifts this to ~10x plus a 25% token discount if the free tier proves too tight |
| Google AI Studio | 5–15 req/min, up to 1,000 req/day | **Changed April 1, 2026:** Pro-family Gemini models were pulled from the free tier — only Flash and Flash-Lite remain free. The vision-anchor free-pool call must target a Flash-family model; a Pro-family request will fail or bill, not silently degrade |
| NVIDIA NIM | ~40 req/min, 1,000 free credits, no card required | Forever-free developer plan; credits function as a soft usage cap rather than a hard rate limit |

Sources: [Groq pricing/limits](https://www.cloudzero.com/blog/groq-pricing/), [Google AI Studio free tier](https://www.nocode.mba/articles/google-ai-studio-pricing), [NVIDIA NIM free tier](https://decodethefuture.org/en/nvidia-nim-api-pricing-limits-guide/).

- **Starter / Pro**: GPT-5.4-mini handles vision anchors and selector generation; Gemma 4 31B handles intent and text fallback work.
- **Enterprise**: GPT-5.4 handles the core compilation path; Claude Sonnet 4.6 Vision is reserved for the most complex screenshot and visual-anchor cases.

Paid plans still avoid free-tier queueing. Starter and Pro optimize for cost and speed; Enterprise optimizes for maximum reliability and visual reasoning quality.

**How it routes in the existing code:**  
`router.py` builds a `PoolEntry` per key. The Build Studio backend reads the workspace billing tier from the cloud API and passes `paid_tier=True` to select the appropriate pool at compile time. No router rewrite needed — just two separate pool configs loaded from env.

---

#### Current Provider Prices Used

Pricing re-checked against provider docs on August 9, 2026 — **unchanged since the last check (June 3, 2026)** for every model already in the pool:

| Provider / model | Input | Output | Relevant limit / note | Source |
|------------------|-------|--------|-----------------------|--------|
| GPT-5.4-mini | $0.75 / 1M tokens | $4.50 / 1M tokens | Tier 4: 10M TPM; Tier 5: 180M TPM | [OpenAI GPT-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| GPT-5.4 (<272K context) | $2.50 / 1M tokens | $15.00 / 1M tokens | Tier 4: 4M TPM; Tier 5: 40M TPM | [OpenAI GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| Together AI Gemma 4 31B | $0.39 / 1M tokens | $0.97 / 1M tokens | Serverless limits are dynamic; use dedicated endpoints for predictable bursts | [Together pricing](https://www.together.ai/pricing), [Together rate limits](https://docs.together.ai/docs/serverless/rate-limits) |
| Claude Sonnet 4.6 Vision | $3.00 / 1M tokens | $15.00 / 1M tokens | Use Priority Tier or custom Enterprise limits for bursty vision work | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits) |
| Claude Opus 4.8 / Opus 5 | $5.00 / 1M tokens | $25.00 / 1M tokens | Quality upgrade path only — materially more expensive than Sonnet | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

Claude Opus (currently Opus 4.8 or Opus 5, both priced identically at $5/$25 per MTok) is a quality upgrade path, not the default Enterprise cost model — it should only be used when Sonnet 4.6 Vision cannot resolve the workflow.

**New since the last check — Claude Sonnet 5:** Anthropic shipped Claude Sonnet 5 with *introductory* pricing of $2.00 / $10.00 per MTok through **August 31, 2026**, reverting to standard $3.00 / $15.00 (identical to Sonnet 4.6) on September 1, 2026. That's a real ~33% discount vs. Sonnet 4.6 Vision for the next three weeks, but it converges to the same price the day after, so it is not worth a router migration for this pricing window alone — re-evaluate only if Sonnet 5's vision quality is materially better than 4.6's, independent of the temporary discount. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

#### Cost Per Compilation by Plan

**Free plan (free-tier providers):**

Token costs at Groq (text) + Google AI Studio (vision) — **actually billed to Conxa: $0**, both are free-tier key rotation; the figures below are a notional shadow price (what the same calls would cost at each provider's cheapest paid rate) used only to compare against the paid pools:
- Intent: ~200 tokens → **~$0.00001 notional** (negligible)
- Vision anchor: ~15K tokens at $0.10/1M (Gemini Flash-Lite input rate — the only free-tier-eligible Gemini family since Google pulled Pro models from the free tier on April 1, 2026) → **~$0.002/step notional**
- Selectors: **$0** (deterministic — no LLM)
- **Total/step: ~$0.002 notional | Per compilation (15 steps): ~$0.03 notional (real cost: $0)**

**Starter / Pro paid plans (GPT-5.4-mini + Together AI Gemma 4 31B):**

- Intent (Gemma 4 31B, 200 input + 50 output): **~$0.00013/step**
- Vision anchor (GPT-5.4-mini, 15K input + 500 output): **~$0.0135/step**
- Selectors: **$0** (deterministic — no LLM)
- **Total/step: ~$0.014 | Fresh 15-step workflow: ~$0.21**
- **Cached recompilation (3 changed steps): ~$0.042**
- **Blended monthly average (20% fresh, 80% cached): ~$0.075/compilation**

**Enterprise paid plans (GPT-5.4 + Claude Sonnet 4.6 Vision):**

- Intent (GPT-5.4, 200 input + 50 output): **~$0.001/step**
- Vision anchor (Claude Sonnet 4.6 Vision, 15K input + 500 output): **~$0.053/step**
- Selectors: **$0** (deterministic — no LLM)
- **Total/step: ~$0.054 | Fresh 15-step workflow: ~$0.81**
- **Cached recompilation (3 changed steps): ~$0.162**
- **Blended monthly average (20% fresh, 80% cached): ~$0.292/compilation**

| Scenario | Free cost (notional; real cost $0) | Starter / Pro cost | Enterprise cost |
|----------|------------|--------------------|-----------------|
| Short workflow (5 steps) | ~$0.01 | ~$0.070 | ~$0.27 |
| Medium workflow (15 steps) | ~$0.03 | **~$0.21** | **~$0.81** |
| Long workflow (30 steps) | ~$0.06 | ~$0.42 | ~$1.62 |
| Recompilation (cached, 3 changed steps) | ~$0.006 | **~$0.042** | **~$0.162** |
| **Blended (80% recompiles, 15 steps avg)** | **~$0.011** | **~$0.075** | **~$0.292** |

**Key insight on continuous iteration:** Both intent and vision anchor calls are cached by element hash (`intent_llm.py`, `anchor_vision_llm.py`). Recompiling a workflow where only 2–3 steps changed fires LLM only for those steps — the rest are cache hits. This makes daily iteration cheap regardless of provider. Selector strings are generated deterministically at zero token cost in all cases.

**Human Edit pool:** Human Edit can trigger extra LLM calls after the initial compile: step repair, selector or anchor regeneration, validation, and recovery artifact updates. Each plan gets a monthly Human Edit token pool that applies to both text and vision repair calls. The re-target wizard's "draw a new region" step (Pick element phase) is one of these vision calls (`region_selector_vision.py`, cached by DOM hash + drawn bbox so redrawing the same box doesn't re-bill) — it replaced a text-only regenerate call that couldn't actually resolve a drawn region to a DOM element (see `docs/App-Flow.md` §7 re-target wizard note), so this is a cost-neutral swap of one Human Edit call for another, not a new charge:

| Plan | Monthly Human Edit pool |
|------|----------------------------|
| Free | 1M text + vision tokens |
| Starter | 10M text + vision tokens |
| Pro | 50M text + vision tokens |
| Enterprise | Contracted text + vision reserve |

These are compilation/recompilation costs, not execution costs, because customer-side workflow execution still runs locally. The pool is tracked as a visible monthly customer meter but should not become surprise per-token billing.

**Example — Company on Starter (paid plan), 1 plugin, 50 workflows:**
- Initial build: 50 × $0.54 = **$27 one-time** (50 compile credits spent)
- Monthly iteration (recompile 10 workflows × 3 times, 3 changed steps): 30 compilations × $0.11 = **$3.30/month** (30 more compile credits spent — recompiles meter the same as first compiles)
- Selector/anchor repair on existing workflows: draws from the included **10M text + vision token Human Edit reserve**

| Component | Free | Starter | Pro | Enterprise |
|-----------|-------|---------|-----|------------|
| LLM per compilation (first build) | ~$0.03 | ~$0.54 | ~$0.54 | ~$1.93 |
| LLM per recompilation (cached 3-step change) | ~$0.003 | ~$0.11 | ~$0.11 | ~$0.39 |
| Build infrastructure | $0.10 | $0.10 | $0.10 | $0.10 |
| Human Edit LLM reserve | 1M text + vision tokens | 10M text + vision tokens | 50M text + vision tokens | Contracted |
| **Blended per compilation** | **~$0.008** | **~$0.195** | **~$0.195** | **~$0.695** |

---

### 2. Burst Capacity and Throughput

Conxa does not need maximum LLM capacity all day. Compilation demand comes in bursts when teams record, edit, and publish workflows. The paid pool should therefore buy high TPM and throughput for burst windows, not idle 24/7 capacity.

| Pool | Normal configuration | Burst configuration | Why |
|------|----------------------|---------------------|-----|
| Starter / Pro OpenAI | GPT-5.4-mini Standard Tier 4 | GPT-5.4-mini Tier 5, Scale Tier, or Reserved Capacity for 100+ fresh workflow compilations/min | Tier 4 gives 10M TPM, enough for roughly 20 fresh 15-step workflow compilations/min at the current token shape; Tier 5 gives 180M TPM for much larger bursts |
| Starter / Pro Together | Gemma 4 31B serverless for low-volume intent/text fallback | Dedicated endpoint replicas during known compile bursts | Together serverless limits are dynamic and can throttle sudden spikes; dedicated endpoints provide reserved hardware and predictable latency |
| Enterprise OpenAI | GPT-5.4 Tier 4 for normal Enterprise compile traffic | GPT-5.4 Tier 5, Scale Tier, or Reserved Capacity | Tier 4 gives 4M TPM; Tier 5 gives 40M TPM for heavier Enterprise bursts |
| Enterprise Anthropic | Claude Sonnet 4.6 Vision with standard limits | Priority Tier or custom Enterprise limits | Standard Anthropic limits are caps, not guaranteed minimum throughput; bursty vision workloads should use priority or negotiated limits |

OpenAI Priority processing should be used only for latency-sensitive compile jobs. It improves speed/reliability but shares the same rate limits, so it does not replace Tier 5, Scale Tier, or Reserved Capacity for very large bursts. Together dedicated endpoints can be started for planned compilation windows and stopped afterward; billing is per-minute by hardware while the endpoint is running.

---

### 3. Dashboard Hosting (Monthly Fixed)

Companies log into the Conxa dashboard to:
- View analytics (runs, success rate, recovery rate, who used what)
- Manage plugin versions (publish, rollback, deprecate)
- Download installer artifacts (.exe per platform)
- Configure billing and team access

Traffic is low — these are **companies**, not millions of end users. A company might check the dashboard 5–10 times a day, not 5 times a second.

| Scale | Companies | Dashboard Requests/Day | Backend Cost | DB Cost | Total |
|-------|-----------|------------------------|-------------|---------|-------|
| MVP | 10 | ~500 | $20 | $15 | **$35** |
| Growth | 100 | ~5,000 | $50 | $30 | **$80** |
| Scale | 500 | ~25,000 | $150 | $80 | **$230** |
| Enterprise | 2,000 | ~100,000 | $500 | $200 | **$700** |

Dashboard is not a cost problem. It scales gracefully because it's company-facing, not end-user-facing.

---

### 4. Telemetry Ingestion (Scales With Customer Base)

Every time a customer runs a workflow anywhere in the world, a telemetry event flows back to Conxa. This is where costs actually scale — not with companies, but with the combined size of all their customer bases.

**Telemetry payload per execution:** ~1–2KB (run ID, plugin ID, step outcomes, recovery tiers reached, timestamps)

| Scale | Companies | Avg Customers/Company | Daily Runs | Monthly Telemetry Events | Ingestion Cost |
|-------|-----------|----------------------|------------|--------------------------|---------------|
| MVP | 10 | 100 | 1,000 | 30K | $5 |
| Growth | 100 | 500 | 50,000 | 1.5M | $50 |
| Scale | 500 | 2,000 | 1,000,000 | 30M | $500 |
| Enterprise | 2,000 | 5,000 | 10,000,000 | 300M | $3,000 |

**Telemetry stack:** Events hit the `/api/v1/tracking` endpoint → write to append-only log → aggregate into analytics tables daily. No real-time processing needed; companies are fine seeing yesterday's data.

**Retention policy:** Because Conxa already tracks runs, recovery attempts, success/failure outcomes, and adoption telemetry, data retention is both a product feature and a storage-control lever. Shorter retention keeps Free/Starter storage small; longer Pro/Enterprise retention gives companies more historical analytics without changing the execution model.

---

### 5. Plugin Update Sync (Per Update Release)

When a company ships a plugin update, customers pull the new version. The `/skill-packs/*` endpoint serves the updated plugin package.

| Component | Cost | Notes |
|-----------|------|-------|
| Storage per plugin version | ~$0.01/GB | Compiled plugin packages are small (~5–50MB) |
| CDN bandwidth per update rollout | ~$0.01/GB | 100 customers × 10MB = 1GB = $0.01 |
| **Total per update** | **~$0.02–0.10** | Negligible |

---

### 6. Execution-Time Recovery Tiers (Customer-Side, Not Billed to Conxa)

Recovery cost during execution is paid by the **customer's own Claude Desktop subscription or API key**, never by Conxa (see "What Conxa Actually Does" above). It's documented here anyway because it drives the cost/latency the *customer* experiences per step, and because compile-time decisions (selector quality, `recovery.json` fallback richness) directly change how often a run reaches the expensive tiers.

The runtime resolves each step through up to four tiers (`docs/TRD.md` §10.1, the authoritative tier table): **Tier 1** (in-process exception ladder), **Tier 2** (in-process a11y/fallback re-derivation using `recovery.json`'s `selector_context`), and **Tier 3/4** (agent-mediated — the runtime bundles a semantic block and a vision block into one structured request back to the MCP client, which is Claude itself). Tiers 1–2 are zero-token by design; Tiers 3/4 are not a separate escalation from each other — they arrive as one combined recovery payload, so they're priced and timed together below.

| Outcome | LLM tokens | Who pays | Added wall time vs. a normal step | Basis |
|---|---|---|---|---|
| **No recovery needed** (primary selector hits) | 0 | — | none — baseline step time (~6–8s, mostly page interaction/wait) | Observed baseline from `transient_recovered`/normal steps in a live run |
| **Tier 1** (exception ladder) | 0 | — | ~none — absorbed into the same step timeout | `recovery.js` L1, in-process |
| **Tier 2** (a11y/fallback re-derivation) | 0 | — | ~none — comparable to baseline (~6.4s observed) | `recovery.js` L2, reads `recovery.json`'s `selector_context`, in-process |
| **Tier 3/4** (agent-mediated — semantic + vision, one combined request) | ~2,500–3,500 tokens/occurrence (screenshot ≈1,300–1,400 tokens by Claude's image formula, DOM/interactive-element inventory ≈800–2,000 tokens, Claude's `step_overrides` fix response ≈150–300 tokens; tool schemas are a one-time per-conversation cost, mostly cache-read after the first call) | **Customer's own Claude subscription/API — never Conxa** | **+10–15s** per occurrence (observed: T1/T2 exhaustion ~10–17s before escalating, then ~5–8s of agent reasoning latency to produce the fix) | Real measured run: two deliberately-broken steps in an 8-step workflow, recovered via Tier 3/4, `~20–22s` total step time vs. ~7s baseline |

**Caveats on the token figures:** these are estimates, not exact counts. Measuring the *real* number requires either an Anthropic API key (to run `messages.count_tokens` against the reconstructed recovery payload) or Console usage access — neither was available when this was measured, and the recovery screenshot/DOM payload isn't persisted to disk, so it can't be re-measured after the fact. The wall-clock timings, by contrast, are exact — pulled directly from `~/.conxa/logs/recovery.log` timestamps (`terminal_failure` → `agent_recovery_requested` → `agent_override_applied` → `recovery_park_resumed`).

#### Tier 3 vs. Tier 4 Cost Breakdown

The runtime bundles Tier 3 (semantic) and Tier 4 (vision) into one combined recovery request today — there's no code path that fires one without the other. The table below splits out what each *signal* contributes to that combined payload, so the ~2,500–3,500 combined figure above isn't a black box:

| Signal alone | What's in it | ~Tokens/occurrence |
|---|---|---|
| **Tier 3 only** (semantic) | DOM/interactive-element inventory (~800–2,000) + Claude's `step_overrides` fix response (~150–300) | **~1,400–1,850** (typical ~1,625) |
| **Tier 4 only** (vision) | Screenshot, Claude's image-token formula (~1,300–1,400) + fix response (~150–300) | **~1,450–1,700** (typical ~1,575) |
| **Tier 3 + 4 combined** (what actually happens today) | DOM inventory + screenshot + **one** shared fix response (not two — the combined request gets one fix, not one per signal) | **~2,500–3,500** (typical ~3,000) |

#### Worked Examples — Full Workflow Run

Using the ~3,000-token typical combined Tier 3/4 cost and the actual 8-step workflow this cascade was tested against. **Baseline** (~1,200 tokens) is the one-time cost of a clean `execute_skill` round trip: the MCP tool schemas (mostly a cache-read after the first call in a conversation), the tool call itself, and a short "Done." result — no recovery payload at all. Each recovery occurrence is additive on top of that:

| Scenario | Tier 3/4 occurrences | Token math | **Total tokens** |
|---|---|---|---|
| Perfectly run workflow (no recovery) | 0 | ~1,200 baseline | **~1,200** |
| 1 LLM recovery | 1 | 1,200 + (1 × 3,000) | **~4,200** |
| 2 LLM recoveries | 2 | 1,200 + (2 × 3,000) | **~7,200** |
| 3 LLM recoveries | 3 | 1,200 + (3 × 3,000) | **~10,200** |

These are per-workflow-run figures, not per-step — most steps in a healthy workflow resolve via Tier 1/2 (zero tokens) and never show up in this table at all. The number that matters for a given workflow is simply how many of its steps are weak enough to fall through to Tier 3/4 on a given run; each one adds roughly one more ~3,000-token increment above.

**Why this matters for compile-time decisions:** every step that reaches Tier 3/4 costs the *customer* real tokens and ~15 extra seconds, on top of Conxa's own compile-time incentive to keep selectors strong. A workflow with weak `IdentityBundle` signals and a thin `recovery.json` (missing `selector_context.alternatives`, sparse `anchors`) will lean on Tier 3/4 more often in production — worse customer experience, even though it costs Conxa nothing directly. Selector/anchor quality at compile time is the only lever that controls this.

#### What This Costs the End Customer Running a Plugin Locally

The end customer (the person running the installed `.exe` via Claude Desktop) is not billed by Conxa at all for execution — it draws entirely against **their own Claude Pro/Max subscription usage allowance** (or their own API key, if that's how their Claude Desktop is configured). There is no incremental dollar cost as long as they're inside their plan's existing session limit — the only "cost" is how many of their allotted messages a workflow run consumes.

Anthropic doesn't publish exact message counts (they vary by message/attachment length, conversation length, and model — see the Claude Help Center's ["How do usage and length limits work?"](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work)), and that remains true as of the August 2026 re-check — the support article describes the mechanism, not fixed counts. Commonly-cited approximate 5-hour session allowances (re-confirmed against current community reporting, which puts Pro at roughly 10–45, Max 5x at 50–225, and Max 20x at 200–900) are:

| Plan | Price | ~Messages / 5-hour session |
|---|---|---|
| Pro | $20/mo | ~45 |
| Max 5x | $100/mo | ~225 |
| Max 20x | $200/mo | ~900 |

A Conxa `execute_skill` call maps roughly to **1 message-equivalent per attempt**: a clean run (no recovery) is 1 message; each Tier 3/4 occurrence needs one more (the runtime's recovery request + the agent's follow-up `execute_skill` call with `step_overrides`) — Tier 1/2 recoveries are free, in-process, and don't add a message. So:

| Plan | ~Clean runs / 5hr (0 recoveries) | ~Runs / 5hr (avg. 1 recovery/run) | ~Runs / 5hr (avg. 2 recoveries/run) |
|---|---|---|---|
| Pro | ~45 | ~22 | ~15 |
| Max 5x | ~225 | ~112 | ~75 |
| Max 20x | ~900 | ~450 | ~300 |

**Bottom line for customer-facing messaging:** running Conxa-built workflows costs a Pro/Max subscriber $0 extra — it just draws down their existing 5-hour message allowance, same as any other Claude Desktop conversation. The number of runs they can fit in a session depends almost entirely on how often the workflow needs Tier 3/4 recovery, which is why compile-time selector/anchor quality (above) is the thing that actually protects their usage budget, not anything Conxa charges for.

---

### Total Monthly Operating Cost

Assumes blended compilation cost before Human Edit reserve: **~$0.075** for Starter/Pro traffic and **~$0.292** for Enterprise-grade traffic. Plugin packaging itself is treated as materially free.

| Scale | Companies | Workflow Compilations/Month | Compilation | Dashboard | Telemetry | Updates | **Total/Month** |
|-------|-----------|--------------|-------------|-----------|-----------|---------|-----------------|
| MVP | 10 | 20 Starter/Pro | ~$1.50 | $35 | $5 | $2 | **~$44** |
| Growth | 100 | 200 Starter/Pro | ~$15 | $80 | $50 | $20 | **~$165** |
| Scale | 500 | 1,000 Starter/Pro | ~$75 | $230 | $500 | $100 | **~$905** |
| Enterprise | 2,000 | 5,000 Enterprise-grade | ~$1,460 | $700 | $3,000 | $400 | **~$5,560** |

**Cost note:** Selector generation is deterministic and costs zero tokens. Compilation LLM cost is driven solely by intent + vision anchor calls. Vision anchor cache hit rate (same screenshot hash on recompile) is the primary cost lever — high-cache-hit recompilations cost ~80% less than fresh compilations.

---

## Revenue Model

**Revision note (2026-08-08):** Repriced and repositioned following the Centelon pilot demo (7 Aug 2026)
around a capability ladder rather than a flat feature list — see `docs/PRD.md` §11 and
`docs/Implementation-Plan.md`. Pricing moved from USD to INR; the installer-slot meter was removed
entirely (a workspace may publish under unlimited product slugs on any tier); a machines meter replaced
it as the trial-abuse control; and Free became a 30-day trial rather than a permanent tier. Revenue
figures below are in INR; LLM provider COGS is still billed in USD by the providers, converted here at
an indicative ₹83/USD — recompute against the live rate before using these numbers for planning.

Companies pay Conxa to **build and maintain** their Claude-compatible plugin. They think about it the
same way they think about their mobile app on the App Store — there's a platform fee to be listed and
maintained, not a per-download fee.

### Tier Design Principles

**What companies actually look like:**
- They buy Conxa like a subscription product, not like an API meter.
- They build a small number of live plugins - each plugin maps to a product, customer segment, or branded installer.
- Each live plugin contains many workflows covering the tasks their customers ask Claude to perform.
- They iterate heavily during the first month, then settle into lower-volume maintenance.
- They do not want to think in tokens, credits, or per-compilation billing.

**Pricing is a capability ladder, not just four bigger numbers.** Each tier unlocks what a workspace can
*do*, not only how much: Free proves the product works on one machine before a 30-day trial ends,
Starter and Pro run it internally across a team, and Pro and Enterprise can distribute externally to
customers (Conxa-branded on Pro, white-label on Enterprise). See the capability ladder in
`docs/PRD.md` §11.

**The public pricing axis is subscription tier + four visible meters.** Customers see seats, machines,
monthly compile credits, and the monthly Human Edit pool. Local plugin creation and workflow recording
are unlimited; workflow count and product-slug count are no longer visible quotas — reach is gated by
distribution capability, not a count.

This keeps the buying motion close to "Claude Pro / Max" instead of "cloud API usage." A customer
chooses the plan that matches how far they need to reach, then Conxa quietly manages compile cost
behind the scenes.

---

### Build Lifecycle Economics

The highest LLM cost is usually concentrated in the first month after a company creates a plugin. That is when teams record many workflows, use Human Edit heavily, and recompile repeatedly while polishing the installer.

After that, the same company often updates only 1–2 workflows per month. At that point Conxa's direct LLM cost drops sharply, but the customer still pays the full monthly subscription because Conxa is still providing the platform surface that keeps the plugin useful.

| Phase | Typical behavior | Conxa cost pattern | Why monthly billing still applies |
|-------|------------------|--------------------|-----------------------------------|
| Initial build month | 50–300+ compilations, frequent Human Edit, repeated plugin builds and tests | High LLM usage; full tier cap matters | Customer is creating and stabilizing the product |
| Maintenance months | 1–2 workflow updates/month, occasional plugin rebuilds | Low LLM usage; dashboard/telemetry/signing dominate | Plugin remains live, signed, tracked, updateable, and supported |
| Conxa platform updates | Conxa ships runtime, healing, recovery, or signing updates | Mostly platform engineering and update-sync cost | Customers benefit even without recompiling their workflows |

Example: a Starter customer with 1 live plugin and 50 workflows might recompile heavily in month 1 while polishing the installer. That build-heavy month is bounded directly by the plan's monthly compile-credit allowance (recompiles spend a credit just like first compiles), plus add-on credit packs if they run out. In month 2, the same customer might update only 1-2 workflows, while still paying for dashboard analytics, signing, telemetry retention, update delivery, and Conxa runtime/healing improvements.

This is why margins improve after the first build month. The cap protects Conxa during build-heavy periods; the subscription captures the ongoing value after the plugin is live.

---

### Pricing Tiers

**Customer-facing meters:**
- **Seats** - people who can use the dashboard / Build Studio for the workspace.
- **Machines** - distinct devices a workspace can build from. Replaces the old installer-slot meter (removed 2026-08-08 — a workspace may now publish under unlimited product slugs on every tier); this is the control that keeps a single-machine free trial from quietly becoming a free Pro seat.
- **Compile credits** - monthly UTC fresh-compile credits. A fresh workflow compile consumes 1 credit. Starter and Pro can buy +25 credits/mo add-on packs (₹4,999 each) that stack on the base allowance.
- **Human Edit pool** - monthly UTC token pool for editor-triggered LLM work only: selector repair (1-click fix), semantic repair, visual re-anchor, and screenshot/bbox anchor regeneration (the "draw a new region" retarget wizard). Recompiling a whole workflow is billed like a first compile — see Compile credits above — not from this pool.

Local plugin creation, workflow recording, plugin package builds before testing, deterministic Human Edit patches, reorder/delete/input edits, validation edits, and sign-off remain unlimited.

**Capability gates (not numeric meters):**
- **Distribution** - internal-only (Free, Starter) vs. external distribution to customers (Pro, Enterprise). Free is additionally capped at 1 install.
- **Installer branding** - Conxa-branded through Pro; white-label is Enterprise only.
- **Ops tier** - none (Free) / basic, runs list only (Starter) / full, + drift detection, healing, audit export (Pro, Enterprise).
- **BYOK** - Enterprise only, Azure OpenAI. Compile credits still apply on BYOK — credits meter reach, not Conxa's token cost.

**Internal controls, not public meters:**
- Active installs
- Monthly customer-side runs
- Telemetry events and retention cost
- Burst queue priority
- Per-provider COGS and cache hit rate

| | **Free** | **Starter** | **Pro** | **Enterprise** |
|--|----------|-------------|---------|----------------|
| **Price** | **₹0 · 30-day trial** | **₹19,999/mo** | **₹49,999/mo** | Custom, from ₹99,999/mo |
| **Seats** | 1 | 3 | 10 | Custom override |
| **Machines** | 1 | 3 | 10 | Custom override |
| **Compile credits / month** | 25 | 200 | 500 | Unlimited |
| **Human Edit pool / month** | 500K tokens | 2.5M tokens | 10M tokens | Custom override |
| **Distribution** | Internal, 1 install | Internal | External, Conxa-branded | External, white-label |
| **Ops tier** | None | Basic | Full | Full + SSO |
| **Analytics retention** | None | 90 days | 1 year | Custom |
| **Build speed** | Standard queue | Priority | Highest priority | SLA-backed |
| **BYOK** | No | No | No | Yes (Azure OpenAI) |
| **Support** | Community | Priority email | Priority + onboarding | SLA / private channel |

**Why compile credits are visible:**
Compiling is the clearest proxy for expensive extraction work. Customers can record and re-record as many workflows as they need locally at no cost, but every time they ask Conxa to turn a workflow into execution data — whether that's the first compile or a recompile after re-recording — it consumes 1 monthly compile credit.

**Why Human Edit is separate:**
Editing an already-compiled workflow (selector repair, semantic repair, visual re-anchor) is a different product action from compiling — it's a targeted quality-improvement loop on an existing skill, not a full recompile, so it draws from the Human Edit token pool instead. Deterministic edits stay available even when the pool is exhausted.

**Recommended hard gates:**
- Compile is blocked — first compile or recompile alike — when monthly compile credits are exhausted, or when a free trial has passed its 30-day window.
- LLM-assisted Human Edit actions (selector/semantic repair, visual re-anchor) are blocked when the Human Edit pool is exhausted.
- A new build machine is blocked once the plan's machine limit is reached; a machine already registered keeps working.
- Publishing an external, customer-facing installer is blocked below Pro; custom branding is blocked below Enterprise.
- Seat usage is metered immediately. Hard enforcement requires a Conxa-controlled invite API or Clerk webhook cleanup.

**Upgrade path:** Free proves the product works, on one machine, for 30 days. Starter is the first paid tier — one team automating its own processes internally. Pro adds external distribution, the full ops dashboard, and drift detection — an enterprise running its own org, or a vendor scaling as a channel. Enterprise adds white-label distribution, BYOK, SSO, and explicit custom usage overrides — a SaaS vendor or consultancy shipping to its own customers.

---

### Cost Per Tier (What Conxa Spends)

Using recalculated LLM costs from current provider pricing. The customer sees subscriptions; Conxa
models an internal build-heavy month for margin planning. Revenue is INR (what's actually charged);
COGS is estimated in USD (what LLM providers actually bill) and converted at an indicative ₹83/USD for
the margin line — **recompute against the live rate and current provider pricing before using these
numbers for planning.** Compile credits and the Human Edit pool both dropped from the prior pricing
sheet (Starter: 300→200 credits, 10M→2.5M Human Edit tokens; Pro: 1,000→500 credits, 50M→10M tokens),
so build-heavy-month COGS should scale down roughly in proportion — the ranges below are a first pass,
not a re-derivation from current per-token provider pricing.

| | **Free** | **Starter** | **Pro** | **Enterprise** |
|--|-----------|-------------|---------|----------------|
| LLM provider | Free-tier rotation + standard queue | Premium pool (`compile_pool="premium"`) | Premium pool, priority queue | BYOK (Azure OpenAI) or premium |
| Seats | 1 | 3 | 10 | Contracted |
| Machines | 1 | 3 | 10 | Contracted |
| Compile credits / month | 25 | 200 | 500 | Unlimited |
| Human Edit pool | 500K tokens | 2.5M tokens | 10M tokens | Contracted |
| Internal build-month envelope | ~25 fresh compiles | ~200 fresh compiles | ~500 fresh compiles | Contracted |
| Compile + Human Edit planning cost (indicative) | **~$1–$5** | **~$14–$23** | **~$44–$60** | Contracted |
| Infra, telemetry, installer, payment-fee reserve | **~$10–$20** | **~$25–$40** | **~$65–$105** | Contracted |
| **Total cost/company in build-heavy month (indicative)** | **~$11–$25 CAC** | **~$39–$63** | **~$109–$165** | Contracted |
| **Revenue** | ₹0 | **₹19,999 (~$241)** | **₹49,999 (~$602)** | Custom, from ₹99,999 |
| **Build-heavy gross margin (indicative)** | — | **~74–84%** | **~73–82%** | Contract-dependent |
| **Maintenance-month gross margin** | — | **~90%+** | **~90%+** | Contract-dependent |

**Pricing implication:** The four visible meters keep expectations clear while protecting Conxa from
unbounded compile and repair loops. The 30-day trial replaces the old "free forever" framing as the
qualification motion; revenue now comes entirely from Starter, Pro, and Enterprise. Pro is the highest
self-serve tier and where external distribution unlocks; anything beyond Pro — white-label, BYOK, SSO,
explicit usage overrides — moves to Enterprise.

---

## Unit Economics

These scenarios assume a conservative build-heavy month using midpoint cost estimates from the tier
table, converted at the same indicative ₹83/USD used above. Maintenance months are materially cheaper
because live plugins usually receive only 1-2 workflow updates while still paying for dashboard,
signing, telemetry, support, update delivery, and Conxa healing/runtime improvements.

### Scenario A: MVP (10 Companies)
Mix: 7 Starter, 3 Pro

| | Value |
|-|-------|
| **Monthly Revenue** | (7 x ₹19,999) + (3 x ₹49,999) = **₹2,89,990** (~$3,494) |
| Build-heavy COGS (indicative) | **~₹64,000** (~$770) |
| **Gross Margin (indicative)** | **~78%** |
| **Monthly Profit (indicative)** | **~+₹2,26,000** |

**Break-even:** 1-2 paying companies covers baseline cloud infrastructure. The 30-day free trial's
costs should be treated as acquisition spend, bounded by the machine-limit control rather than an
open-ended free tier.

---

### Scenario B: Growth (100 Companies)
Mix: 70 Starter, 30 Pro

| | Value |
|-|-------|
| **Monthly Revenue** | (70 x ₹19,999) + (30 x ₹49,999) = **₹28,99,900** (~$34,938) |
| Build-heavy COGS (indicative) | **~₹6,40,000** (~$7,700) |
| **Gross Margin (indicative)** | **~78%** |
| **Monthly Profit (indicative)** | **~+₹22,60,000** |

---

### Scenario C: Scale (500 Companies)
Mix: 300 Starter, 200 Pro

| | Value |
|-|-------|
| **Monthly Revenue** | (300 x ₹19,999) + (200 x ₹49,999) = **₹1,59,99,500** (~$192,765) |
| Build-heavy COGS (indicative) | **~₹35,20,000** (~$42,400) |
| **Gross Margin (indicative)** | **~78%** |
| **Monthly Profit (indicative)** | **~+₹1,24,80,000** |

---

### Scenario D: Enterprise-Heavy (2,000 Companies)
Mix: 1,000 Starter, 800 Pro, 200 Enterprise at ₹8,30,000 (~$10K) average contract value

| | Value |
|-|-------|
| **Monthly Revenue (indicative)** | **~₹18.9 crore** (~$2.28M) |
| Build-heavy COGS (indicative) | **~₹4.65 crore** (~$560K) |
| **Gross Margin (indicative)** | **~75%** |
| **Monthly Profit (indicative)** | **~+₹14.3 crore** (~$1.72M, ~$20.6M/year) |

Enterprise contracts should be priced from the customer's requested seats, machines, compile credits,
Human Edit pool, active installs, telemetry retention, support SLA, BYOK, and SSO. Do not sell
"unlimited" Enterprise unless the contract has a negotiated usage envelope behind it.

---

## Growth Milestones

| Milestone | Companies | Monthly Revenue | Monthly Cost | Profit | Key Actions |
|-----------|-----------|-----------------|--------------|--------|-------------|
| **MVP live** | 10 | ~₹2.9L | ~₹0.64L | +₹2.26L | Ship subscription billing; enforce compile credits, Human Edit pool, machine limit, and trial expiry |
| **Beta** | 50 | ~₹14.5L | ~₹3.2L | +₹11.3L | Dashboard usage meters for seats, machines, compile credits, and Human Edit pool |
| **Growth** | 100 | ~₹29.0L | ~₹6.4L | +₹22.6L | Priority build queue, internal COGS alerts, fair-use throttles |
| **Scale** | 500 | ~₹1.6Cr | ~₹35.2L | +₹1.25Cr | Negotiate provider discounts; add Enterprise sales motion |
| **Enterprise** | 2,000 | ~₹18.9Cr | ~₹4.65Cr | +₹14.3Cr | SLA support, custom retention, reserved provider capacity |

---

## What Companies Actually Get

It's worth being explicit about the value proposition so pricing feels justified.

**Without Conxa:**
- Build a custom MCP server from scratch
- Write and maintain Playwright automation scripts
- Handle selector drift when websites update
- Build telemetry and analytics from scratch
- Maintain installers for Windows and Mac
- Manage distribution and updates

**With Conxa:**
- Record workflows in the Build Studio
- Build a signed `.exe` to distribute to customers
- See dashboard analytics for usage, success, failure, and recovery
- Push plugin updates without customers reinstalling
- Give Claude Desktop local MCP tools backed by precompiled workflows
- Keep the plugin signed, trackable, updateable, and supported after the build-heavy first month
- Receive Conxa runtime/healing improvements without rebuilding the product from scratch

**At ₹0, 30-day trial (Free):** A company gets 1 seat, 1 machine, 25 monthly compile credits, and 500K monthly Human Edit tokens — full self-healing, internal use only, one install — enough to prove that Conxa works on their product before paying.

**At ₹19,999/month (Starter):** A company gets 3 seats, 3 machines, 200 monthly compile credits, 2.5M monthly Human Edit tokens, priority builds, and 90-day analytics retention. Distribution stays internal-only. This is the first paid, one-team tier.

**At ₹49,999/month (Pro):** A company gets 10 seats, 10 machines, 500 monthly compile credits, 10M monthly Human Edit tokens, external distribution with a Conxa-branded installer, the full ops dashboard with drift detection, highest-priority self-serve builds, and 1-year retention. This is the highest self-serve tier — an enterprise running its own org, or a vendor scaling as a channel.

---

## Cost Levers

### Biggest Impact

**1. Caching is your biggest natural lever (already built)**  
Intent and vision anchor calls are cached by element hash (`intent_llm.py`, `anchor_vision_llm.py`). A Starter/Pro recompile where 3 steps changed costs ~$0.11, not ~$0.54. Companies iterating daily are still cheap, but internal fair-use alerts should watch customers that repeatedly hit build-heavy usage patterns.

**2. Usage naturally drops after launch**
Most companies spend the first month building and polishing the plugin, then move to 1–2 updates per month. This makes ongoing LLM cost much lower than the full-cap build-month model while subscription revenue continues for dashboard, signing, telemetry retention, support, update delivery, and Conxa healing/runtime updates.

**3. Four visible meters, plus capability gates**
Seats, machines, compile credits, and Human Edit pool are the cleanest customer-visible numeric controls. Workflow recording and plugin creation stay unlimited — there is no limit on how many product slugs a workspace can publish under — while expensive LLM-heavy extraction/repair loops are bounded by the meters, and external distribution reach is bounded by which tier a workspace is on rather than a count.

**4. Vision anchor cache hit rate**
Vision anchor calls dominate compilation cost. Cache hits (same screenshot hash) cost zero tokens. Apps that recompile with minimal visual DOM change will have high anchor cache hit rates, making recompiles near-free. The cache key is the screenshot hash — stable page designs recompile at ~80% lower cost. Adding a "cache hit %" column to the build report gives companies visibility into their recompile efficiency.

**5. Provider volume discounts at scale**
At $10K+/month provider spend (~500 companies), negotiate committed-use pricing for GPT-5.4-mini, GPT-5.4, Gemma 4 31B, and Claude Vision. Target 20–30% reduction = saves meaningful cost at Scale stage.

**6. Telemetry storage efficiency**
At Enterprise scale (300M events/month), aggregation is important. Roll up raw events into daily summaries after 7 days. Companies rarely need to query individual run-level data older than 1 week. Reduces storage cost by 70–80%.

**7. Free tier is customer acquisition cost**
Free is now a 30-day trial capped at 1 machine, 25 compile credits, and 500K Human Edit tokens, so it should be protected by the machine-limit enforcement and free-tier provider routing. It is still worth offering because it proves product value before procurement — and the trial window bounds how long that acquisition cost runs.

**8. Update CDN costs**
Already negligible. Only matters if plugins become large (>100MB). Keep plugin packages data-only (no embedded browser binaries). Currently well-controlled.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Customers expect unlimited fresh compiles because recording is unlimited | Support and compile surface grows without matching revenue | Show compile credits explicitly; block first compile when credits are exhausted |
| A Starter/Free workspace tries to distribute externally to bypass the ladder | Undermines the Pro/Enterprise revenue tier | Server-side distribution gate on installer upload and publish, independent of Studio UI hiding |
| Human Edit pool is exhausted by repeated repair loops | Margin erosion and degraded edit experience | Track text + vision token usage by workspace; block only LLM-assisted edits when the pool is exhausted |
| Telemetry volume explodes unexpectedly | $500 -> $5K/month infra cost | Implement event sampling for healthy runs; keep 100% of failures and recovery events |
| Enterprise customer asks for "unlimited" under a fixed price | Contract becomes negative margin | Sell Enterprise as custom usage envelope: seats, machines, compile credits, Human Edit pool, active installs, retention, SLA, BYOK |
| High churn because customers don't adopt `.exe` | Companies cancel from low ROI | Instrument adoption rate; alert company when <20% of target customers installed |
| Concurrency spikes during compilation | Build queue backs up or providers return 429 | Async compilation with job queue (`/api/v1/jobs`); use provider priority tiers and reserved capacity only when cohort demand proves it |

---

## What to Measure

### Company Health (Track Weekly)
- Active companies (logged in past 7 days)
- New companies added
- Churned companies (cancelled or unpaid)
- Net Revenue Retention (NRR) — are existing companies upgrading or downgrading?

### Build Pipeline (Track Per-Build)
- Compilation success/failure rate
- LLM cost per build
- Build time (p50/p95)
- Selector confidence score (quality proxy)
- First-month vs maintenance-month compilation volume

### Subscription Capacity (Track Daily)
- Seats used vs. plan limit
- Machines used vs. plan limit
- Compile credits used/reserved vs. monthly limit (including add-on packs)
- Human Edit pool used vs. monthly limit
- Blocked fresh compile, LLM-assisted Human Edit, new-machine, external-distribution, and trial-expired attempts
- Upgrade prompts shown and conversion rate

### Plugin Adoption (Track Daily)
- Installs per plugin (how many customers installed the .exe)
- Active installs (ran at least once in last 7 days)
- Adoption rate = active installs / total installs
- Plugin age and update cadence (build-heavy launch month vs 1–2 updates/month maintenance mode)

### Telemetry Quality (Track Daily)
- Total runs reported
- Success rate (primary selector hit, no recovery)
- Recovery rate (needed Tier 1–4 — there are four tiers, not five; see `docs/TRD.md` §10.1)
- Free-repair share: steps that finished **without ever** reaching a paid Tier 3/4 LLM call. Count
  outcomes per step, not attempts — counting attempts double-counts a step that tried two free
  methods and wrongly counts a step that tried a free method, failed, then paid for an LLM call
- Unresolved failures (all four tiers exhausted)

As of 2026-08-07 these are no longer manual queries — the operations dashboard computes them
(`app/services/tracking_analytics.py`, surfaced on `/dashboard/healing` and the overview health
score), so the figures in this doc can be checked against measured fleet data rather than estimates.

### Infrastructure Cost (Track Monthly)
- Compilation LLM cost vs. forecast
- Telemetry ingestion cost vs. forecast
- Dashboard hosting vs. forecast
- Total cost as % of revenue by tier (watch repeated fair-use outliers and Enterprise custom contracts)
- Maintenance-month margin after the initial build period

---

## Next Steps

### Week 1–2: Pricing & Billing
- [x] Confirm final public tier limits: Free = 1 seat / 1 installer slot / 50 compile credits / 1M Human Edit tokens; Starter = 3 / 3 / 300 / 10M; Pro = 10 / 10 / 1,000 / 50M; Enterprise = explicit overrides.
- [x] Create Razorpay subscription plan names with `basic` mapped to `starter`.
- [x] Add entitlement fields to subscription state through plan defaults plus `entitlement_overrides`.
- [x] Build tier enforcement in `conxa-cloud/backend/app/services/entitlements.py`:
  - Track monthly compile credit usage and active reservations per workspace.
  - Track Human Edit text + vision token usage by `usage_class`.
  - Derive installer slots from hosted installer metadata and plugin installer records.
  - Leave plugin creation, workflow recording, and local package builds unlimited.
  - Return stable limit codes such as `compile_credit_limit_exceeded`, `human_edit_pool_exceeded`, and `installer_limit_exceeded`.

### Week 3–4: Instrumentation & Dashboard
- [x] Track per-compilation LLM usage separately from Human Edit usage.
- [x] Track Human Edit text + vision token usage against the plan pool.
- [x] Show companies simple subscription usage: seats, installer slots, compile credits, Human Edit pool.
- [ ] Add internal fair-use alerts for repeated compile/Human Edit outliers and reserve exhaustion.
- [ ] Build customer alerts at 80% of compile credits, Human Edit pool, machines, and seats.
- [ ] Test billing end-to-end: Free trial -> Starter -> visible limit hit -> upgrade -> limits reset.
- [x] Repriced to the capability ladder (2026-08-08): removed the installer-slot limit, added machines,
  30-day trial expiry, distribution/white-label/ops_tier/BYOK capability gates, and a compile-credit
  add-on. See `docs/PRD.md` §11 and `docs/Implementation-Plan.md`.

### Month 2: Validation
- [ ] Onboard 5–10 pilot companies on the Free trial
- [ ] Measure workflows per plugin, product slugs per workspace, installer rebuild frequency, fresh compiles, Human Edit use, and active installs.
- [ ] Measure internal P50/P95 compilations per active workflow so compile-credit envelopes can be tuned.
- [ ] Validate whether Starter's 300 compile credits and 10M Human Edit tokens feel like the natural product-team tier.
- [ ] Collect feedback: do customers understand the four meters without asking for a workflow-count meter?

### Ongoing
- [ ] Monthly: actual cost vs. forecast per tier and per build-heavy cohort
- [ ] Quarterly: pricing review based on cohort usage data
- [ ] At 5,000 internal compilations/month: review provider volume discounts and burst-capacity tier upgrades

---

## Related Documents

- `docs/TRD.md` — Technical deep-dive (compilation pipeline, runtime, recovery cascade)
- `docs/App-Flow.md` — End-to-end product flows
- `docs/Backend-Schema.md` — Billing, telemetry, and storage contracts
- `conxa-cloud/backend/ROUTER_SETUP.md` — Multi-provider LLM setup
- `AGENTS.md` — Repository layout and development instructions

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-08-09 | Kiran | v19: Re-verified all LLM provider pricing against current provider docs (previously checked June 3, 2026) — GPT-5.4-mini, GPT-5.4, Together AI Gemma 4 31B, and Claude Sonnet 4.6 are all **unchanged**. Added real Claude Opus 4.8/5 pricing ($5/$25 per MTok, down from the retired Opus 4.1's $15/$75) in place of the old unpriced "quality upgrade path" note. Flagged new Claude Sonnet 5 introductory pricing ($2/$10 through Aug 31, 2026, converging to Sonnet 4.6's $3/$15 on Sept 1) — not worth a router migration for the discount alone. Replaced the free-tier plan's vague "$0.075/1M" shadow price with the actual current Gemini Flash-Lite rate ($0.10/1M) and recomputed the notional free-plan cost figures accordingly (real Conxa cost remains $0). Documented concrete, sourced free-tier rate limits for Groq (30 req/min, 6,000 TPM, 14,400 req/day), Google AI Studio (5–15 req/min, 1,000 req/day — noting Google pulled Pro-family Gemini models from the free tier on April 1, 2026, leaving only Flash/Flash-Lite eligible), and NVIDIA NIM (~40 req/min, 1,000 free credits). Fixed the stale "Last Updated" header, which still read July 2 despite the doc's own revision history extending to Aug 8. No changes to Conxa's own subscription pricing, tier structure, or unit economics — this pass only re-verified upstream LLM provider costs. |
| 2026-08-08 | Kiran | v18: Repriced around the capability ladder following the Centelon pilot demo (docs/PRD.md §11). Switched headline pricing from USD to INR (Starter ₹19,999/mo, Pro ₹49,999/mo, Enterprise from ₹99,999/mo). Removed the installer-slot meter entirely — no limit on how many product slugs a workspace publishes under; added a machines meter (1/3/10) as the trial-abuse and seat-integrity control instead. Free became a 30-day trial, capped at 1 install, rather than a permanent tier. Lowered compile credits (25/200/500) and Human Edit pool (500K/2.5M/10M) from the prior numbers. Added capability gates that aren't numeric meters: distribution (internal-only on Free/Starter, external on Pro/Enterprise), installer branding (Conxa on Pro, white-label on Enterprise), ops tier (none/basic/full), and BYOK (Azure OpenAI, Enterprise only). Added a compile-credit add-on (+25/mo for ₹4,999, Starter/Pro). Unit-economics scenarios and cost-per-tier tables recomputed at the new numbers; margins are marked indicative pending a full re-derivation from current per-token provider pricing. |
| 2026-08-07 | Kiran | v17: No economics changes. Corrected the "Telemetry Quality" metric list, which still referred to a five-tier cascade (there are four), and added the free-repair-share metric with its per-outcome counting rule. Noted that these metrics are now computed by the operations dashboard rather than estimated. |
| 2026-07-02 | Kiran | v16: Added "Execution-Time Recovery Tiers" section documenting per-tier token/time cost during customer-side execution (Tier 1/2 zero-token, Tier 3/4 ~2,500–3,500 tokens + 10–15s added per occurrence), based on a live manual test of the recovery cascade. Added a Tier 3-only vs Tier 4-only cost breakdown (~1,625 / ~1,575 tokens respectively vs. ~3,000 combined — they always fire bundled today) and worked full-workflow examples at 0/1/2/3 recovery occurrences (~1,200 / ~4,200 / ~7,200 / ~10,200 tokens). Also added "What This Costs the End Customer Running a Plugin Locally" — translates that into Claude Pro/Max 5-hour session message allowances (~45/225/900 msgs) and approximate workflow-runs-per-session at 0/1/2 avg. recoveries. All of this is customer-paid, not a Conxa cost — included for compile-time decision guidance and customer-facing messaging. |
| 2026-06-30 | Kiran | v15: Removed LLM selector generation from cost model — `IdentityBundle` + `selector_grammar.py` are now the sole selector generators (deterministic, zero tokens). Per-step LLM calls drop from 2–7 to a fixed 2 (intent + vision anchor). All cost tables, tier margins, scenario COGS, and cost levers updated accordingly. Build-heavy gross margin improves from ~56–67% to ~68–81% for Starter. |
| 2026-06-10 | Kiran | v14: Replaced visible workflow/plugin caps with four customer meters: seats, installer slots, monthly compile credits, and monthly Human Edit pool |
| 2026-06-07 | Kiran | v13: Added monthly Human Edit text + vision token reserves: Trial 1M, Starter 10M, Pro 50M, Enterprise custom |
| 2026-06-07 | Kiran | v12: Adjusted team seats to 1 / 3 / 10 across Trial, Starter, and Pro |
| 2026-06-07 | Kiran | v11: Removed monthly installer-build limits; plugin package builds are unlimited for testing, live installers follow the live-plugin caps, and analytics retention is now 14 days / 90 days / 1 year |
| 2026-06-07 | Kiran | v10: Removed the Max self-serve plan and shifted limits down: Trial receives the former Starter benefits, Starter receives the former Pro benefits at $299/month, and Pro receives the former Max benefits at $799/month |
| 2026-06-07 | Kiran | v9: Switched revenue model from public compilation credits to subscription-style Starter/Pro/Max tiers with visible live-plugin, workflow, installer-build, seat, and retention limits; added hard gates for `.exe` builds when plugin caps are reached |
| 2026-06-03 | Kiran | v8: Recalculated paid-plan compilation costs using current GPT-5.4-mini, GPT-5.4, Together AI Gemma 4 31B, and Claude Sonnet 4.6 pricing; added burst-capacity guidance for OpenAI tiers, Anthropic Priority/custom limits, and Together dedicated endpoints |
| 2026-06-03 | Kiran | v7: Updated paid provider pools to GPT-5.4-mini + Gemma 4 31B for Starter/Pro and GPT-5.4 + Claude Vision for Enterprise; matched plugin builds to workflow compilations; added Human Edit LLM costs, retention positioning, 24/7 support, and Pro+ white-label `.exe` |
| 2026-05-30 | Kiran | v6: Two-pool LLM strategy — Trial uses free-tier rotation, paid plans use two paid keys for high TPM burst; updated blended paid-plan cost (superseded) |
| 2026-05-30 | Kiran | v5: Compilations as hero metric; 300/Starter, 1,500/Pro; plugin count not the constraint (superseded) |
| 2026-05-30 | Kiran | v4: Real tier limits (3 plugins / 100 compilations / 30 builds / 3 .exe for Starter); corrected LLM calls to per-step not per-workflow (superseded) |
| 2026-05-30 | Kiran | v3: Corrected model — Conxa builds .exe, companies distribute, execution is on customer machines |
| 2026-05-30 | Kiran | v2: B2B marketplace model (superseded) |
| 2026-05-30 | Kiran | v1: Per-user SaaS model (superseded) |
