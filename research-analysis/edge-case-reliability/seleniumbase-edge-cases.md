# SeleniumBase — Edge-Case Reliability Analysis (for Conxa)

> **Lens.** SeleniumBase (SB) is the **gold standard for deterministic TIMING + RECOVERY**. It carries no LLM, no vision, no multi-signal identity — yet recovers an enormous fraction of real-world flakiness through *poll-loop waits + staged readiness + exception-classified click fallbacks*. This document maps SB's concrete mechanisms onto the EC-ID taxonomy (`edge-case-inventory.md`), organized by the five families. Almost everything here lives in Conxa's **Tier 1/2 (zero-LLM)** band and is *directly adoptable*.
>
> **Corpus cites** (all `/tmp/research-corpus/repos/SeleniumBase-master/seleniumbase/`): `fixtures/page_actions.py` (poll primitives), `fixtures/base_case.py` (the action façade, ~17.4k lines — the `click` ladder at 405–676), `fixtures/js_utils.py` (scroll / JS / jQuery click), `core/sb_cdp.py` (CDP path).
>
> **Per-EC schema:** Detection / Representation / Resolution (cited fn) / Recovery / Reliability / Conxa Applicability.

---

## Cross-cutting mechanism: the poll-loop + staged readiness

Every wait in `page_actions.py` shares one shape (`wait_for_element_present` 396, `wait_for_element_visible` 454, `wait_for_element_clickable` 995):

```
start_ms; stop_ms = start + timeout*1000
for x in range(int(timeout*10)):          # ~10 Hz
    check_if_time_limit_exceeded()         # global test-budget guard
    try: <find + assert the stage>; return element
    except: if now_ms >= stop_ms: break; time.sleep(0.1)
raise <typed exception classified by stage reached>
```

Readiness is **staged** and the failure exception names *how far the element got*: `present` (`find_element` succeeds → `NoSuchElementException` if not), `visible` (`is_displayed()` → `ElementNotVisibleException`), `clickable` (`is_displayed() and is_enabled()` → `ElementNotInteractableException`), `text` (`TextNotVisibleException`). `wait_for_element_visible` (454) tracks `is_present` separately so it can distinguish "absent" from "present-but-invisible" (488–524). This staging is the spine for the whole timing family. The exception *type* is a free, deterministic signal that selects recovery — no inference.

---

# Family 2 — Timing & actionability (SB's home turf: EC-05/06/07/08/31/32)

SB's strongest family. The poll-loop *is* the actionability gate; the click ladder *is* the classified recovery. Directly adoptable into Conxa Tier 1/2.

### EC-05 — Element not stable (animation/transition)
- **Detection.** SB has no explicit "2 stable frames" geometry gate. Instability surfaces as a thrown `MoveTargetOutOfBoundsException` or `ElementNotInteractableException` at click time, or as `is_displayed()` flapping inside the poll loop.
- **Representation.** Implicit — handled as a transient inside the 10 Hz loop; a moving box simply fails the stage check and is retried 0.1 s later.
- **Resolution.** `wait_for_element_visible` (`page_actions.py` 454) re-polls until `is_displayed()` holds; `__scroll_to_element` (`base_case.py` 14609) then settles position. The pre-click `time.sleep(0.05)` (Safari/`__needs_minimum_wait`, click 438–439) absorbs short transitions.
- **Recovery.** On `MoveTargetOutOfBounds` the ladder (581–597) goes `__js_click` → `__jquery_click` → re-find-clickable + native — a dispatched MouseEvent ignores the moving bounding box entirely.
- **Reliability.** Good in practice but *implicit*: SB waits for *visible*, not *geometrically settled*. A mid-flight element that is "displayed" can still be clicked at the wrong coordinate before the JS-click fallback kicks in.
- **Conxa Applicability.** **Adopt the recovery, improve the detection.** SB validates that JS-dispatch click neutralizes most animation flake at zero token cost. Conxa should add the *explicit* stability gate SB lacks (sample bounding box across two polls) as a Tier-1 actionability precondition, then keep SB's JS-click escape hatch.

