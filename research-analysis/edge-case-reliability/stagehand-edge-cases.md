# Stagehand — Edge-Case Reliability Analysis (for Conxa)

> Source corpus: `browserbasehq/stagehand`, `packages/core/lib/v3/`. Lens: Conxa's deterministic-default (record→compile→replay, zero-LLM hot path, LLM only as recovery escalation). References EC-IDs and the five families from `edge-case-inventory.md`.

## Framing: what Stagehand actually "handles"

Stagehand is **LLM-in-the-loop by default with caching as an optimization** — the architectural inverse of Conxa. For the vast majority of edge cases, Stagehand's "resolution" is not a deterministic mechanism: it is *"send the serialized DOM/ARIA tree (or a screenshot) to the model and let it pick the element."* That is not adoptable for Conxa's compiled hot path, and this document is honest about it: most of Stagehand's edge-case robustness is **delegated to the LLM's perception**, not engineered.

Three things, however, *are* genuinely deterministic-compatible and worth importing:

1. **Cache-first replay + drift-detection + self-heal-as-refresh** (`ActCache.ts`) — the closest analog to Conxa's compiled replay. Adopt the drift detector (`haveActionsChanged`) and the re-ground-then-refresh write-back pattern.
2. **Independent ARIA probe as ground truth + the 8-category errorTaxonomy** (`captureAriaTreeProbe.ts`, `verifier/errorTaxonomy.ts`) — *"evidence beats agent claim."* This is Stagehand's single best idea for Conxa and is covered deeply under EC-28.
3. **Inheritance from Playwright** for actionability (EC-05/06/07) and frames (EC-01) — Stagehand does **not** reinvent these; it leans on Playwright's auto-waiting locator engine. Noted, not adopted (Conxa already sits on Playwright too).

What does **not** fit Conxa: per-step live LLM grounding for stochastic interruptions and hover/typeahead (EC-15/19/20/25) — non-deterministic by construction.

---

## Mechanisms (cited), referenced by the entries below

- **`ActCache.tryReplay` / `replayCachedActions`** (`cache/ActCache.ts`): on a warm hit, for each cached `Action` it calls `waitForCachedSelector` then `handler.takeDeterministicAction` — **zero LLM tokens**. Variable-key gating (`doVariableKeysMatch`, `hasAllVariableValues`) aborts to a miss rather than replaying partially. Cache key = `sha256(instruction + normalizeUrlForCacheKey(url) + sortedVariableKeys)`.
- **`waitForCachedSelector`** (`cache/utils.ts`): `page.waitForSelector(selector, { state: "attached", timeout })` before acting; on timeout it **logs and proceeds anyway** (non-blocking pre-wait). This is the load-timing absorber.
- **`haveActionsChanged` → `refreshCacheEntry`** (`cache/ActCache.ts`): after a successful replay, if the re-derived actions differ in selector/method/args/description, the cache entry is **rewritten in place** — self-heal *is* a cache refresh, not a separate tier.
- **`takeDeterministicAction` → `performUnderstudyMethod`** (`handlers/actHandler.ts`, `handlerUtils/actHandlerUtils.ts`): maps `{selector, method, args}` to a Playwright **locator** call (`locator.click`, `locator.fill`, `locator.selectOption`, `DOM.scrollIntoViewIfNeeded`). All Playwright actionability (visible/stable/enabled/receives-events) is inherited here. On throw, if `selfHeal` is on, it **re-snapshots the page and re-grounds via the LLM** (`getActionFromLLM`) then retries.
- **`captureAriaTreeProbe`** (`agent/utils/captureAriaTreeProbe.ts`): harness-captured a11y tree via `v3.extract()` (no schema → `pageText`), token-budgeted (~8k tokens/32k chars default), truncation explicitly marked, **never throws** (failures surface as `evidence_insufficient`). Independent of what the agent saw.
- **`RubricVerifier`** (`verifier/rubricVerifier.ts`) + **`ERROR_TAXONOMY`** (`verifier/errorTaxonomy.ts`): offline, multimodal, per-criterion top-K evidence selection; fuses agent claims against tier-1 (agent-ingested) and tier-2 (independent probe) evidence; emits taxonomy-coded findings. **Offline/eval only — not a live self-heal trigger.**

