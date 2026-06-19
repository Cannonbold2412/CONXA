# Playwright — Architectural Intelligence (lens: Conxa)

## Executive Summary

Playwright is Microsoft's cross-browser automation framework. For Conxa, its value is not the browser-launching plumbing but three deeply-engineered subsystems that map directly onto Conxa's compiler/runtime/recovery concerns:

1. **A scored, accessibility-first selector generator** (`packages/injected/src/selectorGenerator.ts`) that, given a target DOM element, emits *multiple* ranked candidate selectors using a numeric cost model where role+name < label < placeholder < text < testid < css-id < tag < nth < css-path. This is exactly the "multi-signal element identity" problem Conxa's compiler solves, and Playwright has a battle-tested, deterministic, zero-LLM solution.
2. **Auto-waiting locators with strictness and actionability gates** (`client/locator.ts`, `injected/injectedScript.ts`). A `Locator` is a *lazy, re-queryable selector string*, not a captured node. Every action re-resolves the element and waits for a stack of actionability states (attached → visible → stable → enabled → editable → receives-pointer-events) before acting. This is the reliability backbone.
3. **A composable selector grammar** (`>>` chaining, `internal:*` engines, `internal:control=enter-frame`, shadow-piercing) that encodes role/text/label/frame/shadow traversal *as a serializable string*. Element identity is data, resolved late — philosophically identical to Conxa compiling selectors into a skill package and resolving them at runtime.

Playwright's deterministic, LLM-free reliability model is strongly aligned with Conxa's Tier 1/2 (zero-token) recovery philosophy. The divergence: Playwright has no concept of self-healing fallback cascades, fingerprint scoring of live candidates, or vision recovery — it fails hard when a selector misses. That gap is precisely where Conxa's recovery cascade adds value, and where Playwright's *generator* (not its runtime) is the asset to mine.

## Architecture Overview

**Subsystems & responsibilities**
- **Client layer** (`src/client/`): user-facing API objects (`Page`, `Frame`, `Locator`, `BrowserContext`). Thin — they build selector strings and marshal RPC calls. No DOM logic lives here.
- **Protocol layer** (`src/protocol/`): serialization + schema validation of the JSON channel between client (Node) and server (browser-side).
- **Server layer** (`src/server/`): owns browser processes, CDP/BiDi/WebKit protocols, network interception, recorder, codegen, tracing.
- **Injected layer** (`packages/injected/src/`): code evaluated *inside the page*. This is where the real intelligence lives — `selectorGenerator.ts`, `selectorEvaluator.ts`, `roleUtils.ts`, `injectedScript.ts` (actionability), `ariaSnapshot.ts`.
- **Codegen** (`src/server/codegen/`): turns recorded actions into language-specific source (`javascript.ts`, `python.ts`, etc.). Consumes the generator's output.
- **MCP layer** (`src/tools/`): `createConnection()` (`tools/mcp/index.ts`) → `filteredTools()` (`tools/backend/tools.ts`) → `BrowserBackend`. CDP relay (`tools/mcp/cdpRelay.ts`) bridges Playwright ↔ a Chrome extension over two WebSocket endpoints.

**Data flow (record → generate → execute)**
1. User interacts; recorder captures DOM events in-page.
2. `generateSelector()` runs in the page, scores candidate selectors against the live DOM, returns the best + alternatives.
3. Codegen serializes the winning locator into source (`page.getByRole('button', { name: 'Submit' })`).
4. At execution, the `Locator` selector string is parsed by `selectorEvaluator.ts`, re-queried each attempt, gated by actionability, then the action dispatches.

**Execution flow**: client API call → `_wrapApiCall` (tracing/timeout wrapper) → channel RPC → server resolves selector via injected evaluator → actionability poll loop → action → result/event back over channel.

## Core Abstractions

- **`Locator` (`client/locator.ts`)** — a `(frame, selectorString)` pair. Immutable; chaining (`.locator()`, `.filter()`, `.getByRole()`, `.nth()`) returns a *new* Locator with an extended selector string. All actions pass `strict: true`. Matters because identity is a *late-bound, serializable description*, never a captured handle — survives re-render, re-query is free.
- **`SelectorToken` + scored candidate model (`injected/selectorGenerator.ts`)** — `{ engine, selector, score }` where lower score = more reliable. `combineScores()` weights earlier (more specific/leftmost) tokens heavier. The generator builds *all* plausible candidates, sorts by score, and verifies each against the live DOM, preferring the lowest-score selector that *uniquely* matches the target (`elements.length === 1`). This is multi-signal element identity with a deterministic preference order.
- **Selector grammar / engines (`selectorEvaluator.ts`, `roleSelectorEngine.ts`)** — `>>` joins engine clauses; `internal:role`, `internal:label`, `internal:text`, `internal:testid`, `internal:has-text`, `css`, `xpath`, `nth`, `internal:control=enter-frame`. `pierceShadow` is a first-class evaluator flag; CSS queries recurse into open shadow roots by default. Matters: frame and shadow traversal are encoded *in the selector string itself*, not in imperative code.
- **`InjectedScript` actionability (`injected/injectedScript.ts`)** — `ElementState = visible|hidden|enabled|disabled|editable|checked|stable`. `retarget()` walks label→control and into interactive ancestors; `_checkElementIsStable()` waits N stable RAF frames. The action poll loop verifies states before each attempt. This is the auto-wait engine.
- **`ariaSnapshot` (`injected/ariaSnapshot.ts`, exposed via `Locator.ariaSnapshot`)** — serializes the accessibility tree to YAML. Used for AI-mode snapshots and assertions; an accessibility-native page representation.

