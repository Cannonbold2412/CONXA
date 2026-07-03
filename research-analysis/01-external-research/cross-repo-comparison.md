# Cross-Repository Comparison — Prior Art for Conxa

> One consolidated comparison of the six analyzed browser-automation repositories, through four lenses: a capability scoring matrix, best-in-class patterns by problem area, a deep three-ideas-per-repo review, and a one-concept-per-repo distillation. Per-repo detail (diagrams, file navigation) lives in [`repos/`](repos/); this document is the cross-cutting synthesis.

**Lenses:** [Capability Matrix](#capability-scoring-matrix) · [Best-in-Class by Problem Area](#best-in-class-patterns-by-problem-area) · [Deep Per-Repo Review](#deep-per-repo-review-three-ideas-each) · [One Concept per Repo](#one-concept-per-repo) · [Where Each Subsystem's Wins Come From](#where-each-subsystems-biggest-wins-come-from)

---

## Capability Scoring Matrix


Scoring: 5 = best-in-class | 3 = competent | 1 = minimal/absent | — = not applicable

| Capability | Playwright | Playwright MCP | Stagehand | browser-use | SeleniumBase | UI-TARS |
|------------|-----------|----------------|-----------|-------------|--------------|---------|
| **Recording** | 5 — codegen with scored selectors | 1 — no recording | 2 — no built-in recorder | 1 — no recorder | 4 — recorder_helper JS injection | 3 — trajectory replay only |
| **Locators (compiled)** | 5 — selectorGenerator cost model; role+name < label < text < testid < css | 4 — delegates to Playwright | 3 — LLM-derived selectors; no cost model | 2 — per-step ephemeral integer indices | 4 — sb_driver with smart waits | 1 — coordinate-only; no DOM selectors |
| **Accessibility / ARIA** | 5 — ariaSnapshot.ts; full ARIA tree; role+name is top-priority signal | 5 — page_snapshot returns full ARIA tree; auto-snapshot after every action | 4 — independent ARIA probe (captureAriaTreeProbe) for verifier | 4 — CDP AXTree + ClickableElementDetector + DOMTreeSerializer | 3 — ARIA used implicitly via WebDriver; no first-class ARIA API | 2 — ARIA tree used in SoM annotation but not for element identity |
| **Reliability (built-in waits)** | 5 — actionability gates: attached→visible→stable→enabled; auto-retry | 5 — inherits Playwright actionability | 4 — cache-first replay + self-heal on selector drift | 2 — per-step retry; no persistent cache | 5 — poll loop 100ms; exception-classified fallback ladder; deferred asserts | 3 — operator retries screenshot on error; no selector-level retry |
| **Recovery / Fallback** | 3 — auto-retry + strict mode errors; no tiered cascade | 3 — inherits Playwright; no custom cascade | 4 — cache hit → replay; miss/drift → LLM re-ground → refresh cache | 2 — agent re-tries via new LLM call (expensive); no tiered approach | 4 — 4-tier fallback: native→re-find→JS click→jQuery click + CDP swap | 2 — VLM retry on screenshot; no structured cascade |
| **Vision / Multimodal** | 2 — screenshot tool in MCP only; no visual grounding | 3 — screenshot tool exposed via MCP | 3 — screenshot tool in agent loop; no dedicated visual grounder | 4 — screenshot passed to LLM each step; optional vision mode | 2 — CDP screenshots available; no visual grounding | 5 — primary modality; SoM annotation; coordinate normalization; scaleFactor |
| **LLM Grounding** | 1 — no built-in LLM integration | 2 — delegates to connected LLM client via MCP protocol | 5 — CUA model integration (Anthropic/OpenAI/Google); 3-method API | 5 — LLM-in-the-loop every step; 7+ provider adapters; AgentOutput with reflection | 1 — no LLM integration | 5 — VLM as primary; CALL_USER for clarification |
| **Caching / Replay** | 1 — no caching | 1 — no caching | 5 — sha256 cache key; cache-first zero-LLM replay; version-aware; self-healing | 1 — no caching; all steps re-ground via LLM | 1 — no trajectory caching | 2 — trajectory logging; no replay optimization |
| **MCP Integration** | 4 — full MCP server via playwright-core; 30+ tools; ServerBackend interface | 5 — purpose-built MCP wrapper; filteredTools; lazy browser init | 2 — REST server (packages/server-v3); no native MCP | 4 — browser_use/mcp/ module; Claude Desktop integration | 1 — no MCP support | 3 — MCP tools in agent-infra; not the primary interface |
| **Enterprise Readiness** | 4 — mature, Apache 2.0, CI/CD integrations, trace viewer | 3 — production MCP server but thin wrapper | 3 — TypeScript, monorepo, verifier/rubric system | 2 — Python, newer project, no enterprise auth support | 5 — pytest integration, UC stealth mode, proxy support, deferred asserts | 2 — Electron desktop app; limited enterprise deployment options |
| **Cross-Platform** | 4 — Chromium/Firefox/WebKit | 3 — Chromium focus via CDP relay | 3 — Playwright-backed; cross-browser in theory | 3 — Playwright-backed | 4 — Chrome/Firefox/Edge/Safari/IE11 | 5 — web + desktop + mobile via operator abstraction |
| **Stealth / Bot Bypass** | 2 — basic stealth; detectable | 2 — same as Playwright | 1 — no stealth features | 2 — basic | 5 — UC mode (undetected-chromedriver); CDP mode; fingerprint evasion | 3 — native OS events via nutjs (harder to detect than WebDriver) |

---

### Key Takeaways

**Best for Conxa's compilation pipeline:**
- Recording: Playwright's selectorGenerator.generateSelector() with numeric cost model — mine this directly
- Locator strategy: Playwright's priority order (role+name > label > text > testid > css) → adopt as Conxa's multi-signal weight ordering

**Best for Conxa's reliability cascade:**
- Tier 1/2 deterministic: Playwright's actionability gates (auto-wait) + SeleniumBase's exception-classified fallback ladder
- Tier 3 re-grounding: Stagehand's cache-first + self-heal pattern; browser-use's ARIA tree format
- Tier 4 vision: UI-TARS's scaleFactor normalization + SoM annotation approach

**Best for Conxa's MCP runtime:**
- Architecture: Playwright MCP's ServerBackend interface + tool registry pattern
- Auto-snapshot after each action: Playwright MCP's pattern of returning ARIA state after every mutating tool call

**Gaps in all frameworks (Conxa opportunities):**
1. No framework combines recording + caching + tiered recovery — Conxa is unique
2. No framework has iframe chain preservation through compile + execute
3. No framework supports cross-site skill composition (WorkArena multi-site tasks)
4. No framework has explicit human escalation with context continuity (UI-TARS CALL_USER is closest)

---

## Best-in-Class Patterns by Problem Area


---

### 1. Recording

**Best-in-class:** Playwright (`packages/playwright-core/src/injected/selectorGenerator.ts`)

Playwright's codegen records element interactions via injected JavaScript and generates selectors using a numeric cost model:

```
role+name (cost=0) < label (cost=1) < text (cost=2) < testid (cost=3) < css-id (cost=4) < css-path (cost=5)
```

The generator scores ALL valid selectors for an element, picks the lowest cost, and falls back up the ladder if the winner is ambiguous (matches >1 element). This produces semantically stable selectors that survive minor DOM changes.

**What Conxa should adopt:** The cost model and fallback ladder verbatim. At record time, Conxa's Build Studio should run `selectorGenerator.generateSelector()` (or equivalent) and store ALL candidate selectors with their scores — not just the winning one. This pre-populates the multi-signal identity for Tier 1/2 without any LLM involvement.

**Runner-up:** SeleniumBase `recorder_helper.py` — JS event injection approach is similar; less sophisticated selector scoring.

---

### 2. Locators / Element Identity

**Best-in-class:** Playwright (client/locator.ts) + Mind2Web paper (dataset findings)

Playwright Locators are lazy, re-evaluated on every action — the stored string is a selector template, not a DOM reference. This makes them naturally robust to React re-renders.

Mind2Web dataset confirms empirically: text content and ARIA role are the most stable signals across site updates; structural XPath/CSS degrades fastest.

**What Conxa should adopt:**
- Store 4 signals per element in compiled skill packages: (1) ARIA role+name, (2) visible text, (3) test ID if present, (4) structural CSS path
- Weight signals in that order for Tier 1 resolution
- Re-evaluate on each execution attempt, don't cache DOM node references

**Anti-pattern (browser-use):** Per-step integer indices (`selector_map[42]`) are ephemeral — they change on every page load and across re-renders. Zero persistence value across executions.

---

### 3. Accessibility / ARIA Tree Usage

**Best-in-class:** Playwright MCP (`page_snapshot` tool) + Stagehand (`captureAriaTreeProbe.ts`)

Playwright MCP returns the full ARIA tree as structured text after every mutating action — this gives the LLM a reliable, DOM-independent view of current page state. Stagehand's independent probe captures ARIA state separately from the LLM's perception channel, enabling post-hoc trajectory verification.

**What Conxa should adopt:**
- Auto-snapshot pattern: after every Tier 1/2 action, capture ARIA state as post-condition evidence
- Independent probe: Tier 3 recovery should capture ARIA state BEFORE sending to LLM (prevents LLM from confabulating about page state)
- Format: numbered element list `42[button:Submit]` — consistent with WebArena/browser-use; LLM has seen this format in training data

**Key implementation note:** Playwright's `ariaSnapshot.ts` runs in-page via `page.evaluate()` — it doesn't require CDP. Conxa can use this directly without a CDP relay.

---

### 4. Reliability — Auto-Wait

**Best-in-class:** Playwright (injected/injectedScript.ts actionability gates)

Playwright waits for: attached → visible → stable (no motion) → enabled before dispatching any action. This 4-state gate eliminates an entire class of timing failures (animated elements, lazy-loaded content, disabled submit buttons).

**What Conxa should adopt:** Exactly this gate sequence in Tier 1/2 execution. The specific states matter:
- `attached` — element exists in DOM
- `visible` — not `display:none` and has non-zero bounding box
- `stable` — bounding box hasn't moved for 2 consecutive frames
- `enabled` — not `disabled` attribute; not `aria-disabled`

SeleniumBase's 100ms poll loop approximates this but without the `stable` check — Conxa should use Playwright's version.

---

### 5. Recovery / Self-Healing

**Best-in-class:** Stagehand (`lib/v3/cache/`) — cache-first with inline drift recovery

The recovery flow:
1. Check cache by `sha256(instruction + normalizedUrl + sortedVariableKeys)`
2. Cache hit → attempt `waitForCachedSelector` → if selector exists, execute deterministically
3. Selector drift detected → immediately re-ground via LLM → update cache in place (no new entry)
4. Cache miss → ground via LLM → write to cache

This means warm cache hits cost ZERO LLM tokens, and drift recovery pays LLM cost only once (then becomes warm again).

**What Conxa should adopt:** This exact flow, with two extensions:
- Tier 2 check (ARIA role+name) before going to LLM on drift — many drifted selectors can be re-resolved without LLM
- configSignature field to prevent cross-environment cache pollution (Stagehand already does this)

**Runner-up:** SeleniumBase's exception-classified fallback ladder — the exception → fallback mapping is directly adoptable for Conxa's Tier 1 error handling (before escalating to Tier 2/3).

---

### 6. Vision / Visual Grounding

**Best-in-class:** UI-TARS (coordinate-based with scaleFactor normalization) + SeeAct paper (two-stage grounding)

UI-TARS handles HiDPI correctly: VLM outputs logical coordinates, operator.execute multiplies by `screenshotContext.scaleFactor` to get physical pixels. This is the correct implementation — most vision agents get this wrong.

SeeAct proves: describe-then-match outperforms direct coordinate output. The pipeline should be:
1. LLM describes target element in natural language
2. Grounding module matches description against ARIA tree → returns selector
3. Only if ARIA match fails: fall back to coordinate-based click

**What Conxa should adopt for Tier 4:**
- scaleFactor normalization (copy UI-TARS logic exactly)
- Attempt ARIA re-match on the grounded coordinate region before committing to pixel click
- OS-ATLAS as the grounding model: `(screenshot, description) → {x, y, w, h}` normalized

---

### 7. LLM Integration

**Best-in-class:** browser-use (agent loop with reflection) + Stagehand (CUA clients with structured output)

browser-use's `AgentOutput.evaluation_previous_goal` forces the LLM to explicitly reflect on whether the previous step succeeded before planning the next. This reflection is baked into every prompt — not added as a separate call.

Stagehand's CUA clients (Anthropic/OpenAI/Google) provide a clean abstract interface over LLM providers, with unified tool schemas. The `convertToolUseToAction` function in `actionMapping.ts` translates LLM tool calls to Playwright actions.

**What Conxa should adopt for Tier 3:**
- Reflection field in re-grounding prompt: "The previous selector [X] failed. Describe what you see on screen and identify the correct element."
- Abstract provider interface (not hardcoded to one LLM) — Conxa's Tier 3 should support Anthropic/OpenAI/Gemini via a single adapter
- Structured output (JSON schema) for all LLM calls — never parse freeform text for action parameters

---

### 8. MCP Integration

**Best-in-class:** Playwright MCP (`playwright-core/src/tools/mcp/`)

The ServerBackend interface is the critical abstraction: it separates the MCP protocol harness from the browser implementation. This enables:
- Multiple backend types (BrowserBackend, SSHBackend, CDPRelayBackend)
- Stateless tool listing (no browser launched until first tool call)
- Modal state gating (tools that shouldn't run during navigation/dialog are blocked)

**What Conxa should adopt:**
- `ServerBackend` interface as the seam between Conxa's MCP server and execution engine
- Lazy browser init: `ensureBrowser()` only on first tool call — reduces startup latency
- Auto-ARIA snapshot after every action as part of the tool result — gives Claude Desktop current page state without requiring an explicit `page_snapshot` call
- FilteredTools pattern: expose different tool subsets based on config (e.g., record-mode vs replay-mode tools)

---

### 9. Caching

**Best-in-class:** Stagehand (only framework with caching)

No other framework has trajectory caching. This is a significant competitive gap that Stagehand has uniquely solved.

**Key Stagehand cache design decisions Conxa should adopt:**
- Hash key: `sha256(instruction + normalizedUrl + sortedVariableKeys)` — URL normalization removes query-param noise; sorted variable keys ensure order-independence
- Secret hygiene: only variable KEY names in the hash; values substituted at runtime — credentials never enter cache
- Version field in cache entry: enables cache invalidation when action format changes
- In-place update on drift: don't create a new entry; update the existing one — prevents cache bloat

---

### 10. Enterprise Features

**Best-in-class:** SeleniumBase (stealth + pytest integration) + WorkArena paper (task taxonomy)

SeleniumBase's UC mode (undetected-chromedriver) and CDP mode provide the best bot-detection bypass in any open-source framework. For enterprise targets with strict bot detection (Workday, Salesforce, etc.), this is essential.

**What Conxa should adopt:**
- CDP mode as a fallback execution layer — when standard WebDriver actions fail due to bot detection, route via CDP
- The deferred assert pattern: collect failures throughout a skill execution, report all at the end — enables full-run diagnostics rather than fail-on-first-error
- WorkArena's task taxonomy as the enterprise skill library roadmap: form fill → table nav → wizard flow → export

---

### Summary Table — Patterns to Adopt

| Pattern | Source | Conxa Component |
|---------|--------|-----------------|
| Selector cost model (role→label→text→testid→css) | Playwright selectorGenerator | Build Studio compile step |
| 4-signal multi-identity storage | Mind2Web + Playwright | SkillPackage element entry format |
| Actionability gates (attached→visible→stable→enabled) | Playwright injectedScript | Tier 1/2 execution engine |
| Exception-classified fallback ladder | SeleniumBase sb_driver | Tier 1 error handler |
| sha256 cache key + in-place drift refresh | Stagehand ActCache | Conxa replay cache |
| Secret hygiene (keys only in hash) | Stagehand | Replay cache + skill package |
| Auto-ARIA snapshot after each action | Playwright MCP | MCP tool result format |
| Numbered ARIA tree format `42[button:Submit]` | browser-use / WebArena | Tier 3 re-grounding prompt |
| Describe-then-match (not direct selector output) | SeeAct | Tier 3 LLM protocol |
| scaleFactor coordinate normalization | UI-TARS | Tier 4 vision executor |
| SoM + DOM text dual representation | WebVoyager / SeeAct | Tier 3/4 LLM prompt |
| Reflection on previous step | browser-use AgentOutput | Tier 3 re-grounding prompt |
| ServerBackend interface | Playwright MCP | MCP server architecture |
| Lazy browser init (ensureBrowser) | Playwright MCP | MCP server startup |
| CALL_USER as first-class action | UI-TARS | Tier 5 human escalation |
| Functional evaluators for task success | WebArena / WorkArena | Skill package verifier |

---

## Deep Per-Repo Review (Three Ideas Each)


**Role:** Distinguished Engineer review. Not a summary. For each repo: the **3 most important architectural ideas** Conxa could learn, each with *why it matters / why it works / where it breaks / adopt?/ value*; then the **single most misunderstood aspect** of that repository — the thing the first-pass research, or an average reader, gets wrong.

Value scale: **★1–5** = ROI to Conxa (5 = changes the core architecture).

---

### 1. Playwright

#### Idea 1 — Element identity is a *late-bound serializable description*, re-resolved every attempt
- **Why it matters:** This is the philosophical foundation of deterministic replay. A `Locator` is a `(frame, selectorString)` pair, never a captured node. Stale handles become *impossible* by construction.
- **Why it works:** Re-querying is free and idempotent; a React re-render between perception and action can't invalidate identity because identity was never bound to a node.
- **Where it breaks:** It only re-resolves *the same selector*. If the selector itself is now wrong (DOM restructured), late binding doesn't help — Playwright throws. Late binding solves staleness, not drift.
- **Adopt?** **Yes — already core to Conxa's thesis.** Playwright is the proof that the invariant is right.
- **Value: ★★★★★**

#### Idea 2 — The scored generator with a *unique-match* selection rule
- **Why it matters:** It's a deterministic, zero-LLM answer to "which selector is best," with published cost constants and a hard rule: pick the lowest-score candidate that matches *exactly one* element in the live DOM.
- **Why it works:** The uniqueness gate is what makes it safe — a cheap selector is only chosen if it's unambiguous *right now*. Scoring encodes accumulated empirical knowledge (GUID-like IDs penalized, role+name rewarded).
- **Where it breaks:** Uniqueness is checked at *generation* time against *one* DOM. The chosen selector can become non-unique later (a second "Submit" appears). And the generator collapses the candidate list to one selector — discarding exactly the alternatives Conxa needs for recovery.
- **Adopt?** **Yes — but adopt the *algorithm*, and stop it from collapsing the list.** The uniqueness rule should also run at *replay* time (Conxa's "fingerprint live candidates"), which is precisely Playwright's gap.
- **Value: ★★★★★**

#### Idea 3 — Frame/shadow traversal encoded *in the selector grammar* (`internal:control=enter-frame`, shadow-piercing as an evaluator flag)
- **Why it matters:** Iframe and shadow-DOM traversal is the hardest part of enterprise automation (Salesforce, ServiceNow, embedded widgets). Encoding it *in the identity string* rather than in imperative code means the frame chain travels with the element through compile and replay — directly serving Conxa's "iframe chain preserved verbatim" invariant.
- **Why it works:** Traversal becomes data, not control flow; recovery stays correctly scoped to the right frame; one evaluator handles open shadow roots uniformly.
- **Where it breaks:** Closed shadow roots are opaque to everyone (Playwright included). Cross-origin iframes impose CDP boundaries that the string grammar hides but doesn't eliminate.
- **Adopt?** **Yes — and elevate it.** This is under-ranked in the first-pass research. For the enterprise apps Conxa targets, frame/shadow handling is a *moat*, not a footnote.
- **Value: ★★★★☆**

#### Most misunderstood aspect
**That Playwright's value to Conxa is its runtime. It is not — it's the *generator*.** Playwright's runtime deliberately *fails hard* and keeps only one selector; it is the philosophical *opposite* of self-healing. The reusable asset is the in-page `selectorGenerator` (a compile-time artifact) and the actionability gates (a Tier-1 primitive). Treating "we use Playwright" as "we get resilience" is the trap — Playwright gives determinism and fails loudly; the resilience is entirely Conxa's to build on top.

---

### 2. SeleniumBase

#### Idea 1 — Exception *type* is a free recovery signal (typed exception → typed fallback)
- **Why it matters:** It turns recovery from guesswork into a lookup table at zero cost. `StaleElement` → re-find; `Intercepted` → JS click; `OutOfBounds` → re-scroll; benign `WebDriverException` → swallow.
- **Why it works:** The browser already tells you *why* the action failed; the failure cause deterministically selects the right remedy. No inference, no model.
- **Where it breaks:** It's only as good as the exception taxonomy of the underlying driver. Custom web components that swallow events and *silently* no-op (no exception thrown) defeat it — the click "succeeds" but nothing happens. SeleniumBase can't see that.
- **Adopt?** **Yes — this *is* Conxa Tier 1.** Highest-confidence, best-documented insight in the corpus.
- **Value: ★★★★★**

#### Idea 2 — Escalate recovery by *invasiveness*: re-find < native < JS-dispatch < jQuery < protocol
- **Why it matters:** It establishes the correct mental model for a cascade — each rung is more forceful and more likely to bypass page logic, so you try the *least* invasive first and only escalate on a throw.
- **Why it works:** A JS `dispatchEvent` click bypasses overlay/interactability checks; it recovers a large class of "intercepted" failures *for free*. The ladder exhausts deterministic options before there's any question of a model.
- **Where it breaks:** Invasiveness cuts both ways — a forced JS click can fire on an element the user *couldn't* actually reach, producing a "successful" action that's semantically wrong (clicking a hidden submit). Forcefulness trades correctness for success-rate. SeleniumBase has no post-condition check to catch this.
- **Adopt?** **Yes for the ladder — but pair every forced action with a post-condition assertion** (Conxa must verify the *outcome*, not just the absence of an exception). This is where Conxa must *beat* SeleniumBase, not just copy it.
- **Value: ★★★★★**

#### Idea 3 — `wait_for_any_of_elements` — first-of-N satisfies (the manual ancestor of multi-signal resolution)
- **Why it matters:** It's the primitive shape of "try these candidates, take the first that resolves" — i.e., the Tier-1 resolution loop over a ranked signal set.
- **Why it works:** Polls all candidates concurrently each tick; returns the first to reach readiness. Naturally handles "the page might render one of two layouts."
- **Where it breaks:** SeleniumBase requires the author to *manually enumerate* the candidates. It has no automatic multi-signal generation and no ranking — so in practice almost nobody uses it. The mechanism is right; the ergonomics killed it.
- **Adopt?** **Yes — automate what SeleniumBase left manual.** Conxa's compiler generates the ranked candidate set; the runtime runs exactly this first-of-N loop. This single primitive, fed by orthogonal compiled signals, *is* Conxa Tier 1+2.
- **Value: ★★★★☆**

#### Most misunderstood aspect
**That SeleniumBase's reliability comes from clever selectors. It does not — it comes from *timing discipline*.** The 17K-line `base_case.py` is overwhelmingly wait-staging, scroll-into-view, and ready-state synchronization, not selector intelligence. SeleniumBase's *selector* model is primitive (one string, fail hard). The lesson is inverted from what people assume: **most "flaky selector" failures are actually timing failures**, and they're solved deterministically *before* identity ever matters. Conxa should copy the timing discipline wholesale and *not* copy the selector model at all.

---

### 3. Stagehand

#### Idea 1 — Compile intent to a replayable `Action` and key it by content hash
- **Why it matters:** It's the cleanest minimal proof of "ground once, replay free." `{selector, method, arguments, description}` under `sha256(instruction + normalizedUrl + sortedVariableKeys)`.
- **Why it works:** URL normalization removes query noise; sorted keys make the hash order-independent; replay is fully deterministic and zero-token on a warm hit.
- **Where it breaks:** The key contains *no page-version signal*. A site redesign yields a cache **hit** on a now-wrong selector — a guaranteed failure that must be caught downstream at replay. The hash protects against *intent* collisions, not against *world* change.
- **Adopt?** **Concept yes, mechanism partially.** Conxa's compiled package *is* the cache; the real question Conxa inherits is **invalidation**, which the hash doesn't address. Conxa needs a page/app-version fingerprint (Stagehand's `configSignature` is the seed of this idea) to know when a package is stale.
- **Value: ★★★★☆**

#### Idea 2 — Self-heal = re-ground then *refresh the entry in place* (one code path serves first-run and recovery)
- **Why it matters:** Elegant: there's no separate "recovery system," just "fall back to the grounding path and upgrade the cache." Successful recovery *improves* the artifact.
- **Why it works:** Because grounding is already the normal path, healing reuses it for free; the cache monotonically improves with use.
- **Where it breaks:** **In-place local mutation is incompatible with Conxa's signed-package, central-compile model** (see audit §C.3). Stagehand can mutate freely because its cache is local, unsigned, single-tenant. Conxa cannot silently rewrite a signed artifact on the customer's disk.
- **Adopt?** **Adapt, don't adopt.** Keep "recovery reuses the grounding path"; replace "rewrite local entry" with "use ephemerally for this run + emit telemetry → Cloud re-signs." The healing *write-back* must go to the fleet, not the local file.
- **Value: ★★★★☆ (as adapted); ★★☆ if copied literally)**

#### Idea 3 — Independent ARIA probe as verifier ground truth ("evidence wins over the agent's claim")
- **Why it matters:** It separates *what the agent thinks happened* from *what actually happened*, captured by an independent channel. This is the foundation of trustworthy verification and of anti-hallucination.
- **Why it works:** The probe runs outside the agent's perception, so the agent can't fabricate it. Comparing claim vs probe yields a typed finding.
- **Where it breaks:** It's *offline* in Stagehand — a batch eval tool, not a live gate. It also costs an extra page capture per step.
- **Adopt?** **Yes — but pull it *into* the live cascade as the post-condition check** that Conxa needs anyway (and that SeleniumBase lacks). The independent probe is exactly how Conxa verifies that a forced/recovered action achieved the intended state. This is the single most *underused* idea in Stagehand's report.
- **Value: ★★★★★**

#### Most misunderstood aspect
**That Stagehand validates Conxa's architecture. It validates the *thesis* but is the *inverse* of the architecture.** Stagehand is LLM-in-the-loop *by default* with caching bolted on as an optimization; Conxa is compiled-deterministic by default with LLM as escalation. The danger is reading Stagehand's success as "caching makes agents fast enough" — which would tempt Conxa toward lazy runtime grounding. The correct reading: Stagehand proves *the value of a compiled action*, while inadvertently demonstrating *why compilation must happen ahead of time, not lazily at runtime* (its cold/miss path is unbounded and expensive — exactly what Conxa exists to eliminate).

---

### 4. Browser Use

#### Idea 1 — A page is fully LLM-groundable from AX tree + computed styles + bounds (screenshot optional)
- **Why it matters:** It proves the *text* accessibility representation — not pixels — is the backbone for re-grounding. This is the cheap path for Conxa Tier 3 before any vision spend at Tier 4.
- **Why it works:** The AX tree carries role/name/state; computed styles and bounds disambiguate; a numbered index gives the model a referent. Vision becomes augmentation, not necessity.
- **Where it breaks:** Their serializer truncates at 40k chars — on large enterprise pages the *target element can be dropped silently*. And the integer index is per-step ephemeral, useless across steps.
- **Adopt?** **Yes for the representation; no for the truncation.** Conxa must rank-and-cap with the *recorded target's signals* (so the intended element is never the one truncated away) — see audit and WorkArena's <500-node pre-filter.
- **Value: ★★★★☆**

#### Idea 2 — Reflection-in-the-action-call (`evaluation_previous_goal` + `next_goal` in one structured output)
- **Why it matters:** Self-correction without a separate critic call — the model commits to assessing the prior step *before* choosing the next, in the same token budget.
- **Why it works:** Forcing the assessment into the schema makes "did that work?" non-optional, reducing blind repetition of failing actions.
- **Where it breaks:** The model still self-reports — it can confidently mis-assess ("the form submitted") when it didn't. Reflection without an *independent* post-condition probe (Stagehand's idea) is just more confident hallucination.
- **Adopt?** **Yes — but only paired with the independent AX probe.** Reflection tells you the model's belief; the probe tells you the truth. Conxa needs both at Tier 3.
- **Value: ★★★★☆**

#### Idea 3 — Soft, non-blocking stall/loop detection via a cheap page fingerprint
- **Why it matters:** A rolling hash of (url + element_count + DOM-text) cheaply detects "my actions are doing nothing," which is the failure mode that turns into infinite token burn.
- **Why it works:** It's near-free, it never false-blocks (it only injects awareness), and it's exactly the guard a *self-healing retry loop* needs so it can't thrash on a stagnant page.
- **Where it breaks:** As a *soft* nudge it can be ignored by the model; on a page that legitimately doesn't change between valid steps (a multi-field form on one screen) the fingerprint barely moves and risks false stall signals.
- **Adopt?** **Yes — as a hard cap on Conxa's recovery loop**, not a soft nudge. Conxa's recovery is deterministic code, so the fingerprint should *bound retries* (N unchanged fingerprints → escalate tier / call human), not merely advise a model.
- **Value: ★★★★☆**

#### Most misunderstood aspect
**That browser-use's `selector_map` is a form of element identity Conxa could learn from. It is the *opposite* of identity.** The integer index is re-minted every step and means nothing across time — it's a per-prompt convenience, not a durable handle. The genuinely transferable asset is the **rich per-node multi-signal representation** *behind* the index (role, name, attributes, xpath, bounds, computed styles), which is exactly what Conxa compiles *durably*. Reading `selector_map` as "lightweight identity" leads to copying the one thing that makes browser-use non-replayable.

---

### 5. Playwright MCP

#### Idea 1 — The `ServerBackend` seam: transport-agnostic harness / declarative registry / per-connection backend
- **Why it matters:** It's the correct decomposition for an MCP runtime — the protocol plumbing never imports domain logic, so execution backends are swappable and tool listing is stateless.
- **Why it works:** `{initialize, callTool, dispose}` is a tiny interface; the harness owns lifecycle/transport/heartbeat; the registry is just data; the backend holds browser state.
- **Where it breaks:** Nothing structurally — but it stops at *atomic tools*. There's no notion of a compiled multi-step skill, which is Conxa's entire unit of value. The pattern is right; the granularity is wrong for Conxa.
- **Adopt?** **Yes — wholesale, then add the skill layer Playwright lacks.**
- **Value: ★★★★★**

#### Idea 2 — One schema (zod), three consumers: wire JSON Schema + runtime validation + TS types; errors returned *in-band*
- **Why it matters:** Single source of truth eliminates schema drift; in-band errors keep the protocol channel healthy so the caller always gets a readable message instead of a transport exception.
- **Why it works:** Parse-at-the-boundary means handlers never see malformed input; a `ZodError` becomes a clean result, not a crash.
- **Where it breaks:** zod-at-boundary validates *shape*, not *semantics* — it won't catch "this skill input is a valid string but names a company the caller isn't licensed for." That's an entitlement check, not a schema check.
- **Adopt?** **Yes — and extend "capability filtering" into "entitlement filtering"** (advertise only skills the customer is licensed for). This is a genuine improvement *over* Playwright, which the first-pass research correctly spotted.
- **Value: ★★★★☆**

#### Idea 3 — Lazy, per-connection backend with disconnect-driven disposal and transparent re-init
- **Why it matters:** Tool *listing* needs no browser, so startup is cheap; the browser is created on first action and re-created after a crash, so the MCP connection survives browser death.
- **Why it works:** `isClose` flips on disconnect → harness disposes → next call re-initializes. Resilience with no explicit retry logic.
- **Where it breaks:** Re-init mid-skill loses *in-skill state* (which step, what was filled). For Conxa's *multi-step* executions, "transparently re-create the browser" is not enough — you need execution checkpointing to resume a skill, not just a fresh context.
- **Adopt?** **Yes for the lifecycle pattern; extend with skill-execution checkpointing** so a mid-skill browser crash resumes from the last completed step rather than restarting.
- **Value: ★★★★☆**

#### Most misunderstood aspect
**That playwright-mcp is a model for how Conxa should expose the browser to the LLM. It is an *anti-model*.** Playwright-mcp exposes ~50 atomic primitives and *pushes the decision of what to click onto the LLM* — maximal non-determinism, the exact thing Conxa rejects. The `openWorldHint: true` annotation is the giveaway: these tools assume the model drives. Conxa should copy the *harness architecture* and invert the *tool philosophy* — expose a tiny closed-world verb set (`execute_skill`) and keep all element resolution inside the compiled skill. Misreading this leads to leaking atomic browser control to the model and surrendering determinism.

---

### 6. UI-TARS

#### Idea 1 — The operator interface: `screenshot()` / `execute(action)` / `getScreenSize()`, four pluggable backends
- **Why it matters:** It's a clean seam that lets one perception loop target desktop *or* browser unchanged — and, for Conxa, lets Tier 1/2 (DOM) and Tier 4/5 (vision) share *one action-execution contract*.
- **Why it works:** The loop never knows how the action is delivered; swapping execution substrate is a constructor change.
- **Where it breaks:** The interface is *coordinate-centric* (`execute({action, coordinate})`). Forcing DOM-based tiers through a coordinate-shaped contract is an impedance mismatch — Conxa's contract must be action-centric with *either* a selector *or* a coordinate target.
- **Adopt?** **Adopt the *seam idea*, redesign the *contract*.** One executor interface across tiers: yes. Coordinate as the universal action payload: no.
- **Value: ★★★☆☆**

#### Idea 2 — Set-of-Marks annotation as low-cost, DOM-free ground truth of intent
- **Why it matters:** Drawing a marker at the predicted coordinate gives a pixel-level audit trail of *where the system thought it acted* — independent of whether it landed correctly.
- **Why it works:** It's cheap, needs no DOM, and is human-legible — excellent for telemetry and user trust when vision recovery fires.
- **Where it breaks:** It records *intent*, not *outcome*. A marker on the right spot says nothing about whether the click did anything. Like reflection, it needs an independent outcome check to mean something.
- **Adopt?** **Yes — but only in the Tier-4 vision path and telemetry**, as a drift-detection signal (compare resolved coordinate vs compiled bbox anchor), never as success evidence.
- **Value: ★★★☆☆**

#### Idea 3 — CALL_USER as a first-class agent state (explicit pause-and-hand-to-human)
- **Why it matters:** It makes human escalation a *designed state*, not a silent failure — the right model for CAPTCHA/2FA/ambiguous-consent moments and for Conxa's Tier 5.
- **Why it works:** The loop suspends, surfaces context to the human, resumes on signal. Clean, auditable, honest about the system's limits.
- **Where it breaks:** In UI-TARS it's *model-initiated* (the VLM decides to call the user) — non-deterministic. For enterprise SLA you also need *rule-initiated* escalation (e.g., "this step touches payment → always confirm").
- **Adopt?** **Yes — as Tier 5, with both rule-initiated and recovery-initiated triggers.** A deterministic policy ("these step types always escalate") plus the recovery-exhausted trigger.
- **Value: ★★★★☆**

#### Most misunderstood aspect
**That `screenshotContext.scaleFactor` is the key UI-TARS lesson. It is a footnote.** The actually-important and *under-stated* lesson is the opposite of what UI-TARS does: it is living proof that **inference-only automation cannot scale or be audited** — every run pays full VLM cost, no knowledge transfers between runs, completion is whatever the VLM *claims*. UI-TARS's value to Conxa is as a *cautionary architecture* that defines precisely what the vision tier must be walled off into (rare, last-resort, outcome-verified), plus three genuinely reusable parts (operator seam, SoM, CALL_USER). Reading it as "we need good coordinate handling" misses that its real contribution is negative space — it shows what *not* to build as the primary path.

---

### Cross-Repo Pattern Surfaced by This Review

Three repos independently expose the *same missing piece*: **an independent post-condition outcome check.**
- SeleniumBase's forced JS/jQuery clicks can "succeed" while achieving nothing (no outcome check).
- browser-use's reflection and UI-TARS's SoM both record *belief/intent*, not *outcome*.
- Only Stagehand has the independent probe — and keeps it *offline*.

The synthesis: **Conxa's differentiator is not just the recovery cascade — it's pairing every recovered/forced action with a live, independent post-condition assertion.** That single addition fixes the shared blind spot of five of the six tools and is the thing that converts "the click didn't throw" into "the intended state was achieved." It belongs at the top of master-insights-v2.

---

## One Concept per Repo

*The single most important idea to adopt from each repository (repository lens of the relevance review).*


#### Playwright — *one concept: the scored generator with a unique-match gate*
- **Why:** It's the only deterministic, published, battle-tested answer to "which selector is best, and is it unambiguous right now?" — and it runs in-page at zero token cost.
- **Problem solved:** Removes the LLM from selector *ranking* at compile time and gives the runtime a uniqueness test it can re-run live.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 7 | **10** | 8 | 6 | 1 | 1 |

Compilation is transformed (this *is* the compiler's core). Runtime gains the live uniqueness re-check. Recording benefits because capture defaults to semantic identity. Vision/MCP untouched.

---

#### SeleniumBase — *one concept: exception-classified, invasiveness-escalating fallback ladder*
- **Why:** It defines the entire zero-token recovery floor — typed failure → typed remedy, escalating re-find < native < JS < protocol.
- **Problem solved:** Recovers the *majority* of real-world flakiness (timing, overlays, staleness) before any model is involved, protecting the "Tier 1/2 = zero tokens" invariant.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 3 | 4 | **9** | **9** | 1 | 2 |

Runtime and Recovery are the payload (this is Tier 1). Compilation gains the validation/assertion-verb taxonomy. Recording gets a checklist of event types. **Caveat:** must be paired with an outcome check (SeleniumBase's own blind spot).

---

#### Stagehand — *one concept: the independent ground-truth probe + recovery-reuses-grounding-path*
- **Why:** Of everything in Stagehand, the *independent AX probe* (evidence beats the agent's claim) is the most underused and the most Conxa-relevant — it's the missing post-condition check the rest of the corpus lacks. (The cache-key hygiene is nice but secondary; the in-place self-heal is partly incompatible — see audit C.3.)
- **Problem solved:** Distinguishes "the action didn't throw" from "the intended state occurred" — the anti-hallucination, anti-false-success guarantee enterprise needs.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 5 | 7 | 8 | **9** | 3 | 4 |

Recovery and Runtime gain a live verification gate; Compilation gains the post-condition fingerprint as a compiled asset. **If instead you forced the cache concept:** Compilation 8 / Runtime 9 / Recovery 6 — but it imports the freshness/in-place-mutation conflict, so the probe is the better single pick.

---

#### Browser Use — *one concept: rank-and-cap multi-signal AX representation for LLM re-grounding*
- **Why:** It's the proven shape of the Tier-3 input — a compact, indexed, multi-signal page representation the LLM can ground against — *fixed* by ranking against the recorded target so the intended element is never truncated away.
- **Problem solved:** Makes Tier-3 re-grounding cheap (text, not pixels) and reliable (target-anchored, not blindly truncated).
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 2 | 3 | 4 | **9** | 6 | 2 |

Almost entirely a Recovery (Tier 3) improvement, with a Vision assist (text-first defers pixel spend). Negligible elsewhere — correctly, since browser-use's core loop is the thing Conxa rejects.

---

#### Playwright MCP — *one concept: the three-layer ServerBackend architecture*
- **Why:** It's the correct, reusable skeleton for an MCP runtime — transport-agnostic harness / declarative registry / per-connection backend, joined by a `{initialize, callTool, dispose}` seam.
- **Problem solved:** Decouples Conxa's `server.js` from skill-execution internals; enables stateless listing, lazy init, crash-survival, in-band errors, and entitlement filtering.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 1 | 2 | 6 | 3 | 1 | **10** |

Pure MCP-layer transformation, with a Runtime assist (lifecycle resilience). **Invert the tool philosophy:** copy the harness, expose a closed-world verb set, keep resolution inside the skill.

---

#### UI-TARS — *one concept: CALL_USER as a first-class escalation state*
- **Why:** It's the cleanest model for Tier 5 — a *designed* pause-and-hand-to-human state, honest about system limits, auditable. (The operator seam and SoM are useful but secondary; vision-as-primary is rejected.)
- **Problem solved:** Converts "silent failure / hallucinated success" at the end of the cascade into an explicit, logged human handoff for CAPTCHA/2FA/ambiguous/sensitive steps.
- **Subsystem impact:**

| Recording | Compilation | Runtime | Recovery | Vision | MCP |
|---|---|---|---|---|---|
| 2 | 3 | 4 | **8** | 5 | 4 |

Recovery (Tier 5) is the payload; Vision benefits from scaleFactor/SoM if/when Tier 4 fires; Compilation should mark which step-types are *always* escalation-worthy (rule-initiated, not just model-initiated).

---


---

## Where Each Subsystem's Biggest Wins Come From


| Subsystem | Top source (single best concept) | 2nd | 3rd |
|---|---|---|---|
| **Recording** | WorkArena (which interactions to capture) | Playwright (semantic-default capture) | Mind2Web (multi-signal at capture) |
| **Compilation** | Playwright (scored generator) | Mind2Web (signal ordering) | WebArena (compiled outcome checkers) |
| **Runtime** | SeleniumBase (Tier-1 ladder) | Playwright (live uniqueness gate) | Stagehand (live probe gate) |
| **Recovery** | SeeAct (describe-then-ground) | SeleniumBase + Stagehand (ladder + probe) | browser-use (target-anchored AX re-ground) |
| **Vision** | OS-ATLAS (Tier-4 grounder) | WebVoyager (dual representation) | UI-TARS (scaleFactor/SoM) |
| **MCP** | Playwright MCP (ServerBackend seam) | Playwright MCP (entitlement filtering) | UI-TARS (CALL_USER as a tool state) |

**Reading:** Recording's biggest lever is a *paper* (WorkArena), not a repo — the research over-indexed on repos for recording and missed that the highest-value recording guidance is "capture the interaction types enterprise flows actually depend on." Recovery is the most *contested* subsystem — its wins are spread across four sources and require *combination* (ladder + probe + describe-then-ground + target-anchoring), which is exactly why a single "Recovery" capability-matrix score is misleading (audit B.11).