---

## Family 1 — Identity drift (EC-09/10/11/12/44, EC-04 boundaries)

### EC-09 React/SPA re-render & element detachment · EC-12 Dynamic IDs / GUID classes
*(The flagship adoptable pattern — Stagehand's cache replay is the analog to Conxa's compiled replay.)*

- **Detection.** Two layers. (a) *Pre-act drift*: `waitForCachedSelector` waits for `state:"attached"`; a re-rendered/detached node makes the cached selector fail to attach → it logs and proceeds, and the subsequent Playwright locator call throws "element is not attached"/stale. (b) *Post-act drift*: after a successful re-grounding, `haveActionsChanged(entry.actions, actions)` compares selector/method/args/description element-wise and flags any difference.
- **Representation.** A cached `Action` carries a **single** `selector` string (plus method/args/description). There is no multi-signal fingerprint — identity is one selector. Dynamic IDs (`id="ember1234"`, `css-1a2b3c`) are only stable to the extent the LLM-derived selector avoided them at grounding time; nothing structurally guards against GUID drift.
- **Resolution.** On a stale/throwing selector with `selfHeal` enabled (`actHandler.takeDeterministicAction` catch block): re-snapshot the page (`captureHybridSnapshot`), call `getActionFromLLM` to derive a fresh action, retry. **This is an LLM round-trip** — not deterministic.
- **Recovery.** Successful re-grounding triggers `refreshCacheEntry`: the cache entry is overwritten with the new actions in place. One code path (live grounding) serves both first-run and recovery; a good run silently upgrades the cache. No graduated zero-token ladder.
- **Reliability.** Warm-hit replay is genuinely zero-LLM and fast. But the moment the single selector breaks, recovery costs a full LLM grounding — the brittleness Conxa's multi-signal fingerprint exists to remove. `waitForCachedSelector` proceeding-on-timeout is a deliberate flake absorber but can mask a real miss.
- **Conxa applicability.** **Adopt the drift detector and write-back pattern, reject the single-selector representation.** `haveActionsChanged` ≈ Conxa's "did the recovered identity differ from the compiled one?" Slot the re-ground-then-refresh idea as a **Tier 3+ recovery** that feeds the recovered signal **to the Cloud** (Conxa compiles centrally) rather than mutating local cache files. Keep Conxa's multi-signal late-bound identity (XPath/text/role/attributes/anchors) so EC-09/12 are resolved at Tier 1/2 with **zero LLM**, where Stagehand needs the model.

### EC-10 Text/label changes · EC-11 Layout/position changes · EC-44 A/B variants
- **Detection / Resolution.** No dedicated mechanism. These surface only as a failed cached selector → LLM re-ground (as EC-09). The LLM tends to absorb copy/layout changes naturally because it re-reads the live tree, but that robustness is a **property of asking the model**, not of any deterministic handling.
- **Conxa applicability.** Not adoptable as-is. Conxa's compile-time multi-signal identity (role+name not raw position; semantic anchors) is the deterministic answer; Stagehand only validates that re-reading the page absorbs these — which Conxa achieves at compile time, not runtime.

---

## Family 2 — Timing & actionability (EC-05/06/07/08/31/32)
*(Inherited wholesale from Playwright — Stagehand does not reinvent it.)*