## Execution Flow

- **Initialization**: `createConnection()` resolves config, filters MCP tools, lazily creates a browser context. Client `ChannelOwner` objects mirror server objects over the JSON channel.
- **Planning (locator construction)**: building a `Locator` is pure string assembly — no I/O. Filters (`hasText`, `has`, `visible`) append `internal:*` clauses. Frame entry appends `internal:control=enter-frame`.
- **Execution**: an action (`click`/`fill`) sends the selector + `strict:true` + timeout to the server. Server parses the selector, queries via the evaluator (shadow-piercing as needed), enforces strictness (error if >1 match), then enters the actionability poll loop until states pass or timeout, then dispatches the input with a hit-target check.
- **Validation**: `_expect()` / web-first assertions retry the predicate until it passes or times out (same poll model). `ariaSnapshot` enables accessibility-tree assertions.
- **Recovery**: essentially none. On miss/ambiguity Playwright throws after timeout. The only "recovery" is the implicit retry-until-timeout of re-querying — there is no alternative-selector fallback, no fingerprint rescue, no vision step.

## Data Model

- **Action**: implicit — the API method (`click`, `fill`, `selectOption`) plus options (`force`, `trial`, `timeout`, `strict`). No standalone serialized "action" object in the client; codegen reconstructs source from recorder events.
- **Element identity**: the selector string (`engine=value >> engine=value …`). The *generator* additionally produces a ranked `selectors[]` array + `score` — the only place confidence is quantified.
- **State**: `ElementState` enum gates actions; not persisted.
- **Recovery info**: none persisted. The candidate list exists only transiently during generation and is collapsed to a single string for codegen.
- **Execution metadata / tracing**: `Tracing` (`client/tracing.ts`) records snapshots, screenshots, source stacks, and network into a zip (`.trace`). Rich post-hoc forensics, but not a live recovery input.

## Reliability Strategy

- **Auto-waiting**: every action re-queries the selector and polls actionability (visible, stable across RAF frames, enabled, editable, receives-pointer-events with hit-target check) until pass or timeout. No manual sleeps.
- **Late re-resolution**: locators are descriptions, so a stale DOM reference is impossible — each attempt re-queries fresh.
- **Strictness**: `strict:true` makes ambiguity (>1 match) a hard error rather than a silent first-match, surfacing brittle selectors at author time.
- **Accessibility-first generation**: the generator strongly prefers role+name and label/placeholder/text over CSS — selectors that track user-visible semantics, which are far more stable than DOM structure.
- **Validation**: web-first assertions retry; aria snapshots assert on the accessibility tree.
- **Fallbacks**: only `or()` (author-specified alternative) and the generator's internal candidate ranking. No automatic runtime fallback.

## Recovery Strategy

- **Detection**: timeout on actionability poll or strictness violation → exception. No classification beyond "not found / not actionable / ambiguous / multiple".
- **Classification**: error messages distinguish missing element vs. failed state vs. strict-mode multiple matches, but these are diagnostic, not branching logic.
- **Recovery**: none automatic. Author must supply `or()`, broaden the locator, or fix the page.
- **Escalation**: none. Playwright is a *deterministic executor that fails loudly* — by design it never guesses. (This is the deliberate inverse of a self-healing cascade.)

## Scalability Characteristics

- **Complexity**: generator is roughly O(candidates × DOM-query) with parent-recursion capped at two levels and `nth` capped at index 5 — bounded and fast. Caching (`allowText`/`disallowText` maps, ARIA/DOM caches) keeps it interactive during recording.
- **Maintainability**: clean client/server/injected separation; selector engines are pluggable; scoring constants are centralized and tunable.
- **Enterprise readiness**: very high — multi-browser, tracing, mature, widely deployed.
- **Operational burden**: the in-page injected layer must be kept in lockstep with browser quirks (shadow DOM, ARIA spec); cross-browser ARIA computation is the heaviest maintenance area.

## Strengths

