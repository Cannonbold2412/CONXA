# Conxa — Product Requirements Document

**Version:** 2.0
**Status:** Foundational Product Definition
**Owner:** Conxa

**Revision note (2026-08-08):** Repositioned following the Centelon pilot demo (7 Aug 2026). The
prior version carried two competing primary customers — SaaS vendors and enterprises — described as
separate markets. This version resolves that into one ladder: an engineer proves the product works,
an enterprise runs it across their own processes, and a vendor or consultancy scales it as a
distribution channel to their customers. Same product, one buyer growing into the next. See
`Conxa-Pilot-Conclusions.pdf` (internal) for the full reasoning.

**Revision note (2026-08-21):** Added the long-term direction — Learn → Execute → Scale → Understand →
Optimise — as §14, restructured into Horizon 1 (current), Horizon 2 (future) and Horizon 3 (long-term).
Horizon 1 gains one genuinely new requirement, **human review points** (§8), which reverses the previous
position that a mid-flow human decision was a workflow to be split rather than recorded. Everything else
about the current product, architecture and terminology is unchanged. The skills-marketplace long-term
vision is superseded by this arc. Open architectural and commercial questions raised by Horizons 2 and 3
are listed in §14.5 rather than answered.

**Revision note (2026-08-21, later same day):** Settled the architectural doctrine that runs through all
three horizons — *Conxa ships capability to where the work and the data already are; the cloud holds
neither.* This closes four of the six questions §14.5 was opened with: Horizon 2's workers and queue run
on customer-owned infrastructure, "pay for reach, not for runs" therefore survives every horizon (§11),
and Horizon 3's intelligence layer deploys on the customer's own infrastructure — staged so its first
version needs no GPU, with retraining orchestrated by Conxa and executed by the customer (§14.3). Two
questions remain open: unattended session lifetime, and whose operations Horizon 3 describes in a
reseller relationship.

---

## 1. Product Overview

**Product Name:** Conxa

**One-Line Description:** Conxa turns any human-performed software workflow into a precompiled, self-healing skill that AI agents can execute reliably — without writing code or touching the target application.

**Mission:** Make every software platform operable by AI, exactly as humans operate it today.

**Vision:** A world where an existing company can progressively become AI-operated — producing the same or greater output with less human effort spent on repetitive software work. Conxa gets there in a specific order: it **learns** how the company already works by recording it, **executes** that work reliably, **scales** it beyond what people can do sequentially, and eventually **understands** the company well enough to help **optimise** it. The differentiator is the starting point — Conxa begins with how the company actually operates today, not with an abstract model of how it might. §14 sets out the horizons this is delivered in; only Horizon 1 is current.

---

## 2. The Problem

### The work nobody owns

Every real business process crosses systems no single team controls. Processing a claim means opening
an insurer portal, copying fields into a policy system, checking a finance record, sending a
confirmation, and logging the whole thing in the CRM. Onboarding a customer touches the CRM, the ERP,
email, and two internal tools that predate everyone currently employed to use them. Twelve minutes per
run, two hundred runs a week, performed by people whose job title says something more valuable.

That cost never appears as a line item. It appears as headcount, as backlog, as the two people in the
company who know every step — and as the risk that both of them are on leave the same week.

### Why the integration never gets built

Because there is no owner of the *process*, only owners of the *systems*. Five systems means five
roadmaps, five vendors, five procurement conversations, and one internal team who would have to
maintain the result forever. Each owner is individually right to decline: their piece is small. The
process stays manual because it belongs to everyone and therefore to no one.

Below that sit the long-tail workflows — the quarterly reconciliation, the regional compliance upload,
the one client whose intake form is different. Individually too small to survive sprint planning.
Collectively, most of the manual work in the building.

### The agent era exposed the gap rather than closing it

Enterprises now have capable AI agents sitting on every desk. Those agents can reason about the claim
perfectly well. They cannot open the portal, and nothing in the current stack lets them — so the agent
drafts an email about the work while a human still does the work. The distance between "our agent
understands this process" and "our agent performs this process" is exactly the gap this product exists
to close.

The instinct at this point is to ask "what can automate this system?" That is backwards. The right
question is "what does this process cost us in hours, and what happens when we stop paying it?" Start
with the business outcome, then pick the technology that delivers it.

### Why today's approaches don't close it

- **Traditional RPA** encodes point-in-time selectors. One UI update breaks the automation, and
  maintenance cost compounds faster than delivered value. It is also an IT-managed internal deployment
  — never something you hand to a customer.
- **Browser automation scripts** are developer tools. They need an engineer to write them and an
  engineer to keep them alive, which is the same headcount problem in a different shape.
- **Sending an AI agent to navigate live UI** demos beautifully and fails at scale: token cost per run,
  high latency, and non-deterministic results because the agent rediscovers the interface every single
  time it runs.
- **Native integrations (APIs, webhooks)** require the software vendor to build and maintain them. They
  don't exist for the long tail, they lag the UI's real capabilities, and they can't be willed into
  existence by the customer who needs them.

**"Why not just build the API?"** For the one system a company owns, that is often the right call — an
extra engineering week beats adopting a new platform. But a cross-system process never has one owner.
The argument is true for the system you control and false for the other four in the chain, and false
again for the workflow too small to ever get funded. The answer is a number, not an architecture
diagram: this process, these five systems, this many hours a month, versus building and maintaining
five integrations.

### What this costs each of our buyers

- **The engineer evaluating it** has a process they know is automatable and no way to prove it without
  a project, a budget, and a quarter.
- **The enterprise running its own operations** pays for the process in salaries every month and can't
  get it onto anyone's roadmap because it spans four vendors.
- **The SaaS vendor or services firm** watches the same process break at client after client, knows
  exactly how to fix it, and has no way to package that knowledge into something shippable and
  repeatable.

### The gap

There is no infrastructure layer that lets an AI agent reliably operate a process across the software
an enterprise already uses, without anyone having to build anything new.

Conxa fills that gap. Stop asking who owns the software; start asking who owns the process — because
Conxa automates workflows that employees are already authorised to perform, in the software they
already use, on the machine they already sit at. Not "Conxa has permission from every application."
Conxa acts on behalf of the person who does.

---

## 3. The Solution

Conxa separates the "teach" step from the "execute" step.

A human performs a workflow once in the **Build Studio**. Conxa records not just the clicks — it captures intent, UI structure, element relationships, visual fingerprints, and recovery context. This session is compiled locally into a **Skill Package**: a structured, versioned execution artifact that encodes everything the runtime needs to execute the workflow reliably.

That Skill Package is published to **Conxa Cloud**, packaged into an installer, and distributed — to the workspace's own employees on Free and Starter, or externally, under a branded installer, to their customers on Pro and Enterprise (see §11, the capability ladder). On the receiving machine, the **Conxa Runtime** — a local MCP server — downloads the skill, exposes it as a native tool to whichever AI agent that user already uses, and executes it with full self-healing recovery. Execution never leaves that machine.

```
Workspace                     Conxa Cloud               Every machine it reaches
──────────────────            ───────────               ────────────────────────
Record workflow     →    Host + version + bill    →    Execute locally in the
in Build Studio          Distribute installer          user's agent (MCP)
```

The result: the workflow is taught once. Every machine that runs it gets it forever, always up-to-date, always recoverable — whether that machine belongs to your own team or your customer's.

---

## 4. Core Value Proposition

**The one sentence:** Perform a process once, and from then on the AI agents your people already use
can perform it for them — across every system it touches, on software nobody has to modify, and it
keeps working after the interfaces change.

### The business outcome comes first

A process that used to need a person watching five screens now runs unattended, at the reliability of
a human doing it carefully, every time. The technology underneath — recording, multi-signal
compilation, self-healing recovery — exists to deliver that outcome, not the other way around. The
rule of thumb a buyer can hold: **if a person can do it in a browser, an agent can do it instead**, and
nobody has to build, buy, or wait for an integration to make that true.

### What each buyer gets

**The engineer proving it works (Rung 1).** Proof in an afternoon, not a quarter. Record a real
process, change something in the target UI, and watch the skill heal itself instead of breaking. No
procurement, no vendor calls, no access to anyone's API. The evaluation *is* the product, which is why
the free tier ships with full self-healing rather than a crippled version of it.

**The enterprise running its own operations (Rung 2).** Stop paying for repetitive cross-system work in
salaries. Record the process once in the Build Studio; every AI agent already on your team's desks can
execute it from then on — reliably, unattended, at any volume, without waiting for five vendors to ship
five integrations that none of them have a reason to build. The processes that were too small to fund
become the ones you automate first.

**The SaaS vendor or services firm scaling as a channel (Rung 3).** Turn a process you have already
solved once into something shippable. Record it, and Conxa compiles and distributes it as an installer
your customers run themselves — no API, no SDK, no integration team, no engineering ask of the
software vendors involved. For a consultancy, the knowledge of which processes break across a client
base stops being tribal expertise inside senior people's heads and becomes a repeatable, sellable
asset.

