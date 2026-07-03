# Conxa — A Brutally Honest Review, In Plain Language

**Date:** 2026-07-03
**Who this is for:** Founders and investors deciding whether Conxa can become a big, category-defining company.
**How to read it:** This report deliberately plays devil's advocate. It assumes Conxa will fail, and then checks whether the evidence proves otherwise. It does not defend the product. It only suggests fixes that are big and fundamental — no band-aids.
**Based on:** The project's own documents (`PRD.md`, `TRD.md`, `cost_model.md`, `Implementation-Plan.md`) and the actual code.
**Updated 2026-07-03:** This version incorporates the founders' responses to four of the original criticisms: (1) installers **will be digitally signed**; (2) the vendor target is **small and mid-sized SaaS companies**, for whom maintaining an official connector is more hassle than maintaining Conxa skills; (3) recordings are **generalized by design**, and websites that are too dynamic per user are **excluded from automation by policy**; (4) **non-technical people can't configure MCP by hand** — it feels like coding — so Conxa's one-click installer that sets up Claude automatically is a feature, not just a risk. Each response is weighed in place, and the risk ratings have been adjusted where the answer genuinely moves the needle.

---

## 1. The Short Version

Conxa's engineering is genuinely good. The business built around it is standing on shaky ground.

Think of Conxa as three things:

1. **A "recorder + compiler"** — a human does a task in the browser once (say, "create a new lead in a CRM"), and Conxa turns that recording into a smart, reusable "skill" that remembers many different ways to find each button, so it keeps working even when the website changes a bit. This part is genuinely clever — better than what classic automation tools (RPA) do.
2. **A "player"** — a small program installed on the end user's computer that replays those skills through Claude Desktop, and tries to self-repair when something on the page has moved.
3. **A business model** — SaaS companies record skills for their own product and ship them to their customers as an installer.

The problem: parts 1 and 2 (the technology) are strong. Part 3 (the business model) has four big cracks, and all four need to hold for the company to win:

1. **Big SaaS companies don't need Conxa — so the real vendor market is smaller companies.** A large SaaS company that wants to be "AI-operable" already owns its own code; building an official AI connector is a small job for it. **The founders' answer:** that is exactly why Conxa targets **small and mid-sized SaaS vendors** — teams with no spare engineers, for whom building and *maintaining* an official connector forever is more hassle than re-recording a workflow now and then. That's a fair narrowing, and it changes the risk from "no market" to "a smaller, unproven market": smaller vendors also sign smaller contracts, and the end-customer friction (point 3) is the same regardless of vendor size. Downgraded from Critical to High — the next step is proving small vendors will actually pay (§11.1).
2. **A recording made on one account may not work on another customer's account.** **The founders' answer:** recordings are generalized by design — a skill stores many independent ways to find each element (label, role, test-id, nearby text), not fixed positions — and websites that render too differently per user are simply **not automated; they're out of scope by policy.** That converts a broken-promise risk into a narrower-market decision. What's still open: everyday differences like plans, languages, and permissions are normal SaaS behavior, not exotic dynamism, so the generalization claim still needs the cheap real-world test in §11.2. Downgraded from High to Medium-High.
3. **Companies' IT departments will distrust the install — less so once it's signed.** **The founders' answer:** installers will be digitally signed. That removes the single scariest red flag (Windows itself warning against the download). A second founder point cuts in Conxa's favor here too: non-technical users *can't* set up MCP tools by hand — it means editing a JSON config file, which feels like coding — so an installer that configures Claude automatically is a genuine feature for the end user. The friction is with IT departments, not with the user's fingers. The rest of the checklist — a program that edits Claude's settings, holds logged-in browser sessions, and updates itself, with no SSO or SOC 2 yet — still needs the trust program in §11.6.
4. **The market gap Conxa fills is shrinking from both directions.** More software vendors ship official AI connectors every month, and AI models are getting better at just using websites directly without any pre-recorded skill. This one has no founder answer yet, and it's the clock everything else runs against.

**The honest verdict:** The founders' answers narrow two of the four cracks and close part of a third — the thesis is now "small and mid-sized SaaS vendors, on not-too-dynamic websites, with signed installers." That is a more defensible position than the original pitch, but it is narrower, and its two load-bearing claims (small vendors will pay; recordings generalize across their customers' accounts) are still unproven. The *same technology*, aimed at **companies stuck using software they don't control and can't get an API for**, remains the strongest fit on the evidence — ideally pursued alongside, not instead of, the SMB-vendor thesis.

### The risk list at a glance

