# Playwright — Edge-Case Reliability Mechanisms (lens: Conxa)

**Scope.** This document maps Playwright's *actual* edge-case mechanisms to the EC taxonomy in `edge-case-inventory.md`, organized by the five failure families. It supersedes the prior architectural overview (`repos/playwright-main.md`) by going down to the function level in the live corpus (`/tmp/research-corpus/repos/playwright-main/`). Citations are `file::function`.

**The one-line thesis.** Playwright is the gold standard for *deterministic* edge handling in three families — Timing & actionability, Identity drift, Boundary traversal — and has **essentially nothing** for Stochastic interruption (family 3) and only partial coverage of Outcome ambiguity (family 5, via web-first assertions). Its defining property is **fail-hard-after-timeout**: it never guesses, never falls back to an alternate selector, and throws a precise error when a gate cannot be satisfied. That is exactly the deterministic spine Conxa's Tier 1/2 should adopt — and exactly where Conxa's recovery cascade must begin where Playwright stops.

---

## Family 2 — Timing & actionability (EC-05/06/07/08/31/32) — Playwright's strongest family

The reliability backbone. Every action re-resolves the locator and passes a fixed stack of *actionability gates* before dispatching input. Gates live in `packages/injected/src/injectedScript.ts`; the retry/scroll orchestration lives server-side in `packages/playwright-core/src/server/dom.ts`.

### EC-05 — Element not stable (animation/transition)
- **Detection** — `injectedScript.ts::_checkElementIsStable`. A `requestAnimationFrame` loop samples `getBoundingClientRect()` each frame; if two consecutive samples differ in x/y/width/height the element is "moving."
- **Representation** — the `'stable'` member of the `ElementState` enum; resolution requires `this._stableRafCount` (default 1) consecutive *identical* rects. Frames shorter than 15ms are dropped (WebKit-Win bug workaround).
- **Resolution** — `checkElementStates` runs the stability check *first*, before all other states. Returns `{ missingState: 'stable' }` until rects settle, which keeps the server retry loop polling.
- **Recovery** — none. If the element never stabilizes within `timeout`, the loop throws `TimeoutError` with `element is not stable`. No "click anyway" fallback unless the author passes `force: true`.
- **Reliability** — very high for CSS transitions/transforms; the gold-standard solution. **Limit**: it samples the *bounding box*, so an element animating *opacity* or *content* (not position/size) reads as stable; and a perpetually-animating element (spinner overlay, marquee) never passes and times out.
- **Conxa applicability** — **Adopt directly.** A 2-RAF stable-rect gate is pure zero-LLM determinism and belongs in Conxa's actionability layer before any recovery tier fires. Conxa should default `stableRafCount=2` (Playwright uses 1) for extra margin on enterprise apps.

### EC-06 — Overlapped / pointer-intercepted target
- **Detection** — `injectedScript.ts::expectHitTarget` and `setupHitTargetInterceptor`. At the computed click point, `elementsFromPoint`/`elementFromPoint` is walked through every shadow root from the target up to `document`; the top hit element must be the target *or a descendant*. Crucially it does this **twice**: a *preliminary* check before dispatch (2e in the inline "Life of a pointer action" comment) and a *per-event* check inside a `capture:true` window listener at the moment each `mousedown`/`mouseup` fires (2i), defeating layout shifts that race the click.
- **Representation** — returns either `'done'` or `{ hitTargetDescription }` naming the intercepting element (e.g. a `<dialog>` or sticky header), and identifies the `rootHitTargetDescription` subtree the overlay came from.
- **Resolution** — if a preliminary hit-target check fails, the server retry loop scrolls/retries (see EC-07). When an intercept is detected mid-event, `event.preventDefault()` blocks the click and **all subsequent events are blocked** until re-resolution.
- **Recovery** — none automatic; throws after timeout with a message naming the intercepting element: `<div class="overlay">…> intercepts pointer events`. `force: true` bypasses the hit-target check entirely.
- **Reliability** — extremely high; the composed-tree, per-event hit test is the most rigorous in the industry. **Limit**: a *transient* overlay (toast that auto-dismisses) is handled only by the implicit retry; a *persistent* one (consent banner) is a hard failure — Playwright will never dismiss it for you.
- **Conxa applicability** — **Adopt the hit-target check verbatim** as a deterministic pre-action gate and as a *wrong-element guard* (it directly addresses EC-28). The per-event capture-listener check is the single most valuable anti-misclick mechanism to port.

