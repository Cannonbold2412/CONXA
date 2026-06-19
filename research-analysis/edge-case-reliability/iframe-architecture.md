# Iframe Architecture Deep Dive (Phase 3)

**Edge cases covered:** EC-01 (single), EC-02 (nested), EC-03 (cross-origin), EC-43 (hidden/detached), plus dynamic iframe injection.
**Why this is a top-tier concern:** iframes are the single hardest *structural* edge case and they are *everywhere* in enterprise SaaS — Salesforce (Visualforce/Lightning embedded frames), ServiceNow (`gsft_main`), Zendesk, embedded payment widgets (Stripe/Braintree), help/chat widgets, and any "app inside an app." A workflow that ignores frames doesn't degrade gracefully — it fails 100% of the time on a framed target. Conxa already treats the **iframe chain as a verbatim invariant**, which is the correct foundation; this document validates that choice against best-in-class and specifies the deterministic architecture.

---

## 1. Why iframes break automation

The DOM is not one tree. An `<iframe>` hosts a *separate document* with its own `document`, its own coordinate origin, and (for cross-origin) its own security boundary. Three distinct failure modes:

1. **Wrong-tree query (EC-01/02).** `document.querySelector('#target')` from the top frame returns `null` because `#target` lives in a child document. The element is *visible on screen* but *unreachable* from where the query runs. This is the most common and most confusing iframe failure — the user sees the element, the automation swears it doesn't exist.
2. **Security boundary (EC-03).** For a cross-origin iframe, the parent document **cannot** reach into the child via JS at all (same-origin policy). `iframe.contentDocument` is `null`. Only a protocol-level engine (CDP, which operates per-frame/target out-of-process) can traverse it. Any approach built purely on in-page `document.*` traversal *cannot* handle cross-origin frames — full stop.
3. **Stale frame handle (EC-43, dynamic injection).** SPAs inject/replace iframes after load (lazy-loaded widgets, modal iframes). A captured frame reference detaches; coordinate offsets computed once go stale.

---

## 2. How best-in-class systems handle it

### Playwright — frame traversal encoded in the locator grammar (the gold standard)
- **Model:** `frameLocator(selector)` returns a `FrameLocator`; chaining `page.frameLocator('#outer').frameLocator('#inner').locator('#target')` expresses an *ordered frame chain* as data. Internally the selector grammar uses `internal:control=enter-frame` to encode frame entry *inside the selector string itself*.
- **Why it works:** traversal is **late-bound and re-resolved every action** — the frame is re-entered on each attempt, so a detached/re-injected iframe (EC-43) is handled for free (re-query finds the new frame). It is **out-of-process** via CDP, so **cross-origin frames (EC-03) work transparently** — Playwright doesn't rely on `contentDocument`.
- **Nested (EC-02):** just chain more `frameLocator` calls; arbitrary depth.
- **Reliability:** very high. This is the reference architecture. Limit: closed/hidden frames still need to be attached+visible to act.

### SeleniumBase — explicit imperative frame switching
- **Model:** `switch_to_frame(selector)` / `switch_to_default_content()` — WebDriver's stateful `frame switching`. The driver's "current context" is moved into the frame; subsequent calls operate there until you switch back.
- **Nested:** switch into outer, then inner, sequentially. **Cross-origin:** works because WebDriver/CDP operates at the protocol level, not via `contentDocument`.
- **Reliability:** high but **stateful and error-prone** — forgetting to switch back leaves subsequent steps in the wrong context; a navigation invalidates the switch. The imperative model couples frame state to execution order.
- **Lesson for Conxa:** the *capability* is right, but **statefulness is the wrong representation** — frame context should be a *property of the element identity*, not ambient runtime state.

### browser-use / Stagehand — frame-aware via the underlying engine
- browser-use carries `frame`/`target` IDs on each `EnhancedDOMTreeNode` (CDP per-target), so the AX-tree serialization includes framed elements; the LLM addresses them by index. Stagehand inherits Playwright's `frameLocator`. Neither adds a deterministic frame *model* beyond what CDP/Playwright give them.

