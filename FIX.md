# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## New installs now download the skill package during setup, not on first use — 2026-08-20
Previously, a customer's skills only started downloading the first time they actually tried to use one — which meant a big skill package could make that very first attempt sit and wait. Now the installer downloads the skill package itself, as one of the last steps of setup, so it's already there and ready the first time it's needed. If that download doesn't finish for some reason, the app still catches up automatically the first time it runs, exactly like before — nothing is worse off.
 — 2026-08-20

## Removed the leftover "compile credits" counter from the Publish page — 2026-08-20
The Publish page had a small counter in the top corner showing compile credits, left over from an old plan that no longer applies here. It's been removed so the page only shows things that are actually relevant to publishing a release.
 — 2026-08-20

## Build Installer page redesigned into two columns, name/logo side by side — 2026-08-20
The Build Installer screen no longer shows the internal folder path card at the top — that was clutter nobody needed. The installer name box and logo picker now sit next to each other on the left with the build button right below, while the build log takes up the whole right side. The page itself no longer scrolls; only the log does, so it's easier to watch a build run without losing your place.
 — 2026-08-20

## Build Installer page now asks for an installer name — 2026-08-20
The Build Installer screen now has a required box asking what to name the installer, and that name is used for the file you get at the end. This is a stand-in for now — later it will be replaced with something based on your verified company domain.
 — 2026-08-20

## Publishing no longer fails when a workflow has a very long name — 2026-08-20
If you recorded a workflow with a long title, Build Studio could build it fine but publishing to Conxa Cloud would fail with a confusing error about the name being too long. The cloud only accepts names up to 64 characters, and long workflow titles were sometimes turned into slugs just over that limit. New workflows now get shorter slugs automatically, and existing ones are shortened the next time you open or publish them, with your built files moved to match. You should be able to publish that long-named workflow without hitting the error.
 — 2026-08-20

## Signing in to an application in Build Studio no longer gets stuck waiting forever — 2026-08-20
When you connected an application (like Render or HubSpot) for the first time, a login window opened and Build Studio was supposed to notice once you'd signed in and closed it. But that detection only worked in one specific case; if you signed in and closed the window in any other ordinary way, Build Studio quietly threw away your login instead of saving it, and the card was left stuck showing "this closes on its own" with no way out — like a locked door with no handle. Now the login is saved the moment you actually sign in, before the window can even close, so closing it afterward reliably marks the app as connected. If you close the window before signing in, or something goes wrong with the check, you now see a clear "Done" and "Cancel" button on the card so you're never stuck waiting with nothing to click.
 — 2026-08-20

## Application cards on the Workflows page are easier to read — 2026-08-20
The list of connected applications on the left of the Workflows page used to be squeezed into a narrow column, so app names, web addresses, and buttons all crowded together and got cut off. That column — and the "No workflows yet" card next to it — are now wider, and each application's name, address, and buttons are laid out on their own lines instead of fighting for space in one row. Nothing about what the cards do changed, just how much room they have to show it clearly.
 — 2026-08-20

## Added a one-click recheck button to connected applications — 2026-08-20
Build Studio already had a way to double-check whether a saved login was still working, but the button for it only showed up once the app's session had gone stale enough to look questionable. There was no quick way to just check right now, on demand, without waiting for it to look suspicious. Each healthy, connected application card now has a small refresh-style button next to its edit and delete buttons that re-checks the session immediately, any time you want. If that recheck finds the login no longer works, the card correctly turns red and swaps the refresh button for the same "Reconnect" button used everywhere else a login has gone stale, instead of showing both at once.
 — 2026-08-20

## Skill Packages on the web now shows your folders, not the whole workspace as one box — 2026-08-20
The Skill Packages page on Conxa Cloud used to show a single card named after the workspace, as if everything you had built was one item. A workspace holds many folders, so that card hid the real structure — like seeing a filing cabinet instead of the folders inside it. The page now lists those folders. Click one to see its workflows. Installer downloads are still one click away from the top of the page.
 — 2026-08-20

## Creating a group in Build Studio now shows it on Conxa Cloud immediately — 2026-08-20
Folders you make in Build Studio used to exist only on your computer until you published a workflow from them. The matching folder on the web dashboard's Skill Packages page appeared only after that first publish, so you had to recreate the same structure by hand if you wanted to see it earlier. Now, creating or renaming a group in Build Studio creates or renames the same folder on Conxa Cloud right away, even when it is still empty. Deleting a group on your computer does not remove it from Cloud, so anything already published there stays findable.
 — 2026-08-20

## The dev launcher now starts Build Studio with one double-click — 2026-08-20
Developers used to have to type two words every time they wanted to open Build Studio in dev mode (`dev` and `studio`). The Windows launcher script now treats that as the default — run it with no arguments and it opens dev Build Studio straight away, with login skipped, vision anchors turned off, and the other dev-friendly settings already applied. You can still type `prod` or `backend` when you need something else; those paths work exactly as before.
 — 2026-08-20

