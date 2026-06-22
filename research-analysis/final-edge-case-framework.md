# Final Edge-Case Framework (Phase 7)

**Purpose:** for each high-impact edge case, the final decision on **Detection · Representation · Replay · Recovery · Verification**. This operationalizes the five-family model (`conxa-edge-case-framework.md`) into a per-case playbook the implementation can follow directly. Every row is zero-token unless marked `H`/`V`/`U`. EC-/RP- IDs cross-reference `edge-case-inventory.md` / `recovery-patterns.md`.

**The five families (root causes):** 1 Identity drift · 2 Timing/actionability · 3 Stochastic interruption · 4 Boundary traversal · 5 Outcome ambiguity. Detection answers "how do we notice," Representation "what the compiled step carries," Replay "how it executes," Recovery "what happens on failure," Verification "how we prove it worked."

---

## Boundary traversal (Family 4)

### Iframes (EC-01) / Nested iframes (EC-02)
- **Detection:** target not in top document; resolve fails until frame entered.
- **Representation:** `frame_chain` (ordered, verbatim from recording) in the step's identity; each frame carries multi-signal **FrameFingerprint** (src/name/title, durability-ranked). `frame_enter/frame_exit` markers get `no_recovery_block`.
- **Replay:** re-enter the full chain every attempt via `frameLocator`/`rootCandidates` (late-bound — frames go stale); resolve target inside the leaf frame.
- **Recovery (Z):** frame drift → alternate frame signal → `src_pattern` → title → **CDP frame-tree enumeration**.
- **Verification:** read the post-condition **inside the same frame chain** (never the top document).

### Cross-origin iframes (EC-03)
- **Detection:** parent JS cannot reach the frame (`contentDocument` null).
- **Representation:** same `frame_chain`; flagged cross-origin so recovery uses CDP only.
- **Replay:** Playwright `frameLocator` (works across origin); **never** in-page `contentDocument` traversal (hard rule).
- **Recovery (Z):** CDP frame-tree enumeration by `src_pattern`.
- **Verification:** in-frame via CDP/Playwright.

