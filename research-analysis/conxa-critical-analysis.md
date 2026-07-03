# Conxa — The Complete Critical Analysis

**Date:** 2026-07-03 (final version)
**Written by:** Fable (Claude), with the founders
**What this is:** The full record of a critical review of Conxa. It began as a deliberately brutal report that assumed the company would fail. The founders then answered the criticisms one by one — twelve answers in total — and each was weighed honestly. Some criticisms fell entirely, some were narrowed, and a short list of hard limits survived that no answer can change. This final version is organized so a founder can read it top to bottom and know exactly where the company stands and what to do next.

**Decisions recorded during the review:**
- **Option A is the strategy:** vendors build their branded agent-setup installer in Conxa Build Studio, and their customers use it. Target: **small and mid-sized SaaS vendors.**
- **Installers will be digitally signed** (Windows and Mac).
- **Mac versions will be released.**
- **Conxa only automates software the vendor owns**, enforced by domain verification at publish.

---

## 1. What is Conxa, in one minute?

A person at a software company opens Conxa's Build Studio and records themselves doing a task — say, "create a new lead in the CRM" — by clicking through their own product. Conxa saves much more than the clicks: for every button it stores many independent ways to find it again (label, role, test-id, nearby text, a screenshot). That becomes a **skill**.

The vendor publishes the skill and ships it to their customers as a signed installer. The customer runs it once; from then on, Claude (or any MCP-capable AI agent) on their computer can execute that workflow. A browser opens locally and replays the steps. If a button has moved, Conxa tries several free backup methods to find it; only when those fail does it ask the AI for help.

Three parts: the **Build Studio** (record + compile, on the vendor's machine), the **Cloud** (hosting, billing, telemetry — it never executes anything), and the **Runtime** (the player on the customer's machine).

The core judgment behind everything below: **the recording and replay technology is genuinely good — better than classic RPA. The open questions were always about the business around it.** Most of them now have answers.

---

## 2. What are the problems?

Ten were found. Every one now has an answer on record — the dividing line is no longer *answered vs. unanswered*, it is ***built vs. not yet built***. Severities below are the current ones, after the answers were weighed in.

| # | Problem, in one sentence | Started at | Now | Why it moved |
|---|---|---|---|---|
| P1 | Big software companies don't need Conxa — they can build their own connector | Critical | **High** | Answer 2: target small/mid-size vendors; needs paying-customer proof |
| P2 | The market is squeezed from both sides — official connectors above, smarter AI below | Critical | **High** | Answers 6 + 9: determinism blunts the AI half; long-tail history + the graduation strategy answer the connector half. Stays High until graduation ships |
| P3 | A skill recorded on one account may not work on another customer's account | High | **Medium-High** | Answer 3: generalized signals + "too dynamic is out of scope" policy; still needs the real-world test |
| P4 | Company IT departments will distrust the installer | High | **High** | Answer 1: signing committed (real progress); SOC 2, SSO, device identity remain |
| P5 | Everything depends on Claude Desktop | High | **Medium-High** | Answer 10: MCP is open — any agent can connect; small engineering makes it true in practice |
| P6 | Expired logins, MFA, and passkeys interrupt automation | High | **Medium-High** | Answer 8: manual re-login at next run is the accepted design |
| P7 | A wrong click can succeed silently, and there is no undo | High | **Medium-High** (Medium once built) | Answer 12: the five-layer safe-action system |
| P8 | Execution is slow and one-at-a-time per computer | Medium-High | **Medium** | Answer 7: parallel browser contexts + runner machines |
| P9 | Automating other companies' websites violates rules and triggers bot-blockers | Medium-High | **Low** | Answer 11: only vendor-owned software, enforced by domain verification |
| P10 | "Teach once, run forever" becomes "re-record after every redesign" | Medium | **Medium** | Fixable with vendor tooling (build item 4) |

---

## 3. The twelve answers, and what Fable thinks of each

This is the heart of the document — every argument made during the review, with an honest verdict.