### UI-TARS — frames are invisible (and that's the point)
- Vision/coordinate automation **doesn't care about frames** — a screenshot flattens all frames into pixels; a click at (x,y) hits whatever is there. This "works" but discards the structural identity, so it inherits all the EC-39/28 fragility. Relevant only as the absolute last-resort tier.

---

## 3. What Conxa does today (verified in code)

**Conxa already has the right architecture — encoded frame chain, late-bound, re-resolved.** From `runtime/run.js`:

- `frameChain(step)` reads `step.frame.chain` — an **ordered list of frame specs** preserved verbatim from recording.
- `rootCandidates(page, step, inputs)` walks the chain, calling `root.frameLocator(selector)` for each level, accumulating candidate roots (and trying each frame spec's primary + fallback selectors). Returns the page itself when there's no chain.
- `frameSelectors(spec, inputs)` resolves each frame level's selector + `fallback_selectors` with `{{var}}` interpolation.
- Every interaction (`withLocator`, `withLocatorPair`, `locatorCandidates`) resolves *through* `rootCandidates`, so **frame context is a property of element resolution, not ambient state** — exactly the fix for SeleniumBase's statefulness problem.

**The invariants (from `CLAUDE.md`), all upheld:**
- "Iframe chain is preserved verbatim from recording through compile and execution."
- "Bounding boxes are page-level (offsets accumulated up the parent chain in `session.py`)."
- "`frame_enter`/`frame_exit` steps get `no_recovery_block`" — frame markers are structural, never retried as interactions.

**Recording side (`conxa_compile/recorder/`):** `bridge.js` is injected into *every* frame via `addInitScript`; each event carries `frame` = `{src, frame_id, parent_chain}`; `frame_extractor.py` accumulates page-level bbox offsets up the chain.

**Verdict:** Conxa's iframe handling is **architecturally best-in-class already** — it matches Playwright's "frame chain as data, late-bound" model and avoids SeleniumBase's statefulness. This is a genuine strength, under-celebrated.

---

## 4. Gaps in Conxa's current iframe handling

Despite the strong foundation, edge cases remain:

1. **Frame identity drift (EC-43).** The *frame selector itself* can drift (the iframe's `id`/`src` changes), just like element selectors. Today `frameSelectors` supports `fallback_selectors` per level (good), but there is **no multi-signal identity for the frame** (no role/title/name/src-pattern scoring) and **no live scoring** of frame candidates — same gap as element resolution (EC-12). A frame with a dynamic `id` breaks the chain with no recovery.
2. **No frame-level recovery tier.** When `rootCandidates` produces no working root (all frame selectors miss), the step just fails through to element recovery, which is scoped to a (now-empty) root set. There is no dedicated "re-find the frame" recovery (e.g., match by `src` URL pattern, frame `title`, or "the only iframe on the page").
3. **Cross-origin is fine; hidden/not-yet-loaded frames are not.** A frame that hasn't loaded yet (EC-43) needs a wait-for-frame gate before traversal; today resolution depends on the frame already being present.
4. **Dynamic injection ordering.** If an iframe is injected *after* the recorded step's expected point (race), there's no explicit wait-for-frame-attached.

---

## 5. Recommended deterministic iframe architecture for Conxa

*Zero-LLM. Builds on the existing `rootCandidates` design.*

### 5.1 Frame identity = multi-signal, like element identity
Compile a **FrameFingerprint** per chain level, mirroring `ElementFingerprint`:
- `src_pattern` (normalized URL/path, query stripped) — most stable for embedded apps,
- `name` / `title` / `id` (when not GUID-like; reuse `isGuidLike` penalty),
- `role`/`aria-label` if present,
- `index_hint` ("Nth iframe matching pattern") as last resort,
- ordinal position in `parent_chain`.
Store ranked frame selectors ordered **semantic→structural** (src/name/title before `#id`/nth) — same durability ordering as elements (the C.1 lesson).

### 5.2 Wait-for-frame gate (deterministic)
Before traversing a level, deterministically wait for a frame matching the fingerprint to be *attached* (and, if interaction follows, that its document reached `domcontentloaded`). This closes EC-43/dynamic-injection races. Bounded timeout; zero-LLM.

### 5.3 Frame-level recovery tier (slots into the cascade as a sub-tier of Tier 1/2)
When the primary frame selector misses, deterministically try, in order:
1. next ranked frame selector (alternate signal),
2. match by `src_pattern` across all attached frames,
3. match by `name`/`title`,
4. "the only frame matching role/type" heuristic,
5. CDP frame-tree enumeration (every frame, including cross-origin) filtered by fingerprint.
All zero-token. Only if *every* frame-resolution path fails does the step escalate to the host-delegated tier — and the escalation payload should say **"frame not found"** (a distinct failure class), not "element not found," so the operator/Claude diagnoses the right level.

### 5.4 Frame context stays in identity, never ambient
Keep the current design: never adopt SeleniumBase-style stateful `switch_to_frame`. Frame context is re-resolved per action via `rootCandidates`. This makes re-render/detachment (EC-43) self-correcting.

### 5.5 Verification across the boundary (ties to EC-28)
Post-condition checks for framed steps must run **inside the same frame** (re-resolve the chain to read state), or the verifier will read the wrong document and false-pass/false-fail. The independent post-condition probe must be frame-aware.

---

## 6. Cross-origin specifics (EC-03) — the make-or-break

- **Conxa is safe here** because it executes via Playwright/CDP (out-of-process per frame), not via in-page `contentDocument` traversal. `frameLocator` enters cross-origin frames transparently.
- **The one rule:** never introduce an in-page `document.querySelector`-from-parent path for frame traversal as an "optimization" — it would silently break on every cross-origin frame. All frame resolution must go through the Playwright/CDP frame APIs.
- Recording must capture the cross-origin frame's `src` even when the parent can't read its internals (CDP exposes the frame tree regardless of origin) — verify `bridge.js`/`frame_extractor.py` capture `src` from the frame target, not from `iframe.contentDocument` (which is null cross-origin).

---

## 7. Reliability ranking of approaches

| Approach | EC-01 | EC-02 | EC-03 | EC-43 | Stateful risk | Conxa fit |
|---|---|---|---|---|---|---|
| Playwright `frameLocator` (chain-as-data, late-bound, CDP) | ✅ | ✅ | ✅ | ✅ | None | **Adopt (already aligned)** |
| SeleniumBase `switch_to_frame` (imperative, stateful) | ✅ | ✅ | ✅ | ⚠️ | High | Capability yes, model no |
| browser-use/Stagehand (engine-inherited) | ✅ | ✅ | ✅ | ✅ | None | N/A (LLM-driven) |
| Vision/coordinate (UI-TARS) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | None | Last-resort only |
| **Conxa today (`rootCandidates`)** | ✅ | ✅ | ✅ | ⚠️ | None | **Strong; add §5** |
| **Conxa recommended (§5)** | ✅ | ✅ | ✅ | ✅ | None | **Target** |

---

## 8. Summary — what Conxa should do

1. **Keep the architecture** — frame-chain-as-data, late-bound via `rootCandidates`, frame context in identity not ambient. This is already best-in-class; don't regress it.
2. **Add FrameFingerprint multi-signal identity** (src/name/title/role + ordinal), ranked semantic→structural, with `fallback_selectors` you already support — so a dynamic frame `id` (EC-43/12) doesn't break the chain.
3. **Add a deterministic wait-for-frame-attached gate** before traversal — closes dynamic-injection races.
4. **Add a zero-token frame-level recovery sub-tier** (alternate signal → src match → title match → CDP frame-tree enumeration) and emit a distinct **"frame not found"** failure class on escalation.
5. **Make post-condition verification frame-aware** — read outcome state inside the same frame chain, never the wrong document.
6. **Never** add an in-page `contentDocument` traversal path — it silently dies on cross-origin (EC-03). All traversal stays on Playwright/CDP frame APIs.

**Net:** Conxa's iframe story is one of its quiet strengths and a real enterprise differentiator. The work is incremental hardening (multi-signal frame identity + frame-level recovery + frame-aware verification), entirely deterministic, no LLM in the hot path.
