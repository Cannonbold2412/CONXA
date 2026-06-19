# GPT-4V(ision) is a Generalist Web Agent, if Grounded (SeeAct)
**arXiv: 2401.01614v2**

---

## Summary

SeeAct demonstrates that GPT-4V can perform well as a web agent when given explicit grounding assistance. Without grounding, GPT-4V generates actions referencing elements that don't exist. With grounding — a separate step that maps natural language element descriptions to actual DOM elements — success rates improve dramatically. The key contribution is formalizing grounding as a necessary distinct stage in web agent pipelines.

---

## Key Technical Contributions

### 1. The Grounding Problem Formalized
- Without grounding: GPT-4V says "click the blue Submit button" but cannot reliably produce the selector or coordinate
- With grounding: a separate grounding step takes GPT-4V's description and finds the actual element
- Two-stage: (1) Action generation: what to do + element description; (2) Grounding: description → selector/coordinate

### 2. Three Grounding Strategies Compared
- **Text-based:** Match description against DOM text content — fast, works for labeled elements
- **Element-attribute:** Match against ARIA attributes (role, name, placeholder) — better for unlabeled icons
- **Vision-based (SoM):** Number all interactive elements in screenshot; model picks number — most robust
- Vision-based grounding achieves highest accuracy but requires annotated screenshots

### 3. Online vs Offline Evaluation
- Online: agent acts on real websites in real time — 23.8% success on WebArena tasks
- Offline: agent shown recorded trajectories, picks best next action — 51.1% accuracy
- Gap = error propagation: early mistakes compound through the trajectory

### 4. Failure Mode Analysis
- **Hallucination (30% of failures):** Model invents elements that don't exist
- **Wrong element (25%):** Correct action type, wrong target
- **Missing context (20%):** Model doesn't use information from previous steps
- **Infeasible plan (15%):** Correct interpretation, but chosen approach can't work on this site

---

## Key Findings Relevant to Conxa

**Finding 1: Two-stage (generate + ground) strictly outperforms one-stage**
- One-stage: LLM generates selector directly — unreliable, hallucination-prone
- Two-stage: LLM describes element in natural language → grounding resolves to selector — 2× better
- **Conxa implication:** Tier 3 re-grounding prompt should ask LLM to describe the target element, then separately use ARIA tree matching to find it — don't ask LLM to output a CSS selector directly

**Finding 2: Vision-based grounding is most robust, text-based is fastest**
- For Conxa's tiered cascade: text/ARIA grounding first (Tier 3), vision fallback (Tier 4)
- This matches Conxa's existing architecture exactly — SeeAct validates the cascade order

**Finding 3: 30% hallucination rate when grounding is skipped**
- Direct "click the submit button" → selector fails 30% of the time even with GPT-4V
- **Conxa implication:** Never ask LLM to output a selector string directly in Tier 3; use description → ARIA match

**Finding 4: Offline accuracy (51%) >> Online accuracy (24%)**
- Error propagation is the dominant challenge in real-world agents
- **Conxa implication:** The value of Conxa's deterministic Tier 1/2 is preventing this error propagation — if the first 5 steps are deterministic and correct, only step 6 needs recovery

---

## Conxa Relevance

**ADOPT:**
- Two-stage action generation + grounding as the Tier 3 protocol:
  1. LLM receives ARIA tree + screenshot → outputs: `{action_type, target_description, argument}`
  2. Grounding module matches `target_description` against current ARIA tree → produces selector
- Never ask LLM to write selectors directly — always describe then match
- The 4 failure modes as Conxa's errorTaxonomy expansion: hallucination / wrong-element / missing-context / infeasible-plan map cleanly to Stagehand's 8-category taxonomy

**BORROW ARCHITECTURE:**
- SeeAct's grounding API: `(description: string, aria_tree: ARIANode[]) → Element | null` — this is exactly what Conxa's Tier 3 recovery module should implement
- The online vs offline accuracy gap motivates Conxa's cache-first approach: pre-grounded selectors are "offline accuracy" quality; live re-grounding is "online accuracy" quality
