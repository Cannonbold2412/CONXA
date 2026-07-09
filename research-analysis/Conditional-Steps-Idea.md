# Adding "Brain" to Deterministic Workflows — The Idea in Plain Language

**Status:** Proposal / architectural idea — nothing here is built yet.
**Audience:** Anyone. No deep technical knowledge needed.

---

## The Problem

Today, a Conxa skill is like a recipe followed by a robot with its eyes closed:

> Click this. Type that. Click submit. Done.

Every step happens in a fixed order, every time. That's great — it's fast, cheap, and predictable. But real websites don't always behave the same way:

- Sometimes a **coupon popup** appears, sometimes it doesn't.
- Sometimes you're **already logged in**, sometimes you're not.
- Sometimes the item is **out of stock** and you need to do something different.

Right now the workflow can't handle "sometimes." It needs a way to **look at the page, make a decision, and pick a path** — in other words, it sometimes needs a brain.

## The Big Realization

We don't need to invent a brain — **we already have one in the loop.**

Every skill runs inside Claude Desktop. Claude *is* a brain, sitting right there, calling our skills. So instead of one solution, we get **three levels of decision-making**, from cheapest to smartest. This mirrors exactly how our self-healing recovery already works: try the free, simple thing first, and only "phone the smart (expensive) brain" when the simple thing isn't enough.

---

## Level A — Simple "If This, Then That" Rules (free, covers most cases)

**What it is:** A new kind of step called a **branch**. It doesn't click anything — it just looks at the page and asks a yes/no question that has a factual answer:

- "Is the popup visible right now?"
- "Does the web address contain `/login`?"

Based on the answer, the workflow jumps to a different section of steps.

**Why it's great:** No AI is involved at all. It costs zero tokens, it's instant, and it's 100% predictable. We estimate this alone handles ~80% of real-world cases (mostly "a popup appeared" situations).

**How a company would record it:** They record the normal path once, like today. Then in the editor, they mark a spot — "here's where things can differ" — and record the alternate path. Our compiler compares the two recordings and *suggests* the rule that tells them apart ("popup visible → take path B"). The AI helps **write the rule at build time**, but at run time on the customer's machine, no AI is needed.

## Level B — Ask AI a Multiple-Choice Question (free via the MCP client, for fuzzy cases)

**What it is:** Some decisions can't be answered by simple page facts. For example:

- "Did the order go through, or did it show a duplicate warning?"
- "Which of these 3 search results is the right customer?"

For these, we add a **decide** step. It grabs a small snippet of what's on screen (just the relevant text, not a screenshot) and asks a **multiple-choice question**.

**Who answers it:** The runtime is already talking to an AI the moment it's running — Claude Desktop, the MCP client that invoked the skill in the first place, over the same connection. So a decide step asks *that* AI directly using MCP's built-in "sampling" feature (`sampling/createMessage`), instead of placing a separate call to our cloud. Same insight as Level C ("the brain is already in the loop"), just used synchronously mid-skill instead of by ending the skill and handing off.

**The critical safety rule:** The AI only *picks from choices we wrote in advance*. It never invents new actions, never writes its own instructions for finding elements. It's an exam with A/B/C answers, not a blank sheet of paper.

**Known friction:** Many MCP hosts treat a sampling request like a tool call and show the user an approval prompt before answering it. For a decide step meant to be instant and invisible, that's a real UX cost — we need to confirm Claude Desktop's actual behavior here before betting on this path for every customer, since spec-level "sampling support" doesn't guarantee there's no confirmation dialog in the way.

**Fallback:** For any MCP host that doesn't support sampling at all, decide steps fall back to our existing cloud proxy — metered and billed the same way our Tier 3 recovery already is, with the same kind of ceiling setting. This keeps Level B working everywhere; it just isn't free everywhere.

## Level C — Let Claude Itself Decide (smartest, costs us nothing)

**What it is:** For big decisions ("should we even run the refund workflow, or the exchange workflow?"), don't put the decision *inside* the skill at all. Instead:

1. **Split the workflow into smaller skills** at the decision point.
2. Have the first skill end by **reporting what it saw** ("the form shows a duplicate warning").
3. Let **Claude Desktop** — the brain that's already running the show — read that report and choose which skill to run next.

**Why it's great:** The intelligence is free to us (it's the customer's Claude), and it turns our skills from rigid macros into flexible building blocks an AI can combine. That's exactly our "AI-native" pitch.

**The trade-off:** The decision happens in Claude's head, not in our tested package, so it's less predictable. That's why this level is for coarse, high-level choices — not for tiny in-page details.

---

## How the Three Levels Fit Together

Same ladder as our self-healing recovery: **free and simple first, smart and costly last.**

| Level | Who decides | Cost | Predictability | Best for |
|---|---|---|---|---|
| A — Branch | A simple rule | Free | Total | "Popup appeared?" "Logged in?" |
| B — Decide | The MCP client (Claude Desktop), via sampling — cloud proxy as fallback | Free (metered only on fallback) | High | "Success or error message?" |
| C — Orchestrate | Claude Desktop | Free to us | Lower | "Which workflow should run next?" |

A decision point should *prefer* Level A, *fall back* to Level B, and *hand up* to Level C only if it can't resolve things itself.

## What We'd Recommend Building, In Order

1. **Level A first.** Biggest payoff, zero AI cost, and we already have all the ingredients (our element-finding and page-checking machinery can answer "is this visible?" today).
2. **Level B second.** Primary path asks the MCP client over the connection we already hold (no new plumbing); fallback reuses the cloud AI proxy and billing we already have for hosts without sampling support. Worth a spike first to confirm whether Claude Desktop's sampling flow requires a per-call approval prompt.
3. **Level C third.** Mostly packaging work — teaching the compiler where to split workflows and how skills report what they saw.

## The One Decision We Must Make Early

Adding branches means the step list stops being a straight line. There are two ways to structure it:

- **Flat with jump labels** (like "go to section: handle_popup") — keeps our current step-runner almost unchanged. ✅ Recommended.
- **Nested** (steps inside steps inside steps) — would force a rewrite of the runner and all its bookkeeping. ❌ Avoid.

This choice is cheap to make now and very expensive to change later, so it should be settled before any code is written.

---

*Related reading: [`TRD.md`](TRD.md) (recovery cascade, runtime architecture), [`Implementation-Plan.md`](Implementation-Plan.md) (roadmap).*
