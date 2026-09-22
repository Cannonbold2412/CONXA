# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## A "Done" button for tricky sign-ins, a tuning log, and a "Signed in as" note — 2026-09-22
Three small follow-ups to today's sturdier sign-in check. First, for the rare login the automatic checks genuinely can't work out on their own, Conxa Execute's browser panel now shows a "Done" button right on that sign-in tab — click it and the window closes and saves immediately, no more waiting out a ten-minute timer. The same thing can also be triggered from a command line for anyone not using the panel. Second, every sign-in now quietly writes down which check actually decided it was finished, so we can look back later and fine-tune the timing instead of guessing. Third, when a page shows an account name or profile picture right after signing in, Conxa now notices and can say "Signed in as ___" — a small confidence check that you landed on the right account. None of these change how sign-in normally works; they only kick in for the edge cases.

## The sturdier "are you signed in yet?" check is now built, not just planned — 2026-09-22
The interactive explainer from earlier today is now real, working code. The sign-in window no longer decides you're done just by glancing at the web address. It now watches for a few small clues at once (the address changing, the password box disappearing, a new cookie showing up), double-checks with the website itself by quietly asking for the login page again, waits for things to fully settle before saving, and then tries the saved sign-in once more to make sure it actually works before closing the window. If that last check ever fails, you're told right away instead of finding out the next time you run the workflow. This fixes real problems: a text-message code no longer gets skipped, and a site that writes its last piece of the login a moment late no longer gets cut off early. Nothing about what you type in when setting up a sign-in changed — this all happens automatically on top of it.

## An interactive explainer for a sturdier "are you signed in yet?" check — 2026-09-22
Today the sign-in window decides you're done by watching the web address, which gets fooled by pop-up logins, texted codes, and sites that finish handing over the login a moment late. We wrote up a proposed fix as an interactive page: several quick "something happened" signals, a question put directly to the website to confirm, and a short wait for things to settle before saving. The page lets anyone replay five real kinds of login and see where today's method goes wrong and the new one doesn't. Nothing in the product has changed yet; this is the plan to review.

## The sign-in explainer now works from just the login address — 2026-09-22
We reworked the interactive sign-in explainer so the plan no longer needs to be told which page the app lives on, because that page is often a different website or changes over time. The main trick is to ask the website for its login page again: a signed-in person gets sent straight past it. Other ideas round it out: following where the customer goes after Google or Microsoft sign-in, noticing when the password box disappears, a "not finished yet" pause for texted codes, and double-checking every saved login before the window closes. A new grid shows that wherever one of these checks gets fooled, another one catches it.

## Conxa Execute can now use its own AI model, separate from the rest of the platform — 2026-09-22
Until now the Execute chat borrowed the same AI engine that Build Studio uses, so a busy day for one slowed the other. Now Execute can be pointed at its own AI provider, using a single picture-capable model for every chat, with or without images. If nothing is set up it keeps working exactly as before, like a spare phone line that only gets used once it is plugged in.

## Signing in to Google Drive now closes its own window and moves on — 2026-09-21
Google Drive's sign-in window used to stay open forever, even after you signed in, and the task never started. The assistant was opening Google's general account page, so when you finished it sent you back there instead of to Drive — like being told to wait at the wrong door. Now it opens Drive itself, so you land where it is looking, the window closes on its own, and the task carries on. This also fixes the same trap for other companies that sign in through a separate login site, and Build Studio now warns you if a sign-in was saved without ever reaching its expected page.

## You can now drag the left panel in Conxa Execute to make it wider or narrower — 2026-09-21
The list of chats on the left used to be one fixed width, so long chat names got cut off. Now you can grab its right edge and drag it to the size you like, and the app remembers your choice next time. It is like sliding a bookshelf divider to give one side more room.

## Fixed the Conxa Execute release build stopping on its first version number — 2026-09-21
The automatic build for Conxa Execute stopped with an error because it tried to set the app's version to a number it already had. It is like a clerk refusing to change a label to what it already says. The build now accepts the same number and carries on, so the first release can go out.

