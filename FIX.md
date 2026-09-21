# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

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

## Signing in to an app no longer sends the assistant in circles — 2026-09-20
When a task needed you to sign in, the assistant said "sign in, then run it again" the moment the sign-in window opened, without waiting for you — so it kept re-running the task and repeating the same sentence. Now the task waits while you sign in and carries on by itself once you are done. There is also a new "authenticate" step the assistant can use on its own to open the sign-in tabs and wait longer for you. If something really is broken, such as the browser failing to start, you now get that real reason instead of a false "a window just opened".

## App updates now actually reach Conxa Execute — 2026-09-20
Conxa Execute kept running the old version even after a new one was published, because the update tried to fetch the file from GitHub, which tells the downloader "it's over there" and the downloader gave up instead of going there — like a courier who turns back when told the parcel is at the next door. Now the cloud hands the file over directly, so machines that already have Conxa installed can pick up updates by themselves. The downloader was also taught to follow "it's over there" directions for future versions.

## The built-in browser in Conxa Execute now works like a real browser, one sign-in at a time — 2026-09-20
When a task needed you to sign in to two apps, both sign-in pages opened but you could only ever see one, and finishing one quietly shut the other — like two people sharing a phone booth where the first to leave locks the door on the second. The browser now has a proper tab bar with a close button on every tab, a back button, a reload button and an address bar, and each sign-in tab is named after its app. Closing or finishing one sign-in leaves the others open, so you can go through them one after another and then watch the task run.

## You can now drag the built-in browser wider or narrower in Conxa Execute — 2026-09-20
The browser that slides in beside the chat used to be stuck at a fixed size, like a window nailed to the wall. Now there is a thin handle on its left edge: drag it left or right to give the browser or the chat more room. Conxa remembers your chosen width the next time you open the app.

## Found out why Build Studio kept running an old engine, and made the failure visible — 2026-09-20
Build Studio was checking for a new engine every time it opened, downloading it, and then quietly throwing it away because the safety check on the file didn't match what the cloud said it should be — like a delivery being refused at the door every single day, with nobody told. The fingerprint we publish for the engine is typed in by hand in one place and generated automatically in another, and the two had drifted apart. Build Studio now shows the problem in a banner instead of hiding it, so this can't go unnoticed again, and we are shipping a fresh engine release to clear it.

## A single page now explains how Conxa reaches a customer and how updates arrive — 2026-09-20
Anyone new to Conxa had to piece together how the product actually gets onto a customer's laptop by reading several long technical documents. There is now one shareable page that walks through it in plain words: what the company installer really contains, what happens in the first minute after someone runs it, and why each part of the product updates on its own schedule. It is written for salespeople, founders and new hires, not engineers.

## Saying hello to Conxa no longer starts a job, and the sign-in window can no longer get stuck — 2026-09-20
Typing just "hello conxa" used to make the chat go and run a saved workflow on its own, like a receptionist who hears "hello" and starts a job. Now the chat only runs a workflow when you ask for one, and it always shows a small "Run this skill?" card first so you can approve or cancel. We also fixed two things that would have made sign-in windows misbehave inside the app: a "Sign in with Google" pop-up could open invisibly, and walking away from a sign-in could leave the next attempt saying a window was still open forever.

## Conxa now tells you to restart after an engine update, in every app that uses it — 2026-09-20
Before, when a new engine version was downloaded, the old version just kept running with no warning until someone happened to restart. Now the engine itself pauses new skill runs and tells you to close and reopen the app, so everyone gets the same message. It never blocks scheduled runs that nobody is watching, and if a restart somehow doesn't fix things after a few tries it stops nagging so nobody gets locked out.

## Made a 24-second launch film for Conxa, built straight from the product's own screens — 2026-09-20
We had no short video that shows what Conxa actually does, so anyone evaluating us had to read their way to it. There is now a 24-second launch film: someone types one plain sentence, and the video shows an AI agent doing the whole job across three separate internal systems — creating the employee record, granting the permissions, uploading the documents, sending the welcome email — and finishing. It closes on the part that matters most to a buyer: six months later the screen has been redesigned, and the automation still finds its way. Everything on screen comes from our own website and brand — the same colours, the same words, the same example employee — so it looks like the product, not like a stock video, and it makes no claim we cannot back up.
