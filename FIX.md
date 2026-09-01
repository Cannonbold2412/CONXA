# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## The "time saved" number on the Impact page now uses real recorded time, not a guess — 2026-09-02
Before, the dashboard's "hours saved" figure came from an admin typing in a guess of how long a task takes by hand. Now, since the recording studio already timed the person doing the task once while recording it, that real time is used automatically the first time a workflow is published — the admin can still type in their own number later if they want to change it, and that choice is always kept. The dashboard now also shows how long the automated run actually took next to it, and quietly subtracts a small, fixed 20 seconds per run for the time a person still spends just starting it, so the number reflects real savings rather than pretending it's completely free.
— 2026-09-02

## Workflow-E now runs start to finish — 2026-09-01
The test workflow on the practice sign-up form used to stop partway through. It now completes every one of its 29 steps, fills the whole form including the date of birth, submits it and closes the confirmation. It also works with values other than the ones it was recorded with — a different birth date, a different name, a different city — which is the whole point of a recorded workflow.
— 2026-09-01

## Fixed a calendar being mistaken for one of its own dates — 2026-09-01
The recorder works out which part of the page is "the calendar" by looking for a calendar-ish name. The trouble is that every piece inside a calendar carries the calendar's name too — the individual day squares included — so it settled on the day square the user clicked and treated that one square as the entire calendar. Everything downstream was then looked for inside a single square: the month and year menus, the arrows, and the other days, none of which are in there. It also meant the workflow could only ever pick the exact date it was recorded with. The recorder now keeps widening until it has the whole calendar.
— 2026-09-01

## Fixed the recorder throwing away most of what it noticed — 2026-09-01
The recorder watches for special controls — calendars, dropdown menus, pop-up banners — and writes down extra notes about each one. Those notes were being collected correctly and then quietly dropped a moment later, before anything was saved, because the step that assembles the final record only copied across a fixed list of items and none of the notes were on that list. Two whole features that depend on those notes had therefore never once worked in a real recording, despite both being built and tested. The notes now make it into the saved recording.
— 2026-09-01

## Fixed dates in calendars being recorded a day early — 2026-09-01
When a workflow recorded a date picked from a calendar, the date was stored one day earlier than the one actually clicked, for anyone in India, Europe or most of Asia. The cause was a time-zone conversion applied to a date that had no time attached, which rolled it back past midnight. Picking the 15th saved the 14th. Dates are now stored exactly as they appear on the calendar.
— 2026-09-01

## Fixed clicking a day in a calendar not being recorded at all — 2026-09-01
Choosing a date is a two-part gesture: you change the month and year, then click the day — and only that last click actually sets the date. The recorder had a list of things it considers clickable, and calendar day squares were not on it, so the day click was ignored as background noise. Played back, the workflow would open the calendar and flip to the right month and year, look completely correct, and then leave the date field showing its original date. Day squares are now recognised, and the wording on them ("Thursday, March 15th, 2007") is now understood too.
— 2026-09-01

## Fixed a background accessibility check that never once ran — 2026-09-01
The recorder takes a second kind of snapshot of each page, the one screen readers use, and the system relies on it to sanity-check the names it plans to use for buttons and fields. That snapshot was being taken on a separate worker, which the browser tool it calls flatly refuses to allow — so it failed every single time, on every recording, silently. With no snapshot to check against, made-up names slipped through: a dropdown got named after a nearby heading, which matched nothing when the workflow ran. The snapshot is now taken the normal way and the check works.
— 2026-09-01

## Fixed workflows failing on dropdowns that have no name of their own — 2026-09-01
A test workflow on a practice sign-up form kept stopping dead at the date-of-birth year dropdown with "element not found". The dropdown had no label, no title and no id, so the only thing that could identify it was its style name — and three separate parts of the system were each throwing that away. One was describing the dropdown by mashing every year in its list into one long line of text and then cutting it off halfway, which of course matched nothing. Another was writing down the dropdown's position in the page like a street address that started from the wrong house. And a third was discarding the full address as "too long" instead of keeping the useful last line of it. All three now keep something that actually works, and the workflow gets eleven steps further than before.
— 2026-09-01

## Stopped the system from quietly rejecting the right answer — 2026-09-01
Even once a dropdown could be found, the software double-checks it found the right one by comparing what it sees against what was recorded. That check was marking the dropdown down for two things it could never possibly pass: the text of its options, which the two sides read in slightly different formats and so never agreed on, and its surrounding wording, which the page simply did not provide. It was like failing a job applicant for leaving blank two questions that were never on the form. The score landed just under the pass mark and a perfectly correct match was thrown out. Those two unfair checks are gone, and the match now passes cleanly.
— 2026-09-01

## Taught workflows how to reopen a dropdown before picking from it — 2026-09-01
Some dropdowns, like the State and City pickers on a sign-up form, only create their list of choices at the moment you open them — the rest of the time those choices do not exist on the page at all. The recorder was never noting down which control opens the list, because the click that opens it lands on an unlabelled area it treats as background noise. So when the workflow replayed, it went looking for a choice that was not there yet and gave up. The recorder now writes down the control that opens the list, and the workflow opens it before picking. Anything recorded before this change still needs to be recorded again to benefit.
— 2026-09-01

## Stopped the Build Studio developer console from flooding with error messages every time it restarted — 2026-09-01
When a developer stopped or restarted the Build Studio app while working on it, the background program would print a wall of scary-looking error messages before closing. Nothing was actually broken by this — it happened after any in-progress recording had already finished — but it looked alarming and cluttered the logs, like a car alarm going off every time you turn the engine off. The app is now told to properly close down any recording session and its browser before it fully exits, instead of just being yanked away mid-task, and the harmless leftover warning that could still slip through is now quietly ignored instead of printed as a scary error.
— 2026-09-01

## Found and fixed why a recorded date-of-birth picker failed when tested — 2026-09-01
A workflow that filled in a date-of-birth calendar was tested and failed with "element not found." The calendar step itself turned out to be fine — the real problem was a much older, much bigger issue: a background check that verifies "does this name I'm about to use for a button or field actually exist on the page" had been silently broken for weeks, ever since a software update changed how that check reads a page. It's like a spell-checker that quietly stopped running months ago — nobody noticed until it let through a name for a year-picker that was actually the text of every year in its dropdown list mashed together, which of course matched nothing when the workflow tried to click it. That check is now working again, and a second guard was added so it can never again fail silently without anyone knowing.
— 2026-09-01

## Fixed three smaller bugs in the calendar-picker feature found during the date-of-birth investigation — 2026-09-01
While chasing the date-of-birth picker failure above, three separate smaller bugs turned up in how calendar steps get recorded and checked. First, a step that should have been remembered as "click here to open the calendar" was being skipped over and forgotten. Second, a saved pass/fail check for date pickers was comparing the result against the exact date that happened to be recorded, instead of whatever date someone actually picks when the workflow runs later — so a correct pick could still be marked as failed. Third, a recorded year from a birth-year dropdown could get mixed up with an unrelated phone-number field, because both looked like a plain number to the system. All three are covered by new automated tests, and the full existing test suite (over 1,600 checks across both the desktop app and the background runner) still passes.
— 2026-09-01

## Recording now leaves hover-menu watching switched off unless you turn it on — 2026-09-01
Every recording used to watch for hover-triggered menus (things that only appear when your mouse rests over something) automatically, even on sites that don't have any. That watching produces noisy, hard-to-review results, so most recordings paid the cost for a feature they never used. Now it's off by default, with a plain checkbox on the recording setup screen — "This workflow uses hover menus" — for the cases that actually need it.
— 2026-09-01

## Recording a multiple-choice question (like picking a gender or a country) now actually remembers every choice, not just the one you clicked — 2026-08-31
Recording a form where you pick one option out of several — a set of round "radio" buttons, a checkbox list, or a drop-down menu — used to go wrong in two ways. First, it showed up in the workflow editor as a confusing, technical-looking label instead of something like "Select Gender," plus a strange duplicate step that did nothing. Second, and more seriously, the setting it created remembered only the ONE answer you happened to pick while recording — so if you later tried to run the workflow with a different answer, like picking "Female" instead of the "Male" you originally clicked, it would ignore that and pick "Male" again every time. It's like a light switch wired to always turn on the same lamp no matter which switch you flip. Now, recording one of these captures every available option, not just the one chosen, and shows it in plain language like "Select 'Gender' (Male, Female, Other)." The workflow's setting is correctly named after the QUESTION being asked ("Gender") instead of the answer that was recorded ("Male"), and it comes with the full list of valid choices attached, so when the workflow runs later — whether a person or an AI assistant is supplying the answer — it picks whichever option was actually asked for. If someone provides an answer that doesn't match any real option, the workflow now stops and clearly lists the valid choices instead of silently picking the wrong one or guessing. Checkbox groups where more than one box can be picked ("select all that apply") are supported the same way.
— 2026-08-31

## The compile screen got stuck showing a failed compile forever, with no way to try again — 2026-09-01
If a workflow failed to compile and you left that screen and came back, it just showed the same failure again with no way forward — like a stuck elevator button that won't call a new elevator. Now, whenever a compile has failed, a "Retry compile" button appears right next to the status so you can start a fresh attempt without leaving the page or re-recording anything.
— 2026-09-01

## The compile screen had two separate title bars saying the same thing — 2026-08-30
While a workflow was compiling, the screen showed a generic "Compiling workflow" heading in its own bar, sitting right below the app's main top bar that already shows who's signed in. Now there's just one top bar: a back arrow sits at its far left, then "Compiling <the workflow's actual name>", with the step counter and a thin progress line worked into that same bar — all lined up on one row, at the same height as the Conxa logo block in the top-left corner, so the dividing line runs straight across the whole screen. No more redundant second header.
— 2026-08-30

## A "date of birth" style calendar with dropdown month/year pickers turned one date into a mess of junk settings — 2026-08-30
Yesterday's calendar-picking fix only covered calendars where you click little "next month" arrows. A different, very common style — where you instead pick the month and year from two drop-down lists (used for things like a date of birth, where scrolling month-by-month back to 1990 would take forever) — wasn't recognized at all. Recording one of these produced eight separate, jumbled steps for a single date pick, and instead of a sensible setting name, it created garbage ones named after whatever the calendar happened to be displaying at that moment, like "august_2006". Two things were going on: first, picking one option from ANY drop-down list was being recorded as up to four separate actions instead of one, which is now cleaned up for every drop-down in every recording, not just calendars. Second, the recorder was mistaking the calendar's own "currently showing: August 2026" readout for a text label on a nearby box, which is now recognized and ignored. On top of both fixes, month/year drop-down calendars are now understood the same way arrow-based ones are: picking a date through them turns into one clean, adjustable setting, the same as before.
— 2026-08-30

## The Workflows page buttons now say "Re-record" and "Re-compile" once a workflow already has both — 2026-08-30
The buttons for recording and compiling a workflow always said "Record" and "Compile," even after you'd already done both once. Now, once a recording exists the button reads "Re-record," and once a compile has finished the button reads "Re-compile," so it's clear you're redoing something rather than starting fresh.
— 2026-08-30

## The group workflows screen scrolled as one giant page instead of just the long lists inside it — 2026-08-30
Opening a group with many workflows or many connected applications used to scroll the entire screen — header and all — as one long page, which made it hard to keep your bearings. Now only the applications list and the workflows list scroll on their own, each in its own little window, while the page title and the surrounding layout stay put.
— 2026-08-30

## Recording a calendar date picker now actually works when the skill runs again later — 2026-08-30
Picking a date on a real calendar pop-up (the kind with a little grid you click through, not a simple typed field) never replayed correctly before. Recording it captured "open the calendar, click Next twice, click on the 15" as three separate clicks — but next month, the calendar opens on a different month already, so those same clicks land on the wrong day, or on a greyed-out day borrowed from the next month by mistake. There was also no way to tell the workflow "use today's date" or "use whatever date the customer asks for" — the exact date from recording day was baked in forever. Now, recording a calendar pick turns into one clean step that remembers the date as an adjustable setting (with the recorded date as its starting point), and replaying it first tries typing the date directly into the field; only if that doesn't work does it drive the calendar itself, reading the currently-shown month and clicking Next/Previous the right number of times, then picking the exact right day while skipping any greyed-out days from a neighboring month. Date ranges (like a hotel check-in/check-out) and date-with-time pickers are covered too. None of this uses any AI, so it costs nothing to run and stays fast.
— 2026-08-30

## A manually typed web address could vanish from a recording if it followed a button that didn't actually go anywhere — 2026-08-30
A brand-new feature (shipped one day earlier) teaches the recorder to notice when someone types a new web address into the browser's own address bar mid-recording, so that step doesn't get lost. But it had a blind spot: if the person had just clicked a button that looked like it should jump to a new page but didn't (for example, a "Submit" button that just shows a message on the same page), the recorder kept thinking a page-jump was still "in progress" from that click. When the person then genuinely typed a new address afterward, the recorder mistakenly credited that old, dead-end click for it and didn't record the address change as its own step — so it silently disappeared from the workflow editor, exactly as reported. The recorder now forgets that "a jump might be coming" if too much time passes without one actually happening, so a stale click can no longer swallow a real, later address change.
— 2026-08-30

## Local app updates would have shipped without two new safety files — 2026-08-29
Building a local app-layer update failed because two new files — the one that fingerprints activity reports so they can't be silently altered, and the one that checks a company's "when and where this may run" rules — were on disk but not on the shopping list that decides what actually goes into the zip customers receive. Without that list, the next update would have crashed the moment it tried to load those features. Both files are now on the list, and the fingerprint helper is also included in the frozen host program because the update-signing code already depends on it. The pre-build checker now passes.
— 2026-08-29

## A deleted run's records can no longer vanish without a trace, and companies can now block runs outside allowed hours — 2026-08-29
Two gaps used to sit between "we log everything" and "we can actually prove it." First: if the program running an automation was killed partway through, or its own local records were deleted afterward, there used to be no reliable proof on our servers that the run ever happened at all — like a security camera that only saves footage if the recording finishes cleanly. Now the very first thing a run does is confirm with our servers that it started, and every batch of activity it reports is stamped and linked to the one before it, so a missing or tampered batch is now detectable rather than silently absent. A new report lets us see, per company, exactly how many runs started, finished, or went missing partway through. Second: a company can now set rules for when and where an automation is allowed to run — for example, "payroll exports only run on weekdays, 9 to 5" or "never touch this specific website" — and those rules are cryptographically signed so a customer's own machine can't quietly edit them away. Rules ship in "audit only" mode at first, meaning we record what would have been blocked before anything is actually stopped, so a bad rule never surprises anyone. We were upfront in writing about the honest limit here: someone with full control of their own machine can still find ways around a local rule, but doing so now leaves a visible trace on our side instead of an invisible gap.
— 2026-08-29