**The AI agent itself.** Execute a precompiled skill instead of rediscovering an interface from
scratch on every run: deterministic steps, bounded token cost, and recovery that handles UI drift
without the agent having to reason its way out of it.

### Why the promise holds

Four structural properties, each traceable to how the system is actually built:

- **It survives the UI changing.** Elements are identified by several independent signals rather than
  one brittle selector, and a four-tier recovery ladder repairs drift at run time — the first two tiers
  deterministic and free.
- **It costs nothing per run.** Execution happens on the customer's own machine, so Conxa has no
  marginal cost per execution and charges none. Installs and runs are unlimited on every tier; nobody
  is ever penalised for using it more (§11).
- **The data never leaves the machine.** Credentials, screen contents, and business records stay
  local. The cloud hosts, versions, and bills — it does not execute. This is the answer to the first
  question a bank or insurer asks.
- **It requires nothing from the software vendors.** Conxa acts on behalf of an employee who is already
  authorised to do the work, in software they already log into. No API, no partnership, no permission
  to negotiate.

**The honest boundary:** a workflow that demands a fresh one-time code on every login, or that sits
behind aggressive bot protection, is not a fit. That disqualification belongs in week one, not week six
— see the Workflow Qualification Checklist below.

---

## 5. Why Now

Three shifts are converging:

1. **MCP has become the standard interface between AI agents and tools.** What began as Claude Desktop's protocol is now implemented across the agent ecosystem — coding agents, IDE assistants, CLI agents, and desktop apps from multiple vendors all speak MCP. Conxa is built natively on it, and the runtime registers itself into every major MCP host rather than a single one. A skill recorded once is callable from whichever agent the customer already uses.

2. **AI agents are graduating from demos to production.** Enterprises are now asking how Claude handles their actual software stack — not hypothetically, but operationally. There is no good answer without execution infrastructure.

3. **SaaS companies need an AI-native distribution channel.** "How do I make my product work with Claude?" is a question every SaaS product team is now asking. Conxa answers it without requiring API investment.

---

## 6. Target Customers (ICP)

Conxa is one product with one buying motion: a workspace climbs a ladder, from proving the product
works, to running it across an organization, to distributing it as a channel. It is not two products
for two markets — every capability below is the same compiler, the same recovery cascade, the same
runtime, gated by what the buyer actually needs at their stage.

Two filters decide whether an account is worth pursuing, and they apply in this order: **does the
company have the right shape of process**, and **which rung are they on**. A large logo on the wrong
process is a worse account than a mid-size company on the right one.

### The qualifying shape — applies at every rung

An account is in the ICP when *all* of these hold. This is the filter to run in the first call, before
anyone builds a deck:

- **The process crosses three or more browser-based systems**, and no single team owns all of them.
  One system with a decent API is not our deal — see §2.
- **It repeats.** Daily or weekly at minimum. A compile is a one-time cost paid back by repetition; a
  process that runs twice a year never earns it back.
- **A person does it today in a browser**, as part of a job they are already authorised to do. Conxa
  acts on behalf of that person — it doesn't need permission from the software vendors.
- **There is no realistic API path.** Not "no API exists," but "getting one would mean three vendor
  roadmaps and a year," which is the ordinary case for a cross-system process.
- **Login is stable.** SSO and passwords are fine. A fresh one-time code demanded on every single login
  is the one blocker with no workaround (see the Workflow Qualification Checklist).
- **Windows on the machines that matter.** Recording is Windows-only, and the runtime ships for Windows
  today. A Mac-only fleet is roadmap, not capability (§7, Platform Support).

If a prospect fails the first two, they are not a small deal — they are not a deal. Say so early.

### Rung 1 — Prove it works

**Who:** one engineer, ops lead, or product person. One machine, one process, no budget.

**What they need:** to watch a real workflow survive a recompile and a UI change with their own eyes.
Nothing said in a sales meeting substitutes for this, and nothing needs to be bought to see it.

**What we want out of it:** not revenue — conviction, plus a second process and a colleague. Free is
capped at one machine and 30 days precisely so that conviction converts into a team rather than
settling in as a permanent free habit (§11).

**Won when:** they show it to someone who owns a budget.

### Rung 2 — Run your organization *(the primary revenue customer)*

**Who:** an enterprise or mid-market company automating its own cross-system processes — operations and
back-office, finance and accounting, sales operations, customer support. A bank automating claims
intake, an insurer automating vendor onboarding, an ops team that owns a process nobody outside the
company will ever build an API for.

**Shape of company:** enough process volume to matter and enough system sprawl to hurt — typically
200–5,000 employees, several business-critical SaaS or ERP systems that don't talk to each other, and
an ops function large enough that a headcount conversation is already happening. *This band is a working
hypothesis from the pilot, not a pattern validated across closed deals — treat it as a starting filter,
not a rule.*

**The buying committee:**
- **Champion** — the person or team manager who does the work today and knows exactly how long it takes.
- **Economic buyer** — the ops, finance, or shared-services leader who owns the headcount line the
  process is currently paid out of.
- **Gate** — IT and security. Their question is where the data goes, and the answer is that execution
  and credentials never leave the employee's machine (§4). Get to that answer early; it is the shortest
  path through this gate.

**What they buy:** the ability to stop assigning people to work that a compiled skill performs
unattended, plus the operational dashboard that proves it is actually working.

**Won when:** a second department asks for it without being sold to.

### Rung 3 — Ship it to your customers *(the highest-leverage account)*

A company that has already solved a process once and wants to sell or ship it to the next thirty. Two
shapes of the same customer:

- **SaaS vendors** who want their platform operable by AI agents without building native AI
  integrations. They record their own product's workflows, publish skills, and distribute them to their
  customers as a branded installer — no API programme, no SDK, no new engineering headcount. For them,
  "works with the agent our customers already use" becomes a product feature rather than a roadmap item.
- **IT-services and consulting firms** — the channel insight that came out of the Centelon pilot. A
  services firm selling Odoo, Salesforce, ERP and CRM implementations across banking, insurance, energy,
  aged care and government clients isn't a single customer — it's thirty enterprises reachable through
  one relationship, and it already knows which processes are painful because it has watched the same one
  break across many clients. Their own internal work (timesheets, invoicing, client reporting) is a demo,
  not the sale; the sale is automating the same *shape* of cross-system process they already get paid to
  implement for clients.

**Why this rung matters disproportionately:** every other rung grows one account at a time. This one
compounds — a single services relationship puts the runtime on many enterprises' machines, and every
execution feeds the telemetry loop that makes the next compile better (see "What Our IP Actually Is").

**Won when:** they resell it under their own name without us in the room.

**One open question at this rung.** Horizon 3's operational intelligence (§14.3) assumes a workspace is
understanding *its own* operations. When a vendor or consultancy distributes skills to thirty customers,
the executions happen inside those customers' businesses — so who the resulting intelligence belongs to,
and who may see it, is unresolved (§14.5). It changes nothing about what this rung buys today; it
changes what we are able to promise it later, so it should not be promised yet.

### Verticals where this repeats

CRM and sales platforms, ERPs, banking and insurance operations, marketing and growth tools, HR and
people management, customer success and support tooling, and internal business-operations software.
Regulated industries are a feature, not an obstacle: local-only execution is easier to clear with a
bank's security team than any cloud-execution alternative.

### Trigger events — when an account becomes reachable

- A company-wide AI mandate lands and someone has to make agents do more than draft text.
- An ERP or CRM implementation or migration is underway — new system, new manual bridges.
- An operations headcount freeze, or a backlog nobody is allowed to hire against.
- An RPA renewal is approaching, or the maintenance cost of existing bots has become visible.
- A compliance or audit finding demands the process run the same way every time.
- A SaaS vendor's customers have started asking for AI-agent compatibility.

### Who we deliberately do not sell to

Naming this saves more time than any qualification script:

- **Consumers and one-off tasks.** A person who wants an agent alongside them for a single task is
  better served by a browser assistant (§10). We are for the process that runs a thousand times.
- **Single-system workflows with a good API.** Building the integration is genuinely the right call. Say
  so; it buys credibility for the cross-system deal that follows.
- **Non-browser software.** Native desktop applications, terminal or mainframe interfaces, and
  Citrix/VDI-only environments are outside what the recorder can capture today.
- **Per-login one-time codes or aggressive bot protection.** No workaround exists. Disqualify in week
  one.
- **Mac-only or Linux-only fleets.** Roadmap, not capability (§7).
- **Anything adversarial to the target system.** Conxa performs work an employee is already authorised
  to perform, in their own logged-in session. Scraping someone else's site at volume is not that, and is
  not a use case we support.
