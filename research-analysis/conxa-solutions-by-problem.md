# Conxa — Every Problem, Every Solution (Founder's + Fable's)

**Date:** 2026-07-03
**What this is:** A companion to `conxa-critical-analysis.md`. That file tells the story of the whole review. **This file is simpler:** it takes each of the 10 problems one at a time, and for every problem it lays out — in plain words, with real examples — *both* the founders' solution and Fable's (my) solution. Read this when you want to see, side by side, every idea we have for fixing each problem.

**How to read each section:**
- **The problem** — what's wrong, with an everyday example.
- **What the founders say** — the founders' answer(s), in easy language, with an example.
- **What Fable says (my answer)** — my own answer(s), including brand-new ideas, with an example.
- **Where it stands** — how serious it still is, and whether the fix is built yet.

A quick note on who answered what: most problems have a founder answer *and* a Fable answer that build on each other. Two of them (P7 and the "connector squeeze" part of P2) were answered by Fable at the founders' request, because they were the hardest technical questions — I'll say so plainly where that's the case.

---

## Problem 1 — Big software companies don't really need Conxa

### The problem
A software company that wants its product to "work with Claude" already owns its own code. It can build an official connector (a proper AI plug-in built on its own internal system) fairly easily. So why would it record browser workflows in Conxa and maintain them forever instead?

**Example:** "AcmeCRM" is a big, well-funded company. One of their engineers can wrap their existing internal system in an official Claude connector in a week or two. That connector is faster, never breaks when the screen changes, and needs no installer. For a company like AcmeCRM, Conxa loses.

### What the founders say
**Solution: don't sell to the big companies — sell to the small and mid-sized ones.** A 10–50 person software company is completely different from AcmeCRM. They have no spare engineer; everyone is busy building the product. And a connector isn't a one-time job — it needs documentation, login handling, version updates, and support *forever*. For that small team, recording a workflow in Conxa in one afternoon is genuinely easier and cheaper than building and babysitting a connector for years.

**Example:** "InvoiceLite" is a 15-person startup. Their 3 engineers are buried in the product roadmap. A customer asks, "Does this work with Claude?" Today their answer is "no, sorry." With Conxa, a product manager (not even an engineer) records "create an invoice" in an afternoon and ships it. That's the whole pitch, and for InvoiceLite it's true.

**A second founder point (helps here too):** normal people can't set up an MCP tool by hand — it means editing a technical config file, which feels like coding. Conxa's installer does that automatically. So Conxa isn't just recording workflows; it's also the thing that makes those workflows *installable by a non-technical person* — which a small vendor can't easily build themselves.

**A third founder decision:** Mac versions are coming. Small-company and startup users skew heavily toward Macs, so supporting Mac roughly doubles the reachable end users.

### What Fable says (my answer)
**Solution: make it almost free for a vendor to find out if Conxa fits, and let the product sell itself. (NEW idea.)** Instead of paying salespeople to argue "you need us," publish a **free self-serve scanner**: a vendor pastes their product's web address, logs in, and in five minutes gets an "AI-operability score." Everyone who runs it is a warm lead who has *already seen their own good score* — much easier to sell to. And every scan quietly tells Conxa which kinds of products fit best.

Pair it with a **"Works with Claude" badge** the vendor can display on their website. Small companies buy *marketing wins* faster than they buy *tools* — the badge is a reason to sign up that has nothing to do with engineering.

**Example:** InvoiceLite's founder sees a tweet, runs the free scanner on their own product, gets a green "highly operable" score, and immediately puts a "Works with Claude" badge on their pricing page to look modern to their customers. They've become a customer before a single sales call.

### Where it stands
Severity dropped from **Critical → High.** The idea is sound; what's missing is proof — real paying small vendors who stay. The scanner and badge are candidate new build items.

---

## Problem 2 — The market is being squeezed from both sides

### The problem
Conxa lives in a gap: workflows that have no official connector yet, but that an AI can't reliably do on its own. That gap is shrinking from **two directions at once**:
- **From above:** every month, more software vendors ship official connectors — and each one deletes a chunk of Conxa's market (the most valuable workflows first).
- **From below:** AI models keep getting better at just using websites directly, with no pre-recorded skill.

