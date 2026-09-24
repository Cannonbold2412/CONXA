# Jev in Conxa: what it is, where it fits, and what could go wrong

*Research note, 2026-09-24. Nothing here has been built yet. This is a proposal to discuss.*

---

## 1. What is Jev? (the short version)

**Jev** is a new AI model from a San Francisco company called **TypeSafe AI**. It went into limited early access on **15 September 2026**, alongside a $40M seed round.

Most AI models you know, like Claude or GPT, **write text**. You ask a question and they write back an answer word by word. That's slow and costs money, and the answer can come back in the wrong shape.

Jev doesn't write text. It **only makes decisions**. You give it:

1. **Some information** (plain text or JSON), for example a description of a web page.
2. **A question with the allowed answers already listed**, for example "Which of these 40 buttons is the 'Submit invoice' button?"

It returns **one of the answers you allowed**, plus **how sure it is** as a number between 0 and 1.

Think of it like this:

> **Claude is a consultant.** You describe a problem, they think it over, and they write you a report.
> **Jev is a very fast multiple-choice test taker.** You hand it a question with options A–Z, and in a fraction of a second it circles one and writes "I'm 93% sure" next to it.

### The three kinds of question Jev can answer

| Question type | What it does | Conxa-flavoured example |
|---|---|---|
| **Choice** | Pick one option from a list of up to 255 | "Which of these candidates on the page is the 'Save' button we recorded?" |
| **Score** | Place something on a scale (2–10 levels) | "How risky is clicking this button? low / medium / high" |
| **Yes/No** (TypeSafe calls this "Noul") | Probability that a statement is true | "Is this page a login screen?" |

Several questions can go in **one request** against the same information, and Jev answers them all at once.

### The headline numbers (TypeSafe's own claims, not independently verified)

- **Speed:** roughly 70–500 milliseconds per decision (~150 ms typical). A Claude recovery round takes many seconds.
- **Price:** **$0.042 per million input tokens**, and nothing for output. That's roughly 40–400× cheaper than frontier models.
- **Can't return a malformed answer:** it can only give back one of the options you listed.
- **Calibrated confidence:** when it says "90% sure", it's supposed to be right about 90% of the time. That lets software set a rule like "only act if at least 90% sure".

### What Jev can't do

- **It can't write anything.** No selectors, no prose, no code, no plans.
- **It can't invent an answer.** If the right option isn't in your list, it will still confidently pick a wrong one.
- **As far as public docs show, it doesn't read images.** Input is text or JSON, so screenshots are out.
- **It's only as good as the information you give it.** Describe the page from 5 seconds ago and you'll get a confident wrong answer about the page as it is now.
- **It's brand new.** It's early access, closed and proprietary, and nobody has published peer-reviewed tests yet. Commentators are openly asking "it's fast and cheap, but is it *good*?"

There is already an open-source project, **jev-browser** (Apache-2.0, published 17 Sept 2026), that uses Jev to drive a browser. An LLM says *what* it wants ("search for X"), Jev decides *which element, which action, which value*, and Playwright does the clicking. That's very close to Conxa's world, so it's a useful reference design.

---

## 2. Why this matters to Conxa specifically

Conxa already works on a split that matches Jev's pitch almost exactly:

> **Generalize at the planning layer (Claude), stay exact at the execution layer (compiled skills).**

Between "Claude plans" and "the skill executes exactly as recorded" sits a set of **small, repeated, multiple-choice judgments**. Conxa handles them today in one of two ways:

1. **Hand-written rules** (lists of safe words, URL patterns, scoring formulas). These are free and instant, but they're brittle and miss new cases.
2. **A full Claude round-trip** (Tier B recovery, the compile-time "second opinion"). These are smart but slow, and expensive for the customer.

Jev is a **third option in the middle**: nearly as cheap and fast as a rule, and nearly as flexible as a model, but *only* for questions where the answer is one item from a known list.

Many of Conxa's hardest moments are exactly that kind of question:

- *"The button moved. Which of these 60 things on the page is it now?"*
- *"Is this pop-up something harmless to close, or is it asking me to agree to something?"*
- *"Did we just land on a login page, or is this page part of the workflow?"*
- *"Is this recorded step noise, or does it matter?"*

---

## 3. Where Jev could plug into Conxa (ranked by value)

### 3.1 ⭐ Biggest win: a "fast lane" before Tier B recovery (runtime)

**What happens today.** When a step can't find its element, the runtime tries **Tier A** first. Tier A is free and instant, and it fixes *timing* problems ("the button was right, it just wasn't ready"). If that fails, the runtime escalates to **Tier B**. It builds a ranked list of up to ~40,000 characters of page candidates plus screenshots, sends it back to Claude, waits for Claude to pick a candidate number, then double-checks that pick before clicking.