### Answer 1 — "We will provide signed programs."
**Verdict: accepted; the cheapest win on the list.** Signing removes the scariest install moment (Windows warning against an unknown download) and, on Mac, is mandatory (unsigned, un-notarized apps simply won't open). What it doesn't fix: security software judges what a program *does* — edit Claude's settings, hold logged-in sessions, update itself — not just who signed it. Signing opens home and small-business doors; enterprise doors also need SOC 2 and IT-friendly packaging (§6).

### Answer 2 — "Big companies can build APIs, but for small and mid-sized companies, maintaining an API is more hassle than maintaining Conxa."
**Verdict: fair, and it saved the business thesis — but it's an argument until customers prove it.** A large vendor's one engineer can wrap their internal API in an official connector in a sprint; for them, Conxa loses every comparison. But a 10–50 person SaaS company has no spare engineer, and a connector is not a one-time job — it needs docs, auth support, versioning, and updating forever. A product manager re-recording a workflow in an afternoon genuinely is cheaper *for that segment*. Still open: small vendors sign small contracts, skill upkeep isn't free either, and connector-building gets easier every year. The proof that settles it: **paying small vendors who stay through one of their own UI redesigns.**

### Answer 3 — "Recordings are generalized, and websites that are too dynamic per user, we don't automate."
**Verdict: half accepted.** The multi-signal design genuinely absorbs ordinary change — a button restyled, moved, or renamed slightly. But the scariest cases aren't drift: a button that *doesn't exist* on the customer's cheaper plan, labels in German, menus hidden by user permissions. Those are normal SaaS behavior, not exotic dynamism — so the "out of scope" policy only works if the line is drawn measurably. The fixes are cheap and already planned: the cross-account test (§7, Proof B) and the recordability pre-check (§5, item 3).

### Answer 4 — "Non-technical people can't configure MCP — it's like coding."
**Verdict: accepted; a real selling point.** Setting up a local MCP tool by hand means editing a JSON config file; normal people won't do it. Conxa's installer doing it automatically is the right design for its audience. Nuance: this defends Conxa's own installer, not the case against connectors (a vendor-hosted connector is just a "Connect" button). And the same convenience is what IT departments read as "software silently modifying another program" — solved by giving IT its own deployment path (MSI/Intune).

### Answer 5 — "We will release Mac versions."
**Verdict: accepted; meaningful reach.** End users at small SaaS companies skew Mac-heavy. Budget the Apple side: a $99/year Developer ID plus notarization wired into CI.

### Answer 6 — "Enterprises want deterministic, trackable execution — not a hallucinating AI. Models were never trained on software behind logins. And latency is an engineering problem."
**Verdict: contains the strongest single argument of the entire review.** Weighed in parts:
- *"No training on our data"* — right instinct, but providers already offer no-training contracts; alone it stops nothing. What the instinct really points to is the determinism point below.
- *"Models never saw auth-walled software"* — partially right, and most right exactly in Conxa's niche. Screen-driving AIs read screens generically and handle ordinary modern UIs they've never seen; they measurably struggle on dense legacy screens, old ERPs, and homegrown tools — Conxa's best targets. Caveat: this moat erodes with each model generation.
- *"Deterministic and trackable"* — **the winner.** A compiled skill runs the same steps in the same order every time, with a step-by-step log; a live agent improvises a fresh path every run. For regulated work, replayability plus an audit trail *is* the product. And the runtime already has the switch: cap the recovery ceiling and a skill runs with zero AI in the loop — fully deterministic, fail-closed. Productize it as **Strict Mode** and Conxa makes a promise no live agent, at any capability level, can ever match.
- *"Latency is engineering"* — half right. Pacing delays, browser cold-start, and conservative waits can be cut ~2–3× (from ~6–8 s a step toward ~2–4). Pages must still load and render — that floor never moves. Sharper framing: for scheduled, unattended runs, nobody is watching; 90 seconds vs. 2 seconds is irrelevant at 3 a.m.

### Answer 7 — "One run at a time? We can fix that — it's engineering."
**Verdict: mostly accepted.** Two steps. (1) A browser-context pool gives 3–5 parallel runs per machine now — the async plumbing already exists. (2) The real unlock is **runner machines**: customer-owned, always-on VMs, kept logged in, triggered by a scheduler. That's exactly how the big RPA vendors deliver unattended automation; enterprises already accept the model; ten VMs × 4 contexts × 24 hours ≈ thousands of runs per day — and the "cloud never executes" rule survives untouched, because the VMs belong to the customer. What stays unfixable: elastic burst (an API absorbs 10,000 parallel calls in one second; VMs are capacity bought in advance).

### Answer 8 — "When a login expires, the user signs in again manually at the next run."
**Verdict: accepted as the honest design — with its cost named.** For a person at a laptop it's a 30-second interruption. Make it graceful: detect the dead session *before* step 1 (not at step 9 with half the workflow already written into the target system) and show a clear "your login expired — sign in" prompt — that's the session keeper (§5, item 7). On unattended runners it becomes a morning login ritual, exactly how real RPA teams live. One hard line: never build anything that automates past MFA — unwinnable, and precisely the behavior that gets flagged as malware.

### Answer 9 (written by Fable at the founders' request) — the answer to the official-connector squeeze.
**The problem:** every month more vendors ship official AI connectors, deleting products from Conxa's market — most valuable workflows first. **The answer, four parts:**
1. **History says the long tail never gets covered.** "Every vendor will integrate" has been predicted for 25 years and never happened. Zapier spent ~15 years making integration as easy as possible and covers roughly 8,000 apps out of tens of thousands — and even those expose only some features. The constraint was never effort; it's *willingness*. Below SaaS sits the layer that will never integrate: legacy systems, internal tools.
2. **Connectors expose operations; customers need workflows.** A real workflow crosses several apps and touches screens the vendor's API never exposes. A five-app chain needs five connectors and falls back to the browser at its weakest link — Conxa wins the whole chain when any single link is uncovered.
3. **Connectors decay.** The two-week build isn't the cost — year five is: auth changes, versioning, support. Small vendors abandon integrations (the stale-Zapier-app graveyard is the proof). This gives Answer 2 an empirical foundation.
4. **Own the graduation path.** When a vendor eventually outgrows browser automation, today that's churn. It doesn't have to be: a Conxa recording is effectively the *specification* for the official connector, and the recorder can also observe the network calls behind each step. Conxa can **generate** the vendor's official connector as a paid upgrade — and keep running the same governed skill over the connector as a faster backend. The threat becomes the upsell.
**Residue:** the top of the market still erodes, and part 4 is strategy until it ships (§5, item 11).

### Answer 10 — "Any AI agent that speaks MCP can connect — for starters, it's only Claude."
**Verdict: right in principle; it reframes the risk from architectural lock-in to a packaging choice.** MCP is an open standard — ChatGPT's desktop app, Cursor, VS Code, and open-source hosts speak it too. What's Claude-only in practice today: the installer registers only into Claude's config files (small fix); the smart-recovery loop is tuned to Claude's behavior and needs testing per host; pricing is framed in Claude allowances. What this answer does *not* fix: Anthropic itself competing — that stays on the hard-limits list. Shipping multi-host registration (§5, item 8) turns "any agent can connect" from principle into demo.

### Answer 11 — "We only automate software the vendor owns — enforced with domain verification."
**Verdict: accepted; it dissolves the bot-blocker and terms-of-service problem almost entirely.** You cannot violate your own terms of service. Bot-blockers flip from enemy to colleague — a vendor allowlists their own runtime on their own Cloudflare instead of anyone sneaking past it. Domain verification (prove ownership via a DNS record, Search Console-style) makes the policy *enforceable*, and it also protects Conxa itself: without it, someone could use the pipeline to distribute skills that automate a bank's website. Pleasant side effect: the "human-like pacing" feature loses its bot-evasion optics — if you only automate your own sites, you never need to look human; keep it purely as a stability aid or dial it down for speed. **The trade-off to own:** truly third-party sites (supplier portals, government websites) are out of scope, because you can't verify a domain you don't own. Enterprises automating their *own internal tools* still fit. Deliberate, and probably right — a legally-gray segment traded for a clean posture. If ever wanted later, it needs its own explicitly-consented mode; not something to drift into.

### Answer 12 (written by Fable at the founders' request) — the answer to "a wrong click can succeed silently, and there is no undo."
Not a magic fix — a **five-layer safe-action system** that pushes the error rate below the human doing the same task, and contains the damage when something still goes wrong:
1. **Classify every step by consequence** — read-only / reversible / irreversible (delete, submit, pay, send). Mostly automatic from the intent the compiler already extracts; the vendor confirms in the editor.
2. **Entity binding — the piece that kills the wrong-row delete.** Don't just verify "I found a Delete button"; verify "I found the Delete button *in the row containing this run's actual input* — Invoice #12345." The wrong row doesn't contain Invoice #12345, so acting on it becomes structurally impossible, not just unlikely. The recording already captures surrounding text; the run already knows its inputs; connecting them is engineering, not research.
3. **Fail closed at the point of no return.** On irreversible steps, the fuzzy "find something close" repair is *disabled* — "something close" is exactly what you never want to delete. Can't confirm the exact target → stop. Optional confirmation gate: the runtime pauses and sends a screenshot — *"About to click Delete on the row containing Invoice #12345 — confirm."* (Reuses the machinery the agent-recovery loop already has.)
4. **Stage-then-commit + dry-run.** Record workflows so the single irreversible click comes last; earlier failures then leave only harmless drafts. The compiler warns when an irreversible step sits early. Dry-run mode (run everything except the commit) falls out for free — and makes first-run calibration on a new customer's account completely side-effect-free.
5. **Compensation flows instead of undo.** True undo is impossible — *for everyone*: a workflow spanning three SaaS APIs can't roll back system A after system C fails either. The industry's answer is the compensating action, and in Conxa's world that's just another recording: a small "cleanup" workflow the runtime offers when a run dies midway.
Plus **before/after screenshots on every consequential step** — when something still goes wrong, the vendor knows exactly what, when, and to which record. **The honest benchmark:** never zero, but the right comparison is the human operator — who misclicks more, with no screenshots. Target: measurably below human error rate, every action evidenced, damage contained by design. Enterprises already accept exactly that standard from their own staff; Conxa can beat it and *prove* it.

---

## 4. What can NEVER be fixed?

The short list that survived all twelve answers. The plan routes around these; it doesn't argue with them.

1. **APIs will always be faster.** A page must load and render to be clicked. Conxa can get 2–3× faster, never 100×. *Route around it:* sell unattended and scheduled use, where nobody watches the clock.
2. **Committed actions stay committed — for everyone.** No true undo exists across systems, in browsers or APIs alike. *Route around it:* stage-then-commit structure, dry-run, and compensation flows (Answer 12).
3. **Wrong actions can be made rare and evidenced, never impossible.** Entity binding and fail-closed commits get the rate below a human's; ambiguous data and misclassified steps keep it above zero. *Route around it:* the safe-action system, and never auto-publishing repairs to the fleet.
4. **MFA and passkeys exist to stop unattended automation.** Manual re-login is the only legitimate answer; it caps how fire-and-forget the pitch can honestly be. Never build around MFA.
5. **Elastic burst.** Runner VMs buy volume, not the ability to absorb 10,000 parallel calls in one second. Don't sell that.
6. **The top of the market will get official connectors.** Most popular products, most valuable workflows first. *Route around it:* speed, the long-tail floor, and the graduation strategy that monetizes the erosion.
7. **The bot-blocker arms race is unwinnable — if entered.** Domain verification means Conxa never enters it. This stays listed as the standing principle: never automate sites your customers don't own.
8. **Anthropic could compete.** First-party recording/skills from the platform owner would hurt regardless of how many MCP hosts are supported. Only defenses: speed and the durability dataset (§5, item 9).

---

## 5. The build plan — what to build, and what each item buys

Twelve items, ranked by payoff-per-effort. This is where the answers become software.

| # | Build this | Fixes | Effort | What it buys, measurably |
|---|---|---|---|---|
| 1 | **First-run calibration** — check every skill against the customer's own account at install time, before the first real run | P3 | Medium | "This button doesn't exist on your plan" caught at onboarding, not mid-run. First-run success rate — the number the thesis lives on — becomes controllable. Most machinery (resolver scoring, drift gate, sandbox mode) already exists. |
| 2 | **Persistent repair memory** — remember a validated AI repair instead of re-paying it every run | Cost & speed | Small-Medium | A workflow with 2 weak steps: ~7,200 tokens *every run* → ~1,200 after the first repair. A Claude Pro customer gets ~45 runs per session instead of ~15. Signed pack untouched; fix lives in a local overlay keyed to pack version. |
| 3 | **Recordability pre-check** — green/yellow/red "will your product work?" score during recording | P3 + honest sales | Small | Turns "too dynamic is out of scope" into a measurable gate. Prevents the worst early-company event: a paying customer whose product was never going to work. |
| 4 | **Skill health dashboard + fast re-record** — health score per skill, drift alerts, diff-based republish in minutes | P10 | Medium | Makes "maintaining Conxa is less hassle than an API" *provably* true. Target: under 15 vendor-minutes per republish. The retention feature. |
| 5 | **Signed installers, Windows + Mac** (committed) | P4 | Small | Clean installs on both platforms. Windows EV cert + Apple Developer ID + notarization, inside the CI pipeline (the product *generates* installers, so signing must be automatic). |
| 6 | **Safe-action system** (Answer 12) — Strict Mode (the existing recovery-ceiling switch, productized) + consequence classes + entity binding + fail-closed commits + confirm gates + stage-then-commit warnings + dry-run + compensation flows + before/after screenshots | P7 + the determinism pitch | Medium-Large | The claims no live agent can ever match: "deterministic, replayable, fully audited — provably safer than a human operator." Unlocks finance/HR/payroll. Dry-run also makes item 1 side-effect-free. |
| 7 | **Session keeper** — detect dead logins before step 1; clear re-login prompts | P6 | Small-Medium | Converts mid-run failures into 30-second pre-run sign-ins. The polish Answer 8's policy needs. |
| 8 | **Scheduler + parallel pool + runner-machine profile + multi-host registration** — scheduled runs, several at once, on always-on customer VMs; metered API-key execution; register into non-Claude MCP hosts | P5, P8 | Medium-Large (multi-host alone: Small) | "Runs while you sleep" at volume: 3–5 parallel per machine, thousands/day on runner VMs — cloud still never executes. Turns Answer 10 from principle into demo. |
| 9 | **Fleet durability dataset** — aggregate every repair and drift event across companies into learned compile-time priors | P2 (the only compounding moat) | Medium | Every skill compiled gets stronger because of every skill that ran before it. The one asset neither connector-builders nor frontier models can copy — it only exists with a fleet. |
| 10 | **SOC 2 + enterprise packaging** | P4 | ~$15–40k + patience | Opens the enterprise segment (§6). |
| 11 | **Connector graduation path** — generate a draft official connector from a mature skill's recording + observed network calls; run the skill over it as a faster backend | P2 | Large (strategic) | Converts the biggest long-term threat into expansion revenue: vendors graduate *through* Conxa instead of churning away. |
| 12 | **Domain verification at publish** — vendors can only publish skills for domains they've proven they own (DNS record, Search Console-style) | P9 + platform abuse | Small | Makes "we only automate what the vendor owns" enforceable; kills the terms-of-service exposure; stops anyone using Conxa's pipeline against websites they don't own. Ship early — it should gate publishing before vendor sign-ups scale. |

**How they chain:** signed installers (5) get the runtime onto machines → domain verification (12) keeps the platform clean as vendors arrive → first-run calibration (1) makes the first workflow actually work on *this* customer's account → repair memory (2) keeps it cheap run after run → the session keeper (7) stops silent breakage between runs → the safe-action system (6) makes the risky steps provably safe → the dashboard (4) keeps vendors ahead of their own redesigns → every repair feeds the dataset (9), making the next compiled skill stronger → the scheduler and runners (8) turn it into real unattended volume → and when a vendor outgrows all of it, graduation (11) keeps them as revenue. Item 9 compounds; item 11 is the endgame.

---

## 6. Is the trust work (signing, SOC 2) hard? No — but it's on a clock.

| Item | Difficulty | Cost | Time |
|---|---|---|---|
| Code signing (Windows EV + Apple notarization) | Easy — a purchase plus CI wiring | ~$400–700/yr | 1–4 weeks |
| SOC 2 Type I | Moderate — policy discipline | ~$12–25k | 2–4 months |
| SOC 2 Type II | Moderate — the observation window is unavoidable waiting | ~$15–40k first year total | 6–12 months |
| SSO/SAML, per-device identity + remote revocation, MSI/Intune packaging | Real engineering | eng time | months, in parallel |

Facts that matter: signing keys must live in hardware (since 2023), so use a cloud signing service in CI (Azure Trusted Signing, DigiCert KeyLocker, SSL.com, SignPath). SOC 2 runs on a compliance platform (Vanta / Drata / Sprinto — Sprinto is India-friendly and cheapest) plus an auditor. **Conxa has a real scoping advantage:** the cloud is deliberately thin — customer execution and data never touch it — so the audit boundary is small and the audit cheaper than a typical SaaS company's. Non-US buyers often want ISO 27001 instead (~80% overlap, same platforms). Also replace the shared per-company sync token with per-device identity and remote revocation — today, one leaked installer is a company-wide token leak, and it's the finding any serious security review will surface first. Start both halves now; everything lands in about a year, and the only way to lose is to start late.

---

## 7. Engineering problems vs. execution problems

**Engineering problems** are §5 — all buildable. **Execution problems** are solved by discipline, money, and proof:

1. **Proof A — the market proof.** A handful of *paying* small/mid-size vendors who *stay* through one of their own UI-redesign cycles, with real upkeep numbers (vendor-minutes per republish) that beat what a connector would have cost. This is what turns Answer 2 from argument into fact.
2. **Proof B — the technology proof.** The cross-account experiment: 3 design partners, 5 workflows each, recorded on one account, executed on 3+ different accounts (different plan, language, role). Measure first-try success and paid-repair frequency. Good numbers validate Answer 3 with data; bad numbers show exactly where the "we don't automate that" line sits. Either result is worth more than any argument in this document — and once item 1 ships, this experiment becomes a permanent product feature.
3. **Stop selling to big vendors.** For them, building their own connector always wins; every sales hour there is wasted. The segments that pay: small/mid-size vendors (chosen), and enterprises automating API-less software **they control** — internal tools on their own domains, which pass domain verification. Truly third-party sites are out of scope by the Answer 11 policy, deliberately.
4. **Housekeeping diligence will find:** internal docs contradict each other in places (device registration marked both "done" and "missing"; payment provider listed as both Razorpay and Cashfree). An afternoon to fix; reads as process risk if left. And write the data-flow/retention one-pager (compile screenshots go through the LLM proxy to third-party AI providers; telemetry goes to Conxa's servers) *before* the first security questionnaire asks.
5. **Rewrite the PRD** around the decided strategy — chosen ICP, the envelope, Strict Mode, runners, domain verification, graduation. The strategy shifted at company level; that is exactly what the PRD is for.

---

## 8. Fable's own solutions — how I would solve each problem

The founders' answers are on record in §3. This section is different: it is **my** answer to each of the ten problems — what I would actually do, as the engineer and analyst who wrote this review. Where my solution is already in the build plan, I say so. Five ideas here are **NEW** — not yet in any plan — and they are marked.

### P1 — "Big vendors don't need us; the SMB market is unproven."
**My solution: make finding out almost free, and let the product do the selling.** Don't hire salespeople to argue the thesis — productize the funnel. Take the recordability pre-check (item 3) and publish it as a **free self-serve scanner**: "paste your product's URL, log in, get an AI-operability score in five minutes." **(NEW)** Every vendor who runs it is a qualified lead who has already seen their own green score; every scan is also market data about which products fit. Pair it with a "Works with Claude"-style badge program vendors can put on their site — SMB vendors buy *marketing advantages* faster than they buy *tools*. Keep the contract small and monthly; land, then expand. Proof A stops being a sales grind and becomes a conversion metric.

### P2 — "The market is squeezed from both sides."
**My solution: own the skill contract, not the executor.** The founders' determinism answer and the graduation strategy are right — but I would go one step further and make it architecture: **define the Conxa skill as a backend-agnostic contract** (steps, inputs, entity bindings, verifications, audit requirements) with the executor pluggable underneath — browser replay today, an official connector after graduation, even a frontier computer-use model someday, all running *the same governed skill*. **(NEW)** Then the squeeze stops mattering: whichever execution technology wins, Conxa owns the layer above it — the spec, the verification, the audit trail, the fleet data. Sell "governed, deterministic workflows" and let the engine underneath be whatever is best that year. The durability dataset (item 9) and graduation path (item 11) are the first two expressions of this; the contract framing is the strategy that unifies them.

### P3 — "A recording from one account may not work on another."
**My solution: treat every customer's account as its own dialect, and learn it locally.** First-run calibration (item 1) is the entry move, but I would make it *continuous*: after every successful run, the runtime quietly updates local signal weights for that tenant — which selectors worked, which needed fallbacks, what the local labels actually say. **(NEW — "per-tenant learning overlay")** The signed pack stays untouched (same rule as repair memory, item 2); the overlay adapts it to this account and gets sharper with every run. Skills then don't just *survive* tenant differences — they converge toward each tenant. Combined with dry-run calibration, a skill's tenth run on a strange account should be measurably more reliable than its first, and the telemetry can prove it.

### P4 — "IT departments won't trust the installer."
**My solution: signing and SOC 2 as planned — plus radical transparency where it's cheap.** Publish a short security whitepaper (the thin-cloud architecture is genuinely good; say it plainly), and **open-source the runtime's safety-critical parts** — the resolver, the recovery ladder, the session encryption — so a security team can audit what runs on their machines instead of trusting claims. **(NEW)** The moat was never in the resolver; it's in the compiler, the fleet data, and the distribution. Add the IT admin console from the enterprise packaging work (what's installed where, per-device revocation, kill switch) and the trust conversation changes from "prove it's not malware" to "here's the source and here's your kill switch."

### P5 — "Everything depends on Claude Desktop."
**My solution: never let a third party sit between the customer and a scheduled run.** Multi-host registration (in item 8) is right. I would add Conxa's own **minimal first-party invoker** — a tiny tray app / CLI with the scheduler built in — so the product works with *zero* chat hosts installed, and every chat host (Claude, ChatGPT, Cursor) becomes an optional front-end rather than a dependency. Item 8 already implies this; I'm making it explicit: the invoker is the insurance policy, the hosts are the convenience.

### P6 — "Logins expire; MFA interrupts."
**My solution: exploit the fact that in Option A, the vendor controls the login system.** Everyone treats auth as an external wall — but Conxa's chosen customer *owns the target application*. The vendor can issue **extended-lifetime, device-bound sessions for their own product's automation traffic** — longer TTLs for runner machines, session policies scoped to the verified domain. **(NEW)** The auth ceiling that kills browser-RPA against third-party sites is largely self-imposed in Conxa's model, and the vendor can simply configure it away for their own app. For everything else: the session keeper (item 7), plus per-app session-TTL learning — the runtime learns how long each app's sessions actually last and prompts re-login at the start of the workday instead of failing at 3 a.m.

### P7 — "A wrong click can succeed silently; no undo."
**My solution is already Answer 12** (the five-layer safe-action system, item 6). One addition: **publish the number.** Track and expose a per-skill measured wrong-action rate as an SLO — "this skill: 0 confirmed wrong actions in 12,400 runs." Safety that is measured and published is a sales weapon; safety that is merely claimed is marketing. The screenshots-and-logs evidence layer makes the number auditable.

### P8 — "Slow, one run at a time."
**My solution: the pool and the runners (Answer 7, item 8) — with one design rule added: parallel across apps, serial within an app.** The runtime's queue should automatically serialize runs that target the same application while running different apps in parallel — write conflicts disappear by construction instead of by luck, and nobody has to think about it. Cut the artificial pacing delays on verified-domain runs (the vendor allowlists their own runtime; there's nothing to hide from — Answer 11 makes the disguise pointless), and take the free 2–3× latency win.