- **One-time migrations.** No repetition, no payback on the compile. Hire a contractor.

### Secondary

- Internal IT teams standardizing software access for AI tooling
- AI-first startups that need reliable non-API software integrations

---

## 7. Product Components

Three components, three different owners, three different machines. The division is the product's
central design decision, and it is what makes the security answer and the cost structure work:

| Component | Runs on | Owned by | Does |
|---|---|---|---|
| **Build Studio** | The builder's Windows desktop | The workspace that builds skills | Record, compile, edit, test, publish |
| **Conxa Cloud** | Our infrastructure | Conxa | Host, version, distribute, meter, bill |
| **Conxa Runtime** | Every machine that runs skills | The end user | Execute locally, recover, sync, report |

**The cloud never records, compiles, or executes.** It moves artifacts and counts things. Everything
that touches a customer's actual screens, credentials, or business data happens on a machine the
customer owns.

### Conxa Build Studio

A Windows desktop application (Electron + Python) that runs entirely locally. It is where a workflow
becomes a skill:

- **Record** a browser workflow through an injected capture bridge — clicks, typing, navigation, file
  uploads, iframe transitions, and screenshots, with the page structure around each action.
- **Review and edit** the captured workflow step by step, re-target an element that was captured
  wrongly, add conditional logic, and annotate what each step is for.
- **Compile** locally into a Skill Package. No cloud involvement in the step that produces the
  execution artifact.
- **Test** the compiled skill against a real browser in a local sandbox before anyone else sees it.
- **Publish** a versioned release to Conxa Cloud — the primary, mandatory release action.
- **Build an installer** — a secondary, advanced action that packages an already-published release for
  distribution.

The only thing the Studio sends to the cloud during a compile is anonymised model traffic through the
LLM proxy, and the published artifact at the end. The recording itself, the screenshots, and the
credentials never leave the machine.

### Conxa Cloud

A deliberately thin coordination layer (FastAPI on Render, Next.js on Vercel):

- Skill package hosting, versioning, and release channels
- Installer hosting and download links
- An LLM proxy for compile-time model calls, pooled across multiple providers so no single provider
  outage stops a compile
- Billing, plan entitlements, and subscription management
- Execution telemetry ingest and the operations dashboard built on it
- Workspace, team, and role management, with an audit log

**Governance.** Membership and roles resolve from the workspace's identity provider, and privileged
actions are restricted to owners and admins. Every consequential action — publishing a release,
changing what a skill is allowed to reach — lands in an immutable, per-workspace audit log that admins
read themselves in the dashboard. Enterprise buyers treat this as table stakes: they need to answer
"who shipped this, to whom, and when" without filing a support ticket with us.

**Why thin is strategic, not unfinished.** Every capability we keep out of the cloud is a capability
that costs us nothing per customer and raises no data-residency question. The cloud is the part of the
system we pay for; keeping it small is how execution stays free (§11).

### Conxa Runtime

A Node.js MCP server that installs on the machine where work actually happens. It:

- Registers itself into every AI agent host it finds installed on that machine
- Syncs skill packs from the cloud — delta only, SHA-256 verified, atomically written
- Exposes each skill as a first-class agent tool
- Executes skills locally through a real browser, with the four-tier self-healing recovery cascade
  (`docs/TRD.md` §10.1)
- Reports structured execution telemetry back
- Updates itself from a signed manifest

**Execution never leaves the customer's machine**, and neither do their credentials — the browser
session belongs to the person sitting there.

**Two layers, updated on different clocks.** What installs as one program is internally split in two.
**`conxa-runtime`** is the host binary — the heavy, stable layer carrying the browser engine and the OS
integrations. It is ~85 MB and changes rarely, on the order of quarterly. **`conxa-app`** is the logic
layer beside it on disk — the executor, the element resolver, the recovery cascade — a ~60 KB download
that ships with every release.

This split is what makes fixes travel fast. A reliability improvement to the recovery cascade reaches
every machine as a 60 KB update within a release cycle, instead of an 85 MB reinstall that end users
have to consent to. Since it is the customer's customers — not the customer — who run the software, an
update path that needs their attention is an update path that does not happen.

Two safeguards stop that speed from becoming a liability: the host refuses to load a logic layer that
declares a newer host requirement than it can satisfy, so a fast-moving layer can never half-run against
an old binary; and a failed update rolls back to the previous version automatically. Both artifacts are
integrity-checked and the manifest describing them is cryptographically signed.

### The MCP Layer

The runtime speaks the Model Context Protocol natively and registers into the agent hosts the customer
already has, rather than one vendor's app. Supported hosts span desktop assistants (Claude Desktop),
coding agents (Claude Code, Codex, Gemini CLI, GitHub Copilot CLI, OpenCode, Goose), IDE-embedded
agents (Cursor, VS Code, Windsurf, Zed, Cline, Antigravity, Kiro, Junie), and agent platforms (Factory
Droid, OpenHands, Augment, KiloCode and others) — more than twenty today, added as the ecosystem grows.

Skills appear to each of them as native tools. An agent can list available skills, ask what inputs a
skill needs, run one or a sequence of them, check status, and cancel a run — through the standard
interface, with no per-host integration work.

**This is a distribution property, not just a compatibility one.** A workflow is recorded once and
becomes callable from whichever agent the customer already chose, without anyone targeting that agent.
It also removes the single largest strategic risk in building on someone else's assistant: we are not
betting on one vendor's app winning.

### Platform Support

**Build Studio is Windows-only.** Recording, compilation, and packaging happen on Windows. This
constrains the internal seat that builds skills, not the population that runs them — an acceptable
trade, and stated plainly rather than buried.

**The Runtime ships for Windows today.** A macOS target exists and builds, but macOS is not a supported
customer platform: there is no macOS installer, and the host binary and update path are unverified on
darwin. Treat it as roadmap, not capability, until an installer ships. This is the single largest
platform gap for enterprises with mixed fleets, and the most common reason a qualified account has to
be scoped down to a subset of its teams.

---

## 8. Key Capabilities

Each capability below exists to protect one promise: **a workflow taught once keeps working.** They are
listed in the order a workflow actually travels through them.

### Workflow recording

A capture bridge injected into the browser records the session at the event level — clicks, typing,
navigation, scrolling, focus changes, file uploads, and movement in and out of embedded frames — with a
screenshot and the surrounding page structure at each action. Alongside every action it keeps the
element's role, its text, its position, the page it was on, and its full frame chain.

The person recording does the work the way they normally do it. They are not describing a workflow or
configuring one; they are doing their job while it is written down.

### Deterministic compilation

The recorded session is normalized, deduplicated, and compiled locally into a Skill Package. Each step
carries several *independent* ways to find its element rather than one selector that can go stale:

- **Structural identity** — role, accessible name, test identifiers, and relational position, generated
  by a deterministic grammar and scored for durability
- **Semantic intent** — what the step is trying to accomplish, not just where it clicked
- **Anchors** — nearby stable landmarks the element can be re-found relative to
- **Visual fingerprints** — image crops for vision-based recovery
- **Assertions** — the post-step state that proves the step actually worked
- **Recovery metadata** — everything needed to re-find the element if it has moved or been rewritten

**An important distinction from "AI writes a script."** Selectors are produced by deterministic
generation, not by a model guessing at code. A model contributes intent, visual anchors, and the
workflow graph — never the identity of an element on the primary compile path. Two compiles of the same
recording produce the same execution artifact, which is what makes a skill reviewable, diffable, and
trustworthy in a regulated environment.

### Verification, not just execution

Steps carry compiled assertions describing the state the UI should be in afterwards. The runtime checks
them. This is the difference between "we clicked where we were told" and "the invoice was actually
posted" — and it is why a failure is reported as a failure instead of silently producing wrong work,
which is the failure mode that makes operations teams distrust automation permanently.

### Self-healing execution

When a step cannot find its target, the runtime escalates through a four-tier recovery cascade rather
than failing. Tiers 1 and 2 are deterministic, in-process, and cost nothing: re-resolve through the
other identity signals, scroll, dismiss what is covering the element, wait for it to settle, re-probe by
role and name, fall back to alternates, search within the active dialog, match text fuzzily. Only when
both are exhausted does the runtime hand a structured recovery request up to the AI agent that called
it — first with the live page inventory, then with screenshots — and the agent resumes the run with a
corrected target that is validated before it is allowed to act.

Two consequences worth stating explicitly. **Conxa never pays for recovery**, because the expensive
tiers run on the agent subscription the customer already has. And **the cheap tiers do most of the
work**, because a UI that changed slightly is a far more common event than a UI that changed
fundamentally. `docs/TRD.md` §10.1 is the authoritative tier table.

### Human review points

