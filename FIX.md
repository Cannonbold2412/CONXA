# Fix Log

> Rotated monthly into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Made the Human Edit screen look and feel like a finished, professional product — 2026-07-09

The user looked at a screenshot of the Human Edit screen and said it "isn't looking good" and
asked for it to be made "enterprise level." Looking closely, the screen wasn't badly designed —
it was inconsistent: different sections used different-looking cards, colors for "this is good" /
"this needs attention" were picked ad hoc in each spot instead of matching everywhere, and buttons
that mattered (like Approve) looked the same as ordinary ones.

**Visual consistency, applied everywhere on the screen:**
- Every panel (the step list, the wizard, the tools sidebar) now shares one consistent "raised,
  slightly glossy" background instead of three different flat looks.
- Green/amber/red now always mean the same thing everywhere they appear — a shared color system
  replaces colors that used to be picked separately, and sometimes differently, in each component.
- The app's signature clay-orange brand color is now a proper, reusable button style instead of a
  copy-pasted style string.
- Section titles got a clearer size difference from body text so the page reads with a real
  hierarchy instead of everything looking the same weight.

**Three new things added, all pulling from information the app already had — nothing new to
compute or fetch:**
- A **confidence banner** now sits right at the top of the screen: "Looks solid" in green when
  there's nothing to worry about, an amber "Review N flagged steps" when there's something worth
  a look, or a red "Fix N blocking issues" when something must be fixed before approving. This was
  already being tracked one tab deep in "Suggestions" — now it's the first thing anyone sees.
- A new **"How Claude sees this"** tab shows, in plain language, what a customer's Claude Desktop
  will understand about this skill — its name, a summary of what it does, and what inputs it needs
  — so a person editing the workflow can see it through the AI's eyes, not just their own.
- The **"Finish editing"** button is now **"Approve"** — a more deliberate, confirming action with
  its own icon, matching a rename that was already planned on the roadmap but hadn't been built
  yet. Nothing about what it actually does changed — it still signs off and builds the same way.

**Verified for real, not just by reading the code:** launched the actual Build Studio app, opened
a real saved skill, walked through Pick element → Review selectors, and opened the new tab —
screenshotted every step to confirm it looks and works as intended before calling this done.

---

## Merged in a big cloud-built change: Publish Skill Package is now the real release button — 2026-07-09

**What happened:** A large set of changes was prepared separately (in a cloud session) and handed to us as a patch file to apply — the same "Publish Skill Package becomes the real release button" work already summarized a few entries down ("Made 'Publish Skill Package' the real, primary way to ship updates"). Applying it on top of everything else that had changed locally in the meantime wasn't a clean drop-in: about a third of the patch's files had since been touched by other work here too, so each overlapping file had to be checked by hand and reconciled rather than blindly overwritten.

**What we found and fixed:**
- Several files (`BuildInstallerPage.tsx`, `handlers/plugins.py`, this Fix Log, `TODO.md`, and a few docs) had already been independently updated locally to basically the same end state the patch wanted — those just needed a quick side-by-side check, not a real merge.
- One page, `BuildInstallerPage.tsx`, was left in a half-cleaned-up state from that overlap: it still had a leftover "open the release dialog" button wired to release-notes fields that no longer existed anywhere in the file. That would have broken the app the next time someone tried to open Build Installer. Removed the dead code so the page matches its new, simpler job — packaging a release that was already published elsewhere, instead of collecting version/notes itself.
- The bigger catch: our merge tool reported most of the patch's other ~20 files (the cloud backend's publish/entitlements/tracking routes, the Build Studio Python backend, two brand-new shared UI components, and the new Publish Skill Package page itself) as "applied cleanly" — but they actually hadn't been written to disk at all, because one failed file in the same batch silently cancelled the whole group. Caught this by checking that the promised changes were actually present, then reapplied that whole group properly. Without catching this, the app would have shipped with Build Installer pointing at UI components (`BuildLogUi.tsx`, `PluginListSidebar.tsx`) that didn't exist yet.
- Docs (`docs/UI-UX-Brief.md`, `docs/Implementation-Plan.md`) still described Publish Skill Package as an unfinished placeholder in a couple of sections; updated those to say it's the real, shipped release action now.

