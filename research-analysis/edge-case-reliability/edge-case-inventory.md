# Edge-Case Inventory (Phase 1)

**Purpose:** the canonical taxonomy of browser-automation edge cases that cause real-world production failures. Every other document in `edge-case-reliability/` references these **EC-IDs**.
**Ranking axes (1–5):** **Freq** = how often it appears in real enterprise web apps · **Impact** = severity when it breaks a workflow (5 = silent wrong-action or hard halt) · **Ent** = enterprise relevance (how much it shows up in Salesforce/ServiceNow/Workday-class apps). **Priority** = composite, weighted toward Impact and Ent.

**Lens:** Conxa is deterministic (record→compile→replay; zero-LLM hot path; recovery at the edges). For each edge case the question that matters is *"can this be detected and resolved deterministically, and if not, how is it contained?"* — answered fully in `conxa-edge-case-framework.md`.

---

## Master ranked table (highest priority first)

| EC | Edge case | Freq | Impact | Ent | Priority |
|---|---|---|---|---|---|
| EC-19 | Cookie/consent banners (stochastic) | 5 | 4 | 5 | **★★★★★** |
| EC-09 | React/SPA re-render & element detachment | 5 | 5 | 5 | **★★★★★** |
| EC-25 | Autocomplete / typeahead (options after input) | 4 | 5 | 5 | **★★★★★** |
| EC-12 | Dynamic IDs / GUID-like classes | 5 | 4 | 5 | **★★★★★** |
| EC-05 | Element not stable (animation/transition) | 5 | 4 | 4 | **★★★★★** |
| EC-06 | Overlapped / pointer-intercepted target | 5 | 4 | 4 | **★★★★★** |
| EC-20 | Modal dialogs (expected & unexpected) | 5 | 4 | 5 | **★★★★★** |
| EC-01 | Single iframe | 4 | 5 | 5 | **★★★★★** |
| EC-22 | Session-expired / auth-redirect mid-run | 4 | 5 | 5 | **★★★★★** |
| EC-28 | Silent wrong-element match (no verify) | 4 | 5 | 5 | **★★★★★** |
| EC-02 | Nested iframes | 3 | 5 | 5 | ★★★★☆ |
| EC-03 | Cross-origin iframes | 3 | 5 | 5 | ★★★★☆ |
| EC-13 | Virtualized lists / tables | 4 | 4 | 5 | ★★★★☆ |
| EC-14 | Infinite scroll / lazy loading | 4 | 4 | 4 | ★★★★☆ |
| EC-04 | Shadow DOM (open) | 3 | 4 | 4 | ★★★★☆ |
| EC-15 | Hover-triggered visibility / menus | 4 | 4 | 4 | ★★★★☆ |
| EC-26 | Custom dropdown vs native `<select>` | 4 | 4 | 5 | ★★★★☆ |
| EC-21 | MFA / 2FA prompts | 3 | 5 | 5 | ★★★★☆ |
| EC-31 | Slow load / spinner / skeleton / never-idle | 5 | 3 | 4 | ★★★★☆ |
| EC-33 | New tab / popup / window switch | 3 | 4 | 4 | ★★★★☆ |
| EC-23 | File upload | 3 | 4 | 4 | ★★★★☆ |
| EC-24 | File download | 3 | 4 | 4 | ★★★★☆ |
| EC-10 | Text / label changes (i18n, copy edits) | 4 | 3 | 4 | ★★★★☆ |
| EC-16 | Delayed/chained hover menus | 3 | 4 | 4 | ★★★☆☆ |
| EC-11 | Layout / position changes | 4 | 3 | 4 | ★★★☆☆ |
| EC-27 | Date pickers / calendars | 3 | 4 | 4 | ★★★☆☆ |
| EC-29 | Contenteditable / rich-text editors | 3 | 4 | 4 | ★★★☆☆ |
| EC-34 | SPA route change without navigation | 4 | 3 | 4 | ★★★☆☆ |
| EC-07 | Off-screen / needs scroll-into-view | 4 | 3 | 3 | ★★★☆☆ |
| EC-08 | Disabled-until-ready controls | 4 | 3 | 4 | ★★★☆☆ |
| EC-30 | Drag and drop | 2 | 4 | 3 | ★★★☆☆ |
| EC-18 | Context menus (right-click) | 2 | 3 | 3 | ★★★☆☆ |
| EC-32 | Optimistic UI / websocket live updates | 3 | 3 | 4 | ★★★☆☆ |
| EC-17 | Tooltips driving interaction | 2 | 2 | 2 | ★★☆☆☆ |
| EC-35 | Captcha | 2 | 5 | 3 | ★★★☆☆ |
| EC-04b | Closed shadow roots | 1 | 4 | 3 | ★★★☆☆ |
| EC-36 | Canvas / WebGL elements | 2 | 4 | 2 | ★★☆☆☆ |
| EC-37 | Accessibility-only / icon-only elements | 3 | 3 | 4 | ★★★☆☆ |
| EC-38 | Mobile / responsive breakpoint variance | 2 | 3 | 3 | ★★☆☆☆ |
| EC-39 | DPI / zoom / scaleFactor | 2 | 3 | 2 | ★★☆☆☆ |
| EC-40 | Multi-window coordination | 2 | 3 | 3 | ★★☆☆☆ |
| EC-41 | Notification/clipboard permission prompts | 2 | 2 | 3 | ★★☆☆☆ |
| EC-42 | Bot-detection / anti-automation | 3 | 4 | 3 | ★★★☆☆ |
| EC-43 | Hidden/detached iframe | 2 | 3 | 3 | ★★☆☆☆ |
| EC-44 | A/B-test UI variants | 3 | 3 | 4 | ★★★☆☆ |
| EC-45 | "Are you still there?" idle interstitial | 3 | 3 | 4 | ★★★☆☆ |

