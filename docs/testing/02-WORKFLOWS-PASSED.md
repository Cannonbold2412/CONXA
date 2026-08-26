# ✅ Workflows Successfully Tested Manually

This file is the **hall of fame**: every workflow that has actually been recorded, compiled, and
replayed end-to-end by hand (or validated against a real browser) moves here from
[`01-WORKFLOWS-TO-TEST.md`](01-WORKFLOWS-TO-TEST.md). Each entry says **what the new pass proves**
about what Conxa can do today.

When a workflow in `01-WORKFLOWS-TO-TEST.md` passes manually:

1. Move its section here (condensed, with date + evidence pointer).
2. Add a line under "What this proves Conxa can do now".
3. Update the dashboard below.

---

## 📊 Dashboard — what Conxa can do on the internet right now

> Hand-maintained estimate of how many real-world internet workflows Conxa can currently
> record → compile → replay reliably, based only on passes in this file.
> **Why ~18%, not higher:** one flagship run proves *capability*, not *reliability* — no
> cross-run re-run, endurance loop, or live recovery-cascade pass exists yet, dynamic/SPA sites
> and bulk-file identity are unproven manually, and canvas/CAPTCHA/OTP/drag-drop are hard walls.
> Cheapest upgrades: WF-7 (live self-heal proof) first, then WF-5 bulk-file legs, then WF-4 Leg A.

```
Internet workflow coverage:  ▓▓▓▓░░░░░░░░░░░░░░░░░░  ~18%

Last updated: 2026-08-26
Passed workflows:             3   (1 flagship + 2 precursors/supporting)
Longest verified workflow:    42 steps · 6 tabs · 6 hosts · 5 domains
Zero-token recovery proven:   yes (Tier 1 dismiss ladder, real Chromium)
Auth exclusion verified:      yes (no secrets in published bundles)

Headroom note: the proven SHAPE (multi-tab + file handoff + authenticated chains) suggests a
~30% ceiling is reachable once WF-4/WF-5/WF-7 pass — the gap is unproven reliability, not
missing architecture.
```

| Capability | Status | Proven by |
|---|---|---|
| Cross-domain download → upload handoff (`{{downloaded_file}}` binding) | ✅ proven | Mega-workflow 2026-08-25 |
| Multi-tab execution incl. `tab_switch` back to an earlier tab | ✅ proven | Mega-workflow + precursor 2026-08-23 |
| Site-opened popups + user-opened tabs in one run | ✅ proven | Mega-workflow 2026-08-25 |
| Authenticated chains on real SaaS (Render dashboard, Vercel) | ✅ proven | Mega-workflow 2026-08-25 |
| Zero-token overlay dismissal (Tier-1 known-pattern ladder + learning) | ✅ proven (real Chromium) | AV-5a walkthrough 2026-08-25 |
| Bulk ZIP download observed mid-run | ✅ download side only | Mega-workflow 2026-08-25 |
| 30+ step single-domain chain · dynamic/self-heal elements · 20-file bulk identity · branch steps live replay · full recovery drill | ⏳ pending | see `01-WORKFLOWS-TO-TEST.md` |

---

## Passed Workflow P-1 — EXEC-10 mega-workflow: long-chain, multi-tab, cross-domain, file transfer

**Date passed:** 2026-08-25 05:33 local (Build Studio Run Test)
**Shape:** one recorded skill — **42 steps, 6 tabs** (initial + 4 user-opened + 1 site-opened popup),
**6 hosts**, compiled clean (`compile_status: ok`), replayed successfully end to end.

### Segments (all passed in one run)

| Segment | Site(s) | What it exercised |
|---|---|---|
| Download files from bin A → ZIP download observed | `filebin.net` | Bulk-download side (Shape B download) |
| New tab → upload of that downloaded file | `demoqa.com/upload-download` | The core handoff — compiled to `{{downloaded_file_2}}` (W-2 binding), no `file_path` input supplied at all |
| Real `tab_switch` back to tab A (+ browser Back), second download | `filebin.net` | Tab-context landing on return to the initial tab |
| Third-domain tab → upload #2 | `the-internet.herokuapp.com/upload` | Second cross-domain upload, bound to `{{downloaded_file_3}}` |
| ~10-step authenticated deploy chain | `dashboard.render.com` | Length stress on a real authenticated SaaS |
| User-opened tab → site-opened popup → sign-in there | `vercel.com` → deployed app | User-opened-tab + site-opened-popup handling |