### EC-06 — Overlapped / pointer-intercepted target  ★ crown-jewel mechanism
- **Detection.** The native `element.click()` throws — `ElementNotInteractableException` (overlay/zero-size) or a `WebDriverException` whose message names interception. SB classifies purely by **exception type** (imports aliased at 55–62: `ENI_Exception`, `Stale_Exception`).
- **Representation.** No model of "what's on top." The interceptor is treated as an opaque cause; the response is *escalating invasiveness*, not diagnosis.
- **Resolution / Recovery (the ladder, `base_case.py::click` 405–676).** This is the crown jewel — classify, then escalate:
  - `ElementNotInteractableException` (504): special-case zero-size `<a>` → straight to `js_click`/`jquery_click` and return (505–516); else `wait_for_ready_state_complete` → `sleep(0.1)` → re-find visible → `wait_for_element_clickable(timeout=1.8)` → re-scroll → native click, and if *that* throws, re-find visible + click again (517–580).
  - `MoveTargetOutOfBoundsException` (581): `__js_click` → `__jquery_click` → re-find-clickable + native.
  - generic `WebDriverException` (598): **swallow** if message is `"cannot determine loading status"` / `"unexpected command response"` (benign driver noise where the click *did* land, 599–604); else `__js_click` → `__jquery_click` → re-find-visible + native.
  - `__js_click` (14109) injects `new MouseEvent('click',{bubbles,cancelable,view})` + `dispatchEvent` — bypassing the overlay's pointer-event capture; `__jquery_click` (14383) runs `jQuery(sel)[0].click()`, the most forceful rung.
- **Reliability.** Excellent. The native→JS→jQuery escalation defeats sticky headers, toasts, spinners and zero-size anchors without author intervention. The benign-error swallow (599–604) is a battle-tested guard against *false* failures.
- **Conxa Applicability.** **Directly adoptable, near-verbatim, as Tier 1/2.** This ladder is the reference spec for Conxa's zero-LLM recovery: classify by failure cause, escalate by invasiveness (re-find < native < JS-dispatch < protocol), each rung gated on the prior throwing. *Caveat for Conxa's EC-28 thesis:* a forced JS/jQuery click can succeed on a hidden/overlapped duplicate — SB has **no post-condition check** that the *intended* effect happened. Conxa must bolt outcome verification onto the same ladder.

### EC-07 — Off-screen / needs scroll-into-view
- **Detection.** Proactive, not reactive: SB scrolls *before every action* rather than waiting for an out-of-bounds error.
- **Representation.** None needed — scroll is an unconditional pre-step.
- **Resolution.** `__scroll_to_element` (`base_case.py` 14609) → `js_utils.scroll_to_element` (1287): primary `arguments[0].scrollIntoViewIfNeeded(true)` (Chrome/Edge/Safari); Firefox fallback `__old_scroll_to_element` (1299) computes `window.scrollTo(x_fix, y - Y_OFFSET)` with a 400 px horizontal safety margin. CDP path uses `cdp.dom.scroll_into_view_if_needed` (`element.py` scroll_into_view_async) — protocol-level, no JS injection.
- **Recovery.** If JS scroll returns falsy, `__scroll_to_element` re-runs `wait_for_ready_state_complete` + `wait_for_element_visible(SMALL_TIMEOUT)` and proceeds (14611–14615).
- **Reliability.** Very high; eliminates a whole `MoveTargetOutOfBounds` class proactively.
- **Conxa Applicability.** **Adopt directly.** "Scroll-into-view as an unconditional pre-action step" belongs in Conxa Tier 1; prefer the CDP `scroll_into_view_if_needed` route (protocol, cheaper, no page mutation) for the Tier-2 engine.

