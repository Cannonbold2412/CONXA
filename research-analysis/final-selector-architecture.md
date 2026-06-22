# Final Selector Architecture (Phase 3) — Production Standard

**The question:** how should Conxa identify elements so replay survives real-world DOM change while staying deterministic, zero-token, observable, secure, and self-improving across a fleet?

**The answer, in one line:** compile a signed **IdentityBundle** of *engine-orthogonal* signals expressed in **Playwright's native selector grammar**, ranked by a durability score that fuses Playwright's empirically-correct cost model with **fleet-learned survival priors**; filter every non-deterministic, injectable, or PII-bearing signal before it ships; and resolve at runtime with a **pure, untrusted-DOM-safe matcher** that scores live candidates against a dynamic-class-stripped identity hash behind a strict uniqueness gate — emitting a drift signal on every resolution so identity gets *more* durable over time.

This document supersedes the v1 selector design. It keeps v1's three correct load-bearing ideas — orthogonality over count, durability-first ordering (the C.1 fix), and the runtime uniqueness gate — and upgrades everything else to production standard across reliability, scalability, self-healing, recovery, memory, observability, security, evaluation, and maintainability. Every adopted mechanism is cited to its source; §13 lists every v1 decision that was challenged and what replaced it.

---

## 1. Design law & the failure model

Identity is the load-bearing primitive of the whole replay guarantee: verification (Phase 5) and recovery (Phase 6) are worthless if the runtime acted on the wrong node. The selector subsystem therefore obeys five non-negotiable laws:

1. **Identity is a serializable description re-resolved every attempt — never a node handle.** (Playwright `locator.ts:42-48`: a Locator holds only `{_selector, _frame}`; every action re-sends the string. Adopt verbatim.)
2. **Nothing the LLM produces is load-bearing without a deterministic verifier.** The LLM enriches; a deterministic uniqueness gate against the recorded DOM admits or drops it.
3. **The live DOM is untrusted.** The matcher treats page-supplied strings as hostile (injection, clobbering, spoofing) — §10.
4. **Every resolution emits a drift signal.** Identity is not static data; it is a fleet-learned distribution — §8/§9.
5. **The hot path is zero-token and pure.** Resolution is arithmetic over the live DOM; the LLM appears only at the recovery edge, across a process seam.

