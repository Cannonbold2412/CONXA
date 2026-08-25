# EXEC-10 Test Plan: Long-Chain, Multi-Tab, Cross-Domain Workflows

Companion to `TODO.md` → **EXEC-10** (P0). All sites below are free, need no paid account, and
are either purpose-built for browser-automation testing or have a permanent free tier — no test
data will disappear on you mid-run.

Record each with Build Studio, compile, replay via `conxa_compile/conxa_runtime.py`'s sandbox
staging or a real runtime install, and log results against the checklist at the bottom.

## Results so far

**2026-08-25 — the core EXEC-10 shape (Workflows 1 + 3 + 4 combined) passed in one real run.**
A single recorded workflow ("mega-workflow") spans **42 steps, 6 tabs** (initial + 4 user-opened +
1 site-opened popup) and **6 hosts**, compiled clean (`compile_status: ok`), and replayed
successfully end to end via Build Studio's Run Test (2026-08-25 05:33 local). Per segment:

| Segment | Site(s) | Proves |
|---|---|---|
| Download files from bin A → ZIP download observed | `filebin.net` | Workflow 7 Shape-B *download* side |
| New tab → upload of that file | `demoqa.com/upload-download` | Workflow 1's core handoff — compiled to `{{downloaded_file_2}}` (W-2 binding, no `file_path` input supplied at all) |
| Real `tab_switch` back to tab A (+ browser Back), second download | `filebin.net` | Tab-context landing on return to the initial tab (W-1 / EXEC-5 #43) |
| Third-domain tab → upload #2 | `the-internet.herokuapp.com/upload` | Workflow 4's second leg — bound to `{{downloaded_file_3}}` |
| ~10-step authenticated deploy chain | `dashboard.render.com` | Workflow 2 length stress (cross-domain variant) |
| User-opened tab → site-opened popup → sign-in there | `vercel.com` → `search-engine-5nfe.vercel.app` | Workflow 3 + break test B-1's popup case |

**Precursor (2026-08-23):** two published skills proved the halves separately first — a 9-step
filebin-only download→tab-switch→upload skill (Workflow 1's mechanic, same-domain), and a 22-step
Render→Vercel cross-domain multi-tab skill with both a user-opened tab and a site-opened popup
(Workflows 2+3 aspects). Session log: `docs/archive/sessions/session-ses_fd4e.md`.

**Still open:** the standalone single-domain 30+ step chain (Workflow 2 as written on
`automationexercise.com`); Workflow 5 dynamic elements; Workflow 6's cross-run consistency re-run
(same skill, second file set); Workflow 7 Shape B confirmed only on its download side; the 20-file
identity check (`file #7 uploaded = file #7 downloaded`); and promoting this scenario into
`runtime/test/gate-skill/` as a `gate_replay.js` fixture (see "After testing" below).

## Platforms used

| # | Workflow | Website(s) | Login needed? |
|---|----------|-----------|----------------|
| 1 | Small cross-domain download → upload | `the-internet.herokuapp.com/download` → `demoqa.com/upload-download` | No |
| 2 | Long single-domain chain (30–35 steps) | `automationexercise.com` (dummy e-commerce site) | No (throwaway email at checkout) |
| 3 | Multi-tab, same-domain | `the-internet.herokuapp.com/windows` + `/entry_ad` | No |
| 4 | Full combo: long + multi-tab + cross-domain + file transfer (35–40 steps) | `docs.google.com`/`drive.google.com` (Google Sheets) → `the-internet.herokuapp.com/upload` | Yes — free Google account (no-login alternate below) |
| 5 | Dynamic/self-healing elements bonus | `demoqa.com/automation-practice-form` + `demoqa.com/dynamic-properties` | No |
| 6 | Bulk 20-file transfer, data consistency across separate runs | `github.com` (public repo folder) → `demoqa.com/upload-download` | No |
| 7 | 20 files **in one action** — bulk download + multi-file upload | `filebin.net` (both ends), `tmpfiles.org`, `blueimp.github.io/jQuery-File-Upload` | No |
| 8 | Conditional/branch steps (EXEC-1): `try_dismiss` + `if_present` + `wait_for_one_of` in one skill | `the-internet.herokuapp.com/entry_ad` + `/login` (bonus leg: `/notification_message_rendered`) | No |
| 9 | Recovery-cascade drill: force Tier 2 (free self-heal) and Tier 3 (semantic agent recovery) on purpose | local fixture (`recovery-fixture.html`, served from `localhost` — see the workflow) | No |

- **the-internet.herokuapp.com** — Heroku's "The Internet" test site, purpose-built for browser
  automation practice (file upload/download, multi-window, dynamic content). No account, no
  rate limits.
- **demoqa.com** — QA-practice site with forms, file upload/download, date pickers, cascading
  dropdowns, and elements with intentionally unstable/dynamic attributes (good for selector
  durability testing).
- **automationexercise.com** — a fake e-commerce store built for Selenium/Playwright practice;
  supports a full add-to-cart → checkout flow with dummy payment info, nothing real is charged.
- **Google Sheets/Drive** — the only site needing a real (free) account, used because it gives a
  realistic file-export mechanic (Sheet → download as CSV/XLSX) instead of a static demo link.
  See the no-login alternate at the end of Workflow 4 if you'd rather avoid any signup at all.
- **github.com** — used purely as a source of ≥20 real, distinct, freely downloadable files in
  one folder (any public repo with 20+ files in a directory works, e.g. a large open-source
  repo's `docs/` or `assets/` folder). No account needed to browse or download raw files.
- **filebin.net** — anonymous file "bins". Upload many files at once into a bin, get a bin URL,
  then download them individually *or* download the whole bin as a single ZIP. This makes it the
  only site here that covers both directions of the 20-file case with no account. See Workflow 7.
- **tmpfiles.org**, **blueimp jQuery File Upload demo**, **file.io**,
  **demo.automationtesting.in/FileUpload.html** — additional multi-file upload targets, all
  verified to expose a `<input type="file" multiple>` control (2026-08-16).

---

## Workflow 1 — Cross-domain download → upload (the core EXEC-10 shape)

**Domains:** `the-internet.herokuapp.com` (tab A) → `demoqa.com` (tab B)
**Steps:** ~15–20
**Tabs:** 2

1. Go to `the-internet.herokuapp.com/download`.
2. Download any file listed (triggers a real browser download).
3. Open a new tab, go to `demoqa.com/upload-download`.
4. Use the "Select File" upload control to pick the file just downloaded.
5. Verify the uploaded filename is echoed back on the page.

**What this proves:** the exact download → tab-switch → upload handoff EXEC-10 asks for, with
the smallest possible step count. Start here before attempting the 30–40-step versions —
if this fails, the longer ones will too, cheaper to find out now.

---

## Workflow 2 — Long single-domain chain (step-count stress, no tabs)

**Domain:** `automationexercise.com`
**Steps:** ~30–35
**Tabs:** 1

1. Home → Products → search a product → view product.
2. Add to cart → continue shopping → repeat for 2–3 more products.
3. Go to cart → proceed to checkout.
4. Register/login with a throwaway email → fill address form.
5. Place order → fill dummy payment form → confirm.

**What this proves:** sustained execution at 30+ steps in a single tab — this is where
`RETRY_BUDGET_MAX` and the recovery-tier ceiling actually get exercised over a long run,
independent of any tab-switching complexity. Isolates "does length alone break something"
from "does multi-tab break something."

---

## Workflow 3 — Multi-tab, same-domain, no file transfer (isolates tab-context landing)

**Domain:** `the-internet.herokuapp.com` only
**Steps:** ~15
**Tabs:** 3 (main + 2 opened via "Multiple Windows" page)

1. Go to `/windows`, click "Click Here" — opens tab B.
2. Switch to tab B, read its text, close it.
3. Back on tab A, open `/entry_ad` in a new tab (tab C) via link with `target="_blank"`.
4. Switch to tab C, dismiss the modal, interact with a field.
5. Switch back to tab A and complete one more action.

**What this proves:** the runtime lands actions in the *correct* tab across several
open/close/switch cycles with zero cross-domain noise — isolates EXEC-5 #43 (landed-context
verification) from the file-transfer mechanic in Workflow 1.

---

## Workflow 4 — Full combination: long, multi-tab, cross-domain, with file transfer

**Domains:** `docs.google.com`/`drive.google.com` (free Google account, tab A) →
`the-internet.herokuapp.com` (tab B) → back to tab A
**Steps:** 35–40
**Tabs:** 2, switched multiple times

1. Tab A: create a new Google Sheet, enter a few rows of dummy data.
2. Download it as CSV (File → Download → CSV) — real cross-domain download from Google's
   export endpoint.
3. Open tab B: `the-internet.herokuapp.com/upload`, upload the CSV.
4. Verify the upload success page shows the right filename.
5. Switch back to tab A, edit the sheet again, rename it, download a second file (e.g. XLSX).
6. Switch to tab B again, navigate to `/upload` fresh, upload the second file.
7. Repeat one more small round-trip to pad to 35–40 steps (add a row, re-download, re-upload).

**What this proves:** this is the actual shape EXEC-10 asks for — realistic enterprise pattern
("pull a report from one system, upload it into another"), at full step count, with a real
third-party file-export mechanic instead of a static demo download link. Run this one last,
once Workflows 1–3 each pass individually — if this fails but 1–3 passed, the bug is in
*combining* the mechanics, not any one of them alone.

**No-login alternate:** if you'd rather not use a Google account at all, swap step 2's export
for a second static download from `the-internet.herokuapp.com/download` (pick a different file
than tab B ends up on) and drop steps 1/5/6's Google Sheets edits. Slightly less realistic —
no real third-party export mechanic — but zero signups anywhere in the whole plan.

**Bulk variant (20 files, not just 1–2):** once the small version passes, re-record the same
shape but loop it 20 times instead of 2 — e.g. a public GitHub repo folder with 20+ files as
tab A, `demoqa.com/upload-download` as tab B, download file 1 → upload file 1 → download file
2 → upload file 2 → … × 20 (this is most of your step-count budget on its own, so it can replace
the padding round-trips in steps 5–7 above). This is the scale that actually matters:

- **Identity, not just count.** After the run, check that file #7 uploaded is actually file #7
  downloaded, not file #3 or a duplicate — a loop that just re-clicks "the upload button" and
  "the file input" by position can silently pick the wrong file if the compiled selectors match
  on generic role/position rather than the specific filename bound to that iteration.
- **Determinism, not per-run LLM guessing.** The 20-iteration loop should be handled by the
  compiled step sequence looping over data, not by the LLM re-deciding what to click each time
  — LLM only touches selector generation at compile time and Tier 3+ recovery at runtime (see
  `CLAUDE.md`'s "LLM does not write selector strings on the primary compile path" invariant); a
  bulk run is a good way to confirm that's actually true in practice and the loop isn't secretly
  burning LLM calls per file.

---

## Workflow 5 — Form-heavy chain with dynamic/self-healing elements (bonus, tests IdentityBundle recovery)

**Domain:** `demoqa.com`
**Steps:** ~20–25
**Tabs:** 1

1. Go to `/automation-practice-form`, fill every field (name, email, gender radio, mobile,
   date of birth via the date picker widget, subjects autocomplete, hobbies checkboxes,
   state/city cascading dropdowns).
2. Submit, verify the confirmation modal.
3. Go to `/dynamic-properties`, interact with the button that becomes enabled only after a
   delay, and the one whose color changes after a delay.

**What this proves:** selector durability against dynamic IDs/classes and delayed-enable
elements — good secondary coverage for the compiler's `stable_hash.py` stripping and the
recovery cascade's re-hover tier, using elements this fixture page changes on every load.

---

## Workflow 6 — Cross-run data consistency: does yesterday's files leak into today's run?

**Domains:** `github.com` (a public repo folder, tab A) → `demoqa.com/upload-download` (tab B)
**Steps:** ~25 per run, run twice on two different file sets
**Tabs:** 2

This is the scenario behind your question — same skill, run once with one user's 20 files,
then run again later with a *different* user's 20 files, and check nothing from the first run
bleeds into or gets confused with the second.

1. **Run A:** record/replay the bulk variant of Workflow 4 against one GitHub folder (files
   named e.g. `report-01.pdf` … `report-20.pdf`), uploading each to `demoqa.com`.
2. Note the run's download location — on the runtime, downloaded files land under
   `~/.conxa/downloads/{runId}/` (`runtime/server.js`, `_downloadsDir`), a **fresh folder per
   execution**, not a shared OS Downloads folder. Confirm Run A's files actually landed there
   and not somewhere shared.
3. **Run B (simulating "the next day"):** replay the *same compiled skill* again, this time
   pointed at a different GitHub folder with 20 different files (different names, e.g.
   `invoice-01.pdf` … `invoice-20.pdf`).
4. Verify every file Run B uploads is one of *its own* 20 files — none of Run A's leftover
   `report-*` files should appear anywhere in Run B's uploads.
5. After Run B finishes, check the filesystem: is Run A's `{runId}` download folder from step 2
   still sitting on disk?

**What this proves:** per-run isolation for the *active* run — each execution gets its own
`{runId}` workspace, so Run B can't accidentally pick up Run A's files mid-run.

**Resolved 2026-08-17 (W-7):** cleanup is now handled — `run.js::sweepOldRuns` deletes any
sibling run directory under `{CONXA_DATA_DIR}/runs/` older than `CONXA_RUN_RETENTION_DAYS`
(default 7) at the start of every execution, so files no longer accumulate indefinitely. Confirm
when replaying this workflow: Run A's `{runId}` directory should still exist immediately after
Run B starts (inside the retention window), and should be gone once its age exceeds the
retention window on a later run — see `docs/TRD.md` §7.1 for the mechanism.

---

## Workflow 7 — 20 files at a time (bulk download + multi-file upload)

"Move 20 files, not one" is really **two different mechanics**, and they do not have the same
support status today. Decide which one you're testing before you record — they exercise
completely different code and only one of them works right now.

| | Shape A — 20 files, one at a time | Shape B — 20 files in one action |
|---|---|---|
| What the user does | click download ×20, then upload ×20 (or interleaved) | select 20 files in one file-picker dialog / one "download all" click |
| Compiled shape | 40 steps, each bound to its own filename | 2 steps |
| **Supported today?** | **Yes** | **Yes** — download works if the site zips them; upload takes a folder path (fixed 2026-08-16, see W-8); the zip is now extracted at download time and an upload replays exactly what was recorded — the zip itself, or specific extracted files (EXEC-20, 2026-08-16, superseding the auto-extract-at-upload-time behavior below) |

### Shape A — the unrolled loop (works today, test this first)

Same as Workflow 4's bulk variant. `_bind_downloads_to_uploads` binds each upload to *its own*
earlier download by exact recorded filename, so upload #7 carries download #7 — that binding is
precisely what the "file identity in a loop" check below is verifying against a real recording.

**Best sites for this:**

- **Download source:** `the-internet.herokuapp.com/download` — a flat list of individually
  downloadable files (20 links as of 2026-08-16). It is a *public* upload dir, so the list drifts
  over time; if you need a fixed set that will still be there next month, use a public GitHub
  folder's raw file links instead, or upload your own 20 dummy files to a filebin bin (below) and
  download from that.
- **Upload target:** `demoqa.com/upload-download` is fine here — one file per step is all Shape A
  ever needs.

### Shape B — genuinely 20 at once

- **Download side:** you need a site that turns a multi-select into a *single* archive download.
  `filebin.net` does this with no account: create a bin, drop 20 files in, then "Download files"
  → one ZIP. The runtime handles that fine — it's one `download_observed` of one file. Google
  Drive's multi-select → ZIP behaves the same way but needs a login.
- **Reupload side (resolved 2026-08-17, superseded 2026-08-16 by EXEC-20):** the zip that download
  side hands back is no longer a dead end when the destination wants separate files. Originally
  (EXEC-17) `run.js::resolveUploadPaths` detected a `.zip` upload target and silently extracted it
  before upload; that inference was replaced by EXEC-20 with literal record→replay fidelity —
  extraction now happens the instant the zip is downloaded (both while recording and at replay),
  and an upload step uploads exactly what was picked during recording: the zip itself, or specific
  extracted files. A multi-select recorded upload still sees N files when it matched that zip's
  entire member set. See `docs/TRD.md` §7.1. **Still to confirm:** this has unit coverage
  (`runtime/test/test_upload_zip.js`, `conxa-cloud/tests/test_download_upload_binding.py`,
  `test_recorder_session.py`) but not yet a real recorded Shape-B replay — that's what the round
  trip below is for.
- **Upload side:** you need an `<input type="file" multiple>`. Verified live on 2026-08-16:

  | Site | Multi-file input? | Notes |
  |---|---|---|
  | `filebin.net` | **Yes** | No account. Doubles as the download source. Best single choice. |
  | `tmpfiles.org` | **Yes** | No account, temporary storage. |
  | `blueimp.github.io/jQuery-File-Upload/` | **Yes** | The classic multi-select demo, per-file progress rows — good for asserting all 20 appear. |
  | `file.io` | **Yes** | No account, files expire after one download by default. |
  | `demo.automationtesting.in/FileUpload.html` | **Yes** | Has an explicit "Multiple Files Upload" widget; site uptime is less reliable than the others. |
  | `demoqa.com/upload-download` | No | Single file only — **cannot** test Shape B. |
  | `the-internet.herokuapp.com/upload` | No | Single file only. |
  | `practice.expandtesting.com/upload` | No | Single file only. |

**Privacy warning:** filebin, tmpfiles, file.io and catbox are *public* file hosts — anything
uploaded is reachable by URL to anyone who has it. Use generated dummy files only. Never use a
real customer document, export, or anything from a company system in these tests.

**Suggested no-login round trip (one site, both ends):** upload 20 dummy files to a filebin bin
by hand → that bin is your Shape A/B download source → a *second, empty* bin is your upload
target. Bins expire on their own, so nothing accumulates.

**How to drive it (W-8, fixed 2026-08-16):** you do **not** pass 20 paths. You pass **one folder
path** as the skill's `file_path` input, and the runtime uploads every file directly inside that
folder, in name order. That is the whole mechanism — the same input that takes a single file takes
a directory, and `setInputFiles` receives the expanded array. It scales past 20 for free: a folder
of 200 invoices is still one input string, so the file count is never bounded by what fits in the
agent's context.

Subdirectories are skipped (non-recursive), and an empty folder throws rather than uploading
nothing — matching the existing rule that an upload must never report success having sent no file.

**Still worth confirming with a real recording**, since only unit tests cover it so far. Do it as
a cheap 2-step throwaway before the long version: record picking 3 files at once on filebin,
replay with a folder of 3 files as the input, count how many arrive. Then scale to 20. If fewer
than all of them land, that is a regression in `run.js::resolveUploadPaths` — log it against
`TODO.md` EXEC-15.

**If the control only takes one file**, the runtime says so directly: before uploading it asks
the live element whether it accepts multiple, and refuses with *"this upload control accepts only
one file, but 20 files were given — pass a single file path instead of a folder"*. That failure
skips the recovery cascade entirely, so it costs no LLM tokens and returns immediately — a wrong
input is not something re-finding the element can fix. All five sites in the table above accept
multiple, so use one of them for the passing case and any single-file site (e.g.
`the-internet.herokuapp.com/upload`) to see the refusal.

Note the capability is read from the **page**, not from the recording — so recording with one
file and replaying with a folder of 20 is a legitimate thing to do, and worth testing, since it
is what a customer will do the first time they reuse a skill for a bigger batch.

**What Shape B is worth commercially:** an enterprise "upload this month's 20 invoices" flow is
almost always a single multi-select in the real UI, not twenty separate dialogs. Shape A can
simulate the *outcome* but not the *recording* a customer will actually make — the first time
someone records their real process, they will drag 20 files in at once.

---

## Workflow 8 — Conditional / branch steps in one workflow (EXEC-1)

Workflows 1–7 replay exactly what was recorded. This one tests the opposite skill: steps that
must **succeed whether or not something appears** — cookie-style popups, session-expired
dialogs, A/B-tested outcomes. All three branch primitives (`try_dismiss`, `if_present`,
`wait_for_one_of`) live in one compiled skill, on one free site. The replay matrix at the end
is the actual test: the same skill must pass with the popup present *and* absent.

**Domain:** `the-internet.herokuapp.com` only
**Steps:** ~15–20
**Tabs:** 1

Background: the recorder never invents branch steps on its own. It only *observes* that a click
happened inside something dialog/banner-shaped (`bridge.js::detectOptionalContainer` →
`optionality: "stochastic"` + `branch_hint` on the event) and the compiler carries that hint as
advisory only (`build.py` — the step stays a normal required step). Only a human confirming in
Human Edit converts it into a real branch (`workflow_mutations.confirm_optional_interstitial`).
That division of labor is itself part of what this workflow verifies.

### Stage 1 — Record (~8–10 steps)

1. Clear site data for `the-internet.herokuapp.com` (or use a fresh profile) — the Entry Ad
   modal only shows once per profile, and recording needs it present.
2. Go to `/entry_ad`. The "Entry Ad" modal appears over the page.
3. Click the modal's **Close** button.
4. Navigate to `/login`.
5. Fill username `tomsmith`, password `SuperSecretPassword!`, click **Login** — lands on the
   secure area with a green success flash.
6. Stop recording there. **Do not record Logout** — the logout click gets authored inside a
   branch body in Stage 2 instead, and leaving it as a recorded step would make replay try to
   log out twice (the second Logout element wouldn't exist).

### Stage 2 — Human Edit (where branches are actually born)

1. Find the Close-click step from `/entry_ad`. It should carry the recorder's optional-
   interstitial flag (the modal is a `role=dialog` container). Click **confirm optional
   interstitial** — it becomes a real `try_dismiss` branch whose candidates are seeded with the
   recorded Close selector plus the observed container signal.
   - *Fallback if the step is not flagged* (container wasn't recognized): insert `try_dismiss`
     manually from the Add-action menu; set candidates to the modal container selector and the
     Close selector. Same end state, minus the recorder-observation proof.
2. Insert an `if_present` step **before** the `try_dismiss`: probe = the same modal container
   selector; nested body = one step clicking the modal's Close button. On replays where the
   modal appears this body runs and closes it; the `try_dismiss` right after then finds nothing
   — so a single run exercises `if_present`'s positive path *and* `try_dismiss`'s negative path.
3. After the recorded Login click, insert a `wait_for_one_of` with `required: false`:
   - Option 1 — probe: success flash (`#flash.success`, text "You logged into a secure area!");
     steps: click **Logout**.
   - Option 2 — probe: error flash (`#flash.error`, text "Your password is invalid!"); steps:
     empty (just proceed).
4. Save and compile. Before confirming in step 1 you should have been able to see that compile
   left the flagged step as an ordinary required step — the compiler converting it by itself
   would violate the "observed states + human confirmation" invariant.

### Stage 3 — Pack build

Set `CONXA_REQUIRED_RUNTIME` explicitly when building the pack. The branch executor exists on
`main` but is not yet in any tagged `app-vX.Y.Z` release, so the manifest default floor
(`>=1.0.3`, see `skill_package_builder_output.py`'s NOTE(branch-steps)) does not protect these
steps — an older app layer silently no-ops unknown step types, which for a branch means
skipping its entire body while still reporting success.

### Stage 4 — Replay matrix

| Run | Setup | Expected |
|---|---|---|
| R1 | Clear site data, replay | Modal appears → `if_present` probe hits → body clicks Close → `try_dismiss` probes find nothing, passes silently → login succeeds → `wait_for_one_of` matches the success arm → Logout clicked. **Pass.** |
| R2 | Same profile, no clearing | Modal never appears → both popup branches skip their bodies silently; run finishes faster than R1 (probe timeouts are short) → success arm again. **Pass — absence is success.** |
| R3 | Temporarily change the password field's recorded value to a wrong string, replay | Error flash appears → option 2 arm runs → Logout NOT clicked → run still succeeds. Revert the value afterwards. **Pass.** |

To force the modal back without wiping data, `/entry_ad` has a "restart ad" link that re-arms
it on reload — handy between replays.

In every run also check the recovery log/tier counters: branch probes must never escalate to
the Tier 1–4 recovery cascade and must never burn LLM tokens (branch bodies are best-effort by
design — `handlers.js`'s branch handlers never throw). Any escalation attributable to a branch
step is a regression against the zero-token invariant.

### Bonus leg — genuinely random outcomes (optional)

`/notification_message_rendered` shows a random success/error message when you click its action
link — outcomes you cannot control or predict. Record clicking the link once, insert a
`wait_for_one_of` probing `#flash.success` vs `#flash.error` (`required: false`), and replay
3–4 times: different arms fire on different runs and the run never fails either way. This is
the closest cheap stand-in for real-world A/B variants.

### Adversarial variants

- **AV-1 — unmatchable candidates:** blank out the `try_dismiss` candidates so nothing can
  match. Run must still pass via the Escape fallback (`fallback_escape` defaults true) with
  zero recovery escalation.
- **AV-2 — poisoned nested body:** put a bogus selector inside `if_present`'s nested body. The
  run must still pass — a failing branch body never fails the run (`test_branch.js` covers this
  offline; this confirms it live).
- **AV-3 — required starvation:** set the login `wait_for_one_of` to `required: true` and point
  both options at selectors that exist nowhere. Expected: a clean, immediate, typed failure
  ("none of the candidate selectors appeared before timeout") — not a recovery cascade.
- **AV-4 — old-runtime silent skip:** replay the pack built in Stage 3 *without*
  `CONXA_REQUIRED_RUNTIME` against an app layer predating the branch executor. Predicted: every
  branch body silently skipped, run reports success, no popup ever dismissed and no logout ever
  clicked. This demonstrates why the manifest floor caveat exists; if a current app layer also
  skips, that is a regression in `run.js`/`handlers.js` dispatch.
- **AV-5 — popup appears at replay that was never recorded (the inverse case):** everything
  above stages popups that existed at recording time. This one stages the opposite — the
  recorder saw nothing, so there is no `branch_hint`, nothing to confirm, and no branch step
  anywhere in the pack.
  1. Record a minimal variant: skip `/entry_ad` entirely (or visit it on a profile where the
     ad already showed, so no modal appears) and record only `/login`. Compile with zero
     branch steps.
  2. Replay once on a *cleared* profile — the Entry Ad modal now appears mid-run over a page
     the skill believes is clean.
  3. Watch which tier resolves it, and note that the runtime has **no proactive overlay
     sweep** — recovery only fires because a step's click throws Playwright's "intercepts
     pointer events" and gets classified `INTERCEPTED` (`recovery.js:42` →
     `cascade.js::layer1Ladder`). The Tier-1 remedy is now a small deterministic ladder
     (shipped 2026-08-25): Escape first, then the known consent-toolkit accept/close list
     (`app/dismiss_patterns.js`), then host-learned winners
     (`{CONXA_DATA_DIR}/learned_overlays.json`). Outcomes to distinguish:
     - Modal doesn't block any recorded target → run passes, modal ignored. No handler fired
       at all — correct, but luck, not handling.
     - Escape closes it → recovered at Tier 1, zero tokens.
     - A known-pattern candidate matches (e.g. an OneTrust/Cookiebot accept button) → also
       Tier 1, zero tokens; check `logs/recovery.log` for the `tier1_dismiss_pattern` event
       and replay once more — the learned store should skip straight to that selector.
     - Nothing in the ladder matches (a bespoke modal with no recognizable dismiss control)
       → L2 re-find mechanisms can't remove a foreign overlay either, so expect escalation to
       Tier 3+ (paid tokens) or failure at the ceiling. Log which tier actually resolved/failed.
  4. Then apply the designed fix by hand: insert a `try_dismiss` targeting the modal container
     as the first step in Human Edit, republish, replay both futures (cleared and uncleared
     profile) → passes silently both ways.
  
  **What this proves:** the automatic safety net for never-recorded popups is reactive —
  Escape plus a bounded famous-popup cheat sheet, all zero-token; anything smarter (bespoke
  modals, permanent fixes) is authored by a human or paid for in Tier 3+ tokens. Remaining
  ladder extensions are tracked under EXEC-5: hooking agent-recovery wins into the learned
  store, and surfacing repeated wins as one-click try_dismiss suggestions in Human Edit.

  ### AV-5a — hands-on walkthrough for the known-pattern ladder (manual)

  Unit tests (`runtime/test/unit/test_dismiss_patterns.js`) prove the mechanics offline; this
  walkthrough proves them against a real Chromium page end-to-end, including the learning
  behavior, using a local fixture instead of real consent-toolkit sites.

  **One-time setup (~5 min):**

  1. Save the fixture below as `dismiss-fixture.html` in any folder.
  2. Serve it over HTTP (**not** file:// — the learned store is keyed by hostname, and
     `file://` URLs have none): `python -m http.server 8099 --directory <folder>` and tee the
     output somewhere greppable (PowerShell: `python -m http.server 8099 --directory <folder> *> server.log`).
     Every click on the fixture also fires a `GET /__log?<name>` that lands in this log with a
     timestamp — that is your headless-visible evidence of what was clicked and in what order.
  3. Record a minimal skill in Build Studio against `http://localhost:8099/dismiss-fixture.html?banner=none`:
     just click **"Do the real action"**, stop recording. Compile and confirm the workflow has
     **zero branch steps** (the `?banner=none` variant renders no overlay, so the recorder saw
     nothing optional). Build the pack.

  ```html
  <!doctype html>
  <html>
  <head>
  <meta charset="utf-8">
  <title>Dismiss-pattern fixture</title>
  <style>
    body{font-family:sans-serif;margin:48px}
    #target{padding:12px 24px;font-size:16px}
    .banner{position:fixed;inset:0;background:rgba(10,10,10,.88);color:#fff;z-index:9999;
            display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center}
    .banner button{padding:10px 22px;font-size:15px}
    .banner.hidden{display:none}
    dialog.b{color:#000}
    #clicklog{position:fixed;top:8px;right:8px;background:#fffa;border:1px solid #888;
              padding:8px;font-size:12px;white-space:pre-wrap}
  </style>
  </head>
  <body>
    <h1>Dismiss-pattern fixture</h1>
    <p>Banner variant: <b id="variant">?</b>. Click evidence appears top-right and in the
       HTTP server log (<code>/__log?&lt;name&gt;</code>).</p>
    <button id="target">Do the real action</button>
    <div id="clicklog">clicked: (this page load)</div>
    <script>
      const q = new URLSearchParams(location.search);
      const v = q.get("banner") || "none";
      document.getElementById("variant").textContent = v;
      const logEl = document.getElementById("clicklog");
      function log(name){
        logEl.textContent += "\n  " + name;
        new Image().src = "/__log?" + encodeURIComponent(v + ":" + name);
      }
      function dismiss(btn){
        log(btn.id || btn.className);
        const b = document.getElementById("b");
        if (b) b.classList.add("hidden");
      }
      const banners = {
        // Real OneTrust accept id — matches the static known-pattern list directly.
        onetrust: '<div class="banner" id="b"><span>We value your privacy</span>' +
                  '<button id="onetrust-accept-btn-handler" onclick="dismiss(this)">Accept all</button></div>',
        // Decoy: an EARLIER static-list member (#truste-consent-button) that clicks but does
        // NOT dismiss, followed by a later list member (.cmplz-accept) that does. Run 1 must
        // click both; run 2 must click only .cmplz-accept (learned-first ordering).
        decoy: '<div class="banner" id="b"><span>We value your privacy</span>' +
               '<button id="truste-consent-button" onclick="log(\'decoy-truste\')">Accept</button>' +
               '<button class="cmplz-accept" onclick="dismiss(this)">Accept all</button></div>',
        // Bespoke: nothing in the static list matches — the ladder must find nothing.
        bespoke: '<div class="banner" id="b"><span>We value your privacy</span>' +
                 '<button id="bespoke-x" onclick="dismiss(this)">OK sure</button></div>',
      };
      if (banners[v]) document.body.insertAdjacentHTML("beforeend", banners[v]);
      if (v === "escdialog") {
        // Native <dialog> closes on Escape — exercises the plain Escape remedy, no patterns.
        const d = document.createElement("dialog");
        d.className = "b";
        d.innerHTML = "<p>Session expired?</p>";
        document.body.appendChild(d);
        d.showModal();
        log("dialog-open");
      }
      document.getElementById("target").addEventListener("click", () => log("target"));
    </script>
  </body>
  </html>
  ```

  **Replays** — one `execute_skill`/Run Test each. Between scenario groups, delete
  `{CONXA_DATA_DIR}/learned_overlays.json` for clean attribution (Studio Run Test:
  `conxa-builder/python/sandbox/.conxa/`). After each replay, grep the server log for
  `/__log?` lines and the runtime recovery log for `tier1_dismiss_pattern` /
  `layer1_ladder` / tier-escalation events.

  | # | Replay URL | Expected |
  |---|---|---|
  | R1 | `?banner=onetrust` | Run **passes**. Server log: `onetrust:target`. Recovery log: one `tier1_dismiss_pattern`, `source:"known"`, pattern `#onetrust-accept-btn-handler`. Learned store now lists it under host `localhost`. |
  | R2 | `?banner=decoy` (fresh/emptied store) | Run **passes**. Server log order: `decoy-truste` **then** `cmplz-accept` (static list order: truste sits earlier but doesn't dismiss; the ladder keeps going). Learned store gains `.cmplz-accept`. |
  | R3 | `?banner=decoy` again, same store | Run **passes**. Server log shows **only** `cmplz-accept` — the learned entry was tried before the static list, so the decoy was never clicked. This is the learning proof. |
  | R4 | `?banner=escdialog` | Run **passes** via the plain Escape press. No `tier1_dismiss_pattern` event (nothing matched — correct). |
  | R5 | `?banner=bespoke` | Run **fails** (Build Studio ceiling = deterministic failure; MCP execution escalates to Tier 3+ paid tokens). No pattern event. This is the honest-limit case: a bespoke modal with no recognizable dismiss control gets no free pass. |

  **Pass criteria for the whole walkthrough:** R1–R4 pass with exactly the logged click
  sequences above; R5 fails cleanly; the learned store file contains only `localhost`
  entries; no run ever spent a token getting past R1–R4. Any deviation: wrong-button click →
  tighten the offending list entry (selector hygiene tests will flag it once encoded);
  R3 clicking the decoy → regression in the learned-first ordering (`cascade.js::layer1Ladder`).

  **Validation status:** this walkthrough was executed programmatically against real headless
  Chromium on 2026-08-25 (same fixture, same ladder code path) — all six behaviors confirmed,
  including the R2→R3 learning transition. Two implementation details it validated that unit
  mocks alone would have missed: the ladder clicks **every** present candidate in order (a
  dead-end candidate like the decoy must not stop it, and consent stacks need the
  continuation), and the per-candidate probe budget needs ~1.2 s of headroom for a cold
  page's first input event.

### What this proves

- The full EXEC-1 loop: recorder observes → compiler stays hands-off until confirmation →
  Human Edit authors → serializer emits runtime format → runtime executes best-effort.
- Stochastic popups cost zero recovery tiers and zero LLM tokens, whether present or absent.
- Deterministic A/B (login) and truly random outcomes (notification page) are both drivable
  through `wait_for_one_of` with per-option bodies.
- The old-runtime hazard is real, which is what the `required_runtime` manifest floor guards.

### Where failures go

Log failures by reopening `TODO.md` → **EXEC-1** (struck through as resolved) with a dated
update under that item, per the file's convention. Probe/selector resolution failures belong in
EXEC-5 (#31/#32) cross-referenced from EXEC-1; anything proving AV-4's silent skip against a
*current* app layer is a new bug, not an EXEC-1 gap — file it separately referencing
`skill_package_builder_output.py`'s NOTE(branch-steps). AV-5 findings split by outcome: an
unexpected tier escalation or a failure where Escape should have sufficed is a recovery-cascade
regression (EXEC-1 cross-referenced); the "one Escape press is all we try" limitation itself is
not a bug — it is the known gap behind EXEC-5's dismiss-known-pattern library.

---

## Workflow 9 — Manual recovery drill: force Tier 2 and Tier 3 on purpose

Workflows 1–8 hope recovery never fires. This one makes it fire, deterministically, so you can
*watch* each tier work. The trick is the same one AV-5a uses: record against a local fixture page,
then replay against **mutated variants of the same page** (picked by query param) that simulate a
website having drifted since the recording. Because you control the mutation, you can aim at an
exact tier instead of waiting for a real site to redesign itself.

**What each tier is (one line each):**
- **Tier 1** — reads the Playwright error and applies one mechanical fix (re-find, scroll,
  dismiss overlay, wait). Zero tokens.
- **Tier 2** — the element genuinely can't be found the recorded way anymore, so it tries other
  *deterministic* ways: accessibility re-probe (role + name), fallback selectors saved in
  `recovery.json`'s `selector_context.alternatives`, dialog scoping, fuzzy text. Still zero tokens.
- **Tier 3** — everything deterministic failed, so the runtime sends Claude a **ranked, indexed
  list of the live page's interactive elements** plus the step's intent/anchors/post-condition;
  Claude replies with the *number* of the right element (`candidate_index`), and the runtime
  verifies that pick against its uniqueness gate before acting. Costs the customer's Claude tokens.
- Tier 4 (screenshots) is out of scope here — see `TODO.md` EXEC-3 for when that becomes an
  actionable tier.

### One-time setup (~10 min)

1. Save the fixture below as `recovery-fixture.html` in any folder.
2. Serve it over HTTP (**not** file://): `python -m http.server 8099 --directory <folder>` and tee
   the output so you have click evidence (PowerShell:
   `python -m http.server 8099 --directory <folder> *> server.log`). Every button click fires a
   `GET /__log?<mode>:<name>` that lands in this log with a timestamp — that's your proof of
   *which* button actually got clicked, which matters because Tier 3's whole risk is clicking a
   lookalike.
3. Record a minimal skill in Build Studio against
   `http://localhost:8099/recovery-fixture.html` (no query param = clean mode): just click
   **"Buy Now"**, stop recording. Compile.
4. Open the compiled skill's `recovery.json` and confirm two things before mutating anything:
   - the step's `selector_context.alternatives` includes something that survives mode `t2`
     below — with this fixture that should be `#checkout-btn` (the id is deliberately left intact
     in that variant);
   - the step carries human-readable `anchors` (e.g. "Buy Now purchase button"). These are what
     Tier 3 ranks live elements against — without anchors, T3 degrades to guessy matching.
5. Build the pack.

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Recovery fixture</title>
<style>
  body{font-family:sans-serif;margin:48px}
  button{padding:12px 24px;font-size:16px;margin-right:12px}
  .ghost{opacity:.85}
  #clicklog{position:fixed;top:8px;right:8px;background:#fffa;border:1px solid #888;
            padding:8px;font-size:12px;white-space:pre-wrap}
</style>
</head>
<body>
  <h1>Recovery fixture</h1>
  <p>Mode: <b id="mode">clean</b>. Click evidence appears top-right and in the HTTP server log
     (<code>/__log?&lt;mode&gt;:&lt;name&gt;</code>).</p>
  <div id="controls"></div>
  <div id="clicklog">clicked: (this page load)</div>
  <script>
    const q = new URLSearchParams(location.search);
    const v = q.get("v") || "clean";
    document.getElementById("mode").textContent = v;
    const logEl = document.getElementById("clicklog");
    function log(name){
      logEl.textContent += "\n  " + name;
      new Image().src = "/__log?" + encodeURIComponent(v + ":" + name);
    }
    function btn(attrs, label, name){
      const b = document.createElement("button");
      for (const [k, val] of Object.entries(attrs)) b.setAttribute(k, val);
      b.textContent = label;
      b.addEventListener("click", () => { log(name); b.textContent += " ✓"; });
      return b;
    }
    const controls = document.getElementById("controls");
    // The recorded target. Mode decides how much of its identity has "drifted".
    const variants = {
      // Exactly as recorded — every signal alive. Baseline: must resolve on the primary path.
      clean: [btn({ id:"checkout-btn", "data-testid":"buy-btn", "aria-label":"Buy Now",
                    class:"btn-primary" }, "Buy Now", "target")],
      // Tier-2 case: text renamed AND data-testid removed AND aria-label removed — every strong
      // IdentityBundle signal is dead — but the id survives, so a fallback selector can still
      // find it deterministically.
      t2:    [btn({ id:"checkout-btn", class:"btn-primary" }, "Purchase order", "target")],
      // Tier-3 case: every stable attribute rotated, text paraphrased ("Complete Purchase"),
      // plus two decoys competing for the ranking. Nothing deterministic can find it; only
      // intent + anchors + the ranked list can.
      t3:    [
        btn({ class:"ghost" }, "Save cart for later", "decoy-save"),
        btn({ "data-testid":"cta-x7f", "aria-label":"Complete Purchase", class:"btn-primary" },
            "Complete Purchase", "target"),
        btn({ class:"ghost" }, "Cancel order", "decoy-cancel"),
      ],
      // Honest-failure case: the target is gone entirely. Recovery should end in a clean typed
      // failure (or a Claude decline) — never a confident wrong click.
      gone:  [btn({ class:"ghost" }, "Nothing to see here", "other")],
    };
    (variants[v] || variants.clean).forEach(b => controls.appendChild(b));
  </script>
</body>
</html>
```

### Replays

To point a replay at a mutated variant, edit the navigate step's URL in Human Edit to add the
query param (`?v=t2`, `?v=t3`, `?v=gone`) before each run — the recorded URL has no param, which
the fixture treats as `clean`. After each run, grep the runtime recovery log for what actually
fired:

```powershell
# Real runtime (Claude Desktop execution):
Get-Content "$env:USERPROFILE\.conxa\logs\recovery.log" -Tail 80
# Build Studio Run Test sandbox:
Get-Content "conxa-builder\python\sandbox\.conxa\logs\recovery.log" -Tail 80
```

Event names to look for: `layer_recovered` with `layer: 2` and `tier2_a11y` (Tier 2 won),
`repair_event` (any successful self-heal, with its tier/method — also visible in cloud telemetry),
`agent_recovery_requested` with `tier: 3` and a `round` number (Tier 3 fired),
`agent_override_applied` / `agent_override_rejected` (what happened to Claude's pick),
`recovery_ceiling_reached` (Studio refused to escalate — expected in R2), and
`retry_budget_exhausted`. Also grep `server.log` for `/__log?` lines to confirm the *right*
button was clicked.

| # | Variant | Where | Expected |
|---|---|---|---|
| R0 | `clean` | Build Studio Run Test | Passes, clicked `clean:target`, **zero** recovery events. If anything escalated on the unchanged page, the compiled identity was weaker than assumed — fix the recording before continuing, or every later row is noise. |
| R1 | `?v=t2` | Build Studio Run Test (ceiling 2) | Passes via **Tier 2**: recovery log shows `tier2_a11y` and/or `layer_recovered layer:2`, then a `repair_event`; zero agent events (Studio never escalates past T2). Server log shows exactly one click: `t2:target`. This is the free-self-heal proof. |
| R2 | `?v=t3` | Build Studio Run Test (ceiling 2) | **Fails deterministically** with `recovery_ceiling_reached` and no screenshots taken. This negative control proves the Studio sandbox never spends tokens and never half-recovers — the pack is judged on its T1/T2 merits. |
| R3 | `?v=t3` | Claude Desktop → `execute_skill` (ceiling 4) | The full Tier 3 loop: run fails T1/T2 → `agent_recovery_requested {tier: 3, round: 1}` → Claude Desktop receives the ranked list (`[0] … "Save cart for later"` etc.) and replies `step_overrides: {"<n>": {"candidate_index": <index of "Complete Purchase">, ...}}` → `agent_override_applied` → run resumes from the parked page and completes. Server log: exactly `t3:target` — **not** either decoy (that's the ranking + uniqueness-gate proof). |
| R4 | `?v=gone` | Claude Desktop → `execute_skill` | Tier 3 fires, but nothing on the page matches the intent. Expected honest outcomes: Claude declines ("page has changed") instead of guessing, or a nominated index fails validation (`agent_override_rejected`) → clean typed failure naming the step. A run that "succeeds" here clicked something wrong — treat as a ranking/gating regression. |
| R5 | `?v=gone` again, immediately after R4 | Claude Desktop, same session | The retry budget / stagnation guards bite: expect `retry_budget_exhausted` on resume attempts, and if the page fingerprint is identical across consecutive rounds, `recovery_stagnant_stop` refusing further paid rounds. Failure must get *cheaper*, never more expensive. |

**Pass criteria for the whole drill:** R0–R1 pass with the exact logged clicks above; R2 fails
with zero tokens spent; R3 passes with exactly one click on the real target and a
`candidate_index` (not a hand-written selector) in Claude's resume call; R4 fails cleanly; R5
shows the budget/stagnation guard firing. Any deviation maps to a specific module: R1 recovering
via agent events (impossible at ceiling 2) → ceiling wiring; R3 clicking a decoy →
`candidate_digest.js` ranking or `validateOverrideSelector`'s margin gate; R3 passing with a
literal selector instead of `candidate_index` → prompt contract drift in `failure_response.js`.

### What this proves

- Tier 2 is a real, free self-heal path — a renamed/re-signaled element still completes with zero
  LLM involvement, and you can see exactly which mechanism won from the log events.
- The ceiling contract holds both ways: Studio (ceiling 2) refuses paid escalation even when the
  pack is broken; Claude Desktop (ceiling 4) escalates and comes back with a verified nomination.
- Tier 3 ranks honestly under competition (two decoys) and closes through the uniqueness gate —
  the AI nominates, the runtime verifies.
- Failure is bounded: unfixable pages end in typed failures with the budget and stagnation caps
  spending less each round, not more.

### Where failures go

Log findings under `TODO.md` **EXEC-23** if recording missed an interactable entirely, **EXEC-4**
for Tier 3 handoff-shape issues, or file a new item referencing `runtime/app/candidate_digest.js`
(ranking), `runtime/app/recovery_stage.js` (escalation/stagnation), or
`runtime/app/failure_response.js` (payload assembly) — per the repo convention of dated updates
under the tracked item. Tier-2 mechanism regressions belong against the recovery cascade
(`cascade.js`/`resolution.js`) with the R1 log attached.

---

## What to watch for while testing (known gaps this exercises)

- **Tab-landing correctness** — after any tab switch, confirm the very next action executes
  in the tab you expect, not a stale reference to a previously-active tab (EXEC-5 #43).
- **Download/upload verification** — does the runtime actually wait for the download to finish
  before the next step tries to use the file, and does it confirm the upload succeeded rather
  than just clicking "Upload" and moving on (EXEC-5 #31/#32)?
- **Recovery tier ceiling** — if any step needs healing, note which tier it escalated to; more
  than a couple of Tier 3+ escalations in one run against these stable demo sites would be a
  red flag (`CONXA_MAX_RECOVERY_TIER`, `[[recovery-tier-ceiling-and-closing-edge]]`).
- **Long-run stability** — does anything degrade or slow down past step ~25 (memory growth,
  stale frame references, accumulating iframe offsets)?
- **Compile step count** — does Build Studio's compile step choke or silently truncate above
  30 steps, separate from runtime replay?
- **File identity in a loop** — in the bulk 20-file variant, does each upload actually carry
  the file downloaded in *that* iteration, or does a loosely-scoped selector let it silently
  reuse whichever file happened to download first/last?
- **Stale data across separate runs** — per Workflow 6, confirm old `{runId}` download folders
  aren't picked up by a later run, and separately note whether they're ever cleaned up at all.
- **Branch-step discipline (Workflow 8)** — confirm conditional steps never escalate to the
  recovery cascade or spend LLM tokens in any replay state (popup present or absent), and that
  an unknown-step-type runtime skips a branch silently rather than failing — the second one is
  the `required_runtime` floor's reason to exist.

## After testing — what to solve next

Log failures against `TODO.md` EXEC-10 directly (add a dated update under that item, per the
file's existing convention) rather than opening a new item, unless a failure clearly belongs
to a different tracked item (EXEC-5 #31/#32/#43) — in that case, cross-reference there instead.
Once one of Workflows 1–4 replays clean end-to-end, promote it into `runtime/test/gate-skill/`
as a `gate_replay.js` fixture so this scenario is CI-enforced going forward, per EXEC-10's
success criteria.

**That condition is now met (2026-08-25):** the mega-workflow above replayed clean end to end and
is the natural candidate to distill into a gate fixture — the remaining work is shrinking it to
what CI can run unattended (no Render/Vercel auth), i.e. the filebin → demoqa/the-internet
download→upload segments plus one tab round-trip.

Workflow 6's finding was different in kind — it was about runtime storage hygiene (unbounded
accumulation of per-run download folders), not replay correctness — and is now resolved as W-7
above.

---
---

# Part 2 — Break Tests: adversarial workflows designed to fail

Workflows 1–6 ask "does the happy path work?". This part asks the opposite question: **what
can we make break, on purpose, before a customer breaks it by accident?**

Each test below targets a specific weakness found by reading the runtime source, not a guess.
The code reference is given so you can confirm the mechanism before spending time recording.
**Read this section before recording Workflows 1–6** — several of these predict that parts of
those workflows *cannot* pass today, and knowing which saves you a wasted recording session.

## Code-verified weak points (read this first)

These were confirmed by reading `runtime/run.js` and `runtime/server.js` directly. They are the
reason the break tests are shaped the way they are.

| # | Weakness | Where | Predicted symptom |
|---|----------|-------|-------------------|
| ~~W-1~~ | ~~**Tab steps are no-ops.**~~ **Resolved 2026-08-15.** The recorder now tags every event with which tab produced it, the compiler inserts `tab_open`/`tab_switch` markers and carries `tab` on every step, and `runtime/tabs.js::resolveStepPage` resolves the live page fresh per step at replay time. See `docs/TRD.md` §6.3/§7.1/§9.1a. | `runtime/tabs.js`, `run.js::runPlan` | — |
| ~~W-2~~ | ~~**No in-workflow download → upload binding.**~~ **Resolved 2026-08-15.** A matching upload step's value is rewritten at compile time to `{{downloaded_file}}`/`{{downloaded_file_N}}`, bound by `run.js`'s `download_observed` handler at replay time — no LLM round-trip. See `skill_package_builder_saved_skill.py::_bind_downloads_to_uploads`. | `run.js` (`download_observed` handler), `skill_package_builder_saved_skill.py` | — |
| W-3 | **Duplicate filenames silently overwrite.** The save destination is `downloads/{runId}/{suggestedFilename}`. Two files with the same suggested name resolve to the same path. | `server.js:1210-1213` | Download 20 files where several share a name (`report.pdf`, `export.csv`) → fewer than 20 files on disk, and the recorded list contains duplicate paths. Silent data loss. |
| W-4 | **Retry budget is never cleared after a failed run.** The budget map is module-level and lives as long as the MCP server process; it's cleared only on the success path. | `run.js:56-73`, `server.js:1287` (`clearRetryBudget` on `run_success` only) | After one failed run, re-running the same skill in the same session starts with its recovery budget already spent — self-healing is silently disabled until Claude Desktop restarts. The second attempt fails *faster and harder* than the first. |
| ~~W-5~~ | ~~**Download listener is attached to the initial page only.**~~ **Resolved 2026-08-15.** `server.js` now attaches its diagnostics/download listeners to every tab opened during a run (`_context.on("page", _attachPageListeners)`), not just the first. | `server.js` | — |
| W-6 | **Tight default timeouts.** Action 2500 ms, page load 8000 ms. | `run.js:22-25` | Any enterprise app slower than a demo site — or any run on a throttled network — fails on timing, not on logic. |
| ~~W-7~~ | ~~**No download retention policy.**~~ **Resolved 2026-08-17.** Downloads now save under an isolated `{CONXA_DATA_DIR}/runs/{runId}/` workspace (not `CONXA_DIR`, and not the OS Downloads folder), and `run.js::sweepOldRuns` deletes sibling run directories older than `CONXA_RUN_RETENTION_DAYS` (default 7) at the start of every execution — regardless of how the previous run ended. See `docs/TRD.md` §7.1. | `server.js` (run start), `run.js::sweepOldRuns` | — |
| ~~W-8~~ | ~~**Multi-file upload is unrepresentable.**~~ **Resolved 2026-08-16.** The upload input now accepts a **folder path**: `run.js::resolveUploadPaths` expands a directory into every file directly inside it (naturally sorted) and always calls `setInputFiles` with an array. When more than one file resolves, the handler asks the live element whether it accepts multiple and refuses a folder aimed at a single-file control with a clear message, skipping the recovery cascade. See `TODO.md` EXEC-15. | `run.js::resolveUploadPaths`, `HANDLERS.upload` | — (still unconfirmed against a real recording — that is Workflow 7 Shape B's job) |

**The headline (2026-08-15 update):** W-1 and W-2 — the reason the exact workflow EXEC-10 was
written to validate looked unreachable — are now fixed and unit-tested (`runtime/test/test_tabs.js`,
`conxa-cloud/tests/test_recorder_tab_identity.py`, `test_compile_tab_markers.py`,
`test_download_upload_binding.py`). **B-1 and B-2 below are expected to pass now, not fail** — their
break predictions are kept as written (not deleted) so whoever records them next can confirm the fix
holds against a real recording, not just unit fixtures. The actual 30–40 step recording this item
asks for, and a `gate_replay.js` fixture exercising a tab switch, are still open — see `TODO.md`
EXEC-10.

---

## B-1 — Prove the tab switch is fake

**Site:** `the-internet.herokuapp.com/windows`
**Steps:** ~8. **Goal:** fail fast, cheaply, and unambiguously.

1. Record: on `/windows`, click "Click Here" (opens a new tab showing only the text "New Window").
2. In the new tab, do something that is *impossible on the original tab* — e.g. assert the page
   heading reads "New Window".
3. Switch back to the first tab and click the "Elemental Selenium" link.

**Break prediction (W-1, pre-2026-08-15):** step 2 fails, because replay is still pointed at
`/windows`, which has no "New Window" heading. **The dangerous variant:** re-record it so the new
tab contains an element that *also exists* on the original tab (any two pages sharing a nav bar
will do). If that version "passes", it passed by clicking the wrong tab's element — a silent
wrong-action, which is far worse than a clean failure and is exactly what EXEC-5 #43 warns about.

**Post-fix expectation (2026-08-15):** both variants should now pass legitimately — step 2 resolves
against the actual new tab (`opened_by: "site"`, since a real link click opens it), not the
original page. If either variant still fails, or the dangerous variant "passes" by acting on the
original tab, that is a live regression in `runtime/tabs.js::resolveStepPage`, not the expected
outcome — treat it as a bug report, not confirmation of the old prediction.

Run both variants. A clean failure (or false pass on the dangerous variant) is a bug; a correct
pass on both is what the fix should now produce.

---

## B-2 — Prove the file handoff needs the LLM (the 20-file cost bomb)

**Sites:** any public GitHub folder → `demoqa.com/upload-download`
**Steps:** 2 files first, then 20.

1. Record a single workflow: download a file, then upload that same file on another site.
2. Replay it **without** supplying a `file_path` input.

**Break prediction (W-2, pre-2026-08-15):** the upload step throws `upload step has no file path
— supply the skill's file_path input`, or the run is rejected up front by the required-input gate.
The workflow cannot self-supply the file it just downloaded.

**Post-fix expectation (2026-08-15):** if the recorded upload's filename matched the earlier
download's `suggested_filename`, the compiled skill's upload step now compiles to
`{{downloaded_file}}` instead of the required `file_path` input — step 2 should complete with **no
`file_path` input supplied at all**, since `run.js`'s `download_observed` handler binds the real
saved path into `inputs.downloaded_file` during the run. If the run still asks for `file_path`,
either the filenames didn't match (check the recorded upload's filename against the download's
`suggested_filename` — matching is exact, case-sensitive) or there's a regression in
`skill_package_builder_saved_skill.py::_bind_downloads_to_uploads`.

Then measure the real cost of what this fix replaces: before it, the only way to move a file
between two skills was splitting them and driving both from Claude Desktop, with the agent reading
the downloaded path out of run one's result text and feeding it into run two — one LLM round-trip
per file, 20 of them for 20 files. That cost no longer applies to a same-run download → upload
handoff; it's now worth reconfirming there's no *other* shape (cross-skill, not cross-tab-same-skill)
still paying it, and recording that in `docs/cost_model.md` if so.

---

## B-3 — Same-name file collision (silent data loss)

**Site:** any source serving multiple files that share a suggested filename — e.g. download the
same GitHub file from two different branches/tags, or any site where several exports are all
named `export.csv`.
**Steps:** ~10.

1. Download 5 files, at least 3 of which have identical suggested filenames.
2. Inspect `~/.conxa/downloads/{runId}/` afterwards and count the files.

**Break prediction (W-3):** fewer files on disk than downloads performed — later files
overwrite earlier ones with no error, no warning, and a run result that still lists all 5 as
successful downloads. For a customer moving 20 invoices where several are named
`invoice.pdf`, this quietly loses documents. **This is the single most dangerous finding in
this document**, because the run reports success.

**Likely fix direction:** deduplicate the destination filename on collision (`report.pdf`,
`report (2).pdf`) rather than overwriting — a few lines in `server.js`'s download handler.

---

## B-4 — Poison the retry budget (failure makes the next run worse)

**Site:** anything; `demoqa.com/dynamic-properties` is convenient because it has an element that
is genuinely slow to appear.
**Steps:** ~6, run three times in one Claude Desktop session.

1. Record a workflow that targets an element you can *make* fail — e.g. record against the page,
   then replay with the network throttled hard, or point a step at an element behind a delay
   longer than the 2500 ms action timeout.
2. Run it → expect failure. **Do not restart Claude Desktop.**
3. Run the exact same skill again, twice more, in the same session.

**Break prediction (W-4):** runs 2 and 3 fail *earlier and with less recovery activity* than run
1, because the per-step retry budget from run 1 was never cleared. Check
`~/.conxa/`'s recovery log for `retry_budget_exhausted` events firing near-immediately on the
later runs. Then restart Claude Desktop and run once more — if it suddenly behaves like run 1
again, the diagnosis is confirmed.

**Why this matters commercially:** the customer's experience is "it broke once, and now it keeps
breaking, and it got worse" — the failure mode most likely to end a pilot. The fix is small
(clear the budget at run start, or on the failure path too), but it can only be found by running
the same skill twice after a failure, which no current test does.

---

## B-5 — Download from a popup (the invisible failure)

**Site:** any page that opens a download in a new tab/window rather than in-place.
**Steps:** ~8.

1. Record: click a link that opens a new tab which immediately triggers a file download.
2. Check `~/.conxa/downloads/{runId}/` afterwards.

**Break prediction (W-5):** the folder is empty or missing — the download listener was only ever
attached to the first page, so the popup's download was never saved. The step itself may well
report success. Pair this with B-1: both are the same underlying gap (the runtime has one page
and assumes it's the only one).

---

## B-6 — Slow-site timeout stress (is 2500 ms enough for a real app?)

**Site:** any of the above, but replayed with Chrome DevTools network throttling set to "Slow
3G", or against a deliberately slow endpoint.
**Steps:** reuse Workflow 2's 30-step `automationexercise.com` chain.

1. Replay the known-good Workflow 2 recording under heavy throttling.
2. Note which step types fail first and at what tier recovery gives up.

**Break prediction (W-6):** widespread failure at the 2500 ms action / 8000 ms page-load
defaults. The point of this test is not "throttled networks are slow" — it is to find out
**how much headroom the defaults actually have**, and whether the env overrides
(`CONXA_ACTION_TIMEOUT_MS`, `CONXA_PAGE_LOAD_TIMEOUT_MS`) are enough of an answer for a customer
whose internal app is simply slower than a demo site, or whether the defaults need raising.

---

## B-7 — The long-run endurance test (the one that runs overnight)

**Site:** Workflow 2's chain, looped.
**Steps:** 30-step workflow × 20 consecutive runs in one session.

1. Run the same known-good workflow 20 times back to back without restarting the runtime.
2. Watch: does run 20 behave like run 1?

**What to watch:** memory growth in the runtime process; the browser context cache in
`browser.js`; the retry-budget map from W-4 accumulating entries for every skill/step pair it has
ever seen; the recovery log growing toward its 10 MB rotation threshold; download folders piling
up (W-7). Any one of these degrading over 20 runs is a "works in the demo, dies in production"
bug — the class of failure that is hardest to reproduce after the sale and easiest to catch now.

---

## B-8 — Wrong-data-on-the-right-button (the safety test)

**Site:** `automationexercise.com` cart, or any list where several rows have identical action
buttons.
**Steps:** ~15.

1. Record: in a list of 5+ items, delete/remove **the third one specifically**.
2. Replay after changing the list — reorder it, remove an earlier item, or add a new item at the
   top so the third row now holds different data.

**Break prediction:** the compiled selector may resolve by position rather than by the row's
*content*, so replay removes the wrong record. `resolver.js`'s uniqueness-margin gate should
prevent a confident wrong pick, and the compiler's `IdentityBundle` should have bound something
row-specific — this test is how you find out whether it actually did.

**This is the P1 `PROD-3` entity-binding item made concrete.** If this test removes the wrong
row, that is not a bug to log quietly — it is the single thing that must be fixed before selling
into finance, HR, or payroll, where a wrong-row action is unrecoverable.

---

## Running the break tests — suggested order

Do them in this order; each is cheap and each one's result changes whether the next is worth
running.

1. **B-1** (10 min) — confirms or refutes W-1, the assumption everything multi-tab rests on.
2. **B-2** (20 min) — confirms W-2 and quantifies the 20-file LLM cost.
3. **B-3** (15 min) — the silent-data-loss one; highest severity per minute spent.
4. **B-4** (15 min) — the "it gets worse over time" one; hardest to find later.
5. **B-8** (30 min) — the safety one; gates the finance/HR/payroll story.
6. **B-5**, **B-6**, **B-7** — run once the above are triaged; B-7 can run unattended.

## Where each finding goes

| Test | If it fails, log it under |
|------|---------------------------|
| B-1, B-5 | `TODO.md` EXEC-10 (multi-tab support) and cross-reference EXEC-5 #43 |
| B-2 | `TODO.md` EXEC-10 + a cost note in `docs/cost_model.md` |
| B-3 | New `TODO.md` item — silent data loss on filename collision. **Treat as the highest-severity finding here**: it reports success while losing files |
| B-4 | New `TODO.md` item — retry budget not cleared on failure |
| B-6 | `TODO.md` EXEC-10 (timeout defaults / documented tuning guidance) |
| B-7 | New `TODO.md` item per symptom found (leak, cache growth, log growth) |
| B-8 | `TODO.md` PROD-3 (entity binding) — it is exactly that item's success criterion |
| Workflow 7 Shape B | `TODO.md` EXEC-15 (multi-file upload) — already filed against W-8; add the confirmed replay result there |

Once a break test's underlying bug is fixed, promote that test into `runtime/test/` as a
regression fixture so it cannot silently come back — the same rule EXEC-10 already sets for the
happy-path workflows.