Tier B works, but:
- It costs the **customer's** Claude tokens (text plus images), every time.
- It takes a full back-and-forth with Claude, which means **seconds to tens of seconds**.
- It **only exists when an agent is present.** In the Build Studio test sandbox there is no agent, so a moved button simply fails.

**What Jev would add.** Insert a new step **between Tier A and Tier B**. Call it "Tier B-fast".

```
Step fails
   │
   ▼
Tier A (free, instant, timing fixes)        ← unchanged, still zero AI
   │ still failing
   ▼
Tier B-fast (Jev)                            ← NEW
   • Same ranked candidate list Tier B already builds
   • Ask Jev: "Which candidate is the recorded element?" (Choice)
   • If Jev is ≥ 90% sure AND the runtime's own uniqueness check
     passes AND the step is not destructive → act.
   • Otherwise → fall through, untouched.
   │ not confident / not safe
   ▼
Tier B (Claude, armed with screenshots)     ← unchanged
```

**Why this fits so well:**
- Tier B **already builds a ranked, numbered candidate list** (`candidate_digest.js`). That's a multiple-choice question waiting to be asked. The 255-option cap on Choice is fine because the list is already ranked, so we send the top 255 or fewer.
- Tier B **already has the rule "the AI nominates, the runtime verifies"**. Jev's pick goes through the exact same verification gate as Claude's pick, so no new trust is granted.
- Rough cost: a 40,000-character digest is about 10,000 tokens. At Jev's price that's about **$0.0004 per attempt**, versus a multi-image Claude round costing cents. It also finishes in about a quarter of a second instead of many seconds.

