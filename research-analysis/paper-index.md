# Research Paper Index

Papers located in: `repos/papers/` of the Research repository.

---

## Confirmed Papers (7)

### 1. Mind2Web
- **File**: `2306.06070v3.pdf`
- **Title**: Mind2Web: Towards a Generalist Agent for the Web
- **Problem domain**: Web agent dataset and benchmark
- **Summary**: Introduces the first large-scale dataset for generalist web agents — 2,000+ tasks collected from 137 websites spanning 31 domains, with crowdsourced action sequences. Tasks use real websites rather than simulations.
- **Relevance to Conxa**: HIGH — defines the task taxonomy for web automation (click, type, select, navigate). The 31 domain breakdown informs what categories of workflows Conxa should support. Action type definitions directly map to Conxa's step vocabulary.
- **Priority score**: 9/10
- **Suggested reading order**: 2nd

---

### 2. WebArena
- **File**: `2307.13854v4.pdf`
- **Title**: WebArena: A Realistic Web Environment for Building Autonomous Agents
- **Problem domain**: Web agent evaluation environment
- **Summary**: Proposes a realistic benchmark with 643+ tasks across 15 popular websites (Reddit, GitLab, shopping sites, etc.) with full-stack web environments. Includes tools and external knowledge bases.
- **Relevance to Conxa**: HIGH — canonical evaluation environment for web agents. The task complexity distribution and success metrics define what "hard" and "easy" web automation looks like. Relevant for Conxa's reliability targets.
- **Priority score**: 8/10
- **Suggested reading order**: 3rd

---

### 3. SeeAct (GPT-4V Web Agent)
- **File**: `2401.01614v2.pdf`
- **Title**: GPT-4V(ision) is a Generalist Web Agent, if Grounded
- **Problem domain**: Vision-based web agent grounding
- **Summary**: Proposes SeeAct — uses GPT-4V for integrated visual understanding + web interaction. Key insight: vision-only agents fail without grounding; introduces choice-based and element attribute grounding methods. Evaluated on Mind2Web benchmark and live websites.
- **Relevance to Conxa**: HIGH — directly addresses the grounding problem (mapping LLM decisions to DOM elements). Conxa's multi-signal element identity is solving the same problem. Grounding strategies here are directly applicable.
- **Priority score**: 9/10
- **Suggested reading order**: 4th

---