**How we checked it was safe:** ran the full TypeScript typecheck (clean, zero errors) and the relevant Python test suites (67 passing). Four unrelated tests failed both before and after this work, confirming they're pre-existing issues, not something this merge broke.

**Also cleaned up:** this Fix Log itself had accidentally ended up with the same 177 lines of entries duplicated twice in a row, left over from an earlier step of this same merge. Removed the duplicate copy and rotated the older (2026-07-04 through 2026-07-06) entries into the monthly archive to keep this file a reasonable length.

---

## Closed a gap where drawing a new box could offer non-unique selectors again — 2026-07-09

Right after adding the "hide junk selectors" rule (matches-more-than-one and under-30%-durability
get hidden), the user asked: "well selectors can all pass if they are not unique" — a good catch.
The new rule had only been wired into the path where you continue *without* redrawing. The other
path — where you actually draw a *new* region and the AI proposes fresh selectors — never got the
same filter, so a selector matching several elements, or one far too fragile to rely on, could
still slip through and be offered there.

**What changed:** the exact same rule — no non-unique matches, nothing under 30% durability — now
applies whether you're just reviewing or you drew a brand-new region. Re-picking the element no
longer gets a weaker bar than reviewing it. Added a dedicated test proving a freshly-redrawn pick
still gets a non-unique candidate and a too-fragile-but-technically-unique candidate both hidden,
keeping only the strong option; adjusted two older tests that had been asserting the old, looser
behavior. Full suite: 20/20 passing.

---

## Hid the junk options from "Review selectors" — 2026-07-09

The user asked why two clearly-bad options were still listed on "Review selectors": one that
matched more than one thing on the page ("Not unique"), and an extremely fragile one (an exact
address-in-the-page path rated 1% durable). Their point: don't offer these, and don't let them
reach the running skill.

**First, the reassurance:** at run time those weak options were never dangerous — the runtime
has a hard rule that it won't act on a selector unless it clearly, uniquely identifies one
element, so a "not unique" option can't make it click the wrong thing, and the fragile path
simply misses harmlessly if the page changed. They were gated last-resort backups, not risks.

