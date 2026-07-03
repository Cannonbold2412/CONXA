# OS-ATLAS: A Foundation Action Model for Generalist GUI Agents
**arXiv: 2410.23218v1**

---

## Summary

OS-ATLAS is a foundation model for GUI interaction trained on 13M+ GUI elements across web, desktop, and mobile platforms. It focuses on the grounding problem: given a natural language instruction and a screenshot, accurately identify WHERE on screen to act. Unlike UI-TARS (which also generates multi-step trajectories), OS-ATLAS specializes in single-step grounding accuracy as the foundation for downstream agents.

---

## Key Technical Contributions

### 1. Massive Multi-Platform Grounding Dataset
- 13M+ GUI elements from web (Common Crawl screenshots), desktop (Windows/macOS/Linux), mobile (Android/iOS)
- Annotations: element bounding boxes, ARIA roles, text content, interactive state
- Enables zero-shot grounding on novel UIs without task-specific examples

### 2. Grounding as a First-Class Task
- Distinguishes grounding (WHERE to act) from planning (WHAT to do) and execution (HOW to act)
- Model outputs: `{x_center, y_center, width, height}` in normalized [0,1] coordinates
- Coordinates are NOT pixel-absolute — scaled at inference time per screenshotContext

### 3. Unified Element Representation
- Each training sample encodes: screenshot + natural language description → bounding box
- No DOM access required — purely visual signal
- Cross-modal: model sees both screenshot and accessibility tree text where available; learns to use either

### 4. Action Space Compatibility
- Grounding output compatible with any downstream operator: OS keyboard/mouse, CDP dispatchMouseEvent, Playwright locator
- Used as the "vision fallback" layer in multi-tier agent pipelines

---

## Conxa Relevance

**ADOPT:**
- Normalized coordinate output ([0,1]) as the standard for vision-tier grounding — Conxa's Tier 4 should produce normalized coordinates, scaled by the MCP runtime at execution
- The grounding-as-subtask separation is architecturally sound: keep the "where" model separate from the "what/how" orchestration
- Multi-platform training data implies web elements are well-represented — for Conxa's web-only scope, OS-ATLAS is an efficient choice for Tier 4 rather than a full task-trajectory VLM

**REJECT:**
- As a primary action model for Conxa — too expensive per step; reserved for Tier 4 fallback only
- The coordinate output directly — Conxa should attempt to re-derive a CSS/ARIA selector from the coordinate via DOM hit-testing before committing to pixel-based action (Tier 4.5 opportunity)

**BORROW ARCHITECTURE:**
- Grounding API contract: `(screenshot_base64, element_description) → {x, y, w, h}` normalized — clean enough to wrap as a single MCP tool call
- Cross-modal input (screenshot + a11y text) — Conxa's Tier 4 prompt should include both the screenshot AND the ARIA tree text for the region of interest, not just the screenshot

---

## Relationship to Other Papers

- Complements UI-TARS: UI-TARS does full task trajectories; OS-ATLAS specializes in grounding accuracy
- WebArena/Mind2Web use this grounding approach as a subcomponent
- SeeAct (2401.01614) proposes a similar grounding-then-act decomposition for web specifically
