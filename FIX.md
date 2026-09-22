# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## The sign-in check now remembers where it landed, and double-checks itself more carefully — 2026-09-23
Two gaps left over from the sturdier sign-in check we shipped this week. First, some apps never got told exactly which page counts as "signed in" — so every single run, Conxa would open a login window even though the sign-in from last time was still perfectly good, because it had nothing to compare against. Now it quietly remembers the first real page a sign-in lands on and uses that going forward. Second, the background double-check that asks the website "are you signed in?" used to sometimes ask over and over, tick after tick, instead of just once — like knocking on a door repeatedly instead of waiting for an answer. It now asks once, compares what the login page showed before and after, and only asks again if something new actually happens. Neither change affects how a sign-in looks to the person doing it.