**What changed:** the review list now hides those two kinds of options — anything that matched
more than one element, and anything below a **30% durability** cutoff (per the user's follow-up:
anything under 30% doesn't move forward). If nothing clears the bar, the list is left empty and
the wizard asks the user to re-pick, rather than offering a too-weak selector. And since applying
the wizard rewrites the skill's backup selectors from whatever's shown, applying after a review
now also removes those junk backups from the skill, so they no longer reach the runtime — exactly
what the user wanted. On the user's real skill the screen went from 5 options (2 of them junk)
to the 3 strong, unique ones (Test ID, Role, Visible text).

**Follow-up (same day):** raised the cutoff from an initial 10% to a hard **30%** and removed the
"always keep the strongest" safety net, so a sub-30% selector never moves forward even if it's
the only one left.

---

## Stopped "Review selectors" from calling verified options "Unverified" — 2026-07-09

The user noticed that several options on the "Review selectors" step were labelled "Unverified"
and asked, reasonably, whether they had to record again to get them verified. They don't — and
the label was misleading.

**What was going on:** when a workflow is compiled, the app already checks each way of finding
the element against the recorded page — including the browser's accessibility information — and
records whether each one uniquely finds the element. But the wizard was ignoring that and
re-checking with a much simpler tool that only understands plain website structure, not the
smarter "find by role/label/visible-text" options. So those perfectly-good options came back as
"Unverified" even though they'd already been confirmed at record time.

**What changed:** the review step now reuses the verification the app already did at compile
time. Options that were confirmed to uniquely find the element now show "Unique match" (with the
correct type label — e.g. a "find by role" option no longer gets mislabelled as "find by name"),
options that genuinely matched more than one thing stay flagged, and the rare option that truly
can't be checked ahead of time now says the clearer "Checked at run time" instead of the scary
"Unverified". No re-recording needed, and still no AI call on this path. Verified against a real
saved skill: its role/label/text options now read as verified instead of unverified.

**Bottom line for the user's question:** no, you never have to record again just to verify —
the verification happens at compile time (and again for real in the browser when the skill runs).

---

## Made the "Review selectors" step actually show the selectors — 2026-07-09

On the wizard's "Review selectors" step, every option looked the same — each row just said
`button "New"` with some badges and a bar — because the thing that actually tells them apart, the
selector text itself, was tucked away behind a "Show raw selectors" toggle that was closed by
default. So the user was being asked to *review selectors* without being shown any selectors.

**What changed:** each option now displays its real selector text right on the row (in a
monospace font), always visible. The bar underneath now has a plain "X% durable" label next to
it so it's clear what it means. The old toggle no longer duplicates the selector list — it now
only holds the "type your own selector" box for advanced users. Nothing about how a selector is
chosen or applied changed; this is purely making the already-computed information visible.

---

## Stopped the re-target wizard from re-running the AI when nothing changed — 2026-07-09

The user pointed out that clicking "Continue" on the first step of the re-target wizard was
asking the AI to work out the element's selectors all over again — even when they hadn't changed
anything and were only reviewing. Those selectors were already worked out when the workflow was
compiled, so redoing it was wasted time and wasted paid AI usage.

**What changed:** the wizard now only asks the AI to regenerate selectors when you actually draw
a **new** region for the element. If you just continue without redrawing — the common "let me
look at what's there" case — it shows the selectors that were already produced at compile time,
instantly, with no AI call and without spending any of your Human Edit allowance. As a bonus,
that review path no longer needs the original recording to still be on disk, so it works for
older skills too. Redrawing the box still triggers a fresh AI regeneration exactly as before.

**Also fixed a hidden test gap:** the existing tests for this feature were checking against the
*wrong* internal shape (the same wrong spot behind the earlier "Continue did nothing" bug), which
is why that bug slipped through green. The test fixtures now match what the compiler actually
produces, and new tests confirm the review path never calls the AI (and still works with no
recording session). Full re-target test suite green (15 tests); renderer typecheck and lint pass.

---

## Split the re-target wizard into three real pages — 2026-07-09

The re-target flow used to be one page that swapped its contents between the three steps ("Pick
element" → "Review selectors" → "Confirm & apply") without the web address ever changing. The
user wanted each step to be its own page, so clicking "Continue" actually moves to a new page.

**What changed:** each step is now its own page with its own address:
- Pick element — `.../retarget/<step>`
- Review selectors — `.../retarget/<step>/selectors`
- Confirm & apply — `.../retarget/<step>/confirm`

Clicking "Continue" now navigates to the next page (and the browser Back/Forward buttons walk
between the steps). Because moving between pages normally wipes what you were doing, the choices
you make along the way (the region you drew, the selector list, the selector you picked, the
keep-the-existing-check option) are now remembered in a small shared place so they carry across
the pages. If you jump straight to the "selectors" or "confirm" page without having done the
earlier step first — for example by reloading or opening a saved link — it sends you back to the
first step so you always start from a valid point. Nothing about *what* the wizard does changed;
only that it's now three pages instead of one. Applying still saves everything in one go and
returns you to the editor.

**Under the hood:** new `RetargetPickPage`/`RetargetSelectorsPage`/`RetargetConfirmPage` pages
and a shared `retargetStore` replace the old single `RetargetWizard` component; the three phase
UIs (`RetargetPhasePick`/`Selectors`/`Validation`) are reused unchanged. Renderer typecheck and
lint pass.

---

## Fixed the real reason "Continue" on re-target step 1 went nowhere — 2026-07-09

The user reported that clicking "Continue" on the re-target wizard's first step still didn't
take them to the "Review selectors" step. The two earlier fixes today changed the *screen*
behaviour, but the button was actually failing before it could move on — for a reason none of
the earlier fixes touched.

**What was wrong:** to build the list of selectors to review, the wizard has to find the
original recording moment the step came from. It was looking for that reference in the wrong
place inside the saved step, so it always came up empty and decided "the original recording is
gone" — quietly refusing to continue, every single time, for every step. (The 1-click-fix
feature was looking in the same wrong place and silently doing nothing too.)

**What changed:** `conxa-builder/python/conxa_compile/editor/retarget.py` and
`conxa-builder/python/conxa_compile/compiler/patch.py` now read that recording reference from
where it's actually stored on the step. Verified against a real saved skill on disk: all of its
steps now correctly match back to their recording, so "Continue" advances to "Review selectors"
as expected.

---

## Stopped the re-target wizard from skipping past "Review selectors" — 2026-07-09

The user asked why clicking "Continue" on the re-target wizard's first step wasn't taking them
to the "Review selectors" step.

**What was wrong:** the wizard had a shortcut — if the element it found already had a strong,
unique selector and nothing about how the step is checked needed to change, it would jump
straight from step 1 to step 3 ("Confirm & apply"), skipping step 2 entirely. This was meant
as a convenience for the clearly-nothing-to-review case, but after yesterday's change made step
1 default to the step's existing (already-good) target, this shortcut fired on almost every
"just continue" click — so the review step most people expect to see was silently disappearing
nearly every time.

**What changed:** `conxa-builder/electron/renderer/src/components/retarget/RetargetWizard.tsx`
now always goes to "Review selectors" after step 1, no exceptions. Step 3 still shows a
condensed "looks good, nothing to change" view when nothing about the validation check needs
updating — that part was unrelated and stays.

---

## Let re-target step 1 be reviewed and continued without forcing a redraw — 2026-07-09

Yesterday's fix made step 1 of the re-target wizard require drawing a new box before
"Continue" would enable, and labelled the existing box "Current target" on the screenshot.
The user pointed out this was wrong for the common case: often the step's current target is
already correct and you're just reviewing it — there's no reason to force a redraw, and the
label text sitting on top of the screenshot wasn't wanted.

**What changed:** `conxa-builder/electron/renderer/src/components/retarget/RetargetPhasePick.tsx`
now starts step 1 with the step's existing target already selected, so "Continue" is enabled
right away — drawing a new box is optional, only needed if you actually want to change the
target. The "Current target" / "New selection" text labels on the screenshot are gone;
`conxa-builder/electron/renderer/src/components/ScreenshotViewer.tsx`'s label/colour-variant
overlay code was removed along with them since nothing else used it.

---

## Made every step-save error in Human Edit show plain language, not raw technical text — 2026-07-09

The app has a dictionary of plain-English explanations for backend error codes (e.g. "Choose
one of the generated selectors before applying" instead of a raw code like
`primary_selector_required`), used almost everywhere errors are shown. But the step editor
panel's own "save this step" logic wasn't using it — six separate save paths (navigate, wait,
screenshot, check/assert, scroll, and the general selector/target save) built their error
message straight from the raw backend exception text instead, so any failure while saving a
step — even a small, common one — showed a technical message instead of a helpful one.

**What changed:** `conxa-builder/electron/renderer/src/components/StepEditorPanel.tsx` now
routes every one of those six save-error messages through the same plain-language dictionary
as the rest of the app. Also added a missing entry to that dictionary
(`conxa-builder/electron/renderer/src/lib/errorMessages.ts`) for a re-target wizard edge case
("that selection isn't a valid region") that had no friendly text yet.

---

## Made the re-target wizard's "Continue" button always visible on step 1 — 2026-07-09

The previous fix made the "Continue" button appear only after successfully drawing a box, but
that turned out to be fragile — several things could make the drawing silently not register
(too small a drag, or a step type the drawing tool quietly refused to work on), and each one
looked identical from the outside: no button, ever, with no explanation why.

**What changed:** the "Continue" button on step 1 of the re-target wizard is now always on
screen — grayed out with a hint ("Draw a box on the screenshot above") until you've drawn one,
then it lights up. Drawing a box that's too small now tells you so with a small message instead
of silently doing nothing. And steps that scroll the page (which have no single element to
re-target) now show a clear explanation and a fallback button, instead of a screenshot that
looks drawable but isn't. The box you draw is also now labelled "New selection" in a different
colour than the step's original recorded target ("Current target"), so the two are never
mistaken for each other.

---

## Fixed the real reason "Review" was still slow to load — 2026-07-09

The user reported (again) that clicking "Review" to open a workflow in Human Edit took too long. A previous fix this same day removed one cause of slowness, but a bigger one was still there.

**What was wrong:** every time a workflow opened for review — and after every single edit you made inside it — the app read every screenshot image for every step off disk and converted each one into a giant block of text (base64) to embed directly in the response, before it would show you anything. A workflow with, say, 15 steps and a handful of screenshots per step meant well over a hundred image files being read and re-encoded synchronously, one after another, on every load and every save. This was a workaround for an Electron quirk (the app window can't normally load raw local files as images), but it meant every screen refresh paid the full cost of every image in the whole workflow, whether you were looking at it or not.

**What changed:** the desktop app now has a dedicated, safe channel (`conxa-asset://`) for loading local screenshots directly, the same way a normal image would load from the internet — on demand, only when actually shown, and cached by the browser so it doesn't reload the same picture twice. `conxa-builder/electron/main.js` serves images through this channel; `conxa-builder/python/conxa_compile/editor/assets.py` now just points to an image instead of reading and re-encoding it. Opening or editing a workflow no longer waits on every screenshot in it — screenshots simply load in as they're needed, like images on any web page.

---

## Added a visible "Continue" step after drawing the box on the re-target page — 2026-07-09

Drawing a box on the first step of the re-target wizard used to kick off the element search
immediately on mouse-release, and the box itself disappeared the instant you let go — so there
was nothing on screen confirming what you'd drawn, and no button to press next. Now the box you
drew stays visible after you release the mouse, and a "Continue →" button appears so you can
review it (or redraw) before the search runs.

## Fixed a crash on the re-target page: "Tooltip must be used within TooltipProvider" — 2026-07-09

The user hit an error screen with this exact message when using the app.

**What was wrong:** several components (the screenshot viewer, the suggestions panel, the step list) show little hover tooltips, and that only works if something further up the screen sets up a "tooltip provider" first. Two screens did that setup themselves, but nothing did it app-wide — so any screen that showed a screenshot with tooltips *without* being one of those two specific screens would crash outright. The new "Re-target element" page (added yesterday) hit exactly this gap, since it shows the same screenshot component but is its own separate page.

**What changed:** `conxa-builder/electron/renderer/src/components/layout/AppChrome.tsx` — the wrapper that every single screen in the app renders inside of — now sets up the tooltip provider once, for the whole app. This closes the gap for the Re-target page and makes the same crash impossible on any future screen, not just this one.

---

## Stopped the Human Edit screen from scanning every saved skill every time you open one — 2026-07-09

The user reported that clicking "Review" to open a workflow in Human Edit was slow to load.

**What was wrong:** the Human Edit screen loads two things whenever it opens: the one workflow you actually asked for, and — unconditionally, every single time, even when you already picked a workflow — a full list of every skill ever saved on disk (used only by the "resume a saved skill" dropdown shown when *no* workflow is selected yet). That second list requires reading and parsing every saved skill file one by one, so the more workflows you've built up over time, the slower every "Review" click got, even though that list is never shown or used once a specific workflow is already open.

**What changed:** `conxa-builder/electron/renderer/src/pages/HumanEditPage.tsx` now only fetches that saved-skills list when you're on the empty "no workflow open yet" screen where it's actually shown. Opening a specific workflow via Review skips it entirely.

---

## Merged the Dashboard and Record pages into one — 2026-07-08

The user pointed out that the Build Studio had two screens doing overlapping jobs: "Dashboard" listed all your plugins and let you create or delete one, while "Record" was a separate screen where you actually recorded a login or a workflow — and it had its own, second plugin list you had to pick from all over again. That meant picking the same plugin twice just to start recording, and two different "home" screens competing for the same job.

**What changed:** Dashboard is gone. Everything it did — the "New Plugin" button, deleting a plugin, and the search/filter bar — now lives inside Record's left-hand plugin list, which was already the nicer of the two screens (it showed live status, wasn't just a static grid of cards). Record is now the single home screen: open the app and you land there, pick or create a plugin on the left, and record its login or a new workflow on the right, all in one place. Old links and bookmarks to the Dashboard page still work — they just take you straight to Record now. Nothing on the backend changed; every button reuses the exact same save/delete/record actions that already existed.

---

## Turned the re-target wizard from a small popup into its own full page — 2026-07-08

Yesterday's 3-step "Re-target element" wizard opened as a small popup box floating over the still-visible, dimmed step editor behind it. The user pointed out this was wrong: drawing an accurate box around an element needs real room, reviewing several candidate selectors with scores needs room, and seeing the old screen dimly visible behind a "guided flow" popup is confusing rather than focused.

**What changed:** clicking "Re-target element" now takes you to its own dedicated page (its own web address inside the app, `/edit/<skill>/retarget/<step>`) instead of opening a popup. It has a normal page header with a "Back to editor" button, and going back returns you to exactly where you were in the step editor with everything up to date. Nothing about the 3 steps themselves changed — Pick element → Review selectors → Confirm & apply still work the same way — only the container around them changed from a small floating box to a full page.

---

## Filled the empty strip at the top of every Build Studio screen with a breadcrumb — 2026-07-08

The user shared a screenshot with an arrow pointing at a big blank gap sitting between the window's title bar and the start of each page's content, asking for it to be filled in so the app reads as more "enterprise level" everywhere, not just on one screen.

**What changed:** `conxa-builder/electron/renderer/src/components/layout/AppChrome.tsx` — the top bar that wraps every page (Dashboard, Record, Compile, Human Edit, Test Skill, Publish, Build Installer, Settings, and any plugin/skill sub-page) now shows a breadcrumb on the left: a small icon chip plus "Operate / Human Edit" style text that tells you where you are, instead of empty space. It's driven off the current URL automatically, so no individual page had to be touched — every screen gets it for free since they all render inside this shared chrome.

**Not yet verified visually** — this app requires the Electron shell (native `window.conxa` bridge) to run, which isn't available in this sandboxed environment, so this was checked with TypeScript and ESLint only, not a live screenshot.

---

## Wrote the target-customer list: 50 named companies and a plan for landing the first ten — 2026-07-07

No code changed — this is the third planning artifact from today's strategy discussions, turning the "who would actually buy this" question into a concrete, named list.

**What was created:** a new document, `research-analysis/07-go-to-market/TARGET_CUSTOMERS.md`, with 50 real companies across four rings: global giants (Deloitte, Constellation Software, Pfizer and the like — all explicitly marked "don't approach yet"), big Indian enterprises (banks, pharma, the large IT firms, plus Zoho and Freshworks as marketplace partners), Pune enterprises (Persistent, Bajaj Finserv, KPIT and others — the warm-intro home turf), and Pune startups/small SaaS companies — the section that matters most, because small SaaS vendors are the customers the whole business thesis is built on.

**The headline recommendations it lands on:** the first ten customers are almost all Pune companies, led by small SaaS vendors like Sell.Do (real-estate CRM) whose non-technical customers are exactly who "ask Claude to do it" serves; the best first *enterprise* customer is Persistent Systems (local, tech-savvy, no compliance gate, and a door into hundreds of their clients); and the outreach order is strict — local small vendors first, partner firms second, regulated Indian enterprises only after the security certifications land, global giants last and preferably through consulting-firm channels. The document is deliberately blunt that every company entry is a hypothesis to verify before anyone sends an email, not researched intelligence.

---

## Round two of the enterprise-strategy discussion: found the places where clicking beats APIs even for giants — 2026-07-07

No code changed — this is the second planning pass of the day, recorded in the backlog like the first.

**The new insight.** The earlier entry answered "how do giants pay us *eventually*." This pass asked a sharper question: is there anywhere a giant with unlimited engineers would *still* choose browser automation over their own APIs? Turns out yes, in exactly two situations: when building an integration would never pay for itself (because the system being automated is temporary), and when the *screen itself* is the thing being checked (so an API answer is worthless by definition).

**What was added to the backlog (`TODO.md`):**
- **PROD-14 — Audit evidence packs.** Companies pay teams of analysts every audit season to log into dozens of systems and screenshot proof for auditors — and auditors *require* screenshots of what a human sees; a data export doesn't count. Conxa already produces exactly that: same steps every time, no AI improvising, a screenshot before and after every step. This turns existing machinery into a product big enterprises would buy without it competing with a single API.
- **PROD-15 — "Bridge automation" for mergers and dying systems.** When a company acquires another or retires an old system, nobody builds integrations for software that will be gone in a year — so people do the work by hand for the whole transition. Recording a workflow in an afternoon and running it until switch-off is a use case where "just build the API" never makes sense, even for a giant. Includes a future "shadow-run" feature: run the same task on the old and new system side by side and compare results before cutover.
- **PROD-16 — A decision the founders must make on purpose.** Several enterprise ideas need one rule change: today a company can only automate websites whose *domain* it owns; enterprises don't own salesforce.com, but they do own *their account* (tenant) inside it. Extending verification to "prove you're the admin of your own tenant" would unlock evidence packs across SaaS tools, retesting customized SaaS after vendor updates, and IT chores like offboarding. The original strategy review explicitly warned this kind of loosening must be a deliberate decision, never a drift — so it's now written down as exactly that: a decision, with either answer acceptable.
- The existing partner-strategy item (PROD-13) got the two remaining ideas folded in: pitching internal-tool automation as "make your legacy systems AI-agent-ready" (a budget every CIO has right now), and recordings doubling as living, executable process documentation.

**What still didn't change:** the near-term plan and the "only automate what you own" rule — PROD-16 is the *question* of whether to extend that rule, not an extension of it.

---

## Wrote down the "how do the giants ever pay us" strategy as real backlog items — 2026-07-07

No code changed in this update — this is planning, recorded so it doesn't evaporate after a conversation.

**The question it answers.** During a founder discussion, the question came up: our own analysis says big companies like Salesforce will always prefer their own APIs over Conxa — so how do we ever get a giant to pay us, partner with us, or buy us? The answer that got recorded: you don't win a giant by trying to automate *their* product (they'll always build that themselves). You win them one of four other ways — become the tool that makes their *marketplace of small partner apps* work with AI agents; automate their own *internal* tools that have no APIs; own a *dataset* about UI durability that nobody can copy without a fleet of runners; or own the *format* that governed AI workflows are written in, so it stays valuable no matter which execution technology wins. All four are reached by winning small vendors first — there's no shortcut.