Not every step in a real process can or should be automated. Some need an approval before the work
continues, some need a judgement no recorded selector can express, and some need a person to take over
entirely. A workflow can carry **human review points** that mark exactly where those are.

Three shapes, all captured while the workflow is being recorded and edited rather than discovered at run
time:

- **Approve or reject** — the run pauses, a person confirms the work so far, and the run continues or
  stops. Sign-off, four-eyes checks, anything a compliance rule requires a name against.
- **Supply a judgement** — the run pauses and a person provides a value the workflow cannot derive for
  itself: which category, which record, whether this one is a duplicate. Later steps consume that value.
- **Hand over** — the run reaches something a person has to do themselves. Control passes to them, and
  back again afterwards.

**The review happens in the browser the runtime is already driving**, on the customer's own machine. The
person sees the real page, in the state the workflow actually left it in, and answers there. Nothing
about the run — the page, the data on it, or the decision made — has to leave the machine in order for a
person to be involved. This is the same locality property that governs execution (§7), applied to the
human half of the process.

Two things follow. A workflow containing a genuine human decision is now an ordinary workflow, rather
than one that has to be split in two around the person. And a review point is a *designed* state with an
audit trail — distinct from the recovery cascade above it, which is what happens when something goes
wrong.

*Status: this is current Horizon 1 scope and is being built. Unlike the rest of §8, it does not describe
behaviour that ships today — see §14.4.*

### Editing and repair

A recorded workflow can be reviewed step by step, reordered, annotated, extended with conditional
branches, and re-targeted when a step captured the wrong element. Two assisted repair paths exist for
when a human needs to fix a step by hand — re-generating a step's targeting against the original
recording, and letting a user draw a region on the recorded screenshot when they want a different
element entirely. Both are user-initiated, and both are confined to the editor.

A validation and sign-off gate sits between editing and publishing, so a workflow that has been changed
by hand has to be re-checked before it can ship.

### Local test before anyone else sees it

A compiled skill can be executed against a real browser in a local sandbox from inside the Studio,
before publishing. The sandbox deliberately runs *without* the agent-assisted recovery tiers, so the
compiled skill is judged on its own merits rather than on an agent's ability to rescue it. A skill that
passes here is a skill that will not need rescuing in front of a customer.

### Publishing and versioning

Publishing a versioned release is the primary, mandatory release action: every distributed skill has a
version, a release channel, and an audit trail of who shipped it. Building an installer is a secondary
action that packages an already-published release.

### Distribution and install

The installer is deliberately thin. It carries the runtime, a browser engine, and the company's
identity and endpoints — **not** the skills themselves. On first run, the runtime downloads every skill
it is entitled to, exactly the way it will download every later update. One code path serves both first
install and every subsequent change, which is why "it worked on install but not on update" is not a
class of bug that exists here.

During install, the runtime registers itself into every AI agent host it finds on the machine. Nothing
else edits those configuration files — and uninstall reverses exactly what install wrote, derived from
the same source rather than a second copy of the same knowledge that can drift.

### Sync and self-update

Republish a skill and every machine running it picks up the change at its next sync — delta only,
integrity-checked, written atomically so a half-downloaded skill can never be executed. The runtime
updates its own logic layer the same way, with automatic rollback if an update fails to load. No end
user is asked to do anything.

### Telemetry and operations

Every execution emits structured telemetry: which steps ran, which needed recovery and at which tier,
how long each took, and where anything failed. The dashboard turns that into a health picture — what is
failing, which skills are drifting, how much of the healing happened for free, and what the whole thing
is worth in time saved. Figures that come from measured activity are labelled as measured; figures that
depend on someone stating how long a task used to take a person are labelled as estimates, with the
assumption shown and editable.

This telemetry is also the input to how the next skill gets compiled — the loop described in "What Our
IP Actually Is."

### Governance and controls

Role-based access control over who can build and publish, an immutable per-workspace audit log, machine
binding to keep seats honest, and — for enterprises whose policy requires it — the option to route
compile-time model calls through the customer's own AI provider account instead of ours.

---

## 9. Major Use Cases

Every use case here is a business process, not a single-app task, and each one names the systems it
crosses — because that is the shape of problem an enterprise or a services firm actually pays to solve.
A demo that automates one action inside one product is a party trick; the deal is the process that
spans four logins and currently lives in someone's head.

**Customer onboarding** — CRM → ERP → email → internal provisioning. Create the account, configure
initial settings, trigger the welcome sequence, and tell whichever internal system has to know the
customer exists. One process instead of four separate logins and a checklist. *Bought by:* sales
operations, customer success.

**Claims intake** — portal → policy system → finance → notification. An insurer's claim moves through
systems that were never built to talk to each other, carried between them by a person today. High
volume, strictly repetitive, and directly measurable in handling time. *Bought by:* insurance
operations.

**Vendor onboarding** — procurement → compliance → ERP → payments. The exact shape of work an
IT-services firm already gets paid to implement for its clients, run as a skill instead of a project.
*Bought by:* procurement, shared services — and resold by consultancies.

**Invoice and finance processing** — document intake → data extraction → accounting system → approval
routing. Take the documents, get the numbers into the right system correctly, and route them for
sign-off. *Bought by:* finance and accounts payable.

**HR and people operations onboarding** — HR platform → identity and access → payroll → compliance
reporting. Provision a new hire the same way every time, across every system that has to know about
them, with an audit trail that says it happened. *Bought by:* HR operations, IT.

**Operational reporting** — several operational tools → a dashboard or a document → distribution. Pull
figures from the systems that actually hold them, not the one system that happens to have an API, and
get them in front of people on schedule. *Bought by:* operations leadership.

**What a good first workflow looks like.** High frequency, low judgment, painful today, and owned by
the person in the room. Pick the process the champion is embarrassed about, not the one that is
strategically interesting — the first skill has to prove the product, and the fastest proof is the
process someone is doing by hand this afternoon.

---

## 10. Competitive Positioning

Conxa sits at an intersection nobody else occupies: **no code required, no cooperation required from
the software vendors, deterministic replay, self-healing, and distributable to other people's
machines.** Every alternative gives up at least two of those.

| | No code | Works without vendor cooperation | Deterministic replay | Self-heals on UI change | Distributable to customers | Cost per run |
|---|---|---|---|---|---|---|
| **Conxa** | Yes | Yes | Yes | Yes | Yes | None |
| Traditional RPA | Partly | Yes | Yes | No | No | Licence per bot |
| Playwright / Puppeteer | No | Yes | Yes | No | No | None |
| iPaaS (Zapier, Workato, Make) | Yes | **No** — needs an API | Yes | n/a | Partly | Per task |
| Agents navigating live UI | Yes | Yes | **No** | Adaptive but unreliable | No | Tokens, every run |
| Native API integrations | No | **No** | Yes | Yes | Yes | Build + maintain |
| AI browser assistants | Yes | Yes | **No** | Adaptive but unreliable | No | Tokens, every run |

### vs. traditional RPA (UiPath, Automation Anywhere)

RPA encodes point-in-time selectors into brittle scripts, so UI change means breakage and maintenance
compounds forever. It is also structurally an internal IT programme: licensed per bot, deployed by a
centre of excellence, and impossible to hand to a customer.

**Where we win:** several independent identity signals per element instead of one, so skills degrade
gracefully instead of breaking hard; recovery that repairs drift at run time; and a distribution model
where a skill ships to other people's machines rather than becoming an internal project. Unlimited runs
instead of per-bot licensing changes what teams are willing to automate at all.

**Where they win today:** breadth of connectors, native desktop and mainframe support, orchestration
and scheduling maturity, and a two-decade head start on enterprise procurement paperwork. An account
that needs to automate a Citrix-published desktop application is theirs, not ours.

### vs. browser automation frameworks (Playwright, Puppeteer, Selenium)

Developer tools, and excellent ones — they are in fact what we execute on. But they require an engineer
to write the script and a second engineer to keep it alive, which is the same headcount problem wearing
different clothes. They have no compilation model, no recovery architecture, no distribution mechanism,
and no agent integration.

**Where we win:** an operations person records the process instead of an engineer writing it; recovery
is built in; and the result installs on machines the author will never touch.

**Where they win:** total control, and no platform to buy. A team with spare engineering capacity and
one stable internal workflow should just write the script.

### vs. iPaaS (Zapier, Workato, Make, n8n)

This is the most common "why not just…" in the room, and the answer is short: **iPaaS connects APIs.**
Where every system in a process has a good API and a connector already exists, iPaaS is faster,
cheaper, and the right answer — say so plainly. But the process that hurts is precisely the one where
two of the five systems have no usable API, the internal tool has none at all, and the connector for
the ERP covers 20% of what the job requires.

**Where we win:** the UI is the one interface every system is guaranteed to have. We also don't meter
per task, which is what stops teams from rationing automation.

