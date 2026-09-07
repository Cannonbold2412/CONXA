# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## Fixed a broken automated test for popup-alert handling — 2026-09-07
A test that checks the assistant answers a browser popup before it freezes was failing in continuous integration. The fake browser page used in that test was missing a few methods the real code now calls when resolving a click target — so the test crashed before it could even check the thing it was meant to check. The mock page now behaves like a real one for those calls, and all five dialog-handling tests pass again.
— 2026-09-07

## Fixed a sign-in prompt that claimed a window had opened when none did — 2026-09-07
When a workflow needed you to sign in to an app like Google Drive, the assistant would say "sign in to Google Drive in the window that just opened" — but sometimes no window actually opened, usually because the browser piece hadn't finished installing yet. The old code told you it had opened a window before actually checking whether it could. Now it waits to confirm the window really opened before saying so, and if it genuinely can't, it tells you the real reason instead of a false all-clear. This matters most for the first run on a fresh install, and for workflows that need sign-in to more than one app at once.
— 2026-09-07

## Fixed the installer hanging forever on the "Downloading skill package" step — 2026-09-07
During setup, a quick compatibility check the installer runs was accidentally starting the full assistant connection in the background — the same one that's supposed to stay open and wait for a chat to talk to it. Since no chat was there to talk to it during install, it just sat there forever, and the installer window never closed. It's like a smoke test that was supposed to just check the oven turns on, but actually started baking a cake and left the door shut. Now that check only checks compatibility and nothing else, so the installer finishes normally. The same background task also ran a second, needless skill-download attempt that got rate-limited by our servers — harmless, but it explains the "429" error some installs showed in their logs; that noise is gone too as a side effect.
— 2026-09-07

## Fixed the runtime build test crash caused by an incomplete test browser stub — 2026-09-06
The runtime build was failing in one dialog test because the fake browser page used in that test was missing a couple of basic behaviors the real browser page has. Recovery logic then called one of those missing behaviors and the test crashed before it could finish. The test stub now includes those missing pieces, so the dialog flow is tested correctly and the build no longer fails for the wrong reason.
— 2026-09-06

## Found why the hidden-name fix wasn't actually working, even on a brand-new recording — 2026-09-07
The last two fixes taught the recorder to remember a control's stable hidden name, and taught the compiler to recover that name from old recordings. But a real re-test still failed the exact same way, even on a workflow recorded fresh, after both fixes were in place. The real problem: right after the browser correctly captures that hidden name, it passes through a filing step on its way to being saved — and that filing step had never been told this new kind of information exists, so it quietly threw it away every time, before it ever reached disk. Every recording, old or brand new, was losing it at that one spot. That filing step now knows about it, so it's kept from here on. Separately, we found a second, related bug: the finished "address" the system writes down for a control can be read two different ways by two different parts of the program, and Google Drive's keyboard-shortcut hint text made those two readings disagree — one accepted a close-enough match, the other demanded a perfect one and failed. Every part of the program now reads that address the same, forgiving way. Together these mean a fresh recording made after today will finally carry the durable name all the way through; the one made just before this fix still won't, since the information was already lost at the moment it was recorded — it will need to be captured one more time.
— 2026-09-07

## Old recordings can now get the new durable-name fix too, without being redone — 2026-09-07
Right after we taught the recorder to remember a control's own hidden name (see below), a real test still failed the same way — because that particular recording was made the day before the fix, so nothing new had been captured for it. Turns out we didn't need to redo the recording at all: every recording already saves a full copy of the page as it looked at that moment, and that saved copy still had the hidden name sitting right there in it — the compiler just never thought to look. It now checks that saved copy whenever a recording is missing the new information, so re-compiling an old workflow recovers the same durable, stable-through-layout-changes selector a fresh recording would get. Nothing needs to be re-recorded for this to kick in.
— 2026-09-07

