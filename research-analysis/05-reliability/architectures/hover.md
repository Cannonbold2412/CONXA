# Hover & Interaction Deep Dive (Phase 5)

**Edge cases covered:** EC-15 (hover-triggered visibility/menus), EC-16 (delayed/chained hover menus), EC-17 (tooltip-driven), EC-18 (context menus), plus hover→click sequences.
**Why it matters:** Hover-revealed UI is pervasive in enterprise apps — flyout navigation, "⋯" overflow/action menus on table rows, dropdown nav bars, tooltip-gated controls. The failure is subtle: the target element **does not exist or is not visible until a parent is hovered**, and it **disappears on mouse-out**. A workflow that tries to click the child directly fails ("element not visible"); a workflow that hovers then *re-resolves slowly* fails because the menu already closed. This is a **timing + sequencing** problem, not an identity problem.

---

## 1. Why hover interactions break automation

1. **Conditional existence (EC-15).** Many menus are *not in the DOM* until hover (rendered on demand); others are present but `display:none`/`visibility:hidden` until a `:hover` CSS rule or JS handler fires. Clicking the child before hovering the parent → "not found"/"not visible".
2. **Volatility.** The menu closes on `mouseleave`. If the automation moves the mouse elsewhere (or the framework re-renders) between hover and click, the target vanishes mid-interaction.
3. **Chaining & delay (EC-16).** Multi-level menus (hover A → submenu B appears after a CSS transition delay → hover B → item C). Each level has an open/close animation and its own hover region; the mouse path matters.
4. **Synthetic vs real hover.** A JS-dispatched `mouseover` event does **not** always trigger CSS `:hover` (CSS `:hover` responds to the real pointer position, not synthetic events). Tools that fake hover via `dispatchEvent` silently fail on CSS-driven menus.
5. **Tooltips (EC-17) / context menus (EC-18).** Tooltips gate information needed for the next decision; context menus render at the body root far from the trigger, breaking structural/positional selectors.

---

## 2. How best-in-class systems achieve reliability

### Playwright — real pointer movement + auto-wait
- **Mechanism:** `locator.hover()` performs a **real mouse move** to the element's hit point (via CDP `Input.dispatchMouseEvent`), which *does* trigger CSS `:hover`. Because the pointer physically rests over the parent, the menu stays open while Playwright then auto-waits for the child and clicks it. Auto-wait means the child's "appear after transition" (EC-16) is absorbed by the actionability poll.
- **Chaining:** express as a sequence of `hover()` calls ending in `click()`; the pointer stays in the menu region across the chain.
- **Reliability:** high — real-pointer hover + auto-wait is the correct model. Limit: if the menu closes the instant the pointer moves toward the child along a path that exits the hover region, you can get flicker; Playwright mitigates by moving directly to the target hit point.
- **Context menus (EC-18):** `click({button:'right'})` then act on the menu (often `getByRole('menuitem', {name})`), which Playwright finds wherever it rendered (role/text identity is position-independent).

### SeleniumBase — `hover_and_click` as an atomic sequence
- **Mechanism:** `hover_and_click(hover_selector, click_selector)` (and `hover_on_element`) uses ActionChains/JS to move to the parent and click the child **as one atomic operation**, minimizing the window in which the menu can close. SB also has browser-specific routing (some browsers need JS hover).
- **Reliability:** good and *explicitly sequenced* — the author names both the hover target and the click target, so the dependency is captured. This is the key lesson: **hover→click is one logical action with two elements**, and modeling it that way (vs two independent steps) is what makes it reliable.
- **Chaining:** supported but more manual.

### browser-use / Stagehand / UI-TARS
- browser-use: the LLM sees the post-hover screenshot/AX and decides — but it must *know to hover first*, which it often gets wrong; non-deterministic. Stagehand inherits Playwright's hover. UI-TARS: moves the real cursor (NutJS) so CSS `:hover` fires — vision sees the menu open and clicks it; works but expensive/non-deterministic.

---

## 3. What Conxa does today (verified in code)

- `runtime/run.js` has a **`hover` handler**: `locator.hover({ timeout: SECONDARY_ACTION_TIMEOUT_MS })` — a **real-pointer hover via Playwright**, so it correctly triggers CSS `:hover`. Good foundation.
- The recorder (`bridge.js`) captures hover-related events; the runtime's `focus` handler also does click-then-focus.
- **However:** hover and the subsequent click are recorded/replayed as **independent steps**. Between them, `runPlan` runs `waitForPageLoadAndPace` and per-step pacing — the pointer may effectively "rest," but there is **no explicit guarantee the menu stays open**, and **on recovery the hover context is lost** (recovering the click step re-resolves the child with no re-hover of the parent → the menu is closed → recovery fails even though the deterministic ladder is "working").

---

## 4. Gaps in Conxa's current hover handling

