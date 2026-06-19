# Mind2Web: Towards a Generalist Agent for the Web
**arXiv: 2306.06070**

---

## Summary

Mind2Web is a large-scale dataset of 2,000+ real-world web tasks collected from 137 websites across 31 domains. Unlike WebArena (self-hosted apps), Mind2Web uses actual live websites recorded by human annotators, making it more representative of the messy real web. The paper also introduces MindAct, a two-stage model that first filters candidate elements then ranks them for action grounding.

---

## Key Technical Contributions

### 1. Real-Web Task Dataset
- 2,350 tasks across 137 websites: e-commerce, travel, social media, finance, government, etc.
- Each task is a multi-step trajectory: (instruction, URL, DOM snapshot, element chosen, action)
- Raw DOM is provided alongside cleaned versions — enables study of noise robustness

### 2. MindAct Two-Stage Grounding
- Stage 1: Candidate generation — filter DOM to ~50 candidate elements using a fine-tuned DeBERTa ranker
- Stage 2: Action selection — LLM (GPT-3.5/4) selects from candidates + generates argument
- Two-stage avoids overwhelming LLM with full DOM; practical for 10k+ node pages

### 3. Comprehensive Element Identity
- Each annotation records: element XPath, full CSS selector, text content, ARIA role, parent context
- Multi-signal redundancy mirrors Conxa's multi-signal identity philosophy
- Study shows text-based signals are more robust than structural (XPath) across site updates

### 4. Cross-Website Generalization Splits
- Train/test splits separate by website — model must generalize to unseen sites
- Also splits by task type and domain — enables targeted capability gap analysis
- Standard: model trained on 63 sites, tested on 74 never-seen sites

---

## Key Findings Relevant to Conxa

**Finding 1: Structural selectors degrade faster than semantic ones**
- XPath / CSS path accuracy drops significantly when sites update layouts
- Text content and ARIA role remain stable longer
- **Conxa implication:** In multi-signal element identity, weight ARIA role+name (Tier 2 signal) over structural CSS path; structural path should be last resort within Tier 1

**Finding 2: Two-stage filtering is essential for large DOMs**
- Full DOM → LLM is token-prohibitive on real sites (average 10k+ nodes)
- Fast filter → LLM is 40%+ faster and more accurate than full-DOM approach
- **Conxa implication:** Tier 3 re-grounding prompt should pre-filter the ARIA tree (top-K candidates) rather than sending the full tree to the LLM

**Finding 3: 137 websites → 31 domains covers 80% of enterprise tasks**
- Finance, e-commerce, travel, productivity, social, government
- **Conxa implication:** Prioritize Build Studio skill library for these 6 domain categories first

---

## Conxa Relevance

**ADOPT:**
- Multi-signal element identity validation — paper proves that combining ARIA role + text + structural signals outperforms any single signal
- The two-stage filter pattern for Tier 3: run a fast local ranker (e.g., embedding similarity over ARIA tree) to produce 10–20 candidates, then send candidates to LLM
- Task taxonomy (31 domains) → Conxa's initial skill library roadmap

**BORROW ARCHITECTURE:**
- Dataset format: `(instruction, url, dom_snapshot, element_chosen, action_type, action_arg)` — this is exactly the schema for Conxa's recorded action replay format with one addition: compile-time we should also store all 4 signals (xpath, css, text, aria) per element, not just the primary selector
- Train/test split methodology by website — for Conxa's eval harness, split recorded skills by domain to detect cross-site generalization issues early
