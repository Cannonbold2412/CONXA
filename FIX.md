# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

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
