# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Local Runtime testing now works exactly the same way as a real customer's install, not a lookalike of it — 2026-07-11

Follow-up to today's earlier local-build workflow. It worked, but it put the locally-built files in
a different folder than where a real download lands, with separate code handling each case. Fair
question raised: why have two versions of the same logic instead of just one?

Fixed — now there is only one. The two build scripts write into the exact same folder a real
download would use. Everything downstream (Build Studio's Test Skill) treats a local build and a
real download completely identically, because as far as that code is concerned, they *are*
identical — same folder, same shape, same next steps. Nothing had to be taught to tell them apart,
because now there's nothing to tell apart.

Verified end-to-end again after the change: built both pieces, ran a real test through Build
Studio's actual test code path, confirmed it produces the same `sandbox` staging step a real
download would trigger. Then made a real code change, rebuilt just that piece, confirmed the
change showed up immediately.

---

## Removed two dev scripts and a leftover code path nobody needed anymore — 2026-07-11

Follow-up cleanup after today's local build-and-replace workflow. Two of the earlier helper
scripts turned out to be unnecessary once that workflow existed:

- `run-local-runtime.ps1` (ran the runtime standalone outside Build Studio)
- `host-local-builds.ps1` (served a built installer over a local web address)

Removed both. Also removed a fallback code path in the part of Build Studio that spawns the
runtime for testing — it used to know how to run the runtime two different ways (a built copy, or
the raw unbuilt code directly), but only the first way is ever actually used now, so the second
way was just unused code sitting there. Removed it and simplified the error message for the one
remaining case (no runtime built yet) to point at the right script to run.

---

## Local development now has a real build-and-replace workflow for the Runtime, matching how we actually ship it — 2026-07-11

Follow-up to the entries below from earlier today. Test Skill was already always using local
code instead of a download — but it was running the raw, unbuilt source file directly, which
isn't quite the same thing as what actually ships to customers (the real thing goes through a
build step and code-scrambling step first). That gap is closed now: Dev goes through the exact
same two build steps as a real release, just done on your own computer and copied into place
instead of uploaded to GitHub and downloaded back down.

After cloning the repo, three one-time steps get you set up:
1. `scripts\conxa.ps1 dev env` — sets up the isolated Dev folders.
2. `scripts\build-runtime-local.ps1` — builds the real `.exe`.
3. `scripts\build-app-local.ps1` — builds and scrambles the rest of the code.

From then on, after changing anything: change `bootstrap.js` → rerun step 2; change any other
runtime file (`server.js`, `run.js`, etc.) → rerun step 3. Test Skill picks up the change
immediately, no restart needed. Each script only rebuilds its own piece — editing `server.js`
doesn't force a slow full `.exe` rebuild.

Verified end-to-end, twice: built both pieces, ran a real test through Build Studio's actual test
code path and got a clean result; then made a real code change, rebuilt just the changed piece,
and confirmed the change showed up immediately without touching anything else.

Production is untouched — it still always downloads the real, officially-released copy, exactly
as before. These scripts don't exist there and nothing about how it works changed.

---

## Updated the compiler design doc to say what's actually built vs. still just planned — 2026-07-11

`research-analysis/04-architecture/subsystems/compiler.md` was written a while back as a wishlist for
where the compiler should go. Read on its own today, it made it sound like almost none of that
wishlist had happened yet — which is no longer true. Went through the doc section by section and
compared each claim against the real code.

