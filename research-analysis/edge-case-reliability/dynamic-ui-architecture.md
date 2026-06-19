# Dynamic UI Architecture Deep Dive (Phase 6)

**Edge cases covered:** EC-09 (React/Angular/Vue re-render & element detachment), EC-11 (layout/position changes), EC-13 (virtualized lists/tables), EC-14 (infinite scroll / lazy loading), EC-34 (SPA route change without navigation), EC-32 (optimistic UI / live updates), plus general DOM replacement.
**Why it's the #1 failure family:** Modern enterprise apps are SPAs that **rebuild the DOM continuously**. The node you found 50ms ago may be gone — replaced by an identical-looking new node — before you act on it. This single family (Identity drift + its timing manifestations) accounts for the largest share of real-world automation flakiness. The good news: it is **almost entirely solvable deterministically** — the best systems prove it, and Conxa's late-bound identity is the right foundation.

---

## 1. Why dynamic UIs break automation

1. **Element detachment / re-render (EC-09).** React/Vue/Angular reconcile the virtual DOM and **replace** real nodes. A captured element handle becomes detached ("Element is not attached to the DOM"). Any model that holds a node reference across find→act is doomed.
2. **DOM replacement of the *same* element.** The button still says "Save" and looks identical, but it's a *new* DOM node. Structural/positional identity that resolved the old node may resolve nothing or the wrong node.
3. **Virtualization (EC-13).** Libraries like react-window, react-virtualized, ag-grid, TanStack Virtual render **only the rows currently in the viewport**. The target row literally **does not exist in the DOM** until scrolled into view. `scrollIntoViewIfNeeded` fails because there's no element to scroll to.
4. **Infinite scroll / lazy load (EC-14).** Content (and images/sections) load on scroll/intersection. The target appears only after a scroll triggers a fetch + render.
5. **SPA route change (EC-34).** Navigation via the History API — URL changes, content swaps, but **no page-load event fires**. Waiting for `load`/`networkidle` either never resolves or resolves too early.
6. **Optimistic UI / live data (EC-32).** The UI updates instantly (optimistic), then reverts if the server rejects; or websocket-driven data shifts row order mid-interaction, so the row you targeted moved.
7. **`networkidle` is a trap for SPAs.** Polling, websockets, analytics beacons, and long-poll keep the network busy forever — `networkidle` never fires. Waiting on it hangs; not waiting risks acting too early.

---

## 2. How best-in-class systems stay reliable

### Playwright — late-bound locators + auto-retry + stable gate (the model)
- **Detachment/re-render (EC-09):** a `Locator` is a **selector string, re-queried on every action**. Playwright's action loop *retries on detachment* — if the node is replaced mid-action, it re-resolves and continues. Stale handles are impossible by construction. This is the single most important property.
- **Mid-render motion:** the `_checkElementIsStable` RAF gate waits until the bounding box is unchanged across animation frames before acting — absorbs reflow/animation.
- **SPA route (EC-34):** Playwright's web-first assertions and locator auto-wait key off the *target element's* appearance, not a page-load event — so "wait for the new view's element" is the idiom, not "wait for navigation."
- **`networkidle`:** Playwright docs explicitly discourage it for SPAs; the recommended pattern is to wait for a specific element/state. Conxa already follows this (domcontentloaded default; networkidle behind a flag).
- **Virtualization (EC-13):** Playwright has no magic — `scrollIntoViewIfNeeded` works only if the element exists. For pure virtualization you must scroll the container until the row renders (Playwright gives the primitives; the *loop* is on you).

### SeleniumBase — re-find on stale + ready-state sync
- **EC-09:** the click ladder catches `StaleElementReferenceException` → **re-find** the element fresh → retry. Explicit but effective.
- **Settle:** `wait_for_ready_state_complete` + `wait_for_angularjs` (checks `document.readyState`, jQuery `active`, Angular pending requests) before the next action — a deterministic "framework settled" gate. Useful for Angular/jQuery apps; doesn't cover React (no global pending signal).

