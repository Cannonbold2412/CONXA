# Conxa Research & Architecture Knowledge Base

This library is the research foundation and target-architecture spec behind **Conxa** — an AI-native
browser-automation platform that records workflows in a Build Studio, compiles them into signed,
deterministic *skill packages*, and distributes them to customers who run them locally via Claude
Desktop's MCP protocol.

It answers three questions, in order:

1. **What has the field already built?** — deep analysis of six competitor repos and seven research papers.
2. **Where does Conxa stand against that field, and what's missing?** — assessment, gap analysis, distilled insights.
3. **What should Conxa build, and in what order?** — the full target-architecture spec, the reliability engineering, the execution plan, and the go-to-market path.

Read it top-to-bottom by folder number for the full narrative, or jump to the section you need.

---

## How this library is organized

| # | Folder | Purpose — read when you need… |
|---|--------|-------------------------------|
| — | [`README.md`](README.md) | …the map of everything (this file) + the corpus priority rankings below. |
| 01 | [`01-external-research/`](01-external-research/) | …to understand a competitor tool or paper. One dossier per repo ([`repos/`](01-external-research/repos/)), one summary per paper ([`papers/`](01-external-research/papers/)), plus the cross-cutting [`cross-repo-comparison.md`](01-external-research/cross-repo-comparison.md) and [`paper-review.md`](01-external-research/paper-review.md). |
| 02 | [`02-conxa-assessment/`](02-conxa-assessment/) | …to know Conxa's current state ([`current-state.md`](02-conxa-assessment/current-state.md)), how it compares to SOTA ([`vs-state-of-the-art.md`](02-conxa-assessment/vs-state-of-the-art.md)), and the ranked gaps ([`gap-analysis.md`](02-conxa-assessment/gap-analysis.md), G1–G14). |
| 03 | [`03-insights/`](03-insights/) | …the distilled conclusions: the audit chain ([`research-audit.md`](03-insights/research-audit.md)), the ranked [`master-insights.md`](03-insights/master-insights.md), the ecosystem synthesis, and the competitive moat. |
| 04 | [`04-architecture/`](04-architecture/) | …the target architecture. A numbered Phase 1–10 spec (`00`–`09`) plus [`subsystems/`](04-architecture/subsystems/) (compiler, recording, runtime, vision, mcp, enterprise, workflow-durability). **The core deliverable.** |
| 05 | [`05-reliability/`](05-reliability/) | …the deep reliability research behind the architecture's recovery/edge-case layers: the EC-ID [`inventory.md`](05-reliability/inventory.md), the RP-xx [`recovery-patterns.md`](05-reliability/recovery-patterns.md), the per-family [`framework.md`](05-reliability/framework.md), the [`matrix.md`](05-reliability/matrix.md), the [`top-50-improvements.md`](05-reliability/top-50-improvements.md), plus per-tool and per-topic deep dives. |
| 06 | [`06-execution-plan/`](06-execution-plan/) | …what to build and in what order: the [`cto-report.md`](06-execution-plan/cto-report.md), ranked [`master-recommendations.md`](06-execution-plan/master-recommendations.md), the [`build-order.md`](06-execution-plan/build-order.md) DAG, the [`founder-execution-plan.md`](06-execution-plan/founder-execution-plan.md), and the quantified [`architecture-impact-analysis.md`](06-execution-plan/architecture-impact-analysis.md). |
| 07 | [`07-go-to-market/`](07-go-to-market/) | …the pre-sales path ([`minimum-sellable-conxa.md`](07-go-to-market/minimum-sellable-conxa.md), [`pre-sales-readiness.md`](07-go-to-market/pre-sales-readiness.md), [`pre-sales-roadmap.md`](07-go-to-market/pre-sales-roadmap.md)) and forward strategy (agentic-discovery, TwelveLabs video). |
| — | [`incidents/`](incidents/) | …engineering postmortems (not research): a plugin-detail crash and a real selector-failure incident that corroborates gap G5. |
| — | [`ops/`](ops/) | …infra/devops notes (not research): the private-repo migration plan. |

**The three architecture documents to never skip:** [`04-architecture/00-master-architecture.md`](04-architecture/00-master-architecture.md) (the map of the whole spec), [`03-insights/master-insights.md`](03-insights/master-insights.md) (the ranked conclusions), and [`06-execution-plan/master-recommendations.md`](06-execution-plan/master-recommendations.md) (the answer to "what do we build").

---

## Corpus priority rankings

The rest of this file ranks the *external research* corpus (folder 01) so deep analysis can focus on
the highest-value ~10% of the source material. Per-repo detail lives in
[`01-external-research/repos/`](01-external-research/repos/); per-paper detail in
[`01-external-research/papers/`](01-external-research/papers/).

### Repository priority ranking

**Tier 1 — Study first (core architecture analogs)**