Turns out two big pieces from the wishlist are already built and running: the compiler no longer
asks the AI to guess which button or field to click — a deterministic algorithm (borrowed from
Playwright's own selector engine) does it every time, ranked by how sturdy each identification
method is, and the running skill now actually uses that ranking live instead of ignoring it. Also,
skills can now handle "sometimes this shows up" situations (cookie banners, etc.) with a real branch
a person can add in the editor, and the running skill executes it correctly.

Still not built: the bigger "master recipe" format (called CIR) that would let two versions of a
skill be compared side-by-side, allow one-click rollback, and let only the broken part of a skill get
recompiled instead of the whole thing. That, plus real version history and byte-for-byte-repeatable
compiles, are all still just plans.

Added a plain-language status table near the top of the doc and a status note under every section so
anyone can tell at a glance what's real today vs. what's still on the roadmap, without needing to
cross-check the code themselves.

---

## New script: build and test the real packaged runtime (`bootstrap.js` included) locally — 2026-07-11

"Test Skill" now always runs your local runtime code directly (see the entry below), which is
great for testing most files — but `bootstrap.js` specifically only runs inside the real packed
`.exe`, so Test Skill can't exercise an edit to it.

Added `scripts/build-runtime-local.ps1`: builds the real `.exe` and scrambles (obfuscates) the
rest of the code, the exact same way our GitHub release pipeline does — just on your own computer
instead of GitHub's servers — then arranges the result the same way a real customer's install
looks. Prints the exact commands to run it afterward, so you can test a `bootstrap.js` change for
real before it ever ships. Confirmed working end-to-end: built it, ran it, got a clean response
back.

---

## "Test Skill" in Dev now *always* uses your local runtime code — closed the last two ways it could quietly fall back to a downloaded copy — 2026-07-11

Follow-up to the fix below from earlier today. That fix made local code the *default* — but it
was still possible for Dev to quietly end up using a downloaded copy of the runtime in two ways:

1. There was still a manual switch (`CONXA_FORCE_DEPS=1`) that would opt back into downloading.
   Removed it entirely, in Build Studio's UI layer too — Dev no longer has any path to a
   downloaded runtime for testing, full stop.
2. A more subtle one: clicking "Build Installer" (a separate, unrelated feature that packages a
   real customer installer) downloads the real runtime for its own legitimate reason — but doing
   so was quietly leaving a "use the downloaded copy" note behind for the rest of that Build
   Studio session. If you clicked Build Installer even once, Test Skill would silently start
   using the downloaded runtime afterward too, with no visible sign anything had changed. Fixed
   by making Dev's "always use local code" rule unconditional — nothing can override it anymore,
   no matter what else ran earlier in the session.

Production is entirely unaffected by any of this — it never had a local-code option to begin
with, and continues using the downloaded, customer-faithful runtime exactly as before.

Also removed the now-pointless helper script from earlier today (`stage-local-app.ps1`) since the
downloading path it supported in Dev no longer exists.

---

## "Test Skill" now uses your local runtime code by default in Dev, and a real crash-on-load bug got fixed — 2026-07-11

Previously, clicking "Test Skill" in Dev always downloaded a customer-style copy of the runtime
first, even though the whole point of Dev mode is to test your own local code. Flipped the
default: Dev now runs "Test Skill" straight against the `runtime/` folder in this repo — edit the
code, click Test Skill again, see the change immediately, no download or build step. Production
is completely untouched by this — it always uses the packaged, downloaded runtime exactly like a
real customer install, same as before. The old "download a customer-style copy" behavior is still
available in Dev any time you want it (for testing something that only shows up in the packaged
version) — just set one environment variable first.

While testing this, found and fixed a second, unrelated bug: the runtime's "status" check
(`get_runtime_status`) was crashing with an internal error every single time it ran, in every
environment, because of a typo-like missing definition in the code. Nobody had likely noticed
because nothing was regularly calling that particular check. Fixed.

Added three small helper scripts for local development:
- Launch Build Studio in Dev mode (a shortcut for the existing dev launcher).
- Run the local runtime by itself, outside of Build Studio, for manual testing.
- Serve a locally-built installer `.exe` over a local web address, so it can be downloaded and
  tested like a real download link, without needing to upload anywhere first.

---

## Fixed "Test Skill" crashing in dev, and added a way to test local runtime changes before they're released — 2026-07-11

Clicking "Test Skill" in Build Studio (in the normal dev setup) was silently crashing the local
test runtime every time. The cause: when Studio stages a test copy of the runtime, it dropped the
app code (the part that actually clicks buttons and fills forms) into the wrong folder shape — one
the runtime's loader can't find at startup. The real customer installer has always built this
folder the right way; Studio's local test copy just never matched it. Fixed by making Studio build
the same folder shape the installer already uses.

Also added an optional script (`scripts/stage-local-app.ps1`) so a developer can point Test Skill
at a locally-edited copy of the runtime code, to try out changes before publishing an official
runtime release. The runtime executable itself still always downloads normally — only the app code
on top of it can be swapped locally.

---

## Wrote down the design rules for both apps' look and feel, so future changes stay consistent — 2026-07-11

Ran the design-setup skill on the two apps people actually see: the Cloud dashboard/marketing
site and the Build Studio desktop tool. Neither had a written-down design system before — anyone
making a UI change was just guessing at "does this match" by eye.

Now each app has two reference documents: one about *who it's for and why* (target users, what
success looks like, brand personality), and one about *how it should look* (exact colors, fonts,
spacing, button/card styles, and a list of specific do's and don'ts). For the Cloud site, this
also surfaced two things already shipped that don't match its own stated style guide — a gradient
headline effect and repeated "eyebrow" labels above sections — both now flagged as things to
reconsider, not fixed yet. Also turned on the in-browser visual-editing tool for both apps so
future design tweaks can be tried live instead of guessed at blind.

