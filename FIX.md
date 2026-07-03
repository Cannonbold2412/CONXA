# Fix Log

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

## New companion doc: every problem with both the founder's and Fable's solutions, in plain language — 2026-07-03

Created `research-analysis/conxa-solutions-by-problem.md`. It's a simpler companion to the
main critical-analysis file. For each of the 10 problems it lays out, side by side and in
everyday language with a concrete example:

- **The problem** — what's wrong, with an example.
- **What the founders say** — the founders' solution(s), with an example.
- **What Fable says (my answer)** — Fable's own solution(s), including the new ideas, with
  an example.
- **Where it stands** — current severity and whether it's built yet.

It ends with a one-page table listing every founder solution and every Fable solution across
all 10 problems. The goal is that a non-technical reader can see, per problem, every idea we
have to fix it — without reading the full analysis. Two problems (the wrong-click safety
system, and the connector-squeeze answer) are noted as ones the founders asked Fable to solve.

---

## Critical-analysis report: added Fable's own solutions section — 2026-07-03

A new §8 was added to `research-analysis/conxa-critical-analysis.md`: Fable's own answer to
each of the ten problems — separate from the founders' answers, written as "what I would
actually do." Where the solution was already in the build plan it says so; five ideas are
genuinely new:

1. **Free self-serve operability scanner** — publish the recordability pre-check as a free
   "paste your URL, get an AI-operability score" tool, so every scan is a qualified lead
   and market data at the same time.
2. **Backend-agnostic skill contract** — define the skill as a governed spec (steps, entity
   bindings, verifications, audit) with the executor pluggable underneath: browser today, an
   official connector after graduation, even a computer-use model someday. Whichever
   execution technology wins, Conxa owns the layer above it.
3. **Per-tenant learning overlay** — after every successful run, quietly update local signal
   weights for that customer's account, so skills *converge toward* each tenant instead of
   merely surviving it. Signed pack untouched, same rule as repair memory.
4. **Vendor-controlled automation sessions + a declared automation lane** — since the vendor
   owns the target app (Option A), they can issue longer-lived sessions for their own
   automation and recognize the runtime's signed traffic as a first-party class, turning
   both the auth ceiling and the bot-blocker question into configuration.
5. **Skill CI in the vendor's deploy pipeline** — a "conxa test" step that dry-runs published
   skills against staging on every deploy and fails the build if a skill breaks. Drift gets
   caught on a Tuesday before release instead of by customers. Possibly Conxa's most
   differentiated feature, and it falls out of Option A almost for free.

Plus two smaller ones: publish per-skill safety numbers as SLOs, and a queue rule of
"parallel across apps, serial within an app" so write conflicts disappear by construction.
The last two sections were renumbered (§9 going-forward, §10 final word).

---

## Critical-analysis report: final clean rewrite with all twelve answers integrated — 2026-07-03

`research-analysis/conxa-critical-analysis.md` was rewritten one final time. After answers
10–12 (open MCP standard, domain verification, and the safe-action system) were bolted onto
the previous version, the document had grown patchy again. The final version integrates
everything cleanly:

- **Header:** the four recorded decisions up front (Option A with SMB vendors as the target,
  signed installers, Mac versions, domain-verified vendor-owned software only).
- **§2:** all ten problems in one table showing where each *started* and where it *stands
  now* — every one has an answer on record; the dividing line is now "built vs. not yet
  built," not "answered vs. unanswered."
- **§3:** all twelve answers with honest verdicts, cleanly written — including the two
  Fable wrote at the founders' request (the connector-squeeze answer and the five-layer
  safe-action system) and the strongest founder argument (determinism → Strict Mode).
- **§4:** the hard-limits list, now eight items, each with its route-around.
- **§5:** the build plan grown to twelve items with a "how they chain" walkthrough —
  domain verification added to the early sequence since it should gate publishing before
  vendor sign-ups scale.
- **§6–§8:** trust costs, the two proofs, and the month-by-month forward plan, updated to
  include domain verification this month and multi-host registration in the 6–12 month window.
- **§9:** a final word that honestly states where the review started, what changed, and
  what the race ahead looks like.

Nothing was lost from the review — every answer, severity change, cost figure, and build
item survives in its final organized place.

---

## Critical-analysis report: answered the last open problem — silent wrong clicks and no undo — 2026-07-03

At the founders' request, the report's final unanswered problem ("a wrong click can succeed
silently, and there is no undo") now has an answer — Answer 12 in
`research-analysis/conxa-critical-analysis.md`, a five-layer safe-action system. Risk
lowered from High to Medium-High (Medium once built):

1. **Classify every step by consequence** (read-only / reversible / irreversible) — mostly
   automatic from the intent the compiler already extracts; the vendor confirms in the editor.
2. **Entity binding — the key piece.** Before clicking Delete, verify the target row contains
   this run's actual data ("Invoice #12345"). The wrong row doesn't contain it, so the
   wrong-row delete becomes structurally impossible, not just unlikely.
3. **Fail closed at the point of no return** — fuzzy "find something close" repair is disabled
   on irreversible steps, plus an optional "about to delete X — confirm" screenshot gate.
4. **Stage-then-commit + dry-run** — record workflows so the irreversible click comes last
   (the compiler warns when it doesn't), and a dry-run mode stops just before it — which also
   makes first-run calibration on a new customer account completely side-effect-free.
5. **Compensation flows instead of undo** — a recorded "cleanup" workflow the runtime offers
   when a run dies midway. Honest framing: nobody has undo across systems — a workflow
   spanning three SaaS APIs can't roll back either; compensation is how the whole industry
   handles it.

Plus before/after screenshots on every consequential step. The honest benchmark set in the
report: not zero errors (impossible for anyone, including humans) but measurably *below*
human error rates, with every action evidenced — a standard enterprises already accept from
their own staff. With this, every problem in the report now has an answer on record; the
build plan's item 6 was expanded into the full safe-action system.

---

## Critical-analysis report: eleventh founder answer — domain verification kills the bot-blocker risk — 2026-07-03

The founders answered the "automating other companies' websites violates their rules"
criticism: Conxa only automates software the vendor *owns*, and domain verification will
enforce it. The report (`research-analysis/conxa-critical-analysis.md`) records this as
Answer 11 and drops the risk from Medium-High to Low:

- **You can't violate your own terms of service** — with Option A chosen, the target site
  belongs to the customer, so the legal exposure that haunts browser-automation companies
  doesn't apply.
- **Bot-blockers flip from enemy to colleague** — a vendor allowlists their own runtime on
  their own Cloudflare instead of Conxa sneaking past it. The unwinnable arms race is won
  by never entering it.
- **Domain verification makes the policy enforceable** (prove ownership via a DNS record,
  like Google Search Console) and also protects Conxa itself from someone using its pipeline
  to ship skills that automate websites they don't own. Added to the build plan as item 12
  (small effort, large de-risking).
- **A side benefit:** the "human-like pacing" feature loses its awkward bot-evasion optics —
  if you only automate your own sites, you never need to look human.
- **The trade-off recorded honestly:** strict domain verification narrows the enterprise
  segment to internal tools the enterprise actually controls; truly third-party sites
  (supplier portals, government websites) are out of scope by policy. Deliberate, and
  probably right at this stage — a clean posture in exchange for a legally-gray segment.

---

## Critical-analysis report: tenth founder answer — MCP is open, Claude is the start, not the ceiling — 2026-07-03

The founders answered the "everything depends on Claude Desktop" risk: the runtime speaks
MCP, an open standard, so any MCP-capable AI agent can connect — Claude is just where it
starts. The report (`research-analysis/conxa-critical-analysis.md`) now records this as
Answer 10 and lowers the risk (High → Medium-High), with the honest fine print:

- Right in principle — the risk changes from "architectural lock-in" to "packaging choice."
- What's still Claude-only in practice today: the installer registers only into Claude's
  config files (small fix); the smart recovery loop is tuned to Claude's behavior and needs
  testing per new host; and customer pricing is framed in Claude subscription allowances.
- What the answer does not fix: Anthropic itself competing (first-party recording/skills)
  hurts no matter how many hosts are supported — that stays on the "cannot be fixed" list,
  now narrowed to only the competition half.
- Build plan updated: multi-host registration added to item 8 (marked Small on its own),
  which turns the claim from principle into a demo.

---

## Critical-analysis report: full rewrite into a founder-ready Q&A document — 2026-07-03

`research-analysis/conxa-critical-analysis.md` was completely restructured. After a day of
back-and-forth (nine founder answers, several risk downgrades, two recorded decisions), the
document had grown patchy. It is now rewritten top to bottom in easy language, organized as
direct questions a founder would ask:

1. What is Conxa, in one minute?
2. What are the problems? (all ten, one sentence each, with current severity)
3. What were the founders' arguments, and what does Fable think of each? (all nine answers
   with honest verdicts — including which one was the strongest: determinism/Strict Mode)
4. What can NEVER be fixed? (eight hard limits — API speed, no undo, MFA walls, elastic
   burst, top-of-market connector erosion, bot-blockers, silent wrong clicks, platform-owner
   competition — each with how to route around it)
5. What CAN be fixed, and how much does each fix improve things? (the 11-item build plan
   with measurable payoffs, e.g. repair memory = ~3× more runs per Claude session)
6. Engineering problems vs. execution problems (the two proofs, who not to sell to,
   housekeeping investors will find)
7. Is the trust stuff hard? (signing = weeks; SOC 2 = ~a year and ~$15–40k)
8. What do we do going forward? (a direct month-by-month plan: this month / 90 days /
   3–6 months / 6–12 months, plus the weekly metrics to track)
9. The final word (where the review started, where it ended, what remains)

Nothing was lost — every answer, risk rating, cost figure, and build item from the earlier
versions survives, just reorganized so a founder can read once and know exactly what to do.

---

## Critical-analysis report: answered the last open criticism — the official-connector squeeze — 2026-07-03

The founders asked for an answer to the one remaining unanswered risk in
`research-analysis/conxa-critical-analysis.md`: "every month more software vendors ship
official AI connectors, shrinking Conxa's market from above." The report now answers it
(new subsection in §9.2, risk downgraded Critical → High), with three observations from
history and one strategic move:

1. **The long tail never gets covered.** "Every vendor will integrate" has been predicted
   for 25 years and never happened: APIs have been standard since the 2000s, Zapier has
   spent ~15 years making integration easy and covers roughly 8,000 apps out of tens of
   thousands — and even those expose only a fraction of their features. The constraint was
   never effort; it's willingness. Below SaaS sits the layer that will never integrate:
   government portals, legacy systems, internal tools.
2. **Connectors expose operations; customers need workflows.** A real workflow crosses
   several apps and uses screens the vendor's API never exposes — the chain falls back to
   the browser at its weakest link, and Conxa wins the whole chain when any link lacks a
   connector.
3. **Connectors decay.** The two-week build isn't the cost — year five is (auth changes,
   versioning, support). Small vendors abandon integrations; the stale-Zapier-app graveyard
   is the evidence.
