# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## The compiler's second opinion can now point out a missing check, and quarantine a step instead of deleting it — 2026-09-10
The compiler's reviewer-helper check (from earlier this week) can now do two more things. First, it can notice when a step's real proof of success actually shows up a few steps later — like a "Payment successful" message that only appears after several more clicks — and add that as an extra, non-blocking check on the earlier step. Second, if it spots a step that clicked or hovered but genuinely changed nothing on the page, it removes that step from the finished workflow instead of leaving it in for someone to clean up by hand. Removed steps are never thrown away — they're kept in a holding area attached to the workflow, so if the compiler got it wrong, that step can be brought back later instead of being lost for good.

## The step that failed now tells the recovery helper which part of the workflow it's in — 2026-09-10
When a step fails while a skill is running, an AI helper steps in to figure out what went wrong. Until today it had no idea whether the broken step was part of signing in, filling out a form, or confirming something — context a person would use instantly. The compiler already quietly labels each step with that information but nothing used it. Now the recovery helper is told, in a plain sentence, which part of the workflow the failing step belongs to, which should make its guesses at fixing things noticeably better grounded.
