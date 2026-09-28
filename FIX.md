# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

## Tidied up the top of the skill review screen — 2026-09-29
The review screen's title line no longer shows the confidence percentage or the "recompile" link — just a plain step count. The Suggestions button moved into the "More" menu next to Diagnostics, and Workflow plan and Input variables took its old spot as their own buttons up top. Less clutter at a glance, same tools all still one click away.

## Conxa logo now shows in the top-left corner of Build Studio — 2026-09-29
The top-left corner of Build Studio used to show a generic stack-of-layers icon instead of our brand. It now shows the real Conxa logo. This makes the app look like our product from the very first glance.

## Cleaner Input variables, Workflow plan, Diagnostics and selector review screens — 2026-09-29
The Input variables, Workflow plan and Diagnostics windows in the review screen were busy grids of boxes; they're now simple, calm lists in a smaller window. Each variable shows as a one-line summary you click to edit, and rarely-needed technical details sit behind an "Advanced" link. When reviewing how a step finds its button, you now just click the option you trust most to make it the main one. Nothing was taken away — every setting is still one click away.
— 2026-09-29

## A group's page top bar is now one tidy row too — 2026-09-29
Opening a group used to show two stacked bars: the group name on top, and a second bar below with the credit counters and the Rename, Delete and "New Workflow" buttons. They're now one bar, matching the Workflows page. It looks cleaner and gives the workflow list more room.
— 2026-09-29

## The Workflows page top bar is now one tidy row — 2026-09-29
The top of the Workflows page used to be two stacked bars: one with the page title, and a second one underneath holding the credit counters and the "New Group" button. They're now merged into a single bar, with the title on the left and the credits and "New Group" on the right. It looks cleaner and gives the group folders a little more room on screen.
— 2026-09-29

## Skills that ran fine on a customer's computer now show up on the Cloud Dashboard — 2026-09-29
A skill could run perfectly on a customer's machine, but the Cloud Dashboard would still say "no production telemetry yet" — like a store's cash register ringing up sales correctly, but the owner's report always showing zero. The dashboard was looking up each customer's activity under their pretty display name instead of the internal ID that activity was actually filed under, so it could never find it. Now both sides use the same internal ID to file and look up activity, and the pretty name is shown separately. This affected every skill on every installed pack, not just one workflow.
— 2026-09-29

## Skill folders on a customer's computer now show the group's name, not a random code — 2026-09-29
When a skill got installed, the folder it landed in was named after an internal tracking code (a long jumble of letters and numbers) instead of the group name someone typed in, like "Sales" or "Support". Now that folder is named after the group instead, so anyone looking at the install folder can tell what it's for at a glance. This didn't affect sign-in or anything the skill actually does — only what the folder is called.
— 2026-09-29

## Built the calmer step editing screen for real — 2026-09-29
The design sketches from yesterday are now the actual screen people use to review and fix a recorded skill. The busy header, dense step list, and crowded step form are now calm and plain: a short question at the top of each step, quieter status dots instead of a wall of badges, and the technical controls (raw selectors, frame details, JSON) tucked behind an "Advanced" toggle instead of always being on screen. The step-check list now shows plain sentences with quick buttons like "Text appears" instead of a form full of dropdowns. Nothing that could be done before was removed — it just isn't in the way by default anymore.
— 2026-09-29

## Added a simpler design for the "click" step screen — 2026-09-28
The screen for checking which button a step clicks had a lot of extra buttons and badges. The new sketch asks one plain question, "Is this the right button?", and gives two clear answers. It matches the other sketch and our brand colours, and is a sketch only.
— 2026-09-28

## Recoloured the simpler step editing sketch in our brand look — 2026-09-28
The calmer step editing sketch now uses our dark charcoal and orange-clay colours instead of a generic light theme. It now looks like it belongs in the same app as the rest of the Studio. Still a sketch only.
— 2026-09-28