### P9 — "Terms of service and bot-blockers."
**My solution: domain verification (Answer 11, item 12) — then go one step further and make the automation *declared*, not just permitted.** Give vendors a small "automation lane" contract: the runtime sends a registered user-agent and a signed header on every request, and the vendor's WAF/analytics are configured to recognize it as first-party automation. **(NEW)** Traffic is then not merely tolerated — it's identified, rate-limitable, and auditable on the vendor's side too. This turns "we don't get blocked" into "we are a recognized, cooperative class of traffic," which is a materially better sentence in a security review.

### P10 — "Re-record after every redesign."
**My solution: shift drift detection left — into the vendor's deploy pipeline.** The dashboard (item 4) catches drift *after* customers feel it. But in Option A the vendor owns the app — so they can catch it *before shipping*: a CI step ("conxa test") that dry-runs their published skills against their staging environment on every deploy, and fails the build if a skill breaks. **(NEW — "skill CI")** Drift stops being something customers discover and becomes something the vendor's pipeline catches on a Tuesday afternoon before release. Combined with fast re-record, the maintenance loop shrinks from "customers hurt → dashboard alerts → fix" to "build fails → fix → ship." This is, to my knowledge, something no RPA vendor offers — because no RPA vendor's customer owns the target app. It might be Conxa's most differentiated feature, and it falls out of the Option A model almost for free.