| # | Risk | How bad? | Getting better or worse? |
|---|---|---|---|
| R1 | Big vendors have a better native path; the small/mid-size vendor market Conxa now targets is real but smaller and unproven | **High** *(was Critical — narrowed by the founders' SMB focus)* | Needs market proof |
| R2 | Official connectors + smarter AI are squeezing Conxa's niche from both sides | **Critical** | Getting worse |
| R3 | A skill recorded on one account may break on other accounts | **Medium-High** *(was High — overly dynamic sites excluded by policy; generalization claimed but untested)* | Test it now |
| R4 | Enterprise IT won't trust the installer and security setup | **High** *(signing is committed — the rest of the checklist remains)* | Fixable, but slowly |
| R5 | Everything depends on Claude Desktop, which Conxa doesn't control | **High** | Getting worse |
| R6 | Logins, MFA codes, and expiring sessions break unattended automation | **High** | Getting worse |
| R7 | A half-finished run can leave a real business system in a broken state | **High** | Staying the same |
| R8 | Execution is slow and limited to one run at a time per computer | **Medium-High** | Staying the same |
| R9 | Automating *other people's* websites can violate their rules and trigger bot-blockers | **Medium-High** | Getting worse |
| R10 | "Teach once, run forever" quietly becomes "re-record every time your UI changes" | **Medium** | Staying the same |

---

## 2. What Conxa Actually Is (Without the Marketing)

Strip away the pitch, and Conxa works like this:

> A person at a software company opens Conxa's Build Studio, records themselves doing a task — like "add a new employee in the HR system" — clicking through the real website. Conxa watches every click and saves *lots* of information about each button: its label, its position, nearby text, a screenshot, its role on the page. That becomes a "skill file." The company then packages that skill into an installer and gives it to their customers. The customer installs it, and now their Claude Desktop has a new ability: "add a new employee." When Claude runs it, a browser opens on the customer's computer and replays the steps — and if a button has moved, Conxa tries several backup ways to find it before asking Claude for help.

The key insight of this report: **the recorder/compiler is the valuable invention. The distribution business wrapped around it is the weak part.** Most of the bad news below is about the business; most of the salvage value is in the technology.

---

## 3. The Biggest Question: Which SaaS Vendors Actually Need Conxa?

### 3.1 A concrete example — why *big* vendors don't need it

Imagine **AcmeCRM**, a large, well-staffed SaaS company. They want their product to "work with Claude." They have two options:

**Option A (Conxa):** Someone at AcmeCRM records workflows like "create a lead" in Build Studio, tests them, publishes them, and ships an installer to every customer. Every customer must be on Windows, install the exe, have Claude Desktop, and burn their own Claude subscription messages running it. When AcmeCRM redesigns their UI next quarter, some skills drift or break, and someone at AcmeCRM must re-record and republish.

**Option B (do it themselves):** AcmeCRM's website *already* talks to their own servers through internal APIs — every button click in their product calls one. One engineer takes those five or six internal endpoints and wraps them in an official MCP connector (the standard way to plug tools into Claude). In 2026 this is roughly a one-to-two-week job with well-worn templates. The result: customers click "connect AcmeCRM" in Claude — no installer, no browser windows, answers in under a second, and it never breaks when the UI changes because it doesn't use the UI at all.

**A founders' objection here:** "non-technical people don't know how to configure MCP — it's like coding." That's true, but only for *locally installed* MCP tools, where setup means hand-editing a JSON config file — a genuine wall for normal users. It's not true for Option B as a vendor would actually ship it: a vendor-**hosted** connector shows up in Claude as a "Connect" button with a normal login screen. No file editing, no installer, nothing that feels like coding. So the objection doesn't rescue the big-vendor pitch — but it *does* point at something real about Conxa's own product, covered in §3.3: since Conxa's runtime *must* live on the user's machine (local execution is the whole point), someone has to do that scary JSON configuration — and Conxa's installer doing it automatically is exactly the right design for a non-technical audience.

For a company with engineers to spare, Option B is faster for the customer, safer for the security team, and cheaper to maintain. Big vendors will always take Option B.

### 3.2 The founders' answer: small and mid-sized vendors are the target

The founders' response to this criticism: **Option B is only "a small job" if you have someone to do it.** A 10–50 person SaaS company has a roadmap backlog and no platform team. And an official connector is not a one-time job — it has to be documented, supported, kept secure, versioned, and updated every time the product changes. For that segment, the founders argue, **maintaining an API connector forever is more hassle than maintaining Conxa skills** — a product manager can re-record a workflow in an afternoon, no engineer required.

This is a fair and coherent narrowing, and it deserves to be taken seriously. What it buys, and what it leaves open:

**What the answer buys:**
- A real segment with a real pain: small vendors get the same "does your product work with Claude?" question as big ones, and today their honest answer is "no, and we can't spare anyone to fix that." Conxa turns that into an afternoon of recording.
- The "no engineering headcount" pitch is genuinely true for this buyer, in a way it never was for large vendors.

**What it leaves open:**
- **Skill maintenance isn't free either** (§8.2). The honest comparison isn't "maintain an API vs. do nothing" — it's connector upkeep vs. re-record-and-republish upkeep every time the vendor's own UI changes. For a product that ships UI changes weekly, re-recording may lose that comparison. Nobody has measured either side for this segment yet.
- **The bar for Option B keeps dropping.** Even small SaaS products are built on internal APIs, and MCP scaffolding tools get easier every quarter. The hassle gap Conxa lives in is itself shrinking (this is risk R2 wearing a different hat).
- **Smaller vendors sign smaller contracts**, so the revenue math needs more of them — which raises the weight on distribution and end-customer friction (§3.3), which vendor size does nothing to reduce.

**Net effect:** the "no market" verdict was too strong. The corrected verdict is: *a smaller, plausible, unproven market.* Risk R1 drops from Critical to High, and the top commercial priority becomes proving that small vendors will pay and stay (see §11.1).

**Separately, the customer who needs Conxa unconditionally** still exists: an insurance company filing forms daily on a clunky government portal with no API. A retailer managing 40 supplier websites, none of which will ever build an integration. A bank ops team in a 15-year-old internal tool nobody maintains. Those buyers have *no* Option B at any company size. They remain the strongest fit on the evidence and should be pursued in parallel, not dropped.

### 3.3 The end-customer side is even harder

Even if AcmeCRM signs up, look at what each of their customers must do:

- Be on Windows (there's no Mac version yet).
- Have Claude Desktop installed.
- Run a vendor-branded installer. (The founders have committed to digitally signing these — that removes the "Windows warns you before opening" moment, though corporate IT policies may still block unfamiliar publishers until the certificate builds reputation.)
- Let that installer edit Claude Desktop's configuration file. (**The founders' point in its favor:** this is a genuine kindness. Setting up a local MCP tool by hand means finding and editing a JSON config file — which non-technical people rightly experience as coding, and simply won't do. Conxa's installer handling it automatically, including detecting the different config locations Windows uses, is the correct design for this audience. The tension is that the *user's* convenience is exactly what the *IT department* reads as "software silently modifying another program's settings" — see §7.)
- Pay for every run out of their own Claude subscription. A Claude Pro user gets roughly 45 messages per 5-hour window; by Conxa's own cost math, one workflow run that needs AI-assisted repairs can eat 2–4 of them. Run a few workflows and your Claude allowance for the afternoon is gone.

Every customer, every machine, every link in that chain has to hold. Compare that to Option B's "click connect."

---

## 4. Where Official APIs and Connectors Will Always Win

This isn't about Conxa's code quality. These are limits of the *medium* — driving a website will always lose to calling the software directly on these dimensions, no matter how good the automation gets:

| What matters | Official API / connector | Conxa | Why Conxa can't fix it |
|---|---|---|---|
| **Speed** | Under half a second | ~6–8 seconds *per step* (Conxa's own measurements), so a 15-step workflow takes **1.5–2 minutes**, plus browser startup | You have to load and render a whole webpage just to click one button. Conxa even adds deliberate small delays to seem human. |
| **Knowing what went wrong** | The server tells you exactly: "error: duplicate email" | Conxa has to *guess* from what the page looks like afterward | A contract tells you the truth; a screen only shows you a picture. |
| **Safety of retries** | APIs support "do this exactly once" guarantees | Clicking "Submit" twice might create two invoices | The browser has no undo and no receipt. |
| **Half-finished work** | Operations are all-or-nothing | If step 9 of 15 fails, the target system is left half-updated (e.g., an employee created in HR but not payroll) | Websites have no "roll back everything" button. |
| **Running many at once** | Thousands of parallel calls from a server | One browser, one run at a time, on one person's laptop — which sleeps, locks, and goes offline | Conxa's own (good) security rule says the cloud never executes. |
| **Reading data** | Clean structured data | Text scraped off a screen — "1.234,56 €" instead of a number, lists cut off by scrolling | The screen was made for eyes, not programs. |

**The one place Conxa genuinely wins today:** compared to sending an AI agent to figure out a website from scratch every single time. Conxa's numbers back this up — a clean pre-compiled run costs about 1,200 tokens, versus tens of thousands for an AI exploring live. That's a real advantage. The question (section 9) is how long it lasts.

**The rule that falls out of this:** wherever a decent API or official connector exists, Conxa loses. Conxa's true market is only the leftover: valuable workflows, in software the buyer can't change, that nobody will ever build an integration for. That market is real — but it's smaller than "the universal execution layer for AI," and it's shrinking.

---

## 5. Where the Technology Itself Could Fail

Even inside its rightful niche, there are ways the design can be defeated.

### 5.1 The recording was made on one account — customers run it on different accounts

This is the single most dangerous technical assumption. A concrete example:

> AcmeCRM records "create a lead" on their internal demo account — English language, Enterprise plan, admin permissions, sample data. Now the skill runs at a customer in Germany, on the Starter plan, logged in as a regular user, with 50,000 real records.
>
> - The "Advanced Options" button the recording clicks **doesn't exist** on the Starter plan. No amount of clever element-finding helps — the button genuinely isn't there.
> - Every label says "Neuen Lead erstellen" instead of "Create new lead," so all the text-based backup signals fail, and the stored screenshot of the English button actively misleads the vision-based repair.
> - The customer is in an A/B test group with a redesigned layout the vendor's demo account never sees.
> - The regular user's permissions hide two menu items the admin recording relied on — *correctly* hidden, not broken.
> - The dropdown that had 5 sample entries now has 5,000 and loads as you scroll, so "the item is the 3rd one down" is meaningless.

Conxa's self-repair system was built to survive a website *drifting over time*. It was not built for a website that is *systematically different for every customer from day one*. And when the AI-assisted repair (Tier 3/4) does patch a step, the fix is throwaway — by design the skill file is never modified locally, so **the same customer pays the same repair cost, in tokens and ~15 extra seconds, on every single run** until an admin at the vendor manually publishes a fix.

**The founders' answer comes in two parts:**

1. **"Recordings are generalized."** True in an important sense: a skill doesn't store "click at pixel 400,300." It stores many independent descriptions of each element — its accessibility role, its label, its test-id, nearby text, its rough position — and at run time it works through them in order of durability. Ordinary changes (a button restyled, moved, or re-ordered) genuinely are absorbed by this. That's the system's core strength and it's real.
2. **"Websites that are too dynamic per user, we don't automate."** A scoping policy: if a product renders very differently per user, it's simply out of scope.

**How much do these answers resolve?** Partially. The generalization design handles *drift* — the same element, changed. Several of the examples above are not drift: a button that **doesn't exist** on the Starter plan, a label that reads **"Neuen Lead erstellen"** in German (which defeats the text and label signals *and* the stored English screenshot at the same time), a menu item a viewer-role user **correctly can't see**. No amount of signal redundancy finds an element that isn't there. And the scoping policy helps only if "too dynamic" is defined honestly: plan gating, localization, and role-based menus aren't exotic dynamism — they're **standard behavior in ordinary SaaS products**, including the small vendors Conxa now targets. If those count as "too dynamic," the addressable market shrinks a lot; if they don't, the generalization claim has to carry them.

**Net effect:** the risk drops from "core promise likely broken" to "a narrower envelope plus an unproven claim" — Medium-High instead of High. The good news is unchanged: this is cheaply testable *right now* (see recommendation 11.2), and running that test would either validate the founders' claim with data or tell them exactly where the "we don't automate that" line needs to be drawn. Either outcome is worth more than any argument in this document.

### 5.2 The smartest repair tiers depend on Claude behaving a certain way — which Conxa doesn't control

When a step fails and the free, built-in repairs (Tiers 1–2) don't work, Conxa's runtime doesn't fix things itself. It sends a "help me" package back to Claude — a screenshot plus a list of what's on the page — and *hopes* Claude reasons about it and calls the skill again with a corrected instruction, within a 3-minute window while the broken page is kept alive.

That means the top half of the famous "self-healing" system is actually **Claude's behavior, not Conxa's code.** If Anthropic ships a Claude Desktop update that handles tool responses differently — shortens big results, adds a confirmation step, or changes how the model responds to such requests — Tier 3 and 4 could quietly stop working **on every installed machine at once**, and Conxa can't fix it from their side. And in the "scheduled, unattended automation" future the pitch imagines, there may be no attentive Claude conversation available to respond at all.

### 5.3 Clicking the wrong thing and calling it success

The scariest failure isn't a workflow that stops — it's one that **finishes confidently after doing the wrong thing.** Example:

> The "Delete" button for the *right* row can't be found (the page changed). The repair system searches for something close... and finds the "Delete" button on the *wrong* row. It clicks. The post-step checks pass — a confirmation dialog appeared, just like expected. The run reports: ✅ success.

This isn't hypothetical — the project's own bug history includes exactly this class of error (the accessibility-name ordering bug, where repair could click a neighboring element). In the use cases Conxa advertises — payroll, invoices, CRM records — a wrong-but-confident action happening even 0.1% of the time across a fleet of customers is a data-corruption incident and a lost reference customer. APIs fail *loudly and safely* ("error: not found"); browser automation can fail *silently and destructively*. The repair system, whose whole job is to find "something close" when the exact target is missing, makes this *more* likely, not less. There's currently no special "dangerous step" mode (e.g., extra verification or mandatory confirmation before irreversible actions).

### 5.4 No undo

Related: a 15-step workflow that dies at step 9 leaves real half-finished work behind — an invoice uploaded but never submitted, a user account created in one system but not the other two. Conxa can *resume* from a checkpoint, but nothing can *undo*. Every serious buyer of workflow automation asks "what happens when it fails halfway?" — and for browser automation there is no general answer. This quietly limits Conxa to workflows that are safe to leave half-done or safe to redo — another cut to the addressable market.

### 5.5 The login problem — the classic RPA killer

Skills deliberately contain no passwords (a correct decision). But that means every run needs an *already-logged-in* browser session on that machine. So:

- Who logs in the first time? A human, by hand, on each machine.
- What happens when the session expires? Corporate logins often expire daily. The run fails until a human logs in again.
- What about MFA codes, or passkeys, or "verify it's you" prompts? These are *specifically designed* to stop exactly this kind of unattended automation — and they're becoming more common every year, especially on the old, long-tail systems that are Conxa's best targets.

The realistic answer today is "a human keeps re-logging-in on every machine" — which caps how *unattended* this automation can ever be. And unattended is the whole economic point. This is the problem that has operationally killed browser-RPA deployments for a decade, and Conxa's docs are nearly silent on it.

### 5.6 Everything stands on Claude Desktop — someone else's product

Count the dependencies on one company:

- The installer works by editing **Claude Desktop's config file** (whose location and format Anthropic can change any time — it already varies by how Claude was installed).
- Skills only run when **Claude Desktop** invokes them.
- The repair brain is **the customer's Claude subscription**.
- The customer's cost of running skills is measured in **Claude message allowances**, which Anthropic can reprice or redefine at will.
- And Anthropic itself ships Skills, computer-use, and agent features — meaning the platform owner is also the most likely future competitor.

One config format change, one policy decision to sandbox local tools, or one first-party "record a browser workflow" feature from Anthropic is a company-level emergency for Conxa. MCP is an open standard and other apps support it, but nothing in Conxa's current product treats any host other than Claude Desktop as real.

---

## 6. Speed and Scale — The Numbers

Using Conxa's own measurements:

- **A clean 15-step workflow: about 1.5–2 minutes**, plus browser startup. The API version of the same task: 1–3 seconds. To a person watching Claude Desktop, a two-minute silent browser session per task doesn't feel like "AI-native" — it feels like the old RPA robots with a new coat of paint.
- **Each AI-assisted repair adds ~15–25 seconds** and costs the customer ~3,000 tokens of their own Claude allowance.
- **Throughput ceiling:** one run at a time, per machine, funded by message allowances (~45 per 5 hours on Claude Pro). "Thousands of runs per day" — what enterprise automation actually means — is simply not reachable on laptops running Claude Desktop. Conxa's rule that "the cloud never executes" is a genuine trust advantage *and* a hard ceiling on scale. Both are true at once; the docs only celebrate the first.
- **Cloud plumbing debt (fixable, not fatal):** installers are stored as text-encoded blobs inside the database, there's no CDN, and "delta sync" currently re-sends everything. Fine for an MVP; all rework at a few hundred customers.
- **A small credibility note:** the docs contradict each other in places this review noticed in an afternoon — one doc says device registration is a missing "High" gap while another marks it done; one says the payment provider is Razorpay, another says Cashfree. Harmless individually, but investor due-diligence will find the same things, and it reads as process sloppiness.

---

## 7. Would a Company's Security Team Ever Approve This?

Conxa's best security decision is real: **customer data never passes through Conxa's cloud during execution.** Everything runs locally. That's a genuinely better story than the cloud-RPA incumbents. But almost everything around that good decision currently undermines it:

1. **The installer's behavior — not just its signature — looks suspicious to security software.** The founders have committed to digitally signed installers, which removes the loudest red flag (an unknown, unsigned publisher). That's a real improvement and worth shipping early. But walk through what remains, as a security analyst would: a program installed per-user without admin approval, that edits an AI assistant's configuration, downloads scrambled (obfuscated) JavaScript that updates itself, drives a browser holding live logged-in sessions, and sends telemetry home. Endpoint-security tools flag *behavior patterns*, and signing doesn't change the behavior. "Installed without admin rights" also isn't a convenience to IT — it means it *bypasses their approval process*, which they call shadow IT. To be fair (the founders' fourth answer): the config editing exists *for* the non-technical user, who could never set up an MCP tool by hand — the design intent is good UX, not stealth. But security teams evaluate mechanisms, not intentions, and the fix that satisfies both audiences is the same either way: enterprise packaging (MSI/Intune) that lets IT do the deploying, so the home-user convenience path and the managed-fleet path stop being the same installer.
2. **Session custody.** The runtime keeps logged-in browser sessions for business systems on employees' machines. They're encrypted — fine — but the security team's real questions are: can we revoke one machine remotely? (No.) Does each user have their own identity? (No — one shared token per company is baked into every copy of the installer, so one leaked installer is a company-wide issue.)
3. **The enterprise checklist is empty.** SSO login, fine-grained roles, compliance certifications (SOC 2 isn't mentioned anywhere in the docs), on-premise option — all parked in "Phase 3," i.e., not started. Enterprises won't fleet-install credential-holding automation from a vendor without SOC 2 and SSO. That's roughly a year of unglamorous work, minimum, and it gates the exact customers who'd pay the most.
4. **Where does the data go?** Compile-time screenshots of the product (which can contain business data) flow through Conxa's cloud to third-party AI providers. Run telemetry flows to Conxa's servers. Both defensible — but there's no written data-processing agreement, retention policy, or regional storage story. For the payroll/invoice use cases in the pitch, this alone stalls procurement.
5. **The rules-of-the-site problem.** For the enterprise use case (automating *other companies'* websites), many sites' terms of service forbid automated access, and commercial bot-blockers (Cloudflare and friends) actively detect Playwright, the browser engine Conxa uses. Conxa's "human-like pacing" feature — random small delays to seem human — reads, uncharitably, as bot-detection evasion. That's an arms race Conxa cannot win and an awkward legal posture for an enterprise vendor. Note the trap: the one customer with *no* terms-of-service problem (a vendor automating its own site) is the customer who doesn't need Conxa; the customer who needs Conxa inherits the problem.

**Bottom line for this section:** enterprises *could* come to trust the model — local execution is the right story. But not this artifact, this year. The gap splits into two halves (costed in detail in §11.6): a **paperwork half** — code signing and SOC 2 — that is genuinely cheap and fast for a company this size (~$15–40k and mostly calendar time: signing in weeks, SOC 2 Type II in 6–12 months, helped by the thin-cloud architecture keeping the audit boundary small), and an **engineering half** — SSO, per-device identity with remote revocation, MSI/Intune packaging — that is real roadmap work. Started in parallel today, both halves land in roughly a year. The risk isn't difficulty; it's starting late while the market squeeze (section 9) keeps tightening.

---

## 8. Can Browser Automation Ever Feel as Seamless as a Native Integration?

**No — and the reasons are physics, not effort.** "Native-feeling" means: instant, invisible, precise, safe to retry, always available. Browser automation is: minutes not milliseconds, a visible browser doing things, screen-scraped guesses, risky to retry, and only available when a logged-in session exists on an awake Windows machine. Conxa has genuinely narrowed the *reliability* gap versus old RPA. The speed, undo, and availability gaps belong to the medium itself and cannot be closed.

The honest pitch isn't "as seamless as native." It's **"infinitely better than nothing, for software that offers nothing."** That's a real pitch — for the right customer.

### 8.1 A catalog of things that break it

Real-world situations, grouped by what they defeat:

**The element-finding system has nothing to grab:**
- Apps drawn on a canvas instead of built from normal page elements — Google Sheets' grid, Figma, many dashboards. There are no buttons "in" the page to find; only the vision fallback remains, and its output (a selector) has nothing to attach to.
- Long lists that only create rows as you scroll — the target row literally doesn't exist in the page until scrolled to.

**The action system can't perform the move:**
- Anything involving the operating system's own dialogs: choosing a file to upload, save-as dialogs, print dialogs. Those live outside the webpage entirely.
- Drag-and-drop, sliders, drawing, rich text editors, fiddly custom date pickers.
- Flows that open new tabs or popup windows (including "log in with Google" popups).

**The replay assumes the world looks like it did at recording time:**
- Data-driven branching: the recording assumed "click the first search result" or "the warning dialog doesn't appear." At a customer with different data, the path itself is different — and conditional logic ("if X, do Y") isn't built yet.
- Surprise interruptions: cookie banners, "What's new!" popups, onboarding tours the recording never saw. Some get dismissed automatically; a novel one is an unplanned step.

**The environment fights back:**
- The laptop sleeps, locks, or Windows Update restarts it mid-run.
- Antivirus quarantines the bundled browser or flags the runtime's behavior (the committed code signing helps with reputation, but antivirus reacts to what a program *does*, not only to who signed it).
- A CAPTCHA appears. Game over by design — no tier can or should solve it.

**The repair system itself:**
- A button that was *removed on purpose* (feature discontinued): the system burns its full ladder of retries plus a paid AI repair attempt *on every run*, converging on nothing, until a human at the vendor republishes.
- The wrong-element-success problem from §5.3 — the only failure that's worse than failing.

None of these alone is fatal. Together they define the honest product envelope: **form-filling and record-keeping workflows, in ordinary web apps, single window, on an awake, logged-in Windows machine.** Every sale outside that envelope becomes a support fire.

### 8.2 "Teach once, run forever" quietly inverts

Here's the real maintenance loop: the vendor redesigns part of their UI → skills across the fleet start drifting → the free repairs absorb some, paid AI repairs patch some (at the customers' token cost), some fail → drift reports pile up in a review queue → **a human at the vendor** reviews, re-records, and republishes → the fleet heals. That's a permanent, recurring maintenance duty for the vendor — the exact cost the pitch says disappears ("no new engineering headcount"). It didn't disappear; it moved, into a currency (ops attention) that vendors always under-budget. To be fair: keeping the republish step human-approved is the *right* call — auto-pushing unreviewed fixes to a fleet would be worse. But it means the system is really *self-diagnosing*, not *self-healing*.

---

## 9. The Long-Term Squeeze — Why Time Is Not on Conxa's Side

### 9.1 The web is getting harder to automate

Year over year: more apps rendered on canvas, more scrambled machine-generated code, more aggressive bot defense, more passkeys and MFA. Each trend removes another stable handle for the recorder to hold onto. Conxa's multi-signal design is the right hedge against elements *drifting* — it is no hedge against whole categories of signal *disappearing*.

### 9.2 The pincer movement

This is the central strategic fact. Conxa lives in the gap between two frontiers, and both are moving inward:

- **From above:** every month, more software vendors ship official MCP connectors. Ironically, the trend Conxa's pitch cites as "why now" (MCP becoming the standard) is the same trend that shrinks Conxa's market — and it eats the *best* workflows first, because vendors build integrations for their most valuable flows.
- **From below:** AI models get cheaper and better at just *using* websites cold, with no recording. Conxa's edge today is a cost ratio — ~1,200 tokens for a compiled run versus tens of thousands for live exploration. Cost-ratio advantages against frontier AI progress have short lifespans. The day a frontier agent can run an unseen 15-step workflow reliably for a nickel, the pre-compiled skill is overhead, not advantage. Tellingly, **Conxa's own design already concedes this at the margin** — when a compiled skill fails, its answer is to hand the problem to a live AI agent (Tier 3/4).

What survives the pincer is what *neither* side reaches: software whose owners will *never* integrate (legacy, government, abandoned, hostile), plus buyers who need determinism and audit trails that free-roaming agents can't promise (regulated back-office work). That's a real market. It is **not** "the universal execution layer between AI agents and all software," and the long-term "npm-style marketplace of skills" vision has a timing problem: a marketplace matters at scale only in exactly the future where the pincer has already closed.

**The one asset that could outrun the squeeze:** Conxa's fleet generates something nobody else has — real-world data on *how live websites actually change* and *which identity signals survive which kinds of redesign*, at scale, across many apps. Today that data is kept in per-company silos and used only for a manual review queue. Aggregated, it becomes a compounding advantage that even frontier models don't have — and it stays valuable *even in the live-agent future* (sell the knowledge of how UIs drift, not just the replay). Today's architecture deliberately doesn't build it.

### 9.3 And the platform owner looms over everything

Anthropic controls the host app, the config file, the message allowances, the repair brain, and — through its own Skills and computer-use products — the adjacent product space. Supporting other MCP hosts is cheap insurance the roadmap doesn't contain. First-party competition from Anthropic is the risk no insurance covers.

---

## 10. The Assumptions Audit

For Conxa-as-pitched to become category-defining, **all** of these must be true:

| Assumption | Honest assessment |
|---|---|
| Small/mid-sized SaaS vendors find maintaining Conxa skills less hassle than maintaining an official connector | **Plausible but unproven** (§3.2) — the founders' strongest argument; needs paying-customer proof, and the honest upkeep comparison (connector vs. re-recording) has never been measured |
| A skill recorded on one account works on every customer's account | **Claimed by design (generalized signals) and scoped by policy (dynamic sites excluded) — still untested** (§5.1); testable *this quarter* |
| End customers accept the install + pay-with-your-own-Claude-allowance model | **Untested; friction is severe** (§3.3) — signing helps the install moment, not the allowance cost |
| Enterprises will trust the current artifact within the competitive window | **Not this year** (§7) — signing is committed, which shortens the list; SSO, SOC 2, and per-device identity remain (~1–2 years) |
| The no-API niche stays big through 2028 | **Doubtful** (§9.2) |
| Claude Desktop stays a stable, friendly host, and Anthropic doesn't compete | **Outside Conxa's control** (§9.3) |
| Unattended login (MFA, expiring sessions) is solvable well enough | **Doubtful, and getting worse** (§5.5) |
| Compiled skills stay meaningfully cheaper than live AI agents | **True today; eroding** (§9.2) |

A startup can survive one or two "doubtful"s. This table has no solid "true and durable" in any load-bearing row.

---

## 11. What To Actually Do (Fundamental Moves Only)

In priority order. No band-aids — these change the trajectory.

### 11.1 Name the two bets explicitly — and stop selling to big vendors

The founders' answer (§3.2) reshapes this recommendation from "flip the customer" to "sharpen the segmentation into two named bets, each with its own proof":

- **Bet 1 — small and mid-sized SaaS vendors** (the founders' thesis). For this to be real, it needs a commercial milestone, not an argument: a handful of paying SMB vendors, retained through at least one of their own UI-redesign cycles, with the actual upkeep cost (re-record hours per month) measured and compared against what a connector would have cost them. If the retention and upkeep numbers hold, this bet graduates from plausible to proven.
- **Bet 2 — enterprises automating third-party software they can't control** — the insurance company on the government portal, the retailer on 40 supplier sites. This buyer has no alternative at any company size (there is no API), controls their own machines (IT installs the runtime once, killing the per-end-customer friction), and actively values Conxa's real strengths (local execution, audit trails). This remains the strongest structural fit and deserves at least equal weight.

What should be explicitly *dropped* is the large-vendor pitch — for them Option B always wins, and every sales hour spent there is wasted. Sharpening the PRD around these two named segments is exactly the kind of company-level shift that justifies rewriting it.

### 11.2 Run the make-or-break experiment now

The riskiest assumption (§5.1) is cheap to test: get 3 design partners, record 5 workflows each on one account, then run them on 3+ *different* accounts (different plan, language, user role). Measure how many succeed on the first try and how often they need paid AI repair. This experiment now does double duty: it either **validates the founders' generalization claim with data**, or it tells them precisely where the "too dynamic — we don't automate that" line has to be drawn, turning that policy from a slogan into a measurable acceptance rule (e.g., "products with per-plan UI gating need one calibration run per customer"). If the numbers are bad, that's not a failed experiment — it's the most valuable strategic fact available. Everything else on the roadmap is downstream of this number.

### 11.3 Build the data moat you're currently throwing away

Every repair and drift event across the fleet is a data point about how real websites change and which element signals survive. Today it's siloed per company. Aggregate it (scrubbed, cross-company) and feed it back into compilation — durability scores *learned from the fleet* instead of hand-tuned. If Conxa gets a lasting advantage, it's "the company that empirically knows how the web's UIs change" — not "the company with a recorder." This asset even survives the live-agent future.

### 11.4 Add a "dangerous step" mode

Classify steps at compile time by consequence: read-only / reversible / irreversible. Irreversible steps (submit payment, delete record, send email) get stricter rules: exact-match-only element finding (no "something close" repairs), a verification that the thing acted on is the thing intended (not just "a dialog appeared"), and optionally a confirmation pause. This turns the silent wrong-click failure (§5.3) from invisible into gated — and it's the feature that lets regulated buyers say yes. API competitors don't need this; Conxa does. Shipping it first is differentiation, not overhead.

### 11.5 Don't bet the company on one host app

MCP is an open standard. Make the runtime work with at least one host that isn't Claude Desktop — Claude Code headless, an open-source MCP host, or a small Conxa-built scheduler that can trigger skills without any chat app. One move fixes three problems: it removes the single-vendor kill switch, it enables truly scheduled/unattended runs that don't depend on someone's chat session and message allowance, and it gives the repair tiers a Conxa-controlled fallback brain (a metered API key) instead of relying purely on the customer's desktop Claude. Execution still stays 100% local — only the *thing that presses play* diversifies.

### 11.6 Treat the trust checklist as the critical path, with a deadline

The checklist: code signing (already committed), SOC 2 Type II, SSO, per-device identity with remote revocation (replacing the one-shared-token-per-company design), proper enterprise packaging (MSI/Intune), and a written story for where telemetry and screenshots go and how long they're kept. None of it is intellectually exciting; all of it gates the customers from 11.1.

**How hard is this, actually? Less hard than it sounds.** The checklist splits cleanly into a cheap, fast "paperwork half" and a slower "engineering half":

| Item | Difficulty | Rough cost | Time | Nature |
|---|---|---|---|---|
| Code signing | Easy — a purchase plus CI wiring | ~$300–600/yr | 1–4 weeks | Purchase |
| SOC 2 Type I | Moderate — mostly policy discipline | ~$12–25k | 2–4 months | Paperwork |
| SOC 2 Type II | Moderate — the mandatory observation window *is* the cost | ~$15–40k total, first year | 6–12 months | Paperwork + patience |
| SSO/SAML in the product | Real engineering | eng time | months | Engineering |
| Per-device identity + remote revocation | Real engineering (replaces the shared token design) | eng time | months | Engineering |
| MSI/Intune enterprise packaging | Real engineering | eng time | weeks–months | Engineering |

Notes that matter:

- **Code signing is a purchase, not a project.** Buy an EV certificate (~$300–600/yr — EV matters because it earns Windows SmartScreen reputation fastest, and the whole pitch involves non-technical users double-clicking installers). The one gotcha: since 2023 signing keys must live in hardware, so CI signing needs a cloud signing service (Azure Trusted Signing, DigiCert KeyLocker, SSL.com eSigner, or SignPath) rather than a USB token. And because Conxa's *product generates installers* for vendors, signing must happen inside the build pipeline, not as a manual step. Start this month; there is no dependency blocking it.
- **SOC 2 is process, not genius.** A compliance automation platform (Vanta, Drata, or the India-friendly Sprinto) at ~$7–20k/yr auto-collects most evidence from the existing stack (Render, Vercel, GitHub, Clerk), plus an auditor at ~$5–20k. Type I ("controls existed on this date") is achievable in ~3 months and opens sales doors; Type II ("controls operated over a 3–12 month window") is what security teams actually accept, and its observation window is irreducible calendar time — which is precisely why the clock should start now, not when the first enterprise deal demands it.
- **Conxa has a genuine scoping advantage.** SOC 2 audits a defined system boundary, and Conxa's cloud is deliberately thin — customer workflow execution and data never touch its servers. A small boundary ("coordination cloud: hosting, billing, telemetry") means a smaller, cheaper audit than a typical SaaS company faces. The local-execution architecture that is Conxa's best trust story also shrinks its audit surface. One caveat to prepare for: auditors and buyers *will* probe the compile-time path, where vendor screenshots flow through the LLM proxy to third-party AI providers — have the data-flow diagram and retention policy written before they ask.
- **Buyers outside the US often ask for ISO 27001 instead.** ~80% overlap, same platforms handle both — decide based on where the first ten enterprise conversations actually happen before paying for two audits.

**The realistic sequencing:** signing now (weeks) → compliance platform + policies now → SOC 2 Type I around month 3 → Type II observation window starts immediately after → Type II report around month 9–12, landing at roughly the same time as the engineering half (SSO, device identity, MSI packaging) if that work starts in parallel. The original "~2 years" fear in earlier drafts of this analysis was really about the engineering half plus certificate/reputation aging — the paperwork half is ~$15–40k and discipline. If the target includes enterprises, this isn't "Phase 3" — it's the path, and the only way to lose is to start late.

### What this report deliberately does NOT recommend

- **A cloud execution tier.** It would fix the scale ceiling and it's the obvious investor-friendly move — and it would destroy the "your data never touches our servers" story that is Conxa's only structural advantage over the RPA incumbents, while inheriting their entire compliance burden. Accept the ceiling; price around it.
- **Auto-publishing drift fixes to the fleet.** The human-approval gate is correct. Auto-pushed, unreviewed fixes are how the wrong-click risk (§5.3) becomes a headline incident.
- **Fighting bot detection harder.** Unwinnable arms race, reputationally corrosive. State the envelope honestly instead.

---

## 12. The Bottom Line

Conxa's engineering answers the question *"can recorded browser skills be made far more durable than old-school RPA?"* — and the answer is a credible yes. But that was never the question that decides the company. The deciding questions are:

- **Who rationally buys this instead of the native path?** Big vendors: nobody — they'll build their own connector. Small and mid-sized vendors: plausibly, per the founders' argument that connector upkeep is the bigger hassle for them — but that's an argument today, not a proven market. Enterprises stuck with API-less software: yes, unconditionally.
- **Does one recording work across all the accounts it's sold to?** Claimed by design (generalized signals) and by policy (overly dynamic sites excluded) — still untested. The cheap cross-account experiment (§11.2) settles it either way; run it now.
- **Will enterprise IT install and trust it?** Signing is committed, which removes the loudest objection. The rest of the checklist — SSO, SOC 2, per-device identity, behavior-based flags — still stands between here and a fleet install.
- **Does the niche outlive the squeeze from official connectors above and smarter AI below?** Probably not at "category-defining" size — and this is the one crack with no founder answer yet.

The company the evidence supports is narrower than the original pitch but more real: **signed, locally-executing, audit-first automation — sold to small and mid-sized vendors who genuinely can't spare the engineers, and to enterprises stuck with software that will never have an API — on websites that pass an honest "not too dynamic" test, with a fleet-learned dataset of how UIs change as the compounding asset.** Smaller story than "the universal execution layer." Much higher chance of existing in five years. And it uses everything already built.

Two proofs stand between the founders' answers and a fundable thesis: paying small-vendor customers who stay through a UI-redesign cycle, and cross-account success numbers from the §11.2 experiment. Both are achievable this quarter. Until then, the answers are good arguments — and arguments are what this report was written to test.