### browser-use — page-change guards + stall fingerprint
- **Stale-after-navigation (EC-09/34):** in `multi_act`, actions flagged `terminates_sequence` (navigate/search/back) abort the rest of the queued actions, and a **runtime URL/focused-target diff** after any action aborts remaining queued actions — so it **never acts on a stale DOM after the page changed**. This is a directly adoptable deterministic guard.
- **Stagnation:** `PageFingerprint` (url + element_count + DOM-text hash) detects "nothing is changing" — a cheap deterministic stall signal.
- It re-perceives every step (LLM), which "handles" dynamism by brute force — not adoptable, but the *guards* are.

### Stagehand / UI-TARS
- Stagehand: cache replay + `waitForCachedSelector` (re-resolve) inherits Playwright's robustness; on drift it re-grounds (LLM). UI-TARS: re-screenshots every step, so dynamism is absorbed by re-perception — expensive, non-deterministic.

---

## 3. What Conxa does today (verified in code)

- **Late-bound identity (EC-09):** `runtime/run.js` `withLocator` re-resolves the selector each attempt via `root.locator(selector)`; it never holds a node handle across calls. **Detachment/re-render is largely handled** — the right foundation, inherited from Playwright. ✅
- **`networkidle` trap avoided:** `waitForPageLoadAndPace` waits for `domcontentloaded` by default; `networkidle` only when `CONXA_WAIT_NETWORKIDLE=1`. ✅ Correctly avoids the SPA-hang trap.
- **Pre-step URL gate:** `waitForUrlState` gates steps on expected URL (helps EC-34 partially).
- **Navigation-aware pacing:** after navigation-class steps, waits for `domcontentloaded` + observer pause.

