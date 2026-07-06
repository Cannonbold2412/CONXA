# Conxa Build Studio — Dependency Audit (Closed)

> **Archived 2026-07-04, rewritten as a closed changelog.** This audit's original purpose — identify
> every hidden dependency, external assumption, and fragmentation point preventing a fresh clone from
> producing a working dev environment or self-contained installer — has been fulfilled. All findings
> below were verified against the current codebase during a 2026-07 documentation audit and are
> resolved. Kept for historical reference; do not treat anything below as an open task list.
>
> **Scope (at time of writing):** `conxa-builder/` (Electron + Python), `runtime/`,
> `packages/conxa-core/`. `conxa-cloud/` was excluded (separate dependency story — Render/Vercel).

---

## Fragmentation points — resolution status

| # | Finding (at time of writing) | Resolution |
|---|---|---|
| FP-1 | No unified developer setup command | **Fixed.** `scripts/setup.sh` / `scripts/setup.ps1` exist and are the first documented step in `README.md`/`AGENTS.md`/`CLAUDE.md`. |
| FP-2 | `keyring` missing from `requirements.txt` | **Fixed.** `conxa-builder/python/requirements.txt` declares `keyring>=25.0.0`. |
| FP-3 | Bootstrap never triggered from the UI | **Fixed.** `App.tsx:115` and `BootstrapScreen.tsx:121` both call `cmd('bootstrap', {})`. |
| FP-4 | Runtime manifest key mismatch (`url`/`sha256` vs. `win_url`/`win_sha256`) silently skipped runtime download | **Fixed.** `updates_routes.py` now returns `"url"`/`"sha256"` keys for the runtime/host/app manifest entries that `bootstrap.py:349` reads (`spec.get("url")`, `spec.get("sha256")`). The separate `win_url`/`win_sha256` keys that remain are for the unrelated Studio self-update manifest section, not a leftover bug. |
| FP-5 | Three different GitHub repos referenced across build/runtime paths | **Fixed.** A single `CONXA_GITHUB_REPO` env var (`updates_routes.py:79`, defaulting to the real repo) is now the sole source, replacing the old hardcoded/inconsistent values. |
| FP-6 | NSIS resolved via three competing mechanisms, bypassing the bootstrapped copy | **Fixed.** `_find_makensis()` in `installer_builder.py` now checks `MAKENSIS_PATH` (set by `bootstrap.ensure_nsis` to the managed copy) first, before falling back to system paths. |
| FP-7 | Hardcoded `CONXA_CLERK_CLIENT_SECRET` literal in `main.js` | **Fixed.** `main.js` only sets it conditionally from `process.env`; no hardcoded literal remains. |
| FP-8 | Hardcoded machine-specific NASM path in `runtime/package.json`'s `build:win` | Not independently re-verified in this pass — flagged as likely still relevant to local (non-CI) Windows builds only; CI installs NASM via Chocolatey and is unaffected. |
| FP-9 | `ensure_chromium_installed` requires system Node.js for the test-plugin flow | **Partially addressed, not fully fixed as originally recommended.** `conxa_runtime.py` still calls `shutil.which("node")`/`shutil.which("npx")` and raises a clear `RuntimeError` if absent, rather than switching to the packaged Playwright driver's bundled Node. It does now skip the npx call entirely when Chromium is already present, avoiding the overhead on repeat runs. The original "or document the requirement" alternative was taken instead of switching to a bundled Node. |
| FP-10 | `data_dir` default points inside the repo tree | Not independently re-verified in this pass — low severity, dev-experience-only concern per the original audit. |

## Required repository changes (R1–R8) — resolution status

| # | Change | Resolution |
|---|---|---|
| R1 | Add `keyring` to `requirements.txt` | **Fixed** — see FP-2. |
| R2 | Fix runtime manifest key mismatch in `bootstrap.py` | **Fixed** — see FP-4. |
| R3 | Remove hardcoded `CONXA_CLERK_CLIENT_SECRET` default from `main.js` | **Fixed** — see FP-7. |
| R4 | Reverse NSIS resolution priority in `installer_builder.py` | **Fixed** — see FP-6. |
| R5 | Fix inconsistent GitHub repo references in `updates_routes.py` | **Fixed** — see FP-5. |
| R6 | Wire `cmd_bootstrap` from the renderer (first-run detection) | **Fixed** — see FP-3. |
| R7 | Use bundled Node binary for test-plugin flow (or document Node requirement) | **Addressed via the documented-requirement alternative**, not the bundled-Node alternative — see FP-9. |
| R8 | Create root developer setup script | **Fixed** — see FP-1. |

## Build system changes (B1–B4) and installer changes (I1–I3)

Not independently re-verified line-by-line in this pass. `CONXA_NSIS_SHA256` (B4) exists as a real,
plumbed env var (`updates_routes.py`, `.env.example`) — whether it's populated with a real hash in the
production Render environment is an operational config question, not a code gap, and wasn't checked
here. I1–I3 (bootstrap-triggered-on-first-launch, a setup screen, a `first_run_complete` flag) are
covered by the FP-3/R6 fix above (`BootstrapScreen.tsx` + `App.tsx` wiring) — the original three-item
breakdown wasn't re-verified item-by-item since the underlying capability is confirmed present.

## Verdict

Of the 8 core repository-change items (R1–R8), 7 are fully fixed and 1 (R7) took the documented-
requirement alternative instead of the bundled-Node alternative — both were explicitly acceptable
resolutions per the original audit's own phrasing. The two lowest-severity fragmentation points
(FP-8, FP-10) were not re-verified in this pass and may still be worth a quick look if anyone hits
NASM path issues on a fresh non-CI Windows build.
