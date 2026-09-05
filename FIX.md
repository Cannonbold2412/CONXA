# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## Fixed the build check that tests whether the runtime can click a page — 2026-09-06
The automated build test that opens a sample page and clicks a button was timing out after three minutes even though the runtime was still working. The wait timer on link checks was being stretched to a full minute even for quick same-page jumps, so a single missed click could burn the entire test budget. The test now uses the shorter wait the skill author intended for those quick checks, the test gives the runtime a bit more total time before giving up, and a few behind-the-scenes browser calls now have safety timeouts so they cannot hang forever.
— 2026-09-06

## Removed skills from the left sidebar — 2026-09-05
The skills list and skill search are no longer shown in the left panel. Chats and run history stay there; skills can still be picked from the home screen or through chat.
— 2026-09-05

## Gave CONXA a Claude-style top bar and a personal account footer — 2026-09-05
The app no longer shows the logo in the top-left or bottom-left of the sidebar. Instead, the bottom-left shows the signed-in person's name (or "Guest" if not signed in). A new slim top bar matches Claude Desktop — menu, sidebar toggle, search, back/forward on the left, and minimize/maximize/close on the right — with a custom frameless window like a modern chat app.
— 2026-09-05

## Renamed Conxa Execute to CONXA in the app — 2026-09-05
Every place the app showed "Conxa Execute" as its name now says "CONXA" instead — the window title, sidebar, settings, chat labels, sign-in screens, and checkout pages. Same app, shorter brand name everywhere you see it.
— 2026-09-05

## Polished the Execute app's left sidebar — 2026-09-05
The left panel in Conxa Execute now has a three-dot menu on each chat and run row with a Delete option, so you can remove old conversations and run history without digging through files. The scrollbar and text highlight colors were bright white and looked out of place on the dark theme — they now blend in with the rest of the app. The same Conxa logo used in Build Studio is now the official Conxa Execute logo everywhere: taskbar icon, browser tab, sidebar header, home screen, settings, and account button.
— 2026-09-05

## Gave the Execute chat app real sign-in, real monthly plans, and a memory that survives closing it — 2026-09-05
The separate desktop chat app ("Conxa Execute") could sell a paid access code, but that code wasn't
tied to a real account, its "monthly plan" was really just an auto-refill of the same top-up balance,
and — the biggest gap — every chat forgot everything the moment you closed the app or clicked "New."
There was also no way to pick up a chat on a different computer. This work adds real sign-in (so a
person, not a random code, owns their balance and plan), a genuine monthly plan that resets its
allowance every period instead of just stacking credits forever, and a proper memory for each
conversation: chats now show up in a list on the left like a normal chat app, and reopening one — even
after fully closing and restarting — picks up right where it left off. Signed-in chats also sync to
the cloud, so a conversation follows you to another computer; bring-your-own-key chats keep working
exactly as before, just with the same "remembers everything" upgrade added on top, kept entirely on
your own machine. Behind the scenes, if the AI provider serving a signed-in chat has trouble, the
system now automatically tries a backup model instead of the whole conversation just failing.
— 2026-09-05

## Built the online store for buying chat tokens in the Execute app — 2026-09-05
Until now, the separate desktop chat app ("Conxa Execute") only worked if you brought your own
account and key from an outside AI provider. There was no way for Conxa itself to sell access. This
adds a small, separate online service, hosted the same way the main Conxa cloud already is, that
sells prepaid "token" packs for chatting — six sizes, from a small top-up to a big bulk pack, with
bigger packs costing less per token, plus a monthly auto-refill option on every size. Paying gets you
a private access code to paste into the app's settings in place of your own key, so Conxa can meter
usage and refill your balance without needing a full account or password system. Bringing your own
key still works exactly as before — this is a new option, not a replacement.
— 2026-09-05

## Logged a passing bulk file-transfer test, and noted it was a smaller test run than originally planned — 2026-09-05
We had a test planned that downloads 20 files from one website and uploads each one to another
website, one at a time, to prove the system never mixes up which file goes where. The team actually
ran it with 5 files instead of 20. Checking the saved test data confirmed it worked perfectly — each
uploaded file was matched to its own correct download, nothing was mixed up, no extra "please help
me figure this out" calls were needed, and the downloaded files themselves were byte-for-byte the
same on replay as during recording. It's now logged as a pass on the test scoreboard, with an honest
note that it was tested at a smaller size than originally planned, in case a mix-up bug only shows
up with more files.
— 2026-09-05

