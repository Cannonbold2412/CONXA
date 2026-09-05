# Vendored OpenCode slice

Pinned commit: `a935432b5ce337523dfc5014629a09bc16784c42` (anomalyco/opencode, MIT).

**Copied (source for upgrades):**
- `LICENSE`
- `packages/llm/` — agent/tool-result loop + OpenAI-compatible provider
- `packages/schema/src/llm.ts` — tool content types the llm package imports

**Edited copies we actually load at runtime (Node, no Bun/Effect):**
- `loop/run_turn.js` — `/chat/completions` body from `packages/llm/src/protocols/openai-chat.ts` + dispatch from `packages/llm/src/tool-runtime.ts`
- `mcp/stdio.js` — stdio MCP client from `packages/opencode/src/mcp/index.ts` (OAuth, TUI events, marketplace, and non-stdio transports stripped)

**Not copied:** TUI, desktop, web, IDE, LSP, Copilot login, bash/file tools, `packages/app`.

The clone used to mine this slice lives **outside** this git repo (`../vendor-src/opencode` on the developer machine). Do not commit it.