## Redesigned the Input variables, Workflow plan and Diagnostics windows — 2026-09-28
These three side-panel windows were dense with tables, monospace text and technical labels, hard to scan at a glance. We redrew them as calm pop-up cards with clear headings, short explanations, and only the controls someone actually needs day to day. Diagnostics stays detailed on purpose, since it is meant for engineers, not everyday editing.
— 2026-09-28

## Sketched a much simpler version of the step editing screen — 2026-09-28
The screen for editing a single step showed too many buttons, badges and warnings at once, like a dashboard with every light on. We drew a calmer version that keeps one main action, plain sentences, and hides the advanced options until someone asks for them. This is a design sketch only, so the real screen has not changed yet.
— 2026-09-28

## Cleaned out outdated notes about the old compile page — 2026-09-28
Our design notes still described a separate compile screen that no longer exists. They now describe the progress log that opens under each workflow. This keeps new teammates from looking for a page that is gone.
— 2026-09-28

## Reopening a finished compile no longer throws you into the editor — 2026-09-28
Clicking a workflow's card after its compile finished used to jump straight to the editor instead of showing the log. Now the card just shows the log, and you only get taken to the editor automatically the moment a compile you were watching completes.
— 2026-09-28

## Compile progress now opens right under the workflow card — 2026-09-28
Clicking Compile or Re-compile used to whisk you away to a separate full-screen page. Now the progress log slides open beneath the workflow, just like the Test log does, and only one of the two is open at a time. Clicking the workflow's card folds that log away or brings it back, so you never lose your place.
— 2026-09-28

## Removed a leftover button that did the same job as the new review popup — 2026-09-28
When a recording flagged a possible optional pop-up, the new review popup asked about it — but the old "treat as optional?" button next to the step was still there too, so the same question had two doors. The old button is gone, so there's one clear place to answer. The popup's list of question types is also now a simple list, so adding a new kind of question means adding one line instead of editing the popup itself.

## The loop review popup can now ask a genuine follow-up question, and so can anything else — 2026-09-27
The "turn this into a loop?" question and its separate "remove the leftover click too?" question needed to work as two questions for one decision, saved together in one step. The first version wired that up in a way that only worked for this one pair of questions. It's rebuilt so any future review question that needs a follow-up question can define its own small yes/no chain, and the popup itself just asks whatever it's given — no special-case code needed for the next one.

## The loop-question fix from earlier today is now built the reusable way — 2026-09-27
Fixing the wrong-description bug earlier today (see the entry below) worked, but it was wired up in a way that only helped that one question. It's now split into three small, general-purpose pieces any future "explain this in plain English for the reviewer" feature can reuse, instead of every one of them having to solve the same problem from scratch.

## The "turn this into a loop?" question no longer describes the wrong action — 2026-09-27
The AI-rewritten version of this question was sometimes describing a completely different action than what the recording actually does — for example saying a file gets deleted when it's really being downloaded and then uploaded somewhere else. This happened because the AI was only told a filename and a yes/no flag, with no idea what the recording actually does, so it guessed. It's now told exactly what the real steps are — which one gets the file, which one re-uploads it, and which one is a leftover click being cleaned up — so its description matches the recording instead of inventing one.

## The "turn this into a loop?" question now reads like a person wrote it — 2026-09-27
When the tool noticed a recording downloaded and re-uploaded one specific file, it asked to generalize that into a repeatable step using wording that sounded like a bug report — file names in quotes, technical asides in parentheses. It now asks the AI to rephrase that same question into one or two plain, friendly sentences before showing it to you. If the AI is unavailable for any reason, it quietly falls back to the older, plainer wording instead of failing — you always get an answer, just sometimes a slightly less polished one.