### EC-07 — Off-screen / needs scroll-into-view
- **Detection** — the click point falls outside the viewport / element quads are not visible.
- **Resolution** — `dom.ts::_retryPointerAction` calls `scrollRectIntoViewIfNeeded`, then on each retry **cycles the scroll anchor**: `undefined` (protocol default) → `{block:'end',inline:'end'}` → `{block:'center',inline:'center'}` → `{block:'start',inline:'start'}`. This deliberately re-anchors to escape `position:sticky` headers/footers that cover the element after a naive scroll.
- **Representation** — implicit; alignment indexed by `retry % 4` inside the retry loop.
- **Recovery** — none; if no alignment yields a clear hit target, timeout throw.
- **Reliability** — high; the alternating-anchor trick is the clever part most automation tools miss. **Limit**: scroll containers with custom virtualization (EC-13) may scroll-into-view a *placeholder* that gets replaced.
- **Conxa applicability** — **Adopt the alternating-anchor scroll ladder.** Cheap, deterministic, and directly fixes the most common "scrolled but still under the header" failure.

### EC-08 — Disabled-until-ready controls
- **Detection** — `injectedScript.ts::elementState` with `state='enabled'`/`'editable'`. Uses `getAriaDisabled` (covers `disabled`, `aria-disabled`, and disabled fieldset ancestors) and `getReadonly` for editability.
- **Representation** — `ElementState` enum members `enabled|disabled|editable`. `fill`/`type` require `editable`; `click` requires `enabled`.
- **Resolution** — the action poll loop simply keeps re-checking until the state flips, then proceeds. No explicit "wait for enabled" call is needed — it is an implicit gate.
- **Recovery** — timeout throw `element is not enabled`.
- **Reliability** — very high, and notably covers ARIA-disabled, which CSS-only checks miss. **Limit**: a control that is *visually* enabled but blocked by app-level JS validation (no DOM signal) is invisible to this gate.
- **Conxa applicability** — **Adopt.** ARIA-aware enabled/editable checks are zero-LLM and strictly better than `:disabled`-only checks.

### EC-31 — Slow load / spinner / skeleton / never-idle  &  EC-32 — Optimistic UI
- **Detection / Resolution** — Playwright deliberately does **not** rely on `networkidle` for actions (it is documented as discouraged). Instead, reliability comes from *per-action auto-wait*: the locator is re-resolved and gated every attempt, so "the button isn't there yet / the skeleton is still up" is just a missing `visible`/`attached` state that the loop waits out. This sidesteps the never-idle problem entirely.
- **Recovery** — timeout throw if the real content never appears.
- **Reliability** — high *because* it avoids global idle signals. **Limit**: it has no notion of "wait until the spinner is gone" beyond waiting for the *target* to become actionable; a spinner overlaying the target is caught by EC-06, not by a spinner-specific rule. For EC-32 (optimistic UI that reverts), Playwright has nothing — it acts on whatever is actionable at that instant.
- **Conxa applicability** — **Adopt the per-action auto-wait model; reject `networkidle` as a gate.** This is the correct deterministic stance. EC-32 (revert-after-server-reject) needs Conxa's Family-5 *outcome verification*, not a timing fix.

---

## Family 1 — Identity drift (EC-09/10/11/12, EC-44)

Playwright's answer is **late-bound locators + an accessibility-first scored generator**. Identity is a *serializable description re-resolved every attempt*, never a captured node.