4. **Own the graduation path.** A Conxa recording is effectively the *specification* for an
   official connector — and the recorder can also observe the network calls behind each
   step. So when a vendor outgrows browser automation, Conxa can *generate* their official
   connector as a paid upgrade, and keep running the same governed skill over the connector
   as a faster backend. The biggest long-term threat becomes expansion revenue. Added to
   the build plan as item 11.

With this, every criticism in the report now has an answer on record. The honest caveat
kept: erosion at the top of the market is real, and the graduation strategy only counts
once it ships.

---

## Critical-analysis report: expired logins are handled by design — user re-authenticates at next run — 2026-07-03

The founders answered the report's "login problem" criticism: when a session expires, the
user simply signs in again manually at the next run — that's the design, not a gap. The
report (`research-analysis/conxa-critical-analysis.md`, §5.5 and the risk table) now treats
this as an accepted, managed limitation rather than an unsolved problem, and lowered the
risk (High → Medium-High):

- **For a person at their laptop, it works fine** — a 30-second sign-in interruption, like
  any other app. Two details make it feel polished instead of broken: check the session
  *before* step 1 (not at step 9 with half the workflow already written into the target
  system), and show a clear "your login expired — sign in to continue" message. That's
  exactly what the "session keeper" item in the build plan delivers — it's now marked as
  the companion piece this policy needs.
- **For unattended runs and runner machines, it's a real recurring cost** — a 3 a.m. run
  dies if the session expired at 2 a.m. and waits for a human. Real RPA teams live exactly
  this way (morning login runbooks for their bot machines), so enterprises find it familiar,
  but the report says it must be priced in honestly, not hidden.
- One firm line kept: never build anything that tries to automate past MFA — unwinnable,
  and exactly the behavior that gets a runtime flagged as malware.

---

## Critical-analysis report: the "one run at a time" limit is now marked largely fixable — 2026-07-03

The founders challenged the report's claim that execution is stuck at one run per computer,
arguing it's an engineering problem. The report now agrees in large part (§6, risk table,
and the build plan updated; risk R8 downgraded from Medium-High to Medium):

- **Step 1 (pure engineering):** the browser engine already supports several isolated
  sessions at once, so a pool of 3–5 parallel runs per machine is buildable now — a laptop
  goes from ~10 runs/hour to ~30–50. Watch-outs: two runs writing to the same record can
  collide, and runs a human is watching can't usefully parallelize.
- **Step 2 (the real unlock):** dedicated always-on "runner machines" — customer-owned VMs
  that never sleep, kept logged in, triggered by a scheduler instead of somebody's chat
  window. This is exactly how the big RPA vendors deliver unattended automation, enterprises
  already accept the model, and it reaches thousands of runs per day **without breaking
  Conxa's "the cloud never executes" rule** — the VMs belong to the customer.
- **What stays structural:** elastic burst (an API can absorb 10,000 parallel calls in a
  second; runner VMs are capacity you provision in advance) and the login problem (each VM's
  sessions must be kept alive; an MFA prompt on a headless VM is a support ticket).

Bonus effect: the runner pattern makes the report's advice against building a Conxa-hosted
execution cloud even stronger — customers get volume on their own machines, so the hosted
tier's only remaining lure (burst capacity) isn't worth trading the trust story for.

---

## Critical-analysis report: added the founders' answer to the "shrinking market" risk — 2026-07-03

The one criticism in `research-analysis/conxa-critical-analysis.md` that had no founder answer
("the market gap is shrinking from both sides") now has one, weighed honestly in §9.2:

1. **"Enterprises don't want AI training on their data"** — right instinct, but providers
   already offer no-training contracts; what the instinct really points to is answer 3.
2. **"AI models were never trained on enterprise software behind login walls"** — partially
   right, and most right exactly in Conxa's niche: screen-driving AIs handle ordinary modern
   UIs they've never seen, but measurably struggle on dense legacy screens (old ERPs,
   government portals, homegrown tools) — Conxa's best targets. Caveat: this moat erodes
   with every model generation.
3. **"Enterprises want deterministic, trackable execution, not a hallucinating AI"** — the
   strongest answer. A compiled skill runs the same steps every time with a full log; a live
   agent improvises every run. Best part: the runtime already has the switch (the recovery
   ceiling) that makes execution 100% deterministic with zero AI in the loop — the report
   recommends productizing it as a named enterprise "Strict Mode", added to the build plan.
4. **"Latency is an engineering problem"** — half true: pacing delays, browser cold-start,
   and conservative waits could be cut ~2–3×, but page loading is a floor Conxa can never
   engineer away. Sharper framing: for scheduled, unattended runs nobody is watching, so the
   latency gap mostly stops mattering there.

Net: the "smarter AI" half of the squeeze is now credibly answered and the risk was
downgraded (Critical → High–Critical). The other half — every month it gets easier for any
software vendor to ship an official connector — remains unanswered and is the clock the
chosen strategy races against.

---

## Critical-analysis report: recorded the founders' strategy decision, Mac commitment, and added a build-forward plan — 2026-07-03

Three updates to `research-analysis/conxa-critical-analysis.md`:

1. **Mac versions are committed.** Every "Windows only" criticism in the report was updated.
   The signing guidance now also covers the Apple side: a $99/year Apple Developer ID plus
   notarization (Apple's automated safety scan) wired into the build pipeline — without it,
   modern Macs refuse to open the app.
2. **The strategy decision is recorded.** The founders have chosen Option A — the Conxa
   vendor-distribution path aimed at small and mid-sized SaaS vendors. The report's role
   shifted from arguing the choice to naming what must be proven and what to build.
3. **A new section 12, "The Build-Forward Plan."** Ten ranked build items, each tied to the
   risk it fixes, its rough effort, and what it measurably buys. The top four in detail:
   - **First-run calibration** — check every skill against the customer's own account at
     install time, so "this button doesn't exist on your plan" is caught before the first
     real run instead of during it. The highest-value single build.
   - **Persistent repair memory** — remember an AI-assisted fix instead of re-paying for it
     on every run. By the report's own numbers, a workflow with two weak steps drops from
     ~7,200 tokens per run to ~1,200 after the first repair — about 3× more runs per Claude
     session for the customer.
   - **Recordability pre-check** — a green/yellow/red "will your product work with Conxa?"
     score shown during recording, turning the "too dynamic sites are out of scope" policy
     into a measurable gate and keeping bad-fit customers from becoming churn stories.
   - **Skill health dashboard + fast re-record** — makes "maintaining Conxa is less hassle
     than maintaining an API" provably true by compressing the vendor's fix loop to minutes.
   The section ends with a 90-day / 6-month / 12-month sequence and an honest note on what
   no build plan changes (API speed, MFA walls, the market squeeze) — the plan maximizes the
   space between those forces rather than beating them.

---

## Phase 1 cleanup of the Build Studio's code — 2026-07-03

The Build Studio (the Windows desktop app where companies record and package their
workflows) had a lot of AI-generated clutter: duplicate code, dead files nobody used
anymore, and several files that had grown to 1,000+ lines because everything kept getting
piled into the same place instead of being organized. None of that clutter caused bugs by
itself, but it made the app much harder for engineers to safely change going forward — and
there was no automated check to catch new problems before they shipped.

What changed:
- **Added safety nets that didn't exist before.** The project now automatically checks for
  type errors, common bug patterns, and unused code every time it builds, and a new CI step
  runs the full test suite before a release is packaged (previously CI only built the app —
  it never actually tested it).
- **Deleted dead code.** Six unused screens/files in the desktop app, nine functions that
  did nothing (mostly leftovers from an earlier cloud-only version of this feature), and one
  unused Python helper.
- **Cleaned up a confusing "v1 vs v2" fork** in the code that generates element selectors
  (the logic that finds the right button/field on a webpage). One version was fully dead;
  the parts that were actually used got moved to clearly-named homes.
- **Removed repeated code** — the same response-handling logic, event-streaming logic, and
  formatting logic were copy-pasted in several places; those are now single shared pieces.
- **Broke up the biggest files.** The Python backend's command dispatcher was one 1,968-line
  file handling 56 different request types — it's now organized into 7 focused files by
  what they do (recording, compiling, publishing, etc.), with zero change in how requests
  are routed. Several other oversized files (skill packaging, the recording engine's helper
  functions, the workflow editor) got the same treatment. On the app's screens, the two
  biggest ones were split so the visual pieces live in their own files instead of one giant
  page file.
- **Found and fixed one real test-breaking bug** caused by the file reorganization (a test
  was listening for backend events in the wrong place after a file moved) — caught it, fixed
  it properly, verified it end-to-end.

What did **not** change: no feature was added, removed, or behaves differently. Every step
was checked against the full test suite and the app was smoke-tested by actually spawning
the backend and sending it real requests. A few very large files were deliberately **left
alone** — they turned out to be one tightly-connected piece of logic (like the core
compiler and the live recording engine) where forcing a split would trade one kind of mess
for a riskier one; a full writeup of what's done and what's next lives in
`PHASE_1_REFACTOR_REPORT.md`.

---

## Cleaned up the Conxa Cloud dashboard and backend — no visible changes, just tidier code — 2026-07-03

The Conxa Cloud app (the dashboard companies use for billing, plugins, and telemetry, plus
the backend that powers it) had built up a lot of leftover clutter from earlier development —
things like an old workflow-editor screen that got replaced but never deleted, duplicate
copies of the same helper code scattered across multiple files, and a couple of files that had
grown to nearly a thousand lines each. None of that was visible to anyone using the app, but it
made the codebase slower to work in and easier to introduce bugs into.

This pass cleaned it up without changing how anything behaves:

- **Deleted ~4,700 lines of dead code** — an entire old "workflow editor" screen from a
  previous version of this product that no page ever linked to anymore, plus a leftover
  payment-provider integration (Razorpay) that was fully replaced by the current one
  (Cashfree) months ago but never got removed.
- **Removed duplicate code.** The same "who is this user, and are they allowed to do this?"
  check was copy-pasted into five different files on the backend; the same "turn a server
  error into a readable message" logic was copy-pasted four times on the frontend. Both are
  now written once and reused everywhere.
- **Split up two oversized files** (one nearly 1,000 lines, one over 700) into smaller,
  focused pieces — one for handling web requests, one for the actual business logic — so a
  future change only needs to touch the relevant piece instead of scrolling through
  everything.
- **Added tests that didn't exist before** for the billing and telemetry-dashboard code, so
  future changes there can be checked automatically instead of by hand.
- **Fixed a small inefficiency** where checking for "drift" (a signal that an automation might
  need to be re-recorded) was scanning all the telemetry data twice instead of once.
- Wrote up a full report (`conxa-cloud/PHASE_3_REFACTOR_REPORT.md`) documenting everything
  changed, what was deliberately left alone and why (some things that looked like duplicate
  code turned out to be doing genuinely different jobs), and what's recommended next —
  most notably, setting up automated testing on every code change, since none currently runs
  for this part of the app.

Every step was checked against the existing test suite and a full app build before moving to
the next one, so this should be invisible to anyone using the dashboard.

---

## Added a costed reality-check on code signing and SOC 2 to the critical-analysis report — 2026-07-03

The report `research-analysis/conxa-critical-analysis.md` previously said enterprise trust
needed "about two years of work" without showing the math. After the founders asked "is it
actually hard to get SOC 2 and code signing?", the answer was added to the report itself
(security section §7 and recommendation §11.6): **no, the paperwork half is cheap and fast.**

- **Code signing** is a purchase, not a project: an EV certificate (~$300–600/year), a cloud
  signing service for CI (keys must live in hardware since 2023), and pipeline wiring — done
  in weeks. Since Conxa's product *generates* installers for vendors, signing has to happen
  inside the build pipeline automatically.
- **SOC 2** is process, not genius: a compliance platform (~$7–20k/yr) plus an auditor
  (~$5–20k), Type I in ~3 months, Type II in 6–12 months because its observation window is
  unavoidable waiting time. Conxa's thin cloud (no customer data in the execution path) makes
  the audit smaller and cheaper than for a typical SaaS company. One heads-up recorded: buyers
  will ask about compile-time screenshots flowing through the LLM proxy — the data-flow and
  retention story should be written before they ask.
- The genuinely slow part is the **engineering half** — SSO, per-device identity with remote
  revocation, and enterprise packaging. Run both halves in parallel and everything lands in
  roughly a year. The report's message changed from "two years of trust work" to "one year,
  ~$15–40k, and the only way to lose is to start late."

---

## Added the founders' fourth answer to the critical-analysis report: MCP setup is too hard for normal people — 2026-07-03

A fourth founder response was folded into `research-analysis/conxa-critical-analysis.md`:
non-technical people can't configure MCP tools by hand — it means editing a JSON config
file, which feels like coding — so Conxa's installer doing that setup automatically is a
genuine feature, not just a security worry. The report now credits this in three places:
the big-vendor comparison (with the honest caveat that vendor-*hosted* connectors are just
a "Connect" button, so the point mainly defends Conxa's own local runtime, not the case
against vendors building connectors), the end-customer friction list (the auto-configuration
is called out as the right design for a non-technical audience), and the security section
(the design intent is good UX, but IT teams judge mechanisms, not intentions — the fix that
satisfies both is enterprise packaging so IT can do the deploying on managed fleets).

---

## Updated the critical-analysis report with the founders' answers to three criticisms — 2026-07-03

The report `research-analysis/conxa-critical-analysis.md` was updated after the founders
responded to three of its criticisms. The report now presents each answer where the original
criticism appeared, says honestly how much it resolves, and adjusts the risk ratings:

1. **"Installers will be digitally signed."** Accepted — this removes the scariest warning
   (Windows flagging an unknown publisher) and the report's risk wording was softened. It also
   notes what signing doesn't fix: security tools judge what a program *does* (edit Claude's
   settings, hold logged-in sessions, self-update), not just who signed it.
