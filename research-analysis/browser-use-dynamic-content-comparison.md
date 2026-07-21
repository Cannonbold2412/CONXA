# Browser Use vs. Conxa: Dynamic Iframes, Document Swaps, and Selector Tracking

**Scope:** How [Browser Use](https://github.com/browser-use/browser-use) (Browser Use corpus) handles dynamic iframes, `document.open()`/`document.write()` content swaps, selector/element tracking, and DOM reattachment — compared against Conxa's recorder, compiler, and runtime — with concrete recommendations.
**Trigger:** The last ~10 days of `FIX.md` entries (2026-07-15 and 2026-07-16) were dominated by exactly this class of bug: a HubSpot embedded panel that swaps its iframe's content via `document.open()`/`document.write()` instead of navigating, which broke the recorder's capture and nearly caused several follow-on regressions.
**Status:** Analysis only. No code was changed as part of this report.

---

## 1. Executive Summary (for founders / non-engineers)

Think of a web page like a house, and an iframe like a room inside it that's actually rented out to a different tenant (a different website, embedded in yours). Normally, when that tenant "moves out and a new one moves in," the house gets a clear notification — a "for rent" sign goes up, the locks change, everyone knows a change happened. Our recorder listens for that sign to know it needs to re-introduce itself to the new tenant.

HubSpot's contact-creation panel doesn't do that. It's a tenant that redecorates the room from the inside — ripping out the old furniture and putting up new furniture — without ever "moving out." No sign goes up. Our recorder kept talking to furniture that wasn't there anymore, so anything the user typed into the redecorated room went unheard. We shipped a fix for this on 2026-07-16: our recorder now watches for the redecoration itself (the specific in-page trick, not the "moved out" sign), and re-introduces itself the instant it happens.

**Browser Use**, a well-known competitor/reference project in the same "AI drives a browser" space, doesn't have this exact bug — and it's not because they solved it more cleverly. It's because their whole approach avoids needing a permanent introduction in the first place. Every single time their AI is about to do anything (click, type, decide what to do next), they throw away everything they thought they knew about the page and take a brand new, complete photograph of it — using the browser's own built-in inspection tools, not a note left in the room. A new photograph automatically shows the redecorated room, furniture and all — there's nothing to miss, because nothing is remembered from before.

The trade-off: that constant re-photographing works great for an AI agent that's deciding what to click one step at a time, live, right now. It does not work for Conxa's job, which is fundamentally different: **record a workflow once, then play it back reliably weeks or months later**, on a different machine, possibly against a page that's shifted slightly. A photograph taken once isn't enough for that — you need something more like a *description* durable enough to still find the right button after the page has been redecorated for real (a redesign, an A/B test, a new button color). That's what Conxa's multi-signal element identity system is for, and Browser Use has no equivalent of it at all — it doesn't need one, because it never has to recognize the same element again after the step it was used in.

**Bottom line:** Conxa's disease (persistent listeners going stale) and Browser Use's disease (nothing persists, so nothing can be found twice) are opposite failure modes of opposite designs, each fit for its own job. The useful thing to borrow from Browser Use isn't "stop persisting things" — it's specific, narrow techniques: *how* they discover cross-origin iframes without guessing, *how* they detect "is this the same page or a truly new one" cheaply, and *how* they tell their AI "this reference might be stale, look again" instead of silently doing the wrong thing. Sections 5 and 6 turn those into concrete, scoped recommendations for Conxa's recorder and runtime.

---

## 2. Technical Deep Dive: Browser Use's Architecture

### 2.1 The core design choice: CDP-native, stateless-per-step, no injected content scripts

Browser Use does not inject a JavaScript "bridge" script into every frame the way Conxa's recorder does (`conxa-builder/python/conxa_compile/recorder/bridge.js`). It talks directly to Chrome over the **Chrome DevTools Protocol (CDP)** using a typed wrapper called `cdp-use`. All CDP session/target bookkeeping lives in `browser_use/browser/session.py` (4,067 lines); DOM extraction lives in `browser_use/dom/service.py` (`DomService`, 1,182 lines).

The agent loop (`browser_use/agent/service.py`) works like this, every single step:

1. Ask `DomService` for a **completely fresh** DOM + accessibility-tree snapshot of the whole page (all frames).
2. Serialize it into a numbered, LLM-readable list of interactive elements (`browser_use/dom/serializer/serializer.py`).
3. Hand that + a screenshot to the LLM, get back "click element #14" or similar.
4. Execute the action via CDP (`browser_use/browser/watchdogs/default_action_watchdog.py`, 3,702 lines).
5. Throw away the entire DOM tree and selector map. Go back to step 1.

There is no cache of "the DOM as it was three steps ago," no persistent handle to a specific node that must survive across steps. `DOMSelectorMap = dict[int, EnhancedDOMTreeNode]` (`dom/views.py:913`) is rebuilt from nothing every time.

### 2.2 How iframes are captured: `DOMSnapshot.captureSnapshot(pierce=True)` + per-target recursion

For same-process iframes (the overwhelming majority — anything same-origin, and even many cross-origin ones Chrome keeps in the same renderer process), Browser Use uses one CDP call with `pierce: true`:

```python
# dom/service.py:561
params={'depth': -1, 'pierce': True}, session_id=cdp_session.session_id
```

`pierce: true` tells Chrome's own `DOMSnapshot` domain to walk straight through iframe boundaries and return the *entire* pierced document tree — main frame and every nested same-process iframe — in one shot, tagged with each node's `frameId` (`dom/service.py:819`). There is no JavaScript running inside the iframe at all for this path; Chrome's own snapshot machinery already knows how to cross that boundary because it operates below the page-script layer.

For genuinely **out-of-process iframes (OOPIFs)** — cross-origin iframes Chrome has isolated into their own renderer process/CDP `Target` — piercing doesn't reach them, so Browser Use falls back to explicit per-target recursion (`dom/service.py:920-1016`):

- It fetches the frame tree once (`Page.getFrameTree`) and matches the iframe DOM node's `frameId` against it to find the iframe's own CDP `targetId`.
- If the `frameId` is missing or not yet registered (their code explicitly calls out **dynamically-injected iframes — chat widgets, popups — where Chrome hasn't registered the frameId yet**, `dom/service.py:967-979`), it falls back to matching the iframe's `src` attribute against known frame URLs. This is the same class of "the browser hasn't told us about this frame yet" problem Conxa's `frameattached` listener + `iframe_added` MutationObserver diagnostics (`bridge.js:40-56`) exist for.
- It only bothers recursing into a cross-origin iframe if it's visible and at least 50×50px (`dom/service.py:936-957`) — a cheap cost-control heuristic against invisible ad/tracking iframes.
- It's depth-limited (`max_iframe_depth`, default 5) and count-limited (`max_iframes`, default 100) to prevent iframe-bomb pages from hanging the agent (`dom/service.py:637-642`).

Cross-origin target discovery isn't ad hoc guessing — it rides on `Target.setAutoAttach` with `flatten: true` (`browser/session_manager.py:129-131, 428`), which makes Chrome **proactively push** `Target.attachedToTarget` events for every child target (including OOPIFs) the moment Chrome creates them, instead of Browser Use having to poll or infer their existence.

### 2.3 Why `document.open()`/`document.write()` swaps just don't matter to them

This is the crux of the comparison. Conxa's bug (`FIX.md`, "Fixed typed form fields inside an iframe going completely uncaptured", 2026-07-16) existed because:

- Conxa's recorder needs to **continuously listen** for events (clicks, keystrokes) as they happen, in real time, inside every frame.
- That requires JS listeners physically attached inside each frame's `document`.
- `document.open()` discards the document's own listeners as a side effect (that's the whole point of the trick HubSpot uses) — but Playwright's `add_init_script` only re-runs on a **real navigation**, and `document.open()`/`write()` is specifically *not* a navigation. So the listeners silently vanish with nothing to re-trigger their re-installation.

Browser Use never has this problem because **it never listens continuously to begin with.** It doesn't care what happened between step N and step N+1 — it only cares what the DOM looks like *right now*, at the instant it asks. A `document.open()`/`write()` swap that happened three seconds ago is completely invisible to their listener model because they have no listener model; the next `DOMSnapshot.captureSnapshot` call simply sees whatever HTML exists in that frame at query time, redecorated or not, no different from any other DOM mutation. The bug class doesn't exist because the assumption the bug depends on (a listener that must survive) doesn't exist either.

This is not a superior solution to Conxa's problem — **it's a different problem.** Browser Use is a live *agent*, deciding what to do next based on current state; it never needs to know "what did the user type into a field 4 seconds ago" the way a recorder does. Conxa's recorder is fundamentally an event-capture system, which is a strictly harder problem than periodic-observation, precisely in the dimension that just bit Conxa.

### 2.4 Stale-reference handling: push it to the LLM, not to code

Because nothing persists across steps, Browser Use also has no "recovery cascade" comparable to Conxa's `runtime/recovery.js` L1/L2 exception ladder. When an action fails because the referenced element no longer matches reality, the code's answer is simply a better error message, pushed back up to the LLM to reason about:

```python
# default_action_watchdog.py:1055
error_detail += (
    ' If the page changed after navigation/interaction, the index '
    f'[{element_node.backend_node_id}] may be stale. Get fresh browser state before retrying.'
)
```

There is no in-process healing ladder, no signal scoring, no durability walk. The "recovery" *is* the next full agent loop iteration: re-observe everything, re-decide, try again — paid for in LLM tokens every single time, with no zero-cost tier at all.

### 2.5 Element identity: ephemeral integer index, not a durable multi-signal fingerprint

Interactive elements are assigned a throwaway integer (`highlight_index` / selector-map key = `backend_node_id`) that is only meaningful for the current step's LLM turn. `EnhancedDOMTreeNode.is_new` (`dom/views.py:226`) exists purely so the *rendered* list can mark `*` next to elements that appeared since the last snapshot (`serializer.py:713-723`) — a UX/prompt-economy nicety, not an identity mechanism.

Interestingly, where Browser Use *does* need something more durable than "this step's index" — comparing DOM state across two points in time (their `compute_stable_hash`, `dom/views.py:828-856`) — their approach converges almost exactly on Conxa's: strip dynamic CSS state classes (`focus`, `hover`, `is-*`, `has-*`, etc.), keep only static attributes, incorporate the accessibility-tree name, hash with SHA-256. Compare directly:

| | Browser Use `compute_stable_hash` | Conxa `compute_stable_hash` (`compiler/stable_hash.py:35`) |
|---|---|---|
| Dynamic class filtering | `filter_dynamic_classes()`, strips transient state classes | `_strip_dynamic_classes()`, near-identical token/prefix list (`focus`, `hover`, `is-`, `has-`, `js-`, …) |
| Static attribute allowlist | `STATIC_ATTRIBUTES` | Explicit `_SKIP_ATTRS` denylist (`class`, `style`, `tabindex`, `aria-expanded`, …) |
| Structural context | Full parent-tag chain to root (`_get_parent_branch_path`) | `parent_tag > tag` (one level) |
| Name signal | Accessibility-tree `ax_node.name` | `aria_label` → `name` → `inner_text[:80]` fallback chain |
| Hash | SHA-256, first 16 hex chars → int | Full SHA-256 hex digest |

This convergence is a useful, low-drama data point: two teams independently building browser automation for different purposes landed on the same core recipe for "what makes an element's identity durable across DOM churn." It's a validation that Conxa's `stable_hash.py` approach is sound, not a place where Browser Use is ahead — if anything, Browser Use's version is *shallower* (one level less parent context) than Conxa's, because it only needs to survive one agent step, not weeks.

But this is where the durability requirement diverges sharply: this hash is the *entirety* of Browser Use's cross-time identity — there is no fallback signal, no scoring, no `IdentityBundle` of ranked orthogonal signals, no selector grammar, because Browser Use never needs to re-find this exact element after a real page redesign, a different session, or a different day. Conxa's `IdentityBundle`/`selector_grammar.py`/`selector_score.py` stack exists precisely for the case Browser Use never encounters.

### 2.6 Watchdog event architecture (bus-based lifecycle handling)

Browser Use organizes cross-cutting browser lifecycle concerns as a set of independent "watchdog" services communicating over a `bubus` event bus (`browser/watchdog_base.py`, `browser/watchdogs/*.py`): `DOMWatchdog`, `DownloadsWatchdog`, `SecurityWatchdog`, `CrashWatchdog`, `AboutBlankWatchdog`, `PopupsWatchdog`, etc. Each watchdog subscribes only to the CDP/browser events it cares about (crash, download-will-begin, popup-opened, new-target-attached) and reacts independently — there's no monolithic "on every tick, check everything" loop. This is an architectural pattern, not an iframe-specific technique, but it's directly relevant to Conxa's current single "pump loop" thread (`recorder/session.py`), discussed in §6.

---

## 3. Side-by-Side Comparison

| Dimension | Browser Use | Conxa |
|---|---|---|
| **Fundamental job** | Live agent: observe → decide → act, one step at a time, task ends in minutes | Record once → compile → replay reliably, weeks/months later, on a different machine |
| **DOM access mechanism** | CDP `DOMSnapshot`/`Accessibility` domains, no page-side JS for the primary read path | Injected content script (`bridge.js`) running inside every frame, listening continuously |
| **State model** | Fully stateless per step — DOM tree + selector map rebuilt from scratch every action | Stateful — long-lived listeners must survive the entire recording session |
| **Iframe traversal (same-process)** | One CDP call, `pierce: true`, crosses boundaries below the page-script layer | JS `postMessage` relay chain, frame-by-frame, requires a live script in each frame (`bridge.js:120-140`) |
| **Iframe traversal (cross-origin/OOPIF)** | `Target.setAutoAttach(flatten=true)` — Chrome *pushes* new target events; explicit per-target recursion with `src`-matching fallback for not-yet-registered frames | `frameattached` Playwright event + iframe MutationObserver diagnostics; recorder-side only, no execution-time OOPIF-specific handling documented |
| **`document.open()`/`write()` swap** | Irrelevant by construction — next snapshot just sees new content | Was a real bug (FIX 2026-07-16): required patching `Document.prototype.open/write/writeln` to force synchronous in-page listener re-attachment |
| **Element identity across time** | Ephemeral integer index, valid for one step only; `compute_stable_hash` used only for step-to-step diffing (e.g. "is new") | `IdentityBundle`: multiple ranked, orthogonal, durable signals (`identity_bundle.py`) + `stable_hash.py`, designed to survive real page changes over time |
| **Failure/recovery model** | No in-process healing; error message tells the LLM to re-observe and retry — cost is a full LLM round-trip every time | Tiered recovery cascade (`recovery.js` L1/L2, zero LLM cost; escalates to LLM only at Tier 3+) |
| **Lifecycle architecture** | Event-bus watchdogs, each independently subscribed | Single-threaded polling "pump loop" (`session.py`) plus discrete Playwright event handlers |
| **Cost model** | Pays LLM tokens on effectively every "what changed" question | Zero-token Tier 1/2 recovery is a hard invariant (`CLAUDE.md` Key Invariants) |
| **Element identity durability need** | None — element only needs to resolve for the current step | Central requirement — the entire selector/recovery architecture exists because of this |

---

## 4. Strengths and Weaknesses

### Browser Use

**Strengths**
- Structurally immune to an entire bug class Conxa just spent ~10 days chasing (stale listeners, swapped documents, detached-frame races) — because it never holds a reference across time.
- CDP-native iframe piercing (`pierce: true`) is a single round trip covering the whole same-process frame tree, versus N frame-by-frame JS relay hops.
- Proactive OOPIF discovery via `setAutoAttach` avoids polling/guessing about when a new cross-origin frame exists.
- Convergent, independently-derived validation that "strip dynamic classes + static attrs + AX name + SHA-256" is the right recipe for a stability hash — same core idea as Conxa's, arrived at separately.

**Weaknesses**
- Full DOM+AX rebuild every single step is expensive — CPU on the DOM/AX walk, tokens on the LLM call, and it is a poor fit for anything that must run unattended, deterministically, and cheaply hundreds of times a day (Conxa's actual runtime workload).
- No durable, cross-session element identity at all. If you tried to reuse a Browser Use "found element" days later, there is nothing to reuse — the integer index and even the `backend_node_id` are meaningless after any reload.
- No zero-cost recovery tier — every "did the page change" question costs an LLM round trip. This directly violates Conxa's Tier 1/2-must-be-free invariant and would be an unacceptable cost regression if copied wholesale.
- Cross-origin iframe support carries a `# TODO: hacky way to disable cross origin iframes for now`-style comment in the code (`dom/service.py:926`) and is explicitly gated behind a config flag, off by default — it's not a fully solved problem for them either, just a differently-shaped compromise (skip/limit rather than "guarantee capture").

### Conxa

**Strengths**
- `IdentityBundle` + `selector_grammar.py` + `stable_hash.py` solve a genuinely harder problem Browser Use never attempts: recognize the *same logical element* after real time has passed and the page may have actually changed.
- Zero-token Tier 1/2 recovery cascade means self-healing is cheap and fast in the overwhelming majority of cases — a real cost/reliability advantage for a product that runs unattended, repeatedly, on a customer's machine.
- `frame_chain` (`compiler/build.py:416-436`) treats frame identity as a first-class, durability-scored signal chain, not an afterthought — each level of nesting gets its own fingerprint, feeding `frameLocator()` at runtime (`runtime/run.js:116-132`).
- At **execution time**, Conxa's runtime already behaves more like Browser Use than the recorder does: `frameLocator()` lazily re-resolves the live frame tree on every use, so it doesn't actually depend on a persistent injected listener the way the recorder does. This means the `document.open()`/`write()` bug class is a **recorder-specific** weakness, not a runtime-wide one (see §6.2 for the one place this isn't fully proven yet).

**Weaknesses**
- The recorder's core mechanism — a JS bridge that must stay continuously attached and listening inside every frame for the full session — is inherently more fragile than "ask fresh each time," *for exactly the class of bug it just hit*. Any future site that discards a document's listeners through some other mechanism than `open()`/`write()` (there may be others — see §7) will reproduce the same failure shape.
- Diagnosis of the last ~10 days of HubSpot-panel bugs was iterative and evidence-driven rather than architecture-driven: multiple sequential fixes (grace period 0.3s → 2s → 8s → 20s, then removing the browser-close trigger entirely) chased symptoms of "is the browser/panel done loading" before the real root cause (swap listener loss) was found. A more systematic way to distinguish "browser gone" from "page/frame busy" (§6.3) would likely have shortened that chase.
- Recorder-time iframe/OOPIF discovery relies on Playwright's `frameattached` + a MutationObserver diagnostic; there's no equivalent of Browser Use's `setAutoAttach`-driven, CDP-pushed frame discovery, meaning newly-created dynamic iframes (chat widgets, popups) are currently discovered reactively rather than guaranteed by the browser itself pushing the event first.
- No visible cost/complexity limiter analogous to `max_iframes`/`max_iframe_depth` for genuinely pathological pages (deeply nested iframe bombs, hundreds of ad iframes) in the recorder path.

---

## 5. Ideas to Adopt, Adapt, or Avoid

### Adopt
- **Nothing changes about the "recorder must persist a live listener" model — that's correct for Conxa's job.** But two narrow techniques are worth lifting directly:
  1. **`src`-URL matching fallback for not-yet-registered frames** (`dom/service.py:967-979`). Browser Use explicitly handles "the browser hasn't told us this frame's `frameId` yet" by falling back to matching the iframe element's `src` attribute. Conxa's `bridge.js:40-56` iframe-added diagnostics already *detect* this case; extending the recorder's frame-attach path with the same fallback-by-`src` matching (rather than only trusting Playwright's `frameattached` timing) would tighten the exact "dynamically-injected iframe — chat widgets, popups" gap Browser Use calls out by name, which is the same category as HubSpot's panels.
  2. **Visibility/size gating for iframe processing cost** (`dom/service.py:936-957`, `>= 50px` in both dimensions). Cheap, deterministic, and directly reusable as a recorder-side heuristic for skipping tiny/invisible iframe processing overhead without needing an LLM call to decide.

### Adapt
- **CDP-level frame lifecycle signals as a *diagnostic*, not a replacement.** Browser Use's `Target.setAutoAttach(flatten=true)` gives it a push notification the instant Chrome creates *any* new target, including OOPIFs, with no polling. Conxa doesn't need to rearchitect the recorder around raw CDP, but Playwright already exposes the underlying CDP session (`context.new_cdp_session()`); wiring a lightweight `Target.attachedToTarget`/`Page.frameNavigated` listener purely for the recorder's own trace/diagnostic log (`recorder_diag.json`) would have made several of the last 10 days' fixes (grace-period tuning, "is the browser really closed" guessing) an evidence-lookup instead of a hypothesis-then-re-record cycle. This is squarely in the spirit of what `bridge.js`'s `TRACE`-gated iframe diagnostics already do — just one layer lower, catching things a page-side script structurally cannot see (a frame that's created and destroyed inside the pierce boundary faster than the script's own `MutationObserver` tick).
- **The "stale reference" error-message pattern, applied at the runtime recovery boundary, not the agent-loop boundary.** Browser Use's `default_action_watchdog.py:1055` message ("index may be stale, get fresh browser state") is a fine idea *at the point where Conxa's cascade already escalates to an LLM* (Tier 3+ recovery, `recovery.js`) — making the escalation prompt explicitly say "this element may have moved because the containing frame's content was replaced" when a `frame_chain` re-resolution mismatch is detected, rather than relying on the LLM to infer that from bare selector-not-found errors. This doesn't touch the zero-token Tier 1/2 invariant at all; it only sharpens the eventual Tier 3+ prompt.
- **Independent per-concern watchdogs vs. one polling pump loop.** Not a full port of `bubus` — that's a large dependency and architecture change disproportionate to the actual problem — but the *shape* (each cross-cutting concern owning its own event subscription instead of one thread's tick doing frame-check + bridge-health-check + autosave-check + iframe-snapshot in sequence) is exactly the shape that made the last week's debugging hard: three unrelated background checks sharing one thread meant a hang in any one of them silently starved the others (see FIX 2026-07-16, "Widening the grace period wasn't the whole fix either"). This is discussed further in §6.3.

### Avoid
- **Do not rebuild the DOM tree from scratch on every recorder tick or every runtime step.** This is Browser Use's central technique and it is not a fix for Conxa's bug class — it's a different product's answer to a different question. Conxa's runtime already does something closer to "ask fresh" at the point that matters (`frameLocator()` per-use resolution); pushing that further into the recorder (which must not miss events between polls, unlike an agent that only cares about the current instant) would reintroduce exactly the missed-keystroke problem the fix on 2026-07-16 solved, not prevent it.
- **Do not adopt "no durable element identity, LLM re-observes every failure" as a recovery model.** It is fundamentally incompatible with the zero-token Tier 1/2 invariant (`CLAUDE.md` Key Invariants) and would materially worsen `docs/cost_model.md` unit economics for a product whose value proposition is *unattended, repeated, cheap* execution — the opposite of Browser Use's interactive, per-task LLM-driven model.
- **Do not disable/gate cross-origin iframe handling behind an opt-in flag the way Browser Use currently does** (`cross_origin_iframes: bool = False` default, `dom/service.py:50`). Conxa's product value is specifically *reliable capture of real customer workflows*, which routinely embed cross-origin widgets (payment iframes, chat widgets, HubSpot-style panels) — this is not a corner case Conxa can afford to treat as opt-in the way an experimental agent framework can.

---

## 6. Recommendations for Dynamic Iframe / Document-Replacement Reliability

These are scoped to the specific failure class the last 10 days of `FIX.md` surfaced, informed by what Browser Use does differently, without importing its stateless-per-step model wholesale.

### 6.1 Close the loop on the fix already shipped
The 2026-07-16 fix (prototype-patching `Document.prototype.open/write/writeln`) is real and tested (`conxa-builder/python/test_bridge_reinjection.py`), but its test fixture uses `srcdoc` + a `setTimeout`-triggered swap — a controlled, single-mechanism repro. Recommend a follow-up test against a **recorded real HubSpot fixture** (or a saved static replay of the actual panel HTML/JS, sanitized of any customer data) to close the gap between "the mechanism we identified is fixed" and "the actual site is fixed," especially since the live diagnostic saga in FIX.md (2026-07-16, "Widening the grace period wasn't the whole fix either") suggests there may be a *second*, still-unconfirmed freeze source independent of the swap bug.

### 6.2 Verify runtime execution-time behavior against the same swap pattern
`runtime/run.js` resolves frames via `frameLocator()` off `identity_bundle.frame_chain` (`run.js:116-132`), which — unlike the recorder's listener model — re-queries the live frame tree on each use rather than depending on a persistent script. This should mean the runtime is **already** structurally immune to the `document.open()`/`write()` bug class the recorder just fixed. That's a reasonable inference from reading the code, but it is currently untested: there is no equivalent of `test_bridge_reinjection.py` exercising the *runtime replay* path (skill execution, not recording) against a page that swaps an iframe's content via `document.open()`/`write()` between the identity bundle being built and the step executing. Recommend adding that test — it's likely to pass with no code change, which would be a valuable, cheap confirmation rather than an assumption.

### 6.3 Split the recorder's single pump loop's responsibilities so one hang can't starve the others
The current diagnostic thread (`recorder/session.py`) interleaves frame-liveness checks, bridge-health polling, autosave, and iframe snapshotting on one loop. The 2026-07-16 fix log shows this made root-causing a freeze much harder than it needed to be — three suspects sharing one symptom (the whole pump stalls) with no per-check timeout or isolation. Recommend (not a full watchdog-bus port, just the isolation idea): give each of the pump loop's distinct concerns its own timeout/failure boundary, so a hang in one (e.g. a bridge health check against a mid-churn panel) can't silently starve the others (frame-liveness, autosave). This is the one architectural lesson from Browser Use's watchdog separation that's cheap to apply narrowly.

### 6.4 Add a `src`-URL fallback for frame identification in the recorder path
Mirrors §5's "Adopt" item. When Playwright's `frameattached` timing or the recorder's own frame-chain lookup can't yet resolve a just-created dynamic iframe's identity, fall back to matching against the iframe element's `src` attribute the way `dom/service.py:967-979` does, rather than only retrying on the next tick. Low-risk, additive, and targets the same "dynamically injected iframe" category (chat widgets, popups) that both projects independently flagged as the tricky case.

### 6.5 Consider a lightweight CDP-level trace channel purely for diagnostics
Not a replacement for `bridge.js`'s in-page instrumentation — a supplement. A `context.new_cdp_session()`-based listener for `Page.frameAttached`/`Page.frameNavigated`/`Target.attachedToTarget`, writing to `recorder_diag.json` alongside the existing trace, would give ground truth about frame lifecycle timing independent of whether the in-page script itself is currently healthy — which is exactly the blind spot the last week of fixes kept running into (the script's own health check can't diagnose its own death).

### 6.6 Document the "why not stateless" reasoning explicitly
Given how naturally "just re-query everything, like Browser Use does" will keep coming up (from engineers reading competitor code, or in future incident postmortems), it's worth a short, explicit note — in `docs/TRD.md`'s recorder section or as a comment near `bridge.js`'s listener-registry — that the recorder's persistent-listener model is a deliberate consequence of needing continuous event capture, not an oversight, and that "make it stateless like Browser Use" is not a fix for this bug class, it's a different product. This report can serve as that reference if a pointer is added.

---

## 7. Risks, Trade-offs, and Implementation Considerations

- **This bug class is probably not fully closed.** `document.open()`/`write()` is *one* mechanism for a document to discard its own listeners without a real navigation firing. Other mechanisms exist in the wild (e.g., some frameworks detach and re-append the entire `<iframe>` element itself, which *does* fire a new `frameattached`/init-script cycle and should be fine — but some SPA frameworks manipulate `contentDocument` in less common ways). The current fix targets the specific mechanism found in HubSpot's panel; a genuinely different site using a different trick would reproduce a similarly-shaped bug. Section 6.5's CDP-level trace channel is the highest-leverage mitigation for *catching the next one faster*, not preventing all future variants.
- **Any move toward "ask fresh" anywhere in the recorder risks reintroducing the missed-keystroke bug**, not fixing it — this needs to be a hard constraint on future recorder changes, not just a comment. Polling, even at high frequency, structurally cannot capture events between polls the way a listener can; this is the core reason the recorder can't simply copy Browser Use's model even for the specific problem at hand.
- **Adding CDP-level diagnostics (§6.5) means running a second observation channel alongside the existing Playwright-based one.** Low risk (it's read-only, diagnostic-only, mirrors what `TRACE`-gated `bridge.js` code already does at a different layer) but it is additional surface area and another thing that can itself have bugs or overhead; scope it strictly to diagnostics, not as a second source of truth the recorder logic branches on.
- **The runtime verification in §6.2 is likely to be a "confirm and move on" task, not a "find and fix" task** — but it should still be done before treating the frame-chain/`frameLocator()` runtime path as verified-safe against this bug class, rather than merely "probably fine by design."
- **None of the recommendations in §6 require adopting Browser Use's stateless-per-step architecture, its watchdog/event-bus framework, or its LLM-driven recovery model.** They are narrow, additive techniques layered onto Conxa's existing recorder/runtime design. The larger architectural ideas (full CDP-native rewrite, bus-based watchdogs, LLM-driven re-observation as the recovery strategy) would be disproportionate, costly rewrites solving a problem Conxa's current architecture — for its actual job of durable record-once/replay-many workflows — does not have.

---

## Appendix: Key File References

**Browser Use** (Browser Use corpus)
- `browser_use/dom/service.py` — DOM/AX tree extraction, `pierce: true`, cross-origin iframe recursion (lines 32, 393-1030)
- `browser_use/dom/views.py` — `EnhancedDOMTreeNode`, `compute_stable_hash` (lines 373-911)
- `browser_use/dom/serializer/serializer.py` — LLM-facing element indexing, `is_new` diffing
- `browser_use/browser/session_manager.py` — `Target.setAutoAttach`/`attachedToTarget` handling (lines 77-131, 403-813)
- `browser_use/browser/watchdogs/default_action_watchdog.py` — action execution, stale-reference error messaging (line 1055)
- `browser_use/browser/watchdog_base.py`, `browser_use/browser/watchdogs/*.py` — event-bus watchdog pattern
- `CLAUDE.md` (Browser Use corpus) — architecture overview, CDP-use usage conventions

**Conxa**
- `conxa-builder/python/conxa_compile/recorder/bridge.js` — in-page listener registry, `Document.prototype.open/write/writeln` patch (lines 58-118), iframe relay chain (lines 120-140)
- `conxa-builder/python/conxa_compile/recorder/session.py` — pump loop, frame-attach handling, grace-period logic
- `conxa-builder/python/test_bridge_reinjection.py` — regression test for the swap fix
- `conxa-builder/python/conxa_compile/compiler/stable_hash.py` — dynamic-class-stripped stability hash
- `conxa-builder/python/conxa_compile/compiler/identity_bundle.py`, `selector_grammar.py`, `selector_score.py` — durable multi-signal identity stack
- `conxa-builder/python/conxa_compile/compiler/build.py` — `frame_chain` construction (lines 416-436), `_deduplicate_input_bindings` (line 1209)
- `runtime/run.js` — `frameLocator()` resolution off `identity_bundle.frame_chain` (lines 116-132)
- `runtime/recovery.js` — zero-token Tier 1/2 recovery cascade
- `FIX.md` / `docs/archive/fix-log/FIX-2026-07-15.md` — source incident log for this report's motivating bug