## Delete and Pay buttons can no longer be tricked into acting on the wrong row — 2026-08-29
Imagine a list of invoices where every row has its own Delete button that looks identical. If our self-healing recovery ever lost track of exactly which button it recorded, the old safety net could confidently click a Delete button on the wrong invoice instead of admitting it couldn't find the right one — a real risk we had flagged but not yet fixed. Two changes close that gap. First, every step that deletes, pays, submits, or otherwise can't be undone is now correctly flagged as "risky" (a labeling step that, it turns out, was silently broken and had never actually been switching on the existing safety net). Second, for a risky click on a row inside a list, Conxa now learns which specific row the recording was about — by an invoice number, a customer name, whatever text made that row unique — and will only ever act on the one row matching that value; if it can't find exactly one matching row, it stops and says so instead of guessing. A workflow builder must now confirm this "which row" matching in the editor before publishing a risky step, so it's never left to chance. We also gave companies a way to run a workflow in a stricter, no-guessing mode for their most sensitive automations (like payroll), on top of the existing safety switch.
— 2026-08-29

## Build Studio now has a real licence, and you have to accept it before using the app — 2026-08-29
Until now nothing written down stopped a customer from taking apart the Build Studio app, or from selling it on as their own product. Our public Terms now spell that out: the app is licensed per machine and may not be modified, taken apart, resold, rebranded, or run on someone else's behalf, while everything a customer builds with it — their skill packages and installers — stays theirs to sell to their own customers. The Privacy Policy also now says plainly what stays on the customer's own machine. On first launch Build Studio shows a short summary of these terms with links to the full documents and a tick box you must check before you can continue, and the links stay available afterwards in Settings and in the cloud dashboard sidebar. The wording still needs a lawyer's sign-off before we treat it as final.
— 2026-08-29

## Accepting the Build Studio terms is now recorded on our servers, not just on the customer's PC — 2026-08-29
The tick box added earlier only remembered the answer on the customer's own computer, so if it ever came to an argument we had nothing to show: no name, no date, no proof of which version they agreed to. The app now asks for acceptance after the person signs in, and saves a permanent record on our side — who accepted, for which company, exactly which wording (we keep a frozen copy of the documents and match them by fingerprint), when, from where, and on which machine. It is like moving from a sticky note on someone's desk to a signed and countersigned copy in our own filing cabinet. Because the record has to be checked, Build Studio will not open if it cannot reach Conxa — a deliberate trade for having the agreement hold up.
— 2026-08-29

## A step editor tucked inside conditional branches still showed computer-speak instead of plain English — 2026-08-29
A few days ago, editing a recorded step's description in Human Edit was fixed to show a plain-English sentence instead of a short code word, everywhere in the app — except one spot: the small editor for steps nested inside a "only if this is on screen" condition still showed and saved the old code word. It's like fixing a form everywhere in a building except one side room nobody checked. Now that side-room editor shows and edits the same plain sentence as everywhere else, with the code word underneath as a small reference note.
— 2026-08-29

## The Workflow Test box asked for answers that weren't actually needed — 2026-08-29
When testing a recorded workflow in Build Studio, the pop-up box asking for input values treated every single input as mandatory, even ones the workflow itself had been set up to allow leaving blank. It's like a form that refuses to submit unless you fill in a field marked "optional." The box was checking the wrong label on each input to decide if it was required, so that label was never actually present and it defaulted to "yes, required" every time. Now it correctly reads whether an input was marked optional (or already has a default value), matching how the same workflow behaves everywhere else it can run.
— 2026-08-29

## Running a saved workflow could freeze forever on a website's pop-up box — 2026-08-26
Recording a workflow with a pop-up box now works, but running that same recording back could get stuck: the pop-up would appear and just sit there, nothing responding, forever. The cause: right after the click that opened the pop-up, Conxa runs a quick "did that actually work?" check on the page — but a website is frozen solid while one of its own pop-up boxes is open, so that check waited for an answer the page could never give, and it wasn't smart enough to give up. Since that check never finished, Conxa never got to the next step, which is the one that actually answers the pop-up — so the whole run sat frozen indefinitely, needing someone to notice and cancel it by hand. Two things are fixed: that check now recognizes "a pop-up is open right now" and skips itself immediately instead of waiting on an impossible answer, and, as a safety net for anything else that could similarly get stuck, every such check now has a real deadline it can never blow past, so nothing can freeze a run forever again.
— 2026-08-26

## Answering a pop-up box left a ghost copy of it behind — 2026-08-26
Right after the previous fix (pop-up boxes vanishing before you could answer them), a new wrinkle showed up: after answering the question in Build Studio's box, switching back to the browser sometimes still showed the website's own pop-up sitting there, needing a second click to go away. It's like signing a form, then finding an identical, already-cancelled copy of it still on the desk. What was actually happening: your answer in Build Studio was being applied to the real pop-up correctly and closing it right away, but because the browser window was sitting behind Build Studio at that moment, Windows sometimes left a stale picture of the now-closed pop-up on screen until something refreshed that window. Now, the moment your answer is applied, Conxa briefly brings the browser window itself forward to force it to refresh, clearing that leftover picture — without shrinking or minimizing the window, you land right back where you were.
— 2026-08-26

## Pop-up boxes were vanishing before you could answer them — 2026-08-26
When recording a workflow, any pop-up box the website itself shows — a plain message, a yes/no question, or a box asking you to type something — used to flash on screen and disappear on its own before you could click anything or type an answer. It's like a form asking you a question and then answering it for you before you've even read it. The cause: turning on the recorder's "watch for pop-ups" switch also, as a side effect, stopped the browser from ever showing that pop-up in the first place, and Conxa was answering "yes" on your behalf the instant it appeared. Now the pop-up genuinely waits for you: it shows up in the Build Studio as a proper question with the website's exact message, and, for a typed-answer box, a place to type your reply, with Yes/No or OK buttons. Whatever you actually choose is what gets recorded and played back later, and a typed answer can even be swapped out for something different each time the workflow runs. A pop-up nobody answers within two minutes is auto-confirmed so it can never freeze a recording. Pop-ups shown during the separate "sign in" step still work exactly as before, unchanged, since that screen doesn't yet have a way to ask.
— 2026-08-26

## Stopped recordings picking up pointless "hover here" steps — 2026-08-26
Recordings were collecting hover steps nobody asked for — the mouse pausing on a heading or a link on its way somewhere else got saved as a real step. Two things caused it. Conxa decides a hover mattered by comparing what's on the page just before and just after, and its "before" picture was being taken while the page was still blank, so the page simply finishing loading looked like the hover had revealed everything on it. On top of that, the comparison only counted things currently on screen, so scrolling down — which brings a lot into view — also looked like a reveal. Now the "before" picture is taken once the page has actually loaded and is kept up to date as the page changes, and the comparison ignores scrolling entirely and looks only at what the page genuinely chose to show or hide. Real hovers, like an avatar that reveals a hidden link, are still recorded exactly as before.
— 2026-08-26

## Fixed steps that point at a picture or icon being named after the text next to them — 2026-08-26
A recorded step failed to replay with "the element this step needs wasn't found on the page", even though the element was sitting right there. The cause: when Conxa records something that has no words of its own — a photo, an avatar, a bare icon — it needs a name for it, and it was falling back to the nearest text nearby. So an avatar picture got recorded under the name of the paragraph above it, and when the workflow ran later nothing on the page went by that name. It's like labelling a jar with the name of the jar beside it, then being unable to find anything in the cupboard. Now Conxa reads the picture's own description (the text screen readers announce), and if something genuinely has no name it says so and finds it by its position on the page instead of inventing one. Two related gaps closed with it: the part of the runtime that identifies elements only recognised links, buttons and text boxes — pictures, dropdowns and headings were invisible to it, so even a correct match got thrown away — and any recorded name that already matched nothing at the moment of recording is now discarded at that point, instead of being shipped inside the workflow to fail months later.
— 2026-08-26

## Retyping the address bar mid-recording is now captured — 2026-08-26
If someone recorded a workflow, then manually typed a different web address into the browser's address bar partway through (instead of clicking a link), that address change used to vanish completely — the recording only remembered the actions taken before and after it, not the jump itself. It's like writing down every stop on a road trip except the one time someone changed the destination on the GPS by hand. Now the recorder notices when a page change didn't come from clicking something on the page, and adds an explicit "go to this address" step so replaying the workflow visits the same pages in the same order.
— 2026-08-26

## Two silent gates were still throwing away those address-bar steps — 2026-08-26
After teaching the recorder to notice manual address-bar jumps, they still didn't show up in the workflow editor, and nothing anywhere reported an error. Two separate filters were quietly discarding them. The first was a list of approved action types that the new "go to this address" action had never been added to, so every one of them was thrown out on arrival, like mail addressed to a name that isn't on the mailbox. The second only showed up when someone visited several sites in a row: a tidy-up pass that merges repeated identical actions couldn't tell two different address jumps apart, so visiting three sites collapsed into one. Both are fixed, and a recording that hops between three sites now shows all three visits as separate steps.
— 2026-08-26

## Fixed the compile timer counting up instead of down — 2026-08-26
The "time left" number shown while a workflow compiles was supposed to count down, but it was climbing instead — like a delivery tracker that keeps saying "3 hours left" no matter how long you wait. The cause: that estimate only checked off 7 big-picture stages (like "generate selectors"), and one of those stages quietly does most of the real work — reading every single recorded action, one at a time — without reporting any progress in between. So the timer saw no movement for a long stretch while the clock kept running, and the estimate grew instead of shrank. Now that stage reports its own step-by-step progress (e.g. "42 of 105 actions done"), so the time-left estimate has something to count down against the whole way through, not just at the big checkpoints.
— 2026-08-26

## A broken drag-and-drop step no longer blocks the whole package build — 2026-08-26
If a recorded workflow contained a drag-and-drop step that couldn't be captured properly, building the finished package used to fail completely, with no way forward. Now that one step is skipped with a warning explaining that drag-and-drop isn't supported, and the rest of the workflow builds normally. It's like a printer skipping one bad page instead of jamming the whole job.

## Fixed the AI plan-builder rejecting a working AI provider as unusable — 2026-08-26
Compiling a workflow tries to have the AI sketch a plan for the whole recording first, and a check meant to confirm "is this AI provider speaking a language we understand" was too strict — it demanded an exact address match instead of allowing the small extra address details each AI provider adds on its own. Google's AI provider always failed that check, even though it works fine, so every compile silently skipped the whole-workflow plan and fell back to figuring out each step one at a time (still works, just less context-aware). The check now allows for those small address variations, so the full-workflow plan gets built like it's supposed to.

---

## Fixed recordings that need a mouse-hover to reveal what you click next — 2026-08-26
Some websites hide a button or link until you hover your mouse over something else first — like an avatar picture that only shows a "View profile" link once you point at it. Recording one of these used to require the person recording to remember to flip on a hidden "hover" switch beforehand, and even then the recorder often didn't recognize plain, unmarked hover spots (like a bare picture with no special styling) as something worth watching. Both problems are fixed: the recorder now always watches for these reveal-on-hover moments automatically, no switch to remember, and it recognizes plain elements like images as valid hover triggers, not just buttons and menus with obvious markup. It still ignores harmless mouse-overs that don't actually reveal anything, so recordings don't get cluttered with noise. This was caught while testing the recovery of the `/hovers` step in the sample test workflow, where the hidden link never got recorded and so could never be clicked back during replay.

---

## All five testing guides merged into two easy-to-navigate documents — 2026-08-26
No code change. The `docs/testing/` folder used to hold five separate testing guides (the long-chain workflow plan, the mega-workflow gauntlet, the plan-limit tests, the production-readiness checklist, and the stress-test guide). They are now combined into just two files: **`01-WORKFLOWS-TO-TEST.md`** lists everything still waiting to be tested, sorted from easiest to hardest, with related small tests merged into fewer but longer workflows (12 workflows total instead of dozens of scattered ones); and **`02-WORKFLOWS-PASSED.md`** is the new "hall of fame" — every time a workflow passes a real manual run it moves there from file 01, together with a short explanation of what that success proves Conxa can now do. File 02 also has a dashboard at the top showing current internet-workflow coverage (honestly estimated at about 18% today — the proven workflow shape suggests ~30% is reachable, but only one full run backs it so far), the longest verified workflow (42 steps across 6 tabs and 6 websites), and which abilities are proven versus still pending. The three local HTML test pages were moved into `docs/testing/fixtures/` so nothing was lost, and old references to the deleted files in `TODO.md` were updated to point at the new locations.

---

## Checked whether huge (100+ step) recordings break the workflow-plan AI call — 2026-08-26
No code change. Someone asked if a very long recording would overflow the AI call that writes the workflow plan. Answer: the request size itself is fine for hundreds of steps — each step only sends its action, button text, page address, and a short hint, so 100 steps is roughly 5–15k tokens, far under even the smallest provider's limit (the big models allow up to a million). The real risks found were elsewhere: the reply has to describe every single step, and nothing tells providers how long that reply may be, so around 100–150 steps the reply can get cut off mid-way and the whole plan is thrown away; free-tier providers also cap tokens per minute, which a long plan blows through instantly; and the step-label text isn't trimmed like everywhere else in the codebase. Chunking the plan into batches and setting an explicit reply length would fix this — tracked as future work.

---

## Fixed a leftover-file mixup when one workflow chains several downloads and uploads — 2026-08-25
When a workflow moves a batch of files from one app to another, it uses a shared holding folder for that run. If a workflow chains this more than twice in a row — download a batch, upload it, download another batch, upload that one too — the second upload could accidentally grab leftover files from the first batch as well, silently sending extra files nobody meant to send. It's like clearing a shared inbox tray after handing off its contents, instead of leaving old papers to get mixed in with the next delivery. Now, once a batch of files is successfully uploaded, they're deleted from the holding folder right away, so later batches in the same run only ever see their own files.

---

