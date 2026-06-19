# UI-TARS — Edge-Case Handling (Reverse-Engineered)

> **Framing.** UI-TARS is **vision-first, coordinate-based, VLM-in-the-loop on every step**. It perceives the page as a screenshot, asks a VLM "what next?", and the VLM emits `click(x,y)` / `type(content)` / `scroll(...)` against pixel space. There is **no DOM, no selector, no element identity, no outcome assertion**. Consequently it handles *every* edge case by the **same** mechanism — look at pixels, emit a coordinate — so it never has a per-EC strategy at all. This is simultaneously its only strength (uniform fallback for the otherwise-unreachable: canvas, closed shadow, novel UI) and its fatal weakness (worst cost / latency / determinism / auditability of anything in the corpus, and **hallucinated success** because nothing verifies the outcome).
>
> For Conxa (deterministic, zero-LLM hot path), UI-TARS is **never the hot path**. Its value is narrow and strictly at the **recovery / escalation tiers**: scaleFactor coordinate normalization (Tier 4), coordinate-click as legitimate last resort for the unreachable (Tier 4), CALL_USER as a human-handoff state (Tier 5), SoM as a *telemetry/drift* signal (not success evidence), and the operator seam as an executor pattern. **For families 1/2/4 (identity / timing / boundary) UI-TARS is STRICTLY WORSE than the deterministic repos and Conxa should adopt nothing there.**

**Live corpus cited:** `apps/ui-tars/src/main/services/runAgent.ts`, `apps/ui-tars/src/main/agent/operator.ts` (`NutJSElectronOperator`), `packages/ui-tars/sdk/src/GUIAgent.ts` (loop), `packages/ui-tars/action-parser/src/actionParser.ts` (`parseAction`, coordinate math), `apps/ui-tars/src/main/shared/setOfMarks.ts` (`setOfMarksOverlays`), `apps/ui-tars/src/main/utils/image.ts` (`markClickPosition`), `packages/ui-tars/sdk/src/base/index.ts` (`BaseOperator`).

---

## The single mechanism (how *all* ECs are "handled")

Every step, regardless of EC family, runs the identical loop (`GUIAgent.run` → `runAgent.handleData`):

```
operator.screenshot()  →  base64 JPEG + scaleFactor          (operator.ts:36-84)
  → VLM(systemPrompt + history + screenshot) → raw text
  → parseAction(): "click(start_box='[x1,y1,x2,y2]')"        (actionParser.ts)
       coords ∈ [0, factor] → /factors → [0,1]
       × screenContext(logical w/h) × scaleFactor → physical px  (actionParser.ts:226-239)
  → operator.execute({parsedPrediction, scaleFactor, factors})  (GUIAgent.ts:383-392)
  → markClickPosition(): draw SoM dot at predicted coord       (image.ts + setOfMarks.ts)
  → status: continue | END(finished) | CALL_USER | ERROR(maxLoop/env)
```

There is no branch on "is this an iframe / a shadow root / a stale node / a spinner." The model *sees* the rendered result and is expected to cope. **Detection, classification, and recovery all collapse into "the VLM looks at the next screenshot."** That is the whole story — and it is why the per-family analysis below is short on the hard families and only substantive at the recovery tier.

---

## Family 1 — Identity drift (EC-09/10/11/12/44, EC-04/04b) — **STRICTLY WORSE; adopt nothing**

- **Detection / Representation / Resolution.** There *is* no element identity. The "locator" is a transient pixel box the VLM emits this step from this screenshot. A React re-render (EC-09), a GUID class change (EC-12), an i18n copy edit (EC-10), or an A/B variant (EC-44) is invisible to UI-TARS *as a problem* — there is no recorded node to go stale, no selector to break. The model just re-perceives and re-emits coordinates.
- **Recovery.** If the click lands wrong, the VLM may notice in the next screenshot and re-click. May.
- **Reliability.** Catastrophically non-deterministic. The same page at the same state can yield different coordinates across runs (VLM sampling). No fingerprint, no multi-signal scoring, no late binding — the exact properties that make Conxa's Tier 1/2 robust to identity drift are *absent by design*.
- **Conxa applicability: NONE.** Conxa's multi-signal late-bound identity + live scoring (the inventory's family-1 deterministic answer) is strictly superior and zero-token. Coordinate re-perception is *more* fragile than a compiled selector here, not less. **Reject.**

