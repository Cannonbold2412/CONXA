# Stagehand — Architectural Intelligence (for Conxa)

> Source: `browserbasehq/stagehand` (`packages/core/lib/v3/`). Lens: Conxa's deterministic, record→compile→distribute, minimal-runtime-LLM philosophy.

## Executive Summary

Stagehand is an AI-native browser automation framework built on Playwright. It exposes three primitives: `act()` (single natural-language action), `extract()` (schema-driven structured extraction), and `agent()` (a multi-step CUA loop). Its defining feature relative to pure agent frameworks is a **two-layer caching + self-heal model**: the LLM grounds an instruction once, the resulting Playwright arguments (selector + method + args) are persisted under a content-hash key, and subsequent runs **replay deterministically with zero LLM tokens**. When a replayed selector drifts, the live grounding path re-derives it and the cache entry is silently refreshed ("self-heal"). A separate **rubric verifier** subsystem evaluates whole trajectories offline against criteria using multi-modal evidence (screenshots + independent accessibility-tree probes) and a structured 8-category error taxonomy.

For Conxa, Stagehand is a strong validation of the core thesis (cache-first deterministic replay; a11y tree as cheap textual ground truth) but is architecturally the inverse of Conxa at runtime: Stagehand is **LLM-in-the-loop by default and cached as an optimization**, whereas Conxa is **compiled-deterministic by default and LLM only as a recovery escalation**. The valuable ideas are the replay/refresh mechanics, the ARIA-tree-as-evidence pattern, and the verifier's error taxonomy. The pattern to reject is per-action live LLM grounding as the primary path.

## Architecture Overview

Five cooperating subsystems inside `lib/v3/`:

- **Agent loop** (`agent/`): `AgentClient` abstract base + provider CUA clients (`AnthropicCUAClient`, OpenAI, Google, Microsoft). Drives screenshot → model → tool_use → action → screenshot.
- **Tools** (`agent/tools/`): discrete capabilities the model can invoke — `act`, `extract`, `ariaTree`, `screenshot`, `goto`, `fillForm`, `scroll`, `wait`, `think`. Tools wrap the lower-level `act()`/`extract()` primitives.
- **Grounding** (`dom/`, `agent/utils/captureAriaTreeProbe.ts`): converts a live page into either a serialized accessibility tree (textual, token-cheap) or a screenshot (vision path) for the model.
- **Cache** (`cache/`): `ActCache` (single-action replay) and `AgentCache` (multi-step trajectory replay) over a pluggable `CacheStorage` (filesystem or in-memory).
- **Verifier** (`verifier/`): offline trajectory evaluation — `rubricVerifier` scores criteria against tiered evidence using the `errorTaxonomy`. This is an eval/QA subsystem, not a live runtime self-heal loop.

## Core Abstractions

1. **`AgentClient` (provider abstraction).** Abstract base (`AgentClient.ts`) defining `execute()`, `captureScreenshot()`, `setViewport()`, `setActionHandler()`, `setScreenshotProvider()`, `addContextNote()`. Each provider subclass adapts its Computer-Use API. The harness injects a screenshot provider and an action handler so the client stays transport-only; the host owns the browser. Clean seam for swapping models without touching the loop.

2. **Action (the cacheable unit of intent).** A grounded action is `{ selector, method, arguments[], description }` — the Playwright-executable result of grounding one instruction. Intent is represented at two levels: the human instruction string ("click the Login button") and the compiled `Action`. The cache key is `sha256(instruction + normalizedUrl + sortedVariableKeys)`; the value is the `Action[]`. This instruction→Action compilation is conceptually identical to Conxa's record→skill-package compile.

3. **Trajectory + Evidence + Rubric (the verification model).** A `Trajectory` is an ordered list of `TrajectoryStep`s, each carrying `agentEvidence` (tier-1: exact bytes the LLM ingested), `probeEvidence` (tier-2: independent harness-captured URL + screenshot + ARIA tree), and `toolOutput`. A `Rubric` is a list of weighted `RubricCriterion`s. The verifier fuses evidence per-criterion and emits `CriterionScore`s + taxonomy-coded `VerifierFinding`s.

## Execution Flow

**Init.** Host launches Playwright, constructs a provider `AgentClient`, wires `setScreenshotProvider` (page → base64 PNG) and `setActionHandler` (AgentAction → Playwright call). Cache storage is created from a cache dir (or memory).

**Planning / grounding.** For `act()`: the instruction + serialized DOM/ARIA is sent to the LLM (`inference.ts` → `buildActSystemPrompt`), which returns a structured `Action`. For the CUA agent: the loop sends a screenshot; the model returns `tool_use` blocks; `convertToolUseToAction` maps provider action types (click/type/scroll/drag/keypress, with coordinate-format normalization) to internal `AgentAction`s.