**Where they win:** anything API-shaped, plus scheduling, queuing, and error handling for events that
originate outside a browser.

### vs. AI agents navigating live UI

Sending an agent to work out the interface from scratch on every run costs tokens every run, is slow,
and produces different results on different days because the agent is re-deriving the same conclusions
continuously. It demos superbly and does not survive contact with a process that runs a thousand times.

**Where we win:** the execution path is compiled once. The agent calls a skill instead of conducting a
navigation session — bounded cost, lower latency, and a deterministic path with recovery underneath it.

**Where they win:** anything that has never been done before. A one-off, an exploration, a process
nobody has recorded yet. These are complements, not substitutes: the agent decides *what* to do; the
skill is *how* it gets done reliably.

### vs. native API integrations

APIs require the software vendor to build and maintain them. They don't exist for long-tail workflows,
they lag what the UI can already do, and no amount of customer demand conjures one into being.

**Where we win:** zero engineering asked of the software vendor. If a person can do it in a browser, it
can become a skill.

**Where they win:** for one system a company owns, building the API is often genuinely better — and
conceding that early is what makes the cross-system argument credible (§2).

### vs. AI browser assistants (Perplexity Comet, Claude for Chrome, and similar)

A different category, not a worse version of ours — and we should say so, because a technical buyer
will test the claim in the room. Browser assistants rediscover the interface on every run: per-session,
per-user, non-deterministic, paying token cost each time. They are excellent for a person doing a
one-off task who wants an agent working alongside them.

**Where we win:** a workflow compiled once and replayed deterministically, with recovery, unattended,
distributable to machines we will never see. Theirs is a person's session; ours is a business's process.

### The honest summary

We are not the most mature automation platform, and we don't have the biggest connector catalogue. What
we have is the only combination that lets a non-engineer teach a cross-system process once and have it
run reliably on other people's machines, at no cost per run, without asking permission from a single
software vendor. Every deal we win is won on that sentence.

---

## 11. Business Model

Conxa sells to the workspace that *builds* skills, never to the people who run them. The pricing thesis
is one line: **pay for reach, not for runs.**

Installs and executions are unlimited on every tier, including the free one, because execution happens
on the customer's machine and costs us nothing at the margin. What is priced is how far up the ladder a
workspace has climbed — how many people can build, how much gets compiled, and how far the result is
allowed to travel.

Three properties follow from that, and they are the whole model:

1. **Our costs sit at build time, not run time.** Compilation is where the model spend happens. It is
   one-time per workflow version, and it is exactly what we meter.
2. **We never pay for recovery either.** The free recovery tiers are deterministic and local; the
   expensive tiers run on the customer's own AI subscription (§8). Reliability improvements do not
   raise our cost of goods.
3. **Therefore success is never punished.** A customer who runs a skill a million times costs us the
   same as one who runs it twice. No competitor with cloud execution can offer that without rebuilding
   their business.

### The capability ladder

Each tier is a rung, not just a bigger number. What changes between them is *what a workspace can do*,
not only *how much*:

| | **Free** | **Starter** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| Who | An engineer proving it works | One product team automating its own processes | An enterprise running its org, or a vendor scaling as a channel | A SaaS vendor or consultancy shipping to their customers |
| Record → compile → execute, full self-healing | Yes | Yes | Yes | Yes |
| Distribution | Internal, 1 machine | Internal, unbranded | External, Conxa-branded | External, white-label |
| Installer icon (added 2026-08-09) | No | Yes | Yes | Yes |
| Ops dashboard | None | Basic | Full (+ healing, impact, drift) | Full |
| Audit log & RBAC | None | Basic | Full | Full + SSO/SAML |
| BYOK | No | No | No | Yes (Azure OpenAI) |

A custom installer icon is available from Starter upward, independent of full white-label branding
(still Enterprise-only) — a paying workspace can put its own icon on the `.exe` without needing the
rest of white-label's Conxa-branding removal.

Self-healing stays in every tier including Free. It costs Conxa nothing — the two zero-token recovery
tiers are deterministic and local, and the LLM-backed tiers run on the customer's own agent subscription
— and a free tier without it teaches people the product breaks, which is the opposite of what a trial is
for. What Free *doesn't* get is reach: it is capped at one machine and expires after 30 days, which is
what stops "free forever" from quietly substituting for Pro.

### What is metered

| Axis | What it limits | Why it's metered |
|---|---|---|
| **Seats** | People in the workspace who can build and publish | Tracks team size and account value |
| **Machines** | Distinct devices/IPs a workspace can build from | The trial-abuse and seat-integrity control |
| **Compile credits** | Workflow compilations | Compilation is the real LLM cost centre |
| **Human-edit tokens** | LLM usage in the workflow editor's assisted-repair paths | The other LLM cost centre, driven by manual fixing |