### The five NEW ideas, in one list
1. **Free self-serve operability scanner** as top-of-funnel (P1).
2. **Backend-agnostic skill contract** — own the governance layer, plug in any executor (P2).
3. **Per-tenant learning overlay** — skills converge toward each account with every run (P3).
4. **Vendor-controlled automation sessions + declared automation lane** (P6, P9).
5. **Skill CI in the vendor's deploy pipeline** — catch drift before it ships (P10).

Plus one process idea: publish per-skill safety SLOs (P7), and one design rule: parallel-across-apps, serial-within-app (P8). None of these require new research; all of them fall out of the architecture that already exists and the Option A decision already made. When capacity allows, they are candidates for build-plan slots 13–17 — the scanner and skill CI first, because both generate revenue-relevant proof while they de-risk.

---

## 9. What do we do going forward?

**This month:**
- Order signing certificates (Windows EV + Apple Developer ID); wire signing into CI, including the vendor-installer pipeline.
- Start the SOC 2 clock: pick the compliance platform, begin policies.
- Build **domain verification** (item 12 — small, and it should gate publishing before vendors scale).
- Fix the doc contradictions; write the data-flow/retention one-pager.
- Line up 3 design partners for Proof B.

**Next 90 days:**
- Run **Proof B** — the single most important number in the company.
- Ship the **recordability pre-check** (item 3) and **persistent repair memory** (item 2).
- Sign the first paying SMB vendors — **Proof A** starts counting from their first redesign.