### EC-08 — Disabled-until-ready controls
- **Detection.** The `clickable` stage = `is_displayed() and is_enabled()` (`is_element_clickable` 81; `wait_for_element_clickable` 995). A control present-but-`disabled` fails the enabled check and is re-polled.
- **Representation.** Folded into the staged-readiness ladder — "enabled" is just the third gate.
- **Resolution.** Verbs that mutate state (`update_text`, `submit`, and the re-find rung of `click`) wait for *clickable*, so they block until `is_enabled()` flips true. `aria-disabled` is *not* checked (only the DOM `disabled` property via `is_enabled()`).
- **Recovery.** Inside the ladder, `ElementNotInteractable` path explicitly re-checks `is_element_clickable` and waits 1.8 s more (526–539) before forcing.
- **Reliability.** Solid for native `disabled`; **blind to `aria-disabled`** custom controls — a real enterprise gap.
- **Conxa Applicability.** **Adopt the enabled-gate, extend it.** Conxa should treat `aria-disabled="true"` and disabled-styling as additional actionability predicates the compiler emits, since SPA frameworks rarely toggle the native `disabled` attribute.

### EC-31 — Slow load / spinner / skeleton / never-idle
- **Detection.** After navigating clicks, SB synchronizes on page lifecycle rather than `networkidle`.
- **Representation.** Behavioral flags `WAIT_FOR_RSC_ON_CLICKS`, `SWITCH_TO_NEW_TABS_ON_CLICK` (`settings.py`) gate the settle; timeout *tiers* (`MINI/SMALL/LARGE_TIMEOUT`) are the only budget model.
- **Resolution.** `wait_for_ready_state_complete` (`document.readyState=="complete"`) + `wait_for_angularjs` (jQuery `active==0`, Angular pending requests) run post-click (click 640–667). SB deliberately uses `readyState`+framework hooks, *not* network-idle, side-stepping the "never-idle websocket" trap.
- **Recovery.** None special — it is itself a pre-condition for the next action; the staged poll loop tolerates skeletons because it waits for the *target* selector, not for "the page."
- **Reliability.** High for classic + Angular/jQuery apps; weaker for pure-React skeletons with no readiness hook (SB just polls the selector, which is actually the robust default).
- **Conxa Applicability.** **Adopt the principle, not the jQuery/Angular specifics.** Lesson: never gate on `networkidle`; gate on `readyState` + *the actual target selector's* staged readiness. Conxa should sync via CDP `Page.lifecycleEvent`/`readyState` and rely on per-step selector waits, mirroring SB's "wait for the element, not the network."

### EC-32 — Optimistic UI / websocket live updates
- **Detection.** Surfaces as `StaleElementReferenceException` (row re-rendered/reordered mid-interaction) — see EC-09.
- **Resolution / Recovery.** The stale-handling rung (486–503) re-finds via `wait_for_element_clickable` after a 0.16 s settle — adequate when the *selector* still matches the moved node.
- **Reliability / Conxa Applicability.** Partial: SB recovers position drift but cannot tell "the value reverted on server reject." This is squarely an **EC-28 outcome-verification** gap (Family 5). Conxa must add post-condition checks; SB offers nothing here beyond stale-recovery.

---

# Family 1 — Identity drift (EC-09/10/11/12), incl. the boundary cases below

SB's **weak** family: one string selector, fail-hard. Strong on *staleness* (a timing-flavored identity problem), absent on *self-healing*.

### EC-09 — React/SPA re-render & element detachment  ★ #1 SPA failure
- **Detection.** Native click / re-find throws `StaleElementReferenceException` (aliased `Stale_Exception`, caught at 486).
- **Representation.** The dead handle is discarded; the *selector string* is the recovery key — SB re-runs the same selector against the fresh DOM.
- **Resolution / Recovery (486–503).** `wait_for_ready_state_complete()` → `sleep(0.16)` → **re-find** via `wait_for_element_clickable(timeout, original_selector)` → conditional re-scroll → browser-aware click (Safari link-text → jQuery; Safari → JS; else native). Re-find-on-stale is the cheapest, most-used rung and handles the canonical React detachment cleanly **provided the selector still resolves**.
- **Reliability.** Excellent *if* the selector is stable across the re-render; **zero recovery if the path changed** (the exact fail-hard weakness).
- **Conxa Applicability.** **Adopt the stale→re-find loop as Tier 1; this is where Conxa's multi-signal identity earns its keep.** SB proves re-find-on-stale recovers most detachment for free. Conxa's differentiator: when the *single* selector no longer resolves post-render, fall to ranked multi-signal identity (text/role/attrs/structure) — the tier SB structurally lacks.