2. **"Big companies can build their own connectors, but for small and mid-sized SaaS companies,
   maintaining an API is more hassle than maintaining Conxa."** Taken seriously — the "no market"
   verdict was downgraded to "a smaller, plausible, unproven market" (risk lowered from Critical
   to High). The report now asks for the proof that would settle it: a few paying small-vendor
   customers who stick around through one of their own UI redesigns.
3. **"Recordings are generalized, and websites that are too dynamic per user we simply don't
   automate."** Partially accepted — the risk was lowered (High → Medium-High). The report agrees
   the multi-signal design absorbs ordinary changes, but points out that missing plan-gated
   buttons, translated labels, and permission-hidden menus aren't "dynamic websites" — they're
   normal SaaS behavior — so the cheap cross-account test is still the way to prove the claim
   and to define where the "too dynamic" line actually sits.

The recommendations were reshaped to match: "flip the target customer" became "run two named
bets (small vendors + enterprises with API-less software) and stop pitching big vendors," and
the closing verdict now names the two proofs that would turn the founders' arguments into a
fundable thesis.

---

## Rewrote the critical-analysis report in plain language with real-world examples — 2026-07-03

The report `research-analysis/conxa-critical-analysis.md` (added earlier today) was rewritten
from dense analyst-speak into everyday language. Same conclusions, same structure — but now
every major point is explained through a concrete story instead of jargon. For example: an
imaginary CRM company ("AcmeCRM") choosing between using Conxa or just building its own
connector; a skill recorded on an English admin demo account breaking on a German customer's
Starter-plan account; and the "wrong Delete button" scenario showing why a confident wrong
click is worse than a visible failure. Technical terms like MCP, selectors, and token costs
are now explained in passing, so a non-engineer (or an investor) can read it start to finish.

---

## Added a brutally honest outside-in review of Conxa's strategy and architecture — 2026-07-03

No code changed. We wrote a new report, `research-analysis/conxa-critical-analysis.md`,
that deliberately plays devil's advocate: it assumes Conxa will fail and asks what the
evidence says. It compares Conxa against the alternatives customers actually have (official
APIs and native MCP connectors), and is written to be shown to founders or investors.

The report's biggest conclusions, in plain terms:
- Our main target customer today (SaaS vendors automating their own product) is the one
  group that least needs us — they already own the code and can build a native connector
  cheaply. The customer who genuinely needs Conxa is the enterprise stuck with software
  it can't change and can't get an API for.
- The riskiest untested assumption is that a workflow recorded on one account works on
  every customer's account — different plans, languages, and permissions can make screens
  genuinely different. The report recommends testing this with real design partners before
  anything else.
- Enterprises won't trust the current install experience yet (unsigned installer, shared
  company token, no SSO or compliance certifications) — that's a fixable but year-long
  program of work.
- The market gap Conxa fills is shrinking from both sides: more vendors ship official
  connectors, and AI models keep getting better at driving screens without pre-recorded
  skills. The one lasting advantage we could build is the fleet-wide data about how real
  websites drift and which selectors survive — which we currently collect but keep siloed.

The report ends with six fundamental recommendations (reposition the target customer, run
the cross-account test, build the drift-data asset, add extra safety around irreversible
steps, support more than just Claude Desktop, and fund the enterprise-trust checklist).

## Fixed Build Studio crashing on every fresh install, and a login check that trusted stale sessions forever — 2026-07-03

Two issues found while testing a fresh install of Conxa Build Studio:

**1. The app crashed immediately after installing, every time.** Right after downloading
its setup files, Build Studio would show "The backend stopped unexpectedly and could not
be restarted." This wasn't specific to one machine — it would happen on any fresh install.
The cause: a safety check meant for the cloud service (which refuses to start in production
without login security turned on) was accidentally also applying to Build Studio's own local
backend, which doesn't use that same login system at all. So every packaged install failed
this check it was never supposed to be subject to, and crashed before it could open.
Fixed by exempting Build Studio's backend from that particular check, the same way another,
similar exemption already worked for it.

**2. The app could open without asking the user to sign in.** This turned out to be two
separate things layered together:
- On the machine we tested on, an old sign-in from previous testing was still saved in
  Windows' credential store. That storage lives outside the app, so uninstalling and
  reinstalling Build Studio doesn't clear it — the app was correctly finding a real saved
  session, not skipping login. A real customer's first install won't have this.
- Separately, we found the sign-in check itself was too trusting: once a session was saved,
  the app never rechecked whether it had expired or been revoked — it just assumed anyone
  with *something* saved was still validly signed in. Fixed so Build Studio now re-validates
  (and refreshes if needed) the saved session every time it checks who's signed in, the same
  way it already does before making other authenticated calls. An expired or revoked session
  now correctly sends the user back to the login screen instead of letting them in.

---

## Fixed a production outage caused by a missing deploy setting — 2026-07-02

The live cloud service (`conxa-api` on Render) crashed on startup right after the last
security fixes went out, refusing to boot with: *"SKILL_TRACKING_HMAC_SECRET" and
"SKILL_INSTALLER_SIGNING_KEY" are unset*.

This wasn't a bug — the app was correctly refusing to start half-configured. The real
problem: those security fixes introduced a new required setting
(`SKILL_INSTALLER_SIGNING_KEY`), but the deployment checklist files (`render.yaml`,
`.env.prod.example`) were never updated to include it, so there was no place to even enter
a value for it.

**Fixed:**
- Added the missing setting to both deployment checklist files so it's no longer possible
  to forget it on the next deploy.
- Generated two secure random values and set them directly on the live service.
- Confirmed the service redeployed cleanly and is responding to health checks again.

Total downtime: about 2 minutes from crash to confirmed-healthy.

---

## Closed the last 4 open security gaps (Medium severity) — 2026-07-02

Went through the 4 remaining open items in `docs/Security.md` and fixed each one in code
(not just documentation this time):

- **Telemetry could sneak past company checks (SG-05).** If a company's tracking token ever
  went missing, the system used to quietly accept the data anyway under an "unknown"
  workspace instead of rejecting it. Now, in production, a missing token is rejected
  outright, and a warning is logged so a lost or leaked token gets noticed before it's
  abused. Local development is unaffected.
- **No limit on how much telemetry one message could carry (SG-06).** A single batch of
  usage events had no cap, so a bad actor with a leaked token could send huge amounts of
  data to run up storage costs. Batches are now capped at 200 events and individual fields
  are trimmed to 256 characters, with a warning logged whenever that happens. Normal-sized
  batches are completely unaffected.
- **Anyone who knew a company's install link could download its installer forever (SG-07).**
  The installer file — which contains a secret sync token — was available to download by
  anyone who guessed or was given the link, with no expiry. Download links are now
  time-limited and cryptographically signed (valid for 10 minutes), and the dashboard always
  hands out a fresh one. This only takes effect once a signing key is configured in
  production; local development keeps working exactly as before.
- **A user's saved login could be written to disk without any protection (SG-11).** While
  investigating, we found this was worse than previously documented: after every successful
  automation run, the system saved the browser's login session to disk completely
  unencrypted, every time — not just as a rare fallback. Now it always tries to encrypt the
  session first, only falls back to an unencrypted save if encryption genuinely fails (and
  logs a visible warning when that happens), and on startup it automatically finds and
  re-encrypts any old unencrypted session files left over from before this fix.

All four fixes include new automated tests, and none of them change behavior for normal
users or in local development — they only close gaps that would otherwise let someone
with partial access do more damage than they should be able to.

---

## Refreshed the Security Gaps tracker — 2026-07-02

