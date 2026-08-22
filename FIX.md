# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

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