### EC-10 / EC-11 — Text/label & layout/position changes
- **Detection / Representation.** None. A text- or position-based selector that no longer matches simply exhausts the poll loop and raises a typed timeout.
- **Resolution.** SB offers richer *input* selectors (`:contains(TEXT)` expanded to XPath via `css_to_xpath` in `recalculate_selector`; `link=`/`text=` link-text forms) but these are static — no fuzzy/i18n tolerance.
- **Recovery.** None. Selector break = hard fail.
- **Conxa Applicability.** **Reject as the identity model; this is Conxa's whole opportunity.** SB demonstrates the cost of single-string identity. Conxa's compile-time multi-signal fingerprint + live scoring is precisely the missing layer.

### EC-12 — Dynamic IDs / GUID-like classes
- **Detection / Recovery.** None — `id="ember1234"` / `class="css-1a2b3c"` selectors are non-deterministic across loads and SB will time out with no fallback.
- **Conxa Applicability.** **Documented SB gap.** SB has *no* selector-stability heuristic and no fingerprint. Conxa's selector generator (penalize volatile ids/classes) + multi-signal identity is the answer; study SB only as the deterministic *timing* floor, not for identity.

### Multi-candidate waits — the deterministic ancestor of multi-signal resolution
- `wait_for_any_of_elements_visible` (757) / `_present` (838): iterate a **list** of selectors each poll tick, **return the first that satisfies the stage** (793–805), per-selector XPath/CSS auto-detection. Distinguishes "none present" vs "present-but-none-visible" in the failure message (814–833).
- **This is the manual ancestor of Conxa's multi-signal identity:** "first satisfying candidate wins" over an *author-enumerated* set. **Adopt the loop shape, automate the candidate set.** Conxa supplies the ranked signal set automatically (compiler-emitted) and scores by confidence rather than first-match order — but the resolution primitive is exactly SB's any-of loop.

---

# Family 4 — Boundary traversal (EC-01/02/03/04/04b/43)

SB switches *driver context* for frames and *pierces* shadow roots by string convention. Mechanically sound; directly informative for Conxa's iframe-chain invariant.