The `docs/Security.md` doc (a running list of known security weak spots across Build
Studio, the cloud, and the runtime) hadn't been checked since 2026-06-14, so it was
missing several fixes that shipped since then. Went through each open item and checked it
against the actual code before updating anything:

- **RBAC gap (SG-01):** was documented as fixed only on the publish routes. It's now
  actually enforced much more broadly — plugin create/delete, bundle release, and
  subscription creation all require admin/owner too. Updated to list everywhere it's
  enforced.
- **Rate limit gap (SG-04):** was "in-memory, wiped on every restart." Now marked fixed —
  the limit is stored in the shared database instead, so it survives restarts and works
  correctly even when the cloud runs on multiple machines at once.
- **Self-update binary signing (SG-09):** partially fixed. The list of available updates
  (the "manifest") is now cryptographically signed and checked against a key baked into
  the app itself — so a compromised server can no longer quietly swap in a fake update
  list. What's *still* missing: the actual update file isn't signed with a Windows
  publisher certificate yet, so a compromised signing key could still slip through a bad
  update. Documented as the remaining gap.
- **Random temp filename gap (SG-10):** the old update mechanism this described (a
  temporary `.bat` file with a guessable name) doesn't exist anymore — it was replaced by
  a safer versioned-folder update system. Marked resolved by removal rather than by a
  patch.
- Everything else (tracking token fallback, unbounded telemetry payloads, public installer
  downloads, plaintext session fallback, etc.) was checked and confirmed still open — left
  as-is rather than guessed at.

No code changed — documentation only, brought in line with what's actually shipped.

---

## Refreshed the Sales-Blockers status doc — 2026-07-02