**Example:** Today Conxa is the best way to make "SupplierPortal" work with Claude. Next year SupplierPortal ships its own connector (squeeze from above). Meanwhile, AI models get good enough to just navigate SupplierPortal live without any recording (squeeze from below). Conxa's spot in the middle gets thinner.

### What the founders say
**Solution A — the "below" squeeze: enterprises want deterministic, trackable execution, not a guessing AI.** Even if AI gets amazing at using websites, a bank or hospital will *not* let an improvising AI click buttons in their systems. They want the exact same steps, in the same order, every time, with a full log they can audit. A pre-recorded Conxa skill does exactly that; a live AI agent invents a fresh path each run and can confidently do the wrong thing.

**Example:** A bank needs "approve loan application." With Conxa's **Strict Mode**, it runs the identical 8 steps every time and writes a log: step 1 did X, step 2 did Y. With a live AI, you get a slightly different path each run and no guarantee. The bank picks the boring, predictable one every time. (Bonus: Conxa's runtime already has the switch that turns AI off during a run — it just needs to be packaged and named "Strict Mode.")

**Supporting point:** AI models were trained on the public web, not on software hidden behind company logins. So on old, ugly, unusual internal systems — exactly Conxa's best targets — live AI is weakest.

**Supporting point:** latency (slowness) is partly an engineering problem — Conxa can get 2–3× faster by trimming artificial delays. And for scheduled overnight work, nobody's watching the clock anyway.