- Deterministic, LLM-free, *scored* multi-candidate selector generation with a principled accessibility-first preference order.
- Locators as serializable late-bound descriptions — re-query is free and stale handles are impossible.
- Robust auto-wait actionability model (stability across frames + hit-target testing) that eliminates flakiness without sleeps.
- Frame and shadow traversal encoded declaratively in the selector grammar.
- First-class accessibility tree snapshotting; rich tracing for forensics.

## Weaknesses

- No self-healing: a single missed selector is a hard failure. The ranked candidate list is *discarded* after codegen — runtime keeps only one selector.
- No fingerprinting or scoring of *live* candidates at execution time (scoring happens only at generation).
- No vision/LLM rescue path (intentional, but a gap for unattended automation).
- Codegen collapses rich multi-signal identity into a single string, losing the alternatives that would enable recovery.
- ARIA computation cost and cross-browser drift.

## LEARN

- **The scored candidate model is the single most transferable idea.** Conxa's compiler already generates selectors, assertions, and fingerprints; Playwright shows a *proven numeric cost model* (role+name=100, label=140, placeholder=120, text=180, testid=1, css-id=500, tag=530, nth=10000, css-path=1e7) plus the rule "pick the lowest-score candidate that *uniquely* matches the live DOM." This is directly applicable to scoring Conxa's compiled selector signals deterministically, at zero token cost.
- **Locators-as-late-bound-descriptions.** Element identity should be a serializable description re-resolved every attempt — never a captured node. Conxa's runtime `resolveElement`/`withLocator`/`rootCandidates` already lean this way; Playwright validates it as the right invariant.
- **Actionability before action.** The visible→stable(RAF)→enabled→editable→hit-target gate is a deterministic, zero-token reliability layer that belongs *before* any recovery tier fires.
- **Accessibility-first preference order** (role+name > label > placeholder > text > testid > css/xpath) is empirically the right reliability ranking and should anchor Conxa's Tier-2 accessibility resolution.

## ADAPT

- **Preserve the candidate list, don't collapse it.** Where Playwright throws away `selectors[]` after codegen, Conxa should compile *all* ranked candidates into the skill package as the recovery substrate. The generator's scoring is the ranking function; Conxa's recovery cascade is the consumer Playwright never built.
- **Use aria snapshots as a recovery/verification signal.** `ariaSnapshot` (YAML accessibility tree) is a compact, semantic page representation that could feed Conxa's Tier-3 LLM/vision steps far more cheaply than raw HTML or pixels, and serve as a deterministic assertion target at Tier 1/2.
- **Adopt the `internal:control=enter-frame` model for iframe chains.** Encoding frame traversal *in* the selector string aligns with Conxa's "iframe chain preserved verbatim" invariant and keeps recovery scoped to the correct frame.
- **Shadow-piercing as an evaluator flag**, not special-case code — a clean way to handle shadow DOM uniformly across compile and runtime.

## IMPROVE

- **Compiler**: import Playwright's scoring constants and unique-match-selection algorithm to harden `selector_score.py` / `llm_selector_generator_v2.py`, reducing reliance on the LLM for selector ranking (cheaper, more deterministic compiles).
- **Runtime / recovery**: feed the *full ranked candidate set* into the fingerprint-scored 5-tier cascade so Tier 1/2 can try the next-best deterministic selector before any LLM fires — strengthening the zero-token guarantee.
- **Recording**: adopt accessibility-first generation during capture so recorded steps default to role/label/text identity.
- **Vision/MCP**: aria-snapshot YAML as the page representation handed to Tier-3 reduces token cost vs. screenshots/DOM dumps.
- **Skill packaging**: persist alternatives + scores per element, making packages self-healing by construction.

## AVOID

- **Discarding alternatives at compile time.** Playwright's codegen keeping only one selector is the exact anti-pattern Conxa must not replicate — it forecloses recovery.
- **Scoring only at generation, never at runtime.** Live candidate scoring (Conxa's fingerprints) is what Playwright lacks; don't let the compile-time score be the only signal.
- **Over-reliance on CSS-id selectors.** Playwright already penalizes GUID-like ids (`isGuidLike`); Conxa should similarly distrust volatile ids/classes.

## REJECT

- **Fail-hard-on-miss as the terminal behavior.** Playwright deliberately never guesses and throws after timeout. That conflicts with Conxa's self-healing mandate for unattended local execution — Conxa's whole differentiator is the recovery cascade that begins where Playwright stops.
- **Client/server JSON-channel architecture.** Playwright's out-of-process client↔browser RPC is unnecessary for Conxa's local Node MCP runtime, which embeds Playwright directly; adopting the channel indirection would add latency and complexity with no benefit.
- **CDP-relay/extension bridge as a distribution model.** Playwright's Chrome-extension WebSocket relay conflicts with Conxa's MCP-native, local-.exe distribution and its "cloud never executes" invariant.
- **Trace-zip as a live recovery input.** Tracing is excellent forensics but is post-hoc; it must not be mistaken for a runtime recovery signal in Conxa's token-sensitive cascade.
