# Fix Log

> Rotated monthly into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Redrew the left-hand navigation in the Build Studio design proposal — 2026-07-07

**What changed.** The sidebar sketch in the design proposal (below) was too bare — just two real
pages ("Automations" and "Activity") padded out with blank spacer rows and single-icon labels that
didn't say what was actually on each page. It's been redrawn with five proper, clearly-named
destinations instead: **Automations** (the home page), **Activity** (a live feed of everything
running or finished), **Distribution** (a brand-new page — every company's installer, its
permanent download link, its current version, and a "Rebuild" button, all in one place), plus
**Settings** and **Developer Tools**. Each one now has a one-line description of what it's actually
for, right in the sketch.

The new **Distribution** page also fixes a loose end from the last update: it gives "Build
Installer" — the rare, once-per-company action from last time — a real, easy-to-find home instead
of vaguely gesturing at "an overflow menu somewhere."

**Where it lives.** Same file as before: `conxa-builder-workflow-redesign.md`, section 8
("Wireframe-level UI/UX recommendations"). Still just a written plan — nothing in the app has
changed yet.

---

## Added "Build Installer" back as its own step, plus a full write-up of how installers actually work — 2026-07-07

**What this is.** Another update to the same Build Studio design proposal (below). The plan had
settled on five steps ending in "Publish Skill Package," with building the actual installer file
treated as a rare, tucked-away action. That's been revised again: **Build Installer is now its own
explicit sixth step**, because producing the file a brand-new customer actually downloads is real,
visible work — it just doesn't happen often.

**The decided flow is now:** **Record → Compile (background) → Human Edit → Test Skill → Publish
Skill Package → Build Installer.** In plain terms: publishing a Skill Package is the everyday
action (a vendor does it every time they add or fix a workflow, and it reaches customers who
already have the app installed with zero effort on their part). Building the installer is the rare
one — normally just once, the first time a vendor ships to a brand-new company, and only
occasionally after that for a big platform change. Today that build runs locally inside Conxa
Builder; once there are paying customers, it's meant to move to Conxa Cloud so companies can
generate and manage their own installers remotely, without needing anyone to have the desktop app
open.