There is no longer a limit on how many distinct products or slugs a workspace can publish under — a
"plugin" is just a named group of workflows, not a rationed slot. Reach is gated by the *distribution*
capability (which tier you're on), not by a count.

Enterprise carries no numeric defaults — every limit is an explicit contractual override. Subscription
billing runs through Cashfree. Full pricing is in `docs/cost_model.md` and on the public pricing page.

### What is deliberately *not* metered

**Executions and installs are free and unlimited on every tier.** Skills run on the customer's machine
using the customer's own compute. We incur no marginal cost per run, so charging per execution would
price directly against the product's core promise — and would hand every prospect a reason to ration the
thing we want them to spread.

The consequence: revenue scales with how many workflows a workspace *builds* and how far it *reaches*,
not how hard anyone *runs* them.

### Cost posture

Compilation is a one-time cost per workflow version; execution is a recurring benefit that costs us
nothing. The free tier routes to free-tier model providers so trial usage costs effectively nothing,
while paid tiers route to higher-quality models — compile quality determines skill reliability, so this
is where spending more genuinely buys a better product. Unit economics are modelled in
`docs/cost_model.md`.

### How the model extends as the product grows

Decided 2026-08-21, following the doctrine in §14: because Conxa neither executes nor stores customer
work at any horizon, no marginal cost ever appears that would force us into per-run or per-item
metering. **"Pay for reach, not for runs" holds at every stage.** What changes is only what *reach*
means:

| Horizon | What "reach" measures |
|---|---|
| **1 — Learn and Execute** *(current)* | How far a skill travels: seats, machines, compile credits, and distribution rights |
| **2 — Scale** *(future)* | How much work can be in flight: concurrency capacity, and a new and cheaper class of seat for people who resolve human reviews without building anything |
| **3 — Understand and Optimise** *(long-term)* | How much of the organisation is instrumented |

Three properties are preserved by construction at every stage: the axis is structural rather than
consumption-based, a customer can plan around it, and nobody is ever charged more for a good month.

Two things are deliberately *not* settled here. The specific metrics in the Horizon 2 and 3 rows are the
natural expression of the principle, not ratified pricing. And these are **additive layers on the one
ladder in §6, not parallel products** — nobody buys Scale without Build, or Intelligence without
something to be intelligent about. That constraint matters: an earlier version of this document carried
two competing products for two markets, and the 2026-08-08 revision exists specifically to resolve it.
Expansion revenue must not reintroduce it.

### Where this model is exposed

Two risks, stated rather than assumed away:

- **A workspace that compiles constantly and distributes little** inverts the model — all cost, no
  reach. Compile credits exist for exactly this, and their calibration is the number to watch as usage
  grows.
- **The value we charge for is created at build time, but felt at run time.** A customer who records
  ten skills in month one and nothing afterwards keeps receiving the benefit while their spend looks
  like it should fall. This is a renewal-conversation risk. The operations dashboard — which puts a
  running figure on what the skills are actually doing — is today's answer to it, and a partial one.
  The structural answer is the later horizons: throughput a company cannot hire its way to, and
  questions about its own operations it cannot answer anywhere else. Expansion revenue is not a side
  effect of Horizons 2 and 3; it is a substantial part of why they need to exist.

---

## What Our IP Actually Is

The instinctive answer — "recording, then compilation, then browser automation" — is also the exact
phrase a technical evaluator uses to describe what is *not enough* to build a category on. A strong team
of ten could build a decent recorder-to-script compiler in six months, and the large AI labs are
actively shipping in this space. The compiler is hard work. Hard is not the same as defensible.

What is actually hard to copy:

**The recovery ladder.** Four tiers, the cheap ones doing most of the work, a model involved only as a
last resort — and even then billed to someone else. Making automation degrade gracefully instead of
breaking hard is an execution architecture, not a compiler trick (`docs/TRD.md` §10.1).

**The telemetry loop.** Every run, every recovery, and every failure flows back into how the next skill
gets compiled. A competitor can copy the compiler in a quarter. They cannot copy years of accumulated
evidence about how real interfaces actually drift and which remedies actually work. Note that this loop
is about *interfaces*, not about customers' businesses — it is execution metadata, and it is more
valuable pooled. The operational intelligence in §14.3 is the opposite kind of data, stays on the
customer's own infrastructure, and is not part of this loop. Keeping them separate costs the moat
nothing, because neither one wants what the other has.

**The cost structure.** Execution runs on the customer's machine, so it costs us nothing and we charge
nothing for it. Any competitor executing in their own cloud has to meter runs to survive, and cannot
match this without dismantling their own business model.

The correct framing: **the compiler is the engine, not the moat.** The IP is that skills keep working
after the interface changes, and that we get cheaper as customers use us more while cloud-execution
competitors get more expensive as theirs do.

**The sentence for the room.** The cautions below are real, but a first meeting needs one line, and
this is it: *anyone can record a workflow — we're the ones whose recordings still work six months
later, and we don't charge you per run to keep them working.*

**Two honest cautions.** First, a system of small advantages that only adds up *as a loop* is much
harder to sell than one big one; you cannot explain a loop in a first meeting. Second, the loop is only
real once it is spinning. Today the architecture exists but execution history is thin, because install
volume is thin. Right now this is a diagram, not a moat. It becomes real somewhere around customer ten
— and until then, the honest claim is the architecture, not the accumulated data.

---

## Workflow Qualification Checklist

Run this before promising that any specific workflow can be automated. Disqualifying in week one costs
a conversation; discovering it in week six costs the account. Anyone can run it — no engineer required.

### Hard blockers — any one of these ends it

- **A fresh one-time code on every login.** If the target system demands a new code each time someone
  signs in, unattended automation is dead. This is the one blocker with genuinely no workaround. (A code
  required occasionally, or on a new device, is fine.)
- **Aggressive bot protection or CAPTCHA on the path the workflow takes.** See the note below on why
  this is rarer than people expect.
- **A terms-of-service clause banning automated access.** Check it, and take it at face value.
- **The work doesn't happen in a browser.** Native desktop applications, terminal or mainframe screens,
  and Citrix/VDI-published apps are outside what can be captured today.
- **Nobody is authorised to do it.** Conxa performs work on behalf of a person who already has the
  right to do it. If no such person exists, there is no workflow — there is a permissions problem.

### Shape checks — these decide whether it's worth doing

- **Frequency.** Daily or weekly clears it easily. Monthly is marginal. Quarterly rarely repays the
  effort of recording and maintaining it.
- **Variation.** Does it run the same way every time, or does every third case need a judgment call?
  Some branching is supported; a process that is mostly exceptions is a process that mostly needs a
  human.
- **Human decisions mid-flow.** Identify them explicitly — but finding one is no longer a reason to
  reshape the workflow around it. A decision that genuinely needs a person becomes a recorded human
  review point that the run pauses on (§8), in the browser the runtime is already driving. What still
  matters is *how many*: a process where nearly every item needs a judgement call is a process that
  mostly needs a human, and automating the thin margin around those calls rarely repays the compile.
- **Session lifetime.** How long does an authenticated session survive before someone has to sign in
  again? This determines whether a run can be truly unattended or needs a person to start the day.
- **Inputs and outputs.** Where does the data come from, and where does the result have to land?
  Uploads and downloads are supported; a file that must be named at run time needs saying so up front.
- **Who owns the target systems.** If one team can change the interface without telling anyone, that is
  not a blocker — it is precisely what self-healing is for — but it should be known, not discovered.
- **What it costs today.** Minutes per run × runs per month × the loaded cost of the person doing it.
  If nobody can produce this number, the process is not painful enough to be first.

### Why bot protection bites less often than people fear

Bot detection is built for adversarial traffic: datacenter addresses, headless browsers, high volume
from fresh sessions. Conxa is none of those. It runs on an employee's own machine, from a corporate
network, in a real browser, reusing a session that employee legitimately created, at human speed.

Most line-of-business software — an ERP, an internal CRM, a loan origination system, a vendor portal, an
insurer's claims system — has no bot detection at all, because nobody puts bot protection on internal
software. Where it genuinely bites is consumer-facing platforms: social networks, some payment portals,
public web search. Moving up-market into real business processes removes most of this risk, along with
the consumer-app demos that used to headline our marketing.

### The rule when something fails the checklist

Say so, and don't attempt it. The moment we try to defeat a protection, Conxa becomes a different
company with a different legal profile and a different conversation with every security team we meet.
Name the blocker, state plainly that this workflow cannot be automated, and move to the next one — there
is always a next one, and being the vendor who said no is worth more than the workflow.

---

## 12. Success Metrics

### Product Health

- Skill compilation success rate
- Execution success rate (steps completed without Tier 3+ recovery)
- Recovery success rate (failures resolved by Tier 1–4 before escalation)
- Skill reuse rate across executions
- Human-intervention rate — share of runs that reach a review point, and time spent waiting there
- Unattended completion rate — runs that finish with no person involved at any point

### Business Traction

- Active vendor organizations on the platform
- Skills published and distributed
- Active runtimes (customer installs)
- Monthly skill executions
- Enterprise customers under contract

### Technical Quality

- Runtime stability (uptime, crash rate)
- Sync success rate (skill pack delivery)
- Execution latency (p50/p95 per skill)
- Self-update success rate

---

## 13. Product Principles

**Reliability over features.** A skill that works 99% of the time is worth more than ten features that work 70% of the time. Execution reliability is the core product promise — everything else is secondary.

**Teach once, run forever.** The human's time is spent once, at recording. Every execution after that should require a person only where the recording said one is genuinely needed — an approval, a judgement, an exception — and never because something broke that could have been recovered automatically. Human review is a designed part of a process; human rescue is a failure. Keep the two apart.

**Capability goes to the data; the cloud holds neither.** Customer data never transits through Conxa infrastructure. Compilation runs on the builder's machine, execution runs on the machine doing the work, and — as the product grows — scale and intelligence run on infrastructure the customer owns too (§14). The cloud coordinates: it hosts, versions, distributes, meters and bills. It does not execute, and it does not store the customer's business data. This is a security and trust property, not just an architecture choice, and it is the one property that must survive every future stage of the product intact.

**Zero-cost recovery by default.** Tier 1 and 2 recovery cost nothing. LLM escalation is a last resort, not a default fallback. Skills should be compiled with enough redundancy that most real-world UI drift resolves without an LLM call.

**AI-native from the protocol up.** Conxa is not bolted onto an existing automation platform. It is designed from the ground up for AI agent consumption via MCP — skills are first-class agent tools, not wrapped scripts.

---

## 14. Long-Term Direction — Horizon 1, 2 and 3

Conxa's long-term direction is a sequence, not a feature list: **learn how a company works, execute
that work reliably, scale it beyond what people can do sequentially, understand what it reveals, and
help the company optimise itself.** And because the system that understands the work is also the system
performing it, the last stage feeds back into the first — the sequence closes into a loop rather than
ending (§14.3, *Understanding that can act*).

The differentiation is the starting point. Conxa does not begin with a model that reasons about work in
the abstract, or with a canvas on which someone designs a process that does not exist yet. It begins by
watching how the company *already* operates — the real steps, the real exceptions, the real points
where a person has to decide something — and turns that into something executable. Everything
downstream (scale, intelligence, optimisation) rests on the fact that the recording happened first.

**One doctrine runs through all three horizons.** *Conxa ships capability to where the work and the data
already are. The cloud holds neither.* Compilation already runs on the builder's machine, and execution
already runs on the customer's. Horizon 2's workers and queue and Horizon 3's intelligence layer follow
the same rule for the same reason — which is why the security answer that clears a bank's review today
is the same answer at every later stage, and why the pricing model survives intact (§11). This was
settled on 2026-08-21 and is recorded in §14.5.

**Read the horizon labels literally.** Horizon 1 is what we are building now and what a customer can
buy today. Horizon 2 and Horizon 3 are direction, not commitments — nothing in them is a current
requirement, a roadmap date, or something a salesperson should describe as existing. Where a Horizon 2
or 3 capability depends on a decision we have not made, that decision is named in §14.5 rather than
papered over.

> **Naming note.** "Horizon" is used deliberately to avoid collision with two other numbered sequences
> already in this repository: the four-phase *engineering* roadmap in `docs/Implementation-Plan.md`, and
> the Rung 1/2/3 *customer* ladder in §6 of this document. A Horizon is a stage in the product's
> direction; a Rung is a stage in a customer's adoption; a Phase is a stage in our engineering plan.
> Three different axes — they do not map onto each other.

---

### 14.0 What each horizon earns the next one

The order is not caution, and it is not a feature backlog with the hard parts at the end. Each horizon
exists to produce the thing the next one requires — and could not be built first even with unlimited
engineers, because its input would not exist yet.

Horizon 1 earns four distinct assets, and they accrue at different speeds:

| What Horizon 1 earns | How it feeds the later horizons | How fast it accrues |
|---|---|---|
| **Market** | The customers who automated one process become the accounts that need throughput. Rung 3 multiplies it — one services relationship puts the runtime inside many enterprises at once. | Per deal, immediately |
| **Money** | Revenue that funds the Horizon 2 and 3 build, rather than raising against a vision | Per deal, immediately |
| **Data** | The structured record of how a company actually operates — Horizon 3's only possible input, and one that cannot be reconstructed after the fact | Needs volume; slow at first |
| **Recognition** | Permission to have a more senior conversation than the one that got us in the building | Needs volume *and* time |

**Money is not only fuel.** §11 states plainly that we charge for what a workspace builds and how far it
reaches, not for how much it runs — so a customer who records ten skills in month one and nothing
afterwards keeps receiving the benefit while their spend flattens. That section names the operations
dashboard as the answer to the resulting renewal conversation. Horizons 2 and 3 are the stronger answer:
throughput a company cannot get from hiring, and questions about its own operations it cannot answer
anywhere else. Expansion revenue is not a side effect of the later horizons — it is a substantial part of
why they need to exist.

**Recognition is the long pole, and it constrains the sequence more tightly than the engineering does.**
Each horizon asks a customer to trust us with something larger than the last:

- **Horizon 1** — *let it do the work while a person is there.*
- **Horizon 2** — *let it do the work with nobody watching, at volume.*
- **Horizon 3** — *let it tell you how your company should be run.*

No operations leader grants the second before the first has been boring for a while, and no executive
grants the third to a vendor they do not already trust operationally. That trust cannot be bought,
demoed, or skipped — which means the real risk of reaching for Horizon 2 early is not a feature that
disappoints. It is that one unattended failure at volume destroys more recognition than a year of
uneventful Horizon 1 runs creates.

**The corollary, and the reason §14.4 exists.** Because the later horizons are earned rather than
scheduled, the only thing Horizon 1 owes them is that its byproducts come out in a usable shape. An
execution record that captures "step 14 clicked a button in 220 ms" and nothing more is telemetry, not an
operating picture — and the difference cannot be recovered later, because the information was never
captured. That is what the foundations in §14.4 protect, and it is the whole of what we build early on
the later horizons' behalf.

---

### 14.1 Horizon 1 — Learn and Execute *(CURRENT — this is what we are building)*

**Learn.** A person performs a real workflow in the Build Studio and Conxa records how the work
actually gets done: the automation steps, the conditions and branches, the exceptions, the recovery
context — and the **human review points**, the places where a person genuinely has to approve
something, supply a judgement, or take over.

**Execute.** Conxa executes those workflows reliably on the machine where the work happens, with
deterministic replay, compiled assertions, and the four-tier self-healing recovery cascade. Humans stay
in the loop exactly where the recording said they were needed — not as a fallback when automation
fails, but as a designed part of the process.

Everything in §7 (Product Components), §8 (Key Capabilities), and §11 (Business Model) describes
Horizon 1. It is the whole of the product a customer buys today.

**What changes in Horizon 1 because of this direction.** One thing, and it is significant: human
involvement stops being a disqualifier and becomes a first-class part of what a workflow *is*. The
Workflow Qualification Checklist previously treated a mid-flow human decision as a shape problem to be
engineered around by splitting the workflow in two. That is no longer the position — see §8, *Human
review points*, and the revised shape check in the Workflow Qualification Checklist below.

---

### 14.2 Horizon 2 — Scale *(FUTURE — direction, not a commitment)*

Once workflows execute reliably, the constraint stops being *can this run* and becomes *how much of it
can run at once*. Today a workflow is invoked by a person, through their agent, on their machine, one
run at a time. That is the right shape for Horizon 1 and the wrong shape for a company processing
thousands of claims a day.

Horizon 2 is the shift from a workflow a person runs to a **queue of work the organisation gets
through**:

```
Human operators  →  Work Queue  →  Execution Workers  →  Conxa Runtime  →  Skills  →  Applications
                         ↑
                  Human Review Queue
                  (only the items that
                   genuinely need a person)
```

Three consequences worth stating:

- **A work item becomes the unit of operation**, not a workflow invocation. One invoice, one claim, one
  onboarding — with its own state, its own history, and its own outcome, independent of whichever
  worker happened to process it.
- **Human Review becomes a queue rather than an interruption.** In Horizon 1 a review point pauses one
  run in front of one person. At scale, review items route to whoever is qualified to handle them, and
  a reviewer works through a list instead of babysitting a run. This is the mechanism that lets human
  judgement stay in the process without human throughput capping the process.
- **Concurrency replaces sequence.** Independent work items are independent; the limit becomes how many
  workers exist, not how many hours a person has.

**Where this runs — decided.** The workers and the queue run on infrastructure the customer owns, per
the doctrine above. Conxa does not execute work items and does not hold them. What this buys is that the
three properties the business rests on survive the jump to scale unchanged: the cloud still never
executes, execution still costs us nothing at the margin, and credentials and business data still never
leave machines the customer controls. The security conversation at Horizon 2 is therefore the same
conversation as at Horizon 1, which is the point.

**What this costs us, stated plainly.** Customer-owned workers mean the customer has to provide and
operate them — real machines, kept awake, kept logged in. That is a heavier ask than "sign up and it
scales," and it is the honest price of the property above. It is also the model established automation
vendors already use, so it is a familiar ask rather than a strange one. The harder half is not the
machines: it is keeping sessions alive on them without a person present, which remains genuinely
unsolved (§14.5).

Two items already in the engineering backlog are the earliest concrete pieces of this direction: the
standalone launcher and scheduler with parallel execution and a documented runner-machine profile, and
unattended session lifetime. Neither was written as Horizon 2 work at the time; both turn out to be its
foundations.

---

### 14.3 Horizon 3 — Understand and Optimise *(LONG-TERM — direction, not a commitment)*

After a company has taught Conxa many workflows and Conxa has executed them at volume, something exists
that did not exist before: **a structured, continuously updated record of how the company actually
operates.** Not an org chart, not a process map someone drew in a workshop two years ago — observed
execution.

Horizon 3 builds an **Operational Intelligence** layer on that record, spanning:

| Dimension | What it captures |
|---|---|
| Processes | What work the company actually performs, and how often |
| Skills | Which compiled workflows exist, and their versions and health |
| Applications | Which systems each process touches |
| Work items | Volume, throughput, and outcome per unit of work |
| Execution time | Where time is actually spent, step by step |
| Failures and recovery | What breaks, how often, and at which tier it heals |
| Human intervention | Where a person is still required, and how much of their time that costs |
| Dependencies | Which processes feed which, and what blocks what |
| Bottlenecks | Where work queues up, and why |
| Operational cost | What a process costs to run, against stated assumptions |
| Capacity | How much more the current setup could absorb |
| Process ownership | Who owns each process, and where knowledge sits with one person |

The eventual goal is that an executive can ask questions of this in plain language — *where are we
wasting the most time and money, what should we automate next, where are our bottlenecks, where are we
dependent on specific individuals, what happens if volume doubles, what should we redesign* — and get
an answer grounded in what actually happened rather than in what someone believes happens.

**Grounded, and honest about it.** Several of those questions need inputs that execution data cannot
produce: the loaded cost of a person's hour, headcount, expected volume, who owns a process. Horizon 3
therefore includes an explicit place for a company to state its own operational context — cost,
ownership, and capacity assumptions — and every answer that depends on one is labelled as
assumption-driven, with the assumption visible and editable. This extends the rule the operations
dashboard already follows today (§8, *Telemetry and operations*): measured figures are labelled
measured, estimated figures are labelled estimated. An intelligence layer that quietly invents a
currency figure is worth less than one that says which number it was handed.

#### How it deploys — on the customer's own infrastructure

Horizon 3 does not work by sending a company's operational record to Conxa. It works the other way
round: **the intelligence goes to the data.** Conxa ships the framework — the operational data model,
the analysis layer, and the deployment and retraining machinery — and it runs where the company's data
already is. Conxa orchestrates; the customer's infrastructure executes and stores.

This is the same architectural move the product already makes twice, applied a third time:

| | Where it happens | What the cloud does |
|---|---|---|
| **Compile** | Locally, in the Build Studio | Proxies model calls, hosts the published artifact |
| **Execute** | Locally, on the machine doing the work | Versions, distributes, meters |
| **Understand** | On the customer's own infrastructure | Ships the framework, orchestrates retraining |

The consequence is worth stating in the plainest available terms, because it is the sentence that gets
this product into an executive conversation in a regulated industry: **we have never asked a customer to
send us their business data, and Horizon 3 does not change that.** Every process-mining and operational-
analytics vendor in the market is a cloud data warehouse that requires exactly the opposite. We would be
structurally unable to be one.

**Staged, so the first version does not require a GPU.** The intelligence layer arrives in two stages,
because most of the questions in §14.3 do not need a fine-tuned model to answer them:

- **Stage one — the operational data model, queried by a general model.** The product is the structured
  record itself: processes, work items, dependencies, timings, interventions, ownership, cost
  assumptions. A general model translates a plain-language question into a query over it. This answers
  most of the questions above, and it runs on ordinary server hardware.
- **Stage two — a model fine-tuned on the company's own operational history**, for the point at which
  answers need the company's own process vocabulary rather than a generic one, with continuous
  retraining orchestrated through the Conxa platform and executed on the customer's infrastructure.

**Three deployment targets, all customer-owned.** Ordinary server hardware for stage one; the customer's
own cloud tenancy, which gives an organisation without on-premise capacity the same data boundary; and
on-premise GPU infrastructure for organisations that already run their own model estate and want stage
two. Which of the three a customer chooses changes nothing about the boundary — in every case the data
and the model sit inside infrastructure they control.

**Two loops, and they want opposite things.** This must not be read as giving up the telemetry loop
described in *What Our IP Actually Is*. Those are two different loops with two different subjects. The
existing loop is about **how interfaces drift and which recoveries work** — execution metadata, already
flowing to the cloud today, not business data, and it is genuinely more valuable pooled across
customers. The Horizon 3 model is about **how one company operates** — private by nature, per-customer,
and of no use to anyone else even if we had it. Keeping the first shared and the second local is not a
compromise between them; it is each one getting what it actually needs.

#### Understanding that can act

The layer that understands the company is also, structurally, able to operate it — because the skills are
already there. A compiled skill is exposed as an agent tool over MCP (§7), and the intelligence layer is
simply another caller of that same interface. Nothing new has to be built for understanding to become
action; the two share one mechanism.

That turns the sequence into a **loop rather than a line.** Understanding identifies the process costing
the most, the bottleneck worth removing, or the work that should be automated next — and the same system
can then record, compile and run the change. **Optimise feeds back into Learn.** A company's picture of
how it operates and its ability to act on that picture stop being two systems owned by two teams that
meet quarterly.

This is the end state §1's vision describes: a company progressively becoming AI-operated, where the
thing that knows how the work is done is also the thing doing it.

**Three constraints, none of them optional.**

**It changes nothing about the boundary.** The intelligence layer runs on the customer's infrastructure
and calls runtimes on the customer's own machines. A local system, acting locally, through the interface
that already exists.

**The blast radius is categorically larger, so the safeguards have to scale with it.** A conclusion the
system reached itself, driving an irreversible action across ten thousand work items, is not the same
risk as one step in one run — even though the mechanism is identical and that is exactly why it is easy
to miss. Everything that governs work a person initiated applies to work the intelligence layer
initiates, and applies more strictly rather than less: human review points (§8), the sign-off gate,
role-based access control, and the audit log. An action taken on the strength of the system's own
analysis should require a named person to authorise it, and the record should show who.

**Understanding what should change is not authority to change it.** The intelligence layer's job is to
make the case, not to make the call. A recommendation that a process be redesigned — or that people move
— is an input to the humans accountable for that decision, and the audit trail has to show that a human
made it. A system that can both diagnose the organisation and act on the diagnosis without a person in
between is not a product we are trying to build.

**Scope note.** Intelligence is scoped to the workspace whose skills produced the executions. For a
Rung 2 enterprise that is unambiguous — the company understands itself. For a Rung 3 vendor or
consultancy distributing skills to *their* customers, whose operations are being understood is a
genuine open question with commercial and contractual consequences (§14.5).

---

### 14.4 The foundations Horizon 1 must build *(CURRENT requirements)*

The horizons above are only reachable if Horizon 1 gets its data model right. These are **current
requirements**, not future work — but the reason they are requirements is future-facing, and stating
that reason is the point of this section. Each row carries what actually exists today, so that this
section cannot be misread as a description of shipped capability.

| Foundation | Why later horizons need it | Status today |
|---|---|---|
| **Human Review** | Horizon 2's review queue can only route what Horizon 1 recorded. If review points aren't captured at record time, there is nothing to route. | **To build.** Recording, compiling, and pausing on human review points is new work. |
| **Execution state** | Durable, inspectable run state is what lets a run pause for review, resume afterwards, and be reported on. Without it, a paused run is just a blocked process. | **Partly built.** Per-run status and the park-and-resume machinery exist; durable resumable state does not. |
| **Work-item abstraction** | The unit a queue distributes, a reviewer acts on, and Horizon 3 counts. Retrofitting it later means rewriting telemetry, reporting, and the review model at once. | **To build.** Today a run is a workflow invocation with inputs, not an addressable item of work. |
| **Structured telemetry** | The entire Horizon 3 layer is a query over this. Telemetry good enough for a health dashboard is not automatically good enough for operational analysis. | **Largely built, needs extending.** Execution telemetry is structured and flowing; not all of §14.3's dimensions are captured. |
| **Workflow / process metadata** | Horizon 3 reasons about *processes*, not skills. A skill is an artifact; a process is a business activity that may span several skills and several people. | **Partly built.** Skills carry versions, groups, and intent; there is no process-level concept above them. |
| **Ownership and versioning** | "Who owns this process" and "which version produced this result" are Horizon 3 answers that must be recorded at the time, not reconstructed afterwards. | **Largely built.** Publishing, release channels, RBAC, and the audit log already carry this. |
| **Relationships and dependencies** | Bottleneck and impact analysis is a graph question. If the relationships between workflows are never recorded, the graph cannot be rebuilt retrospectively. | **To build.** Sequences of skills can be executed, but a sequence encodes no dependency the system can reason about. |

**The rule this section exists to enforce:** where a Horizon 1 decision and a Horizon 2/3 need conflict,
Horizon 1 wins on *scope* and Horizon 2/3 wins on *shape*. We do not build the queue now. We do make
sure that what we build now can be put behind one later.

---

### 14.5 Decisions and open questions

#### Decided — 2026-08-21

Four questions that were open when this section was written have been settled, all by one decision. They
are recorded here rather than deleted, because the reasoning is what makes the remaining questions
answerable and because a future reader needs to know these were chosen rather than defaulted into.

**The doctrine: Conxa ships capability to where the work and the data already are; the cloud holds
neither.** From it:

1. **Horizon 2's execution workers run on customer-owned infrastructure.** Conxa-hosted execution was
   rejected: it would break all three of the properties the business rests on — the cloud never
   executes, execution costs us nothing, credentials never leave the machine — and those three are what
   the security answer, the pricing model, and the competitive position are all built on.
2. **The work queue is customer-side, and Conxa does not hold work items.** This follows from the same
   doctrine and closes the question of whether a work item may carry business payloads: we are not the
   party holding it either way.
3. **"Pay for reach, not for runs" survives Horizon 2.** Because we neither execute nor store at scale,
   no marginal cost appears that would force per-item metering. What "reach" *means* extends rather than
   changes — see §11.
4. **The Horizon 3 intelligence layer runs on the customer's own infrastructure**, staged so that its
   first version needs no GPU, with continuous retraining orchestrated by Conxa and executed by the
   customer. See §14.3, *How it deploys*.

**What this deliberately costs.** Customer-owned infrastructure at both horizons is a heavier ask than a
hosted alternative, and it will lose deals to a competitor willing to run everything for the customer.
That trade was made knowingly: the property being protected is the one that gets us into regulated
industries at all, and it is not recoverable once given up.

#### Still open

Two questions remain genuinely unresolved. Neither should be answered by inference from the sections
above.

5. **Unattended session lifetime.** Horizon 1 treats a login demanding a fresh one-time code every time
   as a hard blocker, and everything else as manageable because a person is at the machine. Horizon 2
   removes the person. Session and credential lifetime for unattended, concurrent workers is the single
   hardest unsolved problem between Horizon 1 and Horizon 2 — a prerequisite, not a detail.
6. **Whose operations does Horizon 3 describe in a Rung 3 relationship?** When a vendor or consultancy
   distributes skills to thirty customers, intelligence derived from those executions is commercially
   valuable and contractually delicate. Whether it belongs to the distributor, to each end customer, or
   to neither by default, is undecided. Note that the local-deployment decision above narrows this
   without answering it: the data sits inside each end customer's infrastructure, which makes "the
   distributor sees all thirty" a thing that would have to be deliberately built rather than something
   that happens by default.

---

## Final Statement

Conxa is not a browser automation tool, a macro recorder, or a traditional RPA platform.

Conxa is execution infrastructure for AI agents — the layer that turns human-performed software workflows into precompiled, self-healing, MCP-native skills that Claude can operate reliably, at scale, on any machine, without touching the target software's codebase.

The interface was already built. Conxa makes it AI-operable.
