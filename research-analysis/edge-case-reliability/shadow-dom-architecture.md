# Shadow DOM Architecture Deep Dive (Phase 4)

**Edge cases covered:** EC-04 (open shadow roots), EC-04b (closed shadow roots), nested shadow roots, dynamic shadow roots.
**Why it's enterprise-critical (and rising):** Web Components encapsulate their internals behind a shadow boundary that ordinary CSS selectors **do not cross**. This is no longer niche — **Salesforce Lightning Web Components (LWC) use shadow DOM**, as do SAP UI5, Adobe Spectrum, Ionic, Material Web, and a growing share of enterprise design systems. A selector that works in the page DevTools console can return `null` from automation because the target sits inside a shadow root. Like iframes, shadow DOM doesn't degrade gracefully — it fails categorically on encapsulated targets.

---

## 1. Why shadow DOM breaks automation

The shadow boundary is a *scoping* boundary:

1. **CSS doesn't pierce (EC-04).** `document.querySelector('#target')` will not find an element inside a shadow root. You must reach the host element, then `host.shadowRoot.querySelector('#target')`. Standard CSS combinators (`>`, descendant) stop at the boundary. The element is rendered and clickable on screen but invisible to a naive selector.
2. **Closed roots are opaque (EC-04b).** `attachShadow({mode:'closed'})` makes `host.shadowRoot` return `null`. The internals are unreachable from page JS *entirely* — no traversal, no `querySelector`, nothing. Only a protocol-level engine (CDP with `pierce:true`) or the accessibility tree or raw coordinates can reach inside.
3. **Nested roots compound it.** Component-in-component (common in design systems: a `<data-table>` containing `<table-row>` containing `<icon-button>`) means *multiple* boundaries to cross, each requiring a host→shadowRoot hop.
4. **Dynamic roots.** Shadow roots are attached at component upgrade time (async); a selector evaluated before the component upgrades misses; re-renders replace the host (EC-09 inside a shadow context).

---

## 2. How best-in-class systems handle it