### EC-05 Not stable · EC-06 Overlapped/pointer-intercepted · EC-07 Off-screen · EC-08 Disabled-until-ready
- **Detection / Resolution.** Delegated to **Playwright's locator actionability** inside `performUnderstudyMethod`: `locator.click()` auto-waits for visible+stable+enabled+receives-pointer-events; `DOM.scrollIntoViewIfNeeded` is issued for off-screen targets; `locator.fill()`/`selectOption` enforce editability/enabled. Stagehand writes **no** stability-gate or overlay-detection of its own — when Playwright throws "intercepts pointer events" or "element is not stable," that's Playwright, not Stagehand.
- **Representation.** None beyond the selector handed to the locator. `waitForCachedSelector` adds only an *attached* pre-wait (weaker than actionability) before the cached call.
- **Recovery.** A Playwright actionability timeout becomes the throw that triggers self-heal re-grounding (EC-09 path). So Stagehand's *only* timing recovery is "re-ask the LLM" — there is no classified deterministic ladder (force-click / wait-for-stable / dismiss-overlay) like Conxa's Tier system.
- **Reliability.** High for the common case because Playwright's auto-wait is strong; weak for EC-06 overlays where the right move is to dismiss the intercepting node, not re-ground.
- **Conxa applicability.** **Note, don't adopt** — Conxa is also on Playwright and inherits the same actionability. The lesson is the *gap*: Stagehand has no deterministic actionability **ladder** above Playwright's primitive (stability frames, overlay-dismiss, force-click classification). Conxa should keep its classified deterministic ladder; Stagehand confirms raw Playwright auto-wait alone is insufficient for EC-06.

### EC-31 Slow load / never-idle · EC-32 Optimistic UI
- **Detection / Resolution.** `waitForCachedSelector`'s attached-pre-wait + Playwright auto-wait absorb slow loads; `domSettleTimeoutMs` bounds settle time. No `networkidle` dependency in the replay path (good — networkidle never fires on polling apps). Optimistic-UI reversion is **not handled**; only the offline verifier could catch a reverted outcome after the fact.
- **Conxa applicability.** The "attached pre-wait that proceeds on timeout, no networkidle dependency" is a sound, cheap, deterministic pattern worth mirroring in Conxa's settle logic. Optimistic-UI reversion belongs to Family 5 (verification), below.

---

## Family 3 — Stochastic interruption (EC-19/20/21/22/45/35) — **largely not adoptable**

### EC-19 Cookie/consent banners · EC-20 Modal dialogs (unexpected)
- **Detection / Representation.** Stagehand has **no conditional-step model and no banner pattern library.** A consent banner that intercepts a click is just an EC-06 pointer-interception → Playwright throws → self-heal re-grounds from a fresh snapshot. In the **CUA agent loop** the model sees the banner in the screenshot and may emit a dismiss action — but that is pure LLM perception, stochastic and non-deterministic.
- **Resolution / Recovery.** Either the LLM happens to dismiss it (agent mode) or the action fails and re-grounds (act mode). No deterministic dismiss-known-patterns.
- **Reliability.** Fundamentally non-deterministic. A consent banner appearing on only ~30–50% of runs is exactly the linear-replay killer, and Stagehand "solves" it only by virtue of running the model every step in agent mode.
- **Conxa applicability.** **Reject for the hot path.** This validates Conxa's thesis that Family 3 needs **compile-time conditional/optional representation** (dismiss-if-present steps, a known-pattern banner library), *not* runtime intelligence. Nothing to import from Stagehand here except the negative lesson.

### EC-22 Session-expired / auth-redirect mid-run
- **Detection / Resolution.** No first-class re-auth self-heal. A login redirect changes the URL and DOM; the cached selectors miss; the agent (in CUA mode) might re-login if credentials are available via `%variables%`, otherwise the run fails. Variables are key-hashed and substituted at replay (`substituteVariablesInArguments`) — secrets never persist — but there is no detection of "I was bounced to login."
- **Conxa applicability.** Conxa's genuine re-auth self-heal is **strictly stronger**. Stagehand offers nothing here beyond the variable-substitution hygiene (which Conxa already has via runtime auth state).