## Build Studio no longer fills itself with sample data on startup — 2026-08-20
When developers opened Build Studio in dev mode, the app used to automatically create a "Default" folder, a "Sales" folder with sample websites, and a couple of example workflows — even on a brand-new install. That made it hard to tell what was real work versus what the app had invented. Now Build Studio starts completely empty. Groups, apps, and workflows only appear when you create them yourself. If you still see old sample folders from before this change, they're just leftover files on your machine — delete your local dev data folder to start fresh.
 — 2026-08-20

## Stopped the workflow test screen from asking for a "downloaded file dir" it should already know — 2026-08-19
Workflows that download a file and then upload it somewhere else (like "Testing os picker") are designed to need zero manual file paths — the app is supposed to remember where the download landed and use it automatically. But when trying to run a test of that workflow from the Build Studio, a dialog popped up demanding a value called "downloaded file dir" anyway, with no way to know what to type. The test screen was guessing at what inputs a workflow needed by scanning its internal steps, and it mistook an internal placeholder — one meant to be filled in automatically at run time — for something a person had to supply. It's like a form asking you to type in your own confirmation number before it's been generated. The test screen now trusts the same list of real, user-facing inputs the rest of the app already uses, so workflows like this one run straight through with no pointless prompt.
 — 2026-08-19

## Fixed uploads that download-then-upload a file sometimes asking for a file path anyway — 2026-08-19
Some workflows download a file, unzip it, and then upload the contents to a second app — the "Testing os picker" workflow is one of them. Occasionally, when the download from the website took a moment longer than usual, the app would check for the downloaded file too early — before the download had actually started — see nothing there, and give up. That made the later upload step ask for a file path by hand, even though the whole point of the workflow was that no one should have to type one in. It's like checking the mailbox the second you hear the truck outside instead of waiting for it to actually drop the mail. Now the app waits for the download to really arrive before moving on, so this kind of workflow runs start to finish with no manual file path needed — confirmed by actually running the "Testing os picker" workflow end to end against the real website.
 — 2026-08-19

## Publishing a skill pack update is now a real, undoable release — 2026-08-19
Until now, publishing a new version of a skill pack quietly threw away the old one — there was no way to go back if something shipped broken. The Publish page is now a full Release Center: before you publish, it shows exactly what changed since the last release, in plain terms (steps added, changed, or removed). Publishing an identical copy by mistake is blocked instead of silently accepted. Every published version is kept forever, so if a release causes problems, an admin can roll back to any earlier version with one confirmed click — nothing gets rebuilt or re-uploaded, it just switches back, and customer machines pick up the change automatically the next time they check in. The page also shows which customer machines are on the current version and a full history of who published or rolled back what and when. A read-only copy of the release history and rollout status is also visible on the web dashboard, so support staff can check status without opening the desktop app.
 — 2026-08-19

## Publishing one automation no longer waits on — or gets blocked by — every other automation — 2026-08-19
Every automated task a company records (like "Create a Lead" or "Update Opportunity") is supposed to be its own separate, independently shippable thing, with its own version number and its own release history — the same way two different apps on your phone update on their own schedules, not as one bundle. But the Publish page was quietly treating every task in a workspace as one single package: it wouldn't let you publish "Create a Lead" until "Update Opportunity" had also passed its tests, and a rollback of one would have reverted every task at once, whether it needed it or not. That's like a grocery store refusing to restock the bread aisle until the milk aisle is also fully stocked. The Publish page now shows a picker so you choose which one task to work with, and everything from testing, to publishing, to version history, to rolling back only ever affects that one task — a task that's ready to ship is never held up by a sibling task that isn't. New tasks start at version 1.0.0 with nothing else required first; existing tasks show exactly what changed since their own last release, never a mix of everyone's changes.
 — 2026-08-19

## Publishing an update from the desktop app no longer sends it straight to customers — 2026-08-19
Until now, the moment someone clicked "Publish" in the desktop app (Build Studio), that new version went live on every customer's machine immediately — there was no one checking it first. That's risky for a business tool: a mistake in a published update would reach every customer before anyone in the company even saw it. Now publishing only uploads the update and marks it "Ready for Release" — nothing changes for customers yet. A separate screen on the web dashboard (Conxa Cloud) is where a manager reviews what changed, confirms it looks right, and clicks "Release" to actually send it out. That same web screen is now also where the company sees which of their automated tasks are grouped together, checks how many customer computers have received an update versus are still catching up or having trouble, and can undo a bad release with one click — all of that used to live only in the desktop app; it's now on the web so anyone with access can check it, not just whoever has Build Studio open. Undoing a release still only ever affects the one task it's undone for, never a whole group of tasks at once. Customer machines that fail to fully receive an update now show up as "Failed" instead of just looking stuck, so problems are visible instead of silent.
 — 2026-08-19
