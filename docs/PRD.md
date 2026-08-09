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

Every real business process crosses systems nobody fully owns. Onboarding a customer touches the CRM, the ERP, email, and two internal tools. Processing a claim touches a portal, a policy system, finance, and a notification service. No single team controls all of it, so no single team can justify building an integration for all of it — and the process stays manual, expensive, and dependent on the two people in the company who know every step.

The instinct is to ask "what can automate this system?" That's backwards. The right question is "what does this business process cost, and what happens if we stop paying it in human hours?" Start with the business value, then pick the technology that delivers it — not the other way around.

Today's approaches all break in predictable ways:

- **Traditional RPA** encodes brittle selectors. One UI update and everything breaks. Maintenance costs compound faster than value delivered.
- **Browser automation scripts** are developer tools, not something a SaaS company can hand to a customer.
- **Sending an AI agent to navigate live UI** works for demos. It fails at scale — token costs explode, latency is high, and reliability is inconsistent because the agent rediscovers the interface on every run.
- **Native integrations (APIs, webhooks)** require someone to build and maintain them — expensive, slow, and impossible for the long tail of workflows that never survive sprint planning.

**"Why not just build the API?"** For the one system a company owns, that's often the right call — one extra engineering day beats adopting a new platform. But a cross-system process never has one owner. It's true for the system you control and false for the other four in the chain that you don't, and false again for the long-tail workflow that's too small to ever get its own sprint. We don't win this by explaining our architecture — we win it with a number: this process, these five systems, this many hours a month, this is what building and maintaining five integrations costs versus recording it once.

The gap: there is no infrastructure layer that lets an AI agent reliably operate a process across the software an enterprise already uses, without requiring anyone to build anything new.

Conxa fills that gap. Stop asking who owns the software. Start asking who owns the process — because Conxa automates workflows that employees are already authorised to perform, across the software they already use. Not "Conxa has permission from every application" — Conxa acts on behalf of the person who does.

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

**The business outcome first:** a process that used to require a person watching five screens now runs unattended, at the reliability of a human doing it carefully, every time. The technology underneath — recording, compilation, self-healing execution — exists to deliver that outcome, not the other way around.

**For an enterprise running its own operations:** stop assigning people to repetitive cross-system work. Record the process once, in the Build Studio; every AI agent your team already uses can execute it from then on — reliably, at scale, without token waste, and without waiting for five different vendors to ship five different integrations.

**For a SaaS vendor or a consultancy scaling as a channel:** once a process works for one client, ship it to every client whose stack looks the same. Record your product's workflows once — Conxa compiles them into skills and distributes them as a branded installer. No API, no SDK, no new engineering headcount, and a services firm that already knows which processes break across its client base turns that knowledge into a repeatable, sellable asset.

**For AI agents:** execute precompiled workflow skills instead of navigating live interfaces from scratch. Lower token cost, deterministic step execution, and built-in recovery that handles UI drift automatically.

---

## 5. Why Now

Three shifts are converging:

1. **MCP has become the standard interface between AI agents and tools.** What began as Claude Desktop's protocol is now implemented across the agent ecosystem — coding agents, IDE assistants, CLI agents, and desktop apps from multiple vendors all speak MCP. Conxa is built natively on it, and the runtime registers itself into every major MCP host rather than a single one. A skill recorded once is callable from whichever agent the customer already uses.

2. **AI agents are graduating from demos to production.** Enterprises are now asking how Claude handles their actual software stack — not hypothetically, but operationally. There is no good answer without execution infrastructure.

3. **SaaS companies need an AI-native distribution channel.** "How do I make my product work with Claude?" is a question every SaaS product team is now asking. Conxa answers it without requiring API investment.

---

## 6. Target Customers

Conxa is one product with one buying motion: a workspace climbs a ladder, from proving the product
works to running it across an organization to distributing it as a channel. It is not two products for
two markets — every capability below is the same compiler, the same recovery cascade, the same
runtime, gated by what the buyer actually needs at their stage.

### Rung 1 — Prove it works