---

## Detail by category

### A. Frame & encapsulation boundaries
*The hardest class; the DOM is not one tree. Conxa's iframe-chain invariant lives here.*

- **EC-01 Single iframe** — target inside one `<iframe>`. Fails when automation queries the top document. Requires frame traversal. *Conxa: handled via `rootCandidates`/`frameLocator`.*
- **EC-02 Nested iframes** — iframe within iframe (common in embedded widgets/CRMs). Requires an ordered frame chain.
- **EC-03 Cross-origin iframes** — different origin → no JS access into the frame from the parent; only protocol-level (CDP) traversal works. `document.querySelector` from parent fails entirely.
- **EC-43 Hidden/detached iframe** — frame present but `display:none` or removed/re-added; frame handle goes stale.
- **EC-04 Shadow DOM (open)** — element inside an open shadow root; `querySelector` doesn't pierce by default. *(Deep dive: `shadow-dom-architecture.md`.)*
- **EC-04b Closed shadow roots** — `attachShadow({mode:'closed'})`; opaque to JS entirely; only CDP/AX-tree or coordinate access.

### B. Visibility & interaction timing
*The dominant real-world failure class — mostly timing, not identity (the SeleniumBase lesson).*

- **EC-05 Element not stable** — mid-animation/transition; bounding box moving; click lands wrong. Needs a *stability* gate (2 stable frames).
- **EC-06 Overlapped / pointer-intercepted** — a sticky header, toast, overlay, or spinner sits over the target; `click` throws "intercepts pointer events" or hits the wrong node.
- **EC-07 Off-screen** — element exists but needs scroll-into-view.
- **EC-08 Disabled-until-ready** — control present but `disabled`/`aria-disabled` until async validation completes.
- **EC-15 Hover-triggered visibility / menus** — target only exists/visible after hovering a parent; flyout nav, dropdown menus. *(Deep dive: `hover-architecture.md`.)*
- **EC-16 Delayed / chained hover menus** — hover A → wait → hover B → click C; transition delays; menus that close on mouse-out.
- **EC-17 Tooltips driving interaction** — info only appears on hover.
- **EC-18 Context menus** — right-click menus, often custom-rendered at the body root.

### C. Dynamic DOM
*Modern SPAs rebuild the DOM constantly; identity must be late-bound.*

- **EC-09 React/SPA re-render & element detachment** — the node you found is replaced by a new node (same visual element) between find and act → stale handle / detachment. The #1 SPA failure.
- **EC-10 Text/label changes** — i18n, copy edits, "Save"→"Save changes"; text-based selectors break.
- **EC-11 Layout/position changes** — element moved; position-hint selectors break.
- **EC-12 Dynamic IDs / GUID-like classes** — `id="ember1234"`, `class="css-1a2b3c"`; structural selectors are non-deterministic across loads.
- **EC-13 Virtualized lists/tables** — only rendered rows exist in DOM (react-window/ag-grid); the target row may not be in the DOM until scrolled to.
- **EC-14 Infinite scroll / lazy loading** — content appears only on scroll; images/sections load on intersection.
- **EC-34 SPA route change without navigation** — URL changes via History API; no page load event; content swaps.
- **EC-44 A/B-test UI variants** — different DOM per user/session; recorded path may not match this run.

### D. Stochastic interruptions
*States that appear on **some** runs — the linear-replay killer. Conxa has no conditional steps today (EC-19/20/45 are the top customer-pain items).*