**Gaps:**
1. **No stability (RAF) gate (EC-09 motion, EC-11).** `withLocator` waits for `visible` then acts; a mid-reflow element can be clicked while moving → wrong hit. (Same gap noted across docs.)
2. **No virtualization handling (EC-13).** `scroll` handler does `scrollIntoViewIfNeeded` on an existing selector; if the target row isn't rendered yet (virtualized), there's nothing to scroll to → hard fail. **No scroll-until-found loop.** This is a concrete, common enterprise failure (ag-grid/react-window tables).
3. **No lazy-load trigger (EC-14).** No deterministic "scroll to load more, then act."
4. **No post-navigation stale-DOM guard (EC-09/34).** If a step unexpectedly navigates, the next queued step may act on a transitioning DOM (browser-use's guard would prevent this).
5. **Optimistic UI (EC-32):** no verification against server-confirmed state — an optimistic flash can false-pass (ties to EC-28).
6. **700ms fail-fast** beats slow re-renders/lazy loads.

---

## 4. Recommended deterministic dynamic-UI architecture for Conxa

*Zero-LLM. Foundation is already right (late-bound + domcontentloaded); the work is gates, scroll-until-found, and guards.*

### 4.1 Late-bound identity — keep, and add the stability gate
Keep re-resolving every action (already correct). **Add the actionability stack** (attached→visible→**stable(RAF)**→enabled) before acting, so mid-render motion (EC-09/11) is absorbed instead of mis-clicked. This is the same gate `future-runtime-architecture.md` specifies — it pays off most here.

### 4.2 Scroll-until-found for virtualization (EC-13) — a concrete new primitive
For targets compiled as "inside a virtualized container," add a deterministic loop:
1. resolve the **scroll container**,
2. re-query the target by **stable identity** (row text / data-attribute — *not* DOM index, which virtualization recycles),
3. if not found, scroll the container by a viewport step,
4. wait for render (short stable gate),
5. repeat until found or a bounded scroll budget is exhausted.
Zero-LLM. The compiler should **flag virtualized containers at record time** (detect react-window/ag-grid patterns or "row count >> rendered nodes") so the runtime knows to use scroll-until-found rather than `scrollIntoViewIfNeeded`.

### 4.3 Lazy-load trigger (EC-14)
Same shape as 4.2 but for "scroll to trigger fetch → wait for the section to appear → act." A bounded, deterministic scroll+wait loop keyed on the target's appearance.

### 4.4 Post-navigation stale-DOM guard (EC-09/34) — adopt from browser-use
Track URL + focused-target between steps; if a step caused an unexpected navigation/route change, **wait for the new view's anchor element** (not a load event) before the next step, and never act on the transitioning DOM. Mark known navigation-causing steps (already partially done) and also detect *runtime* URL change.

### 4.5 SPA route readiness (EC-34)
Replace "wait for load" entirely with "**wait for the next step's target (or a compiled view-anchor) to be actionable**." This is the Playwright idiom and it's the only reliable SPA readiness signal. `waitForUrlState` + target-actionability together cover it.

### 4.6 Optimistic UI / live data (EC-32) → verification, not timing
Don't try to out-wait optimistic flashes. Instead, **verify the post-condition against server-confirmed state** (the independent post-condition, EC-28) — e.g., the row persists after a re-fetch, the toast says "saved," the value survives a re-read. For row-reordering live data, re-resolve by **stable identity** (text/data-id), never by position/index, so a moved row is still found.

### 4.7 Identity discipline (the root cause)
Most dynamic-UI failures are really **identity** failures: position/index/GUID-class selectors break on re-render. The compiler must rank **role+name > text > data-testid > scoped-CSS**, and **never** index/position as primary for dynamic content. This (the durability-ordering principle) is what makes late-bound re-resolution actually find the right node after a re-render.

---

## 5. Reliability ranking

| Mechanism | EC-09 | EC-13 virt | EC-14 lazy | EC-34 SPA | EC-32 optim | Conxa fit |
|---|---|---|---|---|---|---|
| Late-bound locator re-resolve (Playwright) | ✅ | ⚠️ (needs scroll loop) | ⚠️ | ✅ | ⚠️ | **Have it — keep** |
| Stability (RAF) gate | ✅ | — | — | — | — | **Adopt** |
| Scroll-until-found loop | — | ✅ | ✅ | — | — | **Adopt (new primitive)** |
| Post-nav stale-DOM guard (browser-use) | ✅ | — | — | ✅ | ✅ | **Adopt** |
| Target-actionability readiness (vs networkidle) | ✅ | — | — | ✅ | — | **Have the default — extend** |
| Independent post-condition (vs optimistic flash) | — | — | — | — | ✅ | **Adopt (EC-28)** |
| Re-perceive every step (browser-use/UI-TARS) | ✅ | ✅ | ✅ | ✅ | ✅ | non-deterministic; reject for hot path |

---

## 6. Summary — what Conxa should do

1. **Keep late-bound re-resolution** (already correct — the foundation for EC-09) and **add the stability(RAF) gate** so re-rendering/animating elements aren't mis-clicked.
2. **Add a deterministic scroll-until-found loop** for virtualized lists/tables (EC-13) — resolve container, re-query by *stable identity*, scroll, repeat; compiler flags virtualized containers at record time. *(The most impactful new primitive — virtualized grids are everywhere in enterprise.)*
3. **Add a bounded scroll-to-load loop** for lazy content (EC-14).
4. **Adopt browser-use's post-navigation stale-DOM guard** — never act on a transitioning DOM after an unexpected route change (EC-34); wait for the new view's anchor, not a load event.
5. **Verify optimistic/live updates against server-confirmed state** (EC-32 → independent post-condition, EC-28), and **re-resolve moving rows by stable identity, never position**.
6. **Enforce durability-ordered identity** (role/name/text/testid before structural) at compile — the root-cause fix that makes late-bound re-resolution land on the right node after a re-render.

**Net:** This family causes the most production pain, yet it is **the most deterministically solvable** — Conxa already has the hardest-won piece (late-bound identity) and avoids the `networkidle` trap. The remaining work (stability gate, scroll-until-found, stale-DOM guard, identity discipline, outcome verification) is all zero-LLM and directly portable from Playwright + browser-use's deterministic guards. No LLM in the hot path is needed to make dynamic UIs reliable.