An engineer or product person, one machine, one process. They need to see a real workflow survive a
recompile and a UI change before they bring it to their team. This is a qualification motion, not a
revenue motion — the free tier exists to get someone from skeptical to convinced.

### Rung 2 — Run your organization

An enterprise automating its own cross-system processes: operations and back-office, finance and
accounting, sales operations, customer support. They record their own internal workflows in the Build
Studio, deploy skills to their own team, and let their AI agents execute them — through Claude Desktop,
a coding agent, or whichever MCP-capable host the team already runs. This is the primary revenue
customer: a bank automating claims intake, an insurer automating vendor onboarding, an internal ops
team that owns a process nobody outside the company will ever build an API for.

### Rung 3 — Ship it to your customers

A SaaS vendor or an IT-services/consulting firm that has already solved this process for one client and
wants to sell it to the next thirty. Two shapes of the same customer:

- **SaaS vendors** who want their platform operable by Claude without building native AI integrations.
  They record their own product's workflows, publish skills to the cloud, and distribute them to their
  customers as a branded installer.
- **IT-services and consulting firms** — the channel insight that came out of the Centelon pilot. A
  services firm selling Odoo, Salesforce, ERP and CRM implementations across banking, insurance,
  energy, aged care and government clients isn't a single customer — it's thirty enterprises reachable
  through one relationship, and it already knows which processes are painful because it has watched
  the same one break across many clients. Their own internal work (timesheets, invoicing, client
  reporting) is a demo, not the sale; the sale is automating the same *shape* of cross-system process
  they already get paid to implement for clients.

Relevant verticals for both shapes: CRM and sales platforms, ERPs, marketing and growth tools, HR and
people management, customer success and support tools, internal business operations software.

### Secondary

- Internal IT teams standardizing software access for AI tooling
- AI-first startups that need reliable non-API software integrations

---

## 7. Product Components

### Conxa Build Studio

A Windows desktop application (Electron + Python) that runs entirely locally. The SaaS vendor or enterprise user uses it to:

- Record browser workflows using an injected capture bridge
- Review and edit captured workflows step-by-step
- Compile workflows locally into Skill Packages — no cloud involvement in this step
- Build plugin archives and NSIS installer packages
- Publish compiled skills to Conxa Cloud

Recording, compilation, and packaging are entirely local. The cloud is not in the execution path during build.

### Conxa Cloud

A thin coordination layer (FastAPI on Render, Next.js on Vercel) that handles:

- Skill package hosting and versioning
- Installer hosting and distribution
- LLM proxy for compile-time AI calls (multi-provider: Groq, Google AI Studio, NVIDIA NIM)
- Billing, plan entitlements, and subscription management (Cashfree)
- Execution telemetry and run analytics
- Team and organization management, role-based access control, and a workspace audit log

The cloud does not record, compile, or execute workflows. It is coordination infrastructure.

**Governance.** Membership and roles are resolved from the vendor's identity provider, and privileged actions are restricted to workspace owners and admins. Every consequential action — publishing a skill release, changing a plugin's distribution state — is written to an immutable, per-workspace audit log that admins can review in the dashboard. Enterprise buyers treat this as table stakes: they need to answer "who shipped this skill to our customers, and when" without asking Conxa.

### Conxa Runtime

A Node.js MCP server that ships inside the vendor's branded `.exe` installer and runs on the end customer's machine. It:

- Registers itself as an MCP server into every AI agent host installed on the machine
- Syncs skill packs from Conxa Cloud (delta sync, SHA-256 verified)
- Exposes skills as native agent tools (`execute_skill`, `list_skills`, `get_skill_inputs`, etc.)
- Executes skills locally via Playwright with a multi-tier self-healing recovery cascade — see `docs/TRD.md` §10.1
- Streams execution telemetry back to Conxa Cloud
- Self-updates by polling the update manifest

Execution never leaves the customer's machine.

**Two layers, updated on different clocks.** What installs as one program is internally split in two. **`conxa-runtime`** is the host binary — the heavy, stable layer that carries the browser engine and the OS integrations. It is ~85 MB and changes rarely, on the order of quarterly. **`conxa-app`** is the logic layer that sits on disk beside it — the executor, the element resolver, the recovery cascade. It is a ~60 KB download and ships with every release.

