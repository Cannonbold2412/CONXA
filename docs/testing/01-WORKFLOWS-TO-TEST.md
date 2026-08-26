# ⏳ Workflows To Test — sorted easy → hard

> **Shortcut:** almost everything here (WF-1…WF-10) is consolidated into ONE mega-recording
> with click-by-click manual steps in
> [`03-ONE-WORKFLOW-RUNBOOK.md`](03-ONE-WORKFLOW-RUNBOOK.md). Use this file as the reference
> for what each check proves and where failures go; use the runbook to actually run it.

Everything here is **pending**: no successful manual end-to-end run has been logged yet.
When a workflow passes manually, move its section to
[`02-WORKFLOWS-PASSED.md`](02-WORKFLOWS-PASSED.md), add what the pass proves, and bump that
file's dashboard.

Consolidation rule used for this file: **fewer but longer workflows**. Related small tests are
merged into one long recording wherever they share sites or mechanics, so a single record →
compile → replay session covers many checks at once. Difficulty increases down the list — run
top to bottom.

---

## How to work

1. Record with Build Studio → compile → replay via Studio Run Test or a real runtime install.
2. Log every result using this block:
   ```
   [WF-x] <segment>
   Result: PASS | DEGRADED | FAIL | CRASH
   rec __s · compile __s · exec __s · LLM calls at runtime: __ (must be 0 unless stated)
   Evidence: screenshot / events.jsonl excerpt / recovery-log excerpt
   ```
   `DEGRADED` = finished but with warnings/retries/fallbacks — these are gold, log them.
3. Failures go to `TODO.md` under the item named in each workflow ("Where failures go").
4. A passing workflow graduates to `02-WORKFLOWS-PASSED.md` after **one clean manual run**;
   promote it into `runtime/test/gate-skill/` as a CI fixture after three consecutive passes.

## Site arsenal (all free)

| # | Site | Login | For |
|---|---|---|---|
| S1 | the-internet.herokuapp.com | `tomsmith` / `SuperSecretPassword!` (on `/login`) | iframes, hovers, drag-drop, alerts, popups, uploads/downloads, dynamic loading, infinite scroll, windows |
| S2 | ui-test-automation-playground.blogspot.com | none | dynamic IDs, changing text, AJAX |
| S3 | demoqa.com | none | forms, date picker, select menu, upload/download, dynamic properties |
| S4 | jqueryui.com | none | autocomplete, datepicker (inside iframes!) |
| S5 | saucedemo.com | `standard_user` / `secret_sauce` | checkout flow, 100-step loops |
| S6 | parabank.parasoft.com | `john` / `demo` | multi-page banking, 100+ steps |
| S7 | computer-database.gatling.io | none | CRUD + pagination loop (100-step generator) |
| S8 | opensource-demo.orangehrmlive.com | `Admin` / `admin123` | heavy React SPA, hover menus, modals |
| S9 | demo.owasp-juice.shop | register free | search, filters, reviews, SPA |
| S10 | datatables.net/examples/data_sources/dom.html | none | identical-row tables (margin-gate test) |
| S11 | en.wikipedia.org | none | stable DOM control site, i18n flip |
| S12 | excalidraw.com | none | canvas app — expected refusal case |
| S13 | google.com/recaptcha/api2/demo | none | CAPTCHA boundary test |
| S14 | automationexercise.com | register free | e-commerce signup + long cart chain |
| S15 | filebin.net | none | anonymous bins: multi-upload, ZIP download |
| S16 | github.com public repo folder | none | ≥20 real downloadable files |

Local fixtures live in [`fixtures/`](fixtures/): `mutator.html` (DOM mutates every 0.7 s),
`recovery-fixture.html` (tier-targeted element drift), `dismiss-fixture.html` (overlay ladder).
Serve over HTTP (`python -m http.server 8099 --directory docs\testing\fixtures *> server.log`),
never `file://`.

---

# LEVEL 1 — EASY

## WF-1 — Starter marathon: navigation, login, forms, tabs, single-file transfer, alerts

**Sites:** S11 + S1 + S3 · **Steps:** ~30 total (recorded as 2–3 takes) · **Tabs:** up to 3

One combined session covering every basic mechanic. Record each leg separately if cleaner;
compile all.

### Leg A — Trivial click-through (control baseline)
Target `https://en.wikipedia.org/wiki/Main_Page`: click "Random article" → click first link in
article body → stop. Compile → confirm selectors contain **no raw dynamic IDs** → Run Test →
package → install → `execute_skill` via MCP. Telemetry event visible in cloud = PASS.

### Leg B — Simple login ⭐ security check
On S1 `/login`: type `tomsmith` / `SuperSecretPassword!` → Login → wait for "You logged into a
secure area!" flash. Compile and package, then **grep the generated bundle folder for
`SuperSecretPassword`** — found = CRITICAL STOP (auth-exclusion invariant broken).

### Leg C — Form fill with varied field types
S3 `/text-box`: fill name/email/address → Submit → verify echo block. Then S3
`/automation-practice-form`: pick Gender radio, Hobbies checkbox, note Subject combobox behavior,
Submit.

### Leg D — New tab / popup round trip (also confirms old break test B-1)
On S1 `/windows`: click "Click Here" (opens tab showing only "New Window") → in tab B assert
heading reads "New Window" (impossible on tab A) → switch back to tab A → click "Elemental
Selenium". **Dangerous variant:** re-record so tab B contains an element that *also exists* on
tab A — it must act on the *new* tab's copy, never silently on the original (`tabs.js::resolveStepPage`).

### Leg E — Single download → new-tab upload handoff
S1 `/download` → download any file → new tab → `demoqa.com/upload-download` → Select File →
verify filename echoed. Replay **without** supplying any `file_path` input — must succeed via the
compiled `{{downloaded_file}}` binding (exact recorded filename match required).