The five failure families identity must defeat (`edge-case-inventory.md` §"five families"): **identity drift** (EC-09/10/11/12/44 — the node changed/moved/was replaced), **boundary** (EC-01..04 — it's in another tree), and the silent-wrong-element trap (EC-28 — a uniquely-matching but *wrong* node). Families 2/3/5 are owned by gates, conditionals, and verification; identity owns 1, 4, and the EC-28 half of 5.

---

## 2. The IdentityBundle — the compiled identity object

Identity compiles to an `IdentityBundle` per step (the `ElementFingerprint` successor, per `future-compiler-architecture.md` §3):

```jsonc
IdentityBundle {
  signals: [                          // engine-orthogonal, durability-ordered
    { engine: "role",   selector: "internal:role=button[name=\"New Incident\"]",
      durability: 0.95, orthogonality_class: "semantic-aria",
      unique_at_compile: true, source: "deterministic" },
    { engine: "testid", selector: "internal:testid=[data-testid=\"btn-new-incident\"]",
      durability: 0.88, orthogonality_class: "test-contract", unique_at_compile: true },
    { engine: "text",   selector: "internal:text=\"New Incident\"",
      durability: 0.80, orthogonality_class: "visible-text", unique_at_compile: true },
    { engine: "relational", selector: "internal:role=button >> right-of=internal:role=heading[name=\"Incidents\"]",
      durability: 0.72, orthogonality_class: "spatial-anchor", unique_at_compile: true },
    { engine: "css",    selector: "header .actions > button.primary",
      durability: 0.40, orthogonality_class: "structural", unique_at_compile: true }
    // xpath only if no other admissible signal AND target not in shadow; always last
  ],
  stable_hash: "sha256:…",            // dynamic-class-stripped identity hash (§6.2)
  frame_chain: [ … ],                 // encoded in-grammar via internal:control=enter-frame
  shadow_path: [ { host:"x-incident-form", mode:"open" } ],
  compat_fingerprint: "sha256:…",     // app-version drift detector (insight #19)
  guid_like_attrs: ["id"],            // attributes de-ranked/forbidden (§4)
  destructive: false                  // raises the agreement bar at resolve (§10)
}
```

**Decision (challenged & changed): adopt Playwright's native internal selector grammar verbatim — do not invent a parallel selector language.** The runtime executes through Playwright locators, so the grammar (`>>` part separator, `internal:role=` / `internal:testid=` / `internal:text=` / `internal:label=` / `internal:attr=` engine prefixes, `internal:control=enter-frame` frame delimiter, relational `left-of`/`right-of`/`above`/`below`/`near` engines, `nth=`, `visible=`) *is* the execution substrate (`selectorParser.ts:154-229`, `locator.ts:51-460`). Compiling to it eliminates an entire translation layer and the drift bugs it breeds, encodes the frame chain in-string (honoring the verbatim-iframe invariant), inherits open-shadow piercing for free, and offloads parser/evaluator maintenance to Playwright. v1 spoke of abstract "engines" but never committed to the grammar; committing is a correctness *and* maintainability win.

---

## 3. Generation — deterministic floor first, LLM enrichment second

v1 said "deterministic floor + LLM naming." Production-grade requires the exact mechanisms.

**3.1 Candidate-set construction (compile, against the recorded DOM snapshot).** Identify the interactive target and its admissible signals using browser-use's `ClickableElementDetector` cascade (`clickable_elements.py:41-244`), notably ordered with **`has_js_click_listener` first** (catches React/Vue/Angular handler-only elements that tag/role heuristics miss), then iframe>100×100, label-wrapping, AX-property gating (`disabled`/`hidden` override to non-interactive), the interactive tag/attr/role sets, icon-sized heuristics, and `cursor:pointer` as the final fallback. This is the proven recipe for *what counts as the target* and *which attributes are identity-bearing*.

**3.2 Deterministic generator floor (zero-LLM, always present).** Port Playwright's `selectorGenerator` (`selectorGenerator.ts`) as a compile pass over the recorded DOM:
- Build orthogonal candidates (`buildNoTextCandidates`/`buildTextCandidates`, `:233-381`), retargeting a clicked non-form node up to its interactive ancestor (`:99-104`).
- Apply the **exact cost model** (`:37-68`, lower = better): `testid=1`, `role+name=100`, `placeholder=120`, `label=140`, `alt=160`, `text=180`, `title=200`, `text-regex=250`, `css#id=500`, `role-without-name=510`, `css-input-type=520`, `css-tag=530`, `nth=10000`, `css-path-fallback=1e7` (exact-match variants +5). `combineScores` weights earlier tokens more (`:487-492`); never generate `nth≥6` (`:189-192`).
- **Uniqueness-at-compile gate:** admit a candidate only if it matches **exactly one** node in the recorded DOM (`:173-186`). A signal ambiguous in Studio is ambiguous-and-dangerous in production (EC-28) — drop it.

The floor guarantees identity even if the LLM is unavailable, and it cuts compile cost: the LLM is invoked **only when the floor leaves residual uncertainty** (`future-compiler-architecture.md` §5), driving 4–5 calls/step toward <1 amortized (the scalability win, §11).

**3.3 LLM enrichment (additive, verified).** The LLM contributes only what mining cannot: an accurate **accessible name**, **anchor phrases** for the relational engine, and intent disambiguation. Every enriched signal re-runs the uniqueness-at-compile gate against the recorded DOM; signals that fail are dropped, not trusted (SeeAct's 30%-hallucination lesson — `papers/SeeAct` Finding 3).

**3.4 Orthogonality guarantee (≥2, by construction).** Compile **fails** if a non-marker step cannot produce ≥2 signals of *different `orthogonality_class`* (semantic-aria / test-contract / visible-text / spatial-anchor / structural). This makes "one DOM change cannot break all signals" a structural invariant, not a hope (`future-compiler-architecture.md` §3). v1 asserted orthogonality; this *enforces* it at compile.

**3.5 Relational/anchor identity promoted to a first-class engine.** v1 buried "anchors" in recovery. Mind2Web proves relational identity survives layout change (`papers/Mind2Web` Finding 1), and Playwright ships the engines natively (`right-of`/`left-of`/`above`/`below`/`near` — `selectorParser.ts:23-24`). Emit a relational signal (`target >> right-of=anchor`) whenever a stable labeled neighbor exists. It is orthogonal to both text and structure and is the single best rescue for copy-edited or restyled targets (EC-10/11).

---

## 4. Ranking — durability-first, with fleet-learned priors

v1 ranked by a static heuristic. Production-grade fuses two terms:

```
durability(signal) = base_durability(engine)              // Playwright cost model, inverted+normalized
                   × survival_prior(engine, site, framework)  // FLEET-LEARNED (§9), Bayesian, default 1.0
                   × stability_adjustments(guid_like, position, testid_present)
```

- **base_durability** is the inverted, normalized Playwright cost-model rank (testid/role+name/text high; css/xpath low). This is the empirically-correct ordering Playwright already encodes (`selectorGenerator.ts:37-68`) and Mind2Web independently confirms (semantic > structural across site updates).
- **survival_prior** is the upgrade: the *measured* survival rate of each engine on *this site/framework*, aggregated across the fleet (§9). On an Ember app where `id` is GUID-like, the `css#id` prior collapses; on a site with a disciplined `data-testid` contract, the testid prior rises above role+name. **Durability stops being a fixed heuristic and becomes an empirical, per-site, continuously-improving distribution** — the memory dimension, and structurally uncopyable (only Conxa has fleet telemetry over a shared signed artifact).
- **stability_adjustments** apply the exact `isGuidLike` penalty (`selectorGenerator.ts:494-521`: transition-density ≥ len/4 ⇒ unstable; excluded from `css#id`), a dynamic-content position penalty, and a testid-present bonus.

Signals ship in descending `durability`. Because both Tier-1 and Tier-2 resolution are zero-token, the tie-break is **success probability, not microseconds** — the explicit correction of v1's cost-first contradiction (audit C.1).

---

## 5. Filtering — what never generates and what never reaches runtime

Filtering is where determinism *and security* are won. The compiler discards, so the runtime never attempts:

**Never generate (non-deterministic):** GUID-like ids/hashed classes (`isGuidLike`, EC-12); `nth-of-type`/positional on dynamic content (EC-11/13); absolute XPath; **XPath for any shadow-encapsulated target** — XPath uses `document.evaluate` and cannot cross shadow boundaries (`xpathSelectorEngine.ts:19-34`), so it is a guaranteed failure on LWC/Salesforce (hard rule, top-50 #17); in-page `contentDocument` frame traversal (dies cross-origin, EC-03).

**Never ship (filtered even if generated):**
- Any signal not **unique at compile** (§3.2).
- Redundant same-orthogonality-class signals (keep the best per class).
- **PII-bearing literals (security).** Recorded text/attribute values may contain user names, emails, account numbers. A signal that bakes a literal PII value cannot ship in a fleet-distributed pack. The compiler scrubs such values and **binds dynamic values to skill inputs** (`{{var}}`) instead of embedding literals — identity must be person-independent.
- **Un-escapable / injectable values (security).** Recorded attribute/text used to build a selector is escaped (`CSS.escape`, XPath string-literal quoting). A value containing selector metacharacters that cannot be safely escaped is rejected rather than shipped — preventing a crafted page value from breaking out of the selector grammar (§10).

The signal set, once filtered, is **signed as part of the pack** (Phase 8) — it cannot be tampered in transit; the matcher trusts the *signals* and distrusts the *DOM*.

---

## 6. Runtime resolution — the matcher as a pure function

Resolution is a single **pure, side-effect-free, zero-LLM function** — the keystone of maintainability and testability (`future-runtime-architecture.md` §1, the `Resolver` module):

```
resolve(IdentityBundle, liveDOM) → { node | MISS | AMBIGUOUS, score, margin, signal_used, evidence }
```

**6.1 Algorithm.**
```
root = enter_context(bundle.frame_chain, bundle.shadow_path)     // §7, late-bound every attempt
for signal in bundle.signals (durability order):                  // semantic → structural
    candidates = root.query(signal.selector)                      // strict=true (Playwright)
    if candidates.length == 0: continue                            // miss → next signal
    if candidates.length == 1:
        if score(candidates[0], bundle) ≥ threshold: return USE
        else: record_low_confidence(); continue
    // candidates.length > 1 → STRICT UNIQUENESS GATE (the EC-28 guard)
    best = tie_break_by_stable_hash(candidates, bundle.stable_hash)  // §6.2
    if best.margin ≥ UNIQUE_MARGIN: return USE
    else: continue                                                  // never pick [0]; try next signal
return MISS                                                         // all miss/ambiguous → recovery
```

**6.2 Scoring & tie-break — `compute_stable_hash`, not hand-waving.** v1 tie-broke by vague "fingerprint+anchors." Production uses browser-use's **dynamic-class-stripped stable identity hash** (`views.py:828-887`, `139-184`): a hash of the parent-branch tag path + sorted static attributes + AX name, with focus/hover/active/animation classes stripped for cross-session stability. The recorded target's `stable_hash` ships in the bundle; at resolve, multi-match is broken by **which candidate's live stable_hash matches the recorded one** — a principled, deterministic tie-break that also detects "resolved a different identical-looking node." `score()` additionally rewards role/name/testid agreement and penalizes `guid_like` attributes (`scoreCandidate`, `future-runtime-architecture.md` §2), versioned with the compiler so compile and replay agree.

**6.3 The uniqueness gate is strict-mode, exactly.** A signal resolving >1 node is never used by silently taking `[0]` — Playwright's strict mode (`injectedScript.ts:277-283`) throws on >1 and even lists disambiguating selectors; Conxa adopts the same default and treats ambiguity as "try the next orthogonal signal, then escalate," never "guess." This is the cheapest deterministic defense against EC-28 from the resolution side.

**6.4 Bounded (scalability).** Scoring is O(signals × candidates), both bounded: stop at the first unique high-confidence semantic signal (short-circuit); cap candidate scoring to top-K by a cheap pre-score on large pages. No blind page traversal in the hot path.

---

## 7. Boundary-aware identity (frames & shadow)

Boundary context lives **in identity, never ambient** (the SeleniumBase-statefulness fix — `iframe-architecture.md` §2):

- **Frames:** the chain is encoded in-grammar via `internal:control=enter-frame` (`locator.ts:421-460`; split by `splitSelectorByFrame`, `selectorParser.ts:94-121`), re-entered late-bound every attempt via `rootCandidates`/`frameLocator`, CDP-based so cross-origin works (EC-03). Each level carries a multi-signal **FrameFingerprint** (src_pattern/name/title/role, durability-ordered) so a drifted frame `id` doesn't break the chain (`iframe-architecture.md` §5.1). `frame_enter`/`frame_exit` carry `no_recovery_block`.
- **Shadow:** open roots pierce by default (`selectorEvaluator.ts:357-373`, CSS/role/text engines `pierceShadow:true`); the compiler records the **shadow host-path**, marks open/closed, **forbids XPath** for shadow targets, and scopes identity through the host chain for repeated components (uniqueness, EC-28). Closed roots route to a bounded escape hatch: AX role+name → CDP `pierce:true` → vision Tier-4 (`shadow-dom-architecture.md` §5.4).
- **Verification is boundary-aware:** post-conditions read inside the same frame/shadow chain, never the top document (else false pass/fail).

---

## 8. Self-healing & recovery intelligence

Identity is the input and output of recovery:

- **Miss → cascade.** A MISS/AMBIGUOUS result enters the zero-token cascade (next orthogonal signal → a11y role+name re-probe → relational/anchor re-find → frame/shadow re-resolution → scroll-until-found), all reusing the same pure matcher (`final-recovery-architecture.md` Layers 1–2).
- **Describe-then-match, never describe-then-select (Tier 3).** When all zero-token signals miss, the host (via MCP sampling) emits a *description* `{action, target_description}`, and the **deterministic matcher** resolves it against the live AX tree *jointly with the recorded IdentityBundle + stable_hash* (SeeAct: never ask the model for a selector — 30% hallucinate; `papers/SeeAct` Finding 1/3). The recorded identity is the anchor browser-use lacks (it heals from a blank task; Conxa heals *toward* a known target).
- **Drift detection = action-diff (Stagehand).** A resolution that succeeds via a *lower-durability* signal than recorded, or whose resolved node's stable_hash differs from the recorded one, is drift — detected exactly as Stagehand's `haveActionsChanged` diffs re-grounded vs cached actions (`ActCache.ts:287-325`). This is the EC-28/skill-rot detector.
- **Write-back, never local mutation.** A verified above-Tier-1 resolution emits a `repair_event` (recorded signal → healed signal, post-condition result, app-version fingerprint), used **ephemerally for the run** and shipped to Cloud for validate-and-re-sign (insight #11). The signed local bundle is never silently rewritten — the discipline Stagehand's mutable cache cannot claim.

---

## 9. Memory — the empirical durability flywheel (the moat applied to identity)

This is the largest upgrade over v1 and over every tool in the corpus. Every resolution emits which engine resolved, its score, margin, and whether it was the recorded primary or a fallback. Aggregated across the fleet over a shared signed artifact, this yields, per (site, framework, engine), a **measured survival curve** — the empirical probability that a signal of that engine still uniquely resolves N days after compile.

These curves feed back as the `survival_prior` term in §4, so:
1. **Compile-time ranking becomes site-specific and self-correcting** — the durability order is *learned*, not asserted. (Ember GUID-ids get demoted automatically; a strong testid contract gets promoted.)
2. **Drift is detected fleet-wide on first occurrence** — when one runtime's primary signal degrades on site X, Cloud re-signs a healed bundle and pushes it to all customers *before they hit the failure* (the flywheel, insight #1).
3. **Identity gets more durable the more it is used** — a compounding asset no single-tenant or local tool (Playwright/SeleniumBase/Stagehand/browser-use) can build, because none distributes one identity to many runtimes with centralized telemetry.

Memory is also *local*: the runtime caches the last-known-good resolution per step (Stagehand cache-replay shape, `ActCache.ts`) to short-circuit resolution on the warm path, while the durable fix always flows through Cloud re-sign.

---

## 10. Security — the matcher trusts signals, distrusts the DOM

The live DOM is attacker-controllable (a compromised or hostile page). Production identity must defend:

- **Selector injection:** all recorded values are escaped when building selectors (`CSS.escape`, XPath literal quoting); un-escapable values are rejected at compile (§5). A page value cannot break out of the selector grammar.
- **DOM clobbering / attribute spoofing:** a page can inject an element bearing the recorded `id`/`name`/`role` to hijack resolution — especially dangerous on a destructive step. Defense: the **uniqueness gate** rejects the resulting ambiguity, and **destructive steps require multi-signal orthogonal agreement + stable_hash match** before acting (`bundle.destructive` raises the bar). A single spoofed signal cannot redirect a pay/delete/submit.
- **PII isolation:** literal PII never ships in a fleet-distributed signal (§5) — identity is bound to inputs, person-independent.
- **Supply-chain integrity:** the IdentityBundle is signed in the pack (Phase 8); the matcher trusts the signed signals and re-derives everything else from the (untrusted) live DOM. A healed signal re-enters the fleet only via Cloud re-sign, never local mutation.
- **Sandboxed evaluation:** resolution is pure DOM querying — no `eval` of page-provided strings, no in-page code execution from recorded data.

---

## 11. Scalability & maintainability

**Scalability.**
- *Compile cost:* deterministic-first gating (§3.2) invokes the LLM only on residual uncertainty, cutting 4–5 calls/step toward <1 amortized (`future-compiler-architecture.md` §5) — the dominant compile-cost lever.
- *Runtime cost:* bounded scoring + semantic short-circuit (§6.4); large-page recovery context is **rank-and-capped, never blind-truncated**, always including the recorded target and (Stagehand's lesson) the final-state AX tree so the target is never starved out (`rubricVerifier.ts:175-182`).
- *Fleet:* identity scales by *distribution* — one compiled bundle serves N customers; telemetry scales the durability priors sublinearly with skill count.

**Maintainability.**
- The matcher is a **pure function** (`resolve()`), unit-testable in isolation with no browser, no LLM, no I/O — the single most important maintainability property.
- **No parallel selector language** — Playwright's grammar is reused verbatim (§2); the parser/evaluator are upstream-maintained.
- **Schema-versioned IdentityBundle** with `scoreCandidate` versioned alongside the compiler so compile and replay never disagree; forward/backward-compatible for delta-sync + rollback.

---

## 12. Observability & evaluation

**Observability.** Every resolution emits a structured record (`future-runtime-architecture.md` §5/§6): `{signal_used, score, margin, unique, tier, stable_hash_match, latency, drift_hint}`. Drift hints (a durable signal stopped being unique; stable_hash diverged; position drift) are the raw input to fleet breakage detection (G3/G7). This makes identity *auditable* — a regulator gets "what resolved, why, with what margin," not "the model usually picks the right one" (insight #22).

**Evaluation (production gate).** Identity is validated before release on:
1. **Mutation testing of orthogonality** — deliberately mutate the recorded DOM (rename ids, edit copy, reorder, restyle) and assert ≥1 orthogonal signal still uniquely resolves. This directly measures the §3.4 guarantee.
2. **Version-pinned regression environments** (WebArena/WorkArena lesson, insight #14) — replay bundles against pinned app versions; reproducible resolution-success metrics, not live-site luck.
3. **Calibration** — assert the `score`/`durability` correlates with actual resolution correctness on the regression corpus; recalibrate weights when it drifts.
4. **Per-engine survival curves** from §9 validate the durability ordering *empirically*, closing the loop between asserted and measured durability.

---

## 13. Decisions challenged & changed (v1 → production)

| v1 decision | Challenge | Production decision |
|---|---|---|
| Abstract "5 engines" | Doesn't commit to an execution substrate; invites a translation layer | **Compile to Playwright's native grammar verbatim** — zero translation, frame-chain in-string, free shadow piercing (§2) |
| Anchors are a recovery afterthought | Mind2Web proves relational identity survives layout change; Playwright ships the engines | **Relational/anchor promoted to a first-class generated engine** (§3.5) |
| Static heuristic durability score | A fixed heuristic can't know that `id` is GUID-like *on this site* | **Fleet-learned `survival_prior` per (site, framework, engine)** — durability becomes empirical and self-correcting (§4/§9) |
| Tie-break by "fingerprint+anchors" | Under-specified; not deterministic | **`compute_stable_hash` (dynamic-class-stripped) tie-break** — principled, also detects wrong-identical-node (§6.2) |
| "Filter non-deterministic selectors" | Silent on injection, PII, DOM-clobbering | **Security-hardened filtering**: escaping, PII-binding, spoofing defense, signed set (§5/§10) |
| Orthogonality as an assertion | Hope, not guarantee | **Compile fails without ≥2 orthogonality classes** (§3.4) |
| Candidate set unspecified | What counts as the target/identity-bearing? | **browser-use `ClickableElementDetector` cascade**, `has_js_click_listener` first (§3.1) |
| No memory/observability/eval | Not production-grade | **Empirical durability flywheel, per-resolution telemetry, mutation+regression+calibration eval** (§9/§12) |

---

## 14. What this beats

- **Playwright codegen:** emits *one* selector, discards the ranked candidate list after codegen, no runtime re-scoring, no fleet learning (`playwright-edge-cases.md` "the single most important thing Conxa must *not* replicate"). Conxa ships the orthogonal scored set *and* re-scores live *and* learns durability across a fleet.
- **SeleniumBase:** robust stale re-find, but single author-written selector, no compiled durability, no orthogonality guarantee, no memory.
- **Stagehand:** grounds lazily at runtime (cost + non-determinism) and *mutates a local cache*; Conxa grounds once at compile, ships a signed deterministic bundle, and heals via Cloud re-sign — keeping signed determinism Stagehand's mutable cache cannot claim.
- **browser-use / UI-TARS / Fable-class:** re-perceive every step via LLM/vision in the hot path — non-deterministic and unauditable. Conxa keeps the hot path a pure zero-token matcher and re-grounds only at the recovery edge, across a process seam.

**Net:** identity that is orthogonal, durability-ranked **by measured fleet survival**, non-deterministic/injectable/PII-filtered, expressed in the native execution grammar, resolved by a **pure untrusted-DOM-safe matcher** with a strict uniqueness gate and a stable-hash tie-break, observable per resolution, evaluated by mutation+regression+calibration, and **self-improving across the fleet** — is strictly more robust, more secure, and more durable over time than any single-selector, lazy-grounding, or live-perception approach in the corpus, while preserving the zero-LLM deterministic hot path. This is the identity foundation the replay guarantee (Phase 4), verification (Phase 5), and recovery (Phase 6) rest on — and, via §9, the one component of the selector stack that no competitor can structurally copy.