The `docs/Sales-Blockers.md` doc (a checklist of "what must ship before we can sign our
first enterprise customer") had gone stale. It still said Phase 1 was only 3/8 done and
Phase 2 was 0/8 done, when in reality almost everything has since shipped. Cross-checked
against the authoritative roadmap and the recent commits, then rewrote the status so it
reflects the truth:

- **Phase 1: now complete** — auth, sync tokens, delta sync, shared rate limiting, RBAC,
  Stripe removal are all done or no longer relevant.
- **Phase 2: 6 of 8 done** — device registration, audit log, drift detection, cache
  cleanup, billing limits, and friendly error messages have all shipped.
- **Bottom line:** only **one hard blocker remains — signing the Windows installer** (so
  Windows won't flag it as coming from an "unknown publisher"). The build plumbing for it
  is already in place but switched off; what's left is buying the certificate and turning
  it on (~3 days). macOS support is the only other open item, and that's an optional extra,
  not a blocker.

Updated every table, checklist, and the "path to first sale" estimate (was ~3 weeks, now
~3 days) to match. No code changed — documentation only.

---

## Fixed the Startup Sequence diagram not showing — 2026-07-02

The "Startup Sequence" diagram in `docs/TRD.md` wasn't displaying at all. The cause was a
Windows-style file path written with backslashes (`conxa-runtime\current\conxa-runtime.exe`)
inside the diagram. The diagram tool (Mermaid) treats a backslash as a special "escape"
character, so that one path silently broke the whole picture. Swapped the backslashes for
forward slashes (`conxa-runtime/current/conxa-runtime.exe`) — which is also how the same path
is already written elsewhere in the doc — and the diagram renders again. No content or meaning
changed; the steps it describes are unchanged.

---

## Fully isolated Development and Production environments — 2026-07-02

Until now there was no clean way to build and test new things without risking the live
Production system. Settings, folders, and web addresses all pointed at Production by
default, and "am I in Production?" was guessed from several separate switches that had to
be set just right by hand. This change introduces **one master switch** so Development and
Production are completely separate and can even run on the same computer at the same time
without stepping on each other.

**One switch: `CONXA_ENV=dev` or `CONXA_ENV=prod`.** Flip it and everything follows — which
settings file loads (`.env.dev` vs `.env.prod`), which folders get used, which web address
things talk to, and which updates you receive. There are ready-to-copy `.env.dev.example`
and `.env.prod.example` templates (for the app and the website).

**Development and Production never share anything.** Dev keeps its files under
`~/.conxa-dev` and `~/.conxa-build-studio-dev`; Prod stays in `~/.conxa` and
`~/.conxa-build-studio`. Dev talks to a local (or separate dev) cloud; Prod talks to the
live one. Dev uses the payment sandbox; Prod uses real payments. Installers built in Dev
even register a separate "conxa-dev" entry in Claude Desktop, so a Dev agent and a Prod
agent can run side by side.

**An easy launcher.** `./scripts/conxa.sh dev studio` (or `make dev-studio`, and
`conxa.ps1` on Windows) starts any piece in the environment you pick — no need to remember
a dozen settings.

**Production only gets tested, promoted releases.** Development builds are labeled as
previews (e.g. `app-v1.3.0-dev.1`) and go onto a separate "dev" update track. When a build
is proven good, a promotion step copies that *exact same signed file* onto the "stable"
track that Production uses — Production is never handed something that wasn't tested first,
and nothing is rebuilt in between (so it can't accidentally change).

**Two safety fixes along the way.** (1) A prod-labeled server now refuses to start if login
protection is turned off, catching a dangerous misconfiguration early; the Render config
now also lists every value Production needs so it can't silently boot half-configured.
(2) Fixed a spot where the runtime could save Dev login tokens into the Production folder.

---

## Phase 2 production-readiness: billing limits, cache cleanup, drift warnings, friendlier errors — 2026-07-01

This batch closes four of the remaining "Production Readiness" gaps and lays groundwork for two more.

**Billing now actually enforces plan limits.** The plans (Free/Starter/Pro/Enterprise) existed but
nothing stopped a workspace from going over. Now, when someone is on a paid plan, the cloud checks
their limits before letting them publish a new product, use up compile credits, or use their monthly
"Human Edit" allowance — and returns a clear "limit reached" message instead of silently allowing it.
Local development and the unlimited "development" plan are unaffected. We also made the pricing text
shown on the Billing page come straight from the real limits, so the numbers can never drift apart.

**The selector cache now cleans up after itself.** The app remembers how to find buttons and fields
on customer sites, but old entries were never deleted and would pile up forever. A background janitor
now runs every few hours (and once at startup) to sweep out expired cache entries and old page
snapshots, so disk use stays flat.

**Skills now warn when a website has been redesigned.** Each skill records a "fingerprint" of the
first few things it interacts with. Before a skill runs, the runtime now quietly checks whether those
landmarks are still on the page. If most of them have vanished — a sign the site was redesigned — it
sends a heads-up to the vendor dashboard. This never blocks the skill from running; it just flags it
for review.

**Error messages in Build Studio are now in plain English.** Instead of seeing raw codes like
`cloud_unreachable` or `auth_file_in_build_input`, users now see sentences like "Can't reach Conxa
Cloud right now. Check your internet connection and try again."

**Windows code signing and macOS support — groundwork only.** We wired up the plumbing (build
settings, environment variables, an inert macOS build job) so that once a Windows signing certificate
and an Apple developer account are purchased, turning these on is a small step. Until then, Windows
still shows an "Unknown Publisher" warning and there is no macOS build — these need external accounts
we can't create in code.

## Added a strategy write-up for TwelveLabs video understanding — 2026-07-02

**What's new.** A new document, `docs/twelvelabs-video-understanding-strategy.md`, explaining where
TwelveLabs (a company that makes AI which "watches" and understands videos) could help Conxa.

**The main idea.** Every time someone records a workflow in Build Studio, Conxa quietly saves a full
screen recording of it (`recording.webm`) — but right now it only cuts that video into a few still
pictures and throws the rest away. TwelveLabs' models can actually watch that whole recording and
understand it, so the doc lays out how we could use the video we're already throwing away to make
skills better.

**What the doc covers.** Plain-language explanations of TwelveLabs' two models (one for searching
video, one for describing it in words), and four concrete places they'd help — all on the vendor's
own recording, at build time: writing better step descriptions and catching hidden "wait for loading"
pauses, searching for skills by what the video shows, auto-detecting success messages to build checks,
and sharpening recovery when a button moves. It now stays strictly vendor-side — the earlier "detect
when a website changed" idea, which would have meant capturing the end customer's screen, was removed.

**Costs, spelled out.** The doc uses TwelveLabs' real published prices to show it works out to roughly
**7 to 26 cents per workflow build** (paid once when a skill is built, not every time it runs), with
search and recovery costs being fractions of a cent. It also notes the privacy angle is manageable
because TwelveLabs can run inside the vendor's own cloud or on their own servers (SOC 2 Type II,
on-premise, or AWS Bedrock), so the recording never leaves the vendor's control.

**How to buy.** Added a short "what to actually budget" breakdown: you start for **$0** on the free
tier (enough for ~300–600 test recordings), then pay only per use as you grow (roughly $7–26/month at
100 builds, scaling up from there). The pricey "Enterprise" package has no public price and isn't
needed to begin — the same capability is available pay-as-you-go, and the privacy/on-premise needs can
be met through AWS Bedrock without an enterprise contract. Nothing in the code was changed; this is a
planning document.

## Fixed Cashfree subscription upgrades — 2026-07-02

**What was broken.** Clicking "Upgrade" on the Billing page failed with
`cashfree_subscription_create_failed: {"message":"Not Found"}`. The Cashfree integration added on
2026-06-30 was calling web addresses that don't exist on Cashfree's servers — it looked plausible
but the paths, the domain names, and the names of the fields Cashfree expects were all wrong. This
also meant that even if a subscription had been created, verifying payment afterward and Cashfree's
automatic "payment received" / "subscription cancelled" notifications would have failed too, since
those relied on the same wrong assumptions.

**What we fixed.** Checked Cashfree's real documentation and corrected every part of the flow to
match: the web addresses used to create a pricing plan and a subscription, the names of the pieces
of information sent and received, which ID to use when checking on a subscription later, and how to
verify that a payment notification really came from Cashfree (the old check would never have matched
a real Cashfree notification, so automatic billing updates were silently broken).

**Files touched.**
- `conxa-cloud/backend/app/api/cashfree_routes.py` — corrected API domains, endpoint paths, request/
  response field names, switched to using Cashfree's own subscription reference ID for status checks
  and webhook lookups (since Cashfree doesn't echo back the custom tags the old code relied on), and
  rewrote the payment-notification signature check to match Cashfree's actual method.

**What to know.** This couldn't be tested against Cashfree's real sandbox from here (no test API
keys available in this environment) — the fix was verified by carefully cross-checking every request
and response against Cashfree's published documentation. Recommend a real test-mode upgrade attempt
once `CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY` sandbox credentials are available, to confirm end to end.

---

## Finished Phase 1 (Architecture Consolidation) — 2026-07-01

**What this is.** Phase 1 was the "clean up the foundations" phase of the roadmap. A stage
report flagged five things left to do. When we actually looked at the code, two of them were
already handled by earlier work, and the other three were real. This change finishes all of
them and updates the paperwork so it matches reality.

**What we found (and corrected in the docs).**
- The "move the nonce store to a database" task no longer applies — the old login flow that
  used it was removed a while ago, so there is simply nothing there to move.
- The "send only changed files instead of the whole pack" task was already mostly done —
  each skill now updates on its own, so republishing one skill no longer re-sends the others.
  We marked it complete (the tiny leftover — a changed skill still sends its own handful of
  small files — isn't worth the extra complexity).
- The "delete the old research/frontend prototype" task no longer applies — that folder isn't
  in the project anymore.

**What we actually changed in the code.**
- **Removed Stripe entirely.** Stripe was a leftover payment option that nobody uses (the
  live payment provider is Razorpay/Cashfree). We deleted its leftover checkout/portal/webhook
  code, its settings, its software dependency, and the unused bits in the dashboard. Less dead
  code, fewer things to explain.
- **Made the sync speed-limit survive restarts.** The runtime is only allowed to check for
  skill updates once every five minutes. That limit used to live in memory, so restarting the
  server (or running more than one copy of it) reset it. It now lives in the shared database,
  so the limit holds properly. (We deliberately did not add Redis for this — the existing
  database already does the job.)
- **Turned on permission checks for sensitive actions.** Creating a plugin, deleting a plugin,
  and publishing a release now require an admin/owner. Before, any team member could do these.
  Regular members now get a clear "not allowed" response.

**How we checked it.** Ran the backend test suite (only a pre-existing, unrelated test fails —
it references the old Razorpay config), added new tests proving non-admins are blocked and the
speed-limit survives a restart, and confirmed the dashboard still type-checks and builds.

**Result.** Phase 1 is complete. The remaining pre-launch work (Windows installer signing,
billing limits, friendlier error messages) all lives in Phase 2.

---

## New feature: enterprise-grade auto-update system for the runtime — 2026-07-01

**What this is.** A full rebuild of how the Conxa runtime (the program that runs on a customer's machine and executes their workflows) updates itself, the app logic inside it, and each company's skill packs. Previously, updates worked but had rough edges: only one backup was kept (so you could only roll back one step), update information came from the cloud with no way to prove it hadn't been tampered with, and updating one skill for one customer meant re-checking the whole company's skill pack as a unit. This rewrite fixes all three, plus adds real staged rollouts (ship a new version to 5% of installs before going to everyone) and automatic recovery if something goes wrong.

**The new folder layout.** Instead of one folder holding "the current version" of the runtime, the app, and each skill pack, everything now keeps every recent version on disk side by side, with a special marker (`current`) pointing at whichever one is active:

```
.conxa/
  conxa-runtime/v1.0.0/, v1.1.0/, current -> v1.1.0
  conxa-app/v1.0.0/, v1.1.0/, current -> v1.1.0
  skill-packs/<company>/<skill>/v1.0.0/, v1.1.0/, current -> v1.1.0
  manifest.json
```

Rolling back is now instant and never needs the internet — the old version is already sitting right there on disk; the runtime just points `current` back at it. Old versions are cleaned up automatically once there are more than 3 kept for any one thing.

**One signed update file instead of several unsigned ones.** The cloud used to hand out update information through three separate, unsigned web addresses. Now there's a single `manifest.json` that lists every component's version, and it's cryptographically signed — the runtime checks that signature before trusting anything in it, the same way a checked ID proves who issued it. If someone tampered with it in transit, the runtime just ignores it and keeps running on the last version it already verified.

**Staged rollouts.** A new version can now be released to only a percentage of installs at first (say 10%), so if something's wrong with it, only a small slice of customers see it before it's caught — not everyone at once. Each install machine is assigned to a percentage "bucket" that never changes, so this is predictable and testable, not random every time.

**Skills update independently now.** If a company has five skills and only one of them was updated, only that one skill gets re-downloaded — the other four are left completely alone. Before this change, updating any one skill meant re-checking the whole company's pack as a single unit.

**Safety checks before anything goes live.** A freshly downloaded runtime program is now test-launched once, quietly, before it's allowed to become the active version — if it fails to start, it's thrown away and the old one keeps running, even if its checksum matched perfectly (a checksum only proves the file wasn't corrupted in transit, not that the file actually works). Downloads that fail partway through now retry automatically with increasing delays instead of giving up.

**Files changed (large change set across four systems):**
- `runtime/version_manager.js` (new) — the core logic for switching between versions and cleaning up old ones.
- `runtime/manifest_manager.js` (new) — fetches and verifies the signed update file, decides what needs updating, and downloads it.
- `runtime/bootstrap.js`, `runtime/server.js`, `runtime/sync.js`, `runtime/skill_loader.js` — updated to use the new versioned folder layout and the new update system.
- `runtime/test/test_version_manager.js`, `runtime/test/test_manifest_manager.js` (new) — automated tests for the above.
- `packages/conxa-core/conxa_core/models/manifest.py` (new) — the shape of the signed update file.
- `conxa-cloud/backend/app/api/manifest_signer.py` (new) — signs and checks the update file.
- `conxa-cloud/backend/app/api/updates_routes.py`, `skillpack_update_routes.py`, `publish_routes.py` — updated to build and serve the new signed update file, and to track each skill's version separately instead of one shared version per company.
- `conxa-cloud/tests/test_manifest_signing.py` (new), plus updates to `test_llm_proxy_and_publish.py` and `test_installer_builder.py` for the new behavior.
- `.github/workflows/build-runtime-host.yml`, `build-runtime-app.yml` — updated so the build pipeline publishes into the new signed update system instead of the old unsigned one.
- `packages/conxa-core/conxa_core/storage/installer_templates/setup.nsi.tmpl`, `conxa-builder/python/conxa_compile/installer_builder.py` — the Windows installer now lays out the new versioned folders from the start, instead of the old flat layout.

**Note:** this is a from-scratch redesign, not a patch — there are no existing customer installs yet, so no migration step was needed. Everything was tested locally: the packaged runtime was rebuilt and run through the full automated test replay multiple times, the update-signing and skill-versioning logic was tested end-to-end against a local test server, and the whole cloud test suite was run before and after to confirm nothing else broke.

---

## Fixed: resuming from the very first step silently skipped self-healing recovery — 2026-07-01

**What was broken.** When Claude fixes a broken step and resumes a skill with `resume_from` + `step_overrides` (the Tier 3/4 "closing edge"), the runtime treats `resume_from: 0` exactly the same as "no resume was requested at all" — both come out to the number 0, and the code only checked `resumeFrom > 0` to decide "is this actually a resume." That check is false for 0, so:

- The retry budget (which stops infinite retry loops) was never checked.
- The run wasn't tagged as a recovery in telemetry.
- Most importantly: the parked browser tab — the exact page the failure screenshot was taken from — was thrown away, and a brand-new page was loaded from scratch instead of reusing the one Claude actually looked at.

Since the very first step of a skill failing is one of the most common recovery scenarios (nothing has to go wrong deep into a flow — it can go wrong immediately), this bug quietly weakened self-healing exactly when it mattered most.

**What was fixed.** `runtime/server.js` now tracks whether `resume_from` was explicitly provided as a separate flag, instead of inferring it from whether the number is greater than zero. `resume_from: 0` is now correctly recognized as "yes, resume, and adopt the parked page," the same as any other step index.

**Files changed:** `runtime/server.js` only.

**Note:** the fix is only applied to the repo source. The installed runtime at `~/.conxa/conxa-app/` is a separately built (obfuscated) copy and was not touched — it needs a proper rebuild via `build-runtime-app.yml` to pick this up, or a manual dev-mode swap for local testing.

---

## Fixed: T3/T4 self-healing recovery now actually works — 2026-06-30

**What was broken.** When a step failed and the runtime handed control to Claude for self-healing (Tier 3 + Tier 4), Claude couldn't fix it. Three problems stacked up to make recovery useless:

1. The list of elements on the page sent to Claude was always empty for dropdown/menu steps. The runtime spent ~12 seconds trying its own fixes first, and by the time it took a snapshot of the page to send Claude, the dropdown had already auto-closed. Claude got "No interactive elements" and gave up.

2. The screenshot sent to Claude showed the page *after* the dropdown closed (useless), not *before* the step was attempted (when the dropdown was open and the element was visible). This was because the "before" screenshot was turned off by default.

3. The description of what element Claude was looking for came from compiled selector data that can become stale over time, instead of the human-readable labels ("blueprint", "connect button") stored separately in the skill pack — labels that don't change when the UI changes.

**What was fixed.** Three targeted changes to the runtime, touching only `run.js` and `server.js`:

- **Snapshot at the right moment.** The page's element list is now captured immediately when a step fails, before any retry attempts run. So if a dropdown was open, it's captured open. This snapshot is stored on the failure and sent to Claude — no more empty lists for menu steps.

- **Pre-step screenshot turned on by default.** The runtime now always takes a screenshot *before* attempting each interactive step. If the step fails, Claude gets a picture of the page in the correct state (dropdown visible, form filled, etc.). Anyone who wants to disable this can set `CONXA_CAPTURE_PRESTEP=0`. Screenshots are now JPEG at 70% quality instead of PNG — smaller, cheaper, equally useful.

- **Better element description for Claude.** The human-written anchor labels from the skill pack (e.g. "blueprint") are now included in the message to Claude, and used as the primary label for the element instead of the compiled selector text. These labels are stable even when the UI changes.

**Files changed:** `runtime/run.js`, `runtime/server.js` only. The recovery engine, resolver, and all other files are unchanged.

---

## Payment gateway switched from Razorpay to Cashfree — 2026-06-30

**What changed.** All billing code was migrated from Razorpay to Cashfree. Customers who want to upgrade to Starter (₹29,999/month) or Pro (₹79,999/month) are now redirected to Cashfree's mandate authorization page instead of seeing a Razorpay popup.

**Why it changed.** The team decided to switch payment providers to Cashfree.

**Files that changed:**
- `conxa-cloud/backend/app/api/cashfree_routes.py` — new file that handles plans, subscription creation, payment verification, and webhook events from Cashfree. Replaces `razorpay_routes.py`.
- `conxa-cloud/backend/app/main.py` — updated to import and register the Cashfree router, and updated the production startup check to require Cashfree credentials instead of Razorpay credentials.
- `packages/conxa-core/conxa_core/config.py` — the five Razorpay env vars (`RAZORPAY_KEY_ID` etc.) were swapped for six Cashfree env vars (`CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_STARTER_PLAN_ID`, `CASHFREE_PRO_PLAN_ID`, `CASHFREE_ENV`).
- `conxa-cloud/backend/requirements.txt` — removed `razorpay` package, added `httpx` (used for Cashfree REST API calls).
- `conxa-cloud/frontend/src/api/cashfreeApi.ts` — new frontend API client with updated response types (`auth_link` instead of `key_id`, `subscription_id` stays the same).
- `conxa-cloud/frontend/src/BillingPage.tsx` — removed Razorpay script-loading and popup code. The new flow redirects the user to Cashfree's `authLink` page for mandate registration, then verifies on return using sessionStorage to remember the pending subscription ID.
- `.env.example` — updated with Cashfree credential placeholders.

**How the new checkout works:**
1. User clicks "Choose Starter" → frontend calls `/subscriptions/create`.
2. Backend creates a Cashfree subscription and returns an `authLink` (a Cashfree-hosted page).
3. Frontend saves the `subscription_id` in `sessionStorage` and redirects to the `authLink`.
4. User completes mandate registration on Cashfree.
5. Cashfree redirects back to `/billing`. On page load, the pending `subscription_id` is read from `sessionStorage` and sent to `/subscriptions/verify`.
6. Backend calls Cashfree API to confirm status, then updates the workspace billing record.
7. Webhooks from Cashfree also update billing for recurring charges and cancellations.

**What you need to do manually before this goes live:** see the setup steps in `docs/Implementation-Plan.md` or the plan at `.claude/plans/you-see-now-we-composed-pelican.md`.

---

## Skill pack modified to force Tier 3 + Tier 4 recovery escalation — 2026-06-30

**What changed.** The "create-a-service-from-github" skill pack on this machine was intentionally broken at **step 2** (the click on the Blueprint menu option) so that every automatic recovery attempt the runtime tries before asking Claude for help will fail, forcing it to hand the problem to Claude with a full screenshot and DOM inventory.

**What was broken and why.** Normally, when a step fails, the runtime works through a four-tier rescue ladder before involving Claude:
- *Tier 1:* tries the compiled selectors (the ones recorded at build time)
- *Tier 2:* tries a11y-based lookup, re-hover tricks, loose text search, and fallback selectors
- *Tier 3:* hands Claude a list of every interactive element on the page ("semantic recovery")
- *Tier 4:* hands Claude a live screenshot ("vision recovery")

To test Tier 3 and 4, every path the runtime can try on its own must fail. So the step 2 entry in `execution.json` and `recovery.json` was given fake, non-existent selector strings and fake anchor words — things that will never match a real element on the Render dashboard. The runtime will burn through every Tier 1 and Tier 2 attempt, find nothing, and then produce the structured Tier 3/4 recovery response that tells Claude to look at the page and figure out the right element.

**What was not changed.** Only the step 2 data inside the skill pack files was changed. The recovery engine itself (`runtime/recovery.js`, `runtime/run.js`) was not touched. All other steps in the skill pack are unchanged. The manifest checksums were updated to match so the runtime's integrity check still passes.

**To restore the skill pack to working order.** Re-run the skill compile from Build Studio (or restore the original `execution.json` and `recovery.json` from git) and update the checksums in `manifest.json`.

---

## Updated: cost model no longer includes LLM selector generation — 2026-06-30

**What changed.** The `docs/cost_model.md` was updated to reflect that Conxa no longer uses LLM to write CSS/Playwright selector strings. That work is now done deterministically by `IdentityBundle` and `selector_grammar.py`, which always produce selectors from recorded DOM signals — no matter what the page looks like.

**Why it matters for cost.** Previously, every step that didn't have a perfect `data-testid` or `aria-label` triggered 5 extra LLM calls just to generate and cross-check selectors. That was the biggest variable in compilation cost. With the deterministic approach, every step now fires exactly 2 LLM calls: one for intent, one for the visual anchor screenshot. Always. The cost model now reflects this.

**Numbers that changed:**
- Per-step cost: was $0.014–$0.036 (2–7 LLM calls), now a flat $0.001–$0.014 (2 calls, provider-dependent)
- Fresh 15-step workflow: Starter/Pro dropped from ~$0.54 → ~$0.21; Enterprise from ~$1.93 → ~$0.81
- Blended compilation cost: Starter/Pro from ~$0.195 → ~$0.075; Enterprise from ~$0.695 → ~$0.292
- Build-heavy gross margin: Starter improved from ~56–67% → ~68–81%

**What didn't change.** The LLM still handles intent detection, visual anchors (screenshot-based), recovery at Tier 3+, and the workflow intent graph. Those costs are unchanged. Caching still applies the same way — same element hash, same screenshot hash = zero tokens.

---

## Fixed: skill execution "got stuck" forever in Claude Desktop (but worked in Build Studio) — 2026-06-30

**What you saw.** Running the Render "create a service from GitHub" skill through Claude
Desktop just hung. After about 4 minutes you got *"No result received from the Claude Desktop
app."* The exact same skill ran fine inside Build Studio. Very confusing.

**What was really happening.** I read the logs from both Claude Desktop and the Conxa runtime
and lined up the timestamps. The skill started, got through the first couple of steps, but then
one step took **4½ minutes** on its own. The web page never settled into the state the skill
expected, so the runtime kept patiently retrying. Meanwhile Claude Desktop only waits **4
minutes** for an answer — so it gave up and sent a "cancel" message. **The Conxa runtime
ignored that cancel.** It kept grinding for another 1½ minutes, then opened (and left open) a
browser waiting for help that could never come, and finally produced an answer that Claude
Desktop had already stopped listening for. From your side: a permanent hang.

Build Studio never hit this because it runs the page in the freshly-recorded state where every
step is found instantly — it never gets near the 4-minute limit.

**Two extra things that made it worse:**
- The test input was `SEARCH_ENGINE`, which isn't a real GitHub repository. Render's repo
  search found nothing, so the page never showed the next field — that's what made one step burn
  4½ minutes. **Retest with a real repo** (one that has a `render.yaml`).
- This PC's runtime auto-update is broken — it keeps downloading empty update files (a server is
  handing back 0-byte files), so the runtime is stuck on an old host and can't fix itself. That's
  a separate, cloud-side problem worth chasing, but it isn't what caused the hang.

**The fix (in the runtime/execution engine).** Two layers, because the first alone wasn't enough:

*Layer A — a hard time budget (the real cure).* The runtime now gives every run a wall-clock
budget (default 3.5 minutes) that is deliberately **shorter than Claude Desktop's 4-minute
patience**. If a run ever reaches that budget, it stops itself and returns a clear, useful message
— e.g. *"Execution stopped after exceeding the 210s time budget at step 3. The page never reached
the expected state — most often the inputs don't match what the site returned (e.g. a search with
no results)…"* — **while Claude Desktop is still listening.** So instead of a silent 4-minute hang
followed by "No result received," you now get a fast, plain-English explanation you can act on.
This works no matter *why* a step is slow.

*Layer B — honour the cancel signal.* The runtime also listens for Claude Desktop's cancel (sent
when it gives up, or when you cancel). The moment it arrives, execution stops within a second,
closes the browser cleanly, checks for the cancel between every recovery attempt, and skips the
wasteful screenshot/"park a browser for later" work that nobody is waiting for anymore.

**Why two layers?** The cancel-handling (Layer B) stops the runtime from leaving a zombie browser
behind — important, but invisible to you, because once Claude Desktop has given up it ignores
whatever the runtime says next. The time budget (Layer A) is what you actually *see*: it guarantees
the runtime answers **before** Claude Desktop loses patience, so the 4-minute "stuck forever" screen
can't happen again.

**Proof it works (both layers, against the real installed runtime on this PC).**
- *Time budget:* gave a run an 8-second budget and sent **no** cancel. The run that used to grind
  for ~5 minutes stopped itself at ~9 seconds and returned the "exceeded the time budget at step 3"
  message — no zombie browser. Scaled up, that's ~3.5 min vs Claude Desktop's 4 min: it always
  answers first.
- *Cancel handling:* started the skill, waited 8 seconds, sent the exact cancel message Claude
  Desktop sends on timeout — the runtime logged it instantly, stopped in half a second, parked
  nothing. (Pre-fix: kept running ~90s and parked a zombie.)
- Automated tests: cancellation-at-boundary, cancellation-mid-recovery, and wall-clock-deadline all
  pass, and every existing runtime suite still passes (recovery, resolver, agent-recovery,
  resolve-adapter — 30+ tests, zero failures).

**Will the fix stick?** Yes. The patched code is staged on this PC (old version safely backed up).
I checked whether the broken auto-update could overwrite it: it can't. The host-exe update file on
the server is empty (0 bytes), so the host stays on its current version; and the newer app bundle
refuses to install on an older host. That combination means the patched layer survives Claude
Desktop restarts. (Both are still cloud-side bugs worth fixing — the empty release files — but they
no longer threaten this fix.)

**What's left for you.** Two things, because I can't drive Claude Desktop's chat myself:
1. **Fully quit and reopen Claude Desktop** (quit from the tray — not just close the window).
   Claude Desktop loads the runtime from `C:\Users\Lenovo\.conxa\conxa-app`, and it only re-reads
   those files when it restarts. Your last restart happened a few minutes *before* the time-budget
   fix was staged, so it's still running the older code — one more restart picks up the latest.
2. **Run the skill with a real GitHub repo** that contains a `render.yaml` — not `SEARCH_ENGINE`.
   With a real repo every step finds what it needs and the workflow finishes fast, the way it does
   in Build Studio. If you *do* use a bad input again, you'll now get a clear "time budget" message
   in ~3.5 minutes instead of a 4-minute hang — but a real repo is what makes it actually succeed.

---

## Self-healing recovery made enterprise-ready: Tier 3/4 now actually work — 2026-06-30

**The problem.** Conxa's recovery system was documented as having four "tiers" of getting
unstuck when a button or field moves on a webpage, but only the first two actually did
anything. Tiers 1 and 2 are the smart, free, automatic fixes (re-find the element, wait for
it, scroll to it, look it up by its accessibility label). Tiers 3 and 4 — where Claude itself
looks at the page text and a screenshot to find the right element — were half-built: when a
step failed, the runtime would send Claude a screenshot and say *"fix the selector and try
again,"* but **there was no way for Claude to actually hand back the fix.** So Claude could see
the problem but couldn't apply the solution. The healing loop had a missing last step.

**What we fixed:**

- **Added the missing "hand the fix back" step.** When a step fails and Claude figures out the
  right element, it can now pass that answer back (`step_overrides`) and the workflow resumes
  using Claude's correction — instead of just re-running the same broken instructions. This is
  the change that finally makes Tier 3 and Tier 4 real.
- **A clear on/off switch for where the smart recovery runs.** During internal Build Studio
  testing, only the free automatic Tiers 1–2 run, so a recorded workflow is judged honestly on
  its own quality (if it can't recover on its own, the test fails — as it should). During real
  use through Claude, all four tiers turn on automatically, including Claude's visual recovery.
  Controlled by a single setting (`CONXA_MAX_RECOVERY_TIER`).
- **A much clearer help message when a step fails.** Instead of a vague dump, the runtime now
  sends Claude a tidy package: what the step was trying to do, a list of the clickable things
  currently on the page (for "by description" recovery), and screenshots (for "by sight"
  recovery), plus exact instructions on how to send the fix back.
- **Better logging.** The runtime now records which recovery ceiling is active and every time a
  recovery is requested or a Claude-supplied fix is applied, so issues are traceable.
- **Caught and fixed a load-time crash** during end-to-end testing (a missing variable
  declaration that would have stopped the runtime from starting) before it could ship.

- **Fixed the bug that would have made Claude's fixes useless in practice.** Self-healing
  happens across a round-trip: the workflow fails, Claude looks at the page and decides on a
  fix, then asks to continue. The old code threw away the browser page the moment a step
  failed — so when Claude said "click *this* button," the workflow had already snapped back to a
  blank page and Claude's correct answer landed on nothing, failing again. Now the runtime
  **keeps the failed page open and waiting** (for a few minutes) so Claude's correction is
  applied to the exact same screen Claude was looking at. The page is automatically cleaned up
  if Claude never comes back, so no browser is left hanging around.

**How we proved it:** new automated tests, plus a real-browser end-to-end test showing a
deliberately-broken step fail cleanly through Tiers 1–2 and then heal when Claude's correction
is supplied. Most importantly, a **full-loop test through the real installed runtime** — fail →
recovery request → Claude picks the right element → resume → **"Done."** — which initially
exposed the "blank page" bug above and now passes start to finish. The packed-runtime replay and
tier-ceiling tests also pass.

---

## CLAUDE.md updated to reflect major codebase changes — 2026-06-30

Updated the project guide (CLAUDE.md) to match all the big changes that happened over the last several weeks. The old guide was missing a lot of important new files and incorrectly described how the runtime works.

**What changed in the guide:**

- **Runtime is now two pieces, not one.** There's a small "host" program (the .exe) and a separate "app layer" (the actual skill-running code on disk). The host just boots things up and provides shared tools. The app layer lives at `~/.conxa/conxa-app/` and can be updated by the cloud without reinstalling the whole app. This is a big deal — customers get fixes without needing to reinstall.
- **New runtime files documented.** `resolver.js`, `resolve_adapter.js`, `recovery.js`, `bootstrap.js` — these all existed but weren't in the guide. Each has a clear job: resolver finds elements, resolve_adapter connects it to the browser, recovery handles when things go wrong, bootstrap starts the whole thing and checks compatibility.
- **The selector/element-finding system was rewritten.** The compiler no longer uses AI to write CSS/XPath selectors (it had a ~30% error rate). Instead it uses a new system called IdentityBundle that generates reliable, deterministic selectors. The guide now points to the right files for this.
- **CI/CD workflows added.** Two separate GitHub Actions pipelines now exist — one builds the host exe, one builds the app layer. The app layer pipeline runs a real skill replay test before publishing (the "execution gate"). This wasn't documented at all before.
- **New docs file added** (`agentic-discovery-strategy.md`) — covers how the system learns and improves over time, with admin approval gates.
- **Key rules updated.** Added new non-negotiable rules: host exe must never use V8 bytecode (it breaks Playwright), the resolver must never blindly pick the first match, AI must not write selector strings, and the app layer's version compatibility check must never be bypassed.
- **Install location corrected.** The runtime installs to `~/.conxa/` not `%LOCALAPPDATA%\conxa\runtime\` — the guide was wrong.
- **"Where to look" table expanded** with all the new files and concerns.

---

## "Deploy stops at search_repositories" — Element finding fix — 2026-06-29

**Problem:** Running "Conxa deploy SEARCH_ENGINE repo on Render" through Claude kept stopping
at the step where it searches for the repository ("Search repositories" box). Sometimes it
limped past that step but then died one or two steps later ("Element not found"). It was
flaky — occasionally a whole run got lucky and finished.

**What was actually wrong (the real root cause, not just that one step):**

The runtime finds each element on the page using a "scorecard". It looks at the element the
recorder saw (its test-id, its role, its text) and compares that to what's on the live page.
If the scorecard is confident enough, it acts. If not, it falls back to slower, flakier
recovery methods.

For **text boxes** (the repo search field, the blueprint-name field, and similar inputs) the
scorecard was always coming back as **zero confidence**, so the fast, reliable path was never
used. The runtime was limping through the *entire* workflow on the flaky backup method —
which is exactly why it failed at a different step each time, depending on which one happened
to load too slowly.

Two reasons the scorecard hit zero:

1. **"input" vs "textbox".** The recording stored the element's type as the raw HTML tag
   `input`, but the live browser reports a text box's role as `textbox`. The scorecard saw
   `input ≠ textbox` and counted it as a *disagreement* — even though they mean the same
   thing.
2. **Missing test-id on the recorded side.** The element's unique `data-testid` was stored in
   the "how to find it" list but left blank in the scorecard data, so the strongest possible
   match signal was ignored.

With the only available signal scored as a mismatch, the element — even when it was the one
and only exact test-id match on the page — got thrown away.

**The fix (in `runtime/resolver.js`):**

1. **Treat tag names and their real roles as the same thing.** `input` now matches `textbox`,
   `a` matches `link`, `select` matches `combobox`, etc. No more false disagreements.
2. **Trust a unique "contract" match.** When an element is found by a unique test-id or a DOM
   id and there's exactly one match on the page, the runtime now trusts it — unless something
   actively contradicts it (e.g. a *different* test-id). A blank/old scorecard can no longer
   veto the one obviously-correct element.

**Result (measured against the live Render dashboard):**

- Before: the search-repo step needed flaky recovery on *every* run and failed intermittently.
- After: **4 out of 4 runs** drove the whole workflow (New → Blueprint → search & connect repo
  → name it → Deploy Blueprint) with **zero recovery — every element found on the fast path**,
  ~5.6 s per run. Clicking "Deploy Blueprint" correctly lands on Render's blueprint-sync page,
  i.e. the deploy is submitted.

**Files changed:** `runtime/resolver.js` (the fix), `runtime/test/test_resolver.js` (3 new
regression tests). All 43 runtime tests pass. The fix was also dropped straight into the
installed brain at `~/.conxa/conxa-app/resolver.js` so this machine has it now.

**To ship to all customers:** tag a new `app-v*` release so the cloud rebuilds the obfuscated
app layer from the fixed `resolver.js`. (The host `.exe` doesn't carry this code, so it does
not need a rebuild.) The local copy intentionally keeps `app_version` unchanged so the
self-updater doesn't overwrite the hand-patched file before that release ships.

**Not a Conxa bug — why the deploy itself still shows red on Render:** the SEARCH_ENGINE
blueprint creates a *free* PostgreSQL database, and the Render account already has one
(`conxa-db`, ~24 days old, left over from earlier testing). Render allows only one free
database per workspace, so it refuses the new one and cancels the two web services that depend
on it. The automation did its job perfectly; this is a Render account-quota issue. A fully
green deploy needs that old free database (and the stale `conxa-api` / `conxa-web` test
services) deleted first.

## Chromium Install Fix — 2026-06-29

**Problem:** When a customer ran the installer, it showed:
> "Chromium installation failed (code 1). Automation may not work."

No explanation. Customers couldn't tell if it was their internet, antivirus, a network timeout, or something else.

**Two things were fixed:**

### 1. The installer now tells you *why* it failed

Previously, when Chromium download failed, the error message was swallowed and the installer just showed the exit code (1). Now:

- When the download fails, the runtime saves the real error message to a small file before exiting.
- The installer reads that file and shows the actual reason in the dialog — e.g. "net::ERR_CONNECTION_TIMED_OUT" or "playwright install timed out (10-minute limit exceeded)".
- If the error file isn't there for some reason, you still get a fallback message with the retry command.

**Files changed:** `runtime/server.js` (writes the error file), `packages/conxa-core/.../setup.nsi.tmpl` (reads it and shows it).

### 2. The Chromium download itself was completely broken in the installed .exe

This was the bigger bug. After fixing the error message, we could finally see what was actually going wrong:

```
playwright install init failed: Cannot find module 'playwright-core/lib/cli/program'
```

**Why:** The installer runs `conxa-runtime.exe --install-playwright`. The `.exe` is a packed binary — it carries a copy of `playwright-core` inside its own built-in storage (the "snapshot"). But the actual JavaScript that handles `--install-playwright` loads from disk (`conxa-app/server.js`). When disk-loaded code does a plain `require("playwright-core/...")`, it looks in the wrong place — on disk — where playwright-core doesn't exist. It was always failing immediately with "module not found."

**Fix:** Changed the `require` call to use `global.__hostRequire`, which is a bridge that the packed exe sets up specifically so disk-loaded code can reach modules inside the snapshot. This is the same pattern already used for `semver` — it just wasn't applied to the playwright require.

After the fix: Chromium downloads completely (~180 MB Chrome for Testing + FFmpeg + headless shell), the revision marker is written, and the browser launches correctly.

**File changed:** `runtime/server.js` — one line change at the `--install-playwright` handler.

**To ship this fix:** Tag `app-v*` (rebuilds the obfuscated app layer from the fixed `server.js`). The host `.exe` itself doesn't need a rebuild.

---

## README Deployment Guide — 2026-06-29

Added a "When to push what" reference table to `README.md` so it's easy to know which GitHub tag to push for any given file change:

- `studio-v*` → Build Studio installer + anything in `conxa-core` used by the compiler/installer
- `host-v*` → The `conxa-runtime.exe` pkg binary (push rarely — only for `server.js` or Node/pkg version changes)
- `app-v*` → The obfuscated JS app layer (`run.js`, `sync.js`, `tracker.js`, etc.) — push for any runtime logic changes
- Cloud backend changes → push to Render; frontend → auto-deploys to Vercel on merge

---

# Replay / Test Fix — Plain-English Writeup

**Date:** 2026-06-27
**Goal:** Make the Build Studio "Test workflow" (replay) stage actually work. Recording and compiling were already fine; replay kept failing with runtime errors.

---

## TL;DR (the short version)

Replay was broken in **three** layers, each hidden behind the one above it:

1. **Dev was running an old, stale copy of the runtime** instead of the current code → it
   couldn't find elements ("Element not found"). Fixed: in development, always run the real
   source code, never the stale pre-built copy.
2. **The real production binary (`conxa-runtime.exe`) had a completely dead element finder.**
   This is the big one — every click failed in production. Caused by the way the `.exe` was
   packed (V8 bytecode corrupted Playwright's selector engine). Fixed: build with
   `--no-bytecode`.
3. **Nothing in CI would have caught #2** — the build checks only confirmed the program
   *starts*, not that it can *click anything*. Fixed: added a real "click a button" test to
   the build pipeline that fails the build if the element finder is broken.

After all three: the full workflow replays end-to-end and finishes with `Done.` ✅ — in dev
*and* (once a new binary is released) in production, with a CI safety net so it can't
silently regress again.

---

## How replay actually works (so the rest makes sense)

When you click **Test** on a workflow, this chain runs:

```
Build Studio (Python)  →  spawns the Node "runtime"  →  opens Chromium  →  runs each step  →  checks result
```

1. The Python backend (`backend.py`) takes your built skill pack and your saved login session.
2. It launches the **runtime** (a Node.js program) and tells it: "execute this skill."
3. The runtime opens a browser, logs in using your saved session, and performs each recorded step (click, type, scroll…).
4. If every step works, it returns `Done.` If a step can't find its element, it returns `Element not found (resolve miss)`.

There are **two versions of the runtime** on disk:

- **The source code** — the editable files in the `runtime/` folder (currently version **1.1.0**, with all the recent fixes).
- **A pre-built `.exe`** — a frozen snapshot bundled into a single file (`conxa-runtime.exe`), which was an **older** build (version **1.0.3**).

This difference is the whole story.

---

## Step-by-step: what I did

### 1. Traced the replay path
Read the code to map exactly how Test works: `backend.cmd_test_workflow` → `call_runtime_tool` → Node runtime's `execute_skill`. Confirmed the runtime reads each skill's `execution.json` and runs the steps.

### 2. Read the existing error logs
Looked at `runtime.log`. The repeating real error (ignoring harmless network noise) was:

```
Step 4 (click) failed: Element not found (resolve miss)
```

### 3. Reproduced it for real
Wrote a small script that runs replay exactly like the Test button does — same skill pack, same saved login, headless browser. This gave me the *current* failure instead of guessing from old logs.

### 4. Found the failure had moved forward
With the **current** runtime source, replay no longer died at step 4 — it now got all the way to **step 9** (the final "Deploy Blueprint" click). That's progress: the old step-4 problem was already gone (it was caused by an outdated compiled pack that has since been recompiled).

### 5. Looked at the actual page when step 9 failed
The runtime gives back a screenshot + a list of buttons on the page at the moment of failure. The page said:

> **"Blueprint file render.yaml not found on main branch"** — with a **Retry** button.

So "Deploy Blueprint" genuinely wasn't on the page. **This was not a bug** — I had tested with a repo (`conxa-cosmos`) that has no `render.yaml`, so Render correctly refused to deploy. The replay engine was behaving correctly.

### 6. Re-tested with a valid repo
Using the `SEARCH_ENGINE` repo (which has a `render.yaml`), replay ran **all the way to the end**:

```
Done. URL: https://dashboard.render.com/blueprint/exs-…/sync/exe-…
```

### 7. Checked the *real* product path — and it failed
My test above ran the **source code** runtime. But the actual Test button can end up running the **pre-built `.exe`**. So I re-ran using that staged `.exe`. It **failed at step 1** — couldn't even find the first button — even though the source-code runtime passed the exact same workflow.

That mismatch exposed the real bug.

### 8. Fixed the bug (see below), then re-verified
After the fix, the staged-exe path now correctly runs the source code and replay passes end-to-end again. Added a test so this can't silently break again.

---

## The actual bug (in easy language)

There are two helpers in the Python backend:

- One that **decides which runtime folder to use**. In development it correctly says: *"use the source code, so the developer's latest edits are tested."*
- One that **actually launches the runtime** (`call_runtime_tool`). This one had a different rule: *"if there's a pre-built `.exe` lying around in the sandbox, run that first."*

These two disagreed. The launcher always grabbed the old pre-built `.exe` if it existed — **even in development** — quietly ignoring the source code. So:

> You edit and improve `runtime/` (now version 1.1.0), hit Test… and it silently runs the **old 1.0.3 `.exe`** instead. Your fixes never run. The old runtime can't find some elements → "Element not found."

That's why replay kept failing with runtime errors that didn't match the current code.

### The fix

One change in `conxa-builder/python/conxa_compile/conxa_runtime.py` (`call_runtime_tool`):

> **If the runtime folder is real source code (it has `server.js` + `package.json`), always run it with `node` — never fall back to a stale pre-built `.exe`.**

- **Development** → runtime folder is source → runs `node server.js` (your latest code). ✅
- **Customer / packaged build** → runtime folder is just the `.exe` (no `server.js`) → still uses the `.exe`, exactly as before. ✅ (unchanged)

I also added a regression test (`test_dev_source_tree_runs_node_not_stale_sandbox_exe`) that fails if anyone reintroduces the old "prefer stale exe" behavior.

---

### Files changed for the dev fix

| File | What changed |
|---|---|
| `conxa-builder/python/conxa_compile/conxa_runtime.py` | `call_runtime_tool` now prefers the source-code runtime in dev instead of a stale staged `.exe`. |
| `conxa-cloud/tests/test_conxa_runtime.py` | Added a test that locks in the new behavior. |

> This was only the *first* layer. The dev fix made replay pass when run via `node`, which
> then exposed the bigger production bug below. The full list of everything changed is in
> **"Everything I changed"** near the end.

## Two things to know

1. **Restart needed:** The Python backend caches the old code while running. After this fix, **stop and restart `npm run dev`** so the new behavior loads.
2. **Real deployments were created:** The last step of this workflow is literally "Deploy Blueprint", so testing it created real blueprints in your Render account (`conxa-replay-test`, `conxa-replay-exe`). Delete them from the Render dashboard if you don't want them.

## Follow-up: the bigger production bug (host exe Playwright was dead)

After the dev fix, we asked "does this work in production?" It did **not** — for a deeper
reason. Production customers run the packed **host exe** (`conxa-runtime.exe`), not `node`.
A production-faithful test (real host exe + freshly built app layer) showed:

- Same page, same Chromium: `node` found 13 buttons via Playwright; the **host exe found 0**
  (`page.locator(...).count() === 0`), even though `page.evaluate(...)` saw all 13.
- Meaning: **the packed exe's Playwright selector engine was completely dead** — every
  click/type step fails to find its element. Production replay never worked through the exe.

**Root cause:** the exe is built with `@yao-pkg/pkg`, which compiles bundled JS to V8
bytecode. Playwright ships its selector engine as a ~300 KB string inside
`injectedScriptSource.js`; pkg's bytecode step silently corrupts that giant-string module,
so the selector engine loads but sees an empty DOM. (`page.evaluate` runs in the page's
main world and is unaffected, which is why it kept working — a confusing symptom.)

**Fix:** build the host with `--no-bytecode --public-packages "*"` (in
`runtime/package.json` build scripts) so Playwright ships as plain source. Verified: the
rebuilt exe replays the full workflow to `Done.` (The app layer already abandoned bytecode
earlier for the same class of issue, so this is consistent.)

**How it was proven:** built the app layer exactly like CI does (obfuscated JS), ran the
**real host `.exe`** against it, and watched every locator return 0 — then rebuilt the host
with `--no-bytecode` and watched the same workflow run to `Done.`.

## A small regression I caught and fixed

While fixing the above I'd tightened a "test id" pattern and accidentally stopped it from
matching the most common spelling `data-testid` (no hyphen) — only `data-test` and
`data-test-id`. A unit test caught it. Fixed the pattern in both the compiler
(`identity_bundle.py`) and the runtime (`resolve_adapter.js`) so all three spellings work.

## How this can't silently break again (CI safety net)

The build pipeline previously only checked that the runtime **starts** (an "MCP initialize"
ping). That is exactly why a binary that couldn't click anything still shipped. I added a
**real replay test** to the build:

- A tiny self-contained fixture: a local HTML page with one button + a 2-step skill that
  navigates to it and clicks it. No internet, no login, no secrets.
- A runner (`runtime/test/gate_replay.js`) that drives the packed `.exe` through that skill
  and **fails the build unless it reaches `Done.`**.
- Wired into both build workflows — the host build (`build-runtime-host.yml`) and the app
  build (`build-runtime-app.yml`).

Verified it actually catches the bug: the test **passes** on the fixed `.exe` and **fails**
on the old broken one.

## Everything I changed (branch `fix/replay-dev-prod-parity`)

| Commit | What |
|---|---|
| `48517f1` | Dev runs real source (not stale `.exe`) + resolution/compiler quality fixes + version hygiene + regression test |
| `145acb9` | **The big one:** build the host `.exe` with `--no-bytecode` so Playwright's element finder works in production |
| `a8c60b8` | Fix the `data-testid` spelling regression |
| `76fd7b8` | Add the real "click a button" CI gate (fixture + runner, wired into both workflows) |
| `a0a8005` | Point the app build's required host at the fixed `host-v1.1.2` |

Tests: **376 passed**; the 6 remaining failures are pre-existing on `main` and unrelated.

## What's left for you (ships to customers — needs a release)

These steps actually push the fix to production; they affect paying customers, so I didn't
trigger them:

1. **Release `host-v1.1.2`** (push that git tag). CI rebuilds the fixed `.exe` and now runs
   the click test on it. *This is the step that unblocks production replay.*
2. **Then release `app-v1.2.2`** (push that tag). Its build downloads `host-v1.1.2`, replays
   the fixture against it, and ships the latest element-finding improvements.
3. New Build Studio build + recompile/republish your skills (so packs use the latest compiler).

(Order matters: the host must be released **before** the app tag, because the app build now
tests against it.)

---

## Fixed: runtime version numbers were hardcoded in package.json instead of being set automatically — 2026-06-30

**What you saw.** `runtime/package.json` had `"version": "1.1.5"` and `"host_version": "host-v1.1.5"` written by hand. Every time a new release was cut, someone had to remember to bump both fields manually before pushing the tag.

**What was really happening.** The CI build for the host exe already stamped `host_version` from the git tag at build time — so that field was fine in practice. But `version` (the npm version, exposed to the rest of the runtime as `__runtimeVersion`) was never touched by CI. It only changed if a developer remembered to edit the file before tagging.

**The fix.** The "stamp" CI step in `build-runtime-host.yml` now also updates `version` by stripping the `host-v` prefix from the release tag. Tag `host-v1.2.0` → both `version: "1.2.0"` and `host_version: "host-v1.2.0"` are baked into the exe automatically. The values in `package.json` are just dev-time placeholders now — you never need to edit them for a release.

---

## Side notes (not bugs)

- The `401` / `ENOTFOUND apis.conxa.in` lines in `runtime.log` are harmless — that's just telemetry failing in test mode. Execution continues normally.
- Testing with a repo that has no `render.yaml` will always "fail" at the deploy step — that's Render refusing to deploy, not a Conxa bug. Use a repo with a valid `render.yaml`.
- My replay tests deployed real blueprints to your Render account (`conxa-db`, `conxa-api`, `conxa-web`, plus blueprint instances). Delete them from the Render dashboard if unwanted.