### Leg F — Native JS dialogs
S1 `/javascript_alerts`: Alert → accept; Confirm → accept; Prompt → type text → accept. Verify
result assertions ("You clicked: Ok", typed text echoed).

**PASS:** all legs end-to-end clean, credential grep CLEAN, zero LLM calls at runtime.
**Where failures go:** `TODO.md` EXEC-5 (#43 tab landing, #31/#32 download/upload verification);
credential leak = hard blocker, fix first.

---

## WF-2 — Rich-element gauntlet: iframes, dynamic identity, widgets, scroll, hover, drag

**Sites:** S1 + S4 + S3 + S2 · **Steps:** ~45–55 across segments · **Tabs:** 1

### Segment A — Dynamic IDs (C.1)
S2 dynamic-id page: click "Button with Dynamic ID". Selector must NOT contain the captured ID
(stable_hash stripped). Execute twice — second run faces a fresh ID.

### Segment B — Changing text + moved elements (C.3/C.4)
S2 Text Input page: type "Conxa", click the button whose label changes. Expect Tier 1–2 heal at
zero tokens — log which tier. Moved-element check: local HTML with a button top-left; compile,
then move it inside a collapsed sidebar and re-run — role/text signals must carry it.

### Segment C — Late-rendered elements (C.5)
S1 `/dynamic_loading/1` (hidden div appears after 2s) then `/dynamic_loading/2`: Start → wait →
click/assert "Hello World!". Watch whether waiting polls adaptively or replays a fixed delay.

### Segment D — Iframe chain preservation (E.1)
S1 `/iframe` (TinyMCE): click bold toolbar → into editor iframe → type "Hello from Conxa" →
select-all → Bold. Review compile: `frame_enter`/`frame_exit` markers present and verbatim?
Markers get `no_recovery_block` and fail fast instead of hanging. Verify text formatted at replay.

### Segment E — Nested iframes + offset accumulation (E.2)
S1 `/nested_frames`: act inside LEFT frame → BOTTOM frame (different parent chains). Clicks must
land pixel-correct (offsets accumulate up the chain). Bonus: S4 datepicker — widget lives one
iframe deep; navigate next month ×2, pick day 15; re-run with different target month to see if it
generalizes.

### Segment F — Autocomplete/typeahead race (E.6)
S4 `/autocomplete/` type "ja" → pick "JavaScript"; plus S3 `/select-menu` custom Select2-style
dropdowns. Execute twice — watch typing vs async option render race.

### Segment G — Infinite scroll (E.7)
S1 `/infinite_scroll`: scroll until 4 blocks loaded → click last paragraph. Are wheel gestures
recorded? Is the lazy element resolvable?

### Segment H — Hover menus (E.8)
S1 `/hovers`: hover avatar 2 → "View profile".

### Segment I — Drag and drop (E.9)
S1 `/drag_and_drop`: box A onto box B; S3 `/sortable`: item 5 to position 1. Expected likely gap —
quantify precisely.

### Segment J — Shadow DOM (C.6)
S1 `/shadow_content`: interact inside shadow root. Note separately what happens at RECORD vs
EXECUTE time; document exactly where the chain breaks if it does.

**PASS:** per-segment as noted; iframe chain invariant holds; zero runtime LLM calls except where
Tier escalation is deliberately provoked (none in this WF).
**Where failures go:** EXEC-5 (#43), iframe pipeline issues → TRD "Iframe Pipeline" owners;
selector durability → compiler items in `TODO.md`.

---

# LEVEL 2 — MEDIUM

## WF-3 — Scale stress: 50-step warm-up → 100+ step flagship → banking marathon

**Sites:** S7 + S5 + S6 · **Tabs:** 1 · The headline showcase.

### Leg A — 50-step warm-up
S7: ONE take ~50 actions — search "Apple" → open result → back → filter "IBM" → open → back →
add 5 computers (≈8 actions each) → delete 2. Note recorder responsiveness/dropped events;
compile wall time + LLM call count; execute; count first-try successes. PASS ≥95% clean, no silent
degradation warnings.

### Leg B — 100+ step flagship ⭐
S5: ONE continuous take of this loop **6× without pausing** (≈120 actions): sort Z→A → add 2
products → cart → remove 1 → continue shopping. After loop 6: full checkout → First/Last/Zip →
Finish → "Thank you" assertion → logout. Inspect review: loops deduplicated? intents sane at
length? Package + execute, time it, then **do the task manually once with a stopwatch** — that's
the comparison number. Fill the metrics table (events/steps, compile time/calls, exec time,
first-try rate, manual time, Human Edit needed?).

### Leg C — Compile determinism at scale
Re-compile Leg B's session via `conxa-cloud/scripts/recompile_session.py <session_id>` and diff
fingerprints/selectors between the two SkillPackages. Identical = PASS; differing selectors =
IdentityBundle/grammar nondeterminism.

### Leg D — Banking marathon (100+ steps, many page types)
S6 (`john`/`demo`): login → Accounts Overview → Transfer Funds ×3 (verify each) → Pay Bills ×2 →
Find Transactions (date range, then amount) → Open New Account → logout. Naturally 100–140 actions
across many page types — unlike Leg B's repetitive loop.

**The pitch being validated:** agent does it live = tokens every run + drift; human ≈20 min/run;
compiled skill replays forever after one compile.
**Where failures go:** EXEC-10 (long-chain); determinism → IdentityBundle items.

---

## WF-4 — Real-app journeys: SPA CRUD, money checkout, multi-site relay, i18n, reviews

**Sites:** S8 + S5 + S14 + S11 + S9

### Leg A — Heavy SPA CRUD
S8 OrangeHRM: Dashboard → Admin → User Management → Add user (fill form, save) → search new user →
edit → delete → confirm toast disappears. Toasts auto-dismiss ~3 s — do assertions catch them?
Watch SPA route changes without reload; recorded waits surviving.

### Leg B — E-commerce checkout money-demo ⭐
S5 full journey: login → price low→high filter → add 3 cheapest → cart → info form → verify total
math → Finish → "THANK YOU FOR YOUR ORDER" assertion → logout. Execute 3× consecutively (also
feeds WF-10 fatigue test).

### Leg C — Multi-site relay
One workflow, two domains: S14 search "tshirt", note price → navigate to S11 → search that term →
assert loaded. Tests auth/state handling across navigations.

### Leg D — i18n flip
Record on English Wikipedia: search "Automation" → first result → assert heading. Execute SAME
skill against `de.wikipedia.org`. Directly tests text-signal weight in identity — note which
non-textual signals saved it (or didn't).

### Leg E — Reviews / star ratings / dynamic widgets
S9 Juice Shop: leave a product review (modal + star click + textarea + submit), read it back in
the list.

**PASS:** all legs clean; checkout correct 3/3; i18n flip resolves by non-text signal or fails
loudly (never wrong-click).
**Where failures go:** EXEC-10; entity-binding concerns → PROD-3.

---

## WF-5 — Files at scale: bulk 20-file transfer + cross-run consistency

**Sites:** S15/S16/S1/S3 · **Steps:** ~25 per run × multiple runs · **Tabs:** 2

Two mechanics — decide which you're testing before recording:

| | Shape A — 20 files one at a time | Shape B — 20 files in ONE action |
|---|---|---|
| Compiled shape | 40 steps, each bound to its own filename | 2 steps |
| Supported? | Yes | Yes — zip extraction at download time (EXEC-20); upload takes a folder path (W-8) |

### Part A — Shape A unrolled loop
Download source: S16 GitHub folder raw links (fixed set) or S1 `/download` (drifts).
Upload target: `demoqa.com/upload-download` (single-file input is fine here).
Record download #N → upload #N interleaved ×20. `_bind_downloads_to_uploads` binds each upload to
its own earlier download by exact recorded filename — **identity check: file #7 uploaded must be
file #7 downloaded**, not #3 or a duplicate. Also confirm the 20-iteration loop replays from the
compiled sequence, not LLM re-deciding clicks per file (zero runtime LLM calls).

### Part B — Shape B genuinely 20 at once
Upload 20 dummy files to a filebin bin by hand → "Download files" → one ZIP (one
`download_observed`; zip extracted at download time since EXEC-20). Reupload side needs an
`<input type="file" multiple>` — verified: `filebin.net`, `tmpfiles.org`,
`blueimp.github.io/jQuery-File-Upload`, `file.io`, `demo.automationtesting.in/FileUpload.html`.
Single-file-only (cannot test Shape B): demoqa upload, herokuapp `/upload`.
**Folder-path mechanism (W-8):** pass ONE folder path as `file_path`; runtime expands to files in
name order (non-recursive; empty folder throws). Cheap pre-check before scaling: record picking 3
files at once, replay with a folder of 3 — count arrivals. Recording with one file and replaying
with a folder of 20 is legitimate and worth testing. Single-file control + folder → immediate
typed refusal, no recovery cascade, zero tokens.
⚠️ Public file hosts — generated dummy files only, never real documents.

### Part C — Cross-run consistency (does yesterday's run leak into today's?)
Run A: replay the skill against one 20-file set (`report-01…20.pdf`). Confirm downloads land under
`~/.conxa/downloads/{runId}/` — a **fresh folder per execution**, not shared OS Downloads.
Run B: replay the SAME compiled skill against a different 20-file set (`invoice-01…20.pdf`).
Every Run-B upload must be one of ITS OWN files — no `report-*` leftovers. Retention check (W-7):
Run A's `{runId}` dir still exists immediately after Run B starts (inside retention window), gone
once older than `CONXA_RUN_RETENTION_DAYS` (default 7).

### Part D — Break probes folded in
- **Same-name collision (old B-3, W-3):** download 5 files, ≥3 sharing suggested filenames →
  inspect `{runId}/` and count. Predicted: silent overwrite, fewer files than downloads, run still
  reports success — the most dangerous failure class here (silent data loss).
- **Popup download (old B-5, W-5):** click a link whose new tab immediately downloads — the popup's
  file must now be saved (listeners attach to every opened page).

**PASS:** 20/20 identity-correct uploads both shapes; no cross-run leakage; retention sweep
confirmed; collision/popup probes behave as designed (or get filed as the W-3 bug).
**Where failures go:** EXEC-10, EXEC-15 (Shape B), W-3 → new TODO item (highest severity),
retention → W-7 follow-ups.

---

# LEVEL 3 — HARD

## WF-6 — Conditional branch steps in one workflow (EXEC-1)

**Site:** S1 only (`/entry_ad` + `/login`) · **Steps:** ~15–20 · **Tabs:** 1

Tests steps that must **succeed whether or not something appears** — popups, expired-session
dialogs, A/B outcomes. All three primitives (`try_dismiss`, `if_present`, `wait_for_one_of`) in
one compiled skill. Background: the recorder never invents branches; it only flags dialog-shaped
clicks (`bridge.js::detectOptionalContainer` → advisory hint). Only human confirmation in Human
Edit converts it into a real branch (`workflow_mutations.confirm_optional_interstitial`) — the
compiler staying hands-off is itself part of the test.

### Stage 1 — Record (~8–10 steps)
Clear S1 site data (Entry Ad shows once per profile). Go `/entry_ad` → modal appears → Close →
navigate `/login` → fill `tomsmith` / `SuperSecretPassword!` → Login → success flash. Stop.
**Do not record Logout.**

### Stage 2 — Human Edit (where branches are born)
1. Find the Close-click step → **confirm optional interstitial** → becomes `try_dismiss` seeded
   with recorded selector + container signal. Fallback if unflagged: insert `try_dismiss`
   manually.
2. Insert `if_present` BEFORE the try_dismiss: probe = modal container; body = click Close. One
   run then exercises if_present's positive path AND try_dismiss's negative path.
3. After the Login click insert `wait_for_one_of` (`required:false`): option 1 probe
   `#flash.success` → body clicks Logout; option 2 probe `#flash.error` → empty body.
4. Save, compile. Verify compile left the flagged step an ordinary required step pre-confirmation.

### Stage 3 — Pack build
Set `CONXA_REQUIRED_RUNTIME` explicitly — the branch executor may not be in the tagged manifest
floor yet; an older app layer silently no-ops unknown step types (for a branch = skips its whole
body while reporting success).

### Stage 4 — Replay matrix
| Run | Setup | Expected |
|---|---|---|
| R1 | Clear site data, replay | Modal appears → if_present hits → Close → try_dismiss finds nothing, silent → login → success arm → Logout. PASS |
| R2 | Same profile, no clearing | Modal absent → branches skip silently, faster run, success arm again. PASS — absence is success |
| R3 | Wrong password value temporarily | Error flash → option 2 arm → Logout NOT clicked → run succeeds. Revert after |

In EVERY run check recovery log/tier counters: branch probes must never escalate the cascade and
never burn LLM tokens (branch bodies are best-effort; handlers never throw). Any branch-attributable
escalation = regression against the zero-token invariant.

Bonus leg (optional): S1 `/notification_message_rendered` — random success/error per click; insert
`wait_for_one_of` probing `#flash.success` vs `#flash.error` (`required:false`), replay 3–4×,
different arms fire, run never fails either way. Closest cheap stand-in for real-world A/B.

### Adversarial variants
- **AV-1 unmatchable candidates:** blank try_dismiss candidates → still passes via Escape fallback, zero escalation.
- **AV-2 poisoned nested body:** bogus selector in if_present body → run still passes (failing body ≠ failing run; confirm live; `test_branch.js` covers offline).
- **AV-3 required starvation:** `wait_for_one_of required:true` pointed at nonexistent selectors → clean immediate typed failure, not a cascade.
- **AV-4 old-runtime silent skip:** replay pack built WITHOUT `CONXA_REQUIRED_RUNTIME` against a pre-branch app layer → predicted: bodies skipped, success reported, nothing dismissed. If a CURRENT app layer also skips → regression in run.js/handlers.js dispatch.
- **AV-5 popup that was NEVER recorded:** record minimal variant with zero branch steps (skip `/entry_ad`), replay once on a cleared profile so the modal appears mid-run. Runtime has NO proactive overlay sweep — recovery fires only when a click throws INTERCEPTED. Tier-1 ladder: Escape → known consent-pattern list (`dismiss_patterns.js`) → host-learned winners (`learned_overlays.json`). Outcomes: ignored (luck) / Escape (T1 free) / pattern match (T1 free, `tier1_dismiss_pattern`, learned store skips it next time) / bespoke modal → T3+ paid or ceiling failure. Then apply the fix by hand (insert `try_dismiss` first step), republish, replay both futures → silent passes.

> **Note:** AV-5a's fixture-based walkthrough was validated programmatically on real headless
> Chromium 2026-08-25 (see P-2 in `02-WORKFLOWS-PASSED.md`) using
> [`fixtures/dismiss-fixture.html`](fixtures/dismiss-fixture.html). What remains manual here:
> driving it through Build Studio record → pack → replay, including R2→R3 learning behavior in a
> real Studio workflow.

**What this proves on pass:** the full EXEC-1 loop (observe → compiler hands-off → human authors →
runtime executes best-effort); stochastic popups cost zero tiers and zero tokens present OR absent;
deterministic and truly random A/B both drivable via wait_for_one_of; old-runtime hazard justifies
the manifest floor.
**Where failures go:** reopen `TODO.md` EXEC-1 with dated update; probe failures → EXEC-5 #31/#32;
AV-5 tier surprises → recovery cascade regression.

---

## WF-7 — Recovery-cascade drill: force Tier 2 and Tier 3 on purpose (+ live self-heal suite)

**Sites:** local [`fixtures/recovery-fixture.html`](fixtures/recovery-fixture.html) + live-site legs ·
**Steps:** ~6 per replay × 6 + live legs

Workflows above hope recovery never fires; this makes it fire deterministically. Tier recap:
T1 mechanical fix from the Playwright error (re-find/scroll/dismiss/wait) — zero tokens. T2 other
*deterministic* ways (a11y role+name, fallback alternatives in `recovery.json`, dialog scoping,
fuzzy text) — zero tokens. T3 ranked indexed list of live interactive elements + intent/anchors sent
to Claude, which replies a candidate_index verified against the uniqueness gate — paid. (T4
screenshots out of scope — TODO EXEC-3.)

### Setup
Serve `docs/testing/fixtures` on :8099. Record minimal skill against
`http://localhost:8099/recovery-fixture.html` (no param = clean): click "Buy Now", stop, compile.
Before mutating anything confirm in `recovery.json`: `selector_context.alternatives` includes
something surviving mode `t2` (here `#checkout-btn`), and the step carries readable anchors.
Build the pack.

### Fixture replays (edit navigate URL to add `?v=…`)
Grep after each run:
```powershell
Get-Content "$env:USERPROFILE\.conxa\logs\recovery.log" -Tail 80        # real runtime
Get-Content "conxa-builder\python\sandbox\.conxa\logs\recovery.log" -Tail 80  # Studio sandbox
```
Events: `layer_recovered layer:2 tier2_a11y`, `repair_event`, `agent_recovery_requested {tier:3}`,
`agent_override_applied/rejected`, `recovery_ceiling_reached`, `retry_budget_exhausted`,
`recovery_stagnant_stop`. Also grep `server.log` `/__log?` lines to confirm the RIGHT button was clicked.

| # | Variant | Where | Expected |
|---|---|---|---|
| R0 | `clean` | Studio Run Test | Passes, clicked `clean:target`, ZERO recovery events. Anything else = weak compiled identity; fix before continuing |
| R1 | `?v=t2` | Studio Run Test (ceiling 2) | Passes via Tier 2 (`tier2_a11y`/`layer_recovered`), zero agent events, exactly one click `t2:target`. Free-self-heal proof |
| R2 | `?v=t3` | Studio Run Test (ceiling 2) | FAILS deterministically with `recovery_ceiling_reached`, no screenshots. Negative control: sandbox never spends tokens |
| R3 | `?v=t3` | Claude Desktop `execute_skill` | Full T3 loop: fail T1/T2 → `agent_recovery_requested` → Claude replies candidate_index → `agent_override_applied` → resumes and completes. Server log: exactly `t3:target`, NOT a decoy (ranking + uniqueness gate) |
| R4 | `?v=gone` | Claude Desktop | Claude declines honestly or nomination rejected (`agent_override_rejected`) → clean typed failure naming the step. A "success" here = ranking/gating regression |
| R5 | `?v=gone` again, same session | Claude Desktop | Budget/stagnation guards bite: `retry_budget_exhausted`, `recovery_stagnant_stop`. Failure gets cheaper, never more expensive |

Pass criteria: R0–R1 exact clicks, R2 fails zero-token, R3 one real click + candidate_index (not a
literal selector), R4 fails cleanly, R5 guards fire. Deviations map to: ceiling wiring /
`candidate_digest.js` ranking / `validateOverrideSelector` margin / `failure_response.js` contract.

### Live-site self-heal legs (folded-in Suite D)
Against a local HTML page or S1/S2 with manual edits between runs:
- **D.1 rename:** change button label "Submit"→"Confirm", keep role/testid → old skill recovers.
  Measure tier + latency; ZERO proxy calls expected.
- **D.2 move:** wrap button in a different `<div>` → relational signals tested live.
- **D.3 past healing:** change label AND structure AND drop testid → clean T3 escalation or clear
  final error, never crash/hang.
- **D.4 wrong page:** browser parked on unrelated URL → navigates itself or fast clear failure.
- **D.5 slow render:** 5000 ms setTimeout before the button → retry/wait tuning vs premature fail.
- **D.6 live version of D.1:** S9 product card under a different sort order — positions shuffle,
  identity should hold.
- **D.7 cost audit:** tally recoveries/tiers/tokens across all legs. Claim = most breakage heals at
  zero marginal cost; frequent T3 hits = durability scoring needs work.

**What this proves on pass:** T2 is a real free self-heal path; the ceiling contract holds both
ways; T3 ranks honestly under decoy competition and closes through the uniqueness gate ("AI
nominates, runtime verifies"); failure is bounded and gets cheaper.
**Where failures go:** EXEC-23 (missed interactable), EXEC-4 (T3 handoff shape), cascade modules
(`cascade.js`/`resolution.js`) with R1 logs attached.

---

## WF-8 — Remaining break tests: budget poisoning, timeouts, endurance, wrong-row safety

(B-1, B-2, B-3, B-5 are folded into WF-1/WF-5 as post-fix confirmations.)

### B-4 — Poison the retry budget (failure makes the next run worse)
Any site; `demoqa.com/dynamic-properties` convenient. Record a workflow targeting an element you
can MAKE fail (hard throttle, or delay > 2500 ms action timeout). Run → expect failure. **Do not
restart the MCP client.** Run twice more in the same session. Predicted (W-4): runs 2–3 fail
earlier with less recovery (`retry_budget_exhausted` near-immediately); restart the client and it
behaves like run 1 again → diagnosis confirmed. Commercially: "it broke once and now keeps breaking,
worse" — the pilot-ending failure mode. NOTE: budget clearing was since added on the success path —
this test checks the FAILURE path specifically.

### B-6 — Slow-site timeout stress
Replay WF-1's known-good login leg (or WF-3's chain) under heavy throttling (Slow 3G) or with
`CONXA_ACTION_TIMEOUT_MS` lowered to ~1200. Note which step types fail first and at what tier
recovery gives up. Purpose: how much headroom do the 2500/8000 defaults really have, and are the
env overrides enough answer for a customer whose internal app is simply slow?

### B-7 — Long-run endurance (the overnight one)
Same known-good workflow ×20 consecutive runs, runtime NOT restarted. Watch: process memory growth;
browser-context cache; retry-budget map accumulation; recovery-log growth toward 10 MB rotation;
download-folder pileup (W-7 sweep should cap it). Run 20 must behave like run 1.

### B-8 — Wrong-data-on-the-right-button (the safety test) ⭐ PROD-3
`automationexercise.com` cart or any 5+ row list with identical action buttons. Record deleting
**the third item specifically**. Replay after changing the list (reorder/remove/add) so row 3 now
holds different data. Predicted risk: positional resolution removes the wrong record. The margin
gate + IdentityBundle should prevent a confident wrong pick — this is how we find out. **If it
removes the wrong row: not a quiet bug — it is THE blocker for finance/HR/payroll sales.**

**Where failures go:** B-4 → new TODO item (budget not cleared on failure); B-6 → EXEC-10 (timeout
guidance); B-7 → new TODO per symptom; B-8 → PROD-3 directly.

---

## WF-9 — EXEC-11 mega-workflow: one recording, one replay gauntlet (R1–R8)

~60 steps, 6 domains, 4 tabs in ONE take, then eight replays of the SAME skill turning it into
every hard-mode test. Log under `TODO.md` TEST-12 (governance gaps → PROD-18).
Manual time: ~45 min setup + ~15 min recording + ~30 min gauntlet + optional overnight.

| Tag | Meaning | Exercised by |
|---|---|---|
| H-1 | DOM mutates between record & replay | Segment A, R1 |
| H-2 | Late-render/scroll-load + timeout headroom | Segment B, R3 |
| H-3 | Mid-run session death fails honestly | R4 |
| H-4 | Replay inputs differ from recorded data | Segment E, R2 |
| H-5 | Entity binding — right row, always (PROD-3) | Segment D, R2 probe |
| H-6 | Cross-skill output→input chaining via `execute_sequence` | Segment F, R2 |
| H-7/H-8 | Same-platform serialization / cross-platform parallelism | R5, R6 |
| H-9 | Endurance + retry-budget poisoning over 20 runs | R8 |
| H-10 | Iframe chain under rapid alternation | Segment C |
| H-11/H-12 | Canvas + CAPTCHA refuse cleanly | R7 |

### PHASE 0 — Setup
Fixture: serve [`fixtures/mutator.html`](fixtures/mutator.html) (`npx serve -l 3000 .`) — Submit
button visibly jumps/relabels every ~0.7 s. Accounts: saucedemo `standard_user/secret_sauce`;
Juice Shop throwaway; computer-database none. Studio running, group `MEGA-11` created + auth done;
terminal tailing sessions; MCP client connected (`list_skills` works).

### PHASE 1 — The single recording (in exactly this order, no stopping)
- **A — Mutator (tab 1, ~6 steps, H-1):** type `Mega Test Run` name, `mega@test.local` email,
  click Submit (whatever its label says now), wait for "Thanks, Mega Test Run!".
- **B — Scroll + late-render (new tab 2, ~8 steps, H-2):** `/infinite_scroll` scroll to 4 blocks +
  assert; `/dynamic_loading/2` Start → wait spinner → click "Hello World!".
- **C — Iframe ping-pong (same tab, ~10 steps, H-10):** `/nested_frames` act LEFT → RIGHT →
  BOTTOM; `/datepicker/` open widget (one iframe deep), pick a specific day.
- **D — Entity-specific cart (new tab 3, ~14 steps, H-5):** saucedemo login → add Backpack +
  Bike Light + Bolt T-Shirt → open cart → remove **Backpack specifically** (not first row) →
  assert badge `2`.
- **E — Typed search (new tab 4, ~6 steps, H-4):** Juice Shop → dismiss banner → search `Apple` →
  Enter → assert results → click first, confirm Apple product.
- **F — Chaining source (same tab, ~10 steps, H-6):** computer-database → filter `MacBook` → open
  detail → note introduced date. **Stop.** Expect 55–65 raw events.

### PHASE 2 — Compile & install
Verify: no raw dynamic ids survived as sole selectors (esp. Segment A); tab markers at segment
boundaries; frame markers for left/right/bottom + datepicker; step count ≥50 (compare event count —
no truncation). Build → publish → sync → `list_skills` shows mega-11. **Grep bundle for
`secret_sauce` — found = STOP, critical bug.**

### PHASE 3 — Replay gauntlet (all manual, in order)
| R | Do | Expect |
|---|---|---|
| R1 | Baseline, no overrides | Full success; telemetry `run_success`; Tier ≤2; ZERO LLM calls |
| R2 | Override inputs: `Second Pass`/`second@test.local`/search `Banana`/filter `ASCI White` | EVERY value followed; Banana clicked not Apple; ASCI White detail. Zero-result probe: search `zzzqqqxxx` → LOUD failure at results step, never clicking whatever's on screen |
| R3 | Re-run R1 with `CONXA_ACTION_TIMEOUT_MS=1200` (shrink headroom artificially) | Slower; note which steps needed recovery, which tier; still zero LLM calls |
| R4 | Kill mid-run: close runtime browser window mid-Segment-D or block network after Segment C | Clean failure NAMING the step. Not success, not hang, not healing into a login form |
| R5 | TWO mega-11 `execute_skill` calls back-to-back | Strictly sequential (H-7 serialization via host_lock); both succeed, badge `2` twice, no interleaving |
| R6 | Mega-11 + tiny wiki skill (open → Random article → assert body) SIMULTANEOUSLY | Timestamp OVERLAP (true parallelism). Mid-flight `cancel_execution` with wiki run_id: wiki dies, mega finishes untouched |
| R7 | Two tiny throwaway recordings: Excalidraw draw/move/delete; reCAPTCHA demo form submit | Fast clean refusals at first canvas-only action / CAPTCHA, minimal token burn |
| R8 | Loop mega-11 ×20 unattended; sabotage run 7 with `CONXA_ACTION_TIMEOUT_MS=400` | Flat memory trend, stable log growth, leftover-run cleanup. THE key check: run 8 behaves like run 1 (full budget available) — if it fails faster with less recovery, retry-budget poisoning is live; capture both logs |

Scorecard per replay:
```
R#  Result: PASS | PASS-WITH-NOTES | FAIL | CRASH
    Execute: __s   Max recovery tier: __   LLM calls at runtime: __ (must be 0 except R7 notes)
    Evidence: screenshot / events.jsonl excerpt / recovery log excerpt
```

Exit criteria: R1, R2, R5, R6 pass outright; R2's zero-result probe and R4 fail loudly and
honestly; R7 clean refusals; R8 flat memory + run 8 ≈ run 1.
**Where misses go:** TEST-12; wrong-row removal → PROD-3 immediately; governance/evidence gaps →
PROD-18; budget poisoning → W-4 follow-up. Promote to `runtime/test/gate-skill/` after three
consecutive passes.

---

## WF-10 — Environment chaos + input-data edge cases

Run chaos against a known-good skill (WF-4 Leg B checkout works well).

### Chaos matrix (Suite G)
| # | Chaos | Steps | Expected |
|---|---|---|---|
| G.1 | Slow network (Slow 3G) | execute known-good skill | Slower but completes; sane timeouts |
| G.2 | Kill network mid-run (drop Wi-Fi at step ~3, restore 30 s) | | Clean failure w/ actionable error OR resilient resume; never zombie browser |
| G.3 | Kill browser mid-run (terminate Chromium ~step 5) | | Clean failure; next run spawns fresh |
| G.4 | Concurrent runs (two skills simultaneously) | | No instance collision, no tracker races |
| G.5 | Cancel mid-flight (`cancel_execution` half-way) | | Prompt stop, browser cleaned, status correct, partial telemetry |
| G.6 | Fatigue ×10 (checkout ten times back-to-back) | | No state leakage (cart/cookies), no memory growth, batches match |
| G.7 | Sleep/resume machine mid-execution, wake after 2 min | | Defined behavior — timeout error or resume, not eternal hang |

Log per test: observed behavior, leftover processes (`Get-Process chrome,node`), tracker counts vs
executions.

### Input edge cases (Suite H)
Take any packaged skill with a text input; feed via `execute_skill`:

| # | Input | Expectation |
|---|---|---|
| H.1 | `""` empty | Clear validation error, no execution |
| H.2 | `"   "` spaces only | Defined: reject or trim |
| H.3 | 10,000-char string | No crash; truncate or reject sensibly |
| H.4 | `日本語 🎉 café` unicode+emoji | Typed correctly into target field |
| H.5 | `<script>alert(1)</script>'; DROP TABLE users--` | Literal text only in target app; nothing executed locally |
| H.6 | Newlines + tabs | Defined behavior |
| H.7 | `007` / `1e5` / `-0` | Not coerced/mangled |
| H.8 | Missing required input entirely | Clear guidance via `get_skill_inputs` beforehand |

Also verify `get_skill_inputs` declares fields properly so a customer's agent knows what to supply.

---

## WF-11 — Cloud & entitlement gates (plan-tier limits)

Backend locally: `cd conxa-cloud/backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
Grab a Clerk JWT from frontend dev-server network tab; admin token from `CONXA_ADMIN_TOKEN`.
Source of truth before/after every test:
```powershell
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/entitlements/current"
```
Change plan without payment:
```powershell
curl.exe -s -X POST "$BASE/entitlements/admin/billing" -H "Authorization: $ADMIN" `
  -H "Content-Type: application/json" -d '{"workspace_id":"<org_xxx>","plan":"free"}'
```
(`duration_days` optional; Enterprise "unlimited" means admin-set overrides — out-of-box 0/None,
test that too.)

### Tests (run each across Free → Starter → Pro → Enterprise)
| # | Test | Gate / expected error (HTTP) | Key steps & sub-checks |
|---|---|---|---|
| 1 | Compile credits exhaust | `reserve_compile_credit` → 402 `compile_credit_limit_exceeded` | Reserve unique IDs till limit (Free @25). Sub-tests: same ID twice idempotent (counted once); release returns credit; commit counts permanently; reservation TTL expiry (~30 min / lower TTL) |
| 2 | Human-edit token pool | `ensure_human_edit_available` → 402 `human_edit_pool_exceeded` | Burn 500k via proxy `usage_class:"human_edit"`; compile-class must stay unaffected (separate pools) |
| 3 | Machine limit | `ensure_machine_slot` → 402 `machine_limit_exceeded` | device-A allowed, device-B blocked @Free; machines list reflects; revoke frees slot; revoked device counts brand-new again; Starter @3 |
| 4 | Seat limit | `ensure_seats_available` → 402 `seat_limit_exceeded` | 4th Clerk-org member blocked; existing members keep working; unlimited plan fine. NOTE: fails OPEN if Clerk unreachable |
| 5 | Workflow cap / soft-lock | 402 `workflow_limit_exceeded` / `workflow_locked` | Publish #26 @Free fails; REPUBLISHING active workflow still OK at cap; Pro→Starter downgrade locks oldest-first; locked republish fails, upgrade unlocks automatically |
| 6 | Trial expiry (30 d) | `trial_expired` 402 | Backdate `trial_started_at` → builds blocked; sync + tracking KEEP working (execution is local); paid plans never expire |
| 7 | Distribution ladder | `distribution_not_permitted` 402 | External installer upload blocked Free/Starter, internal OK; external OK on Pro |
| 8 | White-label | `white_label_not_permitted` 402 | Blocked on Pro, allowed Enterprise |
| 9 | Ops tier | `ops_tier_required` **403** | audit-events/tracking dashboard/drift blocked @Free(none); basic-only @Starter; all pass Pro/Enterprise |
| 10 | Timed grant expiry | `plan_expires_at` honored | Pro for 1 day → auto-reverts to free limits without a downgrade job; Cashfree subs unaffected |
| 11 | Analytics retention | cutoff filter | Free 0 days hides everything; Starter 90 d shows recent; null override = unlimited |
| 12 | Compile pool routing | provider pool choice | Debug-log router: Free → free pool, Starter+ → premium pool |
| 13 | BYOK | `byok_enabled_for` | PUT /byok Azure deployment blocked ≤Pro, allowed Enterprise |
| 14 | Add-on stacking | billing addons | `credits_addon_20=1` on exhausted Free → 25+20 credits, 500k+200k tokens; reserving past old limit works; deactivate drops limits, usage stays used |
| 15 | Kill switches | env toggles default TRUE | Each `ENTITLEMENTS_ENFORCE_*`=false disables its gate; restore true → blocking resumes. Fresh deploy with no env MUST enforce everything |

Matrix quick view: compile ✅@25/@200/@500/no-block*; machines/seats/workflows same shape;
external distro ❌❌✅✅; white-label ❌❌❌✅; ops ❌/basic/✅/✅ (*Enterprise needs explicit numeric overrides — verify un-overridden Enterprise behaves sanely rather than blocking everything).

Error-code rule of thumb: payment-shaped limits → **402**; capability/permission → **403**.
Gotchas: meter says unlimited = None limit; stale plan = `billing_for()` cache (restart backend
after manual KV edits); stuck reservation = TTL; compile test won't trip = leftover kill-switch false.

Folded-in Suite J: invalid company token → clear re-registration prompt, not stack trace;
telemetry under fire — 20 rapid executions → `/tracking/{co}/events` batches match, no dupes/loss.

---

## WF-12 — Production-readiness go / no-go checklist

Full-system pass before calling Conxa production-ready. Clean Windows VM simulates the customer.
Accounts needed: company owner, team member, fresh customer. Tick in order; on failure stop, note
in Issues, fix, restart from that step.

### Phase 1 — Cloud backend health
- `/healthz` 200; `/readyz` 200 (DB ping — if 5xx DO NOT proceed, deploy gate depends on it).
- Render started cleanly with `SKILL_AUTH_REQUIRED=true`: DB URL, Clerk issuer/JWKS, CORS,
  Cashfree creds, ≥1 LLM key present.
- NO filesystem-DB fallback line in production logs.

### Phase 2 — Frontend
Dashboard loads <5 s, no console errors; owner login works; logout/login as member; visit every
screen (Dashboard, Skill Packages, Billing, Team, Settings) without crashes/blank data.

### Phase 3 — Auth & team
Owner can invite/change-role/remove. Member cannot see owner actions nor fetch owner URLs directly.
No-token and garbage-token API calls → 401.

### Phase 4 — Studio core flow
App launches, Python backend clean; Clerk PKCE login persists across app restart (keyring).
Record 4–6 actions on a practice site → all events appear in order. Compile clean; report has
selectors, sensible confidence, assertions after submit. Editor re-target of one step passes patch
gate. Build `.exe` installer → bundle contains **NO `auth/auth.json`, NO storageState, NO
credentials of any kind** 🚨 (any hit = hard blocker, STOP).

### Phase 5 — Publish & hosting
Publish succeeds; pack appears in dashboard Skill Packages; hosted content matches compile;
version number correct.

### Phase 6 — Customer simulation
Install downloaded `.exe` on the clean VM; `~/.conxa/` contains host exe + `conxa-app/`;
`version.json` correct; per-company token auth works. Sync pulls published packs atomically
(SHA-256 match). Via MCP: `list_skills` / `get_skill_inputs` / `execute_skill` valid inputs →
browser opens, completes; `get_execution_status` success. Recovery spot-check: renamed button →
L1/L2 heals with zero tokens; truly missing element → graceful typed error, no silent hang.
Telemetry arrives at tracking endpoint with success/failure counts.

### Phase 7 — Billing (Cashfree sandbox)
Buy plan with test card → webhook fires → Billing screen updates. Free-plan limit hit → clear
upgrade message; after upgrade limit lifts. Failing card → clear error, plan NOT upgraded, no
partial state.

### Phase 8 — Auto-updates
Newer `app-vX.Y.Z` manifest → runtime polls, downloads, loads; `min_host` respected; simulated bad
update → rollback to previous versioned dir. Host version bump flows through manifest/installer.
Dev→stable promotion validates Ed25519 signatures; stable customers receive it.

### Phase 9 — Security spot checks
Routes under `/api/v1` (except documented tracking exception); expired JWTs rejected; runtime
session files AES-GCM ciphertext; Company A cannot fetch Company B packs (swap tokens to prove);
LLM proxy rejects unauthenticated; no API keys in built frontend JS.

### Phase 10 — Performance smoke
Same skill ×10 — all pass, no RAM creep. Three different skills back-to-back — no state bleed.
`/healthz` ×50 fast 200s. LONG workflow (20+) full chain works. Browser killed mid-execution →
clear error, no crash.

### Final gate
All boxes ticked or fixed-and-retested; clean-machine tested; telemetry matches the session.
**Hard blockers (any ONE = NO-GO):** credentials in build output · `/readyz` failing · FS-DB
fallback active · cross-company leakage · Tier 1/2 burning tokens · broken update rollback.

Test Run Info + Issues Found tables: fill date/tester/versions and log issues with severity and
fix status; sign GO/NO-GO at the bottom of the run.

---

## What to watch for across ALL workflows (known gaps these tests exercise)

- **Tab-landing correctness** — next action after any switch lands in the expected tab (EXEC-5 #43).
- **Download/upload verification** — runtime waits for download completion; confirms upload success
  rather than fire-and-forget (EXEC-5 #31/#32).
- **Recovery tier ceiling** — more than a couple of Tier 3 escalations on stable demo sites = red flag.
- **Long-run stability** — degradation past ~step 25 (memory, stale frame refs, iframe offsets).
- **Compile step count** — truncation above 30 steps at compile, separate from runtime replay.
- **File identity in loops** — each upload carries ITS OWN iteration's file, not a loose match.
- **Branch discipline (WF-6)** — conditional steps never escalate or spend tokens; unknown step
  types skipped silently by old runtimes (the manifest floor's reason to exist).

## Confirmed-by-design limitations (behave AS DESIGNED, not worse)

1. CAPTCHA/OTP not automatable — graceful handoff (WF-2/E.13-14 analogs, WF-9 R7).
2. Canvas apps can't build identity — clean error, not hang (WF-9 R7).
3. Tier 1/2 deterministic only — no silent LLM fallback (verify zero proxy calls in WF-7).
4. `frame_enter`/`frame_exit` never retried — fail fast, no hang (WF-2 Segments D/E).
5. Cloud never compiles/executes — only telemetry/sync leaves the machine.
6. Tracking endpoint outside `/api/v1` — known tracked exception, not a discovery.
7. Host exe stays `--no-bytecode` — Playwright segfault in ANY runtime test → suspect this first.
8. Margin gate may refuse valid-looking clicks — false negatives ARE the design (fail-safe over
   wrong-click); distinguish "refused safely" from "broken".

New limitations found → results log → `TODO.md`. Doc contradictions → update `docs/TRD.md` /
`docs/App-Flow.md`. After your session append findings to `FIX.md`.