## Recordings now remember a control's own id attributes, not just its look — 2026-09-07
When you click something like a menu row, the page often gives that row a stable hidden name (a role plus a small key the site uses internally). Recording used to ignore those and keep only the visible words and a brittle path through the page, so a later test could not find the same row after the layout shifted. Recording now stores those durable names, compile turns the tightest unique one into the first way to find the control, and playback looks it up the same way — so a File upload row can be found by what it *is*, not by where it sat on the screen that day. Existing recordings do not gain this; they need to be captured again.
— 2026-09-07

## Fixed a Google Drive test that could not find "File upload" in the New menu — 2026-09-06
After the hidden file-box click was removed, the same Drive workflow still failed on the real menu item. Drive's menu shows a keyboard hint like "Alt+C then U" next to the words "File upload". Compile now stores the short name, but replay was still demanding an exact match — so "File upload" would not match the full label sitting on the screen. Replay now matches the short name as a phrase inside the full label, the same way a person would recognize that row.
— 2026-09-06

## Fixed a Google Drive upload test that failed clicking an invisible box — 2026-09-06
A workflow that downloads a file from GitHub and uploads it to Google Drive failed its test on a click nobody actually made. Choosing "File upload" from Drive's New menu also secretly taps a hidden file box in the background; the recording kept that tap as a real step, then tried to click a box with no size and no name. Compile now throws that hidden tap away whenever a real file upload follows, and keeps the menu click that the person actually pressed. Replay also no longer waits for that hidden box to appear on screen, and it no longer lets Windows pop a file-picker window that would freeze the test.
— 2026-09-06

## Stopped paying the AI twice to name each click during compile — 2026-09-06
Compiling a workflow used to ask the AI to guess a name for every single click, then throw that guess away and use the one plan it already built for the whole recording. Compile no longer makes those extra per-click naming calls, so a long workflow compiles faster and uses fewer tokens. The plan for the whole workflow is unchanged, and a cheap local check still figures out whether a blank field is an email or password from the label on the page.
— 2026-09-06

## Fixed the first test after an edit falsely claiming the skill was damaged — 2026-09-06
After a workflow test failed, you could edit the workflow, come back, and hit Run Test — and the first click would say the skill files were damaged, even though a second click ran fine. The test engine was keeping an old "this file is authentic" fingerprint in memory after the skill was rebuilt on disk. It now re-reads that fingerprint from disk right before each run, so the first click after an edit works the same as the second.
— 2026-09-06

## Fixed bright scrollbars on the compile screen — 2026-09-06
While a workflow was compiling, the scroll bars in the log and side panels looked white and out of place against the dark workbench. They now use the same subtle gray tones as the rest of Build Studio, and text you highlight while reading the log uses the warm clay tint instead of a harsh white flash.
— 2026-09-06

## Fixed Build Studio never really closing, so it would not start again — 2026-09-06
Closing Build Studio made the window disappear, but the program itself kept running invisibly in the background forever, and every attempt to open it again either did nothing at all or popped up a "JavaScript error" box. The cause was in the polite shutdown added a few days ago: it asks the recorder to finish its work first and holds the door open while it waits, but it could never tell that the recorder had already finished, so it kept re-opening the door every three seconds and the app never got to leave. It now notices that it is already on its way out and lets itself close on the second pass. Anyone stuck on the old version needs to end the leftover task once in Task Manager, after which it behaves normally.
— 2026-09-06

## Fixed the build check that tests whether the runtime can click a page — 2026-09-06
The automated build test that opens a sample page and clicks a button was timing out after three minutes even though the runtime was still working. The wait timer on link checks was being stretched to a full minute even for quick same-page jumps, so a single missed click could burn the entire test budget. The test now uses the shorter wait the skill author intended for those quick checks, the test gives the runtime a bit more total time before giving up, and a few behind-the-scenes browser calls now have safety timeouts so they cannot hang forever.
— 2026-09-06