Nothing about how either app *works* changed — this is documentation and tooling setup only.

---

## Recorder now notices what actually happened after a click, and flags cookie-banner-style pop-ups so they don't break replays — 2026-07-10

Two related improvements to how the Build Studio records a workflow, both aimed at making
replays more reliable without adding any new AI/LLM calls.

**1. Smarter "did it work?" checks.** Previously, after most clicks the compiled skill could only
check "did *something* change on the page" — a vague check that can't tell a real success from an
unrelated coincidence. Now the recorder itself notices, live, what specifically happened right
after each action: did a dialog pop open, did a typed value actually land in the field, did the
page navigate somewhere new. That specific observation flows into the compiled skill's checks, so
instead of "something changed," a skill can now check "the confirmation dialog opened" or "the
email field really does contain what I typed" — a much more precise, and more trustworthy, safety
net. Password and other sensitive fields are still never read back or exposed, same as before.

**2. Flags cookie banners and pop-ups instead of letting them silently break things.** A common way
recorded workflows fail is a cookie-consent banner or a one-time dialog that showed up while
recording but doesn't show up (or shows up differently) when the skill actually runs later. Today
that just breaks the replay, and fixing it means hand-editing the workflow's raw file — something
nobody actually does. Now the recorder notices when a click happened inside what looks like an
optional pop-up (a dialog, or a banner with "cookie"/"consent"/"gdpr"-style wording) that appeared
during recording, and marks that step. In the Human Edit screen, a flagged step shows a small
"treat as optional?" button; clicking it converts that one step into a "try to dismiss this if it's
there, otherwise move on" step, so the skill no longer breaks whether or not the banner shows up on
a given run. Nothing changes automatically — a person always has to confirm the suggestion first,
so an ordinary step is never silently turned into something else.

---

## Moved "Recording screenshots" off the Human Edit top bar into the Pick Element step — 2026-07-10

"Recording screenshots" used to sit as its own tab in the row of buttons at the top of the Human
Edit screen, alongside Suggestions, Input variables, Workflow plan, and Diagnostics. That crowded
the top bar with a tool that's really only useful while you're picking which element a step
targets, not something you'd reach for the rest of the time.

Moved it: the top bar now has one fewer tab, and a "Recording screenshots" button (with the same
frame-count badge it had before) appears inside the "Pick element" step of the re-target flow,
next to the "Visual bbox" drawing tool. Clicking it opens the exact same screenshots picker as
before — nothing about picking a frame, borrowing a screenshot from elsewhere in the recording, or
clearing the visual anchor changed, only where the button to open it lives.

---

## Switched the fix-log archive from monthly to daily files, and split the two existing monthly archives into one file per day — 2026-07-10

`FIX.md` used to get archived once a month (or sooner if it got too long) into one big file like
`FIX-2026-07.md`. That made the archive files huge and slow to scan — the July one alone had grown
to over 1,700 lines covering ten different days of work. Changed the rule so it now rotates once a
day instead: each day's entries go into their own file, `FIX-<YYYY-MM-DD>.md`.

