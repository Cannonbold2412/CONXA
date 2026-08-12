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

---

## 1. Product Overview

**Product Name:** Conxa

**One-Line Description:** Conxa turns any human-performed software workflow into a precompiled, self-healing skill that AI agents can execute reliably — without writing code or touching the target application.

**Mission:** Make every software platform operable by AI, exactly as humans operate it today.

**Vision:** A world where AI agents handle repetitive software work end-to-end — not by navigating UIs from scratch on every run, but by executing precompiled, battle-tested skills that already know what to do, where to look, and how to recover when things go wrong. Conxa is the infrastructure that makes that possible.

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

### Where this model is exposed

Two risks, stated rather than assumed away:

- **A workspace that compiles constantly and distributes little** inverts the model — all cost, no
  reach. Compile credits exist for exactly this, and their calibration is the number to watch as usage
  grows.
- **The value we charge for is created at build time, but felt at run time.** A customer who records
  ten skills in month one and nothing afterwards keeps receiving the benefit while their spend looks
  like it should fall. This is a renewal-conversation risk, and the operations dashboard — which puts
  a running figure on what the skills are actually doing — is the answer to it.

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
evidence about how real interfaces actually drift and which remedies actually work.

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
- **Human decisions mid-flow.** Identify them explicitly. The workflow should either not contain them,
  or be split so the automated parts sit either side of the person.
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

**Teach once, run forever.** The human's time is spent once, at recording. Every execution after that should require no human involvement unless something genuinely can't be recovered automatically.

**Local execution, cloud coordination.** Customer data never transits through Conxa infrastructure during execution. The cloud coordinates — it does not execute. This is a security and trust property, not just an architecture choice.

**Zero-cost recovery by default.** Tier 1 and 2 recovery cost nothing. LLM escalation is a last resort, not a default fallback. Skills should be compiled with enough redundancy that most real-world UI drift resolves without an LLM call.

**AI-native from the protocol up.** Conxa is not bolted onto an existing automation platform. It is designed from the ground up for AI agent consumption via MCP — skills are first-class agent tools, not wrapped scripts.

---

## 14. Long-Term Vision

Conxa's goal is to become the universal execution layer between AI agents and existing software.

Near-term, this means every SaaS vendor can ship Claude-operable skills alongside their product — turning AI compatibility into a distribution feature, not an engineering project.

Medium-term, this means enterprises running AI workforces where Claude handles entire operational domains — not occasionally, but as the primary operator — with Conxa skills as the execution substrate.

Long-term, this means a marketplace of skills covering the SaaS ecosystem: any agent, any model, any workflow — recorded once by someone, available to everyone. Conxa becomes the npm of AI-executable software operations.

---

## Final Statement

Conxa is not a browser automation tool, a macro recorder, or a traditional RPA platform.

Conxa is execution infrastructure for AI agents — the layer that turns human-performed software workflows into precompiled, self-healing, MCP-native skills that Claude can operate reliably, at scale, on any machine, without touching the target software's codebase.

The interface was already built. Conxa makes it AI-operable.