### 4. WorkArena
- **File**: `2403.07718v5.pdf`
- **Title**: WorkArena: How Capable Are Web Agents at Solving Common Knowledge Work Tasks?
- **Problem domain**: Enterprise/SaaS web agent benchmark
- **Summary**: 33 tasks on ServiceNow (enterprise SaaS platform) evaluating web agents on realistic knowledge work. Finds current agents succeed on only ~17% of tasks. Focuses on multi-step, form-heavy, data-intensive enterprise workflows.
- **Relevance to Conxa**: HIGH — Conxa's primary use case is enterprise SaaS automation. This paper's task categories (form filling, list filtering, record creation) directly describe Conxa workflows. Failure modes documented here inform Conxa's recovery design.
- **Priority score**: 9/10
- **Suggested reading order**: 1st (most directly relevant to Conxa's market)

---

### 5. OS-ATLAS
- **File**: `2410.23218v1.pdf`
- **Title**: OS-ATLAS: A Foundation Action Model for Generalist GUI Agents
- **Problem domain**: Cross-platform GUI foundation model
- **Summary**: Open-source foundation action model trained on a 13M+ GUI element corpus spanning web, desktop, and mobile. Achieves state-of-the-art on grounding across platforms. Overcomes limitations of commercial VLMs (GPT-4o, Claude) on GUI tasks.
- **Relevance to Conxa**: HIGH — demonstrates what a dedicated GUI action model looks like vs. repurposing general VLMs. Relevant to Conxa's vision strategy if moving toward VLM-based element resolution. The 13M GUI corpus training approach informs Conxa's potential fine-tuning direction.
- **Priority score**: 8/10
- **Suggested reading order**: 6th

---

### 6. UI-TARS
- **File**: `2501.12326v1.pdf`
- **Title**: UI-TARS: Pioneering Automated GUI Interaction with Native Agents
- **Problem domain**: Native GUI agent model
- **Summary**: Introduces UI-TARS — a VLM-based native GUI agent using only screenshots as input. Achieves SOTA on 10+ benchmarks including OSWorld, AndroidWorld, ScreenSpot. Outperforms GPT-4o and Claude. No DOM dependency.
- **Relevance to Conxa**: HIGH — pairs directly with the UI-TARS-desktop-main repo. Vision-only approach (no DOM) represents the alternative architecture to Conxa's selector-based approach. Essential reading for understanding trade-offs between vision-first and DOM-first execution.
- **Priority score**: 9/10
- **Suggested reading order**: 5th

---

### 7. WebVoyager
- **File**: `WebVoyager Paper.pdf`
- **Title**: WebVoyager: Building an End-to-End Web Agent with Large Multimodal Models
- **Problem domain**: End-to-end multimodal web agent
- **Summary**: End-to-end web agent using Large Multimodal Models (LMMs) — combines vision and text to interact with real-world websites. Achieves 59.1% task success rate across 643 tasks on 15 popular websites. Represents early production-quality web agent work.
- **Relevance to Conxa**: HIGH — foundational paper for understanding LMM-driven web automation. The 59.1% baseline shows where human-in-the-loop or self-healing is necessary. Pipeline design (observe → plan → act) maps directly to Conxa's execution model.
- **Priority score**: 8/10
- **Suggested reading order**: 7th (read last for end-to-end perspective)

---

## Flagged for Verification (3)

The following three PDFs have arXiv IDs that do not match web automation topics based on public metadata. The PDF contents may differ from their filenames — manual inspection recommended before reading.

### ⚠ Unknown Paper A
- **File**: `2402.10157v1.pdf`
- **arXiv metadata**: "Revisiting Stochastic Realization Theory using Functional Itô Calculus" (control/probability theory)
- **Expected domain**: Likely a web agent paper that was mislabeled
- **Action**: Open PDF and check title page before reading
- **Priority score**: Hold until verified

### ⚠ Unknown Paper B
- **File**: `2501.09903v3.pdf`
- **arXiv metadata**: "Dynamically stable two- and four-droplet solitons in a very strongly dipolar NaCs condensate" (quantum physics)
- **Expected domain**: Likely a GUI/web agent paper that was mislabeled
- **Action**: Open PDF and check title page before reading
- **Priority score**: Hold until verified

### ⚠ Unknown Paper C
- **File**: `2501.12988v1.pdf`
- **arXiv metadata**: "Large Language Model-Based Semantic Communication System for Image Transmission" (wireless comms)
- **Expected domain**: Possibly a vision+language paper relevant to GUI agents, or mislabeled
- **Action**: Open PDF and check title page before reading
- **Priority score**: Hold until verified

---

## Recommended Reading Order

| Order | Paper | Rationale |
|-------|-------|-----------|
| 1 | WorkArena (2403.07718) | Directly describes Conxa's market — enterprise SaaS task automation |
| 2 | Mind2Web (2306.06070) | Task taxonomy + action vocabulary that underpins all other papers |
| 3 | WebArena (2307.13854) | Canonical benchmark — establishes what success metrics look like |
| 4 | SeeAct / GPT-4V (2401.01614) | Grounding strategies — directly applicable to Conxa's element identity problem |
| 5 | UI-TARS (2501.12326) | Vision-first architecture — contrast with Conxa's DOM-first approach |
| 6 | OS-ATLAS (2410.23218) | Foundation model training — long-term VLM strategy reference |
| 7 | WebVoyager | End-to-end pipeline — historical baseline and success rate benchmarks |
| 8 | Unknown papers A/B/C | After verification |
