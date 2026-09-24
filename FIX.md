# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## Conxa now learns how each app signs you in, instead of guessing — 2026-09-25
Before, the system connected to an app by saving your sign-in and then guessing, from general page clues, whether a later visit was still signed in. Now, when you finish signing in and click Done, it actually studies what changed: what the page looks like signed in, versus what a completely fresh, signed-out browser sees on the exact same page. It only trusts a clue if it's true one way and false the other, the way a locksmith tests a new key both ways before handing it over — and it always re-tests the saved sign-in one more time before saving it for real. If that test doesn't pass, the sign-in window now stays open and tells you so, instead of quietly saving something unreliable; you can keep signing in, or choose to save it anyway. One more change: the sign-in window used to close itself the moment it merely reached the page you'd typed in as "success," even mid-login. Now only clicking Done ends it. Last, if a saved sign-in runs out partway through a workflow and it's one the system has studied this way, it reopens the sign-in window and picks the workflow back up on its own once you're signed in again — no need to start the whole thing over.

## Wrote down the plan for one-click "Connect" buttons for popular apps — 2026-09-25
Customers currently have to sign in to each app through a browser window that has to guess when they are finished, and that guessing has gone wrong before. We added a detailed to-do describing a built-in list of popular apps (like GitHub or Google) where Conxa already knows the correct sign-in page and what "signed in" looks like. The customer would just tap "Connect" once, and the company would no longer set each app up by hand. Nothing was built yet; this is the plan, including what is deliberately left out for now.
— 2026-09-25

**Saved this batch of sign-in work as organised checkpoints — 2026-09-25**
Several days of sign-in improvements were sitting unsaved in one big pile. They are now saved as five clear checkpoints: the sign-in detection, the behind-the-scenes learning, the setup screen, the tests, and the written notes. This makes it easy to see what changed and to undo one piece without losing the rest.
— 2026-09-25