### EC-21 MFA/2FA · EC-35 Captcha · EC-45 idle interstitial
- **Detection.** Captcha appears in the taxonomy as **environment failure (3.4)** — a *classification* of a blocked run, not a handler. A `captchaSolver.ts` exists in agent utils (out of deterministic scope). MFA/idle interstitials have no mechanism.
- **Conxa applicability.** Treat as stop-signals / human-handoff, consistent with the inventory. Adopt only the *taxonomy code* (3.4 environment failure) for telemetry classification.

---

## Family 4 — Boundary traversal (EC-01/02/03/04/04b/43)
*(Again, Playwright-inherited; minimal Stagehand-specific machinery.)*

### EC-01 Single iframe · EC-02 Nested · EC-03 Cross-origin
- **Detection / Resolution.** `performUnderstudyMethod` receives `page.mainFrame()` and resolves locators through Playwright's frame model; selectors generated from the hybrid snapshot can target into frames, and Playwright's `frameLocator`/CDP traversal handles cross-origin. Stagehand adds the snapshot serialization (so the LLM "sees" frame content as one tree) but the **traversal itself is Playwright's**. No explicit frame-chain invariant preserved as a first-class compiled artifact.
- **Representation.** A frame chain is not separately encoded in the cached `Action` — it is folded into whatever selector the snapshot produced. Re-render of a frame (EC-43 stale handle) just fails → re-ground.
- **Conxa applicability.** **Note, don't adopt.** Conxa's verbatim-preserved iframe chain (`rootCandidates`/`frameLocator`, page-level bbox offsets) is the stronger, deterministic representation. Stagehand confirms Playwright handles the *traversal mechanics*; Conxa's improvement is encoding the chain as a compiled invariant rather than re-deriving it per run.

### EC-04 Open Shadow DOM
- **Detection / Resolution.** The accessibility-tree snapshot pierces shadow roots naturally (the a11y tree is post-composition), so the LLM can target shadow-DOM elements; Playwright locators also pierce open shadow roots. No bespoke piercing logic.
- **Conxa applicability.** The a11y-tree-pierces-shadow observation reinforces Conxa's Tier-1/2 a11y resolution. Closed roots (EC-04b) are out of scope for both.

---

## Family 5 — Outcome ambiguity (EC-25/26/27/28/29/23/24) — **Stagehand's best ideas for Conxa**

### EC-28 Silent wrong-element match / outcome ambiguity — **cover deeply; the single most valuable pattern**
This is the family where "it clicked" ≠ "it worked," and where Stagehand's **independent ARIA probe + 8-category errorTaxonomy** are directly adoptable as deterministic post-condition verification.