---

## Family 2 — Timing & actionability (EC-05/06/07/08/31/32) — **STRICTLY WORSE; adopt nothing**

- **Detection.** None programmatic. No actionability gate, no "2 stable frames," no `disabled`/`aria-disabled` read, no pointer-intercept check, no `networkidle`. The VLM only knows what a JPEG shows it.
- **Resolution / Recovery.** The model has one weak timing primitive: a `wait()` action — `"Sleep for 5s and take a screenshot to check for any changes"` (`operator.ts` MANUAL ACTION_SPACES). Mid-animation (EC-05) the box is moving and the click lands wrong; against a spinner/overlay (EC-06/31) the model either clicks the overlay or burns a loop guessing. There is no deterministic stability or interactability gate — the model *guesses* readiness from pixels.
- **Reliability.** Poor and slow: every "is it ready yet?" check is a full screenshot + VLM round-trip (1–5 s), versus a deterministic DOM poll. `loopIntervalInMs` adds fixed sleeps between steps (`GUIAgent.ts:424-431`), trading latency for stability blindly.
- **Conxa applicability: NONE.** This is exactly the "dominant real-world failure class is timing, not identity" lesson — and it is the class Conxa solves *deterministically* (actionability ladder). **Reject** the VLM-as-timing-oracle approach wholesale.

---

## Family 3 — Stochastic interruption (EC-19/20/21/22/45/41/**35**) — **partial: adopt CALL_USER only**

- **EC-19/20/45 (consent banners, unexpected modals, idle interstitials).** Handled uniformly and *implicitly*: a banner that appears is just more pixels; the VLM may dismiss it, may ignore it, may misclick it. No conditional-step representation, no known-pattern dismiss library. This is **worse** than Conxa's compile-time conditional/optional steps — UI-TARS pays a full VLM step to (maybe) notice and (maybe) dismiss, non-deterministically. **Adopt nothing here.**
- **EC-22 (session-expired / auth-redirect).** No self-heal. The model sees a login screen and may try to act on it; there is no re-auth flow. Conxa's genuine re-auth self-heal is strictly better.
- **EC-21 MFA / EC-35 Captcha — the one bright spot: `CALL_USER`.** UI-TARS makes human-handoff a **first-class terminal state**, not a silent failure. The action space includes `call_user()` — *"Submit the task and call the user when the task is unsolvable, or when you need the user's help"* (`operator.ts`). The loop sets `data.status = StatusEnum.CALL_USER` and **breaks** (`GUIAgent.ts:415-417`). The renderer surfaces the pause; the browser operator even re-instantiates aware of prior CALL_USER state so the human's manual MFA/captcha solving persists into resumption (`runAgent.ts:146-152`, `getState().status === StatusEnum.CALL_USER`).
  - **Detection:** model-decided ("unsolvable / need help"). **Representation:** a status enum, not an error. **Resolution:** human acts in the live browser. **Recovery:** loop resumes with the post-human screenshot.
  - **Conxa applicability: ADOPT at Tier 5.** Captcha (EC-35) and MFA (EC-21) are correctly *stop signals*, not things to automate. Conxa should formalize an explicit "pause skill and await human" MCP response — a first-class escalation state distinct from `ERROR` — mirroring CALL_USER. This is the cleanest idea in the repo.

---

## Family 4 — Boundary traversal (EC-01/02/03/04/04b/43, EC-36) — **mostly worse; coordinate-click is the *legitimate last resort* for the truly opaque**

