# WebArena: A Realistic Web Environment for Building Autonomous Agents
**arXiv: 2307.13854v4**

---

## Summary

WebArena is the canonical evaluation benchmark for web agents. It provides a set of self-hosted, realistic web applications (GitLab, Reddit, e-commerce store, CMS, map) with 812 tasks across 5 domains. Tasks have functional success criteria (not just element-level accuracy), making it the gold standard for end-to-end agent evaluation.

---

## Key Technical Contributions

### 1. Realistic Self-Hosted Environment
- 5 full web apps: GitLab (developer tools), Reddit clone, OneStopShop (e-commerce), CMS (content management), OpenStreetMap
- All apps run locally in Docker containers — reproducible, no external API dependencies
- Environment resets between tasks — no test pollution

### 2. Functional Task Success Criteria
- Tasks specify WHAT should be true after completion, not HOW to achieve it
- Example: "Find the top-3 products by revenue in Q3 and export to CSV" — success = file exists with correct data
- Evaluator programs check database state, downloaded files, page content — not DOM structure
- This distinguishes WebArena from element-click accuracy benchmarks

### 3. Task Taxonomy
- 812 tasks categorized: information seeking, site navigation, content creation, configuration, multi-site (cross-app) tasks
- Multi-site tasks require coordinating actions across multiple apps — hardest category
- Difficulty: GPT-4 achieves ~14% on original split without special prompting

### 4. Observation Space
- Agents receive: URL + page title + accessibility tree text + optional screenshot
- Accessibility tree format: numbered elements like `[42] button 'Submit'` — directly analogous to browser-use's selector_map
- Agent can request screenshot as additional signal (multimodal mode)

---

## Conxa Relevance

**ADOPT:**
- Functional success criteria as the design target for Conxa's verifier — a rubric should test "did the business outcome occur?" not "did the click happen?"
- Numbered accessibility tree format (`[42] button 'Submit'`) validates browser-use's selector_map approach — also validates Conxa's ARIA Tier 2 identity signal
- Multi-site task category maps to Conxa's cross-domain skill composition use case

**ADOPT for Evaluation:**
- WebArena as Conxa's primary benchmark target — 812 tasks with functional evaluators is the right quality bar
- Self-hosted apps means Conxa can run eval without external dependencies
- Task taxonomy gives vocabulary for categorizing which skill package types to prioritize first (information seeking and site navigation are likely ~70% of enterprise use cases)

**BORROW ARCHITECTURE:**
- The evaluator-program pattern: each task ships with a Python evaluator that checks database state or page content — Conxa's rubricVerifier should do the same rather than relying on LLM judgment alone
- Observation normalization: WebArena normalizes the ARIA tree to a numbered list before passing to LLM — Conxa's Tier 3 re-grounding prompt should use the same format

---

## Benchmark Context

| Agent | WebArena Score |
|-------|---------------|
| GPT-4 (text only) | 14.1% |
| GPT-4V (multimodal) | 16.4% |
| WebAgent (2023) | 13.8% |
| SeeAct | 23.8% |
| UI-TARS | ~55%+ (reported separately) |

The score gap between text-only and multimodal is small — the bottleneck is planning and error recovery, not perception. This supports Conxa's Tier 1/2 deterministic approach: most tasks can be solved without LLM if the plan was captured correctly at record time.
