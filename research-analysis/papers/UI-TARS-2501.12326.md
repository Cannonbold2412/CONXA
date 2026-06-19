# UI-TARS: Pioneering Automated GUI Interaction with Native Agents
**arXiv: 2501.12326v1 | Paired repo: UI-TARS-desktop-main**

---

## Summary

UI-TARS is a VLM (Vision-Language Model) specifically trained for GUI interaction. Unlike general-purpose VLMs applied to UI tasks, UI-TARS integrates perception, grounding, and action into a single model trained on ~50B tokens of GUI-specific data from web, desktop, and mobile platforms. It achieves SOTA on 10+ GUI benchmarks while using no task-specific fine-tuning at inference time.

---

## Key Technical Contributions

### 1. Unified Perception-Grounding-Action Model
- Single model handles screenshot understanding, element grounding (bounding boxes), and action generation
- No separate grounding module or selector pipeline — VLM outputs `click(x, y)` directly
- Trained on 50B tokens: filtered web data + synthetic task trajectories + human-annotated corrections

### 2. Set-of-Marks (SoM) Annotation
- Numbered overlays on screenshot elements allow VLM to reference "element 7" rather than describe coordinates
- SoM reduces hallucination: model sees the same annotated image a human reviewer would see
- Carried forward in conversation history so VLM tracks what it has already interacted with

### 3. Reflective Trajectory Optimization
- Training includes negative trajectories (wrong actions) with correction labels
- Model learns to reason about WHY a previous step failed before generating the next action
- Mirrors browser-use's `evaluation_previous_goal` field but baked into pretraining, not prompt engineering

### 4. Unified Action Space
- 13 action primitives: click, double_click, right_click, type, scroll, drag, hotkey, screenshot, wait, open_app, close_app, CALL_USER, FINISHED
- CALL_USER is a first-class action — model can pause and request human clarification
- Coordinate system: logical pixels normalized to [0,1] then scaled by operator at execution time

### 5. Native Cross-Platform Execution
- Operators: LocalComputer (OS keyboard/mouse), LocalBrowser (Playwright), RemoteComputer, RemoteBrowser
- No DOM dependency — works on any UI surface including non-web desktop apps

---

## Benchmark Results

| Benchmark | UI-TARS Score | Prior SOTA |
|-----------|--------------|------------|
| ScreenSpot | 75.1% | 58.3% |
| GUI-Odyssey | 59.1% | 47.8% |
| AndroidWorld | 46.6% | 34.5% |
| OSWorld | 22.7% | 17.8% |

---

## Conxa Relevance

**ADOPT:**
- CALL_USER mechanism pattern — explicit model-initiated human escalation is directly analogous to Tier 5 in Conxa's recovery cascade
- SoM annotation as context continuity across steps — carry annotated screenshots in history, not just text
- Reflective action model: eval-previous-step before generating next reduces cascading failures

**REJECT:**
- Coordinate-based locating as primary strategy — Conxa's deterministic philosophy means CSS/ARIA must be Tier 1/2; coordinates are Tier 4 (vision fallback)
- VLM as the action generator at every step — violates zero-token Tier 1/2 constraint
- Native OS operators for Conxa's web-only scope — LocalBrowserOperator is the only relevant mode

**BORROW ARCHITECTURE:**
- The operator abstraction (interface with `screenshot()` + `execute(action)`) is a clean separation between the VLM and the execution substrate — Conxa's MCP server should mirror this interface
- `screenshotContext.scaleFactor` normalization — Conxa's vision fallback (Tier 4) needs identical coordinate scaling logic for HiDPI displays
- Unified action space with FINISHED sentinel — Conxa's agent loop should have an explicit terminal action rather than detecting completion by absence of actions

---

## Implementation Notes from Paired Repo

- `runAgent.ts` instantiates `GUIAgent` with operator + VLM config
- `handleData` callback receives step data and applies SoM annotation via `markClickPosition`
- `predictionParsed` is the typed contract between VLM and operator: `[{action, coordinate:[x,y], value?}]`
- AppState machine: INIT → RUNNING → (PAUSE via CALL_USER) → END/ERROR
- `screenshotContext.scaleFactor` multiplied at operator.execute time, not in VLM output