## Logged Conxa's biggest successful test run yet, and updated the test scoreboard — 2026-09-04
The team keeps a running scoreboard of every recorded routine that's been tried end-to-end. A check
of the local test data turned up one that hadn't made it onto the scoreboard yet: a single recording
with over 100 individual actions, spanning six different websites and six browser tabs, that ran
start to finish in under a minute with zero hiccups and no need for any self-repair along the way.
That's more than double the size of the previous biggest proven run. It's now added to the "proven"
list with the honest caveat that it doesn't fully match any one of the specific big test plans still
on the to-do list, so those stay open — this is extra proof of scale and reliability, not a
replacement for them.
— 2026-09-04

## Fixed recordings on modern component-based websites losing track of button labels — 2026-09-04
Some websites are built out of pre-packaged, self-contained widgets (a technique called "shadow DOM" — think of it like a sticker with its own sealed-off mini-page glued onto the real page). When Conxa recorded a click on a button built this way, it could see that something button-shaped got clicked, but not the visible word written on it ("Primary", "Submit", etc.) — that label lived just outside the sealed sticker. Without a name to go on, Conxa fell back to a generic technical description shared by every similarly-styled button on the page, so at playback time it couldn't tell which one was meant and correctly refused to guess rather than click the wrong thing, failing the whole run. The fix teaches the recorder to look just outside the sticker for the real label whenever the button itself has none, so it can once again tell buttons apart by what they actually say. Found using a real public site full of these sealed-widget buttons, confirmed with an automated check that reproduces the exact same setup, and then confirmed for real: a fresh recording against that same site was made, compiled, and replayed in Build Studio, and it correctly picked the intended button by name every time.
— 2026-09-04

## Fixed a calendar picker freezing when asked to go back several months instead of forward — 2026-09-04
A workflow that opens a calendar and picks a date worked fine going forward a couple of months, but froze and failed whenever it was asked to go backward several months instead — for example, picking a date from earlier in the year instead of a date coming up soon. The real cause turned out to be a rushed extra step: before flipping through the calendar, Conxa first tried quickly typing the date straight into the box, then pressed Enter to see if that alone had worked. For this kind of calendar, pressing Enter while it's open acts like pressing a "confirm and close" button, and closing and immediately reopening it that way put the calendar's own opening animation in a confused state — so a few steps later, when Conxa went to click the "previous month" arrow, the calendar suddenly and silently slammed shut out from under it, and Conxa sat there waiting for a button that was no longer there until it gave up. The fix is simple: for this kind of calendar, skip the Enter key entirely and only rely on flipping through the months and clicking the day, which never has this problem. Confirmed with a real run against the exact site that was failing, going backward six months, forward several months, and staying in the same month — all three now pick the correct date every time.
— 2026-09-04

## Wrote down a plan to cut the manual clean-up work after every recording — 2026-09-04
Today, after Conxa turns a recording into a workflow, a person still has to sit down and fix four things by hand every time: delete leftover clicks that did nothing, rename confusing input fields (two email boxes currently come out as "email" and "email_2"), tidy up calendar pickers Conxa doesn't recognise yet, and remove stray mouse-hover steps. These aren't bugs — they happen because the tidy-up rules only ever look at one step at a time, so they can't tell that two fields are the sender and the recipient. A new plan is now on the backlog to have an AI read the whole recording at once and *suggest* the fixes, which the person then accepts or rejects with a click, instead of typing them all out. Nothing is changed automatically — the suggestions are proposals, and a human always has the final say.
— 2026-09-04

## Fixed calendar-picker recordings that ignored a different requested date on replay — 2026-09-04
A recorded workflow that opened a calendar, flipped forward a couple of months, and clicked a specific day replayed perfectly — but always picked that exact same day, even when asked for a different date. The calendar-remembering feature this needed was already fully built for most calendars; it turned out one common style of calendar (the kind used by jQuery UI, a popular building block many company websites are built on) writes its day numbers as plain text with none of the hidden tags most other calendars use, so Conxa never recognized those clicks as "picking a date" in the first place — it just remembered them as ordinary, fixed clicks. Now Conxa also reads the day number straight off the calendar square itself, together with the month and year shown in the calendar's own header, so it correctly recognizes a date pick on these calendars too and correctly skips greyed-out days from the next/previous month so it never mistakes one of those for the real pick.
— 2026-09-04