## Reviewing a recording now flows straight through, with no stops you can click past — 2026-09-27
After a recording finished compiling, someone had to click a button to move on, then click past two separate suggestion pop-ups if the tool wanted to double-check something, then land on a separate "Test Skill" screen at the end. Now the moment compiling finishes, you're taken straight into the review screen. If the tool has any yes/no questions for you — like "should this become a repeating loop?" or "is this a popup that doesn't always show up?" — it asks them right away, one at a time, in a pop-up you must answer before you can do anything else; there's no way to close it without answering. Once you approve the review, you land directly on the workflow's own page, where testing it is right there — the separate Test Skill screen is gone.

## Turning down a "was this an optional popup?" question no longer gets forgotten — 2026-09-27
Behind the scenes, saying "no, don't treat this as optional" to one of the new mandatory questions is now remembered the same durable way as every other change made while reviewing a recording, so it won't quietly ask again after the question was already answered.

## The sign-in design page now matches how sign-in really works — 2026-09-26
The page that explains how Conxa knows a customer has finished signing in was still describing an older idea, where we kept a list of well-known sign-in sites. That list is gone from the real product, so the page was teaching something untrue. It now explains the current approach: compare against a real signed-out page, and watch whether the tab still looks like a login. The buttons, diagrams and demo scenarios were updated to match.

## The cost guide now shows where AI spending moves after the first month — 2026-09-26
The cost guide said that once a company finished building, our AI costs would be small. In fact the spending just moves: the first month is mostly building, and every month after is mostly people chatting with the AI and fixing steps. We added what that costs on each plan and flagged that the top plan could earn less than we aimed for if its allowance is used heavily.

## The chat now tells you when your workflow finishes after sign-in — 2026-09-25
When a workflow had to wait for you to sign in, the chat said "still waiting" and then went quiet, even after the workflow finished successfully. Now the app keeps watching in the background and the chat posts the outcome by itself, like a delivery notification arriving once the parcel is dropped off. The History list also updates to show the real result instead of staying on "waiting".

## Workflows that download a file no longer freeze in the Execute app — 2026-09-25
When a workflow downloaded a file inside the Execute app, a Windows "Save As" box popped up and the workflow sat waiting for someone to click Save. The app now saves the file quietly on its own and passes it straight to the next step, so a download-then-upload workflow runs through without anyone touching it.

## Empty saved sign-ins no longer pass as "signed in" — 2026-09-25
Sign-ins saved by the earlier broken version were empty, but the app had marked them as checked and trusted them for six hours. The workflow then reached the site signed out and failed partway through. An empty saved sign-in is now always checked again, so you're asked to sign in once at the start instead.

## Sign-ins in the Execute app now carry over to your next run — 2026-09-25
Signing in inside the Execute app worked for the run you were doing, but the app saved an empty copy of your sign-in, so the next run would have asked you to sign in all over again. Each run keeps its browser data in its own private drawer, and the app was reading from, and restoring into, the wrong drawer. It now uses the run's own drawer both ways, so you sign in once and later runs stay signed in. It also stopped accidentally saving a bit of the Execute app's own screen data alongside your sign-in.

## Fixed signing in successfully but the workflow never starting — 2026-09-25
In the Execute app, you could finish signing in to Google and GitHub, watch the sign-in window close, and then nothing would happen, and saying "I've already signed in" just got you asked to sign in again. The app was failing to save your sign-in, because of a limit in the app's built-in browser that it didn't account for, and it hid that failure. It now saves your sign-in in a way that works inside the app, so the workflow starts on its own right after you sign in. If saving ever fails again, it is now recorded instead of silently asking you to sign in a second time.

## Fixed sign-in restarting while you approve it on your phone — 2026-09-25
After typing your Google password and tapping "Yes, it's me" on your phone, the sign-in window jumped back to the email page. While you were waiting on the phone screen, the app wrongly decided you were already signed in, saved an unfinished sign-in, closed the window and started over. Now the app waits until you have actually left the sign-in pages, then double-checks with the website itself before deciding anything. That works the same way on any website, with no list of page names to keep up to date, so extra security steps (codes, phone approvals, "verify it's you") are simply waited out. You sign in once, however many steps it takes.