### EC-01 / EC-02 — Single & nested iframes
- **Detection.** Author declares the frame (selector/index/name/WebElement); SB does not auto-discover frames.
- **Representation.** **WebDriver context switch**, not a DOM-pierce. Nested frames = *stacked* `switch_to_frame` calls; `__uc_frame_layer` tracks depth for undetectable mode (`base_case.py` 3725–3726).
- **Resolution.** `switch_to_frame` (3692): pre-switch settle (scroll the frame into view if it's a visible string selector, 3711–3719) → `page_actions.switch_to_frame` (1609) polls `driver.switch_to.frame(frame)`; if `frame` is a string it resolves the element (XPath/CSS) then switches into it; supports `invisible=True` to switch into present-but-hidden frames → post-switch `wait_for_ready_state_complete` (3746). `switch_to_default_content` (3760) exits *all* frames (`__uc_frame_layer=0`); `switch_to_parent_frame` (3785) exits *one* level (decrement layer).
- **Recovery.** The switch itself is poll-retried for `int(timeout*10)` ticks (1609–1632); no recovery for a wrong/stale chain beyond timeout.
- **Reliability.** High for declared chains; brittle for **detached/re-added frames** (EC-43) where the handle goes stale — SB has no frame-handle revalidation.
- **Conxa Applicability.** **Adopt the model; Conxa already does it better via the verbatim iframe chain.** SB confirms "switch context per frame, stack for nesting, exit-one vs exit-all" as the correct primitive. Conxa's invariant (iframe chain preserved verbatim, page-level bounding boxes accumulated up the parent chain, `frame_enter`/`frame_exit` as non-retried navigation markers) is the structured upgrade of SB's imperative stacked switches.

### EC-03 — Cross-origin iframes
- SB's WebDriver `switch_to.frame` works *across* origin (WebDriver operates above the same-origin policy), so SB handles cross-origin frames natively where parent-document `querySelector` would fail. The CDP path (`sb_cdp.py`) also traverses at the protocol level.
- **Conxa Applicability.** **Confirms the design choice:** traverse frames via WebDriver/CDP context switching (origin-agnostic), never via parent-document JS. Conxa's `rootCandidates`/`frameLocator` approach is the same principle.

### EC-04 — Shadow DOM (open)
- **Detection.** **String convention:** `__is_shadow_selector` (15036) returns true when the selector contains `"::shadow "`; `__fail_if_invalid_shadow_selector_usage` rejects a selector ending in `::shadow`. The main `click` dispatches to `__shadow_click` *before* the normal flow (435–436).
- **Representation.** The selector is split into a host→child chain: `selector.split("::shadow ")` (`__get_shadow_element` 14919) yields `[host, child1, child2, …]`.
- **Resolution.** `__get_shadow_element` (14904) walks the chain: get host via `get_element(selectors[0])`; for each `::shadow` hop acquire the shadow root via `element.shadow_root` (Selenium 4.11+, 14927) or JS `return arguments[0].shadowRoot;` (older, 14939), then `shadow_root.find_element(By.CSS_SELECTOR, part)`, polling `int(timeout*4)` ticks with visibility enforcement on the final hop (must_be_visible, 14981–15003). `__shadow_click` (15042) then does a native `element.click()`.
- **Recovery.** Retry loop with 0.2 s sleeps and 2 s re-acquire on a missing `shadowRoot`; falls to `page_actions.wait_for_element_present(shadow_root, …)` on legacy browsers.
- **Reliability.** Good for **open, nested** shadow roots via the explicit `::shadow ` chain — but author must hand-write the chain (no auto-pierce of arbitrary selectors).
- **Conxa Applicability.** **Adopt the chain model; automate the authoring.** SB's `::shadow `-delimited host→child walk + `shadow_root.find_element` per hop is the correct deterministic pierce. Conxa should *encode the shadow-host chain into element identity at compile time* (so the runtime pierces automatically) rather than relying on a hand-written `::shadow ` string.

### EC-04b — Closed shadow roots
- `element.shadow_root` / `arguments[0].shadowRoot` return `null` for `mode:"closed"`; `__get_shadow_element` raises after retries. **SB cannot enter closed roots.**
- **Conxa Applicability.** **Shared hard boundary.** Closed roots need CDP/AX-tree or coordinate access — a Conxa Tier-2 (protocol) / vision-tier concern; SB offers no path and confirms the limit.

### EC-43 — Hidden/detached iframe
- `switch_to_frame(invisible=True)` enters present-but-hidden frames; but a *removed/re-added* frame yields a stale handle SB doesn't revalidate. **Gap** — Conxa's stale-aware frame-chain re-resolution is the upgrade.

---

# Family 3 — Stochastic interruption (EC-19/20/21/22/45)

SB has **no conditional-step model** — but it has the *primitive* Conxa needs: non-raising boolean probes that let an author hand-write conditional flows. This is the **ancestor of conditional steps for stochastic states**.

### EC-19 / EC-20 — Cookie/consent banners & modal dialogs (stochastic)
- **Detection.** Non-raising boolean probes: `is_element_visible` (`page_actions.py` 61, returns `find_element().is_displayed()` inside try/except), `is_element_present` (41), `is_text_visible` (119). These never throw — they answer a yes/no.
- **Representation.** No first-class "optional step." The author composes a conditional: `click_if_visible(selector)` (built on `is_element_visible`) attempts the dismiss *only if* the banner is present, silently no-ops otherwise.
- **Resolution / Recovery.** `click_if_visible` = probe-then-act; this is the deterministic answer to "appears on ~30–50% of loads." For an *unexpected* intercepting modal, the consequence is an interception handled by the EC-06 ladder (JS-dispatch click bypasses the overlay) — accidental, not principled, dismissal.
- **Reliability.** The probe primitive is rock-solid; coverage depends entirely on the author having *anticipated and hand-coded* each banner. No automatic "dismiss known patterns."
- **Conxa Applicability.** **Adopt `click_if_visible`/`is_element_visible` as the literal ANCESTOR of Conxa's conditional/optional steps.** The lesson is exact: stochastic interruptions are solved by **compile-time conditional representation** (probe → optionally act), *not* runtime intelligence. Conxa should generate optional dismiss-steps gated on a visibility probe — SB proves the probe is the deterministic building block; Conxa adds the compiler that emits them automatically + a known-pattern library.

### EC-22 — Session-expired / auth-redirect mid-run
- **Detection.** SB captures `pre_action_url` before each click (451–452) and compares post-action (`get_current_url`); a redirect changes the URL. `goto_if_not_url`-style verbs let authors branch on URL.
- **Recovery.** **None automatic** — SB has no re-auth self-heal (this is a genuine Conxa-only capability per the framework). SB only *detects* the URL change and runs ad-block/beforeunload cleanup (656–662).
- **Conxa Applicability.** **Detection adoptable, recovery is Conxa's edge.** Adopt SB's pre/post-URL capture as the redirect signal; Conxa's auth self-heal is the recovery SB lacks.

### EC-21 / EC-45 / EC-35 — MFA, idle interstitials, captcha
- SB has alert handling (`wait_for_and_accept_alert` 1538) for native dialogs but no model for app-rendered MFA/captcha/"are you still there?" interstitials beyond author-written `click_if_visible` probes.
- **Conxa Applicability.** Same pattern: probe-gated optional steps for interstitials; human-in-the-loop / stop-signal for MFA/captcha — outside SB's deterministic scope.

---

# Family 5 — Outcome ambiguity (EC-25/26/27/28/29/23/24)

SB's structural blind spot. It verifies **only via explicit author-recorded asserts**; there is no automatic post-condition check that "it clicked" ⇒ "it worked." This is where SB is *least* adoptable and Conxa most differentiated.

### EC-25 — Autocomplete / typeahead (options after async input)  ★★★★★
- **Detection.** Author sequences it manually: `type` the query → `wait_for_element_visible(option_selector)` → `click(option)`. The option-wait poll loop is the deterministic gate against "selecting before options render."
- **Representation.** No typeahead abstraction — three ordered verbs.
- **Resolution.** The intermediate `wait_for_element_visible` / `wait_for_text_visible` (536) on the option list is exactly the right deterministic gate; `wait_for_any_of_elements_visible` (757) can wait for *any* of several option shapes.
- **Recovery.** Click ladder applies to the option click; but **no verification the selected value is the intended one** (EC-28 risk).
- **Reliability.** Good against the *timing* failure (waiting for options); silent on the *wrong-option* failure.
- **Conxa Applicability.** **Adopt the wait-for-options gate; add Conxa's outcome verification.** SB nails the timing half (poll for the option to render before clicking — the WorkArena failure). Conxa must add the missing half: verify the committed field value equals the intended option.

### EC-26 — Custom dropdown vs native `<select>`
- **Detection / Resolution.** Native: SB's `select_option_*` verbs and CDP `select_option_async` (`element.py`) set `o.selected=true` + `dispatchEvent(new Event('change',{bubbles:true}))`. Custom (div-based): author does open → `wait_for_element_visible(option)` → `click` — same typeahead pattern.
- **Conxa Applicability.** **Adopt both paths.** The native-`<select>` change-event dispatch and the custom open→wait→click are both clean deterministic recipes for Conxa's compiler to emit by dropdown type.

### EC-28 — Silent wrong-element match (no verify)  ★ the dangerous one
- **Detection.** **SB has essentially none beyond explicit asserts.** Its own recovery *amplifies* this risk: a forced `__js_click`/`__jquery_click` (the EC-06 ladder) can fire on a hidden or duplicate node and *succeed silently* — no error, wrong effect.
- **Representation.** Verification exists only as author-recorded `assert_element`/`assert_text`/`assert_url`/`assert_attribute` (waits-that-raise) and **deferred asserts** (`deferred_assert_*` + `process_deferred_asserts`, batching soft failures). There is no automatic, independent post-condition.
- **Resolution / Recovery.** None automatic. The only safety net is whatever asserts the author thought to add.
- **Reliability.** This is SB's **single most dangerous gap** — the framework optimizes for "the action didn't throw," which is *not* "the action did the right thing."
- **Conxa Applicability.** **This is the precise boundary where Conxa must NOT follow SB.** Conxa's outcome verification (`validation_planner` → runtime `verifyAssertions`) is the differentiator. *Adopt SB's deferred-assert batching* for richer run reports, but reject SB's "no-throw == success" semantics: every forced/JS click in Conxa's adopted ladder must be paired with an independent post-condition (EC-28 is created *by* the very JS-click fallback SB relies on).

### EC-23 / EC-24 / EC-27 / EC-29 — uploads, downloads, date pickers, rich text
- SB has mature helpers (`choose_file` for hidden `<input type=file>`, `download_helper`, calendar/`set_value` patterns, contenteditable via key events) but, again, verification is author-driven.
- **Conxa Applicability.** Adopt the *interaction recipes* (hidden file-input set, download-wait); add Conxa's post-condition verification on top (file appears, value committed).

---

## Reliability scorecard (where SB earns its "gold standard")

| Family | SB strength | Adoptability into Conxa Tier 1/2 |
|---|---|---|
| **2 Timing & actionability** (EC-05/06/07/08/31) | **Excellent** — poll-loop + staged readiness + classified click ladder | **Directly, near-verbatim** |
| **4 Boundary traversal** (EC-01/02/03/04) | **Strong** — context switch + `::shadow ` chain pierce | **Adopt model; Conxa structures the chain** |
| **1 Identity drift** (EC-09 stale) | **Partial** — stale→re-find only | **Adopt stale-loop; Conxa adds multi-signal** |
| **1 Identity drift** (EC-10/11/12) | **None** — single-string fail-hard | **Reject as identity model (Conxa's whole edge)** |
| **3 Stochastic interruption** (EC-19/20) | **Primitive present** — `click_if_visible` probe | **Adopt probe as ancestor of conditional steps** |
| **5 Outcome ambiguity** (EC-25/28) | **Weak** — explicit asserts only; JS-click *creates* EC-28 | **Adopt timing gate; Conxa must add verification** |

---

## What Conxa should adopt from SeleniumBase

- **The exception-classified click fallback ladder (`base_case.py::click` 405–676) as the Tier-1/2 recovery spec.** Classify by failure *type* (stale → re-find; not-interactable → ready-state sync + re-find + wait-clickable; out-of-bounds/WebDriverException → JS→jQuery→re-find), escalate by *invasiveness* (re-find < native < JS-dispatch < protocol), each rung gated on the prior throwing, with the benign-error swallow (599–604) to avoid false failures.
- **Poll-loop + staged readiness (`present→visible→clickable`) as the universal actionability gate**, with the *exception type encoding the stage reached* — a free, deterministic recovery selector. Add the explicit bounding-box stability check SB lacks for EC-05, and `aria-disabled` awareness for EC-08.
- **`wait_for_any_of_elements_visible` (757) as the resolution primitive** — "first satisfying candidate wins" over a ranked signal set — but feed it the *compiler-emitted multi-signal* candidates automatically instead of SB's hand-enumerated list, scoring by confidence.
- **`click_if_visible` / `is_element_visible` non-raising probes (`page_actions.py` 61/41) as the literal ancestor of Conxa's conditional/optional steps** for stochastic interruptions (EC-19/20): represent dismissal as a *compile-time* probe-gated optional step, proving Family 3 needs conditional representation, not runtime LLM.
- **Proactive scroll-into-view + `readyState`/lifecycle sync (never `networkidle`), the `::shadow `-chain pierce, and deferred-assert batching** — but pair every forced/JS click with an *independent outcome post-condition* (the EC-28 verification SB structurally lacks and which its own JS-click fallback actively creates).

---

*Net: SeleniumBase is a near-complete blueprint for Conxa's zero-LLM Tier 1/2 — Families 2 and 4 are directly adoptable, Family 3's probe primitive is the conditional-step ancestor, Family 1's stale-loop is adoptable while its single-string identity is exactly what Conxa replaces, and Family 5 is the boundary Conxa must surpass with outcome verification.*