**Also new: a full explanation of how the installer and its update system actually work**, covering
how the installer file gets built, what's baked into it versus what gets downloaded afterward, what
happens on the customer's machine during install, how the two update-able pieces (the "Runtime" and
the "App") start up and check compatibility with each other, how already-installed customers get
new Skill Packages automatically, how a request to "run an automation" actually gets carried out
step by step (including when the customer's own AI steps in to fix something that broke), and why
the installer itself is rebuilt so much less often than everything else — the short version being
that the installer contains a real program binary that's risky to swap out while it's running,
while Skill Package updates are just data files with none of that risk.

**Where it lives.** Same file as before: `conxa-builder-workflow-redesign.md`. Still just a written
plan — nothing in the app has changed yet.

---

## Added a guided 3-step wizard for re-targeting a step's element — 2026-07-07

**What changed.** Previously, if a recorded step was clicking on (or typing into) the wrong
element, the only fix was to draw a box around the right spot on the screenshot and hope the
app quietly picked good replacement selectors behind the scenes — with no chance to check its
work before it saved. Now there's a proper 3-step wizard for this in the Human Edit screen's
step editor, opened with a new **"Re-target element"** button:

1. **Pick element** — draw a box around the element on the screenshot, same as before.
2. **Review selectors** — the app shows a few candidate ways to identify that element (e.g. by
   its test ID, its visible text, its accessibility role), each with a plain-language
   description, a durability score, and whether it's confirmed to uniquely match that one
   element in the original recorded page. If nothing looks trustworthy, you're warned and can
   go back and re-draw the box, or type in a selector yourself.
3. **Confirm & apply** — the app shows, in plain English, how it currently checks that this step
   worked versus how it would check going forward (e.g. "the page address changes" or "an
   element appears"), and lets you keep the old check or switch to the new one. If everything
   looks strong and nothing needs to change, this step collapses down to a single "Apply"
   click.

Nothing is saved until you click Apply at the very end, and undoing (Ctrl+Z) reverses the whole
wizard in one step, not three separate ones. If the original recording this step came from is no
longer available, the wizard tells you plainly and offers to just move the target box without
touching the underlying selectors.

---

## Rewrote the Build Studio redesign proposal end-to-end around the final, decided-on workflow — 2026-07-07

**What this is.** The design proposal from yesterday (below) originally argued for squeezing
everything down to three steps — Record → Review → Publish — with reviewing the compiled steps and
testing that they work merged into one "Review" screen. That idea has been dropped. The whole
document has now been rewritten, top to bottom, around the actual decided-on flow instead of just
bolting a note onto the end.

**The decided flow:** **Record → Compile (in the background) → Human Edit → Test Skill → Publish
Skill Package.** Reviewing the compiled steps and testing that they actually work are two separate
pages, not one merged screen — they're different jobs and deserve their own space. Every section of
the document — the summary, the reasoning, the wireframe sketches, the phased build-out plan — now
consistently describes this five-step flow instead of the old three-step one.

**What's genuinely new work vs. already built:**

- Compiling already costs money per run today, and today it locks up the app until it finishes —
  only one workflow can compile at a time. Making Compile a background job you explicitly click to
  start (see Queued/Compiling/Completed/Failed update live while you keep working elsewhere) is
  real, new engineering work.
- Skill Packages already update independently of the installer behind the scenes — that delivery
  pipe already exists. This proposal mostly asks the product to *lean on* that, and make "Publish
  Skill Package" the thing people do routinely instead of rebuilding the whole installer.
- Each company already gets one permanent installer download link that always serves the latest
  build — that also already exists. The proposal's ask is discipline: stop rebuilding the installer
  for every workflow change, tuck that action away on its own page, and save it for real
  platform-level changes.

**Where it lives.** Same file as yesterday: `conxa-builder-workflow-redesign.md`. Still just a
written plan — nothing in the app has changed yet.

---

## New design proposal: a simpler, 3-step Build Studio workflow — 2026-07-06

**What this is.** A written design proposal (not a code change yet) that rethinks how people use
the Build Studio from scratch. Today, making one automation walks you through seven named steps —
Record, Compile, Human Edit, Build Plugin, View Package, Test Skill, Build Installer — and four of
those are really just the app showing you its own internal machinery.

**The idea.** Shrink those seven steps down to three things a person actually decides:

1. **Record** — show the task once in a real browser.
2. **Review** — check that Conxa understood it, click "Try it" to watch it run, and approve.
3. **Publish** — ship it to your customers.

Everything in between (compiling, packaging, building the plugin folder) happens quietly in the
background, the same way you don't watch Vercel compile your website — you just push and get a
link. All the technical detail is still there for engineers who want it, tucked into an "Inspect"
panel that's off by default. The proposal also reorganizes the app around the *automation* you're
building, so you stop having to re-pick the same plugin on four different pages.

**Where it lives.** The full write-up is in a new file at the repo root:
`conxa-builder-workflow-redesign.md`. It includes the reasoning, wireframe sketches, a step-by-step
migration plan, and the risks — enough detail to actually build from later. Nothing in the app has
changed yet; this is the blueprint.

---

## Fixed (the real cause this time): "Build failed" right after a successful publish, in Dev mode — 2026-07-04

**What you saw.** Publishing to the local Dev cloud worked (tokens embedded in pack.json,
exactly as expected), then building the installer failed immediately with "Something went
wrong inside the app" and no further detail in the visible log.

**What was really happening.** This took two earlier fixes (below) plus one more real bug to
fully explain. The actual cause: your local Dev cloud has a settings file, `.env.dev`, that
correctly lists which versions of the runtime and app files it should hand out
(`host-v1.2.3`, `app-v1.3.4`) — but nothing in the app was ever wired up to actually *read*
that file into the running program. So the Dev cloud silently fell back to a placeholder
example value baked into the code (`host-v1.0.0`), which was never a real release, and told
Build Studio to download a file that doesn't exist. That download failed instantly with a
"file not found" error from GitHub, which is what crashed the installer build.

**How this was found.** Rather than guessing, I ran the exact same build request Build Studio
sends, directly, outside the app, so I could see the real underlying error (Build Studio's UI
only ever shows a generic "something went wrong" and throws away the details). That surfaced
the true error: `conxa-runtime: HTTP Error 404: Not Found`. Tracing that back showed the local
Dev cloud was quoting `host-v1.0.0` — a version that was never actually published — instead of
the `host-v1.2.3` your own `.env.dev` file already correctly specifies.

**The fix.** Taught the shared settings code (used by both the Dev cloud and Build Studio) to
actually load `.env.dev` / `.env.prod` into the program's real environment on startup, not
just into its own internal settings object — so every part of the app that checks these
values (not just the ones that go through the formal settings system) sees the same, correct
answer. Verified directly: after this fix, the Dev cloud correctly advertises `host-v1.2.3`
and `app-v1.3.4`, and downloading from those addresses succeeds (confirmed a real, in-progress
download with no errors), where before it failed instantly.

**One more small, related fix found along the way.** While reproducing this, a dependency
check (Chromium) run during installer build could hang forever in rare cases, because it
was started in a way that could accidentally wait for input from a channel that never
sends any (a Windows-specific plumbing detail). Closed that off so the check can only ever
succeed or fail — never hang.

**What you need to do.** Restart your local Dev cloud server (the one you start with
`conxa.ps1 dev backend`, or however you normally run it) so it picks up this fix — it only
takes effect on a fresh start. After that, Build Studio's first "Build Installer" click will
do a one-time real download of the runtime files (a couple of minutes, depending on your
connection) and then succeed — every build after that will be instant since the files stay
cached.

---

## Fixed: building an installer crashed right after publishing, in Dev mode — 2026-07-04

**What you saw.** Publishing a skill pack to the local Dev cloud worked fine (the log showed
the pack.json tokens getting embedded), but the very next step — building the actual
installer — failed instantly with a generic "Something went wrong inside the app" message and
no further progress in the log.

**What was really happening.** Right before packaging the installer, the Studio checks that its
NSIS/runtime dependencies are up to date by asking a cloud server for the latest versions. Every
other step in this flow (publishing, the sync address, the tracking address) correctly asks the
**local Dev cloud** you're running on your own machine when no cloud address is explicitly
configured. This one dependency check, though, had its own separate, hardcoded fallback that
always pointed at the **live production cloud** instead — a leftover from before the Dev/Prod
separation work. So a Dev build would quietly try to reach the real production servers for this
one check, which isn't guaranteed to be reachable or consistent with what a local Dev session is
doing, and the resulting failure wasn't given a friendly message.

**The fix.** Made that dependency check resolve the cloud address the same env-aware way as
everywhere else: Dev sessions ask the local Dev cloud, Production sessions ask the real one.
Building an installer in Dev now stays entirely within Dev, matching the golden rule described in
`SHIP-GUIDE.md` — Dev and Prod should never cross paths.

---

## Fixed: installer builder wrongly rejected a perfectly good NSIS install — 2026-07-04

**What was really happening.** Build Studio uses a free tool called NSIS to actually package the
customer installer `.exe`. Three places in the code checked for NSIS by requiring *two* specific
files to sit side by side — a rule left over from a much older version of NSIS where one of those
files was a tiny "stub" that couldn't work alone. The version actually being downloaded today
(NSIS 3.10) doesn't work that way at all — its main file is fully complete and self-sufficient on
its own. Confirmed this directly by compiling a real test installer with just that one file: it
worked perfectly. The outdated check meant a perfectly good NSIS installation could be quietly
rejected as "not found."

**The fix.** Removed the unnecessary "second file must also be present" requirement in all three
places, so a real, working NSIS install is recognized as such. This also fixes the very first
time NSIS gets downloaded automatically (for anyone, dev or production) — previously, that
automatic download step could reject its own freshly-downloaded copy for the same reason.

*(Note: this specific check turned out not to be the actual cause of a later "Build failed" error
in this investigation — that one turned out to be about locally-run Conxa Cloud not being told
which runtime versions actually exist to download, an environment/config matter rather than a
code bug, and was left for the developer to resolve on their own machine.)*

---

## Changed: publishing to a local dev cloud now actually publishes — 2026-07-04

**What prompted this.** The previous fix made "Build Installer" work in dev mode by no longer
requiring a cloud sync token when publishing was skipped. But if you actually *do* have the cloud
backend running on your own machine during development, skipping publish was pure friction — you
have a working local cloud right there, so there's no reason not to use it.

**The change.** Build Studio now always tries to publish, whether the cloud address it's pointed
at is local or the real one. If a local cloud responds, publishing goes through for real — you get
a genuine sync token, matching exactly what a real customer's install would experience, so local
testing is more faithful to production. If a local cloud isn't running, it falls back to skipping
publish (a friendly log message, not a crash) so the build can still proceed. The one thing that
did **not** change: if the *real* Conxa Cloud fails to respond (whether it's genuinely down or
you're not signed in), that's still treated as a real failure and stops the build, exactly as
before — this "just skip it" leniency only ever applies to a local development address.

---

## Fixed: "Build failed" when clicking Build Installer in dev mode — 2026-07-04

**What you saw.** Clicking "Build Installer" failed immediately with a generic "Something went
wrong inside the app" message, and the build log showed only one line: `Cloud publish skipped for
local API base`.

**What was really happening.** Building an installer normally publishes the skill pack to Conxa
Cloud first, which hands back a special "sync token" — a credential baked into the installer so a
customer's copy can quietly check for updates without ever asking them to log in. In dev mode,
publishing to the cloud is intentionally skipped when Build Studio is pointed at a local
development server instead of the real one (that's the "Cloud publish skipped..." line — it's
informational, not an error). But the installer-building step right after it didn't know
publishing had been skipped on purpose — it always demanded that sync token, and since one was
never issued, it failed every single time in dev mode, with no way to build an installer locally
at all.

**The fix.** The installer builder now only demands the sync token when the pack is actually
meant to talk to the real Conxa Cloud. If it's built against a local development server (which is
only ever useful for testing on your own machine anyway, token or not), it skips that requirement
and builds normally. Any installer meant for a real customer still goes through the full publish
step and still requires a valid token exactly as before — nothing changes there.

---

## Fixed: "requires runtime >=1.0.3, installed: 0.0.0-dev" when testing a plugin — 2026-07-04

**What you saw.** With the "Skill not found" bug fixed, testing "Create a Service from github"
got one step further and then failed with `Skill create-a-service-from-github requires runtime
>=1.0.3, installed: 0.0.0-dev. Please update the Conxa runtime.` — this is progress, not the same
bug coming back.

**What was really happening.** When running via `npm run dev`, Build Studio deliberately runs the
runtime engine straight from its source code in the repo (instead of a separately downloaded,
versioned copy) so that any edits to the runtime take effect immediately without a rebuild. That's
the right behavior for someone actively working on the runtime itself — but that in-repo copy has
never been given a real version number; it just carries a placeholder, `"0.0.0-dev"`. The runtime
has a safety check that refuses to run a skill if its own version is too old for what the skill
asks for — sensible for a real customer's installed copy, but the placeholder number always fails
that check, no matter what.

**The fix.** Taught the runtime to accept an optional "pretend your version is this" signal, and
had Build Studio's local test-runner supply a very high version number through that signal —
*only* when it's running the in-repo source copy for a local test. A real customer's installed
copy determines its version a completely different way (from its own signed install record) that
always takes priority over this signal and was never touched — so this change has no way to
reach, let alone affect, a real installation. It only removes friction for testing an unpublished
workflow locally.

---

## Fixed (for real this time): "Skill not found" when testing a plugin — 2026-07-04

**What you saw.** After the dev/prod folder fix below, testing "Create a Service from github"
still failed with the exact same `Skill not found: create-a-service-from-github. Call
list_skills.` error.

**What was really happening.** This turned out to be a second, deeper bug, unrelated to the
dev/prod folder mix-up. When Build Studio stages a skill for local testing, it copies the built
files into a "sandbox" folder that pretends to be a real customer's machine. But the program that
actually runs the skill (the runtime) expects every skill to sit inside a specially-named
`current` folder — that folder is normally created automatically the first time a *real,
published* skill talks to the Conxa Cloud and downloads itself properly. A skill you're testing
locally, before it's ever been published, has no way to trigger that — so the `current` folder
never got created, and the runtime looked for the skill, didn't find that folder, and reported it
missing, even though all the actual skill files were sitting right there one level up.

**The fix.** Taught Build Studio's local test-staging step to build that `current` folder itself,
directly, without needing to talk to the cloud at all — matching exactly what a real publish
would have produced, just done locally and instantly. Also fixed a related bug this uncovered:
the code that checks "does this shortcut folder already point to the right place" wasn't able to
recognize Windows' particular kind of folder-shortcut (a "junction"), so once a skill was tested
once, retesting it after any change kept quietly serving the *old* version of the skill forever.
Both are now fixed, and testing an unpublished workflow works fully offline, as it was always
meant to. Nothing about publishing or a real customer's installed copy was touched.

---

## Fixed: testing a plugin in dev mode said "Skill not found" — 2026-07-04

**What you saw.** Running the Build Studio via `npm run dev` and testing a freshly built
workflow failed with `Skill not found: create-a-service-from-github. Call list_skills.`, even
though the skill had just been built successfully.

**What was really happening.** Build Studio keeps two completely separate homes for its files
so a developer's local test setup never mixes with a real company's production setup: a "dev"
folder (`.conxa-build-studio-dev`) and a "production" folder (`.conxa-build-studio`). The app
that starts the Python backend correctly says "we're in dev mode, use the dev folder" — but five
separate spots in the Python code that decide where to put the test sandbox, downloaded
dependencies, and installer-building files never learned about that signal. They kept defaulting
to the production folder no matter what. So the newly built skill pack landed in the dev folder
(correctly), while the test sandbox that tries to run it was quietly looking in the production
folder instead — two different folders that never talk to each other, hence "skill not found."

**The fix.** Taught all five of those spots to check for the dev/production signal first, the
same way the one place that was already doing it correctly does. Now testing a workflow in dev
mode stages everything — sandbox, downloaded dependencies, and the skill pack — under the same
dev folder, matching what the rest of the app already expected. No changes needed on the
production side; that path was never affected.

---

## Added shipping instructions for the runtime "host" program — 2026-07-04

The shipping guide (`SHIP-GUIDE.md`) explained how to ship the app layer (`conxa-app`, the part
that changes often) but was thin on the "host" program (`conxa-runtime.exe`, the small program
Claude Desktop actually starts up). Added a full walkthrough for it: what it is, when you'd
actually need to release a new one (rarely — only for very specific low-level changes), and the
same tag-test-promote steps used for everything else, plus two things that make it behave
differently from the app layer in practice (new installs always get the latest host
automatically; a bad host release is riskier since everything else depends on it starting up
correctly).

---

## Fixed: the "Add" dropdown in the Human Edit tab did nothing when clicked — 2026-07-04

**What you saw.** In the Build Studio's Human Edit tab, the **Add** button at the top of the
left-hand workflow list (the one that should drop down a menu of actions to insert) didn't
respond when clicked. Other little "i" help popovers on the same screen worked fine, which made
it look random.

**What was really happening.** All these popups are anchored to the button you click. The shared
`Button` component had been written in a newer React style that this app doesn't use yet — the
result was that the button never handed the popup system a reference to itself. The help popovers
worked because they're built on a plain HTML button (which doesn't need that hand-off), but
anything anchored to our shared `Button` — including the Add dropdown — had no anchor to attach
to, so the menu couldn't open in the right place.

**The fix.** Updated the shared `Button` so it properly forwards that reference, matching the
React version the app actually runs. This fixes the Add dropdown and, as a bonus, every other
tooltip/menu across the studio that was quietly anchored to a `Button` (e.g. the Undo/Redo
tooltips). No visual or behavioral change anywhere else.

---

## Created the local dev config file (.env.dev) — 2026-07-04

To run the Conxa Cloud locally in "dev" mode, the app needs a settings file called `.env.dev`.
I built it by starting from the dev template (`.env.dev.example`) and filling in the AI provider
keys pulled from a separate API keys file you had in Downloads.

The important bit: that Downloads file was actually the *production* settings — it pointed at the
live website, the live payment system, and the real database. Copying all of that into dev would
be dangerous (dev work could accidentally touch real customer data or take real payments). So I
only carried over the pieces that are safe to share: the AI provider keys (Groq, Google, NVIDIA,
plus four extra providers). Everything else was kept in safe "local only" mode — talking to your
own machine, no login required, and payments left in test mode. None of the live/production
secrets were copied in.

---

## Fixed Record Login hanging forever after closing the browser — 2026-07-04

This one was caused by an earlier fix in this log (the flicker fix, below). Here's the chain:

To stop the login window from flickering, we made it stop repeatedly saving your login session
every 2 seconds while you were typing, and instead only save it once, right at the moment you
close the browser. That part worked. But it introduced a new problem: saving the session
requires briefly talking to the browser, and if the browser has *just* closed, that
conversation can have nobody on the other end to answer — and the save attempt would then wait
forever for a reply that was never coming. Since the app was waiting on that save to finish
before it could mark the recording as "browser closed," everything downstream got stuck: the
Studio just sat there, forever thinking the browser window was still open.

Fixed by two changes working together:
1. Bringing back a periodic save while you're logging in, but much less often (every 6 seconds
   instead of every 2) — frequent enough to almost always have a very recent save ready, rare
   enough to not cause the original flicker.
2. Before attempting to save at the moment of closing, the app now checks whether the browser
   connection is already gone. If it is, it skips that attempt entirely instead of waiting
   forever — it just relies on the last periodic save from a few seconds earlier.

Net effect: no more flicker while typing, and no more indefinite hang after closing the browser.

---

## Fixed "Failed to save auth session: Cannot switch to a different thread" — 2026-07-04

After finishing a login recording and closing the browser, some logins were failing to save
with a confusing technical error mentioning "greenlet" and "threads." Here's what was actually
happening: when you close the login browser, the app tries to save your session in two places
at once — once safely (in the background process that was actually running the browser) and
once again, redundantly, from a different internal process that isn't allowed to touch that
browser at all. The browser-automation library we use (Playwright) is strict about this: only
the process that opened a browser window is allowed to interact with it. The second, redundant
save attempt was breaking that rule, and depending on timing, it could either fail silently or
surface this confusing error and block the save entirely.

The fix removes that redundant, unsafe second attempt entirely. The app now properly waits for
the background recording process to fully finish (which includes its own, correct save) before
checking whether the login was saved — instead of racing against it. This also means the app no
longer needs to reach into the live browser a second time to figure out the final login page
URL; it uses the URL it already tracked safely throughout the recording.

If you saw this error before applying this fix, the login itself likely still completed —
it's the save step immediately after closing the browser that was failing. Try recording login
again after this update.

---

## Fixed "A recording is already active" getting permanently stuck — 2026-07-04

If you clicked "Record Login" or "Start Recording" and got the error *"A recording is already
active"* even though no browser window was actually open, this is why: the app remembers "a
recording is in progress" using a single flag that only gets cleared when a recording finishes
the normal way. If that normal finish never happened — the app reloaded mid-recording, the
browser crashed, or you closed the whole Studio app while a recording was still open — that
flag stayed stuck "on" forever, and every future attempt to record got blocked by a recording
that no longer actually existed.

Now, before blocking a new recording, the app double-checks whether that old recording's
browser window is actually still open. If it's not, it clears the stale flag automatically and
lets you start recording right away. If a recording genuinely is still open, you'll now see a
clearer message: "You already have a recording in progress. Finish or close that browser window
before starting a new one" — telling you what to actually do, instead of just stating a fact.

(If you hit this error before applying this fix, restarting the Build Studio app also would
have cleared it immediately, since this flag was only ever held in memory, never saved to
disk.)

---

## Fixed the flickering login recording window — 2026-07-04

When you click "Record Login" in the Build Studio, a real Chrome window opens for you to log
into the target app. Two things about that window were annoying:

1. **It blinked while you were typing your login details.** This was happening because, only
   during login recording, the app was quietly saving your login session to disk every 2
   seconds in the background — and that save operation was visibly flickering the window while
   you typed. It now only saves once you finish (either by reaching the end of login or by
   closing the window), so there's no more repeated flicker while you're actively logging in.
2. **Two extra browser windows flashed open and closed right after you closed the login
   window.** This wasn't a hidden "verification" step — we checked and there's no such step in
   the code. It's most likely Chrome's own behavior when it shuts down (things like its "did
   Chrome crash last time?" popup or restore-session logic trying to kick in for a split
   second). We added the standard Chrome startup flags that suppress that behavior. If this
   still shows up after testing, it means the real cause is a lower-level Chrome/Windows quirk
   we'll need to dig into further with more targeted logging.

Regular workflow recording (recording the actual steps of a task, after you're logged in) was
not affected by this change — it never had the 2-second autosave running in the first place.

---