| Rank | Repository | Why | Est. |
|------|-----------|-----|------|
| 1 | [**browser-use**](01-external-research/repos/browser-use.md) | Most direct analog to Conxa's architecture: agent loop (screenshot→LLM→action), DOM extraction, multi-provider LLM abstraction, MCP integration, `ActionResult` error model. Python, ~386 files. | 2–3 h |
| 2 | [**playwright**](01-external-research/repos/playwright.md) | Foundation for browser control across the corpus. MCP logic in `src/tools/mcp/` is Conxa's primary execution primitive. CDP relay pattern is novel. ~1,449 TS files but 62% ignorable. | 3–4 h |
| 3 | [**stagehand**](01-external-research/repos/stagehand.md) | Best source for caching/self-healing reliability patterns. CUA provider abstraction shows how to wrap different computer-use APIs uniformly. | 1–2 h |

**Tier 2 — Study second (specialized patterns)**

| Rank | Repository | Why | Est. |
|------|-----------|-----|------|
| 4 | [**ui-tars-desktop**](01-external-research/repos/ui-tars-desktop.md) | Only purely vision-first (coordinate-based) architecture in corpus. Key contrast to DOM-selector approach. Full VLM→OS-input pipeline; MCP server patterns reusable. | 2–3 h |
| 5 | [**playwright-mcp**](01-external-research/repos/playwright-mcp.md) | Thin wrapper — 30-min read. Confirms MCP transport (stdio), `createConnection()` API shape, `server.json` manifest. Study AFTER playwright. | 0.5 h |

**Tier 3 — Reference (selective reading)**

| Rank | Repository | Why | Est. |
|------|-----------|-----|------|
| 6 | [**seleniumbase**](01-external-research/repos/seleniumbase.md) | Legacy WebDriver approach. Primary value: CDP stealth patterns, recording helper, and how a 17K-line API class organizes browser automation. Low overlap with Conxa's TS stack. | 1–2 h |

### Paper priority ranking

| Rank | Paper | Score | Why read first |
|------|-------|-------|----------------|
| 1 | [WorkArena](01-external-research/papers/workarena.md) | 9/10 | Conxa's exact market — enterprise SaaS task automation; failure modes map to Conxa's recovery design. |
| 2 | [Mind2Web](01-external-research/papers/mind2web.md) | 9/10 | Foundational task taxonomy; action vocabulary used by all other papers. |
| 3 | [SeeAct](01-external-research/papers/seeact.md) | 9/10 | Grounding strategies directly applicable to Conxa's multi-signal element identity. |
| 4 | [UI-TARS](01-external-research/papers/ui-tars.md) | 9/10 | Vision-first architecture; pairs with the ui-tars-desktop repo; SOTA benchmarks. |
| 5 | [WebArena](01-external-research/papers/webarena.md) | 8/10 | Canonical benchmark; defines success metrics and task complexity distribution. |
| 6 | [OS-ATLAS](01-external-research/papers/os-atlas.md) | 8/10 | Foundation-model training approach; long-term VLM strategy reference. |
| 7 | [WebVoyager](01-external-research/papers/webvoyager.md) | 8/10 | End-to-end multimodal pipeline; 59.1% baseline shows where self-healing is required. |
| — | [Unverified A/B/C](01-external-research/papers/unverified-papers.md) | TBD | arXiv IDs appear mismatched — verify PDF contents before reading. |

### Recommended study order

```
Phase 1 — Ground truth (papers, ~4h)
  WorkArena → Mind2Web → SeeAct

Phase 2 — Implementation reference (repos, ~6h)
  browser-use → playwright → stagehand

Phase 3 — Architecture contrast (~4h)
  UI-TARS paper → ui-tars-desktop repo → OS-ATLAS

Phase 4 — Completeness (~3h)
  WebArena → WebVoyager → playwright-mcp → seleniumbase → verify unknown PDFs
```

**Total ≈ 13–17 h for the full corpus.** With this index, deep analysis can focus on ~10% of files.

### Cross-corpus architecture map

The six repos address the same problem from different angles:

```
LAYER               REPO                    KEY PATTERN
─────────────────────────────────────────────────────────────────────
OS input            ui-tars-desktop         VLM → pixel coords → mouse/keyboard
Browser control     playwright              CDP → Locator API → Page/Frame
Browser agent       browser-use             Agent loop → DomService → ActionResult
Hybrid AI+code      stagehand               CUA clients → cache → self-heal verifier
MCP bridge          playwright-mcp          createConnection() → stdio transport
Legacy WebDriver    seleniumbase            BaseCase → CDPMethods → smart waits
```

### If forced to read only 20 files from the corpus

| # | File | Repo |
|---|------|------|
| 1–4 | `agent/service.py`, `dom/service.py`, `agent/views.py`, `tools/service.py` | browser-use |
| 5–9 | `tools/mcp/index.ts`, `tools/mcp/cdpRelay.ts`, `client/locator.ts`, `client/page.ts`, `tools/backend/tools.ts` | playwright |
| 10–14 | `agent/AgentClient.ts`, `agent/AnthropicCUAClient.ts`, `agent/utils/actionMapping.ts`, `cache/`, `verifier/` | stagehand |
| 15–17 | `services/runAgent.ts`, `browser-use/src/operator.ts`, `services/utio.ts` | ui-tars-desktop |
| 18–19 | `core/sb_cdp.py`, `core/recorder_helper.py` | seleniumbase |
| 20 | `index.js` + `cli.js` + `server.json` | playwright-mcp |

(Exact file paths and per-file value ratings are in each repo's dossier under [`01-external-research/repos/`](01-external-research/repos/).)
