# Recovery Patterns Catalog (Phase 7)

Every recovery pattern found across the six analyses, ranked by **effectiveness** = (reliability gain × breadth of edge cases covered) ÷ cost, with cost class made explicit. Conxa's invariant: **Tiers that cost zero LLM tokens must be exhausted before any LLM tier.** This catalog is the menu the framework (Phase 8) assembles into a cascade.

**Cost classes:** `Z` = zero-token deterministic · `H` = host-LLM (text, via MCP sampling) · `V` = host-vision · `U` = human.
**Breadth:** which of the five failure families (1 Identity · 2 Timing · 3 Stochastic · 4 Boundary · 5 Outcome) it addresses.

---

## Ranked patterns (most effective first)

### RP-01 · Late-bound re-resolution (re-query the selector every attempt) — `Z`
- **Source:** Playwright (Locator-as-string), Conxa (`withLocator`), SeleniumBase (re-find on stale).
- **Covers:** Family 1 (EC-09 detachment/re-render), partial 4. **The single highest-value pattern** — makes stale handles impossible, fixes the #1 SPA failure for free.
- **Effectiveness: ★★★★★** · **Conxa: HAS IT — keep.**

### RP-02 · Actionability gate before acting (attached→visible→**stable(RAF)**→enabled + hit-target) — `Z`
- **Source:** Playwright (`_checkElementIsStable`, `expectHitTarget`), SeleniumBase (staged readiness).
- **Covers:** Family 2 (EC-05 not-stable, EC-06 intercepted, EC-07 off-screen, EC-08 disabled, EC-31 slow), prevents a huge class before it becomes a failure.
- **Effectiveness: ★★★★★** · **Conxa: MISSING (waits `visible` only) — adopt.**

### RP-03 · Exception-classified deterministic ladder (typed failure → typed remedy) — `Z`
- **Source:** SeleniumBase (`click` ladder: stale→re-find, intercepted→JS-dispatch, OOB→re-scroll, benign→swallow).
- **Covers:** Family 1+2 (EC-06/09). Turns recovery from guesswork into a lookup table at zero cost. The crown jewel of deterministic recovery.
- **Effectiveness: ★★★★★** · **Conxa: PARTIAL (one-line intercept fallback) — adopt fully.**

### RP-04 · Multi-signal / multi-candidate resolution with live scoring + uniqueness gate — `Z`
- **Source:** Playwright (scored generator, strict-mode uniqueness), SeleniumBase (`wait_for_any_of_elements`), Conxa (compiled_selectors + recovery alternates).
- **Covers:** Family 1 (EC-10/11/12 text/layout/dynamic-id), 5 (EC-28 via uniqueness). Try ranked orthogonal signals; take the first that *uniquely* resolves.
- **Effectiveness: ★★★★★** · **Conxa: PARTIAL (tries selectors in array order, NO live scoring/uniqueness) — adopt scoring + uniqueness gate.**

### RP-05 · Independent post-condition verification ("evidence beats claim") — `Z`
- **Source:** Stagehand (independent ARIA probe, errorTaxonomy), WebArena/WorkArena (functional success).
- **Covers:** Family 5 (EC-28 silent wrong-action, EC-25/26 outcome ambiguity). Not a *recovery* per se — it's the **detector that turns silent failures loud** and the **gate that validates every repair**. Without it, all other recovery can "succeed" incorrectly.
- **Effectiveness: ★★★★★** · **Conxa: MISSING (`verifyAssertions()` unwired) — adopt; this is the trust spine.**

### RP-06 · Invasiveness escalation (native → JS-dispatch → protocol/CDP) — `Z`
- **Source:** SeleniumBase (native→JS→jQuery), Conxa (`clickFirst` last() retry), CDP path.
- **Covers:** Family 2 (EC-06 intercepted/overlay). Each rung bypasses more page logic; try least-invasive first. **Caveat:** forced clicks can succeed on the wrong/hidden node → **must pair with RP-05**.
- **Effectiveness: ★★★★☆** · **Conxa: PARTIAL — adopt the ladder, gate with RP-05.**

