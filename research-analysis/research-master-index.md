# Research Master Index

This index minimizes future token usage by directing attention to the highest-value files in the corpus. Read this before opening any repository or paper.

---

## Repository Priority Ranking

### Tier 1 — Study First (Core Architecture Analogs)

| Rank | Repository | Why | Est. Study Time |
|------|-----------|-----|----------------|
| 1 | **browser-use-main** | Most direct analog to Conxa's architecture: agent loop (screenshot→LLM→action), DOM extraction, multi-provider LLM abstraction, MCP integration, `ActionResult` error model. Python, ~386 files. | 2–3 hours |
| 2 | **playwright-main** | Foundation for browser control across the corpus. MCP logic in `src/tools/mcp/` is Conxa's primary execution primitive. CDP relay pattern (`cdpRelay.ts`) is novel. ~1,449 TS files but 62% ignorable. | 3–4 hours |
| 3 | **stagehand-main** | Best source for caching/self-healing reliability patterns. CUA provider abstraction (`AnthropicCUAClient`, `OpenAICUAClient`) shows how to wrap different computer-use APIs uniformly. | 1–2 hours |

### Tier 2 — Study Second (Specialized Patterns)

| Rank | Repository | Why | Est. Study Time |
|------|-----------|-----|----------------|
| 4 | **UI-TARS-desktop-main** | Only purely vision-first (coordinate-based) architecture in corpus. Key contrast to DOM-selector approach. `runAgent.ts` + `operator.ts` + `utio.ts` show the full VLM→OS-input pipeline. MCP server patterns reusable. | 2–3 hours |
| 5 | **playwright-mcp-main** | Thin wrapper — 30 min read. Confirms MCP transport (stdio), `createConnection()` API shape, and `server.json` manifest structure. Study AFTER playwright-main. | 0.5 hours |

### Tier 3 — Reference (Selective Reading)

| Rank | Repository | Why | Est. Study Time |
|------|-----------|-----|----------------|
| 6 | **SeleniumBase-master** | Legacy WebDriver approach. Primary value: CDP stealth patterns (`sb_cdp.py`), recording helper (`recorder_helper.py`), and how a 17K-line API class organizes browser automation methods. Low overlap with Conxa's TypeScript stack. | 1–2 hours |

---

## Paper Priority Ranking

| Rank | Paper | File | Score | Why Read First |
|------|-------|------|-------|----------------|
| 1 | WorkArena | `2403.07718v5.pdf` | 9/10 | Conxa's exact market — enterprise SaaS task automation; failure modes map to Conxa's recovery design |
| 2 | Mind2Web | `2306.06070v3.pdf` | 9/10 | Foundational task taxonomy; action vocabulary used by all other papers |
| 3 | SeeAct / GPT-4V | `2401.01614v2.pdf` | 9/10 | Grounding strategies directly applicable to Conxa's multi-signal element identity |
| 4 | UI-TARS | `2501.12326v1.pdf` | 9/10 | Vision-first architecture; pairs with UI-TARS-desktop repo; SOTA benchmarks |
| 5 | WebArena | `2307.13854v4.pdf` | 8/10 | Canonical benchmark; defines success metrics and task complexity distribution |
| 6 | OS-ATLAS | `2410.23218v1.pdf` | 8/10 | Foundation model training approach; long-term VLM strategy reference |
| 7 | WebVoyager | `WebVoyager Paper.pdf` | 8/10 | End-to-end multimodal pipeline; 59.1% baseline shows where self-healing is required |
| 8 | Unknown A/B/C | `2402.10157`, `2501.09903`, `2501.12988` | TBD | Verify PDF contents before reading — arXiv IDs appear mismatched |

---

## Recommended Study Order