This split is what makes fixes travel fast. A reliability improvement to the recovery cascade reaches every customer machine as a 60 KB update within a release cycle, rather than requiring an 85 MB reinstall that end users must consent to. Since the vendor's customers — not the vendor — are the ones running the software, an update path that needs their attention is an update path that doesn't happen.

Two safeguards keep that speed from becoming a liability: the host refuses to load an app layer that declares a newer host requirement than it can satisfy, so a fast-moving logic layer can never half-run against an old binary; and a failed update rolls back to the previous version automatically. Both artifacts are integrity-checked, and the manifest describing them is cryptographically signed.

### MCP Layer

Conxa Runtime speaks the Model Context Protocol natively, and registers into the agent hosts the customer already has installed rather than a single vendor's app. Supported hosts span desktop assistants (Claude Desktop), coding agents (Claude Code, Codex, Gemini CLI, GitHub Copilot CLI, OpenCode, Goose), IDE-embedded agents (Cursor, VS Code, Windsurf, Zed, Cline, Antigravity, Kiro, Junie), and agent platforms (Factory Droid, OpenHands, Augment, KiloCode, and others) — currently more than twenty, added as the ecosystem grows.

Skills appear to each of these agents as first-class tools. An agent can discover available skills, request required inputs, execute them singly or as a sequence, inspect runtime status, and cancel runs — all through the standard MCP interface, with no custom integration per host.

This is a distribution property, not just a compatibility one: the vendor records a workflow once and it becomes callable from every agent their customers use, without the vendor targeting any of them.

### Platform Support

**Build Studio is Windows-only.** Recording, compilation, and packaging happen on Windows. This is acceptable because the person recording a workflow is the vendor's own product or ops person, not their customer — it constrains one internal seat, not the addressable market.

**The Runtime ships for Windows today.** A macOS runtime target exists and builds, but macOS is not yet a supported customer platform: there is no macOS installer format, and the host binary and update path are unverified on darwin. Treat macOS runtime support as roadmap, not capability, until an installer ships. This is the single largest platform gap for enterprise deployments with mixed fleets.

---

## 8. Key Capabilities

### Workflow Recording

The Build Studio injects a capture bridge into the browser that records every interaction at the event level — clicks, inputs, navigation, scroll, focus, iframe transitions, and screenshots. Metadata is captured alongside each action: element role, text content, bounding box, page URL, and frame chain.

### Multi-Signal Compilation

Recorded sessions are normalized, deduplicated, and enriched through a local compilation pipeline. Each step is analyzed for:

- **Primary selectors** — multiple compiled strategies ranked by specificity and resilience
- **Semantic intent** — what the step is trying to accomplish, not just where it clicks
- **Anchors** — nearby stable text elements used as spatial landmarks
- **Visual fingerprints** — screenshot crops for vision-based recovery
- **Assertions** — expected post-step UI state to validate correct execution
- **Recovery metadata** — everything needed to re-find and re-execute if the element has moved or changed

### Self-Healing Execution — Recovery Cascade

When a step fails to find its target element, the runtime escalates through a multi-tier recovery cascade, only calling Claude once cheaper, zero-token methods are exhausted — see `docs/TRD.md` §10.1 for the authoritative tier table.

### Workflow Editing

After recording, vendors can review the captured workflow step-by-step, modify individual actions, add conditional logic, annotate intent, and verify the execution plan before compilation.

### Skill Distribution

Compiled skills are packaged into a self-contained plugin archive and bundled into an NSIS Windows installer. The installer is hosted on Conxa Cloud and linked from the vendor's dashboard. End customers download and run it — the runtime installs itself, registers into every MCP-capable agent host it finds on the machine, and is immediately available in all of them.

### Skill Versioning and Sync

When a vendor updates a skill and republishes, the runtime on every customer machine detects the delta at next sync and atomically updates the local skill pack. No customer action required.

### Execution Telemetry