1. **Hover→click is two steps, not one logical action.** If the menu closes between them (re-render, pacing jitter, animation), the click step fails. The dependency ("this click requires that hover to be active") is not represented.
2. **Recovery is hover-blind.** When the click step fails and enters `recoverStep`, none of the deterministic tiers (compiled-alt, a11y, fallback, dialog-scope, fuzzy) re-establish the hover precondition. So a transient menu-close becomes an unrecoverable failure — a *false* hard failure.
3. **No re-hover-then-retry primitive.** The cheapest, most effective hover recovery — "re-hover the parent, then retry the child" — doesn't exist.
4. **Chained hovers (EC-16) have no transition-aware wait.** Submenu appears after a CSS transition; the 700ms fail-fast can beat it.
5. **Context-menu items (EC-18)** rendered at body root need role/text identity, not structural — depends on compiler choosing the right signal.

---

## 5. Recommended deterministic hover architecture for Conxa

*Zero-LLM. Mostly about **representation** (capture the dependency) + a **re-hover recovery sub-tier**.*

### 5.1 Model hover→click as a dependent action group (the key fix)
At compile time, detect hover→click(→hover→click) sequences and emit them as a **hover-gated action group**: the click step carries a reference to its **prerequisite hover element(s)** (the host chain that reveals it), analogous to the iframe/shadow chain. The runtime then knows: "before resolving this target, ensure its hover prerequisite is active."

### 5.2 Real-pointer hover + actionability gate (keep + harden)
Keep `locator.hover()` (real pointer → triggers CSS `:hover`). Add the **stable/visible actionability gate** to the *revealed child* so the transition (EC-16) is absorbed instead of fail-fast at 700ms. For chained menus, hover each level with a per-level appear-gate.

### 5.3 Re-hover-then-retry as a zero-token recovery sub-tier
Add to the deterministic ladder (slots into Tier 1): if the target of a hover-gated group isn't found/visible, **re-hover the prerequisite element(s), wait for the child to appear, then retry**. This single primitive converts the most common hover failure (menu closed) from a hard failure into an automatic recovery — and it's pure Playwright, zero-token.

### 5.4 Don't break hover context during pacing
For hover-gated groups, suppress the inter-step navigation wait / large observer pause *between* the hover and the click (these are one logical action) so the menu doesn't time out. Pace *around* the group, not *within* it.

### 5.5 Identity for revealed items
Ensure the compiler prefers **role+name/text** for menu items and context-menu items (EC-18) — they render at unpredictable DOM locations, so structural/positional identity is fragile. (Same durability-ordering principle as everywhere.)

### 5.6 Verification
Post-condition for a hover-gated action should confirm the *effect* (e.g., the menu action navigated/changed state), not merely that the click dispatched — because a click into a closing menu can "succeed" on nothing (EC-28).

---

## 6. Reliability ranking

| Approach | EC-15 | EC-16 chain | EC-17 tooltip | EC-18 context | Conxa fit |
|---|---|---|---|---|---|
| Playwright real-pointer hover + auto-wait | ✅ | ✅ | ✅ | ✅ | **Adopt (already using hover)** |
| SeleniumBase `hover_and_click` atomic | ✅ | ⚠️ manual | ✅ | ✅ | **Adopt the "one logical action" modeling** |
| Synthetic `dispatchEvent('mouseover')` | ❌ (CSS :hover) | ❌ | ❌ | ⚠️ | **Reject** — doesn't trigger CSS hover |
| LLM/vision (browser-use/UI-TARS) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | non-deterministic; recovery-only |
| **Conxa today** (hover step + separate click) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | foundation ok; menu-close = false fail |
| **Conxa recommended (§5)** | ✅ | ✅ | ✅ | ✅ | **Target** |

---

## 7. Summary — what Conxa should do

1. **Model hover→click as a dependent action group** (compile-time): the click carries its hover prerequisite chain, like an iframe/shadow chain. *The single most important fix.*
2. **Keep real-pointer `hover()`** (triggers CSS `:hover`); **never** use synthetic `mouseover` events for menu reveal.
3. **Add an appear-gate** on the revealed child (absorbs transition delays; replaces 700ms fail-fast for these steps).
4. **Add a zero-token "re-hover-then-retry" recovery sub-tier** — converts the common menu-close failure into automatic recovery.
5. **Pace around the group, not within it** (don't let inter-step waits time the menu out); **prefer role/text identity** for menu/context-menu items; **verify the effect**, not just the click.

**Net:** Conxa already does the hard part right (real-pointer hover via Playwright). The gap is **representational** — hover and click are modeled as independent steps, so a transient menu-close becomes a false hard failure and recovery is hover-blind. Capturing hover→click as one dependent group plus a re-hover recovery sub-tier closes the gap deterministically, with no LLM in the hot path.