- **EC-01/02/03/43 (iframes, nested, cross-origin, hidden).** UI-TARS is **boundary-blind by accident**: because it never queries a DOM, a cross-origin iframe (EC-03) that defeats `querySelector` is *no harder* for it than top-level content — it's all one screenshot. This sounds like a win but is not: it forfeits Conxa's **iframe-chain invariant** (the verbatim frame chain preserved record→compile→run, page-level bbox offsets accumulated up the parent chain). UI-TARS cannot tell you *which* frame it acted in, cannot scope, cannot audit. For EC-01/02 where deterministic CDP/frameLocator traversal works, vision is **strictly worse** (slower, non-deterministic, unscoped). **Adopt nothing for 01/02/43.**
- **EC-03 cross-origin / EC-04b closed shadow / EC-36 canvas — the legitimate niche.** When the target is genuinely **opaque to the DOM** — a closed shadow root (`attachShadow({mode:'closed'})`), a `<canvas>`/WebGL surface with no DOM inside, a maximally-locked cross-origin frame — *coordinate clicking is the only option that exists*, for **any** system. Here UI-TARS's approach is not "worse"; it is the floor that every automation falls back to. Conxa's Tier-4 vision recovery must be able to do exactly this: emit a physical-pixel click at a VLM/anchor-resolved coordinate.
  - **Detection:** lower tiers (compiled selector, a11y) return "unresolvable." **Representation:** a coordinate in physical px. **Resolution:** `operator.execute(click, x, y)`. **Recovery:** none beyond re-perceive. **Reliability:** low but *non-zero where DOM reliability is exactly zero*.
  - **Conxa applicability: ADOPT narrowly at Tier 4** for EC-36 / EC-04b / locked EC-03 only — never for DOM-reachable boundaries.

---

## Family 5 — Outcome ambiguity (EC-25/26/27/28/29/23/24) — **catastrophically worse; this is the hallucination surface**

- **EC-28 silent wrong-element / EC-25 autocomplete / EC-26 custom dropdown.** UI-TARS has **no outcome verification whatsoever**. There is no `verifyAssertions()`, no post-condition, no independent check. "Done" means *the VLM emitted `finished()`* (`GUIAgent.ts:418-420`, `actionParser.ts` FINISHED → `StatusEnum.END`). Validation is purely the model looking at a screenshot and self-declaring success.
- This makes EC-28 (the most dangerous EC — action succeeds on the *wrong* element with no error) and EC-25/26 (selected the wrong typeahead option) **invisible and unrecoverable**: the model that misclicked is the same model that judges success, so it confidently reports completion. This is **hallucinated success**, the defining failure mode of vision-first automation.
- **Conxa applicability: NONE — and a hard warning.** The inventory's family-5 answer is *independent post-condition verification*, which UI-TARS structurally lacks. Conxa must keep `verifyAssertions()` as a programmatic gate and must **never** let a vision tier self-declare success. **Reject implicit outcome validation.**

---

## EC-39 — DPI / zoom / scaleFactor — **PRECISE; Conxa's Tier 4 MUST adopt this**

This is the one place UI-TARS's coordinate engineering is genuinely necessary and worth copying exactly, because **without it coordinate clicks land in the wrong place on every HiDPI display.** The full normalization chain:

1. **Capture records scaleFactor.** `NutJSElectronOperator.screenshot()` (`operator.ts:36-84`) reads `{ physicalSize, logicalSize, scaleFactor }` from the display (`scaleFactor` = devicePixelRatio; `logical = physical / scaleFactor`). It captures at **logical** size, resizes the thumbnail to **physical** size, and returns `{ base64, scaleFactor }`. So scaleFactor travels with every screenshot.
2. **VLM emits resolution-independent coords.** The model outputs box coords in a normalized `[0, factor]` space (default `factors = [1000, 1000]`; `GUIAgent.ts:391`, `actionParser.ts:94`). It never sees physical pixels — it reasons in a 0–1000 grid.
3. **Parser maps normalized → physical pixels** (`actionParser.ts:200-239`). Per axis: `parseFloat(num) / factors[i]` → `[0,1]`; then center `((x1+x2)/2) * screenContext.width * widthFactor` (rounded through the factor grid to quantize), `/ widthFactor`, finally **`* (scaleFactor ?? 1)`**. The `× scaleFactor` is the load-bearing term: it lifts a logical-space coordinate into the physical-pixel space the OS/Playwright actually clicks. (V1.5 path uses `smartResizeFactors` instead — model-version-specific, selected via `getSpByModelVersion`/`getModelVersion` in `runAgent.ts:167,191`.)
4. **Execute receives scaleFactor explicitly** (`GUIAgent.ts:383-392`: `scaleFactor: snapshot.scaleFactor, factors: this.model.factors`) so the operator never has to re-derive it.