## Fixed pop-up boxes freezing a run, and found why the typed answer sometimes vanished — 2026-09-04
A recording of a page with "OK", "yes/no", and "type something" pop-up boxes worked perfectly when recorded, but froze solid the moment it was replayed — the browser sat there for over two minutes with an unanswered pop-up on screen before finally giving up with a confusing error that didn't even mention a pop-up. Investigating found two separate problems hiding behind that one symptom. First: when someone typed an answer into Conxa's own version of the pop-up during recording, that answer sometimes got written down out of order compared to the click that opened it — and a leftover tidy-up rule (meant to remove genuinely duplicated clicks) mistook the two for the same thing and quietly threw the real one away, which is why "CONXA" never showed up. Second, and the actual freeze: the recipe told the browser "click the button, THEN read the pop-up's answer" as two separate steps — but a real pop-up box freezes the whole page the instant it appears, so the click can never finish until it's answered, and the step meant to answer it can never even start. Like being told to open a locked door and only then look for the key on the other side of it. The fix has the assistant get the answer ready and standing by before it ever clicks, so the moment a pop-up appears it's answered instantly and the page never freezes at all. Also added a safety net so that if a page ever gets stuck for an unrelated reason (a slow computer, a different kind of pop-up), the run fails quickly with a clear message instead of hanging silently.
— 2026-09-04

## Confirmed the pop-up-box fix actually works with a real re-test — 2026-09-04
Earlier today a bug that froze runs on pop-up boxes ("OK", "yes/no", "type something") was fixed. This entry is the proof: a fresh recording of that same pop-up page was replayed again, and this time it clicked all three pop-ups and typed its answer with no freeze, no errors, and no extra cost. The test checklist that tracks what's been verified end-to-end has been updated to mark this one done.
— 2026-09-04

## Added a refresh button to every screen in Build Studio — 2026-09-04
Build Studio had no quick way to pull the latest data on a screen — you had to switch pages and back, or restart the app. A small refresh button now sits in the top bar of every screen, just to the left of your account email, and spins briefly while it re-checks everything currently on screen.
— 2026-09-04

## Found and fixed the real, deeper cause of the "answer this pop-up twice" bug — 2026-09-04
Two earlier fixes today didn't hold — a real test recording still made the fast pop-up ("OK" only) work perfectly, but the two slower ones (needing a click between two choices, or needing someone to actually type something) kept failing the same way. Digging into the exact browser error revealed the true cause: the browser itself has a hidden patience limit for how long it will hold a pop-up open waiting for an answer. A quick one-click pop-up beats that limit easily; anything that takes a few extra seconds to read, decide, or type into does not, so the browser takes the pop-up back before Conxa's own answer arrives, and hands it to the person directly — hence "type it again." No amount of rearranging code on our side can make the browser more patient, since that limit lives entirely inside the browser itself. So the fix changes the game instead of trying to out-wait it: Conxa now steps in earlier, right as the website tries to open its own pop-up, and quietly runs the "ask Conxa's window, wait as long as it takes, then answer" conversation itself, before the browser's own pop-up would ever have opened. The browser never sees a pop-up to grow impatient with, so there's nothing left to time out. Verified with a real request-and-response test standing in for a full recording, including a slow answer past two minutes correctly falling back to a safe default instead of hanging forever.
— 2026-09-04

## Matched the run window to a modern dark desktop layout — 2026-09-04
The first version of Conxa Execute looked like a plain three-column form. It now follows the same kind of workspace people already know from a chat desktop: a dark left list of skills and past runs, a calm center with a large greeting and a big typed box, Form versus Chat as a switch inside that box, and Settings as a floating two-column panel (including your own model key). Skills still run the same way; only the look and the way you get to them changed.
— 2026-09-04

