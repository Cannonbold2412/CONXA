# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Fixed the cloud dashboard crashing when clicking "Rebuild" on a test (non-live) release channel — 2026-07-30
Clicking "Rebuild" on anything other than the main live channel threw a server error and the rebuild never finished. The cloud's local storage saves each channel's data in its own named folder, and the test channel's folder name had a colon in it — a character Windows refuses to allow in folder names, like trying to label a folder "notes:draft" in File Explorer and having it get rejected. The system now swaps out any character Windows won't allow before creating the folder, so rebuilding on any channel works the same as the live one.

---

## Made the runtime work with a local test cloud, and fixed a crash that stopped it starting at all — 2026-07-25
Two problems, found while chasing yesterday's installer bug further. First: when someone on the team runs a private test copy of Conxa Cloud on their own laptop (which, unlike the real one, doesn't use a secure connection), the customer runtime always refused to talk to it, printing "Protocol http not supported. Expected https." The runtime's networking code only knew how to speak the secure kind of connection, no matter which kind the address actually needed — it now checks the address first and speaks whichever kind that address actually uses, so a real customer install still only ever uses the secure kind, but a private test setup finally works too. Second, and unrelated: a name was referenced in the program's startup code without ever having been introduced first, which crashed the entire runtime immediately on launch, in every environment, for everyone — introduced in this morning's audit-report commit. Both are now fixed, and skills correctly download from a locally running test cloud again.

---

## Fixed a packing mistake that made the customer installer fail right after "Setup complete!" — 2026-07-25
A customer install would finish and immediately show a confusing "Setup complete! (no status available — code 1)" message, and the app itself refused to start afterward, complaining it couldn't find its own program files. The cause: the installer copies a folder of app files plus a shortcut-style pointer to that same folder, but the packaging step was also blindly sweeping up the pointer as if it were more real content — like photocopying a folder and, without realizing it, also photocopying the label that says "see the folder over there," landing a confused duplicate copy inside itself instead of the real files ending up where the app expects them. The installer now copies only the real folder, so the files land exactly where the app looks for them on first launch.

---

## Fixed a crash when drawing a new box around an element in the step editor — 2026-07-25
In the Human Edit screen's "pick element" step, drawing a fresh box around an element and clicking Continue always showed a scary "Something went wrong inside the app" message instead of moving on to the next step. The real cause: one internal check was written assuming a step's recorded action was always stored one way, but some steps store it a different (also valid) way, so the check tripped over its own assumption and crashed every single time, before the app ever got as far as looking at the drawn box. That check now reads the action the same safe way the rest of the app already does. Along the way we also closed a second, related gap in the same screen: if the AI that identifies what's inside the drawn box ever gives back an oddly-shaped answer, the app now treats that like any other "couldn't find it" case instead of crashing.

---

## Fixed the remaining problems from this week's "compile → edit → test" hand-off audit — 2026-07-24
Following up on the audit that found edits quietly not reaching the Test button, we closed out the rest of its findings. Testing a workflow now double-checks, on the server itself, that nothing was edited after the last build — before, that safety check only lived in the on-screen button and could be skipped. Saving a step that only touched something unrelated (like its description) no longer quietly rewrites the element-finding data behind the scenes, so that data stays as accurate as when it was first compiled. A search box or similar field that's only labeled by its placeholder text (like a greyed-out "Search…" hint) can now be found again automatically if the page changes slightly — previously, self-healing gave up immediately on exactly this kind of field. When an AI assistant is told what information a skill needs to run, it's no longer told every field is mandatory when some already have sensible defaults, and drop-down fields now show their actual list of choices instead of looking like free-text. And a password or other value marked "sensitive" during setup is no longer saved in plain text after a test run. All of this is covered by new automated tests.

---

## Fixed several bugs in the new "fill-in-the-blank" skill variables feature, and caught a scare with leaked passwords before it went anywhere — 2026-07-23

The in-progress feature that lets a skill ask for a value at run time (like a database name or account number) instead of having it baked in had a handful of rough edges. Editing a step's typed value could leave it pointing at the wrong variable after a rename. The "replace everywhere" tool used to be able to accidentally corrupt the invisible instructions that tell Conxa where to click, not just the visible text — it's now scoped to only touch what you typed, and it tells you how many spots it actually changed. Trying to run a skill without filling in a value it needs now fails immediately with a clear message, instead of running partway and failing somewhere confusing. The Human Edit screen also got a "default value" box and a "sensitive" checkbox for each variable, though the sensitive checkbox is a promise we still need to keep — right now it doesn't hide anything yet, it's a decoration.

