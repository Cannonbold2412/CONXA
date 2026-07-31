# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Fixed the workflow-test error for real — three earlier fixes were treating the wrong cause — 2026-08-01
Running a test in Build Studio kept failing with a message blaming a "locked folder," even after three separate fixes over the last two days tried to work around exactly that. The real problem was different: the small program installed alongside Build Studio uses an older, slightly limited version of a system tool for recognizing a certain kind of shortcut folder that Windows uses to always point at "whichever version is current." Because that older tool couldn't tell the shortcut apart from an ordinary folder, Build Studio's own cleanup step — which is supposed to delete old, unused versions — mistook the shortcut for stale leftovers and deleted the real folder it was pointing at, breaking the shortcut for good. Every retry after that failed the same way, because the shortcut was permanently broken, not temporarily locked. The tool now recognizes that kind of shortcut correctly, so the cleanup step leaves it alone, and any workflow test sandbox left broken by the earlier bug repairs itself automatically the next time it's used — no manual fix needed once this update is installed.