### RP-07 · Re-hover-then-retry (re-establish hover precondition) — `Z`
- **Source:** SeleniumBase (`hover_and_click` atomicity), recommended for Conxa.
- **Covers:** Family 2/3 (EC-15/16 hover menus). Converts the common "menu closed" false-failure into automatic recovery.
- **Effectiveness: ★★★★☆** · **Conxa: MISSING — adopt (hover deep-dive §5.3).**

### RP-08 · Scroll-until-found (virtualization/lazy) — `Z`
- **Source:** recommended (Playwright primitives + a loop); browser-use re-perceives instead.
- **Covers:** Family 1/2 (EC-13 virtualized, EC-14 lazy). Resolve container, re-query by stable identity, scroll, repeat (bounded).
- **Effectiveness: ★★★★☆** · **Conxa: MISSING — adopt (dynamic-ui deep-dive §4.2).**

### RP-09 · Accessibility-tree fallback (role + name) — `Z`
- **Source:** Playwright (role engine, pierces shadow), Conxa (`recoverWithA11y`), browser-use (AX serialization).
- **Covers:** Family 1/4 (EC-10/12 identity, EC-04 open shadow, EC-37 icon-only). Durable semantic signal; also reaches into shadow/closed via CDP AX.
- **Effectiveness: ★★★★☆** · **Conxa: HAS IT (Tier 2) — keep, order ahead of structural CSS (C.1 fix).**

### RP-10 · Frame re-resolution (multi-signal frame identity + CDP frame-tree) — `Z`
- **Source:** Playwright (`frameLocator`, late-bound), Conxa (`rootCandidates`), recommended hardening.
- **Covers:** Family 4 (EC-01/02/03/43). Re-enter the frame chain each action; recover a drifted frame by src/title/CDP enumeration.
- **Effectiveness: ★★★★☆** · **Conxa: HAS the traversal — add frame-level recovery (iframe deep-dive §5.3).**

### RP-11 · Post-navigation stale-DOM guard (abort-on-change) — `Z`
- **Source:** browser-use (`multi_act` terminates_sequence + URL/focus diff).
- **Covers:** Family 1/2 (EC-09/34). Never act on a transitioning DOM after an unexpected navigation; wait for the new view's anchor.
- **Effectiveness: ★★★★☆** · **Conxa: PARTIAL (nav-aware pacing) — adopt the runtime diff guard.**

### RP-12 · Ready-state / framework settle — `Z`
- **Source:** SeleniumBase (`wait_for_ready_state_complete`, `wait_for_angularjs`), Conxa (domcontentloaded + observer pause).
- **Covers:** Family 2 (EC-31). Settle before next action. **Avoid `networkidle` for SPAs** (never fires). Prefer waiting on the *target element*.
- **Effectiveness: ★★★☆☆** · **Conxa: HAS the safe default — keep; don't add networkidle dependence.**

### RP-13 · Dialog/dismiss-known-pattern for stochastic states — `Z`
- **Source:** Conxa (`recoverWithDialogScope`), SeleniumBase (`click_if_visible`), recommended conditional steps.
- **Covers:** Family 3 (EC-19 banners, EC-20 modals, EC-45 idle). Detect-and-dismiss known interruption patterns deterministically; promote to compiled conditional steps.
- **Effectiveness: ★★★★☆** (for the high-frequency EC-19/20) · **Conxa: PARTIAL (dialog-scope on click) — adopt conditional `if_present`/`try_dismiss`.**

### RP-14 · Cache-replay + self-heal-as-refresh (drift-detect → re-ground → refresh) — `Z` warm / `H` on drift
- **Source:** Stagehand (`ActCache`, `haveActionsChanged`/refresh).
- **Covers:** Family 1 (EC-09/12). Conxa's compiled package *is* the cache; the adoptable parts are **drift detection** and **re-ground-then-persist** — but Conxa's persist goes to **Cloud re-sign**, not local mutation.
- **Effectiveness: ★★★★☆** · **Conxa: compiled replay HAS the warm path — add drift detection + Cloud write-back.**

### RP-15 · Stall/loop fingerprint cap (bound retries) — `Z`
- **Source:** browser-use (`PageFingerprint` = url+count+DOM-hash).
- **Covers:** all families (safety). Hard-cap recovery attempts so a self-healing loop can't thrash on a stagnant page.
- **Effectiveness: ★★★☆☆** (essential guardrail) · **Conxa: HAS retry budget — add fingerprint-based cap.**