**Execution.** The action handler runs the Playwright call. In the CUA loop (`AnthropicCUAClient.executeStep`), after each tool the harness captures a fresh screenshot and the current URL and returns them as the `tool_result` — the screenshot is the feedback channel. Loop continues until the model emits no tool_use (done) or `maxSteps` (default 10).

**Validation.** Two distinct mechanisms: (a) inline — `extract()` returns a `completed` metadata flag; the agent self-assesses via screenshots. (b) offline — the `rubricVerifier` consumes a saved trajectory and scores it; this is QA/eval, decoupled from the live run.

**Recovery (cache path).** `ActCache.tryReplay` reads the entry, validates version + variable-key match, then for each cached action calls `waitForCachedSelector` then `takeDeterministicAction`. If a deterministic re-grounding produces different selectors (`haveActionsChanged`), the entry is rewritten — **self-heal as a cache refresh**, not a separate recovery tier.

## Data Model

- **`Action`**: `{ selector, method, arguments[], description }` — the deterministic, replayable unit.
- **`CachedActEntry`**: `{ version, instruction, url, variableKeys[], actions[], actionDescription, message }`. Key = sha256(instruction+url+variableKeys).
- **`CachedAgentEntry`**: `{ version, instruction, startUrl, options, configSignature, steps[], result, timestamp }`. `configSignature` includes model name, system prompt, CUA flag, tool keys, integrations — so a cache hit requires identical agent configuration. Replay zeroes out `usage` and stamps `metadata.cacheHit`.
- **`AgentReplayStep`**: tagged union (`act`, `fillForm`, `goto`, `scroll`, `wait`, `navback`, `keys`, `done`, `extract`, `screenshot`, `ariaTree`). Only interaction steps replay; `done`/`extract`/`screenshot`/`ariaTree` are no-ops on replay.
- **Verifier**: `Trajectory`, `TrajectoryStep`, `AgentEvidence` (modalities: text/image/json), `ProbeEvidence`, `Rubric`, `RubricCriterion`, `CriterionScore`, `VerifierFinding`, `ErrorTaxonomyCategory`.
- **Variables**: `%name%` placeholders in instructions; values are kept out of the cache key (only sorted keys are hashed) and substituted at replay — secrets never persist to disk.

## Reliability Strategy

- **Deterministic replay first.** Once grounded, actions replay without the model. Cache keyed on instruction + normalized URL + variable keys.
- **Variable-key gating.** Replay aborts to a cache miss if required variables are absent, preventing partial/incorrect replays.
- **Selector pre-wait.** `waitForCachedSelector` waits for the cached selector before acting, absorbing load-timing flakiness.
- **Config-signature isolation** (agent cache): different model/prompt/tool sets get different cache entries — no cross-config contamination.
- **Best-effort evidence.** `captureAriaTreeProbe` never throws; failures surface as `evidence_insufficient` rather than crashing the run.
- **Image compression** of conversation history (`compressConversationImages`) to control token growth across CUA steps.

## Recovery Strategy

- **Detection.** Live: replay action returns `success:false` → loop breaks. Offline: verifier compares agent claims against tier-1/tier-2 evidence ("evidence is ground truth; when claims conflict, evidence wins").
- **Classification.** The `errorTaxonomy` is a two-level, 8-category scheme: Selection Errors (wrong target/action/values), Hallucination Errors (output/action contradiction & fabrication), Execution & Strategy Errors, plus ambiguity/invalid-task categories. Each finding is coded (e.g. `1.3 Wrong action type`, `2.2 Action contradiction`).
- **Recovery.** Cache drift → re-ground via live `act()` deterministic path → rewrite cache entry (`refreshCacheEntry` / `refreshAgentCacheEntry`). No separate fallback tiers; recovery is "fall back to the full live grounding path."
- **Escalation.** Ultimately the CUA agent loop (vision + LLM) is the universal fallback — if deterministic replay can't proceed, the model re-plans from a screenshot. There is no graduated, token-tiered cascade like Conxa's.

## Scalability Characteristics

- **Token cost** scales with cache hit rate. Cold = full LLM grounding per action + per-step screenshots in CUA mode (expensive); warm = ~zero. No notion of a compiled, pre-validated package distributed ahead of execution.
- **Storage** is one JSON file per cache key; flat directory, content-hash names. Fine for a workspace, not a fleet.
- **Cross-machine transfer** exists in skeletal form: `AgentCache.consumeBufferedEntry` / `storeTransferredEntry` allow exporting a cached entry from a server run and importing it elsewhere — a primitive "compile once, distribute" hook.
- **Verifier** is offline and batch-oriented (consumes saved trajectories from disk), designed for eval harnesses; per-criterion top-K evidence selection keeps ~240k-token trajectories tractable.

## Strengths

