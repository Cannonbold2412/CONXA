# Pipeline Audit Report — Recording → Compile → Human Edit → Test Skill

**Date:** 2026-07-23
**Scope:** Build Studio's local pipeline — recording a browser workflow, compiling it into a skill package, editing it in Human Edit (including the in-flight "Parameterization" / `{{variable}}` feature), and executing it via Test Skill / the runtime.
**Method:** Direct code reading and cross-referencing across all four stages (recorder, compiler, editor/backend, runtime), running the existing automated test suites, and tracing specific data (accessible-name precedence, placeholder variables, auth state) end-to-end from the recorder through to the runtime. No fixes were applied — investigation only.

> **A note on scope.** This codebase is large. I went deep on the areas that are live right now — the uncommitted parameterization/variables feature touching all four stages, the identity/recovery precedence contract shared between the compiler and the runtime, the auth-recording path, and overall test-suite health — rather than shallow-skimming every file. Sections below say plainly what was and wasn't checked so this isn't mistaken for a byte-for-byte review of the entire codebase.

---

## Executive Summary

The pipeline is in a **partially-completed, in-progress state** — there is uncommitted work sitting in the working tree right now (16 modified files, 2 new files) that is itself mid-way through fixing a *previous* round of audit findings (the code contains its own comments like "audit finding C3", "audit finding H3", referencing an earlier review that isn't checked into the repo). That prior fix pass is, on the whole, well done: it's covered by 95 passing targeted tests I ran myself. But it is not finished, and while reading the exact code it touched I found one gap in that same unfinished work that is serious enough to undo part of what it was trying to fix.

Beyond that in-flight work, I found:

- **One critical, unrelated security issue**: a new, untracked file sitting in the test folder contains what look like real, live API keys for seven different AI providers, in plain text.
- **One high-severity bug**: the compiler now knows how to name an input field using its placeholder text (e.g., a search box with no label, just grey placeholder text), but the two places in the runtime that need to recognize that same name — the element resolver and the self-healing recovery step — were never taught this. This silently breaks the "free" self-healing tier for exactly the kind of element this feature was built to support, forcing a fallback to paid, slower AI-based recovery, or an outright failure.
- **One medium-severity privacy gap**: the Human Edit screen lets you mark a variable "Sensitive (mask value)" — but nothing downstream actually masks it. It's collected and saved, then does nothing.
- **One medium-severity, pre-existing test failure** in the Recording stage that predates today's changes — confirmed by temporarily undoing today's edits and re-running it. A test still checks behavior the code stopped doing weeks/months ago, so it fails on every run, silently hiding whether the real behavior still works.
- A few smaller issues (one low-severity validation gap, one test-hygiene issue, three further pre-existing test failures in an unrelated area).

**Overall reliability read:** the core compile → identity → resolve → recover chain is well thought through — the code comments show real engineering care about race conditions, thread safety, and selector quality. The main risk right now isn't "the architecture is unsound," it's that a fast-moving feature (parameterized skill inputs) is being pushed through four different subsystems at once, and the seams between those subsystems — compiler ↔ runtime, UI promise ↔ runtime enforcement, test fixture ↔ real behavior — are where things are actually breaking. None of what I found is cosmetic; all of it either changes what a skill run actually does, or leaks something it shouldn't.

---

## Bugs Found, By Severity

### 🔴 Critical

#### C1 — Live-looking API keys committed in plain text inside a test file

- **File:** `conxa-cloud/tests/test_llm_providers.py` (new, untracked — not yet pushed anywhere)
- **What it is, in plain terms:** This file is a diagnostic script for checking whether the company's AI provider accounts are working. Whoever wrote it pasted in what appear to be **real, working secret keys** for seven different AI services (Groq, Google AI Studio, NVIDIA, Cerebras, Together AI, OpenRouter, Mistral) — dozens of keys total, in plain readable text, sitting in a folder that normally gets committed to source control.
- **Why it matters:** If this file is ever committed and pushed — even to a private repo, even briefly — those keys should be treated as burned. Anyone with repo access (or anyone who later finds it in git history, even after deletion — git history doesn't forget) can run up usage on the company's accounts. This is not a "someday" risk; it's sitting in the working directory right now, one `git add .` away from being permanent history.
- **Reproduce:** Open `conxa-cloud/tests/test_llm_providers.py`, lines 15–66.
- **Recommendation:** Treat every key in that file as compromised — rotate all of them at each provider **regardless of whether this file ever gets pushed**, since it's unclear how it reached this machine. Do not commit the file. If secrets need to live somewhere for diagnostics, they belong in an untracked `.env` file, loaded at runtime, never typed into a `.py`/`.js` source file.
- **Secondary, smaller issue in the same file:** it isn't actually a pytest test (it's a `if __name__ == "__main__":` script meant to be run by hand), but because its filename starts with `test_` and it defines a function called `test_provider_connectivity`, pytest tries to collect and run it as a real test and fails immediately (`fixture 'provider' not found`). Confirmed by running `pytest tests/` — see the "Test Suite Health" section below. Independent of the secrets issue, this file shouldn't be named `test_*.py` if it isn't a test.

---

### 🟠 High

#### H1 — Self-healing recovery doesn't know about "placeholder-named" elements the compiler now creates

- **Files:**
  - `conxa-builder/python/conxa_compile/compiler/identity_bundle.py` (Compile stage — the part being changed right now, uncommitted)
  - `runtime/run.js` — function `a11yRecoveryName` (Test Skill stage)
  - `runtime/resolver.js` — function `scoreCandidate`'s `fpName` (Test Skill stage)

- **Plain-language explanation:** When Conxa records a click or a typed field, it needs a human-readable "name" for that element so it can find it again later, and so the self-healing system can re-find it if the page changes slightly. Usually that name comes from something like a screen-reader label. But some fields — like a search box that only has grey placeholder text ("Search…") and nothing else — don't have any of the usual labels. The team just added a fix (visible in the uncommitted changes, and covered by new tests) so the compiler will use that placeholder text as the name when nothing better is available — a real example cited in the new tests is a HubSpot contact-search box.

  The problem: that "use the placeholder text as a last-resort name" rule was only taught to the compiler. The two places in the runtime that are supposed to use the *exact same rule* — the element finder (`resolver.js`) and the "find it a different way" self-healing step (`run.js`) — were never updated. They still don't know placeholder text can be a name at all.

- **Concretely, what breaks:** Say a skill was compiled to click a search box, and because it only has placeholder text, the compiler stores its identity as "a combobox named Search." Now imagine the page changes slightly and the normal way of finding that box stops working (this is exactly the situation self-healing exists for). Self-healing tries to re-find the element by its name — but the runtime's idea of "its name" doesn't include placeholder text, so it comes up with an empty name and gives up immediately (`if (!name) return false;` in `run.js`), or scores the correct element as a bad match in the resolver. The skill either fails outright, or falls through to a much slower, costlier, LLM-assisted repair for something that was supposed to be free and instant.

- **Why this is significant right now, not hypothetical:** this isn't a dusty corner of the code — it's the exact feature currently being built and tested in this session's uncommitted diff. The new tests (`test_role_signal_falls_back_to_placeholder_name`, `test_placeholder_outranks_label_text_in_ax_name` in `conxa-cloud/tests/test_selector_durability_order.py`) prove the compiler side works. Nobody wrote — or ran — the equivalent check on the runtime side, so this gap wasn't caught before now.

- **Steps to reproduce:**
  1. Record a workflow where a step targets an input that has a `placeholder` attribute but no `aria-label`, `name` attribute, or visible text (e.g., a search box).
  2. Compile it — the compiled selector will be something like `role=combobox[name="Search"]` (confirmed by reading `identity_bundle.py`'s current diff and its accompanying test).
  3. At execution time, force that primary selector to fail (e.g., the search box's role changes slightly, or it moves inside a re-rendered container) so the runtime falls back to accessibility-based recovery.
  4. Read `runtime/run.js`'s `a11yRecoveryName` (around line 1094–1097): it builds the name from `aria_label`, `name`, `inner_text`, then `label_text` — placeholder is missing from the list entirely.
  5. Because the element has none of those four fields, `a11yRecoveryName` returns `""`, and recovery immediately bails out (`if (!name) return false;`), without ever trying.

- **Expected vs. actual:**
  - Expected: recovery derives "Search" from the placeholder, exactly like the compiler did, and successfully re-finds the element for free.
  - Actual: recovery sees an empty name and refuses to even try, or (in the resolver's general scoring, not just recovery) under-scores a correct candidate because it can't match on the placeholder-derived name either.

- **Root cause:** the "what counts as this element's name" rule now lives in three places that are supposed to agree (`identity_bundle.py` at compile time, `resolver.js`'s `fpName` at match time, `run.js`'s `a11yRecoveryName` at recovery time) — the code comments in the runtime files even say explicitly "Precedence must mirror the compiler's canonical derivation" — but only one of the three was updated when placeholder support was added. The data itself isn't lost — `placeholder` is captured by the recorder and stored on every compiled step (confirmed in `packages/conxa-core/conxa_core/models/skill_spec.py` and `conxa_compile/compiler/build.py`) — it's just never read by the two runtime consumers.

- **User impact:** any skill whose element only has placeholder text for identification — a common pattern for search boxes and minimalist form fields — silently loses its free, instant self-healing. In practice this means: more skills escalate to paid LLM-based recovery than should, recovery takes longer, and in the worst case a step that could have healed itself instead just fails the run.

- **Recommendation:** add `placeholder` to both `a11yRecoveryName` in `run.js` and the `fpName` calculation in `resolver.js`, in the same position the compiler uses it (after `inner_text`, before `label_text`). This is a small, mechanical fix, but it needs a matching unit test on the runtime side (currently `runtime/test/` has none), otherwise the same drift will happen again the next time this precedence list changes anywhere.

---

### 🟡 Medium

#### M1 — "Sensitive (mask value)" checkbox is fully cosmetic — nothing masks anything

- **Files:**
  - `conxa-builder/electron/renderer/src/components/ParameterizationDrawer.tsx` (Human Edit UI — new checkbox, uncommitted)
  - `conxa-builder/python/conxa_compile/plugin_builder_saved_skill.py` (Compile/packaging stage)
  - `runtime/*.js` (Test Skill / execution stage)

- **Plain-language explanation:** When you parameterize a skill (turn a recorded value like a password or an account number into a reusable `{{variable}}`), the new Human Edit screen lets you tick a box labeled "Sensitive (mask value)." That's a reasonable, expected thing to want — you don't want your password showing up in plain text everywhere it's referenced.

  I checked every place downstream that a value like this could be displayed or recorded — the runtime's execution logic, its telemetry/analytics reporting, and its error messages — and the `sensitive` flag is never read anywhere in the runtime. It is only ever *written*: the checkbox saves it into the skill file, and the packaging step copies it into the shipped package. Nothing ever looks at it again. It's a promise with nobody keeping it.

- **Steps to reproduce:**
  1. In the Parameterization drawer, add a variable, tick "Sensitive (mask value)."
  2. Save. Confirm `inputs.json` in the compiled skill now has `"sensitive": true` for that variable (it does — `plugin_builder_saved_skill.py` lines 481–482 round-trip it faithfully).
  3. Search the entire `runtime/` folder for any code that reads a field called `sensitive` — there isn't any.

- **Expected vs. actual:**
  - Expected: a variable marked sensitive is masked (or at least redacted) anywhere its value could surface — logs, telemetry sent to the cloud, error text shown to the user or the AI agent driving execution.
  - Actual: it's masked nowhere. It behaves identically to an unmarked variable in every way except that the box is checked.

- **User impact:** low likelihood of a real-world leak *today*, because a quick check of the runtime's telemetry calls (`tracker.emit(...)`) shows they only send step indices and tier names, not raw values — so this isn't an active leak right now. But it's a **trust gap waiting to bite**: the checkbox actively tells the user their value will be protected, and it won't be, the moment any future code path (a new debug log, a new error message that echoes the interpolated value, a future telemetry field) is added without knowing this flag exists and needs to be honored.

- **Recommendation:** either wire the flag into every place a step's interpolated value could be surfaced (logs, error strings, future telemetry), or remove the checkbox until that's true. Shipping a checkbox that does nothing is worse than not having the feature — it actively misleads whoever checks it.

#### M2 — Pre-existing, currently-broken test for the auth-recording happy path

- **File:** `conxa-cloud/tests/test_build_studio_backend.py::test_auth_stop_recording_marks_plugin_ready`
- **Confirmed pre-existing, not caused by today's changes:** I temporarily reverted the one file this test touches (`conxa_compile/recorder/session.py`) back to its last-committed version and re-ran the test — it still failed identically. This bug is already on `main`.
- **Plain-language explanation:** Recording a login (an "auth" recording, used so Conxa can replay a workflow that requires being logged in) ends with the system saving the browser's login session to a file. There's an automated test that's supposed to check "did that file get saved correctly, and does the plugin end up marked ready?" It currently always fails.
- **Root cause:** at some point, the real code was changed for a good reason — a thread-safety fix, documented right in the code's own comments, explaining that a background thread now has to own the "save the session" step, instead of the request-handling code doing it directly, because of a Playwright threading restriction ("Cannot switch to a different thread"). That's a sound fix. But the test that's supposed to check this flow was never updated to match — it still simulates the *old* way things worked (a fake browser session whose "save" function does nothing when actually invoked the new way), so with the current code it always hits the "browser closed before a session could be saved" error path and fails. Tellingly, there's a second, newer-looking test right next to it (`test_auth_stop_recording_uses_autosaved_state_after_browser_close`) that *does* correctly simulate the new behavior, and it passes.
- **Steps to reproduce:** `cd conxa-cloud && python -m pytest tests/test_build_studio_backend.py::test_auth_stop_recording_marks_plugin_ready -q` — fails with `auth_capture_failed: Auth browser closed before a session could be saved.`
- **Expected vs. actual:** Expected: a passing test proving the "record a login, it gets saved, plugin becomes ready" path works. Actual: a permanently-red test that nobody can currently use to tell whether that path is healthy, because it's testing something that no longer happens.
- **User impact:** not a direct user-facing bug — the *real* auth-recording flow appears to work fine (the sibling test proves the current code path is exercised and passes). The impact is indirect but real: this test has presumably been red for a while, which means real regressions in "does auth recording actually finish and save" could slip through unnoticed, because the team either has to already know to ignore this specific failure, or CI here isn't actually gating merges.
- **Recommendation:** delete or rewrite `test_auth_stop_recording_marks_plugin_ready` to match the current (thread-owns-autosave) design — it's now fully redundant with `test_auth_stop_recording_uses_autosaved_state_after_browser_close`, which already covers the real behavior correctly.

---

### 🟢 Low

#### L1 — A `select`-type variable's default value isn't checked against its own options on the server side

- **Files:** `conxa-builder/python/conxa_compile/editor/workflow_mutations.py` (`_validate_skill_inputs`), `conxa-builder/electron/renderer/src/lib/skillInputVariables.ts` (`rowsToServerPayload`)
- **Plain-language explanation:** In the Parameterization drawer's normal form, if you make a variable a dropdown ("select") with a list of choices, and you set a default value, the interface stops you from picking a default that isn't one of the choices — that check lives in the front-end code. But the same drawer also has an "Advanced" raw-JSON editor that skips the form entirely. If someone pastes in JSON with a dropdown default that isn't actually one of its own listed options, nothing on the server rejects it — `_validate_skill_inputs` only checks that each variable has a valid, non-duplicate id. That mismatched default would flow straight through to the compiled skill and into a real run.
- **User impact:** minor — this requires deliberately using the advanced/raw-JSON path and making a typo, and the consequence is just "the input gets a default value that was never one of its valid choices," not a crash. Low likelihood, low blast radius.
- **Recommendation:** move the "default must be one of options" check into `_validate_skill_inputs` (server-side) so it applies regardless of which UI path was used to save it, not just the guided form.

---

## Test Suite Health (found while verifying the above)

Running the full backend test suite (`cd conxa-cloud && python -m pytest tests/ -q`) turned up **4 failing tests and 1 collection error**, on top of the issues above. I traced each one enough to characterize it, but did not go further given the scope of this audit:

| Test | Status | In scope of this audit? |
|---|---|---|
| `test_build_studio_backend.py::test_auth_stop_recording_marks_plugin_ready` | Fails (pre-existing) | Yes — see **M2** above |
| `test_llm_providers.py::test_provider_connectivity` | Collection error (`fixture 'provider' not found`) | Yes — see **C1** above |
| `test_llm_proxy_and_publish.py::test_org_dashboard_sees_same_user_personal_publish` | Fails (`403 admin role required` instead of `200`) | No — publish/RBAC, outside Recording→Compile→Human Edit→Test Skill |
| `test_llm_proxy_and_publish.py::test_org_dashboard_cannot_see_other_user_personal_publish` | Fails (same RBAC symptom) | No — same as above |
| `test_llm_proxy_and_publish.py::test_installer_history_survives_disk_wipe` | Fails (`404` fetching an old installer version after simulating a disk wipe) | No — installer hosting, outside pipeline scope |

The three RBAC/installer failures were not investigated further — they sit in the publish/plugin-hosting layer, which is downstream of "Test Skill" and outside what was asked for. They're listed here only so the reader knows the suite isn't fully green for reasons beyond the pipeline itself, and someone should look at them separately.

**The two new pytest files added by the in-flight parameterization work** (`test_retarget_wizard.py`, `test_selector_durability_order.py`) **pass completely — 95/95.** I read both files in full; they're thorough, they test real edge cases (frame-nested elements, durability floors, ephemeral-anchor filtering), and they gave me confidence that the retarget-wizard and selector-durability logic they cover is currently correct.

---

## Root Cause Themes

Looking across everything above, two structural patterns explain most of what I found:

1. **Shared contracts aren't enforced as shared.** The "how do we name this element" rule (H1) and the "what counts as a valid placeholder" rule (which, encouragingly, *was* centralized this session into `placeholder_grammar.py` after apparently existing as three separate near-identical regexes before) both live conceptually in one place but are implemented redundantly across Python and JavaScript, across compile-time and run-time. When one copy changes, the others don't automatically follow, and nothing currently catches the drift except a human noticing. The team's own comments in the code (e.g., "must mirror the compiler's canonical derivation") show they already know this is a fragile pattern — it's just not backed by a shared test or a single source of truth the way the placeholder grammar now is.

2. **UI promises and backend enforcement are being built by different amounts of effort.** The "Sensitive" checkbox (M1) is a UI feature that was fully wired for *storage* but not for *effect*. This tends to happen when a feature's data model ships before its consumers do — reasonable mid-development, but risky if it ships to users in that state, because the UI doesn't visually distinguish "this control does something" from "this control is decorative for now."

Neither theme is an indictment of the overall architecture — the deeper mechanisms (the identity/durability scoring in `identity_bundle.py` and `selector_score.py`, the resolver's margin-gated matching, the recording session's thread-safety handling) are carefully built and well-tested where they've had time to mature. The risk is concentrated at the edges of work that's still moving.

---

## Recommended Architectural Improvements

1. **One executable contract for "element name" / "placeholder grammar," not three manual copies.** `placeholder_grammar.py` is a good pattern — a single Python module that both the editor and the packaging code import, with a comment telling the JS side to mirror it by hand. Do the same for the accessible-name precedence (H1): put the ordered list of fields in one place per language (or generate one from the other), and add a cross-language test — even a simple one that reads the same fixture data and asserts both languages produce the same name — so a change in one without the other fails CI instead of shipping silently.
2. **A lint or CI check that greps for TODO-shaped promises like "Sensitive" flags and confirms they're consumed somewhere**, not just written. Even a manual checklist item in the PR template ("if you added a new per-input flag, list every place that reads it") would have caught M1.
3. **Treat a permanently-red test as a bug, not background noise.** M2 suggests this suite currently tolerates known-red tests. Once a test is red for a reason everyone "just knows," it stops being able to catch new regressions in that same area. Either fix it or delete it — a red test that nobody investigates provides negative value (it trains people to ignore red).
4. **Re-enable the CI execution gate.** This is already tracked as `ARCH-2` in `TODO.md` and isn't something I re-discovered — but it's directly relevant here: `gate_replay.js`, which replays a real skill against a real packaged runtime, is exactly the kind of check that would have caught H1 (a resolver/recovery regression that only shows up when a real page is involved), and it's currently disabled in CI per the project's own backlog.
5. **Secrets scanning as a pre-commit or pre-push hook.** C1 shouldn't have been possible to get this far — a basic secret-pattern scanner (there are several free ones) run before `git add`/`git commit` would have flagged this file immediately.

---

## Overall Assessment

The pipeline's **foundations are solid**: the identity/durability scoring, the resolver's uniqueness-margin gate, the tiered recovery cascade, and the recorder's thread-safety handling all show evidence of real engineering rigor and, where tests exist, those tests are thorough and pass. This is not a codebase full of naive mistakes.

The **immediate risk is concentrated in unfinished, in-flight work** — specifically the parameterized-variables feature currently sitting uncommitted in the working tree. It's about 90% of the way to solid: well-tested on the compiler/editor side, but with one real functional regression (H1) that undoes part of what the feature is trying to achieve, one UI feature that doesn't do what it says (M1), and one already-known secrets leak sitting right next to it in the same working tree (C1, unrelated to the feature itself but discovered in the same pass).

**Readiness verdict:** not ready to ship as-is. C1 needs to be resolved (key rotation, file removed from the tree) before *anything* in this working tree is committed or pushed, independent of the rest of this report. H1 should be fixed before the parameterization feature reaches customers, since it silently degrades the exact reliability guarantee (free, instant self-healing) that the rest of the recovery system is built around. M1 and M2 are important but not launch-blocking on their own — M1 should be fixed or the checkbox removed before this ships to avoid a false promise to users; M2 should be cleaned up as routine test hygiene.