**What was added to the backlog (`TODO.md`):**
- **ARCH-3 (do soon):** draw a clear line inside the skill file format between "what the workflow *means*" (steps, checks, safety rules) and "how the browser *replays* it." Cheap to do now while the format is still changing; very expensive to untangle later. This is the foundation of the "own the format" play.
- **EXEC-9 (do soon):** upgrade the usage-reporting events so every run records *which* backup identification method actually found each button. That's the raw material for the "uncopyable dataset" — and every run that happens before this exists is training data lost forever, which is why it's marked urgent even though the learning system that will use it comes later.
- **PROD-13 (later, needs a founder decision):** the partner-program play itself — when to approach a platform giant and which one first. Explicitly waits until we have paying small vendors and good cross-account numbers to show.
- Two existing items got a sentence added: domain verification (PROD-6) should be designed so a platform or IT department can one day vouch for many domains at once, and the "works with any AI app, not just Claude" work (PROD-5) is flagged as a hard prerequisite for any partner conversation.

**What deliberately did *not* change:** the near-term plan. Small and mid-sized vendors remain the target; nothing was added that automates other companies' products, because that would break our own "only automate what you own" rule and compete with native APIs exactly where they always win.

---

## Started building the redesigned Build Studio: new sidebar, auto-build on approve, and a package inspector — 2026-07-07