**Months 3–6:**
- Ship **first-run calibration** (item 1 — the highest-value build) and the **skill health dashboard** (item 4).
- Mac runtime beta, signed and notarized.
- Design and start the **safe-action system** (item 6).
- SOC 2 Type I lands (~month 3); Type II window starts.

**Months 6–12:**
- Mac GA. **Scheduler + parallel pool + runner profile + multi-host registration** (item 8).
- **Durability dataset v1** feeding compile-time priors (item 9).
- SOC 2 Type II lands; first enterprise pilots on the strength of it.
- Prototype the **connector graduation path** (item 11).

**Track weekly:** first-run success rate on foreign accounts · % of runs needing paid (Tier 3/4) repair · vendor-minutes per republish · vendor retention through redesign cycles · installer→active-runtime conversion · runs per customer per week.

---

## 10. The final word

This review began by assuming Conxa would fail, and found four cracks: the wrong target customer, an untested generalization promise, an untrustable installer, and a market shrinking from both sides.

Twelve answers later, **every problem in the report has an answer on record.** The target narrowed to small and mid-sized vendors — plausible, awaiting Proof A. Generalization is claimed by design, scoped by policy, and testable this quarter — Proof B. The installer will be signed on both platforms, the trust package is a year of ordinary work, and domain verification turns the legal gray zone into a clean, enforceable posture. The squeeze is blunted from below by determinism — a promise no improvising AI can match, and one the runtime already knows how to keep — and answered from above by twenty-five years of long-tail history plus a graduation strategy that turns the threat into revenue. Even the last holdout — silent wrong clicks — now has a five-layer answer whose honest benchmark is "provably safer than the human doing the same task."

What remains is not argument. It is **execution against two proofs** — paying vendors who stay, and good cross-account numbers — and a twelve-item build plan sequenced to produce both.

Keep §4 pinned somewhere visible: the eight things that can never be fixed are not reasons to stop — they are the map of where *not* to sell, so that everywhere you do sell, the product keeps its promises. Reliability is the brand; the fastest way to lose it is to sell one inch past the envelope.

The verdict this document ends on: Conxa is considerably more defensible than the first version of this report judged — not because the criticisms were wrong, but because they were answered, one by one, with arguments that survived scrutiny and a build plan that makes them real. What's left is a race: win the long tail and the SMB segment faster than official connectors erode the top, ship the calibration and dataset that make skills provably durable, make the safe-action system the industry's trust benchmark — and own the graduation path, so that even the customers who outgrow you pay you on the way up.