Also went back and split the two existing archive files (`FIX-2026-06.md`, `FIX-2026-07.md`) the
same way, so the archive is consistent from the start — no code changed, this was a one-time
housekeeping pass over documentation only. The 102 historical entries were regrouped by each
entry's own dated heading (not by where they happened to sit in the file, since a few entries
weren't in date order) into 11 new daily files, and the archive's index page was rebuilt to list
every day and what was fixed that day, instead of one row per month.

---

## Fixed the "Workflow plan" and "Diagnostics" pop-ups being tiny and cutting off their content — 2026-07-10

The pop-up panels that open from the Human Edit toolbar (like "Workflow plan" and "Diagnostics")
were rendering far too small — squeezed to a narrow box — and their content ran off the right edge
and got chopped, so you couldn't read the step details, the decision points, or the identity
hashes.

The cause was a sizing rule fighting itself: the pop-up was told to be wide, but an older
underlying rule quietly overruled that and pinned it to a small fixed width on normal-sized
windows. Every one of these toolbar pop-ups was affected, not just the two in the screenshots.
Fixed the rule so the pop-ups now open at their intended large size.

Also made the content inside them behave: long identity hashes and the technical "decision point"
lines now wrap neatly onto multiple lines instead of shooting off the side, and the full hash is
shown (not cut short with a "…"), since support staff need to be able to read and copy the whole
thing.

---

## Tidied the Human Edit top toolbar — nothing gets cut off anymore, and removed a button people don't use — 2026-07-10

The row of buttons across the top of the Human Edit screen had gotten too crowded: everything was
squashed over to the right-hand side, which pushed the last button ("Diagnostics") half off the
edge so you couldn't read it, and on some window sizes a little sideways scrollbar appeared inside
the button strip, which looked broken.

Fixed it by spreading the row out properly: the "inspector" buttons (the ones that open a panel —
Suggestions, Input variables, Recording screenshots, Workflow plan, Diagnostics) now sit on the
left, and the main actions (unsaved-changes note, undo/redo, and the green Approve button) stay
pinned on the right. That uses the whole width instead of cramming everything into one corner, so
every button shows its full label and nothing is clipped or scrolls.

Also removed the "How Claude sees this" button, since it wasn't something people were reaching for.
The panel's underlying code is left in place; only the button that opened it is gone.

---

## Built the Human Edit redesign the earlier audit recommended, plus let people build "if this appears, do that" conditions — 2026-07-10

Earlier today we studied what the Human Edit screen shows people versus everything that's
actually inside a compiled skill, and found some real blind spots. This entry is that plan
actually getting built, plus one more thing: people can now create the "sometimes this shows up,
sometimes it doesn't" conditional steps themselves, instead of that only being possible by
hand-editing a file.

**Approving a skill now shows you what you're actually approving.** A new status strip appears
right under the page title showing whether the skill compiled cleanly, how confident the compiler
was, and links straight to any step that needs a second look. A new "Workflow plan" tab shows the
overall goal the AI understood this workflow to be pursuing, step by step, plus what "success" is
supposed to look like at the end — information that was always calculated during compiling but
never actually shown to anyone before. Steps that skip a click when the target can't be safely
forced, or that depend on hovering over something else first, now get a small warning badge on
their row so that's visible too.

**Conditional steps are no longer invisible or hand-authored-only.** If a workflow includes an
"only do this if a cookie banner shows up" step, that step's hidden sub-steps now show up directly
in the step list — an approver used to have no way of even knowing they existed. And you can now
build one of these conditional steps yourself, from a menu, right in Human Edit: add the condition,
add the steps that should run when it's true, reorder them, delete them, edit each one's target
and text — no more needing an engineer to hand-write it into a file. Two more advanced condition
types ("try each of these until one dismisses" and "wait for one of several possible screens") can
be reviewed but not yet built from scratch in the UI — that's tracked as follow-up work.

**A "Reliability" section for people who want the deeper detail.** Each step can now expand to show
what the running skill would actually try if that step ever failed to find its target (in plain
language, not code), plus a card showing what was actually recorded for that element — its label,
its role, its visible text — useful for figuring out "why did it click the wrong thing" without
filing a support ticket. A separate small "Diagnostics" tab holds the truly technical stuff
(internal ID hashes, AI provider stats) for support use, kept out of the way of everyday editing.

