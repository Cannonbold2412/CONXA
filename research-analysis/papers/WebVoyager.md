# WebVoyager: Building an End-to-End Web Agent with Large Multimodal Models
**WebVoyager Paper (2024)**

---

## Summary

WebVoyager is an end-to-end web agent that uses GPT-4V (vision) to interact with real websites through a combined screenshot + DOM text representation. It achieves 59.1% success on 643 real-world tasks across 15 websites. The key innovation is interleaving visual and textual page representations for richer grounding, rather than choosing one or the other.

---

## Key Technical Contributions

### 1. Multimodal Observation Space
- Agent receives: screenshot (annotated with Set-of-Marks numbers) + simplified DOM text in the same prompt
- SoM numbers overlaid on interactive elements in screenshot; same numbers appear in text representation
- LLM can reason with either modality and refer to elements by SoM index

### 2. Real Website Evaluation (Not Sandboxed)
- 643 tasks on 15 real websites including Google, Amazon, GitHub, Wikipedia, Reddit, Booking.com
- Success rate 59.1% on this set — significantly higher than WebArena because tasks are narrower
- Evaluation uses GPT-4 as judge: compares agent trajectory to reference answer

### 3. Action Set
- 6 actions: click (by SoM index), type, scroll, go_back, go_to_search_engine, answer
- Simple action vocabulary reduces parsing complexity
- `answer` action terminates the task and returns the extracted information

### 4. Self-Planning without Explicit Task Decomposition
- No explicit planner — single LLM call per step generates both reasoning and action
- History = last N screenshots + actions (windowed to manage context length)
- Model implicitly manages multi-step plans through in-context reasoning

---

## Key Findings Relevant to Conxa

**Finding 1: SoM + DOM text outperforms screenshot-only or text-only**
- +12% over text-only, +8% over screenshot-only
- Combining modalities is strictly better than either alone
- **Conxa implication:** Tier 3 re-grounding should include ARIA tree text AND screenshot with SoM overlay, not just one

**Finding 2: GPT-4V fails most on multi-step navigation requiring memory**
- Agent loses track of intermediate results in long tasks
- History truncation causes "forgetting" what it found 5 steps ago
- **Conxa implication:** Conxa's skill packages solve this architecturally — recording captures the full plan; replay doesn't need memory because each step is deterministic

**Finding 3: 59.1% on real sites vs 14% on WebArena**
- Gap is mostly about task scope: WebVoyager tasks are shorter and more localized
- **Conxa implication:** Don't benchmark Conxa on WebVoyager — WebArena is the harder, more meaningful bar

**Finding 4: go_back and go_to_search_engine used in ~20% of tasks**
- Agents need navigation recovery primitives beyond simple forward flow
- **Conxa implication:** Conxa's skill packages should record navigation recovery steps explicitly; don't assume linear forward-only execution

---

## Conxa Relevance

**ADOPT:**
- SoM + DOM text dual-representation for Tier 3/4 re-grounding prompts — this combination is empirically validated
- Windowed history (last N steps) as context for Tier 3 re-grounding — don't send full trajectory, just recent context
- Simple 6-action vocabulary as a model for Conxa's agent action space definition

**REJECT:**
- GPT-4V as primary action generator per step — too expensive, not deterministic, violates Tier 1/2 zero-token constraint
- Real-site eval as the primary Conxa benchmark — use WebArena's functional criteria instead

**BORROW ARCHITECTURE:**
- The SoM index alignment between screenshot and DOM text — when Conxa's Tier 3 sends the ARIA tree to LLM, number each element and overlay the same numbers on the screenshot
- `answer` as a terminal action type — Conxa's extract() equivalent should be an explicit action, not a return convention
