# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Stopped the workflow test screen from asking for a "downloaded file dir" it should already know — 2026-08-19
Workflows that download a file and then upload it somewhere else (like "Testing os picker") are designed to need zero manual file paths — the app is supposed to remember where the download landed and use it automatically. But when trying to run a test of that workflow from the Build Studio, a dialog popped up demanding a value called "downloaded file dir" anyway, with no way to know what to type. The test screen was guessing at what inputs a workflow needed by scanning its internal steps, and it mistook an internal placeholder — one meant to be filled in automatically at run time — for something a person had to supply. It's like a form asking you to type in your own confirmation number before it's been generated. The test screen now trusts the same list of real, user-facing inputs the rest of the app already uses, so workflows like this one run straight through with no pointless prompt.
 — 2026-08-19

## Fixed uploads that download-then-upload a file sometimes asking for a file path anyway — 2026-08-19
Some workflows download a file, unzip it, and then upload the contents to a second app — the "Testing os picker" workflow is one of them. Occasionally, when the download from the website took a moment longer than usual, the app would check for the downloaded file too early — before the download had actually started — see nothing there, and give up. That made the later upload step ask for a file path by hand, even though the whole point of the workflow was that no one should have to type one in. It's like checking the mailbox the second you hear the truck outside instead of waiting for it to actually drop the mail. Now the app waits for the download to really arrive before moving on, so this kind of workflow runs start to finish with no manual file path needed — confirmed by actually running the "Testing os picker" workflow end to end against the real website.
 — 2026-08-19

## Publishing a skill pack update is now a real, undoable release — 2026-08-19
Until now, publishing a new version of a skill pack quietly threw away the old one — there was no way to go back if something shipped broken. The Publish page is now a full Release Center: before you publish, it shows exactly what changed since the last release, in plain terms (steps added, changed, or removed). Publishing an identical copy by mistake is blocked instead of silently accepted. Every published version is kept forever, so if a release causes problems, an admin can roll back to any earlier version with one confirmed click — nothing gets rebuilt or re-uploaded, it just switches back, and customer machines pick up the change automatically the next time they check in. The page also shows which customer machines are on the current version and a full history of who published or rolled back what and when. A read-only copy of the release history and rollout status is also visible on the web dashboard, so support staff can check status without opening the desktop app.
 — 2026-08-19