- Cache-first deterministic replay genuinely removes the LLM from the hot path on repeat runs.
- Self-heal-as-refresh is elegant: one code path (live grounding) serves both first-run and recovery, and successful re-grounding upgrades the cache in place.
- Clean provider abstraction (`AgentClient`) — model-agnostic loop.
- ARIA tree as independent textual ground truth: cheap, non-visual, OCR-free verification of prices/names/dates.
- Rigorous, reusable error taxonomy for failure classification.
- Secret hygiene: variables hashed by key only, substituted at replay.

## Weaknesses

- **LLM-in-the-loop by default.** The primary path grounds every action with the model; caching is an optimization layered on top, not the contract. Cold runs and any cache miss are token-heavy.
- **CUA loop is screenshot-driven** — every step round-trips a PNG to the model. Vision-first, expensive, non-deterministic.
- **No multi-signal element identity.** A cache entry holds a single `selector` per action. When it breaks, there is no scored fallback (XPath/text/role/attributes) — recovery means re-invoking the LLM. This is exactly the gap Conxa's multi-signal fingerprint fills.
- **No graduated recovery cascade.** Binary: replay works, or fall back to full LLM grounding. No zero-token Tier-1/Tier-2 ladder.
- **Verifier is offline only** — not wired as a live self-heal trigger; it's an eval tool.
- **Flat file cache**, no packaging/signing/versioning/distribution model beyond a transfer-payload stub.

## LEARN

- A grounded action compiles to `{selector, method, arguments, description}` — a compact, replayable contract. Conxa's skill-package step is the richer analog.
- Cache key design: `sha256(instruction + normalizedUrl + sortedVariableKeys)`. URL normalization and variable-key gating are subtle correctness guards worth copying.
- ARIA tree captured by the *harness independently of the agent* gives a verifier ground truth the agent can't fabricate — a clean separation of "what the agent saw" vs "what was actually there."
- An explicit, coded error taxonomy turns failure analysis into structured, aggregatable data.

## ADAPT

- **Cache-refresh self-heal → Conxa runtime telemetry loop.** Stagehand rewrites the cache entry in place when re-grounding yields a better selector. Conxa can adapt this: when a Tier 3+ recovery succeeds, feed the recovered signal back to refine the skill package's element fingerprint (via Cloud, since Conxa compiles centrally) rather than mutating local state.
- **ARIA-tree probe → Conxa Tier 2 a11y resolution & assertion evidence.** Conxa already uses a11y at Tier 1/2; adopt Stagehand's pattern of capturing it as token-budgeted, truncation-marked *evidence* for `verifyAssertions()` — non-visual outcome validation with zero LLM.
- **`configSignature` gating → skill-package compatibility keying.** Conxa packages should carry an equivalent signature (target site version / app fingerprint) so a package isn't replayed against a drifted environment.

## IMPROVE

- **Recording.** Stagehand records *grounded outputs* (selector + method). Conxa records raw DOM events and compiles richer identity — keep that; Stagehand validates that capturing the executable form (not just the intent) is what makes replay deterministic.
- **Compiler.** Stagehand's "compile" is a runtime LLM grounding cached lazily. Conxa's ahead-of-time compiler with multi-signal identity + assertions is strictly stronger; Stagehand confirms the *value* of compilation, Conxa improves on *where and how thoroughly* it happens.
- **Runtime.** Conxa's 5-tier cascade with zero-token Tier 1/2 is a direct improvement over Stagehand's binary replay-or-LLM fallback. Preserve the invariant.
- **Recovery.** Adopt Stagehand's "re-ground then refresh" idea but slot it as Tier 3+ in the cascade, not as the only fallback.
- **Vision.** Stagehand's screenshot-per-step CUA loop is what Conxa should *avoid* at runtime; reserve vision for the highest recovery tier only.
- **MCP / skill packaging.** Stagehand's `consumeBufferedEntry`/`storeTransferredEntry` is a thin transfer stub; Conxa's signed `.exe` skill-package distribution is far more mature. No improvement to import here.

## AVOID

- Screenshot-per-step vision loops as a default execution model — high token cost, non-deterministic, slow.
- Single-selector cache entries with no scored fallback signals — brittle; one DOM change forces an LLM round-trip.
- Treating caching as a bolt-on optimization rather than the execution contract — leaves the cold/miss path expensive and unbounded.
- Letting the agent's self-reported `completed` flag be the only success signal (hallucination risk) — Stagehand itself mitigates this with the independent verifier.

## REJECT

- **LLM-in-the-loop as the primary grounding path.** Fundamentally conflicts with Conxa's deterministic-first, zero-token-Tier-1/2 invariant. Conxa must keep the model out of the hot path and out of selector/a11y resolution entirely.
- **Offline-only verification as the sole quality gate.** Conxa needs live, in-cascade outcome validation (`verifyAssertions()`), not just a post-hoc eval harness.
- **Lazy runtime compilation.** Conxa compiles ahead of time in the Build Studio; deferring grounding to runtime would reintroduce per-run LLM cost and non-determinism on the customer's machine — the exact thing Conxa's architecture exists to eliminate.