None of this changes what a step *does* when it runs — it only changes what a person reviewing or
building the workflow can see and, for conditional steps, build. Full write-up of what changed and
why: `docs/Implementation-Plan.md` §1.11.

---

## Wrote a concrete "what to build next in the recorder" recommendation — 2026-07-10

**What this is.** A follow-up to today's fact-check of the recording design doc: a new opinion
piece, `research-analysis/04-architecture/subsystems/recording-next-steps.md`, that says exactly
what to build next, in what order, how, and why.

**The core argument:** the smart machinery already shipped (outcome checking, the strict element
picker, branch steps) but it's being fed the same thin recording data as before. So instead of
starting the big redesign from the top, feed the hungriest machines first. Four priorities:
(1) after every recorded action, classify *what actually happened* (a dialog opened, a value was
set, the page navigated) so the already-running checker verifies something specific instead of
"something changed"; (2) have the recorder notice cookie banners and pop-ups during recording and
suggest "treat this as optional" — the pop-up-handling steps shipped yesterday but nothing can
produce them yet; (3) capture multiple verified element locators live in the browser plus a
"this element is hard to identify" warning while the person is still recording; (4) stamp each
recording with the app's version fingerprint so future drift detection has something to compare
against. Deliberately deferred with reasons: the structured AX-tree capture, the structured intent
upgrade, and the typeahead/table/wizard composites (build typeahead only when a real customer
workflow breaks on it).

---

## Fact-checked the recording-subsystem design doc against the real code — 2026-07-10

**What this is.** The research document `research-analysis/04-architecture/subsystems/recording.md`
described a future redesign of the recorder, but it was written before a lot of recent work landed,
so several of its "this doesn't exist yet" claims had quietly become wrong. Every section now
carries a clear status — ✅ built, 🟡 partly built, ❌ not built — verified against the actual code,
plus a plain-language note on what's still missing and why it matters.

**The headline finding:** the *downstream* half of the design got built first. The deterministic
selector generator, the runtime's strict "don't click unless you're sure" gate, the per-step
"did the click actually do what it was supposed to?" verification, confidence-based wait budgets,
and the "this pop-up sometimes appears" branch steps all exist today. What has *not* been built is
the document's actual thesis — capturing richer signals **at recording time** (in the browser,
while the human is still there). The recorder still sends the same information it always did; the
smarter parts all live in the compiler and runtime, working from that same old capture.