## Conxa can now run your skills on a schedule, all by itself - 2026-08-26
Until now, a skill only ran when you (or your AI chat app) asked it to. Conxa now ships with its own built-in scheduler: you tell it "run this every weekday at 6am" (either by asking in chat or with one command), and from then on it fires on time even when every chat window is closed - a small tray icon appears so you can see what is happening, pause it, or stop it. Missed runs are handled sensibly: if the computer was off and wakes up within the grace period you chose (one hour by default), the run catches up once; older missed slots are skipped rather than firing a pile of late runs all at once. Two safety nets came with this: several skills can now run side by side (up to five), and if two skills would touch the same website, they politely take turns instead of tripping over each other - this now works even between completely separate Conxa processes, which closes a small hole where a scheduled run and a chat-driven run could both hit the same site at once. Your schedule details (including any form values) are stored only on your own computer, encrypted; nothing about schedules ever reaches our cloud.

---

## Wrote up a real safety gap: our automatic repair attempts can act on the page more than once — 2026-08-25
When a workflow step fails, the runtime tries a series of increasingly creative ways to find the element again — and each one of those tries performs a real click. Nothing in between them checks whether the previous try already worked. So a Submit button whose confirmation message is just slow to appear can get clicked twice, and a later attempt matching loosely on text can click something entirely different and leave the app somewhere nobody expected. It is like a person jiggling a jammed door handle several times without looking up to see the door already opened. This is an analysis document, not a fix — it walks through exactly where this happens, how the well-known browser AI tools avoid the same trap (they look at the page again after every single attempt, which we deliberately cannot afford to do on every step), and lays out five specific changes that use pieces we have already built. It also found that the flag marking a step as dangerous (delete, pay, submit) is recorded and shipped with every workflow but never actually read when the workflow runs. The work is now tracked in the backlog.

---

## The upload file picker now pops up in front of the recording window, not behind it — 2026-08-25
When recording a workflow and clicking an upload button, Conxa's own file picker window opened up, but it appeared hidden behind the browser window you were recording in — like a paper sliding under a stack instead of on top. You'd have to know to alt-tab to find it. Now the file picker briefly jumps to the very front of all your windows while it's open, so it's immediately visible, then steps back to normal once you've picked a file (or cancelled) so it doesn't stay stuck on top of everything else afterward.

---

## A hands-on test drill for the self-healing tiers (Tier 2 and Tier 3) — 2026-08-25
The testing guide got a new exercise ("Workflow 9") that shows you how to deliberately break a recorded workflow's target element in controlled ways and watch each level of the automatic recovery ladder do its job. You record a click on a practice page served from your own computer, then replay against mutated copies of that same page: one copy where the button was renamed (the free Tier 2 self-heal should still find it using backup identity info), one where every trace of the original button was rotated plus two decoy buttons added (the paid Tier 3 step where Claude picks the right element from a ranked shortlist), and one where the button is simply gone (the run must fail honestly, not click something wrong). Each replay has a pass/fail table, exact log lines to look for, and which code module to blame if it devolves. This turns the recovery design from "trust us, it works" into something anyone can verify by hand in about twenty minutes.

---

## Self-healing recovery now works in two smarter steps instead of one big expensive one — 2026-08-25
When a recorded workflow step can't find its element on a changed website, the runtime used to send Claude one big combined rescue package: everything about the step plus every interactive element on the page, all in a raw data dump, plus screenshots — every single time, even for easy cases. Now it works like the best browser AI agents do, in two separate rounds. Round one (semantic): the runtime sends a short numbered list of the page's buttons and links, **sorted so the most likely match appears first** (it compares each live element against what was recorded about the original target), and simply asks Claude to reply with the number of the right one — instead of asking it to invent a selector from scratch, which is where AI agents most often guess wrong. The runtime still double-checks that pick against its own uniqueness rules before clicking anything. If round one doesn't fix it, round two (vision) goes out as a completely separate request with the screenshots, asking Claude to look at the page the way a human would. Two safety nets came with this: if the page hasn't changed at all between two consecutive rescue attempts, the runtime stops trying instead of burning the customer's Claude tokens on a frozen page; and if Claude names an item number that no longer exists (because a newer list went out), that stale answer is safely ignored and a fresh list is sent next time. Net effect for customers: steps that heal easily now cost roughly half the tokens they used to, stubborn steps cost about the same as before, and hopeless cases stop costing anything extra.

---

## The big multi-tab, cross-domain test workflow now passes end to end — 2026-08-25
The long "mega-workflow" test (42 steps across 6 browser tabs and 6 different websites — filebin, demoqa, the-internet, Render, Vercel, and a deployed app) has been recorded, compiled, and replayed successfully. It downloads files on one tab, uploads them on other tabs on different websites (the file handoff happened automatically, exactly as designed), switches back to the first tab, deploys a service on Render, and signs in through a website-opened popup. The testing documents (`docs/testing/exec-10-long-chain-workflows.md` and `TODO.md`) were updated to record this result. Still to do: shrink it into an automated CI fixture that runs without logins, plus a few side tests (single-site 30+ step chain, dynamic elements, running the same skill twice with different files).

---

## The "Ready to Package" light now actually turns green after publishing — 2026-08-25
A code review caught a follow-up bug in yesterday's change that made the last step on a workflow's row stay orange forever. The light was set to turn green only when the skill's status read "published" — but when you publish from Build Studio, the cloud saves it with the status "ready", and only a separate admin release action ever changes that to "published". So doing exactly what the screen told you to do (publishing) never turned the light green. Now either status counts: if your skill has been uploaded to the Conxa Cloud at all, the "Ready to Package" node turns green as intended.

---

## Recording now captures the browser's Back and Forward buttons — 2026-08-25
When you recorded a workflow that used the browser's Back button — for example: work on tab A, open tab B, come back to tab A, press Back, then click something on the page you landed on — that Back press simply vanished from the recording. The recorder only "sees" things that happen inside the web page itself (clicks, typing, scrolls), and pressing the browser's own Back button doesn't produce any of those signals. So when the workflow replayed, it skipped the Back entirely and usually ended up in the wrong place, because nothing told the browser to go back. Now the recorder watches each tab's browsing history directly (the same list the Back button uses) and, whenever a step lands somewhere because you went Back or Forward, records that as its own visible step in the editor ("Browser back" / "Browser forward"). At replay time the runtime presses the same history buttons on the exact tab where you pressed them — it never fakes the move by re-typing a web address, so redirects, one-page apps, and login state all behave exactly like they did while you were recording. A couple of safety rules keep this honest: ordinary link clicks and page reloads are never mistaken for a Back/Forward (a missed press just behaves like before; a wrongly-guessed press would break replays), and two Back presses in a row stay as two steps instead of being squashed into one. Covered by new automated checks across recording, compiling, saved-skill export, and replay dispatch, plus the CI test workflow which now literally clicks a link, goes Back, and verifies it landed where it should.

---

## The login double-check before a test run now takes seconds instead of about a minute — 2026-08-25
Even after the earlier fix that skips checking sign-ins for websites a workflow never uses, a workflow that genuinely needs two or more website logins (like the Render + Vercel one) still paid a long wait at the start of every test: the log showed "group_auth_validation" taking over 60 seconds before the first step could run. Three things were stacking up. First, the system was opening a brand-new hidden browser just to check each website's login — and those browsers fighting over the computer's resources made them effectively take turns, doubling the wait. Now all the checks share one hidden browser instead of launching one each, which alone cuts most of the cost. Second, only the websites the workflow is actually gated on get checked against the live site now; the other saved logins in the group are simply loaded and handed to the browser as-is, since they were never blocking anything anyway. Third, once a login check passes, the result is remembered for 6 hours — so running the same workflow again within that window skips the whole online check entirely and starts almost immediately. If you log in again manually, the memory is thrown away automatically so it never trusts an outdated answer. Net effect: a repeat test run saves roughly a minute of waiting, and even a first run after a long gap is several times faster. Verified with new automated checks for the remember-and-expire behavior plus all existing runtime checks passing.

---

## A test run could sit frozen for over a minute right after the first step started — 2026-08-24
Testing a workflow that started with "go to this website" could get stuck for 60-70 seconds with the browser window just sitting blank, before anything visibly happened. The cause: right before that first step ran, the program paused to wait for the page to load on its own — but nothing was going to load it on its own, because the very next instruction was the one that would actually send the browser to that website. It was like waiting at a red light that was never going to turn green, when you were the one about to drive through the intersection yourself. Now the program only waits for a page to load itself in the one case where that's actually true — a new browser tab a website opened on its own, which really does take a moment to fill in. It also now says so in the test log whenever it genuinely has to wait for something, instead of going quiet, so a real wait never looks like a freeze again.

---

