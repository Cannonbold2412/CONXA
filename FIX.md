# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

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