## Cleaned up old, unused code in the local runtime and made its errors easier to understand — 2026-09-25
The program that runs a workflow on a customer's computer had built up years of leftover safety nets for pack formats nobody builds anymore, and in a few places it quietly guessed instead of stopping to say something was wrong. We removed the dead leftovers, and turned the riskiest silent guesses into clear stops: a retry limit that could never actually run out now works as intended, a check step that used to pass no matter what now actually checks, and a workflow whose recorded browser tab has closed no longer keeps going on the wrong tab. Update checks, scheduled runs, and the telemetry it sends home now fail loudly and log why instead of getting stuck silently. Error messages shown to the assistant running a workflow are now written in plain sentences instead of raw technical dumps. Separately, a "did this step actually work?" check the system compiles for every workflow was being computed but never actually attached to the finished package, so it silently never ran — that is now fixed too.

## Fixed the sign-in screen jumping back to the first page — 2026-09-25
While you signed in to Google, the browser kept flipping back to the very first sign-in page right after you typed your email. The app was quietly opening extra tabs to check whether you were signed in yet, and each one grabbed the screen and reloaded the login page — like someone repeatedly pulling you back to the front door mid-conversation. Those checks now stay in the background and wait until you have actually left the sign-in pages, Asking "are you done yet?" while the sign-in window is open also no longer starts anything new — it just points at the window that's already there. So you can log in once, at your own pace.

## Made the Execute chat feel finished — 2026-09-25
Chats used to stay named "New chat" forever, and the "+" button did nothing. Now a chat is named after your first message, a green dot shows next to any chat that is still working, and the "+" lets you attach pictures or text files up to 10 MB. We also removed the duplicate "Runs" list, gave Settings a slim scrollbar that matches the theme, moved "Software update" onto its own tab, and dropped the separate "Personal" workspace choice for people who already belong to a team.

## Chats keep working when you switch away — 2026-09-25
If you left a chat while it was still answering, coming back used to show it as if your message was never sent. Now the chat remembers your message and keeps showing the reply as it arrives, like a phone call you can put on hold and return to. Two chats can also answer at the same time without their text getting mixed up.

## Tidied up the code that handles signing in to apps — 2026-09-25
The sign-in code had two near-identical copies of the same "has the person finished signing in yet?" routine, like two clocks wired separately that could drift apart. They now share one routine, and the small saved-notes helpers were moved into their own tidy drawer. Nothing changes for users, but future fixes to sign-in only need to be made once.

## Conxa now learns how each app signs you in, instead of guessing — 2026-09-25
Before, the system connected to an app by saving your sign-in and then guessing, from general page clues, whether a later visit was still signed in. Now, when you finish signing in and click Done, it actually studies what changed: what the page looks like signed in, versus what a completely fresh, signed-out browser sees on the exact same page. It only trusts a clue if it's true one way and false the other, the way a locksmith tests a new key both ways before handing it over — and it always re-tests the saved sign-in one more time before saving it for real. If that test doesn't pass, the sign-in window now stays open and tells you so, instead of quietly saving something unreliable; you can keep signing in, or choose to save it anyway. One more change: the sign-in window used to close itself the moment it merely reached the page you'd typed in as "success," even mid-login. Now only clicking Done ends it. Last, if a saved sign-in runs out partway through a workflow and it's one the system has studied this way, it reopens the sign-in window and picks the workflow back up on its own once you're signed in again — no need to start the whole thing over.

## Wrote down the plan for one-click "Connect" buttons for popular apps — 2026-09-25
Customers currently have to sign in to each app through a browser window that has to guess when they are finished, and that guessing has gone wrong before. We added a detailed to-do describing a built-in list of popular apps (like GitHub or Google) where Conxa already knows the correct sign-in page and what "signed in" looks like. The customer would just tap "Connect" once, and the company would no longer set each app up by hand. Nothing was built yet; this is the plan, including what is deliberately left out for now.
— 2026-09-25

