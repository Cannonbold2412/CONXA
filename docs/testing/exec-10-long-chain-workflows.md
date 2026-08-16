# EXEC-10 Test Plan: Long-Chain, Multi-Tab, Cross-Domain Workflows

Companion to `TODO.md` → **EXEC-10** (P0). All sites below are free, need no paid account, and
are either purpose-built for browser-automation testing or have a permanent free tier — no test
data will disappear on you mid-run.

Record each with Build Studio, compile, replay via `conxa_compile/conxa_runtime.py`'s sandbox
staging or a real runtime install, and log results against the checklist at the bottom.

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

## After testing — what to solve next

Log failures against `TODO.md` EXEC-10 directly (add a dated update under that item, per the
file's existing convention) rather than opening a new item, unless a failure clearly belongs
to a different tracked item (EXEC-5 #31/#32/#43) — in that case, cross-reference there instead.
Once one of Workflows 1–4 replays clean end-to-end, promote it into `runtime/test/gate-skill/`
as a `gate_replay.js` fixture so this scenario is CI-enforced going forward, per EXEC-10's
success criteria.

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
