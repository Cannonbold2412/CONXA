# Conxa Manual Stress-Test & Edge-Case Guide (with real target sites)

**Purpose:** You will run these workflows **by hand**, following the exact steps below. Each test does one of three things:

1. **BREAK** the system — find workflows that don't work.
2. **STRESS** the system — find where it degrades or hits limits.
3. **SHOWCASE** the system — prove advantages (100+ step workflows, self-healing, zero-token recovery) that justify the product.

Every test names a **real, free website** with credentials where needed. All listed sites are public automation-practice or demo sites — safe to record against.

Work top to bottom. Do NOT skip Suite A — everything else is measured against it.

---

## Table of Contents

- [0. Setup + your test-site arsenal](#0-setup--your-test-site-arsenal)
- [How to log results](#how-to-log-results)
- [Suite A — Baseline sanity](#suite-a--baseline-sanity)
- [Suite B — Scale stress (the 100+ step showcase)](#suite-b--scale-stress-the-100-step-showcase)
- [Suite C — Element identity edge cases](#suite-c--element-identity-edge-cases)
- [Suite D — Self-healing & recovery (the killer advantage)](#suite-d--self-healing--recovery-the-killer-advantage)
- [Suite E — Structural edge cases](#suite-e--structural-edge-cases)
- [Suite F — Site-type torture tests](#suite-f--site-type-torture-tests)
- [Suite G — Environment chaos](#suite-g--environment-chaos)
- [Suite H — Input data edge cases](#suite-h--input-data-edge-cases)
- [Suite I — Sync, update & packaging](#suite-i--sync-update--packaging)
- [Suite J — Cloud & entitlement gates](#suite-j--cloud--entitlement-gates)
- [Advantage scorecard](#advantage-scorecard)
- [Known limitations to CONFIRM (not discover)](#known-limitations-to-confirm-not-discover)

---

## 0. Setup + your test-site arsenal

### Studio setup
1. Launch Build Studio: `cd conxa-builder/electron && npm run dev`
2. Sign in via Clerk (browser opens → token stored in OS keyring).
3. Create these groups on the Group Page (`/groups/:id`): `TEST-A`, `TEST-B`, `TEST-C`, `TEST-D`, `TEST-E`, `TEST-F`, `TEST-H`.
4. Complete the **auth step once per group** where noted (auth is per-group).
5. Confirm runtime installed; `list_skills` works from your MCP client.
6. Keep a terminal tailing `data/sessions/<id>/events.jsonl` as evidence.

### The arsenal — bookmark all of these

| # | Site | URL | Login | What it's for |
|---|---|---|---|---|
| S1 | The Internet (practice suite) | https://the-internet.herokuapp.com | form auth: `tomsmith` / `SuperSecretPassword!` | iframes, hovers, drag-drop, alerts, popups, uploads/downloads, dynamic loading, infinite scroll |
| S2 | UI Test Automation Playground | https://ui-test-automation-playground.blogspot.com/ | none | dynamic IDs, changing text, class attributes, AJAX |
| S3 | DemoQA | https://demoqa.com | none | forms, date picker, select menu, draggable, upload |
| S4 | jQuery UI demos | https://jqueryui.com | none | autocomplete, datepicker, menus (inside iframes!) |
| S5 | SauceDemo (e-commerce) | https://www.saucedemo.com | `standard_user` / `secret_sauce` | full checkout flow, 100-step loops |
| S6 | ParaBank (banking) | https://parabank.parasoft.com | `john` / `demo` | multi-page banking flows, tables, 100+ steps |
| S7 | Computer Database | https://computer-database.gatling.io | none | CRUD + pagination loop → perfect 100-step generator |
| S8 | OrangeHRM demo (SPA dashboard) | https://opensource-demo.orangehrmlive.com | `Admin` / `admin123` | heavy React SPA, hover menus, modals |
| S9 | OWASP Juice Shop (e-commerce) | https://demo.owasp-juice.shop | register free | search, filters, reviews, SPA |
| S10 | DataTables demo | https://datatables.net/examples/data_sources/dom.html | none | sortable/paginated/searchable table |
| S11 | Wikipedia | https://www.wikipedia.org | none | i18n switcher, stable DOM control site |
| S12 | Excalidraw (canvas app) | https://excalidraw.com | none | canvas-based app — expected failure case |
| S13 | reCAPTCHA demo page | https://www.google.com/recaptcha/api2/demo | none | CAPTCHA boundary test |
| S14 | AutomationExercise | https://www.automationexercise.com | register free | e-commerce with signup + contact form |

> If any herokuapp/freebie is down the day you test, swap: S1 alternates include https://qaautomationpractice.com and sections of S3.

---

## How to log results

```
[Suite-X.N] <name>
Target: <site>
Result: PASS | DEGRADED | FAIL | CRASH | N/A
Time to record: __s   Time to compile: __s   Time to execute: __s
LLM calls visible in compile log: __
Evidence: screenshot path / events.jsonl excerpt / error text
Notes:
```

`DEGRADED` = finished but with warnings/retries/fallbacks. These are gold — they're your roadmap.

---

## Suite A — Baseline sanity

### A.1 — Trivial click-through
**Target:** S11 Wikipedia (stable DOM — your control site)

1. New Workflow `a1-wiki-nav`, target URL `https://en.wikipedia.org/wiki/Main_Page`.
2. Record: click "Random article" in sidebar → click first link in the article body → stop recording.
3. Compile → open Review → confirm selectors are NOT raw dynamic IDs.
4. Test-run in Studio → build package → install → `execute_skill` via MCP.

**PASS:** end-to-end clean, assertions pass, telemetry event visible in cloud.
**FAIL:** any manual fix needed on something this simple.

### A.2 — Simple login workflow ⭐ security check
**Target:** S1 → https://the-internet.herokuapp.com/login

1. Record: type `tomsmith` into Username → `SuperSecretPassword!` into Password → click "Login" → wait until "You logged into a secure area!" flash appears.
2. Compile and package.
3. **Open the generated bundle folder and grep its files for `SuperSecretPassword`.**
   - Found = **CRITICAL**: auth exclusion invariant broken (`skill_package_builder.py`). Stop testing.
4. Execute via MCP. Expect success flash assertion passes.

### A.3 — Form fill with varied field types
**Target:** S3 DemoQA → Text Box + Practice Form pages (`https://demoqa.com/text-box`, `https://demoqa.com/automation-practice-form`)

1. Record on `/text-box`: fill Full Name, Email, Current Address → Submit → verify output block shows entered name.
2. Separately record on `/automation-practice-form`: pick a radio (Gender), checkbox (Hobbies), native `<select>` (Subject dropdown is a combobox — just note behavior), click Submit.
3. Compile both, note which fields recorded cleanly.

**Watch:** native `<select>` vs custom JS dropdowns behave differently — custom ones are E.6.

---

## Suite B — Scale stress (the 100+ step showcase)

### B.1 — 50-step warm-up
**Target:** S7 Computer Database

1. Workflow `b1-computer-search`, URL `https://computer-database.gatling.io`.
2. Record ONE take (~50 actions): search "Apple" → open first result → back → filter "IBM" → open → back → add 5 new computers via "Add a new computer" (name + introduced date + company dropdown each time ≈ 8 actions per computer) → delete 2 of them.
3. Note: recorder responsiveness, any dropped events.
4. Compile — measure wall time + LLM call count from the compile log.
5. Package + execute. Count first-try step successes.

**PASS:** ≥95% clean execution, no silent degradation warnings during compile.

### B.2 — The 100+ step flagship ⭐ headline advantage
**Target:** S5 SauceDemo (fast, reliable, no flakiness)

1. Workflow `b2-sauce-loop`, URL `https://www.saucedemo.com`.
2. Record ONE continuous take of this loop **6 times without pausing** (≈120 actions):
   - login (`standard_user` / `secret_sauce`) *(only 1st iteration)*
   - sort products Z→A (dropdown)
   - "Add to cart" on 2 products
   - cart badge → Cart page → "Remove" one item → "Continue Shopping"
3. After the 6th loop, finish with full checkout: cart → Checkout → fill First/Last/Zip → Continue → Finish → "Thank you" assertion → logout.
4. Compile. Open Review editor and inspect:
   - Were repeated loops deduplicated by the pipeline or left flat?
   - Do per-step LLM intents still read sensibly at this length?
5. Package + execute end-to-end. Time it.
6. **Do the same task manually once with a stopwatch** — that's your comparison number.

Record:

| Metric | Value |
|---|---|
| Recorded events / steps after normalize+dedupe | |
| Compile wall time / LLM calls | |
| Execution wall time | |
| First-try success rate | |
| Manual time for same task | |
| Human Edit needed? | |

**The pitch being validated:** agent does it live = tokens every run + drift; human = ~20 min/run; compiled skill = replays forever after one compile.

### B.3 — Compile determinism at scale
Re-compile B.2's session via `conxa-cloud/scripts/recompile_session.py <session_id>` and diff fingerprints/selectors between the two SkillPackages.

**PASS:** identical fingerprints (stable hash strips dynamic classes). **FAIL:** differing selectors = nondeterminism in IdentityBundle/grammar.

### B.4 — Banking marathon (100+ steps across many pages)
**Target:** S6 ParaBank (`john` / `demo`)

1. Record one take: login → Accounts Overview → Transfer Funds ×3 (different amounts, verify confirmation each) → Pay Bills ×2 (payee dropdown + amount + verify) → Find Transactions (by date range → by amount) → Open New Account → logout. Naturally lands at 100–140 actions.
2. Compile + execute. This tests scale **across many different page types**, unlike B.2's repetitive loop.

---

## Suite C — Element identity edge cases

### C.1 — Dynamic IDs
**Target:** S2 → https://ui-test-automation-playground.blogspot.com/p/dynamic-id.html (button ID changes every load)

1. Record clicking the blue "Button with Dynamic ID".
2. Compile → inspect selector: must NOT contain the captured ID string.
3. Execute twice — second run faces a fresh ID.

**FAIL if run 2 misses:** dynamic ID leaked through stable_hash stripping.

### C.2 — Duplicate look-alike elements ⭐ resolver margin gate
**Target:** S10 DataTables demo (60+ identical rows) AND S1 tables page

1. On `https://datatables.net/examples/data_sources/dom.html`: record clicking row #7's name link (rows look identical).
2. Also on `https://the-internet.herokuapp.com/tables`: record clicking "edit" on employee **#3 of 4** (identical buttons per row).
3. Compile → check selectors disambiguate (nth/text-in-container/relational anchor).
4. Execute. Did it hit the right row?

**This directly exercises the margin gate** — watch resolve logs for candidate scores and the 0.15 uniqueMargin decision. **Worst-case bug = silently clicks the WRONG row successfully.**

### C.3 — Text that changes
**Target:** S2 → "Text Input" page (button name changes when typed into)

1. On the playground's Text Input page: record typing "Conxa" then clicking "Button That Changes Name".
2. Execute — button label differs at runtime.

**Expected:** Tier 1–2 recovery heals it at zero tokens. Log which tier fired.

### C.4 — Moved element (same page, new position)
**Target:** S3 DemoQA → Elements section vs Widgets section, or any collapsible layout
Simplest controlled version: use a local HTML file — put a button top-left, compile a click on it, then edit the HTML to move it inside a collapsed sidebar and re-run.

**Expected:** positional signals degrade, role/text signals carry it. If it fails, position was weighted too high.

### C.5 — Hidden-until-later elements
**Target:** S1 → https://the-internet.herokuapp.com/dynamic_loading/1 (hidden div appears after 2s) and `/dynamic_loading/2` (element added after load)

1. Record: click Start → wait → click/assert "Hello World!".
2. Compile + execute. Then execute again with artificial network throttling (G.1 conditions).

**Watch:** wait strategy generalization — does it poll or replay a fixed recorded delay?

### C.6 — Shadow DOM
**Target:** S1 → https://the-internet.herokuapp.com/shadow_content, plus any site embedding a shadow-DOM chat widget

1. Record interaction with content inside the shadow root.
2. Note separately what happens at RECORD time vs EXECUTE time.

**Expect possible gap** — document exactly where the chain breaks if so.

---

## Suite D — Self-healing & recovery (the killer advantage)

Best done against a local HTML file (full control) or S1/S2 pages combined with manual edits between runs.

### D.1 — Rename the target ⭐ zero-token showcase
1. Create `test.html` locally: a page with a button labeled "Submit" (+ heading + 2 other buttons).
2. Build Studio → New Workflow → target `file:///C:/.../test.html`. Record 5 steps: click heading → click Submit → assert some text changes.
3. Compile + package + install.
4. Edit `test.html`: change label to "Confirm". Keep role/testid.
5. Execute the OLD skill.

**Measure:** recovered? Which tier? **Zero proxy calls expected** (Tier 1/2 are LLM-free — verify in logs). Recovery latency?

### D.2 — Move element to another container
Same setup; wrap the button in a different `<div>` section. Relational/positional signals get tested live.

### D.3 — Break past healing (Tier 3 boundary)
Change label AND structure AND remove testid. Expect Tier 1–2 exhaustion → describe-and-match escalation.

**Measure:** clean escalation, or crash/hang before Tier 3? Clear final error when everything fails?

### D.4 — Wrong page entirely
Execute the skill while the browser sits on an unrelated URL.

**Expected:** skill navigates itself (first step is navigation) OR fast clear failure — never a silent wrong-element click.

### D.5 — Slow-rendering element
Add `setTimeout` 5000ms before the button renders in `test.html`. Execute.

**Watch:** retry/wait tuning vs premature failure.

### D.6 — Live-site version of D.1
S9 Juice Shop: record clicking a product card, then (site updates occasionally) or simulate by using a different product sort order before executing — element positions shuffle but identity should hold.

### D.7 — Recovery cost audit (business case)
Tally across D.1–D.6: recoveries, tiers used, tokens consumed. Your claim = most breakage heals at zero marginal cost. Frequent Tier 3 hits = durability scoring needs work.

---

## Suite E — Structural edge cases

### E.1 — Iframe workflow ⭐ verify chain preservation
**Target:** S1 → https://the-internet.herokuapp.com/iframe (TinyMCE inside iframe)

1. Record: click bold button in parent toolbar area → click INTO the editor iframe → type "Hello from Conxa" → select-all → click Bold.
2. Compile → Review: `frame_enter`/`frame_exit` markers present? Chain verbatim?
3. Execute. Verify text actually formatted.

**Invariant checks:** frame markers get `no_recovery_block`; transient failure there fails fast instead of hanging.

### E.2 — Nested iframes ⭐ offset accumulation
**Target:** S1 → https://the-internet.herokuapp.com/nested_frames (frames within frames)

1. Record: click inside LEFT frame → click inside BOTTOM frame (parent chain differs).
2. Compile + execute. Clicks must land pixel-correct (offsets accumulate up the parent chain).

Also try S4 jQuery UI autocomplete demo (`https://jqueryui.com/autocomplete/`) — the demo widget lives inside an iframe, so it doubles as an iframe+typeahead combo test.

### E.3 — New tab / popup
**Target:** S1 → https://the-internet.herokuapp.com/windows and `/multiple_windows`

1. Record: click "Click Here" (opens new tab) → interact in the new tab (assert "New Window") → close tab → back on original.
2. Compile + execute.

**Common blind spot** — log exactly what the recorder captured about context switches.

### E.4 — File download
**Target:** S1 → https://the-internet.herokuapp.com/download

1. Record clicking any file link.
2. Execute. Does it hang waiting? Where does the file land? Is completion detected?

### E.5 — File upload
**Target:** S1 → https://the-internet.herokuapp.com/upload (or S3 DemoQA upload)

1. Record choosing a file (e.g., `C:\temp\conxa-test.png`).
2. Execute with same path. Then execute passing a DIFFERENT path via `get_skill_inputs`.

**Key question:** is the path parameterized or baked from your machine?

### E.6 — Custom dropdown / typeahead autocomplete
**Targets:** S4 https://jqueryui.com/autocomplete/ (type "ja", pick "JavaScript") and S3 https://demoqa.com/select-menu (custom Select2-style dropdowns)

1. Record: click field → type partial → wait for options → click suggestion.
2. Compile + execute twice.

**Watch:** race between typing and async option render; fixed recorded timing vs adaptive waiting.

### E.7 — Infinite scroll
**Target:** S1 → https://the-internet.herokuapp.com/infinite_scroll

1. Record: scroll 4 screens down → click the paragraph text that appeared last.
2. Compile + execute.

**Watch:** are wheel/scroll gestures even recorded? Is the lazy-loaded element resolvable?

### E.8 — Hover menus
**Targets:** S1 → https://the-internet.herokuapp.com/hovers ; S8 OrangeHRM Admin menu (hover-reveal submenus)

1. Record: hover avatar 2 → click "View profile". And on OrangeHRM: hover Admin → PIM → click Add Employee.
2. Compile + execute.

### E.9 — Drag and drop
**Target:** S1 → https://the-internet.herokuapp.com/drag_and_drop ; S3 https://demoqa.com/sortable

1. Record dragging box A onto box B. And sorting item 5 to position 1.
2. Compile + execute.

**Expect likely gap** — quantify the failure mode precisely.

### E.10 — Date picker
**Targets:** S4 https://jqueryui.com/datepicker/ (navigate next month ×2, pick day 15); S3 https://demoqa.com/date-picker (range picker)

1. Record the full calendar navigation.
2. Compile + execute. Then change the target month in inputs and re-execute — does it generalize or only replay the exact recorded months?

### E.11 — Canvas-based app ⚠️ expected limitation
**Target:** S12 Excalidraw (also consider photopea.com)

1. Attempt to record: draw rectangle tool → draw on canvas → switch tool.
2. Note what gets captured (probably nothing meaningful — canvas has no DOM elements to build identity from).
3. Document what the error/experience looks like — customers WILL ask about Miro/Figma-like targets.

### E.12 — Native alerts/dialogs
**Target:** S1 → https://the-internet.herokuapp.com/javascript_alerts

1. Record: JS Alert → accept; JS Confirm → accept; JS Prompt → type text → accept.
2. Compile + execute; verify result assertions ("You clicked: Ok", typed text echoed).

### E.13 — CAPTCHA boundary ⚠️ deliberate
**Target:** S13 https://www.google.com/recaptcha/api2/demo

1. Record filling the text field → attempt to tick "I'm not a robot".
2. Observe: recorder behavior at CAPTCHA, compile result, execution behavior.

**Expected:** clean stop / human-handoff — NEVER an attempt to solve. Document actual behavior; it's a sales-conversation point either way.

### E.14 — OTP flow boundary
Use S14 AutomationExercise signup with a temp-mail inbox (mailinator.com): record up to receiving an OTP/email verification. Same expectation as E.13: graceful pause/handoff.

---

## Suite F — Site-type torture tests

### F.1 — Heavy SPA CRUD
**Target:** S8 OrangeHRM (`Admin` / `admin123`)

Full loop: Dashboard → Admin → User Management → Add (fill form, save) → search the new user → edit it → delete it → confirm toast disappears. Toasts auto-dismiss in ~3s — do assertions catch them?

**Watch:** SPA route changes without reload; recorded waits surviving.

### F.2 — Paginated table workflow
**Target:** S7 Computer Database + S10 DataTables

1. Record: search "IBM" → sort by name → go to page 2 → open row → extract value → back → repeat with "Apple" and "RCA".
2. Compile + execute.

**Watch:** sort order shifting indices between record and run (ties into C.2 wrong-row risk).

### F.3 — E-commerce checkout end-to-end ⭐ money demo
**Target:** S5 SauceDemo full journey

Record: login → apply price low→high filter → add 3 cheapest items → cart → checkout → info form → verify total math → Finish → "THANK YOU FOR YOUR ORDER" assertion → logout. Package and execute 3× consecutively (also feeds G.6).

### F.4 — Multi-site relay workflow
One workflow spanning two domains:

1. Record: S14 AutomationExercise — search "tshirt", note a price → then navigate to S11 Wikipedia → search the term → assert page loaded.
2. Compile + execute. Tests auth/state handling across navigations.

### F.5 — i18n flip
**Target:** S11 Wikipedia

1. Record on English Wikipedia: search "Automation" → click first result → assert heading.
2. Execute the SAME skill against `https://de.wikipedia.org` (German) — either parameterize the base URL or record a second nav step manually before running.

**Directly tests text-signal weight in identity.** Note which non-textual signals saved it (or didn't).

### F.6 — Reviews / star ratings / dynamic widgets
**Target:** S9 Juice Shop — leave a product review (popup modal + star click + textarea + submit), then read the review back in the list.

---

## Suite G — Environment chaos

Run these against a known-good skill (F.3 SauceDemo checkout works well).

| # | Chaos | Steps | Expected |
|---|---|---|---|
| G.1 | Slow network | Throttle to Slow 3G (DevTools → Network conditions, or OS-level tool) → execute | Slower but completes; timeouts tuned sanely |
| G.2 | Kill network mid-run | Start skill → drop Wi-Fi at step ~3 → restore after 30s | Clean failure w/ actionable error OR resilient resume; never zombie browser |
| G.3 | Kill browser mid-run | Terminate Chromium process at step ~5 | Clean failure; next run spawns fresh fine |
| G.4 | Concurrent runs | Fire two `execute_skill` calls (different skills) simultaneously | No browser-instance collision, no tracker races |
| G.5 | Cancel mid-flight | `cancel_execution` halfway through B.2 | Prompt stop, browser cleaned, status correct, telemetry shows partial |
| G.6 | Fatigue ×10 | Run F.3 ten times back-to-back | No state leakage (cart leftovers, cookies), no memory growth, telemetry batches match |
| G.7 | Sleep/resume | Sleep machine mid-execution, wake after 2 min | Defined behavior — timeout error or resume, not hang forever |

Log per test: observed behavior, leftover processes (`Get-Process chrome,node`), tracker counts vs executions.

---

## Suite H — Input data edge cases

Take any packaged skill with a text input (F.3's zip code or A.2's username). Run `execute_skill` feeding each value:

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

Also verify `get_skill_inputs` declares fields properly so a customer's agent knows what to provide.

---

## Suite I — Sync, update & packaging

| # | Test | Steps | Expected |
|---|---|---|---|
| I.1 | Delta sync | Install pack → republish with ONE workflow changed → `refresh_skills` | Only changed artifact downloaded (check sync logs); atomic SHA-256 write |
| I.2 | Interrupted sync | Kill runtime mid-refresh → restart | Partial/corrupt packs don't load |
| I.3 | Self-update | Trigger app-layer update (`app-vX.Y.Z`); simulate bad layer | min_host gate respected; rollback to previous versioned dir fires |
| I.4 | Cold-machine installer | Take generated `.exe` to a never-seen-Conxa machine; full install | Note every friction point + AV/SmartScreen warnings — real customer drop-offs |
| I.5 | Auth exclusion audit ⭐ | Grep ALL today's bundles/installers for passwords, storageState cookies, tokens, `auth.json` | ANY leak = CRITICAL, fix first |

For I.5 specifically grep for strings you typed during A.2/B.2/F.3 recordings (`SuperSecretPassword`, `standard_user`, `secret_sauce`, your OrangeHRM password).

---

## Suite J — Cloud & entitlement gates

| # | Test | Steps | Expected |
|---|---|---|---|
| J.1 | Trial limits | On trial workspace: publish/build until hitting machines/distribution/compile gates | Clear blocking messaging |
| J.2 | Seat limit | Invite teammates past plan limit → new user attempts first use | Blocked with "seat limit reached"; existing users unaffected |
| J.3 | Invalid company token | Corrupt keytar token / revoke server-side → execute skill | Clear auth error prompting re-registration, not stack trace |
| J.4 | Telemetry under fire | 20 rapid executions → check `/tracking/{co}/events` batches | Counts match executions, no dupes/losses |

---

## Advantage scorecard

Fill in after testing — becomes your demo script and marketing evidence.

| Claim | Test(s) | Evidence | Verdict |
|---|---|---|---|
| Handles 100+ step workflows in one compile | B.2, B.4 | steps/time/success rate | |
| One compile = infinite replays vs agents burning tokens per run | B.2 vs manual stopwatch | minutes saved/run | |
| Self-healing at ZERO LLM tokens (Tier 1/2) | D.1, D.2, C.3 | tier hit, proxy-call count | |
| Never blindly clicks the wrong element (margin gate) | C.2 | resolution log | |
| Survives dynamic IDs / changing UI | C.1, C.3, D.1 | | |
| Iframe chains preserved record→compile→execute | E.1, E.2 | | |
| Credentials never in packages | A.2, I.5 | grep results | |
| Runs fully local | G.2 | | |
| Deterministic recompiles | B.3 | diff | |
| Delta-sync keeps customer skills fresh | I.1 | bytes transferred | |
| Human fixes once → re-compile (Human Edit loop) | any DEGRADED case | | |

---

## Known limitations to CONFIRM (not discover)

Verify they behave *as designed*, not worse:

1. **CAPTCHA/OTP not automatable** — graceful handoff (E.13, E.14).
2. **Canvas apps can't build identity** — clean error, not hang (E.11).
3. **Tier 1/2 deterministic-only** — no silent LLM fallback; confirm no proxy calls in D.1/D.2 logs.
4. **`frame_enter`/`frame_exit` never retried** — fail fast, no hang (E.1/E.2).
5. **Cloud never compiles/executes** — nothing except telemetry/sync leaves the machine.
6. **Tracking endpoint outside `/api/v1`** — known exception already tracked; not a discovery.
7. **Host exe stays `--no-bytecode`** — if Playwright segfaults in ANY runtime test, suspect a build regression here first.
8. **Resolver margin gate may refuse valid-looking clicks** — occasional false-negatives ARE the design (fail-safe over wrong-click). Distinguish "refused safely" from "broken."

New limitations found → results log → `TODO.md`. Contradicts docs → update `docs/TRD.md` / `docs/App-Flow.md`.

---

## Results log template

```
# Stress-test session — YYYY-MM-DD
Tester:            Build/runtime versions:
Environment:

## Results
[A.1] wiki nav (S11) ................... PASS  (rec 45s / compile 38s / exec 12s)
[A.2] login + cred grep (S1) ........... PASS  (grep CLEAN)
...

## Bugs found (new)
1. [CRITICAL/HIGH/MED/LOW] description — repro — evidence path

## Limitations confirmed
1. ...

## Demo-worthy moments (recordings/screenshots worth keeping)
1. ...
```

---

*After your session: append findings summary to `FIX.md`, add new work to `TODO.md`, and reconcile any doc contradictions.*
