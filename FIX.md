# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## Made the Execute chat feel finished — 2026-09-25
Chats used to stay named "New chat" forever, and the "+" button did nothing. Now a chat is named after your first message, a green dot shows next to any chat that is still working, and the "+" lets you attach pictures or text files up to 10 MB. We also removed the duplicate "Runs" list, gave Settings a slim scrollbar that matches the theme, moved "Software update" onto its own tab, and dropped the separate "Personal" workspace choice for people who already belong to a team.

## Chats keep working when you switch away — 2026-09-25
If you left a chat while it was still answering, coming back used to show it as if your message was never sent. Now the chat remembers your message and keeps showing the reply as it arrives, like a phone call you can put on hold and return to. Two chats can also answer at the same time without their text getting mixed up.

## Tidied up the code that handles signing in to apps — 2026-09-25
The sign-in code had two near-identical copies of the same "has the person finished signing in yet?" routine, like two clocks wired separately that could drift apart. They now share one routine, and the small saved-notes helpers were moved into their own tidy drawer. Nothing changes for users, but future fixes to sign-in only need to be made once.

## Conxa now learns how each app signs you in, instead of guessing — 2026-09-25
Before, the system connected to an app by saving your sign-in and then guessing, from general page clues, whether a later visit was still signed in. Now, when you finish signing in and click Done, it actually studies what changed: what the page looks like signed in, versus what a completely fresh, signed-out browser sees on the exact same page. It only trusts a clue if it's true one way and false the other, the way a locksmith tests a new key both ways before handing it over — and it always re-tests the saved sign-in one more time before saving it for real. If that test doesn't pass, the sign-in window now stays open and tells you so, instead of quietly saving something unreliable; you can keep signing in, or choose to save it anyway. One more change: the sign-in window used to close itself the moment it merely reached the page you'd typed in as "success," even mid-login. Now only clicking Done ends it. Last, if a saved sign-in runs out partway through a workflow and it's one the system has studied this way, it reopens the sign-in window and picks the workflow back up on its own once you're signed in again — no need to start the whole thing over.

## Wrote down the plan for one-click "Connect" buttons for popular apps — 2026-09-25
Customers currently have to sign in to each app through a browser window that has to guess when they are finished, and that guessing has gone wrong before. We added a detailed to-do describing a built-in list of popular apps (like GitHub or Google) where Conxa already knows the correct sign-in page and what "signed in" looks like. The customer would just tap "Connect" once, and the company would no longer set each app up by hand. Nothing was built yet; this is the plan, including what is deliberately left out for now.
— 2026-09-25

**Saved this batch of sign-in work as organised checkpoints — 2026-09-25**
Several days of sign-in improvements were sitting unsaved in one big pile. They are now saved as five clear checkpoints: the sign-in detection, the behind-the-scenes learning, the setup screen, the tests, and the written notes. This makes it easy to see what changed and to undo one piece without losing the rest.
— 2026-09-25

**Fixed "your Google sign-in expired" showing up right after signing in — 2026-09-25**
Testing a GitHub-to-Google-Drive workflow kept saying Google had signed out, even seconds after the person signed in again. The test was quietly using an old, dead Google login left over from the day before instead of the fresh one — like handing the guard yesterday's expired ticket while today's sits in your pocket. Now the test refuses to run if the sign-in setup changed since the last build and tells you to rebuild, a dead login sitting on Google's "choose an account" screen is recognised as signed out, and a failed run no longer hides the fact that it needs a fresh sign-in.
— 2026-09-25

**Made every workflow in a group need all of that group's apps signed in — 2026-09-25**
Each workflow used to carry its own separate list of "apps I need", and that list could disagree with the group and let a workflow start while one app's login was already dead. Now a group works like a building with one security desk: to run any workflow inside it, every app in the group has to be signed in first. The extra list is gone, and so are the mix-ups it caused.
— 2026-09-25