- **Detection.** Two independent evidence tiers, fused by the verifier with an explicit precedence rule. **Tier-1** = `agentEvidence` (the exact bytes the agent/LLM ingested — its own screenshot/text/JSON). **Tier-2** = `probeEvidence`, captured by **`captureAriaTreeProbe`** *independently of the agent* (`v3.extract()` → rendered a11y `pageText`, token-budgeted, truncation-marked, never-throws). The taxonomy states the rule verbatim: *"Screenshots and tool outputs are the ground truth — when there's a discrepancy between agent claims and evidence, evidence takes precedence."* A silent wrong-element click that leaves the cart empty surfaces as **2.2 Action contradiction** (claim achievable but evidence contradicts) or, if the agent fabricated the success, **2.4 Action fabrication**; a misread price as **2.1 Output contradiction**.
- **Representation.** `Trajectory` → `TrajectoryStep` each carrying `agentEvidence` (tier-1), `probeEvidence` (tier-2: independent URL + screenshot + ARIA tree), and `toolOutput`. The a11y tree is **textual** ground truth — verifies prices/names/dates/list contents **without OCR'ing screenshots** and without trusting the agent's own perception. The verifier scores against a `Rubric` of weighted criteria; `groupTopKByCriterion` selects the most relevant evidence per criterion (with a relevance-floor filter) so ~240k-token trajectories stay tractable.
- **Resolution.** `RubricVerifier.verify` runs a multimodal LLM judge that returns per-criterion `earned_points` (deterministic process score = Σearned/Σmax), an `output_success` boolean, taxonomy-coded `findings`, and a `firstPointOfFailure` with `error_code`. The independent probe is what lets the judge *override the agent's self-reported success* — closing the "agent says done, page says otherwise" hallucination gap.
- **Recovery.** **None in-line.** The verifier is **offline/batch** (consumes saved trajectories from disk); it is an eval/QA gate, *not* a live self-heal trigger. A silent wrong-element match is *detected after the fact*, not corrected mid-run.
- **Reliability.** The detection idea is excellent and the independence is the crux — the agent cannot fabricate the probe because the harness, not the agent, captured it. The weakness for Conxa: the judge itself is an LLM call, and it is offline-only.
- **Conxa applicability.** **Adopt the architecture, change two things.** (1) Make verification **live and in-cascade** (`verifyAssertions()` as a deterministic post-condition after each step), not a post-hoc eval. (2) Make the **probe deterministic**: Conxa already captures a11y at Tier 1/2 — adopt Stagehand's pattern of capturing it as **token-budgeted, truncation-marked, never-throws independent evidence** and assert compiled expectations (URL changed, target node now `aria-pressed`, cart count incremented, the expected text present in the independent a11y tree) **with zero LLM**. The "evidence beats agent claim" separation maps onto Conxa as "evidence beats *recovery-tier* claim": a Tier-3 LLM recovery's success must be confirmed by an independent deterministic post-condition before the step is accepted. Adopt the **errorTaxonomy codes wholesale** as the schema for telemetry findings (1.3 wrong action type, 2.2 action contradiction, 2.4 action fabrication, 3.4 environment failure) — turns failure analysis into aggregatable structured data across the fleet.