**Solution B — the "above" squeeze (answered by Fable at the founders' request):** four reasons the connector wave is slower and less total than it looks:
1. **The long tail never gets fully covered.** People predicted "everyone will build integrations" for 25 years and it never happened. Zapier spent ~15 years making integration as easy as possible and still only covers ~8,000 apps out of tens of thousands. Below business software sits a whole layer (legacy systems, internal tools) that will *never* integrate.
2. **Connectors give you single actions; customers need whole workflows.** A real job crosses several apps and uses screens the connector never exposes. If a 5-app workflow needs 5 connectors and even one is missing, the whole thing falls back to the browser — and Conxa wins it.
3. **Connectors rot.** The build is cheap; the *upkeep* (year 5: login changes, versioning, support tickets) is what kills them. Small vendors abandon integrations all the time.
4. **Turn the threat into money — the "graduation path."** When a vendor finally outgrows browser automation, that's normally lost business. Instead: a Conxa recording is basically the blueprint for the connector, and Conxa's recorder can watch the network calls behind each step — so Conxa can *generate* the official connector for the vendor as a paid upgrade, and keep running the same governed skill on top of it. Churn becomes an upsell.

**Example:** A vendor's Conxa skill has run 10,000 times. Conxa offers: "Want to turn this into a fast, official connector? We'll generate it from your recording." The vendor pays *more*, not less, and stays.

### What Fable says (my answer)
**Solution: own the "skill contract," not the engine underneath it. (NEW idea.)** Define a Conxa skill as a *governed recipe* — the steps, the inputs, the safety checks, the audit trail — and make the thing that actually *executes* it swappable. Today the engine is browser replay. After graduation it's an official connector. Someday it might be a frontier AI model. **All three run the same recipe.** If Conxa owns the recipe-and-governance layer, it doesn't matter which engine wins the race — Conxa sits above all of them.

**Example:** Think of Conxa like a "recipe card" for a task. Today the recipe is cooked by a browser. Tomorrow by a connector. The day after by an AI chef. The customer always buys *Conxa's recipe and quality guarantee* — the kitchen equipment underneath can change without the customer caring. That way, no matter which "kitchen" wins, Conxa still sells the recipes.

### Where it stands
Severity dropped from **Critical → High.** Both squeezes now have real answers. It stays High until the graduation path is actually built (it's currently a plan, not a product).

---

## Problem 3 — A skill recorded on one account may not work on another customer's account

### The problem
The vendor records a workflow on *their* account, but it has to run on *every customer's* account. Different customers see different screens — different plan, language, and permissions.

**Example:** The vendor records "Create Lead" on their English, admin, top-tier demo account. Then it runs at a German customer on the cheapest plan, logged in as a regular (non-admin) user. Now: the button labels are in German, the "Advanced Options" button doesn't even exist on the cheap plan, and two menu items are hidden because this user isn't an admin. The recording assumed a screen the customer doesn't have.

### What the founders say
**Solution (two parts): recordings are generalized, and we don't automate the wild cases.**
1. **Generalized:** a skill doesn't memorize "the button is at position X." It stores *many* ways to find each button (its label, its role, nearby text, a screenshot). So ordinary differences — a button restyled, moved a bit, or renamed slightly — are handled automatically.
2. **Out of scope by choice:** if a product shows *wildly* different screens to different users, Conxa simply won't automate it. That's a deliberate policy, not a bug.

**Example:** If the "Save" button is blue on one account and green on another, or moved to the other side of the screen, generalization handles it fine. But if the whole page is a different shape per customer, that product just isn't a Conxa product.

*(My honest note as Fable: this half-works. Restyled buttons, yes. But "the button doesn't exist on the cheap plan" and "the labels are in German" aren't restyling — they're normal software behavior, and generalization alone won't catch them. That's why my solution below matters, and why the real-world test in the main report is the top priority.)*

### What Fable says (my answer)
**Solution: check the customer's own account first, then keep learning it. (NEW idea — "per-tenant learning overlay.")**
- **First-run calibration:** before the skill's first *real* run, the runtime quietly walks through it on the customer's own account in a safe, no-changes way — checking that each button actually exists, learning the local (German) labels, and taking fresh screenshots. If something's missing ("Advanced Options not found — probably a plan difference"), it flags it *before* the customer ever hits a failure.
- **Then keep learning:** after every successful run, the runtime updates its local notes for *that* account — which buttons worked, what the labels really say. The signed skill file is never changed; a small local "adjustment layer" adapts it to this specific customer and gets sharper each run.

**Example:** A skill's very first run on the German account is a bit shaky. But by its tenth run, the runtime has learned "on this account, 'Save' is 'Speichern' and lives in the top-right," and runs it flawlessly. The skill doesn't just *survive* being on a strange account — it slowly *tunes itself* to that account, and the data can prove it's improving.

### Where it stands
Severity dropped from **High → Medium-High.** The design story is reasonable, but it genuinely needs the real-world cross-account test (recorded on one account, run on several different ones) to prove it. That test is the #1 priority in the main report.

---

## Problem 4 — Company IT departments will distrust the installer

### The problem
Conxa's installer does things that security software is trained to flag: it's a program installed without admin approval, it edits another app's settings (Claude's config), it downloads scrambled code that updates itself, it holds logged-in browser sessions, and it sends data home. To an IT security team, that pattern *looks* like malware, even though it isn't.

**Example:** An enterprise IT reviewer sees "unknown program, installs itself without admin rights, modifies another app's config, auto-updates with obfuscated code." Their checklist lights up red, and they block it — regardless of how good Conxa actually is.

### What the founders say
**Solution: sign the installer.** Digital signing removes the scariest moment — the big "Windows doesn't recognize this program, are you sure?" warning. On Mac it's mandatory (an unsigned app won't even open). This is the cheapest, fastest trust win available.

**Example:** Before signing: the customer double-clicks and Windows shouts a scary warning; half of them bail. After signing: it opens cleanly with the vendor's name on it, like any normal app.

