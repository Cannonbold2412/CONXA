# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Fixed a new tab pausing for up to two minutes before it typed the web address — 2026-08-16
Right after fixing yesterday's tab mix-up (below), testing turned up a side effect of that very fix: when a workflow opens a brand-new tab itself (like pressing Ctrl+T) and then goes to type a web address into it, the app was sitting there doing nothing for up to a full minute — sometimes two — before it actually entered the address. The cause: a safety wait added to make sure a newly opened tab has actually loaded before acting on it was also being applied to a blank tab the app had just created itself, one that was never going to load anything on its own until the very next step told it exactly where to go. It's like standing at a red light that's stuck on red, waiting for it to turn green, when you were actually supposed to just drive through it because you're the one who's about to move. That wait is now skipped for tabs the app opens itself, and still applied for tabs a website opens on its own (where waiting for it to finish loading is the right thing to do).
 — 2026-08-16

## Fixed a two-tab workflow replaying on the wrong page and giving up too soon on slow websites — 2026-08-16
A workflow that logs into Render and then opens a Vercel project in a new tab was failing on replay. Two separate problems were combining. First, the app only waited 15 seconds for a page to finish loading before moving on — not long enough for a slower site like Vercel, so it would try to click things that hadn't appeared yet. That wait has been raised to a full minute everywhere it matters, like giving someone more time to answer the door before assuming nobody's home. Second, and more seriously, when a workflow opens more than one browser tab, the app could lose track of which tab it should be typing into — it would end up filling in a login form on the wrong tab entirely, the one that was supposed to stay untouched. That mix-up is now prevented: the app keeps a clear record of which tab it has already assigned to which step, so a tab that's already spoken for can never be handed out again by mistake. A related recording bug that could occasionally mislabel which tab a popup came from was fixed too, so newly recorded workflows won't repeat the problem.
 — 2026-08-16