### EC-25 Autocomplete/typeahead · EC-26 Custom dropdown vs native `<select>` · EC-27 Date pickers
- **Detection / Representation.** Stagehand has a **two-step act path** (`actHandler` `twoStep`): grounds the first action (e.g., type into the field), re-snapshots, diffs the tree (`diffCombinedTrees`), then grounds the second action (select the option) against the **freshly rendered** options. It also has a dedicated `SELECT_OPTION_FROM_DROPDOWN` understudy method (`selectOption` → `locator.selectOption`) for native selects. So typeahead is handled by *re-perceiving the page after input* and letting the LLM pick the option that appeared.
- **Resolution.** Native `<select>` → deterministic `locator.selectOption`. Custom typeahead → **per-step LLM grounding** of the second action against the diffed tree. The diff-then-reground correctly addresses "options render after input," but the option *selection* is an LLM choice — **non-deterministic** and the EC-25 wrong-option failure (a top enterprise pain) is only guarded by the offline verifier.
- **Recovery.** Wrong option chosen → no inline catch; surfaces as **1.4 wrong values** or **1.1 missing intent** in the verifier.
- **Conxa applicability.** **The *structure* is adoptable; the *grounding* is not.** Adopt the "type → wait for async options to render → then act on the freshly observed list" as a **deterministic compiled sub-sequence** (open→wait-for-options→match-by-text→click), and gate it with an EC-28-style post-condition (the chosen option's text now appears in the field/a11y tree). Reject the LLM picking the option on the hot path. Use Playwright's native `selectOption` for true `<select>` (Conxa already distinguishes these).

### EC-23 File upload · EC-24 File download · EC-29 Contenteditable
- **Detection / Resolution.** No edge-case-specific machinery beyond whatever Playwright primitive the LLM-chosen method maps to (`setInputFiles`, download events, key events for contenteditable). Correctness is again only validated offline by the verifier (e.g., 3.3 incomplete delivery if a download was claimed but absent).
- **Conxa applicability.** Adopt only the **verification angle**: these are classic "it clicked ≠ it worked" cases that need a compiled post-condition (file present in DOM/state, download settled), exactly the EC-28 pattern.

---

## Honest summary of fit

| Mechanism | EC coverage | Deterministic? | Adopt for Conxa? |
|---|---|---|---|
| Cache-first replay (`tryReplay`/`takeDeterministicAction`) | EC-09/12 warm path | Yes (warm hit) | **Yes** — analog of compiled replay |
| `haveActionsChanged` drift detector + `refreshCacheEntry` | EC-09/10/11/12 | Yes | **Yes** — write-back to Cloud, not local |
| `waitForCachedSelector` attached pre-wait (no networkidle) | EC-31 | Yes | **Yes** — cheap settle pattern |
| Playwright actionability via `performUnderstudyMethod` | EC-05/06/07/08 | Yes (Playwright) | Note — inherited, keep Conxa's ladder above it |
| Playwright frame model | EC-01/02/03/04 | Yes (Playwright) | Note — Conxa's compiled chain is stronger |
| Self-heal re-ground on throw (`getActionFromLLM`) | EC-09 recovery | **No (LLM)** | Slot as Tier-3+ only |
| Two-step act (diff-then-reground) | EC-25/26/27 | **No (LLM pick)** | Structure yes, grounding no |
| Independent ARIA probe (`captureAriaTreeProbe`) | EC-28 + all of Family 5 | Yes (capture) | **Yes — flagship** |
| `RubricVerifier` + 8-cat `errorTaxonomy` | EC-28 detection/classification | **No (LLM judge), offline** | Taxonomy yes; make verification live+deterministic |
| CUA screenshot-per-step loop | EC-19/20 stochastic | **No (vision)** | **Reject** for hot path |

**Bottom line:** Stagehand's edge-case "handling" is mostly the LLM re-reading the page, plus Playwright's actionability underneath. Its three engineered, deterministic-compatible ideas are (1) drift-detected cache replay with refresh, (2) the independent ARIA probe as un-fakeable ground truth, and (3) the structured error taxonomy. Everything else is either inherited from Playwright or delegated to the model — and the model-delegated parts are exactly what Conxa must *not* put on the hot path.

---

## What Conxa should adopt from Stagehand

- **Independent post-condition verification (EC-28 — top priority).** Capture an independent, token-budgeted, never-throws a11y probe (à la `captureAriaTreeProbe`) and assert compiled expectations against it with **zero LLM** after each step. Enforce *"evidence beats claim"*: a step (including any LLM-recovered one) is accepted only when an independent deterministic post-condition confirms the outcome — closes the silent-wrong-element gap.
- **Drift detection as a first-class signal (`haveActionsChanged`).** When a recovery re-derives an element identity, diff it field-by-field against the compiled one; treat any difference as drift telemetry. This is the deterministic analog of Stagehand's selector-changed check.
- **Re-ground-then-refresh write-back — but to the Cloud.** Adopt the self-heal-as-refresh idea (successful recovery upgrades the artifact), but route the recovered signal to **Conxa Cloud** for central re-compilation, not to a local cache file — preserving the compile-centrally invariant.
- **The 8-category errorTaxonomy as the telemetry finding schema.** Code every recovery/failure with stable categories (1.3 wrong action type, 2.2 action contradiction, 2.4 action fabrication, 3.4 environment failure, 7.x ambiguity), turning fleet failures into aggregatable structured data.
- **Cheap settle pattern + two-step *structure* for typeahead.** Mirror the attached-selector pre-wait that proceeds-on-timeout and avoids `networkidle` (EC-31); and adopt the "type → wait for async options to render → act on freshly observed list" *shape* for EC-25/26/27 as a **compiled deterministic sub-sequence** with a post-condition — without putting the option choice on an LLM.
