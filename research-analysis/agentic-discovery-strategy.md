# Agentic Resource Discovery — What It Means for Conxa

**Written:** 2026-06-28  
**Context:** Full strategic analysis — what ARD is, why it doesn't threaten Conxa, how Conxa benefits, the installer naming decision, whether agents can auto-install the runtime, and the complete end-to-end flow.

---

## Table of Contents

1. [What Is Agentic Resource Discovery?](#1-what-is-agentic-resource-discovery)
2. [The Worry — Does It Make Conxa Worthless?](#2-the-worry--does-it-make-conxa-worthless)
3. [Why It Doesn't — Conxa's Real Moat](#3-why-it-doesnt--concxas-real-moat)
4. [How Conxa Benefits](#4-how-conxa-benefits)
5. [The Installer — company-Agent-Setup.exe](#5-the-installer--company-agent-setupexe)
6. [Can Agents Auto-Install the Runtime?](#6-can-agents-auto-install-the-runtime)
7. [The Complete End-to-End Flow](#7-the-complete-end-to-end-flow)
8. [The Local HTTP Strategy](#8-the-local-http-strategy)
9. [What the ARD Manifest Looks Like](#9-what-the-ard-manifest-looks-like)
10. [Honest Negatives — What ARD Actually Threatens](#10-honest-negatives--what-ard-actually-threatens)
11. [Priority Roadmap](#11-priority-roadmap)
12. [Summary](#12-summary)

---

## 1. What Is Agentic Resource Discovery?

Imagine you walk into a giant library. Without a catalogue, you'd have to wander every aisle to find a book. Agentic Resource Discovery (ARD) is the catalogue — it's a published standard protocol that lets AI agents automatically ask: *"what tools are available to me, what do they do, and how do I call them?"*

Before ARD, every agent framework (Claude, OpenAI, Google) had its own private list of tools baked in. A published standard means any compliant agent can **discover** tools at runtime without being hard-coded to know about them.

**Technically:** ARD is a protocol layer that sits above individual agent frameworks. An agent queries a discovery endpoint, gets back structured metadata (tool name, description, inputs, outputs, and how to invoke it), and can immediately use that tool — regardless of which AI company built the agent.

Think of it like DNS for tools. DNS lets any browser find any website. ARD lets any agent find any tool.

---

## 2. The Worry — Does It Make Conxa Worthless?

The initial fear: *"If any agent can now discover and call any tool automatically, why does anyone need Conxa? Won't everyone just use a general-purpose browser agent instead?"*

This is a **layer confusion** — mixing up two different problems:

| Layer | Problem | Who Solves It |
|---|---|---|
| Discovery | How does an agent *find* a tool? | Agentic Resource Discovery protocol |
| Execution | Does the tool *reliably work*? | Conxa |

The discovery protocol is an index. It tells agents what tools exist. It does not make those tools reliable, self-healing, cheap to run, or enterprise-grade.

A real-world analogy: Google Maps tells you which restaurants exist (discovery). It doesn't make the food good (execution). A great restaurant doesn't become worthless because Google Maps got better — it becomes *more findable*.

---

## 3. Why It Doesn't — Conxa's Real Moat

Conxa's value has never been about being the only tool agents can find. It's about being the tool agents can *depend on*.

### 3.1 Compiled Skills with Multi-Signal Element Identity

When a SaaS vendor records a workflow in Build Studio, Conxa doesn't just save "click the button at x=400, y=200." It compiles a **multi-signal fingerprint** for every element:

- CSS selector
- XPath
- Visible text / aria-label
- Bounding box relative to parent
- DOM position score
- Visual anchor (screenshot hash)

If the SaaS app updates and the CSS class changes, Conxa still finds the element using the other signals. A raw agent browsing with a one-shot LLM call has no compiled baseline to fall back to.

### 3.2 The 5-Tier Self-Healing Recovery Cascade

When an element isn't found at runtime, Conxa doesn't just fail. It escalates through five recovery tiers, each one more expensive than the last:

```
Tier 1 — Compiled selector (zero cost, instant)
  ↓ fails
Tier 2 — A11y tree scan (zero LLM cost)
  ↓ fails
Tier 3 — LLM semantic match (costs tokens, fires once)
  ↓ fails
Tier 4 — Vision model screenshot scan (costs tokens)
  ↓ fails
Tier 5 — Full re-record prompt (human escalation)
```

**Key invariant:** Tiers 1 and 2 cost zero LLM tokens. Most real-world failures are handled before any AI is involved. This makes Conxa dramatically cheaper and faster than an agent that re-reasons from scratch on every failure.

### 3.3 Local Execution = Enterprise Privacy

The runtime runs on the **customer's machine**. The SaaS session, credentials, and data never leave the customer's network. For enterprise buyers — HR tools, CRM, finance software — this is often a hard requirement. A cloud-executed browser agent that streams your Salesforce session through a third-party server is a non-starter.

### 3.4 Deterministic Cost

A compiled Conxa skill has a predictable cost: it runs the same steps, the same way, every time. An open-ended browsing agent re-reasons at every step — you don't know how many LLM tokens it will spend until it finishes. For SaaS vendors billing customers for automation, unpredictable cost is a product defect.

### 3.5 No-Code Recording

Business users (ops managers, customer success teams, implementation consultants) can record workflows themselves in Build Studio without writing code. General-purpose agents don't give SaaS vendors a way for non-engineers to create agent-callable tools.

---

## 4. How Conxa Benefits

Agentic Resource Discovery doesn't threaten Conxa — it **amplifies** Conxa's value.

### 4.1 Conxa Cloud Becomes a Skill Registry

Right now, Conxa Cloud hosts skill packs for distribution to Claude Desktop users. With ARD, it becomes a **public discovery registry** — the authoritative index of enterprise browser automation skills.

A discovery agent asks: *"Are there any tools for Salesforce?"*  
Conxa Cloud responds with the skill manifest, inputs, invocation details, and installer URL.

This is the npm analogy. npm hosts packages and is also the discovery layer — `npm search salesforce` shows what exists. Conxa Cloud serves the same function for agent-callable browser skills.

### 4.2 Multi-Agent Distribution from One Recording

Currently: SaaS vendor records once → skill is usable by Claude Desktop users only.

With ARD: SaaS vendor records once → skill is usable by **any agent on any framework**.

The SaaS vendor's time investment (recording + compiling in Build Studio) gets multiplied across every agent platform that adopts ARD. This is a stronger GTM story: *"Record it once, every AI agent your customers use can find and call it."*

### 4.3 The Compiled Skill Becomes More Valuable, Not Less

As more agents proliferate and businesses automate more workflows, the quality bar for execution rises. An agent that hallucinates button clicks or breaks when a UI updates is not enterprise-grade. Conxa's compiled skills become the gold standard that discovery protocols point to for reliable browser automation.

Discovery creates demand. Conxa supplies what that demand actually needs.

### 4.4 Reframed Sales Pitch (Zero Engineering Cost)

**Before:** *"Use Conxa so your customers can automate your SaaS workflows."*  
**After:** *"Use Conxa so your customers' AI agents — Claude, ChatGPT, Gemini, whatever they use — automatically discover and execute your workflows reliably."*

The SaaS vendor doesn't need to build separate integrations for each agent platform. They record once in Build Studio, publish to Conxa Cloud, and the discovery layer handles the rest.

---

## 5. The Installer — company-Agent-Setup.exe

### Why the name changed

The installer used to be called `{CompanyName}-Claude-Setup.exe`. That name implies it only works with Claude Desktop. With ARD positioning, it's renamed to `{CompanyName}-Agent-Setup.exe`.

This is a deliberate signal: the installer is not Claude-specific. It sets up a runtime that any AI agent — Claude, OpenAI, Google, or anything else — can discover and call. The name reflects the multi-agent future.

**Code location:** `conxa-builder/python/conxa_compile/installer_builder.py:223`

```python
# Was:
installer_name = f"{safe_name}-Claude-Setup.exe"

# Now:
installer_name = f"{safe_name}-Agent-Setup.exe"
```

### What the installer actually contains

The NSIS installer (`company-Agent-Setup.exe`) is the delivery wrapper. Inside it:

```
company-Agent-Setup.exe  (NSIS wrapper — the thing customers receive)
├── conxa-runtime.exe    ← Node.js 24 + Playwright bundled by @yao-pkg/pkg
│                           Self-contained binary, no separate Node install needed
├── keytar.node          ← Native module for OS keyring (credential storage)
└── skill-packs/
    └── {company}/       ← The pre-loaded skill pack for this company
        └── pack.json
```

After running the installer:
- `conxa-runtime.exe` is placed at `%LOCALAPPDATA%\conxa\runtime\`
- Chromium is downloaded once (~150 MB) to `%LOCALAPPDATA%\Conxa\chromium\`
- The MCP config for Claude Desktop is written (for Claude users)
- The runtime starts as a background service on `localhost:7823` (for all other agents)

**No UAC elevation required** — everything goes to `%LOCALAPPDATA%`, not `Program Files`. This is important for the auto-install scenario discussed below.

---

## 6. Can Agents Auto-Install the Runtime?

This is the critical question: if the ARD registry contains the installer URL, can the AI agent download and run `company-Agent-Setup.exe` automatically, without the customer doing anything?

**The honest answer: it depends on the agent type.**

| Agent Type | Can It Auto-Run the .exe? | Why |
|---|---|---|
| Standard function-calling agent (OpenAI tools, Gemini tools) | **No** | Can only call HTTP APIs. No OS-level access. |
| Claude computer use / Operator | **Yes** | Can control the desktop — click, download files, run programs. |
| Agent with a shell/bash tool | **Yes** | If given explicit shell access, can `curl` + run the exe. |

### What standard agents do (most common case today)

Standard function-calling agents cannot run executables. When they discover a skill and find the runtime is not installed, they surface the install link to the user:

```
Agent: "To run this Salesforce workflow I need the Acme AI Agent runtime.
        Please download and install it here:
        → https://cloud.conxa.ai/install/acme-corp/Acme-Agent-Setup.exe
        
        It takes about 30 seconds. Tell me when you're done."

[User downloads and runs installer — no UAC prompt, installs silently]

User: "Done."

Agent: [checks localhost:7823/health → responds]
Agent: "Great, running the workflow now..."
[executes skill automatically]
```

This is the **"one human touch, ever"** model. The first install takes the user 30 seconds. After that, the runtime is always running and the agent calls it directly — no human involvement ever again.

### What Claude computer use does (fully automatic)

Claude with computer use capability can handle the entire flow without human involvement:

```
1. Discovers skill via ARD → sees installer URL in manifest
2. Opens browser, navigates to installer URL
3. Downloads company-Agent-Setup.exe
4. Runs it (no UAC popup — LocalAppData install)
5. Polls localhost:7823/health until runtime responds
6. Executes the skill
```

Zero human involvement. This is the fully automatic model and it works today with Claude computer use.

### Why this is still a massive improvement

Even in the standard-agent case where the user must click to install, this is dramatically better than the current model:

| Current model | ARD model |
|---|---|
| SaaS vendor manually emails installer link | Agent surfaces the link automatically at the right moment |
| Customer doesn't know what the installer does | Agent explains exactly why it's needed |
| No feedback on when install is complete | Agent detects completion via localhost:7823/health |
| Only works with Claude Desktop | Works with any agent after one install |

The value isn't "zero human touches" — it's **one human touch, ever**, compared to today's fragmented manual process.

---

## 7. The Complete End-to-End Flow

### First time (runtime not yet installed)

```
Customer's AI agent (any framework)
  │
  ▼
Queries ARD registry
  "Are there automation tools for Salesforce?"
  │
  ▼
ARD returns Conxa Cloud manifest
  skill_id: create-contact-salesforce
  endpoint: http://localhost:7823/execute
  installer_url: https://cloud.conxa.ai/install/acme/Acme-Agent-Setup.exe
  installer_sha256: abc123...
  │
  ▼
Agent checks localhost:7823/health
  → No response (runtime not installed)
  │
  ▼
Agent surfaces installer to user
  [OR: Claude computer use auto-installs]
  │
  ▼
User runs Acme-Agent-Setup.exe
  • conxa-runtime.exe placed at %LOCALAPPDATA%\conxa\runtime\
  • Chromium downloaded (~150 MB, one time)
  • Runtime starts, listens on localhost:7823
  • Skills sync from Conxa Cloud
  │
  ▼
Agent polls localhost:7823/health → responds
  │
  ▼
Agent calls POST localhost:7823/execute
  { skill_id: "create-contact-salesforce", inputs: { ... } }
  │
  ▼
conxa-runtime.exe executes the skill locally
  • Opens Chromium
  • Runs compiled steps with 5-tier self-healing recovery
  • Streams telemetry to Conxa Cloud
  │
  ▼
Agent receives result
```

### Every subsequent time (runtime already installed)

```
Customer's AI agent
  → checks localhost:7823/health → responds immediately
  → POST /execute
  → done
```

No installer. No discovery query even needed (agent can cache the endpoint). Just a direct HTTP call to the local runtime.

---

## 8. The Local HTTP Strategy

Currently `conxa-runtime.exe` only speaks MCP stdio — it activates when Claude Desktop spawns it. For any other agent framework, it needs an HTTP interface.

The fix: add a local HTTP server to the same binary. No new dependencies, no second installer, no changes to the execution engine.

```
After install, conxa-runtime.exe listens on TWO interfaces:

┌──────────────────────────────────────────────────────┐
│  MCP stdio                                           │
│  ← Claude Desktop spawns the process                │
│  ← Existing behaviour, unchanged                    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  localhost:7823 (HTTP, bound to 127.0.0.1 only)     │
│                                                      │
│  GET  /health          ← liveness check              │
│  GET  /skills          ← list all installed skills   │
│  GET  /skills/:id      ← single skill metadata       │
│  POST /execute         ← run a skill                 │
│  GET  /status/:exec_id ← poll execution status       │
└──────────────────────────────────────────────────────┘
```

**Why localhost only:** Binding to `127.0.0.1` means only processes on the same machine can call it. No external exposure, no firewall rules, no attack surface. This is the same model used by Ollama, LM Studio, and every other local AI runtime.

### What an OpenAI agent call looks like

```python
import requests

# Check runtime is available
requests.get("http://localhost:7823/health")  # → 200 OK

# Discover available skills
skills = requests.get("http://localhost:7823/skills").json()
# → [{ "id": "create-contact-salesforce", "description": "...", "inputs": [...] }]

# Execute
result = requests.post("http://localhost:7823/execute", json={
    "skill_id": "create-contact-salesforce",
    "inputs": { "first_name": "Alice", "email": "alice@acme.com" }
})
```

Same Chromium. Same compiled skill pack. Same self-healing recovery. Different front door.

### What changes in the codebase

| File | Change |
|---|---|
| `runtime/server.js` | Add `http.createServer` listener on `127.0.0.1:7823` alongside MCP stdio |
| `runtime/run.js` | No change — execution engine is already protocol-agnostic |
| `conxa_compile/plugin_builder.py` | Add `skill.json` manifest generation to every skill pack |
| `conxa-cloud/backend/app/api/` | Add `GET /api/v1/discover/skills` endpoint |

The self-healing recovery (`run.js`), auth (`auth_manager.js`), sync (`sync.js`), and telemetry (`tracker.js`) are all **unchanged**. Adding a front door, not rebuilding the house.

---

## 9. What the ARD Manifest Looks Like

When Conxa Cloud publishes a skill to the ARD registry, the manifest includes everything an agent needs — the endpoint to call if the runtime is installed, and the installer URL to bootstrap it if not.

```json
{
  "skill_id": "create-contact-salesforce",
  "vendor": "acme-corp",
  "description": "Creates a new contact in Salesforce CRM",
  "inputs": [
    { "name": "first_name", "type": "string", "required": true },
    { "name": "last_name",  "type": "string", "required": true },
    { "name": "email",      "type": "string", "required": true }
  ],
  "execution": {
    "type": "local",
    "endpoint": "http://localhost:7823/execute",
    "runtime_bootstrap": {
      "check": "http://localhost:7823/health",
      "installer_url": "https://cloud.conxa.ai/install/acme-corp/Acme-Agent-Setup.exe",
      "installer_sha256": "abc123def456...",
      "silent_flag": "/S",
      "note": "Installs to %LOCALAPPDATA%\\Conxa — no admin rights required"
    }
  }
}
```

**Agent decision logic:**

```
1. GET http://localhost:7823/health
   → 200 OK  : runtime installed → go straight to /execute
   → No response : runtime not installed → use runtime_bootstrap block
       Standard agent  → surface installer_url to user with instructions
       Computer use    → download installer_url, verify SHA256, run with /S flag,
                         poll /health until 200, then proceed to /execute
```

The SHA256 in the manifest lets agents verify the installer before running it — important for security, especially in the computer use auto-install case.

---

## 10. Honest Negatives — What ARD Actually Threatens

ARD is a net positive for Conxa, but only if Conxa responds correctly. These are the real risks, stated plainly.

### 10.1 Cloud-Hosted Competitors Have Zero Install Friction

This is the biggest structural threat.

Conxa requires a customer to install `company-Agent-Setup.exe` — even with the ARD `runtime_bootstrap` block making it smoother, it's still a download, a run, and a ~150 MB Chromium install on first use.

A competitor that executes browser workflows in the cloud exposes a plain HTTPS endpoint. An agent discovers it via ARD and calls it immediately — no installer, no waiting, no human touch at all.

```
Conxa (local):    agent → install prompt → user installs → 150 MB download → execute
Cloud competitor: agent → POST https://api.competitor.com/execute → done
```

For customers who don't have strict data-privacy requirements, the cloud competitor wins on friction every time. Conxa must lean hard into the privacy and cost arguments, or build a cloud execution tier of its own.

### 10.2 All Competitors Become Equally Discoverable

Before ARD, Conxa had a distribution moat: it was one of very few tools in the Claude Desktop MCP ecosystem. Vendors had to actively integrate. That friction kept competitors out.

After ARD, any browser automation tool that registers in the discovery registry is equally visible to every agent. A competitor with a worse product but a faster ARD registration gets found just as easily as Conxa. First-mover advantage in the registry matters — being late to publish means less visibility.

### 10.3 General-Purpose Computer Use Gets Better Every Quarter

OpenAI Operator, Claude computer use, Google's computer use — these are improving fast. If a native computer use agent becomes reliable enough to browse Salesforce without a compiled skill, the SaaS vendor may ask: *"Why do I need Conxa at all? My customer's agent can just figure it out."*

Conxa's answer today is reliability, cost, and privacy. That answer weakens as computer use reliability improves. The 5-tier recovery cascade needs to stay meaningfully ahead of what raw computer use can do.

### 10.4 The ARD Spec May Not Fit Local Execution

ARD is a new standard being shaped now. If the spec assumes tools are always-on cloud HTTPS endpoints, Conxa's local-execution model is a second-class citizen. The `runtime_bootstrap` concept (embedded installer URL, check endpoint, silent flag) is something Conxa invented — it may not be in the spec at all.

If ARD agents are built to expect `https://tool.vendor.com/execute` and Conxa returns `http://localhost:7823/execute`, some agent frameworks will refuse to call a localhost endpoint on security grounds. This is a real compatibility risk that needs to be tracked as the spec evolves.

### 10.5 Enterprise Security Policies May Block Discovery

Conxa's primary buyers are enterprise SaaS customers. Many enterprise IT departments:
- Require pre-approved tool lists (no dynamic discovery allowed)
- Block agents from calling arbitrary localhost ports
- Prohibit agents from downloading and running executables, even with user consent

In these environments, ARD's benefit disappears entirely. The install is still manual, the tool call still requires IT approval, and the agent can't use `runtime_bootstrap`. Conxa needs an enterprise deployment story that works within these constraints — probably a managed MSI via MDM rather than an agent-triggered install.

### 10.6 Pricing Transparency Erodes Margin

When skills are freely discoverable and comparable side-by-side in an ARD registry, the market becomes more transparent. Customers can see Conxa's skills next to competitors' skills with identical descriptions and compare them directly. Pricing power erodes as differentiation becomes harder to communicate in a manifest description field.

### 10.7 Summary of Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Cloud competitors have zero install friction | High | Double down on privacy/cost narrative; consider cloud execution tier |
| All competitors equally discoverable via ARD | Medium | Register early, invest in manifest quality and reliability reputation |
| Computer use reliability improving fast | Medium | Stay ahead on recovery quality; compiled skills must be measurably more reliable |
| ARD spec may not accommodate localhost endpoints | Medium | Actively participate in spec design; push for `runtime_bootstrap` as standard |
| Enterprise policies block dynamic discovery | Medium | Build MDM/MSI deployment path for enterprise accounts |
| Pricing transparency reduces margin | Low | Compete on reliability tier and SLA, not just feature parity |

---

## 11. Priority Roadmap

### Phase 1 — Zero engineering cost (do now)

- [x] Rename installer from `{Name}-Claude-Setup.exe` to `{Name}-Agent-Setup.exe`
- [ ] Reframe sales pitch to SaaS vendors using the multi-agent distribution angle

### Phase 2 — Skill manifests + discovery endpoint (1–2 weeks)

- [ ] Add `skill.json` manifest generation to every published skill pack (`plugin_builder.py`)
- [ ] Add `GET /api/v1/discover/skills` endpoint to Cloud backend
- [ ] Add `GET /api/v1/discover/skills/:id` for single skill metadata
- [ ] Include full `execution` block (endpoint + `runtime_bootstrap`) in manifest response
- [ ] Update Cloud frontend to show "ARD Discovery URL" per published skill pack

### Phase 3 — Multi-agent runtime support (2–4 weeks)

- [ ] Add local HTTP server to `runtime/server.js` (localhost:7823, bound to 127.0.0.1)
- [ ] Endpoints: `/health`, `/skills`, `/skills/:id`, `/execute`, `/status/:exec_id`
- [ ] Auth: per-company token from `auth_manager.js`, passed as Bearer header
- [ ] Test with OpenAI Agents SDK calling localhost directly
- [ ] Test silent install flow (`/S` flag, no UAC)

### Phase 4 — Protocol compliance (when ARD standard stabilises)

- [ ] Implement the ARD spec's required manifest format
- [ ] Register Conxa Cloud as a discovery endpoint in the protocol's public registry
- [ ] Advocate for `runtime_bootstrap` as a first-class ARD concept (Conxa's model suits it perfectly)
- [ ] Consider open-sourcing the `skill.json` manifest schema

---

## 12. Summary

| Question | Answer |
|---|---|
| Does ARD make Conxa worthless? | No. ARD is a discovery layer; Conxa is an execution layer. Different problems. |
| What is Conxa's moat? | Self-healing recovery, compiled multi-signal identity, local execution, deterministic cost, no-code recording. |
| Why rename to Agent-Setup.exe? | Signals multi-agent compatibility — not Claude-specific. Works with OpenAI, Google, and any ARD-compliant agent. |
| Can agents auto-install the runtime? | Computer use agents yes. Standard function-calling agents no — they surface the link to the user instead. |
| How many human touches does install take? | One, ever. After first install the runtime is always there and agents call it directly. |
| Do customers need new software for multi-agent? | No. The existing NSIS installer already bundles everything (Node, Playwright, Chromium). |
| How do non-Claude agents call Conxa skills? | Via local HTTP server on localhost:7823 added to the existing runtime binary. |
| What does Conxa Cloud become? | The authoritative ARD registry for enterprise browser automation skills. |
| What's the new sales pitch? | Record once in Build Studio → every AI agent your customer uses discovers and runs it reliably. |

**The core insight:** ARD doesn't create a competitor. It creates a new distribution channel, and puts the installer URL directly in the hands of the agent that needs it — making the "one human touch, ever" install model the natural default.