```
Phase 1 — Ground Truth (papers first, ~4 hours)
  1. WorkArena PDF          → understand the problem space
  2. Mind2Web PDF           → learn the action taxonomy
  3. SeeAct PDF             → understand the grounding problem

Phase 2 — Implementation Reference (repos, ~6 hours)
  4. browser-use-main       → agent/service.py, dom/, tools/
  5. playwright-main        → tools/mcp/, client/locator.ts, client/page.ts
  6. stagehand-main         → lib/v3/agent/, lib/v3/cache/, lib/v3/verifier/

Phase 3 — Architecture Contrast (~4 hours)
  7. UI-TARS paper          → vision-first approach
  8. UI-TARS-desktop repo   → services/runAgent.ts, operator.ts, utio.ts
  9. OS-ATLAS PDF           → foundation model training

Phase 4 — Completeness (~3 hours)
  10. WebArena PDF          → benchmark context
  11. WebVoyager PDF        → historical pipeline
  12. playwright-mcp-main   → 30-min thin-wrapper read
  13. SeleniumBase-master   → selective (sb_cdp.py, recorder_helper.py only)
  14. Verify unknown PDFs
```

**Total estimated effort**: 13–17 hours for full corpus. With this index, deep analysis can be focused on ~10% of files.

---

## Cross-Corpus Architecture Map

The six repos address the same problem from different angles:

```
LAYER               REPO                    KEY PATTERN
─────────────────────────────────────────────────────────────────────
OS input            UI-TARS-desktop         VLM → pixel coords → utio.ts (mouse/keyboard)
Browser control     playwright-main         CDP → Locator API → Page/Frame
Browser agent       browser-use-main        Agent loop → DomService → ActionResult
Hybrid AI+code      stagehand-main          CUA clients → cache → self-heal verifier
MCP bridge          playwright-mcp-main     createConnection() → stdio transport
Legacy WebDriver    SeleniumBase-master     BaseCase → CDPMethods → smart waits
```

---

## Architecture-Relevant Signal Summary

| Concern | Best Source File(s) |
|---------|-------------------|
| Agent loop pattern | `browser-use/agent/service.py` → `Agent.step()` |
| DOM state extraction | `browser-use/dom/service.py` → `DomService` |
| MCP tool definition | `playwright-main/src/tools/backend/tools.ts` |
| MCP server startup | `playwright-main/src/tools/mcp/index.ts` → `createConnection()` |
| CDP relay bridge | `playwright-main/src/tools/mcp/cdpRelay.ts` + `cdpRelayV2.ts` |
| Locator / element resolution | `playwright-main/src/client/locator.ts` |
| Self-healing / recovery | `stagehand-main/lib/v3/verifier/` + `lib/v3/cache/` |
| Vision-based execution | `UI-TARS/services/runAgent.ts` + `operator.ts` |
| Recording | `SeleniumBase/core/recorder_helper.py` |
| CUA model abstraction | `stagehand-main/lib/v3/agent/AgentClient.ts` (abstract base) |
| Stealth / bot evasion | `SeleniumBase/core/sb_cdp.py` |

---

## File Budget

If forced to read only 20 files from the entire corpus:

| Priority | File | Repo |
|----------|------|------|
| 1 | `browser_use/agent/service.py` | browser-use |
| 2 | `browser_use/dom/service.py` | browser-use |
| 3 | `browser_use/agent/views.py` | browser-use |
| 4 | `browser_use/tools/service.py` | browser-use |
| 5 | `packages/playwright-core/src/tools/mcp/index.ts` | playwright |
| 6 | `packages/playwright-core/src/tools/mcp/cdpRelay.ts` | playwright |
| 7 | `packages/playwright-core/src/client/locator.ts` | playwright |
| 8 | `packages/playwright-core/src/client/page.ts` | playwright |
| 9 | `packages/playwright-core/src/tools/backend/tools.ts` | playwright |
| 10 | `lib/v3/agent/AgentClient.ts` | stagehand |
| 11 | `lib/v3/agent/AnthropicCUAClient.ts` | stagehand |
| 12 | `lib/v3/agent/utils/actionMapping.ts` | stagehand |
| 13 | `lib/v3/cache/` (directory scan) | stagehand |
| 14 | `lib/v3/verifier/` (directory scan) | stagehand |
| 15 | `apps/ui-tars/src/main/services/runAgent.ts` | UI-TARS |
| 16 | `packages/agent-infra/browser-use/src/operator.ts` | UI-TARS |
| 17 | `apps/ui-tars/src/main/services/utio.ts` | UI-TARS |
| 18 | `seleniumbase/core/sb_cdp.py` | SeleniumBase |
| 19 | `seleniumbase/core/recorder_helper.py` | SeleniumBase |
| 20 | `index.js` + `cli.js` + `server.json` | playwright-mcp |