### EC-09 — React/SPA re-render & element detachment (the #1 SPA failure)
- **Detection** — staleness is structurally *impossible* to hit silently: a `Locator` (`client/locator.ts::Locator`) holds only `{ _frame, _selector }`. Every action (`locator.click` → `frame.click(selector, { strict:true })`) re-runs `waitForSelector(... state:'attached')` fresh.
- **Representation** — the selector *string* (e.g. `internal:role=button[name="Submit"]`), not a node handle. Chaining (`.locator()`, `.filter()`, `.nth()`) returns a **new** Locator with an extended string; no I/O.
- **Resolution** — re-query on every attempt; the retry loop in `dom.ts::_retryAction` explicitly treats `'error:notconnected'` (node detached mid-action) as a *retry*, not a failure, re-resolving the selector.
- **Recovery** — if the description stops matching entirely, timeout throw. No alternate-selector fallback (the generator's other candidates were discarded at codegen — see ADAPT below).
- **Reliability** — excellent for re-render; this invariant is the single biggest reason Playwright is less flaky than Selenium. **Limit**: if the *re-rendered* element's role/name/text changed, the single stored selector misses and there is no rescue.
- **Conxa applicability** — **Adopt the late-bound invariant fully** (Conxa's `resolveElement`/`withLocator`/`rootCandidates` already lean this way). The divergence Conxa must keep: **preserve the full ranked candidate list** into the skill package so a missed primary selector can fall to the next deterministic candidate — Playwright throws here; Conxa's cascade is the value-add.

### EC-12 — Dynamic IDs / GUID-like classes
- **Detection** — `selectorGenerator.ts::isGuidLike`: counts character-class transitions (lower↔upper↔digit) across an id; high transition density ⇒ GUID-like ⇒ rejected as a selector candidate (`id="ember1234"`, `css-1a2b3c`).
- **Representation** — the scored candidate model: CSS-id only proposed when **not** GUID-like, and even then scored `kCSSIdScore=500` (far worse than role/label/text).
- **Resolution** — the **cost model** is the mechanism. Lower score = preferred: `testid=1`, `role+name=100`, `placeholder=120`, `label=140`, `text=180`, `css-id=500`, `tag=530`, `nth=10000`, `css-path=1e7`. The generator builds *all* candidates, sorts by `combineScores`, and picks the **lowest-score candidate that uniquely matches** the live DOM (`elements.length === 1`). Volatile structural selectors are thus structurally deprioritized.
- **Recovery** — n/a (this is generation-time).
- **Reliability** — high; this is the empirically-correct stability ranking. **Limit**: scoring happens *only at generation*. At runtime there is no live re-scoring of candidates — the chosen string is fixed.
- **Conxa applicability** — **Adopt the cost-model constants and `isGuidLike` directly** to harden `selector_score.py` / `llm_selector_generator_v2.py`, reducing LLM reliance at compile time. **Improve on Playwright**: also score candidates at *runtime* (Conxa's fingerprints) — the gap Playwright never closed.

### EC-10 — Text/label changes (i18n)  &  EC-11 — Layout/position changes
- **Detection / Resolution** — accessibility-first generation (`roleUtils.ts` for role+accessible-name, `getByRole`/`getByLabel`/`getByText` selectors) means recorded identity tracks *user-visible semantics*, which survive layout changes (EC-11) far better than positional CSS. For EC-10, text/label selectors support substring + regex matching, but a *changed* label still misses — there is no synonym/fuzzy rescue.
- **Recovery** — timeout throw on miss.
- **Conxa applicability** — **Anchor Tier-2 resolution on role+name > label > placeholder > text > testid > css/xpath** (Playwright's order). For EC-10's true copy-edits, Conxa needs its own multi-signal scoring/fuzzy layer — Playwright stops at exact/regex match.

### EC-28 — Silent wrong-element match → handled by **strict mode** (see Family 5)
### EC-44 — A/B variants — **no answer**; one recorded selector, no variant branching.

---

## Family 4 — Boundary traversal (EC-01/02/03/04, EC-43)

Frame and shadow traversal are encoded **declaratively in the selector grammar**, not in imperative code — philosophically identical to Conxa's "iframe chain preserved verbatim" invariant.

### EC-01 single, EC-02 nested, EC-03 cross-origin iframes
- **Detection** — `FrameLocator` (`client/locator.ts::FrameLocator`). Entering a frame appends the literal token `>> internal:control=enter-frame >>` to the selector string. Nested frames append it repeatedly, producing an ordered frame chain in one string.
- **Representation** — the frame chain *is* the selector: `iframe#a >> internal:control=enter-frame >> iframe#b >> internal:control=enter-frame >> button`.
- **Resolution** — server-side `server/frameSelectors.ts::resolveFrameForSelector` splits the selector by frame (`splitSelectorByFrame`), and for each chunk: queries the `<iframe>` element, verifies it *is* an iframe (else `<iframe> was expected` error), then calls `delegate.getContentFrame(element)` to descend. Because descent uses the *protocol* (CDP), it works for **cross-origin** frames (EC-03) where `document.querySelector` from the parent would fail entirely. Frame-root resolution also supports `aria-ref` frame jumps (`_jumpToAriaRefFrameIfNeeded`).
- **Recovery** — none; if a frame in the chain is missing/detached (EC-43), resolution returns `null` → retry → timeout throw. There is a guard against frame locators nested inside composite locators (`Frame locators are not allowed inside composite locators`).
- **Reliability** — excellent, including cross-origin, which most JS-only tools cannot do. **Limit**: EC-43 (hidden/detached iframe) relies on the implicit retry; a frame that flickers in and out can race.
- **Conxa applicability** — **Adopt the `internal:control=enter-frame` model.** Encoding the frame chain *in* the identity string aligns 1:1 with Conxa's verbatim-iframe-chain invariant and keeps recovery scoped to the correct frame. Conxa's `frame_enter`/`frame_exit` markers map cleanly onto this.

### EC-04 — Shadow DOM (open)
- **Detection / Resolution** — `selectorEvaluator.ts` carries `pierceShadow` as a first-class **context flag**. `_queryCSS` recurses into `element.shadowRoot` automatically when `pierceShadow` is set (default `true` for CSS/role/text engines); only `:light` variants opt out (`pierceShadow:false`). The composed-tree hit-target check (EC-06) also climbs shadow hosts via `assignedSlot ?? parentElementOrShadowHost`, so clicks work *through* slots.
- **Representation** — a boolean evaluator flag, not special-case selectors.
- **Recovery** — n/a.
- **Reliability** — high for *open* roots. **Limit (EC-04b)**: closed shadow roots are opaque to JS; only the *hit-target* walk (which goes bottom-up to survive closed roots) partially helps — element *resolution* cannot pierce closed roots.
- **Conxa applicability** — **Adopt shadow-piercing as an evaluator flag**, not per-selector hacks — clean across compile and runtime.

---

## Family 5 — Outcome ambiguity (EC-23/24/25/26/28/29) — partial coverage

Playwright's only deterministic answer here is **strict mode** (a wrong-element *guard*) and **web-first assertions** (a verification *retry*). It has no general post-condition verification model.

### EC-28 — Silent wrong-element match → **strict mode** (the standout)
- **Detection** — every Locator action passes `strict: true`. Server resolution counts matches; >1 match is a hard error, never silent first-match.
- **Representation / Recovery** — `injectedScript.ts::strictModeViolationError` throws: `strict mode violation: <locator> resolved to N elements:` followed by an auto-generated disambiguating selector for each match. This surfaces brittle selectors **at author time**, converting EC-28's silent-wrong-action into a loud failure.
- **Reliability** — high as a *guard*. **Limit**: it catches *ambiguity*, not *correctness* — a uniquely-matching but wrong selector still passes. True correctness needs an independent post-condition.
- **Conxa applicability** — **Adopt strict-mode-by-default** as a wrong-element guard. It is the cheapest deterministic defense against EC-28. Conxa must add what Playwright lacks: an *independent post-condition assertion* (Family 5 proper).

### EC-26 — Custom dropdown vs native `<select>`
- **Detection / Resolution** — `dom.ts::selectOption` → `injectedScript.ts::selectOptions` handles **native `<select>` only**: it throws `Element is not a <select> element` otherwise, and matches options by value/label/index, skipping disabled options (`error:optionnotenabled`). **Custom div-based dropdowns get no special handling** — the author must script open → wait → click-option using ordinary locators (each gated by actionability).
- **Reliability** — perfect for native; **no abstraction** for custom.
- **Conxa applicability** — Native path is trivially adoptable. For *custom* dropdowns Conxa is on its own (record the open→click sequence); Playwright offers no leverage.

### EC-23 — File upload  &  EC-24 — File download
- **Upload detection/resolution** — `dom.ts::setInputFiles` sets files **directly on the `<input type=file>` DOM element** (via injected `setInputFiles` for payloads, or `delegate.setInputFilePaths` for paths) — it **never touches the OS file dialog**. For custom drop-zones, the `fileChooser` event (`page.ts`, `Events.Page.FileChooser`) lets you intercept the chooser opened by a click and call `setFiles`. The OS dialog is bypassed entirely, which is what makes upload deterministic.
- **Download detection/resolution** — `client/download.ts::Download` wraps an `Artifact`; a download fires `Events.Page.Download`. Pattern: `waitForEvent('download')` concurrently with the trigger click, then `download.path()` awaits the artifact's finished promise. This handles the trigger↔navigation race deterministically.
- **Recovery** — none; missing chooser/download event → timeout.
- **Conxa applicability** — **Adopt both.** Direct DOM `setInputFiles` (no OS dialog) and the `waitForEvent('download')`-around-trigger pattern are clean, deterministic, and directly applicable.

### EC-25 — Autocomplete / typeahead — **weak**
- Playwright has **no typeahead abstraction**. The author types, then must `waitFor` the async option list (auto-wait helps), then click the right option (strict mode guards ambiguity). Selecting before options render or selecting the wrong option is left to the author. **Conxa applicability**: this is a top enterprise failure (WorkArena) where Playwright gives little — Conxa needs explicit "type → wait-for-options → verify-selected" with Family-5 verification.

### EC-29 — Contenteditable — `fill`/`type` detect `isContentEditable` in `retarget`/`elementState('editable')` and route key events appropriately; works for basic contenteditable, weaker for Quill/Slate/ProseMirror requiring synthetic key sequences.

---

## Cross-cutting: retarget (label→control) and hover

### EC-15 — Hover-triggered visibility / menus
- **Detection/Resolution** — `hover` is a normal pointer action with the *same* actionability + hit-target gates; there is no special "hover then the menu appears" state machine. A flyout that only renders on hover is reached by a `hover()` step then a `click()` step, each auto-waited. EC-16 (chained hover menus) is purely author-sequenced.
- **Limit** — menus that *close on mouse-out* race the next action; Playwright has no "keep hovering" primitive. **Conxa applicability**: adopt hover-as-action; Conxa's hover-architecture work must handle the close-on-mouseout race Playwright ignores.

### EC-07/06 retarget — label→control redirection
- `injectedScript.ts::retarget` walks a clicked `<label>` to its `.control`, and climbs into the nearest interactive ancestor (`button, [role=button], [role=checkbox], [role=radio]`, or `button-link` for links). This means clicking label text correctly actuates the associated input — a quiet but high-value correctness mechanism. **Adopt.**

### EC-33 — New tab / popup / window switch
- A new tab becomes a **new `Page` object**: `page.ts::reportAsNew` emits `BrowserContext.Events.Page` (and `Page` 'popup'). Pattern: `context.waitForEvent('page')` concurrently with the trigger, then drive the returned Page. Deterministic context-following. **Adopt** the wait-for-`page`-event-around-trigger pattern for EC-33/EC-40.

---

## Family 3 — Stochastic interruption (EC-19/20/21/22/45/41/35) + other gaps — Where Playwright has NO answer

- **Family 3 — Stochastic interruption: none.** Covering EC-19 (consent banners), EC-20 (modals), EC-21 (MFA/2FA), EC-22 (session-expired redirect), EC-45 (idle interstitial), EC-41 (permission prompts), EC-35 (captcha): no conditional/optional steps, no "dismiss known banner" library, no MFA pause, no auth self-heal, no captcha handling. A consent banner (EC-19) or unexpected modal (EC-20) is caught only indirectly — as a *hit-target intercept* (EC-06) that fails hard. Playwright will report "X intercepts pointer events" and time out; it will never dismiss the overlay. **This entire family is Conxa's differentiator** and must be solved with compile-time conditional representation + dismiss-patterns + auth self-heal — not borrowed from Playwright.
- **Outcome verification beyond web-first assertions (Family 5).** Web-first assertions (`expect(locator).toBeVisible()` etc.) retry a predicate until pass/timeout, and `ariaSnapshot` enables accessibility-tree assertions — but there is **no general post-condition model** that says "the action did the right thing." Strict mode guards *ambiguity*, not *correctness*. Conxa's independent post-condition verification is additive, not derivable from Playwright.
- **No runtime candidate re-scoring / self-heal.** The generator's ranked `selectors[]` is **discarded** after codegen; runtime keeps one string and fails hard on miss. This is the single most important thing Conxa must *not* replicate.
- **EC-13 virtualized & EC-14 infinite scroll: only partial.** Scroll-into-view (EC-07) helps reach *rendered* rows, but Playwright has no concept of "scroll until the target row is rendered into the virtual window" (react-window/ag-grid) or "scroll to trigger intersection-lazy-load" — if the row/section isn't in the DOM, the selector simply misses and times out.
- **EC-36 canvas/WebGL, EC-30 drag-and-drop (HTML5), EC-35 captcha, EC-42 bot-detection: minimal or none.** Drag is special-cased only to *skip* the hit-target check during drop (`action === 'drag'`); coordinate-only canvas interaction has no DOM-level support.

---

## What Conxa should adopt from Playwright (5 bullets)

1. **The full actionability gate stack as a zero-LLM pre-action layer** — `visible → stable (≥2 RAF identical-rect) → enabled/editable (ARIA-aware) → composed-tree hit-target check, twice (preliminary + per-event capture listener)`. This is the deterministic spine and the best EC-05/06/08/28 defense in existence. Port `_checkElementIsStable`, `elementState`, `expectHitTarget`, and `retarget` (label→control) directly.
2. **Late-bound locators-as-strings + the alternating-anchor scroll ladder** — identity is a serializable description re-resolved every attempt (kills EC-09 stale handles), and scroll-into-view cycles `default→end→center→start` to escape sticky headers (EC-07). Both are pure determinism.
3. **The selector cost model + `isGuidLike` + unique-match selection** — adopt the constants (`role+name=100 … css-id=500 … nth=1e4`) and the "lowest-score candidate that uniquely matches" rule into the compiler, then **go beyond Playwright** by (a) preserving the *full ranked candidate list* into the skill package for recovery, and (b) re-scoring candidates at *runtime* via fingerprints — the two gaps Playwright leaves open.
4. **Declarative boundary traversal** — `internal:control=enter-frame` frame chains (CDP-based, so cross-origin works) and `pierceShadow` as an evaluator flag. These map exactly onto Conxa's verbatim-iframe-chain invariant and shadow handling, at compile and runtime.
5. **Strict-mode-by-default as a wrong-element guard, plus the event-driven I/O patterns** — fail loud on >1 match (EC-28), `setInputFiles` directly on the DOM input bypassing the OS dialog (EC-23), and `waitForEvent('download'|'page')`-around-trigger for downloads/new-tabs (EC-24/33). Then add what Playwright lacks: conditional steps for Family 3 and independent post-condition verification for Family 5.