**Saved this batch of sign-in work as organised checkpoints — 2026-09-25**
Several days of sign-in improvements were sitting unsaved in one big pile. They are now saved as five clear checkpoints: the sign-in detection, the behind-the-scenes learning, the setup screen, the tests, and the written notes. This makes it easy to see what changed and to undo one piece without losing the rest.
— 2026-09-25

**Fixed "your Google sign-in expired" showing up right after signing in — 2026-09-25**
Testing a GitHub-to-Google-Drive workflow kept saying Google had signed out, even seconds after the person signed in again. The test was quietly using an old, dead Google login left over from the day before instead of the fresh one — like handing the guard yesterday's expired ticket while today's sits in your pocket. Now the test refuses to run if the sign-in setup changed since the last build and tells you to rebuild, a dead login sitting on Google's "choose an account" screen is recognised as signed out, and a failed run no longer hides the fact that it needs a fresh sign-in.
— 2026-09-25

**Made every workflow in a group need all of that group's apps signed in — 2026-09-25**
Each workflow used to carry its own separate list of "apps I need", and that list could disagree with the group and let a workflow start while one app's login was already dead. Now a group works like a building with one security desk: to run any workflow inside it, every app in the group has to be signed in first. The extra list is gone, and so are the mix-ups it caused.
— 2026-09-25

**Fixed messy-looking lists in the Execute chat — 2026-09-25**
When the assistant listed what a task needs, the lines showed up with raw dashes and brackets, like a note typed in a hurry. Now they appear as clean bullet points, and the assistant is told to write short plain lines. This makes the chat easier to read at a glance.

**Fixed "rebuild the skill package" wrongly showing up after a normal reconnect — 2026-09-25**
Yesterday's fix that tells you to rebuild when an app's sign-in setup genuinely changed had a side effect: every time you simply reconnected an app that hadn't changed at all, the system stamped a "just learned this" timestamp onto its notes and then saw that timestamp as a change — so it demanded a rebuild every single time, like a librarian re-stamping a book "new" every time it's returned and then insisting it must be re-catalogued. It now compares what it actually learned about the sign-in, not when it learned it, and keeps the existing notes untouched when a reconnect confirms nothing changed. Reconnecting an app and testing again now works without an unnecessary rebuild in between. If you're seeing this message right now, rebuild the skill package one more time to clear it out — after that, it shouldn't reappear unless the sign-in setup genuinely changes.
— 2026-09-25

**Fixed the online service failing to start after a deploy — 2026-09-25**
The cloud service crashed on launch because it was missing one of the two database connectors its database address asked for. Like a plug that did not fit the socket, nothing could talk to the database. We added the missing connector so the service starts normally again.
— 2026-09-25

**Rewrote the main technical reference so it describes how things work today — 2026-09-25**
The engineering handbook had grown to nearly five times the length it needed, because every change was added as a new paragraph on top of the old ones instead of replacing them. Readers had to wade through several outdated versions of the same explanation to find the current one, like a recipe card covered in crossed-out edits. It is now rewritten to describe only how the product works today, at well under half its old length, with related topics grouped together. Every other document and note that pointed to a page inside it was updated so those links still land in the right place.
— 2026-09-25

**Fixed a broken diagram in the app-flow guide — 2026-09-26**
One of the sign-in diagrams would not draw and showed an error instead. A few stray punctuation marks were cutting its sentences in half, like a full stop in the middle of a text message that makes the phone send it early. They are now plain commas, so the diagram shows correctly for anyone reading the guide.

— 2026-09-26

**Fixed the local server refusing to start — 2026-09-28**
The local server would not start because it was told to listen at an address that does not exist, like mailing a letter to a house number that was never built. Using the correct "this computer" address makes it start normally. No product code changed, only the command used to launch it.

— 2026-09-28