### Playwright — open-root piercing by default (the gold standard for open roots)
- **Model:** Playwright's CSS and text selector engines **pierce open shadow roots automatically**. `page.locator('css=#target')` recurses *into* open shadow roots when resolving; `getByRole`/`getByText` likewise traverse shadow boundaries. There is no special syntax needed for the common case — piercing is the default behavior of the injected `selectorEvaluator`.
- **Nested (open):** handled transparently — the engine recurses through every open boundary.
- **Closed roots (EC-04b):** **not** reachable via the CSS engine (by design — closed means closed). Playwright can still reach closed-root content via the **accessibility tree** (CDP AX includes shadow content regardless of mode) and via coordinate actions, but not via CSS traversal.
- **Reliability:** very high for open roots (the overwhelming majority — LWC, most design systems use *open* mode). The key insight: **open shadow DOM is essentially a solved problem if your selector engine pierces by default**, which Playwright's does.
- **One caveat:** XPath does **not** pierce shadow boundaries (XPath is a document-tree language and shadow roots aren't in the light DOM tree). So shadow-encapsulated targets must use CSS/role/text identity, never XPath.

### SeleniumBase — explicit shadow traversal + `::shadow`
- **Model:** SeleniumBase detects shadow-DOM selectors (its `::shadow` combinator and shadow-root handling in the click path) and walks the `shadowRoot` chain via injected JS: reach the host, hop into `host.shadowRoot`, repeat per boundary. `__get_shadow_element`-style traversal.
- **Nested:** chain `::shadow` segments.
- **Closed roots:** opaque (relies on `host.shadowRoot`, which is null for closed) — falls back to CDP mode where available.
- **Reliability:** good but **explicit** — the author must know an element is in a shadow root and write the `::shadow` path. No automatic piercing. More fragile and more manual than Playwright's default piercing.

### browser-use / Stagehand — engine/AX-inherited
- browser-use builds its serialized DOM from the **CDP accessibility tree + DOM snapshot**, which include shadow content (CDP pierces shadow DOM, even closed, when requested). So shadow elements get an index and the LLM addresses them — but this is AX-tree-mediated, not a deterministic CSS path. Stagehand inherits Playwright's open-root piercing for its `act` calls.

### UI-TARS — shadow DOM is invisible (pixels)
- Vision flattens shadow content into the screenshot; coordinate clicks hit it. Works for closed roots too (pixels don't care about encapsulation) but discards all structural identity — last-resort only.

---

## 3. What Conxa does today (inferred + verified)

- **Conxa executes via Playwright locators** (`runtime/run.js` `withLocator` → `root.locator(selector)`), so it **inherits Playwright's automatic open-shadow-root piercing for CSS/role/text selectors.** This means **open shadow DOM (EC-04) — including LWC/Salesforce — largely works today, for free**, as long as the compiled selectors are CSS/role/text (not XPath).
- **CLAUDE.md / TRD do not call out shadow DOM explicitly** — it's handled implicitly by the engine, not by a dedicated Conxa subsystem. There is no shadow-specific recovery, no closed-root path, no shadow-aware identity scoping.
- The deterministic recovery ladder's a11y tier (`recoverWithA11y` using `role=...[name=...]`) *will* reach into open shadow roots via Playwright's role engine — another free win.

**Verdict:** open shadow DOM is mostly a non-problem for Conxa *because it stands on Playwright* — but this is **inherited, not engineered**, so it's fragile to (a) XPath selectors the compiler might emit, (b) closed roots, (c) nested-root identity scoping, and (d) shadow-aware verification.

---

## 4. Gaps in Conxa's current shadow handling

1. **Compiler must not emit XPath for shadow-encapsulated targets (EC-04).** XPath doesn't pierce. If `llm_selector_generator_v2.py`/`selector_filters.py` produce an XPath for an element that lives in a shadow root, it will fail at runtime even though the element is reachable via CSS/role. The compiler needs **shadow-awareness**: detect shadow encapsulation at record time and *prefer/force* CSS/role/text identity for those elements.
2. **No closed-root path (EC-04b).** If a target is in a closed shadow root, Playwright's CSS engine can't reach it; Conxa has no fallback. Needs a CDP-AX or coordinate Tier-4 path.
3. **Nested-root identity is unscoped.** For deeply nested components, a global CSS selector may match the wrong instance (e.g., the wrong `<icon-button>` across many rows). Identity should be **scoped to the host chain** (like the iframe chain) for uniqueness — otherwise EC-28 (silent wrong-element) risk.
4. **Dynamic-root races (EC-04, async upgrade).** A component not yet upgraded has no shadow root; resolution before upgrade misses. Needs a wait gate.
5. **Verification blindness.** Post-condition checks must pierce the same shadow root to read state; a top-document read will false-fail.

---

## 5. Recommended deterministic shadow-DOM architecture for Conxa

*Zero-LLM. Mostly compile-time discipline + engine defaults + a closed-root escape hatch.*

### 5.1 Make the compiler shadow-aware (the highest-value, cheapest fix)
At record time, detect whether the target is inside a shadow root and, if so:
- record the **host chain** (ordered list of shadow-host elements, analogous to the iframe `parent_chain`) — call it the **shadow path**,
- **forbid XPath** as a primary signal for shadow-encapsulated elements; rank **role+name > text > testid > scoped-CSS**,
- store whether each boundary is **open or closed** (detectable at record time: `host.shadowRoot === null` with a known host ⇒ closed).
This single change makes the overwhelmingly-common open-root case bulletproof and flags the rare closed-root case for special handling.

### 5.2 Lean on Playwright's default piercing for open roots
For open roots, **do nothing special at runtime** — Playwright's CSS/role/text engines already pierce. Ensure the compiled identity is CSS/role/text (§5.1). This is why open shadow DOM should be a near-non-issue for Conxa; the work is making sure the compiler doesn't sabotage it with XPath.

### 5.3 Scope identity to the host chain for nested roots (uniqueness/EC-28)
When a component type repeats (table rows, list items), scope the target selector through its shadow-host chain + a row-anchor (text/data-attribute of the row) so resolution is unique. Mirror the iframe `rootCandidates` pattern: a **shadow-root candidate walk** that enters each open host's `shadowRoot` in order. (Playwright piercing handles the hops; the *scoping* prevents wrong-instance matches.)

### 5.4 Closed-root escape hatch (EC-04b) — bounded, deterministic-first
For the rare closed root:
1. **Tier 1/2:** try **role+name via the accessibility tree** — CDP AX exposes closed-shadow content, so `getByRole` may still resolve it (zero-LLM). This catches many closed-root cases.
2. **Tier 1/2:** **CDP DOM traversal with `pierce:true`** — CDP can enumerate closed-shadow content directly; derive a coordinate or backend-node target deterministically.
3. **Tier 4 (vision):** only if AX + CDP both fail — coordinate click at the rendered location (scaleFactor-normalized), validated by post-condition.
Closed roots are uncommon in enterprise apps (LWC is open), so this tier is rarely exercised — but it must exist so closed-root targets don't hard-fail.

### 5.5 Wait-for-upgrade gate (dynamic roots)
Before resolving a shadow-encapsulated target, deterministically wait for the host to have a `shadowRoot` (open) / be present (closed via AX) — closes the async-upgrade race. Bounded; zero-LLM.

### 5.6 Shadow-aware verification (EC-28)
Post-condition reads for shadow targets must pierce the same host chain (or use the AX tree, which pierces). Never read the light DOM to verify a shadow outcome.

---

## 6. Reliability ranking of approaches

| Approach | EC-04 open | Nested open | EC-04b closed | Dynamic | Conxa fit |
|---|---|---|---|---|---|
| Playwright default piercing (CSS/role/text) | ✅ | ✅ | ❌ (by design) | ⚠️ (race) | **Inherited — keep, make compiler honor it** |
| Playwright XPath | ❌ | ❌ | ❌ | ❌ | **Forbid for shadow targets** |
| SeleniumBase `::shadow` explicit walk | ✅ | ✅ | ❌ | ⚠️ | Capability ref; too manual |
| CDP AX-tree / `pierce:true` | ✅ | ✅ | ✅ | ✅ | **Adopt as closed-root escape hatch** |
| Vision/coordinate | ✅ | ✅ | ✅ | ✅ | Last-resort Tier-4 only |
| **Conxa today** | ✅ (via PW) | ⚠️ (unscoped) | ❌ | ⚠️ | inherited, fragile |
| **Conxa recommended (§5)** | ✅ | ✅ | ✅ | ✅ | **Target** |

---

## 7. Summary — what Conxa should do

1. **Make the compiler shadow-aware** — detect shadow encapsulation at record time, record the **shadow host path**, mark open/closed, and **forbid XPath** for shadow targets (prefer role+name > text > testid > scoped-CSS). *This is the single highest-value, lowest-cost fix and makes the common open-root case (LWC/Salesforce) bulletproof.*
2. **Keep relying on Playwright's default open-root piercing** at runtime — don't reinvent it; just don't sabotage it with XPath.
3. **Scope shadow identity to the host chain** for repeated components, preventing wrong-instance matches (EC-28).
4. **Add a bounded closed-root escape hatch**: AX role+name → CDP `pierce:true` → vision (Tier-4), all deterministic-first.
5. **Add a wait-for-upgrade gate** and **make post-condition verification shadow-aware** (pierce the same host chain / use AX to read outcome).

**Net:** Unlike iframes (where Conxa engineered a strong solution), shadow DOM is currently **handled by inheritance from Playwright** — which is *good for open roots* but *unowned and fragile*. The fix is mostly **compile-time discipline** (shadow-aware identity, no XPath) plus a small closed-root deterministic escape hatch — no LLM in the hot path, and it neutralizes one of the fastest-growing enterprise edge cases (Web-Component design systems).
