# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Publishing a skill pack update is now a real, undoable release — 2026-08-19
Until now, publishing a new version of a skill pack quietly threw away the old one — there was no way to go back if something shipped broken. The Publish page is now a full Release Center: before you publish, it shows exactly what changed since the last release, in plain terms (steps added, changed, or removed). Publishing an identical copy by mistake is blocked instead of silently accepted. Every published version is kept forever, so if a release causes problems, an admin can roll back to any earlier version with one confirmed click — nothing gets rebuilt or re-uploaded, it just switches back, and customer machines pick up the change automatically the next time they check in. The page also shows which customer machines are on the current version and a full history of who published or rolled back what and when. A read-only copy of the release history and rollout status is also visible on the web dashboard, so support staff can check status without opening the desktop app.
 — 2026-08-19