## Fixed Conxa Execute refusing to open in development — 2026-09-04
Starting the new run window from the developer command used to quit immediately after downloading the desktop engine. The launcher was looking for the app in the wrong folder (one level too deep), so the window never appeared even though the preview server was already running. It now waits for that preview, then starts from the correct folder.
— 2026-09-04

## Opened a company window that can run skills without a paid chat app — 2026-09-04
Until now, running a recorded workflow meant also having someone else’s chat program installed. There is now a first version of our own window: pick a skill, fill in the fields it asks for, and run — no AI key required. If the company already has their own model keys, they can paste them and ask in chat instead; that chat is only allowed to call our skill tools, not to type on the computer or rewrite files. The actual clicking still happens in the same local runner we already ship. This is the first slice, not the finished product: no live page in the right-hand pane yet, and no company-provided cheap model.
— 2026-09-04

## Wrote down the plan for a Conxa app that runs skills without Claude — 2026-09-04
We spent a session deciding how companies that have no paid AI chat app could still run their recorded workflows, and how that should grow into the review-queue experience from the product film — without becoming a copy of someone else's assistant. That conversation is now a single written note: the executor stays the thing we already install; a new company window talks to it the same way other assistants do; people can fill in a form with no AI at all, or use their own keys, or later a cheaper company-provided model; and the screen is laid out so a later version can show a live page and a stack of human reviews instead of only a chat transcript. The follow-up: we will not invent that window from nothing — copy the desktop shell and the already-working "talk to the runtime" piece from what we ship today, and only pull in pieces of one permitted open project (not a whole second product) if we need an AI loop.
— 2026-09-04

## Added a Cancel button and a running clock to Build Studio's "Run Test" — 2026-09-04
Clicking "Run Test" on a workflow used to leave you stuck watching a frozen "Testing…" label with no way to stop it — the only way out of a hung test was to close the browser window by hand, which then showed a confusing error instead of a clean "cancelled." The test runner already had a working stop switch built in, but nothing in Build Studio ever pressed it. Now the "Testing…" label counts up in real time, and a Cancel button sits right next to it — pressing it reaches into the still-running test and stops it within a few seconds, cleanly, without waiting out the old worst-case wait of up to 15 minutes.
— 2026-09-04

## Fixed a recorded click sometimes getting the wrong instructions baked in, including once with a password shape — 2026-09-04
While testing a recording of a dropdown-search box (type a couple of letters, pick "JavaScript" from the suggestions), the finished workflow was found to click on whatever you'd just typed instead of the suggestion you picked — so it could never work right. Digging in showed a leftover shortcut in the packaging step: whenever a typed field was immediately followed by a click, the click's instructions got silently swapped for whatever was typed into that field, with no check that the two were actually related. That same shortcut had already caused a worse version of this bug on a login screen from an earlier test, where a Login button's instructions got replaced with the shape of a typed password — meaning that button could never be found or clicked at all. That shortcut is now removed entirely, so every click keeps the instructions that actually match what was recorded. One deliberate trade-off: a "search then click the top result" recording will no longer automatically follow a different search term the way this shortcut used to make it — that's logged as its own follow-up to rebuild safely. Also found, but not yet fixed: the dropdown-search click itself was recorded against the whole suggestion list rather than the one suggestion clicked (also fixed here, for new recordings), and a separate widget's picked value on the same test page was silently never included in the finished workflow at all.
— 2026-09-04

## Found and fixed the real cause of the "answer this pop-up twice" bug during recording — 2026-09-04
The fix logged below on 2026-09-03 turned out not to be the whole story — the same "answer it twice" problem kept happening. A deeper investigation found the actual cause: while recording, Conxa continuously does small background check-ins with the browser tab to keep everything in sync. If one of those check-ins happened to be in progress at the exact moment a pop-up opened, that specific check-in could get stuck waiting forever, because a pop-up freezes the page it's on, and that one kind of check-in can only continue once the page unfreezes — which itself can only happen once the check-in finishes. Each side was waiting on the other, forever, which is exactly why Conxa's own window would get stuck on screen and the real pop-up was left dangling until someone typed the answer into it directly. The fix swaps that specific background check-in for a different kind of check that never depends on the page being unfrozen, so it can no longer get stuck, and also makes sure that check skips the page a pop-up is currently on entirely. Added tests that lock in the fix so this exact freeze can't quietly come back.
— 2026-09-04
