# Fix Log Archive — Index

`FIX.md` (repo root) is updated after every prompt per `CLAUDE.md`'s instructions. It's rotated at
each calendar-month boundary, or earlier if it exceeds ~800 lines before one does, to keep the live
file scannable. This index lists every rotated file plus the live one.

| File | Date range | Entry count | Notable topics |
|---|---|---|---|
| [`FIX-2026-06.md`](FIX-2026-06.md) | 2026-06-27 to 2026-06-30 | ~13 | Element-finding fix (`--no-bytecode`), CI execution gate added (`gate_replay.js`), Chromium install fix, README deployment guide, Razorpay→Cashfree payment gateway switch, Tier 3/4 self-healing recovery made enterprise-ready, runtime version-numbering fix |
| [`FIX-2026-07.md`](FIX-2026-07.md) | 2026-07-01 to 2026-07-06 | ~35 | Phase 1 architecture consolidation finished, Phase 2 production-readiness (billing limits, cache GC, drift warnings, error UX), enterprise-grade runtime auto-update system, dev/prod environment isolation, Cashfree subscription fix, Security/Sales-Blockers tracker refreshes, Build Studio + Cloud code cleanups (Phase 1/3/4 refactors), critical-analysis Q&A series, dev-mode "Build failed"/installer/publish fix chain, first Build Studio redesign proposal |
| `FIX.md` (live) | 2026-07-07 to present | ~23 | Build Studio workflow redesign (new sidebar, auto-build on approve, package inspector, re-target wizard as a guided 3-step then 3-page flow), giant-strategy backlog write-ups, Publish Skill Package became the real primary release action (installer split out, cloud patch reconciliation) |

**Rotation rule of thumb:** when `FIX.md` crosses a month boundary (or ~800 lines), split by each
entry's own trailing `— YYYY-MM-DD` date — not by a blind line-number cut, since entries are not
always strictly chronological top-to-bottom — into a new `FIX-<YYYY-MM>.md`, add a row above, and
reset the live file to a short header pointing here plus the current month's entries.