**Bonus: the Studio sandbox could heal too.** Today a skill tested in Build Studio can't use Tier B, because there's no agent. A Jev fast lane (billed through Conxa's cloud proxy like other Studio AI calls) would let authors see *"this step drifted, and here's what it would heal to"* during testing. This needs care: today the sandbox deliberately fails so the compiled skill is "judged on its own merits." If we add this, it should **report** the heal rather than silently pass the test.

### 3.2 Safety checks: "is this pop-up safe to close?" and "is this step destructive?"

**Today.** Closing an unknown pop-up is guarded by a hand-written **allow-list** of safe words (close, dismiss, cancel, skip…) and a **deny-list** of dangerous words (confirm, pay, delete, subscribe…). Anything the lists don't recognise is refused.

**With Jev.** Add a Yes/No question: *"Given this pop-up's text and buttons, is clicking this control a harmless dismissal?"*

**Important rule:** Jev may only make Conxa **more careful, never less**.
- If the deny-list says "no", the answer is **no**, whatever Jev thinks.
- Jev can *veto* a click the allow-list approved ("this 'Close' button actually closes your account").
- Jev may *approve* an unlabeled or foreign-language button that the lists didn't recognise, but only inside a real dialog and only above a high confidence bar.

The same idea works for **"is this step about to do something irreversible?"** (pay, delete, submit, send), as an extra safety net on top of the existing halts.

### 3.3 Smarter "did my login expire?" detection

**Today.** The runtime guesses "we got bounced to a login page" from the URL and page title. It already needed a special fix because it misfired on workflows that *deliberately* visit a login page.

**With Jev.** One Yes/No question on the page's title and visible text: *"Is this a sign-in wall that interrupted the workflow?"* It's cheap enough to ask every time the heuristic is unsure, and it keeps the current rule as the first check.

### 3.4 Compile time: the "second opinion" questions

The compiler's **second opinion** pass already asks a model small, multiple-choice-shaped things:

| Second-opinion job | As a Jev question |
|---|---|
| Is this recorded step noise? (`flag_noise`) | Yes/No |
| Which phase of the workflow is this step in? | Choice |
| Is this pop-up stochastic, so it only sometimes appears? (`try_dismiss`) | Yes/No |
| Which workflow input feeds this field? (`input_binding`) | Choice over the known inputs |
| What kind of check proves this step worked? (`suggest_assertion`) | Choice over the five allowed text/URL/state types |

**Honest caveat on savings.** Compile-time text calls are **already tiny**, about $0.00006 per step on Starter. The real compile cost is the **screenshot/vision** call (~$0.0036 per step), which Jev **can't replace** because it doesn't read images. So Jev won't meaningfully cut compile bills.

The real win here is **the confidence number**. Today, Human Review sees every AI decision the same way. With Jev, Conxa could **highlight only the decisions it was unsure about** ("61% sure this step is noise, please check"). That makes review faster and more trustworthy.

### 3.5 Outcome checks after a step runs

After a step, the runtime verifies "did it work?" using recorded assertions. For fuzzy outcomes ("the page now shows a success message of some kind"), a Yes/No Jev question on the page's visible text is a cheap second check. It should stay **advisory** and never become the only thing that passes or fails a run.

### 3.6 Cloud side: triaging failures and bug reports

The cloud receives telemetry about every failure. Jev could sort each failure into a bucket:
**site changed / timing / login expired / pop-up / probably our bug**

That powers a dashboard view like "12 of your skills broke this week because the site changed; here they are". Bug reports from the new "Report a bug" page could be auto-labelled the same way. This touches no customer page at run time, so it's the **lowest-risk place to start**.

### 3.7 Conxa Execute: picking the right skill

In Conxa Execute's managed chat, the first decision is often *"which of this company's skills does the user want?"* That's a Choice question over the skill list. Jev could answer it in ~150 ms and hand the rest (asking for inputs, chatting) to the normal chat model. This cuts cost on every managed-chat conversation, which Conxa pays for and meters.

### 3.8 Where Jev should NOT go

| Place | Why not |
|---|---|
| **Tier A recovery** | A core rule: *Tier A costs zero AI tokens.* It's instant, offline and free by design. Jev is still a paid network call. It belongs *after* Tier A, never inside it. |
| **Writing selectors** | Jev can't write text anyway, and the rule "AI doesn't write element addresses on the main compile path" stays. |
| **Vision anchors** | Jev (as documented today) doesn't take images. |
| **The workflow intent graph / planning** | Open-ended reasoning is exactly what Jev is bad at. Claude stays. |
| **The main element resolver's winner pick** | The resolver's rule "never pick the top candidate unless it clearly beats the runner-up" is deterministic and free. Don't replace it with a model call on every step. |

---

## 4. How Jev would benefit Conxa

1. **Faster self-healing.** A moved button could be healed in about 0.2 seconds instead of a multi-second Claude round-trip. Customers feel that directly.
2. **Cheaper self-healing for the customer.** Many Tier B rounds (text plus screenshots on the customer's Claude plan) become fractions of a cent.
3. **Healing where there's no agent.** Build Studio tests and future headless or scheduled runs (the "Scale" horizon) could fix simple drift without Claude attached.
4. **Honest uncertainty.** Calibrated confidence lets Conxa act *only when sure* and flag the rest for a human. That matches Conxa's "never guess on irreversible actions" stance better than an LLM that sounds equally confident about everything.
5. **Smarter safety nets.** Pop-up and destructive-action checks become understanding-based instead of word-list-based, while the word lists stay as the hard floor.
6. **Better Human Review.** Reviewers see *which* AI calls were shaky, not a wall of equal-looking suggestions.
7. **Strategic fit.** It proves the "exact at execution, smart at the edges" story. Conxa can say its runtime uses a specialist decision model for split-second judgments and a frontier model only for real reasoning.
8. **Cheaper managed chat** in Conxa Execute, where Conxa pays the bill.

---

## 5. How Jev could harm Conxa

These are real. Several could be serious if ignored.

### 5.1 Customer data leaves the customer's machine to a new third party ⚠️ *most serious*
Conxa's promise is **"execution is local; the cloud is just coordination."** A Jev call at run time sends a description of the customer's live screen (names, invoice amounts, emails in button labels) to TypeSafe's servers. Enterprise buyers and security reviews will ask about this. TypeSafe is a months-old startup, and its data-retention terms aren't clear from public material.
**Mitigation:** make it **opt-in per workspace** and send only element roles and labels, never full page text. Route every call through Conxa's own cloud proxy so there's one place to audit, redact and switch it off. Get a data-processing agreement from TypeSafe before any customer data flows.

### 5.2 A confident wrong click can wreck a run
Conxa already learned this: an old recovery stage that "guessed by text similarity and clicked" was **deleted**, because a wrong click changes the page and ruins everything that follows. Jev can return a **valid but wrong** option at 90% confidence.
**Mitigation:** Jev only **nominates**, and the runtime's existing uniqueness and fingerprint checks still decide. Never use the fast lane on steps marked destructive. Keep the threshold high and tune it with real data before lowering it.

### 5.3 New dependency on an unproven, early-access vendor
It's closed-source, early access and a first product, with no independent benchmarks and pricing that could change. If TypeSafe goes down, gets acquired or reprices, every feature built on it degrades.
**Mitigation:** every Jev feature must be **optional with a working fallback** (Tier B-fast falls through to Tier B, safety checks fall back to the word lists). Put Jev behind the existing multi-provider router so it can be swapped for a competitor (there are already 80+ "System One"-style models) or turned off from one place.

### 5.4 It breaks the clean "Tier A is free and offline" story if placed wrong
If anyone slips a Jev call into Tier A, it breaks a core product rule and adds a network wait to every recovery.
**Mitigation:** Jev only ever appears in a new, clearly separate tier. The existing purity check in CI (which already guards Tier A against AI calls) keeps enforcing it.

### 5.5 API keys in a customer-installed program
The runtime runs on customer laptops. Shipping a Jev key inside it means the key gets stolen.
**Mitigation:** the runtime never holds a Jev key. It calls a Conxa cloud endpoint (under `/api/v1/…`) with its existing per-company token, and the cloud adds the key and meters the usage.

### 5.6 Stale-page answers
Jev is only as right as the page description it gets. If the page changes between "describe it" and "act on it", the answer is confidently stale.
**Mitigation:** re-snapshot right before asking, record how old the snapshot was next to the confidence, and always re-verify the element live before clicking (which the runtime already does).

### 5.7 More moving parts to test and explain
It's another provider in the router, another tier in the recovery docs, another thing that can make a compile differ from run to run, and another line in the cost model and security docs.
**Mitigation:** start small (section 6) and only expand where the numbers prove it's worth it.

### 5.8 Offline customers
Some customers run with limited internet. Anything built on Jev must quietly skip itself when offline, never fail the run.

---

## 6. A safe, step-by-step plan to try it

Each phase only goes ahead if the previous one earns it.

### Phase 0 — Prove it on old data (≈1 week, zero customer risk)
- Take past Tier B recoveries where we **know** the right answer (Claude picked a candidate and the verified click worked).
- Replay the saved candidate lists through Jev offline.
- **Measure:** how often Jev's top pick matches the known-good answer, and how often it's wrong *while claiming ≥ 90%*. That second number decides everything.
- **Go/no-go:** if Jev is right on most cases and almost never confidently wrong, continue. If not, stop here. We've lost a week, not a customer.

### Phase 1 — Plumbing through the cloud (≈1 week)
- Add Jev as a provider behind the existing cloud AI proxy, with a new "decide" endpoint under `/api/v1`. It's authenticated by the tokens Conxa already issues and metered like other AI calls.
- Add a per-workspace on/off switch, off by default.
- Update the security, cost-model and technical docs.

### Phase 2 — Low-risk uses first (≈2 weeks)
- **Cloud failure triage** (section 3.6). No customer screens involved.
- **Compile-time confidence flags** for Human Review (section 3.4), shown **alongside** the current second opinion, not replacing it.
- **Safety veto** on pop-up dismissal (section 3.2): Jev can only *block* clicks, not approve new ones.

### Phase 3 — The fast lane, carefully (≈2–3 weeks)
- Ship **Tier B-fast** (section 3.1), off by default, opt-in per workspace.
- Non-destructive steps only, high confidence bar, same runtime verification as Tier B, automatic fall-through to Claude.
- Log every Jev decision with its confidence and what actually happened, so the confidence bar can be tuned from real data.

### Phase 4 — Expand only where the numbers say so
- The Studio sandbox "would heal to…" report.
- Skill routing in Conxa Execute's managed chat.
- Optional pop-up *approval* (not just veto) if Phase 3 data shows it's reliable.

### What success looks like
| Measure | Target |
|---|---|
| Recoveries handled by the fast lane without Claude | Meaningful share (e.g. ≥ 40%) |
| Fast-lane picks that turned out wrong | Near zero, since the runtime verification should catch them |
| Median time to heal a moved element | From seconds to under 1 second |
| Customer complaints about data sharing | Zero, because it's opt-in and redacted |

---

## 7. Bottom line

**Jev is a good fit for Conxa, but only in the gaps.** It's a fast, cheap, honest-about-uncertainty **multiple-choice machine**, and Conxa is full of multiple-choice moments that are handled today by either brittle word lists or slow, expensive Claude round-trips.

The best single use is a **fast lane in front of Tier B recovery**, where Conxa already builds the multiple-choice list and already double-checks whatever the AI picks. The biggest risk is **not technical but trust**: sending customer screen data to a brand-new outside company. That's why every Jev feature should be **opt-in, redacted, routed through Conxa's cloud, and always able to fall back to how things work today**.

Start with Phase 0. It costs a week, risks nothing, and tells us whether any of the rest is worth building.

---

### Sources
- [Jev (AI model) — Wikipedia](https://en.wikipedia.org/wiki/Jev_(AI_model))
- [What Is Jev? TypeSafe AI's System One Model Explained — You.com](https://you.com/resources/what-is-jev)
- [Shut up and calculate: Jev's new AI primitives for coders — The Register](https://www.theregister.com/devops/2026/09/23/shut-up-and-calculate-jevs-new-ai-primitives-for-coders/5298431)
- [jev-browser on GitHub (Apache-2.0)](https://github.com/Mrlyk/jev-browser)
- [How Jev Acts on the Web — TestMu AI](https://www.testmuai.com/blog/jev-browser-cloud/)
- Conxa internals: `docs/TRD.md` §10.1 (recovery cascade), `docs/cost_model.md` (compile costs), `CLAUDE.md` Key Invariants.