**Stale claims corrected:** the doc said the runtime never independently checks outcomes (it does
now), that an LLM writes the selectors (it doesn't anymore on the normal path), and that
confidence scores were "decorative" (they now drive real runtime behavior). One small loose end
surfaced during the review: the recorder computes a "what changed on the page" diff after every
action that nothing downstream ever reads.

**Also in this update:** `FIX.md` had grown past its ~800-line rotation limit, so the July 7–9
entries (42 of them) were moved into `docs/archive/fix-log/FIX-2026-07.md` and the index updated.

---

## Audited what the Human Edit page shows vs. what a skill package actually contains — 2026-07-10

No code changed — this was a study, written up in
`research-analysis/Human-Edit-vs-Skill-Package.md`. We compared everything stored inside a
compiled skill package against everything the Human Edit screen actually shows or lets people
change, to find blind spots before redesigning the page.

The good news: the page already covers the everyday things well — step order, intents, selectors,
anchors, validation checks, input variables, and screenshots — and the important machine-computed
values (integrity hashes, compile statistics) are correctly kept out of reach.

The concerning finds: a few things the runtime relies on are completely invisible to the person
approving a skill. The biggest is conditional steps ("if a cookie banner appears, do these two
steps") — those hidden sub-steps never appear in the editor at all, so an approver signs off on
steps they never saw. Also invisible: the workflow's overall "plan" the AI compiled (goal and
expected end state), what the runtime will try when a step fails (recovery behavior), the recorded
element's fingerprint (useful for debugging "why did it click the wrong thing"), and a safety flag
that allows forced clicks. The document proposes a three-tier redesign — Review (for approvers),
Reliability (for skill engineers), Diagnostics (for support) — with a prioritized list of what to
expose, all read-only at first so nothing new becomes accidentally editable.

---

## Showed reviewers the "durability score" behind each selector, not just the selector text — 2026-07-10

When someone reviews a recorded step in Human Edit, they've always been able to see and edit the
selector text used to find an element on the page. But there was a lot of important information
about *how good* each selector actually is that never made it into the screen — how likely it is
to keep working after the target app changes, whether it uniquely matched the element when it was
recorded, and whether the app itself (the compiler), an AI, or a person typed it in by hand. That
information was already being calculated and saved every time a workflow was built — it just
wasn't shown to anyone.

Now the Review Selectors screen shows two new labels on every selector: an "orthogonality" badge
(what *kind* of thing about the page it depends on — a test ID, visible text, position on screen,
etc.) and a "source" badge (compiler, AI-assisted, or manually edited). A new "compile confidence"
percentage also appears at the top of that screen, giving a one-number summary of how trustworthy
the whole set of selectors is for that step. Selectors that were hand-edited are now correctly
marked as manual, instead of keeping whatever label they had before the edit.

A companion "Current identity" card was also built for the Pick Element screen, meant to show this
same information for the step's existing (already-compiled) selectors before someone decides
whether to re-target anything — but it isn't wired into that screen yet, since that screen is
under active, separate work right now. The card itself is finished and tested; connecting it is
follow-up work (tracked in TODO.md).

---

## Fixed "no usable selector" error when re-targeting an element by drawing a box — 2026-07-10

On the Human Edit screen's re-target wizard, drawing a new box around an element and clicking
Continue almost always failed with "No usable selector could be generated for this region," even
for a perfectly good element. Two problems were causing this.

First, there was a plain bug: the code was accidentally handing the AI the wrong piece of
information about the element (a bundle of already-built selector strings instead of a
description of the element itself — its tag, its visible text, its label), so the AI had almost
nothing useful to work from.

Second, and more fundamentally, the system had no way to figure out which element on the page a
freshly drawn box was pointing at — it only remembered the position of the one element that was
originally clicked during recording, and it never gave the AI the actual screenshot, so drawing a
box over a different button or link couldn't work even once the first bug was fixed.

The fix teaches the wizard to actually look at the picture. When someone draws a new box now, the
system highlights that region in red on the recorded screenshot and sends the image — along with
the page's underlying structure — to an AI that can see images, so it can visually identify the
exact element inside the box and produce a selector for it. This is the same "look at a
screenshot" technique already used elsewhere in the compiler to describe elements in plain
language; it's now been extended to also produce a working selector. Redrawing the same box twice
reuses the previous result instead of asking the AI again, so it doesn't cost extra every time.

---

## Fixed ugly step labels in the workflow step list — 2026-07-10

The step list in the workflow viewer was showing broken or hard-to-read labels for some
steps: "Focus" steps with no visible text showed literal empty quotes (`Focus ""`)
instead of just saying "Focus", and "type" steps (typing into a text box) fell through
to a generic catch-all and showed the raw internal name for what the step was doing,
like `type — enter_input_value`, instead of a real sentence. Also added proper wording
for several other step kinds (selecting from a dropdown, checking a box, picking a
date, dragging and dropping, uploading a file, keyboard shortcuts, waits, and more)
that previously all fell through to that same raw-internal-name fallback. Any step kind
that still isn't explicitly handled now at least shows its internal name converted to
plain words (e.g. `custom_thing` becomes "Custom thing") instead of the raw
underscored version.

---

## Added a "show all recording screenshots" button to the Human Edit screenshot picker — 2026-07-10

In the Human Edit screen's "Recording screenshots" pop-up, a step could previously only pick from
the 5 timed frames captured around when it happened (half a second before to half a second after).
Added a button that flips the pop-up to show every screenshot captured across the entire recording
instead, so a step can borrow a clearer image from anywhere else in the flow if the 5 nearby frames
aren't good enough. Clicking the button again switches back to the 5-frame view. Picking one of the
"all screenshots" images works the same way dragging one onto a step already did — it attaches that
screenshot to the step and re-runs the visual matching for it. The screen already had a working
backend endpoint for listing every recording screenshot that nothing in the interface was calling;
this wires it up to the new button instead of building anything new on the backend.

---

