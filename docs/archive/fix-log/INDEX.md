# Fix Log Archive — Index

`FIX.md` (repo root) is updated after every prompt per `CLAUDE.md`'s instructions. It's rotated at
each calendar-month boundary, or earlier if it exceeds ~800 lines before one does, to keep the live
file scannable. This index lists every rotated file plus the live one.

| File | Date range | Entry count | Notable topics |
|---|---|---|---|
| [`FIX-2026-06.md`](FIX-2026-06.md) | 2026-06-27 to 2026-06-30 | ~13 | Element-finding fix (`--no-bytecode`), CI execution gate added (`gate_replay.js`), Chromium install fix, README deployment guide, Razorpay→Cashfree payment gateway switch, Tier 3/4 self-healing recovery made enterprise-ready, runtime version-numbering fix |
| [`FIX-2026-07.md`](FIX-2026-07.md) | 2026-07-01 to 2026-07-03 | ~29 | Phase 1 architecture consolidation finished, Phase 2 production-readiness (billing limits, cache GC, drift warnings, error UX), enterprise-grade runtime auto-update system, dev/prod environment isolation, Cashfree subscription fix, Security/Sales-Blockers tracker refreshes, Build Studio + Cloud code cleanups (Phase 1/3/4 refactors), critical-analysis Q&A series |
| `FIX.md` (live) | 2026-07-04 to present | ~11 | Dev-mode "Build failed" fix chain, installer builder NSIS rejection fix, local dev cloud publish fix, plugin-test runtime-version mismatch fixes, Human Edit "Add" dropdown fix, Record Login hang fix, auth-session threading fix, flickering login window fix |

**Rotation rule of thumb:** when `FIX.md` crosses a month boundary (or ~800 lines), split by each
entry's own trailing `— YYYY-MM-DD` date — not by a blind line-number cut, since entries are not
always strictly chronological top-to-bottom — into a new `FIX-<YYYY-MM>.md`, add a row above, and
reset the live file to a short header pointing here plus the current month's entries.