**Each chat in Conxa Execute now keeps its own browser window — 2026-09-29**
Before, starting a new chat left the previous chat's browser window sitting on screen, like a TV that stays on when you walk into another room. Now the window tucks away when you leave that chat, keeps working in the background, and comes back when you click the chat again. A new chat opens its own fresh browser the first time it runs a workflow.

— 2026-09-29

**Rebuilt the homepage so it explains the product in a few clear pictures — 2026-09-29**
The old homepage looked like most other software sites and packed in a lot of text. Now each part of the page has its own look: a cursor that draws the path of one task across three apps, a crossed-out list of why scripts and integrations fail, a bright section showing a button that moved and was still found, and a simple picture of what stays on your machine. The wording now says any AI agent can run a skill, not only one. This makes the idea easier to grasp in the first few seconds.

— 2026-09-29

**Drew a cleaner design for the step review screen in Human Edit — 2026-09-29**
The screen where you check "is this the right element?" had several bright orange buttons fighting for attention, a lot of empty space at the top, and a warning repeated on almost every step. The new design puts everything in one header row, shows how many steps you've checked, and keeps a single orange button for the one thing to do next. This is a design mockup only; the app itself hasn't changed yet.

— 2026-09-29

**Tidied the spacing and alignment on the Human Edit screen mockup — 2026-09-29**
This is a light touch-up of the step review screen, not a redesign. The title and the action buttons now sit in one row at the top. Long web addresses in the step list are cut to one line so they no longer wrap. The step cards, the screenshot and its buttons now line up on the same edges. It's a design mockup only; the app itself hasn't changed.

— 2026-09-29

**Tightened up the Human Edit screen's layout — 2026-09-29**
The Human Edit screen had two header bars stacked on top of each other, leaving a big empty band at the top. Now the title and all the buttons share one bar. Long web addresses in the step list used to spill over three lines; now each step fits on one line, and hovering shows the full text. The small labels under each step and the screenshot area also line up neatly.

— 2026-09-29

**Drew a calmer design for the Publish Skill Package screen — 2026-09-29**
The old screen showed a warning box, a form, and a note all with equal weight, so it wasn't obvious what to do first. The new design turns it into two clear steps: run the test, then fill in the release details. The Publish button stays greyed out with a short "locked until the test passes" reason. This is a design mockup only; the app itself hasn't changed yet.

— 2026-09-29

**The Publish page now walks you through two steps — 2026-09-29**
Before, the Publish page showed a warning, a form and a note all at once, and you had to leave the page to run the required test. Now step one is "Run the test" right on the page, and the release form stays locked with a short reason until the test passes. The skill list also uses different icon shapes, not just colors, to show which skills have passed.

— 2026-09-29

**Made the screenshot bigger on the "Is this the right element?" screen — 2026-09-29**
On this screen the recorded screenshot used to sit in a small box with the text and buttons squeezed beside it. Now the explanation sits on top, the screenshot uses the full width, and all the buttons sit in one row underneath. It's much easier to see whether the highlighted element is the right one.

— 2026-09-29

**Made the screenshot on the "Is this the right element?" screen larger — 2026-09-29**
The recorded screenshot on this screen was still on the small side. It can now grow about 100 pixels taller on a typical window, so the highlighted element is easier to check.

— 2026-09-29

**Designed a cleaner layout for the Settings screen — 2026-09-29**
The Settings screen was one long stack of wide boxes with small grey labels, which made it hard to scan. The new design groups the page into Account, Usage and About, shows the usage numbers as large figures, and puts your name and sign-out in one row. This is only a design mock-up for now; the real screen has not changed yet.
— 2026-09-29

**Rebuilt the Settings screen to be easier to scan — 2026-09-29**
The Settings screen used to be four wide boxes with tiny grey labels, and the version and update button lived in a separate box at the bottom. It now has a short menu on the left, your name and sign-out on one line, big usage numbers, and the version and update button together under About. Nothing about how accounts, usage or updates work has changed — only how they are laid out.
— 2026-09-29