**What this is.** The design proposal from earlier today (see the entries below) is now actually being built, not just written down. This is the first working slice of it.

**What changed for someone using Build Studio:**
- **The left sidebar now matches the six-step flow instead of the compiler's internal stages.** It used to say "Dashboard, Build Plugin, Packages, Test Plugin, Build Installer" — four of those names meant nothing to a non-engineer. It now says **Dashboard, Record, Compile, Human Edit, Test Skill, Publish Skill Package, Build Installer** — one button per real step in teaching Conxa a task.
- **You pick your automation once, and every page remembers it.** Previously, Build, Test, and Build Installer each made you re-pick the same plugin from a separate list. Now there's one shared "current automation" picker at the top of every page.
- **Approving a workflow now finishes the job automatically.** Before, after reviewing and approving a workflow in Human Edit, you had to separately go find the "Build Plugin" page and click Build. Now, the moment every workflow in an automation has been approved, the package builds itself — no extra page, no extra click. If something else still needs approving first, you're told exactly what's pending. If the automatic build fails for some reason, you're told that too — the earlier version of this button silently ignored failures.
- **A new "Inspector" panel replaces the old "Packages" page.** The raw list of compiled files (execution.json, recovery.json, folder paths — engineer-only stuff) used to be its own permanent item in the sidebar. It's now tucked behind an "Inspector" button on each automation's overview page, open only when you actually want to look under the hood. It also has a "Rebuild package" button for the rare case you need to force a rebuild by hand.
- **The installer version suggestion is now actually useful.** It used to always suggest "0.1.0" as the next version, even after you'd already shipped version 1.2.0. It now suggests the next real version after whatever you last shipped.
- Two small bugs got fixed along the way: clicking "Compile" right after finishing a recording used to quietly run the compile twice and then fail; and approving a workflow used to silently swallow errors instead of telling you something went wrong.