### RP-16 · Auth re-authentication self-heal — `Z` (+ `U` for the login)
- **Source:** Conxa (`isAuthFailure` → `captureReAuth` → rebuild context → resume).
- **Covers:** Family 3 (EC-22 session expired). Genuine, production-grade, already built.
- **Effectiveness: ★★★★☆** · **Conxa: HAS IT — keep; generalize the handoff pattern.**

### RP-17 · Host semantic re-grounding (describe-then-match) — `H`
- **Source:** SeeAct (describe-then-ground), browser-use (AX re-ground), host model via MCP sampling.
- **Covers:** Family 1/5 (EC-09/10/12/28) when all `Z` tiers fail. LLM emits a *description*; deterministic matcher resolves it against the live AX tree + recorded fingerprint.
- **Effectiveness: ★★★★☆ (but `H` cost)** · **Conxa: today host-DELEGATED (manual); make autonomous (Tier 3).**

### RP-18 · Vision re-grounding + coordinate (scaleFactor-normalized) — `V`
- **Source:** UI-TARS (predictionParsed, scaleFactor, SoM), OS-ATLAS (grounder).
- **Covers:** Family 4/5 where DOM is unavailable (EC-04b closed shadow, EC-36 canvas). Ground → bbox → re-derive a DOM selector → prefer it over raw pixels → verify.
- **Effectiveness: ★★★☆☆ (rare, `V` cost)** · **Conxa: today passive payload — make a bounded Tier 4.**

### RP-19 · Human handoff / CALL_USER (first-class escalation state) — `U`
- **Source:** UI-TARS (CALL_USER), Conxa (re-auth window).
- **Covers:** Family 3/5 (EC-21 MFA, EC-35 captcha, irreversible/sensitive steps). Rule-triggered (destructive) and exhaustion-triggered.
- **Effectiveness: ★★★★☆ (correctness over automation)** · **Conxa: ad-hoc payload — make a structured Tier 5.**

### RP-20 · Reflection-in-output (assess-previous-before-next) — `H`
- **Source:** browser-use (`evaluation_previous_goal`).
- **Covers:** reduces cascading error in `H` tiers. Belief, not truth — **pair with RP-05**.
- **Effectiveness: ★★★☆☆** · **Conxa: add to Tier-3 prompt.**

---

## Effectiveness vs cost — the decisive view

| Tier band | Patterns | Cost | Share of failures it should catch |
|---|---|---|---|
| **Prevention** (gates) | RP-02, RP-12 | `Z` | Large slice of Family 2 *before* it fails |
| **Deterministic recovery** | RP-01,03,04,06,07,08,09,10,11,13,14(warm),16 | `Z` | The **majority** of Families 1, 2, 4 + high-freq 3 |
| **Verification** (cross-cutting) | RP-05 (+RP-15 cap) | `Z` | All of Family 5; gates every repair |
| **LLM recovery** | RP-17, RP-20 | `H` | Residual Family 1/5 |
| **Vision recovery** | RP-18 | `V` | Rare Family 4 (DOM-opaque) |
| **Human** | RP-19 | `U` | Family 3 unsolvables + sensitive |

**The thesis, proven by the catalog:** **17 of the 20 recovery patterns are zero-token (`Z`).** Only 3 require an LLM/vision/human tier, and those are for the genuine residual (DOM truly unavailable, semantics truly changed, human truly required). **A deterministic-first cascade can catch the overwhelming majority of real-world edge-case failures before any token is spent** — which is exactly Conxa's bet, now backed by the best-in-class evidence.

**Conxa's gaps, in priority order:** RP-05 (verification — *missing, highest priority*), RP-02 (stability gate — missing), RP-04 (live scoring/uniqueness — partial), RP-03 (full classified ladder — partial), RP-08/RP-07 (scroll-until-found / re-hover — missing), RP-11/RP-13 (stale-DOM guard / conditional dismiss — partial), RP-17 (make recovery autonomous — currently manual). These become the framework (Phase 8) and the top-50 (Phase 10).
