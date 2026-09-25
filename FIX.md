# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## Fixed signing in successfully but the workflow never starting — 2026-09-25
In the Execute app, you could finish signing in to Google and GitHub, watch the sign-in window close, and then nothing would happen, and saying "I've already signed in" just got you asked to sign in again. The app was failing to save your sign-in, because of a limit in the app's built-in browser that it didn't account for, and it hid that failure. It now saves your sign-in in a way that works inside the app, so the workflow starts on its own right after you sign in. If saving ever fails again, it is now recorded instead of silently asking you to sign in a second time.

## Fixed sign-in restarting while you approve it on your phone — 2026-09-25
After typing your Google password and tapping "Yes, it's me" on your phone, the sign-in window jumped back to the email page. While you were waiting on the phone screen, the app wrongly decided you were already signed in, saved an unfinished sign-in, closed the window and started over. Now the app waits until you have actually left the sign-in pages, then double-checks with the website itself before deciding anything. That works the same way on any website, with no list of page names to keep up to date, so extra security steps (codes, phone approvals, "verify it's you") are simply waited out. You sign in once, however many steps it takes.

## Cleaned up old, unused code in the local runtime and made its errors easier to understand — 2026-09-25
The program that runs a workflow on a customer's computer had built up years of leftover safety nets for pack formats nobody builds anymore, and in a few places it quietly guessed instead of stopping to say something was wrong. We removed the dead leftovers, and turned the riskiest silent guesses into clear stops: a retry limit that could never actually run out now works as intended, a check step that used to pass no matter what now actually checks, and a workflow whose recorded browser tab has closed no longer keeps going on the wrong tab. Update checks, scheduled runs, and the telemetry it sends home now fail loudly and log why instead of getting stuck silently. Error messages shown to the assistant running a workflow are now written in plain sentences instead of raw technical dumps. Separately, a "did this step actually work?" check the system compiles for every workflow was being computed but never actually attached to the finished package, so it silently never ran — that is now fixed too.

## Fixed the sign-in screen jumping back to the first page — 2026-09-25
While you signed in to Google, the browser kept flipping back to the very first sign-in page right after you typed your email. The app was quietly opening extra tabs to check whether you were signed in yet, and each one grabbed the screen and reloaded the login page — like someone repeatedly pulling you back to the front door mid-conversation. Those checks now stay in the background and wait until you have actually left the sign-in pages, Asking "are you done yet?" while the sign-in window is open also no longer starts anything new — it just points at the window that's already there. So you can log in once, at your own pace.

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

**Fixed messy-looking lists in the Execute chat — 2026-09-25**
When the assistant listed what a task needs, the lines showed up with raw dashes and brackets, like a note typed in a hurry. Now they appear as clean bullet points, and the assistant is told to write short plain lines. This makes the chat easier to read at a glance.

**Fixed "rebuild the skill package" wrongly showing up after a normal reconnect — 2026-09-25**
Yesterday's fix that tells you to rebuild when an app's sign-in setup genuinely changed had a side effect: every time you simply reconnected an app that hadn't changed at all, the system stamped a "just learned this" timestamp onto its notes and then saw that timestamp as a change — so it demanded a rebuild every single time, like a librarian re-stamping a book "new" every time it's returned and then insisting it must be re-catalogued. It now compares what it actually learned about the sign-in, not when it learned it, and keeps the existing notes untouched when a reconnect confirms nothing changed. Reconnecting an app and testing again now works without an unnecessary rebuild in between. If you're seeing this message right now, rebuild the skill package one more time to clear it out — after that, it shouldn't reappear unless the sign-in setup genuinely changes.
— 2026-09-25

**Fixed the online service failing to start after a deploy — 2026-09-25**
The cloud service crashed on launch because it was missing one of the two database connectors its database address asked for. Like a plug that did not fit the socket, nothing could talk to the database. We added the missing connector so the service starts normally again.
— 2026-09-25

**Rewrote the main technical reference so it describes how things work today — 2026-09-25**
The engineering handbook had grown to nearly five times the length it needed, because every change was added as a new paragraph on top of the old ones instead of replacing them. Readers had to wade through several outdated versions of the same explanation to find the current one, like a recipe card covered in crossed-out edits. It is now rewritten to describe only how the product works today, at well under half its old length, with related topics grouped together. Every other document and note that pointed to a page inside it was updated so those links still land in the right place.
— 2026-09-25
