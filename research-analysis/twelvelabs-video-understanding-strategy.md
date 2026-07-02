# TwelveLabs Video Understanding — What It Means for Conxa

**Written:** 2026-07-02
**Context:** Strategic + technical analysis — what TwelveLabs is, why Conxa already holds the one asset that makes it useful (`recording.webm`), exactly where the Marengo and Pegasus models fit into the **vendor-side, compile-time** pipeline, what it actually costs per compile, the invariants it must not break, and an honest list of the risks.

**Scope note:** This is a **vendor-side** strategy. Everything here operates on the SaaS vendor's *own* workflow recording, at compile time in Build Studio. Nothing here captures or ships the end customer's screen. That keeps the whole feature inside the vendor's trust boundary and away from the runtime that lives on customer machines.

---

## Table of Contents

1. [What Is TwelveLabs?](#1-what-is-twelvelabs)
2. [The Asset Conxa Already Has — recording.webm](#2-the-asset-conxa-already-has--recordingwebm)
3. [The Core Idea in One Sentence](#3-the-core-idea-in-one-sentence)
4. [Where It Fits — The Four Integration Points](#4-where-it-fits--the-four-integration-points)
5. [Deep Dive: Compile-Time Intent Enrichment (Pegasus)](#5-deep-dive-compile-time-intent-enrichment-pegasus)
6. [Deep Dive: Semantic Skill Discovery & Dedup (Marengo)](#6-deep-dive-semantic-skill-discovery--dedup-marengo)
7. [Deep Dive: Auto-Generated Assertions (Pegasus)](#7-deep-dive-auto-generated-assertions-pegasus)
8. [Deep Dive: Recovery Describe-Then-Match (Marengo, Tier 3+ only)](#8-deep-dive-recovery-describe-then-match-marengo-tier-3-only)
9. [How It Plugs Into the Existing Architecture](#9-how-it-plugs-into-the-existing-architecture)
10. [Invariants This Must Not Break](#10-invariants-this-must-not-break)
11. [Cost Model — What It Actually Costs Per Compile](#11-cost-model--what-it-actually-costs-per-compile)
12. [Honest Negatives — What This Actually Risks](#12-honest-negatives--what-this-actually-risks)
13. [Priority Roadmap](#13-priority-roadmap)
14. [Summary](#14-summary)

---

## 1. What Is TwelveLabs?

TwelveLabs builds **video foundation models** — AI that "watches" a video and understands it the way a person would, reasoning across time rather than looking at a single frame. It ingests video very fast (they claim ~60× real-time — an hour of video indexed in about a minute) and exposes two models:

| Model | Type | What it does | Analogy |
|---|---|---|---|
| **Marengo** (3.0) | Multimodal **embedding** model | Turns video, images, audio, and text into vectors in one shared semantic space. Enables "any-to-any" search — describe a moment in words, get the exact clip. Supports up to 4-hour videos, 36 languages. | A universal translator that turns "what happened in this video" into numbers you can search and compare. |
| **Pegasus** (1.5 / video-language) | Generative **video-to-text** model | Watches a full video (up to ~2 hours) and writes human-readable text: summaries, step-by-step descriptions, structured metadata, and — critically — **timestamps of specific events**. Tracks entities, causation, and narrative over time. | A person who watches a screen recording and writes down "at 0:04 they clicked New Contact, at 0:07 a success toast appeared." |

The key difference from the frame-by-frame vision models Conxa already uses (Google AI Studio / NVIDIA NIM vision via the [cloud router](../conxa-cloud/backend/app/llm/router.py)): those look at **individual screenshots** in isolation. TwelveLabs reasons over the **whole recording as a temporal sequence** — it sees the click *and* what happened after it, and can tell you *why* a step happened, not just what the pixels were.

Available via TwelveLabs' own API and via Amazon Bedrock.

**Sources:**
- [TwelveLabs — Video Foundation Models: Marengo & Pegasus](https://www.twelvelabs.io/product/models-overview)
- [TwelveLabs video understanding models on Amazon Bedrock (AWS)](https://aws.amazon.com/blogs/aws/twelvelabs-video-understanding-models-are-now-available-in-amazon-bedrock/)
- [TwelveLabs Developer Docs — Pegasus](https://docs.twelvelabs.io/docs/concepts/models/pegasus)
- [Marengo 3.0 launch (AIwire)](https://www.hpcwire.com/aiwire/2025/12/01/twelvelabs-launches-marengo-3-0-video-understanding-model-on-twelvelabs-and-amazon-bedrock/)

---

## 2. The Asset Conxa Already Has — recording.webm

Here is the thing most people miss: **Conxa is already a video recorder.** It just doesn't use the video for anything except cutting it into frames.

When a SaaS vendor records a workflow in Build Studio, the Playwright browser context is launched with video capture on:

```python
# conxa-builder/python/conxa_compile/recorder/session.py:969
ctx_kwargs["record_video_dir"] = str(session_dir)
ctx_kwargs["record_video_size"] = {"width": 1280, "height": 720}
```

At session shutdown, that raw capture is renamed to a canonical file:

```python
# conxa-builder/python/conxa_compile/recorder/session.py:409
target = session_dir / "recording.webm"
```

Then [`frame_extractor.py`](../conxa-builder/python/conxa_compile/recorder/frame_extractor.py) slices **5 frames per event** (T−500ms … T+500ms) out of the video and throws the rest of the video's information away. The frames feed the LLM intent and vision-anchor passes; the temporal signal — everything *between* those frames — is discarded.

So the input TwelveLabs needs already exists on disk, for free, at the end of every recording:

```
data/sessions/<session_id>/
├── recording.webm      ← 1280×720 screen recording of the whole workflow  ★ TwelveLabs input
├── events.jsonl        ← structured DOM events with timestamps (ms since video start)
└── frames/             ← 5 extracted PNGs per event (current LLM input)
```

`events.jsonl` timestamps are **already aligned to the video timeline** (that alignment is exactly how `frame_extractor.py` finds the right frames). That means a Pegasus timestamp of "success toast at 0:07.2" can be mapped straight back to the specific recorded event — the correlation is trivial, not a research problem.

**We are sitting on a per-workflow video and never asking a model to watch it.** And because it's the *vendor's own* recording of *their own* app, analyzing it raises none of the end-customer privacy questions that runtime capture would.

---

## 3. The Core Idea in One Sentence

> Conxa's compiler is deterministic and reads the DOM; TwelveLabs reads the *video* and understands intent, outcome, and causation across time — so it fills exactly the gaps a DOM-only compiler is blind to, **at compile time, on the vendor's own recording, without touching the zero-token execution floor.**

The deterministic [`IdentityBundle`](../conxa-builder/python/conxa_compile/compiler/identity_bundle.py) + [`selector_grammar.py`](../conxa-builder/python/conxa_compile/compiler/selector_grammar.py) stay the sole selector generators (that invariant is not up for debate — see §10). TwelveLabs never writes a selector. It writes **understanding**: what the step was for, whether it succeeded, and how to describe the target in words when the compiled selector eventually fails.

---

## 4. Where It Fits — The Four Integration Points

All four operate on the vendor's own recording. Three are pure compile-time; the fourth stores a compile-time asset that only fires at Tier 3+ recovery.

| # | Integration | Model | Stage | Replaces / Augments | Invariant risk |
|---|---|---|---|---|---|
| 1 | **Intent enrichment** — better per-step descriptions + implicit-wait detection | Pegasus | Compile | Augments the LLM intent pass & intent graph in [`build.py`](../conxa-builder/python/conxa_compile/compiler/build.py) | None (compile-time) |
| 2 | **Semantic skill discovery & dedup** | Marengo | Publish | New capability on Conxa Cloud | None |
| 3 | **Auto-generated assertions** — detect success states with timestamps | Pegasus | Compile | Augments [`validation_planner.py`](../conxa-builder/python/conxa_compile/compiler/validation_planner.py) | None (compile-time) |
| 4 | **Recovery describe-then-match** — from a compile-time embedding | Marengo | Compile (store) + Tier 3+ (match) | Adds signal to **Tier 3+** recovery only | ⚠️ Must stay Tier 3+ |

The single most valuable one, and the one to build first, is **#1 (intent enrichment)** — it's pure compile-time upside with zero runtime cost and zero risk to any invariant.

---

## 5. Deep Dive: Compile-Time Intent Enrichment (Pegasus)

### The problem today

The compiler's [`llm/`](../conxa-builder/python/conxa_compile/llm/) task clients infer per-step intent and the workflow intent graph from **5 static frames per event + DOM**. That's a keyhole view. It cannot see:

- **Implicit waits** — the recording paused 1.2s waiting for a spinner; the DOM shows nothing, so the compiled step has no wait and flakes at runtime.
- **Causation** — "this click opened a modal that the *next* click depends on." The intent graph guesses this from DOM structure; Pegasus sees it happen.
- **Off-DOM outcomes** — a canvas render, a chart redraw, a native file dialog. Invisible to selectors, visible on video.

### The fix

After recording finalizes, send `recording.webm` to Pegasus with a structured prompt keyed to the `events.jsonl` timeline:

```
Prompt (per session, one call):
"This is a screen recording of a user completing a workflow in a web app.
 Events occurred at these timestamps: [0.0s click, 3.1s type, 4.0s click, 7.2s ...].
 For each event, describe: (a) the user's goal, (b) what visibly changed after,
 (c) any waiting/loading between this event and the next (report the duration),
 (d) whether the step depended on the result of a prior step."
```

Pegasus returns timestamped, narrated steps. Because `events.jsonl` timestamps are already on the video clock (§2), each returned item maps 1:1 back to a recorded event. That output feeds three existing structures:

- **Per-step `intent`** — richer, causally-aware descriptions replace/cross-check the frame-based intent pass.
- **`_build_intent_graph`** in [`build.py`](../conxa-builder/python/conxa_compile/compiler/build.py) — Pegasus-observed dependencies become real edges instead of DOM heuristics.
- **Implicit waits** — a reported "2s spinner between step 4 and 5" becomes a compiled wait/gate, killing a whole class of runtime flakes before they ship.

**Net:** one Pegasus call per compile turns a discarded asset into better skills. No runtime cost, no execution-path change.

---

## 6. Deep Dive: Semantic Skill Discovery & Dedup (Marengo)

Embed each published skill's `recording.webm` with Marengo and store the vector alongside the skill pack. This unlocks capabilities that pair directly with the [`agentic-discovery-strategy.md`](agentic-discovery-strategy.md) registry vision:

- **Semantic skill search** — an agent (or a Cloud Dashboard user) asks *"is there a skill that exports invoices to CSV?"* and Marengo matches on what the video actually *shows*, not on a hand-written description field. This is the retrieval layer the ARD registry (`GET /api/v1/discover/skills`) wants.
- **Duplicate detection at publish** — before a vendor records a workflow, Marengo can answer *"you already have a skill that does almost exactly this"* by nearest-neighbour on the embedding. Stops skill-pack sprawl.
- **Cross-vendor pattern mining** (governed, internal) — feeds the durability flywheel described in [`agentic-discovery-strategy.md`](agentic-discovery-strategy.md) without exposing any vendor's raw video.

Marengo's "any-to-any" property means the query can be text ("export invoices"), an image (a screenshot of the target screen), or another video — all land in the same vector space.

---

## 7. Deep Dive: Auto-Generated Assertions (Pegasus)

Conxa's [`validation_planner.py`](../conxa-builder/python/conxa_compile/compiler/validation_planner.py) plans assertions, and the runtime's `verifyAssertions()` in [`run.js`](../runtime/run.js) checks them. Today an assertion is only as good as what the DOM exposes.

Pegasus can watch the recording and report **outcome events with timestamps**: "a green success toast appeared at 0:07," "a new row named 'Alice' was added to the table at 0:09," "the modal closed." Those become candidate assertions the planner can compile into VERIFY steps — grounded in what actually happened on screen, including toasts and transient UI that vanish before a DOM snapshot would catch them.

This directly strengthens outcome validation, which is one of Conxa's real moats (a skill that *knows* it succeeded vs. one that just clicked and hoped).

---

## 8. Deep Dive: Recovery Describe-Then-Match (Marengo, Tier 3+ only)

**This is the one that touches execution, so read §10 first.** Note it adds **no new customer-side data capture** — the compiled asset comes from the vendor's recording, and the runtime match reuses the same Tier 3+ screenshot path that already exists today.

When a compiled selector fails at runtime and Tier 1 (compiled selector) and Tier 2 (a11y scan) are both exhausted — **and only then** — the runtime escalates to LLM-driven recovery (Tier 3+). Today that's a describe-then-match against a live screenshot.

Marengo can sharpen this: at compile time (vendor-side), store a Marengo embedding of the **video crop of the target element at the moment it was interacted with** (we already know the bbox and the timestamp). At Tier 3+ recovery, embed the current live screen region and match against that stored embedding — "find the thing that looks and behaves like the element from the recording." This is more robust than a single-frame vision match because the stored signal came from the element *in motion / in context*.

**Hard constraint:** the runtime match is a cloud call and it costs credits. It is a **Tier 3+ signal, full stop.** It must never be wired into `resolver.js`, `resolve_adapter.js`, the a11y path, or `recovery.js`'s L1/L2 ladder. Tiers 1 and 2 remain zero-token, zero-network. (See the recovery-tier memory: `CONXA_MAX_RECOVERY_TIER` gates this — Studio caps at 2, MCP at 4.)

---

## 9. How It Plugs Into the Existing Architecture

Conxa already has the exact pattern for this: **LLM providers live behind the cloud proxy, keys never touch the client.** TwelveLabs slots in as one more provider.

```
Build Studio (local compile)
  conxa_compile/llm/*  ──►  conxa_core.llm.get_router()  ──►  POST /api/v1/llm/proxy/...
                                                                      │
Conxa Cloud                                                           ▼
  app/llm/router.py  ──►  [ Groq | Google AI Studio | NVIDIA NIM | ★ TwelveLabs ]
                              (new: /api/v1/video/{index,generate,embed})
```

| File | Change |
|---|---|
| `conxa-cloud/backend/app/llm/router.py` | Add TwelveLabs (or Bedrock) as a video provider; key stays server-side |
| `conxa-cloud/backend/app/api/` | Add `POST /api/v1/video/index`, `/video/generate` (Pegasus), `/video/embed` (Marengo) under the required `/api/v1` prefix |
| `packages/conxa-core/conxa_core/llm/` | Add a `call_video()` client mirroring `call_llm` |
| `conxa-builder/python/conxa_compile/recorder/frame_extractor.py` | After frame extraction, hand `recording.webm` off to a new compile step (don't delete the video until it's been sent) |
| `conxa-builder/python/conxa_compile/compiler/build.py` | Consume Pegasus intent/causation into `_build_intent_graph` |
| `conxa-builder/python/conxa_compile/compiler/validation_planner.py` | Consume Pegasus outcome events into assertions |
| `runtime/recovery.js` / `run.js` | **Tier 3+ only** — Marengo describe-then-match signal |

Crucially this respects **"the cloud does not compile or execute"**: the cloud only *proxies* the TwelveLabs API (same as it proxies Groq today). Compilation stays local in Build Studio; the cloud just holds the key and forwards the call.

---

## 10. Invariants This Must Not Break

These come straight from `CLAUDE.md`'s Key Invariants. TwelveLabs integration lives inside these, not around them.

- **Tier 1/2 recovery costs zero LLM tokens.** TwelveLabs is a cloud call → it is a **Tier 3+ signal only**. Never in `resolver.js`, `resolve_adapter.js`, the a11y path, or `recovery.js` L1/L2.
- **LLM does not write selector strings.** Pegasus/Marengo write *intent, outcome, and match hints* — never a Playwright selector. `IdentityBundle` + `selector_grammar.py` remain the sole generators.
- **Auth files never enter build output.** `recording.webm` is session state under `data/sessions/` — it is **not** shipped in the plugin. Only its derived, sanitized outputs (intents, assertions, embeddings) go into the skill pack. `plugin_builder.py`'s exclusion check stays.
- **The cloud does not compile or execute.** The cloud only *proxies* the TwelveLabs API. Compilation stays local.
- **All API routes live under `/api/v1`.** New video endpoints go under `/api/v1/video/...`.

---

## 11. Cost Model — What It Actually Costs Per Compile

Feeds [`cost_model.md`](cost_model.md). TwelveLabs is pay-as-you-go, billed per **minute of video** plus a small token charge on Pegasus text output. Published rates (subject to change; enterprise/Bedrock pricing differs):

| Operation | Rate | Used for |
|---|---|---|
| Marengo video index / embed | **$0.042 / min** | Discovery embedding (#2), recovery embedding (#4) |
| Pegasus video analysis | **$0.0292 / min** | Intent enrichment (#1), assertions (#3) |
| Pegasus text output | **$0.0075 / 1K tokens** | The narrated-step / assertion text Pegasus returns |
| Embedding infra | **$0.0015 / min** | Flat infra surcharge on embed calls |
| Marengo image embed | **$0.10 / 1K requests** | Per Tier 3+ recovery match |
| Marengo text embed | **$0.070 / 1K requests** | Per discovery search query |

### The number that matters: cost per workflow compile

Conxa workflow recordings are **short** — a handful of steps, typically 30 seconds to a few minutes, not the hours these models are priced to handle. A single compile runs **one Pegasus pass** (intent + assertions) and **one Marengo embed** (discovery) over the same recording:

| Recording length | Pegasus ($0.0292/min) | Marengo embed ($0.042/min) + infra ($0.0015/min) | Pegasus output (~5K tok, $0.0375) | **Total / compile** |
|---|---|---|---|---|
| 0.5 min | $0.015 | $0.022 | $0.038 | **≈ $0.07** |
| 1 min | $0.029 | $0.044 | $0.038 | **≈ $0.11** |
| 3 min | $0.088 | $0.131 | $0.038 | **≈ $0.26** |

So **roughly $0.07–0.26 per compile** for a typical workflow — a rounding error next to the LLM cost the compile already incurs (frames, intent, vision anchors, intent graph). And it's paid **once per skill version**, not per execution.

### Runtime and query costs are negligible

- **Recovery match (#4):** image embed at $0.10/1K requests = **$0.0001 per Tier 3+ recovery.** And Tier 3+ is rare *by design* — Tiers 1/2 catch most failures for zero cost.
- **Discovery search (#2):** text embed at $0.070/1K queries = **$0.00007 per search.**

### Why this is cheap in the right way

The economic argument mirrors the recovery cascade's: **spend ~$0.10 once, at compile, to make execution cheaper and more reliable forever.** A skill that ships with a Pegasus-detected implicit wait doesn't flake at runtime, which avoids Tier 3+ LLM recovery calls on *every* execution across *every* customer. One compile-time video pass is amortized across the entire runtime lifetime of the skill — potentially thousands of executions. The cost lands in the one place Conxa can absorb it (compile, vendor-side) and saves cost in the place that scales (execution, per-customer).

### How to buy — and what to actually budget

**You do not need to pre-purchase anything, and you almost certainly don't need the Enterprise plan to start.** TwelveLabs has three tiers:

| Plan | Price | Commitment | What it gives |
|---|---|---|---|
| **Free** | $0, no card | None | 600 min of indexing, all APIs, index access 90 days |
| **Developer (pay-as-you-go)** | The per-minute rates above | **No minimum, no committed spend** | Unlimited hours, pure usage billing |
| **Enterprise** | **Custom — "talk to sales"** | **Committed-use contract** (annual spend) | On-prem / Bedrock-in-tenancy, volume discounts, fine-tuning, custom rate limits, SLAs |

**The Enterprise price is not published** — it's negotiated per customer and involves an annual committed spend. There is no public number to quote; it comes from their sales team. Crucially, the *capability* (Pegasus + Marengo on our recordings) is fully available on Free and pay-as-you-go — Enterprise only adds deployment isolation, discounts, and SLAs.

So the budget in phases:

- **Phase 1 — validate: $0.** The free tier's 600 minutes ≈ 300–600 workflow recordings, which covers the entire "run it over existing sessions and measure the lift" experiment.
- **Production — pay-as-you-go, scales with compiles (no lump sum):**

  | Compiles / month | Monthly cost (~$0.07–0.26 each) |
  |---|---|
  | 100 | ~$7–26 |
  | 1,000 | ~$70–260 |
  | 10,000 | ~$700–2,600 |

- **When Enterprise becomes necessary — later, and only on two triggers:**
  1. A vendor demands data isolation / on-prem. The cleaner path is **AWS Bedrock**, which is *also* pay-as-you-go and runs inside the vendor's own AWS account — **no TwelveLabs enterprise contract required**.
  2. Volume is high enough that a committed-use discount beats PAYG.

**Bottom line:** $0 to start and prove value, then a variable per-compile cost that tracks usage. Sign an Enterprise contract only when a specific customer's procurement or sheer volume forces it — and get that figure from TwelveLabs sales, since it isn't public.

**Sources:** [TwelveLabs Pricing](https://www.twelvelabs.io/pricing) · [TwelveLabs Pricing Calculator](https://www.twelvelabs.io/pricing-calculator) · [AWS Marketplace — TwelveLabs models](https://aws.amazon.com/marketplace/pp/prodview-qr4lokt4ueeu2)

---

## 12. Honest Negatives — What This Actually Risks

### 12.1 Privacy — recording.webm can contain sensitive SaaS data (manageable, and vendor-side)

`recording.webm` is a screen recording of the vendor recording a workflow in their real SaaS app. It can contain **PII, internal dashboards, and — worst case — credentials typed on screen.** Naively POSTing it to a shared public API would sit awkwardly next to the local-execution privacy story that is Conxa's headline pitch.

Two things make this manageable. **First, it's vendor-side, at compile time** — the vendor analyzing their *own* recording of *their own* app, never the end customer's live session. **Second, TwelveLabs' enterprise tier is built for exactly this.** They offer:

- **On-premise / private-cloud deployment** — "deployable however and wherever you want, including on-premise." A vendor with strict requirements runs the models entirely inside their own perimeter; the recording never crosses a trust boundary.
- **Amazon Bedrock** — Marengo and Pegasus run inside the vendor's *own AWS tenancy*. The video stays in their cloud-compliance boundary; TwelveLabs never sees it. This should be the default enterprise path.
- **SOC 2 Type II**, AES-256 at rest, TLS 1.2+ in transit, RBAC / least-privilege, and a dedicated **Government & Security** track — the compliance posture enterprise buyers expect.

So it's not *"local-first vs. a cloud API,"* it's a **deployment-tier choice**, layered with cheap defense-in-depth:

- **Tier the deployment:** standard vendors → TwelveLabs managed API; privacy-sensitive → Bedrock-in-their-tenancy; regulated/gov → on-prem. Same integration, different endpoint.
- **Redaction pass before upload** — blur input-field values / masked-field regions in `recording.webm` regardless of tier.

**Net:** with Bedrock-in-tenancy or on-prem as the enterprise default, this is a per-tier deployment decision, not a blocker.

**Sources:** [TwelveLabs Security & Compliance](https://www.twelvelabs.io/security) · [TwelveLabs Enterprise](https://www.twelvelabs.io/enterprise) · [TwelveLabs × AWS Bedrock](https://www.twelvelabs.io/blog/twelvelabs-x-aws-amazon-bedrock)

### 12.2 New external dependency + vendor lock-in

TwelveLabs is a single vendor for a novel capability. If they raise prices, change the API, or go away, the intent/assertion quality regresses to today's frame-based baseline. **Mitigation:** the deterministic compiler must remain fully functional *without* TwelveLabs — video enrichment is strictly additive, never load-bearing. If the video call fails, compile still produces a working skill.

### 12.3 Latency added to compile

Indexing + generation adds seconds-to-minutes to compile. Build Studio compiles are already not instant, but this is user-facing wait time. **Mitigation:** run the video pass asynchronously — ship the deterministic skill immediately, enrich it in a follow-up pass, and re-publish the enriched version.

### 12.4 Non-determinism creeping into intent

Generative video-to-text is probabilistic. If Pegasus output silently drives compiled behavior (waits, assertions, graph edges), two compiles of the same recording could differ. **Mitigation:** treat Pegasus output as *proposals* surfaced in the workflow editor for vendor confirmation, not silent auto-application — especially for assertions.

### 12.5 It's a "nice-to-have," not a moat by itself

Better intent descriptions don't win deals on their own. The value is real but incremental — it makes skills more reliable, which compounds the *existing* moat (self-healing, compiled identity). It is not a new moat. Prioritize accordingly: this is a quality multiplier, not a headline feature.

### 12.6 Summary of risks

| Risk | Severity | Mitigation |
|---|---|---|
| Privacy — sensitive data in recording.webm | Medium (mitigable) | Vendor-side, compile-time, opt-in, redacted. Tier deployment: managed API / Bedrock-in-tenancy / on-prem. TwelveLabs is SOC 2 Type II + on-prem capable. |
| Vendor lock-in / new external dependency | Medium | Enrichment strictly additive; deterministic compile fully works without it |
| Added compile latency | Medium | Async enrich-then-republish; ship deterministic skill immediately |
| Non-determinism in intent/assertions | Medium | Surface as editor proposals, not silent auto-apply |
| Not a standalone moat | Low | Position as a reliability multiplier on the existing moat |

---

## 13. Priority Roadmap

### Phase 1 — Prove the value on data we already have (do first)

- [ ] Offline experiment: run Pegasus over a handful of existing `data/sessions/<id>/recording.webm` files and compare its per-step intent + implicit-wait detection against the current frame-based intent output. No code wiring — just measure the lift.
- [ ] Decide the deployment tier per vendor segment (§12.1) before writing any upload code: managed API for standard vendors, **Bedrock-in-their-tenancy** for privacy-sensitive, on-prem for regulated/gov.

### Phase 2 — Compile-time intent enrichment (highest ROI)

- [ ] Add TwelveLabs as a provider behind the cloud proxy (`app/llm/router.py`), key server-side
- [ ] Add `POST /api/v1/video/{index,generate}` under `/api/v1`
- [ ] Add `call_video()` client to `conxa_core.llm`
- [ ] Wire Pegasus intent + causation into `_build_intent_graph` (`build.py`)
- [ ] Detect implicit waits from Pegasus timing → compiled waits/gates
- [ ] Redaction pass on `recording.webm` before upload

### Phase 3 — Assertions + discovery

- [ ] Pegasus outcome events → candidate assertions in `validation_planner.py` (surface in editor, don't auto-apply)
- [ ] Marengo embed each published skill; store vector with the skill pack
- [ ] Marengo-backed semantic search behind `GET /api/v1/discover/skills` (pairs with `agentic-discovery-strategy.md`)
- [ ] Duplicate-skill detection at publish

### Phase 4 — Runtime recovery (careful, gated)

- [ ] Marengo describe-then-match as a **Tier 3+ only** recovery signal (never L1/L2), from the compile-time stored embedding

---

## 14. Summary

| Question | Answer |
|---|---|
| What is TwelveLabs? | Video foundation models — Marengo (embeddings/search) and Pegasus (video-to-text) — that understand a recording across *time*, not frame by frame. |
| Why does Conxa care? | Conxa already records `recording.webm` per workflow and throws the temporal signal away after cutting frames. TwelveLabs reads exactly the signal we discard. |
| Whose data is it? | The **vendor's own** recording of **their own** app, analyzed at compile time. No end-customer screen capture anywhere. |
| Where does it fit best? | **Compile-time intent enrichment** — richer step intent, causation, and implicit-wait detection. Pure upside, no runtime cost, no invariant risk. |
| Does it write selectors? | No. `IdentityBundle` + `selector_grammar.py` stay the sole selector generators. TwelveLabs writes understanding, not selectors. |
| Does it touch the zero-token recovery floor? | No. Any runtime use is **Tier 3+ only**. Tiers 1/2 stay zero-token, zero-network. |
| What does it cost? | **≈ $0.07–0.26 per workflow compile**, paid once per skill version. Runtime/query costs are fractions of a cent. |
| How does it plug in? | As one more provider behind the existing cloud LLM proxy — key stays server-side; compilation stays local. The cloud only proxies, never compiles. |
| What's the biggest risk? | **Privacy** — `recording.webm` can contain sensitive data. It's vendor-side and mitigated by TwelveLabs' enterprise tier: on-prem or **Bedrock-in-the-vendor's-own-tenancy** (SOC 2 Type II), so the video never leaves their boundary. |
| Is it a new moat? | No — it's a reliability multiplier on the existing moat (self-healing + compiled identity), paid once at compile and amortized across every execution. |

**The core insight:** Conxa is already a video recorder that never watches its own tapes. TwelveLabs watches the tape — at compile time, on the vendor's own recording — and turns the discarded temporal signal into more reliable skills, for about a dime a compile, without ever writing a selector or spending a token at the zero-cost execution floor.

**Sources:**
- [TwelveLabs — Models Overview (Marengo & Pegasus)](https://www.twelvelabs.io/product/models-overview)
- [TwelveLabs — Product Overview](https://www.twelvelabs.io/product/product-overview)
- [TwelveLabs Developer Docs — Pegasus](https://docs.twelvelabs.io/docs/concepts/models/pegasus)
- [TwelveLabs models on Amazon Bedrock (AWS)](https://aws.amazon.com/blogs/aws/twelvelabs-video-understanding-models-are-now-available-in-amazon-bedrock/)
- [TwelveLabs — Pricing](https://www.twelvelabs.io/pricing) · [Pricing Calculator](https://www.twelvelabs.io/pricing-calculator)
- [TwelveLabs — Security & Compliance (SOC 2 Type II, on-prem, encryption)](https://www.twelvelabs.io/security)
- [TwelveLabs — Enterprise](https://www.twelvelabs.io/enterprise)
- [Marengo 3.0 launch (AIwire)](https://www.hpcwire.com/aiwire/2025/12/01/twelvelabs-launches-marengo-3-0-video-understanding-model-on-twelvelabs-and-amazon-bedrock/)