### Shadow DOM (EC-04) / Nested Shadow DOM
- **Detection:** `querySelector` doesn't pierce; target inside shadow host.
- **Representation:** `shadow_path` (ordered host chain, mode open/closed). **Compiler forbids XPath for shadow targets** (XPath doesn't pierce — top-50 #17).
- **Replay:** Playwright default open-shadow piercing; walk nested hosts.
- **Recovery (Z):** AX role+name (pierces) → **CDP `pierce:true`**; closed roots (EC-04b) → CDP/AX, then vision Tier-4 if no AX.
- **Verification:** read state inside the shadow chain.

---

## Timing & dynamic UI (Family 2 + Family 1)

### Hover menus (EC-15/16)
- **Detection:** target absent until parent hovered; menu closes on mouse-out.
- **Representation:** `hover_chain` (ordered hover preconditions) as a **dependent action group**.
- **Replay:** walk hover chain → target becomes visible → act.
- **Recovery (Z):** **re-hover-then-retry** (RP-07) — converts "menu closed" false-failure into automatic recovery.
- **Verification:** the menu action's outcome (navigation/state), not menu visibility.

### Dynamic UI / React rerenders (EC-09)
- **Detection:** detachment error / node replaced between find and act.
- **Representation:** late-bound orthogonal signals; **no stored handle** (the foundation Conxa already has).
- **Replay:** re-query every attempt; **stable(RAF) gate** before acting so a mid-reflow node isn't mis-clicked.
- **Recovery (Z):** re-resolve next durability signal; post-navigation **stale-DOM guard** (URL/focus diff abort, browser-use RP-11).
- **Verification:** independent post-condition (optimistic-UI flashes false-pass without it).

### Virtualized lists (EC-13)
- **Detection:** target row not in DOM (rendered-count ≪ row-count); compiler flags virtualized container at record time.
- **Representation:** `handler_hints.virtualized_container` selector + stable row identity (text/data-id, **never index**).
- **Replay:** **scroll-until-found** loop — resolve container, re-query by stable id, scroll a viewport step, short stable gate, repeat to a bounded budget.
- **Recovery (Z):** extend scroll budget; re-resolve by stable id.
- **Verification:** the row's post-action state (selected/edited), re-resolved by stable id.

### Infinite scroll / lazy loading (EC-14)
- **Detection:** target appears only after scroll triggers fetch.
- **Representation:** bounded scroll-to-load directive keyed on target appearance.
- **Replay:** scroll → wait for the section/target to render → act (never `networkidle`).
- **Recovery (Z):** extend bounded scroll budget.
- **Verification:** target present + its outcome.

---

## Stochastic interruptions (Family 3)

### Cookie/consent banners (EC-19) · Popups · Modals (EC-20)
- **Detection:** known consent frameworks (OneTrust/Cookiebot/TCF selectors) or generic `[role=dialog]` blocking the target; banner present ~30–50% of loads.
- **Representation:** **compiled conditional steps** — `if_present(selector)→try_dismiss` for observed-optional states (NOT linear steps).
- **Replay:** branch deterministically — dismiss if present, skip if absent.
- **Recovery (Z):** curated **dismiss-known-pattern** library for unexpected blockers; emit `stochastic_state_observed` so Cloud promotes it to a compiled conditional.
- **Verification:** confirm blocker gone AND original target now actionable.

### MFA / 2FA (EC-21) · Captcha (EC-35)
- **Detection:** known MFA/captcha patterns; or a sensitive step type.
- **Representation:** marked as **designed human stops** (`recovery.destructive`/sensitive), not failures.
- **Replay:** pause at the step.
- **Recovery (U):** **structured Tier-5 CALL_USER** handoff with full context; resume from checkpoint.
- **Verification:** post-condition after human completes (auth succeeded / challenge cleared).

### Session expired mid-run (EC-22)
- **Detection:** `isAuthFailure` (login redirect URL/title heuristics).
- **Representation:** auth self-heal policy (already built).
- **Replay:** detect → re-auth window → rebuild context → resume.
- **Recovery (Z + U for the login):** the auth self-heal loop.
- **Verification:** confirm back on the expected view before resuming the interrupted step.

---

## Input/output complexity (Family 5 — verification-driven)

### File uploads (EC-23)
- **Detection:** `<input type=file>` (often hidden) vs custom drop-zone.
- **Representation:** `control_kind=file_input` + the real input selector.
- **Replay:** `setInputFiles` on the real input (bypasses the OS dialog, which is outside the DOM).
- **Recovery (Z):** re-resolve the hidden input; if drop-zone-only, escalate.
- **Verification:** input populated / preview/filename shown (top-50 #32).

### Downloads (EC-24)
- **Detection:** download trigger; race with navigation.
- **Representation:** `control_kind` + expected file fingerprint.
- **Replay:** trigger → await download event.
- **Recovery (Z):** retry trigger; wait longer.
- **Verification:** **file exists, non-zero size, expected type** (top-50 #31) — "downloaded" ≠ file present.

### New tabs / window switch (EC-33)
- **Detection:** action opens a new context/page event.
- **Representation:** step flags a context switch; subsequent steps target the new context.
- **Replay:** follow the `page`/context event; bind subsequent resolution to the landed context.
- **Recovery (Z):** wait for the expected new context; if wrong window, re-target.
- **Verification:** **landed-context check** — URL/title of the new context matches expectation before acting (top-50 #43).

### Typeahead / custom dropdowns (EC-25/26 — referenced from Family 5)
- Covered in `final-replay-algorithm.md` §5: fill→wait-async-options→select-exact (typeahead); open→wait→click-by-text (custom dropdown). Verification: the committed value equals the intended value (not merely highlighted).

---

## The per-case discipline (summary table)

| Edge case | Family | Representation | Replay primitive | Recovery (first `Z`) | Verification |
|---|---|---|---|---|---|
| iframe / nested (EC-01/02) | 4 | `frame_chain`+FrameFingerprint | re-enter chain late-bound | frame re-resolve / CDP tree | in-frame post-condition |
| cross-origin iframe (EC-03) | 4 | cross-origin flag | `frameLocator` (no contentDocument) | CDP enumeration | in-frame |
| shadow / nested (EC-04) | 4 | `shadow_path`, no-xpath | open-shadow pierce | AX→CDP pierce | in-shadow |
| hover menu (EC-15/16) | 2 | `hover_chain` group | walk hover→act | re-hover-retry | action outcome |
| react rerender (EC-09) | 1 | late-bound signals | re-query + stable gate | next signal + stale-DOM guard | independent post-cond |
| virtualized (EC-13) | 1 | virtualized_container+stable id | scroll-until-found | extend scroll budget | row outcome by stable id |
| infinite scroll (EC-14) | 1 | bounded scroll directive | scroll→wait→act | extend budget | target+outcome |
| cookie banner (EC-19) | 3 | conditional `if_present` | branch dismiss/skip | dismiss-known library | blocker gone+target actionable |
| modal/popup (EC-20) | 3 | conditional | branch | dismiss-known | target actionable |
| MFA/captcha (EC-21/35) | 3 | designed stop | pause | — | post-human post-cond |
| file upload (EC-23) | 5 | file_input handler | setInputFiles | re-resolve input | input populated/preview |
| download (EC-24) | 5 | file fingerprint | trigger→await | retry/wait | file exists+size+type |
| new tab (EC-33) | 5/F | context-switch flag | follow context event | wait/re-target | landed-context URL/title |

**Closing principle:** every edge case is detected deterministically, represented in the compiled step (not improvised at runtime), replayed by an action-type-correct primitive, recovered first by a zero-token mechanism, and — without exception — **verified by an independent post-condition**. The LLM (Tier 3), vision (Tier 4), and human (Tier 5) appear only at the genuine residual, and even their results pass through verification. This is how Conxa survives the full edge-case surface while keeping the hot path deterministic.