## A task that needs a login now warns you when it visits a site nobody set up a sign-in for — 2026-09-21
If a recorded task wandered onto a website that has no sign-in set up, it used to run happily until it hit that site's login page and then fail with no warning. Now the group page in Build Studio shows a small amber tag on that task naming the site, and the assistant is told the same thing before the task starts. It is only a heads-up, never a block — like a note on a route saying "no toll pass for this bridge" before you drive.

## Packs with no sign-in group are refused up front, instead of failing on a customer's computer — 2026-09-21
Conxa used to keep a second, older way of signing in alive for packs that had no sign-in group, which quietly opened extra browsers and was easy to get wrong. That old way is gone. Build Studio now refuses to build a pack when a task's group was deleted, and says which task to move, so the problem is caught where it can be fixed rather than on a customer's machine. A pack that somehow still lacks a group now gets a plain message saying to rebuild it.

## A fresh login can no longer be overwritten by an older copy of the same one — 2026-09-21
When two apps share one company login, Conxa merged their saved sign-ins and simply kept whichever came first, even if it was the older one. Now the most recently saved sign-in always wins. It is like keeping the newest photo of a document instead of whichever one happens to be on top of the pile.

## Testing a task in Build Studio can no longer start a second run behind your back — 2026-09-21
If a login had expired at the wrong moment, the test would report "sign-in needed" but the task could still start on its own later, once you signed in, with nobody watching. Now a test that finds a missing login just stops and says so, and nothing starts afterwards. Real assistant runs behave exactly as before.

## A scheduled task no longer pops open a login window on a computer nobody is sitting at — 2026-09-21
When an overnight task found an expired login, it opened a sign-in window that nobody would ever see, and then failed anyway. Now it opens nothing, stops straight away, and records which app needs signing in, so the next person at that computer knows exactly what to do. We also wrote guidance for software makers on setting up longer-lasting logins for their own automated computers.

## Removed two leftover files nothing was reading — 2026-09-21
Build Studio wrote a small description of each sign-in group next to a test run, and the runtime kept a note about each login, but nothing ever looked at either one. Both are gone, along with two web addresses the system looked for but never received. Nothing changes for anyone using the product; there is simply less to get out of date.

## Fixed a stray fold-away section that hid the Done list — 2026-09-21
Six spots in the Done list had a leftover "Original description" fold-away that was never closed, so it swallowed everything below it until you clicked it open. We removed those leftovers, and nothing was lost because they held no text. Everything now shows without any clicking.

## The Done list is now organised by area, with a summary table — 2026-09-21
The Done list used to be sorted only by date, so it was hard to see what had been finished for any one part of the product. It is now split into sections such as Build Studio, Execution and Cloud, each in numbered order with its finish date. A table at the top shows at a glance which items are done in each area.

## The to-do list now shows only work that is still open — 2026-09-21
About seventy finished items were still sitting in the to-do list with a line through them, burying the work that is left. We moved every one of them into the Done list, grouped by the day it was finished. The to-do list is now much shorter and its counts show only what is still open.

## Finished to-do items now move to their own "Done" list — 2026-09-21
Our to-do list used to keep finished items in place with a line through them, so it kept growing and got harder to read. Now a finished item is cut out and filed in a separate Done list, with the date and a one-line note on what fixed it. The to-do list stays short and shows only what is still open.

## Signing in to an app no longer freezes or loops the assistant — 2026-09-21
Before, asking for a task that needed a sign-in made the assistant wait with no word, then give up after under a minute — far too short if you needed a code from your phone or had to solve a puzzle. Now it tells you at once which apps to sign in to, then starts the task on its own the moment you finish, however long that takes. If you close the sign-in page or it doesn't work, you're told which app it was and can try again, and the task never starts half-signed-in.

## One browser per task, and a clear message when they're all busy — 2026-09-21
Signing in to two apps used to open up to four separate browser windows behind the scenes, like a table of people each fetching their own chair. Now the whole task shares one browser: sign-in pages open as tabs in it, only for apps that actually need it, close themselves when you're done, and the task carries on in that same browser. If five tasks are already running, a sixth is told plainly that every browser is busy and to wait, instead of piling on.