- **EC-19 Cookie/consent banners** — appear ~30–50% of loads depending on cookies/region; block interaction until dismissed.
- **EC-20 Modal dialogs** — expected (a form modal you must fill) and unexpected (a promo/announcement modal that intercepts).
- **EC-21 MFA / 2FA prompts** — appear conditionally; require human input.
- **EC-22 Session-expired / auth-redirect mid-run** — the app bounces to login partway through. *Conxa: has a genuine re-auth self-heal here.*
- **EC-35 Captcha** — anti-bot challenge; generally requires human (or is a stop signal).
- **EC-45 "Are you still there?" idle interstitial** — timeout modal during slow steps.
- **EC-41 Notification/clipboard permission prompts** — browser-level prompts.

### E. Input/output complexity
*Where "it clicked" ≠ "it worked"; the silent-wrong-action surface.*

- **EC-23 File upload** — hidden `<input type=file>`, custom drop-zones, or OS file dialogs (the OS dialog is outside the DOM).
- **EC-24 File download** — triggering + waiting for + verifying a download; race with navigation.
- **EC-25 Autocomplete / typeahead** — type → wait for async options → select the right one. Selecting before options render, or selecting the wrong option, is a top enterprise failure (WorkArena).
- **EC-26 Custom dropdown vs native `<select>`** — native selects use `selectOption`; custom (div-based) dropdowns need open→wait→click-option.
- **EC-27 Date pickers / calendars** — custom widgets; typing vs clicking a day cell; month navigation.
- **EC-29 Contenteditable / rich-text editors** — `contenteditable`, Quill/Slate/ProseMirror/TinyMCE; `fill` doesn't work; needs focus + key events.
- **EC-30 Drag and drop** — HTML5 DnD vs mouse-sim; many libs need real pointer move sequences.
- **EC-36 Canvas / WebGL** — no DOM inside; coordinate-only interaction (charts, signature pads, design tools).
- **EC-28 Silent wrong-element match** — the action *succeeds* on the wrong element (e.g., a forced JS click on a hidden duplicate). The most dangerous because there's no error — only an independent post-condition catches it.

### F. Navigation & windows
- **EC-31 Slow load / spinner / skeleton / never-idle** — `networkidle` never fires (polling/websockets); skeletons present before real content.
- **EC-32 Optimistic UI / websocket live updates** — UI updates then reverts on server reject; or live data shifts row positions mid-interaction.
- **EC-33 New tab / popup / window switch** — action opens a new tab/window; automation must follow context.
- **EC-40 Multi-window coordination** — flows spanning multiple windows.

### G. Identity & accessibility
- **EC-37 Accessibility-only / icon-only elements** — icon buttons with no text; identity must come from `aria-label`/role.
- **EC-42 Bot-detection / anti-automation** — the app actively detects automation; needs human-like pacing/CDP stealth. *Conxa: has human-pacing.*

### H. Environmental
- **EC-38 Mobile / responsive breakpoint variance** — different DOM/controls per viewport.
- **EC-39 DPI / zoom / scaleFactor** — coordinate mismatch on HiDPI; only matters for vision/coordinate tiers.

---

## The five edge-case "families" that drive ~80% of production failures

For triage, every EC collapses into one of five root failures. The framework (Phase 8) defines a deterministic strategy per family.

1. **Identity drift** (EC-09/10/11/12/44, EC-04/04b boundaries) — "the element moved/changed/was replaced." → multi-signal late-bound identity + live scoring.
2. **Timing & actionability** (EC-05/06/07/08/31/32) — "I acted too early / something was in the way." → actionability gates + classified deterministic ladder.
3. **Stochastic interruption** (EC-19/20/21/22/45/41/35) — "something unexpected appeared." → conditional/optional steps + dismiss-known-patterns + auth self-heal.
4. **Boundary traversal** (EC-01/02/03/04/04b/43) — "the element is in another tree." → frame-chain + shadow-piercing encoded in identity.
5. **Outcome ambiguity** (EC-25/26/27/28/29/23/24) — "it 'worked' but did it do the right thing?" → independent post-condition verification.

**The single most important observation for Conxa:** families 1, 2, and 4 are *largely solvable deterministically* (zero-LLM) — and the best systems prove it. Family 3 needs *conditional representation* (compile-time), not runtime intelligence. Family 5 needs *verification*, not recovery. **Almost none of the high-frequency failure surface actually requires an LLM in the hot path** — which is exactly what makes a deterministic Conxa viable. This thesis is tested repo-by-repo in Phase 2 and operationalized in Phase 8.