Every execution emits structured telemetry — step outcomes, recovery tiers used, latency, failure points. Vendors see this in their Conxa Cloud dashboard as run timelines and aggregate analytics.

---

## 9. Major Use Cases

Every use case here is a business process, not a single-app task — each one names the systems it
crosses, because that's the shape of problem an enterprise or a services firm actually pays to solve.

**Customer onboarding** — CRM → ERP → email → internal provisioning tools. Create the account, configure
initial settings, trigger the welcome sequence, and set up whatever internal system has to know the
customer exists — as one process instead of four separate logins.

**Claims intake** — Portal → policy system → finance → notification. An insurer's claim moves through
systems that were never built to talk to each other; today a person carries it between them by hand.

**Vendor onboarding** — Procurement → compliance → ERP → payments. The exact shape of work an IT-services
firm gets paid to implement for its clients, run as a skill instead of a project.

**Invoice and finance processing** — Document intake → data extraction → accounting system → approval
flow. Upload documents, extract structured data, post it correctly, and route it for sign-off.

**HR and people ops onboarding** — HR platform → access/identity system → payroll → compliance reporting.
Provision a new hire the same way, every time, across every system that has to know about them.

**Internal reporting** — Multiple operational tools → dashboard → distribution. Pull data from the
systems that actually hold it, not the one system that has an API, and get it in front of people on
schedule.

---

## 10. Competitive Positioning

### vs. Traditional RPA (UiPath, Automation Anywhere)

RPA encodes point-in-time selectors into brittle scripts. UI changes break automations. Maintenance is continuous and expensive. These platforms are designed for IT-managed enterprise deployments — not for SaaS vendors to distribute to customers.

Conxa's advantage: multi-signal compilation means skills degrade gracefully rather than breaking hard. Self-healing recovery handles UI drift automatically. And Conxa is distribution infrastructure — skills ship with the product, not as internal IT projects.

### vs. Browser Automation Tools (Playwright, Puppeteer)

Developer tools that require code. They have no compilation model, no recovery architecture, no distribution mechanism, and no AI integration. They solve a different problem for a different audience.

Conxa's advantage: no-code skill creation, built-in recovery, and native MCP distribution. A product manager can record a workflow and ship it to customers.

### vs. AI Agents Navigating Live UI

Sending an AI agent to navigate a live interface from scratch on every run costs tokens, takes time, and produces inconsistent results because the agent must rediscover the interface continuously.

Conxa's advantage: precompiled skills encode the execution graph once. The agent executes a skill, not a navigation session. Token cost is bounded, latency is lower, and reliability is deterministic.

### vs. Native API Integrations

APIs require the software vendor to build and maintain them. They're unavailable for long-tail workflows, require developer resources, and lag behind UI-level capabilities.

Conxa's advantage: zero engineering required from the software vendor. If a human can do it in the browser, Conxa can make it a skill.

### vs. AI Browser Assistants (Perplexity Comet, Claude for Chrome, etc.)

This is a different category, not a better version of the same one — and we should say so rather than
overclaim, because a technical buyer will test the claim in the room. Browser assistants rediscover the
interface every run: per-session, per-user, non-deterministic, and paying token cost on every single
execution. They're excellent for a person doing a one-off task who wants an agent alongside them.

Conxa compiles a workflow once and replays it deterministically, with recovery, unattended. It's for a
process that runs a thousand times without a person watching — not a person's session, a business's
process.

---

## 11. Business Model

Conxa sells to the workspace that *builds* skills, not to the end users who run them. Pricing is **"pay
for reach, not for runs"**: unlimited installs and unlimited executions on every tier, because execution
is local and costs Conxa nothing marginal. What's priced is how much of the ladder a workspace has
climbed — how many people can build, how much gets compiled, and how far the result can travel.

### The capability ladder

Each tier is a rung, not just a bigger number. What changes between them is *what a workspace can do*,
not only *how much*:

| | **Free** | **Starter** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| Who | An engineer proving it works | One product team automating its own processes | An enterprise running its org, or a vendor scaling as a channel | A SaaS vendor or consultancy shipping to their customers |
| Record → compile → execute, full self-healing | Yes | Yes | Yes | Yes |
| Distribution | Internal, 1 machine | Internal, unbranded | External, Conxa-branded | External, white-label |
| Ops dashboard | None | Basic | Full (+ healing, impact, drift) | Full |
| Audit log & RBAC | None | Basic | Full | Full + SSO/SAML |
| BYOK | No | No | No | Yes (Azure OpenAI) |

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

**Executions and installs are free and unlimited on every tier.** Skills run entirely on the customer's
machine using the customer's own compute — Conxa incurs no marginal cost per run, so charging per
execution would price against the product's core promise. This is a structural advantage over every
cloud-execution competitor, whose costs scale with customer usage and who must therefore meter it.

The consequence: revenue scales with how many workflows a workspace *builds* and how far it *reaches*,
not how hard end users *run* them. Nobody is penalised for success, which removes the usual reason
customers ration an automation platform.

### Cost posture

Compilation is a one-time cost per workflow version; execution is a recurring benefit. The free tier
runs on free-tier LLM providers so that trial usage costs effectively nothing, while paid tiers route to
higher-quality models where compile quality directly determines skill reliability. Unit economics are
modelled in `docs/cost_model.md`.

---

## What Our IP Actually Is

The instinctive answer — "recording → compile → Playwright automation" — is also the exact phrase a
technical evaluator uses to describe what's *not enough* to build a category on. A good team of ten
could build a decent recording-to-Playwright compiler in six months, and large AI labs are actively
shipping in this space. The compiler is hard work, but hard is not the same as defensible.

What's actually hard to copy:

**The recovery ladder.** Four tiers, most costing nothing, LLM only as a last resort. Making automation
degrade gracefully instead of breaking hard is an execution architecture, not a compiler trick — see
`docs/TRD.md` §10.1.

**The telemetry loop.** Every run, recovery, and failure flows back into how we compile the next skill.
A competitor can copy the compiler in a quarter. They cannot copy two years of execution history of how
real UIs actually drift and which remedies actually work.

**The cost structure.** Execution runs on the customer's machine, so it costs us nothing and we charge
nothing for it. Any cloud-execution competitor must meter runs to survive; they cannot match this
without rebuilding their business model.

The correct framing: the compiler is the engine. The IP is that skills keep working after the UI
changes, and that we get cheaper as customers use us more while cloud-execution competitors get more
expensive as their customers use them more.

**Two honest cautions.** First, a system of small IPs that only add up to something *as a loop* is much
harder to sell than one big one — you cannot explain a loop in a first meeting, you need one sentence
that survives the room. Second, the loop is only real once it's spinning. Today the architecture exists
but execution history is thin, because install volume is thin. Right now this is a diagram, not a moat.
It becomes real around customer ten.

---

## Workflow Qualification Checklist

Run this before promising any workflow can be automated. Better to disqualify in week one than fail in
week six.

- **MFA policy.** If the target system demands a fresh OTP on every login, unattended automation is
  dead — this is the one blocker that genuinely can't be worked around.
- **Bot protection / CAPTCHA / IP allowlisting.** Aggressive bot detection is built for adversarial
  traffic — datacenter IPs, headless browsers, high volume from fresh sessions. Conxa is none of those:
  it runs on an employee's own machine, from a corporate IP, in a real browser, reusing a session that
  employee legitimately created, at human speed. Most line-of-business software (an ERP, an internal
  CRM, a bank's loan origination system, a vendor portal, an insurer's claims system) has no bot
  detection at all — nobody puts bot protection on internal LOB software. Where it does bite is
  consumer-facing platforms: social networks, some payment portals, public-web search. Moving up-market
  to real business processes removes most of this risk along with the consumer-app examples that used
  to headline our marketing.
- **Terms of service.** Check for a clause banning automated access.
- **Session lifetime.** How long does an authenticated session last unattended before it needs a human
  to re-authenticate?

If a workflow fails this checklist, say so and don't attempt it. The moment we try to defeat a
protection, Conxa becomes a different company with a different legal profile — identify the blocker,
say the workflow can't be automated, and move to the next one.

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