### Why this new pass matters — what it proves Conxa can do now

Before this pass, multi-tab replay and download→upload binding existed only as unit tests. This
single run proves Conxa can take **one human recording that spans five websites and six tabs** and
replay it faithfully with **zero agent tokens at runtime**:

- **Real file plumbing:** a file downloaded on one website is uploaded on another without anyone
  supplying a path — the runtime binds it automatically.
- **Correct tab memory:** actions land in the tab they were recorded in, even after switching back
  to a tab used minutes earlier.
- **Popups don't derail runs:** both tabs the *user* opened and a popup opened *by the site* are
  followed correctly, including signing in inside the popup.
- **Authenticated SaaS is drivable:** a ~10-step logged-in deploy chain on Render completed — this
  is the realistic enterprise shape, not just demo sites.
- **Scale:** 42 steps compiled clean and replayed clean — compile did not truncate and nothing
  degraded over the length of the run.

**Precursors (2026-08-23):** two published skills proved the halves separately first — a 9-step
filebin-only download→tab-switch→upload skill, and a 22-step Render→Vercel cross-domain multi-tab
skill with both a user-opened tab and a site-opened popup. Session log:
`docs/archive/sessions/session-ses_fd4e.md`.

---

## Passed Workflow P-2 — Tier-1 known-pattern dismissal ladder + learning store (AV-5a)

**Date passed:** 2026-08-25 (executed programmatically against real headless Chromium using
[`fixtures/dismiss-fixture.html`](fixtures/dismiss-fixture.html) and the same ladder code path).
Unit tests cover the mechanics offline; this pass proved them against a live page end-to-end.

### What was confirmed

- R1–R4 click sequences exactly as predicted; R5 (bespoke modal) failed cleanly with no free pass.
- The learned store (`learned_overlays.json`) gained only `localhost` entries.
- **R2→R3 learning transition:** run 1 clicked a dead-end decoy candidate then continued to the
  real accept button; run 2 skipped straight to the learned winner — the decoy was never clicked.

### Why this new pass matters — what it proves Conxa can do now

- **Cookie banners and famous consent popups are dismissed for free.** Escape plus a bounded
  known-pattern list resolves overlays at **zero LLM tokens**, and the runtime *remembers* which
  button worked per site, getting faster on every repeat visit.
- Two implementation facts validated that mocks would have missed: the ladder clicks **every
  present candidate in order** (a dead-end candidate must not stop it), and per-candidate probe
  budget needs ~1.2 s headroom on a cold page.

---

## Passed support checks folded into P-1/P-2 (resolved en route)

These were tracked as break predictions / gaps and are now resolved — their regression fixtures
live in unit tests; re-confirm via the corresponding workflows in `01-WORKFLOWS-TO-TEST.md`:

| Old weakness | Status | Proof |
|---|---|---|
| W-1 tab steps were no-ops | ✅ resolved 2026-08-15 | `runtime/test/test_tabs.js`; proven live in P-1 |
| W-2 no download→upload binding | ✅ resolved 2026-08-15 | `test_download_upload_binding.py`; proven live in P-1 |
| W-5 download listener missed popups | ✅ resolved 2026-08-15 | Listeners attach to every opened page |
| W-7 downloads accumulated forever | ✅ resolved 2026-08-17 | `sweepOldRuns` retention sweep (7-day default) |
| W-8 multi-file upload unrepresentable | ✅ fixed 2026-08-16 (EXEC-20 zip extraction) | Unit-tested; live Shape-B replay still owed — see WF-5 |

---

## Maintenance rules

- A workflow moves here **only after a successful manual/real-browser end-to-end run** — never on
  unit-test strength alone.
- Keep the dashboard's coverage % honest: bump it only when the newly passed workflow unlocks a
  class of sites/mechanics not previously covered.
- If a later re-run of anything in this file fails, move it back to `01-WORKFLOWS-TO-TEST.md`
  with a dated regression note and lower the dashboard accordingly.