## The Test Skill page now shows exactly where a slow test is spending its time — 2026-08-24
People have noticed that clicking "Run Test" on a workflow can be slow — it takes a while before the test browser window even shows up, and then that window can sit there blank for a long stretch before the recorded steps actually start playing. That investigation found several real, stacked-up delays (copying the whole skill package to the test area on every single click, starting a brand-new test program from scratch every time, and opening two separate browser windows in a row — one hidden, to check you're still logged in, then the real one you see) — but there was no way to see, in the moment, which of those steps was actually the slow one. This change adds a running timer to the test log panel: every stage of a test run now reports how many seconds have passed since the test started, including the stages that happen inside the browser-launch process itself. Nothing about how tests run has changed yet — this is purely a diagnostic step so the next fix can target the real bottleneck with real numbers instead of guesswork.

## Fixed the main cause of slow "Run Test" clicks — starting a brand-new helper program from scratch every time — 2026-08-24
With the timer from the change above, a real test run showed that almost 40 out of every ~48 seconds before the test browser even appeared was spent starting up a fresh, one-use copy of the program that actually runs the workflow — every single click threw that copy away afterward and started completely over next time, like restarting your whole computer just to open one document. That helper program was actually built to stay running and handle many tests back to back, the same way it does for a real customer — Build Studio was just never taking advantage of that. Now Build Studio keeps that helper running quietly in the background between clicks and reuses it, so only the very first "Run Test" in a session pays that ~40-second startup cost; every test after that skips straight to the actual browser and workflow. If a workflow test isn't run again for about 5 minutes, the background helper shuts itself down automatically to free up memory, and quietly starts fresh again next time it's needed — so nothing is left running forever. A separate, smaller slowdown (the test browser opening twice in a row, once hidden and once visible) was found in the same investigation but is being left for a follow-up, since fixing it touches the same authentication check real customers rely on and deserves its own careful pass.

## The test log now shows how long each individual step takes, not just the overall run — 2026-08-24
A follow-up test after the fix above still felt slow and confusing: the test browser sat still for close to a minute with nothing visible happening, then the run failed. The timer added earlier only showed when the browser itself was ready and when the very first step began — it couldn't say which of the workflow's own steps was actually eating that minute. Now every single step in a test run reports its own start time in the log, labeled with its step number and what kind of action it is (click, navigate, and so on). This makes it possible to read the log after a slow or failed test and see exactly which recorded step is the slow one, instead of only knowing the total was slow.

## Fixed a case where a code change wouldn't show up in a test run until minutes later — 2026-08-24
After the earlier fix that keeps the test-running helper program alive between clicks (instead of restarting it every time), a new problem appeared: rebuilding the program with a code change didn't reliably show up on the very next test click the way it used to. The reused helper had no way to notice that its own code had been replaced underneath it, so it kept running the old version until it happened to restart on its own, up to five minutes later. This only affected people actively working on that helper program itself — not anyone just recording and testing their own workflows — but it made it look like changes "weren't taking effect" when really they just hadn't been picked up yet. The helper now checks, on every test click, whether it's running the version that was actually just built, and restarts itself automatically if not, so a rebuild is picked up on the very next click again.

## Found and fixed the real reason "Run Test" could sit blank for up to half a minute before doing anything — 2026-08-24
The actual test browser window wasn't hanging — it hadn't been created yet. For a workflow that belongs to a named group of related workflows (for example, several workflows that share sign-ins for different websites), the system was always double-checking every website's sign-in in that group before starting the test, even for websites that particular workflow never uses. Each of those checks can take up to 30 seconds against the real website, and a couple of them running back to back is exactly why the window sometimes took a long time to even appear. Now, if a workflow is explicitly marked as needing none of the group's other sign-ins, those checks are skipped entirely and the test browser opens right away. For the rare case where a workflow genuinely does need to wait on those checks, the log now says exactly which sign-ins it's checking and how long that took, instead of going quiet with no explanation.


## The file picker that pops up while recording now actually shows up in front — 2026-08-23
When you're recording a workflow and click an "upload" or "choose file" button on a website, the Studio opens its own file-picking window so you can pick the document to upload. The problem: that window kept appearing minimized (or hidden behind the recording browser), so it looked like nothing happened. Two small fixes: if the Studio window is minimized, it's now properly restored first (the old code only tried to "show" it, which on Windows doesn't un-minimize), and the picker is now firmly attached to the Studio window so it always opens centered on top of it instead of floating behind other windows.

---

## Switching back to the first tab now actually switches — 2026-08-23
When you record a workflow that goes: do things on tab A → open tab B → come back to tab A → keep working, the recording showed a "Recorded tab switch" step in the editor, but when the workflow replayed, nothing visibly happened at that step — the browser stayed on tab B while the clicks meant for tab A fired blindly at it in the background. The root cause was a naming convention: steps recorded on the *first* tab deliberately carried no label saying "this is tab A," because "no label" already meant "first tab." That worked fine for ordinary steps, but it also stripped the destination off the "switch back to tab A" instruction itself — so at replay time that instruction looked exactly like a broken/blank one, and the runtime's safety rule for broken instructions ("if a switch says no destination, just stay where you are") swallowed it. Execution only got back to tab A by accident, through a default on the very next step — and with no waiting and no bringing tab A to the front, which is also why the step right after the switch could miss its button. The fix removes the special case: every step and every switch instruction now explicitly names its tab, including the first one (old recordings without labels still work exactly as before), and whenever replay moves to a different tab than the previous step — including returning to the first one — it now waits for the page and brings it to the front, so the switch is real and visible instead of silent. Verified with new automated checks at both the compiler and replay layers, plus the full existing suites (914 + 357 checks) passing.

---

## A compile would silently freeze for eight minutes, an on/off switch pointed at the wrong place, and a real error hid behind a generic one — 2026-08-23
Right after yesterday's fix for compiles failing on busy days, a real compile against a still-recovering server exposed three more problems. First: the new "ask several pictures about at once" step (meant to save time) had a hidden flaw — if the AI helper couldn't be reached, it would keep quietly retrying every single recorded step's info one at a time, in total silence, for as long as eight minutes before the screen showed any progress at all. It now gives up after the very first sign of trouble and switches back to the older, working step-by-step approach, and it now says out loud when it's working on this step so it never looks frozen again. Second: there's a setting that controls whether a compile finishes anyway (using a rougher fallback) instead of stopping outright when the picture-reading AI can't be reached — someone tried to turn it on by changing a setting on the cloud server, which had no effect, because that setting actually only lives on the person's own computer inside Build Studio; a wrongly-worded internal note even said it belonged on the server, which is exactly what led to the wrong guess. It's now controlled from the cloud for real, tied to the company's plan, and read automatically at the start of every compile — no more hunting for the right computer to change a setting on. Third: when that same picture-reading step failed for a real reason, the app showed a vague, unhelpful "something went wrong, try again" message instead of the specific one that already existed and was simply never being used. It now shows the real, specific explanation. Verified with 913 passing automated checks, including new ones for all three problems.

---

## A large recording would fail to compile with a wall of "server error" messages — 2026-08-23
Compiling a workflow that touched several websites in one recording used to fail partway through, with the compile log showing a burst of server errors and then one final failure that killed the whole thing — even though the person had already paid a compile credit for it and gotten nothing back. The cause: the assistant gives itself only two seconds to hear back from the AI helper it asks for small in-compile decisions, and two seconds simply isn't enough time when the request has to travel through the cloud service in the middle. When that short wait ran out, the assistant treated it exactly like the AI helper being broken and benched it for a full minute — and since there were only three AI helpers to rotate through, three slow-but-fine answers in a row was enough to leave nobody available, which is what produced the wall of errors. It also made the mistake of treating "this one request took too long" the same as "this AI helper is genuinely broken," and the same time-out was shared between ordinary text questions and picture-reading questions, so a pile-up on one accidentally silenced the other too. Fixed by giving requests a realistic amount of time to answer, telling different kinds of trouble apart (a slow response gets a short pause and another try; a request that could never succeed with any helper, like a picture that's too big, fails right away instead of being retried three times for nothing; a real login problem gets sidelined for a few minutes instead of forever), keeping text and picture questions from interfering with each other, and putting a hard ceiling on how long the assistant will keep trying so it never gets cut off mid-answer by the server itself. If the recording is large enough to need several picture-reading questions, they're now bundled together instead of asked one at a time, so there are fewer chances to hit a bad moment. And if a compile does fail because of one of these outside hiccups after the credit was already spent, that credit is now automatically given back instead of being lost. Verified with 907 passing automated checks, including new ones for every failure type described above.

---

## A workflow that uses two websites now shows both name tags — 2026-08-23
A workflow called "Deploy a Service on Render then Visit frontend on Vercel" obviously touches two platforms — but its card in the group page only showed one small tag: "Render". The reason: the tag matching only looked at where the workflow *starts*, never at where the recording actually goes, and it only compared against each app's login address rather than also its "login succeeded" address. So the Vercel half of the trip was invisible. Now, the moment you click "Save Workflow Now" after recording, the program notes every website the recording actually visited; the group page then shows a tag for every connected app those visits touch — so this card correctly shows both "Render" and "Vercel", even before compiling. Importantly, these tags are computed by exactly the same matcher that decides which app logins a workflow needs when it runs, so what the card shows can never disagree with what actually gets enforced. And because the runtime already locks concurrent runs by every platform they touch (not just the starting one), two workflows sharing either Render or Vercel still politely take turns, while workflows on completely different sites run side by side. Verified with new automated checks at every layer: tag extraction from recordings, the group page's tag list, the compiled pack requiring both apps, and a live end-to-end test proving a Vercel-only run waits behind a multi-platform run even though their starting addresses differ.

---

## A confusing "no address configured" error was hiding the real problem — 2026-08-22
When a saved login for a website couldn't actually be used — say, the program's own built-in browser wasn't installed correctly — the program reported the wrong problem entirely: "no target website configured," which sounds like a setup mistake on the company's skill pack, not a browser problem. That's because a safety-net "if anything goes wrong here, quietly try something else" wrapper had been drawn around too much code — it was meant to catch "the saved login doesn't work anymore," but it also caught and hid the real, much more useful error about the broken browser, then went on to report something unrelated instead. Like a doctor who was supposed to note "patient has a cold" but instead reported "patient forgot their appointment" because a receptionist's note got mixed in. Fixed by narrowing that safety net back down to only what it was meant to catch, so a real problem now shows its real, specific message. Verified with a new automated check that deliberately breaks the browser and confirms the program now reports the real cause instead of the misleading one, plus a full successful run through the real login-and-run-a-task path to confirm nothing else changed.

---

## Every failed automated task used to crash instead of reporting a clean error — 2026-08-22
When a running task (a skill) hits a real problem — a website isn't logged in, a step times out, someone cancels it — the program is supposed to clean up after itself and then hand back a clear explanation of what went wrong. Instead, that cleanup step itself was crashing every single time, because it was trying to use a helper tool that had accidentally been packed away somewhere it couldn't reach. Think of it like a closing procedure that tries to grab the keys to lock the tools cabinet, except the keys were locked inside a different room the whole time — so instead of a tidy "here's what went wrong, try this," the person just saw a confusing internal error message. This was caught while testing an unrelated fix and affected every kind of failure, not just one. Fixed by moving the cleanup tool somewhere both the "doing the work" step and the "something went wrong" step can actually reach it. A new automated check now runs a task through a guaranteed failure on purpose and confirms it gets back the real, readable explanation instead of a crash — so this exact class of bug can't silently return.

---

## The runtime program that customers install was silently missing all its parts — 2026-08-22
The tool that builds the small program customers run on their own computer (the one that talks to Claude and controls the browser) had a bug that made it skip an important instruction: "read the shopping list of ingredients before building." Without that instruction, the tool built the program using none of its ingredients — no browser-automation engine, no secure-password-storage engine, no zip-file engine, nothing — so the finished program would have crashed the instant a customer tried to run any real task on their machine, even though it looked fine sitting on the shelf. Think of it like a recipe card that got left in the drawer: the cook still baked something, just with none of the actual ingredients. Fixed by pointing the builder at its shopping list explicitly and locking the builder's own version in place, so a future update to the builder can't quietly cause this again. Also added a permanent check that catches this exact mistake automatically from now on, before a broken build can ever ship. Verified by building the real program and confirming, ingredient by ingredient, that all of them actually made it in this time — and that the program starts up and responds correctly.

---

## Two workflows that both touch the same outside website now wait their turn — 2026-08-22
After teaching the assistant to run several workflows at once (see the entry just below), a good follow-up question came up: what happens if two of those workflows are both making changes on the same website at the same time — say, one workflow updating a Render deployment while a second, unrelated workflow also updates something on Render? Running both at the exact same moment on a real website is genuinely risky: one workflow's change could silently overwrite the other's, or a website that's actively monitoring for "is this a bot doing two things at once" could get suspicious. Now the assistant automatically notices when two running workflows are about to touch the same outside website, and makes the second one wait its turn until the first one finishes — like a single-file line at a fitting room, rather than two people trying to use the same room simultaneously. The moment they're touching different websites (Render vs. an internal tool, for example), they still run fully side by side with no waiting at all. If a workflow ends up waiting too long, it fails with a clear message explaining what it was waiting for, instead of hanging silently forever. Verified with a live test that runs two workflows against the same fake website and confirms the second one visibly queues, then both finish successfully.

---

## The assistant no longer tells you to cancel someone else's workflow — 2026-08-22
People use the assistant across several chat windows at once — running an invoice workflow in one chat while a teammate runs a lead-creation workflow in another, on the same computer. Until now, the assistant could only track one running workflow at a time: the moment a second one started, it flatly refused and told the person to "cancel the current execution first" — which, if followed, would have stopped a completely different person's in-progress work without them knowing. Now the assistant can run up to five workflows at the same time, each tracked separately with its own ID, and a new status check lets anyone see every workflow currently running. Cancelling now requires naming which one to stop, so nobody can accidentally kill a stranger's job by following the assistant's own advice. Underneath, two related problems were fixed at the same time: a workflow that failed and paused (waiting for a person to fix a broken step) could have its saved progress silently thrown away if a completely unrelated workflow failed around the same time, and a long-running background workflow could have its browser window closed out from under it partway through, for no reason other than it had been open for a while. Verified with the full existing test suite (335 checks, all passing) plus new automated tests, including one that opens two real browser windows at once and confirms neither can see or interfere with the other.

---

## Fixed the crash that broke the automated test gate against host-v2.0.0 — 2026-08-22
The CI execution gate (which replays a real skill against the freshly built runtime) started failing with "Cannot find module '../package.json'" when loading the app layer. The cause: one small helper file (`host_bridge.js`) that reads the runtime's version number was checking for the version the host program provides, but *before* checking, it unconditionally tried to read it from a file on disk. In development that file exists one folder up — but on a customer machine (and in the gate), the app layer is loaded from its own versioned folder where that file simply isn't there, so the whole engine crashed at startup. Fix: the version lookup now checks the host-provided value first and only falls back to reading the disk file in standalone development mode, with a safe guard so a missing file can never crash startup again. Verified all three paths behave correctly (standalone dev, dev-version override, simulated host-exe run) and the invariant tests still pass.

---

## Double-checked the recent runtime rebuild for mistakes — 2026-08-22
Ran a full review over every change made since the last logged checkpoint — 112 files, the whole runtime engine reorganisation. It found one real problem and confirmed it had already been caught and fixed: the cloud build recipe was missing several engine files, which would have shipped a broken update to customers. Nothing new was broken. The only edit made was tidying two settings that had been accidentally squashed onto one line in a safety-check script, which made it hard to read but changed nothing about how it behaves. All build safety checks still pass.

---

## Dev and production runtime builds now run the exact same recipe — 2026-08-22
The two cloud build recipes (CI) and the two local build scripts had slowly drifted apart, and untangling them surfaced a real bug: the production app-update build was missing 9 internal files that the engine legitimately needs (they were split out of the main file during a recent refactor but never added to the build's shopping list). The next app update shipped through CI would have been dead on arrival — it would crash the moment a customer's machine loaded it. Everything now reads from one shared shopping list (`runtime/app-layer-files.json`): the CI release build, the local dev build, and even the automated test gates all stage exactly the same 40 files with exactly the same protection settings, so they physically can't disagree anymore. A new automatic checker runs before every build (both in CI and locally) and fails loudly if a file is ever added, removed, or referenced without updating that list — this exact "works on my machine, missing in production" mistake had already bitten twice before (the sync_errors crash, and now this). Bonus fixes along the way: the local host-build script now runs the same pre-build safety checks CI does (catching packaging-only breakage before you wait minutes for a build), can embed the manifest-verification key locally like CI does, and the previously completely broken local app-layer build script works again — verified end-to-end with a real 40-file build and all 335 tests passing.

---

## Stopped shipping a useless copy of the launcher inside every app update — 2026-08-22
The runtime has two layers: the "host" (a big program that rarely changes) and the "app layer" (a small ~60 KB update that ships often). The host contains its own built-in copy of `bootstrap.js` (the startup file), and nothing on a customer's machine ever uses a disk copy of it — but every app-layer release was still bundling an extra obfuscated copy of it anyway, purely out of habit from before the two-layer split existed. That dead weight is now removed: it's gone from the cloud build recipe (`build-runtime-app.yml`) and from the local build script (`build-app-local.ps1`), with comments explaining why it's intentionally absent. Nothing else changed — all 335 runtime tests still pass, and the update checks only ever look for `server.js`, so removing this file can't break anything.

---

## Full health check of the cloud dashboard's website code — 2026-08-22
Ran a deep review-only audit of the `conxa-cloud/frontend` codebase (four parallel investigation passes: UI components, marketing pages, app routes/API layer, and build configuration) and wrote up the findings in `conxa-cloud/frontend/REFACTOR-REPORT.md`. **No code was changed** — this is purely a report. The good news: the code is solid overall (strict typing, consistent data fetching, clean structure). The report flags one security gap (the API proxy currently forwards requests even when nobody is logged in — it should reject them), about 45 MB of unused 3D-graphics libraries that can be deleted, roughly 900 lines of dead code (unused components, functions, and leftover files), a lot of copy-pasted pieces that could be merged into shared building blocks (status badges exist in six different versions), an animation on the homepage that runs forever even when you scroll away or switch tabs (drains battery), and a 934 KB logo file that should be a few kilobytes. The report ends with a prioritized plan: quick wins first (deletions, CI checks, the proxy fix), then merging duplicates, then splitting oversized files.

---

## A guide explaining exactly what gets installed on customer computers — 2026-08-22
Created `docs/Skill-Pack-Contents.md`. It explains in plain language what actually lands on an end customer's machine inside the `~/.conxa/skill-packs/` folder, file by file: the company-level `pack.json` (list of skills, groups, where to download updates from), and per-skill files — `manifest.json` (version info, required inputs, tamper-checksums, "does the website still look right?" landmarks), `execution.json` (the recorded workflow as a step list with multiple ways to find each button so skills survive redesigns), `recovery.json` (backup hints for when a click fails), and `inputs.json` (what the user must fill in). It also clears up a common confusion: there is no `execution.js` or `recovery.js` in a skill pack — those are part of the separately-installed runtime engine; skill packs are pure data with zero code.

---

## Added a hands-on stress-test guide you can follow yourself — 2026-08-22
Created `docs/testing/STRESS-TEST-GUIDE.md`. It's a step-by-step manual testing playbook organized into 10 suites: simple sanity checks, big 100+ step workflows to prove the scale advantage, tricky element-finding cases (buttons with changing IDs, identical rows), deliberate break-it-after-compiling tests to show off self-healing, hard structural cases (iframes, popups, file uploads, canvas apps), slow-network and mid-run chaos tests, weird input values, update/sync checks, and billing limits. Every test now names a **real free practice website** with ready logins (SauceDemo checkout, ParaBank banking, OrangeHRM dashboard, Computer Database, the-internet.herokuapp.com, DemoQA, and more), so you can start clicking immediately without hunting for targets. Each test says exactly what to click, what "pass" looks like, what counts as a real bug versus a by-design safety stop, and what evidence (logs, screenshots) to save. It ends with a scorecard that turns your results into demo material for sales.

---

## The "Workflow plan" panel no longer comes up empty on a first compile — 2026-08-22
When you compiled a brand-new recording, the "Workflow plan" tab in the review screen was always blank, but recompiling the same workflow filled it in. Here's why: the plan is written by one AI call that runs at the very end of a compile. A first compile fires a burst of AI calls before it (describing each button, looking at screenshots), and on the free AI plans we use, that burst temporarily uses up everyone's turn — so by the time the plan's turn came, every AI key was resting, the call failed quietly, and the app saved an empty plan without telling anyone. On a recompile, the earlier work is remembered from last time, so the AI keys were free and the plan succeeded. Three fixes: the compiler now tries the plan call a second time after a short pause instead of giving up; successful plans are remembered locally so they're never paid for twice; and if the plan still can't be generated, the compile log now clearly says so (with the real reason) and tells you that recompiling later will usually fill it in, instead of failing silently.

---

## All pending work organized into clean, labeled commits — 2026-08-22
A batch of finished but uncommitted work (seat limits, admin access, the optional AI provider, the smarter compile behavior, the signup domain question, and the new folder look) had piled up as one big pile of changed files. It's now been sorted and saved into eight separate, clearly described checkpoints — one per change — so if anything ever needs to be reviewed, undone, or traced back later, each change can be looked at on its own instead of untangling one giant blob.

---

## Team seat limits are now actually enforced, not just displayed — 2026-08-22
Every pricing plan promises a certain number of team seats (Free gets 1, Starter 3, and so on), and the dashboard has always shown a "seats used" counter — but nothing ever stopped a team from going over that number. A workspace could invite as many people as it wanted through the normal "add teammate" screen, no matter what plan it was on, and the counter was just decoration. Now, the moment someone beyond the plan's seat limit tries to actually use the product for the first time, they get a clear "seat limit reached" message instead of getting in for free. People already using the account before the limit was hit are never kicked out or interrupted — this only stops brand-new over-the-limit teammates, and only from the moment this shipped forward.

## New workspaces are now asked for their company domain right at signup — 2026-08-22
Company domain (like "acme.com") is used to name the installer files a workspace builds for its own customers. Previously this was buried in a settings screen that most people never visited, so most workspaces never had one set and got a generic fallback name instead. Now it's asked for as one of the very first steps right after creating a workspace, so every company has this set from day one. This is just about *when* it's asked for — there's still no check that a company actually owns the domain they type in, that's tracked separately as future work.

---

## Added optional FreeLLMAPI support to the AI provider pool — 2026-08-22
Researched [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi), an open-source, self-hosted proxy that stacks the free tiers of ~28 AI providers (Google, Groq, Cerebras, NVIDIA, Mistral, OpenRouter and more — roughly 4 billion free tokens a month combined) behind one standard API endpoint. Our cloud already had the same "rotate across free providers" idea built in, so instead of replacing anything, FreeLLMAPI can now simply be switched on as one more provider in that pool: turn on `FREELLMAPI_ENABLED`, point it at wherever the proxy is running, and paste its single unified key. One key then unlocks all the free tiers configured inside it, with our existing rate-limit failover still in charge. It's off by default; setup steps are documented in `conxa-cloud/backend/ROUTER_SETUP.md` and `.env.example`. Important caveat captured alongside it: those upstream free tiers are meant for experimenting, not production customer traffic, so keep at least one direct paid-capable provider enabled as fallback.

## Compile no longer quietly downgrades to weaker element-finding when the AI is rate-limited — 2026-08-22
When compiling a workflow, the system asks an AI to "look" at a screenshot and describe where to click, so the app can still find that spot later even if the page changes. On the free AI keys we use, that request sometimes got rate-limited, and until now the compiler waited only 8 seconds before giving up and quietly switching to a weaker, text-only way of describing the spot — you'd only notice from a small warning buried in the compile log. Now it waits much longer (matching how long a rate limit actually lasts) so the real AI description usually succeeds anyway. If every AI key is still exhausted after that longer wait, compile now stops and tells you clearly by default, instead of silently shipping a weaker result. This is also a switch we can flip from the server settings without a code change: if we'd rather compiles keep going on the weaker fallback than block, we just turn one setting on. Like a print job that used to quietly print draft-quality when the good printer was busy — now it waits for the good printer by default, and only prints draft-quality if we've explicitly said that's OK.

## Admins can now actually grant paid plans manually — 2026-08-22
There was a hidden endpoint that lets us give any workspace a paid plan (Pro, Starter, etc.) without them paying — useful for demos, trials, and support fixes. The problem: in production it was impossible to use. The server's security gate demanded a normal user login token on every request, so the special admin key we use got rejected before it ever reached the endpoint. Now the security gate recognises the admin key and lets those requests through (each admin endpoint still checks the key itself). Added tests covering both cases. Once this is deployed, granting someone Pro for 30 days is just one command from our side.

## The credit add-on is now a ladder of four sizes instead of one — 2026-08-22
The Billing page's compile-credit add-on used to be a single pack (25 credits at ₹4,999/month). It's now four sizes so workspaces can buy closer to what they need: +20 compiles with 200k Human Edit tokens for ₹3,999/month, +50 with 500k for ₹9,999, +100 with 1M for ₹19,999, and +250 with 2.5M for ₹49,999. Every add-on now also tops up the Human Edit pool alongside the compile credits (the old 25-pack didn't). Each size is bought through the same checkout as before and can be cancelled independently; active packs show as "Active ×N" badges next to their row.
 - 2026-08-22

## Customers can now manage their own LLM key, credit add-on, and see their trial countdown — 2026-08-22
Three things the backend already supported but nobody could actually do from the dashboard are now self-serve. First, Enterprise customers can plug in their own Azure OpenAI key on the Settings page — compiles then run against the customer's own deployment instead of Conxa's shared pool, which unblocks security reviews at banks and similar companies (the key is stored encrypted and never shown again after saving). Second, the Billing page has a Compile Credit Add-On card: buy an extra pack of 25 credits per month through the normal checkout, or cancel it — cancellation now talks to Cashfree directly instead of requiring a support request. Third, workspaces on the free trial now see a banner at the top of every dashboard page showing how many days are left, turning red with an upgrade prompt once the trial ends.
 — 2026-08-22

## Shortened page descriptions and added an info icon - 2026-08-22
Page headers used to carry long sentences (the Fleet page description was especially wordy). Every page now shows just a short one-line description next to the title, plus a small (i) icon - hovering it reveals the full details in a tooltip. Done consistently across Dashboard, Skill Packages, Installer, Audit, Fleet, Team, Billing, and Settings.

## Fixed page titles getting cut off in the merged top bar - 2026-08-22
After merging the two top bars into one, long page descriptions (like the one on the Fleet page) were squeezing the page title, so Fleet showed as Fle... Titles now always show in full, and the description takes whatever room is left and fades/truncates instead.

## Merged the two top bars on the dashboard into one - 2026-08-22
On the cloud dashboard (and other pages), the right side of the screen used to show two stacked bars: one with the organisation switcher and profile picture, and below it another with the page title (Operations) and the time-range/refresh controls. These are now merged into a single bar - the page title, its description, the time-range/refresh buttons, the organisation switcher, and the profile picture all sit in one row. That row is now exactly the same height as the Kiran's Organisation Workspace header in the left sidebar, so everything lines up neatly across the top. On small screens (phones) the old separate top bar is still shown, since there is not room for everything in one row there.

## Published the Build Studio how-to guide on the public docs website — 2026-08-22
The plain-language guide added earlier today now lives on the actual public docs site (conxa.in/docs), not just inside the codebase where nobody outside the team could see it. It covers installing Build Studio, connecting the apps you automate, recording a task, reviewing and fixing it, and publishing it to your team, plus a troubleshooting table and FAQ. It shows up alongside the existing product docs and uses the same look and navigation as the rest of the docs site.
 — 2026-08-22

## Added a way to see every machine running Conxa's software — 2026-08-22
Two kinds of machines run Conxa: a small number of Build Studio computers at each customer company, and potentially thousands of end-user computers running the Company Agent that actually does the automation work. Build Studio machines already counted against a plan limit behind the scenes, but nobody could see or manage that list — that screen now exists in Settings. Company Agent machines were never limited (and still never will be — installing it on more computers is always free), but there was no way to see the whole fleet: which computer, whose account, what version, how recently it checked in. There's now a dedicated Fleet page showing all of that, with a way to flag a machine as revoked for security review (revoking never stops that machine from working — it only changes what shows on the dashboard).
 — 2026-08-22

## Fixed Build Studio forgetting your name and email after signing in — 2026-08-22
People were seeing "Unknown user" in the sidebar instead of their own name, sometimes right after installing and signing in. The cause: every time the app quietly renewed your login behind the scenes (something it does regularly to keep you signed in), it was throwing away your saved profile info and never asking for it again — like renewing a library card but the new one comes back blank. Now it keeps your profile info when it renews your login, and if it was already blank for you, it will look it up again the next time your login renews.
 — 2026-08-22

## Fixed Build Studio crashing right after install for some accounts — 2026-08-22
After installing and signing in, some people saw the whole screen break with an error message instead of the app loading. The app was trying to show the first letter of your email as your profile icon, but for some accounts the email wasn't available yet at that moment, and grabbing a letter from nothing crashed the page — like reaching into an empty box expecting something to be there. Now it falls back to your name's initial, or shows "Unknown user" instead of crashing.
 — 2026-08-22

## The company domain you type in Build Studio now also updates the Cloud Dashboard — 2026-08-21
Yesterday's change let someone type their company's domain into Build Studio when building an installer. That domain wasn't reaching Conxa Cloud, so installers built and hosted from the Cloud Dashboard for paying customers still didn't know the company's name — like updating the label on one box in a shipment but not the manifest. Now, whenever a domain is entered in Build Studio, it's also saved to the customer's account in the cloud, so both places name things the same way.
 — 2026-08-21

## Fixed skills failing instantly when run through the AI assistant — 2026-08-21
Running any recorded skill through the runtime that Claude Desktop and other AI assistants talk to failed right away with a confusing technical error, even though the exact same skill ran fine when tested inside Build Studio. Yesterday's cleanup of how accounts are filed internally missed one more spot — the piece of code that actually launches the browser and runs each skill was still asking for the old, now-empty piece of information instead of the new one, so it failed before a single step could run. That handoff now uses the right information. Skills run through the assistant again.
 — 2026-08-21

## Wrote down the point where Conxa comes full circle — 2026-08-21
The long-term plan described five stages ending at "help the company improve how it works" — but stopped there, as if that were the finish line. It isn't. The part of Conxa that understands how a company operates is also able to operate it, because it can already run the same automations everyone else runs. So the last stage feeds back into the first: it spots the process costing the most, and that becomes the next thing recorded and automated. Our product document now says this, along with three firm limits: it still runs entirely on the customer's own equipment; anything it decides to do at scale needs a named person to approve it, with a record of who; and it can recommend that a way of working should change, but it can never be the thing that decides.
 — 2026-08-21

## The installer now asks for your company's domain, and uses it everywhere it shows your name — 2026-08-21
When someone built an installer for a customer, the folder it installed to on that customer's computer showed a meaningless internal code instead of the company's name — like a shipping label with a warehouse bin number instead of the recipient's name. Build Installer now asks for the company's domain (e.g. "acme.com") and uses it both to name the installer file and to name the folder it installs to. Domain ownership isn't verified yet — that's coming later — so for now it's a plain text field, but everywhere a customer or support person looks, they'll see the company's real name instead of an internal ID.
 — 2026-08-21

## Settled the one rule that decides how Conxa grows — 2026-08-21
We had left several big questions open about the later stages of the product: where the work would run once a company wants thousands of jobs at once, and where the "understand my business" layer would live. All of them are now answered by a single rule — Conxa sends the software to wherever the customer's work and data already sit, and never pulls their data to us. So the scaling machinery runs on the customer's own machines, and the business-intelligence layer installs on their own infrastructure rather than ours, with the first version deliberately built to run on ordinary servers instead of requiring expensive specialist hardware. Two upshots matter commercially: we can still honestly tell a bank we have never held their business data, no matter how far they grow with us, and our promise never to charge per job survives every future stage. Two questions are still genuinely open and are written down as such rather than quietly assumed.
 — 2026-08-21

## Explained *why* our long-term plan has to happen in that order — 2026-08-21
Our product document laid out the three stages of where Conxa is going, but never said why they have to come in that sequence rather than any other. It does now: each stage pays for the next one. The first stage earns us customers, revenue, the operating data nobody else will have, and — the slowest one to build and the easiest to lose — the credibility to eventually have a much more senior conversation. It also names the trap plainly: a company will let software do the work while someone watches long before it will let software run unwatched at volume, and longer still before it will let software tell it how to run itself. That trust has to be earned in order, and rushing it costs more than waiting.
 — 2026-08-21

## Wrote down where Conxa is going long-term, and made room for people in our automations — 2026-08-21
Our main product document described what Conxa does today but not where it's headed. It now lays out the direction in three stages: first Conxa learns how a company already works and runs that work reliably, later it scales so thousands of jobs can run at once instead of one person doing them in a row, and eventually it understands the company well enough to answer questions like "where are we wasting the most time?" Only the first stage is what we're building now — the other two are clearly labelled as direction, not promises, and every unanswered question they raise is written down instead of glossed over. The one real change to what we're building today is that a workflow can now include points where a person genuinely has to approve something, make a judgement call, or step in — previously we treated any such moment as a reason to chop the workflow in half around the person, which meant turning away a lot of real business processes.
 — 2026-08-21

## Fixed "Build Installer" crashing with a missing-argument error — 2026-08-21
Clicking Build Installer in Build Studio failed immediately with a technical error instead of building anything. This was a leftover from yesterday's cleanup of how accounts are filed internally — one internal handoff still expected an old piece of information that nothing was sending anymore. Build Installer now works again.
 — 2026-08-21

## The empty "Default" folder is gone, and the Workflows top bars now read as a proper toolbar — 2026-08-21
Every workspace opened with an empty folder called "Default" that nobody asked for and nobody could delete — like a new filing cabinet that ships with one permanently glued-in, empty drawer. That folder is now hidden until something actually lives in it; it still quietly catches any automation that has no folder of its own, so nothing can ever get lost. Separately, the two strips across the top of the Workflows screen were fighting each other: the usage numbers sat in two large boxes that shouted "Unlimited" louder than anything else on the page. They're now compact chips on a single slim toolbar, with the full detail on hover, and the account area got a small avatar and a divider — the screen reads like business software instead of a demo.
 — 2026-08-21

## Simplified how a company's automations are organized behind the scenes — 2026-08-21
Every paying account used to have an extra, invisible layer in how its automations were filed away — as if each customer's filing cabinet had a second, redundant label taped over the real one. That extra label added complexity without giving anyone a feature they actually used, so it's been removed: an account's automations are now filed directly under the account itself, nothing else. This is a behind-the-scenes cleanup — the folders, downloads, and released versions you see in Build Studio and on the web dashboard look and behave the same, just with one less moving part underneath that could someday drift out of sync.
 — 2026-08-21

## Folder-shaped groups on the Cloud Skill Packages page

**What changed:** The Skill Packages page in the Conxa Cloud dashboard used to show groups as plain rectangles. It now shows them as folder-shaped cards, matching the Workflows page in Build Studio. Each "folder" has the little tab notch on top with the workflow count, the group name and icon, a preview list of the workflows inside (with a green dot for published ones), and a line at the bottom saying how many are published.

**Why:** Groups should look and feel the same everywhere, so people who use Build Studio instantly recognize the same layout in the cloud dashboard.

**Files touched:** conxa-cloud/frontend/src/SkillPackagesPage.tsx (new folder card UI), conxa-cloud/frontend/src/index.css (the CSS that draws the folder shape).

## Wrote a plain-English guide to how self-healing works (the 4 recovery tiers) - 2026-08-22

**What changed:** Added a new explainer document, `docs/recovery-tiers-explained.md`, that walks through what happens when an automation step can't find the thing it's supposed to click or fill in. In simple terms, with examples and a little technical detail: Tier 1 reads the error message and does the obvious fix (close a popup, scroll the button into view, wait for it to stop animating) - free and instant. Tier 2 tries finding the element other ways using backup identity info saved when the workflow was recorded - also free. Tiers 3 and 4 ask Claude for help: first by describing the goal plus a list of everything on the page, then by showing screenshots - these cost the customer's own Claude usage and add 10-15 seconds. It also explains the safety rules: login pages skip the ladder entirely, a "fixed" step must still pass its outcome check, and nothing is ever auto-published back into a released workflow without a human approving it.

**Why:** The full technical reference was dense and easy to misread. Anyone new to the codebase (or just curious how self-healing works) now has one friendly document to start from.

**Files touched:** docs/recovery-tiers-explained.md (new), FIX.md.

## Wrote a step-by-step manual testing guide for plan limits - 2026-08-22

**What changed:** Added a new document, `docs/Manual-Tier-Limit-Testing.md`, that explains in easy language how to manually check that every paid-plan limit actually works. It covers all four plans (Free, Starter, Pro, Enterprise) and every limit: monthly compile credits, AI editing tokens, how many computers can use the Studio, team member seats, how many workflows can stay published, the 30-day free trial running out, who is allowed to share installers outside the company, custom branding (Enterprise only), analytics dashboards and data history, using your own AI key, extra credit packs, and a way to double-check that the "off switches" for each limit are not left turned off.

**Why:** We enforce these limits in code, but nobody had written down how to prove by hand that each one blocks what it should. The guide gives copy-paste commands, the exact error message to expect when a limit trips, and common reasons a test might behave oddly.

**Files touched:** docs/Manual-Tier-Limit-Testing.md (new), FIX.md.

## 2026-08-22 — Production readiness manual testing guide
Added docs/testing/Production-Readiness-Manual-Testing.md — a simple step-by-step checklist for manually testing everything before going live: backend health, frontend, login and team roles, recording/compiling/building in Studio, publishing, installing on a clean machine, skill execution, recovery, billing, auto-updates, security spot checks, and a final go/no-go sign-off page.

## 2026-08-22
- Added a new P0 item (TEST-11) to TODO.md: run the full manual testing suite from docs/testing/ (long-chain workflows, stress tests, production readiness, tier limits). Before testing starts, LLM provider keys must be re-invoked and re-configured so tests don't fail on expired keys.

## 2026-08-22 - Synced cost model doc with PRD and real code pricing
**What changed:** Fixed `docs/cost_model.md` so its numbers match the PRD (section 11) and what the billing code actually enforces. The AI-editing token allowances still showed the old bigger numbers (1M/10M/50M) - corrected to 500K/2.5M/10M for Free/Starter/Pro. Some compilation cost examples still used old prices that contradicted the doc's own math - corrected them ($0.21 per fresh workflow, $0.04 per recompile, not $0.54/$0.11). The extra credit packs section described a "+25 pack for Rs 4,999" that doesn't exist - replaced with the real packs: +20 for Rs 3,999, +50 for Rs 9,999, +100 for Rs 19,999, +250 for Rs 49,999. The free plan was described as "capped at 1 install", but installs are unlimited on every tier including Free (per the PRD) - it's the build machine that is capped at 1. Added a row showing every paid plan can put a custom icon on the installer. Marked one old completed checklist item as superseded.

**Why:** The doc had drifted after the August 8 repricing; anyone planning margins or writing pricing copy from it would have used wrong numbers.

**Files touched:** docs/cost_model.md, FIX.md.

## 2026-08-22 - Added the missing Cashfree compile add-on settings to backend env files
**What changed:** The four new compile add-on packs (+20/+50/+100/+250 compiles per month) each need their own Cashfree plan ID in the backend's environment settings. The main .env.example already listed them, but the dev template (.env.dev.example), the actual dev file (.env.dev), and the production template (.env.prod.example) were still missing all four lines (CASHFREE_ADDON_20_PLAN_ID through CASHFREE_ADDON_250_PLAN_ID). Added them right under the existing Starter/Pro plan IDs, with a short comment explaining what the packs are and how much they cost. Also noted in the dev files that they stay blank unless you create sandbox test plans.

**Why:** Without these lines in prod, buying an add-on pack from the Billing page would fail with a "plan ID not configured" error even though everything else is set up. The templates are also the checklist for what production needs.

**Files touched:** conxa-cloud/backend/.env.dev.example, conxa-cloud/backend/.env.dev, conxa-cloud/backend/.env.prod.example, FIX.md.

## 2026-08-22 - Added future-horizon revenue projections to the cost model
**What changed:** Added a new section to `docs/cost_model.md` called "Future Horizons - Revenue Projections & Cost Posture", taken from the PRD's long-term direction (sections 11 and 14). It explains in planning terms how pricing extends beyond today's plans: Horizon 2 (Scale) would add concurrency capacity and a cheaper "review-resolver" seat type, with execution workers running on customer machines so our costs stay near zero; Horizon 3 (Understand and Optimise) would charge for how much of a company is instrumented, running on customer infrastructure so we never pay for data warehouses or GPUs. It also covers what each stage earns for the next one, the two still-unanswered questions that block pricing any of it, and clear guidance: don't put these future numbers into real forecasts until they are officially decided.

**Why:** The cost doc only described today's product. Anyone doing financial planning or fundraising needed to see where revenue comes from next and why the zero-cost-per-run promise survives growth.

**Files touched:** docs/cost_model.md, FIX.md.

## 2026-08-22 - Read-only refactor audit of the cloud backend (no code changed)
**What was done:** Audited conxa-cloud/backend and its tests before any future refactor work. Key findings: (1) The old Phase 4 report's failed config.py split taught that tests depend on ONE shared settings object - don't try to split it into separate copies again. (2) Test suite is currently healthy: 885 passed, 1 real failure (	est_entitlements.py::test_addon_packs_stack_credits_and_human_edit_tokens - add-on credit stacking returns 200 instead of 290, likely broken by the four-tier add-on ladder change). (3) Several backend modules have zero test coverage: rbac.py, jobs.py/job_routes.py, machine_binding.py, product_ownership.py, workflow_routes.py, main.py startup validation. (4) Dependencies use loose minimum-version pins (no lockfile) so builds aren't fully reproducible. (5) Busiest backend files are publish_routes, skillpack_update_routes, updates_routes, saas.py - refactor those last.

**Why:** To have a clear picture of what's safe to touch and what needs test coverage first, before anyone starts refactoring the cloud backend.

**Files touched:** FIX.md only (read-only audit).

## 2026-08-22 - Report on the shared conxa-core package (no code changed)
**What was done:** Wrote a plain-language report (docs/conxa-core-split-report.md) answering whether packages/conxa-core should be split between the apps. Key findings: only two apps actually use it (Build Studio and Cloud backend) - the Node runtime never imports it. Most of what's left in it genuinely must stay shared (the data models, the database layer, the LLM router seam). A few storage modules could move to the Studio, but there's no good reason yet. The big config file could be split one day, but a previous attempt failed and doing it properly means touching ~50 files - documented as a future project. Also flagged that runtime data is piling up inside the package's own folder, which should be cleaned up separately.

**Why:** The question keeps coming up ("why is this shared?"), and now there's a written answer with evidence so nobody re-attempts the known-bad config split or breaks the Studio/Cloud contract by copying models.

**Files touched:** docs/conxa-core-split-report.md, FIX.md.

## 2026-08-22 - Full refactor audit report for the cloud backend (no code changed)
**What was done:** Spawned 4 parallel audit agents over conxa-cloud/backend and wrote the full plain-language report to REFACTOR_AUDIT_backend.md. Headline findings: (1) three probable real bugs - Cashfree webhooks may be blocked by the auth middleware in production, the subscriptions webhook signature check passes when no signature is sent, and the workflows/generations endpoint returns 404 because another route shadows it. (2) Two separate systems count LLM token usage with different rules, so billing answers can disagree. (3) Route files borrow each other's private helper functions, so refactoring one file can silently break others. (4) Magic strings (storage keys, plan names, release statuses) are copy-pasted across many files. (5) One billing test is currently failing, and a few modules have zero test coverage, so those need tests before any refactor. The report ends with a prioritised action list: fix the bugs first, then do the small high-value cleanups (one error handler, shared constants, single usage counter), then bigger file splits later.

**Why:** To give anyone planning backend work a single trusted map of what is safe to change, what is broken, and what order to do it in.

**Files touched:** REFACTOR_AUDIT_backend.md, FIX.md only (read-only audit).

## 2026-08-22 — Refactor audit of conxa-builder (report only, no code changed)
We ran a full health-check of the Build Studio code (the desktop app that records and compiles workflows) and saved the findings in conxa-builder/REFACTOR-AUDIT.md. Four review areas were checked: the Python backend that talks to the UI, the compiler that turns recordings into skills, the packaging/storage/editor parts, and the Electron interface itself. The main issues found: one part of the backend swaps a shared AI connection per request which could mix up billing between tasks; a few very large files doing too many jobs (a 1,600-line compiler file and two huge UI screens); a lot of copy-pasted error handling; and about 1,400 lines of leftover code that nothing uses anymore. The report lists everything with exact file locations and a suggested order for fixing it, starting with quick safety fixes and dead-code removal. No actual code was changed yet.

## 2026-08-22 - Refactor audit of the runtime folder (report only, no code changed)
**What was done:** Ran 5 parallel review passes over the runtime/ folder (the MCP server that runs skills on customer machines) and saved the full plain-language report to runtime-refactor-audit.md. Headline findings: (1) the "host exe is just two files" claim is wrong - about 13 more files are secretly frozen into it with no list and no CI check, so casual edits become hidden host-release changes; (2) one install-time path skips the version-compatibility check entirely; (3) dev-vs-prod path settings are re-derived in several files that can quietly disagree; (4) the two biggest files (run.js ~1,800 lines, server.js ~1,600 lines) each do five jobs at once and server.js has zero unit tests. On the bright side: no circular dependencies, the element-resolver is exemplary, and the CI replay gate is strong. The report ends with a phased fix plan - add safety tests first, then small correctness fixes, then split the big files.

**Why:** Same reason as the backend/builder audits - a single trusted map of what is safe to change in runtime/, so refactoring does not break the host/app update boundary or the recovery guarantees.

**Files touched:** runtime-refactor-audit.md, FIX.md only (read-only audit).

## 2026-08-22 - Compile add-on packs changed from monthly subscriptions to one-time purchases
**What changed:** The extra compile credit packs (+20/+50/+100/+250) used to work like small monthly subscriptions - you paid every month until you cancelled. Now they are one-time purchases: pay once, and the credits land in a "wallet" that never expires. The system only dips into this wallet after your plan's normal monthly allowance runs out, so nothing about your regular plan changes. The Billing page now shows your wallet balance instead of "Active x2"-style badges, the Cancel buttons for add-ons are gone (nothing to cancel - you already paid), and buying redirects to a Cashfree payment page and credits automatically when you come back. Because one-time payments don't use Cashfree "plans" at all, the four CASHFREE_ADDON_*_PLAN_ID settings were removed from every env file - Starter and Pro subscriptions keep theirs.

**Why:** Add-ons were always meant to be one-time top-ups, not recurring charges. This also removes setup friction: production now needs just the two base plan IDs plus the Cashfree keys.

**Files touched:** conxa-cloud/backend/app/api/cashfree_routes.py, conxa-cloud/backend/app/services/entitlements.py, packages/conxa-core/conxa_core/config.py, conxa-cloud/backend/.env(.example/.dev/.dev.example/.prod.example), conxa-cloud/frontend/src/BillingPage.tsx, conxa-cloud/frontend/src/api/cashfreeApi.ts, conxa-cloud/frontend/src/api/productApi.ts, conxa-cloud/tests/test_entitlements.py, docs/TRD.md, docs/Backend-Schema.md, docs/cost_model.md, FIX.md.

## Edge-case audit (full codebase)

Ran parallel audits of every subsystem and wrote all findings to a new file: EDGE_CASES.md.
It lists ~230 edge cases in plain language — what breaks, where the code is, how bad, how likely. Highlights:

- Two critical security holes: payment webhooks can be forged if the signature header is simply left out, and one company can overwrite another company's installer download.
- The recorder silently drops common actions (clicks on plain divs, scrolling inside panels, dragging) so recorded workflows are missing steps without warning.
- Typed secrets like card numbers and API keys can be saved in plain text during recording.
- Many places write files in a way that can corrupt data if two things run at once or the power goes out.
- The runtime's self-check after updates doesn't actually check anything, so broken updates can slip through.

No code was changed — this was an audit only.


## 2026-08-22 - Implemented the runtime refactor plan (safety nets, correctness fixes, file splits)

**What changed:** Turned the earlier runtime audit report into actual code changes, phase by phase, without changing how anything behaves for users.

Phase 0 - safety nets first: The version-compatibility check that decides whether the app can load (the min_host gate) is now its own small, pure module with 9 unit tests - it previously had zero tests. The most important constant in element-finding (the uniqueness margin of 0.15) is now pinned by a test so nobody can quietly weaken it. Tests are reorganized: offline unit tests live in test/unit/ and run with `npm test`; scripts needing a real browser or the packaged exe live in test/e2e/ and run only in their own CI steps. A previously manual-only recovery-ceiling check is now wired into CI.

Phase 1 - small correctness fixes: All files now read dev-vs-prod folder settings from one shared source instead of each re-deriving them (which could silently disagree). The install-time skill sync now runs the same version-compatibility check as normal startup, so an incompatible app layer can't execute against an old host during installation. Removed two pieces of dead code, including a status field that reported a file nothing writes anymore. Two near-identical download/upload helper pairs were merged into one shared implementation. A new build guard fails CI if a package dependency is missing from the packaging stub list (a silent packaged-exe-only breakage class).

Phase 2 - make the invisible boundary visible: A new host-manifest.json lists every file frozen into the host exe, with a CI check that verifies the list matches reality - so edits to frozen files are now visible at review time. A new host_bridge.js replaces the half-dozen different hand-rolled patterns for reaching host-provided globals with one tested access point.

Phase 3 - split the giant files (partially): From server.js: the --install-playwright installer mode, the parked-page recovery state, the failure-message builder (now unit-tested), and the static MCP tool definitions. From run.js: environment-tunable constants, the recovery log, and input interpolation. The public exports of both files are unchanged, so everything that imports them still works.

Phase 4 - polish: A new mechanical CI guard proves the zero-token recovery tiers can never touch the network. The skill loader got a real validation test suite (7 tests) covering broken packs, checksum mismatches, and hot reload. A dead test script with a hardcoded machine path was deleted.

All 335 unit tests pass; all three new CI guards pass locally. Docs updated (TRD.md runtime sections, TODO.md entry RT-REFACTOR-1). Remaining follow-ups (browser.js split, full server.js orchestrator extraction, mcp_register unification) are tracked in TODO.md. Note: changes to files frozen into the host exe ship with the next host release; the rest ship with the next app-layer release.

**Why:** To close the gaps found in the audit - untested safety checks, hidden host-release coupling, duplicated logic that could drift, and two monolith files - without breaking any existing behavior.

**Files touched:** runtime/ (new: min_host_gate.js, host_bridge.js, cli_installer.js, recovery_park.js, failure_response.js, tool_defs.js, run_config.js, recovery_log.js, interpolate.js, host-manifest.json, check_host_manifest.js, check_pkg_stubs.js, check_recovery_purity.js, test/unit/test_min_host_gate.js, test/unit/test_invariants.js, test/unit/test_failure_response.js, test/unit/test_skill_loader.js; modified: bootstrap.js, server.js, run.js, browser.js, sync.js, auth_manager.js, manifest_manager.js, http_client.js, cli_sync.js, config_edit.js, config_edit_yaml.js, resolver.js, package.json; moved: test suite into unit/ and e2e/; deleted: test/e2e/test_mcp_client.js), .github/workflows/build-runtime-host.yml, .github/workflows/build-runtime-app.yml, docs/TRD.md, TODO.md, FIX.md.

## Committed all pending non-runtime work in labeled commits - 2026-08-22
The finished-but-uncommitted work was sorted and saved into five clearly described checkpoints: (1) compile add-on packs became one-time wallet purchases across backend, frontend, env templates, tests, and billing docs, with the TRD split so only its billing sections were committed; (2) a compiler fix so the "Workflow plan" panel fills in on first compiles; (3) three new manual testing guides under docs/testing/; (4) archived audit reports and edge-case/skill-pack explainers under docs/archive/; (5) FIX.md/TODO.md log updates. The runtime folder refactor (runtime/ code, its test restructure, both runtime CI workflows, and the three runtime-related TRD paragraphs) was deliberately left uncommitted for now.


## 2026-08-22 - Runtime sources split into host/ and app/ folders (release boundary made physical)

**What changed:** The runtime code used to sit as one flat pile of ~50 JS files, and the only way to know which ones were frozen into the host exe was to read a JSON manifest. Now there are two visible folders: `runtime/host/` holds the nine exe-frozen files (bootstrap, pkg stubs, MCP registration + its TOML/YAML editors, install-time sync, version gate) - if you change anything here, you must ship a new `host-vX.Y.Z` release. `runtime/app/` holds everything that ships in the frequently-updated app layer (`app-vX.Y.Z`). A few app files are also baked into the exe (shared helpers like env/http_client/version_manager); those are called out in host-manifest.json so their edits still count as host changes.

This lands alongside the finished run.js decomposition: run.js went from ~1,790 lines to a ~300-line orchestrator with the engine split into ten focused modules behind an unchanged public API. Three test regressions from that split were caught and fixed immediately by the existing suite. All build scripts, CI workflows, gate fixtures, guard scripts, and every require path were updated for the folders; the deployed layout on customer machines is unchanged (still flat), so nothing about installs or updates moves.

All 335 unit tests pass; all three CI guards pass; every file syntax-checks.

**Why:** So any human can tell at a glance which folder a change belongs to and which release train it rides - no more hidden host-release coupling from casual edits.

**Files touched:** runtime/host/* (9 moved files), runtime/app/* (39 moved/new files), runtime/check_host_manifest.js, runtime/check_pkg_stubs.js, runtime/host-manifest.json, runtime/package.json, .github/workflows/build-runtime-host.yml, .github/workflows/build-runtime-app.yml, AGENTS.md, docs/TRD.md, TODO.md, FIX.md.

## 2026-08-22 - Added P0 item: run multiple workflows at the same time reliably

**What changed:** Added a new top-priority (P0) backlog item to TODO.md called RT-3. The idea: today a customer can ask their AI assistant to run a workflow from chat window 1, then another from chat 2, another from chat 3 - or ask for several workflows to run side-by-side in one conversation. But the runtime was built assuming one workflow runs at a time on a machine, so running several at once could make them crash into each other (shared browser, shared folders, shared recovery state). The new item says: check what actually breaks today when two workflows run at once, then fix it so parallel runs are dependable - whether that means truly running them together or honestly lining them up one after another with clear status reporting.

The dashboard counts at the top of TODO.md were updated to match (one more open item).

**Why:** Running several automations without taking turns is a basic expectation for real users and paying customers; if it silently breaks it looks like random flakiness.

**Files touched:** TODO.md, FIX.md.


## 2026-08-22 - Closed the last two runtime-refactor follow-ups (register orchestrators + marker-block editing)

**What changed:** Two final cleanups from the runtime refactor audit, both in the code that registers Conxa into AI-agent config files:

1. The register/uninstall command used to have three almost-identical copies of the same orchestration code - one for JSON-style agent configs (Claude, Cursor, VS Code, ...), one for TOML files (Codex, Vibe), and one for YAML files (Goose, Hermes). Now the differences (which hosts, which files, how to write an entry) are declared as three small adapter tables, and one shared runner owns everything they used to duplicate: detection checks, --only filtering, multi-file handling, result shapes, and error counting. Same output, same exit codes, ~90 fewer duplicated lines.

2. Two modules each carried their own copy of the "edit only our marked block inside a customer's file" logic (~35 lines x 2) - one for TOML configs, one for the AGENTS.md-style discoverability notes. Both now call a single shared module (marker_span.js). The existing test suite immediately earned its keep here: a first draft read the config file twice where the original read it once, which weakened the "file changed underneath us" protection - a test caught it, and the fix routes the foreign-entry check through that single shared read.

All 335 unit tests pass; all three CI guards pass. The shared editor module is correctly registered as dual-shipped (frozen into the exe AND shipped in the app layer), so host-manifest.json now lists 17 modules.

**Why:** These were the last two duplication hotspots from the audit - copy-pasted control flow that could silently drift apart between config formats.

**Files touched:** runtime/host/mcp_register.js, runtime/host/config_edit_toml.js, runtime/app/durable_context.js, runtime/app/marker_span.js (new), runtime/host-manifest.json, .github/workflows/build-runtime-app.yml, runtime/test/e2e/gate_replay.js, runtime/test/e2e/gate_recovery_ceiling.js, TODO.md, FIX.md.


## 2026-08-22 - Removed the recovery-ceiling gate from the app release pipeline

**What changed:** The "Recovery ceiling gate" step was removed from the app-layer release workflow (.github/workflows/build-runtime-app.yml). This step used to double-check, on every release, that when recovery is capped at Tier 2 a workflow fails cleanly instead of secretly calling AI helpers. The safety promise itself is unchanged: the earlier automated check (check_recovery_purity.js) that makes sure low-tier recovery can never touch the network or spend AI tokens still runs on every build, so nothing is being skipped that isn't already covered.

**Why:** One less slow browser-based check per release; the invariant it tested is still machine-enforced by the purity guard earlier in the same pipeline.

**Files touched:** .github/workflows/build-runtime-app.yml, FIX.md.

## 2026-08-23 - Added a to-do: workflow checks on the Workflows page should run in parallel

**What changed:** No code changes. Added a new backlog item (BUILD-20) to TODO.md describing a problem on the Build Studio Workflows page: when you start a check (test run) on one workflow and then click check on another, the first check gets cancelled. The user wants checks to run in parallel instead of one-at-a-time. Also updated the progress-count table at the top of TODO.md.

**Why:** Capturing the reported problem so it gets fixed rather than forgotten. The fix itself is still open work.

**Files touched:** TODO.md, FIX.md.

## 2026-08-23 - Fixed two cloud issues from the backlog (CLOUD-19 and CLOUD-20)

**What changed:** Two small cloud fixes. (1) CLOUD-19: the backend start script now tells the web server to keep idle connections open for 75 seconds instead of the default 5. This stops a known problem where Render's proxy tries to reuse a connection the server just closed, which showed up as random "502 Bad Gateway" errors for users with nothing in the server logs. (2) CLOUD-20: usage metering used to count a picture's raw file data as if it were text, so one image was billed as roughly 20,000-50,000 tokens when it really costs about 1,000. Now images are billed at a fair fixed ~1,000 tokens each, so monthly quotas reflect real usage instead of filling up on padding.

**Why:** Both were found during the earlier 502 investigation and left out of that fix's scope. The first makes the service less flaky; the second stops customers' AI budgets from being eaten by an accounting mistake.

**Files touched:** conxa-cloud/backend/start.sh, conxa-cloud/backend/app/services/llm_metering.py, conxa-cloud/tests/test_llm_proxy_and_publish.py, TODO.md, FIX.md.

## 2026-08-23 - Fixed: "Go to URL" steps in Human Edit no longer show the Pick Element screen

**What changed:** When you add a Navigate (go to a website) step in Human Edit and click on it, it used to open the 3-step wizard that starts with "Pick element" - but there is no element to pick on a go-to step, so you were stuck. Now go-to steps open a simple editor instead, just like scroll steps: you can edit the step name and the URL, and the URL must start with http:// or https:// before it saves. The Validation panel is right there too, so you can add checks for the step.

**Why:** A navigation step has nothing to click on, so asking to pick an element made no sense and blocked editing the URL.

**Files touched:** conxa-builder/electron/renderer/src/components/retarget/InlineRetargetFlow.tsx, FIX.md.

## 2026-08-23 - New: you can now record over a workflow's old recording, and the old one is kept safe

**What changed:** Before, once a workflow was recorded, its "Record" button was locked forever - the only way to try again was to delete the workflow and start over. Now the Record button stays clickable. If a recording already exists, clicking it first asks "Re-record?" with an explanation. If you go ahead, the previous recording (its saved steps, screenshots, and page snapshots) is copied into a backup folder on disk (`data/backups/recordings/...`, stamped with date and time) before the new recording takes its place. The new recording then becomes the workflow's recording everywhere automatically - compiling, recompiling, and testing all use the newest take. The old copy stays on disk in case you need to go back, and even if backing up fails, the re-record still goes ahead rather than blocking you.

**Why:** Recording mistakes were punishing: there was no undo and no second chance, so one bad take meant rebuilding the whole workflow from scratch.

**Files touched:** conxa-builder/python/handlers/session.py, conxa-builder/electron/renderer/src/components/StagePath.tsx, conxa-builder/electron/renderer/src/pages/GroupPage.tsx, docs/App-Flow.md, FIX.md.

## 2026-08-25 - Changed: "Ready to Package" now stays amber until the skill is actually published

**What changed:** On the group page, a workflow's last lifecycle step ("Ready to Package") used to turn green as soon as its test passed. Now it turns amber/orange after the test passes and only turns green once that skill has actually been published (a release uploaded to Conxa Cloud). The amber node is still clickable and takes you to the Publish page.

**Why:** Green meant "done", but the job isn't done until the skill is shipped - amber says "tested and ready, go publish it".

**Files touched:** conxa-builder/electron/renderer/src/components/StagePath.tsx, conxa-builder/electron/renderer/src/pages/GroupPage.tsx, FIX.md.

## 2026-08-25 - Homepage hero headline update
Changed the homepage hero headline from 'Do the process once. Your AI does it from then on.' to 'Teach AI Once. Let It Execute The Workflow Forever.' in Hero.tsx.

## 2026-08-25 — Pricing section no longer depends on the backend
- Problem: The homepage/pricing cards showed "Pricing is temporarily unavailable" whenever the backend plans endpoint failed.
- Fix: The pricing table on the marketing pages now uses its own built-in copy of the four tiers (Free, Starter, Pro, Enterprise) with the same prices and features the backend defines. No network call needed, so pricing always shows.
- Note: If plan prices or features ever change in the backend, the static table in PricingTable.tsx must be updated to match.

## 2026-08-25 - Homepage comparison table rewritten in plain business language
- Problem: The "how we compare" table on the homepage was too technical. It listed engineering features (no code, deterministic runs, etc.) instead of answering the questions a company actually asks when deciding to buy.
- Fix: Replaced the technical checklist with seven plain-language questions: How fast do we see value? Who on our team can maintain it? What happens when a screen changes? Can we trust the output? What does it really cost us? Does it work with our legacy tools? Can we productise it for our customers?
- Also merged "browser scripts" into "in-house engineering" so there are fewer columns and it reads easier, especially on phones.
- The honest "beats us at" notes under each competitor were kept, because admitting where alternatives win makes the rest of the table believable.
- File touched: conxa-cloud/frontend/src/components/marketing/sections/Comparison.tsx

## 2026-08-25 - Comparison table axes swapped
- Changed: The homepage comparison table now reads the other way around. The questions (How fast do we see value? etc.) run down the left side as rows, and the five approaches (Conxa, Traditional RPA, Integration platforms, In-house engineering, Generic AI browser agents) sit across the top as columns.
- Why: Easier to compare one competitor against Conxa in a single column scan instead of jumping across a row.
- File touched: conxa-cloud/frontend/src/components/marketing/sections/Comparison.tsx

## 2026-08-25 - New harder test plan for Conxa (EXEC-11)
- Added docs/testing/exec-11-hard-mode-real-world.md, a "hard mode" test plan that goes beyond the older exec-10 workflows.
- It covers 12 tougher scenarios: pages that rewrite themselves while a skill runs, elements that only appear after scrolling/waiting, logins expiring mid-run, replaying with different data than recorded, removing the right item after the list changes twice, chaining two skills' data, two skills running at once on the same and different sites, an overnight endurance run with a failure injected mid-way, deep iframe hopping, and honest-failure checks for canvas apps and CAPTCHAs.
- Each workflow lists exact steps, free sites or a ready-to-use local HTML fixture, what pass and fail look like, and where to report findings (TODO.md).

## The marketing homepage got a readability and tidy-up pass - 2026-08-25
A design audit of the conxa.in homepage found ten usability issues, and this change fixes them all. In plain terms: the page used lots of slightly-different font sizes (including some too small to read comfortably), too many slightly-different shades of text grey and accent colour, and too many slightly-different corner roundings on boxes — each on its own is invisible, but together they make the page feel less polished. All of those now come from one small shared set: text sits at a consistent ladder of sizes with nothing smaller than 12px (this also fixes the two flagged spots: the screenshot caption in the "Four steps" section and the "checks passed" line in the reliability walkthrough), text colours collapse to the site's core palette, and box corners use just three roundings plus circles. Two layout issues were fixed as well: the step labels beside the big screenshots in "Four steps" now get breathing room so they visually match the size of the picture next to them, and the "what this is worth in your numbers" summary at the end of the Examples section now sits in its own solid card with extra space above it, instead of blending into the card grid. Each example card was simplified — the buyer line and the system-chain line merged into one quiet line, with a thin divider before the main story, so cards scan faster. The biggest fix: because the homepage is very long, pricing and FAQs used to be buried; there is now a slim sticky section bar (Demo / How it works / Examples / Reliability / Security / Pricing / FAQ) that stays visible under the top menu as you scroll, and clicking any section name jumps you straight there without the heading hiding under the menus. The top menu's "Pricing" link now takes you to the pricing section on the homepage rather than a separate page.

---

## 2026-08-25 - EXEC-11 collapsed into one mega-workflow runbook
- Added docs/testing/exec-11-mega-workflow.md: all 12 hard-mode tests combined into a single ~60-step recording (6 sites, 4 tabs) plus a numbered, do-this-by-hand replay gauntlet.
- Phase 0 = manual setup (local self-mutating test page, demo accounts, evidence tailing). Phase 1 = the exact recording order across the mutator page, scroll-load, iframes, cart removal, search and database lookup. Phase 3 = 8 replays that turn the one skill into every original test: clean pass, different data, throttled timeouts, mid-run logout sabotage, two simultaneous runs on same/different platforms with cancel, canvas + CAPTCHA refusal checks, and an overnight 20-run loop with a failure injected at run 7.

## The homepage now has one navigation bar instead of two - 2026-08-25
Last round we added a slim sticky bar of section shortcuts under the top menu to make buried pricing and FAQs easier to reach - but that left two stacked navigation bars doing overlapping jobs, with four links appearing in both. They are now merged into a single fixed top bar: the section shortcuts (How it works, Examples, Security, Pricing, FAQ) live directly in the main menu alongside Docs, Sign in, and Get started, and the separate sticky strip is gone entirely. As you scroll the homepage, the menu quietly highlights which section you are currently reading, so it still doubles as a you-are-here guide. Clicking any section name jumps you to it, with headings landing neatly below the single bar instead of leaving a leftover gap sized for two bars.

---

## 2026-08-25 - Added governance-enforcement item (PROD-18) and hard-mode testing item (TEST-12) to TODO.md
- PROD-18 (P2, Product Strategy): the governance *enforcement* layer. Conxa already records an audit trail of every run and build; this item covers the three things audit visibility alone does not give enterprise buyers: (1) tamper-resistant run evidence - per-run receipts and server-side checks so a run's traces cannot quietly vanish with local logs; (2) pre-action policy gates - compile-time rules like "pause for approval before this step" or "never run payroll skills outside work hours", enforced by the runtime before clicking, not just recorded afterwards; (3) a compliance-posture document mapping all of it to what SOC2 / finance / HR procurement asks. Deliberately reuses EXEC-21's approval-pause mechanism and PROD-3's danger labels instead of duplicating them.
- TEST-12 (P0, Testing & Cleanup): execute the two new hard-mode test docs end to end (the 12-workflow suite plus its single mega-recording collapse), file every failure per their mapping table.
- Recreated docs/testing/exec-11-hard-mode-real-world.md after it went missing from disk, now pointing findings at TEST-12/PROD-18 instead of the retired EXEC-11 backlog ID; fixed the same stale reference in exec-11-mega-workflow.md. Dashboard counts updated (93 remaining of 116).

## 2026-08-25 - Hard-mode testing consolidated into one self-contained document
- Removed docs/testing/exec-11-hard-mode-real-world.md entirely. The single runbook, docs/testing/exec-11-mega-workflow.md, is now fully self-contained: it explains what each part of the workflow tests (selector durability, dynamic data, concurrency, iframe handling, boundary refusals), includes the ready-to-paste self-mutating test page source inline, and has its own failure-routing rules at the end (wrong-row removal goes straight to PROD-3, evidence gaps to PROD-18, everything else to TEST-12).
- Updated TODO.md TEST-12 to point only at the mega-workflow doc and restate its pass criteria.

## 2026-08-25 - New test workflow for conditional pop-up handling (EXEC-1)
- Added "Workflow 8" to docs/testing/exec-10-long-chain-workflows.md: one recorded skill that tests all three branch step types - try_dismiss, if_present, and wait_for_one_of.
- It uses only the-internet.herokuapp.com (free, no login): a pop-up ad that appears sometimes tests the "close it if it's there, ignore it if not" steps, and the login page's success/failure messages test the "wait for whichever message shows up" step.
- The doc walks through four stages: recording (with a warning not to record Logout), building the branches in Human Edit (where branch steps are actually created - the recorder only suggests them), building the skill pack (with a required-runtime setting that must be set by hand for now), and three replays: pop-up appears, pop-up doesn't appear, wrong password.
- Also included: an optional bonus leg with truly random outcomes, four adversarial variants (unmatchable candidates, broken nested body, required-timeout, old runtime silently skipping), what each outcome proves, and where to log failures (reopen TODO.md EXEC-1).

---

## Explained how the Workflow Plan in Human Edit is created - 2026-08-25
No code change. Traced the flow: during compile, one final LLM call (workflow_intent task) receives a compact summary of every recorded step (action, target text, page URL, per-step intent hint) plus the list of visited page URLs, and returns JSON with goal, per-step intents with verification anchors, decision points, and expected end state. That result is cached locally so recompiles reuse it, saved on the workflow as intent_graph, and shown read-only in Human Edit's Workflow Plan panel.

## 2026-08-25 - Added AV-5 test: pop-up shows up at replay even though it was never recorded
- Extended Workflow 8's adversarial variants in docs/testing/exec-10-long-chain-workflows.md with AV-5, the reverse of the other cases: the recording never saw a pop-up (so no branch step exists anywhere), but one appears anyway when the skill replays.
- The doc explains how to stage it (record only the login on a profile where the pop-up already showed, then replay on a cleared profile so the pop-up appears mid-run) and what to watch: today there is no automatic "look for surprise pop-ups" check - the runtime only reacts after a click actually fails, tries exactly one Escape keypress at zero cost, and if that does not close it, it burns paid AI recovery or fails.
- It also documents the designed fix: add a try_dismiss step by hand in Human Edit and republish, after which the run passes whether the pop-up shows up or not. The idea of the runtime automatically trying known dismissal patterns is already tracked in TODO.md under EXEC-5.
- Failure routing added: wrong-tier escalation goes to EXEC-1; the one-Escape-only limitation itself is documented as EXEC-5's known gap, not a bug.

---

## The Workflow Plan and each step's intent now come from one AI call - 2026-08-25
Previously two separate AI passes decided intents during a compile: one call per step produced the short machine label shown on each step in Human Edit, and a single end-of-compile call wrote its own different step descriptions for the Workflow plan panel - so the two views could disagree. Now the single workflow-plan call runs FIRST and produces both forms for every step (the machine token and the readable sentence). That means: the plan and the steps always tell the same story, compiles make about N fewer AI calls (one call instead of one-per-step plus one), and if that one call fails the old per-step behavior kicks in exactly as before, so nothing gets worse on a bad day. Old cached plans are ignored safely (they lack tokens), and all 927 existing tests still pass.

## 2026-08-25 - The runtime now knows famous pop-up buttons (and remembers what works on each site)
- Two new runtime files: app/dismiss_patterns.js (a short, fixed list of accept/close buttons used by the well-known cookie/consent toolkits like OneTrust, Cookiebot, TrustArc, Iubenda) and app/learned_dismissals.js (a small per-site memory of which dismiss button actually worked, stored under the runtime data folder, expiring after 30 days, capped in size).
- When a click is blocked by a surprise pop-up, recovery now does: press Escape (as before), then try the famous accept/close buttons, then any button learned for this exact website - all before ever considering paid AI recovery. It stays reactive only (fires after a real blocked click, never scans pages on its own), never clicks decline/reject buttons (that is the customer's legal choice), and close-style selectors only match inside dialog/modal containers so ordinary page X icons can never be clicked by mistake.
- Every successful auto-dismissal is written to the recovery audit log (tier1_dismiss_pattern) and saved to the per-site memory, so the next run on that site skips straight to the button that worked. This changes no skill files - learned data is runtime state only.
- 13 new unit tests in runtime/test/unit/test_dismiss_patterns.js cover the safety rules (no decline selectors, close selectors must be dialog-scoped), the ladder order, the learned store's caps/TTL/host isolation, and the full interception-to-recovery flow. Full suite: 399 tests passing; recovery purity check still clean.
- Docs updated: TODO.md EXEC-5 got an update bullet (what shipped, what remains: hooking AI-recovery wins into the learned store and one-click try_dismiss suggestions in Human Edit); docs/TRD.md section 10.2b describes the new remedy; the Workflow 8 AV-5 test steps now match the new behavior.

## 2026-08-25 - Manual walkthrough written (and it caught two real bugs) for the pop-up cheat sheet
- Added "AV-5a" to docs/testing/exec-10-long-chain-workflows.md: a step-by-step hands-on test for the known-popup-button feature, using a single self-contained local HTML page with four banner variants (real OneTrust button id, a decoy that clicks but dismisses nothing, a bespoke modal nothing recognizes, and a native dialog for the Escape path).
- The fixture logs every click both on-screen and to the web server's log, so you can see exactly which buttons were clicked and in what order even after a headless run. The doc explains how to record, replay five scenarios, and read the evidence.
- Writing and running this test caught two real implementation bugs before any customer could: (1) the ladder stopped at the first button that clicked successfully - if an earlier-list candidate clicks but dismisses nothing, it never reached the real winner and even "learned" the useless one; fixed so it now tries every present candidate in order, which also handles multi-layer consent dialogs; (2) a selector present in both the learned list and the static list got clicked twice per pass; fixed with de-duplication.
- Also raised the per-candidate click budget from 400ms to 1200ms after measuring that a cold page's first click can legitimately take longer than 400ms.
- Everything re-verified against real Chromium: the full manual scenario suite passes (banner dismissed, learning skips the dead-end button on run 2, Escape path works, bespoke modal correctly gets no free pass), all 401 unit tests pass, recovery purity check clean.

---

## Human Edit now shows each step in plain English (matching the Workflow plan) - 2026-08-25
The step editor used to show and edit a short machine code like click_sign_in_button, while the Workflow plan panel showed a friendly sentence for the same step. Now the step editor shows that same friendly sentence as the thing you read and edit (falling back to the machine code only for older skills compiled before sentences existed). Saving stores the sentence under its own field, so the machine code - which the automation logic depends on - is never touched by typo-prone hand edits; it still appears as a small grey hint when it differs from the sentence. Tracked as TODO BUILD-21, added and resolved in the same day.

## 2026-08-26
- Fixed app-layer-files.json guard failure in local app build: registered 6 new PROD-5/scheduler modules (cron_lite, file_lock, review_pause, scheduler_cli, scheduler_daemon, scheduler_store) that were added to runtime/app/ but missing from the shipping manifest. Guard now passes (53 modules).

## 2026-08-26 — One-workflow test runbook
- Created docs/testing/03-ONE-WORKFLOW-RUNBOOK.md: merges WF-1…WF-10 into ONE ~100-step mega-recording + an 8-replay gauntlet, with exact click-by-click manual steps. Recovery drill and branch-authoring stay as two tiny companion skills; cloud billing gates kept as a curl appendix (they can't be a browser workflow). Added a shortcut link at the top of 01-WORKFLOWS-TO-TEST.md.

## Pune target list for the first three pilots - 2026-09-01
We had no written list of which companies to actually call in Pune, so outreach would have started from scratch every time. There is now a single page listing fifty Pune companies, sorted into three waves - twenty to call now, twenty for later, and ten big names to leave alone until we have two happy customers to point at. Each one names the likely first process to automate, who to email, and the one thing most likely to kill the deal. It also says plainly which three to start with and what each pilot has to produce before we count it as proof.

## Centelon added to the top of the Pune target list - 2026-09-01
The Pune list only had cold names on it, even though we already demoed to Centelon in August and that conversation is still open. Centelon now sits at the top of the page as the account to work before any cold call, with what the actual sale is (automating the processes they implement for their clients, not their own admin work), what has to be fixed first (buying the code-signing certificate), and the one thing not to promise them yet. It also says plainly that this conversation does not replace the three local pilots - a reseller selling an unproven process just multiplies the problem.

**Wrote two scoped internship briefs for the incoming interns — 2026-09-01**
We are bringing on two unpaid student interns and needed to give each one a clear, self-contained piece of work that cannot break anything a customer touches. One brief covers the reporting pipeline — the system that tells a customer what their automations actually did — and the screen they read it on. The other covers reading the months of run history we have already collected, to find out where automations break and whether our self-healing genuinely works. Each brief names what the person owns, what they must not touch, what ships each month, and how their work will be judged.

**Planned making Conxa run on its own, without needing a paid Claude or Codex account — 2026-09-01**
Right now a customer cannot run a single automation unless they already pay for someone else's AI assistant, which rules out most of the market before we even start. The backlog now carries a plan to give Conxa its own assistant inside the app, powered by a model we host, with the option to plug in your own AI account instead, and to buy credits by scanning a QR code without leaving the app. The plan also flags the one thing that must not slip: the assistant is what repairs automations when a website changes, so a cheaper brain there quietly means less reliable automations, and we now have a number to watch that tells us if that happens.
