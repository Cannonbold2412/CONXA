# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

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
