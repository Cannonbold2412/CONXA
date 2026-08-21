# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

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