**What's still the same:** compiling still costs a credit and still runs on the older, single-at-a-time screen for now (making it a proper background job with live progress is the next phase); Publish Skill Package is a placeholder page for now — publishing still actually happens from Build Installer until that gets split out.

**Where it lives.** `conxa-builder/electron/` (the app itself) and `conxa-builder/python/` (the backend). A full gap analysis and step-by-step plan for the rest of this work lives in `conxa-builder-workflow-redesign.md` and `docs/Implementation-Plan.md` §1.9.

---

## Made "Publish Skill Package" the real, primary way to ship updates — and installers now travel light — 2026-07-09

Until today, shipping any update to customers meant clicking "Build Installer," which secretly did three things at once: published your skill pack to the cloud, built a whole new Windows installer with every skill's files baked inside it, and uploaded that installer back to the cloud — and if that last upload step failed for any reason (file too big, a network blip), the *entire* operation was reported as failed, even though your skill pack had already published successfully and a perfectly good installer was already sitting on disk.

**What changed, in plain terms:**
- There's now a real **Publish Skill Package** page. This is the button you click for almost every update — it uploads your changed skill pack to Conxa Cloud, keeps a running history of every version you've ever released (with your release notes and the date), and customers who already have Conxa installed get the update automatically the next time their app checks in. No installer rebuild needed.
- **Build Installer** is now a separate, secondary page for the rarer case where you actually need a new installer (e.g. a brand-new customer). It requires you to have already published a skill pack release first, and it now packages a much smaller installer — one that carries only the company's connection settings, not a copy of every skill's files. Everything else gets fetched automatically after install.
- Uploading the installer file to the cloud is now optional. If that upload fails or is skipped, Build Installer still reports success — your local installer file and your published skill pack are both fine either way. Uploading the *skill pack* itself, on the other hand, is mandatory: if that fails, publishing fails, since that's the whole point of the action.
- Behind the scenes, every network address the installer/runtime uses now carries a small version tag (like "v2") so Conxa can eventually retire an old address scheme for brand-new installers without breaking anyone already running an older one. Nothing currently installed changes behavior from this — it's forward-looking plumbing.
- Fixed a real bug found while building this: a customer's Conxa installer previously wouldn't reliably pick up a brand-new skill added to their company well after installation — the local record of "which skills do I have" only ever updated when something changed, so a no-op check-in silently never refreshed it. Every check-in now refreshes that list unconditionally.
- Also fixed a subtler bug introduced (and caught) during this same work: the very first version of the "how many skill packs has this workspace published" counter would have let a workspace exceed its plan's limit, because the accounting briefly claimed a brand-new product slug *before* checking whether there was room for it. Caught by a test before it ever shipped.

**Where:** the cloud backend gained several new versioned API routes alongside the old ones (which keep working forever, unchanged, so nothing currently installed anywhere breaks); Build Studio's publish/installer-build logic was split into two independent actions; the installer's internal NSIS packaging script now leaves out skill files entirely; and the runtime's background sync logic got the "always refresh what skills I have" fix described above.

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