**Related founder point:** the auto-configuration (editing Claude's settings for you) is a *good* thing for the non-technical end user — they'd never do it by hand. The friction is only with IT departments, and that's solved by giving IT a proper enterprise install package.

*(Honest note: signing fixes the "who made this?" question. It does not fix the "what does it do?" question — security tools also judge behavior. So signing opens home and small-business doors; big enterprises still need the rest below.)*

### What Fable says (my answer)
**Solution: be radically transparent where it's cheap. (NEW idea.)**
- **Publish a short security whitepaper.** Conxa's architecture has a genuinely great security fact — customer data never touches Conxa's cloud during execution. Say that loudly and clearly.
- **Open-source the safety-critical parts of the runtime** — the bits that find elements, do recovery, and encrypt sessions. Then a security team can *read the actual code* that runs on their machines instead of trusting a claim. Conxa's real value isn't hidden in those files anyway (it's in the compiler, the fleet data, and the distribution) — so there's little to lose and a lot of trust to gain.
- **Give IT an admin console:** show them what's installed where, let them remotely disable or wipe a machine (a "kill switch"), and provide a proper enterprise install package.

**Example:** Instead of Conxa saying "trust us, the runtime is safe," a bank's security team downloads the open-source runtime code, reads it themselves, sees the kill switch in their admin console, and approves it. The conversation flips from "prove you're not malware" to "here's the source code and here's your off-switch."

### Where it stands
Severity stays **High** — signing is committed (real progress), but the bigger items (SOC 2 certification, single-sign-on, per-device identity) are still ahead. Good news: none of it is hard, it's mostly time and money (about a year, ~$15–40k). The main report has the full cost breakdown.

---

## Problem 5 — Everything depends on Claude Desktop

### The problem
Conxa currently plugs into Claude Desktop specifically. That's one company's product. If Anthropic changes how it works, or competes directly, Conxa is exposed.

**Example:** If a Claude Desktop update changes its config format or adds restrictions, Conxa could break on every customer's machine at once — with no way for Conxa to fix it from their side.

### What the founders say
**Solution: it's not really locked to Claude — MCP is an open standard, so any MCP-capable AI agent can connect. Claude is just where we start.** The runtime speaks a common language (MCP) that ChatGPT's desktop app, Cursor, and other tools also speak. Nothing about the *architecture* chains Conxa to Claude.

**Example:** Just like a USB device works with any computer that has a USB port, a Conxa skill can in principle work with any AI app that "has an MCP port." Claude is the first one plugged in; others can follow.

*(Honest note: true in principle, but a few things are Claude-only *today* — the installer only sets up Claude's config, and the smart-recovery step is tuned to how Claude behaves. So it's a small amount of engineering to make "any agent" actually true, not just theoretically true. And it doesn't stop Anthropic from *competing* — only from *locking you in*.)*

### What Fable says (my answer)
**Solution: build Conxa's own tiny launcher so it never *needs* any chat app at all.** Add a small Conxa tray app / command-line tool with a built-in scheduler. Then Conxa can run skills entirely on its own, and every chat app (Claude, ChatGPT, Cursor) becomes an *optional* front door rather than a dependency.

**Example:** A customer wants "generate the sales report every morning at 6 a.m." — no human, no chat window open. Conxa's own little launcher fires the skill on schedule. Claude Desktop isn't even running. Now Conxa isn't *depending* on Claude; it's *offering* Claude as one convenient way in.

### Where it stands
Severity dropped from **High → Medium-High.** The lock-in worry is fixable with modest engineering. The competition worry (Anthropic building this itself) can't be "fixed" — only outrun with speed and the fleet-data advantage.

---

## Problem 6 — Expired logins, MFA, and passkeys interrupt automation

### The problem
Conxa skills don't store passwords (correct and safe). But that means the browser has to *already be logged in* for a skill to run. Logins expire. And MFA (those 6-digit codes) and passkeys are *designed* to stop automated logins.

**Example:** A skill is scheduled for 3 a.m. But the login expired at 2 a.m. At 3 a.m. the skill opens the browser, finds it logged out, and fails — and stays failed until a human logs in again in the morning.

### What the founders say
**Solution: when the login expires, the person just signs in again at the next run.** This is the accepted design, not a gap to engineer away. No honest product can (or should) get past MFA automatically.

**Example:** A user runs a skill, the runtime notices the session is dead, opens the login page, the user signs in (30 seconds), and the skill continues. It's the same quick interruption every app on their computer occasionally does.

*(Honest note: this works fine for a person sitting at their laptop. For unattended overnight runs on a server, it becomes a "log the machines in each morning" chore — which is exactly how professional automation teams already operate, so enterprises find it familiar. But it does cap how truly "hands-off" the overnight pitch can be.)*

### What Fable says (my answer)
**Solution: use the fact that in Conxa's model, the vendor *owns the login system*. (NEW idea.)** Everyone treats login expiry as an unchangeable outside wall — but Conxa's chosen customer *owns the software being automated*. So the vendor can simply *configure* longer-lasting, device-locked sessions for their own automation traffic. The wall that stops browser automation everywhere else is largely self-imposed here, and the vendor can turn it down for their own app.

Plus two smaller things: the **session keeper** (detect a dead login *before* the skill starts, not halfway through, and ask the user to sign in up front), and **learning each app's login lifetime** so the runtime prompts a re-login at the start of the workday instead of failing at 3 a.m.

**Example:** InvoiceLite issues special 30-day, device-bound sessions for their own Conxa runner machines. Now the overnight runs just work for a month at a time, because InvoiceLite chose to allow that for their own product. No hacking around MFA — just the owner of the app setting a sensible policy for their own automation.

### Where it stands
Severity dropped from **High → Medium-High.** For people-at-laptops it's basically solved. For overnight server runs it's a manageable routine, and the vendor-controlled-session idea can shrink it further.

---

## Problem 7 — A wrong click can succeed silently, and there's no undo

### The problem
The worst failure isn't a skill that stops — it's one that confidently does the *wrong thing* and reports success. And once a real action happens (delete, submit, pay), there's no undo.

**Example:** The skill can't find the "Delete" button for the right invoice (the page changed), so its recovery system finds a Delete button that's *close* — on the **wrong invoice's** row. It clicks. A confirmation dialog appears, just like expected, so every check passes. The skill reports ✅ success. The wrong invoice is now deleted, and nobody knows.

### What the founders say
The founders set the context (vendors build the installer their customers use) but asked **Fable** to design the technical answer to this one, because it's the hardest safety question. So the solution here is Fable's — see below. *(In short: the founders own the "what" — this must be safe for finance/HR/payroll — and asked me for the "how.")*

### What Fable says (my answer)
**Solution: a five-layer safety system that makes wrong actions rarer than a human's, and limits the damage when something still slips.**
1. **Label every step by how dangerous it is** — "just looking" vs. "reversible" vs. "irreversible" (delete/submit/pay). The vendor confirms these while recording.
2. **Tie the action to the actual data, not just the button (the key layer).** Instead of "I found *a* Delete button," require "I found the Delete button *in the row that contains Invoice #12345* — this run's actual invoice." The wrong row doesn't contain #12345, so clicking it becomes *impossible*, not just unlikely.
3. **On dangerous steps, refuse to guess.** For irreversible actions, turn *off* the "find something close" recovery — because "something close" is exactly what you must never delete. If it can't find the exact target, it stops. Optionally it pauses and asks: "About to delete the row with Invoice #12345 — confirm?"
4. **Do the scary click last, and offer a dry run.** Record workflows so all the typing happens first and the one irreversible click is the final step — then a failure earlier just leaves a harmless draft. And a "dry run" (do everything except the final click) becomes possible, which also makes the first-run check from Problem 3 completely safe.
5. **Cleanup workflows instead of undo.** True undo is impossible for *everyone* (even connecting 3 apps by API can't roll all 3 back if the last one fails). The standard fix is a "compensating action" — and in Conxa's world that's just another recording: a small "cancel the draft invoice" cleanup the runtime offers if a run dies halfway.

Plus: **before/after screenshots on every dangerous step**, so if something does go wrong, the vendor sees exactly what happened, when, and to which record.

**My addition — publish the number.** Track and show a real safety score per skill: "0 wrong actions in 12,400 runs." Measured safety is a sales weapon; claimed safety is just marketing.

**Example:** With entity binding on, the "wrong invoice deleted" story from above simply can't happen — the runtime refuses to delete any row that doesn't contain Invoice #12345. And the honest benchmark isn't perfection; it's *the human doing this by hand*, who misclicks more often and leaves no screenshots. Conxa can beat that and prove it with numbers.

### Where it stands
Severity dropped from **High → Medium-High** (and to **Medium** once it's built). It stays permanently a little above zero only in the narrowest sense: a truly committed action can't be un-committed — by anyone.

---

## Problem 8 — Execution is slow and one-at-a-time per computer

### The problem
A skill runs about 6–8 seconds per step, so a 15-step workflow takes 1.5–2 minutes. And only one runs at a time on a machine. "Thousands of runs a day," which is what real enterprise automation means, seems out of reach.

**Example:** An operations team needs to process 2,000 invoices a day. At ~2 minutes each, one machine running them one-by-one can't come close.

### What the founders say
**Solution: it's an engineering problem — fix it with parallel runs and dedicated machines.**
1. **Run several at once per machine.** The browser can run multiple isolated sessions side by side, so one computer can do 3–5 runs at a time instead of 1.
2. **Use dedicated "runner machines."** A company sets up always-on machines (VMs) that never sleep, stay logged in, and run skills on a schedule. This is exactly how the big automation companies (like UiPath) deliver "robots that work overnight," so enterprises already understand and trust the model. Ten such machines × 4 parallel runs × 24 hours ≈ thousands of runs a day — **and Conxa's cloud still never touches the data**, because the machines belong to the customer.

**Example:** The 2,000-invoice team sets up 5 always-on runner machines, each doing 4 invoices at once, around the clock. Now they clear the backlog easily — on their own hardware, with their data never leaving their building.

*(Honest note: one thing still can't be matched — instant "burst." An API can absorb 10,000 requests in one second; runner machines are capacity you set up in advance. So Conxa scales to big steady volume, but not to sudden spikes.)*

### What Fable says (my answer)
**Solution: the pool and runner machines (above) plus one smart rule — run different apps in parallel, but the same app one-at-a-time.** The runtime should automatically avoid running two skills against the *same* application at once (which could cause them to trip over each other), while freely running *different* apps in parallel. This makes conflicts impossible by design instead of by luck.

Also: **cut the fake "human-like" delays** on verified-owned sites. Because the vendor allowlists their own runtime (see Problem 9), there's nobody to hide from — so drop the artificial slowdowns and take the free 2–3× speed-up.

**Example:** The runner farm happily processes CRM tasks and HR tasks at the same time, but automatically lines up two "edit the same CRM record" jobs to run one after another, so they never overwrite each other. And since these are the vendor's own sites, the runtime stops pretending to be a slow human and just goes fast.

### Where it stands
Severity dropped from **Medium-High → Medium.** Mostly buildable engineering. The one hard limit (instant burst) is real but rarely what these customers actually need.

---

## Problem 9 — Automating other companies' websites can break their rules and trigger bot-blockers

### The problem
Automating a website you don't own often violates that site's terms of service, and commercial bot-blockers (like Cloudflare) actively try to detect and block automated browsers.

**Example:** If Conxa were used to automate a bank's public website that the user doesn't own, that could break the bank's rules, and the bank's bot-blocker might detect and ban the automation — an unwinnable cat-and-mouse game.

### What the founders say
**Solution: we only automate software the vendor *owns*, and we enforce it with domain verification.** Since Conxa's customers automate *their own* product, the whole problem largely disappears — you can't break your own rules, and you can tell your own bot-blocker to allow your own automation. Domain verification (prove you own the website, the same way Google Search Console makes you prove it via a DNS record) means a vendor can only publish skills for sites they actually control.

**Example:** InvoiceLite verifies they own `invoicelite.com`, then publishes skills only for that site. Their own Cloudflare is set to wave their own runtime through. There's no sneaking, no rule-breaking, and no arms race — because they own the building they're automating. Verification also protects Conxa itself: nobody can use Conxa's tools to build skills that attack a bank's website.

*(Honest note: the trade-off is that automating *truly third-party* sites — supplier portals, government sites the customer doesn't own — is now out of scope. That's a deliberate, sensible choice: a clean legal position in exchange for giving up a gray-area market.)*

### What Fable says (my answer)
**Solution: go one step past "allowed" to "openly declared." (NEW idea.)** Give vendors an "automation lane": the runtime sends a clear, signed ID with every request, and the vendor sets up their systems to recognize it as *their own official automation*. Now the traffic isn't just tolerated — it's *identified, controllable, and logged* on the vendor's side too.

**Example:** Every request from InvoiceLite's Conxa runner carries a signed "this is InvoiceLite's own automation" stamp. InvoiceLite's security team can see exactly which traffic is automation, rate-limit it, and audit it. In a security review, "we run a recognized, cooperative, labeled automation channel" sounds far better than "we hope we don't get blocked."

### Where it stands
Severity dropped from **Medium-High → Low.** The domain-ownership rule dissolves most of the problem by construction. Domain verification is a small, high-priority build item.

---

## Problem 10 — "Teach once, run forever" quietly becomes "re-record after every redesign"

### The problem
The promise is "record once, and it runs forever." But every time the vendor redesigns their UI, some skills drift or break, and someone has to notice, re-record, and republish. The maintenance cost didn't disappear — it just moved to the vendor.

**Example:** InvoiceLite ships a redesign of their invoice screen. The next day, some customers' "create invoice" skill starts failing. InvoiceLite has to figure out which skills broke, re-record them, and push updates — an ongoing chore they didn't fully budget for.

### What the founders say
**Solution (the planned tooling): a skill health dashboard and a fast re-record flow.** The vendor gets a live health score per skill, an alert when one starts drifting, and a way to re-record and republish in minutes (with a before/after diff) instead of rebuilding from scratch. This makes the upkeep genuinely small — which is what makes "less hassle than maintaining a connector" true.

**Example:** InvoiceLite's dashboard lights up: "create invoice — health dropped to 60%." They click it, see the changed step, re-record just that step, and republish in ten minutes. Every customer heals automatically on next sync.

### What Fable says (my answer)
**Solution: catch the break *before* it ships — put skill-testing inside the vendor's release process. (NEW idea — "skill CI.")** Because in Conxa's model the vendor *owns the app*, they can test their skills against their own *staging* (pre-release) site automatically on every deploy. Add a "conxa test" step to their build pipeline that dry-runs all published skills; if a redesign would break a skill, **the build fails before it ever reaches customers.**

**Example:** InvoiceLite's redesign is still in staging. Their automated build runs "conxa test," which tries all published skills and reports "create invoice will break." The build fails. A developer fixes it *before* release. Customers never even see a broken day. The loop shrinks from "customers get hurt → dashboard alerts → scramble to fix" to "build fails on Tuesday → fix it → ship Wednesday."

This is something no traditional automation vendor can offer — because their customers don't own the target app. Conxa's customers do. It might be Conxa's single most differentiated feature, and it falls out of the "vendors automate their own product" model almost for free.

### Where it stands
Severity stays **Medium.** The dashboard makes upkeep small; skill CI could make most breaks invisible to customers entirely.

---

## Quick reference — every solution on one page

| Problem | Founders' solution | Fable's solution (NEW ideas marked) |
|---|---|---|
| **P1** Big vendors don't need it | Target small/mid vendors; auto-install is a selling point; Mac support | Free self-serve scanner + "Works with Claude" badge **(NEW)** |
| **P2** Squeezed both sides | Determinism/Strict Mode; models weak on legacy; long-tail history + connector graduation upsell | Own the swappable "skill contract," not the engine **(NEW)** |
| **P3** Won't work on other accounts | Generalized signals; skip too-dynamic sites | First-run calibration + per-tenant learning overlay **(NEW)** |
| **P4** IT distrusts installer | Sign the installer; enterprise packaging | Open-source safety code + whitepaper + admin kill switch **(NEW)** |
| **P5** Depends on Claude Desktop | MCP is open — any AI agent can connect | Conxa's own tiny scheduler/launcher (needs no chat app) |
| **P6** Logins expire / MFA | User re-logs-in at next run | Vendor-controlled long sessions **(NEW)** + session keeper |
| **P7** Wrong click / no undo | (Asked Fable to design it) | Five-layer safe-action system + publish safety score |
| **P8** Slow, one at a time | Parallel runs + dedicated runner machines | Parallel-across-apps / serial-within-app + drop fake delays |
| **P9** Bot-blockers / rules | Only vendor-owned sites + domain verification | Declared "automation lane" recognized by the vendor **(NEW)** |
| **P10** Re-record after redesign | Health dashboard + fast re-record | Skill CI — test skills before release **(NEW)** |

**The big picture:** every one of the 10 problems now has both a founder answer and a Fable answer. Most of them combine into a single stronger fix (for example, on P3 the founders' generalization + my calibration/learning together are much better than either alone). What's left isn't more arguing — it's building the plan and getting the two proofs (paying vendors who stay, and good cross-account test numbers). Full details, costs, and timeline are in `conxa-critical-analysis.md`.