While reviewing this work, we found a separate file sitting in the project (not yet saved to permanent history) that had real login keys for several AI services typed out in plain text. It's being kept out of version control and those keys should be treated as compromised and replaced.

Two smaller, unrelated fixes rode along: recording a login could occasionally lose track of whether the save actually finished, and the system that picks which AI account to use for behind-the-scenes work now properly skips an account that just failed instead of immediately trying it again.

---

## Conxa can now configure itself into 24 different AI assistants, not just Claude — and the dangling-connection bug from yesterday is fixed for real — 2026-07-21

Yesterday's entry was the plan; today it's built. The installer now safely turns on Conxa inside Cursor, VS Code, Windsurf, and twenty other assistants the same way it already did for Claude, and every one of those changes is now crash-proof and never overwrites a setting that belongs to something else. The bug where uninstalling a test version left a broken, permanently-failing connection behind is fixed and proven fixed with a test that reproduces the exact scenario. We also added a short note inside each assistant explaining what Conxa can do, so it actually reaches for the tools instead of just having them switched on unannounced.

---

## Caught two build-pipeline gaps that would have made yesterday's feature quietly not work for real customers — 2026-07-21

Yesterday's assistant-connection work was checked by running it directly, but not by running it through the exact packaging steps a real release build uses — the equivalent of testing a recipe by tasting the ingredients raw instead of after cooking. Doing that check today found two problems, both fixed. First, one of the new files (the one that writes a short "here's what Conxa can do" note into each assistant) was never actually included in the small package that ships to customers — it would have silently done nothing, every time, for every customer. Second, fixing that uncovered a related packaging gap in a shared helper file, also now fixed. Also added an automatic check that runs this whole feature's test suite every time we build a release, so a mistake like this gets caught before it ships, not after.

## Audited the hand-off between the three build stages and found edits that quietly never reach the test run — 2026-07-23
We traced what happens as a recorded workflow moves from being compiled, to being hand-edited, to being test-run, checking that every change a person makes actually arrives at the next stage. Two problems stand out. When you edit a workflow after it's been built, the "you have unsaved changes, rebuild first" warning doesn't appear — so clicking Test can silently run the older version and show you results for steps you already changed. And renaming a step's purpose looks like it saves, but the rest of the system keeps using the old name behind the scenes. We also found a "mark this value as sensitive" checkbox that's stored everywhere but never actually hides anything. Findings and fix recommendations are written up in a report; no code was changed.

## Audited the whole path from "recording compiled" to "workflow hand-edited" and found two data-loss traps — 2026-07-23
We followed a recorded workflow from the moment it's turned into an automation, through storage, all the way to the Human Edit screen, checking that nothing a person builds gets lost or garbled along the way. The biggest problem: re-building a workflow you've already edited silently throws away all your edits — the variables you set up, the values you turned into fill-in-the-blanks, renamed steps, re-pointed targets — and gives no warning and no way to undo. The second: renaming a step's purpose updates the box you typed in but not the copy the automation actually uses, so the same step shows two different names and runs under the old one. A handful of smaller mismatches (variables in a value not matching the variable list, a stale "which field is this" tag) trace back to the same cause: the editor saves a change without updating the hidden fields that depend on it. Everything is written up in a report with fix recommendations; no code was changed.

## Fixed the edit-then-run gaps the audit found: renamed steps now really take effect, and variables stay consistent — 2026-07-23
Following up on this week's audit of what happens between building a workflow and hand-editing it, we fixed the problems it named (all except the "rebuilding wipes your edits" one, which is being handled as a separate design decision). Renaming a step's purpose now updates everywhere it matters, not just the box you typed in, so a step no longer shows one name while quietly running under another. When you turn a value into a fill-in-the-blank, the workflow now automatically adds that blank to its list of things to ask for, instead of leaving it undeclared and silently blank at run time. Reordering, adding, or deleting steps now keeps the workflow's step-by-step plan lined up with the actual steps. And a few smaller corruption traps were closed: bulk find-and-replace can no longer garble an existing fill-in-the-blank, duplicate variable names are caught the same way on both the form and the raw editor, and a drop-down's default answer must actually be one of its choices. All of this is covered by new automated tests.