- **Detection.** Implicit at capture (the display API reports devicePixelRatio).
- **Representation.** `screenshotContext = { size:{width,height}, scaleFactor }` rides with each conversation; `factors` rides with the model config.
- **Resolution.** The three-stage `normalized → logical → ×scaleFactor → physical` mapping above.
- **Failure mode.** Remote rendering + HiDPI combinations can still mismatch (the captured `scaleFactor` and the executing surface's DPR diverge); browser zoom is *not* devicePixelRatio and is unmodeled — a user-zoomed page silently shifts every coordinate.
- **Conxa applicability: ADOPT, precisely, at Tier 4.** Any vision recovery tier Conxa builds **must** (a) capture `scaleFactor`/devicePixelRatio at recovery time, (b) keep the VLM in a resolution-independent normalized grid, and (c) apply `× scaleFactor` as the final step before issuing the physical click. Skipping this means Tier-4 clicks land wrong on every Retina/4K/Windows-scaled machine — the single most common silent coordinate bug. Conxa's recorder should additionally persist `screenshotContext` alongside DOM events so a compiled `bbox_anchor` can be reprojected correctly at recovery time.

---

## Set-of-Marks (SoM) — **ADOPT AS TELEMETRY / DRIFT SIGNAL, NOT AS SUCCESS EVIDENCE**

After each step, `handleData` (`runAgent.ts:60-86`) calls `markClickPosition` (`image.ts`), which uses `setOfMarksOverlays` (`setOfMarks.ts`) to composite an SVG marker — a red animated ring + dot + action label — onto the screenshot at the **predicted** click coordinate (via `parseBoxToScreenCoords`, `setOfMarks.ts:52-65`). The annotated frame is stored as `screenshotBase64WithElementMarker` on `ConversationWithSoM`. For LocalComputer there is also a live on-screen marker (`showPredictionMarker`, `runAgent.ts:104-111`).

- **What SoM actually is:** a pixel-level overlay of *where the system intended to act* — independent of the DOM, cheap, and **independent of whether the click was correct**. It is **intent ground-truth, not outcome ground-truth.**
- **The trap to avoid:** SoM shows the *predicted* coordinate, not the result. UI-TARS effectively treats "I drew a marker and the VLM said finished" as success — that is the hallucination surface again. SoM must **never** be read as evidence the action worked.
- **Conxa applicability: ADOPT as telemetry.** When Conxa's vision recovery fires (Tier 4+), annotate the recovery screenshot with the SoM marker at the **resolved coordinate**, and ship it to Conxa Cloud telemetry as a **drift signal**: compare the vision-resolved coordinate against the **compiled bbox anchor** for that step. A large delta = the page reflowed / the compiled selector is stale / DPI is off — a high-value signal for re-compilation. It is a *diagnostic*, not a pass/fail gate.

---

## Operator abstraction — **ADOPT THE SEAM (executor pattern), not the loop**

`BaseOperator` (`base/index.ts:43-46`) is two methods: `screenshot()` and `execute(params)`. Four implementations share it — `NutJSElectronOperator` (OS input via NutJS), `DefaultBrowserOperator`/`RemoteBrowserOperator` (Playwright), `RemoteComputerOperator` (cloud desktop) — selected by a single `switch (settings.operator)` in `runAgent.ts:128-165`. The same VLM loop drives desktop and browser with **no loop changes**; `execute` receives a uniform `{parsedPrediction, screenWidth, screenHeight, scaleFactor, factors}` envelope (`GUIAgent.ts:383-392`).

- **Conxa applicability: ADOPT the pattern.** One `execute(action)` seam across backends is a clean model for Conxa's **tier executors**: Tier 1 (compiled selector), Tier 2 (a11y), Tier 4 (vision/coordinate) can all implement the *same* action-execution contract while differing entirely in how they *resolve* the target. This lets the recovery cascade swap resolution strategy without rewriting the act/verify layer. Note: `NutJSElectronOperator.execute` also shows a real-world platform quirk worth copying — on Windows it types via clipboard paste (`Ctrl+V`) instead of synthetic keystrokes for reliability/Unicode (`operator.ts:89-100`).

---

## UI-TARS failure modes (why it must never be Conxa's hot path)

- **Coordinate fragility at reflow / DPI / zoom.** A pixel box is valid only for the exact rendered frame it was computed from; any reflow, responsive breakpoint (EC-38), browser zoom, or DPI mismatch shifts the target and the click misses. scaleFactor fixes *device* DPI but not page zoom or remote-render DPR skew.
- **Hallucinated success / no outcome verification.** `finished()` is the only completion signal and the model judges itself. EC-28-class silent wrong actions are invisible. There is no `verifyAssertions()` equivalent anywhere in the loop.
- **No typed error taxonomy.** Failures are `ERROR` with raw JSON (`runAgent.ts:204-216`); only coarse terminal states exist — `ENVIRONMENT_ERROR`, `REACH_MAXLOOP_ERROR`, `EXECUTE_RETRY_ERROR` (`GUIAgent.ts:360-407`). No "login modal broke recovery on app v2" diagnosability.
- **Token + latency cost.** A full screenshot + VLM inference **every step** (1–5 s each); retries multiply it (`retry.model.maxRetries: 5`, `screenshot: 5`, `runAgent.ts:217-227`). A 20-step task = 20–100 s of pure VLM time and 20 image payloads. Incompatible with Conxa's Tier 1/2 zero-token invariant and enterprise economics.
- **No determinism / no audit / no replay.** Same page, different coordinates across runs; no compiled artifact, no shared knowledge between runs, no SLA-able outcome.

---

## What Conxa should adopt from UI-TARS (recovery-tier only) — and what to reject

- **ADOPT — scaleFactor normalization (EC-39), exactly, at Tier 4.** Capture devicePixelRatio at recovery; keep the VLM in a normalized grid; apply `× scaleFactor` as the final step before the physical click. Mandatory for HiDPI correctness; non-negotiable for any coordinate tier.
- **ADOPT — coordinate-click as the *last-resort* tier (EC-36 canvas, EC-04b closed shadow, locked EC-03).** Only for DOM-opaque targets, only after compiled-selector / a11y / semantic re-grounding have failed. Never in a compiled skill.
- **ADOPT — CALL_USER as a first-class Tier-5 escalation state (EC-21 MFA, EC-35 captcha).** A distinct "pause skill, await human, resume from post-human screenshot" MCP response — separate from `ERROR`. Captcha/MFA are stop signals, not automation targets.
- **ADOPT — SoM as telemetry/drift, and the operator `execute(action)` seam.** Annotate the resolved coordinate, ship it as a drift signal against the compiled bbox anchor (diagnostic, *not* success proof); reuse the single-execute-contract pattern across Conxa's tier executors.
- **REJECT — everything for families 1/2/4-DOM-reachable and all of family 5.** No vision identity (family 1), no VLM-as-timing-oracle (family 2), no vision for DOM-reachable iframes/shadow (family 4), and absolutely no implicit/self-judged outcome validation (family 5). For these, Conxa's deterministic, multi-signal, zero-token, assertion-gated path is strictly superior — keep the VLM out of the hot path entirely.
